/* Webcam capture with a translucent "ghost" of the last photo in the same pose,
   so every day's photo lines up. Optional countdown, mirrored preview (the photo
   is saved exactly as previewed so ghost and photo always match). */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, FlipHorizontal2, Ghost, Timer } from 'lucide-react';
import { Button, Modal, Select, toast } from '@/ui';
import { assetUrl } from '@/backend';
import { POSES, type Pose } from '../../types';
import { storePhoto } from '../../photoStore';
import { useToday, useTraining } from '../../ui';

const NEXT_POSE: Record<Pose, Pose> = { front: 'side', side: 'back', back: 'front', other: 'other' };

export function CaptureModal({ initialPose = 'front', onClose }: { initialPose?: Pose; onClose: () => void }) {
  const t = useTraining();
  const today = useToday();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [pose, setPose] = useState<Pose>(initialPose);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [ghost, setGhost] = useState(true);
  const [opacity, setOpacity] = useState(0.35);
  const [mirror, setMirror] = useState(true);
  const [delay, setDelay] = useState('0');
  const [count, setCount] = useState<number | null>(null);
  const [taken, setTaken] = useState<{ pose: Pose; url: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const previous = [...t.photos].filter((p) => p.pose === pose && p.date <= today).sort((a, b) => b.date.localeCompare(a.date))[0];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('This window has no camera access.');
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
        if (cancelled) {
          s.getTracks().forEach((x) => x.stop());
          return;
        }
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => undefined);
        }
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? (e.name === 'NotAllowedError' ? 'Camera permission was denied.' : e.name === 'NotFoundError' ? 'No camera found.' : e.message) : String(e));
      }
    })();
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((x) => x.stop());
      stream.current = null;
    };
  }, []);

  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const snap = useCallback(async () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext('2d')!;
    if (mirror) {
      ctx.translate(c.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.92));
    if (!blob) return;
    setBusy(true);
    try {
      await storePhoto(blob, today, pose);
      const url = URL.createObjectURL(blob);
      urls.current.push(url);
      setTaken((xs) => [...xs, { pose, url }]);
      toast(`Saved ${pose} photo`);
      setPose(NEXT_POSE[pose]);
    } catch (e) {
      toast(`Could not save the photo: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setBusy(false);
    }
  }, [mirror, pose, today]);

  const shoot = () => {
    const d = Number(delay);
    if (!d) {
      void snap();
      return;
    }
    let n = d;
    setCount(n);
    const id = window.setInterval(() => {
      n -= 1;
      if (n <= 0) {
        window.clearInterval(id);
        setCount(null);
        void snap();
      } else setCount(n);
    }, 1000);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Take progress photos"
      size="lg"
      footer={
        <>
          <span className="muted small">{taken.length ? `${taken.length} saved today` : 'Same spot, light and distance every time.'}</span>
          <div className="spacer" />
          <Button onClick={onClose}>Done</Button>
          <Button variant="primary" size="lg" icon={Camera} onClick={shoot} disabled={!ready || busy || count != null}>
            {count != null ? `${count}…` : `Take ${POSES.find((p) => p.value === pose)?.label.toLowerCase()} photo`}
          </Button>
        </>
      }
    >
      <div className="tr-capture">
        <div className="tr-capture-controls">
          <Select value={pose} onChange={(v) => setPose(v as Pose)} options={POSES} aria-label="Pose" />
          <Button size="sm" icon={Ghost} active={ghost} onClick={() => setGhost(!ghost)} disabled={!previous} title={previous ? `Ghost of ${previous.date}` : 'No earlier photo in this pose'}>
            Ghost
          </Button>
          {ghost && previous && <input type="range" min={0.1} max={0.7} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} aria-label="Ghost opacity" className="tr-range-sm" />}
          <Button size="sm" icon={FlipHorizontal2} active={mirror} onClick={() => setMirror(!mirror)}>
            Mirror
          </Button>
          <span className="row" style={{ gap: 4 }}>
            <Timer size={14} className="muted" />
            <Select size="sm" value={delay} onChange={setDelay} options={[{ value: '0', label: 'No timer' }, { value: '3', label: '3 s' }, { value: '5', label: '5 s' }, { value: '10', label: '10 s' }]} aria-label="Self-timer" />
          </span>
        </div>
        <div className="tr-capture-stage">
          {error ? (
            <div className="tr-capture-error">
              <CameraOff size={28} />
              <b>{error}</b>
              <span className="muted small">Allow camera access for PrePro Studio, or close this and use Upload instead.</span>
            </div>
          ) : (
            <>
              <video ref={video} playsInline muted style={{ transform: mirror ? 'scaleX(-1)' : undefined }} />
              {ghost && previous && <img className="tr-ghost" src={assetUrl(previous.asset)} alt="" style={{ opacity }} />}
              {count != null && <div className="tr-countdown">{count}</div>}
              {!ready && <div className="tr-capture-wait muted">Starting the camera…</div>}
            </>
          )}
        </div>
        {taken.length > 0 && (
          <div className="tr-capture-taken">
            {taken.map((x, i) => (
              <figure key={i}>
                <img src={x.url} alt={`${x.pose} photo`} />
                <figcaption>{x.pose}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
