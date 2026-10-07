// What a build for a host checks and writes (deploy.ts): the Supabase it syncs with, and the security headers.
// @vitest-environment node
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { headersFile, inlineScriptHashes, supabaseUrl } from '../deploy';

/** A folder with an `.env` holding these lines, like the app's own. */
function appWith(env: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'groovekeeper-env-'));
  writeFileSync(join(dir, '.env'), env);
  return dir;
}

const LOCAL = appWith('VITE_SUPABASE_URL=http://127.0.0.1:54321\nVITE_SUPABASE_PUBLISHABLE_KEY=local-key\n');

beforeEach(() => {
  // The shell running the tests may hold a hosted project's settings; each test sets what it needs.
  vi.stubEnv('VITE_SUPABASE_URL', undefined);
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the Supabase a build syncs with', () => {
  it('refuses to build for a host against the local Supabase', () => {
    expect(() => supabaseUrl('production', LOCAL)).toThrow(/would sync with the local Supabase/);
  });

  it('allows the local Supabase in a build for the end-to-end tests', () => {
    expect(supabaseUrl('e2e', LOCAL).origin).toBe('http://127.0.0.1:54321');
  });

  it('takes the hosted project from environment variables over .env', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://abc.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_x');
    expect(supabaseUrl('production', LOCAL).origin).toBe('https://abc.supabase.co');
  });

  it('refuses a build without an address and key, or with a plain-http address', () => {
    expect(() => supabaseUrl('production', appWith(''))).toThrow(/Set VITE_SUPABASE_URL/);
    vi.stubEnv('VITE_SUPABASE_URL', 'http://abc.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_x');
    expect(() => supabaseUrl('production', LOCAL)).toThrow(/must be https/);
  });
});

describe('the security headers', () => {
  it('lets only the scripts written into the page run, by their hash', () => {
    const html = '<script>let a = 1;</script><script type="module" src="/assets/index.js"></script>';
    // sha256 of "let a = 1;", in base64.
    expect(inlineScriptHashes(html)).toEqual(["'sha256-xY6QKfH9PRsQnLz56nj6MBwiK5oHg+im1Jkpdp1x/Ck='"]);
  });

  it('hashes a script with Windows line ends as the browser reads it, with \\n', () => {
    expect(inlineScriptHashes('<script>\r\nlet a = 1;\r\n</script>')).toEqual(inlineScriptHashes('<script>\nlet a = 1;\n</script>'));
  });

  it('allows connections to the Supabase project, and leaves caching to Pages', () => {
    const headers = headersFile(new URL('https://abc.supabase.co'), ["'sha256-x'"]);
    expect(headers).toContain("script-src 'self' 'sha256-x'");
    expect(headers).toContain("connect-src 'self' https://abc.supabase.co;");
    expect(headers).not.toContain('Cache-Control');
  });
});
