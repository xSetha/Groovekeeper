import type { SongLine } from '@groovekeeper/core';
import { useRef, type KeyboardEvent, type PointerEvent } from 'react';

// How far the pointer must move before pressing a chord becomes dragging it.
const DRAG_THRESHOLD = 3;

interface Props {
  line: SongLine;
  /** Width of one lyric letter in pixels, to turn pointer moves into columns. */
  charWidth: number;
  /** The column a palette chord would land in, highlighted while one is dragged over this line. */
  dropColumn: number | null;
  inputRef: (input: HTMLInputElement | null) => void;
  onText: (text: string, caret: number) => void;
  onSplit: (caret: number) => void;
  onJoin: () => void;
  onMoveFocus: (direction: -1 | 1, caret: number) => void;
  onMoveChord: (index: number, position: number) => void;
  onRemoveChord: (index: number) => void;
}

/**
 * One lyric line with its chord row above. Lyrics are monospace and chords are placed in `ch` units, so a
 * chord at position n sits above the nth letter.
 */
export function EditorLine(props: Props) {
  const { line, charWidth, dropColumn, inputRef } = props;
  const drag = useRef<{ index: number; startX: number; startPosition: number; moved: boolean } | null>(null);
  // Wide enough for the lyrics, the chords past their end, and room to type.
  const width = Math.max(line.text.length + 2, ...line.chords.map((c) => c.position + c.name.length + 1));

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? start;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (end > start) props.onText(input.value.slice(0, start) + input.value.slice(end), start);
      props.onSplit(start);
    } else if (event.key === 'Backspace' && start === 0 && end === 0) {
      event.preventDefault();
      props.onJoin();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      props.onMoveFocus(event.key === 'ArrowUp' ? -1 : 1, start);
    }
  }

  function onChordPointerDown(event: PointerEvent<HTMLButtonElement>, index: number) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { index, startX: event.clientX, startPosition: line.chords[index]!.position, moved: false };
  }

  function onChordPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || charWidth <= 0) return;
    const dx = event.clientX - current.startX;
    if (!current.moved && Math.abs(dx) < DRAG_THRESHOLD) return;
    current.moved = true;
    const position = Math.max(0, current.startPosition + Math.round(dx / charWidth));
    if (position !== line.chords[current.index]?.position) props.onMoveChord(current.index, position);
  }

  return (
    <div className="mt-1" style={{ minWidth: `${width}ch` }}>
      <div className="relative h-6">
        {dropColumn !== null && (
          <span
            className="absolute top-0 h-6 rounded-sm bg-accent/25"
            style={{ left: `${dropColumn}ch`, width: '1ch' }}
            aria-hidden="true"
          />
        )}
        {line.chords.map((chord, index) => (
          // The wrapper keeps the lyric's font size, so its `ch` is one lyric letter; the chord is smaller.
          <span key={index} className="absolute top-0" style={{ left: `${chord.position}ch` }}>
            <button
              type="button"
              title="Drag to move · Right-click or Delete to remove"
              className="-ml-0.5 cursor-grab touch-none rounded bg-chip px-0.5 text-sm font-semibold text-chord active:cursor-grabbing"
              onPointerDown={(event) => onChordPointerDown(event, index)}
              onPointerMove={onChordPointerMove}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
              onContextMenu={(event) => {
                event.preventDefault();
                props.onRemoveChord(index);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Delete' || event.key === 'Backspace') props.onRemoveChord(index);
              }}
            >
              {chord.name}
            </button>
          </span>
        ))}
      </div>
      <input
        ref={inputRef}
        value={line.text}
        aria-label="Lyrics"
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        className="block border-0 bg-transparent p-0 outline-none"
        style={{ width: `${width}ch` }}
        onChange={(event) => props.onText(event.target.value, event.target.selectionStart ?? event.target.value.length)}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
