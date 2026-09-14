# SoundBuffer

Minimal Chrome Manifest V3 extension using TypeScript and Vite, without React.
The popup saves an enabled preference (disabled by default). It does not process
audio or enable/disable the extension itself.

## Build and load

1. Install dependencies with `npm ci`.
2. Run `npm run build` (includes TypeScript checking).
3. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**,
   and select this project's `dist` folder.
4. Pin SoundBuffer through Chrome's extensions menu, then click its toolbar action.

Click **Enable** or **Disable**, close the popup, and reopen it to verify that the
preference persists.

For development, run `npm run watch`, then reload the extension in Chrome after
changes. Run `npm run check` separately while using watch mode. Load the built
extension in Chrome to use its storage API.

## Files

- `public/manifest.json`: extension metadata, toolbar action, and storage permission;
  Vite copies it to `dist/manifest.json`.
- `index.html`: popup markup and Vite's entry point.
- `src/popup.ts`: reads and saves the toggle preference, with storage error handling.
- `src/popup.css`: minimal popup styling.
- `tsconfig.json`: strict TypeScript settings.
- `vite.config.ts`: relative asset paths and JavaScript build target.
- `package.json` / `package-lock.json`: scripts and reproducible development dependencies.
- `dist/`: generated extension ready to load; excluded from Git.

No background worker, content scripts, or audio permissions are needed yet.
