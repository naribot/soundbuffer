import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    // Avoid cross-world preload warnings in Chrome extension documents.
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: 'index.html',
        offscreen: 'offscreen.html',
        background: 'src/background.ts',
      },
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
});
