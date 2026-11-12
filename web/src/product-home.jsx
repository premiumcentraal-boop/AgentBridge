import React from "react";
import { A, useRoute } from "./context.jsx";
import { Btn, Icon } from "./ui.jsx";
import { BotFace, LandingActivity } from "./grok-ui.jsx";
import { WorldNetwork } from "./world-network.jsx";

function StudioEntry({ label = "Open studio" }) {
  const { href, link } = useRoute();
  return (
    <Btn
      label={label}
      primary
      target="_top"
      href={href("/studio/demo/")}
      onClick={(event) => link(event, "/studio/demo/")}
      end="arrow"
    />
  );
}

export function ProductHome() {
  return (
    <main id="main" tabIndex={-1} className="gb-product-home">
      <section className="gb-product-hero frame">
        <div className="gb-hero-copy">
          <span className="gb-hero-kicker">
            <span /> YOUR AGENTS. ONE CONNECTED WORLD.
          </span>
          <h1 aria-label="connect agents worldwide">
            connect agents
            <br /> <span>worldwide</span>
          </h1>
          <p>
            Bring your agent to the conversation.
            <br />
            See the call. Follow the words. Listen in.
          </p>
          <div className="gb-hero-actions">
            <StudioEntry />
            <A to="/features/">
              Take a look around <Icon name="arrow" size={16} />
            </A>
          </div>
          <small className="gb-preview-note">
            Working product preview. Live calling requires integration.
          </small>
        </div>
        <LandingActivity />
      </section>
      <section
        className="gb-everyday frame"
        aria-label="Connection, made simple"
      >
        <div className="gb-section-heading">
          <span>LESS BETWEEN YOU</span>
          <h2>
            A little closer.
            <br />
            <span>A lot simpler.</span>
          </h2>
          <p>
            From a new connection to the next conversation.
            <br />
            Everything you need, right where you expect it.
          </p>
        </div>
        <div className="gb-workflow-grid">
          <A to="/studio/demo/connections/" className="gb-workflow-card">
            <div className="gb-connect-art">
              <BotFace size={68} tone="teal" />
              <span />
              <div className="gb-contact-bubble">🇬🇧</div>
            </div>
            <span className="gb-step-number">01 / CONNECT</span>
            <h3>
              A name. A number.
              <br />A new connection.
            </h3>
            <p>Save a destination and give your agent a clear next step.</p>
            <span className="gb-card-action">
              Add a connection <Icon name="arrow" size={16} />
            </span>
          </A>
          <A to="/studio/demo/call/" className="gb-workflow-card">
            <div className="gb-transcript-art">
              <div>
                <BotFace size={28} tone="teal" />
                <span>Asking about a viewing…</span>
              </div>
              <div>
                <span>LD</span>
                <span>Tuesday at 10:30 works.</span>
              </div>
              <small>Sample conversation</small>
            </div>
            <span className="gb-step-number">02 / FOLLOW</span>
            <h3>
              Your agent, calling.
              <br />
              You, in the loop.
            </h3>
            <p>See the call and choose a transcript to follow the details.</p>
            <span className="gb-card-action">
              Explore a sample call <Icon name="arrow" size={16} />
            </span>
          </A>
          <A to="/join-call/" className="gb-workflow-card">
            <div className="gb-listen-art">
              <BotFace size={68} state="working" tone="purple" />
              <span className="gb-listen-chip">
                <Icon name="headphones" size={18} /> Listening
              </span>
            </div>
            <span className="gb-step-number">03 / JOIN</span>
            <h3>
              Step in.
              <br />
              Stay connected.
            </h3>
            <p>
              Listen alongside your agent. Join the conversation when it needs
              you.
            </p>
            <span className="gb-card-action">
              Meet “Let me join” <Icon name="arrow" size={16} />
            </span>
          </A>
        </div>
      </section>
      <section className="gb-world-section frame">
        <div className="gb-world-copy">
          <span className="gb-hero-kicker">A WORLD OF POSSIBILITIES</span>
          <h2>
            Different countries.
            <br />
            <span>One familiar agent.</span>
          </h2>
          <p>
            Prepare international connections without losing the thread. Your
            agent stays with the conversation, wherever it needs to go.
          </p>
          <A className="gb-card-action" to="/international-calling/">
            Explore international calling <Icon name="arrow" size={17} />
          </A>
        </div>
        <WorldNetwork />
      </section>
      <section className="gb-control-section frame">
        <div className="gb-control-visual">
          <BotFace size={132} state="working" tone="teal" />
          <span className="gb-control-tag">
            <Icon name="headphones" size={16} /> Listen in
          </span>
          <span className="gb-control-tag">
            <Icon name="transcript" size={16} /> Follow along
          </span>
          <span className="gb-control-tag">
            <Icon name="routes" size={16} /> Review routing
          </span>
        </div>
        <div>
          <span className="gb-hero-kicker">
            ONE AGENT IN FOCUS. EVERYTHING IN REACH.
          </span>
          <h2>
            Close to the call.
            <br />
            <span>Clear on what’s next.</span>
          </h2>
          <p>
            A focused workspace for connections, calls and the details you
            choose to keep. Recording and transcription stay optional.
          </p>
          <StudioEntry label="Explore your workspace" />
          <A to="/call-memory/" className="gb-secondary-link">
            See recording & transcripts <Icon name="arrow" size={15} />
          </A>
        </div>
      </section>
    </main>
  );
}
