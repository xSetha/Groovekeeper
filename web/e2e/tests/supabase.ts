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

// The emails the local Supabase sends end up in Mailpit, not in a real inbox.
const MAILPIT = 'http://127.0.0.1:54324';

/** The link in the newest email to `email` (the confirmation of a new account), waiting for it to arrive. */
export async function linkInEmail(email: string): Promise<string> {
  for (let tries = 0; tries < 30; tries++) {
    const found = (await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json()) as {
      messages: { ID: string }[];
    };
    const newest = found.messages[0];
    if (newest) {
      const message = (await (await fetch(`${MAILPIT}/api/v1/message/${newest.ID}`)).json()) as { Text: string };
      const link = message.Text.match(/https?:\/\/\S+\/auth\/v1\/verify\S+/)?.[0];
      if (link) return link.replace(/[)\].,]+$/, '');
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`No email with a link arrived for ${email}`);
}
