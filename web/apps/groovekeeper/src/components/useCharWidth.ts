import { useLayoutEffect, useState } from 'react';

/**
 * The width in pixels of one letter of the monospace font as styled by `className` (which sets its size);
 * 0 until it's measured. Chords are placed by letter, so dragging and fitting lines need this number.
 */
export function useCharWidth(className: string): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    // The measured text is wide (100 letters); a zero-size box that clips it keeps it from widening the
    // page, which on a phone would let the page zoom out over empty space.
    const box = document.createElement('div');
    box.className = 'invisible absolute top-0 left-0 size-0 overflow-hidden';
    const probe = document.createElement('span');
    probe.className = `${className} font-mono whitespace-pre`;
    probe.textContent = '0'.repeat(100);
    box.append(probe);
    document.body.append(box);
    const measure = () => setWidth(probe.getBoundingClientRect().width / 100);
    measure();
    // The font may still be loading; measure again once it is.
    void document.fonts?.ready.then(measure);
    return () => box.remove();
  }, [className]);
  return width;
}
