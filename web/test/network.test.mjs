import test from "node:test";
import assert from "node:assert/strict";
import {
  NETWORK_LOOP_SECONDS,
  JOURNEY_SECONDS,
  STATIONS,
  NETWORK_ROUTES,
  journeyTiming,
  MAP_SIZE,
} from "../src/network-data.js";
const near = (a, b, epsilon = 0.0002) =>
  assert.ok(Math.abs(a - b) < epsilon, `${a} ≠ ${b}`);
test("the transit score has a seamless 40-second period and covers all 16 country stations", () => {
  assert.ok(NETWORK_LOOP_SECONDS >= 30);
  assert.equal(NETWORK_LOOP_SECONDS, 40);
  assert.equal(NETWORK_LOOP_SECONDS % JOURNEY_SECONDS, 0);
  assert.equal(STATIONS.length, 16);
  assert.equal(NETWORK_ROUTES.length, 8);
  const used = new Set(
    NETWORK_ROUTES.flatMap((route) => route.stops.map((stop) => stop.code)),
  );
  assert.deepEqual([...used].sort(), STATIONS.map((s) => s.code).sort());
});
test("all bends join with a continuous tangent and stay inside the map", () => {
  for (const route of NETWORK_ROUTES) {
    for (let i = 0; i < route.segments.length; i++) {
      const [a, b, c, d] = route.segments[i];
      if (i) {
        const previous = route.segments[i - 1];
        for (const axis of [0, 1]) {
          near(a[axis], previous[3][axis]);
          near(b[axis] - a[axis], previous[3][axis] - previous[2][axis]);
        }
      }
      for (let step = 0; step <= 100; step++) {
        const t = step / 100,
          u = 1 - t;
        const p = [0, 1].map(
          (axis) =>
            u * u * u * a[axis] +
            3 * u * u * t * b[axis] +
            3 * u * t * t * c[axis] +
            t * t * t * d[axis],
        );
        assert.ok(
          p[0] > 0 &&
            p[0] < MAP_SIZE.width &&
            p[1] > 0 &&
            p[1] < MAP_SIZE.height,
          route.id + " leaves the map",
        );
      }
    }
  }
});
test("both directions pause at the actual flags and fade at the loop boundary", () => {
  for (const route of NETWORK_ROUTES)
    for (const reverse of [false, true]) {
      const timing = journeyTiming(route, reverse);
      assert.equal(timing.times.length, timing.progress.length);
      assert.equal(timing.times[0], 0);
      assert.equal(timing.times.at(-1), 1);
      assert.equal(timing.progress[0], reverse ? 1 : 0);
      assert.equal(timing.progress.at(-1), reverse ? 0 : 1);
      for (let i = 1; i < timing.times.length; i++)
        assert.ok(timing.times[i] > timing.times[i - 1]);
      for (const stop of route.stops)
        assert.ok(timing.progress.includes(stop.progress));
      let dwell = 0;
      for (let i = 1; i < timing.progress.length; i++)
        if (timing.progress[i] === timing.progress[i - 1]) dwell++;
      assert.equal(dwell, route.stops.length);
      for (let i = 1; i < timing.progress.length; i++)
        assert.ok(
          reverse
            ? timing.progress[i] <= timing.progress[i - 1]
            : timing.progress[i] >= timing.progress[i - 1],
        );
    }
});
