import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { deny } from "../accounts/model.mjs";
import { UUID, ProviderError } from "../accounts/signalwire-client.mjs";
import { enqueue, mix } from "./audio.mjs";

const open = (socket) => socket?.readyState === WebSocket.OPEN;
export function sendEvent(socket, message) {
  if (open(socket)) socket.send(JSON.stringify(message));
}
export class CallRoom {
  constructor({ accountId, connection, number, client, release, dialLeg }) {
    Object.assign(this, {
      accountId,
      connection,
      number,
      client,
      release,
      dialLeg,
    });
    this.id = randomUUID();
    this.people = new Map();
    this.callId = null;
    this.finished = false;
    this.created = Date.now();
    this.captionState = "off";
    this.lines = [];
    this.timeout = setTimeout(() => this.end(), 300000);
    this.timeout.unref();
    this.tick = setInterval(() => this.mixAudio(), 20);
    this.tick.unref();
  }
  add(role, label, phone) {
    const person = {
      id: randomUUID(),
      role,
      label,
      phone,
      status: "connecting",
      muted: role === "studio",
      audio: Buffer.alloc(0),
    };
    this.people.set(person.id, person);
    this.broadcast();
    return person;
  }
  view() {
    return {
      id: this.id,
      call_id: this.callId,
      captions: this.captionState,
      participants: [...this.people.values()].map(
        ({ id, role, label, muted, status }) => ({
          id,
          role,
          label,
          muted,
          status,
        }),
      ),
    };
  }
  broadcast(message = { type: "room", room: this.view() }) {
    for (const p of this.people.values())
      if (p.role === "studio") sendEvent(p.socket, message);
  }
  async dial(person) {
    try {
      const call = await this.dialLeg(this, person);
      if (
        !UUID.test(call?.sid || "") ||
        (call.account_sid && call.account_sid !== this.client.projectId)
      )
        throw new ProviderError(502, true);
      person.sid = call.sid;
      if (person === this.anchor) this.callId = call.sid;
      if (this.finished || person.status === "left") this.cancelRinging(person);
      else if (!person.socket) {
        person.status = "ringing";
        person.ringTimeout = setTimeout(() => this.leave(person), 38000);
        this.broadcast();
      }
      return call;
    } catch (error) {
      this.leave(person);
      throw error;
    }
  }
  async callback(phone) {
    this.anchor = this.add("callback", "Callback phone", phone);
    return this.dial(this.anchor);
  }
  inbound(sid, phone) {
    this.anchor = this.add("caller", "Incoming caller", phone);
    this.callId = this.anchor.sid = sid;
    return this.anchor;
  }
  attachPhone(person, socket, streamId) {
    if (this.finished || person.socket || person.status === "left")
      return socket.terminate();
    clearTimeout(person.ringTimeout);
    Object.assign(person, { socket, streamId, status: "connected" });
    if (person === this.replacement) {
      const previous = this.destination;
      this.destination = person;
      person.role = "destination";
      this.replacement = null;
      previous.role = "guest";
      this.leave(previous);
    }
    this.broadcast();
    if (person === this.anchor && !this.destination) {
      this.destination = this.add(
        "destination",
        this.connection.label,
        this.connection.destination,
      );
      // The authenticated start event is emitted only after the first phone answers.
      this.dial(this.destination).catch(() => this.end());
    }
  }
  attachBrowser(socket) {
    const prior = [...this.people.values()].find((p) => p.role === "studio");
    if (prior) this.leave(prior);
    const person = this.add("studio", "You", null);
    Object.assign(person, { socket, status: "connected" });
    sendEvent(socket, {
      type: "joined",
      self: person.id,
      room: this.view(),
      lines: this.lines,
    });
    this.broadcast();
    return person;
  }
  mute(id, muted) {
    const p = this.people.get(id);
    if (!p || p.status !== "connected" || typeof muted !== "boolean")
      deny(422, "PARTICIPANT_UNAVAILABLE", "Choose a connected participant.");
    p.muted = muted;
    p.audio = Buffer.alloc(0);
    this.broadcast();
  }
  async transfer(connection) {
    if (!this.destination?.socket || this.replacement)
      deny(
        409,
        "TRANSFER_UNAVAILABLE",
        "Wait until the destination answers and any transfer finishes.",
      );
    if (
      [...this.people.values()].some(
        (p) => p.phone === connection.destination && p.status !== "left",
      )
    )
      deny(409, "ALREADY_IN_ROOM", "Choose a destination outside this call.");
    const next = (this.replacement = this.add(
      "transfer",
      connection.label,
      connection.destination,
    ));
    const call = await this.dial(next);
    return { transfer_requested: true, provider_call_id: call.sid };
  }
  async invite(connection) {
    const phones = [...this.people.values()].filter(
      (p) => p.phone && p.status !== "left",
    );
    if (
      phones.length >= 5 ||
      phones.some((p) => p.phone === connection.destination)
    )
      deny(
        409,
        "PARTICIPANT_LIMIT",
        "Choose a different contact. A room supports five phones.",
      );
    const person = this.add("guest", connection.label, connection.destination);
    await this.dial(person);
    return { participant_id: person.id };
  }
  receive(person, bytes) {
    if (!person.muted && !this.finished && person.status === "connected")
      enqueue(person, bytes);
  }
  mixAudio() {
    if (this.finished) return;
    const active = [...this.people.values()].filter(
      (p) => open(p.socket) && p.status === "connected",
    );
    if (!active.length) return;
    mix(
      active,
      (p, bytes) => {
        if (p.socket.bufferedAmount > 64000) return p.socket.terminate();
        if (p.role === "studio") p.socket.send(bytes, { binary: true });
        else
          sendEvent(p.socket, {
            event: "media",
            streamSid: p.streamId,
            media: { payload: bytes.toString("base64") },
          });
      },
      this.captions && ((bytes) => this.captions.write(bytes)),
    );
  }
  stopCaptions() {
    this.captionEpoch = (this.captionEpoch || 0) + 1;
    const current = this.captions;
    this.captions = null;
    this.captionState = "off";
    current?.stop();
    this.broadcast();
  }
  async startCaptions(make) {
    if (this.captionState !== "off") return;
    if (
      ![...this.people.values()].some(
        (p) => p.role === "studio" && open(p.socket),
      )
    )
      deny(409, "JOIN_FIRST", "Join the call to see live captions.");
    const epoch = (this.captionEpoch = (this.captionEpoch || 0) + 1);
    this.captionState = "starting";
    this.broadcast();
    try {
      const start = await make();
      if (epoch !== this.captionEpoch || this.finished) return;
      this.captions = start({
        ready: () => {
          if (epoch === this.captionEpoch) {
            this.captionState = "on";
            this.broadcast();
          }
        },
        text: (text, final, speaker) => {
          if (epoch !== this.captionEpoch) return;
          const line = { text, final, speaker, time: Date.now() };
          if (final) this.lines = [...this.lines.slice(-59), line];
          this.broadcast({ type: "caption", line });
        },
        closed: (error) => {
          if (epoch !== this.captionEpoch) return;
          this.captions = null;
          this.captionState = "off";
          this.broadcast();
          if (error) this.broadcast({ type: "notice", message: error });
        },
      });
    } catch (error) {
      if (epoch === this.captionEpoch) this.stopCaptions();
      throw error;
    }
  }
  cancelRinging(p) {
    if (!p.sid || p.cancelRequested || p.wasConnected) return;
    p.cancelRequested = true;
    this.client
      .compat("/Calls/" + p.sid, "POST", { Status: "canceled" })
      .catch(() => {});
  }
  leave(p) {
    if (!p || p.status === "left") return;
    clearTimeout(p.ringTimeout);
    p.wasConnected = p.status === "connected";
    p.status = "left";
    p.audio = Buffer.alloc(0);
    p.socket?.terminate();
    if (p.role === "studio") {
      this.people.delete(p.id);
      this.stopCaptions();
      this.lines = [];
    } else if (!p.wasConnected) this.cancelRinging(p);
    if (p === this.replacement) this.replacement = null;
    if (p === this.anchor || p === this.destination) this.end();
    else if (p.role === "guest" || p.role === "transfer")
      this.people.delete(p.id);
    this.broadcast();
  }
  end() {
    if (this.finished) return;
    this.finished = true;
    clearTimeout(this.timeout);
    clearInterval(this.tick);
    this.broadcast({ type: "ended" });
    this.stopCaptions();
    for (const p of [...this.people.values()]) this.leave(p);
    this.release(this);
  }
}
