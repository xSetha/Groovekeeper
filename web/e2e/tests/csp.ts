// Whether the Content Security Policy blocked anything. The built site (the `built` project) sends the same
// headers as the hosted one (apps/groovekeeper/deploy.ts); the dev server sends none, so nothing is blocked there.
import { test as base, expect, type BrowserContext } from '@playwright/test';

const MARK = 'Blocked by the Content Security Policy:';

/** Notes in `blocked` whatever the CSP blocks in this browser. */
export async function watchCsp(context: BrowserContext, blocked: string[]): Promise<void> {
  await context.addInitScript((mark) => {
    document.addEventListener('securitypolicyviolation', (event) =>
      console.error(`${mark} ${event.effectiveDirective} ${event.blockedURI || '(inline)'}`));
  }, MARK);
  context.on('console', (message) => {
    if (message.text().startsWith(MARK)) blocked.push(message.text());
  });
}

/** Playwright's `test`, failing a test when the CSP blocked anything in its page or in browsers it watches. */
export const test = base.extend<{ blocked: string[] }>({
  blocked: [
    async ({ context }, use) => {
      const blocked: string[] = [];
      await watchCsp(context, blocked);
      await use(blocked);
      expect(blocked, 'blocked by the Content Security Policy').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
