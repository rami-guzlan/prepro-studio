/* Phone layout detection. Keep PHONE_QUERY in sync with the phone media queries
   in src/styles/phone.css (max-width: 760px). */
import { useSyncExternalStore } from 'react';

export const PHONE_QUERY = '(max-width: 760px)';

const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(PHONE_QUERY) : null;

export function isPhone() {
  return !!mq?.matches;
}

function subscribe(cb: () => void) {
  mq?.addEventListener('change', cb);
  return () => mq?.removeEventListener('change', cb);
}

/** True while the window is phone-sized (re-renders when that changes). */
export function useIsPhone() {
  return useSyncExternalStore(subscribe, isPhone, () => false);
}

/** Coarse pointer (finger): use tap alternatives for drag and drop and hover-only controls. */
export function isTouch() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
}
