/* Stripboard strips (one per scene) and banners, plus their sortable wrappers. */
import { memo, useEffect, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Ellipsis, MapPin, Palette, Trash2 } from 'lucide-react';
import type { ID, Location } from '@/types';
import type { SceneInfo } from '@/derived/script';
import { formatEighths } from '@/lib/format';
import { ColorPicker, Popover, type AnchorRect } from '@/ui';
import { dayNightLabel, intExtLabel, readableText, type BannerItem, type CastNum } from './logic';
import { setEstMinutes, updateBanner, removeItem } from './actions';

export interface StripData {
  scene: SceneInfo;
  cast: CastNum[];
  location?: Location;
  synopsis: string;
  bg: string;
  fg: string;
}

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

/* ---------------------------------------------------------------- est. minutes */

function EstInput({ sceneId, value }: { sceneId: ID; value?: number }) {
  const [text, setText] = useState(value != null ? String(value) : '');
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value != null ? String(value) : '');
  }, [value, focused]);
  return (
    <label className="sched-est" title="Estimated shooting time (minutes)" onPointerDown={stop} onClick={stop} onKeyDown={stop}>
      <input
        value={text}
        inputMode="numeric"
        placeholder="–"
        aria-label="Estimated minutes"
        onFocus={(e) => {
          setFocused(true);
          e.target.select();
        }}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const t = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
          setText(t);
          setEstMinutes(sceneId, t ? parseInt(t, 10) : undefined);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
        }}
      />
      <span>m</span>
    </label>
  );
}

/* ---------------------------------------------------------------- strip */

export interface StripViewProps {
  data: StripData;
  compact?: boolean;
  highlight?: boolean;
  ghost?: boolean;
  overlay?: boolean;
  onOpen?: (sceneId: ID) => void;
  onMenu?: (sceneId: ID, at: { clientX: number; clientY: number }) => void;
  onDelete?: (sceneId: ID) => void;
}

function CastBoxes({ cast, max }: { cast: CastNum[]; max?: number }) {
  const shown = max != null && cast.length > max ? cast.slice(0, max) : cast;
  return (
    <span className="sched-cast" title={cast.map((c) => `${c.label}. ${c.name}${c.actor ? ` — ${c.actor}` : ''}`).join('\n')}>
      {shown.map((c) => (
        <span key={c.id} className="sched-castbox">
          {c.label}
        </span>
      ))}
      {shown.length < cast.length && <span className="sched-castmore">+{cast.length - shown.length}</span>}
    </span>
  );
}

interface DomProps {
  domRef?: (el: HTMLElement | null) => void;
  style?: CSSProperties;
  /** dnd-kit attributes + listeners */
  extra?: Record<string, any>;
}

