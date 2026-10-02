import { parseSongText, transposeSong } from '@groovekeeper/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/library/db';
import { addSongs, deleteSong, getSong, listSongs, matchesSearch, saveSong } from '../src/library/library';

const song = (title: string, artist = '', key = '') =>
  parseSongText(`${title}\n${artist}\n\nKey: ${key}\n\n[Verse 1]\nG     C\nla la la\n`);

beforeEach(() => db.songs.clear());

describe('library', () => {
  it('lists songs by title, ignoring case', async () => {
    await addSongs([song('scarborough Fair'), song('Amazing Grace'), song('Oh! Susanna')]);
    expect((await listSongs()).map((s) => s.title)).toEqual(['Amazing Grace', 'Oh! Susanna', 'scarborough Fair']);
  });

  it('keeps each song as its .txt text', async () => {
    const [id] = await addSongs([song('Amazing Grace', 'John Newton', 'G')]);
    const stored = await db.songs.get(id!);
    expect(stored?.text).toBe('Amazing Grace\nJohn Newton\n\nKey: G\n\n[Verse 1]\nG     C\nla la la\n');
    expect(await getSong(id!)).toEqual(song('Amazing Grace', 'John Newton', 'G'));
  });

  it('saves changes to a song', async () => {
    const [id] = await addSongs([song('Amazing Grace', 'John Newton', 'G')]);
    await saveSong(id!, transposeSong((await getSong(id!))!, 2));
    const saved = await getSong(id!);
    expect(saved?.key).toBe('A');
    expect(saved?.sections[0]?.lines[0]?.chords.map((c) => c.name)).toEqual(['A', 'D']);
    expect((await listSongs())[0]?.key).toBe('A');
  });

  it('deletes a song', async () => {
    const [id] = await addSongs([song('Amazing Grace')]);
    await deleteSong(id!);
    expect(await getSong(id!)).toBeUndefined();
  });

  it('searches title, artist and key, ignoring case', async () => {
    await addSongs([song('Amazing Grace', 'John Newton', 'G')]);
    const [stored] = await listSongs();
    expect(matchesSearch(stored!, 'grace')).toBe(true);
    expect(matchesSearch(stored!, ' NEWTON ')).toBe(true);
    expect(matchesSearch(stored!, 'g')).toBe(true);
    expect(matchesSearch(stored!, 'Burns')).toBe(false);
  });
});
