import test from "node:test";
import assert from "node:assert/strict";
import {
  NETWORK_LOOP_SECONDS,
  MAP_SIZE,
  MEETING_POINT,
  COUNTRY_RADIUS,
  BAND_WIDTH,
  CONNECTION_PAIRS,
  PAINT_LAYERS,
  APPROACH_SECONDS,
  LINE_CLEAR_AT,
  CALL_REVEAL_AT,
  CALL_VISIBLE_AT,
  CALL_FADE_AT,
  EVENT_SECONDS,
  SCENE_PHASE_SECONDS,
  approachAnimation,
  lineAnimation,
  flagAnimation,
  callAnimation,
  layerAnimation,
  pairStateAt,
  networkStateAt,
  pointOnLeg,
  sampleAnimation,
} from "../src/network-data.js";
const near = (a, b, epsilon = 0.00001) =>
  assert.ok(Math.abs(a - b) < epsilon, `${a} ≠ ${b}`);
const samePoint = (a, b) => {
  near(a[0], b[0]);
  near(a[1], b[1]);
};
const outside = (point) =>
  point[0] < -COUNTRY_RADIUS ||
  point[0] > MAP_SIZE.width + COUNTRY_RADIUS ||
  point[1] < -COUNTRY_RADIUS ||
  point[1] > MAP_SIZE.height + COUNTRY_RADIUS;
const before = (animation, key = "values") => animation[key].split(";").length;
function validTimeline(animation, key = "values") {
  const times = animation.keyTimes.split(";").map(Number);
  assert.equal(times.length, before(animation, key));
  assert.equal(times[0], 0);
  assert.equal(times.at(-1), 1);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] > times[i - 1]);
  if (animation.keySplines)
    assert.equal(animation.keySplines.split(";").length + 1, times.length);
}
test("twelve country pairs enter from opposite edges and meet at the same middle point", () => {
  assert.equal(NETWORK_LOOP_SECONDS, 60);
  assert.equal(CONNECTION_PAIRS.length, 12);
  assert.equal(new Set(CONNECTION_PAIRS.flatMap((p) => p.countries)).size, 16);
  assert.ok(BAND_WIDTH >= 100);
  assert.ok(
    CONNECTION_PAIRS.some((p) => p.axis === "x") &&
      CONNECTION_PAIRS.some((p) => p.axis === "y"),
  );
  for (const pair of CONNECTION_PAIRS) {
    const [a, b] = pair.arms;
    assert.ok(outside(a.start) && outside(b.start));
    samePoint(b.start, [
      MAP_SIZE.width - a.start[0],
      MAP_SIZE.height - a.start[1],
    ]);
    near(a.length, b.length);
    for (const arm of pair.arms) {
      samePoint(arm.end, MEETING_POINT);
      assert.ok(arm.turns === 0 || arm.turns === 1);
      assert.equal((arm.path.match(/A/g) || []).length, arm.turns);
    }
    for (const progress of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      const first = pointOnLeg(a, progress),
        second = pointOnLeg(b, progress);
      samePoint(second, [
        MAP_SIZE.width - first[0],
        MAP_SIZE.height - first[1],
      ]);
    }
    const arrival = pairStateAt(pair, APPROACH_SECONDS);
    samePoint(arrival.points[0], arrival.points[1]);
    samePoint(arrival.points[0], MEETING_POINT);
  }
});
test("country lines disappear before a green connected call appears and the call then fades", () => {
  assert.ok(CALL_REVEAL_AT > LINE_CLEAR_AT);
  for (const pair of CONNECTION_PAIRS) {
    assert.ok(
      pair.flagFadeAt < pair.flagClearAt && pair.flagClearAt < APPROACH_SECONDS,
    );
    for (let age = 0; age < 60; age += 0.025) {
      const state = pairStateAt(pair, age);
      if (age < APPROACH_SECONDS) assert.equal(state.lineOpacity, 1);
      if (age >= LINE_CLEAR_AT) near(state.lineOpacity, 0);
      if (state.callOpacity > 0) {
        near(state.lineOpacity, 0);
        near(state.flagOpacity, 0);
        samePoint(state.points[0], MEETING_POINT);
        samePoint(state.points[1], MEETING_POINT);
      }
      if (state.flagOpacity > 0.000001)
        assert.ok(
          Math.hypot(
            state.points[0][0] - state.points[1][0],
            state.points[0][1] - state.points[1][1],
          ) >=
            COUNTRY_RADIUS * 2,
          "the two country discs fade before they overlap",
        );
      if (age >= EVENT_SECONDS) near(state.callOpacity, 0);
    }
    near(pairStateAt(pair, CALL_VISIBLE_AT).callOpacity, 1);
    near(pairStateAt(pair, CALL_FADE_AT).callOpacity, 1);
    near(pairStateAt(pair, EVENT_SECONDS).callOpacity, 0);
  }
});
test("line heads and country flags share matching native motion, drawing and fade timing", () => {
  const motion = approachAnimation();
  validTimeline(motion, "keyPoints");
  validTimeline(motion, "widths");
  validTimeline(lineAnimation());
  validTimeline(callAnimation());
  validTimeline(callAnimation(), "scales");
  const drawing = {
    ...motion,
    values: motion.widths
      .split(";")
      .map((v) => v.split(" ")[0])
      .join(";"),
  };
  for (const pair of CONNECTION_PAIRS) {
    validTimeline(flagAnimation(pair));
    for (let age = 0.05; age < 60; age += 0.2) {
      const state = pairStateAt(pair, age);
      const head = sampleAnimation(motion, age, "keyPoints");
      near(head, sampleAnimation(drawing, age) / 1000);
      for (let side = 0; side < 2; side++)
        samePoint(state.points[side], pointOnLeg(pair.arms[side], head));
    }
  }
});
test("newest connections paint above older ones, including every launch and the minute seam", () => {
  assert.equal(PAINT_LAYERS.filter((layer) => !layer.previous).length, 12);
  assert.ok(PAINT_LAYERS.some((layer) => layer.previous));
  for (const layer of PAINT_LAYERS) validTimeline(layerAnimation(layer));
  const samples = [];
  for (let seconds = 0; seconds < 120; seconds += 0.05) samples.push(seconds);
  for (const pair of CONNECTION_PAIRS)
    for (const shift of [-0.0001, 0, 0.0001])
      samples.push(pair.startAt - SCENE_PHASE_SECONDS + shift);
  for (const seconds of samples) {
    const painted = networkStateAt(seconds);
    assert.ok(painted.length >= 1);
    assert.equal(
      new Set(painted.map((s) => s.pair.id)).size,
      painted.length,
      "a previous-cycle copy and current copy must never both paint",
    );
    for (let i = 1; i < painted.length; i++)
      assert.ok(
        painted[i].launchedAt > painted[i - 1].launchedAt,
        "the newest line must be the final painted layer at " + seconds,
      );
    const repeat = networkStateAt(seconds + 60);
    assert.deepEqual(
      painted.map((s) => s.layer.id),
      repeat.map((s) => s.layer.id),
    );
    for (let i = 0; i < painted.length; i++) {
      near(painted[i].lineOpacity, repeat[i].lineOpacity);
      near(painted[i].callOpacity, repeat[i].callOpacity);
      for (let side = 0; side < 2; side++)
        samePoint(painted[i].points[side], repeat[i].points[side]);
    }
  }
});
