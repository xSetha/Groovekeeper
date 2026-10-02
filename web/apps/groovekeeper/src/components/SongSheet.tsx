import { displayTitle, type Song, type SongLine } from '@groovekeeper/core';

/**
 * A song as a chord sheet: each chord sits above the letter it belongs to. Lyrics are monospace, so a
 * chord at position n is placed n characters (1ch each) from the start of the line.
 */
export function SongSheet({ song }: { song: Song }) {
  return (
    <article>
      <h1 className="text-3xl font-semibold">{displayTitle(song)}</h1>
      {song.artist && <p className="mt-1 text-lg text-muted">{song.artist}</p>}
      <div className="font-mono text-lg">
        {song.sections.map((section, index) => (
          <section key={index} className="mt-7">
            <h2 className="font-semibold">
              [{section.name}]{section.repeat && <span className="font-normal text-muted"> (repeat)</span>}
            </h2>
            {section.lines.map((line, lineIndex) => (
              <SheetLine key={lineIndex} line={line} />
            ))}
          </section>
        ))}
      </div>
    </article>
  );
}

function SheetLine({ line }: { line: SongLine }) {
  return (
    <div className="mt-1">
      {line.chords.length > 0 && (
        // The row keeps the lyric's font size, so `ch` here is the width of one lyric letter.
        <div className="relative h-6">
          {line.chords.map((chord, index) => (
            <span key={index} className="absolute top-0" style={{ left: `${chord.position}ch` }}>
              <span className="-ml-0.5 rounded bg-chip px-0.5 text-sm font-semibold text-chord">{chord.name}</span>
            </span>
          ))}
        </div>
      )}
      {line.text && <p className="whitespace-pre">{line.text}</p>}
    </div>
  );
}
