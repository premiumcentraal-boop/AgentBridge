// Overlapping country journeys share a minute-long score. Each has its own
// meeting point; only its arriving lines can trigger its call confirmation.
export const NETWORK_LOOP_SECONDS = 60;
export const MAP_SIZE = { width: 1000, height: 720 };
export const BAND_WIDTH = 88;
export const COUNTRY_RADIUS = 54;
export const PAIR_INTERVAL_SECONDS = 2;
export const APPROACH_SECONDS = 9.6;
export const ACCELERATE_AT = APPROACH_SECONDS * 0.75;
export const GLIDE_PROGRESS = 0.6;
export const GLIDE_EASING = [0.32, 0, 0.6, 0.6];
// The initial slope matches the glide's ending velocity, then accelerates
// into contact. There is no slowing or hesitation just before the join.
export const JOIN_EASING = [0.3, 0.15, 0.8, 0.4];
export const LINE_FADE_AT = APPROACH_SECONDS;
export const LINE_CLEAR_AT = APPROACH_SECONDS + 0.35;
export const CALL_REVEAL_AT = APPROACH_SECONDS;
export const CALL_VISIBLE_AT = APPROACH_SECONDS + 0.22;
export const CALL_SETTLE_AT = APPROACH_SECONDS + 0.42;
export const CALL_FADE_AT = APPROACH_SECONDS + 1.12;
export const EVENT_SECONDS = APPROACH_SECONDS + 1.65;
// Open on a composed overlap, rather than waiting on an empty canvas.
export const SCENE_PHASE_SECONDS = 7.5;
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
export function approachProgress(seconds) {
  if (seconds <= ACCELERATE_AT)
    return GLIDE_PROGRESS * cubicEase(seconds / ACCELERATE_AT, GLIDE_EASING);
  return (
    GLIDE_PROGRESS +
    (1 - GLIDE_PROGRESS) *
      cubicEase(
        (seconds - ACCELERATE_AT) / (APPROACH_SECONDS - ACCELERATE_AT),
        JOIN_EASING,
      )
  );
}
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
// Opposite edges, alternating elbows and dispersed joins preserve the broad
// transit-line composition. A third, perpendicular arrival is occasional.
const scenes = [
  { countries: ["US", "GB"], meeting: [270, 185], axis: "x", offset: 165 },
  { countries: ["NL", "JP"], meeting: [745, 485], axis: "y", offset: -210 },
  { countries: ["FR", "DE"], meeting: [730, 205], axis: "x", offset: 0 },
  {
    countries: ["SG", "AU", "IN"],
    meeting: [260, 490],
    axis: "y",
    offset: 175,
  },
  { countries: ["CA", "BR"], meeting: [510, 345], axis: "x", offset: -190 },
  { countries: ["SE", "IN"], meeting: [300, 200], axis: "y", offset: 0 },
  { countries: ["CH", "AE"], meeting: [720, 520], axis: "x", offset: 140 },
  { countries: ["MX", "ZA"], meeting: [765, 220], axis: "y", offset: -240 },
  { countries: ["US", "JP"], meeting: [230, 485], axis: "x", offset: -160 },
  { countries: ["GB", "AU", "CA"], meeting: [505, 320], axis: "y", offset: 0 },
  { countries: ["NL", "SG"], meeting: [290, 220], axis: "x", offset: 165 },
  { countries: ["BR", "IN"], meeting: [725, 480], axis: "y", offset: -220 },
  { countries: ["DE", "CA"], meeting: [740, 175], axis: "x", offset: 0 },
  { countries: ["ZA", "SE"], meeting: [265, 515], axis: "y", offset: 205 },
  { countries: ["AE", "FR"], meeting: [500, 350], axis: "x", offset: 180 },
  { countries: ["JP", "CH"], meeting: [310, 190], axis: "y", offset: -190 },
  {
    countries: ["MX", "GB", "NL"],
    meeting: [735, 500],
    axis: "x",
    offset: -160,
  },
  { countries: ["SG", "US"], meeting: [700, 215], axis: "y", offset: 0 },
  { countries: ["BR", "DE"], meeting: [245, 480], axis: "x", offset: 170 },
  { countries: ["IN", "AE"], meeting: [500, 335], axis: "y", offset: -210 },
  { countries: ["AU", "ZA"], meeting: [275, 205], axis: "x", offset: 0 },
  { countries: ["CA", "MX"], meeting: [750, 505], axis: "y", offset: 195 },
  {
    countries: ["SE", "FR", "JP"],
    meeting: [755, 195],
    axis: "x",
    offset: 155,
  },
  { countries: ["CH", "NL"], meeting: [260, 510], axis: "y", offset: 0 },
  { countries: ["US", "SG"], meeting: [505, 350], axis: "y", offset: -185 },
  { countries: ["NL", "GB"], meeting: [285, 195], axis: "x", offset: 150 },
  { countries: ["FR", "BR"], meeting: [740, 510], axis: "y", offset: 0 },
  { countries: ["CA", "IN"], meeting: [730, 215], axis: "x", offset: -170 },
  { countries: ["JP", "AE"], meeting: [260, 500], axis: "y", offset: 175 },
  { countries: ["DE", "MX"], meeting: [500, 340], axis: "x", offset: 0 },
];
const clamp = (n) => Math.min(1, Math.max(0, n));
const insideEdge = (n, extent) => Math.max(85, Math.min(extent - 85, n));
function flagClearanceTime(arms, clearance) {
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 36; i++) {
    const t = (lo + hi) / 2;
    const points = arms.map((arm) =>
      pointOnLeg(arm, approachProgress(t * APPROACH_SECONDS)),
    );
    const nearest = Math.min(
      ...points.flatMap((point, index) =>
        points.slice(index + 1).map((other) => distance(point, other)),
      ),
    );
    if (nearest > clearance) lo = t;
    else hi = t;
  }
  return ((lo + hi) / 2) * APPROACH_SECONDS;
}
export const CONNECTION_PAIRS = scenes.map((scene, index) => {
  const [x, y] = scene.meeting;
  const entries =
    scene.axis === "x"
      ? [
          [-95, insideEdge(y + scene.offset, MAP_SIZE.height)],
          [1095, insideEdge(y - scene.offset, MAP_SIZE.height)],
        ]
      : [
          [insideEdge(x + scene.offset, MAP_SIZE.width), -95],
          [insideEdge(x - scene.offset, MAP_SIZE.width), 815],
        ];
  if (scene.countries.length === 3)
    entries.push(
      scene.axis === "x"
        ? [
            scene.offset ? insideEdge(x + 240, MAP_SIZE.width) : x,
            index % 2 ? -95 : 815,
          ]
        : [
            index % 2 ? 1095 : -95,
            scene.offset ? insideEdge(y - 200, MAP_SIZE.height) : y,
          ],
    );
  const colours = Object.values(palette);
  const arms = entries.map((start, side) => ({
    ...connectionGeometry(
      start,
      scene.meeting,
      side === 2 ? (scene.axis === "x" ? "y" : "x") : scene.axis,
    ),
    id: `pair-${index}-${side}`,
    country: {
      code: scene.countries[side],
      name: COUNTRIES[scene.countries[side]],
    },
    colour: colours[(index + side * 2 + (side === 2 ? 1 : 0)) % colours.length],
  }));
  const flagClearAt = flagClearanceTime(arms, COUNTRY_RADIUS * 2 + 4);
  return {
    ...scene,
    id: "pair-" + index,
    startAt: index * PAIR_INTERVAL_SECONDS,
    arms,
    flagFadeAt: Math.min(
      flagClearanceTime(arms, COUNTRY_RADIUS * 3.5),
      flagClearAt - 0.24,
    ),
    flagClearAt,
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
export function approachAnimation(length = 1000) {
  return {
    keyTimes: normalized([
      0,
      ACCELERATE_AT,
      APPROACH_SECONDS,
      NETWORK_LOOP_SECONDS,
    ]),
    keyPoints: `0;${GLIDE_PROGRESS};1;1`,
    widths: [0, GLIDE_PROGRESS, 1, 1]
      .map((progress) => `${progress * length} ${length * 2}`)
      .join(";"),
    keySplines: [GLIDE_EASING.join(" "), JOIN_EASING.join(" "), "0 0 1 1"].join(
      ";",
    ),
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
      CALL_SETTLE_AT,
      CALL_FADE_AT,
      EVENT_SECONDS,
      NETWORK_LOOP_SECONDS,
    ]),
    values: "0;0;1;1;1;0;0",
    scales: ".62;.62;1.04;1;1;.94;.94",
    keySplines: "0 0 1 1;.2 .7 .2 1;.3 0 .4 1;0 0 1 1;.4 0 .6 1;0 0 1 1",
  };
}
export function contactAnimation() {
  return {
    keyTimes: normalized([
      0,
      APPROACH_SECONDS,
      APPROACH_SECONDS + 0.02,
      CALL_SETTLE_AT + 0.18,
      NETWORK_LOOP_SECONDS,
    ]),
    values: "0;0;.5;0;0",
    scales: ".3;.3;.45;1.55;1.55",
    // The ring switches on only at contact, then travels out and fades.
    keySplines: "0 0 1 1;0 0 1 1;.12 .65 .3 1;0 0 1 1",
  };
}
export function checkAnimation() {
  return {
    keyTimes: normalized([
      0,
      CALL_VISIBLE_AT,
      CALL_SETTLE_AT + 0.06,
      NETWORK_LOOP_SECONDS,
    ]),
    values: "1;1;0;0",
    keySplines: "0 0 1 1;.2 .7 .2 1;0 0 1 1",
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
  const progress = approachProgress(age);
  return {
    pair,
    age,
    progress,
    points: pair.arms.map((arm) => pointOnLeg(arm, progress)),
    lineOpacity: sampleAnimation(lineAnimation(), age),
    flagOpacity: sampleAnimation(flagAnimation(pair), age),
    callOpacity: sampleAnimation(callAnimation(), age),
    callScale: sampleAnimation(callAnimation(), age, "scales"),
    contactOpacity:
      age < APPROACH_SECONDS ? 0 : sampleAnimation(contactAnimation(), age),
    contactScale: sampleAnimation(contactAnimation(), age, "scales"),
    checkOffset: sampleAnimation(checkAnimation(), age),
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
