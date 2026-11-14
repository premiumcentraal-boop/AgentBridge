import React, { useEffect, useId, useState } from "react";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Btn, Icon, Pill } from "./ui.jsx";
import {
  contactContext,
  contactNotes,
  contextText,
  conversationDuration,
} from "../../shared/conversations.mjs";
import "./conversations.css";

export const conversationClock = (seconds) =>
  `${Math.floor((seconds || 0) / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor((seconds || 0) % 60)
    .toString()
    .padStart(2, "0")}`;
const when = (value) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Date unavailable";

export function CallCaptureControls({ call, onToggle, compact = false }) {
  return (
    <div
      className={"call-capture-controls" + (compact ? " is-compact" : "")}
      aria-label="Call capture controls"
    >
      <button
        type="button"
        className={"capture-action" + (call.recording ? " is-recording" : "")}
        aria-pressed={Boolean(call.recording)}
        data-control-state={
          call.recording
            ? call.recordingPaused
              ? "paused"
              : "recording"
            : "off"
        }
        aria-label={call.recording ? "Stop recording" : "Start recording"}
        disabled={!call.active || !onToggle}
        onClick={() => onToggle("recording")}
      >
        <Icon name="record" size={17} />
        <span>
          {call.recording
            ? call.recordingPaused
              ? "Recording paused"
              : "Recording · Stop"
            : "Record call"}
        </span>
        <i aria-hidden="true" />
      </button>
      <button
        type="button"
        className={
          "capture-action" + (call.transcription ? " is-transcribing" : "")
        }
        aria-pressed={Boolean(call.transcription)}
        data-control-state={call.transcription ? "enabled" : "off"}
        aria-label={
          call.transcription ? "Stop transcription" : "Start transcription"
        }
        disabled={!call.active || !onToggle}
        onClick={() => onToggle("transcription")}
      >
        <Icon name="transcript" size={17} />
        <span>
          {call.transcription ? "Saving transcript" : "Save transcript"}
        </span>
        <i aria-hidden="true" />
      </button>
    </div>
  );
}

export function ContactMemoryDialog({ contact, snapshot, onSave, onClose }) {
  const id = useId();
  const [notes, setNotes] = useState(""),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [showContext, setShowContext] = useState(false),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    setNotes(contact ? contactNotes(snapshot, contact.destination) : "");
    setError("");
    setShowContext(false);
    setCopied(false);
  }, [contact?.id]);
  const context = contact
    ? contactContext(
        {
          ...snapshot,
          contact_memories: [{ destination: contact.destination, notes }],
        },
        contact,
      )
    : null;
  const copy = async () => {
    setShowContext(true);
    try {
      await navigator.clipboard.writeText(contextText(context));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Dialog
      isOpen={Boolean(contact)}
      onOpenChange={(open) => !open && onClose()}
      width={620}
      maxHeight="calc(100dvh - 32px)"
      className="tools-dialog contact-memory-dialog"
      aria-label="Contact memory"
    >
      <DialogHeader
        className="tools-dialog-heading"
        title={contact?.label || "Contact memory"}
        onOpenChange={onClose}
      />
      {contact && (
        <form
          className="tools-dialog-body"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            setError("");
            try {
              await onSave(contact, notes);
              onClose();
            } catch (failure) {
              setError(failure.message);
            } finally {
              setSaving(false);
            }
          }}
        >
          <div className="contact-memory-identity">
            <Icon name="connection" />
            <div>
              <strong>Remember this contact</strong>
              <span>{contact.destination}</span>
            </div>
          </div>
          <label htmlFor={id + "notes"}>
            Notes for the next conversation
            <textarea
              id={id + "notes"}
              maxLength={2000}
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Names, preferences, promises to follow up…"
            />
          </label>
          <p className="conversation-help">
            Saved with this contact. Copy the context into your agent before its
            next call.
          </p>
          <div className="contact-previous-calls">
            <h3>Previous conversations</h3>
            {context.previous_calls.length ? (
              context.previous_calls.map((call) => (
                <article key={call.id}>
                  <div>
                    <time>{when(call.started_at)}</time>
                    <span>{conversationClock(call.duration)}</span>
                  </div>
                  {call.notes.map((note) => (
                    <p key={note.id}>{note.text}</p>
                  ))}
                  {call.transcript_excerpt.map((line, index) => (
                    <p className="contact-quoted-line" key={index}>
                      <strong>{line.speaker}:</strong> {line.text}
                    </p>
                  ))}
                  {!call.notes.length && !call.transcript_excerpt.length && (
                    <small>
                      Call details saved. No conversation content was captured.
                    </small>
                  )}
                </article>
              ))
            ) : (
              <p className="conversation-help">
                Past calls and saved notes will appear here.
              </p>
            )}
          </div>
          <Btn
            label={copied ? "Context copied" : "Copy call context"}
            icon="copy"
            end={null}
            type="button"
            onClick={copy}
          />
          {showContext && (
            <label htmlFor={id + "context"}>
              Context for your agent
              <textarea
                id={id + "context"}
                rows={6}
                readOnly
                value={contextText(context)}
                onFocus={(event) => event.target.select()}
              />
            </label>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="tools-dialog-actions">
            <Btn label="Cancel" end={null} onClick={onClose} />
            <Btn
              label={saving ? "Saving…" : "Save contact memory"}
              primary
              type="submit"
              disabled={saving}
            />
          </div>
        </form>
      )}
    </Dialog>
  );
}

