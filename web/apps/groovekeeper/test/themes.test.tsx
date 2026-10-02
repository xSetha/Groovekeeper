import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { setTheme } from '../src/themes';

afterEach(() => setTheme('amp'));

describe('themes', () => {
  it('switches the theme from the top bar and remembers it', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Theme: Amp' }));
    await user.click(screen.getByRole('button', { name: /Songbook/ }));

    expect(document.documentElement.dataset.theme).toBe('songbook');
    expect(localStorage.getItem('groovekeeper.theme')).toBe('songbook');
    expect(screen.getByRole('button', { name: 'Theme: Songbook' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Theme' })).not.toBeInTheDocument();
  });

  it('puts the keyboard on the theme in use, and back on the button after Escape', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    const toggle = screen.getByRole('button', { name: 'Theme: Amp' });
    await user.click(toggle);
    expect(screen.getByRole('button', { name: /^Amp/, pressed: true })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: 'Theme' })).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });
});
