import { createTemplate, parseSongText } from '@groovekeeper/core';
import { describe, expect, it } from 'vitest';
import {
  addLine, addSection, chordsInSong, deleteRange, deleteSection, duplicateSection, editText, findLine, joinWithPrevious, lineAt,
  moveChord, moveSection, moveSectionTo, neighbourLine, partInRange, pasteLines, placeChord, rangeBetween, removeChord, renameSection,
  repeatSection, sectionsInRange, setChord, splitLine,
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

  it('removes a section\'s only empty line, leaving the section empty, with the caret on the line before', () => {
    const song = withIds(parseSongText('[Verse]\nla la\n\n[Chorus]\n\n'));
    expect(song.sections[1]!.lines).toHaveLength(1);
    const result = joinWithPrevious(song, { section: 1, line: 0 })!;
    expect(result.song.sections[1]!.lines).toEqual([]);
    expect(result.focus).toEqual({ lineId: lineAt(song, verse(0))!.id, caret: 5 });

    // The song's first line: the caret goes to the line after; a song's only line leaves no line to go to.
    const first = withIds(parseSongText('[Intro]\n\n\n[Verse]\nla\n'));
    expect(joinWithPrevious(first, verse(0))!.focus).toEqual({ lineId: lineAt(first, { section: 1, line: 0 })!.id, caret: 0 });
    const only = withIds(parseSongText('[Intro]\n\n'));
    expect(joinWithPrevious(only, verse(0))).toMatchObject({ focus: null });
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

  it('types a chord: adds it, renames the one in that column, or removes it with an empty name', () => {
    expect(chords(lineAt(setChord(SONG, verse(1), 4, ' Em7 ')!, verse(1)))).toEqual([{ position: 4, name: 'Em7' }]);
    const renamed = setChord(SONG, verse(0), 11, 'C/G')!;
    expect(chords(lineAt(renamed, verse(0)))).toEqual([{ position: 0, name: 'G' }, { position: 11, name: 'C/G' }]);
    expect(chordId(renamed, verse(0), 1)).toBe(chordId(SONG, verse(0), 1));
    expect(chords(lineAt(setChord(SONG, verse(0), 0, '')!, verse(0)))).toEqual([{ position: 11, name: 'C' }]);
    expect(setChord(SONG, verse(1), 3, '  ')).toBe(SONG);
    expect(setChord(SONG, verse(0), 11, 'C')).toBe(SONG);
  });

  it('takes a chord typed in Do Re Mi and keeps it as letters', () => {
    expect(chords(lineAt(setChord(SONG, verse(1), 4, 'lam7')!, verse(1)))).toEqual([{ position: 4, name: 'Am7' }]);
    expect(chords(lineAt(setChord(SONG, verse(0), 11, 'Sol/Si')!, verse(0)))?.[1]).toEqual({ position: 11, name: 'G/B' });
    expect(setChord(SONG, verse(1), 0, 'Domino')).toBeNull();
  });

  it("refuses a name that isn't a chord", () => {
    expect(setChord(SONG, verse(1), 0, 'hello')).toBeNull();
    expect(setChord(SONG, verse(0), 0, 'G hello')).toBeNull();
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

  it('adds a section right after the one with the caret, or at the end when that one is gone', () => {
    const after = addSection(SONG, SONG.sections[0]!.id);
    expect(names(after.song)).toEqual(['Verse 1', 'New section', 'Chorus']);
    expect(after.focus.lineId).toBe(after.song.sections[1]!.lines[0]!.id);
    expect(names(addSection(SONG, 'gone').song)).toEqual(['Verse 1', 'Chorus', 'New section']);
  });

  it('moves a section to a place counted before the move', () => {
    const three = repeatSection(SONG, 0); // Verse 1, Chorus, Verse 1 (repeat)
    expect(names(moveSectionTo(three, 0, 3))).toEqual(['Chorus', 'Verse 1 (repeat)', 'Verse 1']);
    expect(names(moveSectionTo(three, 2, 0))).toEqual(['Verse 1 (repeat)', 'Verse 1', 'Chorus']);
    expect(names(moveSectionTo(three, 0, 2))).toEqual(['Chorus', 'Verse 1', 'Verse 1 (repeat)']);
    expect(moveSectionTo(three, 1, 1)).toBe(three);
    expect(moveSectionTo(three, 1, 2)).toBe(three);
    expect(moveSectionTo(three, 5, 0)).toBe(three);
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

describe('selecting across lines', () => {
  const id = (song: KeyedSong, section: number, line: number) => lineAt(song, { section, line })!.id;
  const at = (section: number, line: number, index: number) => ({ lineId: id(SONG, section, line), index });

  it('orders the two ends, whichever way the mouse went', () => {
    expect(rangeBetween(SONG, at(1, 0, 4), at(0, 0, 8))).toEqual({ start: at(0, 0, 8), end: at(1, 0, 4) });
    expect(rangeBetween(SONG, at(0, 1, 2), at(0, 1, 0))).toEqual({ start: at(0, 1, 0), end: at(0, 1, 2) });
  });

  it('knows the part of each line in the selection, and the headings it would delete', () => {
    const range = rangeBetween(SONG, at(0, 0, 8), at(1, 0, 4))!;
    expect(partInRange(SONG, range, id(SONG, 0, 0))).toEqual({ from: 8, to: null });
    expect(partInRange(SONG, range, id(SONG, 0, 1))).toEqual({ from: 0, to: null });
    expect(partInRange(SONG, range, id(SONG, 1, 0))).toEqual({ from: 0, to: 4 });
    expect(sectionsInRange(SONG, range)).toEqual([SONG.sections[1]!.id]);
    expect(sectionsInRange(SONG, rangeBetween(SONG, at(0, 0, 0), at(0, 1, 3))!)).toEqual([]);
  });

  it('deletes the selection and its chords, and joins what is left of its first and last lines', () => {
    const { song, focus } = deleteRange(SONG, rangeBetween(SONG, at(0, 0, 8), at(0, 1, 4))!)!;
    expect(text(song)).toEqual([['Amazing sweet'], ['the sound']]);
    expect(chords(lineAt(song, verse(0)))).toEqual([{ position: 0, name: 'G' }]);
    expect(focus).toEqual({ lineId: id(SONG, 0, 0), caret: 8 });
  });

  it('deletes the headings inside the selection; what is left of the last section joins the first', () => {
    const song = withIds(parseSongText('[Verse]\none\ntwo\n\n[Bridge]\nthree\n\n[Chorus]\nD\nthe sound\nend\n'));
    const pick = (section: number, line: number, index: number) => ({ lineId: id(song, section, line), index });
    const result = deleteRange(song, rangeBetween(song, pick(0, 0, 2), pick(2, 0, 4))!)!.song;
    expect(result.sections.map((s) => s.name)).toEqual(['Verse']);
    expect(text(result)).toEqual([['onsound', 'end']]);
    expect(chords(lineAt(result, verse(0)))).toEqual([]);
  });

  it('deletes a selection within one line', () => {
    const { song, focus } = deleteRange(SONG, rangeBetween(SONG, at(0, 0, 13), at(0, 0, 7))!)!;
    expect(text(song)[0]).toEqual(['Amazing', 'how sweet']);
    expect(chords(lineAt(song, verse(0)))).toEqual([{ position: 0, name: 'G' }]);
    expect(focus).toEqual({ lineId: id(SONG, 0, 0), caret: 7 });
  });

  it('deletes whole lines selected from the start of one to the end of another, leaving one empty line', () => {
    const song = deleteRange(SONG, rangeBetween(SONG, at(0, 0, 0), at(0, 1, 'how sweet'.length))!)!.song;
    expect(text(song)).toEqual([[''], ['the sound']]);
    expect(lineAt(song, verse(0))?.chords).toEqual([]);
  });

  it('deletes the lines between the end of one line and the start of another', () => {
    const song = withIds(parseSongText('[Verse]\none\ntwo\nthree\n'));
    const pick = (line: number, index: number) => ({ lineId: id(song, 0, line), index });
    expect(text(deleteRange(song, rangeBetween(song, pick(0, 3), pick(2, 0))!)!.song)).toEqual([['onethree']]);
  });

  it('does nothing when a line of the selection is gone', () => {
    const range = rangeBetween(SONG, at(0, 0, 0), at(1, 0, 2))!;
    expect(deleteRange(deleteSection(SONG, 1), range)).toBeNull();
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
