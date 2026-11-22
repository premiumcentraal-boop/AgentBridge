import React, { useEffect, useId, useRef, useState } from "react";
import { BotFace, StateTag } from "./grok-ui.jsx";
import { Btn, DirectionArrow, Icon, Wave } from "./ui.jsx";
import { CallCaptureControls } from "./conversations.jsx";
import { displayPhone } from "../../shared/phone.mjs";
import { ConnectionPath } from "./connection-path.jsx";

export const callDuration = (seconds) =>
  `${Math.floor((seconds || 0) / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor((seconds || 0) % 60)
    .toString()
    .padStart(2, "0")}`;

export const isActiveCarrierCall = (call) =>
  ["queued", "ringing", "in-progress"].includes(call.status);
export const carrierConnected = (call) =>
  call.status === "in-progress" || call.room_ready === true;
export function currentCarrierCalls(snapshot) {
  return (snapshot.calls || []).filter(
    (call) =>
      isActiveCarrierCall(call) &&
      !call.parent_call_id &&
      (!call.room_call_id || call.room_call_id === call.id),
  );
}
export function carrierCallView(call, snapshot) {
  if (!call) return { active: false, elapsed: 0, loading: !snapshot.mode };
  const contact = snapshot.connections.find(
    (c) =>
      c.id === call.connection_id ||
      c.destination === (call.destination || call.to),
  );
  const number = snapshot.routing_numbers.find(
    (n) => n.id === contact?.routing_number_id,
  );
  return {
    ...call,
    active: true,
    carrier: true,
    label: contact?.label || call.label || call.to,
    destination: call.destination || contact?.destination || call.to,
    routing_number: call.routing_number || number?.e164 || call.from,
    elapsed: call.duration || 0,
  };
}

