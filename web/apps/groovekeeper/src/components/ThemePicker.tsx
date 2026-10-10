import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { setTheme, THEMES, useTheme } from '../themes';

/** A button in the top bar that opens the list of themes; each shows a chord in its own colors. */
export function ThemePicker() {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const panel = useId();
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const selected = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // Opening the list puts the keyboard on the theme in use.
    selected.current?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!(event.target instanceof Node && root.current?.contains(event.target))) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      toggle.current?.focus();
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        ref={toggle}
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        aria-label={`Theme: ${theme.name}`}
        title={`Theme: ${theme.name}`}
        className="flex items-center justify-center rounded p-1.5 text-muted hover:bg-hover hover:text-fg aria-expanded:bg-hover aria-expanded:text-fg pointer-coarse:min-h-11 pointer-coarse:min-w-11"
        onClick={() => setOpen(!open)}
      >
        {/* A palette, as on the desktop's theme button. */}
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3a9 9 0 0 0 0 18c1.2 0 2-.8 2-1.9 0-.5-.2-.9-.5-1.3-.3-.3-.5-.7-.5-1.2 0-1 .9-1.8 1.9-1.8H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3Z" />
          <circle cx="7.5" cy="11.5" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="10" cy="7.5" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="15" cy="7.5" r="1.3" fill="currentColor" stroke="none" />
        </svg>
      </button>
      {open ? (
        <div
          id={panel}
          role="group"
          aria-label="Theme"
          className="absolute top-full right-0 z-30 mt-1 w-72 rounded-lg border border-line bg-card p-1.5 shadow-2xl"
        >
          <ThemeChoices
            selected={selected}
            onChoose={() => {
              setOpen(false);
              toggle.current?.focus();
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

/** The themes, one button each showing a chord in its own colors. `onChoose` runs once one is picked; `selected` goes on the one in use. */
export function ThemeChoices({ onChoose, selected }: { onChoose?: () => void; selected?: RefObject<HTMLButtonElement | null> }) {
  const theme = useTheme();
  return (
    <>
      {THEMES.map((option) => (
        <button
          key={option.id}
          ref={option.id === theme.id ? selected : undefined}
          type="button"
          aria-pressed={option.id === theme.id}
          className="flex w-full items-center gap-3 rounded px-2 py-2 text-left hover:bg-hover aria-pressed:bg-hover"
          onClick={() => {
            setTheme(option.id);
            onChoose?.();
          }}
        >
          {/* The preview takes the theme's own colors from its data-theme attribute. */}
          <span data-theme={option.id} aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded border border-line bg-window">
            <span className="rounded bg-chip px-1 font-mono text-sm font-semibold text-chord">Am</span>
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{option.name}</span>
            <span className="block text-xs text-muted">{option.description}</span>
          </span>
        </button>
      ))}
    </>
  );
}
