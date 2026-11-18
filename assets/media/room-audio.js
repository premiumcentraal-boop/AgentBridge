// The sound device runs at its native rate. The wire carries 20 ms PCMU frames.
class AgentBridgeAudio extends AudioWorkletProcessor {
  constructor() {
    super();
    this.play = new Float32Array(2400);
    this.read = 0;
    this.count = 0;
    this.position = 0;
    this.buffering = true;
    this.phase = 0;
    this.sum = 0;
    this.samples = 0;
    this.packet = new Uint8Array(160);
    this.fill = 0;
    this.capture = false;
    this.port.onmessage = ({ data }) => {
      if (typeof data === "boolean") {
        this.capture = data;
        this.fill = this.phase = this.sum = this.samples = 0;
        return;
      }
      if (!(data instanceof ArrayBuffer) || data.byteLength !== 160) return;
      if (this.count + 160 > this.play.length) {
        this.read = (this.read + 160) % this.play.length;
        this.count -= 160;
      }
      for (const byte of new Uint8Array(data)) {
        const v = ~byte & 255;
        const n = (((v & 15) << 3) + 132) << ((v >> 4) & 7);
        this.play[(this.read + this.count++) % this.play.length] =
          (v & 128 ? 132 - n : n - 132) / 32768;
      }
    };
  }
  process(inputs, outputs) {
    const input = inputs[0]?.[0],
      output = outputs[0]?.[0];
    if (!output) return true;
    if (this.count >= 320) this.buffering = false;
    for (let i = 0; i < output.length; i++) {
      if (!this.buffering && this.count >= 2) {
        const first = this.play[this.read],
          next = this.play[(this.read + 1) % this.play.length];
        output[i] = first + (next - first) * this.position;
        this.position += 8000 / sampleRate;
        if (this.position >= 1) {
          this.position -= 1;
          this.read = (this.read + 1) % this.play.length;
          this.count--;
        }
      } else {
        this.buffering = true;
        this.position = 0;
        output[i] = 0;
      }
      if (!this.capture || !input) continue;
      this.sum += input[i];
      this.samples++;
      this.phase += 8000;
      if (this.phase < sampleRate) continue;
      this.phase -= sampleRate;
      const sample = this.sum / this.samples;
      const magnitude =
        Math.min(32635, Math.round(Math.abs(sample) * 32768)) + 132;
      const exponent = Math.max(0, 31 - Math.clz32(magnitude) - 7);
      this.packet[this.fill++] =
        ~(
          (sample < 0 ? 128 : 0) |
          (exponent << 4) |
          ((magnitude >> (exponent + 3)) & 15)
        ) & 255;
      this.sum = this.samples = 0;
      if (this.fill === 160) {
        this.port.postMessage(this.packet.buffer, [this.packet.buffer]);
        this.packet = new Uint8Array(160);
        this.fill = 0;
      }
    }
    return true;
  }
}
registerProcessor("agentbridge-call", AgentBridgeAudio);
