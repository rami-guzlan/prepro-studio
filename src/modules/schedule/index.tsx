/* Shooting Schedule: Stripboard | Calendar | Day Out of Days. */
import './schedule.css';
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CalendarPlus, CalendarRange, LayoutList, Table2 } from 'lucide-react';
import { getProject, useFormatters, useProject } from '@/store/project';
import { openPrint, readLS, useApp, writeLS } from '@/store/app';
import { getScriptModel, useScriptModel } from '@/derived/script';
import { locationForScene } from '@/derived/project';
import { exportCsv, isDesktop } from '@/backend';
import type { CsvColumn } from '@/lib/csv';
import { safeFileName, plural } from '@/lib/text';
import { useCommand } from '@/lib/commands';
import { Button, ExportMenu, ModuleHeader, UnderlineTabs, toast } from '@/ui';
import { boneyardScenes, castNumbers, computeDays, computeDood, dayNightLabel, intExtLabel, sceneSynopsis } from './logic';
import { addDay } from './actions';
import { Stripboard, type BoardFocus } from './Stripboard';
import { CalendarView } from './CalendarView';
import { DoodView } from './DoodView';

type Tab = 'board' | 'calendar' | 'dood';

async function saveCsv<T>(name: string, rows: T[], cols: CsvColumn<T>[]) {
  try {
    const path = await exportCsv(name, rows, cols);
    if (path) toast(`Saved ${path}`);
    else if (!isDesktop) toast('CSV downloaded');
  } catch (e) {
    toast(`Export failed: ${(e as Error).message}`, 'error');
  }
}

function exportScheduleCsv() {
  const p = getProject();
  const model = getScriptModel(p);
  const rows = computeDays(p, model);
  const charById = new Map(p.characters.map((c) => [c.id, c]));
  const castById = new Map(p.cast.map((c) => [c.id, c]));
  type Row = { day: string; date: string; kind: string; sceneId?: string; text?: string };
  const out: Row[] = [];
  for (const r of rows) {
    for (const it of r.day.items) {
      if (it.type === 'banner') out.push({ day: `Day ${r.number}`, date: r.date ?? '', kind: 'Banner', text: it.text });
      else out.push({ day: `Day ${r.number}`, date: r.date ?? '', kind: 'Scene', sceneId: it.sceneId });
    }
  }
  for (const s of boneyardScenes(p.schedule, model)) out.push({ day: 'Unscheduled', date: '', kind: 'Scene', sceneId: s.id });
  const sc = (r: Row) => (r.sceneId ? model.sceneById.get(r.sceneId) : undefined);
  const title = p.meta.title || 'Project';
  saveCsv(safeFileName(`${title} - Shooting Schedule`), out, [
    { header: 'Day', value: (r) => r.day },
    { header: 'Date', value: (r) => r.date },
    { header: 'Type', value: (r) => r.kind },
    { header: 'Scene', value: (r) => sc(r)?.number ?? '' },
    { header: 'I/E', value: (r) => intExtLabel(sc(r)) },
    { header: 'Set', value: (r) => (r.kind === 'Banner' ? r.text : sc(r)?.set) },
    { header: 'D/N', value: (r) => dayNightLabel(sc(r)) },
    { header: 'Pages (8ths)', value: (r) => sc(r)?.eighths ?? '' },
    { header: 'Est. minutes', value: (r) => sc(r)?.meta?.estMinutes ?? '' },
    { header: 'Cast #', value: (r) => (sc(r) ? castNumbers(sc(r)!, charById).map((c) => c.label).join(', ') : '') },
    { header: 'Characters', value: (r) => (sc(r) ? castNumbers(sc(r)!, charById, castById).map((c) => (c.actor ? `${c.name} (${c.actor})` : c.name)).join(', ') : '') },
    { header: 'Location', value: (r) => locationForScene(p, sc(r))?.name ?? '' },
    { header: 'Synopsis', value: (r) => sceneSynopsis(sc(r)) },
  ]);
}

