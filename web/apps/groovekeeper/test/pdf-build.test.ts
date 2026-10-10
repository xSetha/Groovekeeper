import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSongText } from '@groovekeeper/core';
import { jsPDF } from 'jspdf';
import { describe, expect, it } from 'vitest';
import { buildPdf } from '../src/pdf/exportPdf';
import type { Face } from '../src/pdf/layout';

const font = (file: string) => readFileSync(resolve(import.meta.dirname, '../src/assets/fonts', file)).toString('base64');
const fonts: Record<Face, string> = {
  sans: font('NotoSans-Regular.ttf'),
  sansBold: font('NotoSans-Bold.ttf'),
  sansItalic: font('NotoSans-Italic.ttf'),
  mono: font('CascadiaMono-Regular.ttf'),
  monoBold: font('CascadiaMono-Bold.ttf'),
};
const inks = { fg: '#1c1a17', muted: '#6b645a', chord: '#9e2b25', line: '#e2d9c6' };

const CONSTANTINE =
  'Constantine\nTraditional\n\nKey: Dm\n\n[Intro]\nDm  Gm  Dm  Dm\n\n' +
  '[Verse 1]\nDm           A        Dm\nConstantine, Constantine\nDm        A        Dm\nMă mir şi mă uit la tine\n\n[Intro]\nDm  Gm  Dm  Dm\n';

describe('the PDF file', () => {
  it('is written with the fonts, letters like ă and ş, and numerals', () => {
    const songs = [0, 1].map(() => ({ song: parseSongText(CONSTANTINE) }));
    const doc = buildPdf(new jsPDF({ unit: 'pt', format: 'a4' }), fonts, 'Songbook', songs, { collapseRepeats: true, chords: 'numerals', paper: 'a4' }, inks);
    const bytes = new Uint8Array(doc.output('arraybuffer'));
    const pdf = new TextDecoder('latin1').decode(bytes);

    expect(pdf.startsWith('%PDF')).toBe(true);
    expect(pdf).toContain('/BaseFont /CascadiaMono');
    expect(pdf).toContain('/BaseFont /NotoSans');
    expect(doc.getNumberOfPages()).toBe(1);
    // Set PDF_OUT to a file path to look at the PDF.
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, bytes);
  });
});
