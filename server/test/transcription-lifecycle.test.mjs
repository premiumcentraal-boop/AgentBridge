import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { openAccountDatabase } from "../accounts/node-database.mjs";
import { createAccountService } from "../accounts/service.mjs";
import { signalWireFixture } from "./helpers/signalwire-fixture.mjs";
import { realContactState, briefForContact } from "../agents/contacts.mjs";
const origin = "https://agentbridge.test",
  email = "tester@example.com";
async function harness(t, { uncertain = false } = {}) {
  const database = openAccountDatabase(":memory:");
  t.after(() => database.close());
  const provider = signalWireFixture(),
    key = randomBytes(32).toString("hex"),
    asrKey = "test-only-xai-" + randomUUID();
  let asrRequests = 0;
  const fetcher = async (url, options) => {
    if (new URL(url).origin !== "https://api.x.ai")
      return provider.fetcher(url, options);
    asrRequests++;
    assert.equal(url, "https://api.x.ai/v1/stt");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, "Bearer " + asrKey);
    assert.equal(options.body.get("model"), "grok-voice-transcribe-2.0");
    assert.equal(options.body.get("diarize"), "true");
    assert.equal(options.body.get("file").size, 5);
    assert.equal([...options.body.keys()].at(-1), "file");
    if (uncertain) throw new Error("Simulated lost transcription result");
    return Response.json({
      text: "The appointment is confirmed for Tuesday.",
      language: "en",
      duration: 20,
      words: [{ text: "The", start: 0, end: 0.2, speaker: 0 }],
    });
  };
  const service = createAccountService({
    database,
    testerEmail: email,
    publicOrigin: origin,
    platformIdentity: true,
    vaultKey: key,
    fetcher,
  });
  const headers = {
    Origin: origin,
    "Content-Type": "application/json",
    "oai-authenticated-user-id": "owner",
    "oai-authenticated-user-email": email,
  };
  const request = (path, method = "GET", body, extra = {}) =>
    service.fetch(
      new Request(origin + "/api/" + path, {
        method,
        headers: { ...headers, ...extra },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  const checked = async (...args) => {
    const response = await request(...args);
    assert.ok(response.ok, await response.clone().text());
    return response.json();
  };
  await checked("auth/register", "POST", {
    email,
    name: "Tester",
    agent_name: "Agent",
  });
  await checked("studio/provider/credentials", "POST", provider.config());
  await checked("studio/provider/mode", "PATCH", { live_enabled: true });
  await checked("studio/live/numbers/import", "POST", {
    provider_number_id: provider.owned.id,
    label: "Office",
  });
  const call = {
    sid: randomUUID(),
    account_sid: provider.state.project,
    phone_number_sid: provider.owned.id,
    from: "+12025550123",
    to: provider.owned.number,
    status: "completed",
    direction: "inbound",
    duration: 20,
    date_created: new Date().toISOString(),
  };
  provider.state.calls.push(call);
  const recording = {
    sid: randomUUID(),
    account_sid: provider.state.project,
    call_sid: call.sid,
    status: "completed",
    duration: 20,
  };
  provider.state.recordings.push(recording);
  await checked("studio/live/sync", "POST", {});
  await checked("studio/transcription/settings", "PUT", { api_key: asrKey });
  return {
    database,
    provider,
    key,
    asrKey,
    call,
    recording,
    request,
    checked,
    asrRequests: () => asrRequests,
  };
}
test("transcription requires permission, securely sends only owned audio once, and is available to call memory and export", async (t) => {
  const h = await harness(t),
    path = "studio/transcription/recordings/" + h.recording.sid,
    input = {
      request_id: randomUUID(),
      consent_to_process: true,
      confirm_charges: true,
    };
  const secret = await h.database.first(
    "SELECT * FROM ab_transcription_credentials",
  );
  assert.ok(!JSON.stringify(secret).includes(h.asrKey));
  assert.equal(
    (await h.request(path, "POST", { request_id: randomUUID() })).status,
    422,
  );
  assert.equal(h.asrRequests(), 0);
  assert.equal(
    (
      await h.request(path, "POST", input, {
        "oai-authenticated-user-id": "stranger",
      })
    ).status,
    401,
  );
  const foreign = { ...h.recording, sid: randomUUID(), call_sid: randomUUID() };
  h.provider.state.recordings.push(foreign);
  h.provider.state.calls.push({
    ...h.call,
    sid: foreign.call_sid,
    phone_number_sid: randomUUID(),
    to: "+12025550199",
    from: "+12025550198",
  });
  assert.equal(
    (
      await h.request(
        "studio/transcription/recordings/" + foreign.sid,
        "POST",
        { ...input, request_id: randomUUID() },
      )
    ).status,
    403,
  );
  assert.equal(h.asrRequests(), 0);
  const result = await h.checked(path, "POST", input);
  assert.equal(result.transcript.source, "xai");
  assert.equal(
    result.transcript.text,
    "The appointment is confirmed for Tuesday.",
  );
  assert.equal((await h.checked(path, "POST", input)).reused, true);
  assert.equal(
    (await h.checked(path, "POST", { ...input, request_id: randomUUID() }))
      .reused,
    true,
  );
  assert.equal(h.asrRequests(), 1);
  const saved = await h.checked("studio/transcription/calls/" + h.call.sid);
  assert.equal(saved.transcripts.length, 1);
  const account = await h.database.first("SELECT * FROM ab_accounts"),
    state = await realContactState(h.database, account.id),
    contact = state.contacts.find((c) => c.number === h.call.to);
  assert.equal(state.history[0].has_transcript, true);
  assert.match(
    briefForContact(state, contact).previous_calls[0].transcript_excerpt[0]
      .text,
    /Tuesday/,
  );
  const data = await h.checked("auth/export");
  assert.equal(data.transcripts.length, 1);
  assert.ok(!JSON.stringify(data).includes(h.asrKey));
  assert.ok(!JSON.stringify(data).includes(h.provider.state.token));
  assert.ok(!JSON.stringify(data).includes("encrypted_secret"));
  assert.equal(
    (await h.checked("studio/live/overview")).call_history[0].has_transcript,
    true,
  );
  await h.checked(
    "studio/transcription/jobs/" + result.transcript.id,
    "DELETE",
    {},
  );
  assert.equal(
    (await h.checked("studio/transcription/calls/" + h.call.sid)).transcripts
      .length,
    0,
  );
});
test("uncertain transcription writes are never automatically resent", async (t) => {
  const h = await harness(t, { uncertain: true }),
    path = "studio/transcription/recordings/" + h.recording.sid,
    input = {
      request_id: randomUUID(),
      consent_to_process: true,
      confirm_charges: true,
    };
  assert.equal((await h.request(path, "POST", input)).status, 502);
  assert.equal(h.asrRequests(), 1);
  assert.equal((await h.request(path, "POST", input)).status, 409);
  assert.equal(
    (await h.request(path, "POST", { ...input, request_id: randomUUID() }))
      .status,
    409,
  );
  assert.equal(h.asrRequests(), 1);
  assert.equal(
    (await h.database.first("SELECT status FROM ab_transcription_jobs")).status,
    "unknown",
  );
  const job = await h.database.first("SELECT id FROM ab_transcription_jobs");
  assert.equal(
    (await h.request("studio/transcription/jobs/" + job.id, "PATCH", {}))
      .status,
    422,
  );
  await h.checked("studio/transcription/jobs/" + job.id, "PATCH", {
    reviewed_provider_usage: true,
  });
  assert.equal(h.asrRequests(), 1);
  assert.equal(
    (await h.database.first("SELECT status FROM ab_transcription_jobs")).status,
    "failed",
  );
});
test("account deletion requires explicit confirmation, protects carrier state and cascades private data", async (t) => {
  const h = await harness(t);
  assert.equal((await h.request("auth/account", "DELETE", {})).status, 422);
  assert.equal(
    (await h.request("auth/account", "DELETE", { confirmation: "DELETE" }))
      .status,
    409,
  );
  await h.checked("studio/provider/credentials", "DELETE", {});
  const account = await h.database.first("SELECT id FROM ab_accounts");
  await h.database.run(
    "INSERT INTO ab_contacts(id,account_id,e164,name,country,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
    [
      "ct_test",
      account.id,
      "+12025550123",
      "Private",
      "US",
      "note",
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );
  const result = await h.checked("auth/account", "DELETE", {
    confirmation: "DELETE",
  });
  assert.equal(result.deleted, true);
  for (const table of [
    "ab_accounts",
    "ab_workspaces",
    "ab_live_workspaces",
    "ab_contacts",
    "ab_transcription_credentials",
  ])
    assert.equal(
      (await h.database.first("SELECT COUNT(*) AS n FROM " + table)).n,
      0,
    );
  assert.equal((await h.request("studio/agents")).status, 401);
});
