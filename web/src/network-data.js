// Four overlapping routes share a minute-long score. Each flag travels with
// its own advancing line; completed connections stay drawn through the handoff.
export const NETWORK_LOOP_SECONDS = 60;
export const MAP_SIZE = { width: 1000, height: 720 };
export const BAND_WIDTH = 104;
export const COUNTRY_RADIUS = 62;
export const HANDOFF_SECONDS = 0.65;
export const FLAG_FADE_SECONDS = 0.3;
export const ROUTE_EASING = [0.32, 0, 0.3, 1];
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
// Shared transfer stations have identical coordinates on every visiting route.
const routes = [
  {
    id: "rose",
    colour: "#f52b87",
    entry: [-180, 450],
    exit: [1180, 620],
    countries: ["US", "GB", "DE", "JP", "AU"],
    phase: 58,
  },
  {
    id: "tangerine",
    colour: "#ff8a24",
    entry: [625, 900],
    exit: [-180, 275],
    countries: ["ZA", "NL", "JP", "CH", "IN", "SG"],
    axes: { 2: "y" },
    phase: 13,
  },
  {
    id: "aqua",
    colour: "#25b9d6",
    entry: [1180, 620],
    exit: [375, 900],
    countries: ["BR", "FR", "GB", "SE"],
    axes: { 2: "y" },
    phase: 28,
  },
  {
    id: "gold",
    colour: "#ffca2c",
    entry: [130, -180],
    exit: [-180, 450],
    countries: ["CA", "MX", "NL", "CH", "AE"],
    axes: { 4: "y" },
    phase: 43,
  },
];
export const CONNECTION_STREAMS = routes.map((route) => {
  let previous = route.entry;
  const destinations = route.countries.map((code) => countries[code]);
  const legs = [...destinations, null].map((country, index) => {
    const end = country ? [country.x, country.y] : route.exit;
    const geometry = connectionGeometry(previous, end, route.axes?.[index]);
    previous = end;
    return {
      ...geometry,
      id: route.id + "-" + index,
      index,
      country: country || destinations.at(-1),
      isExit: !country,
      colour: route.colour,
    };
  });
  const length = legs.reduce((sum, leg) => sum + leg.length, 0);
  let elapsed = 0,
    travelled = 0;
  for (const leg of legs) {
    leg.startAt = elapsed;
    leg.travelSeconds = (48 * leg.length) / length;
    leg.arriveAt = elapsed + leg.travelSeconds;
    leg.endAt = leg.arriveAt + (leg.isExit ? 0 : HANDOFF_SECONDS);
    leg.startProgress = travelled / length;
    leg.endProgress = (travelled + leg.length) / length;
    elapsed = leg.endAt;
    travelled += leg.length;
  }
  for (const leg of legs) {
    const next = legs[leg.index + 1];
    // Keep the incoming connection drawn while the next line departs. Retire
    // the entire old connection, rather than a short tail chasing one head.
    leg.fadeAt = next ? next.arriveAt + 0.15 : leg.arriveAt + 0.15;
    leg.clearAt = leg.fadeAt + 1.1;
  }
  legs.at(-1).endProgress = 1;
  return {
    ...route,
    legs,
    length,
    finishesAt: elapsed,
    path:
      legs[0].path +
      legs
        .slice(1)
        .map((leg) => leg.path.replace(/^M[-\d.]+ [-\d.]+/, ""))
        .join(""),
  };
});
export const CONNECTION_LEGS = CONNECTION_STREAMS.flatMap(
  (route) => route.legs,
);
export const TRANSFER_STATIONS = STATIONS.filter(
  (country) =>
    CONNECTION_STREAMS.filter((route) => route.countries.includes(country.code))
      .length > 1,
);
const normalized = (values) =>
  values.map((value) => round(value / NETWORK_LOOP_SECONDS)).join(";");
