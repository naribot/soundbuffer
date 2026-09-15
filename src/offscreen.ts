import type { CaptureResponse } from './capture';
import { GainStage } from './gain';
import { AudioAnalysis } from './analysis';
import { SpikeDetector } from './spike-detector';

let stream: MediaStream | undefined;
let output: AudioContext | undefined;
let source: MediaStreamAudioSourceNode | undefined;
let gain: GainStage | undefined;
let analysis: AudioAnalysis | undefined;
let capturedTabId: number | undefined;
let pending: Promise<unknown> = Promise.resolve();

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const task = pending.then(operation);
  pending = task.catch(() => undefined);
  return task;
}

function state(): CaptureResponse {
  return { enabled: stream?.active === true, tabId: capturedTabId, volume: gain?.value ?? 1, level: analysis?.level };
}

async function stop(reason: string): Promise<void> {
  const tabId = capturedTabId;
  const currentStream = stream;
  const currentSource = source;
  const currentGain = gain;
  const currentAnalysis = analysis;
  const context = output;
  stream = undefined;
  source = undefined;
  gain = undefined;
  analysis = undefined;
  output = undefined;
  capturedTabId = undefined;
  // Release every resource even if a different cleanup step fails.
  const errors: unknown[] = [];
  try { currentSource?.disconnect(); } catch (error) { errors.push(error); }
  try { currentGain?.disconnect(); } catch (error) { errors.push(error); }
  try { currentAnalysis?.disconnect(); } catch (error) { errors.push(error); }
  currentStream?.getTracks().forEach((track) => {
    track.onended = null;
    try { track.stop(); } catch (error) { errors.push(error); }
  });
  try {
    if (context && context.state !== 'closed') await context.close();
  } catch (error) { errors.push(error); }
  if (currentStream || currentSource || context) {
    console.info('[SoundBuffer] Capture stopped', { tabId, reason });
  }
  if (errors.length) throw new AggregateError(errors, 'Audio resource cleanup failed.');
}

async function start(streamId: string, tabId: number): Promise<CaptureResponse> {
  // A duplicate start must never create a second playback path.
  if (stream?.active) return state();
  await stop('Reset before capture');
  try {
    // Chromium's tab-capture constraints are not part of the standard DOM types.
    const audio = {
      mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId },
    } as MediaTrackConstraints;
    stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
    if (!stream.active || stream.getAudioTracks().length === 0) {
      throw new Error('The captured tab did not provide a live audio track.');
    }
    capturedTabId = tabId;
    const currentStream = stream;
    stream.getAudioTracks().forEach((track) => {
      track.onended = () => {
        void enqueue(async () => {
          if (stream === currentStream) await stop('Audio track ended (tab closed or capture revoked)');
        }).catch((error) => console.error('[SoundBuffer] Ended-stream cleanup failed', error));
      };
    });
    // The analysis worklet copies samples unchanged before manual gain.
    output = new AudioContext();
    source = output.createMediaStreamSource(stream);
    gain = new GainStage(output);
    const detector = new SpikeDetector();
    const currentGain = gain;
    let wasReducing = false;
    analysis = await AudioAnalysis.create(output, (level, durationMs) => {
      const reduction = detector.update(level.dbfs, durationMs);
      currentGain.setReduction(reduction);
      if ((reduction > 0) !== wasReducing) {
        console.info('[SoundBuffer]', reduction > 0 ? 'Loudness spike: reducing gain' : 'Level normal: restoring gain', { reductionDb: reduction });
        wasReducing = reduction > 0;
      }
    });
    source.connect(analysis.node);
    analysis.node.connect(gain.node);
    gain.node.connect(output.destination);
    await output.resume();
    if (output.state !== 'running' || !stream.active) {
      throw new Error('Audio playback could not start. Disable and try enabling again.');
    }
    console.info('[SoundBuffer] Audio routed to default output', { tabId, state: output.state });
    return state();
  } catch (error) {
    await stop('Capture failed').catch((cleanupError) => {
      console.error('[SoundBuffer] Failure cleanup failed', cleanupError);
    });
    throw error;
  }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message?.target !== 'offscreen') return;
  if (!['start', 'stop', 'status', 'volume', 'level'].includes(message.command)) return;
  const task = enqueue(async () => {
    if (message.command === 'volume') {
      if (!gain || !stream?.active) throw new Error('Enable capture before adjusting volume.');
      gain.setVolume(message.volume);
      return state();
    }
    return message.command === 'start'
    ? start(message.streamId, message.tabId)
    : message.command === 'stop'
      ? stop('Disabled by user').then(state)
      : state();
  });
  void task.then(respond, (error: unknown) => {
    console.error('[SoundBuffer] Audio capture failed', error);
    respond({ ...state(), error: error instanceof Error ? error.message : String(error) });
  });
  return true;
});
