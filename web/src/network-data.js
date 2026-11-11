// Four broad colour bands share one seamless forty-second score. A leg is
// always a straight run or exactly one tangent, circular 90-degree elbow.
export const NETWORK_LOOP_SECONDS = 40;
export const MAP_SIZE = { width: 1000, height: 720 };
export const BAND_WIDTH = 104;
export const COUNTRY_RADIUS = 62;
export const STATIONS = [
  { code: "CA", name: "Canada", x: 130, y: 110 },
  { code: "GB", name: "United Kingdom", x: 375, y: 110 },
  { code: "DE", name: "Germany", x: 625, y: 110 },
  { code: "JP", name: "Japan", x: 870, y: 110 },
  { code: "FR", name: "France", x: 130, y: 275 },
  { code: "SG", name: "Singapore", x: 375, y: 275 },
  { code: "NL", name: "Netherlands", x: 625, y: 275 },
  { code: "CH", name: "Switzerland", x: 870, y: 275 },
  { code: "US", name: "United States", x: 130, y: 450 },
  { code: "SE", name: "Sweden", x: 375, y: 450 },
  { code: "AE", name: "United Arab Emirates", x: 625, y: 450 },
  { code: "IN", name: "India", x: 870, y: 450 },
  { code: "MX", name: "Mexico", x: 130, y: 620 },
  { code: "BR", name: "Brazil", x: 375, y: 620 },
  { code: "ZA", name: "South Africa", x: 625, y: 620 },
  { code: "AU", name: "Australia", x: 870, y: 620 },
];
const countries = Object.fromEntries(STATIONS.map((s) => [s.code, s]));
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const round = (value) => Number(value.toFixed(5));
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
  const a = corner.map((n, i) => round(n - incoming[i] * radius));
  const b = corner.map((n, i) => round(n + outgoing[i] * radius));
  const sweep =
    incoming[0] * outgoing[1] - incoming[1] * outgoing[0] > 0 ? 1 : 0;
  return {
    path: `M${start.join(" ")}L${a.join(" ")}A${radius} ${radius} 0 0 ${sweep} ${b.join(" ")}L${end.join(" ")}`,
    start,
    end,
    corner,
    arcStart: a,
    arcEnd: b,
    incoming,
    outgoing,
    sweep,
    radius,
    turns: 1,
    length: distance(start, a) + (Math.PI * radius) / 2 + distance(b, end),
  };
}
const streams = [
  {
    id: "rose",
    colour: "#f52b87",
    entry: [-180, 450],
    countries: ["US", "GB", "JP", "AU"],
  },
  {
    id: "tangerine",
    colour: "#ff8a24",
    entry: [625, 900],
    countries: ["ZA", "NL", "IN", "SG"],
  },
  {
    id: "aqua",
    colour: "#25b9d6",
    entry: [1140, 620],
    countries: ["BR", "FR", "DE", "SE"],
  },
  {
    id: "gold",
    colour: "#ffca2c",
    entry: [130, -180],
    countries: ["CA", "MX", "CH", "AE"],
  },
];
export const CONNECTION_STREAMS = streams.map((stream, streamIndex) => {
  let previous = stream.entry;
  const legs = stream.countries.map((code, index) => {
    const country = countries[code],
      end = [country.x, country.y];
    const geometry = connectionGeometry(previous, end);
    previous = end;
    return {
      ...geometry,
      id: stream.id + "-" + index,
      country,
      colour: stream.colour,
    };
  });
  const total = legs.reduce((sum, leg) => sum + leg.length, 0);
  let cursor = 0.15;
  for (let index = 0; index < legs.length; index++) {
    const leg = legs[index];
    leg.startAt = cursor;
    leg.travelSeconds = (27 * leg.length) / total;
    leg.arriveAt = cursor + leg.travelSeconds;
    cursor = leg.arriveAt + 1.15;
  }
  for (let index = 0; index < legs.length; index++) {
    const leg = legs[index],
      next = legs[index + 1];
    leg.wipeAt = next ? next.startAt + 0.4 : 33.4;
    leg.clearAt = next
      ? leg.wipeAt + Math.min(4.4, leg.travelSeconds * 0.8)
      : 37.6;
    leg.revealAt = leg.arriveAt;
    leg.revealedAt = leg.arriveAt + 0.4;
    leg.holdUntil = next ? leg.clearAt - 0.8 : 35;
    leg.hideAt = next ? leg.clearAt + 0.2 : 37.8;
  }
  // The first painted frame already contains large flag circles. Subsequent
  // arrivals naturally stagger because travel time is weighted by distance.
  return { ...stream, legs, phase: round(legs[streamIndex].arriveAt + 0.65) };
});
export const CONNECTION_LEGS = CONNECTION_STREAMS.flatMap(
  (stream) => stream.legs,
);
const times = (values) =>
  values.map((value) => round(value / NETWORK_LOOP_SECONDS)).join(";");
export function bandAnimation(leg) {
  return {
    keyTimes: times([
      0,
      leg.startAt,
      leg.arriveAt,
      leg.wipeAt,
      leg.clearAt,
      NETWORK_LOOP_SECONDS,
    ]),
    widths: "0 2000;0 2000;1000 2000;1000 2000;0 2000;0 2000",
    offsets: "0;0;0;0;-1000;-1000",
    keySplines: ".3 0 .3 1;.3 0 .26 1;.3 0 .3 1;.3 0 .26 1;.3 0 .3 1",
    visibilityTimes: times([
      0,
      leg.startAt,
      leg.startAt + 0.12,
      leg.clearAt - 0.12,
      leg.clearAt,
      NETWORK_LOOP_SECONDS,
    ]),
  };
}
export function countryAnimation(leg) {
  return {
    keyTimes: times([
      0,
      leg.revealAt,
      leg.revealedAt,
      leg.holdUntil,
      leg.hideAt,
      NETWORK_LOOP_SECONDS,
    ]),
    opacity: "0;0;1;1;0;0",
    scale: ".88;.88;1;1;1;1",
    keySplines: ".22 1 .36 1;.22 1 .36 1;.22 1 .36 1;.4 0 .6 1;.4 0 .6 1",
  };
}
// A composed still for reduced motion, available before JavaScript runs.
export const STILL_CONNECTIONS = [
  {
    ...connectionGeometry([-180, 550], [815, 550]),
    colour: "#f52b87",
    country: countries.JP,
  },
  {
    ...connectionGeometry([230, 900], [650, 265], "y"),
    colour: "#ff8a24",
    country: countries.GB,
  },
  {
    ...connectionGeometry([1140, 105], [460, 415]),
    colour: "#25b9d6",
    country: countries.NL,
  },
];
