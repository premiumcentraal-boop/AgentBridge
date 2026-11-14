import { deny } from "./model.mjs";
import {
  contactContext,
  saveContactNotes,
  recoverSampleTranscript,
} from "../../shared/conversations.mjs";

const fields = (input, allowed) => {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !allowed.includes(key))
  )
    deny(422, "INVALID_FIELDS", "The request contains unsupported fields.");
};
const text = (value, max) =>
  typeof value === "string" &&
  value.length <= max &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const findCall = (document, id) =>
  [
    document.demo_call?.active ? document.demo_call : null,
    ...(document.call_history || []),
    ...(document.calls || []),
  ].find((call) => call?.id === id);
const mustCall = (document, id) => {
  const call = findCall(document, id);
  if (!call) deny(404, "CALL_NOT_FOUND", "Call not found.");
  return call;
};
export async function conversationRequest({
  path,
  method,
  readBody,
  read,
  update,
  sandbox,
}) {
  const contactMatch = path.match(
    /^contacts\/([A-Za-z0-9_-]{1,100})\/(context|memory)$/,
  );
  if (contactMatch) {
    const resolve = (document) => {
      const contact = (document.connections || []).find(
        (item) => item.id === contactMatch[1],
      );
      if (!contact) deny(404, "CONTACT_NOT_FOUND", "Contact not found.");
      return contact;
    };
    if (method === "GET" && contactMatch[2] === "context") {
      const doc = await read();
      return {
        status: 200,
        body: { context: contactContext(doc, resolve(doc)) },
      };
    }
    if (method === "PATCH" && contactMatch[2] === "memory") {
      const input = await readBody();
      fields(input, ["notes"]);
      if (!text(input.notes, 2000))
        deny(
          422,
          "INVALID_NOTES",
          "Keep contact notes within 2,000 characters.",
        );
      return {
        status: 200,
        body: await update((doc) => {
          const contact = resolve(doc);
          if (
            input.notes.trim() &&
            (doc.contact_memories || []).length >= 200 &&
            !(doc.contact_memories || []).some(
              (item) => item.destination === contact.destination,
            )
          )
            deny(
              409,
              "CONTACT_LIMIT",
              "The contact memory limit has been reached.",
            );
          saveContactNotes(doc, contact.destination, input.notes.trim());
          return { context: contactContext(doc, contact) };
        }),
      };
    }
    deny(405, "METHOD_NOT_ALLOWED", "Method not allowed.");
  }
  const callMatch = path.match(
    /^calls\/([A-Za-z0-9_-]{1,100})\/(notes|sample-transcript|capture)(?:\/([A-Za-z0-9_-]{1,100}))?$/,
  );
  if (!callMatch) return null;
  if (callMatch[2] === "notes" && method === "POST" && !callMatch[3]) {
    const input = await readBody();
    fields(input, ["text", "at_seconds"]);
    if (
      !text(input.text, 1000) ||
      !input.text.trim() ||
      (input.at_seconds != null &&
        (!Number.isInteger(input.at_seconds) ||
          input.at_seconds < 0 ||
          input.at_seconds > 86400))
    )
      deny(
        422,
        "INVALID_NOTE",
        "Enter a note of up to 1,000 characters and a valid timestamp.",
      );
    return {
      status: 201,
      body: await update((doc) => {
        const call = mustCall(doc, callMatch[1]);
        if ((call.notes || []).length >= 20)
          deny(409, "NOTE_LIMIT", "This call can hold 20 notes.");
        const note = {
          id: crypto.randomUUID(),
          text: input.text.trim(),
          at_seconds: input.at_seconds ?? null,
          created_at: new Date().toISOString(),
        };
        call.notes = [...(call.notes || []), note];
        return { note };
      }),
    };
  }
  if (callMatch[2] === "notes" && method === "DELETE" && callMatch[3]) {
    fields(await readBody(), []);
    return {
      status: 200,
      body: await update((doc) => {
        const call = mustCall(doc, callMatch[1]);
        if (!(call.notes || []).some((note) => note.id === callMatch[3]))
          deny(404, "NOTE_NOT_FOUND", "Note not found.");
        call.notes = call.notes.filter((note) => note.id !== callMatch[3]);
        return { deleted: true };
      }),
    };
  }
  if (sandbox && callMatch[2] === "sample-transcript" && method === "POST") {
    fields(await readBody(), []);
    return {
      status: 200,
      body: await update((doc) => {
        const call = mustCall(doc, callMatch[1]);
        if (!recoverSampleTranscript(call))
          deny(
            409,
            "RECORDING_REQUIRED",
            "There is no saved recording to transcribe.",
          );
        return { call };
      }),
    };
  }
  if (sandbox && callMatch[2] === "capture" && method === "DELETE") {
    const input = await readBody();
    fields(input, ["kind"]);
    if (!["recording", "transcript"].includes(input.kind))
      deny(422, "INVALID_CAPTURE", "Choose a recording or transcript.");
    return {
      status: 200,
      body: await update((doc) => {
        const call = mustCall(doc, callMatch[1]);
        if (input.kind === "recording") {
          call.has_recording = false;
          call.recording_seconds = 0;
        } else {
          call.has_transcript = false;
          call.transcript = [];
        }
        return { call };
      }),
    };
  }
  deny(405, "METHOD_NOT_ALLOWED", "Method not allowed.");
}
