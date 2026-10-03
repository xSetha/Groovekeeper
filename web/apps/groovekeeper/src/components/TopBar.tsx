import { Link, useLocation } from 'react-router';
import { ThemePicker } from './ThemePicker';

/** The app's logo: a record with a red label, as on the desktop start page. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="13" strokeWidth="2" className="fill-logo-record stroke-logo-ring" />
      <circle cx="16" cy="16" r="5.5" className="fill-logo-label" />
      <circle cx="16" cy="16" r="1.5" className="fill-logo-record" />
    </svg>
  );
}

export function TopBar() {
  const onSetlists = useLocation().pathname.startsWith('/setlists');
  return (
    <header className="flex h-11 shrink-0 items-center justify-between border-b border-line bg-toolbar px-4 print:hidden">
      <Link to="/" className="flex items-center gap-2 text-sm font-semibold">
        <Logo className="size-5" />
        Groovekeeper
      </Link>
      <nav aria-label="Main" className="flex h-full items-stretch gap-1 text-sm">
        <Tab to="/" active={!onSetlists}>Songs</Tab>
        <Tab to="/setlists" active={onSetlists}>Setlists</Tab>
      </nav>
      <ThemePicker />
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
