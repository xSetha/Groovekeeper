import { displayTitle, transposeSong, type Song } from '@groovekeeper/core';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { download, songFile, type SongFormat } from '../library/files';
import { deleteSong, saveSong } from '../library/library';
import { ChordPalette } from './ChordPalette';
import { trackDrag } from './drag';
import {
  editText, joinWithPrevious, moveChord, neighbourLine, placeChord, removeChord, splitLine, withIds,
  type Focus, type KeyedSong, type LineAt,
} from './edit';
import { EditorLine } from './EditorLine';

// Changes are saved to the library this long after the last one, so typing doesn't write on every key.
const SAVE_DELAY_MS = 400;

const keyOf = (at: LineAt): string => `${at.section}:${at.line}`;

interface PaletteDrag {
  name: string;
  x: number;
  y: number;
  target: { at: LineAt; column: number } | null;
}

/** The song editor: lyrics with their chord rows, a chord palette, and the song's toolbar. Saves as you go. */
export function SongEditor({ id, initial }: { id: string; initial: Song }) {
  const navigate = useNavigate();
  const [song, setSong] = useState(() => withIds(initial));
  const [focus, setFocus] = useState<Focus | null>(null);
  const [paletteDrag, setPaletteDrag] = useState<PaletteDrag | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const charWidth = useCharWidth();
  const save = useAutosave(id, song);

  useEffect(() => {
    document.title = `${displayTitle(song)} – Groovekeeper`;
  }, [song]);

  useLayoutEffect(() => {
    if (!focus) return;
    const input = inputs.current.get(keyOf(focus.at));
    input?.focus();
    input?.setSelectionRange(focus.caret, focus.caret);
  }, [focus]);

  const edit = (at: LineAt) => ({
    onText: (text: string, caret: number) => setSong((s) => editText(s, at, text, caret)),
    // Functional, because Enter over a selection deletes it first in the same event.
    onSplit: (caret: number) => {
      setSong((s) => splitLine(s, at, caret).song);
      setFocus({ at: { section: at.section, line: at.line + 1 }, caret: 0 });
    },
    onJoin: () => {
      const result = joinWithPrevious(song, at);
      if (!result) return;
      setSong(result.song);
      setFocus(result.focus);
    },
    onMoveFocus: (direction: -1 | 1, caret: number) => {
      const target = neighbourLine(song, at, direction);
      if (target) setFocus({ at: target, caret });
    },
    onMoveChord: (chordId: string, position: number) => setSong((s) => moveChord(s, at, chordId, position)),
    onRemoveChord: (chordId: string) => setSong((s) => removeChord(s, at, chordId)),
  });

  /** The line under the pointer, and the column the pointer is over. */
  const dropTarget = useCallback(
    (x: number, y: number): PaletteDrag['target'] => {
      const row = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-line]');
      if (!row || charWidth <= 0) return null;
      const [section = 0, line = 0] = row.dataset.line!.split(':').map(Number);
      const column = Math.max(0, Math.floor((x - row.getBoundingClientRect().left) / charWidth));
      return { at: { section, line }, column };
    },
    [charWidth],
  );

  function startPaletteDrag(name: string, event: PointerEvent<HTMLButtonElement>) {
    // A mouse press would otherwise start selecting text.
    if (event.pointerType === 'mouse') event.preventDefault();
    trackDrag(event, {
      onMove: (e) => setPaletteDrag({ name, x: e.clientX, y: e.clientY, target: dropTarget(e.clientX, e.clientY) }),
      onEnd: (e) => {
        const target = e && dropTarget(e.clientX, e.clientY);
        if (target) setSong((s) => placeChord(s, target.at, target.column, name));
        setPaletteDrag(null);
      },
    });
  }

  const saveFile = (format: SongFormat) => {
    const file = songFile(song, format);
    download(file.name, file.text);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-line bg-toolbar px-4 py-1.5 text-sm">
        <Link to="/" className="py-1.5 text-muted hover:text-fg md:hidden">
          ← Library
        </Link>
        <span className="flex items-center gap-1">
          <span className="text-muted">Transpose</span>
          <ToolButton label="Transpose down" onClick={() => setSong((s) => transposeSong(s, -1))}>−</ToolButton>
          <ToolButton label="Transpose up" onClick={() => setSong((s) => transposeSong(s, 1))}>+</ToolButton>
        </span>
        <span>
          <span className="text-muted">Key </span>
          <span className="font-semibold" data-testid="song-key">{song.key || '–'}</span>
        </span>
        <span className="ml-auto flex items-center gap-1">
          <ToolButton onClick={() => saveFile('text')}>Save as .txt</ToolButton>
          <ToolButton onClick={() => saveFile('chordpro')}>Save as ChordPro</ToolButton>
          <ToolButton onClick={() => setConfirmDelete(true)}>Delete song</ToolButton>
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <article aria-label="Song" className="min-h-0 min-w-0 flex-1 overflow-auto px-4 py-8 sm:px-10">
          <h1 className="text-3xl font-semibold">{displayTitle(song)}</h1>
          {song.artist ? <p className="mt-1 text-lg text-muted">{song.artist}</p> : null}
          <div className="font-mono text-lg">
            {song.sections.map((section, s) => (
              <section key={section.id} className="mt-7">
                <h2 className="font-semibold">
                  [{section.name}]{section.repeat ? <span className="font-normal text-muted"> (repeat)</span> : null}
                </h2>
                {section.lines.map((line, l) => {
                  const at = { section: s, line: l };
                  const target = paletteDrag?.target;
                  return (
                    <div key={line.id} data-line={keyOf(at)} className="w-fit">
                      <EditorLine
                        line={line}
                        charWidth={charWidth}
                        dropColumn={target && keyOf(target.at) === keyOf(at) ? target.column : null}
                        inputRef={(input) => {
                          if (input) inputs.current.set(keyOf(at), input);
                          else inputs.current.delete(keyOf(at));
                        }}
                        {...edit(at)}
                      />
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        </article>
        <ChordPalette
          song={song}
          onStartDrag={startPaletteDrag}
          className="order-first max-h-40 shrink-0 overflow-y-auto border-b border-line p-4 lg:order-last lg:max-h-none lg:w-64 lg:border-b-0 lg:border-l"
        />
      </div>

      {paletteDrag ? (
        <span
          className="pointer-events-none fixed z-20 -translate-x-1/2 -translate-y-full rounded bg-accent-fill px-2 py-1 font-mono text-sm font-semibold text-on-accent shadow-lg"
          style={{ left: paletteDrag.x, top: paletteDrag.y - 18 }}
        >
          {paletteDrag.name}
        </span>
      ) : null}

      {confirmDelete ? (
        <ConfirmDialog
          title={`Delete “${displayTitle(song)}”?`}
          message="The song is removed from the library in this browser. This can't be undone."
          confirmLabel="Delete"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            save.cancel();
            void deleteSong(id).then(() => navigate('/'));
          }}
        />
      ) : null}
    </>
  );
}

function ToolButton({ label, onClick, children }: { label?: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="rounded px-2 py-1.5 hover:bg-hover pointer-coarse:min-h-11 pointer-coarse:min-w-11"
    >
      {children}
    </button>
  );
}

/** The width of one letter of the lyrics' monospace font, in pixels; 0 until it's measured. */
function useCharWidth(): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const probe = document.createElement('span');
    probe.className = 'font-mono text-lg invisible absolute whitespace-pre';
    probe.textContent = '0'.repeat(100);
    document.body.append(probe);
    const measure = () => setWidth(probe.getBoundingClientRect().width / 100);
    measure();
    // The font may still be loading; measure again once it is.
    void document.fonts?.ready.then(measure);
    return () => probe.remove();
  }, []);
  return width;
}

/**
 * Saves the song to the library shortly after each change, and right away when leaving the song, or when
 * the app is hidden (a phone may freeze or close a hidden app without any other warning). `cancel` drops
 * a pending save (when the song is being deleted).
 */
function useAutosave(id: string, song: KeyedSong) {
  const opened = useRef(song);
  const pending = useRef<Song | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (pending.current) void saveSong(id, pending.current);
    pending.current = null;
  }, [id]);

  useEffect(() => {
    if (song === opened.current) return;
    pending.current = song;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  }, [song, flush]);

  useEffect(() => {
    const onHidden = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  return {
    cancel: () => {
      clearTimeout(timer.current);
      pending.current = null;
    },
  };
}
