// Paired country lines enter from opposite edges, meet, then reveal a call.
export const NETWORK_LOOP_SECONDS = 60;
export const MAP_SIZE = { width: 1000, height: 720 };
export const MEETING_POINT = [500, 360];
export const BAND_WIDTH = 104;
export const COUNTRY_RADIUS = 62;
export const PAIR_INTERVAL_SECONDS = 5;
export const APPROACH_SECONDS = 6;
export const LINE_FADE_AT = 6.3;
export const LINE_CLEAR_AT = 7;
export const CALL_REVEAL_AT = 7.12;
export const CALL_VISIBLE_AT = 7.5;
export const CALL_FADE_AT = 9.55;
export const EVENT_SECONDS = 10.3;
export const SCENE_PHASE_SECONDS = 3.2;
export const MOVE_EASING = [0.42, 0, 0.58, 1];
export const COUNTRIES = {
  US: "United States",
  GB: "United Kingdom",
  NL: "Netherlands",
  JP: "Japan",
  FR: "France",
  DE: "Germany",
  SG: "Singapore",
  AU: "Australia",
  CA: "Canada",
  BR: "Brazil",
  SE: "Sweden",
  IN: "India",
  CH: "Switzerland",
  AE: "United Arab Emirates",
  MX: "Mexico",
  ZA: "South Africa",
};
const round = (value) => Number(value.toFixed(9));
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const modulo = (value, period) => ((value % period) + period) % period;
export function connectionGeometry(start, end, firstAxis = "x") {
  if (start[0] === end[0] || start[1] === end[1])
    return {
      path: `M${start.join(" ")}L${end.join(" ")}`,
      start,
      end,
      turns: 0,
      length: distance(start, end),
      radius: 0,
    };
  const corner = firstAxis === "x" ? [end[0], start[1]] : [start[0], end[1]];
  const incoming = corner.map((n, i) => Math.sign(n - start[i]));
  const outgoing = end.map((n, i) => Math.sign(n - corner[i]));
  const radius = Math.min(
    105,
    Math.abs(end[0] - start[0]) * 0.45,
    Math.abs(end[1] - start[1]) * 0.45,
  );
  const arcStart = corner.map((n, i) => round(n - incoming[i] * radius));
  const arcEnd = corner.map((n, i) => round(n + outgoing[i] * radius));
  const center = arcStart.map((n, i) => n + outgoing[i] * radius);
  const sweep =
    incoming[0] * outgoing[1] - incoming[1] * outgoing[0] > 0 ? 1 : 0;
  const leadLength = distance(start, arcStart),
    arcLength = (Math.PI * radius) / 2;
  return {
    path: `M${start.join(" ")}L${arcStart.join(" ")}A${radius} ${radius} 0 0 ${sweep} ${arcEnd.join(" ")}L${end.join(" ")}`,
    start,
    end,
    arcStart,
    arcEnd,
    center,
    incoming,
    outgoing,
    sweep,
    radius,
    turns: 1,
    leadLength,
    arcLength,
    length: leadLength + arcLength + distance(arcEnd, end),
  };
}
const cubic = (p1, p2, t) =>
  3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3;
