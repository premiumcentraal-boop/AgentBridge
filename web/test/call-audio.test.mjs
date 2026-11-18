import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const code = await readFile(
  new URL("../../assets/media/room-audio.js", import.meta.url),
  "utf8",
);
for (const rate of [44100, 48000]) {
  test(
    "phone audio at " +
      rate +
      " Hz plays while mic is off and transmits only opted-in 20 ms frames",
    () => {
      const frames = [];
      let Processor;
      class Worklet {
        constructor() {
          this.port = {
            postMessage: (buffer) => frames.push(new Uint8Array(buffer)),
          };
        }
      }
      vm.runInNewContext(code, {
        sampleRate: rate,
        AudioWorkletProcessor: Worklet,
        ArrayBuffer,
        Uint8Array,
        Float32Array,
        registerProcessor(label, ctor) {
          assert.equal(label, "agentbridge-call");
          Processor = ctor;
        },
      });
      const p = new Processor(),
        input = new Float32Array(128).fill(0.25),
        out = new Float32Array(128);
      for (let i = 0; i < 4; i++)
        p.port.onmessage({ data: new Uint8Array(160).fill(0x94).buffer });
      for (let i = 0; i < 8; i++) p.process([[input]], [[out]]);
      assert.ok(out.every((s) => s > 0));
      assert.equal(frames.length, 0);
      p.port.onmessage({ data: true });
      for (let i = 0; i < Math.ceil(rate / 128); i++)
        p.process([[input]], [[out]]);
      assert.equal(frames.length, 50);
      assert.ok(
        frames.every(
          (frame) => frame.length === 160 && frame.every((v) => v !== 255),
        ),
      );
      p.port.onmessage({ data: false });
      for (let i = 0; i < 32; i++) p.process([[input]], [[out]]);
      assert.equal(frames.length, 50);
    },
  );
}
