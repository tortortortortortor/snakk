/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const API_PORT = Number(process.env.API_PORT ?? 8787);

export default defineConfig({
  plugins: [
    react(),
    // Silero VAD model, its AudioWorklet and the onnxruntime wasm files are fetched at runtime.
    viteStaticCopy({
      targets: [
        { src: 'node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js', dest: 'vad', rename: { stripBase: true } },
        { src: 'node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx', dest: 'vad', rename: { stripBase: true } },
        { src: 'node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx', dest: 'vad', rename: { stripBase: true } },
        { src: 'node_modules/onnxruntime-web/dist/*.wasm', dest: 'vad', rename: { stripBase: true } },
        { src: 'node_modules/onnxruntime-web/dist/*.mjs', dest: 'vad', rename: { stripBase: true } },
      ],
    }),
  ],
  optimizeDeps: { include: ['@ricky0123/vad-web', 'onnxruntime-web/wasm'] },
  server: {
    port: 5173,
    proxy: { '/api': `http://127.0.0.1:${API_PORT}` },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'server/**/*.test.ts', 'shared/**/*.test.ts'] },
});
