import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAccountService } from "../accounts/service.mjs";
import { openAccountDatabase } from "../accounts/node-database.mjs";
import {
  sealCredential,
  openCredential,
} from "../accounts/credential-vault.mjs";
import {
  signalWireConfig,
  signalWireClient,
} from "../accounts/signalwire-client.mjs";
import { signalWireFixture } from "./helpers/signalwire-fixture.mjs";
const origin = "https://agentbridge.test",
  email = "tester@example.com";
const headers = {
  Origin: origin,
  "Content-Type": "application/json",
  "oai-authenticated-user-id": "owner",
  "oai-authenticated-user-email": email,
};
async function harness(t, options = {}) {
  const database =
    options.database || openAccountDatabase(options.filename || ":memory:");
  if (!options.database) t.after(() => database.close());
  const provider = options.provider || signalWireFixture(),
    key = options.key ?? randomBytes(32).toString("hex");
  const service = createAccountService({
    database,
    testerEmail: email,
    publicOrigin: origin,
    platformIdentity: true,
    vaultKey: key,
    fetcher: provider.fetcher,
  });
  const request = (path, method = "GET", body, extra = {}) =>
    service.fetch(
      new Request(origin + "/api/studio/" + path, {
        method,
        headers: { ...headers, ...extra },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  if (!(await database.first("SELECT id FROM ab_accounts"))) {
    const r = await service.fetch(
      new Request(origin + "/api/auth/register", {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "Tester", email, agent_name: "Agent" }),
      }),
    );
    assert.equal(r.status, 201, await r.clone().text());
  }
  const checked = async (path, method = "GET", body) => {
    const r = await request(path, method, body);
    assert.ok(r.ok, `${path}: ${r.status} ${await r.clone().text()}`);
    return r.json();
  };
  const connect = () =>
    checked("provider/credentials", "POST", provider.config());
  const live = async () => {
    await connect();
    return checked("provider/mode", "PATCH", { live_enabled: true });
  };
  const importNumber = () =>
    checked("live/numbers/import", "POST", {
      provider_number_id: provider.owned.id,
      label: "My routing line",
    });
  const connection = async () => {
    const { number } = await importNumber();
    return checked("live/connections", "POST", {
      label: "London",
      routing_number_id: number.id,
      destination: "+442079460123",
      country: "GB",
    });
  };
  const activate = (id) =>
    checked("live/connections/" + id + "/activate", "POST", {
      request_id: randomUUID(),
      confirm_charges: true,
    });
  return {
    database,
    provider,
    key,
    service,
    request,
    checked,
    connect,
    live,
    importNumber,
    connection,
    activate,
  };
}
test("credentials require identity, same origin and a configured vault; malicious provider origins are rejected", async (t) => {
  const h = await harness(t, { key: "" });
  assert.equal(
    (await h.request("provider/credentials", "POST", h.provider.config()))
      .status,
    503,
  );
  assert.equal(
    (
      await h.request("provider/credentials", "POST", h.provider.config(), {
        "oai-authenticated-user-id": "other",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await h.request("provider/credentials", "POST", h.provider.config(), {
        Origin: "https://bad.example",
      })
    ).status,
    403,
  );
  assert.equal(h.provider.state.requests.length, 0);
  for (const space of [
    "https://example.org",
    "test.signalwire.com.evil",
    "https://x.signalwire.com@evil.example",
    "https://x.signalwire.com/private",
  ])
    assert.throws(() => signalWireConfig({ ...h.provider.config(), space }));
  assert.equal(
    signalWireConfig({
      ...h.provider.config(),
      space: "https://agentbridge-test.signalwire.com/",
    }).space,
    "agentbridge-test",
  );
});
test("saving a verified project encrypts its token, reveals only metadata and never enables paid actions automatically", async (t) => {
  const h = await harness(t);
  const status = await h.connect();
  assert.equal(status.configured, true);
  assert.equal(status.live_enabled, false);
  assert.equal(status.vault_ready, true);
  assert.equal(h.provider.posts().length, 0);
  assert.equal(h.provider.state.requests.length, 2);
  const row = await h.database.first("SELECT * FROM ab_provider_connections");
  assert.ok(row.encrypted_secret.startsWith("v1:"));
  assert.ok(!JSON.stringify(row).includes(h.provider.state.token));
  const account = await h.database.first("SELECT id FROM ab_accounts");
  assert.equal(
    (await openCredential(row.encrypted_secret, h.key, account.id)).api_token,
    h.provider.state.token,
  );
  assert.ok(
    !JSON.stringify(await h.checked("provider/status")).includes(
      h.provider.state.token,
    ),
  );
  assert.ok(
    !JSON.stringify(await h.checked("export")).includes("encrypted_secret"),
  );
  assert.equal((await h.request("live/inventory")).status, 409);
  assert.equal((await h.request("provider/credentials", "GET")).status, 404);
});
test("vault ciphertext is bound to its account and purpose and survives database/service restart", async (t) => {
  const key = randomBytes(32).toString("hex");
  const sealed = await sealCredential({ value: "private" }, key, "account-a");
  await assert.rejects(openCredential(sealed, key, "account-b"));
  await assert.rejects(openCredential(sealed, key, "account-a", "other"));
  await assert.rejects(
    openCredential(
      sealed.slice(0, -2) + (sealed.endsWith("00") ? "ff" : "00"),
      key,
      "account-a",
    ),
  );
  const dir = mkdtempSync(join(tmpdir(), "ab-provider-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const filename = join(dir, "accounts.sqlite");
  const database = openAccountDatabase(filename),
    provider = signalWireFixture();
  const first = await harness(t, { database, provider, key });
  await first.live();
  await first.importNumber();
  database.close();
  const second = await harness(t, { filename, provider, key });
  assert.equal((await second.checked("provider/status")).live_enabled, true);
  assert.equal(
    (await second.checked("live/overview")).routing_numbers.length,
    1,
  );
  assert.equal((await second.checked("live/inventory")).numbers.length, 1);
});
test("real number search and import use SignalWire inventory while demo inventory stays isolated", async (t) => {
  const h = await harness(t);
  await h.live();
  const found = await h.checked("live/numbers/search", "POST", {
    area_code: "202",
  });
  assert.equal(found.numbers.length, 1);
  assert.equal(found.numbers[0].number, "+12025554321");
  assert.equal(found.numbers[0].price, null);
  assert.equal(h.provider.posts().length, 0);
  const inventory = await h.checked("live/inventory");
  assert.equal(inventory.numbers[0].e164, h.provider.owned.number);
  const n = await h.importNumber();
  assert.equal(n.number.ownership_source, "signalwire");
  assert.equal((await h.checked("overview")).routing_numbers.length, 0);
  const another = await h.importNumber();
  assert.equal(another.number.id, n.number.id);
  assert.equal(h.provider.posts().length, 0);
  assert.equal(
    (
      await h.request("live/numbers/import", "POST", {
        provider_number_id: randomUUID(),
        label: "Forged",
      })
    ).status,
    502,
  );
});
test("purchase requires charge confirmation, rechecks availability and is idempotent across repeated requests", async (t) => {
  const h = await harness(t);
  await h.live();
  const input = {
    request_id: randomUUID(),
    number: "+12025554321",
    label: "New line",
    confirm_charges: true,
  };
  assert.equal(
    (
      await h.request("live/numbers/purchase", "POST", {
        ...input,
        confirm_charges: false,
      })
    ).status,
    422,
  );
  assert.equal(h.provider.posts().length, 0);
  const a = await h.checked("live/numbers/purchase", "POST", input);
  assert.equal(a.purchased, true);
  assert.equal(a.number.e164, input.number);
  const b = await h.checked("live/numbers/purchase", "POST", input);
  assert.equal(a.number.id, b.number.id);
  assert.equal(
    h.provider.posts().filter((r) => r.path === "/api/relay/rest/phone_numbers")
      .length,
    1,
  );
  assert.equal(
    (
      await h.request("live/numbers/purchase", "POST", {
        ...input,
        label: "Changed",
      })
    ).status,
    409,
  );
});
test("concurrent paid requests are serialized and cannot buy the number twice", async (t) => {
  const h = await harness(t);
  await h.live();
  const input = {
    request_id: randomUUID(),
    number: "+12025554321",
    label: "Concurrent line",
    confirm_charges: true,
  };
  const results = await Promise.all([
    h.request("live/numbers/purchase", "POST", input),
    h.request("live/numbers/purchase", "POST", input),
  ]);
  assert.ok(results.some((response) => response.status === 201));
  assert.ok(results.every((response) => [201, 409].includes(response.status)));
  await h.checked("live/numbers/purchase", "POST", input);
  assert.equal(h.provider.posts().length, 1);
});
test("a confirmed carrier call followed by a local save failure stays uncertain and cannot be redialed", async (t) => {
  const raw = openAccountDatabase(":memory:");
  t.after(() => raw.close());
  const provider = signalWireFixture();
  let fail = false;
  const database = {
    ...raw,
    run: async (sql, params) => {
      if (
        fail &&
        provider.state.calls.length &&
        sql.startsWith("UPDATE ab_live_workspaces")
      )
        throw new Error("Simulated database failure");
      return raw.run(sql, params);
    },
  };
  const h = await harness(t, { database, provider });
  await h.live();
  const { connection } = await h.connection();
  fail = true;
  const input = {
    request_id: randomUUID(),
    connection_id: connection.id,
    callback_number: "+12125551234",
    confirm_charges: true,
  };
  const response = await h.request("live/calls/start", "POST", input);
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error.code, "PROVIDER_RESULT_UNCERTAIN");
  assert.equal(
    (
      await raw.first(
        "SELECT status FROM ab_provider_operations WHERE kind='start_test'",
      )
    ).status,
    "unknown",
  );
  fail = false;
  assert.equal(
    (
      await h.request("live/calls/start", "POST", {
        ...input,
        request_id: randomUUID(),
      })
    ).status,
    409,
  );
  assert.equal(provider.state.calls.length, 1);
});
test("number pagination never follows a foreign host or accepts malformed continuation data", async () => {
  for (const next of ["https://foreign.example/steal", false, 0, {}, ""]) {
    let fetched = 0;
    const provider = signalWireFixture();
    const client = signalWireClient(provider.config(), async () => {
      fetched++;
      return new Response(JSON.stringify({ data: [], links: { next } }), {
        headers: { "Content-Type": "application/json" },
      });
    });
    await assert.rejects(client.listNumbers());
    assert.equal(fetched, 1);
  }
});
test("an ambiguous paid purchase is never retried and inventory sync reconciles actual ownership", async (t) => {
  const h = await harness(t);
  await h.live();
  h.provider.state.failPurchase = true;
  const input = {
    request_id: randomUUID(),
    number: "+12025554321",
    label: "Pending line",
    confirm_charges: true,
  };
  const response = await h.request("live/numbers/purchase", "POST", input);
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error.code, "PROVIDER_RESULT_UNCERTAIN");
  assert.equal(
    (await h.request("live/numbers/purchase", "POST", input)).status,
    409,
  );
  assert.equal(
    (
      await h.request("live/numbers/purchase", "POST", {
        ...input,
        request_id: randomUUID(),
      })
    ).status,
    409,
  );
  assert.equal(h.provider.posts().length, 1);
  await h.checked("live/sync", "POST", {});
  const result = await h.checked("live/numbers/purchase", "POST", input);
  assert.equal(result.reconciled, true);
  assert.equal(result.number.e164, input.number);
  assert.equal(h.provider.posts().length, 1);
});
test("saved connections are inert; activation configures a provider-hosted script and deactivation restores the old handler", async (t) => {
  const h = await harness(t);
  await h.live();
  const { connection } = await h.connection();
  assert.equal(h.provider.posts().length, 0);
  const result = await h.activate(connection.id);
  assert.equal(result.routing_state, "active");
  const script = [...h.provider.state.scripts.values()].find(
    (x) => x.name === "AgentBridge route " + connection.id,
  );
  assert.ok(script);
  assert.match(script.contents, /<Dial answerOnBridge="true"/);
  assert.match(script.contents, /timeLimit="300"/);
  assert.match(script.contents, /<Number>\+442079460123<\/Number>/);
  assert.doesNotMatch(script.contents, /<Record|transcrib|<Say|api_token/);
  assert.equal(h.provider.owned.call_request_url, script.request_url);
  assert.equal(h.provider.owned.call_handler, "laml_webhooks");
  assert.equal(
    (
      await h.request("live/connections/" + connection.id, "PATCH", {
        label: "Changed",
        routing_number_id: connection.routing_number_id,
        country: "GB",
        destination: "+442079460199",
      })
    ).status,
    409,
  );
  assert.equal(
    (await h.request("provider/mode", "PATCH", { live_enabled: false })).status,
    409,
  );
  assert.equal(
    (await h.request("provider/credentials", "DELETE", {})).status,
    409,
  );
  await h.checked("live/connections/" + connection.id + "/deactivate", "POST", {
    request_id: randomUUID(),
  });
  for (const [key, value] of Object.entries(h.provider.original))
    assert.equal(h.provider.owned[key], value);
  const snapshot = await h.checked("live/overview");
  assert.equal(snapshot.connections[0].routing_state, "inactive");
  assert.ok(!JSON.stringify(snapshot).includes("encrypted_previous_config"));
  assert.ok(!JSON.stringify(snapshot).includes("previous.example"));
  await h.checked("provider/mode", "PATCH", { live_enabled: false });
  assert.equal((await h.checked("overview")).routing_numbers.length, 0);
});
test("external routing edits are not overwritten and reconciliation records the provider state", async (t) => {
  const h = await harness(t);
  await h.live();
  const { connection } = await h.connection();
  await h.activate(connection.id);
  h.provider.owned.call_request_url = "https://customer.example/new-handler";
  const r = await h.request(
    "live/connections/" + connection.id + "/deactivate",
    "POST",
    { request_id: randomUUID() },
  );
  assert.equal(r.status, 409);
  assert.equal(
    h.provider.owned.call_request_url,
    "https://customer.example/new-handler",
  );
  await h.checked("live/reconcile", "POST", {});
  assert.equal(
    (await h.checked("live/overview")).connections[0].routing_state,
    "inactive",
  );
  assert.equal(
    h.provider.owned.call_request_url,
    "https://customer.example/new-handler",
  );
});
test("test callbacks use the owned caller ID and real provider status, with no autonomous dialing", async (t) => {
  const h = await harness(t);
  await h.live();
  const { connection } = await h.connection();
  const body = {
    request_id: randomUUID(),
    connection_id: connection.id,
    callback_number: "+12125551234",
    confirm_charges: true,
  };
  assert.equal(
    (
      await h.request("live/calls/start", "POST", {
        ...body,
        confirm_charges: false,
      })
    ).status,
    422,
  );
  assert.equal(h.provider.posts().length, 0);
  const response = await h.checked("live/calls/start", "POST", body);
  assert.equal(response.call.status, "queued");
  assert.equal(response.call.from, h.provider.owned.number);
  const callPost = h.provider.posts().find((r) => r.path.endsWith("/Calls"));
  assert.equal(callPost.body.To, body.callback_number);
  assert.equal(callPost.body.From, h.provider.owned.number);
  assert.equal(callPost.body.Record, "false");
  assert.ok(
    callPost.body.Url.startsWith(
      "https://agentbridge-test.signalwire.com/laml-bins/",
    ),
  );
  await h.checked("live/calls/start", "POST", body);
  assert.equal(
    h.provider.posts().filter((r) => r.path.endsWith("/Calls")).length,
    1,
  );
});
test("recording and call control verify provider ownership and consent, and expose only authenticated media and owned transcripts", async (t) => {
  const h = await harness(t);
  await h.live();
  await h.importNumber();
  const id = randomUUID();
  const call = {
    sid: id,
    account_sid: h.provider.state.project,
    phone_number_sid: h.provider.owned.id,
    from: "+12125551234",
    to: h.provider.owned.number,
    status: "in-progress",
    direction: "inbound",
    duration: 20,
  };
  h.provider.state.calls.push(call);
  const raw = { request_id: randomUUID(), confirm_charges: true };
  assert.equal(
    (await h.request("live/calls/" + id + "/record", "POST", raw)).status,
    422,
  );
  assert.equal(h.provider.state.recordings.length, 0);
  const capture = await h.checked("live/calls/" + id + "/record", "POST", {
    ...raw,
    request_id: randomUUID(),
    capture_consent: true,
  });
  assert.equal(capture.recording.status, "in-progress");
  await h.checked("live/recordings/" + capture.recording.id, "PATCH", {
    request_id: randomUUID(),
    status: "paused",
  });
  assert.equal(h.provider.state.recordings[0].status, "paused");
  await h.checked("live/recordings/" + capture.recording.id, "PATCH", {
    request_id: randomUUID(),
    status: "stopped",
  });
  const audio = await h.request(
    "live/recordings/" + capture.recording.id + "/audio",
  );
  assert.equal(audio.status, 200);
  assert.equal(audio.headers.get("Content-Type"), "audio/mpeg");
  assert.deepEqual(
    [...new Uint8Array(await audio.arrayBuffer())],
    [73, 68, 51, 0, 1],
  );
  assert.equal(
    (
      await h.request(
        "live/recordings/" + capture.recording.id + "/audio",
        "GET",
        undefined,
        { "oai-authenticated-user-id": "other" },
      )
    ).status,
    401,
  );
  h.provider.state.transcriptions.push(
    {
      sid: randomUUID(),
      recording_sid: capture.recording.id,
      status: "completed",
      transcription_text: "Provider transcript",
    },
    {
      sid: randomUUID(),
      recording_sid: randomUUID(),
      transcription_text: "Other recording",
    },
  );
  await h.checked("live/sync", "POST", {});
  const words = await h.checked("live/transcripts");
  assert.equal(words.transcripts.length, 1);
  assert.equal(words.transcripts[0].text, "Provider transcript");
  assert.equal(words.live_transcription, false);
  const foreign = {
    ...call,
    sid: randomUUID(),
    phone_number_sid: randomUUID(),
    to: "+14155551234",
    from: h.provider.owned.number,
  };
  h.provider.state.calls.push(foreign);
  assert.equal(
    (
      await h.request("live/calls/" + foreign.sid + "/end", "POST", {
        request_id: randomUUID(),
      })
    ).status,
    403,
  );
  await h.checked("live/calls/" + id + "/end", "POST", {
    request_id: randomUUID(),
  });
  assert.equal(call.status, "completed");
  assert.equal(
    (await h.request("live/recordings/" + capture.recording.id, "DELETE", {}))
      .status,
    422,
  );
  await h.checked("live/recordings/" + capture.recording.id, "DELETE", {
    confirm_delete: true,
  });
  assert.equal(h.provider.state.recordings.length, 0);
});
