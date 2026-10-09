import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link } from 'react-router';
import { useAccount } from '../sync/account';
import { syncStatusText } from './forms';
import { useSignOut } from './useSignOut';

/**
 * The account in the top bar. Signed out: "Sign in". Signed in: a button opening a menu with the email, how
 * syncing stands, Settings and Sign out (and the songs question, while one waits). A menu as the ARIA pattern
 * has it: arrow keys move between items, Esc and a click outside close it.
 */
export function AccountMenu() {
  const status = useAccount((s) => s.status);
  if (status === 'starting') return null;
  if (status === 'guest') {
    return (
      <Link
        to="/signin"
        className="rounded px-2 py-1 text-sm whitespace-nowrap text-muted hover:bg-hover hover:text-fg pointer-coarse:flex pointer-coarse:min-h-11 pointer-coarse:items-center"
      >
        Sign in
      </Link>
    );
  }
  return <SignedInMenu />;
}

function SignedInMenu() {
  const email = useAccount((s) => s.email);
  const sync = useAccount((s) => s.sync);
  const lastSynced = useAccount((s) => s.lastSynced);
  const settling = useAccount((s) => s.guestLibrary !== null);
  const { signOut, busy, dialog } = useSignOut();
  const [open, setOpen] = useState(false);
  const menu = useId();
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const items = useRef<HTMLDivElement>(null);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) toggle.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    // Opening the menu puts the keyboard on its first item.
    items.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!(event.target instanceof Node && root.current?.contains(event.target))) setOpen(false);
    };
    window.addEventListener('pointerdown', onPointer);
    return () => window.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const onMenuKey = (event: ReactKeyboardEvent) => {
    const all = [...(items.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])];
    const at = all.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => {
      event.preventDefault();
      all[(to + all.length) % all.length]?.focus();
    };
    if (event.key === 'ArrowDown') move(at + 1);
    else if (event.key === 'ArrowUp') move(at - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(all.length - 1);
    else if (event.key === 'Escape' || event.key === 'Tab') close(event.key === 'Escape');
  };

  const ITEM = 'block w-full rounded px-3 py-2 text-left text-sm hover:bg-hover focus:bg-hover focus:outline-none pointer-coarse:min-h-11';

  return (
    <div ref={root} className="relative">
      <button
        ref={toggle}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menu}
        aria-label={`Account: ${email ?? ''}`}
        title={`Account: ${email ?? ''}`}
        className="flex items-center justify-center rounded p-1.5 text-muted hover:bg-hover hover:text-fg aria-expanded:bg-hover aria-expanded:text-fg pointer-coarse:min-h-11 pointer-coarse:min-w-11"
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {/* A person: the account. */}
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
      </button>
      {open ? (
        <div className="absolute top-full right-0 z-30 mt-1 w-72 rounded-lg border border-line bg-card p-1.5 shadow-2xl">
          {/* Who's signed in and how syncing stands: read as text, outside the menu's items. */}
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold">{email}</p>
            <p className="mt-0.5 text-xs text-muted">{syncStatusText(sync, lastSynced)}</p>
          </div>
          <div className="my-1 border-t border-line" />
          <div ref={items} id={menu} role="menu" aria-label="Account" onKeyDown={onMenuKey}>
            {settling ? (
              // The songs on this device wait for an answer; until then signing out would lose them.
              <Link role="menuitem" to="/welcome" className={`${ITEM} font-semibold text-accent`} onClick={() => close(false)}>
                Finish signing in
              </Link>
            ) : (
              <>
                <Link role="menuitem" to="/settings" className={ITEM} onClick={() => close(false)}>
                  Settings
                </Link>
                <button
                  role="menuitem"
                  type="button"
                  disabled={busy}
                  className={ITEM}
                  onClick={() => {
                    close(false);
                    signOut();
                  }}
                >
                  Sign out
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
      {dialog}
    </div>
  );
}
