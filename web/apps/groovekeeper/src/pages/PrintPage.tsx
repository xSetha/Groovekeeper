import {
  chordLine, displayTitle, keyChangeNote, parseKey, parseSongText, printedLines, repeatedSections, romanNumeral,
  UNTITLED_TITLE, type Song, type SongLine,
} from '@groovekeeper/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { db, type LibrarySong } from '../library/db';
import { listSongs } from '../library/library';
import { setlistSongs, songToPlay } from '../library/setlists';

/** A song as it's printed: `semitones` is how far a setlist moved it from its own key. */
interface PrintedSong {
  id: string;
  song: Song;
  semitones: number;
}

interface Options {
  collapseRepeats: boolean;
  numerals: boolean;
}

/**
 * Printing through the browser, whose print dialog also saves a PDF. Prints one song (`?song=id`), a setlist
 * with each song in its setlist key (`?setlist=id`), or songs ticked from the library as a songbook.
 */
export default function PrintPage() {
  const [params] = useSearchParams();
  const songId = params.get('song');
  const setlistId = params.get('setlist');
  const [options, setOptions] = useState<Options>({ collapseRepeats: true, numerals: false });

  const optionBoxes = (
    <fieldset className="mt-6 flex flex-col gap-2">
      <legend className="font-semibold">Options</legend>
      <CheckBox
        checked={options.collapseRepeats}
        onChange={(collapseRepeats) => setOptions({ ...options, collapseRepeats })}
        hint="A section exactly the same as an earlier one, name, chords and lyrics, is printed as [Chorus] (repeat)."
      >
        Collapse repeated sections
      </CheckBox>
      <CheckBox checked={options.numerals} onChange={(numerals) => setOptions({ ...options, numerals })} hint="In each song's key; songs without a key keep their chord names.">
        Chords as Roman numerals
      </CheckBox>
    </fieldset>
  );

  if (songId !== null) return <PrintOneSong id={songId} options={options}>{optionBoxes}</PrintOneSong>;
  if (setlistId !== null) return <PrintSetlist id={setlistId} options={options}>{optionBoxes}</PrintSetlist>;
  return <PrintSongbook options={options}>{optionBoxes}</PrintSongbook>;
}

interface ModeProps {
  options: Options;
  /** The option boxes, shown in the side panel. */
  children: ReactNode;
}

function PrintOneSong({ id, options, children }: ModeProps & { id: string }) {
  // null while loading, undefined when there's no such song
  const stored = useLiveQuery(() => db.songs.get(id), [id], null);
  if (stored === null) return null;
  const song = stored && parseSongText(stored.text);
  return (
    <PrintLayout
      title={song ? displayTitle(song) : 'Print'}
      back={{ to: `/songs/${id}`, label: song ? displayTitle(song) : 'Back to the song' }}
      songs={song ? [{ id, song, semitones: 0 }] : []}
      empty="This song isn't in your library."
      options={options}
    >
      {children}
    </PrintLayout>
  );
}

function PrintSetlist({ id, options, children }: ModeProps & { id: string }) {
  // null while loading, undefined when there's no such setlist
  const loaded = useLiveQuery(
    async () => {
      const setlist = await db.setlists.get(id);
      return setlist ? { name: setlist.name, songs: await setlistSongs(setlist) } : undefined;
    },
    [id],
    null,
  );
  if (loaded === null) return null;
  return (
    <PrintLayout
      title={loaded?.name ?? 'Print'}
      back={{ to: `/setlists/${id}`, label: loaded?.name ?? 'Setlists' }}
      songs={loaded?.songs.map((s) => ({ id: s.entry.id, song: songToPlay(s), semitones: s.semitones })) ?? []}
      empty={loaded ? 'No songs in this setlist yet.' : "This setlist isn't in your library."}
      intro={loaded ? 'Each song is printed in its key for the setlist.' : undefined}
      options={options}
    >
      {children}
    </PrintLayout>
  );
}

