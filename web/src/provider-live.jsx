import React, { useEffect, useId, useRef, useState } from "react";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Btn, Card, Icon, Pill } from "./ui.jsx";
import { ConnectionEditor } from "./number-studio.jsx";
import { AccountProfile, accountRequest } from "./account-auth.jsx";
import "./provider-live.css";

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

const blank = {
  routing_numbers: [],
  connections: [],
  calls: [],
  events: [],
  pending_actions: [],
};
const active = (c) => ["queued", "ringing", "in-progress"].includes(c.status);
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

function LiveNumberDialog({ open, onClose, onAdded, runBusy, space }) {
  const id = useId();
  const [tab, setTab] = useState("owned"),
    [inventory, setInventory] = useState([]),
    [results, setResults] = useState([]),
    [area, setArea] = useState("202"),
    [chosen, setChosen] = useState(""),
    [label, setLabel] = useState("Main line"),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const key = useRef(requestId());
  useEffect(() => {
    if (!open) return;
    let alive = true;
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
                onChange={(e) => setArea(e.target.value)}
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
                  : "Search an area code to see current availability."}
              </p>
            )}
          </fieldset>
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
          {tab === "buy" && (
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
              disabled={
                busy || runBusy || !chosen || (tab === "buy" && !consent)
              }
            />
          </div>
        </form>
      </div>
    </Dialog>
  );
}

