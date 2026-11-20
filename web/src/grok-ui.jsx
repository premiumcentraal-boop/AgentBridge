import React from "react";

// Original AgentBridge UI artwork, built from CSS primitives. No brand assets
// or animation files from Grok, xAI or the Novra reference are included.
export function BotFace({
  size = 48,
  state = "idle",
  tone = "neutral",
  label,
}) {
  return (
    <span
      className={"bot-face bot-tone-" + tone}
      data-state={state}
      style={{ "--face-size": size + "px" }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <span className="bot-face-surface">
        <span className="bot-eyes">
          <i />
          <i />
        </span>
      </span>
      {state !== "idle" && (
        <span className="bot-state-badge">
          {state === "working" && (
            <>
              <i />
              <i />
              <i />
            </>
          )}
        </span>
      )}
    </span>
  );
}

export function StateTag({ state = "idle", children }) {
  return (
    <span className={"bot-state-tag state-" + state}>
      <i />
      {children}
    </span>
  );
}
