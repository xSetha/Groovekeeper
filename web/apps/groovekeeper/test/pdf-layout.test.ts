import { parseSongText } from '@groovekeeper/core';
import { describe, expect, it } from 'vitest';
import {
  chordDisplay, keyText, layoutPdf, lineSegments, PAGE, PAGES, placeNotes, printedColumns, printedSections, PRINTED_COLUMNS, wrapLine, type Mark, type Measure,
} from '../src/pdf/layout';

// Letters of a fixed width: 0.6 of the size, as in Cascadia Mono, and half the size for the sans font.
const measure: Measure = (text, face, size) => text.length * size * (face.startsWith('mono') ? 0.6 : 0.5);
const options = { collapseRepeats: true, chords: 'letters' as const, paper: 'a4' as const };

const texts = (page: Mark[]) => page.flatMap((mark) => (mark.kind === 'text' ? [mark.text] : []));

describe('the paper', () => {
  const songs = [{ song: parseSongText('Song\n\n[Verse]\nG\nla la\n') }];

  it('is A4 or US Letter, in points', () => {
    expect(PAGES.a4).toMatchObject({ width: 595.28, height: 841.89 });
    expect(PAGES.letter).toMatchObject({ width: 612, height: 792 });
  });

  it('breaks pages for Letter\'s shorter page', () => {
    const long = parseSongText(`Song\n\n[Verse]\n${'la la\n'.repeat(120)}`);
    const a4 = layoutPdf([{ song: long }], options, measure);
    const letter = layoutPdf([{ song: long }], { ...options, paper: 'letter' }, measure);
    expect(letter.length).toBeGreaterThanOrEqual(a4.length); // Letter is about 50 pt shorter
    for (const mark of letter.flat()) if (mark.kind === 'text') expect(mark.y).toBeLessThanOrEqual(PAGES.letter.height - PAGES.letter.margin);
    expect(layoutPdf(songs, { ...options, paper: 'letter' }, measure)).toHaveLength(1);
  });

  it('fits a few more letters across Letter paper', () => {
    expect(printedColumns('a4')).toBe(PRINTED_COLUMNS);
    expect(printedColumns('letter')).toBeGreaterThan(printedColumns('a4'));
  });
});

describe('chord styles', () => {
  const song = parseSongText('Song\n\nKey: Dm\n\n[Verse]\nDm      Am/G\nla la\n');

  it('writes the chords as letters, Do Re Mi or Roman numerals', () => {
    const chordRow = (chords: 'letters' | 'solfege' | 'numerals') =>
      printedSections(song, { ...options, chords })[0]!.lines[0]!.chords.trim().split(/\s+/);
    expect(chordRow('letters')).toEqual(['Dm', 'Am/G']);
    expect(chordRow('solfege')).toEqual(['Rem', 'Lam/Sol']);
    expect(chordRow('numerals')).toEqual(['i', 'v/4']);
  });

  it('writes the key line in Do Re Mi only with Do Re Mi chords', () => {
    expect(keyText(song, 'letters')).toBe('Dm');
    expect(keyText(song, 'solfege')).toBe('Rem');
    expect(keyText(song, 'numerals')).toBe('Dm');
    const page = layoutPdf([{ song }], { ...options, chords: 'solfege' }, measure)[0]!;
    expect(texts(page)).toContain('Key: Rem');
  });

  it('keeps letters for Roman numerals when the song has no key', () => {
    expect(chordDisplay(parseSongText('Song\n\n[Verse]\nG\nla\n'), 'numerals')).toBeUndefined();
  });
});

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
    const pages = layoutPdf([{ song: long }], options, measure);
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      const rows = texts(page);
      // A page never ends on a chord row or a heading: the lyric under it is on the same page.
      expect(rows.at(-1)).toBe('la la la la');
      for (const mark of page) if (mark.kind === 'text') expect(mark.y).toBeLessThanOrEqual(PAGE.height - PAGE.margin);
    }
  });

  it('puts the next song after a line, and keeps its title with its first lines', () => {
    const pages = layoutPdf([{ song: long }, { song: short }], options, measure);
    const last = pages.at(-1)!;
    const title = texts(last).indexOf('Short Song');
    expect(title).toBeGreaterThanOrEqual(0);
    expect(texts(last).slice(title)).toEqual(['Short Song', 'Someone', 'Key: G', '[Chorus]', 'G', 'hey']);
    // The line between the songs is on the same page, above the title, unless the title starts the page.
    const rule = last.find((mark) => mark.kind === 'rule');
    const titleMark = last.find((mark) => mark.kind === 'text' && mark.text === 'Short Song');
    if (rule && titleMark) expect(rule.y).toBeLessThan(titleMark.y);
  });

  it('prints what the editor shows: an empty section as its heading, and a blank line as space', () => {
    const song = parseSongText('Song\n\n[Intro]\n\n\n[Verse]\nla\n\nla\n');
    const page = layoutPdf([{ song }], options, measure)[0]!;
    expect(texts(page)).toEqual(['Song', '[Intro]', '[Verse]', 'la', 'la']);
    const [first, second] = page.filter((mark) => mark.kind === 'text' && mark.text === 'la');
    const next = page.find((mark) => mark.kind === 'text' && mark.text === '[Verse]');
    // The blank line between the two lyrics is as tall as a lyric row.
    expect(second!.y - first!.y).toBeCloseTo(2 * (first!.y - next!.y - 2), 0);
  });

  it('writes a repeated section as [name] (repeat)', () => {
    const song = parseSongText('Song\n\n[Chorus]\nG\nhey\n\n[Chorus]\nG\nhey\n');
    expect(texts(layoutPdf([{ song }], options, measure)[0]!)).toEqual(['Song', '[Chorus]', 'G', 'hey', '[Chorus]', '(repeat)']);
  });

  it('wraps a line longer than the page', () => {
    const lyric = 'word '.repeat(30).trim();
    const song = parseSongText(`Song\n\n[Verse]\nG\n${lyric}\n`);
    const rows = texts(layoutPdf([{ song }], options, measure)[0]!).slice(2);
    expect(rows[0]).toBe('G');
    expect(rows.filter((row) => row.startsWith('word')).join(' ')).toBe(lyric);
    expect(rows.length).toBeGreaterThan(3);
  });
});

