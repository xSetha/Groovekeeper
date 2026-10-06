// A small menu at a spot: right-click and long press on the song, and the toolbar's Save as file.
import { useEffect, useRef } from 'react';

export interface MenuItem {
  label: string;
  onSelect: () => void;
}

export interface MenuAt {
  x: number;
  y: number;
  items: MenuItem[];
  /** The button that opened the menu, if one did: pressing it again is its own (it closes the menu). */
  opener?: HTMLElement;
}

/** A small menu at a spot (the pointer, or below a button). It closes on a pick, Esc, or a click elsewhere. */
export function ContextMenu({ menu, onClose }: { menu: MenuAt; onClose: () => void }) {
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.querySelector('button')?.focus();
    const away = (event: Event) => {
      // A pointer event's target is a node.
      const target = event.target as Node;
      if (!list.current?.contains(target) && !menu.opener?.contains(target)) onClose();
    };
    const escape = (event: globalThis.KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('keydown', escape);
    };
  }, [onClose, menu.opener]);

  return (
    <div
      ref={list}
      role="menu"
      className="fixed z-40 min-w-40 rounded border border-line bg-card py-1 font-sans text-sm shadow-lg"
      // Kept inside the window.
      style={{ left: Math.min(menu.x, window.innerWidth - 176), top: Math.min(menu.y, window.innerHeight - 48 * menu.items.length) }}
    >
      {menu.items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className="block w-full px-3 py-1.5 text-left hover:bg-hover focus:bg-hover focus:outline-none pointer-coarse:min-h-11"
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
