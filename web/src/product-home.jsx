import React from "react";
import { A, useRoute } from "./context.jsx";
import { Btn, Icon } from "./ui.jsx";
import { BotFace, LandingActivity } from "./grok-ui.jsx";
import { WorldNetwork } from "./world-network.jsx";

function SignupEntry({ label = "Sign me up" }) {
  const { href, link } = useRoute();
  return (
    <Btn
      label={label}
      primary
      href={href("/signup/")}
      onClick={(event) => link(event, "/signup/")}
      end="arrow"
    />
  );
}

export function ProductHome() {
  return (
    <main id="main" tabIndex={-1} className="gb-product-home">
      <section className="gb-product-hero frame">
        <div className="gb-hero-copy">
          <h1 aria-label="connect agents worldwide">
            connect agents
            <br /> <span>worldwide</span>
          </h1>
          <p>
            Bring your agents to the conversation.
            <br />
            See the call. Follow the words. Listen in.
          </p>
          <div className="gb-hero-actions">
            <SignupEntry />
            <A to="/studio/">
              Open studio <Icon name="arrow" size={16} />
            </A>
          </div>
        </div>
        <LandingActivity />
      </section>
      <section
        className="gb-everyday frame"
        aria-label="Connection, made simple"
      >
        <div className="gb-section-heading">
          <h2>
            Agentic calling.
            <br />
            <span>Made easy.</span>
          </h2>
          <p>
            Connect your agents to people and businesses worldwide. Start a
            call, follow the conversation and jump in when it needs you.
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
          <span className="gb-hero-kicker">INTERNATIONAL CALLING</span>
          <h2>
            Same agent.
            <br />
            <span>Bigger reach.</span>
          </h2>
          <p>
            Connect your agent to people and businesses in other countries. Keep
            the same agent, voice and conversation.
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
          <span className="gb-hero-kicker">CALLS, TRANSCRIPTS & ROUTING</span>
          <h2>
            Your agent.
            <br />
            <span>Connected to the world.</span>
          </h2>
          <p>
            See who’s on the line, follow the transcript and choose when to
            listen or join. Keep calls, connections and routing in one
            workspace.
          </p>
          <SignupEntry />
          <A to="/call-memory/" className="gb-secondary-link">
            See recording & transcripts <Icon name="arrow" size={15} />
          </A>
        </div>
      </section>
    </main>
  );
}
