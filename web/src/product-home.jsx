import React, { useEffect, useRef, useState } from "react";
import { A } from "./context.jsx";
import { BotFace } from "./grok-ui.jsx";
import { Icon } from "./ui.jsx";
import { WorldNetwork } from "./world-network.jsx";
import { CallStory } from "./sample-story.jsx";
import { ProductDetails, SignupLink } from "./product-details.jsx";
import sample from "./samples/sample-call.json";
import waveform from "./samples/sample-waveform.json";
import audioFile from "./samples/sample-call.mp3";

const sampleClock = (seconds) =>
  "0:" + String(Math.floor(seconds)).padStart(2, "0");

export function ProductHome() {
  const audio = useRef(null);
  const pendingSeek = useRef(null);
  const transcript = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [playingFromTranscript, setPlayingFromTranscript] = useState(false);
  const [position, setPosition] = useState(0);
  const [error, setError] = useState(false);
  const playLabel = playing
    ? "Pause sample"
    : position >= sample.duration - 0.1
      ? "Replay sample call"
      : position > 0
        ? "Resume sample"
        : "Play sample call";

  useEffect(() => {
    const player = audio.current;
    return () => {
      if (player && !player.paused) player.pause();
    };
  }, []);

  function seek(seconds) {
    const player = audio.current;
    if (!player) return;
    setPosition(seconds);
    if (player.readyState) {
      player.currentTime = seconds;
    } else {
      const firstSeek = pendingSeek.current === null;
      pendingSeek.current = seconds;
      if (firstSeek) player.load();
    }
  }

  async function play(fromSecond) {
    const player = audio.current;
    if (!player) return;
    setError(false);
    setPlayingFromTranscript(typeof fromSecond === "number");
    try {
      if (typeof fromSecond === "number") seek(fromSecond);
      else if (player.ended) seek(0);
      await player.play();
    } catch {
      setError(true);
      if (transcript.current) transcript.current.open = true;
    }
  }

  function toggle() {
    if (audio.current && !audio.current.paused) audio.current.pause();
    else void play();
  }

  const recent = sample.transcript.filter((line) => line.start <= position);
  const agent =
    recent.findLast((line) => line.speaker === "Agent") || sample.transcript[0];
  const reception =
    recent.findLast((line) => line.speaker === "Recipient") ||
    sample.transcript[1];
  const speaking = playing && position >= agent.start && position < agent.end;
  const answering =
    playing && position >= reception.start && position < reception.end;
  return (
    <main id="main" tabIndex={-1} className="product-redesign">
      <section className="exchange-hero frame" aria-label="AgentBridge calling">
        <div className="exchange-intro">
          <h1>
            Connect agents <span>worldwide</span>
          </h1>
          <p>
            Give your agent a phone number. Follow the conversation and join
            whenever you’re needed.
          </p>
          <div className="gb-hero-actions product-actions">
            <SignupLink />
            <A to="/#sample-call" className="product-text-action">
              <Icon name="headphones" size={18} /> Hear a sample call
            </A>
          </div>
        </div>
        <WorldNetwork />
      </section>

      <section
        id="sample-call"
        tabIndex={-1}
        className="sample-desk frame"
        aria-labelledby="sample-name"
      >
        <div className="sample-player">
          <div className="sample-cover" aria-hidden="true" />
          <div className="sample-controller">
            <h2 id="sample-name">London studio viewing</h2>
            <p>Sample call · Synthetic voices</p>
            <div className="sample-transport">
              <button
                type="button"
                className="transport-toggle"
                aria-label={playLabel}
                aria-controls="hero-audio"
                onClick={toggle}
              >
                <Icon name={playing ? "pause" : "play"} size={20} />
              </button>
              <div className="sample-track">
                <div className="sample-bars" aria-hidden="true">
                  {waveform.map((level, i) => (
                    <i
                      key={i}
                      style={{ "--level": level + "%" }}
                      data-heard={
                        i / waveform.length < position / sample.duration
                      }
                    />
                  ))}
                </div>
                <input
                  type="range"
                  min="0"
                  max={sample.duration}
                  step="0.1"
                  value={position}
                  aria-label="Seek sample call"
                  aria-valuetext={
                    sampleClock(position) +
                    " of " +
                    sampleClock(sample.duration)
                  }
                  onChange={(event) => seek(Number(event.target.value))}
                />
              </div>
              <time>
                {sampleClock(position)} / {sampleClock(sample.duration)}
              </time>
            </div>
          </div>
        </div>
        <div className="sample-exchange">
          <div className="sample-voice" data-speaking={speaking}>
            <span>
              <BotFace size={26} state={speaking ? "working" : "idle"} />
              Your agent
            </span>
            <p>
              {position > 0
                ? agent.text
                : "Could we arrange a studio viewing for Tuesday morning?"}
            </p>
          </div>
          <div className="sample-voice" data-speaking={answering}>
            <span>
              <i className="voice-icon">
                <Icon name="phone" size={14} />
              </i>
              Reception
            </span>
            <p>{reception.text}</p>
          </div>
          <A
            to="/#transcript"
            className="sample-transcript-link"
            onClick={() => {
              if (transcript.current) transcript.current.open = true;
            }}
          >
            Read transcript <Icon name="transcript" size={16} />
          </A>
          {error && (
            <p role="status">
              Audio couldn’t play here. The full transcript is open.
            </p>
          )}
        </div>
        <audio
          ref={audio}
          id="hero-audio"
          src={audioFile}
          preload="none"
          onLoadedMetadata={(event) => {
            if (pendingSeek.current !== null) {
              event.currentTarget.currentTime = pendingSeek.current;
              pendingSeek.current = null;
            }
          }}
          onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />
      </section>

      <CallStory
        hearingMoment={playing && playingFromTranscript}
        onHearMoment={(second = sample.transcript[2].start) =>
          void play(second)
        }
        audioFile={audioFile}
        transcriptRef={transcript}
        audioError={error && playingFromTranscript}
        onPause={() => audio.current?.pause()}
      />
      <ProductDetails />
    </main>
  );
}
