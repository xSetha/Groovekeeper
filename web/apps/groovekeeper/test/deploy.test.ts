// What a build for a host checks and writes (deploy.ts): the Supabase it syncs with, and the security headers.
// @vitest-environment node
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkSiteSettings, headersFile, inlineScriptHashes, supabaseUrl } from '../deploy';

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
  for (const name of ['VITE_TURNSTILE_SITE_KEY', 'VITE_SITE_OPERATOR', 'VITE_CONTACT_EMAIL']) vi.stubEnv(name, undefined);
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
    expect(headers).toContain("script-src 'self' https://challenges.cloudflare.com 'sha256-x'");
    expect(headers).toContain('frame-src https://challenges.cloudflare.com');
    expect(headers).toContain("connect-src 'self' https://abc.supabase.co;");
    expect(headers).not.toContain('Cache-Control');
  });
});

describe('the other settings a build needs', () => {
  const LOCAL = appWith(
    'VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA\nVITE_SITE_OPERATOR=the person running this copy\nVITE_CONTACT_EMAIL=privacy@example.com\n',
  );

  it('takes the local stand-ins only in a build for the end-to-end tests', () => {
    expect(() => checkSiteSettings('e2e', LOCAL)).not.toThrow();
    expect(() => checkSiteSettings('production', LOCAL)).toThrow(/Turnstile test key/);
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '0x4AAAAAAABkMYinukE8nzY');
    expect(() => checkSiteSettings('production', LOCAL)).toThrow(/who runs this site/);
  });

  it('builds with a real site key, and who runs the site', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '0x4AAAAAAABkMYinukE8nzY');
    vi.stubEnv('VITE_SITE_OPERATOR', 'xSetha');
    vi.stubEnv('VITE_CONTACT_EMAIL', 'privacy@groovekeeper.app');
    expect(() => checkSiteSettings('production', LOCAL)).not.toThrow();
  });

  it('names what\'s missing', () => {
    expect(() => checkSiteSettings('production', appWith(''))).toThrow(
      'Set VITE_TURNSTILE_SITE_KEY, VITE_SITE_OPERATOR, VITE_CONTACT_EMAIL for this build.',
    );
  });
});
