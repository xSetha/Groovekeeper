// Dragging with a mouse or a finger, one code path for both. A mouse drag starts once the pointer has
// moved a few pixels. A touch drag starts only after the finger has been held still for a moment, so
// swiping over a chord still scrolls the page; once the drag has started, scrolling is held off.
import type { PointerEvent as ReactPointerEvent } from 'react';

const MOUSE_THRESHOLD_PX = 3;
const TOUCH_HOLD_MS = 250;
// A finger wobbles; moving further than this before the hold is over is a scroll, not a press.
const TOUCH_SLOP_PX = 8;

export interface DragHandlers {
  /** The drag has started (the mouse moved, or the finger was held). */
  onStart?: () => void;
  onMove: (event: PointerEvent) => void;
  /** The drag is over: dropped with the event, or cancelled with null. */
  onEnd: (event: PointerEvent | null) => void;
  /** Pressed and released without dragging. */
  onTap?: () => void;
}

export function trackDrag(down: ReactPointerEvent, handlers: DragHandlers): void {
  if (down.pointerType === 'mouse' && down.button !== 0) return;
  const touch = down.pointerType !== 'mouse';
  const { pointerId, clientX: startX, clientY: startY } = down;
  let active = false;
  let last: PointerEvent | null = null;

  const start = () => {
    active = true;
    handlers.onStart?.();
    if (last) handlers.onMove(last);
  };
  const hold = touch ? setTimeout(start, TOUCH_HOLD_MS) : undefined;

  const move = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    last = event;
    if (!active) {
      const distance = Math.hypot(event.clientX - startX, event.clientY - startY);
      if (touch) {
        if (distance > TOUCH_SLOP_PX) finish(null, false); // a scroll: let the browser have it
        return;
      }
      if (distance < MOUSE_THRESHOLD_PX) return;
      start();
      return;
    }
    handlers.onMove(event);
  };
  const up = (event: PointerEvent) => event.pointerId === pointerId && finish(event, true);
  const cancel = (event: PointerEvent) => event.pointerId === pointerId && finish(null, false);
  // Once a touch drag has started, the page must not scroll under the finger.
  const holdScroll = (event: TouchEvent) => active && event.preventDefault();

  function finish(event: PointerEvent | null, released: boolean) {
    clearTimeout(hold);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('touchmove', holdScroll);
    if (active) handlers.onEnd(event);
    else if (released) handlers.onTap?.();
  }

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('touchmove', holdScroll, { passive: false });
}
