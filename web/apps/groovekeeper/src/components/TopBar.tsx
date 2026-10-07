import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useLocation } from 'react-router';
import { db } from '../library/db';
import { useAccount } from '../sync/account';
import { ThemePicker } from './ThemePicker';

/** The app's logo: a record with a red label, as on the desktop start page. */
/**
 * The logo, as on the desktop: a record with grooves, whose label is a keyhole. `rim` rings its edge, so the
 * record stays visible small on a dark bar.
 */
export function Logo({ className, rim = false }: { className?: string; rim?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="16" cy="16" r={rim ? 13 : 14} strokeWidth={rim ? 2 : 0} className="fill-logo-record stroke-logo-ring" />
      <g fill="none" strokeWidth="0.5" className="stroke-logo-ring">
        <circle cx="16" cy="16" r="11.94" opacity="0.5" />
        <circle cx="16" cy="16" r="9.88" opacity="0.4" />
        <circle cx="16" cy="16" r="7.82" opacity="0.3" />
      </g>
      <circle cx="16" cy="16" r="5.35" className="fill-logo-label" />
      <circle cx="16" cy="14.76" r="1.48" className="fill-logo-record" />
      <path d="M15.18 15.59h1.64l.62 3.29h-2.88z" className="fill-logo-record" />
    </svg>
  );
}

export function TopBar() {
  const onSetlists = useLocation().pathname.startsWith('/setlists');
  return (
    <header className="box-content flex h-11 shrink-0 items-center justify-between border-b border-line bg-toolbar px-4 pt-[env(safe-area-inset-top)]">
      <Link to="/" className="flex items-center gap-2 text-sm font-semibold">
        <Logo className="size-5" rim />
        {/* On a phone only the logo shows, to leave room for the rest of the bar; the name is still read out. */}
        <span className="max-sm:sr-only">Groovekeeper</span>
      </Link>
      <nav aria-label="Main" className="flex h-full items-stretch gap-1 text-sm">
        <Tab to="/" active={!onSetlists}>Songs</Tab>
        <Tab to="/setlists" active={onSetlists}>Setlists</Tab>
      </nav>
      <div className="flex items-center gap-1">
        <SyncNotes />
        <AccountLink />
        <ThemePicker />
      </div>
    </header>
  );
}

/** A tab of the top bar: Songs is current on the start page and in a song, Setlists in the setlists. */
function Tab({ to, active, children }: { to: string; active: boolean; children: string }) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className="flex items-center border-b-2 border-transparent px-3 text-muted hover:text-fg aria-[current=page]:border-accent aria-[current=page]:font-semibold aria-[current=page]:text-fg"
    >
      {children}
    </Link>
  );
}

/** Only when something needs attention: songs changed on two devices, being offline, or a failed sync. */
function SyncNotes() {
  const sync = useAccount((s) => s.sync);
  const conflicts = useLiveQuery(() => db.conflicts.count(), [], 0);
  return (
    <>
      {conflicts > 0 ? (
        <Link to="/conflicts" className="rounded px-2 py-1 text-sm font-semibold text-accent hover:bg-hover">
          {conflicts === 1 ? '1 change' : `${conflicts} changes`} to settle
        </Link>
      ) : null}
      {sync === 'offline' ? (
        <span className="px-2 text-sm text-muted" title="Changes are saved on this device and sync when you’re back online.">
          Offline
        </span>
      ) : sync === 'failed' || sync === 'unavailable' ? (
        <Link to="/account" className="rounded px-2 py-1 text-sm text-chord hover:bg-hover">
          Couldn’t sync
        </Link>
      ) : null}
    </>
  );
}

/** "Sign in", or the account once signed in; both open the account page. */
function AccountLink() {
  const status = useAccount((s) => s.status);
  const email = useAccount((s) => s.email);
  const ended = useAccount((s) => s.endedSession !== null);
  if (status === 'starting') return null;
  if (status === 'guest') {
    return (
      <Link
        to="/account"
        className={`rounded px-2 py-1 text-sm whitespace-nowrap hover:bg-hover pointer-coarse:min-h-11 pointer-coarse:flex pointer-coarse:items-center ${ended ? 'font-semibold text-accent' : 'text-muted hover:text-fg'}`}
      >
        {ended ? 'Sign in again' : 'Sign in'}
      </Link>
    );
  }
  return (
    <Link
      to="/account"
      aria-label={`Account: ${email ?? ''}`}
      title={`Account: ${email ?? ''}`}
      className="flex items-center justify-center rounded p-1.5 text-muted hover:bg-hover hover:text-fg pointer-coarse:min-h-11 pointer-coarse:min-w-11"
    >
      {/* A person: the account. */}
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    </Link>
  );
}
