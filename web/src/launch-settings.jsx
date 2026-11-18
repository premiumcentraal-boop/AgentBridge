import React, { useEffect, useId, useState } from "react";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Btn, Card, Icon, Pill } from "./ui.jsx";
import { A } from "./context.jsx";
async function request(path, method = "GET", body) {
  const response = await fetch("/api/" + path, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error?.message || "The request could not be completed.",
    );
  return result;
}
export function TranscriptionSettings() {
  const id = useId(),
    [status, setStatus] = useState(null),
    [key, setKey] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const refresh = () =>
    request("studio/transcription/settings").then(setStatus);
  useEffect(() => {
    let alive = true;
    request("studio/transcription/settings")
      .then((s) => alive && setStatus(s))
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
      await refresh();
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
          <Icon name="transcript" size={24} />
        </span>
        <div>
          <h2>Transcription</h2>
          <p>{status?.live_transcription ? "Live captions and saved recordings." : "Turn a saved recording into text."}</p>
        </div>
        {status?.configured && <Pill>Key saved</Pill>}
      </div>
      <p className="provider-muted">
        Your xAI project pays for transcription. Audio is sent when you confirm {status?.live_transcription ? "live captions or transcription of a saved recording" : "transcription of a saved recording"}.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await request("studio/transcription/settings", "PUT", {
              api_key: key,
            });
            setKey("");
            setMessage(
              "Key saved. Transcribe a completed recording from Calls to test it.",
            );
          });
        }}
      >
        <label htmlFor={id + "key"}>
          xAI API key
          <input
            id={id + "key"}
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            minLength={16}
            maxLength={512}
            required
            disabled={busy || !status?.vault_ready}
          />
        </label>
        <div className="provider-actions">
          <Btn
            label={
              busy ? "Saving…" : status?.configured ? "Replace key" : "Save key"
            }
            primary
            type="submit"
            end={null}
            disabled={busy || !status?.vault_ready}
          />
          {status?.configured && (
            <Btn
              label="Remove key"
              end={null}
              disabled={busy}
              onClick={() =>
                run(() =>
                  request("studio/transcription/settings", "DELETE", {}),
                )
              }
            />
          )}
        </div>
      </form>
      {!status?.vault_ready && status && (
        <p role="status">
          Secure storage needs to be configured on the server.
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {status?.unresolved_jobs?.map((job) => (
        <UnresolvedTranscription key={job.id} job={job} onResolved={refresh} />
      ))}
    </Card>
  );
}
export function SavedTranscript({ transcript, onDeleted }) {
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <article className="live-recording">
      <div>
        <strong>
          {transcript.source === "xai"
            ? "Saved transcript"
            : "Provider transcript"}
        </strong>
        <small>{transcript.language || ""}</small>
      </div>
      <p className="live-transcript">{transcript.text}</p>
      {transcript.source === "xai" && (
        <div className="provider-actions">
          {confirm ? (
            <>
              <span>Delete the saved text?</span>
              <Btn
                label="Cancel"
                end={null}
                disabled={busy}
                onClick={() => setConfirm(false)}
              />
              <Btn
                label="Delete transcript"
                end={null}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await request(
                      "studio/transcription/jobs/" + transcript.id,
                      "DELETE",
                      {},
                    );
                    onDeleted();
                  } catch (e) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </>
          ) : (
            <Btn
              label="Remove saved transcript"
              end={null}
              onClick={() => setConfirm(true)}
            />
          )}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </article>
  );
}
function UnresolvedTranscription({ job, onResolved }) {
  const id = useId(),
    [checked, setChecked] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="live-event">
      <strong>Transcription {job.status}</strong>
      <p>
        The result for recording {job.recording_id.slice(0, 8)} is unavailable.
        Check xAI usage before requesting another transcription. An earlier
        charge may still apply.
      </p>
      <label className="capture-consent-option" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
        />
        <span>
          I reviewed the provider usage and want to allow a new explicit
          attempt.
        </span>
      </label>
      <Btn
        label="Resolve this attempt"
        disabled={!checked || busy}
        end={null}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await request("studio/transcription/jobs/" + job.id, "PATCH", {
              reviewed_provider_usage: true,
            });
            onResolved();
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      />
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export function TranscribeRecording({ recording, onSaved }) {
  const id = useId(),
    [open, setOpen] = useState(false),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [operation] = useState(() => crypto.randomUUID());
  return (
    <>
      <Btn
        label="Transcribe recording"
        icon="transcript"
        end={null}
        onClick={() => {
          setOpen(true);
          setConsent(false);
        }}
      />
      <Dialog
        isOpen={open}
        onOpenChange={(value) => !busy && setOpen(value)}
        width={520}
        maxHeight="calc(100dvh - 32px)"
        className="tools-dialog"
        aria-label="Transcribe recording"
      >
        <DialogHeader
          title="Transcribe this recording"
          onOpenChange={() => !busy && setOpen(false)}
        />
        <form
          className="tools-dialog-body"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const result = await request(
                "studio/transcription/recordings/" + recording.id,
                "POST",
                {
                  request_id: operation,
                  consent_to_process: consent,
                  confirm_charges: consent,
                },
              );
              onSaved(result.transcript);
              setOpen(false);
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            Send this completed recording to xAI using your saved key. Your xAI
            account pays for transcription. AgentBridge saves the text; the
            audio stays in SignalWire.
          </p>
          <label className="capture-consent-option" htmlFor={id}>
            <input
              type="checkbox"
              id={id}
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              required
            />
            <span>
              I have permission to process this recording and agree to the
              provider charge.
            </span>
          </label>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="provider-actions">
            <Btn
              label="Cancel"
              disabled={busy}
              end={null}
              onClick={() => setOpen(false)}
            />
            <Btn
              label={busy ? "Transcribing…" : "Transcribe"}
              primary
              type="submit"
              end={null}
              disabled={busy || !consent}
            />
          </div>
        </form>
      </Dialog>
    </>
  );
}
export function AccountData({ account }) {
  const id = useId(),
    [open, setOpen] = useState(false),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="account-profile-card">
      <h2>Your data</h2>
      <p>
        Export your contacts, notes, call history and saved transcripts. Carrier
        recordings remain in your SignalWire project.
      </p>
      <div className="provider-actions">
        <a className="text-action" href="/api/auth/export" download>
          Download account data <Icon name="arrow" />
        </a>
        <Btn
          label="Delete account"
          end={null}
          onClick={() => {
            setOpen(true);
            setError("");
          }}
        />
      </div>
      <Dialog
        isOpen={open}
        onOpenChange={(value) => !busy && setOpen(value)}
        width={520}
        className="tools-dialog"
        aria-label="Delete account"
      >
        <DialogHeader
          title="Delete your account"
          onOpenChange={() => !busy && setOpen(false)}
        />
        <form
          className="tools-dialog-body"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const result = await request("auth/account", "DELETE", {
                confirmation,
                ...(account.auth_method === "chatgpt" ? {} : { password }),
              });
              location.assign(result.redirect);
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            This permanently removes your AgentBridge contacts, transcripts,
            notes and connected-app access. First deactivate your routes and
            disconnect SignalWire in Calling setup. Carrier numbers, recordings
            and billing remain with SignalWire.
          </p>
          {account.auth_method !== "chatgpt" && (
            <label htmlFor={id + "password"}>
              Current password
              <input
                id={id + "password"}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                maxLength={128}
                required
              />
            </label>
          )}
          <label htmlFor={id + "confirmation"}>
            Type DELETE
            <input
              id={id + "confirmation"}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
              required
              pattern="DELETE"
            />
          </label>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="provider-actions">
            <Btn
              label="Cancel"
              end={null}
              disabled={busy}
              onClick={() => setOpen(false)}
            />
            <Btn
              label={busy ? "Deleting…" : "Delete account permanently"}
              end={null}
              type="submit"
              disabled={busy || confirmation !== "DELETE"}
            />
          </div>
        </form>
      </Dialog>
    </section>
  );
}

