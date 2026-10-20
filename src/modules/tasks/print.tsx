import type { PrintDocDef } from '@/print/types';
import type { Milestone, Task } from '@/types';
import { Check, DocHeader, Dot, PBadge, PTable } from '@/print/components';
import { PHASES } from '@/lib/constants';
import { diffDays, parseISODate, todayISO, weekdayShort } from '@/lib/dates';

const phaseIdx = (v: string) => {
  const i = PHASES.findIndex((p) => p.value === v);
  return i < 0 ? 99 : i;
};
const phaseLabel = (v: string) => PHASES.find((p) => p.value === v)?.label ?? 'Other';
const phaseColor = (v: string) => PHASES.find((p) => p.value === v)?.color ?? '#888';
const valid = (d?: string): d is string => !!d && !!parseISODate(d);

const CSS = `
.tkp-title { font-weight: 600; }
.tkp-done .tkp-title { color: #7a7a84; text-decoration: line-through; }
.tkp-notes { color: #66666f; font-size: 7.4pt; margin-top: 1pt; white-space: pre-wrap; }
.tkp-overdue { color: #d2343f; font-weight: 700; }
.tkp-summary { display: flex; gap: 16pt; flex-wrap: wrap; font-size: 8pt; color: #55555e; margin-bottom: 8pt; }
.tkp-summary b { color: #141418; }
.tkp-bar { display: inline-block; width: 60pt; height: 4pt; border-radius: 2pt; background: #e2e2e8; vertical-align: middle; margin-left: 6pt; overflow: hidden; }
.tkp-bar span { display: block; height: 100%; }
`;

