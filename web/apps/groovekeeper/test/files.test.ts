import { describe, expect, it } from 'vitest';
import { readSongFile, songFile } from '../src/library/files';
import { sampleSongs } from '../src/library/samples';

describe('song files', () => {
  it('reads ChordPro by its extension', () => {
    const song = readSongFile('Song.CHOPRO', '{title: Amazing Grace}\nA[G]mazing grace\n');
    expect(song.title).toBe('Amazing Grace');
    expect(song.sections[0]?.lines[0]).toEqual({ text: 'Amazing grace', chords: [{ position: 1, name: 'G' }] });
  });

  it('reads anything else as the text format', () => {
    expect(readSongFile('notes.md', 'Title\nArtist\n').artist).toBe('Artist');
  });

  it('names a song without a title after its file', () => {
    expect(readSongFile('My Song.cho', '[G]la\n').title).toBe('My Song');
    expect(readSongFile('README', '[Verse]\nla\n').title).toBe('README');
  });

  it('saves a song under its title, without characters a file name can\'t have', () => {
    const song = readSongFile('x.txt', 'AC/DC: Back?\n');
    expect(songFile(song, 'text').name).toBe('ACDC Back.txt');
    expect(songFile(song, 'chordpro')).toEqual({ name: 'ACDC Back.cho', text: '{title: AC/DC: Back?}\n' });
  });

  it('includes the sample songs', () => {
    const titles = sampleSongs().map((s) => s.title);
    expect(titles).toContain('Amazing Grace');
    expect(titles).toHaveLength(6);
  });
});
