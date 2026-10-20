/* Small UI pieces shared by the Shot List and Storyboard modules. */
import './shared.css';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { create } from 'zustand';
import { ImageOff } from 'lucide-react';
import type { Shot } from '@/types';
import type { SceneInfo } from '@/derived/script';
import { sceneLabel } from '@/derived/script';
import { assetUrl } from '@/backend';
import { STRIP_COLORS, type Option } from '@/lib/constants';
import { Button, Field, Modal, Select } from '@/ui';
import { UNASSIGNED } from './shotData';

/* ------------------------------------------------------------------ frame image */

/** Storyboard frame: image (cover) with the transparent drawing stacked on top. */
export function FrameView({
  shot,
  aspect,
  style,
  className,
  placeholder,
  height,
}: {
  shot: Pick<Shot, 'image' | 'drawing'>;
  aspect: number;
  style?: CSSProperties;
  className?: string;
  placeholder?: ReactNode;
  /** fixed height in px (width follows the aspect) */
  height?: number;
}) {
  const img = assetUrl(shot.image);
  const drw = assetUrl(shot.drawing);
  const empty = !img && !drw;
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        overflow: 'hidden',
        aspectRatio: String(aspect),
        ...(height ? { height, width: Math.round(height * aspect) } : { width: '100%' }),
        background: img ? '#000' : drw ? '#fff' : 'var(--bg-sunken)',
        ...style,
      }}
    >
      {img && <img src={img} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
      {drw && <img src={drw} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', display: 'block' }} />}
      {empty && placeholder}
    </div>
  );
}

/** Thumbnail used in tables; shows a muted icon when the frame is empty. */
export function FrameThumb({ shot, aspect, height = 40, title, onClick }: { shot: Pick<Shot, 'image' | 'drawing'>; aspect: number; height?: number; title?: string; onClick?: () => void }) {
  const w = Math.max(24, Math.min(110, Math.round(height * aspect)));
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{ border: '1px solid var(--border)', borderRadius: 4, padding: 0, overflow: 'hidden', cursor: onClick ? 'pointer' : 'default', display: 'block', width: w, height, background: 'none', flexShrink: 0 }}
    >
      <FrameView
        shot={shot}
        aspect={w / height}
        placeholder={
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
            <ImageOff size={Math.min(14, height - 10)} />
          </div>
        }
      />
    </button>
  );
}

/* ------------------------------------------------------------------ scene tag */

export function stripColor(scene: SceneInfo | undefined): { bg: string; fg: string } {
  if (!scene) return { bg: 'var(--bg-active)', fg: 'var(--text-2)' };
  if (scene.meta?.color) return { bg: scene.meta.color, fg: '#fff' };
  return STRIP_COLORS[scene.stripKey] ?? STRIP_COLORS.OTHER;
}

/** Scene number pill in the stripboard colour. */
export function SceneTag({ scene, style }: { scene: SceneInfo | undefined; style?: CSSProperties }) {
  const c = stripColor(scene);
  return (
    <span
      title={scene ? sceneLabel(scene) : 'Unassigned'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 26,
        height: 22,
        padding: '0 7px',
        borderRadius: 6,
        fontWeight: 700,
        fontSize: 12,
        background: c.bg,
        color: c.fg,
        border: '1px solid rgba(0,0,0,0.14)',
        fontVariantNumeric: 'tabular-nums',
        flexShrink: 0,
        ...style,
      }}
    >
      {scene ? scene.number : '—'}
    </span>
  );
}

/* ------------------------------------------------------------------ compact select */

/** Native <select> showing a short value when closed and full labels in the dropdown. */
export function CompactSelect({
  value,
  onChange,
  options,
  placeholder = '—',
  display,
  title,
  className,
  style,
  allowEmpty = true,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  options: Option[];
  placeholder?: string;
  /** what to show when closed (default: the value) */
  display?: ReactNode;
  title?: string;
  className?: string;
  style?: CSSProperties;
  allowEmpty?: boolean;
}) {
  const known = !value || options.some((o) => o.value === value);
  return (
    <span className={['shots-cselect', className].filter(Boolean).join(' ')} style={style} title={title ?? options.find((o) => o.value === value)?.label}>
      <span className={value ? 'val' : 'val empty'}>{value ? display ?? value : placeholder}</span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} aria-label={title}>
        {allowEmpty && <option value="">{placeholder === '—' ? 'None' : placeholder}</option>}
        {!known && <option value={value}>{value}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}

/* ------------------------------------------------------------------ scene picker dialog */

interface PickReq {
  title: string;
  message?: string;
  scenes: SceneInfo[];
  current?: string;
  confirmLabel: string;
  resolve: (key: string | null) => void;
}

const usePicker = create<{ req: PickReq | null }>(() => ({ req: null }));

/** Ask the user for a scene (or Unassigned). Resolves with a group key or null. Needs <ScenePickerHost/>. */
export function pickScene(opts: { title: string; message?: string; scenes: SceneInfo[]; current?: string; confirmLabel?: string }): Promise<string | null> {
  return new Promise((resolve) => usePicker.setState({ req: { confirmLabel: 'Move', ...opts, resolve } }));
}

export function ScenePickerHost() {
  const req = usePicker((s) => s.req);
  const [value, setValue] = useState('');
  useEffect(() => {
    if (req) setValue(req.current && req.current !== '' ? req.current : req.scenes[0]?.id ?? UNASSIGNED);
  }, [req]);
  useEffect(() => () => usePicker.setState({ req: null }), []);
  if (!req) return null;
  const done = (v: string | null) => {
    usePicker.setState({ req: null });
    req.resolve(v);
  };
  const options = [...req.scenes.map((s) => ({ value: s.id, label: sceneLabel(s) })), { value: UNASSIGNED, label: req.scenes.length ? 'Unassigned (no scene)' : 'No scene' }];
  return (
    <Modal
      open
      size="sm"
      title={req.title}
      onClose={() => done(null)}
      footer={
        <>
          <Button onClick={() => done(null)}>Cancel</Button>
          <Button variant="primary" onClick={() => done(value)}>
            {req.confirmLabel}
          </Button>
        </>
      }
    >
      {req.message && <div className="muted" style={{ marginBottom: 10 }}>{req.message}</div>}
      <Field label="Scene">
        <Select
          value={value}
          onChange={setValue}
          options={options}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') done(value);
          }}
        />
      </Field>
    </Modal>
  );
}
