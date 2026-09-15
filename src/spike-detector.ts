export interface SpikeSettings {
  thresholdDb: number;
  riseDb: number;
  historyMs: number;
  warmupMs: number;
  recoveryDb: number;
  recoveryMs: number;
  silenceDb: number;
  maxReductionDb: number;
}

export const spikeSettings: Readonly<SpikeSettings> = {
  thresholdDb: 8,
  riseDb: 3,
  historyMs: 2000,
  warmupMs: 500,
  recoveryDb: 3,
  recoveryMs: 300,
  silenceDb: -60,
  maxReductionDb: 18,
};

/** Pure detector: accepts measured windows; returns attenuation, never audio nodes. */
export class SpikeDetector {
  private history: { db: number; ms: number }[] = [];
  private previous: number | undefined;
  private baseline = 0;
  private reduction = 0;
  private recovery = 0;

  constructor(private readonly settings: Readonly<SpikeSettings> = spikeSettings) {
    const s = settings;
    if (Object.values(s).some(value => !Number.isFinite(value)) ||
        s.thresholdDb <= 0 || s.riseDb <= 0 || s.recoveryDb < 0 ||
        s.recoveryDb >= s.thresholdDb || s.historyMs < s.warmupMs ||
        s.warmupMs <= 0 || s.recoveryMs <= 0 || s.maxReductionDb <= 0) {
      throw new Error('Invalid spike detector settings.');
    }
  }

  update(dbfs: number | null, durationMs: number): number {
    if (!Number.isFinite(durationMs) || durationMs <= 0 ||
        (dbfs !== null && !Number.isFinite(dbfs))) throw new Error('Invalid level window.');
    const s = this.settings;
    const silent = dbfs === null || dbfs < s.silenceDb;
    const db = silent ? s.silenceDb : dbfs!;
    if (this.reduction > 0) {
      // Freeze the baseline during a spike so a long loud segment cannot train
      // the detector into restoring volume while it is still loud.
      this.recovery = db <= this.baseline + s.recoveryDb ? this.recovery + durationMs : 0;
      if (this.recovery >= s.recoveryMs) {
        this.reduction = 0;
        this.recovery = 0;
      } else if (!silent) {
        this.reduction = Math.max(this.reduction, Math.min(s.maxReductionDb, db - this.baseline));
      }
    } else if (!silent) {
      const elapsed = this.history.reduce((sum, entry) => sum + entry.ms, 0);
      const average = elapsed ? this.history.reduce((sum, entry) => sum + entry.db * entry.ms, 0) / elapsed : db;
      if (elapsed >= s.warmupMs && this.previous !== undefined &&
          db - average >= s.thresholdDb && db - this.previous >= s.riseDb) {
        this.baseline = average;
        this.reduction = Math.min(s.maxReductionDb, db - average);
      }
    }
    if (!this.reduction) {
      if (silent) this.history = [];
      else {
        this.history.push({ db, ms: durationMs });
        let excess = this.history.reduce((sum, entry) => sum + entry.ms, 0) - s.historyMs;
        while (excess > 0 && this.history.length) {
          const first = this.history[0];
          const removed = Math.min(first.ms, excess);
          first.ms -= removed;
          excess -= removed;
          if (first.ms === 0) this.history.shift();
        }
      }
    }
    this.previous = silent ? undefined : db;
    return this.reduction;
  }
}
