// Writes songs as a PDF file and downloads it. jsPDF and the fonts are loaded on the first export only.
import monoBoldUrl from '../assets/fonts/CascadiaMono-Bold.ttf?url';
import monoUrl from '../assets/fonts/CascadiaMono-Regular.ttf?url';
import sansBoldUrl from '../assets/fonts/NotoSans-Bold.ttf?url';
import sansItalicUrl from '../assets/fonts/NotoSans-Italic.ttf?url';
import sansUrl from '../assets/fonts/NotoSans-Regular.ttf?url';
import type { jsPDF } from 'jspdf';
import { layoutPdf, PAGES, type ExportOptions, type ExportSong, type Face, type Ink } from './layout';

// Each face as jsPDF knows it: a font family and a style, and the file it comes from.
const FACES: Record<Face, { family: string; style: string; url: string }> = {
  sans: { family: 'NotoSans', style: 'normal', url: sansUrl },
  sansBold: { family: 'NotoSans', style: 'bold', url: sansBoldUrl },
  sansItalic: { family: 'NotoSans', style: 'italic', url: sansItalicUrl },
  mono: { family: 'CascadiaMono', style: 'normal', url: monoUrl },
  monoBold: { family: 'CascadiaMono', style: 'bold', url: monoBoldUrl },
};

/** The fonts as base64, read once. */
let fonts: Promise<Record<Face, string>> | null = null;

function loadFonts(): Promise<Record<Face, string>> {
  fonts ??= Promise.all(
    Object.entries(FACES).map(async ([face, { url }]) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Couldn't load the font ${url}: ${response.status}`);
      return [face, toBase64(await response.arrayBuffer())] as const;
    }),
  ).then((entries) => Object.fromEntries(entries) as Record<Face, string>);
  // A failed load (offline) is tried again on the next export.
  fonts.catch(() => (fonts = null));
  return fonts;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // In slices: a whole font as one call's arguments would overflow the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * Downloads the songs as one PDF called `fileName`. `inks` are the colors to use, as CSS colors (the
 * preview's, so the PDF looks like it).
 */
export async function exportPdf(
  fileName: string,
  title: string,
  songs: ExportSong[],
  options: ExportOptions,
  inks: Record<Ink, string>,
): Promise<void> {
  const [{ jsPDF }, fontData] = await Promise.all([import('jspdf'), loadFonts()]);
  buildPdf(new jsPDF({ unit: 'pt', format: options.paper }), fontData, title, songs, options, inks).save(fileName);
}

/** Writes the songs into an empty document (of `options.paper`); `fonts` are the font files as base64. */
export function buildPdf(
  doc: jsPDF,
  fonts: Record<Face, string>,
  title: string,
  songs: ExportSong[],
  options: ExportOptions,
  inks: Record<Ink, string>,
): jsPDF {
  for (const [face, { family, style }] of Object.entries(FACES)) {
    const file = `${family}-${style}.ttf`;
    doc.addFileToVFS(file, fonts[face as Face]);
    doc.addFont(file, family, style);
  }
  const use = (face: Face, size: number) => {
    doc.setFont(FACES[face].family, FACES[face].style);
    doc.setFontSize(size);
  };

  const pages = layoutPdf(songs, options, (text, face, size) => {
    use(face, size);
    return doc.getTextWidth(text);
  });
  const page = PAGES[options.paper];
  pages.forEach((marks, index) => {
    if (index > 0) doc.addPage();
    for (const mark of marks) {
      if (mark.kind === 'rule') {
        doc.setDrawColor(inks.line);
        doc.setLineWidth(0.75);
        doc.line(page.margin, mark.y, page.width - page.margin, mark.y);
      } else {
        use(mark.face, mark.size);
        doc.setTextColor(inks[mark.ink]);
        doc.text(mark.text, mark.x, mark.y);
      }
    }
  });
  doc.setProperties({ title, creator: 'Groovekeeper' });
  return doc;
}
