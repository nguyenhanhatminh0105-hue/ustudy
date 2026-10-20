import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const page = (name) => resolve(import.meta.dirname, 'web', `${name}.html`);

export default defineConfig({
  root: 'web',
  publicDir: 'public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        index: page('index'),
        today: page('today'),
        assignments: page('assignments'),
        calendar: page('calendar'),
        habits: page('habits'),
        focus: page('focus'),
        garden: page('garden'),
        rooms: page('rooms'),
        admin: page('admin'),
      },
    },
  },
  server: {
    port: 5173,
    // Keep the browser's Host header so the API's same-origin check sees one origin.
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: false },
      '/socket.io': { target: 'ws://localhost:3000', ws: true, changeOrigin: false },
    },
  },
});
