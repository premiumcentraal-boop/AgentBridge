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
          <h1 aria-label="Connect agents worldwide">
            Connect agents
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
            <div className="gb-memory-art">
              <div>
                <BotFace size={46} tone="teal" />
                <strong>
                  London studio <span aria-hidden="true">🇬🇧</span>
                </strong>
              </div>
              <p>Last call: ask about access to reception.</p>
              <small>Contact saved · Context for next time</small>
            </div>
            <span className="gb-step-number">01 / CONNECT</span>
            <h3>
              Your contacts.
              <br />
              Ready to call.
            </h3>
            <p>
              Save contacts and keep notes from past conversations, ready for
              your agent’s next call.
            </p>
            <span className="gb-card-action">
              Save a contact <Icon name="arrow" size={16} />
            </span>
          </A>
          <A to="/studio/demo/calls/" className="gb-workflow-card">
            <div className="gb-transcript-art">
              <div>
                <BotFace size={28} tone="teal" />
                <span>Asking about a viewing…</span>
              </div>
              <div>
                <span>LD</span>
                <span>Tuesday at 10:30 works.</span>
              </div>
              <small>00:18 · Important moment saved</small>
            </div>
            <span className="gb-step-number">02 / FOLLOW</span>
            <h3>
              Keep the conversation.
              <br />
              And the important parts.
            </h3>
            <p>
              Record with permission, read the transcript, and save highlights
              you’ll want to revisit.
            </p>
            <span className="gb-card-action">
              Explore call history <Icon name="arrow" size={16} />
            </span>
          </A>
          <A to="/join-call/" className="gb-workflow-card">
            <div className="gb-listen-art has-chat">
              <BotFace size={68} state="working" tone="purple" />
              <span className="gb-listen-chip">
                <Icon name="headphones" size={18} /> Listening
              </span>
              <div className="gb-join-chat">
                <span>
                  <strong>You joined the conversation.</strong>
                </span>
                <span>You: “I’ll take it from here.”</span>
                <div className="gb-join-control">
                  <Icon name="pause" size={14} />
                  <span>Pause agent</span>
                  <Icon name="muted" size={14} />
                </div>
              </div>
            </div>
            <span className="gb-step-number">03 / JOIN</span>
            <h3>
              Join the conversation.
              <br />
              Take over when needed.
            </h3>
            <p>
              Follow your agent’s call and step in when it matters, with clear
              controls close at hand.
            </p>
            <span className="gb-card-action">
              See how joining works <Icon name="arrow" size={16} />
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
