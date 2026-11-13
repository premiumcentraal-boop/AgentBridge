import { deny } from "./model.mjs";
import { validateNumberConnection } from "../../shared/numbers.mjs";
import {
  connectedProvider,
  providerSummary,
  providerOperation,
  providerLease,
  onlyFields,
  named,
  requireCharges,
} from "./provider-control.mjs";
import { readLive, changeLive, liveEvent, stamp } from "./live-store.mjs";
import {
  activateForwarding,
  disableForwarding,
  liveConnection,
  routeStates,
  reconcileForwarding,
} from "./live-routing.mjs";
import {
  syncCalls,
  startTestCall,
  controlCall,
  recordingsFor,
  ownRecording,
  recordingView,
} from "./live-calls.mjs";
import { UUID, E164, ProviderError } from "./signalwire-client.mjs";
const uuidPath = (path) => UUID.test(path || "");
const numberView = (n, label) => ({
  id: crypto.randomUUID(),
  e164: n.number,
  provider: "signalwire",
  provider_number_id: n.id,
  country: n.country_code || "US",
  label: label || n.name || n.number,
  status: "owned",
  ownership_source: "signalwire",
  created_at: stamp(),
  updated_at: stamp(),
});
async function putNumber(database, account, n, label) {
  return changeLive(database, account.id, (d) => {
    const previous = d.routing_numbers.find(
      (item) => item.provider_number_id === n.id,
    );
    if (previous) {
      previous.status = "owned";
      previous.updated_at = stamp();
      return previous;
    }
    if (d.routing_numbers.length >= 20)
      deny(
        409,
        "NUMBER_LIMIT",
        "This development workspace supports 20 imported routing numbers.",
      );
    const number = numberView(n, label);
    d.routing_numbers.push(number);
    liveEvent(
      d,
      "number.imported",
      "SignalWire number " + n.number + " added to the workspace.",
    );
    return number;
  });
}
export async function liveSnapshot(database, account, vaultKey) {
  const document = await readLive(database, account.id),
    routes = await routeStates(database, account.id);
  const pending = await database.first(
    "SELECT json_group_array(json_object('id',id,'kind',kind,'target',target,'status',status,'created_at',created_at)) AS entries FROM ab_provider_operations WHERE account_id=? AND status IN ('pending','unknown')",
    [account.id],
  );
  return {
    ...document,
    connections: document.connections.map((c) => ({
      ...c,
      routing_state:
        routes.find((r) => r.connection_id === c.id)?.status || "inactive",
    })),
    provider: await providerSummary(database, account.id, vaultKey),
    mode: "live-testing",
    sandbox: false,
    pending_actions: JSON.parse(pending?.entries || "[]"),
    limits: { max_call_seconds: 300, max_imported_numbers: 20 },
    features: {
      live_transcription: false,
      browser_audio: false,
      phone_join: false,
    },
  };
}
export async function liveWorkspaceRequest({
  database,
  account,
  path,
  method,
  readBody,
  vaultKey,
  fetcher,
}) {
  const summary = await providerSummary(database, account.id, vaultKey);
  if (!summary.live_enabled)
    deny(
      409,
      "LIVE_MODE_REQUIRED",
      "Switch to live testing in Settings before using your provider project.",
    );
  if (path === "overview" && method === "GET")
    return {
      status: 200,
      body: await liveSnapshot(database, account, vaultKey),
    };
  const { row, client } = await connectedProvider(
    database,
    account.id,
    vaultKey,
    fetcher,
  );
  if (!row.live_enabled)
    deny(
      409,
      "LIVE_MODE_REQUIRED",
      "Switch to live testing in Settings before using your provider project.",
    );
  const reply = (status, body) => ({
    status,
    body: { ...body, mode: "live-testing", sandbox: false },
  });
  const context = { database, account, client, vaultKey };
  const operate = (options, run) =>
    providerOperation(
      database,
      account.id,
      { ...options, provider: client },
      run,
    );
  if (path === "overview" && method === "GET")
    return reply(200, await liveSnapshot(database, account, vaultKey));
  if (path === "sync" && method === "POST") {
    onlyFields(await readBody(), []);
    const doc = await readLive(database, account.id);
    if (doc.last_sync && Date.now() - Date.parse(doc.last_sync) < 4000)
      return reply(200, await liveSnapshot(database, account, vaultKey));
    await providerLease(database, account.id, async () => {
      const inventory = await client.listNumbers();
      await changeLive(database, account.id, (d) => {
        d.routing_numbers = d.routing_numbers.map((n) => ({
          ...n,
          status: inventory.numbers.some(
            (r) => r.id === n.provider_number_id && r.number === n.e164,
          )
            ? "owned"
            : inventory.has_more
              ? n.status
              : "not_verified",
        }));
        d.inventory_has_more = inventory.has_more;
        return {};
      });
      await syncCalls(
        database,
        account,
        client,
        await readLive(database, account.id),
      );
      const uncertain = await database.first(
        "SELECT json_group_array(json_object('id',id,'target',target,'fingerprint',fingerprint)) AS entries FROM ab_provider_operations WHERE account_id=? AND kind='purchase' AND status IN ('pending','unknown')",
        [account.id],
      );
      for (const operation of JSON.parse(uncertain?.entries || "[]")) {
        const found = inventory.numbers.find(
          (n) => n.number === operation.target,
        );
        if (!found) continue;
        const label = JSON.parse(operation.fingerprint).input.label;
        const number = await putNumber(database, account, found, label);
        await database.run(
          "UPDATE ab_provider_operations SET status='succeeded',result=?,updated_at=? WHERE id=? AND account_id=?",
          [
            JSON.stringify({
              number,
              purchased: false,
              already_owned: true,
              reconciled: true,
            }),
            stamp(),
            operation.id,
            account.id,
          ],
        );
      }
    });
    return reply(200, await liveSnapshot(database, account, vaultKey));
  }
  if (path === "inventory" && method === "GET") {
    const data = await client.listNumbers(),
      doc = await readLive(database, account.id);
    return reply(200, {
      numbers: data.numbers.map((n) => ({
        id: n.id,
        e164: n.number,
        label: n.name || n.number,
        country: n.country_code || "US",
        imported: doc.routing_numbers.some(
          (m) => m.provider_number_id === n.id,
        ),
      })),
      has_more: data.has_more,
    });
  }
  if (path === "numbers/import" && method === "POST") {
    const input = await readBody();
    onlyFields(input, ["provider_number_id", "label"]);
    if (!named(input.label))
      deny(422, "INVALID_LABEL", "Give this number a name.");
    return providerLease(database, account.id, async () =>
      reply(201, {
        number: await putNumber(
          database,
          account,
          await client.ownNumber(input.provider_number_id),
          input.label.trim(),
        ),
      }),
    );
  }
  if (path === "numbers/search" && method === "POST") {
    const input = await readBody();
    onlyFields(input, ["area_code"]);
    if (!/^[2-9]\d{2}$/.test(input.area_code || ""))
      deny(422, "INVALID_AREA_CODE", "Enter a three-digit US area code.");
    const p = await client.rest(
      "/phone_numbers/search?" +
        new URLSearchParams({
          areacode: input.area_code,
          number_type: "local",
          max_results: "10",
        }),
    );
    if (!Array.isArray(p.data)) throw new ProviderError(502);
    const numbers = p.data
      .filter(
        (n) =>
          n &&
          n.country_code === "US" &&
          E164.test(n.e164 || "") &&
          n.e164.startsWith("+1" + input.area_code) &&
          n.capabilities?.includes("voice"),
      )
      .map((n) => ({
        number: n.e164,
        country: n.country_code,
        region: n.region || null,
        price: null,
        currency: null,
      }))
      .slice(0, 10);
    return reply(200, {
      numbers,
      price_verified: false,
      pricing_url: client.origin,
      notice:
        "SignalWire bills number rental and usage at your project rates. The search API does not return a price.",
    });
  }
  if (path === "numbers/purchase" && method === "POST") {
    const input = await readBody();
    onlyFields(input, ["request_id", "number", "label", "confirm_charges"]);
    requireCharges(input);
    if (!/^\+1[2-9]\d{9}$/.test(input.number || "") || !named(input.label))
      deny(
        422,
        "INVALID_NUMBER",
        "Choose an available US number and enter a name.",
      );
    const op = {
      request_id: input.request_id,
      kind: "purchase",
      target: input.number,
      input: { number: input.number, label: input.label.trim() },
    };
    const result = await operate(op, async () => {
      const doc = await readLive(database, account.id);
      if (doc.routing_numbers.length >= 20)
        deny(
          409,
          "NUMBER_LIMIT",
          "The development number limit has been reached.",
        );
      const owned = await client.listNumbers();
      const existing = owned.numbers.find((n) => n.number === input.number);
      if (existing)
        return {
          number: await putNumber(
            database,
            account,
            existing,
            input.label.trim(),
          ),
          purchased: false,
          already_owned: true,
        };
      const choices = await client.rest(
        "/phone_numbers/search?" +
          new URLSearchParams({
            areacode: input.number.slice(2, 5),
            number_type: "local",
            max_results: "100",
          }),
      );
      if (
        !choices.data?.some(
          (n) =>
            n.e164 === input.number &&
            n.country_code === "US" &&
            n.capabilities?.includes("voice"),
        )
      )
        deny(
          409,
          "NUMBER_UNAVAILABLE",
          "This number is no longer available. Search again.",
        );
      const raw = await client.rest("/phone_numbers", "POST", {
        number: input.number,
      });
      const purchased = raw.data && !Array.isArray(raw.data) ? raw.data : raw;
      if (!UUID.test(purchased.id || "") || purchased.number !== input.number)
        throw new ProviderError(502, true);
      const verified = await client.ownNumber(purchased.id);
      if (verified.number !== input.number) throw new ProviderError(502, true);
      return {
        number: await putNumber(
          database,
          account,
          verified,
          input.label.trim(),
        ),
        purchased: true,
        charged_by: "signalwire",
      };
    });
    return reply(201, result);
  }
  const connectionId = path.match(/^connections\/([a-f0-9-]{36})$/)?.[1];
  if (
    (path === "connections" && method === "POST") ||
    (connectionId && method === "PATCH")
  ) {
    const checked = validateNumberConnection(await readBody());
    if (checked.error) deny(422, "INVALID_CONNECTION", checked.error);
    const value = checked.value;
    return providerLease(database, account.id, async () => {
      const doc = await readLive(database, account.id),
        number = doc.routing_numbers.find(
          (n) => n.id === value.routing_number_id && n.status === "owned",
        );
      if (!number)
        deny(
          422,
          "NUMBER_NOT_OWNED",
          "Import an owned SignalWire number first.",
        );
      await client.ownNumber(number.provider_number_id);
      const state =
        connectionId &&
        (await database.first(
          "SELECT status FROM ab_live_routes WHERE account_id=? AND connection_id=?",
          [account.id, connectionId],
        ));
      if (state && state.status !== "inactive")
        deny(
          409,
          "DEACTIVATE_FIRST",
          "Deactivate this connection before editing its destination.",
        );
      const saved = await changeLive(database, account.id, (d) => {
        const old =
          connectionId &&
          d.connections.find(
            (c) => c.id === connectionId && c.status === "saved",
          );
        if (connectionId && !old)
          deny(404, "CONNECTION_NOT_FOUND", "Connection not found.");
        if (d.routing_numbers.some((n) => n.e164 === value.destination))
          deny(422, "OWN_NUMBER_DESTINATION", "Choose an outside destination.");
        if (
          d.connections.some(
            (c) =>
              c.status === "saved" &&
              c.id !== connectionId &&
              c.routing_number_id === value.routing_number_id,
          )
        )
          deny(
            409,
            "NUMBER_ALREADY_LINKED",
            "This number already has a destination.",
          );
        if (!old && d.connections.length >= 100)
          deny(
            409,
            "CONNECTION_LIMIT",
            "The connection limit has been reached.",
          );
        const c = {
          ...(old || { id: crypto.randomUUID(), created_at: stamp() }),
          ...value,
          status: "saved",
          updated_at: stamp(),
        };
        if (old) Object.assign(old, c);
        else d.connections.push(c);
        liveEvent(
          d,
          "connection.saved",
          "Connection saved; forwarding is not activated.",
        );
        return c;
      });
      return reply(connectionId ? 200 : 201, { connection: saved });
    });
  }
  if (connectionId && method === "DELETE") {
    onlyFields(await readBody(), []);
    return providerLease(database, account.id, async () => {
      const state = await database.first(
        "SELECT status FROM ab_live_routes WHERE account_id=? AND connection_id=?",
        [account.id, connectionId],
      );
      if (state && state.status !== "inactive")
        deny(
          409,
          "DEACTIVATE_FIRST",
          "Deactivate this connection before removing it.",
        );
      await changeLive(database, account.id, (d) => {
        const c = d.connections.find(
          (c) => c.id === connectionId && c.status === "saved",
        );
        if (!c) deny(404, "CONNECTION_NOT_FOUND", "Connection not found.");
        c.status = "archived";
        return {};
      });
      return reply(200, { ok: true });
    });
  }
  const route = path.match(
    /^connections\/([a-f0-9-]{36})\/(activate|deactivate)$/,
  );
  if (route && method === "POST") {
    const input = await readBody();
    onlyFields(input, ["request_id", "confirm_charges"]);
    if (route[2] === "activate") requireCharges(input);
    const result = await operate(
      {
        request_id: input.request_id,
        kind: route[2],
        target: route[1],
        input: {},
      },
      () =>
        route[2] === "activate"
          ? activateForwarding({ ...context, connectionId: route[1] })
          : disableForwarding({ ...context, connectionId: route[1] }),
    );
    return reply(200, result);
  }
  if (path === "reconcile" && method === "POST") {
    onlyFields(await readBody(), []);
    return providerLease(database, account.id, async () =>
      reply(200, await reconcileForwarding(context)),
    );
  }
  if (path === "calls/start" && method === "POST") {
    const input = await readBody();
    onlyFields(input, [
      "request_id",
      "connection_id",
      "callback_number",
      "confirm_charges",
    ]);
    requireCharges(input);
    if (!uuidPath(input.connection_id))
      deny(
        422,
        "INVALID_CONNECTION",
        "Choose one of your saved live connections.",
      );
    const result = await operate(
      {
        request_id: input.request_id,
        kind: "start_test",
        target: input.connection_id,
        input: { callback: input.callback_number },
      },
      () =>
        startTestCall({
          ...context,
          connectionId: input.connection_id,
          callback: input.callback_number,
        }),
    );
    return reply(201, result);
  }
  const callAction = path.match(
    /^calls\/([a-f0-9-]{36})\/(end|transfer|record)$/,
  );
  if (callAction && method === "POST") {
    const input = await readBody();
    onlyFields(input, [
      "request_id",
      "connection_id",
      "confirm_charges",
      "capture_consent",
    ]);
    if (callAction[2] !== "end") requireCharges(input);
    const result = await operate(
      {
        request_id: input.request_id,
        kind: callAction[2],
        target: callAction[1],
        input: {
          connection_id: input.connection_id || null,
          capture_consent: input.capture_consent === true,
        },
      },
      () =>
        controlCall({
          ...context,
          id: callAction[1],
          action: callAction[2],
          connectionId: input.connection_id,
          consent: input.capture_consent,
        }),
    );
    return reply(200, result);
  }
  const callRecordings = path.match(/^calls\/([a-f0-9-]{36})\/recordings$/);
  if (callRecordings && method === "GET")
    return reply(200, {
      recordings: await recordingsFor(
        client,
        await readLive(database, account.id),
        callRecordings[1],
      ),
    });
  const recording = path.match(/^recordings\/([a-f0-9-]{36})(?:\/(audio))?$/);
  if (recording) {
    const doc = await readLive(database, account.id),
      owned = await ownRecording(client, doc, recording[1]);
    if (method === "GET" && recording[2] === "audio") {
      const audio = await client.audio(recording[1]);
      return new Response(audio, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Disposition":
            'inline; filename="agentbridge-' + recording[1] + '.mp3"',
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (method === "PATCH" && !recording[2]) {
      const input = await readBody();
      onlyFields(input, ["request_id", "status"]);
      if (!["paused", "in-progress", "stopped"].includes(input.status))
        deny(422, "INVALID_RECORDING_STATE", "Choose pause, resume or stop.");
      const result = await operate(
        {
          request_id: input.request_id,
          kind: "recording_state",
          target: owned.sid,
          input: { status: input.status },
        },
        async () => {
          const r = await client.compat(
            "/Calls/" + owned.call_sid + "/Recordings/" + owned.sid,
            "POST",
            { Status: input.status, PauseBehavior: "skip" },
          );
          return { recording: recordingView(r) };
        },
      );
      return reply(200, result);
    }
    if (method === "DELETE" && !recording[2]) {
      const confirmation = await readBody();
      onlyFields(confirmation, ["confirm_delete"]);
      if (confirmation.confirm_delete !== true)
        deny(
          422,
          "DELETE_CONFIRMATION_REQUIRED",
          "Confirm deleting this recording from SignalWire.",
        );
      if (["in-progress", "paused"].includes(owned.status))
        deny(
          409,
          "STOP_RECORDING_FIRST",
          "Stop this recording before deleting it.",
        );
      await providerLease(database, account.id, () =>
        client.compat("/Recordings/" + owned.sid, "DELETE"),
      );
      return reply(200, { deleted: true });
    }
  }
  if (path === "transcripts" && method === "GET") {
    const doc = await readLive(database, account.id),
      recordings = [];
    for (const call of doc.calls.slice(0, 10))
      recordings.push(...(await recordingsFor(client, doc, call.id)));
    const allowed = new Set(recordings.map((r) => r.id)),
      p = await client.compat("/Transcriptions?PageSize=100");
    if (!Array.isArray(p.transcriptions)) throw new ProviderError(502);
    return reply(200, {
      transcripts: p.transcriptions
        .filter((t) => allowed.has(t.recording_sid))
        .map((t) => ({
          id: t.sid,
          recording_id: t.recording_sid,
          status: t.status,
          text:
            typeof t.transcription_text === "string"
              ? t.transcription_text.slice(0, 100_000)
              : "",
          created_at: t.date_created,
        })),
      live_transcription: false,
    });
  }
  const review = path.match(/^operations\/([a-f0-9-]{36})\/review$/);
  if (review && method === "POST") {
    const input = await readBody();
    onlyFields(input, ["reviewed_in_signalwire"]);
    if (input.reviewed_in_signalwire !== true)
      deny(
        422,
        "REVIEW_REQUIRED",
        "Review this request in your SignalWire project first.",
      );
    return providerLease(database, account.id, async () => {
      const operation = await database.first(
        "SELECT * FROM ab_provider_operations WHERE account_id=? AND id=?",
        [account.id, review[1]],
      );
      if (!operation || !["unknown", "pending"].includes(operation.status))
        deny(404, "OPERATION_NOT_FOUND", "Unresolved request not found.");
      if (
        operation.status === "pending" &&
        Date.now() - Date.parse(operation.created_at) < 120_000
      )
        deny(409, "PROVIDER_BUSY", "This request is still running.");
      await client.listNumbers();
      await database.run(
        "UPDATE ab_provider_operations SET status='failed',updated_at=? WHERE id=? AND account_id=?",
        [stamp(), review[1], account.id],
      );
      return reply(200, { reviewed: true });
    });
  }
  deny(404, "NOT_FOUND", "Live endpoint not found.");
}
