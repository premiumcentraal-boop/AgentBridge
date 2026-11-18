import WebSocket from "ws";
import { openCredential } from "../accounts/credential-vault.mjs";
import { authLimit } from "../accounts/auth-primitives.mjs";
import { deny } from "../accounts/model.mjs";

const sttURL =
  "wss://api.x.ai/v1/stt?model=grok-voice-transcribe-2.0&encoding=mulaw&sample_rate=8000&interim_results=true&diarize=true";
export async function captionKey(database, accountId, vaultKey) {
  const row = await database.first(
    "SELECT encrypted_secret FROM ab_transcription_credentials WHERE account_id=?",
    [accountId],
  );
  if (!row)
    deny(
      409,
      "CAPTION_KEY_REQUIRED",
      "Add your xAI key in Calling setup to turn on live captions.",
    );
  await authLimit(database, "live-captions:" + accountId, {
    maximum: 20,
    window: 3600000,
  });
  return (
    await openCredential(
      row.encrypted_secret,
      vaultKey,
      accountId,
      "transcription",
    )
  ).api_key;
}
export function openCaptions(
  key,
  events,
  connect = (url, opts) => new WebSocket(url, opts),
) {
  const socket = connect(sttURL, {
    headers: { Authorization: "Bearer " + key },
    handshakeTimeout: 10000,
    maxPayload: 65536,
    perMessageDeflate: false,
    followRedirects: false,
  });
  let ready = false,
    closed = false;
  function finish(message) {
    if (closed) return;
    closed = true;
    socket.terminate();
    events.closed(message);
  }
  const timer = setTimeout(
    () => finish("The caption service did not start."),
    12000,
  );
  timer.unref?.();
  socket.on("message", (bytes, binary) => {
    if (binary || closed) return;
    let event;
    try {
      event = JSON.parse(bytes.toString());
    } catch {
      return finish("The caption service returned unreadable text.");
    }
    if (event.type === "transcript.created") {
      clearTimeout(timer);
      ready = true;
      events.ready();
    }
    if (
      event.type === "transcript.partial" &&
      typeof event.text === "string" &&
      event.text.trim()
    ) {
      const speakers = new Set(
        (Array.isArray(event.words) ? event.words : []).map((w) => w?.speaker),
      );
      const [speaker] = speakers;
      events.text(
        event.text.slice(0, 1600),
        event.is_final === true,
        speakers.size === 1 && Number.isInteger(speaker) && speaker >= 0
          ? speaker + 1
          : null,
      );
    }
    if (event.type === "error")
      finish("Live captions stopped. Check your xAI project and credits.");
  });
  socket.on("error", () =>
    finish("Could not connect to xAI for live captions."),
  );
  socket.on("close", () => {
    clearTimeout(timer);
    finish("Live captions ended.");
  });
  return {
    write(bytes) {
      if (!ready || closed || socket.readyState !== WebSocket.OPEN) return;
      if (socket.bufferedAmount > 32000)
        return finish(
          "Live captions stopped because the connection fell behind.",
        );
      socket.send(bytes, { binary: true });
    },
    stop() {
      clearTimeout(timer);
      finish("");
    },
  };
}
