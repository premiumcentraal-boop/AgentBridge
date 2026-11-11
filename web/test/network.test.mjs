import test from "node:test";
import assert from "node:assert/strict";
import {
  NETWORK_LOOP_SECONDS,
  MAP_SIZE,
  COUNTRY_RADIUS,
  BAND_WIDTH,
  STATIONS,
  TRANSFER_STATIONS,
  CONNECTION_STREAMS,
  CONNECTION_LEGS,
  HANDOFF_SECONDS,
  FLAG_FADE_SECONDS,
  routeMotion,
  routeStateAt,
  networkStateAt,
  pointOnLeg,
  bandAnimation,
  flagAnimation,
  ease,
} from "../src/network-data.js";
const near = (a, b, epsilon = 0.00001) =>
  assert.ok(Math.abs(a - b) < epsilon, `${a} ≠ ${b}`);
const samePoint = (a, b) => {
  near(a[0], b[0]);
  near(a[1], b[1]);
};
const inCanvas = (point) =>
  point[0] >= 0 &&
  point[0] <= MAP_SIZE.width &&
  point[1] >= 0 &&
  point[1] <= MAP_SIZE.height;
const outsideFrame = (point) =>
  point[0] < -COUNTRY_RADIUS ||
  point[0] > MAP_SIZE.width + COUNTRY_RADIUS ||
  point[1] < -COUNTRY_RADIUS ||
  point[1] > MAP_SIZE.height + COUNTRY_RADIUS;
