import { createHash, randomBytes } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { UUID, escapeXml } from "../accounts/signalwire-client.mjs";
import { deny } from "../accounts/model.mjs";
import { authLimit, cookieToken } from "../accounts/auth-primitives.mjs";
import {
  connectedProvider,
  providerOperation,
  onlyFields,
  requireCharges,
} from "../accounts/provider-control.mjs";
import { liveConnection } from "../accounts/live-routing.mjs";
import { readLive } from "../accounts/live-store.mjs";
import { CallRoom, sendEvent } from "./room.mjs";
import { captionKey, openCaptions } from "./captions.mjs";

const token = () => randomBytes(32).toString("hex");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const secretFormat = /^[a-f0-9]{64}$/;
const carrierPath = "/api/media/carrier";
const browserPath = "/api/media/studio";
const protocol = "agentbridge-room-v1";
const validStart = (s) =>
  UUID.test(s?.callSid || "") &&
  UUID.test(s?.streamSid || "") &&
  s.mediaFormat?.encoding === "audio/x-mulaw" &&
  s.mediaFormat.sampleRate === 8000 &&
  s.mediaFormat.channels === 1;
const rejected = (socket) => {
  if (!socket.destroyed)
    socket.end(
      "HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
    );
};

export function createCallMedia({
  database,
  vaultKey,
  origin,
  fetcher,
  captionConnect,
}) {
  if (!database || !/^[a-f0-9]{64}$/i.test(vaultKey || "")) return null;
  let url;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  if (
    url.origin !== origin ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      ))
  )
    return null;
  // The carrier only accepts secure, public WebSocket URLs.
  const streamURL = "wss://" + url.host + carrierPath;
  const xml = (bearer) =>
    '<Response><Connect><Stream url="' +
    escapeXml(streamURL) +
    '" authBearerToken="' +
    bearer +
    '" codec="PCMU@8000h" realtime="true"/></Connect><Hangup/></Response>';
  const rooms = new Map(),
    tickets = new Map();
  const server = new WebSocketServer({
    noServer: true,
    maxPayload: 16384,
    perMessageDeflate: false,
    handleProtocols: (protocols) =>
      protocols.has(protocol) ? protocol : false,
  });
  function issue(entry, lifetime) {
    const value = token(),
      key = hash(value);
    const timer = setTimeout(() => drop(key), lifetime);
    timer.unref();
    tickets.set(key, { ...entry, timer });
    return value;
  }
  function drop(key) {
    const entry = tickets.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    tickets.delete(key);
    entry.cleanup?.();
  }
  function roomFor(accountId, callId) {
    const room = rooms.get(accountId);
    return room && [...room.people.values()].some((p) => p.sid === callId)
      ? room
      : null;
  }
  async function dialLeg(room, p) {
    const confirmed = Promise.withResolvers();
    let script;
    const bearer = issue(
      {
        kind: "phone",
        room,
        p,
        confirmed: confirmed.promise,
        cleanup: () => {
          if (script)
            room.client
              .compat("/LamlBins/" + script.id, "DELETE")
              .catch(() => {});
        },
      },
      55000,
    );
    const key = hash(bearer);
    try {
      script = await room.client.createScript(
        "AgentBridge room " + p.id,
        xml(bearer),
      );
      if (room.finished || !tickets.has(key)) {
        if (!tickets.has(key))
          await room.client
            .compat("/LamlBins/" + script.id, "DELETE")
            .catch(() => {});
        deny(409, "ROOM_ENDED", "This call room has ended.");
      }
      const call = await room.client.compat("/Calls", "POST", {
        From: room.number.e164,
        To: p.phone,
        Url: script.url,
        Method: "POST",
        Timeout: 25,
        TimeLimit: 300,
        Record: false,
      });
      confirmed.resolve(call.sid);
      return call;
    } catch (error) {
      confirmed.resolve(null);
      drop(key);
      throw error;
    }
  }
  function newRoom(accountId, connection, number, client) {
    if (rooms.has(accountId))
      deny(
        409,
        "ACTIVE_ROOM",
        "Finish the current room before starting another call.",
      );
    if (rooms.size >= 64)
      deny(503, "ROOMS_BUSY", "All call rooms are busy. Try again shortly.");
    const room = new CallRoom({
      accountId,
      connection,
      number,
      client,
      dialLeg,
      release: (ended) => {
        rooms.delete(ended.accountId);
        for (const [key, entry] of tickets) if (entry.room === ended) drop(key);
      },
    });
    rooms.set(accountId, room);
    return room;
  }
  // An active forwarding route is reusable, but each inbound carrier call can
  // dispatch its destination only once, including across application restarts.
  async function acceptInbound(route, start) {
    if (!validStart(start) || rooms.has(route.account_id)) return null;
    const { client, row } = await connectedProvider(
      database,
      route.account_id,
      vaultKey,
      fetcher,
    );
    if (!row.live_enabled || client.projectId !== start.accountSid) return null;
    const { connection, number } = await liveConnection(
      database,
      route.account_id,
      route.connection_id,
    );
    const call = await client.compat("/Calls/" + start.callSid);
    if (
      call.sid !== start.callSid ||
      call.account_sid !== start.accountSid ||
      call.direction !== "inbound" ||
      call.to !== number.e164 ||
      !["ringing", "in-progress"].includes(call.status)
    )
      return null;
    const active = await database.first(
      "SELECT connection_id FROM ab_live_routes WHERE account_id=? AND connection_id=? AND media_token_hash=? AND status='active'",
      [route.account_id, route.connection_id, route.media_token_hash],
    );
    if (!active) return null;
    await database.run("DELETE FROM ab_media_inbound WHERE accepted_at < ?", [
      Date.now() - 86400000,
    ]);
    const saved = await database.run(
      "INSERT OR IGNORE INTO ab_media_inbound(account_id,call_id,accepted_at) VALUES(?,?,?)",
      [route.account_id, start.callSid, Date.now()],
    );
    if (!saved.changes) return null;
    const room = newRoom(route.account_id, connection, number, client);
    return { room, p: room.inbound(start.callSid, call.from) };
  }
  async function socketGrant(req, authenticate) {
    if (req.url === carrierPath) {
      const header = req.headers.authorization || "";
      if (!/^Bearer [0-9a-f]{64}$/.test(header)) return null;
      const key = hash(header.slice(7)),
        entry = tickets.get(key);
      if (entry?.kind === "phone") {
        if (entry.claimed || entry.room.finished) return null;
        entry.claimed = true;
        return { ...entry, key };
      }
      const route = await database.first(
        "SELECT account_id,connection_id,media_token_hash FROM ab_live_routes WHERE media_token_hash=? AND status='active'",
        [key],
      );
      return route && { kind: "forward", route };
    }
    if (req.url !== browserPath || req.headers.origin !== origin) return null;
    const [name, bearer, extra] = String(
      req.headers["sec-websocket-protocol"] || "",
    )
      .split(",")
      .map((s) => s.trim());
    if (
      name !== protocol ||
      !secretFormat.test(bearer || "") ||
      extra !== undefined
    )
      return null;
    const key = hash(bearer),
      entry = tickets.get(key);
    if (!entry || entry.kind !== "browser" || entry.room.finished) return null;
    const browser = new Request(origin + browserPath, {
      headers: { cookie: String(req.headers.cookie || "") },
    });
    const valid = async () =>
      (await authenticate(browser))?.id === entry.room.accountId;
    if (
      entry.sessionHash !== hash(cookieToken(browser) || "") ||
      !(await valid()) ||
      tickets.get(key) !== entry
    )
      return null;
    drop(key);
    return { ...entry, valid };
  }
  function carrier(socket, grant) {
    let member,
      room,
      starting = false;
    const timeout = setTimeout(() => socket.terminate(), 15000);
    socket.on("close", () => {
      clearTimeout(timeout);
      room?.leave(member);
    });
    socket.on("message", async (bytes, binary) => {
      try {
        if (binary) return socket.terminate();
        const msg = JSON.parse(bytes.toString());
        if (msg.event === "connected") return;
        if (msg.event === "start") {
          const s = msg.start;
          if (starting || !validStart(s)) return socket.terminate();
          starting = true;
          let target = grant;
          if (grant.kind === "forward")
            target = await acceptInbound(grant.route, s);
          else if (
            grant.room.client.projectId !== s.accountSid ||
            (await grant.confirmed) !== s.callSid
          )
            return socket.terminate();
          if (!target || target.room.finished) return socket.terminate();
          room = target.room;
          member = target.p;
          if (socket.readyState !== WebSocket.OPEN) return room.leave(member);
          if (grant.key) drop(grant.key);
          clearTimeout(timeout);
          room.attachPhone(member, socket, s.streamSid);
          return;
        }
        if (msg.event === "stop") return socket.close();
        if (
          member &&
          msg.event === "media" &&
          (!msg.streamSid || msg.streamSid === member.streamId) &&
          msg.media?.track === "inbound" &&
          typeof msg.media.payload === "string" &&
          msg.media.payload.length <= 5400
        ) {
          room.receive(member, Buffer.from(msg.media.payload, "base64"));
        }
      } catch {
        socket.terminate();
      }
    });
  }
  function browser(socket, grant) {
    const { room, valid } = grant;
    const person = room.attachBrowser(socket);
    const interval = setInterval(() => {
      valid()
        .then((ok) => {
          if (!ok) socket.terminate();
        })
        .catch(() => socket.terminate());
    }, 5000);
    interval.unref();
    let lastSecond = 0,
      packets = 0;
    socket.on("message", (bytes, binary) => {
      const now = Math.floor(Date.now() / 1000);
      if (now !== lastSecond) {
        lastSecond = now;
        packets = 0;
      }
      if (++packets > 140) return socket.close(1008);
      if (binary) {
        if (bytes.length !== 160) return socket.close(1003);
        return room.receive(person, bytes);
      }
      try {
        const msg = JSON.parse(bytes.toString());
        if (msg.type !== "mute" || typeof msg.muted !== "boolean")
          return socket.close(1008);
        room.mute(msg.id, msg.muted);
      } catch {
        sendEvent(socket, {
          type: "notice",
          message: "This participant is unavailable.",
        });
      }
    });
    socket.on("close", () => {
      clearInterval(interval);
      room.leave(person);
    });
  }
  let closing = false;
  return {
    hasRoom(accountId) {
      return rooms.has(accountId);
    },
    stopCaptions(accountId) {
      rooms.get(accountId)?.stopCaptions();
    },
    routeInstructions() {
      const bearer = token();
      return { xml: xml(bearer), hash: hash(bearer) };
    },
    async startCallback({ client, account, connection, number, callback }) {
      return newRoom(account.id, connection, number, client).callback(callback);
    },
    describe(accountId, callId) {
      const r = roomFor(accountId, callId);
      return r?.callId || null;
    },
    async transfer(accountId, callId, connectionId) {
      const room = roomFor(accountId, callId);
      if (!room || room.callId !== callId)
        deny(409, "SELECT_MAIN_CALL", "Open the main call to transfer it.");
      const { connection } = await liveConnection(
        database,
        accountId,
        connectionId,
      );
      return room.transfer(connection);
    },
    async request({ path, method, account, readBody, sessionToken }) {
      const match = /^rooms\/([a-f0-9-]{36})\/(ticket|captions|invite)$/.exec(
        path,
      );
      if (!match || method !== "POST") return null;
      const room = roomFor(account.id, match[1]);
      if (!room || room.finished || !room.anchor?.socket)
        deny(
          409,
          "ROOM_UNAVAILABLE",
          "This call does not have a connected Studio room.",
        );
      const input = await readBody();
      if (match[2] === "ticket") {
        if (!secretFormat.test(sessionToken || ""))
          deny(401, "SIGN_IN_REQUIRED", "Sign in to join this call.");
        onlyFields(input, []);
        await authLimit(database, "room-join:" + account.id, {
          maximum: 30,
          window: 60000,
        });
        return {
          status: 200,
          body: {
            ticket: issue(
              { kind: "browser", room, sessionHash: hash(sessionToken) },
              30000,
            ),
            path: browserPath,
          },
        };
      }
      if (match[2] === "captions") {
        onlyFields(input, ["enabled", "consent", "confirm_charges"]);
        if (typeof input.enabled !== "boolean")
          deny(422, "INVALID_MODE", "Choose a captions setting.");
        if (input.enabled) {
          if (input.consent !== true || input.confirm_charges !== true)
            deny(
              422,
              "CAPTION_CONSENT",
              "Confirm everyone agreed to live transcription and xAI charges.",
            );
          await room.startCaptions(async () => {
            const key = await captionKey(database, account.id, vaultKey);
            return (events) => openCaptions(key, events, captionConnect);
          });
        } else room.stopCaptions();
        return { status: 200, body: { captions: room.captionState } };
      }
      onlyFields(input, ["connection_id", "request_id", "confirm_charges"]);
      requireCharges(input);
      const doc = await readLive(database, account.id);
      const contact = doc.connections.find(
        (c) => c.id === input.connection_id && c.status === "saved",
      );
      if (
        !contact ||
        doc.routing_numbers.some((n) => n.e164 === contact.destination)
      )
        deny(422, "INVALID_DESTINATION", "Choose a saved outside destination.");
      const result = await providerOperation(
        database,
        account.id,
        {
          request_id: input.request_id,
          kind: "room_invite",
          target: room.id + ":" + contact.id,
          input: { destination: contact.destination },
          provider: room.client,
        },
        () => room.invite(contact),
      );
      return { status: 201, body: result };
    },
    attach(http, authenticate) {
      http.on("upgrade", async (req, socket, head) => {
        socket.on("error", () => {});
        try {
          if (server.clients.size >= 512) return rejected(socket);
          const grant = await socketGrant(req, authenticate);
          if (!grant || socket.destroyed) return rejected(socket);
          server.handleUpgrade(req, socket, head, (ws) => {
            ws.on("error", () => ws.terminate());
            let alive = true;
            ws.on("pong", () => {
              alive = true;
            });
            const heartbeat = setInterval(() => {
              if (!alive || ws.readyState !== WebSocket.OPEN)
                return ws.terminate();
              alive = false;
              ws.ping();
            }, 10000);
            heartbeat.unref();
            ws.once("close", () => clearInterval(heartbeat));
            if (grant.kind === "browser") browser(ws, grant);
            else carrier(ws, grant);
          });
        } catch {
          rejected(socket);
        }
      });
    },
    close() {
      if (closing) return;
      closing = true;
      for (const room of rooms.values()) room.end();
      for (const ws of server.clients) ws.terminate();
      server.close();
    },
  };
}
