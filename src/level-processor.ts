// AudioWorklet globals are not included in TypeScript's DOM library.
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

class LevelProcessor extends AudioWorkletProcessor {
  private sumSquares = 0;
  private samples = 0;
  private frames = 0;

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0] ?? [];
    const output = outputs[0] ?? [];
    // Copy samples unchanged. Measure channel energy separately to avoid
    // cancellation when stereo channels have opposite polarity.
    for (let channel = 0; channel < output.length; channel++) {
      const samples = input[channel];
      if (samples) output[channel].set(samples);
      else output[channel].fill(0);
    }
    for (const channel of input) {
      for (const sample of channel) this.sumSquares += sample * sample;
      this.samples += channel.length;
    }
    this.frames += output[0]?.length ?? 128;
    if (this.frames >= sampleRate * 0.05) {
      const rms = this.samples > 0 ? Math.sqrt(this.sumSquares / this.samples) : 0;
      this.port.postMessage({ rms, durationMs: this.frames / sampleRate * 1000 });
      this.sumSquares = 0;
      this.samples = 0;
      this.frames = 0;
    }
    return true;
  }
}

registerProcessor('soundbuffer-level', LevelProcessor);
