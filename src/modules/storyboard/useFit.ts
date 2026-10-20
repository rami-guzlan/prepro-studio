import { useCallback, useEffect, useRef, useState } from 'react';

/** Largest box with the given aspect ratio that fits inside an element (minus padding). */
export function useFitBox(aspect: number, pad = 24) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const roRef = useRef<ResizeObserver | null>(null);
  const aspectRef = useRef(aspect);
  aspectRef.current = aspect;
  const elRef = useRef<HTMLElement | null>(null);

  const measure = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    const W = Math.max(40, el.clientWidth - pad * 2);
    const H = Math.max(40, el.clientHeight - pad * 2);
    const a = aspectRef.current > 0 ? aspectRef.current : 16 / 9;
    let w = W;
    let h = W / a;
    if (h > H) {
      h = H;
      w = H * a;
    }
    const next = { w: Math.floor(w), h: Math.floor(h) };
    setBox((b) => (b.w === next.w && b.h === next.h ? b : next));
  }, [pad]);

  const ref = useCallback(
    (el: HTMLElement | null) => {
      roRef.current?.disconnect();
      roRef.current = null;
      elRef.current = el;
      if (!el) return;
      measure();
      roRef.current = new ResizeObserver(measure);
      roRef.current.observe(el);
    },
    [measure],
  );

  useEffect(() => {
    measure();
  }, [aspect, measure]);
  useEffect(() => () => roRef.current?.disconnect(), []);

  return { ref, box };
}
