import React, { useState } from "react";
import { A } from "./context.jsx";
import { BotFace } from "./grok-ui.jsx";
import { Icon } from "./ui.jsx";
import sample from "./samples/sample-call.json";

const chapters = [
  {
    id: "contact",
    label: "Save a contact",
    text: "Keep a number and the details your agent should remember.",
    link: "/connect/",
    next: "Set up a connection",
  },
  {
    id: "words",
    label: "Follow the words",
    text: "Record with permission and find the exact moment you want to hear again.",
    link: "/call-memory/",
    next: "Explore call memory",
  },
  {
    id: "room",
    label: "Join the conversation",
    text: "Listen alongside your agent. Choose when to turn on your microphone.",
    link: "/join-call/",
    next: "Explore call rooms",
  },
];

export function CallStory({ onHearMoment }) {
  const [selected, setSelected] = useState(chapters[0]);
  const [joined, setJoined] = useState(false);
  const [micOn, setMicOn] = useState(false);
  return (
    <section className="call-story frame" aria-labelledby="story-heading">
      <div className="story-directory">
        <h2 id="story-heading">One call in Studio</h2>
        <div
          className="story-choices"
          role="group"
          aria-label="Explore the London call"
        >
          {chapters.map((c) => (
            <button
              type="button"
              key={c.id}
              aria-pressed={selected.id === c.id}
              aria-controls="sample-detail"
              onClick={() => setSelected(c)}
            >
              <span className="story-station" aria-hidden="true" />
              <span>{c.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div
        className="story-detail"
        id="sample-detail"
        aria-label={selected.label}
      >
        {selected.id === "contact" ? (
          <div className="contact-example">
            <div className="story-identity">
              <span className="contact-glyph">
                <Icon name="connection" size={22} />
              </span>
              <div>
                <h3>London studio</h3>
                <p>Saved connection</p>
              </div>
            </div>
            <dl>
              <div>
                <dt>Destination</dt>
                <dd>+44 20 7946 0123</dd>
              </div>
              <div>
                <dt>Contact note</dt>
                <dd>Ask for reception. Viewing at 10:30 London time.</dd>
              </div>
            </dl>
          </div>
        ) : selected.id === "words" ? (
          <div className="transcript-example">
            <h3>Viewing confirmed</h3>
            <p className="example-meta">London studio · Sample transcript</p>
            <blockquote>“{sample.transcript[2].text}”</blockquote>
            <button
              type="button"
              className="story-action"
              onClick={onHearMoment}
            >
              <Icon name="headphones" />
              Listen from 0:11
            </button>
          </div>
        ) : (
          <div className="room-example">
            <h3>London studio</h3>
            <p className="example-meta">
              Example room · {joined ? 3 : 2} participants
            </p>
            <div className="story-people">
              <span>
                <BotFace size={34} />
                Your agent
              </span>
              <span>
                <Icon name="phone" size={28} />
                Reception
              </span>
              {joined && (
                <span>
                  <Icon name={micOn ? "mute" : "headphones"} size={28} />
                  You
                </span>
              )}
            </div>
            <div className="example-room-controls">
              {joined && (
                <button
                  type="button"
                  className="story-action"
                  aria-pressed={micOn}
                  onClick={() => setMicOn((v) => !v)}
                >
                  <Icon name={micOn ? "mute" : "muted"} />
                  {micOn ? "Mic on" : "Mic off"}
                </button>
              )}
              <button
                type="button"
                className="story-action"
                onClick={() => {
                  setJoined((v) => !v);
                  setMicOn(false);
                }}
              >
                {joined ? "Leave example room" : "Join example room"}
              </button>
            </div>
          </div>
        )}
        <div className="story-foot">
          <p>{selected.text}</p>
          <A className="product-text-action" to={selected.link}>
            {selected.next}
          </A>
        </div>
      </div>
    </section>
  );
}