export function cubicEase(progress, spline) {
  const x = Math.min(1, Math.max(0, progress));
  if (x === 0 || x === 1) return x;
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 32; i++) {
    const t = (lo + hi) / 2;
    if (cubic(spline[0], spline[2], t) < x) lo = t;
    else hi = t;
  }
  return cubic(spline[1], spline[3], (lo + hi) / 2);
}
export const ease = (progress) => cubicEase(progress, MOVE_EASING);
const mixPoint = (a, b, t) => a.map((n, axis) => n + (b[axis] - n) * t);
export function pointOnLeg(leg, progress) {
  if (progress <= 0) return [...leg.start];
  if (progress >= 1) return [...leg.end];
  if (!leg.turns) return mixPoint(leg.start, leg.end, progress);
  const position = progress * leg.length;
  if (position <= leg.leadLength)
    return mixPoint(leg.start, leg.arcStart, position / leg.leadLength);
  if (position >= leg.leadLength + leg.arcLength)
    return mixPoint(
      leg.arcEnd,
      leg.end,
      (position - leg.leadLength - leg.arcLength) /
        (leg.length - leg.leadLength - leg.arcLength),
    );
  const angle =
    Math.atan2(
      leg.arcStart[1] - leg.center[1],
      leg.arcStart[0] - leg.center[0],
    ) +
    (leg.sweep ? 1 : -1) * ((position - leg.leadLength) / leg.radius);
  return [
    leg.center[0] + Math.cos(angle) * leg.radius,
    leg.center[1] + Math.sin(angle) * leg.radius,
  ];
}
const palette = {
  rose: "#f52b87",
  orange: "#ff8a24",
  cyan: "#25b9d6",
  gold: "#ffca2c",
};
const scenes = [
  {
    countries: ["US", "GB"],
    axis: "x",
    offset: 160,
    colours: [palette.rose, palette.cyan],
  },
  {
    countries: ["NL", "JP"],
    axis: "y",
    offset: -240,
    colours: [palette.orange, palette.gold],
  },
  {
    countries: ["FR", "DE"],
    axis: "x",
    offset: 0,
    colours: [palette.cyan, palette.orange],
  },
  {
    countries: ["SG", "AU"],
    axis: "y",
    offset: 150,
    colours: [palette.gold, palette.rose],
  },
  {
    countries: ["CA", "BR"],
    axis: "x",
    offset: -190,
    colours: [palette.orange, palette.cyan],
  },
  {
    countries: ["SE", "IN"],
    axis: "y",
    offset: 0,
    colours: [palette.rose, palette.gold],
  },
  {
    countries: ["CH", "AE"],
    axis: "x",
    offset: 100,
    colours: [palette.cyan, palette.rose],
  },
  {
    countries: ["MX", "ZA"],
    axis: "y",
    offset: -340,
    colours: [palette.gold, palette.orange],
  },
  {
    countries: ["US", "JP"],
    axis: "x",
    offset: 240,
    colours: [palette.rose, palette.cyan],
  },
  {
    countries: ["GB", "AU"],
    axis: "y",
    offset: 240,
    colours: [palette.orange, palette.gold],
  },
  {
    countries: ["NL", "SG"],
    axis: "x",
    offset: -90,
    colours: [palette.cyan, palette.orange],
  },
  {
    countries: ["BR", "IN"],
    axis: "y",
    offset: -110,
    colours: [palette.gold, palette.rose],
  },
];
const clamp = (n) => Math.min(1, Math.max(0, n));
function flagClearanceTime(arm, clearance) {
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 36; i++) {
    const t = (lo + hi) / 2;
    if (distance(pointOnLeg(arm, ease(t)), MEETING_POINT) > clearance) lo = t;
    else hi = t;
  }
  return ((lo + hi) / 2) * APPROACH_SECONDS;
}
export const CONNECTION_PAIRS = scenes.map((scene, index) => {
  const entry =
    scene.axis === "x"
      ? [-180, MEETING_POINT[1] + scene.offset]
      : [MEETING_POINT[0] + scene.offset, -180];
  const opposite = [MAP_SIZE.width - entry[0], MAP_SIZE.height - entry[1]];
  const arms = [entry, opposite].map((start, side) => ({
    ...connectionGeometry(start, MEETING_POINT, scene.axis),
    id: `pair-${index}-${side}`,
    country: {
      code: scene.countries[side],
      name: COUNTRIES[scene.countries[side]],
    },
    colour: scene.colours[side],
  }));
  return {
    ...scene,
    id: "pair-" + index,
    startAt: index * PAIR_INTERVAL_SECONDS,
    arms,
    flagFadeAt: flagClearanceTime(arms[0], COUNTRY_RADIUS * 1.8),
    flagClearAt: flagClearanceTime(arms[0], COUNTRY_RADIUS + 2),
  };
});
// Carry-over scenes paint first; current-cycle scenes paint in launch order.
// Visibility gates switch at the seam without moving or restarting SVG nodes.
export const PAINT_LAYERS = [
  ...CONNECTION_PAIRS.filter(
    (pair) => pair.startAt + EVENT_SECONDS > NETWORK_LOOP_SECONDS,
  ).map((pair) => ({
    id: pair.id + "-previous",
    pair,
    previous: true,
    carryUntil: pair.startAt + EVENT_SECONDS - NETWORK_LOOP_SECONDS,
  })),
  ...CONNECTION_PAIRS.map((pair) => ({
    id: pair.id + "-current",
    pair,
    previous: false,
  })),
];
const normalized = (values) =>
  values.map((value) => round(value / NETWORK_LOOP_SECONDS)).join(";");
