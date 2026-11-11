// One 40-second score. All journey and ambience periods divide this duration,
// so the network returns to the same state without random resets or drift.
export const NETWORK_LOOP_SECONDS = 40;
export const JOURNEY_SECONDS = 40;
export const MAP_SIZE = { width: 1000, height: 720 };
export const STATIONS = [
  { code: "CA", name: "Canada", city: "Toronto", x: 120, y: 120 },
  { code: "US", name: "United States", city: "New York", x: 100, y: 340 },
  { code: "MX", name: "Mexico", city: "Mexico City", x: 205, y: 550 },
  { code: "BR", name: "Brazil", city: "São Paulo", x: 350, y: 635 },
  { code: "GB", name: "United Kingdom", city: "London", x: 360, y: 100 },
  { code: "NL", name: "Netherlands", city: "Amsterdam", x: 465, y: 228 },
  { code: "DE", name: "Germany", city: "Berlin", x: 570, y: 95 },
  { code: "SE", name: "Sweden", city: "Stockholm", x: 700, y: 215 },
  { code: "FR", name: "France", city: "Paris", x: 360, y: 365 },
  { code: "ZA", name: "South Africa", city: "Cape Town", x: 555, y: 605 },
  { code: "AE", name: "United Arab Emirates", city: "Dubai", x: 685, y: 427 },
  { code: "IN", name: "India", city: "Mumbai", x: 815, y: 540 },
  { code: "SG", name: "Singapore", city: "Singapore", x: 875, y: 348 },
  { code: "JP", name: "Japan", city: "Tokyo", x: 856, y: 100 },
  { code: "CH", name: "Switzerland", city: "Zürich", x: 932, y: 225 },
  { code: "AU", name: "Australia", city: "Sydney", x: 875, y: 640 },
];
export const INTERCHANGE = { x: 538, y: 353 };
const positions = Object.fromEntries([
  ...STATIONS.map((s) => [s.code, [s.x, s.y]]),
  ["AB", [INTERCHANGE.x, INTERCHANGE.y]],
]);
const lines = [
  {
    id: "atlantic",
    name: "Atlantic",
    colour: "#afd4e0",
    points: ["US", [128, 210], "GB", "NL", "DE", [724, 160], "JP"],
  },
  {
    id: "meridian",
    name: "Meridian",
    colour: "#b5cdb8",
    points: ["CA", [230, 210], "FR", "AB", "AE", "IN", "AU"],
  },
  {
    id: "southern",
    name: "Southern",
    colour: "#d9bd8a",
    points: ["MX", "BR", [445, 670], "ZA", "IN", "SG"],
  },
  {
    id: "northern",
    name: "Northern",
    colour: "#b8acd5",
    points: ["CA", [222, 55], "GB", [527, 150], "SE", [827, 255], "CH", "JP"],
  },
  {
    id: "orbit",
    name: "Orbit",
    colour: "#d1aa98",
    points: [
      "BR",
      [271, 486],
      "FR",
      [412, 274],
      "NL",
      [575, 256],
      "AB",
      [703, 308],
      "SG",
      [870, 226],
      "JP",
    ],
  },
  {
    id: "eastern",
    name: "Eastern",
    colour: "#91c8c4",
    points: [
      "DE",
      [670, 95],
      "SE",
      [750, 312],
      "AE",
      "SG",
      "CH",
      [960, 426],
      [950, 572],
      "AU",
    ],
  },
  {
    id: "return",
    name: "Return",
    colour: "#d9dfd0",
    points: ["US", [55, 476], "MX", [381, 517], "ZA", [710, 672], "AU"],
  },
  {
    id: "interchange",
    name: "Interchange",
    colour: "#cfaec4",
    points: [
      "GB",
      [294, 221],
      "FR",
      [459, 474],
      "ZA",
      [641, 530],
      "AE",
      [604, 191],
      "NL",
      [300, 162],
      "CA",
    ],
  },
];
const pointOnCubic = (segment, t) => {
  const u = 1 - t,
    [a, b, c, d] = segment;
  return [0, 1].map(
    (axis) =>
      u * u * u * a[axis] +
      3 * u * u * t * b[axis] +
      3 * u * t * t * c[axis] +
      t * t * t * d[axis],
  );
};
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const round = (n) => Number(n.toFixed(4));
export function makeGeometry(line) {
  const points = line.points.map((p) =>
    typeof p === "string" ? positions[p] : p,
  );
  const segments = [],
    lengths = [];
  const tension = 0.92;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i],
      d = points[i + 1],
      previous = points[Math.max(0, i - 1)],
      next = points[Math.min(points.length - 1, i + 2)];
    const b = a.map((v, j) => v + ((d[j] - previous[j]) * tension) / 6);
    const c = d.map((v, j) => v - ((next[j] - a[j]) * tension) / 6);
    const segment = [a, b, c, d];
    segments.push(segment);
    let length = 0,
      last = a;
    for (let sample = 1; sample <= 64; sample++) {
      const p = pointOnCubic(segment, sample / 64);
      length += distance(last, p);
      last = p;
    }
    lengths.push(length);
  }
  const total = lengths.reduce((a, b) => a + b, 0),
    stops = [{ code: line.points[0], progress: 0 }];
  let travelled = 0;
  for (let i = 1; i < points.length; i++) {
    travelled += lengths[i - 1];
    if (typeof line.points[i] === "string" && line.points[i] !== "AB")
      stops.push({ code: line.points[i], progress: round(travelled / total) });
  }
  const path =
    "M" +
    points[0].join(" ") +
    segments
      .map(([, b, c, d]) => "C" + [...b, ...c, ...d].map(round).join(" "))
      .join("");
  return { ...line, path, segments, lengths, length: total, stops };
}
export const NETWORK_ROUTES = lines.map(makeGeometry);

// Arc-length weighting gives long and short bends the same cruising speed.
// Every actual flag station receives a 0.34-second dwell. Easing applies to
// departures/arrivals, not individual rendering frames; curves remain C1 smooth.
export function journeyTiming(route, reverse = false) {
  const stops = reverse ? [...route.stops].reverse() : route.stops;
  const dwell = 0.34,
    edge = 0.7,
    travel = JOURNEY_SECONDS - 2 * edge - dwell * (stops.length - 2);
  const times = [0, edge / JOURNEY_SECONDS],
    progress = [stops[0].progress, stops[0].progress];
  let elapsed = edge;
  for (let i = 1; i < stops.length; i++) {
    elapsed += Math.abs(stops[i].progress - stops[i - 1].progress) * travel;
    times.push(round(elapsed / JOURNEY_SECONDS));
    progress.push(stops[i].progress);
    if (i < stops.length - 1) {
      elapsed += dwell;
      times.push(round(elapsed / JOURNEY_SECONDS));
      progress.push(stops[i].progress);
    }
  }
  times.push(1);
  progress.push(stops.at(-1).progress);
  return {
    times,
    progress,
    keyTimes: times.join(";"),
    keyPoints: progress.join(";"),
    keySplines: times
      .slice(1)
      .map(() => ".34 0 .24 1")
      .join(";"),
  };
}
