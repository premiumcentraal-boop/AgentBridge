import React, { memo, useEffect, useId, useRef, useState } from "react";
import { IconBtn } from "./ui.jsx";
import { flagDefinitions } from "./flags.js";
import {
  CONNECTION_PAIRS,
  PAINT_LAYERS,
  STILL_CONNECTIONS,
  MAP_SIZE,
  MEETING_POINT,
  BAND_WIDTH,
  COUNTRY_RADIUS,
  NETWORK_LOOP_SECONDS,
  approachAnimation,
  lineAnimation,
  flagAnimation,
  callAnimation,
  contactAnimation,
  checkAnimation,
  layerAnimation,
  masterBegin,
  pairBegin,
} from "./network-data.js";
import "./world-network.css";
const duration = NETWORK_LOOP_SECONDS + "s";
function timing(timeline, begin) {
  return {
    keyTimes: timeline.keyTimes,
    keySplines: timeline.keySplines,
    dur: duration,
    begin,
    repeatCount: "indefinite",
    calcMode: "spline",
  };
}
function Fade({ timeline, begin }) {
  return (
    <animate
      attributeName="opacity"
      values={timeline.values}
      {...timing(timeline, begin)}
    />
  );
}
function CountryCircle({ arm, pair, prefix, still }) {
  const motion = approachAnimation();
  return (
    <g
      className="world-country-traveller"
      data-country={arm.country.code}
      data-arm={arm.id}
      opacity={still ? still.flagOpacity : 0}
      transform={
        still
          ? `translate(${still.points[pair.arms.indexOf(arm)].join(" ")})`
          : undefined
      }
    >
      {!still && (
        <>
          <Fade timeline={flagAnimation(pair)} begin={pairBegin(pair)} />
          <animateMotion
            keyPoints={motion.keyPoints}
            rotate="0"
            {...timing(motion, pairBegin(pair))}
          >
            <mpath href={"#" + prefix + "-" + arm.id} />
          </animateMotion>
        </>
      )}
      <circle
        r={COUNTRY_RADIUS}
        fill="#fbfaf7"
        stroke={arm.colour}
        strokeWidth="2"
      />
      <g
        className="world-country-flag"
        clipPath={`url(#${prefix}-country-disc)`}
      >
        <use
          href={"#" + prefix + "-flag-" + arm.country.code}
          x="-50"
          y="-50"
          width="100"
          height="100"
        />
      </g>
      <circle
        r="50"
        fill="none"
        stroke="#14241b"
        strokeOpacity=".08"
        strokeWidth="1"
      />
    </g>
  );
}
function ConnectedCall({ pair, still }) {
  const timeline = callAnimation(),
    contact = contactAnimation(),
    check = checkAnimation();
  return (
    <g
      className="world-call-connection"
      data-countries={pair.countries.join("-")}
      transform={`translate(${MEETING_POINT.join(" ")})`}
      opacity={still ? still.callOpacity : 0}
    >
      {!still && <Fade timeline={timeline} begin={pairBegin(pair)} />}
      <g
        className="world-contact-pulse"
        opacity={still ? still.contactOpacity : 0}
      >
        {!still && <Fade timeline={contact} begin={pairBegin(pair)} />}
        <g
          className="world-contact-wave"
          transform={`scale(${still ? still.contactScale : 0.3})`}
        >
          {!still && (
            <animateTransform
              attributeName="transform"
              type="scale"
              values={contact.scales}
              {...timing(contact, pairBegin(pair))}
            />
          )}
          <circle r="58" fill="none" stroke="#25bc79" strokeWidth="4" />
        </g>
      </g>
      <g
        className="world-call-mark"
        transform={`scale(${still ? still.callScale : 0.62})`}
      >
        {!still && (
          <animateTransform
            attributeName="transform"
            type="scale"
            values={timeline.scales}
            {...timing(timeline, pairBegin(pair))}
          />
        )}
        <circle r="76" fill="#25bc79" fillOpacity=".11" />
        <circle r="58" fill="#25bc79" />
        <g transform="translate(-26 -26) scale(2.2)">
          <path
            d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"
            fill="none"
            stroke="#fff"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
        <circle cx="42" cy="-39" r="15" fill="#e8f9ef" />
        <path
          className="world-call-check"
          d="M35-39l5 5 9-10"
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset={still ? still.checkOffset : 1}
          fill="none"
          stroke="#128051"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {!still && (
            <animate
              attributeName="stroke-dashoffset"
              values={check.values}
              {...timing(check, pairBegin(pair))}
            />
          )}
        </path>
        <text
          className="world-call-label"
          textAnchor="middle"
          y="112"
          fill="#c5ead5"
          fontSize="25"
          fontWeight="500"
        >
          Call connected
        </text>
      </g>
    </g>
  );
}
function PairScene({ layer, prefix, still }) {
  const pair = layer.pair,
    motion = approachAnimation(),
    gate = layerAnimation(layer);
  return (
    <g
      className={still ? "world-pair-static" : "world-pair-layer"}
      data-layer={layer.id}
      data-pair={pair.id}
      data-copy={layer.previous ? "previous" : "current"}
      data-start-at={pair.startAt}
      opacity={still ? 1 : 0}
    >
      {!still && (
        <animate
          className="world-layer-gate"
          attributeName="opacity"
          values={gate.values}
          keyTimes={gate.keyTimes}
          dur={duration}
          begin={masterBegin}
          repeatCount="indefinite"
          calcMode="discrete"
        />
      )}
      <g
        className="world-country-lines"
        opacity={still ? still.lineOpacity : 0}
      >
        {!still && <Fade timeline={lineAnimation()} begin={pairBegin(pair)} />}
        {pair.arms.map((arm) => (
          <path
            key={arm.id}
            d={arm.path}
            pathLength="1000"
            fill="none"
            stroke={arm.colour}
            strokeWidth={BAND_WIDTH}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={still ? `${still.progress * 1000} 2000` : "0 2000"}
            className="world-band"
            data-arm={arm.id}
            data-turns={arm.turns}
          >
            {!still && (
              <animate
                attributeName="stroke-dasharray"
                values={motion.widths}
                {...timing(motion, pairBegin(pair))}
              />
            )}
          </path>
        ))}
        {pair.arms.map((arm) => (
          <CountryCircle
            key={arm.id}
            arm={arm}
            pair={pair}
            prefix={prefix}
            still={still}
          />
        ))}
      </g>
      <ConnectedCall pair={pair} still={still} />
    </g>
  );
}
const Scene = memo(function Scene({ prefix, svgRef }) {
  return (
    <svg
      ref={svgRef}
      className="world-network-svg"
      viewBox={`0 0 ${MAP_SIZE.width} ${MAP_SIZE.height}`}
      role="img"
      aria-labelledby={prefix + "-title " + prefix + "-description"}
      data-loop-seconds={NETWORK_LOOP_SECONDS}
      data-pair-count={CONNECTION_PAIRS.length}
      data-sequence="edge-to-call"
    >
      <title id={prefix + "-title"}>Connect agents worldwide</title>
      <desc id={prefix + "-description"}>
        Pairs of bold coloured lines with country flags enter from opposite
        edges and accelerate into contact at the centre. Only that contact
        triggers a green phone pulse and an animated check mark as the country
        lines fade. The confirmation clears before the next pair approaches. New
        connections always appear above older ones, including when the
        sixty-second loop repeats. This animation illustrates connection and is
        not live call activity.
      </desc>
      <defs>
        {flagDefinitions(prefix).map((flag) => (
          <symbol
            key={flag.code}
            id={flag.id}
            viewBox={flag.viewBox}
            preserveAspectRatio="xMidYMid slice"
          >
            <g dangerouslySetInnerHTML={{ __html: flag.body }} />
          </symbol>
        ))}
        <clipPath id={prefix + "-country-disc"}>
          <circle r="50" />
        </clipPath>
        {CONNECTION_PAIRS.flatMap((pair) =>
          pair.arms.map((arm) => (
            <path
              key={arm.id}
              id={prefix + "-" + arm.id}
              d={arm.path}
              className="world-approach-path"
            />
          )),
        )}
      </defs>
      <g className="world-moving-scene">
        {PAINT_LAYERS.map((layer) => (
          <PairScene key={layer.id} layer={layer} prefix={prefix} />
        ))}
      </g>
      <g className="world-static-scene" aria-hidden="true">
        {STILL_CONNECTIONS.map((state) => (
          <PairScene
            key={state.layer.id}
            layer={state.layer}
            prefix={prefix}
            still={state}
          />
        ))}
      </g>
    </svg>
  );
});
export function WorldNetwork() {
  const prefix = "network-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const svgRef = useRef(null),
    containerRef = useRef(null);
  const [paused, setPaused] = useState(false),
    [motionConsent, setMotionConsent] = useState(false),
    [inView, setInView] = useState(true),
    [pageVisible, setPageVisible] = useState(true);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => {
      setPaused(media.matches);
      setMotionConsent(false);
    };
    change();
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    const change = () => setPageVisible(!document.hidden);
    change();
    document.addEventListener("visibilitychange", change);
    if (!("IntersectionObserver" in window))
      return () => document.removeEventListener("visibilitychange", change);
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: "80px" },
    );
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", change);
    };
  }, []);
  useEffect(() => {
    const svg = svgRef.current;
    if (paused || !inView || !pageVisible) svg?.pauseAnimations?.();
    else svg?.unpauseAnimations?.();
  }, [paused, inView, pageVisible]);
  return (
    <div
      className="world-network"
      ref={containerRef}
      data-paused={paused}
      data-motion-consent={motionConsent}
    >
      <div className="world-map-plane">
        <Scene prefix={prefix} svgRef={svgRef} />
      </div>
      <div className="world-map-footer">
        <span>Two countries. One connection.</span>
        <IconBtn
          label={
            paused ? "Play connection animation" : "Pause connection animation"
          }
          name={paused ? "play" : "pause"}
          onClick={() => {
            setMotionConsent(true);
            setPaused((value) => !value);
          }}
          aria-pressed={paused}
          className="world-motion-control"
        />
      </div>
    </div>
  );
}
