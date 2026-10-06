import { displayTitle, parseSongText, UNTITLED_TITLE, type Song } from '@groovekeeper/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { db, type LibrarySong, type SongNote } from '../library/db';
import { listSongs } from '../library/library';
import { setlistSongs } from '../library/setlists';
import { lineSegments, placeNotes, printedSections, type ExportOptions, type ExportSong, type Ink } from '../pdf/layout';
import { toast } from '../toasts';

/** A song in the PDF, with an id for its place in the preview. */
interface PdfSong extends ExportSong {
  id: string;
}

type Options = ExportOptions;

/**
 * Export PDF: the songs as they'll be in the PDF, with the options, and a button that downloads the PDF.
 * Exports one song (`?song=id`), a setlist (`?setlist=id`), or songs
 * ticked from the library as a songbook.
 */
export default function PdfPage() {
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
        hint="A section exactly the same as an earlier one, name, chords and lyrics, is written as [Chorus] (repeat)."
      >
        Collapse repeated sections
      </CheckBox>
      <CheckBox checked={options.numerals} onChange={(numerals) => setOptions({ ...options, numerals })} hint="In each song's key; songs without a key keep their chord names.">
        Chords as Roman numerals
      </CheckBox>
    </fieldset>
  );

  if (songId !== null) return <OneSong id={songId} options={options}>{optionBoxes}</OneSong>;
  if (setlistId !== null) return <Setlist id={setlistId} options={options}>{optionBoxes}</Setlist>;
  return <Songbook options={options}>{optionBoxes}</Songbook>;
}

interface ModeProps {
  options: Options;
  /** The option boxes, shown in the side panel. */
  children: ReactNode;
}

function OneSong({ id, options, children }: ModeProps & { id: string }) {
  // null while loading, undefined when there's no such song
  const stored = useLiveQuery(() => db.songs.get(id), [id], null);
  if (stored === null) return null;
  const song = stored && parseSongText(stored.text);
  return (
    <PdfLayout
      title={song ? displayTitle(song) : 'Export PDF'}
      back={{ to: `/songs/${id}`, label: song ? displayTitle(song) : 'Back to the song' }}
      songs={song ? [{ id, song, notes: stored.notes }] : []}
      empty="This song isn't in your library."
      options={options}
    >
      {children}
    </PdfLayout>
  );
}

function Setlist({ id, options, children }: ModeProps & { id: string }) {
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
    <PdfLayout
      title={loaded?.name ?? 'Export PDF'}
      back={{ to: `/setlists/${id}`, label: loaded?.name ?? 'Setlists' }}
      songs={loaded?.songs.map((s) => ({ id: s.entry.id, song: s.song, notes: s.notes })) ?? []}
      empty={loaded ? 'No songs in this setlist yet.' : "This setlist isn't in your library."}
      options={options}
    >
      {children}
    </PdfLayout>
  );
}

/** Songs ticked from the library, in library order. */
function Songbook({ options, children }: ModeProps) {
  const library = useLiveQuery(listSongs, []);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const chosen = library?.filter((song) => ticked.has(song.id)) ?? [];

  const tick = (song: LibrarySong, on: boolean) => {
    const next = new Set(ticked);
    if (on) next.add(song.id);
    else next.delete(song.id);
    setTicked(next);
  };

  return (
    <PdfLayout
      title="Songbook"
      back={{ to: '/', label: 'Library' }}
      songs={chosen.map((stored) => ({ id: stored.id, song: parseSongText(stored.text), notes: stored.notes }))}
      empty={library?.length === 0 ? 'The library is empty. Write or import songs first.' : 'Tick the songs to export.'}
      intro="Tick the songs for the PDF. They follow one another in title order; for another order, make a setlist."
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
    </PdfLayout>
  );
}

interface LayoutProps {
  /** The page's title, and the PDF's: its file is called after it. */
  title: string;
  back: { to: string; label: string };
  songs: PdfSong[];
  /** Shown instead of the preview when there's nothing to export. */
  empty: string;
  intro?: string;
  options: Options;
  /** The side panel's choices: songs to tick and the options. */
  children: ReactNode;
}