function LiveActionDialog({ action, onClose, onSubmit, connections, space }) {
  const id = useId(),
    key = useRef(requestId());
  const [consent, setConsent] = useState(false),
    [callback, setCallback] = useState(""),
    [destination, setDestination] = useState(action?.connection?.id || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (action) {
      setConsent(false);
      setCallback("");
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
    end: "End this call",
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
          <p>This requests an end to the selected live call.</p>
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
  onState,
  account,
  onSignout,
  navTo,
  onModeChange,
}) {
  const [data, setData] = useState(blank),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [numberOpen, setNumberOpen] = useState(false),
    [editing, setEditing] = useState(null),
    [editorOpen, setEditorOpen] = useState(false),
    [action, setAction] = useState(null),
    [query, setQuery] = useState(""),
    [selectedCall, setSelectedCall] = useState(""),
    [recordings, setRecordings] = useState([]),
    [transcripts, setTranscripts] = useState([]);
  const mounted = useRef(true),
    syncing = useRef(false),
    stateCallback = useRef(onState);
  stateCallback.current = onState;
  const setSnapshot = (s) => {
    if (mounted.current) {
      setData(s);
      stateCallback.current?.(s);
    }
  };
  const refresh = async () => {
    const snapshot = await providerRequest("live/overview");
    setSnapshot(snapshot);
    return snapshot;
  };
  const sync = async () => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      setSnapshot(await write("live/sync"));
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
    calls = data.calls.filter(active),
    history = data.calls.filter((c) => !active(c));
  const matches = (value) =>
    !query || JSON.stringify(value).toLowerCase().includes(query.toLowerCase());
  const details = data.calls.find((c) => c.id === selectedCall);
  useEffect(() => {
    if (page !== "call") setSelectedCall("");
  }, [page]);
  const loadRecordings = async (id) => {
    const r = await providerRequest("live/calls/" + id + "/recordings");
    setRecordings(r.recordings);
  };
  useEffect(() => {
    if (!selectedCall) return;
    let alive = true;
    setRecordings([]);
    providerRequest("live/calls/" + selectedCall + "/recordings")
      .then((r) => alive && setRecordings(r.recordings))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [selectedCall, data.last_sync]);
  const submitAction = async (value) => {
    const body = {
      request_id: value.request_id,
      confirm_charges: value.confirm_charges,
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
  const callCard = (call) => (
    <button
      key={call.id}
      className="live-call-card"
      onClick={() => {
        setSelectedCall(call.id);
        navTo("call");
      }}
    >
      <span className="provider-icon">
        <Icon name="calls" size={24} />
      </span>
      <span>
        <strong>{call.to}</strong>
        <small>From {call.from}</small>
      </span>
      <Pill>{call.status}</Pill>
      <span>{duration(call.duration)}</span>
      <Icon name="arrow" />
    </button>
  );
  const connectionCards = connections.filter(matches).map((c) => {
    const number = data.routing_numbers.find(
      (n) => n.id === c.routing_number_id,
    );
    return (
      <article className="live-connection-card" key={c.id}>
        <div className="live-card-heading">
          <h2>{c.label}</h2>
          <Pill>
            {c.routing_state === "active"
              ? "Forwarding on"
              : c.routing_state === "inactive"
                ? "Saved"
                : "Needs review"}
          </Pill>
        </div>
        <div className="live-number-pair">
          <div>
            <small>Routing number</small>
            <strong>{number?.e164 || "Number unavailable"}</strong>
          </div>
          <Icon name="arrow" />
          <div>
            <small>Destination</small>
            <strong>{c.destination}</strong>
          </div>
        </div>
        <div className="provider-actions">
          {c.routing_state === "active" ? (
            <Btn
              label="Deactivate"
              disabled={busy}
              onClick={() => setAction({ type: "deactivate", connection: c })}
            />
          ) : c.routing_state === "inactive" ? (
            <>
              <Btn
                label="Activate forwarding"
                primary
                disabled={busy || number?.status !== "owned"}
                onClick={() => setAction({ type: "activate", connection: c })}
              />
              <Btn
                label="Edit"
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
                Remove
              </button>
            </>
          ) : (
            <Btn
              label="Reconcile provider state"
              onClick={() => run(() => write("live/reconcile"))}
            />
          )}
          <Btn
            label="Test callback"
            icon="calls"
            disabled={busy || number?.status !== "owned"}
            onClick={() => setAction({ type: "start", connection: c })}
          />
        </div>
        {c.routing_state === "active" && (
          <p className="provider-muted">
            Give {number?.e164} to your calling agent. Incoming calls forward to{" "}
            {c.destination}.
          </p>
        )}
      </article>
    );
  });
  if (page === "settings" || page === "connection")
    return (
      <div className="live-workspace">
        <SignalWireSettings onModeChange={onModeChange} />
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
      <div className="live-page-heading">
        <div>
          <span className="live-mode-label">LIVE TESTING · SIGNALWIRE</span>
          <h1>
            {page === "numbers"
              ? "Your numbers"
              : page === "connections"
                ? "Connections"
                : page === "routes"
                  ? "Routing"
                  : ["call", "calls"].includes(page)
                    ? "Calls"
                    : page === "memory"
                      ? "Recordings & transcripts"
                      : "Studio"}
          </h1>
        </div>
        <Btn
          label="Refresh provider"
          icon="activity"
          disabled={busy || syncing.current}
          onClick={() =>
            run(async () => {
              await sync();
            })
          }
        />
      </div>
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
      {page === "overview" && (
        <>
          <div className="live-shortcuts">
            <button onClick={() => setNumberOpen(true)}>
              <Icon name="numbers" size={28} />
              <strong>Get a number</strong>
              <span>Use owned or buy new</span>
              <Icon name="arrow" />
            </button>
            <button
              onClick={() => {
                setEditing(null);
                setEditorOpen(true);
              }}
            >
              <Icon name="connections" size={28} />
              <strong>Connect a destination</strong>
              <span>Pair it with your routing number</span>
              <Icon name="arrow" />
            </button>
          </div>
          {calls.length > 0 && (
            <section>
              <h2>Live calls</h2>
              <div className="live-call-list">
                {calls.filter((c) => !c.parent_call_id).map(callCard)}
              </div>
            </section>
          )}
          <section>
            <div className="live-section-heading">
              <h2>Connections</h2>
              <Btn label="View all" onClick={() => navTo("connections")} />
            </div>
            <div className="live-connections-grid">
              {connectionCards.length ? (
                connectionCards
              ) : (
                <p>Add a SignalWire number, then connect a destination.</p>
              )}
            </div>
          </section>
        </>
      )}
      {page === "numbers" && (
        <>
          <div className="provider-actions">
            <Btn
              label="Get a number"
              icon="plus"
              primary
              onClick={() => setNumberOpen(true)}
            />
          </div>
          <div className="live-connections-grid">
            {data.routing_numbers.map((n) => (
              <article className="live-connection-card" key={n.id}>
                <div className="live-card-heading">
                  <h2>{n.label}</h2>
                  <Pill>
                    {n.status === "owned" ? "Owned" : "Check provider"}
                  </Pill>
                </div>
                <strong className="live-number">{n.e164}</strong>
                <p className="provider-muted">SignalWire · {n.country}</p>
                <Btn
                  label="Connect destination"
                  disabled={n.status !== "owned"}
                  onClick={() => {
                    setEditing(null);
                    setEditorOpen(true);
                  }}
                />
              </article>
            ))}
          </div>
          {!data.routing_numbers.length && (
            <p>
              Import a number from your project, or search SignalWire for a new
              one.
            </p>
          )}
        </>
      )}
      {["connections", "routes"].includes(page) && (
        <>
          <div className="live-section-heading">
            <input
              type="search"
              aria-label="Search live connections"
              placeholder="Search connections…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Btn
              label="Connect destination"
              icon="plus"
              onClick={() => {
                setEditing(null);
                setEditorOpen(true);
              }}
            />
          </div>
          <div className="live-connections-grid">{connectionCards}</div>
          {!connections.length && (
            <p>Your saved destinations will appear here.</p>
          )}
        </>
      )}
      {["calls", "call"].includes(page) && (
        <>
          {details ? (
            <section className="live-connection-card">
              <div className="live-card-heading">
                <h2>{details.to}</h2>
                <Btn
                  label="Back to calls"
                  end={null}
                  onClick={() => {
                    setSelectedCall("");
                    navTo("calls");
                  }}
                />
              </div>
              <p>From {details.from}</p>
              <p>
                <strong>{details.status}</strong> · {duration(details.duration)}
              </p>
              {active(details) && (
                <div className="provider-actions">
                  <Btn
                    label="End call"
                    icon="end"
                    onClick={() => setAction({ type: "end", call: details })}
                  />
                  <Btn
                    label="Transfer"
                    icon="routes"
                    onClick={() =>
                      setAction({ type: "transfer", call: details })
                    }
                  />
                  <Btn
                    label="Record call"
                    disabled={details.status !== "in-progress"}
                    icon="record"
                    onClick={() => setAction({ type: "record", call: details })}
                  />
                </div>
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
                    {["in-progress", "paused"].includes(r.status) && (
                      <>
                        <Btn
                          label={
                            r.status === "paused"
                              ? "Resume recording"
                              : "Pause recording"
                          }
                          end={null}
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
              <p className="provider-muted">
                Browser listening, human conference join and live transcription
                are not connected for this call type. No sample audio or text is
                shown here.
              </p>
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
              <h2>Recent calls</h2>
              <div className="live-call-list">{history.map(callCard)}</div>
            </>
          )}
        </>
      )}
      {page === "memory" && (
        <>
          <p className="provider-muted">
            Recordings stay in your SignalWire project. Open a call to play,
            pause, stop or delete its recording.
          </p>
          <div className="live-call-list">{data.calls.map(callCard)}</div>
          <div className="provider-actions">
            <Btn
              label="Load provider transcripts"
              icon="transcript"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const r = await providerRequest("live/transcripts");
                  setTranscripts(r.transcripts);
                  if (!r.transcripts.length)
                    setNotice(
                      "No provider-generated transcripts are available for these calls.",
                    );
                })
              }
            />
          </div>
          {transcripts.map((t) => (
            <article className="live-connection-card" key={t.id}>
              <Pill>{t.status}</Pill>
              <p className="live-transcript">{t.text}</p>
            </article>
          ))}
        </>
      )}
      <LiveNumberDialog
        space={data.provider?.space}
        open={numberOpen}
        onClose={() => setNumberOpen(false)}
        onAdded={refresh}
        runBusy={busy}
      />
      <ConnectionEditor
        open={editorOpen}
        initial={editing}
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
        space={data.provider?.space}
        action={action}
        onClose={() => setAction(null)}
        onSubmit={submitAction}
        connections={connections}
      />
      <p className="provider-muted live-footer-note">
        Your SignalWire project pays number rental, calls and recording charges.
        Forwarding is limited to five minutes per call.
      </p>
    </div>
  );
}
