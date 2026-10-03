import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/postcss';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [react()],
  server: isCodexSeatbeltSandbox
    ? { watch: { useFsEvents: false, usePolling: true } }
    : undefined,
  build: { outDir: 'dist', emptyOutDir: true },
});