export const StripView = memo(function StripView({ data, compact, highlight, ghost, overlay, onOpen, onMenu, onDelete, domRef, style, extra }: StripViewProps & DomProps) {
  const { scene, cast, location, synopsis, bg, fg } = data;
  const cls = ['sched-strip', compact && 'compact', highlight && 'highlight', ghost && 'ghost', overlay && 'overlay'].filter(Boolean).join(' ');
  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    extra?.onKeyDown?.(e);
    // while this strip is being dragged with the keyboard, keys belong to dnd-kit
    if (e.defaultPrevented || ghost || e.target !== e.currentTarget) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      onOpen?.(scene.id);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && onDelete) {
      e.preventDefault();
      onDelete(scene.id);
    } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      onMenu?.(scene.id, { clientX: r.left + 40, clientY: r.bottom });
    }
  };
  const menuBtn = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    onMenu?.(scene.id, { clientX: r.left, clientY: r.bottom });
  };
  const loc: ReactNode = location ? location.name : <span className="sched-faint">No location</span>;
  const title = `${scene.number}. ${scene.heading}${synopsis ? `\n${synopsis}` : ''}${location ? `\n${location.name}` : ''}`;
  return (
    <div
      ref={domRef}
      id={overlay ? undefined : `sched-strip-${scene.id}`}
      className={cls}
      style={{ ...style, background: bg, color: fg }}
      title={title}
      {...extra}
      onKeyDown={handleKey}
      onClick={() => onOpen?.(scene.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onMenu?.(scene.id, { clientX: e.clientX, clientY: e.clientY });
      }}
    >
      {compact ? (
        <>
          <div className="sched-strip-line">
            <span className="sched-num">{scene.number}</span>
            <span className="sched-ie">{intExtLabel(scene)}</span>
            <span className="sched-set">{scene.set || 'UNTITLED SET'}</span>
            <span className="sched-dn">{dayNightLabel(scene)}</span>
            <span className="sched-pages">{formatEighths(scene.eighths)}</span>
            <button type="button" className="sched-strip-menu" aria-label="Scene actions" onPointerDown={stop} onClick={menuBtn}>
              <Ellipsis />
            </button>
          </div>
          <div className="sched-strip-line sub">
            <CastBoxes cast={cast} max={6} />
            <span className="sched-syn">{synopsis}</span>
            {scene.meta?.estMinutes ? <span className="sched-faint nowrap">{scene.meta.estMinutes}m</span> : null}
          </div>
        </>
      ) : (
        <>
          <span className="sched-num">{scene.number}</span>
          <span className="sched-ie">{intExtLabel(scene)}</span>
          <span className="sched-main">
            <span className="sched-set">{scene.set || 'UNTITLED SET'}</span>
            <span className="sched-syn">{synopsis || <span className="sched-faint">No synopsis</span>}</span>
          </span>
          <span className="sched-dn">{dayNightLabel(scene)}</span>
          <span className="sched-pages">{formatEighths(scene.eighths)}</span>
          <CastBoxes cast={cast} max={10} />
          {overlay ? <span className="sched-est">{scene.meta?.estMinutes ?? '–'}m</span> : <EstInput sceneId={scene.id} value={scene.meta?.estMinutes} />}
          <span className="sched-loc">
            <MapPin />
            <span className="ellipsis">{loc}</span>
          </span>
          <button type="button" className="sched-strip-menu" aria-label="Scene actions" onPointerDown={stop} onClick={menuBtn}>
            <Ellipsis />
          </button>
        </>
      )}
    </div>
  );
});

export const SortableStrip = memo(function SortableStrip({ dragId, container, ...props }: StripViewProps & { dragId: string; container: string }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: dragId, data: { container } });
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };
  return <StripView {...props} ghost={isDragging} domRef={setNodeRef} style={style} extra={{ ...attributes, ...listeners }} />;
});

/* ---------------------------------------------------------------- banner */

export interface BannerViewProps {
  item: BannerItem;
  dayId: ID;
  ghost?: boolean;
  overlay?: boolean;
}

export function BannerView({ item, dayId, ghost, overlay, domRef, style, extra }: BannerViewProps & DomProps) {
  const color = item.color || '#868e96';
  const fg = readableText(color);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  return (
    <div
      ref={domRef}
      className={['sched-banner', ghost && 'ghost', overlay && 'overlay'].filter(Boolean).join(' ')}
      style={{ ...style, background: color, color: fg }}
      {...extra}
      onKeyDown={(e) => {
        extra?.onKeyDown?.(e);
        if (e.defaultPrevented || e.target !== e.currentTarget) return;
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          removeItem(dayId, item.id);
        }
      }}
    >
      <button
        type="button"
        className="sched-banner-swatch"
        aria-label="Banner colour"
        title="Banner colour"
        onPointerDown={stop}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAnchor({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
        }}
      >
        <Palette />
      </button>
      <input
        className="sched-banner-text"
        value={item.text}
        placeholder="Banner text"
        aria-label="Banner text"
        onPointerDown={stop}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
        }}
        onChange={(e) => updateBanner(dayId, item.id, { text: e.target.value })}
        style={{ color: fg }}
      />
      <button type="button" className="sched-banner-del" aria-label="Remove banner" title="Remove banner" onPointerDown={stop} onClick={() => removeItem(dayId, item.id)}>
        <Trash2 />
      </button>
      <Popover anchor={anchor} onClose={() => setAnchor(null)}>
        <div style={{ padding: 6, width: 200 }}>
          <div className="section-title">Banner colour</div>
          <ColorPicker
            value={item.color}
            onChange={(c) => {
              updateBanner(dayId, item.id, { color: c ?? '#868e96' });
              setAnchor(null);
            }}
          />
        </div>
      </Popover>
    </div>
  );
}

export function SortableBanner({ dragId, container, ...props }: BannerViewProps & { dragId: string; container: string }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: dragId, data: { container } });
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };
  return <BannerView {...props} ghost={isDragging} domRef={setNodeRef} style={style} extra={{ ...attributes, ...listeners }} />;
}
