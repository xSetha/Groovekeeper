// The local Supabase the app is built against (web/apps/groovekeeper/.env), and whether it's running.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const env = Object.fromEntries(
  readFileSync(resolve(import.meta.dirname, '../../apps/groovekeeper/.env'), 'utf8')
    .split(/\r?\n/)
    .filter((line) => /^\w+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
);

const url = env.VITE_SUPABASE_URL ?? '';
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';

/** Whether the local Supabase answers (`npm run db:start` in web/). */
export const supabaseRunning = (): Promise<boolean> =>
  fetch(`${url}/auth/v1/health`, { headers: { apikey: key } }).then((response) => response.ok, () => false);
