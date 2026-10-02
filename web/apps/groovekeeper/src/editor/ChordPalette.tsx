import { diatonicChords, type Song } from '@groovekeeper/core';
import type { PointerEvent } from 'react';
import { chordsInSong } from './edit';

// Offered when the song has no key and no chords yet.
const STARTER_CHORDS = ['C', 'G', 'D', 'A', 'E', 'F', 'Am', 'Em', 'Dm'];

interface Props {
  song: Song;
  onStartDrag: (name: string, event: PointerEvent<HTMLButtonElement>) => void;
  className?: string;
}

/** Chords to drag onto the lyrics: those of the song's key and those already in the song. */
export function ChordPalette({ song, onStartDrag, className = '' }: Props) {
  const inKey = diatonicChords(song.key);
  const inSong = chordsInSong(song);
  const groups = [
    { title: `In ${song.key}`, chords: inKey },
    { title: 'In this song', chords: inSong },
    { title: 'Chords', chords: inKey.length === 0 && inSong.length === 0 ? STARTER_CHORDS : [] },
  ].filter((group) => group.chords.length > 0);

  return (
    <aside aria-label="Chords" className={className}>
      <h2 className="font-semibold">Chords</h2>
      <p className="mt-1 text-xs text-muted">
        Drag a chord above a letter. Drop it on a chord to replace that chord. On a touch screen, hold the chord
        for a moment, then drag.
      </p>
      {groups.map((group) => (
        <section key={group.title} className="mt-4">
          <h3 className="text-sm font-semibold">{group.title}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {group.chords.map((name) => (
              <button
                key={name}
                type="button"
                className="cursor-grab rounded bg-chip px-2 py-1 font-mono text-sm font-semibold text-chord select-none [-webkit-touch-callout:none] hover:brightness-125 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                onPointerDown={(event) => onStartDrag(name, event)}
              >
                {name}
              </button>
            ))}
          </div>
        </section>
      ))}
    </aside>
  );
}