export const masterBegin = `-${SCENE_PHASE_SECONDS}s`;
export const pairBegin = (pair) =>
  `-${round(modulo(SCENE_PHASE_SECONDS - pair.startAt, NETWORK_LOOP_SECONDS))}s`;
export function approachAnimation() {
  return {
    keyTimes: normalized([0, APPROACH_SECONDS, NETWORK_LOOP_SECONDS]),
    keyPoints: "0;1;1",
    widths: "0 2000;1000 2000;1000 2000",
    keySplines: MOVE_EASING.join(" ") + ";0 0 1 1",
  };
}
function fadeAnimation(start, end) {
  return {
    keyTimes: normalized([0, start, end, NETWORK_LOOP_SECONDS]),
    values: "1;1;0;0",
    keySplines: "0 0 1 1;.4 0 .6 1;0 0 1 1",
  };
}
export const lineAnimation = () => fadeAnimation(LINE_FADE_AT, LINE_CLEAR_AT);
export const flagAnimation = (pair) =>
  fadeAnimation(pair.flagFadeAt, pair.flagClearAt);
export function callAnimation() {
  return {
    keyTimes: normalized([
      0,
      CALL_REVEAL_AT,
      CALL_VISIBLE_AT,
      CALL_FADE_AT,
      EVENT_SECONDS,
      NETWORK_LOOP_SECONDS,
    ]),
    values: "0;0;1;1;0;0",
    scales: ".86;.86;1;1;.96;.96",
    keySplines: "0 0 1 1;.22 1 .36 1;0 0 1 1;.4 0 .6 1;0 0 1 1",
  };
}
export function layerAnimation(layer) {
  if (layer.previous)
    return {
      keyTimes: normalized([0, layer.carryUntil, NETWORK_LOOP_SECONDS]),
      values: "1;0;0",
    };
  if (layer.pair.startAt === 0) return { keyTimes: "0;1", values: "1;1" };
  return {
    keyTimes: normalized([0, layer.pair.startAt, NETWORK_LOOP_SECONDS]),
    values: "0;1;1",
  };
}
// The sampled score also supplies reduced motion and testable paint order.
// Live playback uses native SVG timing, without frame-by-frame JavaScript.
export function sampleAnimation(
  animation,
  seconds,
  valueKey = "values",
  discrete = false,
) {
  const times = animation.keyTimes
    .split(";")
    .map((n) => Number(n) * NETWORK_LOOP_SECONDS);
  const values = animation[valueKey].split(";").map(Number);
  const index = times.findIndex((time) => time > seconds) - 1;
  if (index < 0) return values.at(-1);
  if (discrete) return values[index];
  let progress = clamp(
    (seconds - times[index]) / (times[index + 1] - times[index]),
  );
  const spline = animation.keySplines
    ?.split(";")
    [index]?.split(" ")
    .map(Number);
  if (spline) progress = cubicEase(progress, spline);
  return values[index] + (values[index + 1] - values[index]) * progress;
}
export function pairStateAt(pair, seconds) {
  const age = modulo(seconds, NETWORK_LOOP_SECONDS);
  const progress = ease(age / APPROACH_SECONDS);
  return {
    pair,
    age,
    progress,
    points: pair.arms.map((arm) => pointOnLeg(arm, progress)),
    lineOpacity: sampleAnimation(lineAnimation(), age),
    flagOpacity: sampleAnimation(flagAnimation(pair), age),
    callOpacity: sampleAnimation(callAnimation(), age),
    callScale: sampleAnimation(callAnimation(), age, "scales"),
  };
}
export function layerStateAt(layer, seconds) {
  const time = modulo(seconds + SCENE_PHASE_SECONDS, NETWORK_LOOP_SECONDS);
  const state = pairStateAt(layer.pair, time - layer.pair.startAt);
  return {
    ...state,
    layer,
    time,
    launchedAt: time - state.age,
    gate: sampleAnimation(layerAnimation(layer), time, "values", true),
  };
}
export const networkStateAt = (seconds) =>
  PAINT_LAYERS.map((layer) => layerStateAt(layer, seconds)).filter(
    (state) =>
      state.gate > 0 && (state.lineOpacity > 0 || state.callOpacity > 0),
  );
export const STILL_CONNECTIONS = networkStateAt(0);
