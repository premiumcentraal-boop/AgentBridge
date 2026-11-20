import React, { useRef, useState } from "react";
import { A, useRoute } from "./context.jsx";
import { BotFace } from "./grok-ui.jsx";
import { Icon, Wave } from "./ui.jsx";
import { WorldNetwork } from "./world-network.jsx";
import sample from "./samples/sample-call.json";
import audioFile from "./samples/sample-call.mp3";

export function PublicEntry({
  children = "Sign me up",
  fallback = "Hear a sample call",
}) {
  return (
    <>
      <A className="product-button signup-open" to="/signup/">
        {children}
        <Icon name="arrow" />
      </A>
      <A className="product-button signup-closed" to="/call-memory/">
        {fallback}
        <Icon name="arrow" />
      </A>
    </>
  );
}

const minutes = (seconds) =>
  "0:" + String(Math.floor(seconds)).padStart(2, "0");

export function ProductHome() {
  const audio = useRef(null);
  const transcript = useRef(null);
  const [playing, setPlaying] = useState(false),
    [position, setPosition] = useState(0);
  const [error, setError] = useState(false);
  const { href } = useRoute();
  const label = playing
    ? "Pause sample"
    : position >= sample.duration - 0.1
      ? "Replay sample call"
      : position > 0
        ? "Resume sample"
        : "Play sample call";
  async function toggle(event) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    const player = audio.current;
    if (!player) return;
    if (!player.paused) {
      player.pause();
      return;
    }
    setError(false);
    try {
      if (player.ended) player.currentTime = 0;
      await player.play();
    } catch {
      setError(true);
      transcript.current.open = true;
    }
  }
  const lines = sample.transcript.filter((line) => line.start <= position);
  const agent = lines.findLast((line) => line.speaker === "Agent");
  const recipient =
    lines.findLast((line) => line.speaker === "Recipient") ||
    sample.transcript[1];
  const speaking =
    playing && agent && position < agent.end && position >= agent.start;
  return (
    <main id="main" tabIndex={-1} className="product-redesign">
      <section className="product-hero frame" aria-label="AgentBridge calling">
        <div className="product-hero-copy">
          <h1>
            Connect agents
            <br /> worldwide
          </h1>
          <p>
            Connect a phone number, follow the conversation and join when you’re
            needed.
          </p>
          <div className="gb-hero-actions product-actions">
            <A to="/signup/" className="product-button signup-open">
              Sign me up <Icon name="arrow" />
            </A>
            <a
              className="product-button signup-closed"
              href={href("/call-memory/")}
              onClick={toggle}
              aria-controls="hero-audio"
            >
              <Icon name={playing ? "pause" : "play"} />
              {label}
            </a>
          </div>
        </div>
        <div className="call-specimen">
          <WorldNetwork />
          <div className="specimen-content">
            <div className="specimen-heading">
              <div>
                <h2>London studio viewing</h2>
                <small>Sample call · Synthetic voices</small>
              </div>
              <div className="specimen-time">
                <Wave animated={playing} muted={!playing} />
                <time>{minutes(position)} / 0:34</time>
              </div>
            </div>
            <div className="specimen-line">
              <span className="specimen-speaker">
                <BotFace size={26} state={speaking ? "working" : "idle"} />
                <b>Your agent</b>
              </span>
              <p>
                {position > 0
                  ? agent?.text
                  : "Could we arrange a studio viewing for Tuesday morning?"}
              </p>
            </div>
            <div className="specimen-line">
              <span className="specimen-speaker">
                <span className="reception-avatar" aria-hidden="true">
                  R
                </span>
                <b>Reception</b>
              </span>
              <p>{recipient.text}</p>
            </div>
            <div className="specimen-progress" aria-hidden="true">
              <i
                style={{
                  width:
                    Math.min(100, (position / sample.duration) * 100) + "%",
                }}
              />
            </div>
            <a
              className="product-text-action signup-open"
              href={href("/call-memory/")}
              onClick={toggle}
              aria-controls="hero-audio"
            >
              <Icon name={playing ? "pause" : "play"} />
              {label}
            </a>
            <details ref={transcript} className="specimen-transcript">
              <summary>Read transcript</summary>
              <ol>
                {sample.transcript.map((line) => (
                  <li key={line.id}>
                    <small>
                      {minutes(line.start)} ·{" "}
                      {line.speaker === "Agent" ? "Your agent" : "Reception"}
                    </small>
                    <p>{line.text}</p>
                  </li>
                ))}
              </ol>
            </details>
            {error && (
              <p role="status">
                Audio couldn’t play here. The full transcript is open.
              </p>
            )}
            <audio
              ref={audio}
              id="hero-audio"
              src={audioFile}
              preload="none"
              onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
            />
          </div>
        </div>
      </section>
      <section className="product-story frame" aria-labelledby="story-heading">
        <header>
          <h2 id="story-heading">One call, from start to finish.</h2>
        </header>
        <div className="story-grid">
          <article>
            <div className="story-art contact-art">
              <div className="sample-contact">
                <span className="contact-monogram">L</span>
                <div>
                  <strong>London studio</strong>
                  <small>Saved contact</small>
                </div>
              </div>
              <p>Next time, ask for reception.</p>
            </div>
            <h3>Remember the contact.</h3>
            <p>
              Save the number and a note. Your agent can check the last
              conversation before the next call.
            </p>
            <A to="/connect/" className="product-text-action">
              Connect a destination <Icon name="arrow" />
            </A>
          </article>
          <article>
            <div className="story-art time-art">
              <Icon name="transcript" size={26} />
              <div>
                <small>0:11 · Your agent</small>
                <p>Ten thirty London time works.</p>
              </div>
            </div>
            <h3>Keep the details.</h3>
            <p>
              Record with permission, read a saved transcript and find the
              moment you want to revisit.
            </p>
            <A to="/call-memory/" className="product-text-action">
              Explore call history <Icon name="arrow" />
            </A>
          </article>
          <article>
            <div className="story-art join-art">
              <BotFace size={42} />
              <div>
                <strong>You joined the call</strong>
                <small>
                  <Icon name="muted" size={14} /> Your microphone is off
                </small>
              </div>
            </div>
            <h3>Join when it matters.</h3>
            <p>
              See who’s on the line. Listen first, then turn on your microphone
              when you want to speak.
            </p>
            <A to="/join-call/" className="product-text-action">
              See the call room <Icon name="arrow" />
            </A>
          </article>
        </div>
      </section>
      <section className="product-close frame">
        <div>
          <h2>Same agent. Bigger reach.</h2>
          <p>
            See how country availability, forwarding and outbound callbacks work
            with your own number.
          </p>
        </div>
        <A to="/international-calling/" className="product-button quiet">
          Explore international calling <Icon name="arrow" />
        </A>
      </section>
    </main>
  );
}