/** The choices on the side, with Export PDF, and a preview of the songs as they'll be in the PDF. */
function PdfLayout({ title, back, songs, empty, intro, options, children }: LayoutProps) {
  const paper = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    document.title = title;
    return () => {
      document.title = 'Groovekeeper';
    };
  }, [title]);

  const exportFile = async () => {
    if (!paper.current) return;
    // The PDF is written in the preview's colors, so it looks like the preview.
    const style = getComputedStyle(paper.current);
    const ink = (name: string) => style.getPropertyValue(`--gk-${name}`).trim();
    const inks: Record<Ink, string> = { fg: ink('fg'), muted: ink('muted'), chord: ink('chord'), line: ink('line') };
    setExporting(true);
    const fileName = pdfFileName(title);
    try {
      // Loaded when it's used: the PDF library and its fonts are big, and most visits never export.
      const { exportPdf } = await import('../pdf/exportPdf');
      await exportPdf(fileName, title, songs, options, inks);
      toast('success', `Exported ${fileName}`);
    } catch {
      toast('error', "Couldn't make the PDF", 'Check your connection and try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-line p-4 max-md:border-b md:w-80 md:overflow-y-auto md:border-r">
        <Link to={back.to} className="text-sm text-muted hover:text-fg">
          ← {back.label}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Export PDF</h1>
        {intro ? <p className="mt-1 text-sm text-muted">{intro}</p> : null}
        {children}
        <button
          type="button"
          disabled={songs.length === 0 || exporting}
          className="mt-6 self-start rounded bg-accent-fill px-5 py-2.5 font-semibold text-on-accent hover:brightness-125 disabled:opacity-40 disabled:hover:brightness-100 pointer-coarse:min-h-11"
          onClick={() => void exportFile()}
        >
          {exporting ? 'Exporting…' : 'Export PDF'}
        </button>
      </aside>

      <main aria-label="PDF preview" className="min-h-0 flex-1 overflow-y-auto bg-window p-4 sm:p-8">
        {songs.length === 0 ? <p className="text-muted">{empty}</p> : null}
        {songs.length > 0 ? (
          // The paper, in the Songbook theme's ink whatever the app's theme.
          <div ref={paper} data-theme="songbook" className="mx-auto max-w-[21cm] bg-card px-[2cm] py-[1.5cm] text-fg shadow-xl max-sm:px-6">
            {songs.map(({ id, song, notes }) => (
              <PreviewSong key={id} song={song} notes={notes} options={options} />
            ))}
          </div>
        ) : null}
      </main>
    </div>
  );
}

/** The PDF's file name: its title, without the letters file names can't have. */
export const pdfFileName = (title: string): string => `${title.replace(/[\\/:*?"<>|]/g, '').trim() || 'Songs'}.pdf`;

/**
 * One song as in the PDF (pdf/layout.ts lays out the same sections and lines): following the one before it
 * under a thin line, its sizes in points, and chord rows written as text above their lyric.
 */
function PreviewSong({ song, notes = [], options }: { song: Song; notes?: SongNote[]; options: Options }) {
  const sections = printedSections(song, options);
  const placed = placeNotes(song, sections, notes);
  const lyrics = useRef<HTMLDivElement>(null);
  // Where each note's top is, worked out from the printed lines once they're laid out, as the PDF does.
  const [tops, setTops] = useState<number[]>([]);
  // What the tops depend on, as one value: `placed` is a new list on every render.
  const placing = JSON.stringify(placed.map((p) => [p.line, p.towardsNext]));

  useLayoutEffect(() => {
    const box = lyrics.current;
    if (!box || placed.length === 0) return;
    const origin = box.getBoundingClientRect().top;
    const lines = [...box.querySelectorAll<HTMLElement>('[data-printed-line]')];
    const next = placed.map(({ line, towardsNext }) => {
      const at = lines.findIndex((element) => element.dataset.printedLine === String(line));
      const element = lines[at];
      if (!element) return 0;
      const top = element.getBoundingClientRect().top - origin;
      const after = lines[at + 1];
      const height = after ? after.getBoundingClientRect().top - origin - top : element.getBoundingClientRect().height;
      return top + towardsNext * height;
    });
    setTops((current) => (current.length === next.length && current.every((top, i) => top === next[i]) ? current : next));
    // `placed` follows `placing`; the lines move with the options.
  }, [placing, options]);

  return (
    <article className="not-first:mt-[22pt] not-first:border-t not-first:border-line not-first:pt-[22pt]">
      <div className="font-sans">
        <h2 className="text-[18pt] leading-tight font-bold">{displayTitle(song)}</h2>
        {song.artist ? <p className="text-[11pt] text-muted">{song.artist}</p> : null}
        {song.key ? <p className="mt-1 text-[9pt] text-muted">Key: {song.key}</p> : null}
      </div>
      <div ref={lyrics} className="relative font-mono text-[10.5pt]">
        {sections.map((section, index) => (
          <section key={index}>
            {section.collapsed ? (
              <p className="mt-[1.2em] font-bold text-muted">
                [{section.name}]<span className="ml-2 font-sans text-[9pt] font-normal italic">(repeat)</span>
              </p>
            ) : (
              <>
                <h3 className="mt-[1.2em] mb-[0.2em] font-bold text-muted">[{section.name}]</h3>
                {section.lines.map((line) => (
                  <div key={line.index} data-printed-line={line.index}>
                    <PreviewLine chords={line.chords} text={line.text} />
                  </div>
                ))}
              </>
            )}
          </section>
        ))}
        {placed.map(({ note }, i) => (
          // In the lyrics' font, so `ch` is a lyric letter; the note itself is smaller, in italics.
          <div
            key={note.id}
            className="pointer-events-none absolute"
            style={{ left: `${note.column}ch`, top: tops[i] ?? 0, visibility: tops[i] === undefined ? 'hidden' : undefined }}
          >
            <p className="font-sans text-[9pt] leading-[1.3] whitespace-pre text-muted italic">{note.text}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

/** A chord row and its lyric. A line too long for the page wraps between words, each piece with its chords. */
function PreviewLine({ chords, text }: { chords: string; text: string }) {
  // A blank line keeps the height of a lyric.
  if (!chords && !text.trim()) return <div aria-hidden="true">&nbsp;</div>;
  return (
    <div className="flex flex-wrap">
      {lineSegments(chords, text).map((segment, index) => (
        <div key={index} className="flex flex-col whitespace-pre">
          {chords ? <span className="font-bold text-chord">{segment.chords}</span> : null}
          {text.trim() ? <span>{segment.text}</span> : null}
        </div>
      ))}
    </div>
  );
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
