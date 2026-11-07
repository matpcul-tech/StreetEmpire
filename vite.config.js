import { defineConfig } from 'vite';
import { resolve } from 'node:path';
// two pages: the game and the build kit viewer (kit.html)
export default defineConfig({ base: './', build: { rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), kit: resolve(import.meta.dirname, 'kit.html') } } } });
