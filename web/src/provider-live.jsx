import React, { useEffect, useId, useRef, useState } from "react";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Btn, Card, Icon, Pill } from "./ui.jsx";
import { ConnectionEditor, NumberWorkspace } from "./number-studio.jsx";
import { AccountProfile, accountRequest } from "./account-auth.jsx";
import {
  CallHistoryList,
  CallNotes,
  ContactMemoryDialog,
} from "./conversations.jsx";
import "./provider-live.css";
import { useRoute, A } from "./context.jsx";
import {
  ActiveCallCard,
  currentCarrierCalls,
  carrierCallView,
  carrierConnected,
  isActiveCarrierCall as active,
} from "./studio-navigation.jsx";
import { displayPhone } from "../../shared/phone.mjs";
import { ConnectionPath } from "./connection-path.jsx";
import { contactNotes } from "../../shared/conversations.mjs";
import { LiveRoom } from "./live-room.jsx";
import {
  TranscribeRecording,
  AgentReportedCalls,
  SavedTranscript,
  SetupChecklist,
} from "./launch-settings.jsx";

export async function providerRequest(path, options = {}) {
  const response = await fetch("/api/studio/" + path, {
    credentials: "same-origin",
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(
      data.error?.message || "The provider request could not be completed.",
    );
    error.code = data.error?.code;
    throw error;
  }
  return data;
}
const write = (path, body = {}, method = "POST") =>
  providerRequest(path, { method, body: JSON.stringify(body) });
const requestId = () => crypto.randomUUID();
export function SignalWireSettings({ onModeChange = () => location.reload() }) {
  const id = useId();
  const [status, setStatus] = useState(null),
    [value, setValue] = useState({ space: "", project_id: "", api_token: "" }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [removing, setRemoving] = useState(false);
  useEffect(() => {
    let alive = true;
    providerRequest("provider/status")
      .then((s) => {
        if (alive) {
          setStatus(s);
          setValue((v) => ({
            ...v,
            space: s.space || "",
            project_id: s.project_id || "",
          }));
        }
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);
  const run = async (fn) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="provider-settings" padding={0}>
      <div className="provider-settings-heading">
        <span className="provider-icon">
          <Icon name="key" size={24} />
        </span>
        <div>
          <h2>SignalWire</h2>
          <p>
            {status?.configured
              ? "Your project is connected."
              : "Connect your own project."}
          </p>
        </div>
        {status?.configured && <Pill>Connected</Pill>}
      </div>
      <p className="provider-muted">
        Your API token is encrypted on the server. It is never shown again or
        saved in browser storage.
      </p>
      <details className="provider-quickstart">
        <summary>Set up your first outbound call</summary>
        <ol>
          <li>
            In your SignalWire dashboard, create a project token with Voice and
            Numbers permissions. Copy the Space, Project ID and token into the
            fields below.
          </li>
          <li>Choose Save and verify, then Use my SignalWire project.</li>
          <li>
            In Numbers, import a voice number you own or buy a number. In
            Connections, save the outside destination with its country code.
          </li>
          <li>
            Choose Test callback, enter a different phone you can answer and
            confirm the charges. When you answer, SignalWire dials the
            destination.
          </li>
        </ol>
        <p>
          On a trial, verify both outside phones. For calls abroad, enable
          international service and the destination country in your SignalWire
          Space.
        </p>
        <a
          href="https://signalwire.com/docs/platform/voice/make-and-receive-calls"
          target="_blank"
          rel="noreferrer"
        >
          SignalWire calling guide
        </a>
      </details>
      {status && !status.vault_ready && (
        <p role="status">
          Secure provider storage needs to be configured on this server before
          credentials can be saved.
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          run(async () => {
            const result = await write("provider/credentials", value);
            setStatus(result);
            setValue((v) => ({ ...v, api_token: "" }));
            setMessage("SignalWire verified. Your token is saved securely.");
          });
        }}
      >
        <label htmlFor={id + "space"}>
          Space name or URL
          <input
            id={id + "space"}
            value={value.space}
            autoComplete="off"
            placeholder="your-space.signalwire.com"
            required
            disabled={busy || !status?.vault_ready}
            onChange={(e) => setValue((v) => ({ ...v, space: e.target.value }))}
          />
        </label>
        <label htmlFor={id + "project"}>
          Project ID
          <input
            id={id + "project"}
            value={value.project_id}
            autoComplete="off"
            maxLength={36}
            required
            disabled={busy || !status?.vault_ready}
            onChange={(e) =>
              setValue((v) => ({ ...v, project_id: e.target.value }))
            }
          />
        </label>
        <label htmlFor={id + "token"}>
          {status?.configured ? "New API token" : "API token"}
          <input
            id={id + "token"}
            type="password"
            value={value.api_token}
            autoComplete="off"
            spellCheck={false}
            maxLength={512}
            minLength={10}
            required
            disabled={busy || !status?.vault_ready}
            placeholder={
              status?.configured ? "Saved token · enter only to replace" : ""
            }
            onChange={(e) =>
              setValue((v) => ({ ...v, api_token: e.target.value }))
            }
          />
          <small>Use a token with Numbers and Voice permissions.</small>
        </label>
        <div className="provider-actions">
          <Btn
            type="submit"
            label={
              busy
                ? "Verifying…"
                : status?.configured
                  ? "Replace and verify token"
                  : "Save and verify"
            }
            primary
            disabled={busy || !status?.vault_ready}
            end={null}
          />
        </div>
      </form>
      {status?.configured && (
        <div className="provider-mode">
          <div>
            <strong>
              {status.live_enabled ? "Live testing" : "Demo mode"}
            </strong>
            <p>
              Live actions use your SignalWire project and its billing. Demo
              data stays separate.
            </p>
          </div>
          <Btn
            label={
              status.live_enabled
                ? "Return to demo"
                : "Use my SignalWire project"
            }
            aria-pressed={Boolean(status.live_enabled)}
            data-control-state={status.live_enabled ? "enabled" : "off"}
            disabled={busy}
            icon="connection"
            onClick={() =>
              run(async () => {
                await write(
                  "provider/mode",
                  { live_enabled: !status.live_enabled },
                  "PATCH",
                );
                onModeChange();
              })
            }
          />
          <button
            className="provider-text-button"
            disabled={busy}
            onClick={() => setRemoving(true)}
          >
            Remove saved credentials
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="provider-error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <Dialog
        isOpen={removing}
        onOpenChange={(v) => !v && setRemoving(false)}
        width={480}
        maxHeight="calc(100dvh - 32px)"
        aria-label="Remove SignalWire credentials"
        className="tools-dialog"
      >
        <DialogHeader
          title="Remove credentials?"
          onOpenChange={() => setRemoving(false)}
        />
        <div className="tools-dialog-body">
          <p>
            Numbers and recordings stay in SignalWire. Deactivate forwarding and
            end calls first.
          </p>
          <div className="provider-actions">
            <Btn label="Cancel" onClick={() => setRemoving(false)} end={null} />
            <Btn
              label="Remove credentials"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await write("provider/credentials", {}, "DELETE");
                  setRemoving(false);
                  onModeChange();
                })
              }
            />
          </div>
        </div>
      </Dialog>
    </Card>
  );
}

const duration = (n) =>
  `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
function ChargeConsent({ checked, onChange, recording = false }) {
  return (
    <label className="provider-consent">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        required
      />
      <span>
        {recording
          ? "Everyone on this call has agreed to recording, and I accept SignalWire recording charges."
          : "I accept the charges to my SignalWire project for this action."}
      </span>
    </label>
  );
}

function LiveNumberDialog({ open, onClose, onAdded, space }) {
  const id = useId();
  const [tab, setTab] = useState("owned"),
    [inventory, setInventory] = useState([]),
    [results, setResults] = useState([]),
    [area, setArea] = useState("202"),
    [searched, setSearched] = useState(false),
    [chosen, setChosen] = useState(""),
    [label, setLabel] = useState("Main line"),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const key = useRef(requestId());
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setTab("owned");
    setInventory([]);
    setResults([]);
    setSearched(false);
    setBusy(true);
    setError("");
    setChosen("");
    setConsent(false);
    key.current = requestId();
    providerRequest("live/inventory")
      .then((d) => alive && setInventory(d.numbers))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [open]);
  const submit = async (event) => {
    event.preventDefault();
    if (
      !chosen ||
      busy ||
      !(tab === "owned" ? inventory : results).some(
        (n) => (n.id || n.number) === chosen && !n.imported,
      ) ||
      (tab === "buy" && !consent)
    )
      return;
    setBusy(true);
    setError("");
    try {
      if (tab === "owned")
        await write("live/numbers/import", {
          provider_number_id: chosen,
          label,
        });
      else
        await write("live/numbers/purchase", {
          request_id: key.current,
          number: chosen,
          label,
          confirm_charges: consent,
        });
      await onAdded();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      isOpen={open}
      onOpenChange={(v) => !v && onClose()}
      width={560}
      maxHeight="calc(100dvh - 32px)"
      className="tools-dialog live-provider-dialog"
      aria-label="Get a SignalWire number"
    >
      <DialogHeader title="Get a number" onOpenChange={onClose} />
      <div className="tools-dialog-body">
        <div className="provider-tabs">
          <button
            type="button"
            disabled={busy}
            aria-pressed={tab === "owned"}
            onClick={() => {
              setTab("owned");
              setChosen("");
              setConsent(false);
            }}
          >
            Use an owned number
          </button>
          <button
            type="button"
            disabled={busy}
            aria-pressed={tab === "buy"}
            onClick={() => {
              setTab("buy");
              setChosen("");
              setConsent(false);
            }}
          >
            Buy a number
          </button>
        </div>
        {tab === "buy" && (
          <form
            className="provider-search"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              setChosen("");
              setResults([]);
              key.current = requestId();
              try {
                const data = await write("live/numbers/search", {
                  area_code: area,
                });
                setResults(data.numbers);
                setSearched(true);
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label htmlFor={id + "area"}>
              US area code
              <input
                id={id + "area"}
                value={area}
                required
                pattern="[2-9][0-9]{2}"
                inputMode="numeric"
                maxLength={3}
                disabled={busy}
                onChange={(e) => {
                  setArea(e.target.value);
                  setChosen("");
                  setConsent(false);
                  setSearched(false);
                  setResults([]);
                }}
              />
            </label>
            <Btn
              label="Search SignalWire"
              type="submit"
              icon="search"
              disabled={busy}
            />
          </form>
        )}
        <form onSubmit={submit}>
          <fieldset className="provider-number-list">
            <legend>
              {tab === "owned"
                ? "Your SignalWire numbers"
                : "Available voice numbers"}
            </legend>
            {(tab === "owned" ? inventory : results).map((n) => (
              <label key={n.id || n.number}>
                <input
                  type="radio"
                  name={id + "number"}
                  value={n.id || n.number}
                  disabled={busy || n.imported}
                  checked={chosen === (n.id || n.number)}
                  onChange={() => {
                    setChosen(n.id || n.number);
                    setConsent(false);
                    key.current = requestId();
                  }}
                />
                <span>
                  <strong>{n.e164 || n.number}</strong>
                  <small>
                    {n.imported
                      ? "Already added"
                      : n.label || n.region || "US voice number"}
                  </small>
                </span>
              </label>
            ))}
            {!busy && !(tab === "owned" ? inventory : results).length && (
              <p>
                {tab === "owned"
                  ? "No owned voice numbers found. Buy a number to get started."
                  : searched
                    ? "No numbers available in this area code. Try another US area code."
                    : "Search an area code to see current availability."}
              </p>
            )}
          </fieldset>
          {chosen && (
            <label htmlFor={id + "label"}>
              Number name
              <input
                id={id + "label"}
                value={label}
                required
                maxLength={80}
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>
          )}
          {tab === "buy" && chosen && (
            <>
              <p className="provider-muted">
                SignalWire does not include prices in search results. Review
                your project’s rental and usage rates before buying. Numbers may
                have a release hold.
              </p>
              {space && (
                <a
                  href={`https://${space}.signalwire.com`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="provider-text-button"
                >
                  Review your SignalWire project
                </a>
              )}
              <ChargeConsent checked={consent} onChange={setConsent} />
            </>
          )}
          {error && (
            <p role="alert" className="provider-error">
              {error}
            </p>
          )}
          <div className="provider-actions">
            <Btn label="Cancel" onClick={onClose} end={null} />
            <Btn
              type="submit"
              primary
              label={
                busy
                  ? "Working…"
                  : tab === "owned"
                    ? "Use this number"
                    : "Buy selected number"
              }
              disabled={busy || !chosen || (tab === "buy" && !consent)}
            />
          </div>
        </form>
      </div>
    </Dialog>
  );
}

