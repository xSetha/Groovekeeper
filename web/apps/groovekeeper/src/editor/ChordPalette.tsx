import {
  diatonicChords, PALETTE_QUALITIES, PALETTE_ROOTS, romanNumeral, rootOf, suggestNext,
} from '@groovekeeper/core';
import { useState, type PointerEvent } from 'react';
import { allChords, chordsInSong } from './edit';
import { useEditor } from './store';

interface Props {
  onStartDrag: (name: string, event: PointerEvent<HTMLButtonElement>) => void;
  className?: string;
}

/**
 * Chords to drag onto the lyrics: what usually comes next, the chords of the song's key, those already in
 * the song, and every chord type on any root, with or without a bass note. Each shows its Roman numeral
 * when the song has a key.
 */
export function ChordPalette({ onStartDrag, className = '' }: Props) {
  const key = useEditor((s) => s.song.key);
  // Joined into strings so typing lyrics (which leaves the chords as they are) doesn't re-render the palette.
  const inSong = useEditor((s) => chordsInSong(s.song).join(' '));
  const lastChord = useEditor((s) => s.lastPlaced ?? allChords(s.song).at(-1) ?? '');
  const [root, setRoot] = useState<string | null>(null);
  const [bass, setBass] = useState<string | null>(null);

  const shownRoot = root ?? rootOf(key) ?? 'C';
  const slash = bass && bass !== shownRoot ? `/${bass}` : '';
  const groups = [
    { title: `After ${lastChord}`, chords: suggestNext(lastChord, key) },
    { title: `In ${key}`, chords: diatonicChords(key) },
    { title: 'In this song', chords: inSong ? inSong.split(' ') : [] },
  ].filter((group) => group.chords.length > 0);

  const chip = (name: string) => <ChordChip key={name} name={name} songKey={key} onStartDrag={onStartDrag} />;

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
          <div className="mt-2 flex flex-wrap gap-1.5">{group.chords.map(chip)}</div>
        </section>
      ))}

      <section className="mt-4">
        <h3 className="text-sm font-semibold">All chords</h3>
        <Picker label="Root" options={PALETTE_ROOTS} value={shownRoot} onPick={setRoot} />
        <p className="mt-3 text-xs text-muted">Bass note, for slash chords</p>
        <Picker label="Bass note" options={['None', ...PALETTE_ROOTS]} value={bass ?? 'None'} onPick={(b) => setBass(b === 'None' ? null : b)} />
        <div className="mt-3 flex flex-wrap gap-1.5">{PALETTE_QUALITIES.map((quality) => chip(shownRoot + quality + slash))}</div>
      </section>
    </aside>
  );
}

function ChordChip(props: { name: string; songKey: string; onStartDrag: Props['onStartDrag'] }) {
  const numeral = romanNumeral(props.name, props.songKey);
  return (
    <button
      type="button"
      className="flex cursor-grab flex-col items-center rounded bg-chip px-2 py-1 leading-tight select-none [-webkit-touch-callout:none] hover:brightness-125 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
      onPointerDown={(event) => props.onStartDrag(props.name, event)}
    >
      <span className="font-mono text-sm font-semibold text-chord">{props.name}</span>
      {numeral ? <span className="font-mono text-[0.7rem] text-muted">{numeral}</span> : null}
    </button>
  );
}

/** A row of choices, one picked (the root, or the bass note). */
function Picker(props: { label: string; options: readonly string[]; value: string; onPick: (option: string) => void }) {
  return (
    <div role="group" aria-label={props.label} className="mt-2 flex flex-wrap gap-1">
      {props.options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === props.value}
          className="min-w-8 rounded px-1.5 py-0.5 text-sm hover:bg-hover aria-pressed:bg-accent-fill aria-pressed:text-on-accent pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          onClick={() => props.onPick(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
