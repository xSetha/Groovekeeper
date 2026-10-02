// Runs the cases in shared/fixtures, which the desktop app's tests run too (see shared/fixtures/README.md).
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  chordToString, detectKey, diatonicChords, fitsKey, isChord, keyUsesFlats, parseChord, parseChordPro,
  parseSongText, pitchClass, romanNumeral, rootOf, songToChordPro, songToText, suggestNext, transposeChordName,
  transposeKey, transposeSong, triadOf, noteToString, type Song,
} from '../src';

const FIXTURES = resolve(import.meta.dirname, '../../../../shared/fixtures');

const readFixture = (...path: string[]): string => readFileSync(join(FIXTURES, ...path), 'utf8').replaceAll('\r\n', '\n');

const music = <T>(file: string): T => JSON.parse(readFixture('music', file)) as T;

interface ChordsFixture {
  parse: { text: string; root: string; quality: string; bass: string | null; triad: string }[];
  invalid: string[];
  pitchClass: { note: string; pitchClass: number }[];
}

interface TransposeFixture {
  chords: { chord: string; semitones: number; useFlats: boolean | null; expected: string }[];
  keys: { key: string; semitones: number; expected: string }[];
  usesFlats: { key: string; expected: boolean | null }[];
  songs: { key: string; chords: string[]; steps: number[]; expectedKey: string; expectedChords: string[] }[];
}

interface ChordTheoryFixture {
  diatonicChords: { key: string; expected: string[] }[];
  rootOf: { key: string; expected: string | null }[];
  fitsKey: { chord: string; key: string; expected: boolean }[];
  suggestNext: { chord: string; key: string; expected: string[] }[];
}

describe('songs', () => {
  const files = readdirSync(join(FIXTURES, 'songs')).filter((name) => !name.endsWith('.json'));

  it('finds the fixtures', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s', (fileName) => {
    const [stem, ...rest] = fileName.split('.');
    const extension = rest.at(-1);
    const mode = rest.length > 1 ? rest[0] : ''; // "in", "out" or "" (both ways)
    const chordPro = extension === 'cho';

    const fileText = readFixture('songs', fileName);
    const expected = JSON.parse(readFixture('songs', `${stem}.json`)) as Song;

    if (mode !== 'out') {
      expect(chordPro ? parseChordPro(fileText) : parseSongText(fileText)).toEqual(expected);
    }
    if (mode !== 'in') {
      expect(chordPro ? songToChordPro(expected) : songToText(expected)).toBe(fileText);
    }
  });
});

describe('chords', () => {
  const fixture = music<ChordsFixture>('chords.json');

  it.each(fixture.parse)('splits $text into root, type and bass', ({ text, root, quality, bass, triad }) => {
    const chord = parseChord(text);
    expect(chord).not.toBeNull();
    expect(noteToString(chord!.root)).toBe(root);
    expect(chord!.quality).toBe(quality);
    expect(chord!.bass ? noteToString(chord!.bass) : null).toBe(bass);
    expect(triadOf(chord!)).toBe(triad);
    expect(chordToString(chord!)).toBe(text);
  });

  it.each(fixture.invalid)('rejects "%s"', (text) => {
    expect(isChord(text)).toBe(false);
  });

  it.each(fixture.pitchClass)('$note has pitch class $pitchClass', ({ note, pitchClass: expected }) => {
    expect(pitchClass(parseChord(note)!.root)).toBe(expected);
  });
});

describe('transpose', () => {
  const fixture = music<TransposeFixture>('transpose.json');

  it.each(fixture.chords)('$chord by $semitones (flats: $useFlats) is $expected', ({ chord, semitones, useFlats, expected }) => {
    expect(transposeChordName(chord, semitones, useFlats)).toBe(expected);
  });

  it.each(fixture.keys)('key $key by $semitones is $expected', ({ key, semitones, expected }) => {
    expect(transposeKey(key, semitones)).toBe(expected);
  });

  it.each(fixture.usesFlats)('key $key uses flats: $expected', ({ key, expected }) => {
    expect(keyUsesFlats(key)).toBe(expected);
  });

  it.each(fixture.songs)('song in $key by $steps', ({ key, chords, steps, expectedKey, expectedChords }) => {
    let song: Song = {
      title: '', artist: '', key,
      sections: [{
        name: 'Verse', repeat: false,
        lines: [{ text: 'some lyrics', chords: chords.map((name, i) => ({ position: i * 4, name })) }],
      }],
    };
    for (const step of steps) song = transposeSong(song, step);
    expect(song.key).toBe(expectedKey);
    expect(song.sections[0]!.lines[0]!.chords.map((c) => c.name)).toEqual(expectedChords);
  });
});

describe('roman numerals', () => {
  it.each(music<{ chord: string; key: string; expected: string | null }[]>('roman-numerals.json'))('$chord in $key is $expected', ({ chord, key, expected }) => {
    expect(romanNumeral(chord, key)).toBe(expected);
  });
});

describe('key detection', () => {
  it.each(music<{ chords: string[]; expected: string | null }[]>('key-detection.json'))('$chords is in $expected', ({ chords, expected }) => {
    expect(detectKey(chords)).toBe(expected);
  });
});

describe('chord theory', () => {
  const fixture = music<ChordTheoryFixture>('chord-theory.json');

  it.each(fixture.diatonicChords)('chords of key "$key"', ({ key, expected }) => {
    expect(diatonicChords(key)).toEqual(expected);
  });

  it.each(fixture.rootOf)('palette root of key "$key" is $expected', ({ key, expected }) => {
    expect(rootOf(key)).toBe(expected);
  });

  it.each(fixture.fitsKey)('$chord fits key "$key": $expected', ({ chord, key, expected }) => {
    expect(fitsKey(chord, key)).toBe(expected);
  });

  it.each(fixture.suggestNext)('after $chord in $key', ({ chord, key, expected }) => {
    expect(suggestNext(chord, key)).toEqual(expected);
  });
});
