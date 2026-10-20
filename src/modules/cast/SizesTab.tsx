/* Sizes sub-page: wardrobe measurements for every cast member, edited inline. */
import { useMemo, useRef, useState } from 'react';
import { Printer, Ruler, UserPlus } from 'lucide-react';
import type { CastMember, ID } from '@/types';
import { listOps, useProject } from '@/store/project';
import { openPrint } from '@/store/app';
import { matchesQuery } from '@/lib/text';
import { useCommand } from '@/lib/commands';
import { Avatar, Button, Checkbox, DataTable, EmptyState, SearchInput, Toolbar, type Column } from '@/ui';
import { hasMeasurements, MEASUREMENTS, rolesByCast, sortCastByBoard, tableMinWidth } from './util';

const ops = listOps<CastMember>((d) => d.cast, 'cast');

export function SizesTab({ onAdd, onOpenCast }: { onAdd: () => void; onOpenCast: (id: ID) => void }) {
  const cast = useProject((p) => p.cast);
  const characters = useProject((p) => p.characters);
  const [q, setQ] = useState('');
  const [hideDeclined, setHideDeclined] = useState(true);
  const searchWrap = useRef<HTMLDivElement>(null);
  useCommand('find', () => {
    searchWrap.current?.querySelector('input')?.focus();
    return true;
  });

  const roles = useMemo(() => rolesByCast(characters), [characters]);
  const rows = useMemo(
    () =>
      sortCastByBoard(cast, roles).filter(
        (m) => (!hideDeclined || m.status !== 'declined') && matchesQuery([m.name, ...(roles.get(m.id) ?? []).map((c) => c.name)].join(' '), q),
      ),
    [cast, roles, q, hideDeclined],
  );
  const missing = rows.filter((m) => !hasMeasurements(m.measurements)).length;

  const columns: Column<CastMember>[] = [
    {
      key: 'name',
      header: 'Cast member',
      width: 190,
      sortValue: (m) => m.name,
      style: { position: 'sticky', left: 0, background: 'var(--panel)', zIndex: 1 },
      render: (m) => (
        <button type="button" className="cast-sizes-name" onClick={() => onOpenCast(m.id)} title="Open cast member">
          <Avatar name={m.name || '?'} photo={m.photo} size={24} />
          <span className="col" style={{ gap: 0, minWidth: 0, alignItems: 'flex-start' }}>
            <span className="strong ellipsis" style={{ maxWidth: 140 }}>
              {m.name || 'Unnamed actor'}
            </span>
            <span className="tiny muted ellipsis" style={{ maxWidth: 140 }}>
              {(roles.get(m.id) ?? []).map((c) => c.name).join(', ') || 'No role'}
            </span>
          </span>
        </button>
      ),
    },
    ...MEASUREMENTS.map(
      (f): Column<CastMember> => ({
        key: f.key,
        header: f.label,
        type: 'text',
        width: f.key === 'hair' || f.key === 'eyes' ? 96 : 76,
        placeholder: '—',
        get: (m) => m.measurements?.[f.key] ?? '',
        set: (value: string, m) => ({ measurements: { ...(m.measurements ?? {}), [f.key]: value } }),
        sortValue: (m) => m.measurements?.[f.key] ?? '',
      }),
    ),
  ];

  if (cast.length === 0) {
    return (
      <EmptyState
        icon={Ruler}
        title="No cast to measure yet"
        description="Wardrobe sizes live with each cast member. Add your cast first, then fill in their measurements here."
        action={
          <Button variant="primary" icon={UserPlus} onClick={onAdd}>
            Add cast member
          </Button>
        }
      />
    );
  }

  return (
    <>
      <Toolbar>
        <div ref={searchWrap}>
          <SearchInput value={q} onChange={setQ} placeholder="Search cast…" />
        </div>
        <Checkbox checked={hideDeclined} onChange={setHideDeclined} label="Hide declined" />
        {missing > 0 && <span className="muted small">{missing} without sizes</span>}
        <div className="spacer" />
        <Button icon={Printer} onClick={() => openPrint('size-sheet')}>
          Print size sheet
        </Button>
      </Toolbar>
      <div className="module-body cast-pad">
        <div className="cast-xtable" style={{ ['--xt-minw' as string]: `${tableMinWidth(columns, 0)}px` } as React.CSSProperties}>
          <DataTable rows={rows} columns={columns} onChange={(id, patch) => ops.update(id, patch)} emptyText="No cast members match." style={{ minWidth: 0 }} />
        </div>
        <p className="muted small" style={{ marginTop: 10 }}>
          Tip: use the units your costume department works in (e.g. 34″ or 86 cm). Sizes print on cast sheets and the wardrobe size sheet.
        </p>
      </div>
    </>
  );
}
