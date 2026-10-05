// The key a song is in, as the phone's reading view shows it.
import { describe, expect, it } from 'vitest';
import { parseSongText, songKey } from '../src';

describe('songKey', () => {
  it("takes a song's own key, or the one its chords point to", () => {
    expect(songKey(parseSongText('Song\n\nKey: D\n\n[V]\nG\nla\n'))).toEqual({ key: 'D', detected: false });
    expect(songKey(parseSongText('[V]\nAm   F   C   G   Am\nla la la la la la la\n'))).toEqual({ key: 'Am', detected: true });
    expect(songKey(parseSongText('[V]\nla\n'))).toEqual({ key: '', detected: false });
  });
});
