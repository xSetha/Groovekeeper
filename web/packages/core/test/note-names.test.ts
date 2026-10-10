import { describe, expect, it } from 'vitest';
import { displayChord, fromSolfege, normalizeChord, toSolfege } from '../src';

// What the shared solfege.json fixture doesn't cover: how typed text is taken.
describe('normalizeChord', () => {
  it.each([
    ['Am7', 'Am7'], // letters stay as typed
    [' Am7 ', 'Am7'],
    ['lam7', 'Am7'], // Do Re Mi become letters
    ['Sib/Re', 'Bb/D'],
    ['Domino', null], // neither
    ['', null],
  ])('%j is %j', (typed, expected) => {
    expect(normalizeChord(typed)).toBe(expected);
  });
});

describe('displayChord', () => {
  it('writes the chord in the chosen naming', () => {
    expect(displayChord('Am', 'letters')).toBe('Am');
    expect(displayChord('Am', 'solfege')).toBe('Lam');
    expect(displayChord('N.C.', 'solfege')).toBe('N.C.');
  });
});

describe('typing what was shown', () => {
  it.each(['C', 'F#m7', 'Bbmaj7/D', 'G/B'])('%s comes back as the same chord', (chord) => {
    expect(fromSolfege(toSolfege(chord))).toBe(chord);
  });
});
