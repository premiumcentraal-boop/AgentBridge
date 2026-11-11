// One closed relay, one master clock and one moving flag baton. The coloured
// trail and baton use the same distances, easing and handoff times.
export const NETWORK_LOOP_SECONDS = 60;
export const MAP_SIZE = { width: 1000, height: 720 };
export const BAND_WIDTH = 104;
export const COUNTRY_RADIUS = 62;
export const HANDOFF_SECONDS = 0.35;
export const FLAG_FADE_SECONDS = 0.3;
export const TRAIL_SECONDS = 18;
export const RELAY_PHASE_SECONDS = 13;
export const RELAY_EASING = [0.32, 0, 0.3, 1];
const colours = ["#f52b87", "#ff8a24", "#25b9d6", "#ffca2c"];
const countryNames = [
  ["US", "United States"],
  ["CA", "Canada"],
  ["GB", "United Kingdom"],
  ["NL", "Netherlands"],
  ["FR", "France"],
  ["DE", "Germany"],
  ["SE", "Sweden"],
  ["CH", "Switzerland"],
  ["AE", "United Arab Emirates"],
  ["IN", "India"],
  ["SG", "Singapore"],
  ["JP", "Japan"],
  ["AU", "Australia"],
  ["ZA", "South Africa"],
  ["BR", "Brazil"],
  ["MX", "Mexico"],
];
const corners = [
  [130, 130],
  [590, 130],
  [590, 590],
  [860, 590],
  [860, 360],
  [400, 360],
  [400, 590],
  [130, 590],
];
const radius = 85;
const round = (value) => Number(value.toFixed(9));
export const modulo = (value, period) => ((value % period) + period) % period;
const unit = (a, b) => {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
};
const elbows = corners.map((corner, index) => {
  const previous = corners[modulo(index - 1, corners.length)],
    next = corners[(index + 1) % corners.length];
  const incoming = unit(previous, corner),
    outgoing = unit(corner, next);
  const start = corner.map((n, axis) => n - incoming[axis] * radius),
    end = corner.map((n, axis) => n + outgoing[axis] * radius);
  const center = start.map((n, axis) => n + outgoing[axis] * radius);
  const sweep =
    incoming[0] * outgoing[1] - incoming[1] * outgoing[0] > 0 ? 1 : 0;
  return {
    kind: "arc",
    start,
    end,
    center,
    incoming,
    outgoing,
    radius,
    sweep,
    turns: 1,
    length: (Math.PI * radius) / 2,
    path: `M${start.join(" ")}A${radius} ${radius} 0 0 ${sweep} ${end.join(" ")}`,
  };
});
const geometries = [];
let start = elbows[0].end;
for (let index = 1; index <= elbows.length; index++) {
  const elbow = elbows[index % elbows.length],
    end = elbow.start,
    direction = unit(start, end);
  geometries.push({
    kind: "line",
    start,
    end,
    incoming: direction,
    outgoing: direction,
    turns: 0,
    radius: 0,
    length: Math.hypot(end[0] - start[0], end[1] - start[1]),
    path: `M${start.join(" ")}L${end.join(" ")}`,
  });
  geometries.push(elbow);
  start = elbow.end;
}
export const RELAY_LENGTH = geometries.reduce(
  (sum, leg) => sum + leg.length,
  0,
);
const travelSeconds =
  NETWORK_LOOP_SECONDS - geometries.length * HANDOFF_SECONDS;
let elapsed = 0,
  travelled = 0;
export const RELAY_LEGS = geometries.map((geometry, index) => {
  const duration = (geometry.length / RELAY_LENGTH) * travelSeconds;
  const leg = {
    ...geometry,
    id: "relay-" + index,
    index,
    colour: colours[index % colours.length],
    country: { code: countryNames[index][0], name: countryNames[index][1] },
    startAt: elapsed,
    arriveAt: elapsed + duration,
    endAt: elapsed + duration + HANDOFF_SECONDS,
    travelSeconds: duration,
    startProgress: travelled / RELAY_LENGTH,
    endProgress: (travelled + geometry.length) / RELAY_LENGTH,
  };
  elapsed = leg.endAt;
  travelled += geometry.length;
  return leg;
});
RELAY_LEGS.at(-1).endAt = NETWORK_LOOP_SECONDS;
RELAY_LEGS.at(-1).endProgress = 1;
export const STATIONS = RELAY_LEGS.map((leg) => ({
  ...leg.country,
  x: leg.start[0],
  y: leg.start[1],
}));
// Every subpath starts where the preceding one ended; no invisible jumps.
export const RELAY_PATH =
  RELAY_LEGS[0].path +
  RELAY_LEGS.slice(1)
    .map((leg) => leg.path.replace(/^M[-\d.]+ [-\d.]+/, ""))
    .join("") +
  "Z";
const normalized = (values) =>
  values.map((value) => round(value / NETWORK_LOOP_SECONDS)).join(";");
export const localBegin = (leg) =>
  `-${round(modulo(RELAY_PHASE_SECONDS - leg.startAt, NETWORK_LOOP_SECONDS))}s`;
