import React, { memo, useEffect, useId, useRef, useState } from "react";
import { IconBtn } from "./ui.jsx";
import { flagDefinitions } from "./flags.js";
import {
  RELAY_LEGS,
  RELAY_PATH,
  RELAY_PHASE_SECONDS,
  STILL_RELAY,
  MAP_SIZE,
  BAND_WIDTH,
  COUNTRY_RADIUS,
  NETWORK_LOOP_SECONDS,
  bandAnimation,
  flagAnimation,
  relayMotion,
  batonColourAnimation,
  localBegin,
} from "./network-data.js";
import "./world-network.css";
const duration = NETWORK_LOOP_SECONDS + "s",
  masterBegin = "-" + RELAY_PHASE_SECONDS + "s";
function Band({ leg, still }) {
  const timeline = bandAnimation(leg),
    common = {
      keyTimes: timeline.keyTimes,
      dur: duration,
      begin: localBegin(leg),
      repeatCount: "indefinite",
      calcMode: "spline",
      keySplines: timeline.keySplines,
    };
  const visible = still ? still.to - still.from > 1e-8 : false;
  return (
    <path
      d={leg.path}
      pathLength="1000"
      fill="none"
      stroke={leg.colour}
      strokeWidth={BAND_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={
        still ? `${(still.to - still.from) * 1000} 2000` : "0 2000"
      }
      strokeDashoffset={still ? -still.from * 1000 : 0}
      opacity={visible ? "1" : "0"}
      className={still ? "world-band-static" : "world-band"}
      data-leg={leg.id}
      data-turns={leg.turns}
    >
      {!still && (
        <>
          <animate
            attributeName="stroke-dasharray"
            values={timeline.widths}
            {...common}
          />
          <animate
            attributeName="stroke-dashoffset"
            values={timeline.offsets}
            {...common}
          />
          <animate
            attributeName="opacity"
            values="1;0;0"
            keyTimes={timeline.visibilityTimes}
            dur={duration}
            begin={localBegin(leg)}
            repeatCount="indefinite"
            calcMode="discrete"
          />
        </>
      )}
    </path>
  );
}
function BatonFace({ prefix, still = false }) {
  const colour = batonColourAnimation();
  return (
    <>
      <circle
        r={COUNTRY_RADIUS}
        fill="#fbfaf7"
        stroke={still ? STILL_RELAY.leg.colour : RELAY_LEGS[0].colour}
        strokeWidth="2"
      >
        {!still && (
          <animate
            attributeName="stroke"
            values={colour.values}
            keyTimes={colour.keyTimes}
            dur={duration}
            begin={masterBegin}
            repeatCount="indefinite"
          />
        )}
      </circle>
      <g
        className="world-country-flag"
        clipPath={`url(#${prefix}-country-disc)`}
      >
        {RELAY_LEGS.map((leg, index) => {
          const timeline = flagAnimation(leg);
          return (
            <g
              key={leg.id}
              className="world-baton-flag"
              data-country={leg.country.code}
              opacity={STILL_RELAY.flags[index].opacity}
            >
              {!still && (
                <animate
                  attributeName="opacity"
                  values={timeline.values}
                  keyTimes={timeline.keyTimes}
                  dur={duration}
                  begin={localBegin(leg)}
                  repeatCount="indefinite"
                />
              )}
              <use
                href={"#" + prefix + "-flag-" + leg.country.code}
                x="-50"
                y="-50"
                width="100"
                height="100"
              />
            </g>
          );
        })}
      </g>
      <circle
        r="50"
        fill="none"
        stroke="#14241b"
        strokeOpacity=".08"
        strokeWidth="1"
      />
    </>
  );
}
const Scene = memo(function Scene({ prefix, svgRef }) {
  const motion = relayMotion();
  return (
    <svg
      ref={svgRef}
      className="world-network-svg"
      viewBox={`0 0 ${MAP_SIZE.width} ${MAP_SIZE.height}`}
      role="img"
      aria-labelledby={prefix + "-title " + prefix + "-description"}
      data-loop-seconds={NETWORK_LOOP_SECONDS}
    >
      <title id={prefix + "-title"}>Connect agents worldwide</title>
      <desc id={prefix + "-description"}>
        A sixty-second connected relay. A flag-filled circle moves at the head
        of thick coloured lines. Each line meets the next at the same point, and
        the circle changes country during the handoff before continuing. Sixteen
        countries share one closed circuit with no reset jump. This is an
        illustration, not live calling activity.
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
        <path
          id={prefix + "-relay-path"}
          d={RELAY_PATH}
          className="world-relay-path"
        />
      </defs>
      <g className="world-moving-scene">
        <g className="world-bands">
          {RELAY_LEGS.map((leg) => (
            <Band key={leg.id} leg={leg} />
          ))}
        </g>
        <g className="world-baton" data-master-begin={masterBegin} opacity="0">
          <animate
            attributeName="opacity"
            values="1;1"
            dur={duration}
            begin={masterBegin}
            repeatCount="indefinite"
          />
          <animateMotion
            dur={duration}
            begin={masterBegin}
            repeatCount="indefinite"
            keyTimes={motion.keyTimes}
            keyPoints={motion.keyPoints}
            keySplines={motion.keySplines}
            calcMode="spline"
            rotate="0"
          >
            <mpath href={"#" + prefix + "-relay-path"} />
          </animateMotion>
          <BatonFace prefix={prefix} />
        </g>
      </g>
      <g className="world-static-scene" aria-hidden="true">
        {STILL_RELAY.bands.map((band) => (
          <Band key={band.leg.id} leg={band.leg} still={band} />
        ))}
        <g
          className="world-baton-static"
          transform={`translate(${STILL_RELAY.point.join(" ")})`}
        >
          <BatonFace prefix={prefix} still />
        </g>
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
        <span>One connection leads to another.</span>
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
