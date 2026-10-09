// The parts the account and settings pages share: fields, buttons, the line under the check against bots, and
// what an email link that didn't work says.
import { cloneElement, useId, type ReactElement, type ReactNode } from 'react';
import { dismissLinkError, useAccount } from '../sync/account';
import { CHECK_PROBLEMS, type useTurnstile } from './Turnstile';

export const INPUT =
  'rounded border border-line bg-window px-2 py-2 text-base placeholder:text-hint focus:border-accent focus:outline-none pointer-coarse:min-h-11';
export const PRIMARY =
  'self-start rounded bg-accent-fill px-5 py-2.5 font-semibold text-on-accent hover:brightness-125 disabled:opacity-40 pointer-coarse:min-h-11';
export const SECONDARY = 'rounded border border-line px-4 py-2 hover:bg-hover disabled:opacity-40 pointer-coarse:min-h-11';
export const DANGER =
  'rounded border border-chord px-4 py-2 text-sm font-semibold text-chord hover:bg-hover disabled:opacity-40 pointer-coarse:min-h-11';

export const PASSWORDS_DIFFER = 'The passwords don’t match. Type the same password in both boxes.';

/** A labelled field; the hint under it is read out as the field's description. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactElement<{ 'aria-describedby'?: string }> }) {
  const hintId = useId();
  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1">
        <span className="font-semibold">{label}</span>
        {hint ? cloneElement(children, { 'aria-describedby': hintId }) : children}
      </label>
      {hint ? (
        <span id={hintId} className="text-sm text-muted">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** A button that reads like a link, for the smaller choices around a form. */
export function TextButton({ onClick, children, disabled }: { onClick: () => void; children: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="text-accent hover:underline disabled:opacity-50 pointer-coarse:min-h-11"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** What a form's request said: a confirmation, or what went wrong. */
export function FormMessage({ error, children }: { error?: boolean; children: ReactNode }) {
  return error ? (
    <p role="alert" className="text-chord">
      {children}
    </p>
  ) : (
    <p role="status">{children}</p>
  );
}

/**
 * Where the check against bots shows when it needs the user, and the line under it: checking, tick the box,
 * or why it can't pass.
 */
export function CheckBox({ check }: { check: ReturnType<typeof useTurnstile> }) {
  return (
    <>
      <div ref={check.box} />
      {check.problem ? (
        <p role="alert" className="text-sm text-chord">
          {CHECK_PROBLEMS[check.problem]}
        </p>
      ) : check.token === null ? (
        <p role="status" className="text-sm text-muted">
          {check.waitingForUser ? 'Tick the box above to show you’re not a bot.' : 'Checking that you’re not a bot…'}
        </p>
      ) : null}
    </>
  );
}

/** An email link that didn't work: why, and how to get a new one. It stays until it's closed or a new link is asked for. */
export function LinkErrorBanner() {
  const linkError = useAccount((s) => s.linkError);
  const signedIn = useAccount((s) => s.status === 'signedIn');
  if (!linkError) return null;
  return (
    <div role="alert" className="mb-6 flex items-start gap-2 rounded border border-chord px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {linkError.expired ? 'That email link has expired or was already used' : 'That email link didn’t work'}
        </p>
        <p className="mt-1 text-sm text-muted">
          A link works once, for an hour (some email apps open links to check them, which uses them up).{' '}
          {signedIn
            ? 'You’re signed in already, so nothing is needed here.'
            : 'Get a new one below: send the confirmation again, or use Forgot password.'}
        </p>
      </div>
      <button
        type="button"
        aria-label="Close"
        className="-my-1 -mr-2 rounded px-2 py-1 text-muted hover:bg-hover hover:text-fg pointer-coarse:min-h-11 pointer-coarse:min-w-11"
        onClick={dismissLinkError}
      >
        ×
      </button>
    </div>
  );
}

/** Says how syncing stands, in a sentence. */
export function syncStatusText(sync: string, lastSynced: number | null): string {
  if (sync === 'syncing') return 'Syncing…';
  if (sync === 'offline') return 'Offline. Changes are saved on this device and sync when you’re back online.';
  if (sync === 'failed') return 'Couldn’t sync. It tries again by itself in a moment, or sync now.';
  if (sync === 'unavailable') return 'The account can’t take changes right now. Your changes are saved on this device and sync once it can.';
  return lastSynced ? `Synced at ${new Date(lastSynced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : 'Not synced yet.';
}
