import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { trackDrag } from './drag';
import type { KeyedLine } from './edit';

interface Props {
  line: KeyedLine;
  /** Width of one lyric letter in pixels, to turn pointer moves into columns. */
  charWidth: number;
  /** The column a palette chord would land in, highlighted while one is dragged over this line. */
  dropColumn: number | null;
  inputRef: (input: HTMLInputElement | null) => void;
  onText: (text: string, caret: number) => void;
  onSplit: (caret: number) => void;
  onJoin: () => void;
  onMoveFocus: (direction: -1 | 1, caret: number) => void;
  onMoveChord: (chordId: string, position: number) => void;
  onRemoveChord: (chordId: string) => void;
}

/**
 * One lyric line with its chord row above. Lyrics are monospace and chords are placed in `ch` units, so a
 * chord at position n sits above the nth letter.
 */
export function EditorLine(props: Props) {
  const { line, charWidth, dropColumn, inputRef } = props;
  // The chord tapped or clicked, which shows its Remove button (the way to remove one on a phone).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // A long press on a phone also fires contextmenu; only a mouse right-click removes a chord.
  const lastPointer = useRef('mouse');
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

  function onChordPointerDown(event: PointerEvent<HTMLButtonElement>, chordId: string, startPosition: number) {
    lastPointer.current = event.pointerType;
    const startX = event.clientX;
    trackDrag(event, {
      onStart: () => {
        setSelectedId(null);
        setDraggingId(chordId);
      },
      onMove: (move) => {
        if (charWidth <= 0) return;
        props.onMoveChord(chordId, Math.max(0, startPosition + Math.round((move.clientX - startX) / charWidth)));
      },
      onEnd: () => setDraggingId(null),
      onTap: () => setSelectedId((selected) => (selected === chordId ? null : chordId)),
    });
  }

  const remove = (chordId: string) => {
    setSelectedId(null);
    props.onRemoveChord(chordId);
  };

  return (
    <div className="mt-1" style={{ minWidth: `${width}ch` }}>
      <div className="relative h-6">
        {dropColumn !== null ? (
          <span
            className="absolute top-0 h-6 rounded-sm bg-accent/25"
            style={{ left: `${dropColumn}ch`, width: '1ch' }}
            aria-hidden="true"
          />
        ) : null}
        {line.chords.map((chord) => (
          // The wrapper keeps the lyric's font size, so its `ch` is one lyric letter; the chord is smaller.
          <span key={chord.id} className="absolute top-0" style={{ left: `${chord.position}ch` }}>
            <button
              type="button"
              title="Drag to move, right-click to remove"
              aria-pressed={selectedId === chord.id}
              className={
                // On touch screens the invisible ::before makes the chord easier to hit than its small label.
                '-ml-0.5 relative cursor-grab rounded bg-chip px-0.5 text-sm font-semibold text-chord select-none ' +
                '[-webkit-touch-callout:none] active:cursor-grabbing aria-pressed:ring-2 aria-pressed:ring-accent ' +
                "pointer-coarse:before:absolute pointer-coarse:before:-inset-x-1.5 pointer-coarse:before:-inset-y-2 pointer-coarse:before:content-[''] " +
                (draggingId === chord.id ? 'ring-2 ring-accent' : '')
              }
              onPointerDown={(event) => onChordPointerDown(event, chord.id, chord.position)}
              onContextMenu={(event) => {
                event.preventDefault();
                if (lastPointer.current === 'mouse') remove(chord.id);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Delete' || event.key === 'Backspace') remove(chord.id);
                if (event.key === 'Escape') setSelectedId(null);
              }}
            >
              {chord.name}
            </button>
            {selectedId === chord.id ? (
              // Floats above the chord, like a phone's Copy/Paste bubble, so it covers no other chord on the line.
              <button
                type="button"
                className={
                  'absolute bottom-full left-0 z-10 mb-1 rounded bg-accent-fill px-1.5 font-sans text-sm font-semibold text-on-accent shadow-lg pointer-coarse:px-3 ' +
                  "pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:-top-5 pointer-coarse:before:bottom-0 pointer-coarse:before:content-['']"
                }
                onClick={() => remove(chord.id)}
              >
                Remove
              </button>
            ) : null}
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
        onFocus={() => setSelectedId(null)}
        onChange={(event) => props.onText(event.target.value, event.target.selectionStart ?? event.target.value.length)}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