function sampleTimeline(keyTimes, values, seconds, splines) {
  const times = keyTimes.split(";").map(Number),
    numbers = values.split(";").map(Number);
  const t = seconds / NETWORK_LOOP_SECONDS;
  let index = times.findIndex((time) => time > t) - 1;
  if (index < 0) return numbers.at(-1);
  let progress = (t - times[index]) / (times[index + 1] - times[index]);
  if (splines && splines.split(";")[index] !== "0 0 1 1")
    progress = ease(progress);
  return numbers[index] + (numbers[index + 1] - numbers[index]) * progress;
}
test("four distinct overlapping routes cover sixteen countries and share exact transfer stations", () => {
  assert.equal(NETWORK_LOOP_SECONDS, 60);
  assert.equal(CONNECTION_STREAMS.length, 4);
  assert.equal(new Set(CONNECTION_STREAMS.map((r) => r.colour)).size, 4);
  assert.equal(
    new Set(CONNECTION_STREAMS.flatMap((r) => r.countries)).size,
    16,
  );
  assert.ok(BAND_WIDTH >= 100);
  assert.equal(TRANSFER_STATIONS.length, 4);
  const reached = new Set([CONNECTION_STREAMS[0].id]);
  for (let pass = 0; pass < 4; pass++)
    for (const route of CONNECTION_STREAMS)
      if (
        CONNECTION_STREAMS.some(
          (other) =>
            reached.has(other.id) &&
            other.countries.some((code) => route.countries.includes(code)),
        )
      )
        reached.add(route.id);
  assert.equal(reached.size, 4, "the transfer graph connects all four colours");
  for (const route of CONNECTION_STREAMS) {
    assert.ok(outsideFrame(route.entry) && outsideFrame(route.exit));
    assert.equal((route.path.match(/M/g) || []).length, 1);
    assert.ok(
      !route.path.endsWith("Z"),
      "routes cross the frame rather than form one closed trail",
    );
    assert.ok(route.finishesAt < NETWORK_LOOP_SECONDS - 2);
    for (const leg of route.legs) {
      assert.ok(leg.turns === 0 || leg.turns === 1);
      assert.equal((leg.path.match(/A/g) || []).length, leg.turns);
      if (!leg.isExit) {
        const station = STATIONS.find((s) => s.code === leg.country.code);
        samePoint(leg.end, [station.x, station.y]);
        near(leg.endAt - leg.arriveAt, HANDOFF_SECONDS);
      }
      const next = route.legs[leg.index + 1];
      if (next) {
        samePoint(leg.end, next.start);
        near(leg.endAt, next.startAt);
        const a = pointOnLeg(leg, 0.999),
          b = pointOnLeg(next, 0.001);
        const incoming = leg.end.map((n, i) => n - a[i]),
          outgoing = b.map((n, i) => n - next.start[i]);
        const dot =
          (incoming[0] * outgoing[0] + incoming[1] * outgoing[1]) /
          (Math.hypot(...incoming) * Math.hypot(...outgoing));
        assert.ok(
          dot > -0.99,
          "no route doubles back along the connection it just completed",
        );
      }
    }
  }
});
test("multiple flag circles move with their own line heads while completed connections stay drawn", () => {
  let maxVisible = 0;
  for (let seconds = 0; seconds < 60; seconds += 0.05) {
    const states = networkStateAt(seconds),
      visible = states.filter((state) => inCanvas(state.point));
    assert.ok(
      visible.length >= 2,
      "multiple routes must remain active throughout the minute",
    );
    maxVisible = Math.max(maxVisible, visible.length);
    for (const state of states) {
      const band = state.bands[state.leg.index];
      samePoint(state.point, pointOnLeg(state.leg, band.to));
      for (const piece of state.bands) {
        assert.ok(piece.to >= 0 && piece.to <= 1);
        assert.ok(piece.opacity >= 0 && piece.opacity <= 1);
        if (state.time >= piece.leg.arriveAt) near(piece.to, 1);
      }
    }
  }
  assert.ok(maxVisible >= 3, "several flag circles can be visible together");
  for (const route of CONNECTION_STREAMS)
    for (const leg of route.legs.slice(0, -1)) {
      const next = route.legs[leg.index + 1];
      const handoff = routeStateAt(
        route,
        next.startAt + next.travelSeconds * 0.2,
      );
      near(handoff.bands[leg.index].to, 1);
      near(handoff.bands[leg.index].opacity, 1);
    }
});
test("countries exchange at shared endpoints and each minute restarts outside the visible frame", () => {
  for (const route of CONNECTION_STREAMS) {
    for (const leg of route.legs.slice(0, -1)) {
      const next = route.legs[leg.index + 1];
      for (const offset of [
        0,
        FLAG_FADE_SECONDS / 2,
        FLAG_FADE_SECONDS,
        HANDOFF_SECONDS - 0.0001,
      ]) {
        const state = routeStateAt(route, leg.arriveAt + offset);
        samePoint(state.point, next.start);
        near(
          state.flags.reduce((sum, f) => sum + f.opacity, 0),
          1,
        );
        if (offset === FLAG_FADE_SECONDS)
          near(
            state.flags.find((f) => f.code === next.country.code).opacity,
            1,
          );
      }
    }
    for (const seconds of [0, 0.01, 1, 13, 29, 59.65, 59.99, 60]) {
      const a = routeStateAt(route, seconds),
        b = routeStateAt(route, seconds + 60);
      samePoint(a.point, b.point);
      for (let i = 0; i < a.flags.length; i++)
        near(a.flags[i].opacity, b.flags[i].opacity);
      for (let i = 0; i < a.bands.length; i++) {
        near(a.bands[i].to, b.bands[i].to);
        near(a.bands[i].opacity, b.bands[i].opacity);
      }
    }
    assert.ok(outsideFrame(routeStateAt(route, 59.999).point));
    assert.ok(outsideFrame(routeStateAt(route, 0).point));
    assert.ok(routeStateAt(route, 59.999).bands.every((b) => b.opacity === 0));
  }
});
test("native motion, line growth and flag exchange use the same valid sixty-second timing", () => {
  for (const leg of CONNECTION_LEGS) {
    const animation = bandAnimation(leg);
    assert.equal(
      animation.keyTimes.split(";").length,
      animation.widths.split(";").length,
    );
    assert.equal(
      animation.keySplines.split(";").length + 1,
      animation.widths.split(";").length,
    );
  }
  for (const route of CONNECTION_STREAMS) {
    const motion = routeMotion(route);
    assert.equal(
      motion.keyTimes.split(";").length,
      motion.keyPoints.split(";").length,
    );
    assert.equal(
      motion.keySplines.split(";").length + 1,
      motion.keyPoints.split(";").length,
    );
    const flagTimelines = route.countries.map((code) =>
      flagAnimation(route, code),
    );
    for (const timeline of [
      motion.keyTimes,
      ...route.legs.flatMap((leg) => [
        bandAnimation(leg).keyTimes,
        bandAnimation(leg).visibilityTimes,
      ]),
      ...flagTimelines.map((a) => a.keyTimes),
    ]) {
      const values = timeline.split(";").map(Number);
      assert.equal(values[0], 0);
      assert.equal(values.at(-1), 1);
      for (let i = 1; i < values.length; i++)
        assert.ok(values[i] > values[i - 1]);
    }
    for (let seconds = 0.05; seconds < 60; seconds += 0.1) {
      const state = routeStateAt(route, seconds);
      near(
        sampleTimeline(
          motion.keyTimes,
          motion.keyPoints,
          seconds,
          motion.keySplines,
        ),
        state.leg.startProgress +
          state.progress * (state.leg.endProgress - state.leg.startProgress),
      );
      for (const band of state.bands) {
        const animation = bandAnimation(band.leg);
        const widths = animation.widths
          .split(";")
          .map((value) => value.split(" ")[0])
          .join(";");
        near(
          sampleTimeline(
            animation.keyTimes,
            widths,
            seconds,
            animation.keySplines,
          ) / 1000,
          band.to,
        );
      }
      for (let index = 0; index < flagTimelines.length; index++) {
        const animation = flagTimelines[index];
        near(
          sampleTimeline(animation.keyTimes, animation.values, seconds),
          state.flags[index].opacity,
        );
      }
    }
  }
});
