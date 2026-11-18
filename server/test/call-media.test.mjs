import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { EventEmitter, once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import WebSocket from "ws";
import { createApp } from "../app.mjs";
import { openAccountDatabase } from "../accounts/node-database.mjs";
import { openStore } from "../store.mjs";
import { signalWireFixture } from "./helpers/signalwire-fixture.mjs";

const origin = "https://agentbridge.test";
const sha = (s) => createHash("sha256").update(s).digest("hex");
const phone = "+12025557890";
async function until(fn) {
  for (let i = 0; i < 400; i++) {
    const result = fn();
    if (result) return result;
    await delay(5);
  }
  assert.fail("Timed out waiting for a media event");
}
async function setup(t) {
  const fixture = signalWireFixture();
  const urls = [],
    sent = [],
    captions = new EventEmitter();
  captions.readyState = WebSocket.OPEN;
  captions.bufferedAmount = 0;
  captions.send = (bytes) => sent.push(Buffer.from(bytes));
  captions.terminate = () => {
    captions.readyState = WebSocket.CLOSED;
  };
  const database = openAccountDatabase(":memory:");
  const email = "caller@example.test",
    invite = randomUUID();
  const app = createApp({
    store: openStore(":memory:"),
    accountDatabase: database,
    fetcher: fixture.fetcher,
    captionConnect: (url, options) => {
      urls.push({ url, authorization: Boolean(options.headers.Authorization) });
      return captions;
    },
    env: {
      NODE_ENV: "production",
      STUDIO_PUBLIC_ORIGIN: origin,
      DEMO_TESTER_EMAIL: email,
      DEMO_SIGNUP_INVITE_SHA256: sha(invite),
      PROVIDER_CREDENTIALS_KEY: randomBytes(32).toString("hex"),
    },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const sockets = [],
    base = "http://127.0.0.1:" + app.address().port;
  t.after(async () => {
    for (const ws of sockets) ws.terminate();
    const closed = once(app, "close");
    app.shutdown();
    await closed;
  });
  let cookie = "";
  const request = (path, method, body) =>
    fetch(base + "/api/" + path, {
      method,
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: body && JSON.stringify(body),
    });
  const register = await request("auth/register", "POST", {
    name: "Owner",
    agent_name: "Calling agent",
    email,
    password: "a-test-password-only",
    invite_token: invite,
  });
  assert.equal(register.status, 201);
  cookie = register.headers.get("set-cookie").split(";")[0];
  async function api(path, body, method = "POST") {
    const res = await request("studio/" + path, method, body);
    const data = await res.json();
    assert.ok(res.ok, path + " " + (data.error?.message || res.status));
    return data;
  }
  await api("provider/credentials", fixture.config());
  await api("provider/mode", { live_enabled: true }, "PATCH");
  const connect = async (number, label, destination) => {
    const added = await api("live/numbers/import", {
      provider_number_id: number.id,
      label,
    });
    return (
      await api("live/connections", {
        label,
        routing_number_id: added.number.id,
        destination,
        country: "US",
      })
    ).connection;
  };
  const contact = await connect(fixture.owned, "Main office", "+12025551235");
  const extra = { ...fixture.owned, id: randomUUID(), number: "+12025550981" };
  fixture.state.numbers.push(extra);
  const second = await connect(extra, "Other office", "+12025550989");
  const keyFor = (sid) => {
    const dial = fixture.state.requests.filter(
      (r) => r.method === "POST" && r.path.endsWith("/Calls"),
    );
    const called = fixture.state.calls.find((c) => c.sid === sid);
    const scriptId = dial
      .findLast((r) => r.body.To === called.to)
      .body.Url.split("/")
      .pop();
    return fixture.state.scripts
      .get(scriptId)
      .contents.match(/authBearerToken="([^"]+)"/)[1];
  };
  async function connectWs(path, protocols, headers) {
    const ws = new WebSocket(base.replace("http:", "ws:") + path, protocols, {
      headers,
    });
    sockets.push(ws);
    const messages = [];
    ws.on("message", (b, binary) => {
      messages.push(binary ? Buffer.from(b) : JSON.parse(b));
      if (messages.length > 200) messages.shift();
    });
    await once(ws, "open");
    return { ws, messages };
  }
  async function carrier(
    sid,
    bearer = keyFor(sid),
    project = fixture.state.project,
  ) {
    const client = await connectWs("/api/media/carrier", [], {
      Authorization: "Bearer " + bearer,
    });
    const streamSid = randomUUID();
    client.ws.send(
      JSON.stringify({
        event: "start",
        start: {
          accountSid: project,
          callSid: sid,
          streamSid,
          mediaFormat: {
            encoding: "audio/x-mulaw",
            sampleRate: 8000,
            channels: 1,
          },
        },
      }),
    );
    return { ...client, streamSid };
  }
  const ticket = async (id) =>
    (await api("live/rooms/" + id + "/ticket", {})).ticket;
  const browser = (value, customOrigin = origin, useCookie = cookie) =>
    connectWs("/api/media/studio", ["agentbridge-room-v1", value], {
      origin: customOrigin,
      cookie: useCookie,
    });
  return {
    app,
    fixture,
    database,
    contact,
    second,
    request,
    api,
    carrier,
    keyFor,
    browser,
    ticket,
    captions,
    urls,
    sent,
    base,
  };
}
const tone = Buffer.alloc(160, 0x94);
const emitPhone = (peer, bytes = tone) =>
  peer.ws.send(
    JSON.stringify({
      event: "media",
      streamSid: peer.streamSid,
      media: { track: "inbound", payload: bytes.toString("base64") },
    }),
  );
const dialInput = (id) => ({
  connection_id: id,
  callback_number: phone,
  confirm_charges: true,
  request_id: randomUUID(),
  studio_room: true,
});
test("a callback dials in answer order, relays real audio, supports scoped join, mute, captions, invites, transfer and independent leave", async (t) => {
  const h = await setup(t);
  const root = (await h.api("live/calls/start", dialInput(h.contact.id))).call
    .id;
  assert.equal(h.fixture.state.calls.length, 1);
  assert.equal(h.fixture.state.calls[0].to, phone);
  const anchor = await h.carrier(root);
  await until(() => h.fixture.state.calls.length === 2);
  const dst = h.fixture.state.calls[0];
  assert.equal(dst.to, h.contact.destination);
  const destination = await h.carrier(dst.sid);
  await until(() => destination.messages.some((m) => m.event === "media"));
  const before = await h.request(
    "studio/live/rooms/" + root + "/captions",
    "POST",
    { enabled: true },
  );
  assert.equal(before.status, 422);
  const bearer = await h.ticket(root);
  await assert.rejects(h.browser(bearer, "https://elsewhere.test"), /403/);
  await assert.rejects(h.browser(await h.ticket(root), origin, ""), /403/);
  const secondSession = await h.request("auth/login", "POST", {
    email: "caller@example.test",
    password: "a-test-password-only",
  });
  assert.equal(secondSession.status, 200);
  await assert.rejects(
    h.browser(
      bearer,
      origin,
      secondSession.headers.get("set-cookie").split(";")[0],
    ),
    /403/,
  );
  const person = await h.browser(bearer);
  const joined = await until(() =>
    person.messages.find((m) => m.type === "joined"),
  );
  assert.equal(joined.room.participants.length, 3);
  assert.equal(
    joined.room.participants.find((p) => p.id === joined.self).muted,
    true,
  );
  await assert.rejects(h.browser(bearer), /403/);
  emitPhone(anchor);
  await until(() =>
    person.messages.some((m) => Buffer.isBuffer(m) && m.equals(tone)),
  );
  await until(() =>
    destination.messages.some(
      (m) => m.media?.payload === tone.toString("base64"),
    ),
  );
  assert.ok(
    !anchor.messages.some((m) => m.media?.payload === tone.toString("base64")),
  );
  const caller = joined.room.participants.find((p) => p.role === "callback");
  person.ws.send(JSON.stringify({ type: "mute", id: caller.id, muted: true }));
  await until(() =>
    person.messages.some(
      (m) =>
        m.type === "room" &&
        m.room.participants.find((p) => p.id === caller.id)?.muted,
    ),
  );
  const newTone = Buffer.alloc(160, 0x97);
  emitPhone(anchor, newTone);
  await delay(65);
  assert.ok(
    !person.messages.some((m) => Buffer.isBuffer(m) && m.equals(newTone)),
  );
  person.ws.send(
    JSON.stringify({ type: "mute", id: joined.self, muted: false }),
  );
  person.ws.send(newTone);
  await until(() =>
    anchor.messages.some(
      (m) => m.media?.payload === newTone.toString("base64"),
    ),
  );
  await h.api(
    "transcription/settings",
    { api_key: "fixture-" + randomUUID() },
    "PUT",
  );
  await h.api("live/rooms/" + root + "/captions", {
    enabled: true,
    consent: true,
    confirm_charges: true,
  });
  assert.equal(h.urls.length, 1);
  assert.equal(new URL(h.urls[0].url).origin, "wss://api.x.ai");
  h.captions.emit(
    "message",
    Buffer.from(JSON.stringify({ type: "transcript.created" })),
    false,
  );
  emitPhone(destination, newTone);
  await until(() => h.sent.some((b) => b.equals(newTone)));
  h.captions.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "transcript.partial",
        text: "Can you hear me?",
        is_final: true,
        words: [{ speaker: 0 }],
      }),
    ),
    false,
  );
  const line = await until(() =>
    person.messages.find((m) => m.type === "caption"),
  );
  assert.equal(line.line.text, "Can you hear me?");
  assert.equal(line.line.speaker, 1);
  const input = {
    connection_id: h.second.id,
    request_id: randomUUID(),
    confirm_charges: true,
  };
  await h.api("live/rooms/" + root + "/invite", input);
  await h.api("live/rooms/" + root + "/invite", input);
  assert.equal(h.fixture.state.calls.length, 3);
  const extra = await h.carrier(h.fixture.state.calls[0].sid);
  await until(() =>
    person.messages.some(
      (m) =>
        m.type === "room" &&
        m.room.participants.some(
          (p) => p.role === "guest" && p.status === "connected",
        ),
    ),
  );
  extra.ws.close();
  await once(extra.ws, "close");
  await until(
    () =>
      person.messages.at(-1)?.type === "room" || !h.fixture.state.scripts.size,
  );
  person.ws.close();
  await once(person.ws, "close");
  await until(() => h.captions.readyState === WebSocket.CLOSED);
  assert.equal(anchor.ws.readyState, WebSocket.OPEN);
  assert.equal(destination.ws.readyState, WebSocket.OPEN);
  const transfer = await h.api("live/calls/" + root + "/transfer", {
    connection_id: h.second.id,
    request_id: randomUUID(),
    confirm_charges: true,
  });
  assert.equal(destination.ws.readyState, WebSocket.OPEN);
  const replacement = await h.carrier(transfer.provider_call_id);
  await until(() => destination.ws.readyState === WebSocket.CLOSED);
  assert.equal(anchor.ws.readyState, WebSocket.OPEN);
  replacement.ws.close();
  await until(() => anchor.ws.readyState === WebSocket.CLOSED);
  assert.equal(
    (await h.request("studio/live/rooms/" + root + "/ticket", "POST", {}))
      .status,
    409,
  );
});
test("an opted-in incoming route validates live carrier identity, dispatches once per call and restores its prior handler", async (t) => {
  const h = await setup(t),
    { fixture, contact } = h;
  await h.api("live/connections/" + contact.id + "/activate", {
    request_id: randomUUID(),
    confirm_charges: true,
    studio_room: true,
  });
  const route = await h.database.first("SELECT * FROM ab_live_routes");
  const bearer = fixture.state.scripts
    .get(route.script_id)
    .contents.match(/authBearerToken="([^"]+)"/)[1];
  assert.equal(route.media_token_hash, sha(bearer));
  const wrong = await h.carrier(randomUUID(), bearer, randomUUID());
  await until(() => wrong.ws.readyState === WebSocket.CLOSED);
  assert.equal(fixture.state.calls.length, 0);
  const sid = randomUUID();
  fixture.state.calls.push({
    sid,
    account_sid: fixture.state.project,
    to: fixture.owned.number,
    from: phone,
    status: "in-progress",
    direction: "inbound",
  });
  const caller = await h.carrier(sid, bearer);
  await until(() => fixture.state.calls.length === 2);
  caller.ws.close();
  await once(caller.ws, "close");
  const replay = await h.carrier(sid, bearer);
  await until(() => replay.ws.readyState === WebSocket.CLOSED);
  assert.equal(fixture.state.calls.length, 2);
  await h.api("live/connections/" + contact.id + "/deactivate", {
    request_id: randomUUID(),
  });
  assert.equal(
    fixture.owned.call_request_url,
    fixture.original.call_request_url,
  );
  await assert.rejects(h.carrier(sid, bearer), /403/);
});
