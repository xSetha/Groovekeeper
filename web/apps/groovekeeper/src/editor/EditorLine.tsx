import {
  memo, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type MouseEvent, type PointerEvent,
} from 'react';
import { romanNumeral } from '@groovekeeper/core';
import { trackDrag } from '../components/drag';
import {
  editText, joinWithPrevious, moveChord, neighbourLine, partInRange, pasteLines, removeChord, setChord, splitLine,
} from './edit';
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
  const focus = useEditor((s) => (s.focus?.lineId === lineId ? s.focus : null));
  // The key to show chords as Roman numerals in, or '' to show their names.
  const numeralKey = useEditor((s) => (s.numerals ? s.song.key : ''));
  // This line's part of a selection across lines, as "from-to" ("from-" to the end of the line), or ''.
  const selected = useEditor((s) => {
    const part = s.selection && partInRange(s.song, s.selection, lineId);
    return part ? `${part.from}-${part.to ?? ''}` : '';
  });
  const input = useRef<HTMLInputElement>(null);
  // The chord tapped or clicked, which shows its Change and Remove buttons (the way to do those on a touch screen).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // A long press on a phone also fires contextmenu; only a mouse right-click removes a chord.
  const lastPointer = useRef('mouse');
  // The column under the mouse on the chord row, highlighted to show where a click types a chord.
  const [hoverColumn, setHoverColumn] = useState<number | null>(null);
  // The chord box, while a chord is being typed: its column, what's typed, and whether it was refused.
  const [typing, setTyping] = useState<{ column: number; name: string; refused: boolean } | null>(null);
  // Whether the box is open, read when it loses focus: closing it (Enter, Esc) also takes its focus away.
  const boxOpen = useRef(false);

  useLayoutEffect(() => {
    if (!focus) return;
    input.current?.focus();
    input.current?.setSelectionRange(focus.caret, focus.caret);
  }, [focus]);

  if (!line) return null;
  const { edit, editAndFocus } = store.getState();
  const shown = (name: string) => (numeralKey ? (romanNumeral(name, numeralKey) ?? name) : name);
  // Wide enough for the lyrics, the chords past their end, and room to type.
  const width = Math.max(
    line.text.length + 2,
    ...line.chords.map((c) => c.position + shown(c.name).length + 1),
    typing ? typing.column + typing.name.length + 14 : 0, // room for the box and "Not a chord"
  );

  /** The caret is in this line's section now, so + Section adds the new one after it. */
  const caretHere = () => {
    const state = store.getState();
    state.setCaretSection(state.song.sections[section]?.id ?? null);
  };

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
    caretHere();
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

  /** The column of the chord row under the pointer. */
  function columnAt(event: PointerEvent<HTMLElement> | MouseEvent<HTMLElement>) {
    if (charWidth <= 0) return 0;
    return Math.max(0, Math.floor((event.clientX - event.currentTarget.getBoundingClientRect().left) / charWidth));
  }

  function openBox(column: number, name: string) {
    setSelectedId(null);
    setHoverColumn(null);
    boxOpen.current = true;
    setTyping({ column, name, refused: false });
  }

  function closeBox() {
    boxOpen.current = false;
    setTyping(null);
  }

  /** Places the typed chord (an empty box removes the chord); false, showing why, if it isn't a chord. */
  function commitBox(): boolean {
    if (!typing) return true;
    if (setChord(store.getState().song, at, typing.column, typing.name) === null) {
      setTyping({ ...typing, refused: true });
      return false;
    }
    edit((s) => setChord(s, at, typing.column, typing.name) ?? s);
    closeBox();
    return true;
  }

  function onBoxKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!typing || (event.key !== 'Enter' && event.key !== 'Escape')) return;
    event.preventDefault();
    if (event.key === 'Escape') closeBox();
    else if (!commitBox()) return;
    // Back to the lyrics, under the chord.
    store.getState().setFocus({ lineId, caret: typing.column });
  }

  const remove = (chordId: string) => {
    setSelectedId(null);
    edit((s) => removeChord(s, at, chordId));
  };

  const [selectedFrom = 0, selectedTo] = selected ? selected.split('-').map((n) => (n === '' ? undefined : Number(n))) : [];

  return (
    <div className="relative mt-1" style={{ minWidth: `${width}ch` }}>
      {selected ? (
        // The chords above the selected lyrics go with them.
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 bg-accent/25"
          style={{
            left: `${selectedFrom}ch`,
            ...(selectedTo === undefined ? { right: 0 } : { width: `${Math.max(selectedTo - selectedFrom, 0)}ch` }),
          }}
        />
      ) : null}
      {/* The chord row: a click types a chord above the letter under it. */}
      <div
        data-testid="chord-row"
        className="relative h-6 cursor-text"
        onPointerMove={(event) => {
          if (event.pointerType === 'mouse' && !typing) setHoverColumn(event.target === event.currentTarget ? columnAt(event) : null);
        }}
        onPointerLeave={() => setHoverColumn(null)}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return; // a chord or the box itself
          const column = columnAt(event);
          // A click here doesn't take the focus from a box open on this line, so finish that chord first.
          if (boxOpen.current && !commitBox()) closeBox();
          openBox(column, line.chords.find((c) => c.position === column)?.name ?? '');
        }}
      >
        {hoverColumn !== null ? (
          <span
            className="pointer-events-none absolute top-0 h-6 rounded-sm bg-accent/25"
            style={{ left: `${hoverColumn}ch`, width: '1ch' }}
            aria-hidden="true"
          />
        ) : null}
        {typing ? (
          <span className="absolute top-0 z-10 flex items-center gap-2" style={{ left: `${typing.column}ch` }}>
            <input
              autoFocus
              value={typing.name}
              aria-label="Chord"
              aria-invalid={typing.refused}
              aria-describedby={typing.refused ? `${lineId}-refused` : undefined}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              // The box grows with the chord, in its own (smaller) letters.
              style={{ width: `${Math.max(typing.name.length, 2) + 1}ch` }}
              className={
                '-ml-0.5 rounded bg-chip px-0.5 text-sm font-semibold text-chord outline-none ring-1 ring-accent ' +
                'aria-invalid:ring-2 aria-invalid:ring-chord pointer-coarse:text-base'
              }
              onFocus={caretHere}
              onChange={(event) => setTyping({ ...typing, name: event.target.value, refused: false })}
              onKeyDown={onBoxKeyDown}
              // Clicking away keeps a chord, and drops anything else.
              onBlur={() => boxOpen.current && !commitBox() && closeBox()}
            />
            {typing.refused ? (
              <span id={`${lineId}-refused`} role="alert" className="font-sans text-xs whitespace-nowrap text-chord">
                Not a chord
              </span>
            ) : null}
          </span>
        ) : null}
        {line.chords.map((chord) => (
          // The wrapper keeps the lyric's font size, so its `ch` is one lyric letter; the chord is smaller.
          <span
            key={chord.id}
            className={`absolute top-0 ${typing?.column === chord.position ? 'invisible' : ''}`}
            style={{ left: `${chord.position}ch` }}
          >
            <button
              type="button"
              title="Drag to move, double-click to change, right-click to remove"
              aria-pressed={selectedId === chord.id}
              className={
                // On touch screens the invisible ::before makes the chord easier to hit than its small label.
                '-ml-0.5 relative cursor-grab rounded bg-chip px-0.5 text-sm font-semibold text-chord select-none ' +
                '[-webkit-touch-callout:none] active:cursor-grabbing aria-pressed:ring-2 aria-pressed:ring-accent ' +
                "pointer-coarse:before:absolute pointer-coarse:before:-inset-x-1.5 pointer-coarse:before:-inset-y-2 pointer-coarse:before:content-[''] " +
                (draggingId === chord.id ? 'ring-2 ring-accent' : '')
              }
              onPointerDown={(event) => onChordPointerDown(event, chord.id, chord.position)}
              onDoubleClick={() => openBox(chord.position, chord.name)}
              onContextMenu={(event) => {
                event.preventDefault();
                if (lastPointer.current === 'mouse') remove(chord.id);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Delete' || event.key === 'Backspace') remove(chord.id);
                if (event.key === 'Enter' || event.key === 'F2') {
                  event.preventDefault();
                  openBox(chord.position, chord.name);
                }
                if (event.key === 'Escape') setSelectedId(null);
              }}
            >
              {shown(chord.name)}
            </button>
            {selectedId === chord.id ? (
              // Floats above the chord, like a phone's Copy/Paste bubble, so it covers no other chord on the line.
              <span className="absolute bottom-full left-0 z-10 mb-1 flex gap-1">
                <BubbleButton onClick={() => openBox(chord.position, chord.name)}>Change</BubbleButton>
                <BubbleButton onClick={() => remove(chord.id)}>Remove</BubbleButton>
              </span>
            ) : null}
          </span>
        ))}
      </div>
      <input
        ref={input}
        value={line.text}
        aria-label="Lyrics"
        // Where a selection across lines starts (select-lines.ts).
        data-lyrics
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        // Positioned, so it's drawn over the selection's highlight.
        className="relative block border-0 bg-transparent p-0 outline-none"
        style={{ width: `${width}ch` }}
        onFocus={() => {
          setSelectedId(null);
          caretHere();
        }}
        onChange={(event) => onText(event.target.value, event.target.selectionStart ?? event.target.value.length)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
      />
    </div>
  );
});

function BubbleButton(props: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      className={
        'relative rounded bg-accent-fill px-1.5 font-sans text-sm font-semibold text-on-accent shadow-lg pointer-coarse:px-3 ' +
        "pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:-top-5 pointer-coarse:before:bottom-0 pointer-coarse:before:content-['']"
      }
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}