export const printDocs: PrintDocDef[] = [
  {
    id: 'task-checklist',
    title: 'Task Checklist',
    group: 'Overview',
    orientation: 'portrait',
    description: 'Tasks grouped by production phase with checkboxes, due dates and assignees',
    options: [
      { key: 'phase', label: 'Phase', type: 'select', default: 'all', choices: [{ value: 'all', label: 'All phases' }, ...PHASES.map((p) => ({ value: p.value, label: p.label }))] },
      { key: 'hideDone', label: 'Hide completed tasks', type: 'boolean', default: false },
      { key: 'tickDone', label: 'Tick completed tasks', type: 'boolean', default: true },
      { key: 'showNotes', label: 'Show notes', type: 'boolean', default: true },
    ],
    emptyReason: (p) => (p.tasks.length ? false : 'No tasks yet'),
    render: (ctx) => {
      const { project: p, fmt, options } = ctx;
      const today = todayISO();
      let tasks = p.tasks.map((t, i) => ({ t, i }));
      if (options.phase && options.phase !== 'all') tasks = tasks.filter(({ t }) => t.phase === options.phase);
      if (options.hideDone) tasks = tasks.filter(({ t }) => t.status !== 'done');
      tasks.sort((a, b) => phaseIdx(a.t.phase) - phaseIdx(b.t.phase) || a.i - b.i);
      const rows = tasks.map((x) => x.t);
      const done = p.tasks.filter((t) => t.status === 'done').length;
      const overdue = p.tasks.filter((t) => t.status !== 'done' && valid(t.due) && t.due < today).length;
      return {
        css: CSS,
        body: (
          <>
            <DocHeader
              ctx={ctx}
              title="Task Checklist"
              subtitle={options.phase && options.phase !== 'all' ? phaseLabel(options.phase) : `${p.tasks.length} tasks across ${new Set(p.tasks.map((t) => t.phase)).size} phases`}
            />
            <div className="tkp-summary">
              <span>
                <b>{done}</b> of {p.tasks.length} done
              </span>
              <span>
                <b>{p.tasks.length - done}</b> open
              </span>
              {overdue > 0 && (
                <span className="tkp-overdue">
                  {overdue} overdue
                </span>
              )}
            </div>
            <PTable<Task>
              rows={rows}
              empty="No tasks to show."
              groupBy={(t) => t.phase}
              groupLabel={(g) => {
                const all = p.tasks.filter((t) => t.phase === g);
                const d = all.filter((t) => t.status === 'done').length;
                return (
                  <span>
                    <Dot color={phaseColor(g)} />
                    {phaseLabel(g)} · {d}/{all.length} done
                    <span className="tkp-bar">
                      <span style={{ width: `${all.length ? Math.round((d / all.length) * 100) : 0}%`, background: phaseColor(g) }} />
                    </span>
                  </span>
                );
              }}
              columns={[
                { header: '', width: '14pt', cell: (t) => <Check on={!!options.tickDone && t.status === 'done'} /> },
                {
                  header: 'Task',
                  cell: (t) => (
                    <div className={t.status === 'done' ? 'tkp-done' : undefined}>
                      <div className="tkp-title">
                        {t.title || 'Untitled task'}
                        {t.status === 'doing' && (
                          <>
                            {' '}
                            <PBadge color="#3e8ef7">In progress</PBadge>
                          </>
                        )}
                      </div>
                      {options.showNotes && t.notes && <div className="tkp-notes">{t.notes}</div>}
                    </div>
                  ),
                },
                { header: 'Priority', width: '50pt', cell: (t) => (t.priority === 'high' ? <PBadge color="#e5484d">High</PBadge> : t.priority === 'low' ? <span className="pp-muted">Low</span> : '') },
                {
                  header: 'Due',
                  width: '78pt',
                  cell: (t) =>
                    valid(t.due) ? (
                      <span className={t.status !== 'done' && t.due < today ? 'tkp-overdue' : undefined}>
                        {weekdayShort(t.due)} {fmt.dateMedium(t.due).replace(/, \d{4}$/, '')}
                      </span>
                    ) : (
                      ''
                    ),
                },
                { header: 'Assignee', width: '96pt', cell: (t) => t.assignee ?? '' },
              ]}
            />
          </>
        ),
      };
    },
  },
  {
    id: 'milestones',
    title: 'Milestones',
    group: 'Overview',
    orientation: 'portrait',
    description: 'Key production milestones in date order',
    options: [{ key: 'showNotes', label: 'Show notes', type: 'boolean', default: true }],
    emptyReason: (p) => (p.milestones.length ? false : 'No milestones yet'),
    render: (ctx) => {
      const { project: p, fmt, options } = ctx;
      const today = todayISO();
      const rows = [...p.milestones].sort((a, b) => (a.date ?? '9999-12-31').localeCompare(b.date ?? '9999-12-31'));
      const next = rows.find((m) => !m.done && valid(m.date) && m.date >= today);
      const when = (m: Milestone) => {
        if (!valid(m.date)) return '';
        if (m.done) return 'Done';
        const d = diffDays(today, m.date);
        if (d === 0) return 'Today';
        if (d < 0) return <span className="tkp-overdue">{-d} days overdue</span>;
        return `in ${d} day${d === 1 ? '' : 's'}`;
      };
      return {
        css: CSS,
        body: (
          <>
            <DocHeader
              ctx={ctx}
              title="Milestones"
              subtitle={`${rows.filter((m) => m.done).length} of ${rows.length} reached${next ? ` · next: ${next.name} (${fmt.dateMedium(next.date)})` : ''}`}
            />
            <PTable<Milestone>
              rows={rows}
              zebra
              columns={[
                { header: '', width: '14pt', cell: (m) => <Check on={!!m.done} /> },
                {
                  header: 'Milestone',
                  cell: (m) => (
                    <div className={m.done ? 'tkp-done' : undefined}>
                      <div className="tkp-title">{m.name || 'Untitled milestone'}</div>
                      {options.showNotes && m.notes && <div className="tkp-notes">{m.notes}</div>}
                    </div>
                  ),
                },
                { header: 'Date', width: '100pt', cell: (m) => (valid(m.date) ? `${weekdayShort(m.date)} ${fmt.dateMedium(m.date)}` : 'TBD') },
                {
                  header: 'Phase',
                  width: '96pt',
                  cell: (m) => (
                    <span>
                      <Dot color={phaseColor(m.phase)} />
                      {phaseLabel(m.phase)}
                    </span>
                  ),
                },
                { header: 'When', width: '80pt', cell: when },
              ]}
            />
          </>
        ),
      };
    },
  },
];
