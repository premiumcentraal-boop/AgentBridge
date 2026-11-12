import React, { useEffect, useRef, useState } from "react";
import { BotFace, StateTag } from "./grok-ui.jsx";
import { Btn, Icon } from "./ui.jsx";

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
}) {
  if (!call.active)
    return (
      <div className="nav-call-empty">
        <Icon name="phone" size={17} />
        {!compact && <span>No active call</span>}
      </div>
    );
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
      {onOpen && <Icon name="chevron" size={15} />}
    </>
  );
  return (
    <section
      className={
        "active-call-card " +
        (navigation ? "nav-call-card " : "") +
        (compact ? "compact-call-card" : "")
      }
      aria-label="Active call"
    >
      {onOpen ? (
        <button
          type="button"
          className="active-call-open"
          aria-label="Open call and transcript"
          onClick={onOpen}
        >
          {body}
        </button>
      ) : (
        <div className="active-call-open">{body}</div>
      )}
      {!compact && (
        <>
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
          {onJump && (
            <div className="active-call-actions">
              <Btn
                label={call.joined ? "Return to call" : "Jump in"}
                icon={call.joined ? "phone" : "headphones"}
                primary
                end={null}
                onClick={call.joined && onOpen ? onOpen : onJump}
              />
            </div>
          )}
        </>
      )}
    </section>
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
