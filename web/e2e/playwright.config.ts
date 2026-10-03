// End-to-end tests: the real app in Chrome, driven like a user. `npm run test:e2e` in web/.
import { defineConfig } from '@playwright/test';

// Its own port, so the tests don't use (or stop) an `npm run dev` already running on 5173.
const PORT = 5174;

export default defineConfig({
  testDir: './tests',
  // The tests share one local database and some run two browsers at once: one test at a time.
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // The Chrome installed on this computer, so nothing has to be downloaded.
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -w @groovekeeper/app -- --port ${PORT} --strictPort`,
    cwd: '..',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
