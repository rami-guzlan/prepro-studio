/* Brand Kit & Assets: one component per section (logos, colours, fonts, images, files & links). */
import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Copy, Download, ExternalLink, FileText, FolderOpen, GripVertical, Link2, Maximize2, Megaphone, Pencil, Pipette, Plus, Trash2, TriangleAlert, Upload } from 'lucide-react';
import type { ID } from '@/types';
import type { BrandAsset } from '@/spaces/types';
import { assetUrl } from '@/backend';
import { Button, ColorPicker, IconButton, ImageDrop, Input, Popover, type AnchorRect } from '@/ui';
import { useSpace } from '@/store/space';
import { navigateSpace, readLS, writeLS } from '@/store/app';
import { RESOURCE_TYPES } from '@/spaces/constants';
import { optionColor, optionLabel } from '@/lib/constants';
import { sortCampaigns } from '@/spaces/modules/campaigns/logic';
import { addImageAssets, assetOps, canOpenValue, copyText, deleteAsset, fontAvailable, HexInput, openUrl, openValue, useTileDrag } from './actions';
import { fontStack, hexToRgb, inkOn, normalizeHex, type SectionDef } from './util';
import { GatedBadge, ResourceIcon, ResourceList, downloadResource, dropResources, formatBytes, pickResources, useFileDrop } from './resources';

export interface TileHandlers {
  onEdit: (id: ID) => void;
  onTag: (tag: string) => void;
  activeTags: string[];
}

/** Enter opens, Delete removes — only when the tile itself (not an input in it) has focus. */
function tileKeys(a: BrandAsset, onEdit: (id: ID) => void, onOpen?: () => void) {
  return (e: KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      (onOpen ?? (() => onEdit(a.id)))();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      void deleteAsset(a);
    }
  };
}

