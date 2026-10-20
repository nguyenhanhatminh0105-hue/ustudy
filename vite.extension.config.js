import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Builds the Chrome extension into extension/dist (load it with "Load unpacked").
export default defineConfig({
  root: 'extension',
  publicDir: 'public',
  base: './',
  // `npm run dev:extension` previews the popup in a normal tab against the local API.
  server: {
    port: 5174,
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: false } },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    // three.js is one ~700 kB chunk by design; it's cached once and shared by every page.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        popup: resolve(import.meta.dirname, 'extension/popup.html'),
        background: resolve(import.meta.dirname, 'extension/src/background.js'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
});
