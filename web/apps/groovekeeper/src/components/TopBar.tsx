import { Link } from 'react-router';

/** The app's logo: a record with a red label, as on the desktop start page. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="13" fill="#050404" stroke="var(--color-accent)" strokeWidth="2" />
      <circle cx="16" cy="16" r="5.5" fill="#c4161c" />
      <circle cx="16" cy="16" r="1.5" fill="#050404" />
    </svg>
  );
}

export function TopBar() {
  return (
    <header className="flex h-11 shrink-0 items-center border-b border-line bg-toolbar px-4">
      <Link to="/" className="flex items-center gap-2 text-sm font-semibold">
        <Logo className="size-5" />
        Groovekeeper
      </Link>
    </header>
  );
}
