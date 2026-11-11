import test from "node:test";
import assert from "node:assert/strict";
import {
  NETWORK_LOOP_SECONDS,
  MAP_SIZE,
  COUNTRY_RADIUS,
  BAND_WIDTH,
  STATIONS,
  CONNECTION_STREAMS,
  CONNECTION_LEGS,
  bandAnimation,
  countryAnimation,
} from "../src/network-data.js";
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.0001, `${a} ≠ ${b}`);
test("forty-second colour streams visit all sixteen countries in connected sequences", () => {
  assert.ok(NETWORK_LOOP_SECONDS >= 30);
  assert.equal(NETWORK_LOOP_SECONDS, 40);
  assert.equal(CONNECTION_STREAMS.length, 4);
  assert.equal(new Set(CONNECTION_STREAMS.map((s) => s.colour)).size, 4);
  assert.equal(CONNECTION_LEGS.length, 16);
  assert.ok(BAND_WIDTH >= 100);
  assert.deepEqual(
    CONNECTION_LEGS.map((leg) => leg.country.code).sort(),
    STATIONS.map((s) => s.code).sort(),
  );
  const directions = new Set();
  for (const stream of CONNECTION_STREAMS) {
    assert.ok(stream.phase > 0 && stream.phase < NETWORK_LOOP_SECONDS);
    for (let index = 0; index < stream.legs.length; index++) {
      const leg = stream.legs[index];
      if (index)
        assert.deepEqual(
          leg.start,
          stream.legs[index - 1].end,
          "a continuation must begin in the preceding country circle",
        );
      for (const axis of [0, 1]) {
        const delta = leg.end[axis] - leg.start[axis];
        if (delta) directions.add(axis + ":" + Math.sign(delta));
      }
      assert.ok(
        leg.end[0] > COUNTRY_RADIUS &&
          leg.end[0] < MAP_SIZE.width - COUNTRY_RADIUS,
      );
      assert.ok(
        leg.end[1] > COUNTRY_RADIUS &&
          leg.end[1] < MAP_SIZE.height - COUNTRY_RADIUS,
      );
    }
  }
  assert.equal(
    directions.size,
    4,
    "the composition travels left, right, up and down",
  );
});
test("each connection is straight or has one tangent quarter-circle turn", () => {
  for (const leg of CONNECTION_LEGS) {
    assert.ok(leg.turns === 0 || leg.turns === 1);
    assert.equal((leg.path.match(/A/g) || []).length, leg.turns);
    assert.doesNotMatch(leg.path, /[CSQT]/);
    if (!leg.turns) {
      assert.ok(leg.start[0] === leg.end[0] || leg.start[1] === leg.end[1]);
      continue;
    }
    const { incoming, outgoing, radius, corner, arcStart, arcEnd } = leg;
    near(incoming[0] * outgoing[0] + incoming[1] * outgoing[1], 0);
    for (const axis of [0, 1]) {
      near(corner[axis] - arcStart[axis], incoming[axis] * radius);
      near(arcEnd[axis] - corner[axis], outgoing[axis] * radius);
    }
    assert.ok(radius > 0);
  }
});
test("flags reveal on arrival and remain through the next departure before both ends of the loop clear", () => {
  for (const stream of CONNECTION_STREAMS)
    for (let index = 0; index < stream.legs.length; index++) {
      const leg = stream.legs[index],
        next = stream.legs[index + 1];
      near(leg.revealAt, leg.arriveAt);
      assert.ok(
        leg.arriveAt < leg.revealedAt &&
          leg.revealedAt < leg.holdUntil &&
          leg.holdUntil < leg.hideAt &&
          leg.hideAt < NETWORK_LOOP_SECONDS,
      );
      assert.ok(
        leg.arriveAt < leg.wipeAt &&
          leg.wipeAt < leg.clearAt &&
          leg.clearAt < NETWORK_LOOP_SECONDS,
      );
      if (next) {
        assert.ok(next.startAt > leg.arriveAt);
        assert.ok(next.startAt < leg.wipeAt);
        assert.ok(next.startAt < leg.holdUntil);
      }
      const band = bandAnimation(leg),
        country = countryAnimation(leg);
      for (const timing of [
        band.keyTimes,
        band.visibilityTimes,
        country.keyTimes,
      ]) {
        const values = timing.split(";").map(Number);
        assert.equal(values[0], 0);
        assert.equal(values.at(-1), 1);
        for (let i = 1; i < values.length; i++)
          assert.ok(values[i] > values[i - 1], leg.id + " has invalid timing");
      }
      assert.equal(band.widths.split(";")[0], "0 2000");
      assert.equal(band.widths.split(";").at(-1), "0 2000");
      assert.equal(country.opacity.split(";")[0], "0");
      assert.equal(country.opacity.split(";").at(-1), "0");
    }
});
