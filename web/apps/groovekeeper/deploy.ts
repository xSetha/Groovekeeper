// What a build needs before it goes on a host (vite.config.ts): the account database it syncs with, its other
// settings, and the security headers Cloudflare Pages sends with every page (`_headers`, written next to the built files).
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadEnv, type Plugin } from 'vite';

/** The mode of a build for the end-to-end tests, which may sync with the local Supabase. */
export const E2E_MODE = 'e2e';

const isLocal = (url: URL): boolean => ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(url.hostname);

/**
 * The Supabase project a build syncs with: the hosted one, from `VITE_SUPABASE_URL` and
 * `VITE_SUPABASE_PUBLISHABLE_KEY` (environment variables win over `.env`, which has the local Supabase's).
 * Throws when they're missing, or when a build for a host would sync with the local Supabase.
 */
export function supabaseUrl(mode: string, appDir: string): URL {
  const env = loadEnv(mode, appDir, 'VITE_SUPABASE_');
  const { VITE_SUPABASE_URL: address, VITE_SUPABASE_PUBLISHABLE_KEY: key } = env;
  if (!address || !key) {
    throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to the Supabase project this build syncs with.');
  }
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    throw new Error(`VITE_SUPABASE_URL isn't an address: ${address}`);
  }
  if (mode !== E2E_MODE && isLocal(url)) {
    throw new Error(
      `This build would sync with the local Supabase (${url.origin}). Set VITE_SUPABASE_URL and ` +
        'VITE_SUPABASE_PUBLISHABLE_KEY to the hosted project, or run `npm run build:e2e` for the end-to-end tests.',
    );
  }
  if (!isLocal(url) && url.protocol !== 'https:') throw new Error(`VITE_SUPABASE_URL must be https: ${url.origin}`);
  return url;
}

// Cloudflare's Turnstile test keys (always pass, always fail, ...): fine locally, never on a host.
const TURNSTILE_TEST_KEY = /^[123]x0{20}[A-F]{2}$/;

/**
 * The other settings a build needs: Turnstile's site key, and who runs the site and how to reach them (the
 * privacy page names them). Throws when one is missing, or when a build for a host has the local stand-ins.
 */
export function checkSiteSettings(mode: string, appDir: string): void {
  const env = loadEnv(mode, appDir, 'VITE_');
  const missing = ['VITE_TURNSTILE_SITE_KEY', 'VITE_SITE_OPERATOR', 'VITE_CONTACT_EMAIL'].filter((name) => !env[name]?.trim());
  if (missing.length > 0) throw new Error(`Set ${missing.join(', ')} for this build.`);
  if (mode === E2E_MODE) return;
  if (TURNSTILE_TEST_KEY.test(env.VITE_TURNSTILE_SITE_KEY!)) {
    throw new Error('VITE_TURNSTILE_SITE_KEY is a Turnstile test key; set the site key of your Turnstile widget.');
  }
  if (/@example\.com$/i.test(env.VITE_CONTACT_EMAIL!) || env.VITE_SITE_OPERATOR!.trim() === 'the person running this copy') {
    throw new Error('Set VITE_SITE_OPERATOR and VITE_CONTACT_EMAIL to who runs this site; the privacy page names them.');
  }
}

const TURNSTILE = 'https://challenges.cloudflare.com';

/** The sha256 hashes of the scripts written into a page, which the CSP lets run. */
export function inlineScriptHashes(html: string): string[] {
  return [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(([, script]) => {
    // Browsers read a page's line ends as \n before hashing a script, so a page checked out with \r\n
    // (Git on Windows) must be hashed the same way.
    const text = (script ?? '').replace(/\r\n?/g, '\n');
    return `'sha256-${createHash('sha256').update(text).digest('base64')}'`;
  });
}

/**
 * Cloudflare Pages' `_headers`: the CSP and other security headers for every page. Files in /assets keep Pages'
 * own caching (checked with the server each time): Pages answers a file that's gone with the app's page, and a
 * long cache would keep that answer even after a rollback brings the file back.
 */
export function headersFile(supabase: URL, scriptHashes: string[]): string {
  const csp = [
    "default-src 'self'",
    `script-src 'self' ${TURNSTILE} ${scriptHashes.join(' ')}`.trim(),
    "style-src 'self'",
    "img-src 'self'",
    "font-src 'self'",
    `connect-src 'self' ${supabase.origin}`,
    // Turnstile, the check against bots on the sign-in forms, runs in a frame from Cloudflare.
    `frame-src ${TURNSTILE}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  return [
    '/*',
    `  Content-Security-Policy: ${csp}`,
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
    '',
  ].join('\n');
}

/** Writes `_headers` next to the built page, with the hashes of the scripts in it. */
export function securityHeaders(supabase: URL): Plugin {
  return {
    name: 'groovekeeper:security-headers',
    apply: 'build',
    async writeBundle({ dir }) {
      if (!dir) return;
      const html = await readFile(join(dir, 'index.html'), 'utf8');
      await writeFile(join(dir, '_headers'), headersFile(supabase, inlineScriptHashes(html)));
    },
  };
}
