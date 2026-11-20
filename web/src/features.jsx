import React, { useEffect, useRef, useState } from "react";
import { A } from "./context.jsx";
import { Card, Icon, Mark, Wave } from "./ui.jsx";
import { SampleRecording } from "./call-tools.jsx";
import { BotFace } from "./grok-ui.jsx";
export const EXTENSIONS = [
  {
    key: "international",
    path: "/international-calling/",
    icon: "globe",
    eyebrow: "INTERNATIONAL CALLING",
    title: "Call across borders.",
    description:
      "Prepare an international destination and a clear brief. Your original agent stays with the conversation.",
    action: "Explore international calling",
  },
  {
    key: "memory",
    path: "/call-memory/",
    icon: "record",
    eyebrow: "OPTIONAL RECORDING & TRANSCRIPTION",
    title: "Recordings and transcripts.",
    description:
      "Return to the audio, search the words and find the result. Recording and transcription are separate choices.",
    action: "Explore call memory",
  },
  {
    key: "join",
    path: "/join-call/",
    icon: "join",
    eyebrow: "CALL ROOMS",
    title: "Join the call.",
    description:
      "Step in alongside your agent when a personal explanation or decision needs you. Then leave the agent to continue.",
    action: "Explore joining a call",
  },
];
function FeatureArt({ type, interactive = false }) {
  const [joined, setJoined] = useState(false),
    [country, setCountry] = useState("US");
  const [countries, setCountries] = useState(null);
  useEffect(() => {
    const list =
      document.getElementById("foundation-root")?.dataset.callbackCountries;
    if (list !== undefined) setCountries(list.split(","));
  }, []);
  return (
    <div className={"extension-art extension-art-" + type}>
      {type === "international" ? (
        <>
          <div className="country-route">
            <div className="feature-country">
              <span>🇺🇸</span>
              <small>US access</small>
            </div>
            <div className="feature-connection-line">
              <i />
              <Mark />
              <i />
            </div>
            <div className="feature-country">
              <span>
                {{ US: "🇺🇸", NL: "🇳🇱", GB: "🇬🇧", DE: "🇩🇪", JP: "🇯🇵" }[country]}
              </span>
              <small>{country} destination</small>
            </div>
          </div>
          {interactive && (
            <div
              className="feature-country-choices"
              role="group"
              aria-label="Illustrative destination"
            >
              {["US", "NL", "GB", "DE", "JP"].map((c) => (
                <button
                  type="button"
                  key={c}
                  aria-pressed={country === c}
                  onClick={() => setCountry(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          {interactive && (
            <small
              className="art-caption country-eligibility"
              aria-live="polite"
            >
              {!countries
                ? "Check callback availability in Studio → Agents."
                : countries.includes(country)
                  ? "Eligible for agent-requested callbacks on this site. Your carrier must allow the destination."
                  : "Outside this site’s agent-requested callback countries. You can still save the contact."}
            </small>
          )}
        </>
      ) : type === "memory" ? (
        <>
          <div className="feature-memory-disc">
            <Icon name="record" size={32} />
          </div>
          <div className="feature-memory-wave">
            <Wave />
            <span>London studio viewing</span>
          </div>
          <div className="feature-transcript-mini">
            <i />
            <span>10:30 · London time</span>
            <small>Sample reference · DEMO 204</small>
          </div>
        </>
      ) : (
        <>
          <div className="feature-people">
            <span className="feature-agent-person">
              <BotFace size={52} tone="teal" />
              <small>Your agent</small>
            </span>
            <i />
            <span>
              L<small>Recipient</small>
            </span>
            {joined && (
              <>
                <i />
                <span className="you">
                  V<small>You’re in</small>
                </span>
              </>
            )}
          </div>
          {interactive ? (
            <button
              className="join-art-button"
              type="button"
              onClick={() => setJoined(!joined)}
            >
              <Icon name={joined ? "check" : "join"} size={16} />
              {joined ? "Leave illustration" : "Join sample room"}
            </button>
          ) : (
            <span className="join-art-hint">
              <Icon name="join" size={15} />
              Call room
            </span>
          )}
          {interactive && (
            <small className="art-caption">
              Illustrated call room · Microphone off
            </small>
          )}
        </>
      )}
    </div>
  );
}
export function FeatureCards({ standalone = false }) {
  return (
    <section
      className={"extension-section frame " + (standalone ? "standalone" : "")}
      aria-label="AgentBridge calling extensions"
    >
      <div className="extension-grid">
        {EXTENSIONS.map((feature) => (
          <Card key={feature.key} className="extension-card" padding={0}>
            <FeatureArt type={feature.key} />
            <div>
              <span className="eyebrow">{feature.eyebrow}</span>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
              <A to={feature.path} className="text-action">
                {feature.action}
                <Icon name="diagonal" size={14} />
              </A>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
export function Features() {
  return (
    <main id="main" tabIndex={-1}>
      <header className="guide-intro frame">
        <h1>Calling tools</h1>
        <p>Connect a destination, keep a record and join a call from Studio.</p>
      </header>
      <FeatureCards standalone />
    </main>
  );
}
const COPY = {
  international: {
    title: "Call across borders.",
    description:
      "Save a contact with its country code. Availability depends on the calling method, your workspace and your carrier.",
    steps: [
      [
        "Save the number",
        "Enter the complete international number and give the destination a name.",
      ],
      [
        "Check the country",
        "Studio → Agents lists the countries enabled for agent-requested callbacks. Your SignalWire project must also permit the destination.",
      ],
      [
        "Review both phones",
        "Choose the callback phone you will answer. Check the destination and both call legs before confirming.",
      ],
    ],
    faq: [
      [
        "Does Grok native calling use the same coverage?",
        "Native Grok calling follows its own US calling rules. An AgentBridge provider callback uses your SignalWire account and its enabled destinations.",
      ],
      [
        "Does saving a contact dial it?",
        "Saving a destination adds it to your connections. Calling and forwarding each require a separate action.",
      ],
    ],
  },
  memory: {
    title: "Keep the details you choose.",
    description:
      "Record with everyone’s permission, listen back and find a line in the transcript. Hear how it works in this 34-second sample.",
    steps: [
      [
        "Record with permission",
        "Start or stop recording from the call overview. Capture starts off.",
      ],
      [
        "Find a moment",
        "Read a saved transcript or transcribe a completed recording with your xAI project. Live captions appear only during the room session.",
      ],
      [
        "Return to the contact",
        "Open Calls to see the contact, duration, notes and any saved recordings or transcripts.",
      ],
    ],
    faq: [
      [
        "Can I recover audio after a call?",
        "Only audio captured with recording enabled can be played back. You can request a saved transcript later from an available completed recording.",
      ],
      [
        "Who pays for capture?",
        "Your SignalWire project handles recording and storage. Your xAI project handles optional transcription.",
      ],
    ],
  },
  join: {
    title: "Join the conversation.",
    description:
      "Open a live Studio call room, see the participants and start listening with your microphone off.",
    steps: [
      [
        "Enable a room",
        "Select Enable Studio call room when starting a callback or activating forwarding.",
      ],
      [
        "Choose how to join",
        "After the first phone answers, select Join call. Leave the microphone off to listen, or turn it on to speak.",
      ],
      [
        "Leave the phones connected",
        "Mute yourself or a named participant. Leave room exits your browser audio. End call for everyone also disconnects the phones.",
      ],
    ],
    faq: [
      [
        "Does every call have a room?",
        "Only room-enabled calls have browser audio. Direct phone calls still have a call overview and carrier controls.",
      ],
      [
        "Can I follow the words?",
        "In a joined room, turn on live captions after everyone agrees. Completed recordings can be transcribed separately.",
      ],
    ],
  },
};
export function FeaturePage({ type }) {
  const feature = EXTENSIONS.find((f) => f.key === type),
    copy = COPY[type],
    sampleRef = useRef(null);
  return (
    <main id="main" tabIndex={-1} className="public-guide">
      <section className="extension-hero frame">
        <div>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
          {type === "memory" ? (
            <button
              className="product-button"
              onClick={() => {
                sampleRef.current?.scrollIntoView({ block: "start" });
                sampleRef.current
                  ?.querySelector("audio")
                  ?.focus({ preventScroll: true });
              }}
            >
              <Icon name="headphones" />
              Explore the sample
            </button>
          ) : (
            <A
              to={type === "international" ? "/connect/" : "/how-it-works/"}
              className="product-text-action"
            >
              {type === "international"
                ? "Set up a destination"
                : "How calls work"}{" "}
              <Icon name="arrow" />
            </A>
          )}
        </div>
        <FeatureArt type={type} interactive />
      </section>
      {type === "memory" && (
        <section
          className="frame guide-sample"
          ref={sampleRef}
          aria-label="Sample call player"
        >
          <SampleRecording />
        </section>
      )}
      <section className="extension-steps frame">
        {copy.steps.map(([title, body]) => (
          <article key={title}>
            <h2>{title}</h2>
            <p>{body}</p>
          </article>
        ))}
      </section>
      <section className="extension-faq frame">
        <h2>Common questions</h2>
        <div>
          {copy.faq.map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <Icon name="plus" />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
      <nav
        className="extension-related frame"
        aria-label="Related calling tools"
      >
        {EXTENSIONS.filter((f) => f !== feature).map((f) => (
          <A key={f.key} to={f.path}>
            <Icon name={f.icon} />
            <strong>{f.title}</strong>
            <Icon name="arrow" />
          </A>
        ))}
      </nav>
    </main>
  );
}
export function ExtensionShortcuts({ navTo }) {
  return (
    <section className="studio-extension-shortcuts" aria-label="Calling tools">
      {[
        [
          "calls",
          "globe",
          "International calls",
          "Prepare the destination and your choices.",
        ],
        [
          "memory",
          "record",
          "Call memory",
          "Recording and transcripts, if you choose.",
        ],
        ["call", "join", "Join sample room", "A place alongside your agent."],
      ].map(([page, icon, title, text]) => (
        <A key={page} to={navTo(page)}>
          <Icon name={icon} />
          <div>
            <strong>{title}</strong>
            <small>{text}</small>
          </div>
          <Icon name="arrow" size={14} />
        </A>
      ))}
    </section>
  );
}
