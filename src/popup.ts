import './popup.css';
import type { CaptureCommand, CaptureResponse } from './capture';

const button = document.querySelector<HTMLButtonElement>('#toggle')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const slider = document.querySelector<HTMLInputElement>('#volume')!;
const volumeValue = document.querySelector<HTMLOutputElement>('#volume-value')!;
const levelValue = document.querySelector<HTMLSpanElement>('#level')!;
let enabled = false;

async function request(command: CaptureCommand, tabId?: number): Promise<void> {
  const result: CaptureResponse = await chrome.runtime.sendMessage({
    target: 'background', command, tabId,
  });
  if (result.error) throw new Error(result.error);
  enabled = result.enabled;
  slider.value = String(Math.round((result.volume ?? 1) * 100));
  volumeValue.value = `${slider.value}%`;
  slider.disabled = !enabled;
  render();
}

function render(): void {
  button.textContent = enabled ? 'Disable' : 'Enable';
  status.textContent = enabled ? 'Enabled' : 'Disabled';
  if (!enabled) levelValue.textContent = '—';
}

async function initialize(): Promise<void> {
  try {
    await request('status');
    button.disabled = false;
  } catch (error) {
    status.textContent = 'Unable to read capture status. Reopen the popup to retry.';
    console.error('[SoundBuffer] Failed to read capture status', error);
  }
}

button.addEventListener('click', async () => {
  button.disabled = true;
  slider.disabled = true;
  try {
    if (enabled) {
      await request('stop');
    } else {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id === undefined) throw new Error('No active tab is available.');
      console.info('[SoundBuffer] User requested capture', { tabId: tab.id });
      await request('start', tab.id);
    }
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Capture request failed. Try again.';
    console.error('[SoundBuffer] Capture request failed', error);
  } finally {
    button.disabled = false;
    slider.disabled = !enabled;
  }
});

slider.addEventListener('input', () => {
  volumeValue.value = `${slider.value}%`;
  const volume = Number(slider.value) / 100;
  void chrome.runtime.sendMessage({ target: 'background', command: 'volume', volume })
    .then((result: CaptureResponse) => {
      if (result.error) throw new Error(result.error);
    })
    .catch((error: unknown) => {
      status.textContent = error instanceof Error ? error.message : 'Unable to change volume.';
      console.error('[SoundBuffer] Volume update failed', error);
    });
});

void initialize();

chrome.tabCapture.onStatusChanged.addListener(() => {
  if (!button.disabled) void initialize();
});

// Poll only while the popup is open; avoid overlapping requests or slider updates.
let readingLevel = false;
const levelTimer = window.setInterval(async () => {
  if (!enabled || button.disabled || readingLevel) return;
  readingLevel = true;
  try {
    const result: CaptureResponse = await chrome.runtime.sendMessage({ target: 'background', command: 'level' });
    if (!enabled) return;
    if (result.error) throw new Error(result.error);
    levelValue.textContent = !result.enabled || !result.level ? '—'
      : result.level.dbfs === null ? '−∞ dBFS'
      : `${result.level.dbfs.toFixed(1)} dBFS`;
  } catch {
    levelValue.textContent = 'Unavailable';
  } finally {
    readingLevel = false;
  }
}, 500);
window.addEventListener('pagehide', () => window.clearInterval(levelTimer), { once: true });
