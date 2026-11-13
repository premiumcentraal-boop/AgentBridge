import test from "node:test";
import assert from "node:assert/strict";
import {
  NETWORK_LOOP_SECONDS,
  MAP_SIZE,
  COUNTRY_RADIUS,
  BAND_WIDTH,
  CONNECTION_PAIRS,
  PAINT_LAYERS,
  APPROACH_SECONDS,
  ACCELERATE_AT,
  SCENE_INTERVAL_SECONDS,
  approachProgress,
  LINE_CLEAR_AT,
  CALL_REVEAL_AT,
  CALL_VISIBLE_AT,
  CALL_SETTLE_AT,
  CALL_FADE_AT,
  EVENT_SECONDS,
  SCENE_PHASE_SECONDS,
  STILL_CONNECTIONS,
  approachAnimation,
  lineAnimation,
  flagAnimation,
  callAnimation,
  contactAnimation,
  checkAnimation,
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
test("overlapping two- and three-country journeys join at dispersed points from opposite edges", () => {
  assert.equal(NETWORK_LOOP_SECONDS, 60);
  assert.equal(CONNECTION_PAIRS.length, 12);
  assert.equal(new Set(CONNECTION_PAIRS.flatMap((p) => p.countries)).size, 16);
  assert.ok(BAND_WIDTH >= 70 && BAND_WIDTH <= 80);
  assert.equal(
    CONNECTION_PAIRS.filter((pair) => pair.arms.length === 3).length,
    2,
  );
  assert.equal(
    new Set(CONNECTION_PAIRS.map((pair) => pair.meeting.join())).size,
    4,
  );
  assert.deepEqual(
    [...new Set(CONNECTION_PAIRS.map((pair) => pair.meeting[0]))].sort(),
    [300, 700],
  );
  assert.deepEqual(
    [...new Set(CONNECTION_PAIRS.map((pair) => pair.meeting[1]))].sort(),
    [220, 500],
  );
  assert.ok(Math.max(...CONNECTION_PAIRS.map((pair) => pair.meeting[1])) > 480);
  assert.ok(
    CONNECTION_PAIRS.some((p) => p.axis === "x") &&
      CONNECTION_PAIRS.some((p) => p.axis === "y"),
  );
  for (const pair of CONNECTION_PAIRS) {
    const [a, b] = pair.arms;
    assert.ok(outside(a.start) && outside(b.start));
    if (pair.axis === "x")
      assert.ok(
        Math.min(a.start[0], b.start[0]) < 0 &&
          Math.max(a.start[0], b.start[0]) > MAP_SIZE.width,
      );
    else
      assert.ok(
        Math.min(a.start[1], b.start[1]) < 0 &&
          Math.max(a.start[1], b.start[1]) > MAP_SIZE.height,
      );
    assert.equal(pair.countries.length, pair.arms.length);
    assert.equal(
      new Set(pair.arms.map((arm) => arm.colour)).size,
      pair.arms.length,
    );
    for (const arm of pair.arms) {
      samePoint(arm.end, pair.meeting);
      assert.ok(outside(arm.start));
      assert.ok(arm.turns === 0 || arm.turns === 1);
      assert.equal((arm.path.match(/A/g) || []).length, arm.turns);
      if (arm.turns) near(arm.radius, 96);
    }
    const arrival = pairStateAt(pair, APPROACH_SECONDS);
    for (const point of arrival.points) samePoint(point, pair.meeting);
  }
});
test("each journey triggers its own call only after every country arrives, with no colliding flag discs", () => {
  assert.equal(CALL_REVEAL_AT, APPROACH_SECONDS);
  assert.ok(APPROACH_SECONDS < SCENE_INTERVAL_SECONDS);
  for (const pair of CONNECTION_PAIRS) {
    assert.ok(
      pair.flagFadeAt < pair.flagClearAt && pair.flagClearAt < APPROACH_SECONDS,
    );
    for (let age = 0; age < 60; age += 0.025) {
      const state = pairStateAt(pair, age);
      if (age < APPROACH_SECONDS) assert.equal(state.lineOpacity, 1);
      if (age >= LINE_CLEAR_AT) near(state.lineOpacity, 0);
      if (age < APPROACH_SECONDS) {
        near(state.callOpacity, 0);
        near(state.contactOpacity, 0);
      }
      if (state.callOpacity > 0) {
        near(state.flagOpacity, 0);
        for (const point of state.points) samePoint(point, pair.meeting);
      }
      if (state.flagOpacity > 0.000001)
        for (let i = 0; i < state.points.length; i++)
          for (let j = i + 1; j < state.points.length; j++)
            assert.ok(
              Math.hypot(
                state.points[i][0] - state.points[j][0],
                state.points[i][1] - state.points[j][1],
              ) >=
                COUNTRY_RADIUS * 2,
              "all country discs fade before they overlap: " + pair.id,
            );
      if (age >= EVENT_SECONDS) near(state.callOpacity, 0);
    }
    const impact = pairStateAt(pair, APPROACH_SECONDS + 0.1);
    assert.ok(impact.contactOpacity > 0);
    assert.ok(impact.callOpacity > 0);
    near(pairStateAt(pair, CALL_VISIBLE_AT).checkOffset, 1);
    near(pairStateAt(pair, CALL_SETTLE_AT + 0.06).checkOffset, 0);
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
  validTimeline(contactAnimation());
  validTimeline(contactAnimation(), "scales");
  validTimeline(checkAnimation());
  const drawing = {
    ...motion,
    values: motion.widths
      .split(";")
      .map((v) => v.split(" ")[0])
      .join(";"),
  };
  for (const pair of CONNECTION_PAIRS) {
    validTimeline(flagAnimation(pair));
    const armDrawings = pair.arms.map((arm) => {
      const timeline = approachAnimation(arm.length);
      validTimeline(timeline, "widths");
      return {
        ...timeline,
        values: timeline.widths
          .split(";")
          .map((value) => value.split(" ")[0])
          .join(";"),
      };
    });
    for (let age = 0.05; age < 60; age += 0.2) {
      const state = pairStateAt(pair, age);
      const head = sampleAnimation(motion, age, "keyPoints");
      near(head, sampleAnimation(drawing, age) / 1000);
      for (let side = 0; side < pair.arms.length; side++) {
        samePoint(state.points[side], pointOnLeg(pair.arms[side], head));
        near(
          sampleAnimation(armDrawings[side], age) / pair.arms[side].length,
          head,
        );
      }
    }
  }
});
test("the final approach accelerates smoothly into contact without an intermediate stop", () => {
  const dt = 0.0001;
  const velocity = (t) =>
    (approachProgress(t + dt) - approachProgress(t - dt)) / (2 * dt);
  near(approachProgress(0), 0);
  near(approachProgress(APPROACH_SECONDS), 1);
  near(velocity(ACCELERATE_AT - 0.001), velocity(ACCELERATE_AT + 0.001), 0.002);
  let previous = velocity(ACCELERATE_AT + 0.01);
  for (let t = ACCELERATE_AT + 0.05; t < APPROACH_SECONDS - 0.01; t += 0.05) {
    const speed = velocity(t);
    assert.ok(speed > previous, "the joining movement must accelerate at " + t);
    previous = speed;
  }
  assert.ok(
    velocity(APPROACH_SECONDS - 0.01) > velocity(ACCELERATE_AT + 0.01) * 4,
  );
});
test("at most two journeys approach together and newest routes stay on top through the minute seam", () => {
  assert.equal(PAINT_LAYERS.filter((layer) => !layer.previous).length, 12);
  assert.equal(PAINT_LAYERS.filter((layer) => layer.previous).length, 2);
  for (const layer of PAINT_LAYERS) validTimeline(layerAnimation(layer));
  const samples = [];
  for (let seconds = 0; seconds < 120; seconds += 0.125) samples.push(seconds);
  for (const pair of CONNECTION_PAIRS)
    for (const shift of [-0.0001, 0, 0.0001])
      samples.push(pair.startAt - SCENE_PHASE_SECONDS + shift);
  assert.ok(
    STILL_CONNECTIONS.filter((state) => state.progress < 1).length >= 2,
  );
  for (const seconds of samples) {
    const painted = networkStateAt(seconds);
    assert.ok(painted.length >= 1 && painted.length <= 3);
    const approaching = painted.filter((state) => state.progress < 1);
    assert.ok(approaching.length >= 1 && approaching.length <= 2);
    assert.ok(approaching.flatMap((state) => state.pair.arms).length <= 5);
    assert.equal(
      new Set(painted.map((state) => state.pair.id)).size,
      painted.length,
    );
    for (const state of painted) {
      if (state.progress < 1) {
        assert.equal(
          state.callOpacity,
          0,
          "a journey must meet at its own node before showing a call",
        );
        assert.equal(state.contactOpacity, 0);
      }
    }
    for (let i = 1; i < painted.length; i++)
      assert.ok(painted[i].launchedAt > painted[i - 1].launchedAt);
    const repeat = networkStateAt(seconds + 60);
    assert.deepEqual(
      painted.map((state) => state.layer.id),
      repeat.map((state) => state.layer.id),
    );
    for (let i = 0; i < painted.length; i++) {
      near(painted[i].lineOpacity, repeat[i].lineOpacity);
      near(painted[i].callOpacity, repeat[i].callOpacity);
      near(painted[i].contactOpacity, repeat[i].contactOpacity);
      for (let side = 0; side < painted[i].points.length; side++)
        samePoint(painted[i].points[side], repeat[i].points[side]);
    }
  }
  // At the wrap, carry-over copies replace current copies without a visual
  // jump. The newest arriving route remains above those older connections.
  const seam = NETWORK_LOOP_SECONDS - SCENE_PHASE_SECONDS;
  const left = networkStateAt(seam - 0.000001);
  const right = networkStateAt(seam + 0.000001);
  for (const state of left) {
    const match = right.find((other) => other.pair.id === state.pair.id);
    if (!match) continue;
    near(state.lineOpacity, match.lineOpacity, 0.0001);
    near(state.callOpacity, match.callOpacity, 0.0001);
    state.points.forEach((point, index) => {
      near(point[0], match.points[index][0], 0.01);
      near(point[1], match.points[index][1], 0.01);
    });
  }
});

test("occasional crossings leave breathing room between flags and keep call confirmations clear", () => {
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const inside = ([x, y]) =>
    x > 0 && x < MAP_SIZE.width && y > 0 && y < MAP_SIZE.height;
  function intersect(a, b, c, d) {
    const r = sub(b, a),
      s = sub(d, c),
      den = cross(r, s);
    if (Math.abs(den) < 0.001) return false;
    const t = cross(sub(c, a), s) / den,
      u = cross(sub(c, a), r) / den;
    return (
      t > 0 &&
      t < 1 &&
      u > 0 &&
      u < 1 &&
      inside([a[0] + t * r[0], a[1] + t * r[1]])
    );
  }
  let crossingMoments = 0;
  const crossingPairs = new Set();
  for (let time = 0; time < NETWORK_LOOP_SECONDS; time += 0.5) {
    const states = networkStateAt(time);
    const routes = states.filter((state) => state.lineOpacity > 0.1);
    const flags = states
      .filter((state) => state.flagOpacity > 0.1)
      .flatMap((state) =>
        state.points
          .filter(
            ([x, y]) =>
              x > COUNTRY_RADIUS &&
              x < MAP_SIZE.width - COUNTRY_RADIUS &&
              y > COUNTRY_RADIUS &&
              y < MAP_SIZE.height - COUNTRY_RADIUS,
          )
          .map((point) => ({ point, pair: state.pair.id })),
      );
    for (let i = 0; i < flags.length; i++)
      for (let j = i + 1; j < flags.length; j++)
        if (flags[i].pair !== flags[j].pair)
          assert.ok(
            Math.hypot(...sub(flags[i].point, flags[j].point)) >=
              COUNTRY_RADIUS * 2 + 30,
            "different journeys need room between their country flags",
          );
    for (const call of states.filter((state) => state.callOpacity > 0.1))
      for (const newer of routes.filter(
        (state) => state.launchedAt > call.launchedAt,
      ))
        for (const arm of newer.pair.arms)
          for (let n = 0; n <= 50; n++)
            assert.ok(
              Math.hypot(
                ...sub(
                  pointOnLeg(arm, (newer.progress * n) / 50),
                  call.pair.meeting,
                ),
              ) > 130,
              "new routes must leave a clear area around an existing call confirmation",
            );
    let crosses = false;
    for (let i = 0; i < routes.length; i++)
      for (let j = i + 1; j < routes.length; j++) {
        for (const a of routes[i].pair.arms)
          for (const b of routes[j].pair.arms) {
            const aa = Array.from({ length: 25 }, (_, n) =>
              pointOnLeg(a, (routes[i].progress * n) / 24),
            );
            const bb = Array.from({ length: 25 }, (_, n) =>
              pointOnLeg(b, (routes[j].progress * n) / 24),
            );
            for (let m = 1; m < aa.length && !crosses; m++)
              for (let n = 1; n < bb.length && !crosses; n++)
                crosses ||= intersect(aa[m - 1], aa[m], bb[n - 1], bb[n]);
          }
      }
    if (crosses) {
      crossingMoments++;
      routes.forEach((state) => crossingPairs.add(state.pair.id));
    }
  }
  assert.ok(
    crossingMoments > 0 && crossingMoments < 60,
    "crossings should be occasional, with clear intervals between them; found " +
      crossingMoments,
  );
  assert.ok(
    crossingPairs.size >= 4,
    "crossings need variation across more than one composition",
  );
});