function exportDoodCsv() {
  const p = getProject();
  const rows = computeDays(p, getScriptModel(p));
  const dood = computeDood(rows, p.characters, p.cast);
  if (!dood.length) {
    toast('No cast on the schedule yet.', 'info');
    return;
  }
  type R = (typeof dood)[number];
  const cols: CsvColumn<R>[] = [
    { header: '#', value: (d) => d.character.number ?? '' },
    { header: 'Character', value: (d) => d.character.name },
    { header: 'Cast', value: (d) => d.cast?.name ?? '' },
    ...rows.map((r) => ({ header: `Day ${r.number}${r.date ? ` (${r.date})` : ''}`, value: (d: R) => d.codes[r.index] })),
    { header: 'Work', value: (d) => d.work },
    { header: 'Hold', value: (d) => d.hold },
    { header: 'Total', value: (d) => d.total },
    { header: 'Start', value: (d) => d.start ?? `Day ${d.startIndex + 1}` },
    { header: 'Finish', value: (d) => d.finish ?? `Day ${d.finishIndex + 1}` },
  ];
  saveCsv(safeFileName(`${p.meta.title || 'Project'} - Day Out of Days`), dood, cols);
}

export default function ScheduleModule() {
  const params = useApp((s) => s.params);
  const navKey = useApp((s) => s.navKey);
  const schedule = useProject((p) => p.schedule);
  const locations = useProject((p) => p.locations);
  const model = useScriptModel();
  const fmt = useFormatters();
  const [tab, setTabState] = useState<Tab>(() => readLS<Tab>('prepro.schedule.tab', 'board'));
  const [focus, setFocus] = useState<BoardFocus | null>(null);

  const setTab = (t: Tab) => {
    setTabState(t);
    writeLS('prepro.schedule.tab', t);
  };

  useEffect(() => {
    if (params?.sceneId || params?.dayId) {
      setTabState('board');
      setFocus({ sceneId: params.sceneId, dayId: params.dayId, key: navKey });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navKey]);

  const rows = useMemo(() => computeDays({ schedule, locations }, model), [schedule, locations, model]);
  const scheduled = rows.reduce((n, r) => n + r.scenes.length, 0);
  const pages = rows.reduce((n, r) => n + r.eighths, 0);
  const dated = rows.filter((r) => r.date).map((r) => r.date!).sort();
  const subtitle = rows.length
    ? [
        plural(rows.length, 'shoot day'),
        `${scheduled} of ${plural(model.scenes.length, 'scene')} scheduled`,
        `${fmt.eighths(pages)} pages`,
        dated.length ? (dated[0] === dated[dated.length - 1] ? fmt.dateMedium(dated[0]) : `${fmt.dateMedium(dated[0])} – ${fmt.dateMedium(dated[dated.length - 1])}`) : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : `${plural(model.scenes.length, 'scene')} · no shoot days yet`;

  useCommand('print', () => {
    openPrint(tab === 'dood' ? 'dood' : 'shooting-schedule');
    return true;
  });

  const showDay = (dayId: string) => {
    setTab('board');
    setFocus({ dayId, key: Date.now() });
  };

  return (
    <div className="module sched">
      <ModuleHeader
        title="Shooting Schedule"
        subtitle={subtitle}
        icon={CalendarRange}
        actions={
          <>
            <ExportMenu
              docs={[
                { id: 'shooting-schedule', label: 'Shooting schedule' },
                { id: 'one-liner', label: 'One-liner' },
                { id: 'stripboard', label: 'Stripboard (colour strips)' },
                { id: 'dood', label: 'Day Out of Days' },
              ]}
              csv={[
                { label: 'Schedule (CSV)', onClick: exportScheduleCsv },
                { label: 'Day Out of Days (CSV)', onClick: exportDoodCsv },
              ]}
            />
            <Button variant="primary" icon={CalendarPlus} onClick={() => addDay()}>
              Add shoot day
            </Button>
          </>
        }
      />
      <UnderlineTabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'board', label: 'Stripboard', icon: LayoutList },
          { id: 'calendar', label: 'Calendar', icon: CalendarDays },
          { id: 'dood', label: 'Day Out of Days', icon: Table2 },
        ]}
      />
      {tab === 'board' && <Stripboard focus={focus} />}
      {tab === 'calendar' && <CalendarView onShowDay={showDay} />}
      {tab === 'dood' && <DoodView />}
    </div>
  );
}
