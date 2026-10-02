import { memo, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { romanNumeral } from '@groovekeeper/core';
import { trackDrag } from './drag';
import { editText, joinWithPrevious, moveChord, neighbourLine, pasteLines, removeChord, splitLine } from './edit';
import { useEditor, useEditorStore } from './store';

interface Props {
  section: number;
  line: number;
  lineId: string;
  /** Width of one lyric letter in pixels, to turn pointer moves into columns. */
  charWidth: number;
}

/**
 * One lyric line with its chord row above. Lyrics are monospace and chords are placed in `ch` units, so a
 * chord at position n sits above the nth letter. It reads only its own line from the store, so typing in
 * it doesn't re-render the rest of the song.
 */
export const EditorLine = memo(function EditorLine({ section, line: lineIndex, lineId, charWidth }: Props) {
  const store = useEditorStore();
  const at = { section, line: lineIndex };
  const line = useEditor((s) => s.song.sections[section]?.lines[lineIndex]);
  const dropColumn = useEditor((s) => (s.drop?.lineId === lineId ? s.drop.column : null));
  const focus = useEditor((s) => (s.focus?.lineId === lineId ? s.focus : null));
  // The key to show chords as Roman numerals in, or '' to show their names.
  const numeralKey = useEditor((s) => (s.numerals ? s.song.key : ''));
  const input = useRef<HTMLInputElement>(null);
  // The chord tapped or clicked, which shows its Remove button (the way to remove one on a phone).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // A long press on a phone also fires contextmenu; only a mouse right-click removes a chord.
  const lastPointer = useRef('mouse');

  useLayoutEffect(() => {
    if (!focus) return;
    input.current?.focus();
    input.current?.setSelectionRange(focus.caret, focus.caret);
  }, [focus]);

  if (!line) return null;
  const { edit, editAndFocus } = store.getState();
  const shown = (name: string) => (numeralKey ? (romanNumeral(name, numeralKey) ?? name) : name);
  // Wide enough for the lyrics, the chords past their end, and room to type.
  const width = Math.max(line.text.length + 2, ...line.chords.map((c) => c.position + shown(c.name).length + 1));

  function onText(text: string, caret: number) {
    // Typing in one line is one undo step per word: a space ends the step.
    const typedSpace = text.length > (line?.text.length ?? 0) && /\s$/.test(text.slice(0, caret));
    edit((s) => editText(s, at, text, caret), { merge: `type:${lineId}`, endStep: typedSpace });
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData('text/plain');
    if (!text.includes('\n')) return; // one line: the text box pastes it as usual
    event.preventDefault();
    const box = event.currentTarget;
    const start = box.selectionStart ?? 0;
    const end = box.selectionEnd ?? start;
    if (end > start) onText(box.value.slice(0, start) + box.value.slice(end), start);
    editAndFocus((s) => pasteLines(s, at, start, text));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? start;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (end > start) onText(input.value.slice(0, start) + input.value.slice(end), start);
      editAndFocus((s) => splitLine(s, at, start));
    } else if (event.key === 'Backspace' && start === 0 && end === 0) {
      event.preventDefault();
      editAndFocus((s) => joinWithPrevious(s, at));
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const target = neighbourLine(store.getState().song, lineId, event.key === 'ArrowUp' ? -1 : 1);
      if (target) store.getState().setFocus({ lineId: target, caret: start });
    }
  }

  function onChordPointerDown(event: PointerEvent<HTMLButtonElement>, chordId: string, startPosition: number) {
    lastPointer.current = event.pointerType;
    const startX = event.clientX;
    // One drag is one undo step, however many columns it moves.
    const step = `drag:${chordId}:${event.timeStamp}`;
    trackDrag(event, {
      onStart: () => {
        setSelectedId(null);
        setDraggingId(chordId);
      },
      onMove: (move) => {
        if (charWidth <= 0) return;
        const position = Math.max(0, startPosition + Math.round((move.clientX - startX) / charWidth));
        edit((s) => moveChord(s, at, chordId, position), { merge: step });
      },
      onEnd: () => setDraggingId(null),
      onTap: () => setSelectedId((selected) => (selected === chordId ? null : chordId)),
    });
  }

  const remove = (chordId: string) => {
    setSelectedId(null);
    edit((s) => removeChord(s, at, chordId));
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
              {shown(chord.name)}
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
        ref={input}
        value={line.text}
        aria-label="Lyrics"
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        className="block border-0 bg-transparent p-0 outline-none"
        style={{ width: `${width}ch` }}
        onFocus={() => setSelectedId(null)}
        onChange={(event) => onText(event.target.value, event.target.selectionStart ?? event.target.value.length)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
      />
    </div>
  );
});