describe('notes in the PDF', () => {
  const song = parseSongText('Notes\n\n[Verse]\nG\nla la\nC\nhey hey\n\n[Chorus]\nD\nooh\n\n[Chorus]\nD\nooh\n');
  const note = (printRow: number, text = 'Capo 2') => ({ id: `n${printRow}`, text, column: 10, top: 0, printRow });
  const marks = (notes: ReturnType<typeof note>[], song_ = song) =>
    layoutPdf([{ song: song_, notes }], options, measure)[0]!.flatMap((m) => (m.kind === 'text' ? [m] : []));
  const at = (all: Extract<Mark, { kind: 'text' }>[], text: string) => all.filter((m) => m.text === text);

  it('prints a note across by its column and down by how far it was towards the next line', () => {
    const all = marks([note(0.5)]);
    const [printed] = at(all, 'Capo 2');
    const [chord] = at(all, 'G');
    expect(printed).toMatchObject({ x: PAGE.margin + 10 * 0.6 * 10.5, face: 'sansItalic', ink: 'muted' });
    // Half of the line's chord row and lyric (13 points each), from the line's top, where the chord row starts.
    expect(printed!.y - chord!.y).toBeCloseTo(0.5 * 26 + 9 - 13 * 0.8);
  });

  it('counts the next section’s heading in the last line of a section', () => {
    const all = marks([note(1.5)]);
    // Line 1 ends the verse: below it come the gap (12) and the chorus's heading (15).
    expect(at(all, 'Capo 2')[0]!.y - at(all, 'C')[0]!.y).toBeCloseTo(0.5 * (26 + 12 + 15) + 9 - 13 * 0.8);
  });

  it('prints each of a note’s lines below the one before', () => {
    const [first, second] = [...at(marks([note(0, 'Build up\ncapo 2')]), 'Build up'), ...at(marks([note(0, 'Build up\ncapo 2')]), 'capo 2')];
    expect(second!.y - first!.y).toBeCloseTo(9 * 1.3);
  });

  it('puts a note over a collapsed repeat with the printed line before it', () => {
    // Line 3 is the second chorus, printed as "[Chorus] (repeat)"; line 2 is the first chorus's "ooh".
    const placed = placeNotes(song, printedSections(song, options), [note(3.25)]);
    expect(placed).toEqual([{ note: note(3.25), line: 2, towardsNext: 0.25 }]);
  });

  it('keeps a note above the first line or below the last with that line', () => {
    const sections = printedSections(song, { ...options, collapseRepeats: false });
    expect(placeNotes(song, sections, [note(-0.5), note(5)]).map(({ line, towardsNext }) => [line, towardsNext])).toEqual([
      [0, -0.5],
      [3, 2],
    ]);
  });

  it('measures a wrapped line by all its rows', () => {
    const long = parseSongText('Long\n\n[Verse]\nG\n' + 'la '.repeat(40) + '\n');
    const all = marks([note(0.5)], long);
    const [chord] = at(all, 'G');
    // The line wraps into two rows of chords and lyrics: four rows of 13 points.
    expect(at(all, 'Capo 2')[0]!.y - chord!.y).toBeCloseTo(0.5 * 52 + 9 - 13 * 0.8);
  });

  it('has the same page width the editor marks', () => {
    expect(PRINTED_COLUMNS).toBe(78);
  });
});
