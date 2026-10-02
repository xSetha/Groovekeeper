// The sample songs in samples/songs, which the desktop app's tests check too.
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectKey, parseChordPro, parseSongText, songToChordPro, songToText } from '../src';

const SAMPLES = resolve(import.meta.dirname, '../../../../samples/songs');
const files = readdirSync(SAMPLES).filter((name) => name.endsWith('.txt'));
const read = (name: string): string => readFileSync(join(SAMPLES, name), 'utf8').replaceAll('\r\n', '\n');

describe.each(files)('%s', (fileName) => {
  it('is written back unchanged', () => {
    const text = read(fileName);
    expect(songToText(parseSongText(text))).toBe(text);
  });

  it('survives ChordPro', () => {
    const song = parseSongText(read(fileName));
    expect(songToText(parseChordPro(songToChordPro(song)))).toBe(songToText(song));
  });

  it('has its key detected', () => {
    const song = parseSongText(read(fileName));
    const chords = song.sections.flatMap((s) => s.lines)
      .flatMap((l) => [...l.chords].sort((a, b) => a.position - b.position)).map((c) => c.name);
    expect(detectKey(chords)).toBe(song.key);
  });
});