function Tags({ tags, h }: { tags?: string[]; h: TileHandlers }) {
  if (!tags?.length) return null;
  return (
    <div className="sp-assets-tags">
      {tags.map((t) => (
        <button
          key={t}
          type="button"
          className={`sp-assets-tag ${h.activeTags.includes(t) ? 'on' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            h.onTag(t);
          }}
          title={`Filter by “${t}”`}
        >
          #{t}
        </button>
      ))}
    </div>
  );
}

function TileActions({ a, h, extra, drag }: { a: BrandAsset; h: TileHandlers; extra?: ReactNode; drag?: ReturnType<ReturnType<typeof useTileDrag>['handleProps']> }) {
  return (
    <div className="sp-assets-actions" onClick={(e) => e.stopPropagation()}>
      {drag && (
        <span className="sp-assets-grip" title="Drag to reorder" {...drag}>
          <GripVertical size={13} />
        </span>
      )}
      {extra}
      <button type="button" className="btn sm icon" title="Edit details" aria-label="Edit details" onClick={() => h.onEdit(a.id)}>
        <Pencil />
      </button>
      <button type="button" className="btn sm icon" title="Delete" aria-label="Delete" onClick={() => void deleteAsset(a)}>
        <Trash2 />
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- section shell */

export function SectionShell({
  def,
  count,
  total,
  collapsed,
  onToggle,
  actions,
  children,
}: {
  def: SectionDef;
  count: number;
  total: number;
  collapsed: boolean;
  onToggle: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const Icon = def.icon;
  return (
    <section className={`sp-assets-section ${collapsed ? 'collapsed' : ''}`} id={`sp-assets-${def.id}`}>
      <div className="sp-assets-section-head">
        <button type="button" className="sp-assets-section-toggle" aria-expanded={!collapsed} onClick={onToggle}>
          {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
          <Icon size={15} className="sp-assets-section-icon" />
          <span className="sp-assets-section-title">{def.title}</span>
          <span className="badge">{count === total ? total : `${count} of ${total}`}</span>
          {!collapsed && <span className="muted small ellipsis sp-assets-section-hint">{def.hint}</span>}
        </button>
        <div className="spacer" />
        {actions}
      </div>
      {!collapsed && <div className="sp-assets-section-body">{children}</div>}
    </section>
  );
}

/* ---------------------------------------------------------------- logos */

export function LogosGrid({ items, h, canAdd }: { items: BrandAsset[]; h: TileHandlers; canAdd: boolean }) {
  const drag = useTileDrag();
  return (
    <div className="sp-assets-grid logos">
      {items.map((a) => (
        <div key={a.id} data-tile data-id={a.id} className={`sp-assets-tile sp-assets-logo ${drag.tileClass(a.id)}`} tabIndex={0} onKeyDown={tileKeys(a, h.onEdit)} {...drag.targetProps(a.id)}>
          <div className="sp-assets-logo-stage">
            <ImageDrop value={a.image} onChange={(image) => assetOps.update(a.id, { image })} aspect={4 / 3} contain label="Drop logo file" />
          </div>
          <div className="sp-assets-tile-meta">
            <Input bare size="sm" value={a.name} placeholder="Logo name" aria-label="Logo name" onChange={(name) => assetOps.update(a.id, { name })} />
            {a.notes?.trim() && <div className="sp-assets-note ellipsis" title={a.notes}>{a.notes}</div>}
            <Tags tags={a.tags} h={h} />
          </div>
          <TileActions a={a} h={h} drag={items.length > 1 ? drag.handleProps(a.id) : undefined} />
        </div>
      ))}
      {canAdd && (
        <div className="sp-assets-addtile">
          <ImageDrop value={undefined} onChange={(n) => n && addImageAssets([n], 'logo')} onMultiple={(names) => addImageAssets(names, 'logo')} aspect={4 / 3} contain label={items.length ? 'Add another logo' : 'Drop your logo (PNG / SVG) or click'} />
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- colours */

function ColorTile({ a, h, drag }: { a: BrandAsset; h: TileHandlers; drag: ReturnType<typeof useTileDrag> }) {
  const [pick, setPick] = useState<AnchorRect | null>(null);
  const hex = normalizeHex(a.value);
  const rgb = hex ? hexToRgb(hex) : null;
  const ink = inkOn(hex ?? undefined);
  return (
    <div data-tile data-id={a.id} className={`sp-assets-tile sp-assets-color ${drag.tileClass(a.id)}`} {...drag.targetProps(a.id)}>
      <button
        type="button"
        className={`sp-assets-swatch ${hex ? '' : 'empty'}`}
        style={{ background: hex ?? undefined, color: ink }}
        onClick={() => hex && copyText(hex)}
        onKeyDown={(e) => {
          if (e.key === 'Delete') {
            e.preventDefault();
            void deleteAsset(a);
          }
        }}
        title={hex ? `Copy ${hex}` : 'Set a hex value below'}
        aria-label={hex ? `Copy ${hex}` : 'No colour value'}
      >
        {hex ? (
          <span className="sp-assets-swatch-copy">
            <Copy size={13} /> Copy
          </span>
        ) : (
          <span className="sp-assets-swatch-copy show">
            <TriangleAlert size={13} /> No valid hex
          </span>
        )}
      </button>
      <div className="sp-assets-tile-meta">
        <Input bare size="sm" className="strong" value={a.name} placeholder="Colour name" aria-label="Colour name" onChange={(name) => assetOps.update(a.id, { name })} />
        <div className="row" style={{ gap: 4 }}>
          <HexInput value={a.value} onChange={(value) => assetOps.update(a.id, { value })} className="sp-assets-hex" />
          <IconButton
            icon={Pipette}
            label="Pick colour"
            size="sm"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setPick({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
            }}
          />
        </div>
        {rgb && <div className="sp-assets-rgb mono">RGB {rgb.join(' ')}</div>}
        {a.notes?.trim() && <div className="sp-assets-note ellipsis" title={a.notes}>{a.notes}</div>}
        <Tags tags={a.tags} h={h} />
      </div>
      <TileActions a={a} h={h} drag={drag.handleProps(a.id)} />
      <Popover anchor={pick} onClose={() => setPick(null)}>
        <div className="sp-assets-picker">
          <ColorPicker value={hex ?? undefined} onChange={(v) => v && assetOps.update(a.id, { value: v })} />
        </div>
      </Popover>
    </div>
  );
}

export function ColorsGrid({ items, h, onAdd }: { items: BrandAsset[]; h: TileHandlers; onAdd?: () => void }) {
  const drag = useTileDrag();
  return (
    <div className="sp-assets-grid colors">
      {items.map((a) => (
        <ColorTile key={a.id} a={a} h={h} drag={drag} />
      ))}
      {onAdd && (
        <button type="button" className="sp-assets-addbtn color" onClick={onAdd}>
          <Plus />
          <span>{items.length ? 'Add colour' : 'Add your first brand colour'}</span>
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- fonts */

export function FontsList({ items, h, sample, onAdd }: { items: BrandAsset[]; h: TileHandlers; sample: string; onAdd?: () => void }) {
  const drag = useTileDrag(true);
  return (
    <div className="sp-assets-fonts">
      {items.map((a) => {
        const fam = a.value?.trim();
        const ok = fam ? fontAvailable(fam) : false;
        return (
          <div key={a.id} data-tile data-id={a.id} className={`sp-assets-tile sp-assets-font ${drag.tileClass(a.id)}`} tabIndex={0} onKeyDown={tileKeys(a, h.onEdit)} {...drag.targetProps(a.id)}>
            <div className="sp-assets-font-info">
              <Input bare size="sm" className="sp-assets-font-family" value={a.value} placeholder="Font family, e.g. Bebas Neue" aria-label="Font family" onChange={(value) => assetOps.update(a.id, { value })} />
              <Input bare size="sm" value={a.name} placeholder="Role, e.g. Headlines" aria-label="Font role" onChange={(name) => assetOps.update(a.id, { name })} />
              {fam && !ok && (
                <span className="sp-assets-font-missing" title="This font is not installed on this computer, so the sample uses a fallback.">
                  <TriangleAlert size={12} /> Not installed
                </span>
              )}
              <Tags tags={a.tags} h={h} />
            </div>
            <div className="sp-assets-font-sample" style={{ fontFamily: fontStack(fam) }} title={fam ? `${fam}${ok ? '' : ' (fallback shown)'}` : undefined}>
              <div className="big ellipsis">{sample}</div>
              <div className="small">ABCDEFGHIJKLM abcdefghijklm 0123456789 &amp;?!</div>
              {a.notes?.trim() && <div className="sp-assets-font-notes">{a.notes}</div>}
            </div>
            <TileActions
              a={a}
              h={h}
              drag={items.length > 1 ? drag.handleProps(a.id) : undefined}
              extra={
                a.url?.trim() ? (
                  <button type="button" className="btn sm icon" title="Open download / licence link" aria-label="Open link" onClick={() => openUrl(a.url)}>
                    <ExternalLink />
                  </button>
                ) : null
              }
            />
          </div>
        );
      })}
      {onAdd && (
        <button type="button" className="sp-assets-addbtn row-add" onClick={onAdd}>
          <Plus />
          <span>{items.length ? 'Add font' : 'Add your headline and body fonts'}</span>
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- images */

export function ImagesGallery({ items, h, onOpen, canAdd }: { items: BrandAsset[]; h: TileHandlers; onOpen: (id: ID) => void; canAdd: boolean }) {
  const drag = useTileDrag();
  return (
    <div className="sp-assets-grid images">
      {items.map((a) => (
        <div
          key={a.id}
          data-tile
          data-id={a.id}
          className={`sp-assets-tile sp-assets-image ${drag.tileClass(a.id)}`}
          tabIndex={0}
          onClick={() => onOpen(a.id)}
          onKeyDown={tileKeys(a, h.onEdit, () => onOpen(a.id))}
          title="Click to view"
          {...drag.targetProps(a.id)}
        >
          <div className="sp-assets-image-frame">{a.image ? <img src={assetUrl(a.image)} alt={a.name ?? ''} draggable={false} /> : <span className="muted small">No image</span>}</div>
          {(a.name?.trim() || a.tags?.length) && (
            <div className="sp-assets-image-cap">
              {a.name?.trim() && <div className="ellipsis">{a.name}</div>}
              <Tags tags={a.tags} h={h} />
            </div>
          )}
          <TileActions
            a={a}
            h={h}
            drag={items.length > 1 ? drag.handleProps(a.id) : undefined}
            extra={
              <button type="button" className="btn sm icon" title="View" aria-label="View" onClick={() => onOpen(a.id)}>
                <Maximize2 />
              </button>
            }
          />
        </div>
      ))}
      {canAdd && (
        <div className="sp-assets-addtile">
          <ImageDrop value={undefined} onChange={(n) => n && addImageAssets([n])} onMultiple={(names) => addImageAssets(names)} aspect={4 / 3} label={items.length ? 'Add images' : 'Drop reference images or click (several at once)'} />
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- templates, media, links & documents */

export function FileList({ items, h, def, onAdd }: { items: BrandAsset[]; h: TileHandlers; def: SectionDef; onAdd?: () => void }) {
  const drag = useTileDrag(true);
  const Icon = def.icon;
  return (
    <div className="sp-assets-files">
      {items.map((a) => {
        const RowIcon = a.kind === 'doc' ? FileText : a.kind === 'link' ? Link2 : Icon;
        const isRes = a.kind === 'resource' || !!a.file;
        const where = a.file ? [a.fileName, formatBytes(a.fileSize), a.url].filter((x) => x?.trim()).join(' · ') : a.kind === 'link' || a.kind === 'resource' ? a.url : a.value || a.url;
        const typeColor = a.resourceType ? optionColor(RESOURCE_TYPES, a.resourceType) : undefined;
        return (
          <div key={a.id} data-tile data-id={a.id} className={`sp-assets-tile sp-assets-file ${drag.tileClass(a.id)}`} tabIndex={0} onKeyDown={tileKeys(a, h.onEdit)} onDoubleClick={(e) => {
              if (!(e.target as HTMLElement).closest('input, button')) h.onEdit(a.id);
            }} {...drag.targetProps(a.id)}>
            <div className="sp-assets-file-thumb">{a.image ? <img src={assetUrl(a.image)} alt="" draggable={false} /> : isRes ? <ResourceIcon a={a} /> : <RowIcon size={18} />}</div>
            <div className="sp-assets-file-main">
              <Input bare size="sm" className="strong" value={a.name} placeholder="Name" aria-label="Name" onChange={(name) => assetOps.update(a.id, { name })} />
              <div className="sp-assets-file-where ellipsis" title={where}>
                {where?.trim() ? where : <span className="muted">{a.kind === 'link' ? 'No link yet: click the pencil to add one' : isRes ? 'No file yet: click the pencil to upload one' : 'No file or link yet'}</span>}
              </div>
              {a.notes?.trim() && <div className="sp-assets-note ellipsis" title={a.notes}>{a.notes}</div>}
            </div>
            {a.resourceType && (
              <span className="sp-res-type" style={{ ['--rt' as string]: typeColor }}>
                {optionLabel(RESOURCE_TYPES, a.resourceType)}
              </span>
            )}
            {a.gated && <GatedBadge />}
            <Tags tags={a.tags} h={h} />
            <div className="sp-assets-file-open">
              {a.file && <IconButton icon={Maximize2} label="Open" size="sm" onClick={() => h.onEdit(a.id)} />}
              {a.file && <IconButton icon={Download} label="Download" size="sm" onClick={() => void downloadResource(a)} />}
              {!a.file && canOpenValue(a.value) && a.kind !== 'link' && <IconButton icon={FolderOpen} label="Open file" size="sm" onClick={() => openValue(a.value)} />}
              {a.url?.trim() && <IconButton icon={ExternalLink} label="Open link" size="sm" onClick={() => openUrl(a.url)} />}
            </div>
            <TileActions a={a} h={h} drag={items.length > 1 ? drag.handleProps(a.id) : undefined} />
          </div>
        );
      })}
      {onAdd && (
        <button type="button" className="sp-assets-addbtn row-add" onClick={onAdd}>
          <Plus />
          <span>{def.addLabel}</span>
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- links & documents: general + per campaign */

function CampaignGroup({ c, items, closed, onToggle, onOpen }: { c: { id: string; name: string; color: string }; items: BrandAsset[]; closed: boolean; onToggle: () => void; onOpen: (id: ID) => void }) {
  const drop = useFileDrop((files) => void dropResources(files, { campaignId: c.id }));
  const gated = items.filter((a) => a.gated).length;
  return (
    <div className={`sp-res-group ${closed ? 'closed' : ''} ${drop.over ? 'over' : ''}`} style={{ ['--cc' as string]: c.color || 'var(--accent)' }} {...drop.props} data-campaign-group={c.id}>
      <div className="sp-res-group-head">
        <button type="button" className="sp-res-group-toggle" aria-expanded={!closed} onClick={onToggle}>
          {closed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          <span className="sp-res-group-dot" />
          <span className="sp-res-group-name ellipsis">{c.name || 'Untitled campaign'}</span>
          <span className="badge">{items.length}</span>
          {gated > 0 && <span className="muted small">{gated} gated</span>}
        </button>
        <div className="spacer" />
        <Button size="sm" variant="ghost" icon={Upload} onClick={() => void pickResources({ campaignId: c.id })}>
          Upload
        </Button>
        <IconButton icon={Megaphone} size="sm" label="Open the campaign" onClick={() => navigateSpace('campaigns', { campaignId: c.id })} />
      </div>
      {!closed && (
        <div className="sp-res-group-body">
          <ResourceList items={items} onOpen={onOpen} empty={drop.over ? 'Drop to add' : 'No resources yet: upload files or drop them here.'} />
        </div>
      )}
    </div>
  );
}

/** Links & documents: general items, then a dropdown per campaign with its resources. */
export function LinksSection({ items, h, def, onAdd, filtering }: { items: BrandAsset[]; h: TileHandlers; def: SectionDef; onAdd?: () => void; filtering: boolean }) {
  const campaigns = useSpace((s) => s.campaigns);
  const sorted = useMemo(() => sortCampaigns(campaigns ?? []), [campaigns]);
  const known = useMemo(() => new Set(sorted.map((c) => c.id)), [sorted]);
  const general = items.filter((a) => !a.campaignId || !known.has(a.campaignId));
  const [closed, setClosed] = useState<string[]>(() => readLS<string[]>('prepro.sp-assets.campaignsClosed', []));
  const toggle = (id: string) =>
    setClosed((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      writeLS('prepro.sp-assets.campaignsClosed', next);
      return next;
    });
  const groups = sorted.map((c) => ({ c, list: items.filter((a) => a.campaignId === c.id) })).filter((g) => !filtering || g.list.length > 0);
  return (
    <div className="sp-res-links">
      {(general.length > 0 || onAdd) && <FileList items={general} h={h} def={def} onAdd={onAdd} />}
      {groups.length > 0 && (
        <div className="sp-res-groups">
          <div className="sp-res-groups-title">Resources by campaign</div>
          {groups.map(({ c, list }) => (
            <CampaignGroup key={c.id} c={c} items={list} closed={!filtering && closed.includes(c.id)} onToggle={() => toggle(c.id)} onOpen={h.onEdit} />
          ))}
        </div>
      )}
    </div>
  );
}
