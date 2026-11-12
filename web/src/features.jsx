import React, { useRef, useState } from "react";
import { A, useRoute } from "./context.jsx";
import { Btn, Card, Icon, Mark, Pill, Wave } from "./ui.jsx";
import { SampleRecording } from "./call-tools.jsx";
export const EXTENSIONS = [
  {
    key: "international",
    path: "/international-calling/",
    icon: "globe",
    eyebrow: "INTERNATIONAL CALLING",
    title: "A little further. Just as familiar.",
    description:
      "Prepare an international destination and a clear brief. Your original agent stays with the conversation.",
    action: "Explore international calling",
  },
  {
    key: "memory",
    path: "/call-memory/",
    icon: "record",
    eyebrow: "OPTIONAL RECORDING & TRANSCRIPTION",
    title: "Keep the details you choose.",
    description:
      "Return to the audio, search the words and find the result. Recording and transcription are separate choices.",
    action: "Explore call memory",
  },
  {
    key: "join",
    path: "/join-call/",
    icon: "join",
    eyebrow: "LET ME JOIN",
    title: "A place in the conversation.",
    description:
      "Step in alongside your agent when a personal explanation or decision needs you. Then leave the agent to continue.",
    action: "Explore joining a call",
  },
];
function FeatureArt({ type, interactive = false }) {
  const [joined, setJoined] = useState(false),
    [country, setCountry] = useState("NL");
  return (
    <div className={"extension-art extension-art-" + type}>
      {type === "international" ? (
        <>
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
            <span>{{ NL: "🇳🇱", GB: "🇬🇧", DE: "🇩🇪", JP: "🇯🇵" }[country]}</span>
            <small>{country} destination</small>
          </div>
          {interactive && (
            <div
              className="feature-country-choices"
              role="group"
              aria-label="Illustrative destination"
            >
              {["NL", "GB", "DE", "JP"].map((c) => (
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
        </>
      ) : type === "memory" ? (
        <>
          <div className="feature-memory-disc">
            <Icon name="record" size={32} />
          </div>
          <div className="feature-memory-wave">
            <Wave />
            <span>Every word, with a place to return.</span>
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
            <span>
              ✳<small>Your agent</small>
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
              {joined ? "Leave illustration" : "Let me join"}
            </button>
          ) : (
            <span className="join-art-hint">
              <Icon name="join" size={15} />
              Room for you
            </span>
          )}
          {interactive && (
            <small className="art-caption">
              Interactive illustration · No real call or microphone
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
      <div className="section-heading">
        <div>
          <span className="eyebrow">MORE FROM EVERY CONVERSATION</span>
          <h2>
            Reach further.
            <br />
            <span>Stay a little closer.</span>
          </h2>
        </div>
        <p>
          International calling, optional memory and a way to join. Explore the
          complete flows in the working studio preview.
        </p>
      </div>
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
      <section className="page-intro frame">
        <Pill>THE CALLING EXTENSIONS · PRODUCT PREVIEW</Pill>
        <h1>
          One familiar agent.
          <br />
          <span>More possibilities.</span>
        </h1>
        <p>
          Connect internationally, choose what to keep and join when a
          conversation needs you. Explore real pages and sample interactions.
        </p>
      </section>
      <FeatureCards standalone />
      <section className="extension-bottom-note frame">
        <Icon name="shield" />
        <p>
          The website and sample studio are available to explore. Live calling,
          capture and participant joining require an authorized, configured
          calling backend.
        </p>
      </section>
    </main>
  );
}
const COPY = {
  international: {
    heading: (
      <>
        A familiar voice.
        <br />
        <span>A further destination.</span>
      </>
    ),
    description:
      "Your agent calls an access number. AgentBridge is designed to prepare an approved route to the person you need to reach, with the destination, permission and price considered first.",
    steps: [
      [
        "Choose the destination",
        "Use the country code and full international number. Save a brief for your agent.",
      ],
      [
        "Choose your options",
        "Keep capture off, request a transcript, or request an audio recording after the required permission.",
      ],
      [
        "Review before connecting",
        "A verified carrier route, caller authorization and price are required before a real call can be placed.",
      ],
    ],
    faq: [
      [
        "Are all displayed countries live?",
        "No. The planner accepts destination details; it does not confirm live carrier coverage. Availability, calling permissions and a verified quote must be checked for each route.",
      ],
      [
        "Does AgentBridge replace my agent?",
        "The original agent remains the conversational AI. AgentBridge provides the calling route and the surrounding controls.",
      ],
      [
        "Will saving a plan start a call?",
        "No. Saving a plan stores preparation only. It creates no paid carrier reservation or phone call.",
      ],
    ],
  },
  memory: {
    heading: (
      <>
        The conversation ends.
        <br />
        <span>The details can stay.</span>
      </>
    ),
    description:
      "Choose an audio recording, a searchable transcript, or leave both off. Return to an important phrase, the proposed time or the reference you need, with a clear view of what is sample and what is real.",
    steps: [
      [
        "Make a choice",
        "Recording and transcription are independent and off by default. Save your preferences in the studio.",
      ],
      [
        "Confirm permission",
        "Capture needs the required notice and permission for the people on the call. A preference never starts capture.",
      ],
      [
        "Return to the details",
        "Explore the sample player, search by phrase or speaker and jump to the matching point in the audio.",
      ],
    ],
    faq: [
      [
        "Can I have a transcript without keeping audio?",
        "The product flow supports that preference. A live implementation needs a transcript service and a verified policy for audio processing and provider retention.",
      ],
      [
        "Can I pause recording?",
        "The sample call includes pause and resume controls. Live recording pause needs authenticated carrier control; a separate live transcription stream must be paused or excluded too when appropriate.",
      ],
      [
        "Is the sample conversation real?",
        "No. It is an original fictional script with synthetic demonstration voices. The booking, reference and participants are not a real call.",
      ],
    ],
  },
  join: {
    heading: (
      <>
        Your agent calls.
        <br />
        <span>You can be there too.</span>
      </>
    ),
    description:
      "Some moments need a personal explanation. Join alongside your agent, listen first, add what matters and leave when you’re ready. Your agent can continue the conversation.",
    steps: [
      [
        "Choose how you join",
        "The flow supports browser participation or a callback preference. Live joining needs a configured conference connection.",
      ],
      [
        "Step in on your terms",
        "Start muted, listen and choose when to speak. The studio shows you alongside the agent and recipient.",
      ],
      [
        "Leave the agent to continue",
        "Leaving your participant connection is separate from ending the whole call. Try both controls in the sample studio.",
      ],
    ],
    faq: [
      [
        "Does joining replace the AI agent?",
        "No. The intended conference flow adds you as another participant. The original agent can remain on the call.",
      ],
      [
        "Will the preview access my microphone or call me?",
        "No. Joining the sample only changes the demonstration participants. No microphone permission or carrier callback is requested.",
      ],
      [
        "What is needed for a real join?",
        "An active conference-capable call, verified participant authorization and a configured media connection or callback route. The current number-discovery integration does not provide live joining.",
      ],
    ],
  },
};
export function FeaturePage({ type }) {
  const feature = EXTENSIONS.find((f) => f.key === type),
    copy = COPY[type],
    sampleRef = useRef();
  return (
    <main id="main" tabIndex={-1}>
      <section className="extension-hero frame">
        <div>
          <Pill>PRODUCT PREVIEW</Pill>
          <span className="eyebrow">{feature.eyebrow}</span>
          <h1>{copy.heading}</h1>
          <p>{copy.description}</p>
          <div className="tools-actions">
            <A
              to={
                type === "international"
                  ? "/studio/demo/calls/"
                  : type === "memory"
                    ? "/studio/demo/memory/"
                    : "/studio/demo/call/"
              }
              className="ab-button extension-primary"
            >
              {type === "international"
                ? "Plan a sample call"
                : type === "memory"
                  ? "Open call memory"
                  : "Try joining the sample call"}
              <Icon name="arrow" size={16} />
            </A>
            {type === "memory" && (
              <Btn
                label="Try sample playback"
                end="play"
                onClick={() =>
                  sampleRef.current?.scrollIntoView({
                    block: "start",
                    behavior: "instant",
                  })
                }
              />
            )}
          </div>
        </div>
        <FeatureArt type={type} interactive />
      </section>
      <section className="extension-steps frame">
        {copy.steps.map(([title, text], i) => (
          <article key={title}>
            <span>0{i + 1}</span>
            <h2>{title}</h2>
            <p>{text}</p>
          </article>
        ))}
      </section>
      {type === "memory" && (
        <section className="public-section frame" ref={sampleRef}>
          <div className="section-heading">
            <div>
              <span className="eyebrow">A WORKING SAMPLE</span>
              <h2>
                Press play.
                <br />
                <span>Find the moment.</span>
              </h2>
            </div>
            <p>
              Explore a fictional conversation, the matching transcript and a
              demonstration outcome. Playback stays local.
            </p>
          </div>
          <Card className="public-sample-card" padding={0}>
            <SampleRecording />
          </Card>
        </section>
      )}
      <section className="extension-faq frame">
        <div>
          <span className="eyebrow">A LITTLE CLARITY</span>
          <h2>Good to know.</h2>
        </div>
        <div>
          {copy.faq.map(([question, answer]) => (
            <details key={question}>
              <summary>
                {question}
                <Icon name="plus" size={16} />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="extension-related frame">
        <span className="eyebrow">CONNECTED POSSIBILITIES</span>
        {EXTENSIONS.filter((f) => f.key !== type).map((f) => (
          <A key={f.key} to={f.path}>
            <Icon name={f.icon} />
            <strong>{f.title}</strong>
            <Icon name="diagonal" size={15} />
          </A>
        ))}
      </section>
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
        ["call", "join", "Let me join", "A place alongside your agent."],
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
