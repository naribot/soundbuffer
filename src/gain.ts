export const gainSettings = { attackMs: 40, releaseMs: 1200 };

/** Combines manual volume and automatic attenuation into one smooth gain path. */
export class GainStage {
  readonly node: GainNode;
  private volume = 1;
  private reductionDb = 0;

  constructor(private readonly context: AudioContext) {
    this.node = context.createGain();
    this.node.gain.value = this.volume;
  }

  get value(): number {
    return this.volume;
  }

  setVolume(value: number): void {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error('Volume must be between 0 and 1.');
    }
    this.volume = value;
    this.ramp(15);
  }

  setReduction(reductionDb: number): void {
    if (!Number.isFinite(reductionDb) || reductionDb < 0) throw new Error('Invalid gain reduction.');
    if (reductionDb === this.reductionDb) return;
    const duration = reductionDb > this.reductionDb ? gainSettings.attackMs : gainSettings.releaseMs;
    this.reductionDb = reductionDb;
    this.ramp(duration);
  }

  private ramp(durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('Invalid attack/release duration.');
    const now = this.context.currentTime;
    this.node.gain.cancelAndHoldAtTime(now);
    this.node.gain.linearRampToValueAtTime(this.volume * 10 ** (-this.reductionDb / 20), now + durationMs / 1000);
  }

  disconnect(): void {
    this.node.disconnect();
  }
}
