/* Brand Kit & Assets: store actions and small interactive controls (tags, hex input, font check). */
import { dsForgetAssets } from '@/spaces/designSystem/ops';
import { useEffect, useState, type DragEvent } from 'react';
import { X } from 'lucide-react';
import type { ID } from '@/types';
import type { AssetKind, BrandAsset } from '@/spaces/types';
import { uid } from '@/lib/id';
import { getSpace, spaceListOps, spaceUndo, updateSpace } from '@/store/space';
import { backend } from '@/backend';
import { confirmDialog, toast } from '@/ui';
import { DEFAULT_NAMES, normalizeHex } from './util';

export const assetOps = spaceListOps<BrandAsset>((d) => d.assets, 'assets');

const NEW_COLORS = ['#7c5cff', '#141418', '#f4f1ea', '#e64980', '#15aabf', '#f08c00', '#2fb36d', '#3e8ef7'];

export function makeAsset(kind: AssetKind, patch: Partial<BrandAsset> = {}): BrandAsset {
  return { id: uid('asset'), kind, name: DEFAULT_NAMES[kind] ?? '', ...patch };
}

/** Add assets in one undo step; returns their ids. */
export function addAssets(items: BrandAsset[]): ID[] {
  if (!items.length) return [];
  updateSpace((d) => void d.assets.push(...items));
  return items.map((i) => i.id);
}

export function addColor(): ID {
  const used = new Set(getSpace().assets.filter((a) => a.kind === 'color').map((a) => normalizeHex(a.value)));
  const value = NEW_COLORS.find((c) => !used.has(c)) ?? NEW_COLORS[0];
  return addAssets([makeAsset('color', { value })])[0];
}

export function addImageAssets(names: string[], kind: AssetKind = 'image'): ID[] {
  const ids = addAssets(names.map((image, i) => makeAsset(kind, { image, name: kind === 'logo' ? (names.length > 1 ? `Logo ${i + 1}` : 'Logo') : '' })));
  if (ids.length) toast(`Added ${ids.length} ${kind === 'logo' ? (ids.length === 1 ? 'logo' : 'logos') : ids.length === 1 ? 'image' : 'images'}`);
  return ids;
}

export async function deleteAsset(a: BrandAsset): Promise<boolean> {
  const label = a.name?.trim() || (a.kind === 'color' ? a.value : '') || 'this asset';
  const ok = await confirmDialog({ title: `Delete ${label.startsWith('#') || label === 'this asset' ? label : `“${label}”`}?`, message: 'It is removed from the brand kit. You can undo with Ctrl+Z.', confirmLabel: 'Delete', danger: true });
  if (!ok) return false;
  // one undo step: the asset and every design-system link to it (references, previews, treatment examples)
  updateSpace((d) => {
    d.assets = d.assets.filter((x) => x.id !== a.id);
    dsForgetAssets(d, new Set([a.id]));
  });
  toast('Asset deleted', 'success', { action: { label: 'Undo', onClick: () => spaceUndo() } });
  return true;
}

/** Move asset `id` before / after `targetId` in the stored order. */
export function moveAsset(id: ID, targetId: ID, after: boolean) {
  if (id === targetId) return;
  updateSpace((d) => {
    const a = d.assets;
    const i = a.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [it] = a.splice(i, 1);
    const j = a.findIndex((x) => x.id === targetId);
    if (j < 0) a.splice(i, 0, it);
    else a.splice(after ? j + 1 : j, 0, it);
  });
}

export async function copyText(text: string, what?: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`Copied ${what ?? text}`);
  } catch {
    toast('Could not copy to the clipboard', 'error');
  }
}

export const webUrl = (s: string) => (/^[a-z][a-z0-9+.-]*:/i.test(s.trim()) ? s.trim() : `https://${s.trim()}`);

export function openUrl(url: string | undefined) {
  if (!url?.trim()) return;
  const u = webUrl(url);
  if (backend.openExternal) backend.openExternal(u);
  else window.open(u, '_blank', 'noopener');
}

