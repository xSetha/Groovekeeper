import { memo, type PointerEvent, type ReactNode } from 'react';
import { trackDrag } from '../components/drag';
import { addLine, deleteSection, duplicateSection, moveSection, moveSectionTo, renameSection, repeatSection } from './edit';
import { EditorLine } from './EditorLine';
import { useEditor, useEditorStore } from './store';

// Dragging a section this close to the top or bottom of the song's view scrolls it, this far each frame.
const EDGE_PX = 48;
const SCROLL_PX = 12;

interface Props {
  index: number;
  /** The ids of the section's lines, joined with commas, so the props stay plain values `memo` can compare. */
  lineIds: string;
  /** Whether the section is the first or the last, which can't move further. */
  first: boolean;
  last: boolean;
  charWidth: number;
}

/** A section of the song: its heading with the section's actions, its lines, and a button to add a line. */
export const SectionBlock = memo(function SectionBlock({ index, lineIds, first, last, charWidth }: Props) {
  const store = useEditorStore();
  const id = useEditor((s) => s.song.sections[index]?.id);
  const name = useEditor((s) => s.song.sections[index]?.name ?? '');
  const repeat = useEditor((s) => s.song.sections[index]?.repeat ?? false);
  const { edit, editAndFocus, setCaretSection, setSectionDrop } = store.getState();
  const lines = lineIds ? lineIds.split(',') : [];

  /**
   * Dragging the section by its grip: a line shows where it will land, and the drop is one undo step. Near the
   * top or bottom of the song's view it scrolls, so a section can go anywhere in a long song.
   */
  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    if (event.pointerType === 'mouse') event.preventDefault();
    const scroller = event.currentTarget.closest('article');
    const blocks = event.currentTarget.closest('[data-sections]')?.querySelectorAll(':scope > section') ?? [];
    // The sections' middles are read once, before anything moves, as places in the scrolled song.
    const startScroll = scroller?.scrollTop ?? 0;
    const middles = [...blocks].map((block) => {
      const box = block.getBoundingClientRect();
      return box.top + box.height / 2 + startScroll;
    });
    const placeAt = (y: number) => middles.filter((middle) => middle < y + (scroller?.scrollTop ?? 0)).length;
    let pointerY = event.clientY;
    let frame = 0;
    const show = () => {
      const place = placeAt(pointerY);
      // Just above or below itself, it stays where it is: no line.
      setSectionDrop(place === index || place === index + 1 ? null : place);
    };
    const scroll = () => {
      frame = 0;
      if (!scroller) return;
      const view = scroller.getBoundingClientRect();
      const speed = pointerY < view.top + EDGE_PX ? -SCROLL_PX : pointerY > view.bottom - EDGE_PX ? SCROLL_PX : 0;
      if (speed === 0) return;
      scroller.scrollTop += speed;
      show();
      frame = requestAnimationFrame(scroll);
    };
    trackDrag(event, {
      onMove: (move) => {
        pointerY = move.clientY;
        show();
        if (!frame) frame = requestAnimationFrame(scroll);
      },
      onEnd: (end) => {
        cancelAnimationFrame(frame);
        setSectionDrop(null);
        if (end) edit((s) => moveSectionTo(s, index, placeAt(end.clientY)));
      },
    });
  }

  return (
    <section className="group/section mt-7" aria-label={`${repeat ? 'Repeat of ' : ''}${name || 'Section'}`}>
      <div className="flex flex-wrap items-center gap-x-3">
        <h2 className="flex items-center font-semibold">
          <button
            type="button"
            aria-label="Drag section to another place"
            title="Drag to move"
            // The arrows move a section from the keyboard; the grip is for the mouse and touch only.
            tabIndex={-1}
            className={
              // Hung in the margin, so the heading's bracket stays lined up with the lyrics.
              '-ml-7 w-7 cursor-grab rounded font-sans text-base font-normal text-hint select-none ' +
              'hover:bg-hover hover:text-fg active:cursor-grabbing pointer-coarse:min-h-11'
            }
            onPointerDown={startDrag}
          >
            ⠿
          </button>
          [
          {repeat ? (
            <span>{name}</span>
          ) : (
            <input
              value={name}
              aria-label="Section name"
              spellCheck={false}
              className="border-0 bg-transparent p-0 font-semibold outline-none focus:underline"
              // The box is exactly as wide as the name (monospace), so the closing bracket follows it.
              style={{ width: `${Math.max(name.length, 1)}ch` }}
              onFocus={() => setCaretSection(id ?? null)}
              onChange={(event) => {
                const value = event.target.value;
                edit((s) => renameSection(s, index, value), { merge: `rename:${id}` });
              }}
            />
          )}
          ]{repeat ? <span className="font-normal text-muted">&nbsp;(repeat)</span> : null}
        </h2>
        <span className="flex items-center font-sans text-sm text-muted">
          <SectionButton label="Move section up" disabled={first} onClick={() => edit((s) => moveSection(s, index, -1))}>
            ↑
          </SectionButton>
          <SectionButton label="Move section down" disabled={last} onClick={() => edit((s) => moveSection(s, index, 1))}>
            ↓
          </SectionButton>
          {repeat ? null : (
            <>
              <SectionButton label="Duplicate section" onClick={() => edit((s) => duplicateSection(s, index))}>
                Duplicate
              </SectionButton>
              <SectionButton label="Repeat section at the end" onClick={() => edit((s) => repeatSection(s, index))}>
                Repeat
              </SectionButton>
            </>
          )}
          <SectionButton label="Delete section" onClick={() => edit((s) => deleteSection(s, index))}>
            Delete
          </SectionButton>
        </span>
      </div>
      {lines.map((lineId, line) => (
        <div key={lineId} data-line-id={lineId} className="w-fit">
          <EditorLine section={index} line={line} lineId={lineId} charWidth={charWidth} />
        </div>
      ))}
      {repeat ? null : (
        <button
          type="button"
          className="mt-1 rounded px-1 font-sans text-sm text-muted hover:bg-hover hover:text-fg pointer-coarse:min-h-11"
          onClick={() => editAndFocus((s) => addLine(s, index))}
        >
          + Line
        </button>
      )}
    </section>
  );
});

function SectionButton(props: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className="rounded px-1.5 py-0.5 hover:bg-hover hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent pointer-coarse:min-h-11 pointer-coarse:min-w-11"
    >
      {props.children}
    </button>
  );
}
