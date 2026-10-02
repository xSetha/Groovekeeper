import { parseSongText } from '@groovekeeper/core';
import { describe, expect, it } from 'vitest';
import {
  chordsInSong, editText, joinWithPrevious, lineAt, moveChord, neighbourLine, placeChord, removeChord, splitLine,
  withIds, type KeyedLine, type KeyedSong,
} from '../src/editor/edit';

const SONG = withIds(parseSongText('[Verse 1]\nG          C\nAmazing grace\nhow sweet\n\n[Chorus]\nD\nthe sound\n'));
const verse = (line: number) => ({ section: 0, line });
const text = (song: KeyedSong) => song.sections.map((s) => s.lines.map((l) => l.text));
const chords = (line: KeyedLine | undefined) => line?.chords.map(({ position, name }) => ({ position, name }));
const chordId = (song: KeyedSong, at: { section: number; line: number }, index: number) => lineAt(song, at)!.chords[index]!.id;

describe('editing a song', () => {
  it('keeps chords on their letters while typing', () => {
    const song = editText(SONG, verse(0), 'Amazing, grace', 8);
    expect(lineAt(song, verse(0))?.text).toBe('Amazing, grace');
    expect(chords(lineAt(song, verse(0)))).toEqual([{ position: 0, name: 'G' }, { position: 12, name: 'C' }]);
    expect(lineAt(SONG, verse(0))?.text).toBe('Amazing grace');
  });

  it('splits a line at the caret', () => {
    const { song, focus } = splitLine(SONG, verse(0), 8);
    expect(text(song)[0]).toEqual(['Amazing ', 'grace', 'how sweet']);
    expect(chords(lineAt(song, verse(1)))).toEqual([{ position: 3, name: 'C' }]);
    expect(focus).toEqual({ at: verse(1), caret: 0 });
  });

  it('keeps the ids of lines and chords through a split and a join', () => {
    const line = lineAt(SONG, verse(0))!;
    const split = splitLine(SONG, verse(0), 8).song;
    const [head, tail] = split.sections[0]!.lines;
    expect(head!.id).toBe(line.id);
    expect(tail!.id).not.toBe(line.id);
    expect(tail!.chords[0]!.id).toBe(line.chords[1]!.id);

    const joined = joinWithPrevious(split, verse(1))!.song;
    expect(lineAt(joined, verse(0))!.id).toBe(line.id);
    expect(lineAt(joined, verse(0))!.chords.map((c) => c.id)).toEqual(line.chords.map((c) => c.id));
  });

  it('joins a line onto the one above', () => {
    const result = joinWithPrevious(SONG, verse(1))!;
    expect(text(result.song)[0]).toEqual(['Amazing gracehow sweet']);
    expect(result.focus).toEqual({ at: verse(0), caret: 13 });
  });

  it('removes an empty first line, and leaves a first line with something on it', () => {
    const empty = withIds(parseSongText('[Verse]\nla\n'));
    empty.sections[0]!.lines.unshift({ id: 'empty', text: '', chords: [] });
    expect(text(joinWithPrevious(empty, verse(0))!.song)).toEqual([['la']]);
    expect(joinWithPrevious(SONG, verse(0))).toBeNull();
  });

  it('moves between lines across sections', () => {
    expect(neighbourLine(SONG, verse(1), 1)).toEqual({ section: 1, line: 0 });
    expect(neighbourLine(SONG, { section: 1, line: 0 }, -1)).toEqual(verse(1));
    expect(neighbourLine(SONG, verse(0), -1)).toBeNull();
  });

  it('places a chord, replacing one in the same column', () => {
    const added = placeChord(SONG, verse(1), 4, 'Em');
    expect(chords(lineAt(added, verse(1)))).toEqual([{ position: 4, name: 'Em' }]);
    expect(lineAt(added, verse(1))!.chords[0]!.id).toBeTruthy();
    const replaced = placeChord(SONG, verse(0), 11, 'Cmaj7');
    expect(lineAt(replaced, verse(0))?.chords.map((c) => c.name)).toEqual(['G', 'Cmaj7']);
    expect(chordId(replaced, verse(0), 1)).toBe(chordId(SONG, verse(0), 1));
  });

  it('moves and removes chords', () => {
    expect(lineAt(moveChord(SONG, verse(0), chordId(SONG, verse(0), 1), -3), verse(0))?.chords[1]?.position).toBe(0);
    expect(chords(lineAt(removeChord(SONG, verse(0), chordId(SONG, verse(0), 0)), verse(0)))).toEqual([{ position: 11, name: 'C' }]);
  });

  it('lists the chords in the song once each', () => {
    expect(chordsInSong(placeChord(SONG, verse(1), 0, 'G'))).toEqual(['G', 'C', 'D']);
  });
});
