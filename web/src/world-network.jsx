import React, { memo, useEffect, useId, useRef, useState } from "react";
import { IconBtn } from "./ui.jsx";
import { flagDefinitions } from "./flags.js";
import {
  CONNECTION_STREAMS,
  STILL_CONNECTIONS,
  MAP_SIZE,
  BAND_WIDTH,
  COUNTRY_RADIUS,
  NETWORK_LOOP_SECONDS,
  bandAnimation,
  countryAnimation,
} from "./network-data.js";
import "./world-network.css";
const duration = NETWORK_LOOP_SECONDS + "s";
function CountryCircle({ leg, prefix, begin, animated = false }) {
  const timeline = animated ? countryAnimation(leg) : null;
  const point = leg.end;
  return (
    <g
      transform={`translate(${point[0]} ${point[1]})`}
      className="world-country-circle"
      data-country={leg.country.code}
      opacity={animated ? "0" : "1"}
      data-arrive-at={animated ? leg.arriveAt.toFixed(4) : undefined}
    >
      {animated && (
        <animate
          attributeName="opacity"
          values={timeline.opacity}
          keyTimes={timeline.keyTimes}
          dur={duration}
          begin={begin}
          repeatCount="indefinite"
          calcMode="spline"
          keySplines={timeline.keySplines}
        />
      )}
      <g>
        {animated && (
          <animateTransform
            attributeName="transform"
            type="scale"
            values={timeline.scale}
            keyTimes={timeline.keyTimes}
            dur={duration}
            begin={begin}
            repeatCount="indefinite"
            calcMode="spline"
            keySplines={timeline.keySplines}
          />
        )}
        <circle
          r={COUNTRY_RADIUS}
          fill="#fbfaf7"
          stroke={leg.colour}
          strokeWidth="2"
        />
        <g
          className="world-country-flag"
          clipPath={`url(#${prefix}-country-disc)`}
        >
          <use
            href={"#" + prefix + "-flag-" + leg.country.code}
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
    </g>
  );
}
function MovingBand({ leg, begin }) {
  const timeline = bandAnimation(leg);
  const common = {
    keyTimes: timeline.keyTimes,
    dur: duration,
    begin,
    repeatCount: "indefinite",
    calcMode: "spline",
    keySplines: timeline.keySplines,
  };
  return (
    <path
      d={leg.path}
      pathLength="1000"
      fill="none"
      stroke={leg.colour}
      strokeWidth={BAND_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray="0 2000"
      strokeDashoffset="0"
      opacity="0"
      className="world-band"
      data-turns={leg.turns}
    >
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
        values="0;0;1;1;0;0"
        keyTimes={timeline.visibilityTimes}
        dur={duration}
        begin={begin}
        repeatCount="indefinite"
      />
    </path>
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
    >
      <title id={prefix + "-title"}>Connect agents worldwide</title>
      <desc id={prefix + "-description"}>
        A forty-second illustration of connection. Broad pink, orange, blue and
        yellow bands travel in different directions. Each journey is straight or
        takes one rounded turn. On arrival, the country flag appears inside a
        large circle, and the next connection grows smoothly from that circle.
        Sixteen countries appear through the loop. This is an illustration, not
        live calling activity.
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
      </defs>
      <g className="world-moving-scene">
        <g className="world-bands">
          {CONNECTION_STREAMS.map((stream) => (
            <g key={stream.id} data-stream={stream.id}>
              {stream.legs.map((leg) => (
                <MovingBand
                  key={leg.id}
                  leg={leg}
                  begin={`-${stream.phase}s`}
                />
              ))}
            </g>
          ))}
        </g>
        <g className="world-country-arrivals">
          {CONNECTION_STREAMS.flatMap((stream) =>
            stream.legs.map((leg) => (
              <CountryCircle
                key={leg.id}
                leg={leg}
                prefix={prefix}
                begin={`-${stream.phase}s`}
                animated
              />
            )),
          )}
        </g>
      </g>
      <g className="world-static-scene" aria-hidden="true">
        {STILL_CONNECTIONS.map((leg, index) => (
          <path
            key={"band-" + index}
            d={leg.path}
            fill="none"
            stroke={leg.colour}
            strokeWidth={BAND_WIDTH}
            strokeLinecap="round"
          />
        ))}
        {STILL_CONNECTIONS.map((leg, index) => (
          <CountryCircle key={"country-" + index} leg={leg} prefix={prefix} />
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
