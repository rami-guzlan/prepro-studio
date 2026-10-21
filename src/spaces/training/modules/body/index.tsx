/* Body: weight, body-fat and tape measurements — a fast log (one row per day)
   and charts with the 7-day average, projection and measurement trends. */
import { useMemo, useState } from 'react';
import { Bot, ChartLine, FileDown, Plus, Ruler, Table2, Trash2 } from 'lucide-react';
import { Button, Card, DataTable, DateInput, EmptyState, ExportMenu, Field, ModuleHeader, NumberInput, toast, UnderlineTabs, type Column } from '@/ui';
import { LineChart, StatTile, type LineSeries } from '@/ui/charts';
import { useSpaceFormatters } from '@/store/space';
import { safeFileName } from '@/lib/text';
import { exportCsv } from '@/backend';
import { MEASUREMENTS, type BodyMetric, type MeasurementKey } from '../../types';
import { latestMetric, metricSeries, projectionText, round, weightTrend } from '../../calc';
import { updateTraining, upsertMetric } from '../../ops';
import { LengthInput, NumberUnit, useNavParams, useToday, useTraining, useUnits, WeightChart, WeightInput } from '../../ui';

type Tab = 'charts' | 'log';

export default function TrainingBody() {
  const t = useTraining();
  const u = useUnits();
  const fmt = useSpaceFormatters();
  const today = useToday();
  const params = useNavParams();
  const [tab, setTab] = useState<Tab>(params.tab === 'log' ? 'log' : 'charts');
  const [shown, setShown] = useState<MeasurementKey[]>(['waistCm', 'hipsCm', 'chestCm']);
  const tr = useMemo(() => weightTrend(t), [t]);
  const bf = useMemo(() => metricSeries(t, 'bodyFat'), [t]);
  const rows = useMemo(() => [...t.metrics].sort((a, b) => b.date.localeCompare(a.date)), [t.metrics]);
  const [draft, setDraft] = useState<Partial<BodyMetric>>({ date: today });

  const measureSeries = useMemo<LineSeries[]>(
    () =>
      MEASUREMENTS.map((m, i) => ({ m, i }))
        .filter(({ m }) => shown.includes(m.key))
        .map(({ m, i }) => ({ id: m.key, label: m.label, slot: i + 2, points: metricSeries(t, m.key).map((p) => ({ x: p.date, y: round(u.fromCm(p.value)!, 1) })) }))
        .filter((s) => s.points.length),
    [t, shown, u],
  );
  const hasMeasures = MEASUREMENTS.some((m) => latestMetric(t, m.key));
  const waist = latestMetric(t, 'waistCm');
  const firstWaist = metricSeries(t, 'waistCm')[0];

  const saveDraft = () => {
    const { date, ...rest } = draft;
    if (!date || !Object.values(rest).some((v) => v != null && v !== '')) return;
    updateTraining((tr2) => {
      upsertMetric(tr2, date, rest);
    });
    setDraft({ date: today });
    toast(`Saved ${fmt.dateShort(date)}`);
  };

  const patch = (id: string, p: Partial<BodyMetric>) =>
    updateTraining(
      (tr2) => {
        const x = tr2.metrics.find((m) => m.id === id);
        if (!x) return;
        for (const [k, v] of Object.entries(p)) {
          if (v === undefined || v === null || v === '') delete (x as any)[k];
          else (x as any)[k] = v;
        }
        if (p.date) tr2.metrics.sort((a, b) => a.date.localeCompare(b.date));
      },
      { coalesce: `met:${id}:${Object.keys(p).join(',')}` },
    );

  const csv = async () => {
    const path = await exportCsv(safeFileName('Body metrics'), [...rows].reverse(), [
      { header: 'Date', value: (r) => r.date },
      { header: `Weight (${u.w})`, value: (r) => u.weightNum(r.weightKg) },
      { header: 'Body fat %', value: (r) => r.bodyFat },
      ...MEASUREMENTS.map((m) => ({ header: `${m.label} (${u.len})`, value: (r: BodyMetric) => (r[m.key] != null ? round(u.fromCm(r[m.key])!, 1) : '') })),
      { header: 'Resting HR', value: (r) => r.restingHr },
      { header: 'Notes', value: (r) => r.notes },
    ]);
    if (path) toast(`Exported ${path.split(/[\\/]/).pop()}`);
  };

  const cols: Column<BodyMetric>[] = [
    { key: 'date', header: 'Date', type: 'date', width: 130 },
    { key: 'weightKg', header: `Weight ${u.w}`, type: 'number', width: 96, align: 'right', get: (r) => (r.weightKg != null ? round(u.fromKg(r.weightKg)!, 1) : undefined), set: (v) => ({ weightKg: u.toKg(v ?? undefined) }) },
    { key: 'bodyFat', header: 'Fat %', type: 'number', width: 76, align: 'right' },
    ...MEASUREMENTS.map(
      (m): Column<BodyMetric> => ({ key: m.key, header: `${m.label} ${u.len}`, type: 'number', width: 92, align: 'right', get: (r) => (r[m.key] != null ? round(u.fromCm(r[m.key])!, 1) : undefined), set: (v) => ({ [m.key]: u.toCm(v ?? undefined) }) as Partial<BodyMetric> }),
    ),
    { key: 'restingHr', header: 'Rest HR', type: 'number', width: 80, align: 'right' },
    { key: 'notes', header: 'Notes', type: 'text', minWidth: 160 },
    { key: 'source', header: '', type: 'readonly', width: 34, render: (r) => (r.source === 'agent' ? <Bot size={13} className="muted" aria-label="Logged by your AI" /> : null) },
  ];

  return (
    <div className="module tr-module">
      <ModuleHeader
        title="Body"
        icon={Ruler}
        subtitle={tr ? `${u.weight(tr.trendKg)} trend${tr.ratePerWeek != null ? ` · ${u.delta(tr.ratePerWeek)}/week` : ''} · ${t.metrics.length} entries` : 'Weight, body fat and measurements'}
        actions={
          <>
            <ExportMenu docs={[{ id: 'space-train-progress', label: 'Progress report' }]} csv={[{ label: 'Body metrics (CSV)', onClick: csv }]} />
            <Button variant="primary" icon={Plus} onClick={() => setTab('log')}>
              Log
            </Button>
          </>
        }
      />
      <UnderlineTabs
        tabs={[
          { id: 'charts', label: 'Charts', icon: ChartLine },
          { id: 'log', label: 'Log', icon: Table2, count: t.metrics.length },
        ]}
        value={tab}
        onChange={(x) => setTab(x as Tab)}
      />
      <div className="module-body">
        {tab === 'charts' ? (
          <div className="tr-page">
            {!t.metrics.length ? (
              <EmptyState
                icon={Ruler}
                title="No measurements yet"
                description="Weigh in a few mornings a week (after the bathroom, before food) and measure waist, hips and chest every 1–2 weeks. Tell your AI “82.4 kg this morning, waist 86” and it lands here."
                action={
                  <Button variant="primary" icon={Plus} onClick={() => setTab('log')}>
                    Log measurements
                  </Button>
                }
              />
            ) : (
              <>
                <div className="tr-stats">
                  <StatTile label="Trend weight" value={tr ? u.weight(tr.trendKg) : '—'} sub={tr ? `latest ${u.weight(tr.latest.kg)} · ${fmt.dateShort(tr.latest.date)}` : undefined} />
                  <StatTile label="4 weeks" value={tr?.change28 != null ? u.delta(tr.change28) : '—'} deltaGood={tr?.change28 != null && tr.targetKg != null ? Math.sign(tr.change28) === Math.sign(tr.targetKg - tr.trendKg) : undefined} sub="7-day average change" />
                  <StatTile label="Since start" value={tr ? u.delta(tr.trendKg - tr.startKg) : '—'} sub={tr ? `from ${u.weight(tr.startKg)} · ${fmt.dateShort(tr.startDate)}` : undefined} />
                  <StatTile label="Body fat" value={bf.length ? `${round(bf[bf.length - 1].value, 1)}%` : '—'} sub={bf.length > 1 ? `${bf[bf.length - 1].value - bf[0].value >= 0 ? '+' : '−'}${Math.abs(round(bf[bf.length - 1].value - bf[0].value, 1))} pts since ${fmt.dateShort(bf[0].date)}` : undefined} />
                  <StatTile label="Waist" value={waist ? u.length(waist.value) : '—'} sub={waist && firstWaist && firstWaist.date !== waist.date ? `${u.length(waist.value - firstWaist.value)} since ${fmt.dateShort(firstWaist.date)}`.replace(/^(\d)/, '+$1') : undefined} />
                </div>
                <Card title="Weight">
                  <WeightChart t={t} height={260} />
                  <p className="tr-note">{projectionText(tr, t.profile.units, fmt.dateMedium)}</p>
                </Card>
                <div className="tr-cols">
                  <div className="tr-col">
                    <Card
                      title={`Measurements (${u.len})`}
                      actions={
                        <div className="tr-toggles">
                          {MEASUREMENTS.map((m) => (
                            <button key={m.key} type="button" className={shown.includes(m.key) ? 'on' : ''} aria-pressed={shown.includes(m.key)} onClick={() => setShown(shown.includes(m.key) ? shown.filter((x) => x !== m.key) : [...shown, m.key])}>
                              {m.label}
                            </button>
                          ))}
                        </div>
                      }
                    >
                      {hasMeasures ? <LineChart series={measureSeries} height={220} yFormat={(v) => `${round(v, 1)}`} xFormat={(x) => (typeof x === 'string' ? fmt.dateShort(x).replace(/^\w+ /, '') : String(x))} ariaLabel={`Body measurements in ${u.len}`} empty="Pick a measurement with data" /> : <div className="viz-empty">No tape measurements yet</div>}
                    </Card>
                  </div>
                  <div className="tr-col">
                    <Card title="Body fat %">
                      <LineChart series={[{ id: 'bf', label: 'Body fat', slot: 4, points: bf.map((p) => ({ x: p.date, y: p.value })) }]} height={220} target={t.goal.targetBodyFat != null ? { y: t.goal.targetBodyFat, label: `Goal ${t.goal.targetBodyFat}%` } : undefined} yFormat={(v) => `${round(v, 1)}`} xFormat={(x) => (typeof x === 'string' ? fmt.dateShort(x).replace(/^\w+ /, '') : String(x))} ariaLabel="Body fat percentage" empty="No body-fat readings yet" />
                    </Card>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="tr-page">
            <Card title="Log measurements">
              <div className="tr-form-grid" onKeyDown={(e) => e.key === 'Enter' && saveDraft()}>
                <Field label="Date">
                  <DateInput value={draft.date} onChange={(date) => setDraft({ ...draft, date })} />
                </Field>
                <Field label="Weight">
                  <WeightInput kg={draft.weightKg} onChange={(weightKg) => setDraft({ ...draft, weightKg })} u={u} />
                </Field>
                <Field label="Body fat">
                  <NumberUnit value={draft.bodyFat} onChange={(bodyFat) => setDraft({ ...draft, bodyFat })} unit="%" />
                </Field>
                {MEASUREMENTS.map((m) => (
                  <Field key={m.key} label={m.label}>
                    <LengthInput cm={draft[m.key]} onChange={(v) => setDraft({ ...draft, [m.key]: v })} u={u} />
                  </Field>
                ))}
                <Field label="Resting HR">
                  <NumberInput value={draft.restingHr} onChange={(restingHr) => setDraft({ ...draft, restingHr })} inputMode="numeric" />
                </Field>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <Button variant="primary" size="lg" icon={Plus} onClick={saveDraft}>
                  Save
                </Button>
                <span className="muted small">Merges into that day's row if there is one.</span>
              </div>
            </Card>
            <Card padded={false} title={`History · ${rows.length}`} actions={<Button size="sm" icon={FileDown} onClick={csv} disabled={!rows.length}>CSV</Button>}>
              <div className="tr-scroll-x">
                <DataTable
                  rows={rows}
                  columns={cols}
                  onChange={(id, p) => patch(id, p)}
                  rowActions={(r) => [
                    {
                      label: 'Delete',
                      icon: Trash2,
                      danger: true,
                      onClick: () =>
                        updateTraining((tr2) => {
                          tr2.metrics = tr2.metrics.filter((x) => x.id !== r.id);
                        }),
                    },
                  ]}
                  onDelete={(r) =>
                    updateTraining((tr2) => {
                      tr2.metrics = tr2.metrics.filter((x) => x.id !== r.id);
                    })
                  }
                  emptyText="Nothing logged yet."
                />
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
