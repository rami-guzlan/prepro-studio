/* Call Sheets: list of shoot days (left) + call sheet editor (right). */
import './callsheets.css';
import { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, CalendarRange, CircleAlert, CircleCheck, ClipboardList } from 'lucide-react';
import { getProject, useFormatters, useProjectData } from '@/store/project';
import { navigate, openPrint, useApp } from '@/store/app';
import { getScriptModel, useScriptModel } from '@/derived/script';
import { exportCsv, isDesktop } from '@/backend';
import type { CsvColumn } from '@/lib/csv';
import { todayISO } from '@/lib/dates';
import { plural, safeFileName } from '@/lib/text';
import { useCommand } from '@/lib/commands';
import { Button, EmptyState, ExportMenu, ModuleHeader, toast } from '@/ui';
import { computeDays } from '@/modules/schedule/logic';
import { resolveCallSheet, type CastRow, type CrewRow } from './logic';
import { CallSheetEditor } from './Editor';

async function saveCsv<T>(name: string, rows: T[], cols: CsvColumn<T>[]) {
  try {
    const path = await exportCsv(name, rows, cols);
    if (path) toast(`Saved ${path}`);
    else if (!isDesktop) toast('CSV downloaded');
  } catch (e) {
    toast(`Export failed: ${(e as Error).message}`, 'error');
  }
}

function exportCastCalls(dayIndex: number) {
  const p = getProject();
  const r = resolveCallSheet(p, getScriptModel(p), dayIndex);
  if (!r) return;
  saveCsv<CastRow>(safeFileName(`${p.meta.title} - Day ${r.row.number} cast calls`), r.castRows, [
    { header: '#', value: (c) => c.numbers },
    { header: 'Character', value: (c) => c.characters.map((x) => x.name).join(' / ') },
    { header: 'Actor', value: (c) => c.cast.name },
    { header: 'Phone', value: (c) => c.cast.phone },
    { header: 'Status', value: (c) => c.status },
    { header: 'Pickup', value: (c) => c.pickup },
    { header: 'Call', value: (c) => c.call },
    { header: 'H/MU', value: (c) => c.hmu },
    { header: 'On set', value: (c) => c.onSet },
    { header: 'Notes', value: (c) => c.notes },
  ]);
}

function exportCrewCalls(dayIndex: number) {
  const p = getProject();
  const r = resolveCallSheet(p, getScriptModel(p), dayIndex);
  if (!r) return;
  const rows = r.crewGroups.flatMap((g) => g.rows.map((row) => ({ dept: g.dept, row })));
  saveCsv<{ dept: string; row: CrewRow }>(safeFileName(`${p.meta.title} - Day ${r.row.number} crew calls`), rows, [
    { header: 'Department', value: (x) => x.dept },
    { header: 'Position', value: (x) => x.row.crew.position },
    { header: 'Name', value: (x) => x.row.crew.name },
    { header: 'Phone', value: (x) => x.row.crew.phone },
    { header: 'Email', value: (x) => x.row.crew.email },
    { header: 'Call', value: (x) => x.row.call },
    { header: 'Notes', value: (x) => x.row.notes },
  ]);
}

