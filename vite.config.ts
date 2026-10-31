/// <reference types="vitest/config" />
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const API_PORT = Number(process.env.API_PORT ?? 8787);
const here = import.meta.dirname;
const nm = (p: string) => resolve(here, 'node_modules', p).replace(/\\/g, '/');

export default defineConfig({
  // The browser app lives in web/; the API in server/; both use shared/.
  root: resolve(here, 'web'),
  resolve: { alias: { '@shared': resolve(here, 'shared') } },
  build: { outDir: resolve(here, 'dist'), emptyOutDir: true },
  plugins: [
    react(),
    // Silero VAD model, its AudioWorklet and the onnxruntime wasm files are fetched at runtime.
    viteStaticCopy({
      targets: [
        { src: nm('@ricky0123/vad-web/dist/vad.worklet.bundle.min.js'), dest: 'vad', rename: { stripBase: true } },
        { src: nm('@ricky0123/vad-web/dist/silero_vad_v5.onnx'), dest: 'vad', rename: { stripBase: true } },
        { src: nm('@ricky0123/vad-web/dist/silero_vad_legacy.onnx'), dest: 'vad', rename: { stripBase: true } },
        { src: nm('onnxruntime-web/dist/*.wasm'), dest: 'vad', rename: { stripBase: true } },
        { src: nm('onnxruntime-web/dist/*.mjs'), dest: 'vad', rename: { stripBase: true } },
      ],
    }),
  ],
  optimizeDeps: { include: ['@ricky0123/vad-web', 'onnxruntime-web/wasm'] },
  server: {
    port: 5173,
    proxy: { '/api': `http://127.0.0.1:${API_PORT}` },
  },
  test: {
    root: here,
    environment: 'node',
    include: ['web/src/**/*.test.ts', 'server/**/*.test.ts', 'shared/**/*.test.ts'],
  },
});
