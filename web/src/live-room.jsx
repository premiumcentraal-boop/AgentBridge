import React, { useEffect, useRef, useState } from "react";
import { Btn, Icon } from "./ui.jsx";

function stopMic(session) {
  if (!session) return;
  session.worklet?.port.postMessage(false);
  session.source?.disconnect();
  session.source = null;
  session.stream?.getTracks().forEach((track) => track.stop());
  session.stream = null;
}
export function LiveRoom({ callId, connections, write }) {
  const ref = useRef(null);
  const [state, setState] = useState("outside"),
    [room, setRoom] = useState(null),
    [self, setSelf] = useState("");
  const [speakerOn, setSpeakerOn] = useState(true),
    [error, setError] = useState(""),
    [withMic, setWithMic] = useState(false),
    [busy, setBusy] = useState(false);
  const [captionConsent, setCaptionConsent] = useState(false),
    [lines, setLines] = useState([]),
    [partial, setPartial] = useState(null);
  const [contact, setContact] = useState(""),
    [inviteConsent, setInviteConsent] = useState(false);
  const inviteKey = useRef(null);
  const path = "live/rooms/" + callId + "/";
  function leave() {
    const session = ref.current;
    ref.current = null;
    if (session) {
      clearTimeout(session.timeout);
      stopMic(session);
      session.socket?.close();
      session.worklet?.disconnect();
      session.context.close().catch(() => {});
    }
  }
  useEffect(() => () => leave(), [callId]);
  async function microphone(session) {
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error("This browser cannot open a microphone here.");
    if (session.stream) return;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
    } catch (error) {
      throw new Error(
        error.name === "NotAllowedError"
          ? "Microphone off. Allow microphone access in your browser, then turn it on here. You can keep listening."
          : "Microphone unavailable. Check your input device and try again. You can keep listening.",
      );
    }
    if (ref.current !== session) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    session.stream = stream;
    session.source = session.context.createMediaStreamSource(stream);
    session.source.connect(session.worklet);
    session.worklet.port.postMessage(true);
  }
  function sendMute(id, muted) {
    const socket = ref.current?.socket;
    if (socket?.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify({ type: "mute", id, muted }));
  }
  async function join() {
    if (ref.current) return;
    setError("");
    setState("joining");
    setLines([]);
    setPartial(null);
    setCaptionConsent(false);
    setInviteConsent(false);
    let session;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error("Audio is unavailable in this browser.");
      session = { context: new Audio() };
      ref.current = session;
      await session.context.resume();
      if (ref.current !== session) return;
      await session.context.audioWorklet.addModule(
        "/assets/media/room-audio.js",
      );
      if (ref.current !== session) return;
      session.worklet = new AudioWorkletNode(
        session.context,
        "agentbridge-call",
        { outputChannelCount: [1] },
      );
      session.speaker = session.context.createGain();
      session.worklet.connect(session.speaker);
      session.speaker.connect(session.context.destination);
      setSpeakerOn(true);
      let micReady = false;
      if (withMic) {
        try {
          await microphone(session);
          micReady = true;
        } catch (error) {
          setError(error.message);
        }
      }
      if (ref.current !== session) return;
      const { ticket, path: wsPath } = await write(path + "ticket", {});
      if (ref.current !== session) return;
      const url = new URL(wsPath, location.origin);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const socket = (session.socket = new WebSocket(url, [
        "agentbridge-room-v1",
        ticket,
      ]));
      socket.binaryType = "arraybuffer";
      session.timeout = setTimeout(() => {
        if (ref.current === session) {
          leave();
          setState("outside");
          setError("The call room did not answer. You can rejoin.");
        }
      }, 15000);
      session.worklet.port.onmessage = ({ data }) => {
        if (
          socket.readyState === WebSocket.OPEN &&
          socket.bufferedAmount < 8000
        )
          socket.send(data);
      };
      socket.onmessage = ({ data }) => {
        if (ref.current !== session) return;
        if (data instanceof ArrayBuffer) {
          session.worklet.port.postMessage(data, [data]);
          return;
        }
        const msg = JSON.parse(data);
        if (msg.type === "joined") {
          clearTimeout(session.timeout);
          setSelf(msg.self);
          setRoom(msg.room);
          setLines(msg.lines);
          setState("joined");
          if (micReady) sendMute(msg.self, false);
        }
        if (msg.type === "room") setRoom(msg.room);
        if (msg.type === "notice") setError(msg.message);
        if (msg.type === "caption") {
          if (msg.line.final) {
            setLines((old) => [...old.slice(-59), msg.line]);
            setPartial(null);
          } else setPartial(msg.line);
        }
        if (msg.type === "ended") {
          leave();
          setState("ended");
        }
      };
      socket.onclose = () => {
        if (ref.current !== session) return;
        leave();
        setState("outside");
        setError(
          "Audio disconnected. You can rejoin while the call is active.",
        );
      };
      socket.onerror = () => {
        if (ref.current === session) setError("The audio connection failed.");
      };
    } catch (e) {
      if (session && ref.current !== session) return;
      leave();
      setState("outside");
      setError(e.message || "Could not join this call.");
    }
  }
  async function act(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const me = room?.participants.find((p) => p.id === self);
  return (
    <section
      className="live-room"
      data-room-state={state}
      aria-label="Call room"
    >
      <div className="room-heading">
        <h3>Call room</h3>
        {state === "joined" && (
          <span>{room.participants.length} participants</span>
        )}
      </div>
      {state === "ended" ? (
        <p>The call has ended.</p>
      ) : state !== "joined" ? (
        <>
          <p className="provider-muted">
            Join to listen. Turn on your microphone whenever you want to speak.
          </p>
          <label className="provider-consent">
            <input
              type="checkbox"
              checked={withMic}
              onChange={(e) => setWithMic(e.target.checked)}
              disabled={state === "joining"}
            />{" "}
            Join with microphone on
          </label>
          <div className="provider-actions">
            <Btn
              label={state === "joining" ? "Joining…" : "Join call"}
              icon="calls"
              primary
              disabled={state === "joining"}
              onClick={join}
            />
            {state === "joining" && (
              <Btn
                label="Cancel"
                onClick={() => {
                  leave();
                  setState("outside");
                }}
              />
            )}
          </div>
        </>
      ) : (
        <>
          <div
            className="room-people"
            role="group"
            aria-label="Call participants"
          >
            {room.participants.map((p) => (
              <div className="room-person" key={p.id}>
                <Icon
                  name={p.role === "studio" ? "headphones" : "calls"}
                  size={22}
                />
                <strong>{p.id === self ? "You" : p.label}</strong>
                <span>
                  {p.status === "connected"
                    ? p.muted
                      ? "Muted"
                      : "Connected"
                    : p.status}
                </span>
                {p.id !== self && p.status === "connected" && (
                  <button
                    className="room-toggle"
                    aria-pressed={p.muted}
                    onClick={() => sendMute(p.id, !p.muted)}
                  >
                    {p.muted ? "Unmute" : "Mute"} {p.label}
                  </button>
                )}
              </div>
            ))}
          </div>
          <div
            className="personal-call-controls"
            role="group"
            aria-label="Your call controls"
          >
            <button
              className="room-toggle"
              aria-label={
                me?.muted ? "Turn microphone on" : "Mute my microphone"
              }
              aria-pressed={!me?.muted}
              disabled={busy}
              onClick={() =>
                act(async () => {
                  const session = ref.current;
                  if (!session) return;
                  if (me?.muted) {
                    await microphone(session);
                    if (ref.current === session) sendMute(self, false);
                  } else {
                    stopMic(session);
                    sendMute(self, true);
                  }
                })
              }
            >
              <Icon name={me?.muted ? "muted" : "mute"} size={17} />
              {me?.muted ? "Mic off" : "Mic on"}
            </button>
            <button
              className="room-toggle"
              aria-label={speakerOn ? "Mute speaker" : "Turn speaker on"}
              aria-pressed={speakerOn}
              onClick={() => {
                const session = ref.current;
                if (!session?.speaker) return;
                session.speaker.gain.value = speakerOn ? 0 : 1;
                setSpeakerOn(!speakerOn);
              }}
            >
              <Icon name="headphones" size={17} />
              {speakerOn ? "Speaker on" : "Speaker off"}
            </button>
            <Btn
              label="Leave room"
              end={null}
              onClick={() => {
                leave();
                setState("outside");
                setWithMic(false);
              }}
            />
          </div>
          <h4>
            Live captions{" "}
            <span className="caption-state" data-on={room.captions === "on"}>
              {room.captions === "on"
                ? "On"
                : room.captions === "starting"
                  ? "Starting…"
                  : "Off"}
            </span>
          </h4>
          {room.captions === "off" && (
            <label className="provider-consent">
              <input
                type="checkbox"
                checked={captionConsent}
                onChange={(e) => setCaptionConsent(e.target.checked)}
              />{" "}
              Everyone agreed to send this call’s audio to xAI. My xAI project
              pays for transcription.
            </label>
          )}
          <button
            className="room-toggle"
            aria-pressed={room.captions === "on"}
            disabled={busy || (room.captions === "off" && !captionConsent)}
            onClick={() =>
              act(async () => {
                const enabled = room.captions === "off";
                await write(path + "captions", {
                  enabled,
                  consent: enabled && captionConsent,
                  confirm_charges: enabled && captionConsent,
                });
                if (!enabled) {
                  setCaptionConsent(false);
                  setPartial(null);
                }
              })
            }
          >
            {room.captions === "off"
              ? "Start live captions"
              : room.captions === "starting"
                ? "Cancel captions"
                : "Stop live captions"}
          </button>
          {lines.length > 0 || partial ? (
            <div className="room-captions" role="log">
              {lines.map((l, i) => (
                <p key={i}>
                  <time>
                    {new Date(l.time).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>{" "}
                  {l.speaker && <strong>Speaker {l.speaker} </strong>}
                  {l.text}
                </p>
              ))}
              {partial && <p className="room-partial">{partial.text}</p>}
            </div>
          ) : (
            room.captions === "on" && <p>Listening for speech…</p>
          )}
          {connections.length > 0 && (
            <details>
              <summary>Add someone to this call</summary>
              <label>
                Saved destination
                <select
                  value={contact}
                  onChange={(e) => {
                    setContact(e.target.value);
                    setInviteConsent(false);
                    inviteKey.current = null;
                  }}
                >
                  <option value="">Choose a contact</option>
                  {connections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label} · {c.destination}
                    </option>
                  ))}
                </select>
              </label>
              <label className="provider-consent">
                <input
                  type="checkbox"
                  checked={inviteConsent}
                  onChange={(e) => setInviteConsent(e.target.checked)}
                />{" "}
                Dial this contact and charge my SignalWire project.
              </label>
              <Btn
                label="Call contact"
                disabled={busy || !contact || !inviteConsent}
                onClick={() =>
                  act(async () => {
                    inviteKey.current ||= crypto.randomUUID();
                    await write(path + "invite", {
                      connection_id: contact,
                      request_id: inviteKey.current,
                      confirm_charges: true,
                    });
                    setContact("");
                    setInviteConsent(false);
                    inviteKey.current = null;
                  })
                }
              />
            </details>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="provider-error">
          {error}
        </p>
      )}
    </section>
  );
}
