# SoundBuffer

Minimal Chrome Manifest V3 extension using TypeScript and Vite, without React.
Requires Chrome 116 or newer.

## Build and load

1. Install dependencies with `npm ci`.
2. Run `npm run build` (includes TypeScript checking).
3. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**,
   and select `dist`. If already loaded, reload the extension.
4. Pin SoundBuffer through Chrome's extensions menu.

For development, use `npm run watch` and reload the extension after changes.
Watch mode does not type-check; use `npm run check` separately.

## Capture

Open the popup on a normal web tab and click **Enable**. Only that tab's audio is
captured, with no video or recording. The audio path
is source -> analysis worklet -> GainNode -> default output, preserving playback because Chrome suppresses normal tab playback
while capturing. Closing the popup or switching tabs does not change the source.
Click **Disable** to stop. Closing the captured tab also ends its stream.

While capture is enabled, the **Volume** slider adjusts gain in real time from 0%
(mute) to 100% (unchanged level). Each new capture starts at 100%. Reopening the
popup during capture restores the current slider value. A 15 ms ramp smooths
manual changes to avoid clicks. Disabling capture releases the gain node along
with the source, stream, and AudioContext.

## Audio level measurement

The analysis worklet measures every audio block before manual gain and copies
samples unchanged to the output. It combines squared samples across channels
over approximately 50 ms, calculates RMS, and converts it using
`20 * log10(rms)`. Opposite-polarity stereo channels do not cancel in the meter.
Digital silence is shown as negative infinity dBFS; a full-scale sine is about
-3.0 dBFS RMS. This is an input RMS measurement, not perceived loudness or LUFS.

The popup reads the latest level twice per second while open. The offscreen
console logs input dBFS once every two seconds during capture. Moving the volume
slider does not change this pre-gain reading. Analysis stops and releases its
worklet and message port when capture stops.

## Automatic spike reduction

While capture is enabled, the detector compares each input level with a two-second
rolling, duration-weighted dBFS average. After 500 ms of non-silent warmup, a rise
of at least 8 dB above that average and 3 dB from the previous window triggers
attenuation. The reduction matches the excess above the baseline, capped at 18 dB.
The baseline freezes during attenuation. Recovery begins after the input stays
within 3 dB of the baseline for 300 ms, then gain returns over 1200 ms.
Attack takes 40 ms. Silence below -60 dBFS does not train the baseline; returning
from silence requires a fresh warmup. Each capture creates fresh detector state.

Tune `spikeSettings` in `src/spike-detector.ts` for thresholds, history, recovery,
and reduction limits. Tune `gainSettings` in `src/gain.ts` for attack/release, then
rebuild and reload the extension. Manual volume multiplies the automatic gain,
so automatic control never boosts above the slider setting or overrides mute.
Only trigger/recovery transitions are logged, alongside the existing level logs.

This is reactive RMS-based attenuation, not a lookahead limiter: the initial
transient can pass before the roughly 50 ms measurement and attack complete.
Gradual increases and the initial warmup are intentionally not treated as spikes.
Run `node tests/automatic-gain.mjs` to check deterministic detector and gain behavior
(requires Node 22.13+ for the test runner's TypeScript transformation).

Opening the popup or restarting Chrome never starts capture automatically. The
popup reads live capture state. Only one tab is captured at a time; stop it before
starting capture on another tab.

Permissions are limited to `tabCapture` and `offscreen`. The old saved preference
is no longer used, so no storage permission is needed. No host permissions,
content scripts, or broad `tabs` permission are required.

## Verify in Chrome

1. On `chrome://extensions`, inspect SoundBuffer's **service worker** to see
   `[SoundBuffer]` start, stop, status, and failure logs.
2. Play audio on a web tab. Opening the popup alone should not start capture.
3. Click **Enable**: expect a capture-start log for that tab and audible playback.
4. Close/reopen the popup: it should show **Disable**. Switch tabs and confirm the
   original tab remains the source.
5. Click **Disable**: expect a stop log and normal tab playback to continue.
6. Enable again, then close the captured tab: expect a stopped status.
7. Try an unsupported page (such as `chrome://extensions`): a rejected request
   should show an error in the popup and log the failure, allowing another attempt.

For stream-level logs, inspect `offscreen.html` under `chrome://inspect/#extensions`
while capture is active. Popup errors also appear in its own DevTools console
(right-click the popup and choose **Inspect**). Stream IDs are never logged.

## Files

- `public/manifest.json`: MV3 metadata, permissions, toolbar popup, and service worker.
- `index.html`, `src/popup.ts`, `src/popup.css`: popup UI and explicit capture requests.
- `src/background.ts`: serializes requests and obtains the selected tab's stream ID.
- `offscreen.html`, `src/offscreen.ts`: own the audio stream and playback graph.
- `src/gain.ts`: reusable gain stage with validated volume control and smooth updates.
- `src/analysis.ts`: reusable level snapshot, dBFS conversion, and throttled logging.
- `src/spike-detector.ts`: pure rolling-baseline spike detector and tunable settings.
- `src/level-processor.ts`: continuous RMS measurement in an AudioWorklet.
- `src/capture.ts`: shared request/response types.
- `tsconfig.json`, `vite.config.ts`: TypeScript and build configuration.
- `package.json`, `package-lock.json`: scripts and locked dependencies.
- `dist/`: generated extension, excluded from Git.

Implementation follows Chrome's [tab capture guidance](https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture)
and [tabCapture API](https://developer.chrome.com/docs/extensions/reference/api/tabCapture).
