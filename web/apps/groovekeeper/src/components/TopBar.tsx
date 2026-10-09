import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useLocation } from 'react-router';
import { db } from '../library/db';
import { useAccount } from '../sync/account';
import { AccountMenu } from './AccountMenu';
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
  const { pathname } = useLocation();
  const onSetlists = pathname.startsWith('/setlists');
  // Songs is the start page, a song, and exporting songs; Settings and the account pages are neither tab.
  const onSongs = pathname === '/' || pathname.startsWith('/songs') || pathname.startsWith('/pdf');
  const signedIn = useAccount((s) => s.status === 'signedIn');
  return (
    <header className="box-content flex h-11 shrink-0 items-center justify-between border-b border-line bg-toolbar px-4 pt-[env(safe-area-inset-top)]">
      <Link to="/" className="flex items-center gap-2 text-sm font-semibold">
        <Logo className="size-5" rim />
        {/* On a phone only the logo shows, to leave room for the rest of the bar; the name is still read out. */}
        <span className="max-sm:sr-only">Groovekeeper</span>
      </Link>
      <nav aria-label="Main" className="flex h-full items-stretch gap-1 text-sm">
        <Tab to="/" active={onSongs}>Songs</Tab>
        {/* Setlists are for accounts. */}
        {signedIn ? <Tab to="/setlists" active={onSetlists}>Setlists</Tab> : null}
      </nav>
      <div className="flex items-center gap-1">
        <SyncNotes />
        <AccountMenu />
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

/** Only when something needs attention: songs changed on two devices. */
function SyncNotes() {
  const conflicts = useLiveQuery(() => db.conflicts.count(), [], 0);
  if (conflicts === 0) return null;
  return (
    <Link to="/conflicts" className="rounded px-2 py-1 text-sm font-semibold text-accent hover:bg-hover">
      {conflicts === 1 ? '1 change' : `${conflicts} changes`} to settle
    </Link>
  );
}

