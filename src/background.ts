import type { CaptureCommand, CaptureResponse } from './capture';

// Serialize requests so rapid popup reopen/clicks cannot start two streams.
let pending: Promise<unknown> = Promise.resolve();

async function hasOffscreenDocument(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL('offscreen.html')],
  });
  return contexts.length > 0;
}

async function handle(command: CaptureCommand, tabId?: number, volume?: number): Promise<CaptureResponse> {
  const exists = await hasOffscreenDocument();
  if (command === 'volume') {
    if (!exists) throw new Error('Enable capture before adjusting volume.');
    return chrome.runtime.sendMessage({ target: 'offscreen', command, volume });
  }
  if (command === 'status' || command === 'level') {
    return exists
      ? chrome.runtime.sendMessage({ target: 'offscreen', command })
      : { enabled: false };
  }
  if (command === 'stop') {
    if (exists) {
      try {
        const result: CaptureResponse = await chrome.runtime.sendMessage({ target: 'offscreen', command });
        if (result.error) console.error('[SoundBuffer] Audio cleanup reported an error', result.error);
      } finally {
        // Closing the document also releases resources if messaging/cleanup fails.
        await chrome.offscreen.closeDocument();
      }
    }
    console.info('[SoundBuffer] Capture stopped by user');
    return { enabled: false };
  }

  if (exists) {
    const state: CaptureResponse = await chrome.runtime.sendMessage({
      target: 'offscreen', command: 'status',
    });
    if (state.enabled) return state;
  }
  if (tabId === undefined) throw new Error('No active tab is available.');
  if (!exists) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.USER_MEDIA],
      justification: 'Keep user-requested tab audio capture alive while the popup is closed.',
    });
  }
  try {
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
    const state: CaptureResponse = await chrome.runtime.sendMessage({
      target: 'offscreen', command: 'start', streamId, tabId,
    });
    if (state.error) throw new Error(state.error);
    console.info('[SoundBuffer] Capture started', { tabId });
    return state;
  } catch (error) {
    await chrome.offscreen.closeDocument().catch(console.error);
    throw error;
  }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.url !== chrome.runtime.getURL('index.html') || message?.target !== 'background') return;
  const command = message.command as CaptureCommand;
  if (!['status', 'start', 'stop', 'volume', 'level'].includes(command)) return;
  const task = pending.then(() => handle(command, message.tabId, message.volume));
  pending = task.catch(() => undefined);
  void task.then(respond, (error: unknown) => {
    console.error('[SoundBuffer] Capture request failed', error);
    respond({ enabled: false, error: error instanceof Error ? error.message : String(error) });
  });
  return true;
});

chrome.tabCapture.onStatusChanged.addListener(({ tabId, status }) => {
  console.info('[SoundBuffer] Tab capture status changed', { tabId, status });
  if (status === 'error') console.error('[SoundBuffer] Chrome reported a capture failure', { tabId });
});
