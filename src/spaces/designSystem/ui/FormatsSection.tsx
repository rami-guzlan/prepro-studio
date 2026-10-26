/* Design system › Formats: output sizes and production specs, with one-click presets. */
import { Frame, Plus } from 'lucide-react';
import type { DSFormat } from '../types';
import { Button, Checkbox, Field, Input, NumberInput, Select } from '@/ui';
import { dsAdd, dsMove, dsPatch, dsRemove } from '../ops';
import { FORMAT_PRESETS, aspectOf } from './options';
import { ItemActions, SectionHead, Teach, confirmRemove, useDS } from './shared';

function Shape({ f }: { f: DSFormat }) {
  const w = f.width ?? 0;
  const h = f.height ?? 0;
  if (!w || !h) return <div className="ds-fmt-shape none" aria-hidden />;
  const max = 64;
  const s = max / Math.max(w, h);
  return (
    <div className="ds-fmt-shapebox" aria-hidden>
      <div className={`ds-fmt-shape ${f.transparent ? 'transparent' : ''}`} style={{ width: Math.max(8, w * s), height: Math.max(8, h * s) }} />
    </div>
  );
}

function FormatRow({ f, index, count }: { f: DSFormat; index: number; count: number }) {
  const up = (patch: Partial<DSFormat>, coalesce = true) => dsPatch('formats', f.id, patch, coalesce);
  const opt = (v: string) => v || undefined;
  const auto = aspectOf(f.width, f.height);
  return (
    <div className="ds-fmt" data-ds-id={f.id}>
      <Shape f={f} />
      <div className="ds-fmt-fields">
        <Input size="sm" className="strong ds-fmt-name" value={f.name} placeholder="e.g. LinkedIn post" aria-label="Format name" onChange={(name) => up({ name })} />
        <div className="ds-fmt-size">
          <NumberInput size="sm" value={f.width} placeholder="W" aria-label="Width" onChange={(width) => up({ width })} />
          <span className="muted">×</span>
          <NumberInput size="sm" value={f.height} placeholder="H" aria-label="Height" onChange={(height) => up({ height })} />
          <Select size="sm" value={f.unit ?? 'px'} options={['px', 'pt', 'mm']} aria-label="Unit" onChange={(v) => up({ unit: v === 'px' ? undefined : (v as DSFormat['unit']) }, false)} />
        </div>
        <Field label="Aspect">
          <Input size="sm" value={f.aspect} placeholder={auto || 'e.g. 4:5'} onChange={(v) => up({ aspect: opt(v) })} />
        </Field>
        <Field label="Safe area">
          <Input size="sm" value={f.safeArea} placeholder="e.g. 60px on every side" onChange={(v) => up({ safeArea: opt(v) })} />
        </Field>
        <Field label="Min. text">
          <Input size="sm" value={f.minText} placeholder="e.g. 28px" onChange={(v) => up({ minText: opt(v) })} />
        </Field>
        <Field label="Background">
          <div className="row" style={{ gap: 6 }}>
            <Input size="sm" value={f.background} disabled={f.transparent} placeholder={f.transparent ? 'Transparent' : 'e.g. solid black'} onChange={(v) => up({ background: opt(v) })} />
            <Checkbox checked={f.transparent} onChange={(v) => up({ transparent: v || undefined }, false)} label="Transparent" />
          </div>
        </Field>
        <Field label="Resolution">
          <Input size="sm" value={f.resolution} placeholder="e.g. 2x, 300 dpi" onChange={(v) => up({ resolution: opt(v) })} />
        </Field>
        <Field label="Notes" className="ds-fmt-notes">
          <Input size="sm" value={f.notes} placeholder="Room for copy, small-screen readability, print bleed…" onChange={(v) => up({ notes: opt(v) })} />
        </Field>
      </div>
      <ItemActions
        index={index}
        count={count}
        onMove={(a, b) => dsMove('formats', a, b)}
        label="format"
        onDelete={async () => {
          if (await confirmRemove(`the format “${f.name || 'Untitled'}”`, !!(f.safeArea || f.notes))) dsRemove('formats', [f.id]);
        }}
      />
    </div>
  );
}

export function FormatsSection() {
  const ds = useDS();
  const addPreset = (p: (typeof FORMAT_PRESETS)[number]) => {
    const { label: _l, ...rest } = p;
    const id = dsAdd('formats', rest);
    setTimeout(() => document.querySelector(`[data-ds-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 40);
  };
  const addBlank = () => {
    const id = dsAdd('formats', { name: '' });
    setTimeout(() => document.querySelector<HTMLInputElement>(`[data-ds-id="${id}"] input`)?.focus(), 40);
  };
  const presets = (
    <div className="ds-presets">
      <span className="muted small">Presets:</span>
      {FORMAT_PRESETS.map((p) => {
        const has = ds.formats.some((f) => f.name === p.name && f.width === p.width && f.height === p.height);
        return (
          <button key={p.label} type="button" className={`ds-preset ${has ? 'has' : ''}`} title={has ? 'Already added' : `${p.width}×${p.height} ${p.unit}`} onClick={() => addPreset(p)}>
            <Plus size={12} /> {p.label} <span className="muted">{p.width}×{p.height}{p.unit !== 'px' ? ` ${p.unit}` : ''}</span>
          </button>
        );
      })}
      <button type="button" className="ds-preset" onClick={addBlank}>
        <Plus size={12} /> Custom
      </button>
    </div>
  );
  return (
    <div className="ds-section">
      <SectionHead icon={Frame} title="Formats" intro="The sizes you produce and what each needs: safe areas, the smallest readable text, background, resolution and room for copy. Briefs and layouts point at these." />
      {presets}
      {ds.formats.length === 0 ? (
        <div className="ds-card">
          <Teach icon={Frame} title="Give every output a spec">
            Pick a preset above or add a custom size. A generator that knows the safe area and minimum text size leaves room where your copy and logo will go.
          </Teach>
        </div>
      ) : (
        <div className="ds-card ds-fmts">
          {ds.formats.map((f, i) => (
            <FormatRow key={f.id} f={f} index={i} count={ds.formats.length} />
          ))}
        </div>
      )}
    </div>
  );
}
