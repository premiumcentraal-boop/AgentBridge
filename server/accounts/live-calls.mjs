import { deny } from "./model.mjs";
import { E164, UUID, ProviderError, forwardXml } from "./signalwire-client.mjs";
import { readLive, changeLive, liveEvent, stamp } from "./live-store.mjs";
import { liveConnection } from "./live-routing.mjs";
export const activeCall = (call) =>
  ["queued", "ringing", "in-progress"].includes(call.status);
export const callView = (call) => ({
  id: call.sid,
  status: call.status,
  active: activeCall(call),
  from: call.from,
  to: call.to,
  parent_call_id: call.parent_call_sid || null,
  provider_number_id: call.phone_number_sid || null,
  direction: call.direction,
  started_at: call.start_time || call.date_created || null,
  ended_at: call.end_time || null,
  duration: Number(call.duration) || 0,
  price: typeof call.price === "number" ? call.price : null,
  currency: call.price_unit || null,
});
export async function ownCall(client, doc, id, depth = 0) {
  if (!UUID.test(id || "") || depth > 2)
    deny(404, "CALL_NOT_FOUND", "Call not found.");
  const call = await client.compat("/Calls/" + id);
  if (call.sid !== id || call.account_sid !== client.projectId)
    throw new ProviderError(502);
  const own = doc.routing_numbers.filter((n) => n.status === "owned");
  const direct = own.find(
    (n) =>
      n.provider_number_id === call.phone_number_sid ||
      (call.direction === "inbound"
        ? call.to === n.e164
        : call.from === n.e164),
  );
  if (!direct && call.parent_call_sid)
    await ownCall(client, doc, call.parent_call_sid, depth + 1);
  else if (!direct)
    deny(
      403,
      "CALL_NOT_OWNED",
      "This call does not belong to an imported routing number.",
    );
  if (direct) {
    const verified = await client.ownNumber(direct.provider_number_id);
    if (verified.number !== direct.e164)
      deny(
        403,
        "CALL_NOT_OWNED",
        "The call routing number could not be verified.",
      );
  }
  return call;
}
export async function syncCalls(database, account, client, doc) {
  const payload = await client.compat("/Calls?PageSize=100");
  if (!Array.isArray(payload.calls)) throw new ProviderError(502);
  const ids = new Set(
    doc.routing_numbers
      .filter((n) => n.status === "owned")
      .map((n) => n.provider_number_id),
  );
  const numbers = new Set(
    doc.routing_numbers.filter((n) => n.status === "owned").map((n) => n.e164),
  );
  const valid = payload.calls.filter(
    (c) =>
      c &&
      c.account_sid === client.projectId &&
      UUID.test(c.sid || "") &&
      typeof c.status === "string",
  );
  const roots = new Set(
    valid
      .filter(
        (c) =>
          ids.has(c.phone_number_sid) ||
          (c.direction === "inbound" ? numbers.has(c.to) : numbers.has(c.from)),
      )
      .map((c) => c.sid),
  );
  const calls = valid
    .filter((c) => roots.has(c.sid) || roots.has(c.parent_call_sid))
    .map(callView);
  await changeLive(database, account.id, (d) => {
    d.calls = calls;
    d.last_sync = stamp();
    d.calls_has_more = Boolean(payload.next_page_uri);
    return {};
  });
  return calls;
}
export async function startTestCall({
  database,
  account,
  client,
  connectionId,
  callback,
}) {
  if (!E164.test(callback || ""))
    deny(
      422,
      "INVALID_CALLBACK",
      "Enter your phone number in international format.",
    );
  const { connection, number } = await liveConnection(
      database,
      account.id,
      connectionId,
    ),
    doc = await readLive(database, account.id);
  if (
    doc.routing_numbers.some((n) => n.e164 === callback) ||
    callback === connection.destination
  )
    deny(
      422,
      "INVALID_CALLBACK",
      "Use a separate outside phone for the test callback.",
    );
  const remote = await client.ownNumber(number.provider_number_id);
  if (remote.number !== number.e164)
    deny(409, "NUMBER_CHANGED", "Refresh your number inventory.");
  const current = await syncCalls(database, account, client, doc);
  if (current.some(activeCall))
    deny(
      409,
      "ACTIVE_CALL",
      "End your current call before starting another test call.",
    );
  const script = await client.createScript(
    "AgentBridge test " + crypto.randomUUID(),
    forwardXml(connection.destination, number.e164),
  );
  const call = await client.compat("/Calls", "POST", {
    To: callback,
    From: number.e164,
    Url: script.url,
    Method: "POST",
    Timeout: 30,
    Record: false,
  });
  if (!UUID.test(call.sid || "")) throw new ProviderError(502, true);
  const result = callView(call);
  await changeLive(database, account.id, (d) => {
    d.calls = [result, ...d.calls.filter((c) => c.id !== result.id)].slice(
      0,
      100,
    );
    liveEvent(
      d,
      "call.requested",
      "Test callback requested. SignalWire will call your phone, then the destination.",
    );
    return {};
  });
  return { call: result };
}
export async function controlCall({
  database,
  account,
  client,
  id,
  action,
  connectionId,
  consent,
}) {
  const doc = await readLive(database, account.id);
  const call = await ownCall(client, doc, id);
  if (!activeCall(call))
    deny(409, "CALL_ENDED", "This call has already ended.");
  if (action === "end") {
    const result = await client.compat("/Calls/" + id, "POST", {
      Status: call.status === "in-progress" ? "completed" : "canceled",
    });
    await changeLive(database, account.id, (d) => {
      d.calls = d.calls.map((c) => (c.id === id ? callView(result) : c));
      liveEvent(d, "call.end_requested", "Call end requested from SignalWire.");
      return {};
    });
    return { call: callView(result) };
  }
  if (action === "transfer") {
    const { connection } = await liveConnection(
      database,
      account.id,
      connectionId,
    );
    const number = doc.routing_numbers.find(
      (n) =>
        n.provider_number_id === call.phone_number_sid ||
        n.e164 === call.from ||
        n.e164 === call.to,
    );
    if (!number || call.parent_call_sid)
      deny(
        422,
        "SELECT_MAIN_CALL",
        "Choose the main call to change its destination.",
      );
    const script = await client.createScript(
      "AgentBridge transfer " + crypto.randomUUID(),
      forwardXml(connection.destination, number.e164),
    );
    const result = await client.compat("/Calls/" + id, "POST", {
      Url: script.url,
      Method: "POST",
    });
    await changeLive(database, account.id, (d) => {
      liveEvent(
        d,
        "call.transfer_requested",
        "Call transfer requested to " + connection.destination + ".",
      );
      return {};
    });
    return { call: callView(result), transfer_requested: true };
  }
  if (action === "record") {
    if (consent !== true)
      deny(
        422,
        "CAPTURE_PERMISSION_REQUIRED",
        "Confirm everyone on this call has agreed to recording.",
      );
    if (call.status !== "in-progress")
      deny(
        409,
        "CALL_NOT_CONNECTED",
        "Wait until the call is connected to start recording.",
      );
    const existing = await client.compat(
      "/Recordings?CallSid=" + id + "&PageSize=100",
    );
    if (!Array.isArray(existing.recordings)) throw new ProviderError(502);
    if (
      existing.recordings.some((r) =>
        ["in-progress", "paused"].includes(r.status),
      )
    )
      deny(
        409,
        "ALREADY_RECORDING",
        "This call already has an active recording.",
      );
    const recording = await client.compat(
      "/Calls/" + id + "/Recordings",
      "POST",
      {
        RecordingChannels: "dual",
        RecordingTrack: "both",
        Trim: "do-not-trim",
      },
    );
    if (!UUID.test(recording.sid || "") || recording.call_sid !== id)
      throw new ProviderError(502, true);
    await changeLive(database, account.id, (d) => {
      liveEvent(
        d,
        "recording.started",
        "Recording started after permission was confirmed.",
      );
      return {};
    });
    return { recording: recordingView(recording) };
  }
  deny(422, "INVALID_ACTION", "Choose an available call action.");
}
export const recordingView = (r) => ({
  id: r.sid,
  call_id: r.call_sid,
  status: r.status,
  duration: Number(r.duration) || 0,
  channels: Number(r.channels) || 1,
  created_at: r.date_created,
  price: typeof r.price === "number" ? r.price : null,
  currency: r.price_unit || null,
});
export async function recordingsFor(client, doc, callId) {
  await ownCall(client, doc, callId);
  const p = await client.compat(
    "/Recordings?CallSid=" + callId + "&PageSize=100",
  );
  if (!Array.isArray(p.recordings)) throw new ProviderError(502);
  return p.recordings
    .filter((r) => r.call_sid === callId && UUID.test(r.sid || ""))
    .map(recordingView);
}
export async function ownRecording(client, doc, id) {
  if (!UUID.test(id || ""))
    deny(404, "RECORDING_NOT_FOUND", "Recording not found.");
  const recording = await client.compat("/Recordings/" + id + ".json");
  if (
    recording.sid !== id ||
    recording.account_sid !== client.projectId ||
    !UUID.test(recording.call_sid || "")
  )
    deny(
      404,
      "RECORDING_NOT_FOUND",
      "This recording is not attached to a managed call.",
    );
  await ownCall(client, doc, recording.call_sid);
  return recording;
}
