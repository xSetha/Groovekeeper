import { parseSongText, type Song } from '@groovekeeper/core';
import { describe, expect, it } from 'vitest';
import {
  chordsInSong, editText, joinWithPrevious, lineAt, moveChord, neighbourLine, placeChord, removeChord, splitLine,
} from '../src/editor/edit';

const SONG = parseSongText('[Verse 1]\nG          C\nAmazing grace\nhow sweet\n\n[Chorus]\nD\nthe sound\n');
const verse = (line: number) => ({ section: 0, line });
const text = (song: Song) => song.sections.map((s) => s.lines.map((l) => l.text));

describe('editing a song', () => {
  it('keeps chords on their letters while typing', () => {
    const song = editText(SONG, verse(0), 'Amazing, grace', 8);
    expect(lineAt(song, verse(0))).toEqual({ text: 'Amazing, grace', chords: [{ position: 0, name: 'G' }, { position: 12, name: 'C' }] });
    expect(lineAt(SONG, verse(0))?.text).toBe('Amazing grace');
  });

  it('splits a line at the caret', () => {
    const { song, focus } = splitLine(SONG, verse(0), 8);
    expect(text(song)[0]).toEqual(['Amazing ', 'grace', 'how sweet']);
    expect(lineAt(song, verse(1))?.chords).toEqual([{ position: 3, name: 'C' }]);
    expect(focus).toEqual({ at: verse(1), caret: 0 });
  });

  it('joins a line onto the one above', () => {
    const result = joinWithPrevious(SONG, verse(1))!;
    expect(text(result.song)[0]).toEqual(['Amazing gracehow sweet']);
    expect(result.focus).toEqual({ at: verse(0), caret: 13 });
  });

  it('removes an empty first line, and leaves a first line with something on it', () => {
    const empty = parseSongText('[Verse]\nla\n');
    empty.sections[0]!.lines.unshift({ text: '', chords: [] });
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
    expect(lineAt(added, verse(1))?.chords).toEqual([{ position: 4, name: 'Em' }]);
    const replaced = placeChord(SONG, verse(0), 11, 'Cmaj7');
    expect(lineAt(replaced, verse(0))?.chords.map((c) => c.name)).toEqual(['G', 'Cmaj7']);
  });

  it('moves and removes chords', () => {
    expect(lineAt(moveChord(SONG, verse(0), 1, -3), verse(0))?.chords[1]?.position).toBe(0);
    expect(lineAt(removeChord(SONG, verse(0), 0), verse(0))?.chords).toEqual([{ position: 11, name: 'C' }]);
  });

  it('lists the chords in the song once each', () => {
    expect(chordsInSong(placeChord(SONG, verse(1), 0, 'G'))).toEqual(['G', 'C', 'D']);
  });
});