/** Songs ticked from the library, printed in library order. */
function PrintSongbook({ options, children }: ModeProps) {
  const library = useLiveQuery(listSongs, []);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const toPrint = library?.filter((song) => ticked.has(song.id)) ?? [];

  const tick = (song: LibrarySong, on: boolean) => {
    const next = new Set(ticked);
    if (on) next.add(song.id);
    else next.delete(song.id);
    setTicked(next);
  };

  return (
    <PrintLayout
      title="Songbook"
      back={{ to: '/', label: 'Library' }}
      songs={toPrint.map((stored) => ({ id: stored.id, song: parseSongText(stored.text), semitones: 0 }))}
      empty={library?.length === 0 ? 'The library is empty. Write or import songs first.' : 'Tick the songs to print.'}
      intro="Tick the songs to print, one after another in title order. To print them in another order, make a setlist."
      options={options}
    >
      {library && library.length > 0 ? (
        <fieldset className="mt-6 flex min-h-0 flex-col">
          <legend className="font-semibold">Songs</legend>
          <span className="mt-1 flex gap-1 text-sm">
            <button type="button" className="rounded px-2 py-1 hover:bg-hover pointer-coarse:min-h-11" onClick={() => setTicked(new Set(library.map((s) => s.id)))}>
              Tick all
            </button>
            <button type="button" className="rounded px-2 py-1 hover:bg-hover pointer-coarse:min-h-11" onClick={() => setTicked(new Set())}>
              Untick all
            </button>
          </span>
          <ul className="mt-1 max-h-80 overflow-y-auto">
            {library.map((song) => (
              <li key={song.id}>
                <CheckBox checked={ticked.has(song.id)} onChange={(on) => tick(song, on)}>
                  <span className="font-semibold">{song.title || UNTITLED_TITLE}</span>
                  {song.artist ? <span className="text-muted"> {song.artist}</span> : null}
                </CheckBox>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}
      {children}
    </PrintLayout>
  );
}

interface LayoutProps {
  /** The page's title, which the browser also suggests as the PDF's file name. */
  title: string;
  back: { to: string; label: string };
  songs: PrintedSong[];
  /** Shown instead of the preview when there's nothing to print. */
  empty: string;
  intro?: string;
  options: Options;
  /** The side panel's choices: songs to tick and the options. */
  children: ReactNode;
}

/** The choices on the side and the pages as they'll print; only the pages are printed. */
function PrintLayout({ title, back, songs, empty, intro, options, children }: LayoutProps) {
  useEffect(() => {
    document.title = title;
    return () => {
      document.title = 'Groovekeeper';
    };
  }, [title]);

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row print:block">
      <aside className="flex shrink-0 flex-col border-line p-4 max-md:border-b md:w-80 md:overflow-y-auto md:border-r print:hidden">
        <Link to={back.to} className="text-sm text-muted hover:text-fg">
          ← {back.label}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Print</h1>
        {intro ? <p className="mt-1 text-sm text-muted">{intro}</p> : null}
        {children}
        <button
          type="button"
          disabled={songs.length === 0}
          className="mt-6 self-start rounded bg-accent-fill px-5 py-2.5 font-semibold text-on-accent hover:brightness-125 disabled:opacity-40 disabled:hover:brightness-100 pointer-coarse:min-h-11"
          onClick={() => window.print()}
        >
          Print…
        </button>
        <p className="mt-2 text-sm text-muted">To make a PDF, choose Save as PDF as the printer.</p>
      </aside>

      <main aria-label="Pages to print" className="min-h-0 flex-1 overflow-y-auto bg-window p-4 sm:p-8 print:overflow-visible print:p-0">
        {songs.length === 0 ? <p className="text-muted print:hidden">{empty}</p> : null}
        {songs.length > 0 ? (
          // The paper, in the Songbook theme's ink whatever the app's theme.
          <div
            data-theme="songbook"
            className="mx-auto max-w-[21cm] bg-card px-[2cm] py-[1.5cm] text-fg shadow-xl max-sm:px-6 print:max-w-none print:p-0 print:shadow-none"
          >
            {songs.map(({ id, song, semitones }) => (
              <PrintedSong key={id} song={song} semitones={semitones} options={options} />
            ))}
          </div>
        ) : null}
      </main>
    </div>
  );
}

/**
 * One song, following the one before it under a thin line, as in the desktop's PDF. Sizes are in points, like
 * a printed page, and chord rows are written as text above their lyric, as in a .txt file.
 */
function PrintedSong({ song, semitones, options }: { song: Song; semitones: number; options: Options }) {
  const repeated = options.collapseRepeats ? repeatedSections(song) : new Set<number>();
  const display = options.numerals && parseKey(song.key) ? (name: string) => romanNumeral(name, song.key) ?? name : undefined;
  const sections = song.sections.map((section, index) => ({
    section,
    collapsed: section.repeat || repeated.has(index),
    lines: printedLines(section).map((line) => ({ line, chords: line.chords.length > 0 ? chordLine(line, display) : '' })),
  }));
  const note = keyChangeNote(song.key, semitones);
  // The title is kept with the start of the song's first section, so it's never left alone at the bottom of a page.
  const opening = sections.findIndex(({ collapsed, lines }) => collapsed || lines.length > 0);
  const header = (
    <div className="font-sans">
      <h2 className="text-[18pt] leading-tight font-bold">
        {displayTitle(song)}
        {note ? <span className="ml-3 text-[11pt] font-normal text-muted">{note}</span> : null}
      </h2>
      {song.artist ? <p className="text-[11pt] text-muted">{song.artist}</p> : null}
      {song.key ? <p className="mt-1 text-[9pt] text-muted">Key: {song.key}</p> : null}
    </div>
  );

  return (
    <article className="not-first:mt-[22pt] not-first:border-t not-first:border-line not-first:pt-[22pt]">
      {opening < 0 ? header : null}
      <div className="font-mono text-[10.5pt]">
        {sections.map(({ section, collapsed, lines: [first, ...rest] }, index) =>
          collapsed ? (
            <div key={index} className="break-inside-avoid">
              {index === opening ? header : null}
              <p className="mt-[1.2em] font-bold text-muted">
                [{section.name}]<span className="ml-2 font-sans text-[9pt] font-normal italic">(repeat)</span>
              </p>
            </div>
          ) : first ? (
            <section key={index}>
              {/* The heading stays with the section's first line, so it's never left alone at the bottom of a page. */}
              <div className="break-inside-avoid">
                {index === opening ? header : null}
                <h3 className="mt-[1.2em] mb-[0.2em] font-bold text-muted">[{section.name}]</h3>
                <PrintedLine line={first.line} chords={first.chords} />
              </div>
              {rest.map(({ line, chords }, lineIndex) => (
                <PrintedLine key={lineIndex} line={line} chords={chords} />
              ))}
            </section>
          ) : null,
        )}
      </div>
    </article>
  );
}

/**
 * A chord row and its lyric, never split across two pages. A line too long for the page wraps between words,
 * and each piece keeps its chords above its letters (see `lineSegments`).
 */
function PrintedLine({ line, chords }: { line: SongLine; chords: string }) {
  const text = line.text.trimEnd();
  return (
    <div className="flex break-inside-avoid flex-wrap">
      {lineSegments(chords, text).map((segment, index) => (
        <div key={index} className="flex flex-col whitespace-pre">
          {chords ? <span className="font-bold text-chord">{segment.chords}</span> : null}
          {text.trim() ? <span>{segment.text}</span> : null}
        </div>
      ))}
    </div>
  );
}

/**
 * Cuts a chord row and its lyric into pieces at the same columns, so the browser can wrap a long line between
 * pieces and every chord still sits above its letter. A piece starts at a word of the lyric (or at a chord, on
 * a line of chords only), and never in the middle of a chord name.
 */
export function lineSegments(chords: string, text: string): { chords: string; text: string }[] {
  const width = Math.max(chords.length, text.length);
  const chordRow = chords.padEnd(width);
  const lyric = text.padEnd(width);
  const chordsOnly = text.trim().length === 0;
  const startsPiece = (i: number) =>
    chordRow[i - 1] === ' ' &&
    (chordsOnly ? chordRow[i] !== ' ' : lyric[i - 1] === ' ' && lyric[i] !== ' ');

  const segments: { chords: string; text: string }[] = [];
  let start = 0;
  for (let i = 1; i <= width; i++) {
    if (i === width || startsPiece(i)) {
      segments.push({ chords: chordRow.slice(start, i), text: lyric.slice(start, i) });
      start = i;
    }
  }
  return segments;
}

function CheckBox(props: { checked: boolean; onChange: (checked: boolean) => void; hint?: string; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-hover pointer-coarse:min-h-11 pointer-coarse:items-center">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
        className="mt-1 size-4 shrink-0 accent-accent pointer-coarse:mt-0"
      />
      <span className="min-w-0">
        {props.children}
        {props.hint ? <span className="block text-sm text-muted">{props.hint}</span> : null}
      </span>
    </label>
  );
}
