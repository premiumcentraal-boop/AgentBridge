import React, { useEffect, useId, useState } from "react";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { A, useRoute } from "./context.jsx";
import { ActiveCallCard } from "./studio-navigation.jsx";
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

export function FocusCall({ call, isDemo, navTo, onListen, onRestart }) {
  const { go } = useRoute();
  return call.active ? (
    <ActiveCallCard
      call={call}
      onOpen={() => go(navTo("call"))}
      onJump={() => {
        go(navTo("call"));
        onListen();
      }}
    />
  ) : (
    <div className="number-empty">
      <h2>No active call</h2>
      {isDemo && <Btn label="Restart call" onClick={onRestart} />}
    </div>
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
          {call.transcription && isDemo ? "Following" : "Off"}
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
          <h3>Transcription off</h3>
          <p>View and manage the transcript in the call.</p>
        </div>
      )}
      <A className="hub-text-link" to={navTo("call")}>
        {call.transcription ? "Open call & transcript" : "Open transcript"}
        <Icon name="arrow" size={15} />
      </A>
    </Card>
  );
}

export function RoutingReview({
  open,
  destinationId,
  connections = [],
  numbers = [],
  call,
  isDemo,
  onClose,
  onSave,
}) {
  const id = useId();
  const [selected, setSelected] = useState("");
  const available = connections.filter(
    (connection) =>
      connection.status === "saved" &&
      numbers.some(
        (number) =>
          number.status === "owned" &&
          number.id === connection.routing_number_id,
      ),
  );
  useEffect(() => {
    if (open) setSelected(destinationId || available[0]?.id || "");
  }, [open, destinationId]);
  const route = available.find((connection) => connection.id === selected),
    number = numbers.find((number) => number.id === route?.routing_number_id);
  return (
    <Dialog
      maxHeight="calc(100dvh - 32px)"
      isOpen={open}
      onOpenChange={(value) => !value && onClose()}
      width={550}
      className="tools-dialog routing-review-dialog"
      aria-label="Review call routing"
    >
      <DialogHeader
        className="tools-dialog-heading"
        title="Route call"
        onOpenChange={onClose}
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
        <label htmlFor={id}>
          Connection
          <select
            id={id}
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            {!available.length && (
              <option value="">No saved connections</option>
            )}
            {available.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {connection.label} · {connection.destination}
              </option>
            ))}
          </select>
        </label>
        <div className="connection-number-pair routing-review-pair">
          <div>
            <small>Routing number</small>
            <strong>{number?.e164 || "—"}</strong>
            <span>{number?.provider === "signalwire" ? "SignalWire" : ""}</span>
          </div>
          <Icon name="arrow" size={18} />
          <div>
            <small>Destination number</small>
            <strong>{route?.destination || "—"}</strong>
            <span>{route?.label || "Select a connection"}</span>
          </div>
        </div>
        <p className="number-checkout-note">
          Saves a routing choice. The current call stays connected.
        </p>
        <div className="tools-dialog-actions">
          <Btn label="Cancel" end={null} onClick={onClose} />
          <Btn
            label="Save routing choice"
            primary
            type="submit"
            disabled={!route}
          />
        </div>
      </form>
    </Dialog>
  );
}
