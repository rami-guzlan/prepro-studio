/* Animatic player: plays storyboard frames in order using each shot's duration. */
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Pause, Play, Repeat, SkipBack, SkipForward } from 'lucide-react';
import type { Shot } from '@/types';
import type { SceneInfo } from '@/derived/script';
import { assetUrl } from '@/backend';
import { formatSeconds } from '@/lib/format';
import { Kbd, Modal } from '@/ui';
import { FrameView } from '../shots/components';
import { shotSeconds, shotSpecs, shotTitle } from '../shots/shotData';
import { useFitBox } from './useFit';

export interface AnimaticItem {
  shot: Shot;
  scene?: SceneInfo;
}

function clock(t: number): string {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const tenths = Math.floor((s * 10) % 10);
  return `${m}:${String(sec).padStart(2, '0')}.${tenths}`;
}

export function AnimaticPlayer({ items, startIndex = 0, aspect, title, onClose }: { items: AnimaticItem[]; startIndex?: number; aspect: number; title?: string; onClose: () => void }) {
  const { starts, total } = useMemo(() => {
    const st: number[] = [];
    let acc = 0;
    for (const it of items) {
      st.push(acc);
      acc += shotSeconds(it.shot);
    }
    return { starts: st, total: acc };
  }, [items]);

  const [t, setT] = useState(() => starts[Math.min(Math.max(0, startIndex), Math.max(0, items.length - 1))] ?? 0);
  const [playing, setPlaying] = useState(true);
  const [loop, setLoop] = useState(false);
  const tRef = useRef(t);
  tRef.current = t;
  const { ref: stageRef, box } = useFitBox(aspect, 20);
  const barRef = useRef<HTMLDivElement>(null);
  const scrubbing = useRef(false);

  const indexAt = (time: number) => {
    let i = 0;
    for (let k = 0; k < starts.length; k++) if (starts[k] <= time + 1e-6) i = k;
    return i;
  };
  const index = indexAt(Math.min(t, Math.max(0, total - 1e-3)));
  const cur = items[index];

  // playback clock
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (!scrubbing.current) {
        let next = tRef.current + dt;
        if (next >= total) {
          if (loop) next = 0;
          else {
            next = total;
            setPlaying(false);
          }
        }
        tRef.current = next;
        setT(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, loop, total]);

  // preload the next frames
  useEffect(() => {
    for (const it of items.slice(index + 1, index + 3)) {
      for (const n of [it.shot.image, it.shot.drawing]) {
        const url = assetUrl(n);
        if (url) {
          const img = new Image();
          img.src = url;
        }
      }
    }
  }, [index, items]);

  const seek = (time: number) => {
    const v = Math.max(0, Math.min(total, time));
    tRef.current = v;
    setT(v);
  };
  const togglePlay = () => {
    if (!playing && tRef.current >= total - 1e-3) seek(0);
    setPlaying((p) => !p);
  };
  const prev = () => {
    const i = indexAt(tRef.current);
    seek(tRef.current - starts[i] > 0.6 || i === 0 ? starts[i] : starts[i - 1]);
  };
  const next = () => {
    const i = indexAt(tRef.current);
    if (i < items.length - 1) seek(starts[i + 1]);
    else seek(total);
  };

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ' ' || e.key === 'k') {
      e.preventDefault();
      const active = document.activeElement as HTMLElement | null;
      if (active && active !== document.body) active.blur();
      togglePlay();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      next();
    } else if (e.key === 'Home') {
      e.preventDefault();
      seek(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      seek(total);
    } else if (e.key === 'l') setLoop((l) => !l);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const scrubTo = (e: { clientX: number }) => {
    const r = barRef.current?.getBoundingClientRect();
    if (!r || !total) return;
    seek(((e.clientX - r.left) / r.width) * total);
  };
  const onBarDown = (e: RPointerEvent<HTMLDivElement>) => {
    scrubbing.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    scrubTo(e);
  };

  if (!items.length) {
    return (
      <Modal open onClose={onClose} title="Animatic" size="sm">
        <div className="muted">There are no frames to play. Omitted shots are skipped.</div>
      </Modal>
    );
  }

  const specs = cur ? shotSpecs(cur.shot) : '';
  return (
    <Modal
      open
      size="full"
      onClose={onClose}
      title={
        <span className="row" style={{ gap: 10 }}>
          Animatic{title ? <span className="muted small" style={{ fontWeight: 500 }}>{title}</span> : null}
        </span>
      }
      headerExtra={<span className="muted small">{items.length} frames · {formatSeconds(total)}</span>}
      bodyStyle={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0b0b0e' }}
    >
      <div className="sb-anim-stage" ref={stageRef} onClick={togglePlay}>
        {cur && box.w > 0 && (
          <div className="sb-anim-frame" style={{ width: box.w, height: box.h }}>
            <FrameView
              key={cur.shot.id}
              shot={cur.shot}
              aspect={aspect}
              style={{ width: '100%', height: '100%' }}
              placeholder={
                <div className="sb-anim-empty">
                  <span>{shotTitle(cur.shot, cur.scene)}</span>
                  <small>No image yet</small>
                </div>
              }
            />
          </div>
        )}
        {!playing && (
          <div className="sb-anim-paused">
            <Play />
          </div>
        )}
      </div>
      {cur && (
        <div className="sb-anim-caption">
          <div className="sb-anim-cap-head">
            <span className="sb-anim-code">{shotTitle(cur.shot, cur.scene)}</span>
            {specs && <span className="sb-anim-specs">{specs}</span>}
            <span className="spacer" />
            <span className="sb-anim-specs">{formatSeconds(shotSeconds(cur.shot))}</span>
          </div>
          {cur.shot.description && <div className="sb-anim-desc">{cur.shot.description}</div>}
          {cur.shot.audio && <div className="sb-anim-audio">{cur.shot.audio}</div>}
        </div>
      )}
      <div className="sb-anim-controls">
        <button type="button" className="sb-anim-btn" onClick={prev} title="Previous frame (←)">
          <SkipBack />
        </button>
        <button type="button" className="sb-anim-btn main" onClick={togglePlay} title="Play / pause (Space)">
          {playing ? <Pause /> : <Play />}
        </button>
        <button type="button" className="sb-anim-btn" onClick={next} title="Next frame (→)">
          <SkipForward />
        </button>
        <span className="sb-anim-time">
          {clock(t)} <span>/ {clock(total)}</span>
        </span>
        <div
          className="sb-anim-bar"
          ref={barRef}
          onPointerDown={onBarDown}
          onPointerMove={(e) => scrubbing.current && scrubTo(e)}
          onPointerUp={() => (scrubbing.current = false)}
          onPointerCancel={() => (scrubbing.current = false)}
        >
          {items.map((it, i) => (
            <span
              key={it.shot.id}
              className={['sb-anim-seg', i === index && 'on', i < index && 'done'].filter(Boolean).join(' ')}
              style={{ left: `${(starts[i] / total) * 100}%`, width: `${(shotSeconds(it.shot) / total) * 100}%` }}
              title={shotTitle(it.shot, it.scene)}
            />
          ))}
          <span className="sb-anim-head" style={{ left: `${total ? (t / total) * 100 : 0}%` }} />
        </div>
        <span className="sb-anim-count">
          {index + 1} / {items.length}
        </span>
        <button type="button" className={['sb-anim-btn', loop && 'on'].filter(Boolean).join(' ')} onClick={() => setLoop(!loop)} title="Loop (L)">
          <Repeat />
        </button>
        <span className="sb-anim-keys">
          <Kbd>Space</Kbd> play · <Kbd>←</Kbd>
          <Kbd>→</Kbd> frames · <Kbd>Esc</Kbd> close
        </span>
      </div>
    </Modal>
  );
}
