import { showChord, type ChordStyle, type Song, type SongLine } from '@groovekeeper/core';
import { useLayoutEffect, useRef, useState } from 'react';
import { useSetting } from '../settings';
import type { SongNote } from '../library/db';
import { topAt } from './notes';

/** The number of letter columns the song's widest line needs, lyrics and chords (written in the chord `style`). */
export const songColumns = (song: Song, style: ChordStyle = 'letters'): number =>
  Math.max(
    1,
    ...song.sections.flatMap((s) => s.lines).map((line) =>
      Math.max(line.text.length, ...line.chords.map((c) => c.position + showChord(c.name, style, song.key).length))),
  );

/**
 * The lyric columns a note reaches to: where it starts plus its longest line, in its smaller letters (0.8 of a
 * lyric's size, and no wider than a lyric letter), and its padding.
 */
export const noteColumns = (note: SongNote): number =>
  note.column + Math.ceil(Math.max(...note.text.split('\n').map((line) => line.length)) * 0.8) + 1;

/**
 * A song to read: each chord sits above the letter it belongs to. Lyrics are monospace, so a chord at
 * position n is placed n letters (n `ch`) from the start of the line. Every size is in `em`, so
 * `fontSize` scales the whole sheet, chords and all. Notes float over the lines they were over in the editor.
 */
export function SongSheet({ song, fontSize, notes = [] }: { song: Song; fontSize: number; notes?: SongNote[] }) {
  const sheet = useRef<HTMLDivElement>(null);
  // Where each note's top is on this sheet, worked out from its lines once they're laid out.
  const [tops, setTops] = useState<number[]>([]);

  useLayoutEffect(() => {
    const box = sheet.current;
    if (!box || notes.length === 0) return;
    const origin = box.getBoundingClientRect().top;
    const lines = [...box.querySelectorAll('[data-sheet-line]')].map((line) => {
      const rect = line.getBoundingClientRect();
      return { top: rect.top - origin, height: rect.height };
    });
    const next = notes.map((note) => topAt(lines, note.printRow));
    // A transposed song is a new song on every render: unchanged tops mustn't render it again.
    setTops((current) => (current.length === next.length && current.every((top, i) => top === next[i]) ? current : next));
  }, [song, notes, fontSize]);

  return (
    <div ref={sheet} className="relative font-mono" style={{ fontSize }}>
      {song.sections.map((section, index) => (
        <section key={index} className="mt-[1.5em] first:mt-0">
          <h2 className="font-semibold">
            [{section.name}]{section.repeat ? <span className="font-normal text-muted"> (repeat)</span> : null}
          </h2>
          {section.lines.map((line, lineIndex) => (
            <SheetLine key={lineIndex} line={line} songKey={song.key} />
          ))}
        </section>
      ))}
      {notes.map((note, i) => (
        // The wrapper keeps the lyrics' font, so `ch` is a lyric letter; `top` waits until the lines are laid out.
        <div
          key={note.id}
          className="absolute"
          style={{ left: `${note.column}ch`, top: tops[i] ?? 0, visibility: tops[i] === undefined ? 'hidden' : undefined }}
        >
          <p className="rounded bg-card/90 px-[0.3em] font-sans text-[0.8em] whitespace-pre text-muted italic">{note.text}</p>
        </div>
      ))}
    </div>
  );
}

function SheetLine({ line, songKey }: { line: SongLine; songKey: string }) {
  const style = useSetting('chords');
  return (
    // A blank line keeps a row of height, as in the editor, so notes find the same line.
    <div data-sheet-line className="mt-[0.3em] min-h-[1.2em]">
      {line.chords.length > 0 ? (
        // The row keeps the lyric's font size, so `ch` here is the width of one lyric letter.
        <div className="relative h-[1.3em]">
          {line.chords.map((chord, index) => (
            <span key={index} className="absolute top-0" style={{ left: `${chord.position}ch` }}>
              <span className="-ml-[0.1em] rounded bg-chip px-[0.1em] text-[0.85em] font-semibold text-chord">
                {showChord(chord.name, style, songKey)}
              </span>
            </span>
          ))}
        </div>
      ) : null}
      {line.text ? <p className="whitespace-pre">{line.text}</p> : null}
    </div>
  );
}