export function AgentReportedCalls() {
  const [calls, setCalls] = useState([]),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    request("studio/agents/history")
      .then(
        (result) =>
          alive &&
          setCalls(
            result.calls.filter((call) => call.source === "agent_reported"),
          ),
      )
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);
  if (error)
    return <p role="status">Agent call history could not be loaded. {error}</p>;
  if (!calls.length) return null;
  return (
    <section className="agent-panel">
      <h2>Agent-reported calls</h2>
      <p className="provider-muted">
        Outcomes saved by your connected agent. Audio and carrier verification
        are only available for calls made through your provider.
      </p>
      {calls.map((call) => (
        <details className="live-event" key={call.id}>
          <summary>
            <strong>{call.label || call.destination}</strong> ·{" "}
            {new Date(call.started_at || call.created_at).toLocaleString()} ·{" "}
            {call.duration || 0}s
          </summary>
          <p>{call.summary}</p>
          {call.follow_ups?.length > 0 && (
            <ul>
              {call.follow_ups.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          )}
        </details>
      ))}
    </section>
  );
}

export function SetupChecklist() {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    request("studio/agents")
      .then((result) => alive && setData(result))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  if (!data) return null;
  const appReady = data.grants.some((grant) => !grant.revoked_at),
    setup = data.setup;
  if (
    setup.provider_connected &&
    setup.live_enabled &&
    setup.numbers &&
    appReady
  )
    return null;
  return (
    <section className="agent-panel setup-checklist" aria-label="Account setup">
      <h2>Your setup</h2>
      <A to="/studio/connection/">
        <Icon name="key" />
        <div>
          <strong>Connect SignalWire</strong>
          <small>
            {setup.provider_connected
              ? setup.live_enabled
                ? "Connected · live mode on"
                : "Connected · switch on live mode to use your project"
              : "Use your own project for numbers and calling"}
          </small>
        </div>
        <Icon
          name={
            setup.provider_connected && setup.live_enabled ? "check" : "arrow"
          }
          className={
            setup.provider_connected && setup.live_enabled ? "setup-done" : ""
          }
        />
      </A>
      <A to="/studio/numbers/">
        <Icon name="number" />
        <div>
          <strong>Get a routing number</strong>
          <small>
            {setup.numbers
              ? `${setup.numbers} number${setup.numbers === 1 ? "" : "s"} connected`
              : "Import a number you own, or buy one from SignalWire"}
          </small>
        </div>
        <Icon
          name={setup.numbers ? "check" : "arrow"}
          className={setup.numbers ? "setup-done" : ""}
        />
      </A>
      <A to="/studio/agents/">
        <Icon name="agents" />
        <div>
          <strong>Connect your agent</strong>
          <small>
            {appReady
              ? "Your agent can recognize contacts and recall past calls"
              : "Give Grok access to your contacts and call history"}
          </small>
        </div>
        <Icon
          name={appReady ? "check" : "arrow"}
          className={appReady ? "setup-done" : ""}
        />
      </A>
    </section>
  );
}