export function CallNotes({ call, onAdd, onDelete }) {
  const id = useId(),
    [value, setValue] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setValue("");
    setError("");
  }, [call?.id]);
  if (!call?.id) return null;
  return (
    <section
      className="conversation-notes"
      aria-label="Call notes and highlights"
    >
      <div className="tools-list-heading">
        <h3>Notes & highlights</h3>
        <Icon name="bookmark" size={18} />
      </div>
      {(call.notes || []).map((note) => (
        <article key={note.id}>
          <div>
            {note.at_seconds != null && (
              <time>{conversationClock(note.at_seconds)}</time>
            )}
            <p>{note.text}</p>
          </div>
          {onDelete && (
            <button
              type="button"
              aria-label={"Delete note: " + note.text}
              className="conversation-note-delete"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onDelete(call.id, note.id);
                } catch (failure) {
                  setError(failure.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Icon name="close" size={15} />
            </button>
          )}
        </article>
      ))}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (!value.trim()) return;
          setBusy(true);
          setError("");
          try {
            await onAdd(call.id, {
              text: value.trim(),
              at_seconds: call.active
                ? Math.min(
                    86400,
                    Math.max(0, Math.floor(call.elapsed ?? call.duration ?? 0)),
                  )
                : null,
            });
            setValue("");
          } catch (failure) {
            setError(failure.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor={id}>
          Add a note
          <input
            id={id}
            maxLength={1000}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={
              call.active
                ? "Mark an important moment…"
                : "What should your agent remember?"
            }
            required
          />
        </label>
        <Btn
          type="submit"
          label={
            busy ? "Saving…" : call.active ? "Save highlight" : "Save note"
          }
          icon="plus"
          end={null}
          disabled={busy || !value.trim() || !onAdd}
        />
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function CallHistoryList({
  records = [],
  onOpen,
  initialFilter = "all",
}) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState(initialFilter);
  useEffect(() => setFilter(initialFilter), [initialFilter]);
  const filtered = records.filter((call) => {
    if (filter === "recording" && call.has_recording !== true) return false;
    if (filter === "transcript" && call.has_transcript !== true) return false;
    if (filter === "notes" && !(call.notes || []).length) return false;
    return `${call.label || ""} ${call.destination || call.to || ""} ${(call.notes || []).map((note) => note.text).join(" ")}`
      .toLowerCase()
      .includes(query.trim().toLowerCase());
  });
  return (
    <section className="conversation-history" aria-label="Recent calls">
      <div className="conversation-history-heading">
        <h2>
          Recent calls <small>{records.length}</small>
        </h2>
        <label className="number-search">
          <Icon name="search" size={18} />
          <input
            type="search"
            aria-label="Search recent calls"
            placeholder="Search contacts, numbers or notes"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <div
        className="conversation-filters"
        role="group"
        aria-label="Filter recent calls"
      >
        {[
          ["all", "All calls"],
          ["recording", "Recordings"],
          ["transcript", "Transcripts"],
          ["notes", "With notes"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="conversation-history-list">
        {filtered.map((call) => (
          <button
            key={call.id}
            type="button"
            className="conversation-history-row"
            aria-label={
              "Open recent call with " +
              (call.label || call.destination || call.to)
            }
            onClick={() => onOpen(call)}
          >
            <span className="conversation-history-icon">
              <Icon name="calls" size={22} />
            </span>
            <span className="conversation-history-contact">
              <strong>{call.label || call.destination || call.to}</strong>
              <small>
                {call.destination || call.to} ·{" "}
                {when(call.started_at || call.ended_at)}
              </small>
              <span className="conversation-media-badges">
                <span>
                  <Icon name="record" size={13} />
                  {call.has_recording === true
                    ? "Recording"
                    : call.has_recording === false
                      ? "No recording"
                      : "Check recording"}
                </span>
                <span>
                  <Icon name="transcript" size={13} />
                  {call.has_transcript === true
                    ? "Transcript"
                    : call.has_transcript === false
                      ? "No transcript"
                      : "Check transcript"}
                </span>
                {call.notes?.length > 0 && (
                  <span>
                    {call.notes.length}{" "}
                    {call.notes.length === 1 ? "note" : "notes"}
                  </span>
                )}
              </span>
            </span>
            <span className="conversation-history-duration">
              <time>{conversationClock(conversationDuration(call))}</time>
              <small>{(call.status || "completed").replaceAll("-", " ")}</small>
            </span>
            <Icon name="arrow" size={17} />
          </button>
        ))}
      </div>
      {!filtered.length && (
        <div className="number-empty">
          <Icon name="calls" size={26} />
          <h3>
            {query || filter !== "all"
              ? "No matching calls"
              : "No recent calls yet"}
          </h3>
          <p>
            {query || filter !== "all"
              ? "Try another search or filter."
              : "Calls appear here even when recording and transcription are off."}
          </p>
        </div>
      )}
    </section>
  );
}
