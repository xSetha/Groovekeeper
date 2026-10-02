import { displayTitle, songKey, transposeKey, transposeSong, type Song } from '@groovekeeper/core';
import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { SongSheet, songColumns } from '../components/SongSheet';
import { useCharWidth } from '../components/useCharWidth';

// Lyrics are shown as large as fits the screen, between these sizes; below the smallest, a long line
// scrolls sideways rather than wrapping, which would separate chords from their letters.
const LARGEST_PX = 22;
const SMALLEST_PX = 13;
// Measured at this size to learn how wide a letter is for any size.
const PROBE_PX = 100;

interface Props {
  song: Song;
  /** Where "‹ back" goes: the library, or the setlist the song is played from. */
  back?: { to: string; label: string };
  /** How far to transpose the song to start with: a setlist's key for it. */
  startSemitones?: number;
  /** In a setlist: the songs before and after, and which one this is ("2 of 5"). */
  steps?: { previous: string | null; next: string | null; position: string };
}

/**
 * A song on a phone: read only, as large as fits the screen, with transpose (and, in a setlist, the previous
 * and next song) at the bottom within thumb reach. Transposing here only changes what's shown, never the
 * saved song.
 */
export function SongReader({ song, back = { to: '/', label: 'Library' }, startSemitones = 0, steps }: Props) {
  const [semitones, setSemitones] = useState(startSemitones);
  const shown = semitones === 0 ? song : transposeSong(song, semitones);
  // The song's key, or the one its chords point to, moved with the song.
  const original = songKey(song).key;
  const startKey = transposeKey(original, startSemitones);
  const fontSize = useFittedFontSize(song);

  useEffect(() => {
    document.title = `${displayTitle(song)} – Groovekeeper`;
  }, [song]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto px-4 pt-3 pb-6">
        <Link to={back.to} className="-ml-2 inline-flex min-h-11 items-center px-2 text-muted">
          ‹ {back.label}
        </Link>
        {steps ? <span className="ml-2 text-sm text-muted">{steps.position}</span> : null}
        <h1 className="mt-1 text-2xl font-semibold">{displayTitle(song)}</h1>
        {song.artist ? <p className="text-muted">{song.artist}</p> : null}
        <div className="mt-5" data-testid="sheet-fit" ref={fontSize.measure}>
          <SongSheet song={shown} fontSize={fontSize.px} />
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-line bg-toolbar px-2 pb-[env(safe-area-inset-bottom)]">
        {steps ? <StepLink to={steps.previous} label="Previous song">‹</StepLink> : null}
        <BarButton label="Transpose down" onClick={() => setSemitones((s) => s - 1)}>−</BarButton>
        <div className="text-center leading-tight">
          <div>
            <span className="text-muted">Key </span>
            <span className="font-semibold" data-testid="song-key">{transposeKey(original, semitones) || '–'}</span>
          </div>
          {semitones !== startSemitones ? (
            <button type="button" className="min-h-8 text-sm text-accent short:min-h-6" onClick={() => setSemitones(startSemitones)}>
              Back to {startKey || 'the original key'}
            </button>
          ) : (
            <div className="min-h-8 text-sm text-muted short:min-h-6">Transpose</div>
          )}
        </div>
        <BarButton label="Transpose up" onClick={() => setSemitones((s) => s + 1)}>+</BarButton>
        {steps ? <StepLink to={steps.next} label="Next song">›</StepLink> : null}
      </div>
    </div>
  );
}

/** The previous or next song of a setlist; greyed out at either end. */
function StepLink({ to, label, children }: { to: string | null; label: string; children: string }) {
  const style = 'flex size-14 items-center justify-center text-3xl short:size-11';
  return to ? (
    <Link to={to} aria-label={label} className={`${style} active:bg-hover`}>
      {children}
    </Link>
  ) : (
    <span aria-hidden="true" className={`${style} text-hint`}>
      {children}
    </span>
  );
}

function BarButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="size-14 text-2xl active:bg-hover short:size-11">
      {children}
    </button>
  );
}

/**
 * The largest lyric size at which the song's widest line fits the sheet's width. `measure` goes on the
 * element whose width counts; the size follows it when the phone is turned.
 */
function useFittedFontSize(song: Song): { px: number; measure: (element: HTMLDivElement | null) => void } {
  // The probe size is a measurement, not a style: an arbitrary value is needed here.
  const letterAtProbe = useCharWidth('text-[100px]');
  const [width, setWidth] = useState(0);
  const [element, setElement] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!element) return;
    setWidth(element.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => entry && setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  const columns = songColumns(song);
  const ratio = letterAtProbe / PROBE_PX;
  const fitting = ratio > 0 && width > 0 ? Math.floor(width / (columns * ratio)) : LARGEST_PX;
  return { px: Math.max(SMALLEST_PX, Math.min(LARGEST_PX, fitting)), measure: setElement };
}
