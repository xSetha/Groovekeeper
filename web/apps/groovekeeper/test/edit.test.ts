import { createTemplate, parseSongText } from '@groovekeeper/core';
import { describe, expect, it } from 'vitest';
import {
  addLine, addSection, chordsInSong, deleteSection, duplicateSection, editText, findLine, joinWithPrevious, lineAt,
  moveChord, moveSection, neighbourLine, pasteLines, placeChord, removeChord, renameSection, repeatSection, splitLine,
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
    const { song, focus } = splitLine(SONG, verse(0), 8)!;
    expect(text(song)[0]).toEqual(['Amazing ', 'grace', 'how sweet']);
    expect(chords(lineAt(song, verse(1)))).toEqual([{ position: 3, name: 'C' }]);
    expect(focus).toEqual({ lineId: lineAt(song, verse(1))!.id, caret: 0 });
  });

  it('keeps the ids of lines and chords through a split and a join', () => {
    const line = lineAt(SONG, verse(0))!;
    const split = splitLine(SONG, verse(0), 8)!.song;
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
    expect(result.focus).toEqual({ lineId: lineAt(SONG, verse(0))!.id, caret: 13 });
  });

  it('removes an empty first line, and leaves a first line with something on it', () => {
    const empty = withIds(parseSongText('[Verse]\nla\n'));
    empty.sections[0]!.lines.unshift({ id: 'empty', text: '', chords: [] });
    expect(text(joinWithPrevious(empty, verse(0))!.song)).toEqual([['la']]);
    expect(joinWithPrevious(SONG, verse(0))).toBeNull();
  });

  it('moves between lines across sections', () => {
    const id = (section: number, line: number) => lineAt(SONG, { section, line })!.id;
    expect(neighbourLine(SONG, id(0, 1), 1)).toBe(id(1, 0));
    expect(neighbourLine(SONG, id(1, 0), -1)).toBe(id(0, 1));
    expect(neighbourLine(SONG, id(0, 0), -1)).toBeNull();
    expect(findLine(SONG, id(1, 0))).toEqual({ section: 1, line: 0 });
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

const names = (song: KeyedSong) => song.sections.map((s) => (s.repeat ? `${s.name} (repeat)` : s.name));

describe('sections', () => {
  it('adds a section and a line, each with an empty line to type into', () => {
    const added = addSection(SONG);
    expect(names(added.song)).toEqual(['Verse 1', 'Chorus', 'New section']);
    expect(added.focus.lineId).toBe(added.song.sections[2]!.lines[0]!.id);
    expect(text(addLine(SONG, 1).song)[1]).toEqual(['the sound', '']);
  });

  it('renames, moves, duplicates, repeats and deletes', () => {
    expect(names(renameSection(SONG, 1, 'Refrain'))).toEqual(['Verse 1', 'Refrain']);
    expect(names(moveSection(SONG, 1, -1))).toEqual(['Chorus', 'Verse 1']);
    expect(moveSection(SONG, 0, -1)).toBe(SONG);
    const copy = duplicateSection(SONG, 0);
    expect(names(copy)).toEqual(['Verse 1', 'Verse 1', 'Chorus']);
    expect(copy.sections[1]!.lines[0]!.id).not.toBe(copy.sections[0]!.lines[0]!.id);
    expect(names(repeatSection(SONG, 1))).toEqual(['Verse 1', 'Chorus', 'Chorus (repeat)']);
    expect(names(deleteSection(SONG, 0))).toEqual(['Chorus']);
  });
});

describe('pasting several lines', () => {
  const blank = withIds({ title: '', artist: '', key: '', sections: [{ name: 'Verse 1', repeat: false, lines: [{ text: '', chords: [] }] }] });

  it('turns chords-over-lyrics text into lines with chords, and [Name] rows into sections', () => {
    const pasted = '[Verse]\nG\u00a0\u00a0\u00a0 C\nAmazing grace\nhow sweet\n\n[Chorus]\nD   G\n';
    const { song, focus } = pasteLines(blank, { section: 0, line: 0 }, 0, pasted)!;
    // The blank line and its empty section pasted into are gone.
    expect(names(song)).toEqual(['Verse', 'Chorus']);
    expect(text(song)).toEqual([['Amazing grace', 'how sweet'], ['']]);
    expect(chords(song.sections[0]!.lines[0])).toEqual([{ position: 0, name: 'G' }, { position: 5, name: 'C' }]);
    expect(chords(song.sections[1]!.lines[0])).toEqual([{ position: 0, name: 'D' }, { position: 4, name: 'G' }]);
    expect(focus.lineId).toBe(song.sections[1]!.lines[0]!.id);
  });

  it('replaces the empty sections of a new song when the pasted text has sections of its own', () => {
    const template = withIds(createTemplate());
    const { song } = pasteLines(template, { section: 0, line: 0 }, 0, '[Verse]\nla la\n[Chorus]\nC\nhey\n')!;
    expect(names(song)).toEqual(['Verse', 'Chorus']);
  });

  it('pastes into the middle of a line, keeping the rest after it', () => {
    const { song } = pasteLines(SONG, verse(1), 3, ' oh\nso')!;
    expect(text(song)[0]).toEqual(['Amazing grace', 'how oh', 'so', ' sweet']);
  });
});
