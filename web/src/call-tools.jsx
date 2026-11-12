import React, { useEffect, useId, useRef, useState } from "react";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { A } from "./context.jsx";
import { Btn, Card, Icon, IconBtn, Pill, Wave } from "./ui.jsx";
import { BotFace } from "./grok-ui.jsx";
import { FocusCall, TranscriptPeek } from "./connection-hub.jsx";
import { ActiveCallCard } from "./studio-navigation.jsx";
import {
  CALL_COUNTRIES,
  CALL_LANGUAGES,
  DEFAULT_CAPTURE,
  validateCallPlan,
  validateCapture,
  validPhone,
} from "../../shared/call-plans.mjs";
import sampleAudio from "./samples/sample-call.mp3";
import sample from "./samples/sample-call.json";
import "./call-tools.css";
export const SAMPLE_CALL = sample;
const clock = (seconds) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
const countryName = (code) =>
  CALL_COUNTRIES.find((c) => c.code === code)?.name || code;
function Head({ eyebrow, title, description, children }) {
  return (
    <div className="tools-page-head">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
function Toggle({ label, description, checked, onChange, id }) {
  return (
    <label className="capture-toggle" htmlFor={id}>
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
export function CaptureOptions({ value, onChange, compact = false }) {
  const id = useId();
  const set = (field, v) => onChange({ ...value, [field]: v });
  return (
    <div className="capture-options">
      <Toggle
        id={id + "-record"}
        label="Record the call"
        description="Keep an audio recording when permission is confirmed."
        checked={value.recording}
        onChange={(v) => set("recording", v)}
      />
      <Toggle
        id={id + "-text"}
        label="Create a transcript"
        description="Keep a searchable text version. Audio recording is optional."
        checked={value.transcription}
        onChange={(v) => set("transcription", v)}
      />
      <div className="tools-form-grid">
        <label htmlFor={id + "-language"}>
          Transcript language
          <select
            id={id + "-language"}
            value={value.language}
            onChange={(e) => set("language", e.target.value)}
          >
            {CALL_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={id + "-retention"}>
          Keep captured content
          <select
            id={id + "-retention"}
            value={value.retention_days}
            onChange={(e) => set("retention_days", Number(e.target.value))}
          >
            {[7, 30, 90].map((n) => (
              <option key={n} value={n}>
                {n} days
              </option>
            ))}
          </select>
        </label>
      </div>
      {!compact && (
        <>
          <div className="tools-divider" />
          <label htmlFor={id + "-method"}>
            When I join a call
            <select
              id={id + "-method"}
              value={value.join_method}
              onChange={(e) => set("join_method", e.target.value)}
            >
              <option value="browser">Join from my browser</option>
              <option value="phone">Call my phone</option>
            </select>
          </label>
          {value.join_method === "phone" && (
            <label htmlFor={id + "-number"}>
              My international phone number
              <input
                id={id + "-number"}
                type="tel"
                autoComplete="tel"
                placeholder="+31 6 1234 5678"
                value={value.join_number}
                maxLength={24}
                onChange={(e) => set("join_number", e.target.value)}
              />
            </label>
          )}
        </>
      )}
      <p className="tools-fine">
        <Icon name="shield" size={13} />
        Capture stays off until the required notice and permission. Saving
        preferences never starts recording.
      </p>
    </div>
  );
}
function PlanDialog({ open, onClose, onSave, preferences, isDemo }) {
  const id = useId();
  const [step, setStep] = useState(0),
    [value, setValue] = useState({
      label: "",
      country: "NL",
      destination: "+31",
      purpose: "",
      permission: "ask",
      capture: { ...DEFAULT_CAPTURE },
    }),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setStep(0);
      setError("");
      setValue({
        label: "",
        country: "NL",
        destination: "+31",
        purpose: "",
        permission: "ask",
        capture: { ...preferences },
      });
    }
  }, [open]);
  const set = (field, v) => setValue((s) => ({ ...s, [field]: v }));
  const next = () => {
    const result = validateCallPlan(value);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError("");
    setStep(1);
  };
  const save = async (event) => {
    event.preventDefault();
    const result = validateCallPlan(value);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(result.value);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      isOpen={open}
      onOpenChange={(v) => !v && onClose()}
      width={640}
      className="tools-dialog"
      aria-label="New call"
    >
      <DialogHeader
        className="tools-dialog-heading"
        title="New call"
        onOpenChange={onClose}
      />
      <form onSubmit={save} className="tools-dialog-body">
        <div className="plan-steps">
          <span className={step === 0 ? "selected" : ""}>01 · Destination</span>
          <i />
          <span className={step === 1 ? "selected" : ""}>
            02 · Your choices
          </span>
        </div>
        {step === 0 ? (
          <>
            <label htmlFor={id + "-label"}>
              Call name
              <input
                id={id + "-label"}
                value={value.label}
                onChange={(e) => set("label", e.target.value)}
                maxLength={80}
                placeholder="Amsterdam studio viewing"
                autoFocus
              />
            </label>
            <div className="tools-form-grid">
              <label htmlFor={id + "-country"}>
                Destination country
                <select
                  id={id + "-country"}
                  value={value.country}
                  onChange={(e) => {
                    const c = CALL_COUNTRIES.find(
                      (c) => c.code === e.target.value,
                    );
                    setValue((v) => ({
                      ...v,
                      country: c.code,
                      destination: "+" + c.prefix,
                    }));
                  }}
                >
                  {CALL_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name} (+{c.prefix})
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor={id + "-destination"}>
                International phone number
                <input
                  id={id + "-destination"}
                  type="tel"
                  value={value.destination}
                  onChange={(e) => set("destination", e.target.value)}
                  maxLength={24}
                  placeholder="+31 20 123 4567"
                />
              </label>
            </div>
            <label htmlFor={id + "-purpose"}>
              What should your agent find out?
              <textarea
                id={id + "-purpose"}
                value={value.purpose}
                onChange={(e) => set("purpose", e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Ask about available viewing times and get a reference."
              />
            </label>
            <div className="tools-note">
              <Icon name="globe" />
              <p>
                Country choices prepare a destination. Route availability and a
                verified price must be checked before dialing.
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="plan-destination">
              <span className="participant-avatar">{value.country}</span>
              <div>
                <strong>{value.label}</strong>
                <small>
                  {countryName(value.country)} · {value.destination}
                </small>
              </div>
              <button
                type="button"
                className="text-action"
                onClick={() => setStep(0)}
              >
                Edit
              </button>
            </div>
            <CaptureOptions
              value={value.capture}
              onChange={(v) => set("capture", v)}
            />
            <label htmlFor={id + "-permission"}>
              Recording and transcription permission
              <select
                id={id + "-permission"}
                value={value.permission}
                onChange={(e) => set("permission", e.target.value)}
              >
                <option value="ask">Ask before capture starts</option>
                <option value="confirmed">
                  I have confirmed the required permission
                </option>
              </select>
            </label>
            <p className="tools-fine">
              This saves a call plan. It does not approve a carrier route, place
              a call, request a callback or start capture.
            </p>
          </>
        )}
        {error && (
          <p className="tools-error" role="alert">
            {error}
          </p>
        )}
        <div className="tools-dialog-actions">
          {step === 1 && (
            <Btn
              label="Back"
              end={null}
              onClick={() => setStep(0)}
              type="button"
            />
          )}
          {step === 0 ? (
            <Btn
              label="Continue to options"
              primary
              type="button"
              onClick={next}
            />
          ) : (
            <Btn
              label={
                saving
                  ? "Saving…"
                  : isDemo
                    ? "Save call plan"
                    : "Save call plan"
              }
              primary
              type="submit"
              disabled={saving}
            />
          )}
        </div>
      </form>
    </Dialog>
  );
}
export function JoinDialog({ open, onClose, onJoin, preferences }) {
  const id = useId();
  const [method, setMethod] = useState("browser"),
    [number, setNumber] = useState(""),
    [muted, setMuted] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    if (open) {
      setMethod(preferences?.join_method || "browser");
      setNumber(preferences?.join_number || "");
      setMuted(true);
      setError("");
    }
  }, [open]);
  const join = (e) => {
    e.preventDefault();
    const clean = number.replace(/[\s().-]/g, "");
    if (method === "phone" && !validPhone(clean)) {
      setError("Use an international phone number starting with +.");
      return;
    }
    onJoin({ joinMethod: method, userMuted: muted });
    onClose();
  };
  return (
    <Dialog
      isOpen={open}
      onOpenChange={(v) => !v && onClose()}
      width={560}
      className="tools-dialog"
      aria-label="Join call"
    >
      <DialogHeader
        className="tools-dialog-heading"
        title="Jump in"
        onOpenChange={onClose}
      />
      <form className="tools-dialog-body" onSubmit={join}>
        <div className="join-constellation">
          <BotFace size={46} tone="teal" state="working" />
          <i />
          <span>L</span>
          <i />
          <span className="you">V</span>
        </div>
        <p className="join-intro">Join muted. Leave without ending the call.</p>
        <fieldset className="join-methods">
          <legend>Join from</legend>
          <label
            className={method === "browser" ? "selected" : ""}
            htmlFor={id + "-browser"}
          >
            <input
              id={id + "-browser"}
              type="radio"
              name={id + "-join"}
              checked={method === "browser"}
              onChange={() => setMethod("browser")}
            />
            <Icon name="browser" />
            <strong>My browser</strong>
            <small>Microphone in a configured live studio</small>
          </label>
          <label
            className={method === "phone" ? "selected" : ""}
            htmlFor={id + "-phone"}
          >
            <input
              id={id + "-phone"}
              type="radio"
              name={id + "-join"}
              checked={method === "phone"}
              onChange={() => setMethod("phone")}
            />
            <Icon name="phone" />
            <strong>My phone</strong>
            <small>A callback with a configured conference</small>
          </label>
        </fieldset>
        {method === "phone" && (
          <label htmlFor={id + "-number"}>
            Number where I’ll join
            <input
              id={id + "-number"}
              type="tel"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="+31 6 1234 5678"
              maxLength={24}
            />
          </label>
        )}
        <label className="tools-check" htmlFor={id + "-muted"}>
          <input
            id={id + "-muted"}
            type="checkbox"
            checked={muted}
            onChange={(e) => setMuted(e.target.checked)}
          />
          Join muted
        </label>
        <div className="tools-note">
          <Icon name="shield" />
          <p>Example audio. No microphone is requested.</p>
        </div>
        {error && (
          <p className="tools-error" role="alert">
            {error}
          </p>
        )}
        <div className="tools-dialog-actions">
          <Btn label="Cancel" end={null} onClick={onClose} />
          <Btn label="Join call" primary type="submit" icon="join" end={null} />
        </div>
      </form>
    </Dialog>
  );
}
function CapturePermission({ kind, onClose, onConfirm }) {
  const id = useId(),
    [agreed, setAgreed] = useState(false);
  return (
    <Dialog
      isOpen={Boolean(kind)}
      onOpenChange={(v) => !v && onClose()}
      width={520}
      className="tools-dialog"
      aria-label="Optional capture permission"
    >
      <DialogHeader
        className="tools-dialog-heading"
        title="Your conversation. Your choice."
        onOpenChange={onClose}
      />
      <div className="tools-dialog-body">
        <p>
          Recording and transcription are optional. Confirm the required notice
          and permission for everyone on the call before capture starts.
        </p>
        <label className="tools-check" htmlFor={id + "-agreed"}>
          <input
            id={id + "-agreed"}
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          Permission confirmed
        </label>
        <p className="tools-fine">
          This only changes sample controls. No live audio is captured or
          processed.
        </p>
        <div className="tools-dialog-actions">
          <Btn
            label={
              kind === "recording" ? "Enable recording" : "Enable transcription"
            }
            primary
            disabled={!agreed}
            onClick={onConfirm}
          />
        </div>
      </div>
    </Dialog>
  );
}
function highlight(text, query) {
  if (!query.trim()) return text;
  const needle = query.trim().toLowerCase(),
    lower = text.toLowerCase(),
    parts = [];
  let cursor = 0,
    index = lower.indexOf(needle);
  while (index !== -1 && parts.length < 60) {
    parts.push(
      text.slice(cursor, index),
      <mark key={index}>{text.slice(index, index + needle.length)}</mark>,
    );
    cursor = index + needle.length;
    index = lower.indexOf(needle, cursor);
  }
  parts.push(text.slice(cursor));
  return parts;
}
export function SampleRecording({ compact = false, initialTab = "recording" }) {
  const [tab, setTab] = useState(initialTab),
    [query, setQuery] = useState(""),
    [speaker, setSpeaker] = useState("all"),
    [position, setPosition] = useState(0);
  const audio = useRef(),
    id = useId();
  const seek = (time) => {
    if (audio.current) {
      audio.current.currentTime = time;
      setPosition(time);
    }
  };
  const lines = sample.transcript.filter(
    (line) =>
      (speaker === "all" || line.speaker === speaker) &&
      line.text.toLowerCase().includes(query.toLowerCase().trim()),
  );
  return (
    <div className={"sample-memory " + (compact ? "is-compact" : "")}>
      <div className="memory-record-head">
        <span className="recording-art">
          <Icon name="wave" size={25} />
        </span>
        <div>
          <span className="eyebrow">
            FICTIONAL SAMPLE · {clock(sample.duration)}
          </span>
          <h3>{sample.title}</h3>
          <p>Synthetic demonstration voices · Agent left / recipient right</p>
        </div>
        <Pill tone="sage">Sample</Pill>
      </div>
      <audio
        ref={audio}
        controls
        preload="none"
        src={sampleAudio}
        aria-label="Fictional sample call recording"
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
      />
      <div className="recording-wave" aria-hidden="true">
        {Array.from({ length: 55 }, (_, i) => (
          <i
            key={i}
            className={i / 55 < position / sample.duration ? "played" : ""}
            style={{ height: 9 + (Math.sin(i * 1.7) + 1) * 13 + "px" }}
          />
        ))}
      </div>
      <div
        className="memory-tab-row"
        role="tablist"
        aria-label="Sample call content"
      >
        {[
          ["recording", "Recording"],
          ["transcript", "Transcript"],
          ["summary", "Outcome"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={id + "-" + key + "-tab"}
            aria-controls={id + "-panel"}
            aria-selected={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        id={id + "-panel"}
        role="tabpanel"
        aria-labelledby={id + "-" + tab + "-tab"}
      >
        {tab === "recording" ? (
          <div className="memory-recording-info">
            <p>
              An original sample conversation to explore playback and transcript
              navigation. No real call or booking took place.
            </p>
            <div className="memory-facts">
              <div>
                <small>Audio</small>
                <strong>Two channels</strong>
              </div>
              <div>
                <small>Language</small>
                <strong>English</strong>
              </div>
              <div>
                <small>Result</small>
                <strong>Sample viewing</strong>
              </div>
            </div>
            <a
              href={sampleAudio}
              download="agentbridge-fictional-sample.mp3"
              className="text-action"
            >
              <Icon name="download" size={15} /> Download sample audio
            </a>
          </div>
        ) : tab === "transcript" ? (
          <>
            <div className="transcript-tools">
              <label className="search-field" htmlFor={id + "-search"}>
                <Icon name="search" />
                <input
                  id={id + "-search"}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  maxLength={160}
                  placeholder="Search this transcript"
                  aria-label="Search sample transcript"
                />
              </label>
              <label htmlFor={id + "-speaker"} className="sr-only">
                Speaker
              </label>
              <select
                id={id + "-speaker"}
                value={speaker}
                onChange={(e) => setSpeaker(e.target.value)}
              >
                <option value="all">All speakers</option>
                <option value="Agent">Agent</option>
                <option value="Recipient">Recipient</option>
              </select>
            </div>
            <div className="transcript-lines">
              {lines.map((line) => (
                <article
                  key={line.id}
                  className={
                    position >= line.start && position < line.end
                      ? "current"
                      : ""
                  }
                >
                  <button
                    type="button"
                    className="transcript-time"
                    onClick={() => seek(line.start)}
                    aria-label={"Jump to " + clock(line.start)}
                  >
                    {clock(line.start)}
                  </button>
                  <div>
                    <strong>{line.speaker}</strong>
                    <p>{highlight(line.text, query)}</p>
                  </div>
                </article>
              ))}
              {!lines.length && (
                <p className="tools-empty">
                  No matching transcript passages. Try another phrase.
                </p>
              )}
            </div>
            <a
              className="text-action"
              download="agentbridge-fictional-sample-transcript.txt"
              href={
                "data:text/plain;charset=utf-8," +
                encodeURIComponent(
                  "FICTIONAL SAMPLE. No real booking or call.\n\n" +
                    sample.transcript
                      .map((l) => `[${clock(l.start)}] ${l.speaker}: ${l.text}`)
                      .join("\n\n"),
                )
              }
            >
              <Icon name="download" size={15} /> Download sample transcript
            </a>
          </>
        ) : (
          <div className="memory-outcome">
            <Pill>DEMONSTRATION RESULT</Pill>
            <h4>A viewing, with the details in place.</h4>
            <p>
              The sample conversation discusses a fictional viewing. These
              details demonstrate extraction; they are not a real confirmation.
            </p>
            <dl>
              <div>
                <dt>Proposed time</dt>
                <dd>Tuesday 17 November · 10:30 London time</dd>
              </div>
              <div>
                <dt>Sample reference</dt>
                <dd>DEMO 204</dd>
              </div>
              <div>
                <dt>Meeting point</dt>
                <dd>Reception</dd>
              </div>
            </dl>
            <button
              type="button"
              className="text-action"
              onClick={() => {
                setTab("transcript");
                setQuery("reference");
              }}
            >
              Find the reference in the transcript{" "}
              <Icon name="arrow" size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
function Preferences({ preferences, onSave, isDemo }) {
  const [value, setValue] = useState({ ...preferences }),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [saving, setSaving] = useState(false);
  useEffect(() => setValue({ ...preferences }), [preferences]);
  const save = async (e) => {
    e.preventDefault();
    const result = validateCapture(value);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      await onSave(result.value);
      setSaved(true);
    } catch (error) {
      setError(error.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card className="tools-preferences" padding={0}>
      <span className="eyebrow">DEFAULTS FOR YOUR NEXT CALL</span>
      <h2>Call defaults</h2>
      <form onSubmit={save}>
        <CaptureOptions
          value={value}
          onChange={(v) => {
            setValue(v);
            setSaved(false);
          }}
        />
        {error && (
          <p className="tools-error" role="alert">
            {error}
          </p>
        )}
        <Btn
          label={saving ? "Saving…" : "Save capture and join preferences"}
          primary
          type="submit"
          disabled={saving}
        />
        {saved && (
          <p className="tools-success" role="status">
            {isDemo
              ? "Preferences saved."
              : "Preferences saved in your private studio."}
          </p>
        )}
      </form>
    </Card>
  );
}
function Participants({ call }) {
  return (
    <div className="call-participants">
      <div>
        <BotFace
          size={78}
          state={call.active ? "working" : "idle"}
          tone="teal"
        />
        <strong>Your agent</strong>
        <small>Your agent</small>
      </div>
      <span className="participant-thread" />
      <div>
        <span className="participant-avatar recipient">L</span>
        <strong>London studio</strong>
        <small>Recipient</small>
      </div>
      {call.joined && (
        <>
          <span className="participant-thread" />
          <div>
            <span className="participant-avatar you">V</span>
            <strong>You’re in</strong>
            <small>{call.userMuted ? "Muted on entry" : "Unmuted"}</small>
          </div>
        </>
      )}
    </div>
  );
}
function LiveCallTranscript({ call, allLines, setAllLines, onEnable }) {
  const position = call.listening ? call.samplePosition || 0 : call.elapsed;
  return (
    <Card
      className="tools-card live-transcript call-inline-transcript"
      padding={0}
    >
      <div className="tools-list-heading">
        <h2>Transcript</h2>
        {call.transcription && (
          <button
            className="text-action"
            type="button"
            onClick={() => setAllLines(!allLines)}
          >
            {allLines ? "Follow call" : "Show full transcript"}
          </button>
        )}
      </div>
      {call.transcription ? (
        <div className="call-transcript-scroll">
          {sample.transcript
            .filter((line) => allLines || line.start <= position)
            .map((line) => (
              <div className="live-transcript-line" key={line.id}>
                <span>{clock(line.start)}</span>
                <div>
                  <strong>{line.speaker}</strong>
                  <p>{line.text}</p>
                </div>
              </div>
            ))}
        </div>
      ) : (
        <div className="hub-transcript-empty">
          <Icon name="transcript" size={28} />
          <h3>Transcription off</h3>
          <p>
            Transcription is optional. Choose it here, with permission, while
            your agent keeps talking.
          </p>
          <Btn
            label="Start transcription"
            end="plus"
            onClick={onEnable}
            disabled={!call.active}
          />
        </div>
      )}
      <p className="tools-fine">
        {call.transcription ? "Example dialogue" : ""}
      </p>
    </Card>
  );
}
export function CallExtensions({
  page,
  snapshot,
  isDemo,
  call,
  setCall,
  onMute,
  onEnd,
  onRestart,
  onSavePlan,
  onArchivePlan,
  onSaveCapture,
  navTo,
  notify,
  joinOpen,
  setJoinOpen,
  onListen,
  onRoute,
}) {
  const preferences = snapshot.capture_preferences || DEFAULT_CAPTURE;
  const [planOpen, setPlanOpen] = useState(false),
    [selected, setSelected] = useState(null),
    [captureRequest, setCaptureRequest] = useState(null),
    [allLines, setAllLines] = useState(false),
    [query, setQuery] = useState(""),
    [endConfirm, setEndConfirm] = useState(false);
  useEffect(() => {
    setSelected(null);
    setPlanOpen(false);
  }, [page]);
  const plans = (snapshot.call_plans || []).filter(
    (p) =>
      p.status === "draft" &&
      [p.label, p.destination, countryName(p.country)]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const join = (v) => {
    onListen(v);
  };
  const enable = (kind) => {
    if (!isDemo) return;
    setCaptureRequest(kind);
  };
  const confirm = () => {
    setCall((c) => ({
      ...c,
      [captureRequest]: true,
      capturePermission: true,
      recordingPaused: false,
    }));
    setCaptureRequest(null);
    notify(
      "Sample " +
        (captureRequest === "recording" ? "recording" : "transcription") +
        " enabled. No live audio is captured.",
    );
  };
  return (
    <>
      {page === "calls" ? (
        <>
          <Head eyebrow="INTERNATIONAL CALLING" title="Calls" description="">
            <Btn
              label="New call"
              icon="plus"
              primary
              onClick={() => setPlanOpen(true)}
            />
          </Head>
          <div className="hub-call-grid">
            <FocusCall
              call={call}
              isDemo={isDemo}
              navTo={navTo}
              onListen={onListen}
              onRoute={onRoute}
              onRestart={onRestart}
            />
            <TranscriptPeek call={call} isDemo={isDemo} navTo={navTo} />
          </div>
          <div className="tools-list-heading">
            <div>
              <span className="eyebrow">YOUR PREPARATION</span>
              <h2>
                Call plans <small>{plans.length}</small>
              </h2>
            </div>
            <label className="search-field">
              <Icon name="search" />
              <input
                type="search"
                aria-label="Search call plans"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a call plan"
              />
            </label>
          </div>
          {plans.length ? (
            <div className="call-plan-list">
              {plans.map((plan) => (
                <Card key={plan.id} className="call-plan-row" padding={0}>
                  <span className="participant-avatar">{plan.country}</span>
                  <div>
                    <strong>{plan.label}</strong>
                    <small>
                      {countryName(plan.country)} · {plan.destination}
                    </small>
                    <div className="plan-tags">
                      <span>
                        {plan.capture.recording
                          ? "Recording requested"
                          : "Recording off"}
                      </span>
                      <span>
                        {plan.capture.transcription
                          ? "Transcript requested"
                          : "Transcript off"}
                      </span>
                    </div>
                  </div>
                  <Pill>Plan saved</Pill>
                  <Btn
                    label="Review plan"
                    end="diagonal"
                    onClick={() => setSelected(plan)}
                  />
                </Card>
              ))}
            </div>
          ) : (
            <div className="tools-empty-card">
              <Icon name="globe" size={28} />
              <h3>
                {query
                  ? "No matching call plans."
                  : "A destination is a good beginning."}
              </h3>
              <p>
                {query
                  ? "Try a different name or number."
                  : "Save an international call plan. Capture is optional, and nothing is dialed automatically."}
              </p>
              <Btn
                label="Create a call plan"
                onClick={() => setPlanOpen(true)}
                end="plus"
              />
            </div>
          )}
        </>
      ) : page === "memory" ? (
        <>
          <Head
            eyebrow="RECORDINGS & TRANSCRIPTS"
            title="Transcripts & recordings"
            description=""
          >
            {isDemo && call.active && (
              <A to={navTo("call")} className="text-action">
                Return to call <Icon name="arrow" size={15} />
              </A>
            )}
          </Head>
          {isDemo ? (
            <Card className="tools-card" padding={0}>
              <SampleRecording />
            </Card>
          ) : (
            <div className="tools-empty-card">
              <Icon name="record" size={30} />
              <h2>No recordings yet</h2>
              <p>
                Live recording and transcription need a configured capture
                backend. Your preferences can be saved now.
              </p>
              <A className="text-action" to="/studio/demo/memory/">
                Try the sample recording and transcript
                <Icon name="arrow" size={15} />
              </A>
            </div>
          )}
          <Preferences
            preferences={preferences}
            onSave={onSaveCapture}
            isDemo={isDemo}
          />
        </>
      ) : (
        <>
          <h1 className="sr-only">{call.label || "Call"}</h1>
          {!isDemo ? (
            <div className="tools-empty-card">
              <Icon name="phone" size={28} />
              <h2>No active call</h2>
              <A to={navTo("numbers")} className="text-action">
                Your numbers <Icon name="arrow" size={15} />
              </A>
            </div>
          ) : (
            <>
              <div className="gb-call-layout">
                <Card className="tools-live-card" padding={0}>
                  <div className="live-card-top">
                    <ActiveCallCard call={call} />
                  </div>
                  <div className="call-view-entry-actions">
                    {call.active && (
                      <>
                        <Btn
                          label={call.listening ? "Listening" : "Listen in"}
                          icon="headphones"
                          end={null}
                          onClick={onListen}
                          disabled={Boolean(call.listening)}
                        />
                        <Btn
                          label="Jump in"
                          icon="join"
                          end={null}
                          onClick={() => setJoinOpen(true)}
                          disabled={Boolean(call.joined)}
                        />
                      </>
                    )}
                  </div>
                  <Participants call={call} />
                  <div className="call-centre-wave">
                    <Wave muted={call.muted || !call.active} />
                    <small>One familiar agent. You can join alongside.</small>
                  </div>
                  <div className="tools-actions">
                    <Btn
                      label={call.muted ? "Unmute call" : "Mute call"}
                      icon={call.muted ? "muted" : "mute"}
                      end={null}
                      onClick={onMute}
                      disabled={!call.active}
                      aria-pressed={call.muted}
                    />
                    {call.joined && (
                      <>
                        <Btn
                          label={
                            call.userMuted
                              ? "Unmute microphone"
                              : "Mute microphone"
                          }
                          icon={call.userMuted ? "muted" : "mute"}
                          end={null}
                          onClick={() =>
                            setCall((c) => ({ ...c, userMuted: !c.userMuted }))
                          }
                        />
                        <Btn
                          label="Leave call"
                          end={null}
                          onClick={() => {
                            setCall((c) => ({ ...c, joined: false }));
                            notify("Left call. The agent continues.");
                          }}
                        />
                      </>
                    )}
                    {call.active ? (
                      <Btn
                        label="End call"
                        icon="end"
                        end={null}
                        onClick={() => setEndConfirm(true)}
                      />
                    ) : (
                      <Btn label="Restart call" onClick={onRestart} />
                    )}
                    <Btn
                      label="Route call"
                      icon="routes"
                      end={null}
                      disabled={!call.active}
                      onClick={() => onRoute()}
                    />
                  </div>
                  {call.proposedRoute && (
                    <p className="hub-routing-summary">
                      <Icon name="routes" size={16} /> Next route:{" "}
                      {call.proposedRoute.label} · Saved
                    </p>
                  )}
                </Card>
                <LiveCallTranscript
                  call={call}
                  allLines={allLines}
                  setAllLines={setAllLines}
                  onEnable={() => enable("transcription")}
                />
              </div>
              <div className="call-capture-grid">
                <Card className="tools-card" padding={0}>
                  <div className="capture-control-heading">
                    <Icon name="record" />
                    <Pill tone={call.recording ? "rose" : "muted"}>
                      {call.recording
                        ? call.recordingPaused
                          ? "Paused"
                          : "Recording"
                        : "Off"}
                    </Pill>
                  </div>
                  <h2>Recording</h2>
                  <p>
                    Recording is separate from joining. You can pause capture
                    while the call continues.
                  </p>
                  {call.recording ? (
                    <div className="tools-actions">
                      <Btn
                        label={
                          call.recordingPaused
                            ? "Resume recording"
                            : "Pause recording"
                        }
                        icon={call.recordingPaused ? "play" : "pause"}
                        end={null}
                        disabled={!call.active}
                        onClick={() =>
                          setCall((c) => ({
                            ...c,
                            recordingPaused: !c.recordingPaused,
                          }))
                        }
                      />
                      <Btn
                        label="Stop recording"
                        end={null}
                        disabled={!call.active}
                        onClick={() =>
                          setCall((c) => ({
                            ...c,
                            recording: false,
                            recordingPaused: false,
                          }))
                        }
                      />
                    </div>
                  ) : (
                    <Btn
                      label="Start recording"
                      end="plus"
                      disabled={!call.active}
                      onClick={() => enable("recording")}
                    />
                  )}
                </Card>
                <Card className="tools-card" padding={0}>
                  <div className="capture-control-heading">
                    <Icon name="transcript" />
                    <Pill tone={call.transcription ? "sage" : "muted"}>
                      {call.transcription ? "On" : "Off"}
                    </Pill>
                  </div>
                  <h2>Transcription</h2>
                  <p>
                    A searchable transcript can be requested with or without
                    keeping the audio recording.
                  </p>
                  <Btn
                    label={
                      call.transcription
                        ? "Stop transcription"
                        : "Start transcription"
                    }
                    end={call.transcription ? null : "plus"}
                    disabled={!call.active}
                    onClick={() =>
                      call.transcription
                        ? setCall((c) => ({ ...c, transcription: false }))
                        : enable("transcription")
                    }
                  />
                </Card>
              </div>
            </>
          )}
        </>
      )}
      <Dialog
        isOpen={endConfirm}
        onOpenChange={setEndConfirm}
        width={420}
        className="tools-dialog"
        aria-label="End call confirmation"
      >
        <DialogHeader
          className="tools-dialog-heading"
          title="End this call?"
          onOpenChange={() => setEndConfirm(false)}
        />
        <div className="tools-dialog-body">
          <p>Ends the call for everyone.</p>
          <div className="tools-dialog-actions">
            <Btn
              label="Cancel"
              onClick={() => setEndConfirm(false)}
              end={null}
            />
            <Btn
              label="End call"
              icon="end"
              end={null}
              onClick={() => {
                setEndConfirm(false);
                onEnd();
              }}
            />
          </div>
        </div>
      </Dialog>
      <PlanDialog
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        onSave={onSavePlan}
        preferences={preferences}
        isDemo={isDemo}
      />
      <JoinDialog
        open={isDemo && call.active && joinOpen}
        onClose={() => setJoinOpen(false)}
        onJoin={join}
        preferences={preferences}
      />
      {captureRequest && (
        <CapturePermission
          key={captureRequest}
          kind={captureRequest}
          onClose={() => setCaptureRequest(null)}
          onConfirm={confirm}
        />
      )}
      <Dialog
        isOpen={Boolean(selected)}
        onOpenChange={(v) => !v && setSelected(null)}
        width={560}
        className="tools-dialog"
        aria-label="Review international call plan"
      >
        <DialogHeader
          className="tools-dialog-heading"
          title={selected?.label || "Call plan"}
          onOpenChange={() => setSelected(null)}
        />
        {selected && (
          <div className="tools-dialog-body">
            <Pill>Saved plan · No call placed</Pill>
            <h3>{countryName(selected.country)}</h3>
            <p>{selected.destination}</p>
            <p>{selected.purpose || "No call brief added."}</p>
            <dl className="plan-review">
              <div>
                <dt>Recording</dt>
                <dd>
                  {selected.capture.recording
                    ? "Requested after permission"
                    : "Off"}
                </dd>
              </div>
              <div>
                <dt>Transcription</dt>
                <dd>
                  {selected.capture.transcription
                    ? "Requested after permission"
                    : "Off"}
                </dd>
              </div>
              <div>
                <dt>Permission</dt>
                <dd>
                  {selected.permission === "ask"
                    ? "Ask before capture"
                    : "Operator marked confirmed"}
                </dd>
              </div>
              <div>
                <dt>When you join</dt>
                <dd>
                  {selected.capture.join_method === "browser"
                    ? "Browser"
                    : "Phone callback"}
                </dd>
              </div>
              <div>
                <dt>Route and price</dt>
                <dd>Verification required before dialing</dd>
              </div>
            </dl>
            <div className="tools-note">
              <Icon name="connection" />
              <p>
                Saved plans do not activate live calling. Connect an authorized
                carrier and conference backend to place, capture or join a real
                call.
              </p>
            </div>
            <div className="tools-dialog-actions">
              <Btn
                label="Archive call plan"
                end={null}
                onClick={async () => {
                  try {
                    await onArchivePlan(selected.id);
                    setSelected(null);
                  } catch (e) {
                    notify(e.message);
                  }
                }}
              />
              <A
                to={isDemo ? navTo("call") : navTo("connection")}
                className="text-action"
              >
                {isDemo ? "Explore the sample call" : "Review connection"}
                <Icon name="arrow" size={14} />
              </A>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