function LiveActionDialog({
  action,
  onClose,
  onSubmit,
  connections,
  space,
  rooms,
}) {
  const id = useId(),
    key = useRef(requestId());
  const [consent, setConsent] = useState(false),
    [callback, setCallback] = useState(""),
    [studioRoom, setStudioRoom] = useState(false),
    [destination, setDestination] = useState(action?.connection?.id || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (action) {
      setConsent(false);
      setCallback("");
      setStudioRoom(false);
      setDestination(action.connection?.id || "");
      setError("");
      key.current = requestId();
    }
  }, [action]);
  if (!action) return null;
  const charge = ["activate", "start", "record", "transfer"].includes(
      action.type,
    ),
    recording = action.type === "record";
  const names = {
    activate: "Activate forwarding",
    deactivate: "Deactivate forwarding",
    start: "Start a test call",
    record: "Record this call",
    transfer: "Transfer the call",
    end: "End call for everyone",
    remove: "Remove connection",
    review: "Review an uncertain request",
    delete_recording: "Delete recording",
  };
  return (
    <Dialog
      isOpen
      onOpenChange={(v) => !v && onClose()}
      width={520}
      maxHeight="calc(100dvh - 32px)"
      className="tools-dialog live-provider-dialog"
      aria-label={names[action.type]}
    >
      <DialogHeader title={names[action.type]} onOpenChange={onClose} />
      <form
        className="tools-dialog-body"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onSubmit({
              ...action,
              request_id: key.current,
              confirm_charges: consent,
              capture_consent: consent,
              callback_number: callback,
              studio_room: studioRoom,
              connection_id: destination,
            });
            onClose();
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {action.type === "activate" && (
          <p>
            Calls to this number will forward to{" "}
            <strong>{action.connection.destination}</strong>. Each call is
            limited to five minutes. Forwarding continues while the studio is
            closed, until you deactivate it.
          </p>
        )}
        {rooms && ["start", "activate"].includes(action.type) && (
          <label className="provider-consent">
            <input
              type="checkbox"
              checked={studioRoom}
              onChange={(e) => setStudioRoom(e.target.checked)}
            />
            <span>
              Enable Studio call room. Route audio through AgentBridge to join,
              mute participants or turn on live captions.
            </span>
          </label>
        )}
        {action.type === "deactivate" && (
          <p>
            Restore the number’s previous SignalWire call handling. Existing
            calls are not ended.
          </p>
        )}
        {action.type === "start" && (
          <>
            <p>
              SignalWire calls your phone first. When you answer, it connects
              you to <strong>{action.connection.destination}</strong>. Both legs
              are billed by SignalWire.
            </p>
            <label htmlFor={id + "phone"}>
              Your callback phone
              <input
                id={id + "phone"}
                type="tel"
                value={callback}
                placeholder="+…"
                required
                pattern="\+[1-9][0-9]{7,14}"
                onChange={(e) => setCallback(e.target.value)}
              />
            </label>
          </>
        )}
        {action.type === "transfer" && (
          <label htmlFor={id + "destination"}>
            New destination
            <select
              id={id + "destination"}
              value={destination}
              required
              onChange={(e) => setDestination(e.target.value)}
            >
              <option value="">Choose a connection</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} · {c.destination}
                </option>
              ))}
            </select>
          </label>
        )}
        {action.type === "record" && (
          <p>
            Starts a recording in your SignalWire account. Record only after
            every participant has agreed. Recording is off until you confirm.
          </p>
        )}
        {action.type === "end" && (
          <p>
            Disconnect the phones and everyone in this call. To leave just your
            browser audio, choose Leave room.
          </p>
        )}
        {action.type === "remove" && (
          <p>
            Remove this saved connection. The phone number stays in your
            SignalWire account.
          </p>
        )}
        {action.type === "delete_recording" && (
          <p>
            Delete this recording from SignalWire? This permanently removes the
            provider’s stored audio.
          </p>
        )}
        {action.type === "review" && (
          <p>
            Check this action in the SignalWire dashboard first. Confirm only
            after you have reviewed whether the provider completed it. This
            permits a new request; it does not resend the old one.
            {space && (
              <>
                {" "}
                <a
                  href={`https://${space}.signalwire.com`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="provider-text-button"
                >
                  Open SignalWire
                </a>
              </>
            )}
          </p>
        )}
        {charge && (
          <ChargeConsent
            recording={recording}
            checked={consent}
            onChange={setConsent}
          />
        )}
        {action.type === "review" && (
          <label className="provider-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              required
            />
            <span>
              I reviewed this request in SignalWire and understand a new request
              may charge my project.
            </span>
          </label>
        )}
        {error && (
          <p role="alert" className="provider-error">
            {error}
          </p>
        )}
        <div className="provider-actions">
          <Btn label="Cancel" onClick={onClose} end={null} />
          <Btn
            label={busy ? "Working…" : names[action.type]}
            type="submit"
            primary
            disabled={
              busy || ((charge || action.type === "review") && !consent)
            }
          />
        </div>
      </form>
    </Dialog>
  );
}

