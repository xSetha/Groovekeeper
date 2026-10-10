// Notes floating over the song, and the edge of the printed page.
import { memo, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { MenuAt } from '../components/ContextMenu';
import { trackDrag } from '../components/drag';
import { rowAt } from '../components/notes';
import { printedColumns } from '../pdf/layout';
import { useSetting } from '../settings';
import { deleteNote, finishNote, moveNote, setNoteText } from './edit';
import { useEditor, useEditorStore } from './store';

/**
 * Laid over the song's sections (inside them, so its `ch` is a lyric letter): the line past which the PDF
 * wraps, and the notes. After each layout of the song it works out what each note is over, for the PDF.
 */
export function NoteLayer({ charWidth, onMenu }: { charWidth: number; onMenu: (menu: MenuAt) => void }) {
  const store = useEditorStore();
  const layer = useRef<HTMLDivElement>(null);
  const paper = useSetting('paper');
  const ids = useEditor((s) => s.song.notes.map((note) => note.id).join(','));
  // What the rows depend on: the lines (by id) and where the notes are.
  const layout = useEditor(
    (s) => `${s.song.sections.map((section) => section.lines.map((l) => l.id).join(',')).join('|')}#${s.song.notes.map((n) => n.top).join(',')}`,
  );

  useLayoutEffect(() => {
    const sections = layer.current?.parentElement;
    if (!sections) return;
    const relay = () => {
      const origin = sections.getBoundingClientRect().top;
      const lines = [...sections.querySelectorAll('[data-line-id]')].map((line) => {
        const box = line.getBoundingClientRect();
        return { top: box.top - origin, height: box.height };
      });
      const { song, relayNotes } = store.getState();
      relayNotes(new Map(song.notes.map((note) => [note.id, rowAt(lines, note.top)])));
    };
    relay();
    // Line heights change when the song's font has loaded, or the window is resized.
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(relay);
    observer.observe(sections);
    return () => observer.disconnect();
  }, [store, layout]);

  return (
    <div ref={layer} className="pointer-events-none absolute inset-0">
      <div
        aria-hidden="true"
        className="absolute inset-y-0 border-l border-dashed border-line"
        style={{ left: `${printedColumns(paper)}ch` }}
      />
      {ids
        ? ids.split(',').map((id) => <NoteBox key={id} id={id} charWidth={charWidth} onMenu={onMenu} />)
        : null}
    </div>
  );
}

const NoteBox = memo(function NoteBox({ id, charWidth, onMenu }: { id: string; charWidth: number; onMenu: (menu: MenuAt) => void }) {
  const store = useEditorStore();
  const note = useEditor((s) => s.song.notes.find((n) => n.id === id));
  const focusRequest = useEditor((s) => (s.focusNote?.id === id ? s.focusNote.request : null));
  // How far the note has been dragged, until it's dropped.
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (focusRequest !== null) box.current?.focus();
  }, [focusRequest]);

  if (!note) return null;
  const { edit } = store.getState();
  const lines = note.text.split('\n');
  const remove = () => edit((s) => deleteNote(s, id));

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return; // the delete button
    if (event.pointerType === 'mouse') event.preventDefault();
    const { clientX: startX, clientY: startY } = event;
    trackDrag(event, {
      onMove: (move) => setOffset({ x: move.clientX - startX, y: move.clientY - startY }),
      onEnd: (end) => {
        setOffset(null);
        if (!end || !note) return;
        const column = charWidth > 0 ? note.column + (end.clientX - startX) / charWidth : note.column;
        edit((s) => moveNote(s, id, Math.round(column * 10) / 10, Math.round(note.top + end.clientY - startY)));
      },
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter is done (the caret leaves the note); Shift+Enter starts a new line, as a text box does.
    if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Escape') {
      event.preventDefault();
      event.currentTarget.blur();
    }
  }

  return (
    <div
      data-note
      className="group/note pointer-events-auto absolute rounded border border-accent bg-card shadow-lg"
      // In the lyrics' font, `ch` is a lyric letter, so the note keeps its letter column; its text is in its own font.
      style={{ left: `calc(${note.column}ch + ${offset?.x ?? 0}px)`, top: note.top + (offset?.y ?? 0) }}
      onContextMenu={(event) => {
        event.stopPropagation();
        if (event.target instanceof HTMLTextAreaElement) return; // the text box's own menu: copy, paste
        event.preventDefault();
        onMenu({ x: event.clientX, y: event.clientY, items: [{ label: 'Delete note', onSelect: remove }] });
      }}
    >
      <div
        title="Drag to move the note"
        className="flex h-3 cursor-move touch-none items-center justify-end rounded-t-[3px] bg-accent/45 pointer-coarse:h-7"
        onPointerDown={startDrag}
      >
        <button
          type="button"
          aria-label="Delete note"
          title="Delete note"
          className={
            'h-full rounded-tr-[3px] px-1 font-sans text-[10px] leading-none text-on-accent opacity-0 hover:bg-accent-fill ' +
            'group-hover/note:opacity-100 group-focus-within/note:opacity-100 focus:opacity-100 pointer-coarse:px-3 pointer-coarse:text-sm pointer-coarse:opacity-100'
          }
          onClick={remove}
        >
          ×
        </button>
      </div>
      <textarea
        ref={box}
        value={note.text}
        aria-label="Note"
        rows={lines.length}
        wrap="off"
        spellCheck={false}
        // Lines aren't wrapped, so they print as typed; the box is as wide as the longest.
        style={{ width: `${Math.max(8, ...lines.map((line) => line.length)) + 2}ch` }}
        className="block resize-none overflow-hidden bg-transparent px-1.5 pt-0.5 pb-1 font-sans text-sm text-fg italic outline-none pointer-coarse:text-base"
        onChange={(event) => {
          const text = event.target.value;
          edit((s) => setNoteText(s, id, text), { merge: `note:${id}` });
        }}
        onKeyDown={onKeyDown}
        onBlur={() => edit((s) => finishNote(s, id))}
      />
    </div>
  );
});
