/* Locations & Sets module: location list + detail, and the script-set → location map. */
import './locations.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Layers, MapPin, Plus, Trash2 } from 'lucide-react';
import type { ID, Location } from '@/types';
import { listOps, useFormatters, useProject } from '@/store/project';
import { useApp } from '@/store/app';
import { useScriptModel } from '@/derived/script';
import { assetUrl } from '@/backend';
import { LOCATION_STATUSES } from '@/lib/constants';
import { matchesQuery, plural } from '@/lib/text';
import { useCommand } from '@/lib/commands';
import { Button, EmptyState, ExportMenu, isModalOpen, ModuleHeader, openContextMenu, SearchInput, StatusBadge } from '@/ui';
import { addLocation, deleteLocation, duplicateLocation, exportLocationsCsv } from './actions';
import { LOCATION_KINDS, setRows } from './data';
import { LocationDetail } from './LocationDetail';
import { SetsOverview } from './SetsOverview';
import { isTypingTarget } from './util';

const ops = listOps<Location>((d) => d.locations, 'locations');
type Sel = ID | 'sets' | null;

export default function LocationsModule() {
  const locations = useProject((p) => p.locations);
  const model = useScriptModel();
  const fmt = useFormatters();
  const params = useApp((s) => s.params);
  const navKey = useApp((s) => s.navKey);
  const [sel, setSel] = useState<Sel>(() => locations[0]?.id ?? 'sets');
  const [focusName, setFocusName] = useState<ID | null>(null);
  const [q, setQ] = useState('');
  const [dragId, setDragId] = useState<ID | null>(null);
  const [overId, setOverId] = useState<ID | null>(null);
  const searchWrap = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useCommand('find', () => {
    searchWrap.current?.querySelector('input')?.focus();
    return true;
  });

  useEffect(() => {
    if (params?.locationId) setSel(params.locationId);
    else if (params?.view === 'sets' || params?.set) setSel('sets');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navKey]);

  // if the selected location disappears (deleted / undo), fall back gracefully
  useEffect(() => {
    if (sel && sel !== 'sets' && !locations.some((l) => l.id === sel)) setSel(locations[0]?.id ?? 'sets');
  }, [locations, sel]);

  const rows = useMemo(() => setRows(model, locations), [model, locations]);
  const unassigned = rows.filter((r) => r.inScript && !r.location).length;
  const sceneCount = useMemo(() => {
    const m = new Map<ID, number>();
    for (const r of rows) if (r.location) m.set(r.location.id, (m.get(r.location.id) ?? 0) + r.scenes.length);
    return m;
  }, [rows]);
  const filtered = useMemo(
    () => locations.filter((l) => matchesQuery([l.name, l.address, l.contactName, ...(l.sets ?? [])].join(' '), q)),
    [locations, q],
  );
  const selected = sel && sel !== 'sets' ? locations.find((l) => l.id === sel) : undefined;
  const confirmed = locations.filter((l) => l.status === 'confirmed').length;
  const totalFee = locations.filter((l) => l.status !== 'declined').reduce((a, l) => a + (l.fee ?? 0), 0);

  const add = () => {
    const id = addLocation();
    setQ('');
    setSel(id);
    setFocusName(id);
  };
  const select = (id: Sel) => {
    setSel(id);
    setFocusName(null);
  };

  // keyboard: ↑/↓ in the list, Delete removes the selected location (when focus is in the list)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isModalOpen() || isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('.popover')) return;
      const inList = !!listRef.current?.contains(document.activeElement);
      if (!inList) return;
      const ids: Sel[] = ['sets', ...filtered.map((l) => l.id)];
      const i = ids.indexOf(sel);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next = ids[Math.max(0, Math.min(ids.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
        select(next);
        (listRef.current?.querySelector(`[data-id="${next}"]`) as HTMLElement | null)?.focus();
      } else if (e.key === 'Delete' && selected) {
        e.preventDefault();
        deleteLocation(selected.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filtered, sel, selected]);

  const subtitle = locations.length
    ? [plural(locations.length, 'location'), `${confirmed} confirmed`, unassigned ? `${plural(unassigned, 'set')} unassigned` : '', totalFee ? `${fmt.money(totalFee, { cents: false })} in fees` : '']
        .filter(Boolean)
        .join(' · ')
    : 'Scout, photograph and lock locations; map script sets to them';

  return (
    <div className="module loc-module">
      <ModuleHeader
        title="Locations & Sets"
        subtitle={subtitle}
        icon={MapPin}
        actions={
          <>
            <ExportMenu
              docs={[
                { id: 'location-list', label: 'Location list' },
                { id: 'location-sheets', label: 'Location sheets (one per location)' },
                { id: 'tech-scout', label: 'Tech scout checklists' },
              ]}
              csv={[{ label: 'Locations (CSV)', onClick: () => exportLocationsCsv() }]}
            />
            <Button variant="primary" icon={Plus} onClick={add}>
              Add location
            </Button>
          </>
        }
      />
      <div className="split">
        <aside className="pane-left loc-left">
          <div className="loc-left-search" ref={searchWrap}>
            <SearchInput value={q} onChange={setQ} placeholder="Search locations…" width="100%" />
          </div>
          <div className="loc-list" ref={listRef}>
            <button type="button" data-id="sets" className={`loc-item loc-item-sets ${sel === 'sets' ? 'active' : ''}`} onClick={() => select('sets')}>
              <span className="loc-thumb loc-thumb-icon">
                <Layers />
              </span>
              <span className="loc-item-text">
                <span className="loc-item-name">Sets overview</span>
                <span className="loc-item-meta">
                  {plural(rows.filter((r) => r.inScript).length, 'set')} in script
                  {unassigned > 0 && <span className="badge warning loc-item-badge">{unassigned} unassigned</span>}
                </span>
              </span>
            </button>
            <div className="loc-list-label">Locations</div>
            {filtered.map((l) => {
              const cover = l.photos?.[0];
              const kind = LOCATION_KINDS.find((k) => k.value === l.kind)?.label;
              return (
                <button
                  key={l.id}
                  type="button"
                  data-id={l.id}
                  className={['loc-item', sel === l.id && 'active', overId === l.id && dragId !== l.id && 'over', l.status === 'declined' && 'declined'].filter(Boolean).join(' ')}
                  onClick={() => select(l.id)}
                  onContextMenu={(e) =>
                    openContextMenu(e, [
                      { label: 'Duplicate', icon: Copy, onClick: () => select(duplicateLocation(l.id) ?? l.id) },
                      { separator: true },
                      { label: 'Delete', icon: Trash2, danger: true, onClick: () => deleteLocation(l.id) },
                    ])
                  }
                  draggable={!q}
                  onDragStart={(e) => {
                    setDragId(l.id);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', l.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverId(null);
                  }}
                  onDragOver={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    if (overId !== l.id) setOverId(l.id);
                  }}
                  onDrop={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    if (dragId !== l.id) {
                      const from = locations.findIndex((x) => x.id === dragId);
                      const to = locations.findIndex((x) => x.id === l.id);
                      ops.moveBefore(dragId, from < to ? locations[to + 1]?.id ?? null : l.id);
                    }
                    setDragId(null);
                    setOverId(null);
                  }}
                >
                  <span className="loc-thumb">{cover ? <img src={assetUrl(cover)} alt="" draggable={false} /> : <MapPin />}</span>
                  <span className="loc-item-text">
                    <span className="loc-item-name">{l.name || <span className="muted">Untitled location</span>}</span>
                    <span className="loc-item-meta">
                      <StatusBadge value={l.status} options={LOCATION_STATUSES} />
                      <span className="ellipsis">
                        {plural(l.sets?.length ?? 0, 'set')}
                        {sceneCount.get(l.id) ? ` · ${plural(sceneCount.get(l.id)!, 'scene')}` : ''}
                        {kind ? ` · ${kind}` : ''}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
            {locations.length === 0 && (
              <div className="loc-list-empty">
                <p className="muted small">No locations yet.</p>
                <Button size="sm" icon={Plus} onClick={add}>
                  Add location
                </Button>
              </div>
            )}
            {locations.length > 0 && filtered.length === 0 && <div className="loc-list-empty muted small">No locations match “{q}”.</div>}
          </div>
        </aside>
        <div className="pane-main loc-main">
          {sel === 'sets' ? (
            <SetsOverview onOpenLocation={(id) => select(id)} />
          ) : selected ? (
            <LocationDetail key={selected.id} loc={selected} autoFocusName={focusName === selected.id} onSelect={select} />
          ) : (
            <EmptyState
              icon={MapPin}
              title="No location selected"
              description="Add the places you're scouting — photos, address, contact, power, parking and the nearest hospital — then map the script's sets to them."
              action={
                <Button variant="primary" icon={Plus} onClick={add}>
                  Add location
                </Button>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

