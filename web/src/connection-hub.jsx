import React, { useEffect, useId, useState } from "react";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { A } from "./context.jsx";
import { BotFace, StateTag } from "./grok-ui.jsx";
import { Btn, Card, Icon, Wave } from "./ui.jsx";
import sample from "./samples/sample-call.json";

const duration = (n = 0) =>
  `${Math.floor(n / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(n % 60)
    .toString()
    .padStart(2, "0")}`;
const place = (number) =>
  number.startsWith("+44")
    ? ["🇬🇧", "United Kingdom"]
    : number.startsWith("+31")
      ? ["🇳🇱", "Netherlands"]
      : number.startsWith("+1")
        ? ["🇺🇸", "North America"]
        : ["🌐", "International"];

function NewConnectionAction({ onClick }) {
  return (
    <Btn
      label="New connection"
      aria-label="New connection"
      icon="plus"
      primary
      end={null}
      onClick={onClick}
      className="hub-new-connection"
    >
      <span className="hub-new-label">New connection</span>
    </Btn>
  );
}

export function FocusCall({
  call,
  isDemo,
  navTo,
  onListen,
  onRoute,
  onRestart,
}) {
  const active = isDemo && call.active;
  return (
    <Card
      className={"hub-focus-card " + (active ? "is-working" : "")}
      padding={0}
    >
      <div className="hub-panel-top">
        <span>{active ? "In conversation" : "Your call space"}</span>
        <StateTag state={active ? "working" : "idle"}>
          {active ? "Sample call" : "No live call"}
        </StateTag>
      </div>
      <div className="hub-focus-persona">
        <BotFace
          size={106}
          state={active ? "working" : "idle"}
          tone={active ? "teal" : "neutral"}
        />
        <div>
          <span>
            {active
              ? "YOUR AGENT IS CALLING…"
              : "READY FOR YOUR NEXT CONNECTION"}
          </span>
          <h2>{active ? "London studio" : "A place to connect."}</h2>
          <p>
            {active
              ? "Arranging a studio viewing"
              : "Add a connection. Prepare your first call."}
          </p>
        </div>
      </div>
      {active && (
        <div className="hub-call-path">
          <span>
            <Icon name="browser" size={14} /> Your agent
          </span>
          <i />
          <span>🇬🇧 London</span>
          <time>{duration(call.elapsed)}</time>
        </div>
      )}
      <div className="hub-focus-actions">
        {active ? (
          <>
            <Btn
              label={call.listening ? "Listening to sample" : "Listen in"}
              primary
              icon="headphones"
              end={null}
              onClick={onListen}
              disabled={Boolean(call.listening)}
            />
            <A
              to={navTo("call")}
              className="hub-round-action"
              aria-label="Open call and transcript"
            >
              <Icon name="transcript" />
            </A>
            <button
              className="hub-round-action"
              type="button"
              aria-label="Review routing for sample call"
              onClick={() => onRoute()}
            >
              <Icon name="routes" />
            </button>
          </>
        ) : isDemo ? (
          <Btn
            label="Restart sample call"
            icon="phone"
            primary
            onClick={onRestart}
          />
        ) : (
          <A to={navTo("calls")} className="hub-link-button">
            Prepare a call <Icon name="arrow" size={17} />
          </A>
        )}
      </div>
      <p className="hub-card-note">
        {active
          ? "Fictional audio · Listen muted · No microphone"
          : "Live calling requires the calling backend."}
      </p>
    </Card>
  );
}

