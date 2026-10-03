import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { db } from '../src/library/db';
import { exportPdf } from '../src/pdf/exportPdf';
import { pdfFileName } from '../src/pages/PdfPage';

// The PDF itself is written by jsPDF (see pdf-layout.test.ts for what goes on its pages); here, only the call.
vi.mock('../src/pdf/exportPdf', () => ({ exportPdf: vi.fn(() => Promise.resolve()) }));

const GRACE =
  'Amazing Grace\nJohn Newton\n\nKey: G\n\n[Chorus]\nG          C\nAmazing grace\n\n[Verse]\nD\nhow sweet\n\n' +
  '[Chorus]\nG          C\nAmazing grace\n';
const HOUSE = 'House of the Rising Sun\nTraditional\n\n[Verse]\nAm      C      D      F\nThere is a house\nAm     E     Am\nin New Orleans\n';

beforeEach(async () => {
  vi.mocked(exportPdf).mockClear();
  await db.songs.clear();
  await db.setlists.clear();
  await db.songs.bulkAdd([
    { id: 'grace', title: 'Amazing Grace', artist: 'John Newton', key: 'G', text: GRACE, updatedAt: 0 },
    { id: 'house', title: 'House of the Rising Sun', artist: 'Traditional', key: '', text: HOUSE, updatedAt: 0 },
  ]);
});

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

const preview = () => within(screen.getByRole('main', { name: 'PDF preview' }));
// The chords shown, in order.
const chordsShown = () =>
  [...screen.getByRole('main', { name: 'PDF preview' }).querySelectorAll('.text-chord')].flatMap((row) =>
    (row.textContent ?? '').trim().split(/\s+/).filter(Boolean));

describe('exporting a PDF', () => {
  it('previews one song, with a section that repeats an earlier one collapsed', async () => {
    const user = userEvent.setup();
    renderAt('/pdf?song=grace');

    expect(await screen.findByRole('heading', { name: 'Amazing Grace' })).toBeInTheDocument();
    expect(preview().getByText('Key: G')).toBeInTheDocument();
    expect(preview().getAllByText('Amazing')).toHaveLength(1);
    expect(preview().getByText('(repeat)')).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Amazing Grace'));

    await user.click(screen.getByRole('checkbox', { name: /Collapse repeated sections/ }));
    expect(preview().getAllByText('Amazing')).toHaveLength(2);
    expect(preview().queryByText('(repeat)')).toBeNull();

    expect(chordsShown()).toEqual(['G', 'C', 'D', 'G', 'C']);
    await user.click(screen.getByRole('checkbox', { name: /Chords as Roman numerals/ }));
    expect(chordsShown()).toEqual(['I', 'IV', 'V', 'I', 'IV']);
  });

  it('downloads the PDF with the options chosen, named after the song', async () => {
    const user = userEvent.setup();
    renderAt('/pdf?song=grace');
    await user.click(await screen.findByRole('checkbox', { name: /Chords as Roman numerals/ }));
    await user.click(screen.getByRole('button', { name: 'Export PDF' }));

    await waitFor(() => expect(exportPdf).toHaveBeenCalledTimes(1));
    const [fileName, title, songs, options] = vi.mocked(exportPdf).mock.calls[0]!;
    expect([fileName, title]).toEqual(['Amazing Grace.pdf', 'Amazing Grace']);
    expect(songs.map((s) => [s.song.title, s.semitones])).toEqual([['Amazing Grace', 0]]);
    expect(options).toEqual({ collapseRepeats: true, numerals: true });
  });

  it('says so when the PDF could not be made', async () => {
    const user = userEvent.setup();
    vi.mocked(exportPdf).mockRejectedValueOnce(new Error('offline'));
    renderAt('/pdf?song=grace');
    await user.click(await screen.findByRole('button', { name: 'Export PDF' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't make the PDF.");
  });

  it('exports a setlist with each song in its key, noting a changed key', async () => {
    const user = userEvent.setup();
    await db.setlists.add({
      id: 'gig', name: 'Friday gig', updatedAt: 0,
      songs: [{ id: '1', songId: 'grace', key: 'A' }, { id: '2', songId: 'house', key: '' }],
    });
    renderAt('/pdf?setlist=gig');

    expect(await screen.findByText('[Key of A (+2 semitones from the original)]')).toBeInTheDocument();
    expect(preview().getByText('Key: A')).toBeInTheDocument();
    expect(chordsShown().slice(0, 3)).toEqual(['A', 'D', 'E']);
    // Played as written, in the key its chords point to.
    expect(preview().getByText('Key: Am')).toBeInTheDocument();
    expect(preview().getAllByRole('article')).toHaveLength(2);
    await waitFor(() => expect(document.title).toBe('Friday gig'));

    await user.click(screen.getByRole('button', { name: 'Export PDF' }));
    await waitFor(() => expect(exportPdf).toHaveBeenCalledTimes(1));
    const [fileName, , songs] = vi.mocked(exportPdf).mock.calls[0]!;
    expect(fileName).toBe('Friday gig.pdf');
    expect(songs.map((s) => [s.song.key, s.semitones])).toEqual([['A', 2], ['Am', 0]]);
  });

  it('exports the songs ticked in the library as a songbook', async () => {
    const user = userEvent.setup();
    renderAt('/pdf');

    const house = await screen.findByRole('checkbox', { name: /House of the Rising Sun/ });
    expect(preview().getByText('Tick the songs to export.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeDisabled();

    await user.click(house);
    expect(preview().getAllByRole('article')).toHaveLength(1);
    expect(preview().getByRole('heading', { name: 'House of the Rising Sun' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Tick all' }));
    expect(preview().getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Amazing Grace',
      'House of the Rising Sun',
    ]);
  });

  it('is opened from the editor, with the way back to the song', async () => {
    const user = userEvent.setup();
    renderAt('/songs/grace');
    expect(await screen.findByRole('link', { name: 'Export PDF…' })).toHaveAttribute('href', '/pdf');
    await user.click(screen.getByRole('button', { name: 'Export PDF' }));
    expect(await screen.findByRole('heading', { name: 'Export PDF' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Amazing Grace' })).toHaveAttribute('href', '/songs/grace');
  });

  it('names the file after the title, without letters file names cannot have', () => {
    expect(pdfFileName('AC/DC: Back in Black?')).toBe('ACDC Back in Black.pdf');
    expect(pdfFileName('///')).toBe('Songs.pdf');
  });
});
