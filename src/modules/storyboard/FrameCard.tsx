/* One storyboard frame card (image + drawing, number, specs and inline text). */
import { memo, useState, type CSSProperties, type MouseEvent, type Ref } from 'react';
import type { DraggableSyntheticListeners } from '@dnd-kit/core';
import { Brush, Clock, ImagePlus, MoreHorizontal, Pencil, Sparkles, Volume2 } from 'lucide-react';
import type { Shot, ShotStatus } from '@/types';
import { LENSES, SHOT_MOVEMENTS, SHOT_SIZES, SHOT_STATUSES } from '@/lib/constants';
import { Menu, NumberInput, openContextMenu, Textarea, type MenuItem } from '@/ui';
import { CompactSelect, FrameView } from '../shots/components';
import { DEFAULT_FRAME_SECONDS, isOmitted, shotOps } from '../shots/shotData';

export interface CardApi {
  aspect: number;
  select: (e: MouseEvent, id: string) => void;
  edit: (id: string) => void;
  pickImage: (id: string) => void;
  dropFiles: (id: string, files: File[]) => void;
  menu: (id: string) => MenuItem[];
  wasDragging: () => boolean;
}

export interface CardShow {
  description: boolean;
  specs: boolean;
  audio: boolean;
}

export const FrameCard = memo(function FrameCard({
  shot,
  sceneNumber,
  api,
  show,
  selected,
  flash,
  dragging,
  nodeRef,
  activatorRef,
  listeners,
  style,
}: {
  shot: Shot;
  sceneNumber?: string;
  api: CardApi;
  show: CardShow;
  selected: boolean;
  flash?: boolean;
  dragging?: boolean;
  nodeRef?: Ref<HTMLDivElement>;
  activatorRef?: (el: HTMLElement | null) => void;
  listeners?: DraggableSyntheticListeners;
  style?: CSSProperties;
}) {
  const [fileOver, setFileOver] = useState(false);
  const up = (patch: Partial<Shot>) => shotOps.update(shot.id, patch);
  const empty = !shot.image && !shot.drawing;
  const status = SHOT_STATUSES.find((o) => o.value === shot.status);
  return (
    <div
      ref={nodeRef}
      style={style}
      data-frame={shot.id}
      className={['sb-card', selected && 'selected', flash && 'flash', dragging && 'dragging', isOmitted(shot) && 'omitted'].filter(Boolean).join(' ')}
      onMouseDown={(e) => api.select(e, shot.id)}
      onContextMenu={(e) => {
        const t = e.target as HTMLElement;
        if (t.closest('input,textarea,select')) return;
        openContextMenu(e, api.menu(shot.id));
      }}
    >
      <div
        ref={activatorRef}
        {...listeners}
        className={['sb-media', fileOver && 'file-over', empty && 'empty'].filter(Boolean).join(' ')}
        title={empty ? 'Click to add an image · drop or paste (Ctrl+V) · double-click to draw' : 'Double-click to edit & sketch · drag to reorder'}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          api.edit(shot.id);
        }}
        onClick={(e) => {
          if (api.wasDragging() || !empty || e.ctrlKey || e.metaKey || e.shiftKey || e.detail > 1) return;
          if ((e.target as HTMLElement).closest('button')) return;
          api.pickImage(shot.id);
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'copy';
          if (!fileOver) setFileOver(true);
        }}
        onDragLeave={() => setFileOver(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          e.stopPropagation();
          setFileOver(false);
          api.dropFiles(shot.id, Array.from(e.dataTransfer.files));
        }}
      >
        <FrameView
          shot={shot}
          aspect={api.aspect}
          placeholder={
            <div className="sb-empty">
              <ImagePlus />
              <span>Drop, paste or click</span>
              <button
                type="button"
                className="sb-empty-draw"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  api.edit(shot.id);
                }}
              >
                <Brush size={12} /> Sketch
              </button>
            </div>
          }
        />
        <span className="sb-num" title={sceneNumber ? `Scene ${sceneNumber}, shot ${shot.number}` : `Shot ${shot.number}`}>
          {shot.number || '—'}
        </span>
        <span className="sb-badges">
          {shot.vfx && <span className="sb-badge vfx">VFX</span>}
          {shot.status !== 'planned' && status && (
            <span className="sb-badge" style={{ background: status.color }}>
              {status.label}
            </span>
          )}
        </span>
        <span className="sb-tools" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" className="sb-tool" title="Edit & sketch (Enter)" onClick={() => api.edit(shot.id)}>
            <Pencil />
          </button>
          <Menu
            align="end"
            trigger={
              <button type="button" className="sb-tool" title="More actions" aria-label="Frame actions">
                <MoreHorizontal />
              </button>
            }
            items={() => api.menu(shot.id)}
          />
        </span>
        {shot.drawing && shot.image && (
          <span className="sb-layer" title="Has a sketch layer over the image">
            <Sparkles />
          </span>
        )}
      </div>
      <div className="sb-body">
        {show.specs && (
          <div className="sb-specs">
            <CompactSelect className="chip-like" value={shot.shotSize} onChange={(v) => up({ shotSize: v })} options={SHOT_SIZES} placeholder="Size" title="Shot size" />
            <CompactSelect className="chip-like" value={shot.movement} onChange={(v) => up({ movement: v })} options={SHOT_MOVEMENTS} placeholder="Movement" title="Camera movement" />
            <CompactSelect className="chip-like" value={shot.lens} onChange={(v) => up({ lens: v })} options={LENSES} placeholder="Lens" title="Lens" />
          </div>
        )}
        {show.description && (
          <Textarea bare autoGrow minRows={1} className="sb-desc" value={shot.description} onChange={(v) => up({ description: v })} placeholder="Action / description" aria-label="Description" />
        )}
        {show.audio && (
          <div className="sb-audio">
            <Volume2 />
            <Textarea bare autoGrow minRows={1} value={shot.audio} onChange={(v) => up({ audio: v || undefined })} placeholder="Dialogue / VO / SFX" aria-label="Audio" />
          </div>
        )}
        <div className="sb-foot">
          <span className="sb-dur" title="Screen time in the animatic (seconds)">
            <Clock />
            <NumberInput bare size="sm" value={shot.duration} onChange={(v) => up({ duration: v != null && v > 0 ? v : undefined })} placeholder={String(DEFAULT_FRAME_SECONDS)} style={{ width: 40 }} />
            <span>s</span>
          </span>
          <span className="spacer" />
          <CompactSelect
            className="chip-like"
            value={shot.status}
            onChange={(v) => up({ status: (v as ShotStatus) || 'planned' })}
            options={SHOT_STATUSES}
            allowEmpty={false}
            title="Status"
            display={
              <>
                <span className="shots-status-dot" style={{ background: status?.color ?? '#888' }} />
                {status?.label ?? shot.status}
              </>
            }
          />
        </div>
      </div>
    </div>
  );
});

/** Lightweight copy shown under the pointer while dragging. */
export function FrameCardGhost({ shot, aspect, width }: { shot: Shot; aspect: number; width: number }) {
  return (
    <div className="sb-card sb-ghost" style={{ width }}>
      <div className="sb-media">
        <FrameView shot={shot} aspect={aspect} />
        <span className="sb-num">{shot.number || '—'}</span>
      </div>
      {shot.description && <div className="sb-ghost-text">{shot.description}</div>}
    </div>
  );
}