export function TranscriptPeek({ call, isDemo, navTo }) {
  const elapsed = call.listening ? call.samplePosition || 0 : call.elapsed;
  const lines = sample.transcript
    .filter((line) => line.start <= elapsed)
    .slice(-2);
  return (
    <Card className="hub-transcript-card" padding={0}>
      <div className="hub-panel-top">
        <span>Transcript</span>
        <span className="hub-small-label">
          {call.transcription && isDemo
            ? "Sample · following"
            : "Off by default"}
        </span>
      </div>
      {call.transcription && isDemo ? (
        <div className="hub-transcript-lines">
          {lines.map((line) => (
            <div key={line.id}>
              <span>
                {line.speaker} <time>{duration(line.start)}</time>
              </span>
              <p>{line.text}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="hub-transcript-empty">
          <Icon name="transcript" size={25} />
          <h3>Stay with the conversation.</h3>
          <p>Choose a transcript when you want the words alongside the call.</p>
        </div>
      )}
      <A className="hub-text-link" to={navTo("call")}>
        {call.transcription ? "Open call & transcript" : "Choose transcription"}
        <Icon name="arrow" size={15} />
      </A>
    </Card>
  );
}

export function ConnectionDashboard({
  snapshot,
  call,
  isDemo,
  navTo,
  onNew,
  onListen,
  onRoute,
  onRestart,
  setDetail,
}) {
  const routes = snapshot.routes.filter((r) => r.status === "draft");
  return (
    <div className="connection-hub hub-dashboard">
      <div className="hub-page-head">
        <div>
          <span className="hub-kicker">YOUR WORKSPACE</span>
          <h1>Your connections.</h1>
          <p>One place for every conversation.</p>
        </div>
        <NewConnectionAction onClick={onNew} />
      </div>
      <div className="hub-section-label">
        <h2>{isDemo && call.active ? "On a call" : "Calls"}</h2>
        <A to={navTo("calls")}>
          All calls <Icon name="chevron" size={14} />
        </A>
      </div>
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
      <div
        className="hub-agent-strip"
        aria-label={isDemo ? "Sample agent shortcuts" : "Agent shortcuts"}
      >
        <A to={navTo("call")}>
          <BotFace
            size={54}
            state={isDemo && call.active ? "working" : "idle"}
            tone="teal"
          />
          <span>
            <strong>Your agent</strong>
            <small>
              {isDemo && call.active
                ? "Sample call in progress…"
                : "No active call"}
            </small>
          </span>
          {isDemo && call.active && <span className="hub-unread" />}
        </A>
        <A to={navTo("connections")}>
          <BotFace size={54} tone="orange" />
          <span>
            <strong>Next connections</strong>
            <small>
              {routes.length} saved destination{routes.length === 1 ? "" : "s"}
            </small>
          </span>
          <Icon name="chevron" size={16} />
        </A>
        <A to={navTo("connection")}>
          <BotFace
            size={54}
            state={snapshot.integration_configured ? "idle" : "attention"}
            tone="purple"
          />
          <span>
            <strong>Calling setup</strong>
            <small>
              {snapshot.integration_configured
                ? "Review connection"
                : "Needs your attention"}
            </small>
          </span>
          <Icon name="chevron" size={16} />
        </A>
      </div>
      <div className="hub-section-label">
        <h2>Connections</h2>
        <A to={navTo("connections")}>
          See all <Icon name="chevron" size={14} />
        </A>
      </div>
      <div className="hub-destination-grid">
        {routes.slice(0, 3).map((route) => (
          <button
            className="hub-destination-card"
            key={route.id}
            type="button"
            onClick={() => setDetail(route)}
          >
            <span className="hub-country">{place(route.destination)[0]}</span>
            <span>
              <strong>{route.label}</strong>
              <small>{route.destination}</small>
              <em>Saved destination · Draft</em>
            </span>
            <Icon name="chevron" size={16} />
          </button>
        ))}
        <button
          type="button"
          className="hub-destination-card hub-add-connection"
          onClick={onNew}
        >
          <span className="hub-country">
            <Icon name="plus" size={23} />
          </span>
          <span>
            <strong>Add a connection</strong>
            <small>A name and an international number.</small>
          </span>
        </button>
      </div>
      <div className="hub-bottom-actions">
        <A to={navTo("routes")}>
          <Icon name="routes" />
          <span>
            <strong>Keep calls moving.</strong>
            <small>Prepare and review routing.</small>
          </span>
          <Icon name="arrow" size={16} />
        </A>
        <A to={navTo("memory")}>
          <Icon name="memory" />
          <span>
            <strong>Pick up where you left off.</strong>
            <small>Recordings, transcripts and outcomes.</small>
          </span>
          <Icon name="arrow" size={16} />
        </A>
      </div>
    </div>
  );
}

export function ConnectionsPage({
  snapshot,
  onNew,
  onRoute,
  setDetail,
  navTo,
}) {
  const [query, setQuery] = useState("");
  const routes = snapshot.routes.filter(
    (route) =>
      route.status === "draft" &&
      `${route.label} ${route.destination}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  return (
    <div className="connection-hub">
      <div className="hub-page-head">
        <div>
          <span className="hub-kicker">YOUR PEOPLE & DESTINATIONS</span>
          <h1>Connections.</h1>
          <p>A name. A number. A clear next step.</p>
        </div>
        <NewConnectionAction onClick={onNew} />
      </div>
      <label className="hub-search">
        <Icon name="search" size={19} />
        <input
          type="search"
          placeholder="Search connections"
          aria-label="Search connections"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="hub-section-label">
        <h2>
          Saved destinations <small>{routes.length}</small>
        </h2>
        <A to={navTo("connection")}>
          Calling setup <Icon name="chevron" size={14} />
        </A>
      </div>
      <Card className="hub-connections-list" padding={0}>
        {routes.length ? (
          routes.map((route) => (
            <div className="hub-connection-row" key={route.id}>
              <button type="button" onClick={() => setDetail(route)}>
                <span className="hub-country">
                  {place(route.destination)[0]}
                </span>
                <span>
                  <strong>{route.label}</strong>
                  <small>
                    {place(route.destination)[1]} · {route.destination}
                  </small>
                </span>
              </button>
              <span className="hub-saved-label">Draft</span>
              <Btn
                label={"Route to " + route.label}
                icon="routes"
                end={null}
                onClick={() => onRoute(route.id)}
              />
            </div>
          ))
        ) : (
          <div className="hub-list-empty">
            <BotFace size={76} />
            <h2>
              {query
                ? "No connections found."
                : "Your next connection starts here."}
            </h2>
            <p>
              {query
                ? "Try another name or number."
                : "Save a destination, then prepare a call or review routing."}
            </p>
            {!query && (
              <Btn
                label="Add your first connection"
                onClick={onNew}
                primary
                icon="plus"
              />
            )}
          </div>
        )}
      </Card>
      <p className="hub-inline-note">
        <Icon name="shield" size={15} /> Saved destinations are route drafts.
        Adding one never calls the number or activates routing.
      </p>
    </div>
  );
}

export function RoutingReview({
  open,
  destinationId,
  routes,
  call,
  isDemo,
  onClose,
  onSave,
}) {
  const id = useId();
  const [selected, setSelected] = useState("");
  const available = routes.filter((route) => route.status === "draft");
  useEffect(() => {
    if (open) setSelected(destinationId || available[0]?.id || "");
  }, [open, destinationId]);
  const route = available.find((item) => item.id === selected);
  return (
    <Dialog
      isOpen={open}
      onOpenChange={(value) => !value && onClose()}
      width={560}
      className="tools-dialog routing-review-dialog"
      aria-label="Review call routing"
    >
      <DialogHeader
        className="tools-dialog-heading"
        title="Where should this go?"
        onClose={onClose}
      />
      <form
        className="tools-dialog-body"
        onSubmit={(event) => {
          event.preventDefault();
          if (route) {
            onSave(route);
            onClose();
          }
        }}
      >
        <StateTag state="idle">Routing review · No transfer</StateTag>
        <div className="routing-review-path">
          <div>
            <BotFace
              size={64}
              tone="teal"
              state={isDemo && call.active ? "working" : "idle"}
            />
            <strong>Your agent</strong>
            <small>
              {isDemo && call.active
                ? "Sample call in progress"
                : "Calling backend required"}
            </small>
          </div>
          <Icon name="arrow" size={25} />
          <div>
            <span className="hub-country">
              {route ? place(route.destination)[0] : <Icon name="connection" />}
            </span>
            <strong>{route?.label || "A new destination"}</strong>
            <small>{route?.destination || "Add a connection first"}</small>
          </div>
        </div>
        <label htmlFor={id}>
          Route to
          <select
            id={id}
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            {!available.length && (
              <option value="">No saved destinations</option>
            )}
            {available.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} · {item.destination}
              </option>
            ))}
          </select>
        </label>
        <div className="tools-note">
          <Icon name="shield" />
          <p>
            {isDemo
              ? "This saves a routing choice in the sample call. Your agent stays on the current call; no transfer or carrier request is made."
              : "Review only. Live routing needs an authorized calling backend and route approval. Your saved destination is unchanged."}
          </p>
        </div>
        <div className="tools-dialog-actions">
          <Btn label="Cancel" onClick={onClose} end={null} />
          <Btn
            label={isDemo ? "Save routing preview" : "Finish review"}
            primary
            type="submit"
            disabled={!route}
          />
        </div>
      </form>
    </Dialog>
  );
}
