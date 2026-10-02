// Ported from the desktop's SetlistItemViewModel: the key a setlist plays a song in.
import { describe, expect, it } from 'vitest';
import { keysOfMode, parseSongText, sameKey, semitonesBetween, songKey } from '../src';

describe('keys for setlists', () => {
  it('lists the twelve keys of the same mode from C up', () => {
    expect(keysOfMode('G')).toEqual(['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']);
    expect(keysOfMode('Am')).toEqual(['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm']);
    expect(keysOfMode('')).toEqual([]);
  });

  it('measures the way between two keys the short way round', () => {
    expect(semitonesBetween('G', 'A')).toBe(2);
    expect(semitonesBetween('G', 'E')).toBe(-3);
    expect(semitonesBetween('C', 'F#')).toBe(6);
    expect(semitonesBetween('C', 'G')).toBe(-5);
    expect(semitonesBetween('', 'G')).toBe(0);
  });

  it('knows keys that sound the same', () => {
    expect(sameKey('C#', 'Db')).toBe(true);
    expect(sameKey('C#', 'C#m')).toBe(false);
    expect(sameKey('C#', '')).toBe(false);
  });

  it("takes a song's own key, or the one its chords point to", () => {
    expect(songKey(parseSongText('Song\n\nKey: D\n\n[V]\nG\nla\n'))).toEqual({ key: 'D', detected: false });
    expect(songKey(parseSongText('[V]\nAm   F   C   G   Am\nla la la la la la la\n'))).toEqual({ key: 'Am', detected: true });
    expect(songKey(parseSongText('[V]\nla\n'))).toEqual({ key: '', detected: false });
  });
});
