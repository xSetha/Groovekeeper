import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The repository root: the app imports the sample songs from samples/songs.
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { fs: { allow: [repoRoot] } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/react-renders.ts', './test/setup.ts'],
  },
});