export const routeBegin = (route) => `-${route.phase}s`;
export function routeMotion(route) {
  const times = [0],
    points = [0],
    splines = [];
  for (const leg of route.legs) {
    times.push(leg.arriveAt);
    points.push(leg.endProgress);
    splines.push(ROUTE_EASING.join(" "));
    if (leg.endAt > leg.arriveAt) {
      times.push(leg.endAt);
      points.push(leg.endProgress);
      splines.push("0 0 1 1");
    }
  }
  times.push(NETWORK_LOOP_SECONDS);
  points.push(1);
  splines.push("0 0 1 1");
  return {
    keyTimes: normalized(times),
    keyPoints: points.map(round).join(";"),
    keySplines: splines.join(";"),
  };
}
export function bandAnimation(leg) {
  const waits = leg.startAt > 0;
  return {
    keyTimes: normalized(
      waits ? [0, leg.startAt, leg.arriveAt, 60] : [0, leg.arriveAt, 60],
    ),
    widths: waits
      ? "0 2000;0 2000;1000 2000;1000 2000"
      : "0 2000;1000 2000;1000 2000",
    keySplines: [
      ...(waits ? ["0 0 1 1"] : []),
      ROUTE_EASING.join(" "),
      "0 0 1 1",
    ].join(";"),
    visibilityTimes: normalized(
      waits
        ? [0, leg.startAt, leg.startAt + 0.04, leg.fadeAt, leg.clearAt, 60]
        : [0, leg.fadeAt, leg.clearAt, 60],
    ),
    opacity: waits ? "0;0;1;1;0;0" : "1;1;0;0",
  };
}
export function flagAnimation(route, code) {
  const times = [0],
    values = [route.legs[0].country.code === code ? 1 : 0];
  for (const leg of route.legs) {
    const next = route.legs[leg.index + 1];
    if (!next || next.country.code === leg.country.code) continue;
    times.push(leg.arriveAt, leg.arriveAt + FLAG_FADE_SECONDS, leg.endAt);
    values.push(
      leg.country.code === code ? 1 : 0,
      next.country.code === code ? 1 : 0,
      next.country.code === code ? 1 : 0,
    );
  }
  times.push(NETWORK_LOOP_SECONDS);
  values.push(route.legs.at(-1).country.code === code ? 1 : 0);
  return { keyTimes: normalized(times), values: values.join(";") };
}
const cubic = (p1, p2, t) =>
  3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3;
export function ease(progress) {
  const x = Math.min(1, Math.max(0, progress));
  if (x === 0 || x === 1) return x;
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 32; i++) {
    const t = (lo + hi) / 2;
    if (cubic(ROUTE_EASING[0], ROUTE_EASING[2], t) < x) lo = t;
    else hi = t;
  }
  return cubic(ROUTE_EASING[1], ROUTE_EASING[3], (lo + hi) / 2);
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
export function routeStateAt(route, seconds) {
  const time = modulo(seconds, NETWORK_LOOP_SECONDS);
  const leg = route.legs.find((item) => time < item.endAt) || route.legs.at(-1);
  const progress = ease((time - leg.startAt) / leg.travelSeconds);
  const next = route.legs[leg.index + 1];
  const exchange = next
    ? Math.min(1, Math.max(0, (time - leg.arriveAt) / FLAG_FADE_SECONDS))
    : 0;
  return {
    route,
    time,
    leg,
    progress,
    point: pointOnLeg(leg, progress),
    bands: route.legs.map((item) => ({
      leg: item,
      to: ease((time - item.startAt) / item.travelSeconds),
      opacity:
        time < item.startAt
          ? 0
          : Math.min(
              1,
              item.startAt === 0 ? 1 : (time - item.startAt) / 0.04,
              Math.max(0, (item.clearAt - time) / (item.clearAt - item.fadeAt)),
            ),
    })),
    flags: route.countries.map((code) => ({
      code,
      opacity:
        (leg.country.code === code ? 1 - exchange : 0) +
        (next?.country.code === code ? exchange : 0),
    })),
  };
}
export const networkStateAt = (seconds) =>
  CONNECTION_STREAMS.map((route) => routeStateAt(route, seconds + route.phase));
// The reduced-motion scene samples the same overlapping routes, not a poster.
export const STILL_CONNECTIONS = networkStateAt(0);
