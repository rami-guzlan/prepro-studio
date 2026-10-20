/* Printable documents of the Strategy module: the strategy brief. */
import type { SpacePrintDocDef } from '@/spaces/print/types';
import { SpaceDocHeader } from '@/spaces/print/components';
import { Dot, PBadge, PSection, PTable, Photo, Pre } from '@/print/components';
import { GOAL_STATUSES, TACTIC_STATUSES } from '@/spaces/constants';
import { channelColor, goalProgress } from '@/spaces/derive';
import type { Persona, Strategy } from '@/spaces/types';
import { optionColor, optionLabel } from '@/lib/constants';

const CSS = `
.sps-msg { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8pt 14pt; }
.sps-msg .full { grid-column: 1 / -1; }
.sps-block .k { font-size: 6.8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #6b6b75; margin-bottom: 2pt; }
.sps-block .v { font-size: 9pt; line-height: 1.45; white-space: pre-wrap; }
.sps-tagline { font-size: 15pt; font-weight: 700; letter-spacing: -0.01em; margin: 2pt 0 6pt; }
.sps-personas { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8pt; }
.sps-persona { border: 0.75pt solid #c9c9d1; border-radius: 4pt; padding: 7pt 9pt; break-inside: avoid; }
.sps-persona-head { display: flex; gap: 8pt; align-items: center; margin-bottom: 4pt; }
.sps-persona-head .pp-photo { border-radius: 50%; flex-shrink: 0; }
.sps-persona-name { font-size: 10.5pt; font-weight: 700; }
.sps-persona-sum { font-size: 8pt; color: #55555e; }
.sps-pf { margin-top: 3pt; }
.sps-pf .k { font-size: 6.4pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #7a7a84; }
.sps-pf .v { font-size: 8.2pt; white-space: pre-wrap; line-height: 1.38; }
.sps-bar { display: block; width: 100%; height: 4.5pt; border-radius: 3pt; background: #ececf1; overflow: hidden; margin: 1.5pt 0; }
.sps-bar > span { display: block; height: 100%; border-radius: 3pt; }
.sps-bar.target > span { opacity: 0.45; }
.sps-sub { color: #707078; font-size: 7.3pt; }
.sps-pct { font-size: 7pt; color: #55555e; font-variant-numeric: tabular-nums; }
.sps-warn { color: #b26a00; font-size: 7.5pt; margin-top: 3pt; }
`;

const MSG: { key: keyof Strategy; label: string; full?: boolean }[] = [
  { key: 'positioning', label: 'Positioning', full: true },
  { key: 'valueProp', label: 'Value proposition', full: true },
  { key: 'voice', label: 'Voice & tone' },
  { key: 'keyMessages', label: 'Key messages' },
  { key: 'competitors', label: 'Competitors & inspiration', full: true },
];

const PERSONA_FIELDS: { key: keyof Persona; label: string }[] = [
  { key: 'demographics', label: 'Demographics' },
  { key: 'pains', label: 'Pains' },
  { key: 'desires', label: 'Desires' },
  { key: 'whereTheyAre', label: 'Where they are online' },
  { key: 'objections', label: 'Objections' },
  { key: 'notes', label: 'Notes' },
];

