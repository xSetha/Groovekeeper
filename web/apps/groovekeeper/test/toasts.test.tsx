import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { Toasts } from '../src/components/Toasts';
import { db } from '../src/library/db';
import { dismissToast, reportUncaughtErrors, toast } from '../src/toasts';

// The toasts' titles, in the order they're shown.
const shown = () => [...document.querySelectorAll('[role=status], [role=alert]')].map((t) => t.querySelector('p')?.textContent);

afterEach(() => vi.useRealTimers());

describe('toasts', () => {
  it("closes a confirmation after a few seconds, and keeps an error until it's closed", async () => {
    vi.useFakeTimers();
    render(<Toasts />);
    act(() => {
      toast('success', 'Exported Amazing Grace.pdf');
      toast('error', "Couldn't make the PDF");
    });
    expect(shown()).toEqual(['Exported Amazing Grace.pdf', "Couldn't make the PDF"]);
    act(() => void vi.advanceTimersByTime(5000));
    expect(shown()).toEqual(["Couldn't make the PDF"]);

    vi.useRealTimers();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(shown()).toEqual([]);
  });

  it("shows three at most, the oldest that isn't an error making way, and doesn't stack the same one", () => {
    render(<Toasts />);
    act(() => {
      toast('error', 'First error');
      toast('success', 'Saved');
      toast('error', 'Second error');
      toast('error', 'Second error');
      toast('info', 'Newest');
    });
    expect(shown()).toEqual(['First error', 'Second error', 'Newest']);
  });

  it('takes away a toast by its key, and a new one with the key replaces it', () => {
    render(<Toasts />);
    act(() => {
      toast('error', 'Couldn’t save “A”', '', 'save:a');
      toast('error', 'Couldn’t save “A” again', '', 'save:a');
    });
    expect(shown()).toEqual(['Couldn’t save “A” again']);
    act(() => dismissToast('save:a'));
    expect(shown()).toEqual([]);
  });

  it('reports an error nothing else caught, but not another site’s script', () => {
    const target = new EventTarget() as Window;
    reportUncaughtErrors(target);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Toasts />);
    act(() => {
      target.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }));
      target.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: new Error('Database closed') }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrongDatabase closed');
  });
});

describe('a page that fails', () => {
  it('shows what happened and a way on, instead of a blank page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const Broken = () => {
      throw new Error('boom');
    };
    render(
      <ErrorBoundary resetKey="/">
        <Broken />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });
});

describe('a song that could not be saved', () => {
  it('says so until a save works again', async () => {
    const text = 'Amazing Grace\n\n[Verse 1]\nAmazing grace\n';
    await db.songs.add({ id: 'grace', title: 'Amazing Grace', artist: '', key: '', text, updatedAt: 0, version: 0, dirty: 1 });
    render(
      <MemoryRouter initialEntries={['/songs/grace']}>
        <App />
      </MemoryRouter>,
    );
    const [line] = await screen.findAllByRole('textbox', { name: 'Lyrics' });
    const put = vi.spyOn(db.songs, 'put').mockRejectedValueOnce(new Error('QuotaExceededError'));
    const user = userEvent.setup();
    await user.type(line!, '!');
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn\'t save “Amazing Grace”');

    put.mockRestore();
    await user.type(line!, '!');
    await vi.waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect((await db.songs.get('grace'))?.text).toContain('Amazing grace!!');
  });
});
