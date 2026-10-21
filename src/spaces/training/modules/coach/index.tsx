/* Journal & Coach: the check-in timeline (conversational blurbs with mood /
   energy / sleep / hunger), computed insights, saved coach notes from your AI
   (or yourself), and ready-to-copy prompts for a holistic AI coach that can use
   the Training tools and the studio-wide studio_context tool. */
import { useEffect, useMemo, useState } from 'react';
import { Bot, ClipboardCopy, MessageSquareHeart, Pencil, Pin, PinOff, Plus, Sparkles, Trash2, User } from 'lucide-react';
import { Badge, Button, Card, confirmDialog, EmptyState, ExportMenu, Field, IconButton, Input, Modal, ModuleHeader, NumberInput, SearchInput, Select, Textarea, toast } from '@/ui';
import { LineChart } from '@/ui/charts';
import { useSpaceFormatters } from '@/store/space';
import { addDays } from '@/lib/dates';
import { uid } from '@/lib/id';
import { COACH_CATEGORIES, RATING_WORDS, type CheckIn, type CoachCategory, type CoachNote } from '../../types';
import { dayCheckIn, dayEaten, insights as buildInsights, mealMap, sessionDone, sessionStats } from '../../calc';
import { updateTraining } from '../../ops';
import { copyText, InsightList, NotMedical, NumberUnit, RatingPicker, useMondayFirst, useNavParams, useToday, useTraining, useUnits } from '../../ui';
import { QuickCheckIn } from '../overview/CheckIn';

const PROMPTS: { title: string; text: string }[] = [
  {
    title: 'Daily check-in',
    text: 'Check in with me for today in PrePro Studio → Training. Ask how I slept, my weight, energy and mood, what I ate and whether I trained — conversationally, one or two questions at a time. Then log everything in one training_log call and tell me my streak and how today compares with my targets.',
  },
  {
    title: 'Weekly review',
    text: 'Run training_report for the last 7 days, read my latest check-ins, and give me a weekly review: what went well, what slipped (nutrition, training, sleep), and one specific focus for next week. Save the key advice with training_coach_note (pinned).',
  },
  {
    title: 'Holistic coach',
    text: 'Call studio_context to see my week across PrePro Studio (productions and shoot days, business work, money, marketing deadlines) and training_report for my training. Coach me holistically: when to train around my schedule, how to fit meal prep and sleep around busy days, and where stress or recovery is the bottleneck. Save the plan with training_coach_note. Remind me it is not medical advice.',
  },
  {
    title: 'Plan my meals + groceries',
    text: 'Look at my macro targets and meal library in Training (list_items meals). Plan next week on meal_plan with add_items so each day lands near my calories and protein, reusing meals to keep cooking simple. Then run training_grocery_list for that week and show me the list by aisle.',
  },
  {
    title: 'Am I on track?',
    text: 'Use training_report for the last 12 weeks to tell me when I will reach my goal weight and strength targets at the current pace, what the projection assumes, and what would safely speed it up. Update my macro targets with training_macros only if I agree.',
  },
];