export function LiveWorkspace({
  page,
  data,
  pathFor,
  searchTarget,
  onState,
  account,
  onSignout,
  navTo,
  initialHistoryFilter = "all",
}) {
  const { search } = useRoute();
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [numberOpen, setNumberOpen] = useState(false),
    [editing, setEditing] = useState(null),
    [editorOpen, setEditorOpen] = useState(false),
    [action, setAction] = useState(null),
    [selectedNumber, setSelectedNumber] = useState(""),
    [selectedCall, setSelectedCall] = useState(""),
    [recordings, setRecordings] = useState([]),
    [transcripts, setTranscripts] = useState([]);
  const [memoryContact, setMemoryContact] = useState(null);
  const currentCallId = useRef(selectedCall);
  currentCallId.current = selectedCall;
  const mounted = useRef(true),
    syncing = useRef(false),
    sequence = useRef(0),
    appliedSearch = useRef(null),
    stateCallback = useRef(onState);
  stateCallback.current = onState;
  const setSnapshot = (s, order) => {
    if (mounted.current && order === sequence.current) {
      stateCallback.current?.(s);
    }
  };
  const refresh = async () => {
    const order = ++sequence.current;
    const snapshot = await providerRequest("live/overview");
    setSnapshot(snapshot, order);
    return snapshot;
  };
  const sync = async () => {
    if (syncing.current) return;
    syncing.current = true;
    const order = ++sequence.current;
    try {
      setSnapshot(await write("live/sync"), order);
    } catch (e) {
      if (mounted.current && e.code !== "PROVIDER_BUSY") setError(e.message);
    } finally {
      syncing.current = false;
    }
  };
  useEffect(() => {
    mounted.current = true;
    refresh()
      .then(() => sync())
      .catch((e) => mounted.current && setError(e.message));
    const timer = setInterval(() => {
      if (!document.hidden) sync();
    }, 10_000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, []);
  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const connections = data.connections.filter((c) => c.status === "saved"),
    calls = currentCarrierCalls(data),
    history = [
      ...new Map(
        [...data.calls.filter((c) => !active(c)), ...(data.call_history || [])]
          .filter((c) => !c.parent_call_id)
          .map((c) => [c.id, c]),
      ).values(),
    ].sort(
      (a, b) => Date.parse(b.started_at || 0) - Date.parse(a.started_at || 0),
    );
  const addConnection = (id = "") => {
    setSelectedNumber(id);
    setEditing(null);
    setEditorOpen(true);
  };
  useEffect(() => {
    if (
      searchTarget?.page !== page ||
      appliedSearch.current === searchTarget.id
    )
      return;
    appliedSearch.current = searchTarget.id;
    if (searchTarget.action === "buy") setNumberOpen(true);
    if (searchTarget.action === "connect") addConnection();
  }, [page, searchTarget]);
  const details =
    data.calls.find((c) => c.id === selectedCall) ||
    (data.call_history || []).find((c) => c.id === selectedCall);
  const openCall = (call) => {
    setSelectedCall(call.id);
    navTo("call", call.id);
  };
  const addCallNote = async (id, value) => {
    await write(`live/calls/${id}/notes`, value);
    await refresh();
  };
  const deleteCallNote = async (id, noteId) => {
    await write(`live/calls/${id}/notes/${noteId}`, {}, "DELETE");
    await refresh();
  };
  useEffect(() => {
    if (page !== "call") {
      setSelectedCall("");
      return;
    }
    const requested = new URLSearchParams(search).get("id");
    if (requested) setSelectedCall(requested);
    else if (!selectedCall) {
      const first = data.calls.find(
        (c) =>
          active(c) &&
          !c.parent_call_id &&
          (!c.room_call_id || c.room_call_id === c.id),
      );
      if (first) setSelectedCall(first.id);
    }
  }, [page, data.calls, selectedCall, search]);
  useEffect(() => {
    setRecordings([]);
    setTranscripts([]);
  }, [selectedCall]);
  const loadRecordings = async (id) => {
    const r = await providerRequest("live/calls/" + id + "/recordings");
    if (currentCallId.current === id) setRecordings(r.recordings);
  };
  useEffect(() => {
    if (!selectedCall) return;
    let alive = true;
    providerRequest("live/calls/" + selectedCall + "/recordings")
      .then((r) => alive && setRecordings(r.recordings))
      .catch((e) => alive && setError(e.message));
    providerRequest("transcription/calls/" + selectedCall)
      .then((r) => alive && setTranscripts(r.transcripts))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [selectedCall, data.last_sync]);
  const submitAction = async (value) => {
    const body = {
      request_id: value.request_id,
      confirm_charges: value.confirm_charges,
      ...(value.studio_room && ["start", "activate"].includes(value.type)
        ? { studio_room: true }
        : {}),
    };
    if (value.type === "activate" || value.type === "deactivate")
      await write(
        "live/connections/" + value.connection.id + "/" + value.type,
        body,
      );
    else if (value.type === "start")
      await write("live/calls/start", {
        ...body,
        connection_id: value.connection.id,
        callback_number: value.callback_number,
      });
    else if (
      value.type === "record" ||
      value.type === "end" ||
      value.type === "transfer"
    ) {
      await write("live/calls/" + value.call.id + "/" + value.type, {
        ...body,
        ...(value.type === "record"
          ? { capture_consent: value.capture_consent }
          : {}),
        ...(value.type === "transfer"
          ? { connection_id: value.connection_id }
          : {}),
      });
      if (value.type === "record") await loadRecordings(value.call.id);
    } else if (value.type === "delete_recording") {
      await write(
        "live/recordings/" + value.recording.id,
        { confirm_delete: true },
        "DELETE",
      );
      await loadRecordings(value.call.id);
    } else if (value.type === "remove")
      await write("live/connections/" + value.connection.id, {}, "DELETE");
    else if (value.type === "review")
      await write("live/operations/" + value.operation.id + "/review", {
        reviewed_in_signalwire: value.confirm_charges,
      });
    await refresh();
    setNotice(
      "SignalWire request completed. Call status updates from the provider.",
    );
  };
  const callCard = (record) => (
    <div className="live-call-card" key={record.id}>
      <ActiveCallCard
        call={carrierCallView(record, data)}
        expandable
        onOpen={() => openCall(record)}
      />
    </div>
  );
  function connectionCard(c) {
    const number = data.routing_numbers.find(
      (n) => n.id === c.routing_number_id,
    );
    const notes = contactNotes(data, c.destination);
    return (
      <article className="live-connection-card provider-contact" key={c.id}>
        <div className="live-card-heading">
          <h2>{c.label}</h2>
          <span
            className="forwarding-status"
            data-on={c.routing_state === "active"}
          >
            {c.routing_state === "active"
              ? "Forwarding on"
              : c.routing_state === "inactive"
                ? "Forwarding off"
                : "Needs review"}
          </span>
        </div>
        <ConnectionPath
          routing={number?.e164}
          routingNote={number?.label}
          destination={c.destination}
          destinationNote={c.country}
        />
        {notes && <p className="contact-note">{notes}</p>}
        <div className="provider-actions">
          <Btn
            label="Test callback"
            primary
            icon="calls"
            end={null}
            disabled={busy || number?.status !== "owned"}
            onClick={() => setAction({ type: "start", connection: c })}
          />
          <Btn
            label="Contact memory"
            aria-label={"Memory for " + c.label}
            icon="bookmark"
            end={null}
            onClick={() => setMemoryContact(c)}
          />
        </div>
        <details className="more-call-actions">
          <summary>More actions</summary>
          <div className="provider-actions">
            {c.routing_state === "active" ? (
              <Btn
                label="Deactivate forwarding"
                end={null}
                disabled={busy}
                onClick={() => setAction({ type: "deactivate", connection: c })}
              />
            ) : c.routing_state === "inactive" ? (
              <>
                <Btn
                  label="Activate forwarding"
                  end={null}
                  disabled={busy || number?.status !== "owned"}
                  onClick={() => setAction({ type: "activate", connection: c })}
                />
                <Btn
                  label="Edit connection"
                  end={null}
                  onClick={() => {
                    setEditing(c);
                    setEditorOpen(true);
                  }}
                />
                <button
                  className="provider-text-button"
                  onClick={() => setAction({ type: "remove", connection: c })}
                >
                  Remove connection
                </button>
              </>
            ) : (
              <Btn
                label="Check provider status"
                end={null}
                disabled={busy}
                onClick={() => run(() => write("live/reconcile"))}
              />
            )}
          </div>
        </details>
      </article>
    );
  }
  if (["agents", "connection", "design"].includes(page)) return null;
  if (!data.mode && !error)
    return (
      <p className="provider-muted" role="status">
        Loading your project…
      </p>
    );
  if (page === "settings")
    return (
      <div className="live-workspace">
        <h1>Settings</h1>
        <nav className="settings-links" aria-label="Workspace resources">
          <A to={pathFor("connection")}>
            Calling setup <Icon name="arrow" />
          </A>
          <A to={pathFor("activity")}>
            Activity <Icon name="arrow" />
          </A>
          <A to={pathFor("design")}>
            Design gallery <Icon name="arrow" />
          </A>
        </nav>
        {account && (
          <AccountProfile
            account={account}
            onSave={(value) =>
              accountRequest("account", {
                method: "PATCH",
                body: JSON.stringify(value),
              })
            }
          />
        )}
        <Btn label="Sign out" icon="logout" onClick={onSignout} />
      </div>
    );
  if (page === "activity")
    return (
      <div className="live-workspace">
        <h1>Activity</h1>
        {data.events.length ? (
          data.events.map((e) => (
            <article className="live-event" key={e.id}>
              <strong>{e.message}</strong>
              <time>{new Date(e.created_at).toLocaleString()}</time>
            </article>
          ))
        ) : (
          <p>No live project activity yet.</p>
        )}
      </div>
    );
  return (
    <div className="live-workspace">
      {["call", "calls", "memory"].includes(page) && (
        <div className="live-page-heading">
          <h1>{details ? "Call overview" : "Calls"}</h1>
        </div>
      )}
      {error && (
        <p className="provider-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="provider-muted" role="status">
          {notice}
        </p>
      )}
      {data.pending_actions?.length > 0 && (
        <section className="live-review">
          <h2>Provider requests need review</h2>
          {data.pending_actions.map((op) => (
            <div key={op.id}>
              <span>
                {op.kind.replaceAll("_", " ")} · {op.status}
              </span>
              <Btn
                label="Review in SignalWire"
                disabled={busy}
                onClick={() => setAction({ type: "review", operation: op })}
              />
            </div>
          ))}
        </section>
      )}
      {["overview", "connections", "numbers", "routes"].includes(page) && (
        <>
          <NumberWorkspace
            key={
              page + ":" + (searchTarget?.page === page ? searchTarget.id : "")
            }
            page={page}
            snapshot={data}
            call={carrierCallView(calls[0], data)}
            navTo={pathFor}
            onBuy={() => setNumberOpen(true)}
            onAdd={addConnection}
            onEdit={(c) => {
              setEditing(c);
              setEditorOpen(true);
            }}
            renderConnection={connectionCard}
            initialSearch={
              searchTarget?.page === page ? searchTarget.query : ""
            }
            initialCountry={
              searchTarget?.page === page ? searchTarget.country : "all"
            }
            homeLead={
              calls.length ? (
                <section aria-label="Live calls" className="live-call-list">
                  {calls.map(callCard)}
                </section>
              ) : null
            }
            setupStep={<SetupChecklist snapshot={data} live />}
          />
          {page === "numbers" &&
            data.routing_numbers
              .filter((n) => n.status !== "owned")
              .map((n) => (
                <p key={n.id}>{n.e164} · Check provider ownership</p>
              ))}
        </>
      )}
      {["calls", "call", "memory"].includes(page) && (
        <>
          {details ? (
            <section className="live-connection-card">
              <div className="live-card-heading">
                <h2>{details.label || details.to}</h2>
                <Btn
                  label="Back to calls"
                  end={null}
                  onClick={() => {
                    setSelectedCall("");
                    navTo("calls");
                  }}
                />
              </div>
              <p className="provider-muted">
                Routing number{" "}
                {displayPhone(details.routing_number || details.from)} ·
                Destination {displayPhone(details.destination || details.to)}
              </p>
              <p>
                <strong>
                  {active(details)
                    ? carrierConnected(details)
                      ? "Connected"
                      : "Calling…"
                    : details.status}
                </strong>{" "}
                · {duration(details.duration)}
              </p>
              {active(details) &&
                details.room_call_id &&
                !details.room_ready && (
                  <p role="status">
                    Waiting for the first phone to answer before you can join.
                  </p>
                )}
              {active(details) && details.room_ready && (
                <LiveRoom
                  key={details.room_call_id}
                  callId={details.room_call_id}
                  connections={connections}
                  write={write}
                />
              )}
              {active(details) &&
                !details.room_call_id &&
                data.features?.browser_audio && (
                  <p className="conversation-help">
                    For browser audio, select Enable Studio call room when
                    starting a callback or activating forwarding.
                  </p>
                )}
              {active(details) && (
                <div className="provider-actions">
                  <button
                    type="button"
                    className={
                      "capture-action" +
                      (recordings.some((r) => r.status === "in-progress")
                        ? " is-recording"
                        : "")
                    }
                    aria-label={
                      recordings.some((r) =>
                        ["in-progress", "paused"].includes(r.status),
                      )
                        ? "Stop recording"
                        : "Start recording"
                    }
                    aria-pressed={recordings.some((r) =>
                      ["in-progress", "paused"].includes(r.status),
                    )}
                    data-control-state={
                      recordings.some((r) => r.status === "in-progress")
                        ? "recording"
                        : recordings.some((r) => r.status === "paused")
                          ? "paused"
                          : "off"
                    }
                    disabled={busy || details.status !== "in-progress"}
                    onClick={() => {
                      const running = recordings.find((r) =>
                        ["in-progress", "paused"].includes(r.status),
                      );
                      if (running)
                        run(async () => {
                          await write(
                            "live/recordings/" + running.id,
                            { request_id: requestId(), status: "stopped" },
                            "PATCH",
                          );
                          await loadRecordings(details.id);
                        });
                      else setAction({ type: "record", call: details });
                    }}
                  >
                    <Icon name="record" size={17} />
                    <span>
                      {recordings.some((r) => r.status === "in-progress")
                        ? "Recording · Stop"
                        : recordings.some((r) => r.status === "paused")
                          ? "Recording paused"
                          : "Record call"}
                    </span>
                    <i aria-hidden="true" />
                  </button>
                </div>
              )}
              {active(details) && (
                <details className="more-call-actions">
                  <summary>Call actions</summary>
                  <div className="provider-actions">
                    <Btn
                      label="End call for everyone"
                      icon="end"
                      end={null}
                      onClick={() => setAction({ type: "end", call: details })}
                    />
                    <Btn
                      label="Transfer"
                      icon="routes"
                      end={null}
                      onClick={() =>
                        setAction({ type: "transfer", call: details })
                      }
                    />
                  </div>
                </details>
              )}
              <h3>Recordings</h3>
              {recordings.map((r) => (
                <article className="live-recording" key={r.id}>
                  <div>
                    <strong>{r.status}</strong>
                    <span>{duration(r.duration)}</span>
                  </div>
                  {["completed", "stopped"].includes(r.status) && (
                    <audio
                      controls
                      preload="none"
                      src={"/api/studio/live/recordings/" + r.id + "/audio"}
                    />
                  )}
                  <div className="provider-actions">
                    {r.status === "completed" && (
                      <TranscribeRecording
                        recording={r}
                        onSaved={(value) => {
                          if (currentCallId.current !== details.id) return;
                          setTranscripts((old) => [
                            value,
                            ...old.filter((t) => t.id !== value.id),
                          ]);
                          refresh();
                        }}
                      />
                    )}
                    {["in-progress", "paused"].includes(r.status) && (
                      <>
                        <Btn
                          label={
                            r.status === "paused"
                              ? "Resume recording"
                              : "Pause recording"
                          }
                          end={null}
                          aria-pressed={r.status === "paused"}
                          data-control-state={
                            r.status === "paused" ? "paused" : "off"
                          }
                          onClick={() =>
                            run(async () => {
                              await write(
                                "live/recordings/" + r.id,
                                {
                                  request_id: requestId(),
                                  status:
                                    r.status === "paused"
                                      ? "in-progress"
                                      : "paused",
                                },
                                "PATCH",
                              );
                              await loadRecordings(details.id);
                            })
                          }
                        />
                        <Btn
                          label="Stop recording"
                          end={null}
                          onClick={() =>
                            run(async () => {
                              await write(
                                "live/recordings/" + r.id,
                                { request_id: requestId(), status: "stopped" },
                                "PATCH",
                              );
                              await loadRecordings(details.id);
                            })
                          }
                        />
                      </>
                    )}
                    {!["in-progress", "paused"].includes(r.status) && (
                      <button
                        className="provider-text-button"
                        onClick={() =>
                          setAction({
                            type: "delete_recording",
                            recording: r,
                            call: details,
                          })
                        }
                      >
                        Delete from SignalWire
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {!recordings.length && (
                <p className="provider-muted">
                  No recording for this call. Capture is off by default.
                </p>
              )}
              <section>
                <div className="tools-list-heading">
                  <h3>Transcript</h3>
                  <Btn
                    label="Load provider transcript"
                    icon="transcript"
                    end={null}
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const result = await providerRequest(
                          "live/calls/" + details.id + "/transcripts",
                        );
                        if (currentCallId.current !== details.id) return;
                        setTranscripts((old) => [
                          ...old.filter((t) => t.source === "xai"),
                          ...result.transcripts,
                        ]);
                      })
                    }
                  />
                </div>
                {transcripts
                  .filter(
                    (t) =>
                      t.call_id === details.id ||
                      recordings.some((r) => r.id === t.recording_id),
                  )
                  .map((t) => (
                    <SavedTranscript
                      key={t.id}
                      transcript={t}
                      onDeleted={() => {
                        setTranscripts((old) =>
                          old.filter((item) => item.id !== t.id),
                        );
                        refresh();
                      }}
                    />
                  ))}
                {!transcripts.some(
                  (t) =>
                    t.call_id === details.id ||
                    recordings.some((r) => r.id === t.recording_id),
                ) && (
                  <p className="conversation-help">
                    No saved transcript. Choose Transcribe on a completed
                    recording, or load an existing provider transcript.
                  </p>
                )}
              </section>
              <CallNotes
                call={details}
                onAdd={addCallNote}
                onDelete={deleteCallNote}
              />
              {connections.find(
                (c) =>
                  c.id === details.connection_id ||
                  c.destination === details.destination,
              ) && (
                <Btn
                  label="Open contact memory"
                  icon="bookmark"
                  end={null}
                  onClick={() =>
                    setMemoryContact(
                      connections.find(
                        (c) =>
                          c.id === details.connection_id ||
                          c.destination === details.destination,
                      ),
                    )
                  }
                />
              )}
            </section>
          ) : (
            <>
              <h2>Live calls</h2>
              <div className="live-call-list">{calls.map(callCard)}</div>
              {!calls.length && (
                <p>
                  No active calls. Call an activated routing number, or start a
                  test callback from a connection.
                </p>
              )}
              <CallHistoryList
                records={history}
                onOpen={openCall}
                initialFilter={initialHistoryFilter}
              />
              <AgentReportedCalls />
            </>
          )}
        </>
      )}
      {numberOpen && (
        <LiveNumberDialog
          space={data.provider?.space}
          open={numberOpen}
          onClose={() => setNumberOpen(false)}
          onAdded={refresh}
        />
      )}
      <ContactMemoryDialog
        contact={memoryContact}
        snapshot={data}
        onClose={() => setMemoryContact(null)}
        onSave={async (contact, notes) => {
          await write(`live/contacts/${contact.id}/memory`, { notes }, "PATCH");
          await refresh();
        }}
      />
      <ConnectionEditor
        open={editorOpen}
        initial={editing}
        selectedNumber={selectedNumber}
        snapshot={data}
        onClose={() => setEditorOpen(false)}
        onBuy={() => {
          setEditorOpen(false);
          setNumberOpen(true);
        }}
        onSave={async (value) => {
          await write(
            "live/connections" + (editing ? "/" + editing.id : ""),
            value,
            editing ? "PATCH" : "POST",
          );
          await refresh();
        }}
      />
      <LiveActionDialog
        rooms={data.features?.browser_audio}
        space={data.provider?.space}
        action={action}
        onClose={() => setAction(null)}
        onSubmit={submitAction}
        connections={connections}
      />
      <button
        className="provider-text-button provider-refresh"
        disabled={busy}
        onClick={() => run(sync)}
      >
        <Icon name="activity" size={15} /> Refresh provider status
      </button>
    </div>
  );
}
