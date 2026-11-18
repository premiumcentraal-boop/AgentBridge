import React, { useEffect, useId, useState } from "react";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { A } from "./context.jsx";
import { Btn, Icon, Pill } from "./ui.jsx";
import { BotFace } from "./grok-ui.jsx";
import "./agents.css";

export function AgentsStudio({ api, isDemo }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false),
    [request, setRequest] = useState(null),
    [selected, setSelected] = useState([]),
    [call, setCall] = useState(null),
    [adding, setAdding] = useState(false),
    [callback, setCallback] = useState(""),
    [callRoom, setCallRoom] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const id = useId();
  const refresh = async () => setData(await api("agents"));
  useEffect(() => {
    if (isDemo) return;
    let alive = true;
    (async () => {
      try {
        const setup = await api("agents");
        if (!alive) return;
        setData(setup);
        const query = new URLSearchParams(location.search),
          auth = query.get("authorize"),
          plan = query.get("call");
        if (auth) {
          const result = await api(
            "agents/requests/" + encodeURIComponent(auth),
          );
          if (alive) {
            setRequest(result.request);
            setSelected(result.request.scopes);
          }
        }
        if (plan) {
          const result = await api("agents/calls/" + encodeURIComponent(plan));
          if (alive) setCall(result.call);
        }
      } catch (failure) {
        if (alive) setError(failure.message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isDemo]);
  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };
  const consent = (approved) =>
    run(async () => {
      const result = await api("agents/authorize", {
        method: "POST",
        body: JSON.stringify({
          request_id: request.id,
          approved,
          scopes: selected,
        }),
      });
      location.assign(result.redirect);
    });
  const [contact, setContact] = useState({
    name: "",
    number: "",
    country: "",
    notes: "",
  });
  if (isDemo)
    return (
      <div className="agent-workspace">
        <div className="agent-page-heading">
          <BotFace size={58} />
          <div>
            <h1>Connect your agent</h1>
            <p>Contacts and call history, ready for your next conversation.</p>
          </div>
        </div>
        <section className="agent-panel">
          <h2>Sign in to connect Grok</h2>
          <p>Your agent connection belongs to your private account.</p>
          <A to="/signup/" className="text-action">
            Create an account <Icon name="arrow" />
          </A>
        </section>
      </div>
    );
  return (
    <div className="agent-workspace">
      <div className="agent-page-heading">
        <BotFace size={58} tone="teal" />
        <div>
          <h1>Agents</h1>
          <p>Connect once. Bring your contacts and past conversations.</p>
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {request && (
        <section
          className="agent-panel agent-consent"
          aria-label="Connect agent request"
        >
          <Pill>Connection request</Pill>
          <h2>Connect {request.client_name}?</h2>
          <p>
            This app will access the permissions you choose for your AgentBridge
            account.
          </p>
          <small>Return address: {new URL(request.redirect_uri).origin}</small>
          <fieldset>
            <legend>Permissions</legend>
            {request.permissions.map((item) => (
              <label className="agent-permission" key={item.scope}>
                <input
                  type="checkbox"
                  checked={selected.includes(item.scope)}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, item.scope]
                        : current.filter((scope) => scope !== item.scope),
                    )
                  }
                />
                <span>{item.label}</span>
              </label>
            ))}
          </fieldset>
          <div className="agent-actions">
            <Btn
              label="Cancel connection"
              disabled={busy}
              end={null}
              onClick={() => consent(false)}
            />
            <Btn
              label="Connect app"
              disabled={busy || !selected.length}
              primary
              end={null}
              onClick={() => consent(true)}
            />
          </div>
        </section>
      )}
      {call && (
        <section className="agent-panel" aria-label="Approve prepared call">
          <Pill>{call.status.replaceAll("_", " ")}</Pill>
          <h2>{call.contact.name}</h2>
          <p>{call.destination}</p>
          {call.purpose && <p>{call.purpose}</p>}
          {call.transport === "callback" ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                run(async () => {
                  await api("agents/calls/" + call.id + "/approve", {
                    method: "POST",
                    body: JSON.stringify({
                      callback_number: callback,
                      studio_room: callRoom,
                      confirm_charges: confirmed,
                    }),
                  });
                  setCall((current) => ({ ...current, status: "approved" }));
                });
              }}
            >
              <p>
                SignalWire will call your phone first, then connect the
                destination. Each call is limited to five minutes. Your
                SignalWire project pays both legs at its provider rates.
              </p>
              {call.room_available && <label className="agent-permission"><input type="checkbox" checked={callRoom} onChange={e => setCallRoom(e.target.checked)} /><span>Enable a Studio room to join this callback.</span></label>}
              <label htmlFor={id + "callback"}>
                Your callback number
                <input
                  id={id + "callback"}
                  type="tel"
                  value={callback}
                  onChange={(event) => setCallback(event.target.value)}
                  required
                  placeholder="+1 202 555 0123"
                  maxLength={40}
                />
              </label>
              <label className="agent-permission">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>
                  I approve these numbers and the charges to my SignalWire
                  project.
                </span>
              </label>
              <div className="agent-actions">
                <Btn
                  label="Cancel preparation"
                  end={null}
                  disabled={
                    busy || !["prepared", "approved"].includes(call.status)
                  }
                  onClick={() =>
                    run(async () => {
                      await api("agents/calls/" + call.id + "/cancel", {
                        method: "POST",
                        body: "{}",
                      });
                      setCall((current) => ({
                        ...current,
                        status: "cancelled",
                      }));
                    })
                  }
                />
                <Btn
                  label={
                    call.status === "approved" ? "Approved" : "Approve callback"
                  }
                  type="submit"
                  primary
                  end={null}
                  disabled={busy || !confirmed || call.status !== "prepared"}
                />
              </div>
              {call.status === "approved" && (
                <p role="status">
                  Return to your agent to start the approved callback.
                </p>
              )}
            </form>
          ) : (
            <p>
              This preparation uses Grok Bot's native calling tool and its
              confirmation. It does not start a provider callback.
            </p>
          )}
        </section>
      )}
      {!data ? (
        <p role="status">Loading your agent connections…</p>
      ) : (
        <>
          <section className="agent-panel">
            <div className="agent-section-heading">
              <div>
                <h2>Connect Grok Bot</h2>
                <p>Use a custom Remote HTTPS connector.</p>
              </div>
              <Pill>
                {data.grants.filter((grant) => !grant.revoked_at).length}{" "}
                connected
              </Pill>
            </div>
            <label htmlFor={id + "url"}>
              MCP server URL
              <div className="agent-url">
                <input
                  id={id + "url"}
                  value={data.mcp_url}
                  readOnly
                  onFocus={(event) => event.target.select()}
                />
                <Btn
                  label={copied ? "Copied" : "Copy URL"}
                  end={null}
                  icon="copy"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(data.mcp_url);
                      setCopied(true);
                    } catch {
                      document.getElementById(id + "url").select();
                    }
                  }}
                />
              </div>
            </label>
            {!data.external_mcp_available && (
              <p className="conversation-help">
                External agent connections use the public AgentBridge service.
                This private preview keeps its own account data.
              </p>
            )}
            <ol className="agent-setup-steps">
              <li>Open Grok Bot's Connect apps.</li>
              <li>
                Add a custom connector. Choose Remote HTTPS and paste this URL.
              </li>
              <li>Sign in to AgentBridge and choose the app's permissions.</li>
              <li>
                Add the calling workflow so Grok checks your saved context
                before each call.
              </li>
            </ol>
            <a
              href={data.skill_url}
              className="text-action"
              download="agentbridge-calling-workflow.md"
            >
              Get calling workflow <Icon name="download" size={16} />
            </a>
            <p className="conversation-help">
              Grok's native phone calls currently support the US and keep their
              own call confirmation. Provider callbacks use your separate
              SignalWire setup.
            </p>
          </section>
          <section className="agent-panel">
            <div className="agent-section-heading">
              <h2>Connected apps</h2>
              <small>Revoke access at any time</small>
            </div>
            {data.grants.length ? (
              data.grants.map((grant) => (
                <article className="agent-grant" key={grant.id}>
                  <span className="agent-app-icon">
                    <Icon name="key" />
                  </span>
                  <div>
                    <strong>{grant.client_name || "MCP client"}</strong>
                    <small>
                      {grant.revoked_at
                        ? "Disconnected"
                        : grant.scopes
                            .map((scope) => scope.split(":")[0])
                            .filter(
                              (value, index, array) =>
                                array.indexOf(value) === index,
                            )
                            .join(" · ")}
                    </small>
                  </div>
                  <Btn
                    label={grant.revoked_at ? "Disconnected" : "Disconnect"}
                    end={null}
                    disabled={busy || Boolean(grant.revoked_at)}
                    onClick={() =>
                      run(() =>
                        api("agents/grants/" + grant.id, {
                          method: "DELETE",
                          body: "{}",
                        }),
                      )
                    }
                  />
                </article>
              ))
            ) : (
              <p>No agent connected yet.</p>
            )}
          </section>
          <section className="agent-panel">
            <div className="agent-section-heading">
              <div>
                <h2>Contacts</h2>
                <p>Saved numbers and context your agent can recognize.</p>
              </div>
              <Btn
                label="Add contact"
                icon="plus"
                primary
                end={null}
                onClick={() => {
                  setContact({ name: "", number: "", country: "", notes: "" });
                  setAdding(true);
                }}
              />
            </div>
            <div className="agent-contact-list">
              {data.contacts.length ? (
                data.contacts.map((item) => (
                  <article key={item.id}>
                    <span className="agent-contact-avatar">
                      {item.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <strong>{item.name}</strong>
                      <small>{item.number}</small>
                      {item.notes && <p>{item.notes}</p>}
                    </div>
                  </article>
                ))
              ) : (
                <p>Save a contact, then ask your agent to call them by name.</p>
              )}
            </div>
          </section>
        </>
      )}
      <Dialog
        isOpen={adding}
        onOpenChange={(open) => !open && setAdding(false)}
        width={520}
        maxHeight="calc(100dvh - 32px)"
        className="tools-dialog"
        aria-label="Save agent contact"
      >
        <DialogHeader
          className="tools-dialog-heading"
          title="Add contact"
          onOpenChange={() => setAdding(false)}
        />
        <form
          className="tools-dialog-body"
          onSubmit={(event) => {
            event.preventDefault();
            run(async () => {
              await api("agents/contacts", {
                method: "POST",
                body: JSON.stringify({
                  ...contact,
                  country: contact.country || undefined,
                }),
              });
              setAdding(false);
            });
          }}
        >
          <label htmlFor={id + "name"}>
            Name
            <input
              id={id + "name"}
              required
              maxLength={80}
              value={contact.name}
              onChange={(event) =>
                setContact((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </label>
          <label htmlFor={id + "number"}>
            Phone number
            <input
              id={id + "number"}
              type="tel"
              required
              maxLength={80}
              placeholder="+1 202 555 0123"
              value={contact.number}
              onChange={(event) =>
                setContact((current) => ({
                  ...current,
                  number: event.target.value,
                }))
              }
            />
          </label>
          <label htmlFor={id + "country"}>
            Country code (for a local number)
            <input
              id={id + "country"}
              maxLength={2}
              placeholder="US"
              value={contact.country}
              onChange={(event) =>
                setContact((current) => ({
                  ...current,
                  country: event.target.value.toUpperCase(),
                }))
              }
            />
          </label>
          <label htmlFor={id + "notes"}>
            Notes for your agent
            <textarea
              id={id + "notes"}
              rows={3}
              maxLength={2000}
              value={contact.notes}
              onChange={(event) =>
                setContact((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
            />
          </label>
          <div className="tools-dialog-actions">
            <Btn label="Cancel" end={null} onClick={() => setAdding(false)} />
            <Btn
              label={busy ? "Saving…" : "Save contact"}
              type="submit"
              primary
              disabled={busy}
              end={null}
            />
          </div>
        </form>
      </Dialog>
    </div>
  );
}
