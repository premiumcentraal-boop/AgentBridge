import test from "node:test";
import assert from "node:assert/strict";
import {
  NETWORK_LOOP_SECONDS,
  MAP_SIZE,
  COUNTRY_RADIUS,
  BAND_WIDTH,
  STATIONS,
  RELAY_LEGS,
  RELAY_PATH,
  HANDOFF_SECONDS,
  FLAG_FADE_SECONDS,
  TRAIL_SECONDS,
  relayMotion,
  relayStateAt,
  pointOnLeg,
  bandAnimation,
  flagAnimation,
} from "../src/network-data.js";
const near = (a, b, epsilon = 0.00001) =>
  assert.ok(Math.abs(a - b) < epsilon, `${a} ≠ ${b}`);
const samePoint = (a, b) => {
  near(a[0], b[0]);
  near(a[1], b[1]);
};
test("all sixteen relay legs meet exactly, including the last-to-first handoff", () => {
  assert.equal(NETWORK_LOOP_SECONDS, 60);
  assert.equal(RELAY_LEGS.length, 16);
  assert.ok(BAND_WIDTH >= 100);
  assert.equal(new Set(STATIONS.map((s) => s.code)).size, 16);
  assert.equal((RELAY_PATH.match(/M/g) || []).length, 1);
  assert.ok(RELAY_PATH.endsWith("Z"));
  for (let i = 0; i < RELAY_LEGS.length; i++) {
    const leg = RELAY_LEGS[i],
      next = RELAY_LEGS[(i + 1) % RELAY_LEGS.length];
    samePoint(leg.end, next.start);
    samePoint(leg.outgoing, next.incoming);
    assert.ok(leg.turns === 0 || leg.turns === 1);
    assert.equal((leg.path.match(/A/g) || []).length, leg.turns);
    if (i < RELAY_LEGS.length - 1) near(leg.endAt, next.startAt);
    near(leg.endAt - leg.arriveAt, HANDOFF_SECONDS);
  }
  near(RELAY_LEGS[0].startAt, 0);
  near(RELAY_LEGS.at(-1).endAt, 60);
});
test("the flag baton remains at the advancing end of a single connected coloured trail", () => {
  for (let seconds = 0; seconds < 60; seconds += 0.05) {
    const state = relayStateAt(seconds),
      band = state.bands[state.leg.index];
    samePoint(state.point, pointOnLeg(state.leg, band.to));
    const visible = state.bands.map((b) => b.to - b.from > 1e-7);
    let starts = 0;
    for (let i = 0; i < visible.length; i++)
      if (visible[i] && !visible[(i + visible.length - 1) % visible.length])
        starts++;
    assert.equal(
      starts,
      1,
      "the trail must not break into disconnected pieces at " + seconds,
    );
    for (const piece of state.bands)
      assert.ok(piece.from >= 0 && piece.to <= 1 && piece.from <= piece.to);
    assert.ok(
      state.point[0] > COUNTRY_RADIUS &&
        state.point[0] < MAP_SIZE.width - COUNTRY_RADIUS,
    );
    assert.ok(
      state.point[1] > COUNTRY_RADIUS &&
        state.point[1] < MAP_SIZE.height - COUNTRY_RADIUS,
    );
  }
  assert.ok(TRAIL_SECONDS < NETWORK_LOOP_SECONDS);
});
test("the baton changes country at the shared point and the minute boundary has no jump or blank flag", () => {
  for (const leg of RELAY_LEGS) {
    const next = RELAY_LEGS[(leg.index + 1) % RELAY_LEGS.length];
    for (const offset of [
      0,
      FLAG_FADE_SECONDS / 2,
      FLAG_FADE_SECONDS,
      HANDOFF_SECONDS - 0.0001,
    ]) {
      const state = relayStateAt(leg.arriveAt + offset);
      samePoint(state.point, leg.end);
      near(
        state.flags.reduce((sum, f) => sum + f.opacity, 0),
        1,
      );
      if (offset === FLAG_FADE_SECONDS)
        near(state.flags[next.index].opacity, 1);
    }
  }
  for (const seconds of [0, 0.01, 1, 13, 29, 59.65, 59.99, 60]) {
    const a = relayStateAt(seconds),
      b = relayStateAt(seconds + 60);
    samePoint(a.point, b.point);
    for (let i = 0; i < a.flags.length; i++) {
      near(a.flags[i].opacity, b.flags[i].opacity);
      near(a.bands[i].from, b.bands[i].from);
      near(a.bands[i].to, b.bands[i].to);
    }
  }
  samePoint(pointOnLeg(RELAY_LEGS.at(-1), 1), pointOnLeg(RELAY_LEGS[0], 0));
});
test("motion, line drawing and flag exchange use valid timing on the same sixty-second score", () => {
  const motion = relayMotion();
  assert.equal(
    motion.keyTimes.split(";").length,
    motion.keyPoints.split(";").length,
  );
  assert.equal(motion.keyPoints.split(";")[0], "0");
  assert.equal(motion.keyPoints.split(";").at(-1), "1");
  for (const leg of RELAY_LEGS)
    for (const timeline of [
      motion.keyTimes,
      bandAnimation(leg).keyTimes,
      flagAnimation(leg).keyTimes,
    ]) {
      const values = timeline.split(";").map(Number);
      assert.equal(values[0], 0);
      assert.equal(values.at(-1), 1);
      for (let i = 1; i < values.length; i++)
        assert.ok(values[i] > values[i - 1]);
    }
});
