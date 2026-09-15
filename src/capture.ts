import type { AudioLevel } from './analysis';

export type CaptureCommand = 'status' | 'start' | 'stop' | 'volume' | 'level';

export interface CaptureResponse {
  enabled: boolean;
  volume?: number;
  level?: AudioLevel;
  tabId?: number;
  error?: string;
}
