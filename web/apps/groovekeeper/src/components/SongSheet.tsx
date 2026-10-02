import type { Song, SongLine } from '@groovekeeper/core';

/** The number of letter columns the song's widest line needs, lyrics and chords. */
export const songColumns = (song: Song): number =>
  Math.max(
    1,
    ...song.sections.flatMap((s) => s.lines).map((line) =>
      Math.max(line.text.length, ...line.chords.map((c) => c.position + c.name.length))),
  );

/**
 * A song to read: each chord sits above the letter it belongs to. Lyrics are monospace, so a chord at
 * position n is placed n letters (n `ch`) from the start of the line. Every size is in `em`, so
 * `fontSize` scales the whole sheet, chords and all.
 */
export function SongSheet({ song, fontSize }: { song: Song; fontSize: number }) {
  return (
    <div className="font-mono" style={{ fontSize }}>
      {song.sections.map((section, index) => (
        <section key={index} className="mt-[1.5em] first:mt-0">
          <h2 className="font-semibold">
            [{section.name}]{section.repeat ? <span className="font-normal text-muted"> (repeat)</span> : null}
          </h2>
          {section.lines.map((line, lineIndex) => (
            <SheetLine key={lineIndex} line={line} />
          ))}
        </section>
      ))}
    </div>
  );
}

function SheetLine({ line }: { line: SongLine }) {
  return (
    <div className="mt-[0.3em]">
      {line.chords.length > 0 ? (
        // The row keeps the lyric's font size, so `ch` here is the width of one lyric letter.
        <div className="relative h-[1.3em]">
          {line.chords.map((chord, index) => (
            <span key={index} className="absolute top-0" style={{ left: `${chord.position}ch` }}>
              <span className="-ml-[0.1em] rounded bg-chip px-[0.1em] text-[0.85em] font-semibold text-chord">
                {chord.name}
              </span>
            </span>
          ))}
        </div>
      ) : null}
      {line.text ? <p className="whitespace-pre">{line.text}</p> : null}
    </div>
  );
}
