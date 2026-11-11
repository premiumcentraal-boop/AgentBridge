import React, { memo, useEffect, useId, useRef, useState } from "react";
import { IconBtn, Mark } from "./ui.jsx";
import { FLAGS } from "./flags.js";
import {
  STATIONS,
  NETWORK_ROUTES,
  MAP_SIZE,
  INTERCHANGE,
  NETWORK_LOOP_SECONDS,
  JOURNEY_SECONDS,
  journeyTiming,
} from "./network-data.js";
import "./world-network.css";

function Journey({ route, id, prefix, reverse, index }) {
  const timing = journeyTiming(route, reverse);
  const begin = `-${(index * 5 + (reverse ? 20 : 0)) % JOURNEY_SECONDS}s`;
  const duration = JOURNEY_SECONDS + "s";
  const common = {
    dur: duration,
    begin,
    repeatCount: "indefinite",
    calcMode: "spline",
    keyTimes: timing.keyTimes,
    keySplines: timing.keySplines,
  };
  const origin = reverse ? route.stops.at(-1).code : route.stops[0].code;
  return (
    <g
      className="world-journey"
      data-direction={reverse ? "reverse" : "forward"}
    >
      <path
        d={route.path}
        pathLength="1000"
        fill="none"
        stroke={route.colour}
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeDasharray="64 936"
        className="world-route-tail"
      >
        <animate
          attributeName="stroke-dashoffset"
          values={timing.progress
            .map((p) => (64 - p * 1000).toFixed(3))
            .join(";")}
          {...common}
        />
        <animate
          attributeName="opacity"
          values="0;0;.85;.85;0;0"
          keyTimes="0;.006;.03;.97;.994;1"
          dur={duration}
          begin={begin}
          repeatCount="indefinite"
        />
      </path>
      <g className="world-traveller" opacity="0">
        <animateMotion {...common} keyPoints={timing.keyPoints} rotate="0">
          <mpath href={"#" + id} />
        </animateMotion>
        <animate
          attributeName="opacity"
          values="0;0;1;1;0;0"
          keyTimes="0;.006;.03;.97;.994;1"
          dur={duration}
          begin={begin}
          repeatCount="indefinite"
        />
        <circle r="19" fill={route.colour} opacity=".06" />
        <rect
          x="-15"
          y="-12"
          width="30"
          height="24"
          rx="8"
          className="world-flag-capsule"
          stroke={route.colour}
          strokeWidth="1"
        />
        <image
          href={FLAGS[origin]}
          x="-10"
          y="-7.5"
          width="20"
          height="15"
          clipPath={`url(#${prefix}-flag-window)`}
        />
      </g>
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
    >
      <title id={prefix + "-title"}>Connect agents worldwide</title>
      <desc id={prefix + "-description"}>
        A forty-second animated subway map. Eight smoothly curved routes connect
        sixteen country flags. Flag capsules travel in both directions, slow
        into stations and pass over and under other routes. An illustration of
        connection, not live calling activity.
      </desc>
      <defs>
        <clipPath id={prefix + "-flag-window"}>
          <rect x="-10" y="-7.5" width="20" height="15" rx="2" />
        </clipPath>
        <radialGradient id={prefix + "-glow"}>
          <stop stopColor="#98bec3" stopOpacity=".07" />
          <stop offset="1" stopColor="#98bec3" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse
        cx="538"
        cy="353"
        rx="400"
        ry="330"
        fill={`url(#${prefix}-glow)`}
      />
      <g
        className="world-coordinate-marks"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      >
        {[
          [70, 62],
          [926, 62],
          [70, 665],
          [926, 665],
        ].map(([x, y], i) => (
          <path key={i} d={`M${x - 7} ${y}h14M${x} ${y - 7}v14`} />
        ))}
      </g>
      {NETWORK_ROUTES.map((route, index) => {
        const id = prefix + "-" + route.id;
        return (
          <g
            key={route.id}
            className="world-transit-route"
            data-route={route.id}
          >
            <path
              id={id}
              d={route.path}
              fill="none"
              strokeWidth="12"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="world-track-bed"
            />
            <path
              d={route.path}
              fill="none"
              stroke={route.colour}
              strokeWidth="3.5"
              strokeLinecap="round"
              className="world-track"
            >
              <animate
                attributeName="opacity"
                values=".18;.2;.52;.26;.18"
                keyTimes="0;.15;.4;.7;1"
                dur={NETWORK_LOOP_SECONDS + "s"}
                begin={`-${index * 5}s`}
                repeatCount="indefinite"
                calcMode="spline"
                keySplines=".4 0 .6 1;.4 0 .6 1;.4 0 .6 1;.4 0 .6 1"
              />
            </path>
            <Journey route={route} id={id} prefix={prefix} index={index} />
            <Journey
              route={route}
              id={id}
              prefix={prefix}
              index={index}
              reverse
            />
          </g>
        );
      })}
      <g className="world-station-rings" fill="none">
        {STATIONS.map((station) => (
          <circle key={station.code} cx={station.x} cy={station.y} r="25" />
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
    [inView, setInView] = useState(true),
    [pageVisible, setPageVisible] = useState(true);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setPaused(media.matches);
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
    <div className="world-network" ref={containerRef} data-paused={paused}>
      <div className="world-map-grid" aria-hidden="true" />
      <div className="world-map-plane">
        <Scene prefix={prefix} svgRef={svgRef} />
        <div className="world-stations" aria-hidden="true">
          {STATIONS.map((station) => (
            <div
              key={station.code}
              className={"world-station station-" + station.code.toLowerCase()}
              style={{
                left: (station.x / MAP_SIZE.width) * 100 + "%",
                top: (station.y / MAP_SIZE.height) * 100 + "%",
              }}
            >
              <span className="world-station-flag">
                <img
                  src={FLAGS[station.code]}
                  width="28"
                  height="21"
                  alt=""
                  draggable="false"
                />
              </span>
              <span className="world-station-name">{station.city}</span>
            </div>
          ))}
        </div>
        <div
          className="world-interchange"
          aria-hidden="true"
          style={{
            left: (INTERCHANGE.x / MAP_SIZE.width) * 100 + "%",
            top: (INTERCHANGE.y / MAP_SIZE.height) * 100 + "%",
          }}
        >
          <span className="world-interchange-orbit" />
          <span className="world-interchange-core">
            <Mark />
          </span>
          <small>AGENTBRIDGE</small>
        </div>
      </div>
      <div className="world-map-header" aria-hidden="true">
        <span>
          <i />A WORLD OF CONNECTIONS
        </span>
        <span>01 — 08</span>
      </div>
      <div className="world-map-footer">
        <span>One agent. Every direction.</span>
        <IconBtn
          label={
            paused ? "Play connection animation" : "Pause connection animation"
          }
          name={paused ? "play" : "pause"}
          onClick={() => setPaused((value) => !value)}
          aria-pressed={paused}
          className="world-motion-control"
        />
      </div>
    </div>
  );
}
