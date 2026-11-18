import { deny, AccountError } from "./model.mjs";
import { onlyFields, authLimit } from "./auth-primitives.mjs";
import {
  sealCredential,
  openCredential,
  vaultAvailable,
} from "./credential-vault.mjs";
import { connectedProvider, providerLease } from "./provider-control.mjs";
import { readLive, stamp } from "./live-store.mjs";
import { ownRecording } from "./live-calls.mjs";
import { UUID, boundedProviderBytes } from "./signalwire-client.mjs";

export async function savedTranscripts(database, accountId, callId) {
  const row = await database.first(
    "SELECT json_group_array(json(document)) AS items FROM (SELECT document FROM ab_transcription_jobs WHERE account_id=? AND status='succeeded' AND (? IS NULL OR call_id=?) ORDER BY created_at DESC LIMIT 200)",
    [accountId, callId || null, callId || null],
  );
  return JSON.parse(row?.items || "[]");
}
export async function transcriptionRequest({
  database,
  account,
  path,
  method,
  readBody,
  vaultKey,
  fetcher = fetch,
  media,
}) {
  if (!path.startsWith("transcription/")) return null;
  const reply = (status, body) => ({ status, body });
  if (path === "transcription/settings") {
    if (method === "GET") {
      const row = await database.first(
        "SELECT updated_at FROM ab_transcription_credentials WHERE account_id=?",
        [account.id],
      );
      const pending = await database.first(
        "SELECT json_group_array(json_object('id',id,'recording_id',recording_id,'status',status,'updated_at',updated_at)) AS items FROM (SELECT * FROM ab_transcription_jobs WHERE account_id=? AND status IN ('pending','unknown') ORDER BY created_at DESC LIMIT 20)",
        [account.id],
      );
      return reply(200, {
        configured: Boolean(row),
        vault_ready: vaultAvailable(vaultKey),
        provider: "xai",
        model: "grok-voice-transcribe-2.0",
        updated_at: row?.updated_at || null,
        live_transcription: Boolean(media),
        unresolved_jobs: JSON.parse(pending?.items || "[]"),
      });
    }
    if (method === "PUT") {
      const input = await readBody();
      onlyFields(input, ["api_key"]);
      if (
        typeof input.api_key !== "string" ||
        input.api_key.length < 16 ||
        input.api_key.length > 512 ||
        /[^\x21-\x7e]/.test(input.api_key)
      )
        deny(422, "INVALID_KEY", "Enter your xAI API key.");
      const encrypted = await sealCredential(
        { api_key: input.api_key },
        vaultKey,
        account.id,
        "transcription",
      );
      await database.run(
        "INSERT INTO ab_transcription_credentials(account_id,encrypted_secret,updated_at) VALUES(?,?,?) ON CONFLICT(account_id) DO UPDATE SET encrypted_secret=excluded.encrypted_secret,updated_at=excluded.updated_at",
        [account.id, encrypted, stamp()],
      );
      return reply(200, {
        configured: true,
        verified: false,
        message:
          "Key saved securely. Its transcription access is checked when you transcribe a recording.",
      });
    }
    if (method === "DELETE") {
      onlyFields(await readBody(), []);
      media?.stopCaptions(account.id);
      await database.run(
        "DELETE FROM ab_transcription_credentials WHERE account_id=?",
        [account.id],
      );
      return reply(200, { configured: false });
    }
  }
  const match = path.match(/^transcription\/recordings\/([a-f0-9-]{36})$/);
  if (match && method === "POST") {
    const input = await readBody();
    onlyFields(input, [
      "request_id",
      "consent_to_process",
      "confirm_charges",
      "language",
    ]);
    if (!UUID.test(input.request_id || ""))
      deny(422, "INVALID_REQUEST_ID", "A request identifier is required.");
    if (input.consent_to_process !== true || input.confirm_charges !== true)
      deny(
        422,
        "TRANSCRIPTION_CONSENT_REQUIRED",
        "Confirm permission to send this recording to xAI and charge your xAI account.",
      );
    if (
      input.language !== undefined &&
      !/^[a-z]{2,3}(?:-[a-zA-Z]{2,4})?$/.test(input.language)
    )
      deny(
        422,
        "INVALID_LANGUAGE",
        "Use a language code or automatic detection.",
      );
    await authLimit(database, "transcribe:" + account.id, {
      maximum: 20,
      window: 60 * 60_000,
    });
    const credential = await database.first(
      "SELECT encrypted_secret FROM ab_transcription_credentials WHERE account_id=?",
      [account.id],
    );
    if (!credential)
      deny(
        409,
        "TRANSCRIPTION_KEY_REQUIRED",
        "Add your xAI key in Calling setup first.",
      );
    const secret = await openCredential(
      credential.encrypted_secret,
      vaultKey,
      account.id,
      "transcription",
    );
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
        "Enable live testing before transcribing a provider recording.",
      );
    return providerLease(database, account.id, async () => {
      const previous = await database.first(
        "SELECT * FROM ab_transcription_jobs WHERE account_id=? AND request_key=?",
        [account.id, input.request_id],
      );
      if (previous) {
        if (previous.recording_id !== match[1])
          deny(
            409,
            "REQUEST_CONFLICT",
            "This request belongs to another recording.",
          );
        if (previous.status === "succeeded")
          return reply(200, {
            transcript: JSON.parse(previous.document),
            reused: true,
          });
        deny(
          409,
          "TRANSCRIPTION_REVIEW_REQUIRED",
          "The previous attempt did not finish. It has not been sent again. Review your xAI usage before starting a new attempt.",
        );
      }
      const existing = await database.first(
        "SELECT * FROM ab_transcription_jobs WHERE account_id=? AND recording_id=? AND status IN ('pending','succeeded','unknown') ORDER BY created_at DESC LIMIT 1",
        [account.id, match[1]],
      );
      if (existing?.status === "succeeded")
        return reply(200, {
          transcript: JSON.parse(existing.document),
          reused: true,
        });
      if (existing)
        deny(
          409,
          "TRANSCRIPTION_REVIEW_REQUIRED",
          "A transcription for this recording is pending or uncertain. Review it before retrying.",
        );
      const recording = await ownRecording(
        client,
        await readLive(database, account.id),
        match[1],
      );
      if (recording.status !== "completed")
        deny(
          409,
          "RECORDING_NOT_READY",
          "Stop recording and wait for the completed audio before transcribing.",
        );
      if (
        !Number.isFinite(Number(recording.duration)) ||
        Number(recording.duration) > 1800
      )
        deny(
          422,
          "RECORDING_TOO_LONG",
          "Choose a completed recording of 30 minutes or less.",
        );
      const bytes = await client.audio(match[1]);
      if (!bytes.length || bytes.length > 16_000_000)
        deny(422, "RECORDING_SIZE", "Choose a recording smaller than 16 MB.");
      const id = crypto.randomUUID(),
        time = stamp();
      await database.run(
        "INSERT INTO ab_transcription_jobs(id,account_id,request_key,recording_id,call_id,status,created_at,updated_at) VALUES(?,?,?,?,?,'pending',?,?)",
        [
          id,
          account.id,
          input.request_id,
          match[1],
          recording.call_sid,
          time,
          time,
        ],
      );
      let dispatched = false;
      try {
        const form = new FormData();
        form.set("model", "grok-voice-transcribe-2.0");
        form.set("diarize", "true");
        if (input.language) form.set("language", input.language);
        form.set("file", new Blob([bytes], { type: "audio/mpeg" }), "call.mp3");
        dispatched = true;
        const response = await fetcher("https://api.x.ai/v1/stt", {
          method: "POST",
          headers: { Authorization: "Bearer " + secret.api_key },
          body: form,
          redirect: "error",
          signal: AbortSignal.timeout(80_000),
        });
        if (!response.ok) {
          await response.body?.cancel();
          if (response.status < 500) dispatched = false;
          deny(
            502,
            "TRANSCRIPTION_PROVIDER_ERROR",
            "xAI could not transcribe this recording. Check your key, credits and provider status.",
          );
        }
        const payload = JSON.parse(
          new TextDecoder().decode(
            await boundedProviderBytes(response, 1_500_000),
          ),
        );
        if (typeof payload.text !== "string" || payload.text.length > 100_000)
          deny(
            502,
            "INVALID_TRANSCRIPT",
            "The transcription response was invalid or too large.",
          );
        const transcript = {
          id,
          call_id: recording.call_sid,
          recording_id: match[1],
          status: "completed",
          text: payload.text,
          language:
            typeof payload.language === "string"
              ? payload.language.slice(0, 20)
              : null,
          duration: Number(payload.duration) || 0,
          source: "xai",
          model: "grok-voice-transcribe-2.0",
          created_at: time,
          words: (Array.isArray(payload.words) ? payload.words : [])
            .slice(0, 10000)
            .filter(
              (w) =>
                typeof w.text === "string" &&
                Number.isFinite(w.start) &&
                Number.isFinite(w.end),
            )
            .map((w) => ({
              text: w.text.slice(0, 200),
              start: w.start,
              end: w.end,
              ...(Number.isInteger(w.speaker) ? { speaker: w.speaker } : {}),
            })),
        };
        await database.run(
          "UPDATE ab_transcription_jobs SET document=?,status='succeeded',updated_at=? WHERE id=? AND account_id=?",
          [JSON.stringify(transcript), stamp(), id, account.id],
        );
        return reply(201, { transcript });
      } catch (error) {
        await database.run(
          "UPDATE ab_transcription_jobs SET status=?,updated_at=? WHERE id=? AND account_id=?",
          [dispatched ? "unknown" : "failed", stamp(), id, account.id],
        );
        if (error instanceof AccountError) throw error;
        deny(
          502,
          "TRANSCRIPTION_UNCERTAIN",
          "The transcription result is uncertain. Review your xAI usage before retrying.",
        );
      }
    });
  }
  const call = path.match(/^transcription\/calls\/([a-f0-9-]{36})$/);
  if (call && method === "GET")
    return reply(200, {
      transcripts: await savedTranscripts(database, account.id, call[1]),
    });
  const job = path.match(/^transcription\/jobs\/([a-f0-9-]{36})$/);
  if (job && method === "GET") {
    const row = await database.first(
      "SELECT id,recording_id,call_id,status,created_at,updated_at FROM ab_transcription_jobs WHERE id=? AND account_id=?",
      [job[1], account.id],
    );
    if (!row) deny(404, "TRANSCRIPT_NOT_FOUND", "Transcription job not found.");
    return reply(200, { job: row });
  }
  if (job && method === "PATCH") {
    const input = await readBody();
    onlyFields(input, ["reviewed_provider_usage"]);
    if (input.reviewed_provider_usage !== true)
      deny(
        422,
        "REVIEW_REQUIRED",
        "Review your xAI usage before allowing a new paid attempt.",
      );
    return providerLease(database, account.id, async () => {
      const result = await database.run(
        "UPDATE ab_transcription_jobs SET status='failed',updated_at=? WHERE id=? AND account_id=? AND (status='unknown' OR (status='pending' AND updated_at<?))",
        [
          stamp(),
          job[1],
          account.id,
          new Date(Date.now() - 2 * 60_000).toISOString(),
        ],
      );
      if (!result.changes)
        deny(
          409,
          "JOB_NOT_REVIEWABLE",
          "The transcription is still running or has already been resolved.",
        );
      return reply(200, {
        reviewed: true,
        message:
          "The earlier result remains unavailable. A new explicit transcription can be requested; any prior provider charge is unchanged.",
      });
    });
  }
  if (job && method === "DELETE") {
    onlyFields(await readBody(), []);
    const result = await database.run(
      "DELETE FROM ab_transcription_jobs WHERE id=? AND account_id=? AND status IN ('succeeded','failed')",
      [job[1], account.id],
    );
    if (!result.changes)
      deny(404, "TRANSCRIPT_NOT_FOUND", "Completed transcript not found.");
    return reply(200, { deleted: true });
  }
  deny(404, "NOT_FOUND", "Transcription endpoint not found.");
}
