/* Left pane: list of diagrams (add / rename / duplicate / delete) and the
   item library (collapsible categories, search, click to add, drag to drop). */
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Ellipsis, Pencil, Plus, Trash2 } from 'lucide-react';
import type { LightingDiagram } from '@/types';
import { readLS, writeLS } from '@/store/app';
import type { ScriptModel } from '@/derived/script';
import { matchesQuery } from '@/lib/text';
import { Button, IconButton, Menu, SearchInput, confirmDialog, openContextMenu, type MenuItem } from '@/ui';
import { CATEGORIES, KINDS, type Category } from './library';
import type { Palette } from './color';
import { countCameras, countLights } from './model';
import { deleteDiagram, duplicateDiagram, patchDiagram } from './ops';
import { KindIcon } from './render';
import { DRAG_MIME, newDiagramItems } from './menus';

/* ---------------------------------------------------------------- diagram list */

export function DiagramList({
  diagrams,
  activeId,
  onSelect,
  onNew,
  model,
}: {
  diagrams: LightingDiagram[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
  onNew: (templateId?: string) => void;
  model: ScriptModel;
}) {
  const [renaming, setRenaming] = useState<{ id: string; text: string } | null>(null);

  const askDelete = async (d: LightingDiagram) => {
    const n = d.items.length;
    const ok = await confirmDialog({
      title: 'Delete lighting diagram?',
      message: `“${d.name || 'Untitled'}”${n ? ` and its ${n} item${n === 1 ? '' : 's'}` : ''} will be removed. You can undo with Ctrl+Z.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const idx = diagrams.findIndex((x) => x.id === d.id);
    deleteDiagram(d.id);
    const next = diagrams[idx + 1] ?? diagrams[idx - 1];
    if (next && d.id === activeId) onSelect(next.id);
  };

  const commitRename = () => {
    if (!renaming) return;
    const name = renaming.text.trim();
    if (name) patchDiagram(renaming.id, { name });
    setRenaming(null);
  };

  const menu = (d: LightingDiagram): MenuItem[] => [
    { label: 'Rename', icon: Pencil, shortcut: 'F2', onClick: () => setRenaming({ id: d.id, text: d.name }) },
    {
      label: 'Duplicate',
      icon: Copy,
      onClick: () => {
        const c = duplicateDiagram(d.id);
        if (c) onSelect(c.id);
      },
    },
    { separator: true },
    { label: 'Delete…', icon: Trash2, danger: true, shortcut: 'Del', onClick: () => askDelete(d) },
  ];

  return (
    <div className="light-dlist">
      <div className="light-pane-head">
        <span className="section-title" style={{ margin: 0 }}>
          Diagrams
        </span>
        <span className="muted tiny">{diagrams.length}</span>
        <div className="spacer" />
        <Menu trigger={<IconButton icon={Plus} label="New diagram" size="sm" />} items={() => newDiagramItems(onNew)} align="end" />
      </div>
      <div className="light-dlist-items" role="listbox" aria-label="Lighting diagrams">
        {diagrams.map((d) => {
          const scenes = (d.sceneIds ?? []).map((id) => model.sceneById.get(id)).filter((s): s is NonNullable<typeof s> => !!s);
          const lights = countLights(d);
          const cams = countCameras(d);
          const active = d.id === activeId;
          return (
            <div
              key={d.id}
              role="option"
              aria-selected={active}
              tabIndex={0}
              className={`light-ditem ${active ? 'active' : ''}`}
              onClick={() => onSelect(d.id)}
              onDoubleClick={() => setRenaming({ id: d.id, text: d.name })}
              onContextMenu={(e) => openContextMenu(e, menu(d))}
              onKeyDown={(e) => {
                if (renaming) return;
                if (e.key === 'F2') {
                  e.preventDefault();
                  setRenaming({ id: d.id, text: d.name });
                } else if (e.key === 'Delete') {
                  e.preventDefault();
                  askDelete(d);
                } else if (e.key === 'Enter') onSelect(d.id);
              }}
            >
              <div className="grow" style={{ minWidth: 0 }}>
                {renaming?.id === d.id ? (
                  <input
                    className="input sm"
                    autoFocus
                    value={renaming.text}
                    onClick={(e) => e.stopPropagation()}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setRenaming({ id: d.id, text: e.target.value })}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                  />
                ) : (
                  <div className="light-ditem-name ellipsis">{d.name || 'Untitled diagram'}</div>
                )}
                <div className="light-ditem-meta">
                  {scenes.length > 0 && <span className="light-scene-chip">{scenes.length > 3 ? `${scenes.length} scenes` : `Sc ${scenes.map((s) => s.number).join(', ')}`}</span>}
                  <span>
                    {lights} light{lights === 1 ? '' : 's'}
                    {cams ? ` · ${cams} cam${cams === 1 ? '' : 's'}` : ''}
                  </span>
                </div>
              </div>
              <div className="light-ditem-actions" onClick={(e) => e.stopPropagation()}>
                <Menu trigger={<IconButton icon={Ellipsis} label="Diagram actions" size="sm" />} items={() => menu(d)} align="end" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- palette */

const LS_COLLAPSED = 'prepro.lighting.paletteCollapsed';

export function Library({ onAdd, pal }: { onAdd: (kind: string) => void; pal: Palette }) {
  const [q, setQ] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => readLS<Record<string, boolean>>(LS_COLLAPSED, {}));
  const groups = useMemo(() => {
    return CATEGORIES.map((c) => ({
      ...c,
      kinds: KINDS.filter((k) => k.category === c.id && matchesQuery(`${k.label} ${k.keywords ?? ''} ${c.label}`, q)),
    })).filter((g) => g.kinds.length);
  }, [q]);
  const toggle = (id: Category) => {
    const next = { ...collapsed, [id]: !collapsed[id] };
    setCollapsed(next);
    writeLS(LS_COLLAPSED, next);
  };
  const searching = q.trim() !== '';
  return (
    <div className="light-palette">
      <div className="light-pane-head">
        <span className="section-title" style={{ margin: 0 }}>
          Library
        </span>
        <div className="spacer" />
        <span className="muted tiny">click or drag</span>
      </div>
      <div style={{ padding: '0 10px 8px' }}>
        <SearchInput value={q} onChange={setQ} placeholder="Search lights, grip, set…" width="100%" />
      </div>
      <div className="light-palette-scroll">
        {groups.map((g) => {
          const open = searching || !collapsed[g.id];
          return (
            <div key={g.id} className="light-pgroup">
              <button type="button" className="light-pgroup-head" onClick={() => toggle(g.id)} aria-expanded={open}>
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span>{g.label}</span>
                <span className="muted tiny">{g.kinds.length}</span>
              </button>
              {open && (
                <div className="light-tiles">
                  {g.kinds.map((k) => (
                    <button
                      key={k.kind}
                      type="button"
                      className="light-tile"
                      title={k.shape === 'path' ? `${k.label} — click, then click points on the canvas` : `${k.label} — click to add, or drag onto the plot`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(DRAG_MIME, k.kind);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={() => onAdd(k.kind)}
                    >
                      <KindIcon kind={k.kind} pal={pal} size={30} />
                      <span>{k.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {!groups.length && (
          <div className="muted small" style={{ padding: 12 }}>
            Nothing matches “{q}”.{' '}
            <Button size="sm" variant="ghost" onClick={() => setQ('')}>
              Clear
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
