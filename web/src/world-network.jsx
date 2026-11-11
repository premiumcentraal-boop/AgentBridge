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
  flagAnimation,
  routeMotion,
  routeBegin,
} from "./network-data.js";
import "./world-network.css";
const duration = NETWORK_LOOP_SECONDS + "s";
function Band({ leg, route, still }) {
  const timeline = bandAnimation(leg);
  return (
    <path
      d={leg.path}
      pathLength="1000"
      fill="none"
      stroke={leg.colour}
      strokeWidth={BAND_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={still ? `${still.to * 1000} 2000` : "0 2000"}
      opacity={still ? still.opacity : 0}
      className={still ? "world-band-static" : "world-band"}
      data-leg={leg.id}
      data-turns={leg.turns}
    >
      {!still && (
        <>
          <animate
            attributeName="stroke-dasharray"
            values={timeline.widths}
            keyTimes={timeline.keyTimes}
            keySplines={timeline.keySplines}
            dur={duration}
            begin={routeBegin(route)}
            repeatCount="indefinite"
            calcMode="spline"
          />
          <animate
            attributeName="opacity"
            values={timeline.opacity}
            keyTimes={timeline.visibilityTimes}
            dur={duration}
            begin={routeBegin(route)}
            repeatCount="indefinite"
          />
        </>
      )}
    </path>
  );
}
function FlagCircle({ prefix, route, still }) {
  const initial =
    still || STILL_CONNECTIONS.find((state) => state.route.id === route.id);
  return (
    <>
      <circle
        r={COUNTRY_RADIUS}
        fill="#fbfaf7"
        stroke={route.colour}
        strokeWidth="2"
      />
      <g
        className="world-country-flag"
        clipPath={`url(#${prefix}-country-disc)`}
      >
        {route.countries.map((code, index) => {
          const timeline = flagAnimation(route, code);
          return (
            <g
              key={code}
              className="world-traveller-flag"
              data-country={code}
              opacity={initial.flags[index].opacity}
            >
              {!still && (
                <animate
                  attributeName="opacity"
                  values={timeline.values}
                  keyTimes={timeline.keyTimes}
                  dur={duration}
                  begin={routeBegin(route)}
                  repeatCount="indefinite"
                />
              )}
              <use
                href={"#" + prefix + "-flag-" + code}
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
  return (
    <svg
      ref={svgRef}
      className="world-network-svg"
      viewBox={`0 0 ${MAP_SIZE.width} ${MAP_SIZE.height}`}
      role="img"
      aria-labelledby={prefix + "-title " + prefix + "-description"}
      data-loop-seconds={NETWORK_LOOP_SECONDS}
      data-route-count={CONNECTION_STREAMS.length}
    >
      <title id={prefix + "-title"}>Connect agents worldwide</title>
      <desc id={prefix + "-description"}>
        Four broad pink, orange, blue and yellow routes overlap and cross in
        different directions. A flag-filled circle travels with each advancing
        line, stops at its destination and continues from that same shared
        point. Sixteen countries and four transfer stations connect the routes
        over a sixty-second cycle. This is an illustration, not live calling
        activity.
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
        {CONNECTION_STREAMS.map((route) => (
          <path
            key={route.id}
            id={prefix + "-route-" + route.id}
            d={route.path}
            className="world-route-path"
          />
        ))}
      </defs>
      <g className="world-moving-scene">
        <g className="world-bands">
          {CONNECTION_STREAMS.map((route) => (
            <g
              key={route.id}
              className="world-route-bands"
              data-route={route.id}
            >
              {route.legs.map((leg) => (
                <Band key={leg.id} leg={leg} route={route} />
              ))}
            </g>
          ))}
        </g>
        <g className="world-travellers">
          {CONNECTION_STREAMS.map((route) => {
            const motion = routeMotion(route);
            return (
              <g
                key={route.id}
                className="world-traveller"
                data-route={route.id}
                opacity="0"
              >
                <animate
                  attributeName="opacity"
                  values="1;1"
                  dur={duration}
                  begin={routeBegin(route)}
                  repeatCount="indefinite"
                />
                <animateMotion
                  dur={duration}
                  begin={routeBegin(route)}
                  repeatCount="indefinite"
                  keyTimes={motion.keyTimes}
                  keyPoints={motion.keyPoints}
                  keySplines={motion.keySplines}
                  calcMode="spline"
                  rotate="0"
                >
                  <mpath href={"#" + prefix + "-route-" + route.id} />
                </animateMotion>
                <FlagCircle prefix={prefix} route={route} />
              </g>
            );
          })}
        </g>
      </g>
      <g className="world-static-scene" aria-hidden="true">
        {STILL_CONNECTIONS.flatMap((state) =>
          state.bands.map((band) => (
            <Band
              key={band.leg.id}
              leg={band.leg}
              route={state.route}
              still={band}
            />
          )),
        )}
        {STILL_CONNECTIONS.map((state) => (
          <g
            key={state.route.id}
            className="world-traveller-static"
            data-route={state.route.id}
            transform={`translate(${state.point.join(" ")})`}
          >
            <FlagCircle prefix={prefix} route={state.route} still={state} />
          </g>
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
