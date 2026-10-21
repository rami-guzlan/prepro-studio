/* Timelapse: one photo per day for a pose, played on a canvas like a video with
   a date (and weight) overlay. Speed 1–30 fps, loop, scrub, date range, and
   Export video (canvas → MediaRecorder → WebM → saved with saveBinaryFile). */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, Download, Film, Pause, Play, Repeat, SkipBack, SkipForward, X } from 'lucide-react';
import { Button, Checkbox, DateInput, EmptyState, IconButton, Select, toast } from '@/ui';
import { saveBinaryFile } from '@/backend';
import { useSpaceFormatters } from '@/store/space';
import { POSES, type Pose, type ProgressPhoto, type TrainingData } from '../../types';
import { drawFit, loadPhoto } from '../../photoStore';
import { unitKit } from '../../units';
import { weightSeries } from '../../calc';
import { useTraining } from '../../ui';

/** One photo per day (the last of the day) for a pose, oldest first. */
export function dailyFrames(t: TrainingData, pose: Pose, from?: string, to?: string): ProgressPhoto[] {
  const byDay = new Map<string, ProgressPhoto>();
  for (const p of t.photos) if (p.pose === pose && (!from || p.date >= from) && (!to || p.date <= to)) byDay.set(p.date, p);
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const W = 720;

function pickMime(): string {
  const options = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  for (const m of options) if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  return '';
}

export function Timelapse({ pose, setPose }: { pose: Pose; setPose: (p: Pose) => void }) {
  const t = useTraining();
  const fmt = useSpaceFormatters();
  const u = unitKit(t.profile.units);
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();
  const frames = useMemo(() => dailyFrames(t, pose, from, to), [t, pose, from, to]);
  const weights = useMemo(() => weightSeries(t), [t]);
  const [imgs, setImgs] = useState<(HTMLImageElement | null)[]>([]);
  const [loaded, setLoaded] = useState(0);
  const [idx, setIdx] = useState(0);
  const idxRef = useRef(0);
  idxRef.current = idx;
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(6);
  const [loop, setLoop] = useState(true);
  const [showDate, setShowDate] = useState(true);
  const [showWeight, setShowWeight] = useState(true);
  const [exporting, setExporting] = useState<number | null>(null);
  const cancelExport = useRef(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = useMemo(() => {
    const first = imgs.find(Boolean);
    const ar = first ? first.naturalHeight / Math.max(1, first.naturalWidth) : 4 / 3;
    return { w: W, h: Math.round(Math.min(1.8, Math.max(0.56, ar)) * W) };
  }, [imgs]);

  const sig = useMemo(() => frames.map((f) => f.asset).join('|'), [frames]);

  // load frames (only when the set of photos changes)
  useEffect(() => {
    let alive = true;
    setImgs([]);
    setLoaded(0);
    setIdx(0);
    setPlaying(false);
    const out: (HTMLImageElement | null)[] = new Array(frames.length).fill(null);
    let n = 0;
    frames.forEach((f, i) =>
      loadPhoto(f.asset)
        .then((img) => {
          out[i] = img;
        })
        .catch(() => undefined)
        .finally(() => {
          n++;
          if (!alive) return;
          setLoaded(n);
          if (n === frames.length || n % 8 === 0) setImgs([...out]);
        }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const weightOn = useCallback(
    (date: string) => {
      let w: number | undefined;
      for (const p of weights) {
        if (p.date > date) break;
        w = p.kg;
      }
      return w;
    },
    [weights],
  );

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, i: number) => {
      const { w, h } = size;
      ctx.fillStyle = '#111114';
      ctx.fillRect(0, 0, w, h);
      const img = imgs[i];
      const f = frames[i];
      if (img) drawFit(ctx, img, 0, 0, w, h, 'contain');
      if (!f) return;
      const pad = 18;
      const band = 64;
      const g = ctx.createLinearGradient(0, h - band - 30, 0, h);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.65)');
      ctx.fillStyle = g;
      ctx.fillRect(0, h - band - 30, w, band + 30);
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'alphabetic';
      ctx.font = '600 28px Inter, "Segoe UI", system-ui, sans-serif';
      if (showDate) ctx.fillText(fmt.dateMedium(f.date), pad, h - pad - 4);
      const wkg = weightOn(f.date);
      if (showWeight && wkg != null) {
        ctx.textAlign = 'right';
        ctx.fillText(u.weight(wkg), w - pad, h - pad - 4);
        ctx.textAlign = 'left';
      }
      ctx.font = '500 18px Inter, "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(`Day ${i + 1} / ${frames.length}`, pad, pad + 14);
    },
    [size, imgs, frames, showDate, showWeight, fmt, u, weightOn],
  );

  // render current frame
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) draw(ctx, Math.min(idx, Math.max(0, frames.length - 1)));
  }, [draw, idx, frames.length, size]);

  // playback
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const step = (now: number) => {
      acc += now - last;
      last = now;
      const dt = 1000 / fps;
      if (acc >= dt) {
        acc %= dt;
        const i = idxRef.current;
        const next = i + 1 < frames.length ? i + 1 : loop ? 0 : -1;
        if (next < 0) setPlaying(false);
        else {
          idxRef.current = next;
          setIdx(next);
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, fps, loop, frames.length]);

  // keyboard: space play/pause, arrows step
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === 'ArrowRight') setIdx((i) => Math.min(frames.length - 1, i + 1));
      else if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [frames.length]);

  const exportVideo = async () => {
    const mime = pickMime();
    if (!mime) {
      toast('Video recording is not supported in this window.', 'error');
      return;
    }
    if (loaded < frames.length) {
      toast('Still loading photos — try again in a moment.', 'info');
      return;
    }
    setPlaying(false);
    cancelExport.current = false;
    const c = document.createElement('canvas');
    c.width = size.w;
    c.height = size.h;
    const ctx = c.getContext('2d')!;
    draw(ctx, 0);
    const stream = c.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((res) => (rec.onstop = () => res()));
    rec.start(250);
    const hold = 1000 / fps;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    setExporting(0);
    try {
      for (let i = 0; i < frames.length; i++) {
        if (cancelExport.current) break;
        draw(ctx, i);
        setExporting(i + 1);
        await wait(hold);
      }
      if (!cancelExport.current) await wait(Math.max(800, hold));
    } finally {
      rec.stop();
      await stopped;
      stream.getTracks().forEach((x) => x.stop());
    }
    if (cancelExport.current) {
      setExporting(null);
      toast('Export cancelled', 'info');
      return;
    }
    const blob = new Blob(chunks, { type: 'video/webm' });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    setExporting(null);
    const name = `Progress timelapse - ${pose} - ${frames[0].date} to ${frames[frames.length - 1].date}.webm`;
    try {
      const path = await saveBinaryFile(name, bytes, [{ name: 'WebM video', extensions: ['webm'] }]);
      if (path) toast(`Saved ${path.split(/[\\/]/).pop()}`);
    } catch (e) {
      toast(`Could not save the video: ${e instanceof Error ? e.message : e}`, 'error');
    }
  };

  const allPoseDays = useMemo(() => dailyFrames(t, pose), [t, pose]);

  return (
    <div className="tr-page">
      <div className="tr-tl-controls">
        <Select value={pose} onChange={(v) => setPose(v as Pose)} options={POSES.map((p) => ({ value: p.value, label: `${p.label} (${dailyFrames(t, p.value).length})` }))} aria-label="Pose" />
        <DateInput size="sm" value={from} onChange={setFrom} title="From" />
        <span className="muted">–</span>
        <DateInput size="sm" value={to} onChange={setTo} title="To" />
        {(from || to) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setFrom(undefined);
              setTo(undefined);
            }}
          >
            All days
          </Button>
        )}
        <div className="spacer" />
        <Checkbox checked={showDate} onChange={setShowDate} label="Date" />
        <Checkbox checked={showWeight} onChange={setShowWeight} label="Weight" />
      </div>
      {frames.length === 0 ? (
        <EmptyState icon={Film} title={allPoseDays.length ? 'No photos in this range' : `No ${pose} photos yet`} description="Take one photo a day in the same pose and the timelapse builds itself — one frame per day, played like a video so slow changes become visible." />
      ) : (
        <div className="tr-tl">
          <div className="tr-tl-stage">
            <canvas ref={canvas} width={size.w} height={size.h} aria-label={`Timelapse of ${frames.length} ${pose} photos`} />
            {loaded < frames.length && (
              <div className="tr-tl-loading">
                Loading {loaded}/{frames.length}…
              </div>
            )}
          </div>
          <div className="tr-tl-bar">
            <IconButton icon={SkipBack} label="First frame" onClick={() => setIdx(0)} />
            <Button variant="primary" icon={playing ? Pause : Play} onClick={() => setPlaying(!playing)} disabled={frames.length < 2} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? 'Pause' : 'Play'}
            </Button>
            <IconButton icon={SkipForward} label="Last frame" onClick={() => setIdx(frames.length - 1)} />
            <input className="tr-tl-scrub" type="range" min={0} max={Math.max(0, frames.length - 1)} value={Math.min(idx, frames.length - 1)} onChange={(e) => setIdx(Number(e.target.value))} aria-label="Scrub" />
            <span className="small nowrap">{frames[Math.min(idx, frames.length - 1)] ? fmt.dateShort(frames[Math.min(idx, frames.length - 1)].date) : ''}</span>
          </div>
          <div className="tr-tl-bar">
            <span className="small muted nowrap">Speed</span>
            <input type="range" min={1} max={30} value={fps} onChange={(e) => setFps(Number(e.target.value))} aria-label="Frames per second" className="tr-tl-speed" />
            <b className="small nowrap" style={{ width: 52 }}>{fps} fps</b>
            <Button size="sm" icon={Repeat} active={loop} onClick={() => setLoop(!loop)} aria-pressed={loop}>
              Loop
            </Button>
            <span className="muted small nowrap">{(frames.length / fps).toFixed(1)} s</span>
            <div className="spacer" />
            {exporting != null ? (
              <>
                <span className="small">
                  Recording {exporting}/{frames.length}…
                </span>
                <IconButton icon={X} label="Cancel export" onClick={() => (cancelExport.current = true)} />
              </>
            ) : (
              <Button icon={Download} onClick={exportVideo} disabled={frames.length < 2}>
                Export video
              </Button>
            )}
          </div>
          <p className="tr-note">
            <Clapperboard size={13} /> Space plays / pauses, ← → step. Export records in real time ({(frames.length / fps + 1).toFixed(0)} s) as a WebM video — keep this window visible while it records.
          </p>
        </div>
      )}
    </div>
  );
}