export const spacePrintDocs: SpacePrintDocDef[] = [
  {
    id: 'space-strategy',
    title: 'Strategy Brief',
    group: 'Strategy',
    orientation: 'portrait',
    description: 'Positioning, value proposition, tagline, voice, key messages, audience personas, pillars (target vs actual), goals with progress, tactics and notes',
    options: [
      { key: 'showPersonaPhotos', label: 'Persona photos', type: 'boolean', default: true },
      { key: 'showTactics', label: 'Tactics table', type: 'boolean', default: true },
      { key: 'showNotes', label: 'Strategy notes', type: 'boolean', default: true },
    ],
    emptyReason: (s) => {
      const st = s.strategy;
      const any = st.positioning || st.valueProp || st.tagline || st.voice || st.keyMessages || st.competitors || st.notes || s.goals.length || s.personas.length || s.pillars.length || s.tactics.length;
      return any ? false : 'No strategy written yet';
    },
    render: (ctx) => {
      const s = ctx.space;
      const { fmt, options } = ctx;
      const st = s.strategy;
      const total = s.content.length;
      const counts = new Map<string, number>();
      for (const c of s.content) if (c.pillarId) counts.set(c.pillarId, (counts.get(c.pillarId) ?? 0) + 1);
      const targetSum = s.pillars.reduce((a, p) => a + (p.targetShare ?? 0), 0);
      const anyTarget = s.pillars.some((p) => p.targetShare != null);
      const goals = [...s.goals].sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'));
      const campName = new Map(s.campaigns.map((c) => [c.id, c.name]));
      const channelById = new Map(s.channels.map((c) => [c.id, c]));
      const tactics = [...s.tactics].sort((a, b) => TACTIC_STATUSES.findIndex((x) => x.value === a.status) - TACTIC_STATUSES.findIndex((x) => x.value === b.status));
      const tacticBudget = tactics.reduce((a, t) => a + (t.budget ?? 0), 0);
      const msgs = MSG.filter((m) => (st[m.key] ?? '').toString().trim());

      return {
        css: CSS,
        body: (
          <>
            <SpaceDocHeader ctx={ctx} title="Strategy Brief" subtitle={s.meta.description || undefined} />

            {(st.tagline || msgs.length > 0) && (
              <PSection title="Messaging">
                {st.tagline && <div className="sps-tagline">“{st.tagline}”</div>}
                <div className="sps-msg">
                  {msgs.map((m) => (
                    <div key={m.key} className={`sps-block pp-avoid ${m.full ? 'full' : ''}`}>
                      <div className="k">{m.label}</div>
                      <div className="v">{String(st[m.key] ?? '')}</div>
                    </div>
                  ))}
                </div>
              </PSection>
            )}

            {s.personas.length > 0 && (
              <PSection title="Audience">
                <div className="sps-personas">
                  {s.personas.map((p) => (
                    <div key={p.id} className="sps-persona">
                      <div className="sps-persona-head">
                        {options.showPersonaPhotos && p.photo && <Photo src={ctx.asset(p.photo)} width="30pt" height="30pt" />}
                        <div>
                          <div className="sps-persona-name">{p.name || 'Persona'}</div>
                          {p.summary && <div className="sps-persona-sum">{p.summary}</div>}
                        </div>
                      </div>
                      {PERSONA_FIELDS.filter((f) => (p[f.key] ?? '').toString().trim()).map((f) => (
                        <div key={f.key} className="sps-pf">
                          <div className="k">{f.label}</div>
                          <div className="v">{String(p[f.key])}</div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </PSection>
            )}

            {s.pillars.length > 0 && (
              <PSection title="Content pillars" right={total ? `${total} pieces` : undefined}>
                <PTable
                  rows={s.pillars}
                  columns={[
                    {
                      header: 'Pillar',
                      cell: (p) => (
                        <>
                          <div className="pp-strong">
                            <Dot color={p.color} />
                            {p.name || 'Pillar'}
                          </div>
                          {p.description && <div className="sps-sub">{p.description}</div>}
                        </>
                      ),
                    },
                    {
                      header: 'Target vs actual share',
                      width: '40%',
                      cell: (p) => {
                        const actual = total ? ((counts.get(p.id) ?? 0) / total) * 100 : 0;
                        return (
                          <>
                            <span className="sps-bar target">
                              <span style={{ width: `${Math.min(100, p.targetShare ?? 0)}%`, background: p.color }} />
                            </span>
                            <span className="sps-bar">
                              <span style={{ width: `${Math.min(100, actual)}%`, background: p.color }} />
                            </span>
                          </>
                        );
                      },
                    },
                    { header: 'Target', width: '40pt', num: true, cell: (p) => (p.targetShare != null ? `${p.targetShare}%` : '—') },
                    { header: 'Actual', width: '64pt', num: true, cell: (p) => (total ? `${Math.round(((counts.get(p.id) ?? 0) / total) * 100)}% (${counts.get(p.id) ?? 0})` : '—') },
                  ]}
                />
                {anyTarget && Math.round(targetSum) !== 100 && <div className="sps-warn">Target shares add up to {Math.round(targetSum)}% (should be 100%).</div>}
              </PSection>
            )}

            {goals.length > 0 && (
              <PSection title="Goals">
                <PTable
                  rows={goals}
                  columns={[
                    {
                      header: 'Goal',
                      cell: (g) => (
                        <>
                          <div className="pp-strong">{g.title || 'Untitled goal'}</div>
                          {(g.metric || g.description) && <div className="sps-sub">{[g.metric, g.description].filter(Boolean).join(' — ')}</div>}
                          {g.campaignId && campName.get(g.campaignId) && <div className="sps-sub">Campaign: {campName.get(g.campaignId)}</div>}
                        </>
                      ),
                    },
                    {
                      header: 'Progress',
                      width: '26%',
                      cell: (g) => {
                        const p = goalProgress(g);
                        const c = optionColor(GOAL_STATUSES, g.status) ?? '#888';
                        if (p == null) return <span className="pp-muted">—</span>;
                        return (
                          <>
                            <span className="sps-bar">
                              <span style={{ width: `${Math.round(p * 100)}%`, background: c }} />
                            </span>
                            <div className="sps-pct">
                              {fmt.number(g.current, 2)} / {fmt.number(g.target, 2)} {g.unit ?? ''} · {Math.round(p * 100)}%
                            </div>
                          </>
                        );
                      },
                    },
                    { header: 'Baseline', width: '46pt', num: true, cell: (g) => (g.baseline != null ? fmt.number(g.baseline, 2) : '—') },
                    { header: 'Due', width: '60pt', cell: (g) => fmt.dateMedium(g.due) || '—' },
                    { header: 'Status', width: '60pt', cell: (g) => <PBadge color={optionColor(GOAL_STATUSES, g.status)}>{optionLabel(GOAL_STATUSES, g.status)}</PBadge> },
                  ]}
                />
              </PSection>
            )}

            {options.showTactics && tactics.length > 0 && (
              <PSection title="Tactics" right={tacticBudget ? `Budget ${fmt.money(tacticBudget, { cents: false })}` : undefined}>
                <PTable
                  rows={tactics}
                  groupBy={(t) => optionLabel(TACTIC_STATUSES, t.status)}
                  columns={[
                    {
                      header: 'Tactic',
                      cell: (t) => (
                        <>
                          <div className="pp-strong">{t.title || 'Untitled tactic'}</div>
                          {t.description && <div className="sps-sub">{t.description}</div>}
                        </>
                      ),
                    },
                    {
                      header: 'Channels',
                      width: '90pt',
                      cell: (t) =>
                        (t.channelIds ?? [])
                          .map((id) => channelById.get(id))
                          .filter((c): c is NonNullable<typeof c> => !!c)
                          .map((c) => (
                            <div key={c.id}>
                              <Dot color={channelColor(c)} />
                              {c.name}
                            </div>
                          )),
                    },
                    { header: 'Campaign', width: '70pt', cell: (t) => (t.campaignId ? campName.get(t.campaignId) ?? '' : '') },
                    { header: 'Owner', width: '52pt', cell: (t) => t.owner ?? '' },
                    {
                      header: 'Dates',
                      width: '78pt',
                      cell: (t) => (t.start || t.end ? `${fmt.date(t.start) || '…'} – ${fmt.date(t.end) || '…'}` : ''),
                    },
                    { header: 'Budget', width: '50pt', num: true, cell: (t) => (t.budget ? fmt.money(t.budget, { cents: false }) : '') },
                    { header: 'Status', width: '48pt', cell: (t) => <PBadge color={optionColor(TACTIC_STATUSES, t.status)}>{optionLabel(TACTIC_STATUSES, t.status)}</PBadge> },
                  ]}
                />
              </PSection>
            )}

            {options.showNotes && st.notes?.trim() && (
              <PSection title="Notes">
                <Pre>{st.notes}</Pre>
              </PSection>
            )}
          </>
        ),
      };
    },
  },
];