export function relayMotion() {
  const times = [0],
    points = [0],
    splines = [];
  for (const leg of RELAY_LEGS) {
    times.push(leg.arriveAt, leg.endAt);
    points.push(leg.endProgress, leg.endProgress);
    splines.push(RELAY_EASING.join(" "), "0 0 1 1");
  }
  return {
    keyTimes: normalized(times),
    keyPoints: points.map(round).join(";"),
    keySplines: splines.join(";"),
  };
}
export function bandAnimation(leg) {
  return {
    keyTimes: normalized([
      0,
      leg.travelSeconds,
      TRAIL_SECONDS,
      TRAIL_SECONDS + leg.travelSeconds,
      NETWORK_LOOP_SECONDS,
    ]),
    widths: "0 2000;1000 2000;1000 2000;0 2000;0 2000",
    offsets: "0;0;0;-1000;-1000",
    keySplines: [
      RELAY_EASING.join(" "),
      "0 0 1 1",
      RELAY_EASING.join(" "),
      "0 0 1 1",
    ].join(";"),
    visibilityTimes: normalized([
      0,
      TRAIL_SECONDS + leg.travelSeconds,
      NETWORK_LOOP_SECONDS,
    ]),
  };
}
export function flagAnimation(leg) {
  return {
    keyTimes: normalized([
      0,
      leg.travelSeconds,
      leg.travelSeconds + FLAG_FADE_SECONDS,
      NETWORK_LOOP_SECONDS - HANDOFF_SECONDS,
      NETWORK_LOOP_SECONDS - HANDOFF_SECONDS + FLAG_FADE_SECONDS,
      NETWORK_LOOP_SECONDS,
    ]),
    values: "1;1;0;0;1;1",
  };
}
export function batonColourAnimation() {
  const times = [0],
    values = [RELAY_LEGS[0].colour];
  for (const leg of RELAY_LEGS) {
    const next = RELAY_LEGS[(leg.index + 1) % RELAY_LEGS.length];
    times.push(leg.arriveAt, leg.arriveAt + FLAG_FADE_SECONDS, leg.endAt);
    values.push(leg.colour, next.colour, next.colour);
  }
  return { keyTimes: normalized(times), values: values.join(";") };
}
const cubic = (p1, p2, t) =>
  3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t;
export function ease(progress) {
  const x = Math.min(1, Math.max(0, progress));
  if (x === 0 || x === 1) return x;
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 32; i++) {
    const t = (lo + hi) / 2;
    if (cubic(RELAY_EASING[0], RELAY_EASING[2], t) < x) lo = t;
    else hi = t;
  }
  return cubic(RELAY_EASING[1], RELAY_EASING[3], (lo + hi) / 2);
}
export function pointOnLeg(leg, progress) {
  if (progress <= 0) return [...leg.start];
  if (progress >= 1) return [...leg.end];
  if (leg.kind === "line")
    return leg.start.map((n, axis) => n + (leg.end[axis] - n) * progress);
  const angle =
    Math.atan2(leg.start[1] - leg.center[1], leg.start[0] - leg.center[0]) +
    (((leg.sweep ? 1 : -1) * Math.PI) / 2) * progress;
  return [
    leg.center[0] + Math.cos(angle) * leg.radius,
    leg.center[1] + Math.sin(angle) * leg.radius,
  ];
}
export function flagOpacity(leg, seconds) {
  const local = modulo(seconds - leg.startAt, NETWORK_LOOP_SECONDS);
  if (local <= leg.travelSeconds) return 1;
  if (local < leg.travelSeconds + FLAG_FADE_SECONDS)
    return 1 - (local - leg.travelSeconds) / FLAG_FADE_SECONDS;
  const revealAt = NETWORK_LOOP_SECONDS - HANDOFF_SECONDS;
  if (local < revealAt) return 0;
  return Math.min(1, (local - revealAt) / FLAG_FADE_SECONDS);
}
// This same score supplies the reduced-motion still and geometry verification;
// the live scene remains native SVG animation, without a JS rendering loop.
export function relayStateAt(seconds) {
  const time = modulo(seconds, NETWORK_LOOP_SECONDS);
  const leg =
    RELAY_LEGS.find((item) => time >= item.startAt && time < item.endAt) ||
    RELAY_LEGS[0];
  const progress = ease((time - leg.startAt) / leg.travelSeconds);
  return {
    time,
    leg,
    progress,
    point: pointOnLeg(leg, progress),
    bands: RELAY_LEGS.map((item) => {
      const local = modulo(time - item.startAt, NETWORK_LOOP_SECONDS);
      const head = ease(local / item.travelSeconds),
        tail = ease((local - TRAIL_SECONDS) / item.travelSeconds);
      return { leg: item, from: tail, to: head };
    }),
    flags: RELAY_LEGS.map((item) => ({
      country: item.country,
      opacity: flagOpacity(item, time),
    })),
  };
}
export const STILL_RELAY = relayStateAt(RELAY_PHASE_SECONDS);
