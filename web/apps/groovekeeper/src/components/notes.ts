// Where a note floats, as the row of the song it's over: the editor keeps a note's spot in pixels, and the
// PDF and the phone find the same spot again by the lines (see SongNote.printRow).

/** A line as laid out: where its top is and how tall it is, in pixels from the same origin as the notes. */
export interface LaidOutLine {
  top: number;
  height: number;
}

/**
 * The row for a spot `top` pixels down: the line it's on plus how far towards the next one. Above the first
 * line it's negative, measured in that line's height; past the last line it counts on in the last line's height.
 */
export function rowAt(lines: readonly LaidOutLine[], top: number): number {
  const first = lines[0];
  const last = lines.at(-1);
  if (!first || !last) return 0;
  if (top < first.top) return (top - first.top) / Math.max(1, first.height);
  for (let i = 0; i < lines.length - 1; i++) {
    const next = lines[i + 1]!;
    if (top < next.top) return i + (top - lines[i]!.top) / Math.max(1, next.top - lines[i]!.top);
  }
  return lines.length - 1 + (top - last.top) / Math.max(1, last.height);
}

/** The spot in pixels for a row: `rowAt` the other way round, for lines laid out at another size. */
export function topAt(lines: readonly LaidOutLine[], row: number): number {
  const first = lines[0];
  const last = lines.at(-1);
  if (!first || !last) return 0;
  if (row < 0) return first.top + row * first.height;
  const index = Math.floor(row);
  if (index >= lines.length - 1) return last.top + (row - (lines.length - 1)) * last.height;
  const line = lines[index]!;
  return line.top + (row - index) * (lines[index + 1]!.top - line.top);
}
