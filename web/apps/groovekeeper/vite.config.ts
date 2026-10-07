import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { securityHeaders, supabaseUrl } from './deploy.ts';

// The repository root: the app imports the sample songs from samples/songs.
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const appDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ command, mode }) => ({
  // A build checks which Supabase it syncs with before anything else (deploy.ts).
  plugins: [react(), tailwindcss(), ...(command === 'build' ? [securityHeaders(supabaseUrl(mode, appDir))] : [])],
  server: { fs: { allow: [repoRoot] } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/react-renders.ts', './test/setup.ts'],
  },
}));