export function ActiveCallCard({
  call,
  onOpen,
  onJump,
  compact = false,
  navigation = false,
  expandable = false,
  transcript = [],
  onToggleCapture,
  actionLabel,
}) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  useEffect(() => {
    if (!call.active) setExpanded(false);
  }, [call.active]);
  if (!call.active)
    return (
      <div className="nav-call-empty">
        <Icon name="phone" size={17} />
        {!compact && (
          <span>{call.loading ? "Checking calls…" : "No active call"}</span>
        )}
      </div>
    );
  const openOverview = onOpen || onJump;
  const visibleLines = transcript
    .filter(
      (line) =>
        line.start <=
        (call.listening ? call.samplePosition || 0 : call.elapsed),
    )
    .slice(-3);
  const connected = !call.carrier || carrierConnected(call);
  const destination = call.destination || (call.carrier ? "" : "+442079460123");
  const routing = call.routing_number || (call.carrier ? "" : "+12025550110");
  const body = (
    <>
      {call.carrier ? (
        <span className="carrier-call-icon">
          <Icon name="calls" size={navigation ? 20 : 26} />
        </span>
      ) : (
        <BotFace size={navigation ? 36 : 56} tone="neutral" state="working" />
      )}
      <div className="active-call-identity">
        {!navigation && (
          <small className="active-call-label">{connected ? "Live call" : "Outgoing call"}</small>
        )}
        <strong>{call.label || (call.carrier ? "Phone call" : "London studio")}</strong>
        {!compact && (
          <span>{displayPhone(destination) || "Destination unavailable"}</span>
        )}
      </div>
      {!compact && (
        <div className="active-call-status">
          <StateTag state={connected ? "done" : "working"}>
            {connected ? "Connected" : "Calling…"}
          </StateTag>
          <time>{callDuration(call.elapsed)}</time>
        </div>
      )}
      {!compact && (expandable || onOpen) && (
        <DirectionArrow expanded={expandable && expanded} />
      )}
    </>
  );
  return (
    <section
      className={
        "active-call-card " +
        (navigation ? "nav-call-card " : "") +
        (compact ? "compact-call-card " : "") +
        (expandable ? "expandable-call-card" : "")
      }
      data-connected={connected}
      aria-label="Active call"
    >
      {expandable || onOpen ? (
        <button
          type="button"
          className="active-call-open"
          aria-label={
            expandable
              ? expanded
                ? "Minimize live call"
                : "Expand live call"
              : "Open call and transcript"
          }
          aria-expanded={expandable ? expanded : undefined}
          aria-controls={expandable ? detailsId : undefined}
          onClick={expandable ? () => setExpanded((value) => !value) : onOpen}
        >
          {body}
        </button>
      ) : (
        <div className="active-call-open">{body}</div>
      )}
      {!compact && (
        <>
          <div
            id={expandable ? detailsId : undefined}
            className="active-call-details"
            hidden={expandable && !expanded}
          >
            <ConnectionPath
              className="active-call-numbers"
              routing={routing}
              destination={destination}
            />
            {expandable && !call.carrier && (
              <div className="active-call-transcript">
                <div className="active-call-transcript-heading">
                  <Icon name="transcript" size={16} />
                  <strong>Transcript</strong>
                  <span>{call.transcription ? "Following" : "Off"}</span>
                </div>
                {call.transcription && visibleLines.length ? (
                  visibleLines.map((line) => (
                    <div className="active-call-transcript-line" key={line.id}>
                      <span>
                        {line.speaker}
                        <time>{callDuration(line.start)}</time>
                      </span>
                      <p>{line.text}</p>
                    </div>
                  ))
                ) : (
                  <p>
                    {call.transcription
                      ? "Waiting for words…"
                      : "Turn on the transcript here to follow the conversation."}
                  </p>
                )}
              </div>
            )}
            {expandable && onToggleCapture && (
              <CallCaptureControls
                call={call}
                onToggle={onToggleCapture}
                compact
              />
            )}
          </div>
          {openOverview && (
            <div className="active-call-actions">
              {expandable && !call.carrier && <Wave animated />}
              <Btn
                label={
                  actionLabel ||
                  (call.carrier
                    ? call.room_ready
                      ? "Join call"
                      : "View call"
                    : "Call overview")
                }
                icon="calls"
                primary
                end="arrow"
                onClick={openOverview}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function SavedCallCard({
  label,
  destination,
  country,
  onOpen,
  isPlan,
  onStart,
  current,
  anotherCall,
}) {
  return (
    <article className="active-call-card saved-call-card">
      <button
        type="button"
        className="active-call-open"
        aria-label={"Open " + label}
        onClick={onOpen}
      >
        <BotFace size={56} state="idle" tone="neutral" />
        <span className="active-call-identity">
          <strong>{label}</strong>
          <span>{destination}</span>
          <small>
            {country} · {isPlan ? "Saved call" : "Connection"}
          </small>
        </span>
        <StateTag state="idle">Ready</StateTag>
        <DirectionArrow />
      </button>
      {onStart && (
        <div className="saved-call-actions">
          <Btn
            label={current ? "Open call" : "Start demo call"}
            icon="calls"
            end={null}
            disabled={anotherCall}
            onClick={onStart}
          />
        </div>
      )}
    </article>
  );
}

// Native modal semantics provide focus containment and background inertness.
// The panel keeps its own entrance/exit so it always slides from the left.
export function StudioDrawer({ open, onClose, children }) {
  const dialog = useRef(null),
    restore = useRef(null),
    overflow = useRef(null);
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    let frame, timer;
    if (open) {
      if (!element.open) restore.current = document.activeElement;
      overflow.current ??= document.body.style.overflow;
      document.body.style.overflow = "hidden";
      if (!element.open) element.showModal();
      frame = requestAnimationFrame(() => setEntered(true));
    } else if (element.open) {
      setEntered(false);
      const finish = () => {
        element.close();
        if (overflow.current !== null) {
          document.body.style.overflow = overflow.current;
          overflow.current = null;
        }
        if (restore.current?.isConnected) restore.current.focus();
      };
      timer = setTimeout(
        finish,
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 160,
      );
    }
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [open]);
  useEffect(
    () => () => {
      if (overflow.current !== null)
        document.body.style.overflow = overflow.current;
    },
    [],
  );
  return (
    <dialog
      ref={dialog}
      className="studio-drawer"
      aria-label="Workspace navigation"
      data-entered={entered}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
    >
      <div className="studio-drawer-content">{children}</div>
    </dialog>
  );
}
