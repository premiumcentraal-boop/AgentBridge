import React, { useId, useState } from "react";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { BotFace } from "./grok-ui.jsx";
import { ActiveCallCard } from "./studio-navigation.jsx";
import { CallCaptureControls } from "./conversations.jsx";
import { Btn, Card, Icon, Pill } from "./ui.jsx";
import sample from "./samples/sample-call.json";

const initials = (name = "Contact") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

export function CallRoom({
  call,
  connections,
  agentName,
  onJoin,
  onLeave,
  onMic,
  onAgentMute,
  onSpeakerMute,
  onEnd,
  onRoute,
  onRestart,
  onCapture,
  onParticipants,
}) {
  const [adding, setAdding] = useState(false),
    [selected, setSelected] = useState("");
  const selectId = useId();
  const guests = call.participant_connections || [];
  const available = connections.filter(
    (contact) =>
      contact.status === "saved" &&
      contact.destination !== call.destination &&
      !guests.some((guest) => guest.destination === contact.destination),
  );
  const position = call.listening ? call.samplePosition || 0 : call.elapsed;
  const line = sample.transcript.find(
    (line) => line.start <= position && line.end >= position,
  );
  const speaking = call.active && !call.playbackPaused ? line?.speaker : null;
  const agentSpeaking = speaking === "Agent" && !call.agentMuted;
  const contacts = [
    {
      id: call.connection_id || "recipient",
      label: call.label || "Contact",
      destination: call.destination,
      primary: true,
    },
    ...guests,
  ];
  return (
    <Card
      className={
        "tools-live-card call-room" + (call.joined ? " is-joined" : "")
      }
      padding={0}
    >
      <div className="call-room-heading live-card-top">
        <ActiveCallCard call={call} />
        <div className="call-room-status">
          <Pill>Demo call</Pill>
          <span>
            {contacts.length + 1 + (call.joined ? 1 : 0)} participants
          </span>
        </div>
      </div>
      <div className="call-view-entry-actions">
        {call.active && !call.joined && (
          <Btn
            label="Join call"
            icon="join"
            primary
            end={null}
            className="call-room-join"
            onClick={onJoin}
          />
        )}
        {call.joined && (
          <span className="call-room-joined">
            <Icon name="check" size={16} /> You’re in ·{" "}
            {call.userMuted ? "Microphone off" : "Microphone on (demo)"}
          </span>
        )}
      </div>
      <div
        className="call-participants call-room-participants"
        role="group"
        aria-label="Call participants"
      >
        <article
          className="call-person agent-person"
          data-speaking={Boolean(agentSpeaking)}
          aria-label={agentName + " participant"}
        >
          <div className="call-person-top">
            <span>Agent</span>
            <Icon name={call.agentMuted ? "muted" : "mute"} size={16} />
          </div>
          <div className="call-person-avatar">
            <BotFace
              size={80}
              state={agentSpeaking ? "working" : "idle"}
              tone="teal"
            />
          </div>
          <div className="call-person-name">
            <strong>{agentName}</strong>
            <small>
              {call.agentMuted
                ? "Agent muted"
                : agentSpeaking
                  ? "Speaking"
                  : call.active
                    ? "On call"
                    : "Call ended"}
            </small>
          </div>
          {call.joined && (
            <Btn
              label={call.agentMuted ? "Unmute agent" : "Mute agent"}
              icon={call.agentMuted ? "muted" : "mute"}
              end={null}
              aria-pressed={Boolean(call.agentMuted)}
              data-control-state={call.agentMuted ? "muted" : "off"}
              onClick={onAgentMute}
              disabled={!call.active}
            />
          )}
        </article>
        {contacts.map((contact) => (
          <article
            className="call-person contact-person"
            data-speaking={Boolean(contact.primary && speaking === "Recipient")}
            key={contact.id}
            aria-label={contact.label + " participant"}
          >
            <div className="call-person-top">
              <span>{contact.primary ? "Connection" : "Added connection"}</span>
              {!contact.primary && call.joined ? (
                <button
                  type="button"
                  className="call-person-remove"
                  aria-label={"Remove " + contact.label + " from demo call"}
                  onClick={() =>
                    onParticipants(
                      guests.filter((guest) => guest.id !== contact.id),
                    )
                  }
                >
                  <Icon name="close" size={15} />
                </button>
              ) : (
                <Icon name="phone" size={16} />
              )}
            </div>
            <div className="call-person-avatar">
              <span className="call-contact-initials">
                {initials(contact.label)}
              </span>
            </div>
            <div className="call-person-name">
              <strong>{contact.label}</strong>
              <small>{contact.destination}</small>
            </div>
            <span className="call-person-state">
              {contact.primary && speaking === "Recipient"
                ? "Speaking"
                : call.active
                  ? "On call"
                  : "Call ended"}
            </span>
          </article>
        ))}
        {call.joined && (
          <article
            className="call-person self-person"
            aria-label="Your participant card"
          >
            <div className="call-person-top">
              <span>You</span>
              <Icon name={call.userMuted ? "muted" : "mute"} size={16} />
            </div>
            <div className="call-person-avatar">
              <span className="call-contact-initials">You</span>
            </div>
            <div className="call-person-name">
              <strong>You’re in</strong>
              <small>
                {call.userMuted
                  ? "Listening · Microphone off"
                  : "Unmuted · Demo microphone"}
              </small>
            </div>
          </article>
        )}
      </div>
      {call.joined && (
        <div
          className="personal-call-controls"
          role="group"
          aria-label="Your call controls"
        >
          <Btn
            label={call.userMuted ? "Mic off" : "Mic on"}
            aria-label={
              call.userMuted ? "Unmute microphone" : "Mute microphone"
            }
            icon={call.userMuted ? "muted" : "mute"}
            end={null}
            aria-pressed={!call.userMuted}
            onClick={onMic}
          />
          <Btn
            label={call.muted ? "Speaker off" : "Speaker on"}
            aria-label={call.muted ? "Unmute speakers" : "Mute speakers"}
            icon="headphones"
            end={null}
            aria-pressed={!call.muted}
            onClick={onSpeakerMute}
          />
          <Btn label="Leave room" end={null} onClick={onLeave} />
        </div>
      )}
      {call.joined && (
        <div className="call-room-participant-actions">
          <span>
            Participant controls are simulated. Your microphone isn’t
            transmitted.
          </span>
          {available.length > 0 && guests.length < 6 && (
            <Btn
              label="Add connection"
              icon="join"
              end={null}
              onClick={() => {
                setSelected(available[0].id);
                setAdding(true);
              }}
            />
          )}
        </div>
      )}
      <div className="call-room-capture">
        <CallCaptureControls call={call} onToggle={onCapture} />
      </div>
      {call.active ? (
        <details className="more-call-actions">
          <summary>Call actions</summary>
          <div className="call-room-toolbar tools-actions">
            <Btn
              label="Route call"
              icon="routes"
              end={null}
              onClick={onRoute}
            />
            {call.recording && (
              <Btn
                label={
                  call.recordingPaused ? "Resume recording" : "Pause recording"
                }
                icon={call.recordingPaused ? "play" : "pause"}
                end={null}
                aria-pressed={Boolean(call.recordingPaused)}
                onClick={() => onCapture("pause")}
              />
            )}
            <Btn
              label="End call for everyone"
              icon="end"
              end={null}
              className="call-room-end"
              onClick={onEnd}
            />
          </div>
        </details>
      ) : (
        <Btn label="Restart call" onClick={onRestart} />
      )}
      {call.proposedRoute && (
        <p className="call-room-route">
          <Icon name="routes" size={15} />
          Next route: {call.proposedRoute.label}
        </p>
      )}
      <Dialog
        isOpen={adding && call.active && call.joined}
        onOpenChange={(open) => !open && setAdding(false)}
        width={460}
        maxHeight="calc(100dvh - 32px)"
        className="tools-dialog"
        aria-label="Add connection to demo call"
      >
        <DialogHeader
          className="tools-dialog-heading"
          title="Add a connection"
          onOpenChange={() => setAdding(false)}
        />
        <form
          className="tools-dialog-body"
          onSubmit={(event) => {
            event.preventDefault();
            const contact = available.find(
              (contact) => contact.id === selected,
            );
            if (!contact) return;
            onParticipants([
              ...guests,
              {
                id: contact.id,
                label: contact.label,
                destination: contact.destination,
              },
            ]);
            setAdding(false);
          }}
        >
          <label htmlFor={selectId}>
            Connection
            <select
              id={selectId}
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
              required
            >
              {available.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.label} · {contact.destination}
                </option>
              ))}
            </select>
          </label>
          <p className="conversation-help">
            Adds a participant card to this demo. No one is dialed.
          </p>
          <div className="tools-dialog-actions">
            <Btn label="Cancel" end={null} onClick={() => setAdding(false)} />
            <Btn
              label="Add to call"
              type="submit"
              primary
              disabled={!selected}
              end={null}
            />
          </div>
        </form>
      </Dialog>
    </Card>
  );
}