/** Local file paths (desktop) or URLs typed into an asset's value. */
export function canOpenValue(v: string | undefined): boolean {
  const s = v?.trim() ?? '';
  if (!s) return false;
  if (/^https?:\/\//i.test(s)) return true;
  return !!backend.openPath && /^([a-z]:[\\/]|\\\\|\/)/i.test(s);
}

export function openValue(v: string | undefined) {
  const s = v?.trim() ?? '';
  if (/^https?:\/\//i.test(s)) openUrl(s);
  else if (backend.openPath) backend.openPath(s);
}

/* ---------------------------------------------------------------- font availability */

const fontCache = new Map<string, boolean>();

/** True when the font family renders differently from the generic fallbacks (= installed / loaded). */
export function fontAvailable(family: string | undefined): boolean {
  const f = (family ?? '').trim().replace(/["\\]/g, '');
  if (!f) return false;
  if (/^(serif|sans-serif|monospace|cursive|fantasy|system-ui)$/i.test(f)) return true;
  const hit = fontCache.get(f.toLowerCase());
  if (hit != null) return hit;
  let ok = false;
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx) {
      const sample = 'mmmmmmmmmmlli1WQgy@#&';
      ok = ['monospace', 'serif', 'sans-serif'].some((base) => {
        ctx.font = `64px ${base}`;
        const w0 = ctx.measureText(sample).width;
        ctx.font = `64px "${f}", ${base}`;
        return ctx.measureText(sample).width !== w0;
      });
    }
  } catch {
    ok = false;
  }
  fontCache.set(f.toLowerCase(), ok);
  return ok;
}

/* ---------------------------------------------------------------- controls */

/** Text input for a hex colour: commits valid values, normalises on blur. */
export function HexInput({ value, onChange, className }: { value: string | undefined; onChange: (hex: string) => void; className?: string }) {
  const [text, setText] = useState(value ?? '');
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value ?? '');
  }, [value, focused]);
  const valid = !!normalizeHex(text);
  return (
    <input
      className={['input', 'sm', 'mono', className, !valid && text ? 'sp-assets-invalid' : ''].filter(Boolean).join(' ')}
      value={text}
      spellCheck={false}
      placeholder="#000000"
      aria-label="Hex colour"
      onFocus={(e) => {
        setFocused(true);
        e.target.select();
      }}
      onBlur={() => {
        setFocused(false);
        const n = normalizeHex(text);
        if (n) {
          setText(n);
          if (n !== value) onChange(n);
        } else setText(value ?? '');
      }}
      onChange={(e) => {
        setText(e.target.value);
        const n = normalizeHex(e.target.value);
        if (n && n !== value) onChange(n);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setText(value ?? '');
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

let tagListId = 0;

/** Chips + free text; Enter or comma adds a tag, Backspace on empty removes the last one. */
export function TagInput({ value, onChange, suggestions = [], placeholder = 'Add tag…' }: { value: string[]; onChange: (v: string[]) => void; suggestions?: string[]; placeholder?: string }) {
  const [text, setText] = useState('');
  const [listId] = useState(() => `sp-assets-tags-${++tagListId}`);
  const add = (raw: string) => {
    const parts = raw
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean);
    const next = [...value];
    for (const t of parts) if (!next.some((v) => v.toLowerCase() === t.toLowerCase())) next.push(t);
    if (next.length !== value.length) onChange(next);
    setText('');
  };
  const left = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()));
  return (
    <div className="sp-assets-taginput input">
      {value.map((t) => (
        <span key={t} className="chip">
          {t}
          <button type="button" aria-label={`Remove tag ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        value={text}
        list={listId}
        placeholder={value.length ? '' : placeholder}
        aria-label="Add tag"
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(',')) add(v);
          else setText(v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && text.trim()) {
            e.preventDefault();
            add(text);
          } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => text.trim() && add(text)}
      />
      <datalist id={listId}>
        {left.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}

/* ---------------------------------------------------------------- tile drag & drop (reorder) */

export interface TileDrag {
  dragId: ID | null;
  over: { id: ID; after: boolean } | null;
  handleProps: (id: ID) => { draggable: true; onDragStart: (e: DragEvent<HTMLElement>) => void; onDragEnd: () => void };
  targetProps: (id: ID) => { onDragOver: (e: DragEvent<HTMLElement>) => void; onDrop: (e: DragEvent<HTMLElement>) => void };
  tileClass: (id: ID) => string;
}

const DRAG_TYPE = 'text/x-sp-asset';

export function useTileDrag(vertical = false): TileDrag {
  const [dragId, setDragId] = useState<ID | null>(null);
  const [over, setOver] = useState<{ id: ID; after: boolean } | null>(null);
  return {
    dragId,
    over,
    handleProps: (id) => ({
      draggable: true,
      onDragStart: (e) => {
        setDragId(id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData(DRAG_TYPE, id);
        const tile = (e.currentTarget as HTMLElement).closest('[data-tile]') as HTMLElement | null;
        if (tile) e.dataTransfer.setDragImage(tile, 20, 20);
      },
      onDragEnd: () => {
        setDragId(null);
        setOver(null);
      },
    }),
    targetProps: (id) => ({
      onDragOver: (e) => {
        if (!dragId || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        const after = vertical ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2;
        if (over?.id !== id || over.after !== after) setOver({ id, after });
      },
      onDrop: (e) => {
        if (!dragId || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        e.stopPropagation();
        const after = over?.id === id ? over.after : false;
        if (dragId !== id) moveAsset(dragId, id, after);
        setDragId(null);
        setOver(null);
      },
    }),
    tileClass: (id) => [dragId === id && 'dragging', over?.id === id && dragId !== id && (over.after ? 'over-after' : 'over-before')].filter(Boolean).join(' '),
  };
}
