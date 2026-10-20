/* Sets overview: every set in the script, its scenes, and the real-world location it's shot at. */
import { useMemo } from 'react';
import { ArrowRight, FileText, Layers, MapPinPlus, TriangleAlert, Trash2 } from 'lucide-react';
import type { ID } from '@/types';
import { useFormatters, useProject } from '@/store/project';
import { navigate } from '@/store/app';
import { useScriptModel } from '@/derived/script';
import { LOCATION_STATUSES, STRIP_COLORS } from '@/lib/constants';
import { plural } from '@/lib/text';
import { Button, DataTable, EmptyState, Select, StatusBadge, type Column } from '@/ui';
import { addLocationForSet, assignSet } from './actions';
import { setRows, type SetRow } from './data';
import { tableMinWidth } from './util';

const NEW = '__new__';

export function SetsOverview({ onOpenLocation }: { onOpenLocation: (id: ID) => void }) {
  const model = useScriptModel();
  const locations = useProject((p) => p.locations);
  const fmt = useFormatters();
  const rows = useMemo(() => {
    const all = setRows(model, locations);
    // unassigned script sets first, then script order, then sets not in the script
    return all.sort((a, b) => Number(!!a.location || !a.inScript) - Number(!!b.location || !b.inScript) || Number(!a.inScript) - Number(!b.inScript));
  }, [model, locations]);
  const unassigned = rows.filter((r) => r.inScript && !r.location);
  const locOptions = useMemo(
    () => [...locations.map((l) => ({ value: l.id, label: l.name || 'Untitled location' })), { value: NEW, label: '+ New location…' }],
    [locations],
  );

  const assign = (r: SetRow, v: string) => {
    if (v === NEW) onOpenLocation(addLocationForSet(r.set));
    else assignSet(r.set, v || null);
  };

  const createAll = () => {
    let first: ID | undefined;
    for (const r of unassigned) {
      const id = addLocationForSet(r.set);
      first ??= id;
    }
    if (first) onOpenLocation(first);
  };

  const columns: Column<SetRow>[] = [
    {
      key: 'set',
      header: 'Set',
      minWidth: 200,
      sortValue: (r) => r.set,
      render: (r) => (
        <div className="row" style={{ gap: 8 }}>
          <span className="strong">{r.set}</span>
          {r.inScript && !r.location && (
            <span className="badge warning">
              <TriangleAlert size={11} /> needs a location
            </span>
          )}
          {!r.inScript && <span className="badge">not in script</span>}
        </div>
      ),
    },
    {
      key: 'scenes',
      header: 'Scenes',
      minWidth: 160,
      sortValue: (r) => r.scenes.length,
      render: (r) =>
        r.scenes.length ? (
          <div className="row wrap" style={{ gap: 3 }}>
            {r.scenes.map((s) => {
              const strip = STRIP_COLORS[s.stripKey] ?? STRIP_COLORS.OTHER;
              return (
                <button key={s.id} type="button" className="loc-scene-num loc-scene-btn" style={{ background: strip.bg, color: strip.fg }} title={`${s.heading} — open in script`} onClick={() => navigate('script', { sceneId: s.id })}>
                  {s.number}
                </button>
              );
            })}
          </div>
        ) : (
          <span className="muted small">—</span>
        ),
    },
    {
      key: 'dn',
      header: 'Int/Ext · Time',
      width: 150,
      sortable: false,
      render: (r) => {
        const kinds = [...new Set(r.scenes.map((s) => [s.intExt, s.dayNight].filter(Boolean).join(' ')))].filter(Boolean);
        return <span className="muted small">{kinds.join(', ') || '—'}</span>;
      },
    },
    { key: 'eighths', header: 'Pages', width: 70, align: 'right', sortValue: (r) => r.eighths, render: (r) => <span className="num">{fmt.eighths(r.eighths) || '—'}</span> },
    {
      key: 'location',
      header: 'Location',
      width: 260,
      sortValue: (r) => r.location?.name ?? '~',
      render: (r) => (
        <div className="row" style={{ gap: 4 }}>
          <Select bare size="sm" value={r.location?.id ?? ''} placeholder="Unassigned" options={locOptions} onChange={(v) => assign(r, v)} />
          {r.location && <StatusBadge value={r.location.status} options={LOCATION_STATUSES} dot={false} />}
          {r.location && (
            <button type="button" className="btn ghost sm icon" title="Open location" aria-label="Open location" onClick={() => onOpenLocation(r.location!.id)}>
              <ArrowRight />
            </button>
          )}
          {!r.inScript && r.location && (
            <button type="button" className="btn ghost sm icon" title="Remove this set from the location" aria-label="Remove set" onClick={() => assignSet(r.set, null)}>
              <Trash2 />
            </button>
          )}
        </div>
      ),
    },
  ];

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="No sets yet"
        description="Sets come from your script's scene headings (e.g. INT. KITCHEN – NIGHT → KITCHEN). Write or import a script, then map each set to a real location here."
        action={
          <Button icon={FileText} onClick={() => navigate('script')}>
            Open script
          </Button>
        }
      />
    );
  }

  return (
    <div className="loc-sets">
      <div className="loc-sets-head">
        <div>
          <h2>Sets</h2>
          <p className="muted small">
            {plural(rows.filter((r) => r.inScript).length, 'set')} in the script · map each to the real location where it's shot. Scenes follow their set to call sheets and the
            schedule.
          </p>
        </div>
      </div>
      {unassigned.length > 0 && (
        <div className="loc-banner">
          <TriangleAlert size={16} />
          <div className="grow">
            <strong>{plural(unassigned.length, 'set')} without a location:</strong> {unassigned.map((r) => r.set).join(', ')}
          </div>
          <Button size="sm" icon={MapPinPlus} onClick={createAll}>
            Create {unassigned.length === 1 ? 'a location' : `${unassigned.length} locations`}
          </Button>
        </div>
      )}
      <div className="loc-xtable" style={{ ['--xt-minw' as string]: `${tableMinWidth(columns, 0)}px` } as React.CSSProperties}>
        <DataTable
          rows={rows}
          columns={columns}
          rowStyle={(r) => (r.inScript && !r.location ? { background: 'var(--warning-soft)' } : undefined)}
          emptyText="No sets."
        />
      </div>
    </div>
  );
}
