import './popup.css';

const button = document.querySelector<HTMLButtonElement>('#toggle')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
let enabled = false;

function render(): void {
  button.textContent = enabled ? 'Disable' : 'Enable';
  status.textContent = enabled ? 'Enabled' : 'Disabled';
}

async function initialize(): Promise<void> {
  try {
    const stored = await chrome.storage.local.get('enabled');
    enabled = stored.enabled === true;
    render();
    button.disabled = false;
  } catch (error) {
    status.textContent = 'Unable to load your preference. Reopen the popup to retry.';
    console.error('SoundBuffer: failed to load preference', error);
  }
}

button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    const nextEnabled = !enabled;
    await chrome.storage.local.set({ enabled: nextEnabled });
    enabled = nextEnabled;
    render();
  } catch (error) {
    status.textContent = 'Unable to save your preference. Please try again.';
    console.error('SoundBuffer: failed to save preference', error);
  } finally {
    button.disabled = false;
  }
});

void initialize();
