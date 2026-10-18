import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import tailwindcss from '@tailwindcss/postcss';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';
const extensionEntry = process.env.OPENCOURT_EXTENSIONS_ENTRY;
if (extensionEntry && !existsSync(resolve(extensionEntry))) {
  throw new Error('OPENCOURT_EXTENSIONS_ENTRY does not exist.');
}

export default defineConfig({
  resolve: {
    alias: {
      '@club-extensions': extensionEntry
        ? resolve(extensionEntry)
        : fileURLToPath(new URL('./lib/club-extensions.ts', import.meta.url)),
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [
    {
      name: 'club-extension-styles',
      enforce: 'pre',
      transform(source, id) {
        if (extensionEntry && id.endsWith('/app/globals.css')) {
          return `${source}\n@source ${JSON.stringify(dirname(resolve(extensionEntry)))};\n`;
        }
      },
    },
    react(),
  ],
  server: isCodexSeatbeltSandbox
    ? { watch: { useFsEvents: false, usePolling: true } }
    : undefined,
  build: { outDir: 'dist', emptyOutDir: true },
});
