import processorUrl from './level-processor.ts?worker&url';

export interface AudioLevel {
  rms: number;
  // JSON-safe representation: null means digital silence (-Infinity dBFS).
  dbfs: number | null;
}

export function rmsToDbfs(rms: number): number | null {
  return rms > 0 ? 20 * Math.log10(rms) : null;
}

/** Continuous, 50 ms RMS windows across all input channels, before gain. */
export class AudioAnalysis {
  private latest: AudioLevel | undefined;
  private lastLog = performance.now();

  private constructor(readonly node: AudioWorkletNode, onLevel?: (level: AudioLevel, durationMs: number) => void) {
    node.port.onmessage = ({ data }: MessageEvent<{ rms: number; durationMs: number }>) => {
      this.latest = { rms: data.rms, dbfs: rmsToDbfs(data.rms) };
      onLevel?.(this.latest, data.durationMs);
      if (performance.now() - this.lastLog >= 2000) {
        console.info('[SoundBuffer] Input RMS level', this.latest.dbfs === null
          ? '-Infinity dBFS (silence)' : `${this.latest.dbfs.toFixed(1)} dBFS`);
        this.lastLog = performance.now();
      }
    };
    node.onprocessorerror = () => {
      this.latest = undefined;
      console.error('[SoundBuffer] Audio analysis processor failed; disable and enable capture to retry.');
    };
  }

  static async create(context: AudioContext, onLevel?: (level: AudioLevel, durationMs: number) => void): Promise<AudioAnalysis> {
    await context.audioWorklet.addModule(processorUrl);
    return new AudioAnalysis(new AudioWorkletNode(context, 'soundbuffer-level'), onLevel);
  }

  get level(): AudioLevel | undefined {
    return this.latest;
  }

  disconnect(): void {
    this.node.port.onmessage = null;
    this.node.onprocessorerror = null;
    this.node.port.close();
    this.node.disconnect();
    this.latest = undefined;
  }
}
