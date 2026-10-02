import { useLayoutEffect, useState } from 'react';

/**
 * The width in pixels of one letter of the monospace font as styled by `className` (which sets its size);
 * 0 until it's measured. Chords are placed by letter, so dragging and fitting lines need this number.
 */
export function useCharWidth(className: string): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const probe = document.createElement('span');
    probe.className = `${className} font-mono invisible absolute whitespace-pre`;
    probe.textContent = '0'.repeat(100);
    document.body.append(probe);
    const measure = () => setWidth(probe.getBoundingClientRect().width / 100);
    measure();
    // The font may still be loading; measure again once it is.
    void document.fonts?.ready.then(measure);
    return () => probe.remove();
  }, [className]);
  return width;
}
