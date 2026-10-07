// End-to-end tests: the real app in Chrome, driven like a user. `npm run test:e2e` in web/.
import { defineConfig } from '@playwright/test';

// Their own ports, so the tests don't use (or stop) an `npm run dev` already running on 5173.
const DEV_PORT = 5174;
const BUILT_PORT = 5175;

export default defineConfig({
  testDir: './tests',
  // The tests share one local database and some run two browsers at once: one test at a time.
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    // The Chrome installed on this computer, so nothing has to be downloaded.
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  projects: [
    // The app as it's worked on.
    { name: 'dev', use: { baseURL: `http://localhost:${DEV_PORT}` } },
    // The app as it's deployed: built, and served by Cloudflare's local copy of Pages with the site's
    // headers (`_headers`, the Content Security Policy among them).
    { name: 'built', use: { baseURL: `http://127.0.0.1:${BUILT_PORT}` } },
  ],
  webServer: [
    {
      command: `npm run dev -w @groovekeeper/app -- --port ${DEV_PORT} --strictPort`,
      cwd: '..',
      url: `http://localhost:${DEV_PORT}`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      // Built every run, so the tests never see an old build.
      command: `npm run build:e2e && npx wrangler pages dev apps/groovekeeper/dist --port ${BUILT_PORT} --ip 127.0.0.1 --compatibility-date=2026-10-06`,
      cwd: '..',
      env: { WRANGLER_SEND_METRICS: 'false' },
      url: `http://127.0.0.1:${BUILT_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
