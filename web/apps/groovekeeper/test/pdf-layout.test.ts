import { parseSongText } from '@groovekeeper/core';
import { describe, expect, it } from 'vitest';
import { layoutPdf, lineSegments, PAGE, wrapLine, type Mark, type Measure } from '../src/pdf/layout';

// Letters of a fixed width: 0.6 of the size, as in Cascadia Mono, and half the size for the sans font.
const measure: Measure = (text, face, size) => text.length * size * (face.startsWith('mono') ? 0.6 : 0.5);
const options = { collapseRepeats: true, numerals: false };

const texts = (page: Mark[]) => page.flatMap((mark) => (mark.kind === 'text' ? [mark.text] : []));

describe('cutting a line into pieces', () => {
  it('cuts at the start of words, each piece with its own chords', () => {
    expect(lineSegments('G           C', 'Amazing grace, how sweet')).toEqual([
      { chords: 'G       ', text: 'Amazing ' },
      { chords: '    C  ', text: 'grace, ' },
      { chords: '    ', text: 'how ' },
      { chords: '     ', text: 'sweet' },
    ]);
  });

  it('never cuts in the middle of a chord name', () => {
    // Cmaj7 runs over the start of "the", so "sweet the" stays in one piece.
    expect(lineSegments('     Cmaj7', 'how sweet the').map((s) => s.text)).toEqual(['how ', 'sweet the']);
  });

  it('keeps chords past the end of the lyric', () => {
    expect(lineSegments('Am      E', 'house')).toEqual([{ chords: 'Am      E', text: 'house    ' }]);
  });

  it('cuts a line of chords only before each chord', () => {
    expect(lineSegments('Am  C  D', '').map((s) => s.chords)).toEqual(['Am  ', 'C  ', 'D']);
  });
});

describe('wrapping a long line', () => {
  it('fills each row with whole words and keeps every chord over its letter', () => {
    expect(wrapLine('G               C', 'Amazing grace, how sweet', 16)).toEqual([
      { chords: 'G', text: 'Amazing grace,' },
      { chords: ' C', text: 'how sweet' },
    ]);
  });

  it('leaves a line that fits as it is', () => {
    expect(wrapLine('G    C', 'la la la', 16)).toEqual([{ chords: 'G    C', text: 'la la la' }]);
  });

  it('cuts a word longer than a whole row where the row ends', () => {
    expect(wrapLine('', 'abcdefghij', 4).map((r) => r.text)).toEqual(['abcd', 'efgh', 'ij']);
  });
});

describe('the pages', () => {
  const verse = (n: number) => `[Verse ${n}]\n` + 'G       C\nla la la la\n'.repeat(6) + '\n';
  const long = parseSongText('Long Song\n\n' + Array.from({ length: 12 }, (_, i) => verse(i + 1)).join(''));
  const short = parseSongText('Short Song\nSomeone\n\nKey: G\n\n[Chorus]\nG\nhey\n');

  it('flows a long song onto more pages, with every chord row on the same page as its lyric', () => {
    const pages = layoutPdf([{ song: long, semitones: 0 }], options, measure);
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      const rows = texts(page);
      // A page never ends on a chord row or a heading: the lyric under it is on the same page.
      expect(rows.at(-1)).toBe('la la la la');
      for (const mark of page) if (mark.kind === 'text') expect(mark.y).toBeLessThanOrEqual(PAGE.height - PAGE.margin);
    }
  });

  it('puts the next song after a line, and keeps its title with its first lines', () => {
    const pages = layoutPdf([{ song: long, semitones: 0 }, { song: short, semitones: 2 }], options, measure);
    const last = pages.at(-1)!;
    const title = texts(last).indexOf('Short Song');
    expect(title).toBeGreaterThanOrEqual(0);
    expect(texts(last).slice(title)).toEqual(['Short Song', '[Key of G (+2 semitones from the original)]', 'Someone', 'Key: G', '[Chorus]', 'G', 'hey']);
    // The line between the songs is on the same page, above the title, unless the title starts the page.
    const rule = last.find((mark) => mark.kind === 'rule');
    const titleMark = last.find((mark) => mark.kind === 'text' && mark.text === 'Short Song');
    if (rule && titleMark) expect(rule.y).toBeLessThan(titleMark.y);
  });

  it('writes a repeated section as [name] (repeat)', () => {
    const song = parseSongText('Song\n\n[Chorus]\nG\nhey\n\n[Chorus]\nG\nhey\n');
    expect(texts(layoutPdf([{ song, semitones: 0 }], options, measure)[0]!)).toEqual(['Song', '[Chorus]', 'G', 'hey', '[Chorus]', '(repeat)']);
  });

  it('wraps a line longer than the page', () => {
    const lyric = 'word '.repeat(30).trim();
    const song = parseSongText(`Song\n\n[Verse]\nG\n${lyric}\n`);
    const rows = texts(layoutPdf([{ song, semitones: 0 }], options, measure)[0]!).slice(2);
    expect(rows[0]).toBe('G');
    expect(rows.filter((row) => row.startsWith('word')).join(' ')).toBe(lyric);
    expect(rows.length).toBeGreaterThan(3);
  });
});
