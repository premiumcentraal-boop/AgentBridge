// SignalWire PCMU is G.711 mu-law at 8 kHz. Mix in linear PCM and send each
// participant a mix that excludes their own microphone.
export const frameSize = 160;
const linear = Int16Array.from({ length: 256 }, (_, byte) => {
  const value = ~byte & 255;
  const magnitude = (((value & 15) << 3) + 132) << ((value >> 4) & 7);
  return value & 128 ? 132 - magnitude : magnitude - 132;
});
function encode(sample) {
  const sign = sample < 0 ? 128 : 0;
  const value = Math.min(32635, Math.abs(sample)) + 132;
  const segment = Math.max(0, 31 - Math.clz32(value) - 7);
  return ~(sign | (segment << 4) | ((value >> (segment + 3)) & 15)) & 255;
}
export function enqueue(peer, bytes) {
  if (!bytes.length || bytes.length > 4000) return;
  const combined = Buffer.concat([peer.audio, bytes]);
  peer.audio = combined.subarray(Math.max(0, combined.length - 2400));
}
export function mix(peers, send, caption) {
  const total = new Int32Array(frameSize);
  const inputs = new Map();
  for (const p of peers) {
    const audio = p.audio.subarray(0, frameSize);
    p.audio = p.audio.subarray(audio.length);
    if (p.muted || !audio.length) continue;
    inputs.set(p, audio);
    for (let i = 0; i < audio.length; i++) total[i] += linear[audio[i]];
  }
  function output(skip) {
    const bytes = Buffer.allocUnsafe(frameSize);
    for (let i = 0; i < frameSize; i++)
      bytes[i] = encode(
        total[i] - (skip && i < skip.length ? linear[skip[i]] : 0),
      );
    return bytes;
  }
  const all = output();
  for (const p of peers) send(p, inputs.has(p) ? output(inputs.get(p)) : all);
  if (caption) caption(all);
}
