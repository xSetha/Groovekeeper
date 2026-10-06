// Selecting lyrics across lines. Each line is its own text box, which selects only within the line. Once a
// mouse drag leaves the line it started in, the editor takes over and selects the lyrics in between; Delete
// or Backspace deletes them, and any other key or click ends the selection.
import { useEffect, type PointerEvent as ReactPointerEvent } from 'react';
import { deleteRange, findLine, lineAt, rangeBetween, type TextPosition } from './edit';
import type { EditorStore } from './store';

// Dragging this close to the top or bottom of the song's view scrolls it, this far for each move.
const EDGE_PX = 48;
const SCROLL_PX = 16;

/**
 * Starts tracking a mouse press in the lyrics: while it stays in its line the text box selects as usual; once
 * it moves to another line, the selection runs from where it was pressed to the line and letter under the mouse.
 */
export function selectAcrossLines(down: ReactPointerEvent<HTMLElement>, store: EditorStore, charWidth: number): void {
  if (down.pointerType !== 'mouse' || down.button !== 0 || charWidth <= 0) return;
  const box = down.target instanceof HTMLInputElement && down.target.hasAttribute('data-lyrics') ? down.target : null;
  const sections = down.currentTarget;
  const anchorId = box?.closest('[data-line-id]')?.getAttribute('data-line-id');
  if (!box || !anchorId) return;
  const anchor = positionIn(store, box, anchorId, down.clientX, charWidth);
  const scroller = sections.closest('article');
  let taken = false;

  const up = () => {
    if (taken) box.setSelectionRange(anchor.index, anchor.index);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
  };
  const move = (event: PointerEvent) => {
    // The release can be missed (let go over the browser's own menu): the drag ends with the button.
    if (!(event.buttons & 1)) {
      up();
      return;
    }
    const active = positionAt(store, sections, event.clientX, event.clientY, charWidth);
    if (!active) return;
    if (!taken) {
      if (active.lineId === anchor.lineId) return; // the line's text box is selecting
      taken = true;
    }
    // The text box went on selecting while the mouse was pressed: keep its caret where the selection starts.
    box.setSelectionRange(anchor.index, anchor.index);
    const { song, setSelection } = store.getState();
    // Back at the letter it started from, nothing is selected: Backspace is the text box's own again.
    const same = active.lineId === anchor.lineId && active.index === anchor.index;
    setSelection(same ? null : rangeBetween(song, anchor, active));
    if (scroller) {
      const view = scroller.getBoundingClientRect();
      if (event.clientY < view.top + EDGE_PX) scroller.scrollTop -= SCROLL_PX;
      else if (event.clientY > view.bottom - EDGE_PX) scroller.scrollTop += SCROLL_PX;
    }
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

/** The place in a line's text box nearest the mouse. */
function positionIn(store: EditorStore, box: HTMLElement, lineId: string, x: number, charWidth: number): TextPosition {
  const { song } = store.getState();
  const at = findLine(song, lineId);
  const length = (at && lineAt(song, at)?.text.length) ?? 0;
  const index = Math.round((x - box.getBoundingClientRect().left) / charWidth);
  return { lineId, index: Math.min(Math.max(index, 0), length) };
}

/** The place under the mouse: in the last line starting above it (so a heading counts as the line before). */
function positionAt(store: EditorStore, sections: HTMLElement, x: number, y: number, charWidth: number): TextPosition | null {
  const lines = [...sections.querySelectorAll<HTMLElement>('[data-line-id]')];
  const line = lines.findLast((l) => l.getBoundingClientRect().top <= y) ?? lines[0];
  const box = line?.querySelector<HTMLElement>('[data-lyrics]');
  const lineId = line?.getAttribute('data-line-id');
  return box && lineId ? positionIn(store, box, lineId, x, charWidth) : null;
}

/** While lyrics are selected across lines: Delete or Backspace deletes them, and any other key or a click ends it. */
export function useSelectionKeys(store: EditorStore): void {
  useEffect(() => {
    // Ahead of the text boxes, which would delete only in their own line.
    const onKey = (event: KeyboardEvent) => {
      const { selection, setSelection, editAndFocus } = store.getState();
      if (!selection) return;
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        event.stopPropagation();
        editAndFocus((song) => deleteRange(song, selection));
        setSelection(null);
      } else if (!['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
        setSelection(null);
      }
    };
    const onPress = () => store.getState().selection && store.getState().setSelection(null);
    window.addEventListener('keydown', onKey, { capture: true });
    window.addEventListener('pointerdown', onPress, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true });
      window.removeEventListener('pointerdown', onPress, { capture: true });
    };
  }, [store]);
}
