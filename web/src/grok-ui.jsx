import React, { useState } from "react";
import { A } from "./context.jsx";
import { Icon, Wave } from "./ui.jsx";

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

const examples = [
  {
    name: "Concierge",
    tone: "teal",
    state: "working",
    task: "Arranging a viewing…",
    destination: "London studio",
    initials: "LD",
    text: "Ten thirty London time works. May I have a reference for the viewing?",
    flag: "🇬🇧",
  },
  {
    name: "Travel",
    tone: "orange",
    state: "idle",
    task: "Ready for the next trip.",
    destination: "Your next destination",
    initials: "✈",
    text: "Add a destination and a short brief. Your agent takes it from there.",
    flag: "🌐",
  },
  {
    name: "Reception",
    tone: "purple",
    state: "done",
    task: "Everything, in one place.",
    destination: "Your connections",
    initials: "↗",
    text: "Keep a clear view of your connections, call plans and conversation details.",
    flag: "↗",
  },
];

export function LandingActivity() {
  const [selected, setSelected] = useState(0);
  const bot = examples[selected];
  const conversation = [
    {
      speaker: "Your agent",
      text: "Could we arrange a studio viewing for Tuesday morning?",
      agent: true,
    },
    {
      speaker: "London studio",
      text: "Of course. We have 10:30 on Tuesday morning.",
      agent: false,
    },
    {
      speaker: "Your agent",
      text: "10:30 London time works. May I have a reference for the viewing?",
      agent: true,
    },
  ];
  return (
    <div className="landing-activity" aria-label="Interactive sample workspace">
      <div className="landing-activity-top">
        <span>One agent in focus.</span>
        <span>Sample workspace</span>
      </div>
      <div
        className="landing-bots"
        role="group"
        aria-label="Explore sample agents"
      >
        {examples.map((item, index) => (
          <button
            key={item.name}
            type="button"
            aria-pressed={selected === index}
            onClick={() => setSelected(index)}
          >
            <BotFace size={76} state={item.state} tone={item.tone} />
            <strong>{item.name}</strong>
            <small>
              {index === 0 ? "Calling…" : index === 1 ? "Ready" : "Up to date"}
            </small>
          </button>
        ))}
      </div>
      <div className="landing-focus" data-tone={bot.tone}>
        <div className="landing-focus-heading">
          <StateTag state={bot.state}>
            {selected === 0 ? "Sample call" : "Illustration"}
          </StateTag>
          <span>
            {bot.flag} {bot.destination}
          </span>
        </div>
        <h3>{bot.task}</h3>
        {selected === 0 ? (
          <ol
            className="landing-conversation"
            aria-label="Fictional sample conversation"
          >
            {conversation.map((line, index) => (
              <li
                className={
                  "landing-dialogue " +
                  (line.agent ? "from-agent" : "from-business")
                }
                key={index}
              >
                {line.agent ? (
                  <BotFace size={28} tone={bot.tone} />
                ) : (
                  <span className="landing-business-avatar" aria-hidden="true">
                    LD
                  </span>
                )}
                <div>
                  <strong>{line.speaker}</strong>
                  <p>{line.text}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="landing-dialogue">
            <BotFace size={30} tone={bot.tone} />
            <p>{bot.text}</p>
          </div>
        )}
        <div className="landing-listen">
          <Wave muted={selected !== 0} animated={selected === 0} />
          <A
            to={
              selected === 0
                ? "/studio/demo/call/"
                : "/studio/demo/connections/"
            }
          >
            <Icon
              name={selected === 0 ? "headphones" : "connection"}
              size={17}
            />
            {selected === 0 ? "Listen in" : "Explore connections"}
            <Icon name="arrow" size={15} />
          </A>
        </div>
      </div>
      <p className="landing-preview-label">
        Your agent stays in the conversation. You stay in the loop.
      </p>
    </div>
  );
}
