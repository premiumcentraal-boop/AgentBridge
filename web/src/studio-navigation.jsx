import React, { useEffect, useId, useRef, useState } from "react";
import { BotFace, StateTag } from "./grok-ui.jsx";
import { Btn, DirectionArrow, Icon, Wave } from "./ui.jsx";

export const callDuration = (seconds) =>
  `${Math.floor((seconds || 0) / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor((seconds || 0) % 60)
    .toString()
    .padStart(2, "0")}`;

export function ActiveCallCard({
  call,
  onOpen,
  onJump,
  compact = false,
  navigation = false,
  expandable = false,
  transcript = [],
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
        {!compact && <span>No active call</span>}
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
  const body = (
    <>
      <BotFace size={navigation ? 36 : 56} tone="neutral" state="working" />
      <div className="active-call-identity">
        <strong>{call.label || "London studio"}</strong>
        {!compact && <span>{call.destination || "+442079460123"}</span>}
      </div>
      {!compact && (
        <div className="active-call-status">
          <StateTag state="working">Connected</StateTag>
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
            <div className="active-call-numbers">
              <span>
                <small>Routing number</small>
                <b>{call.routing_number || "+12025550110"}</b>
              </span>
              <Icon name="arrow" size={14} />
              <span>
                <small>Destination</small>
                <b>{call.destination || "+442079460123"}</b>
              </span>
            </div>
            {expandable && (
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
                      : "Transcription is off. Manage it in the call overview."}
                  </p>
                )}
              </div>
            )}
          </div>
          {openOverview && (
            <div className="active-call-actions">
              {expandable && <Wave animated />}
              <Btn
                label="Call overview"
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
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220,
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