export default function CallsheetsModule() {
  const params = useApp((s) => s.params);
  const navKey = useApp((s) => s.navKey);
  const p = useProjectData();
  const model = useScriptModel();
  const fmt = useFormatters();
  const rows = useMemo(() => computeDays(p, model), [p.schedule, p.locations, model]); // eslint-disable-line react-hooks/exhaustive-deps
  const readiness = useMemo(() => rows.map((_, i) => resolveCallSheet(p, model, i, { rows })?.missing ?? []), [p, model, rows]);

  const initial = () => {
    if (params?.dayId && rows.some((r) => r.day.id === params.dayId)) return params.dayId as string;
    const today = todayISO();
    return (rows.find((r) => r.date && r.date >= today) ?? rows[0])?.day.id ?? null;
  };
  const [selected, setSelected] = useState<string | null>(initial);

  useEffect(() => {
    if (params?.dayId && rows.some((r) => r.day.id === params.dayId)) setSelected(params.dayId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navKey]);

  // keep a valid selection when days are added / removed
  const index = rows.findIndex((r) => r.day.id === selected);
  useEffect(() => {
    if (index < 0 && rows.length) setSelected(rows[0].day.id);
  }, [index, rows]);
  const current = index >= 0 ? rows[index] : undefined;

  useCommand('print', () => {
    if (!current) return false;
    openPrint('call-sheet', { dayId: current.day.id });
    return true;
  });

  const readyCount = readiness.filter((m) => m.length === 0).length;

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const next = Math.max(0, Math.min(rows.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1)));
    setSelected(rows[next].day.id);
    (document.getElementById(`callsh-day-${rows[next].day.id}`) as HTMLElement | null)?.focus();
  };

  return (
    <div className="module callsh">
      <ModuleHeader
        title="Call Sheets"
        icon={ClipboardList}
        subtitle={rows.length ? `${plural(rows.length, 'shoot day')} · ${readyCount} ready` : 'No shoot days yet'}
        actions={
          rows.length > 0 ? (
            <ExportMenu
              docs={[
                ...(current ? [{ id: 'call-sheet', label: `Call sheet — Day ${current.number}`, options: { dayId: current.day.id } }] : []),
                { id: 'call-sheet', label: 'All call sheets (one per day)', options: { allDays: true } },
              ]}
              csv={
                current
                  ? [
                      { label: `Cast calls — Day ${current.number} (CSV)`, onClick: () => exportCastCalls(index) },
                      { label: `Crew calls — Day ${current.number} (CSV)`, onClick: () => exportCrewCalls(index) },
                    ]
                  : []
              }
            />
          ) : null
        }
      />
      {rows.length === 0 ? (
        <div className="module-body">
          <EmptyState
            icon={CalendarPlus}
            title="No shoot days yet"
            description="Call sheets are built from the shooting schedule: each shoot day gets one, pre-filled with its scenes, cast, locations and crew."
            action={
              <Button variant="primary" icon={CalendarRange} onClick={() => navigate('schedule')}>
                Open shooting schedule
              </Button>
            }
          />
        </div>
      ) : (
        <div className="split">
          <div className="pane-left callsh-days">
            <div className="callsh-days-head">
              <span className="section-title" style={{ margin: 0 }}>
                Shoot days
              </span>
            </div>
            <div className="callsh-days-list" role="listbox" aria-label="Shoot days" onKeyDown={onListKey}>
              {rows.map((r, i) => {
                const missing = readiness[i] ?? [];
                const ready = missing.length === 0;
                const hasSheet = !!p.callSheets?.[r.day.id];
                return (
                  <button
                    key={r.day.id}
                    id={`callsh-day-${r.day.id}`}
                    type="button"
                    role="option"
                    aria-selected={r.day.id === selected}
                    className={`list-item callsh-day ${r.day.id === selected ? 'active' : ''}`}
                    onClick={() => setSelected(r.day.id)}
                  >
                    <div className="callsh-day-badge">
                      <span>Day</span>
                      <strong>{r.number}</strong>
                    </div>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="strong ellipsis">{r.date ? fmt.dateMedium(r.date) : 'No date'}</div>
                      <div className="meta ellipsis">
                        {plural(r.scenes.length, 'scene')}
                        {r.day.label ? ` · ${r.day.label}` : ''}
                      </div>
                      <div className={`callsh-day-status ${ready ? 'ok' : 'warn'}`} title={ready ? 'Ready to send' : `Missing: ${missing.join(', ')}`}>
                        {ready ? <CircleCheck /> : <CircleAlert />}
                        {ready ? 'Ready' : hasSheet ? `${missing.length} to fill in` : 'Not started'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="pane-main">{current && <CallSheetEditor key={current.day.id} dayIndex={index} />}</div>
        </div>
      )}
    </div>
  );
}
