import React, { useEffect, useRef, useState } from "react";
import { A } from "./context.jsx";
import { BotFace } from "./grok-ui.jsx";
import { Icon } from "./ui.jsx";
import sample from "./samples/sample-call.json";

const chapters = [
  { id: "contacts", label: "Contacts", icon: "connections" },
  { id: "transcript", label: "Transcript", icon: "transcript" },
  { id: "call-room", label: "Call room", icon: "headphones" },
];

function ChapterNav() {
  const nav = useRef(null);
  const [active, setActive] = useState(chapters[0].id);
  useEffect(() => {
    const sections = chapters.map(({ id }) => document.getElementById(id));
    let frame = 0;
    function measure() {
      frame = 0;
      const bar = nav.current.getBoundingClientRect();
      const offset = window.matchMedia("(max-width: 760px)").matches
        ? Math.max(0, bar.bottom) + 24
        : window.innerHeight * 0.32;
      const measured = sections.filter(
        (section) => section.getBoundingClientRect().height > 0,
      );
      if (measured.length) {
        const current = measured.findLast(
          (section) => section.getBoundingClientRect().top <= offset,
        );
        setActive(current?.id || chapters[0].id);
      }
    }
    function schedule() {
      if (!frame) frame = window.requestAnimationFrame(measure);
    }
    function readLink() {
      const id = location.hash.split("#").at(-1);
      if (chapters.some((chapter) => chapter.id === id)) setActive(id);
      schedule();
    }
    readLink();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("hashchange", readLink);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("hashchange", readLink);
      window.cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <nav ref={nav} className="chapter-nav" aria-label="Call tour chapters">
      {chapters.map(({ id, icon, label }) => (
        <A
          key={id}
          to={"/#" + id}
          aria-current={active === id ? "location" : undefined}
        >
          <Icon name={icon} size={20} />
          <span>{label}</span>
        </A>
      ))}
    </nav>
  );
}

function ContactExample() {
  return (
    <div className="contact-slip">
      <div className="story-identity">
        <span className="contact-glyph">
          <Icon name="phone" size={23} />
        </span>
        <div>
          <strong>London studio</strong>
          <span>Reception · United Kingdom</span>
        </div>
      </div>
      <dl>
        <div>
          <dt>Phone number</dt>
          <dd>+44 20 7946 0123</dd>
        </div>
        <div>
          <dt>Contact note</dt>
          <dd>Ask for reception about the viewing.</dd>
        </div>
      </dl>
    </div>
  );
}

function TranscriptExample({
  hearingMoment,
  onHearMoment,
  onPause,
  audioFile,
  transcriptRef,
  audioError,
}) {
  const [query, setQuery] = useState("");
  const lines = sample.transcript.filter((line) =>
    line.text.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const stamp = (second) => "0:" + String(Math.floor(second)).padStart(2, "0");
  return (
    <div className="transcript-slip">
      <div className="moment-credit">
        <Icon name="wave" size={20} /> London studio <span>0:11</span>
      </div>
      <blockquote>“{sample.transcript[2].text}”</blockquote>
      <button
        type="button"
        className="story-action listen-moment"
        aria-controls="hero-audio"
        onClick={hearingMoment ? onPause : () => onHearMoment()}
      >
        <Icon name={hearingMoment ? "pause" : "play"} size={17} />
        {hearingMoment ? "Pause sample" : "Listen from 0:11"}
      </button>
      {audioError && (
        <p role="status">
          Audio couldn’t play here. You can still read the transcript below.
        </p>
      )}
      <details ref={transcriptRef} className="tour-transcript">
        <summary>
          Search the sample transcript <Icon name="plus" size={17} />
        </summary>
        <label htmlFor="tour-transcript-search">
          Find words in the call
          <input
            id="tour-transcript-search"
            type="search"
            value={query}
            placeholder="Try “reference”"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <ol>
          {lines.map((line) => (
            <li key={line.id}>
              <button
                type="button"
                onClick={() => onHearMoment(line.start)}
                aria-label={"Play from " + stamp(line.start)}
              >
                {stamp(line.start)}
              </button>
              <div>
                <strong>
                  {line.speaker === "Agent" ? "Your agent" : "Reception"}
                </strong>
                <p>{line.text}</p>
              </div>
            </li>
          ))}
        </ol>
        {!lines.length && <p role="status">No matching words in this call.</p>}
        <a href={audioFile} download="agentbridge-sample-call.mp3">
          Download sample audio
        </a>
      </details>
    </div>
  );
}

function RoomExample() {
  const [joined, setJoined] = useState(false);
  const [micOn, setMicOn] = useState(false);
  return (
    <div className="room-example">
      <div className="tour-room-title">
        <strong>London studio</strong>
        <span>Example room · {joined ? 3 : 2} participants</span>
      </div>
      <div className="story-people">
        <div>
          <BotFace size={44} />
          <span>Your agent</span>
        </div>
        <div>
          <i>
            <Icon name="phone" size={22} />
          </i>
          <span>Reception</span>
        </div>
        {joined && (
          <div className="room-self">
            <i>
              <Icon name={micOn ? "mute" : "headphones"} size={22} />
            </i>
            <span>You</span>
          </div>
        )}
      </div>
      <div className="example-room-controls">
        <button
          type="button"
          className="story-action room-join"
          onClick={() => {
            setJoined(!joined);
            setMicOn(false);
          }}
        >
          <Icon name={joined ? "logout" : "headphones"} size={17} />
          {joined ? "Leave example room" : "Join example room"}
        </button>
        {joined && (
          <button
            type="button"
            className="story-action room-mic"
            aria-pressed={micOn}
            onClick={() => setMicOn(!micOn)}
          >
            <Icon name={micOn ? "mute" : "muted"} size={17} />
            {micOn ? "Mic on" : "Mic off"}
          </button>
        )}
      </div>
    </div>
  );
}

export function CallStory(props) {
  return (
    <section
      id="call-tour"
      tabIndex={-1}
      className="call-story frame"
      aria-labelledby="story-heading"
    >
      <header className="tour-heading">
        <h2 id="story-heading">One call in Studio</h2>
        <p>
          Follow a London studio viewing from the first contact to the moment
          you join.
        </p>
      </header>
      <div className="tour-layout">
        <ChapterNav />
        <div className="tour-chapters">
          <section
            id="contacts"
            tabIndex={-1}
            aria-labelledby="contacts-title"
            className="tour-chapter"
          >
            <h3 id="contacts-title">Save a contact your agent remembers.</h3>
            <p>
              Give a phone number a name. When you call again, your agent can
              look up the notes and saved conversations for that contact.
            </p>
            <ContactExample />
          </section>
          <section
            id="transcript"
            tabIndex={-1}
            aria-labelledby="transcript-title"
            className="tour-chapter"
          >
            <h3 id="transcript-title">Go straight to the words that matter.</h3>
            <p>
              With everyone’s permission, record the call and transcribe it.
              Pick a line to hear the moment it was said.
            </p>
            <TranscriptExample {...props} />
          </section>
          <section
            id="call-room"
            tabIndex={-1}
            aria-labelledby="room-title"
            className="tour-chapter"
          >
            <h3 id="room-title">Join the conversation.</h3>
            <p>
              Open a call room to see who’s there. Listen with your microphone
              off, speak when you’re ready, and leave the phones connected.
            </p>
            <RoomExample />
          </section>
        </div>
      </div>
    </section>
  );
}