export default function TrainingCoach() {
  const t = useTraining();
  const u = useUnits();
  const fmt = useSpaceFormatters();
  const today = useToday();
  const mondayFirst = useMondayFirst();
  const params = useNavParams();
  const [q, setQ] = useState('');
  const [days, setDays] = useState(30);
  const [editing, setEditing] = useState<CheckIn | null>(null);
  const [note, setNote] = useState<CoachNote | null>(null);
  const [showNew, setShowNew] = useState(false);
  const ins = useMemo(() => buildInsights(t, today, mondayFirst, fmt.dateMedium), [t, today, mondayFirst, fmt]);
  const meals = useMemo(() => mealMap(t), [t]);

  useEffect(() => {
    if (params.checkInId) {
      const c = t.checkIns.find((x) => x.id === params.checkInId);
      if (c) setEditing(c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const timeline = useMemo(() => {
    const s = q.trim().toLowerCase();
    const xs = [...t.checkIns].filter((c) => !s || (c.text ?? '').toLowerCase().includes(s)).sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? '').localeCompare(a.time ?? ''));
    const dates = [...new Set(xs.map((c) => c.date))];
    return { dates: dates.slice(0, days), more: dates.length > days, byDate: (d: string) => xs.filter((c) => c.date === d) };
  }, [t.checkIns, q, days]);

  const moodSeries = useMemo(() => {
    const from = addDays(today, -41);
    const ds = [...new Set(t.checkIns.filter((c) => c.date >= from).map((c) => c.date))].sort();
    const pts = ds.map((d) => ({ d, c: dayCheckIn(t, d) }));
    return [
      { id: 'mood', label: 'Mood', slot: 0, points: pts.filter((p) => p.c.mood != null).map((p) => ({ x: p.d, y: p.c.mood! })) },
      { id: 'energy', label: 'Energy', slot: 1, points: pts.filter((p) => p.c.energy != null).map((p) => ({ x: p.d, y: p.c.energy! })) },
      { id: 'sleep', label: 'Sleep quality', slot: 2, points: pts.filter((p) => p.c.sleep != null).map((p) => ({ x: p.d, y: p.c.sleep! })) },
    ].filter((s) => s.points.length);
  }, [t, today]);

  const notes = useMemo(() => [...t.coachNotes].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.date.localeCompare(a.date)), [t.coachNotes]);

  return (
    <div className="module tr-module">
      <ModuleHeader
        title="Journal & Coach"
        icon={MessageSquareHeart}
        subtitle={`${t.checkIns.length} check-ins · ${t.coachNotes.length} coach notes`}
        actions={
          <>
            <ExportMenu docs={[{ id: 'space-train-progress', label: 'Progress report' }]} />
            <Button variant="primary" icon={Plus} onClick={() => setShowNew((x) => !x)}>
              Check in
            </Button>
          </>
        }
      />
      <div className="module-body">
        <div className="tr-page">
          <div className="tr-cols">
            <div className="tr-col">
              {(showNew || t.checkIns.length === 0) && (
                <Card title="New check-in">
                  <QuickCheckIn date={today} extended onSaved={() => setShowNew(false)} />
                </Card>
              )}
              <Card title="Journal" actions={<SearchInput value={q} onChange={setQ} placeholder="Search blurbs…" width={180} />}>
                {timeline.dates.length === 0 ? (
                  <EmptyState icon={MessageSquareHeart} title={q ? 'No check-ins match' : 'No check-ins yet'} description="A line or two a day — how you slept, how training felt, cravings, stress. Your AI can write these for you from a conversation, and the coach uses them to spot patterns." />
                ) : (
                  <div className="tr-timeline">
                    {timeline.dates.map((d) => {
                      const items = timeline.byDate(d);
                      const metric = t.metrics.find((m) => m.date === d);
                      const ses = t.sessions.filter((s) => s.date === d && sessionDone(s));
                      const eaten = dayEaten(t, d, meals);
                      return (
                        <section key={d} className="tr-tl-day">
                          <header>
                            <b>{d === today ? 'Today' : fmt.dateLong(d)}</b>
                            <span className="muted small">
                              {[metric?.weightKg != null ? u.weight(metric.weightKg) : '', ses.length ? `${ses.map((s) => s.name || 'workout').join(', ')} (${ses.reduce((a, s) => a + sessionStats(s).sets, 0)} sets)` : '', eaten.items ? `${Math.round(eaten.calories)} kcal · ${Math.round(eaten.protein)} g protein` : ''].filter(Boolean).join(' · ')}
                            </span>
                          </header>
                          {items.map((c) => (
                            <article key={c.id} className={`tr-entry ${c.source}`}>
                              <div className="tr-entry-head">
                                {c.source === 'agent' ? <Bot size={14} /> : <User size={14} />}
                                <span className="muted small">
                                  {c.source === 'agent' ? 'via your AI' : 'you'}
                                  {c.time ? ` · ${fmt.time(c.time)}` : ''}
                                </span>
                                <span className="spacer" />
                                <IconButton icon={Pencil} label="Edit check-in" size="sm" onClick={() => setEditing(c)} />
                              </div>
                              {c.text && <p className="tr-entry-text">{c.text}</p>}
                              <div className="row wrap" style={{ gap: 4 }}>
                                {(['mood', 'energy', 'sleep', 'hunger', 'stress', 'soreness'] as const).map((k) =>
                                  c[k] != null ? (
                                    <span key={k} className={`tr-rate r${c[k]}`}>
                                      {k} {c[k]}/5 · {RATING_WORDS[k][c[k]! - 1]}
                                    </span>
                                  ) : null,
                                )}
                                {c.sleepHours != null && <span className="tr-rate">{c.sleepHours} h sleep</span>}
                                {c.steps != null && <span className="tr-rate">{c.steps.toLocaleString()} steps</span>}
                                {c.waterL != null && <span className="tr-rate">{c.waterL} L water</span>}
                              </div>
                            </article>
                          ))}
                        </section>
                      );
                    })}
                    {timeline.more && (
                      <Button variant="ghost" onClick={() => setDays(days + 30)}>
                        Show older
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            </div>

            <div className="tr-col">
              <Card title="Insights" actions={<Sparkles size={15} className="muted" />}>
                <InsightList items={ins} />
                <NotMedical>Computed from your own logs to spot patterns — not medical advice.</NotMedical>
              </Card>
              {moodSeries.length > 0 && (
                <Card title="Mood, energy & sleep (6 weeks)">
                  <LineChart series={moodSeries} height={180} yFormat={(v) => `${Math.round(v)}`} xFormat={(x) => (typeof x === 'string' ? fmt.dateShort(x).replace(/^\w+ /, '') : String(x))} ariaLabel="Mood, energy and sleep quality ratings from 1 to 5" />
                </Card>
              )}
              <Card
                title={`Coach notes${notes.length ? ` · ${notes.length}` : ''}`}
                actions={
                  <Button size="sm" icon={Plus} onClick={() => setNote({ id: '', date: today, title: '', source: 'me', category: 'general' })}>
                    Note
                  </Button>
                }
              >
                {notes.length === 0 ? (
                  <p className="muted small" style={{ margin: 0 }}>
                    Advice your AI saves with training_coach_note lands here (pin the ones to keep in view). You can add your own too.
                  </p>
                ) : (
                  <div className="tr-notes">
                    {notes.map((n) => (
                      <article key={n.id} className={`tr-coach-note ${n.pinned ? 'pinned' : ''}`}>
                        <div className="tr-entry-head">
                          {n.source === 'agent' ? <Bot size={14} /> : <User size={14} />}
                          <b className="grow">{n.title}</b>
                          <IconButton
                            icon={n.pinned ? PinOff : Pin}
                            label={n.pinned ? 'Unpin' : 'Pin'}
                            size="sm"
                            onClick={() =>
                              updateTraining((tr) => {
                                const x = tr.coachNotes.find((y) => y.id === n.id);
                                if (!x) return;
                                if (x.pinned) delete x.pinned;
                                else x.pinned = true;
                              })
                            }
                          />
                          <IconButton icon={Pencil} label="Edit note" size="sm" onClick={() => setNote(n)} />
                        </div>
                        <div className="muted tiny">
                          {fmt.dateMedium(n.date)} · {COACH_CATEGORIES.find((c) => c.value === n.category)?.label ?? 'General'} {n.pinned && <Badge tone="accent">Pinned</Badge>}
                        </div>
                        {n.body && <p className="tr-entry-text">{n.body}</p>}
                      </article>
                    ))}
                  </div>
                )}
              </Card>
              <Card title="Your AI coach" actions={<Bot size={15} className="muted" />}>
                <p className="small text-2" style={{ marginTop: 0 }}>
                  Any AI connected to PrePro Studio (MCP) can log for you, read your trends and give advice. It can call the Training tools (<code>training_log</code>, <code>training_report</code>, <code>training_macros</code>, <code>training_grocery_list</code>, <code>training_add_photo</code>, <code>training_coach_note</code>) and <code>studio_context</code> for your work, money and marketing load — so the advice fits your whole week. Copy a prompt to start:
                </p>
                <div className="tr-prompts">
                  {PROMPTS.map((p) => (
                    <div key={p.title} className="tr-prompt">
                      <div className="row">
                        <b className="grow small">{p.title}</b>
                        <Button size="sm" icon={ClipboardCopy} onClick={async () => toast((await copyText(p.text)) ? 'Prompt copied — paste it in your AI chat' : 'Could not copy', 'info')}>
                          Copy
                        </Button>
                      </div>
                      <p className="muted small">{p.text}</p>
                    </div>
                  ))}
                </div>
                <NotMedical>AI coaching is general guidance, not medical advice. Talk to a professional about injuries, medical conditions, medication or disordered eating.</NotMedical>
              </Card>
            </div>
          </div>
        </div>
      </div>
      {editing && <CheckInModal c={editing} onClose={() => setEditing(null)} />}
      {note && <NoteModal n={note} onClose={() => setNote(null)} />}
    </div>
  );
}

function CheckInModal({ c, onClose }: { c: CheckIn; onClose: () => void }) {
  const [x, setX] = useState<CheckIn>(c);
  const set = (patch: Partial<CheckIn>) => setX((y) => ({ ...y, ...patch }));
  const save = () => {
    updateTraining((tr) => {
      const i = tr.checkIns.findIndex((y) => y.id === c.id);
      const row = { ...x };
      for (const k of Object.keys(row) as (keyof CheckIn)[]) if (row[k] === undefined || row[k] === '') delete row[k];
      if (i >= 0) tr.checkIns[i] = row;
    });
    onClose();
  };
  const remove = async () => {
    if (!(await confirmDialog({ title: 'Delete this check-in?', confirmLabel: 'Delete', danger: true }))) return;
    updateTraining((tr) => {
      tr.checkIns = tr.checkIns.filter((y) => y.id !== c.id);
    });
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Check-in"
      size="md"
      footer={
        <>
          <Button variant="danger" icon={Trash2} onClick={remove}>
            Delete
          </Button>
          <div className="spacer" />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="col" style={{ gap: 10 }}>
        <Field label="What's going on">
          <Textarea value={x.text ?? ''} onChange={(text) => set({ text })} rows={4} autoFocus />
        </Field>
        {(['mood', 'energy', 'sleep', 'hunger', 'stress', 'soreness'] as const).map((k) => (
          <div key={k} className="tr-field">
            <span style={{ textTransform: 'capitalize' }}>{k === 'sleep' ? 'Sleep quality' : k}</span>
            <RatingPicker kind={k} value={x[k]} onChange={(v) => set({ [k]: v })} />
          </div>
        ))}
        <div className="tr-form-grid">
          <Field label="Sleep">
            <NumberUnit value={x.sleepHours} onChange={(sleepHours) => set({ sleepHours })} unit="h" step={0.25} />
          </Field>
          <Field label="Steps">
            <NumberInput value={x.steps} onChange={(steps) => set({ steps })} inputMode="numeric" />
          </Field>
          <Field label="Water">
            <NumberUnit value={x.waterL} onChange={(waterL) => set({ waterL })} unit="L" step={0.25} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function NoteModal({ n, onClose }: { n: CoachNote; onClose: () => void }) {
  const [x, setX] = useState<CoachNote>(n);
  const isNew = !n.id;
  const save = () => {
    if (!x.title.trim()) {
      toast('Give the note a title', 'info');
      return;
    }
    updateTraining((tr) => {
      const row: CoachNote = { ...x, id: x.id || uid('note'), title: x.title.trim() };
      for (const k of Object.keys(row) as (keyof CoachNote)[]) if (row[k] === undefined || row[k] === '') delete row[k];
      const i = tr.coachNotes.findIndex((y) => y.id === row.id);
      if (i >= 0) tr.coachNotes[i] = row;
      else tr.coachNotes.push(row);
    });
    onClose();
  };
  const remove = async () => {
    if (!(await confirmDialog({ title: 'Delete this note?', message: n.title, confirmLabel: 'Delete', danger: true }))) return;
    updateTraining((tr) => {
      tr.coachNotes = tr.coachNotes.filter((y) => y.id !== n.id);
    });
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'New coach note' : 'Coach note'}
      size="md"
      footer={
        <>
          {!isNew && (
            <Button variant="danger" icon={Trash2} onClick={remove}>
              Delete
            </Button>
          )}
          <div className="spacer" />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="tr-form-grid">
        <Field label="Title" span="all">
          <Input value={x.title} onChange={(title) => setX({ ...x, title })} autoFocus placeholder="Protein at breakfast" />
        </Field>
        <Field label="Category">
          <Select value={x.category ?? 'general'} onChange={(v) => setX({ ...x, category: v as CoachCategory })} options={COACH_CATEGORIES} />
        </Field>
        <Field label="Pinned">
          <Select value={x.pinned ? 'yes' : 'no'} onChange={(v) => setX({ ...x, pinned: v === 'yes' || undefined })} options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Pinned' }]} />
        </Field>
        <Field label="Note" span="all">
          <Textarea value={x.body ?? ''} onChange={(body) => setX({ ...x, body })} rows={6} />
        </Field>
      </div>
    </Modal>
  );
}
