/* Overview — the project's home screen: hero (cover, title, logline, key
   people, format), stat tiles linking to every module, production timeline,
   readiness checklist, upcoming tasks & milestones and project notes. */
import './overview.css';
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  CalendarRange,
  Check,
  ChevronRight,
  Circle,
  CircleCheck,
  CircleMinus,
  Clapperboard,
  FileText,
  Flag,
  HardHat,
  LayoutDashboard,
  ListChecks,
  MapPin,
  PackageCheck,
  Plus,
  Settings,
  UserCheck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Milestone, ProjectMeta, Task } from '@/types';
import { listOps, update, useFormatters, useProject, useProjectData } from '@/store/project';
import { navigate } from '@/store/app';
import { useScriptModel } from '@/derived/script';
import { PHASES, PROJECT_STATUSES, PROJECT_TYPES, optionColor, optionLabel } from '@/lib/constants';
import { diffDays, parseISODate, todayISO, MONTHS_SHORT } from '@/lib/dates';
import { parseDuration, formatSeconds } from '@/lib/format';
import { computeTiming } from '@/modules/avscript/format';
import { uid } from '@/lib/id';
import { truncate } from '@/lib/text';
import {
  Avatar,
  Button,
  Card,
  Checkbox,
  ExportMenu,
  ImageDrop,
  Input,
  ModuleHeader,
  Progress,
  Select,
  Stat,
  Textarea,
  toast,
} from '@/ui';
import {
  STATUS_PHASE,
  budgetTotals,
  buildTimeline,
  isISO,
  pctOf,
  readinessChecks,
  relativeDay,
  shootRange,
  type ReadinessCheck,
  type TimelineModel,
} from './derive';

type MetaKey = keyof ProjectMeta;

function setMeta<K extends MetaKey>(key: K, value: ProjectMeta[K]) {
  update(
    (d) => {
      (d.meta as ProjectMeta)[key] = value;
    },
    { coalesce: `overview:meta:${String(key)}` },
  );
}

const taskOps = listOps<Task>((d) => d.tasks, 'tasks');
const milestoneOps = listOps<Milestone>((d) => d.milestones, 'milestones');

/* ======================================================================== */

export default function OverviewModule() {
  const meta = useProject((p) => p.meta);
  const statusLabel = optionLabel(PROJECT_STATUSES, meta.status);
  const typeLabel = optionLabel(PROJECT_TYPES, meta.projectType);

  return (
    <div className="module">
      <ModuleHeader
        title="Overview"
        icon={LayoutDashboard}
        subtitle={`${typeLabel} · ${statusLabel}`}
        actions={
          <>
            <ExportMenu
              docs={[
                { id: 'project-overview', label: 'Project one-sheet' },
                { id: 'production-calendar', label: 'Production calendar' },
              ]}
            />
            <Button icon={Settings} onClick={() => navigate('settings')}>
              Project settings
            </Button>
          </>
        }
      />
      <div className="module-body">
        <div className="ov-page">
          <Hero />
          <StatTiles />
          <TimelineCard />
          <div className="ov-columns">
            <ReadinessCard />
            <div className="ov-stack">
              <UpcomingCard />
              <NotesCard />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ======================================================================== hero */

function Hero() {
  const meta = useProject((p) => p.meta);
  const fmt = useFormatters();
  const project = useProjectData();
  const range = useMemo(() => shootRange(project), [project]);
  const statusColor = optionColor(PROJECT_STATUSES, meta.status) ?? '#888';
  const runtime = parseDuration(meta.targetRuntime ?? '');

  const people: { key: 'director' | 'producer' | 'writer' | 'client' | 'productionCompany'; label: string }[] = [
    { key: 'director', label: 'Director' },
    { key: 'producer', label: 'Producer' },
    { key: 'writer', label: 'Writer' },
    { key: 'client', label: 'Client' },
    { key: 'productionCompany', label: 'Production company' },
  ];

  const chips: { label: string; value?: string; title: string }[] = [
    { label: 'Aspect', value: meta.aspectRatio, title: 'Aspect ratio' },
    { label: 'Resolution', value: meta.resolution?.replace('x', '×'), title: 'Resolution' },
    { label: 'Frame rate', value: meta.frameRate ? `${meta.frameRate} fps` : undefined, title: 'Frame rate' },
    { label: 'Runtime', value: runtime ? formatSeconds(runtime) : meta.targetRuntime, title: 'Target runtime' },
  ];

  const shootText = range.start
    ? range.end && range.end !== range.start
      ? `${fmt.dateMedium(range.start)} – ${fmt.dateMedium(range.end)}`
      : fmt.dateMedium(range.start)
    : '';

  return (
    <section className="ov-hero" style={{ ['--ov-color' as string]: meta.color || '#7c5cff' }}>
      <div className="ov-cover">
        <ImageDrop value={meta.poster} onChange={(v) => setMeta('poster', v)} aspect={16 / 10} label="Add a cover image" />
      </div>
      <div className="ov-hero-main">
        <div className="ov-hero-top">
          <Select
            className="ov-status"
            value={meta.status}
            options={PROJECT_STATUSES}
            onChange={(v) => setMeta('status', v as ProjectMeta['status'])}
            style={{ color: statusColor, background: `color-mix(in srgb, ${statusColor} 14%, transparent)` }}
            aria-label="Project status"
          />
          <Select
            className="ov-type"
            bare
            size="sm"
            value={meta.projectType}
            options={PROJECT_TYPES}
            onChange={(v) => setMeta('projectType', v as ProjectMeta['projectType'])}
            aria-label="Project type"
          />
          <div className="spacer" />
          {shootText && (
            <button type="button" className="ov-date-chip" onClick={() => navigate('schedule')} title="Shooting schedule">
              <CalendarRange size={13} /> Shoot {shootText}
            </button>
          )}
          {isISO(meta.deliveryDate) && (
            <button type="button" className="ov-date-chip" onClick={() => navigate('post')} title="Post-production">
              <Flag size={13} /> Delivery {fmt.dateMedium(meta.deliveryDate)}
            </button>
          )}
        </div>
        <input
          className="ov-title"
          value={meta.title}
          placeholder="Project title"
          onChange={(e) => setMeta('title', e.target.value)}
          aria-label="Project title"
          spellCheck={false}
        />
        <input
          className="ov-subtitle"
          value={meta.subtitle ?? ''}
          placeholder="Subtitle, version or campaign"
          onChange={(e) => setMeta('subtitle', e.target.value || undefined)}
          aria-label="Subtitle"
        />
        <Textarea
          bare
          minRows={1}
          className="ov-logline"
          value={meta.logline}
          placeholder="Logline — the whole story in one sentence"
          onChange={(v) => setMeta('logline', v)}
          aria-label="Logline"
        />
        <Textarea
          bare
          minRows={2}
          className="ov-synopsis"
          value={meta.synopsis}
          placeholder="Synopsis — what happens, who it is for, and why it matters"
          onChange={(v) => setMeta('synopsis', v)}
          aria-label="Synopsis"
        />
        <div className="ov-people">
          {people.map((f) => (
            <label key={f.key} className="ov-person">
              <span>{f.label}</span>
              <input
                className="input bare sm"
                value={meta[f.key] ?? ''}
                placeholder="—"
                onChange={(e) => setMeta(f.key, e.target.value || undefined)}
              />
            </label>
          ))}
        </div>
        <div className="ov-chips">
          {chips.map((c) => (
            <button key={c.label} type="button" className="ov-chip" title={`${c.title} — edit in Project Settings`} onClick={() => navigate('settings')}>
              <span>{c.label}</span>
              <b>{c.value || '—'}</b>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ======================================================================== stats */

function Tile({
  icon: Icon,
  label,
  value,
  sub,
  progress,
  color,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  progress?: number;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="ov-tile" onClick={onClick}>
      <Stat
        label={
          <span className="ov-tile-label">
            <Icon size={14} />
            {label}
            <ChevronRight size={13} className="ov-tile-go" />
          </span>
        }
        value={value}
        sub={
          <>
            <span className="ov-tile-sub">{sub}</span>
            {progress != null && (
              <span className="ov-bar">
                <span style={{ width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`, background: color }} />
              </span>
            )}
          </>
        }
      />
    </button>
  );
}

function StatTiles() {
  const p = useProjectData();
  const model = useScriptModel();
  const fmt = useFormatters();

  const s = useMemo(() => {
    const avRows = p.script.av?.rows ?? [];
    const avSeconds = computeTiming(avRows).total;
    const speaking = new Set(model.speakingNames);
    const castConfirmed = p.cast.filter((c) => c.status === 'confirmed').length;
    const castActive = p.cast.filter((c) => c.status !== 'declined').length;
    const crewConfirmed = p.crew.filter((c) => c.status === 'confirmed').length;
    const crewActive = p.crew.filter((c) => c.status !== 'declined').length;
    const depts = new Set(p.crew.map((c) => c.department)).size;
    const locs = p.locations.filter((l) => l.status !== 'declined');
    const locConfirmed = locs.filter((l) => l.status === 'confirmed').length;
    const shots = p.shots.filter((x) => x.status !== 'omitted');
    const boarded = shots.filter((x) => x.image || x.drawing).length;
    const range = shootRange(p);
    const budget = budgetTotals(p.budget);
    const tasksDone = p.tasks.filter((t) => t.status === 'done').length;
    const dlvDone = p.post.deliverables.filter((d) => d.status === 'done').length;
    const today = todayISO();
    const nextDue = p.post.deliverables
      .filter((d) => d.status !== 'done' && isISO(d.due))
      .map((d) => d.due!)
      .sort()[0];
    return {
      avRows: avRows.length,
      avSeconds,
      speaking: [...speaking].length,
      castConfirmed,
      castActive,
      crewConfirmed,
      crewActive,
      depts,
      locTotal: locs.length,
      locConfirmed,
      shots: shots.length,
      boarded,
      range,
      budget,
      tasksDone,
      tasksTotal: p.tasks.length,
      dlvDone,
      dlvTotal: p.post.deliverables.length,
      nextDue,
      today,
    };
  }, [p, model]);

  const useAv = p.script.mode === 'av' || (model.scenes.length <= 1 && s.avRows > 0 && model.wordCount < 5);
  const pct = (a: number, b: number) => (b > 0 ? a / b : 0);
  const shootSub = s.range.start
    ? s.range.end && s.range.end !== s.range.start
      ? `${fmt.dateMedium(s.range.start)} – ${fmt.dateMedium(s.range.end)}`
      : fmt.dateMedium(s.range.start)
    : 'No dates yet';
  const overBudget = s.budget.total > 0 && s.budget.actual > s.budget.total;

  return (
    <section className="ov-tiles">
      {useAv ? (
        <Tile
          icon={FileText}
          label="A/V script"
          value={s.avSeconds ? formatSeconds(s.avSeconds) : s.avRows}
          sub={`${s.avRows} row${s.avRows === 1 ? '' : 's'}${s.avSeconds ? ' · runtime' : ''}`}
          onClick={() => navigate('script')}
        />
      ) : (
        <Tile
          icon={FileText}
          label="Script"
          value={`${model.pageCount} pp`}
          sub={`${model.scenes.length} scene${model.scenes.length === 1 ? '' : 's'}${model.estMinutes ? ` · ~${fmt.minutes(Math.max(1, model.estMinutes))}` : ''}`}
          onClick={() => navigate('script')}
        />
      )}
      <Tile icon={Users} label="Characters" value={p.characters.length} sub={`${s.speaking} speaking`} onClick={() => navigate('cast')} />
      <Tile
        icon={UserCheck}
        label="Cast confirmed"
        value={`${s.castConfirmed}/${s.castActive}`}
        sub={s.castActive ? `${Math.round(pct(s.castConfirmed, s.castActive) * 100)}% locked` : 'No cast yet'}
        progress={pct(s.castConfirmed, s.castActive)}
        color="var(--success)"
        onClick={() => navigate('cast')}
      />
      <Tile
        icon={HardHat}
        label="Crew confirmed"
        value={s.crewConfirmed}
        sub={s.crewActive ? `of ${s.crewActive} · ${s.depts} dept${s.depts === 1 ? '' : 's'}` : 'No crew yet'}
        progress={pct(s.crewConfirmed, s.crewActive)}
        color="var(--success)"
        onClick={() => navigate('crew')}
      />
      <Tile
        icon={MapPin}
        label="Locations"
        value={`${s.locConfirmed}/${s.locTotal}`}
        sub={s.locTotal ? 'confirmed' : 'No locations yet'}
        progress={pct(s.locConfirmed, s.locTotal)}
        color="var(--success)"
        onClick={() => navigate('locations')}
      />
      <Tile
        icon={Clapperboard}
        label="Shots"
        value={s.shots}
        sub={`${s.boarded} storyboarded`}
        progress={pct(s.boarded, s.shots)}
        onClick={() => navigate('shots')}
      />
      <Tile icon={CalendarRange} label="Shoot days" value={s.range.days} sub={shootSub} onClick={() => navigate('schedule')} />
      <Tile
        icon={Wallet}
        label="Budget"
        value={s.budget.total ? fmt.money(s.budget.total, { cents: false }) : '—'}
        sub={s.budget.total || s.budget.actual ? `Actual ${fmt.money(s.budget.actual, { cents: false })}${overBudget ? ' · over' : ''}` : 'Not priced yet'}
        progress={s.budget.total ? pct(s.budget.actual, s.budget.total) : undefined}
        color={overBudget ? 'var(--danger)' : 'var(--accent)'}
        onClick={() => navigate('budget')}
      />
      <Tile
        icon={ListChecks}
        label="Tasks"
        value={`${Math.round(pct(s.tasksDone, s.tasksTotal) * 100)}%`}
        sub={`${s.tasksDone} of ${s.tasksTotal} done`}
        progress={pct(s.tasksDone, s.tasksTotal)}
        onClick={() => navigate('tasks')}
      />
      <Tile
        icon={PackageCheck}
        label="Deliverables"
        value={`${s.dlvDone}/${s.dlvTotal}`}
        sub={s.nextDue ? `Next due ${fmt.dateMedium(s.nextDue)}` : s.dlvTotal ? 'done' : 'None yet'}
        progress={pct(s.dlvDone, s.dlvTotal)}
        color="var(--success)"
        onClick={() => navigate('post')}
      />
    </section>
  );
}

/* ======================================================================== timeline */

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

const LANE_H = 19;
const MAX_LANES = 5;

function TimelineCard() {
  const p = useProjectData();
  const model = useScriptModel();
  const tl = useMemo(() => buildTimeline(p, model), [p, model]);
  return (
    <Card
      title="Production timeline"
      actions={
        tl?.approximate ? (
          <Button size="sm" variant="ghost" onClick={() => navigate('settings')}>
            Set shoot dates for an accurate timeline
          </Button>
        ) : undefined
      }
    >
      {tl ? (
        <TimelineView tl={tl} />
      ) : (
        <PhaseStepper />
      )}
    </Card>
  );
}

/** Fallback when no dates exist: the five phases with the current one highlighted. */
function PhaseStepper() {
  const status = useProject((p) => p.meta.status);
  const current = STATUS_PHASE[status] ?? 'development';
  const ci = PHASES.findIndex((ph) => ph.value === current);
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="ov-stepper">
        {PHASES.map((ph, i) => (
          <div key={ph.value} className={`ov-step ${i < ci ? 'past' : i === ci ? 'current' : ''}`} style={{ ['--ph' as string]: ph.color }}>
            <span className="ov-step-dot">{i < ci ? <Check size={12} /> : i + 1}</span>
            <span>{ph.label}</span>
          </div>
        ))}
      </div>
      <div className="muted small">
        Add shoot dates, milestones or a delivery date to see the project laid out in time.{' '}
        <button type="button" className="ov-link" onClick={() => navigate('settings')}>
          Set dates
        </button>
      </div>
    </div>
  );
}

function axisTicks(tl: TimelineModel): { date: string; label: string }[] {
  const out: { date: string; label: string }[] = [];
  const start = parseISODate(tl.start)!;
  if (tl.span <= 50) {
    // weekly ticks on Mondays
    const d = new Date(start);
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
    for (let i = 0; i < 12; i++) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (iso > tl.end) break;
      out.push({ date: iso, label: `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}` });
      d.setDate(d.getDate() + 7);
    }
  } else {
    const d = new Date(start.getFullYear(), start.getMonth() + 1, 1, 12);
    const step = tl.span > 400 ? 3 : 1;
    for (let i = 0; i < 40; i++) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      if (iso > tl.end) break;
      out.push({ date: iso, label: d.getMonth() === 0 ? `${MONTHS_SHORT[0]} ${d.getFullYear()}` : MONTHS_SHORT[d.getMonth()] });
      d.setMonth(d.getMonth() + step);
    }
  }
  return out;
}

function TimelineView({ tl }: { tl: TimelineModel }) {
  const fmt = useFormatters();
  const { ref, width } = useElementWidth<HTMLDivElement>();

  const placed = useMemo(() => {
    const ends: number[] = [];
    return tl.markers.map((m, i) => {
      const pct = pctOf(tl, m.date);
      const x = (pct / 100) * width;
      const text = truncate(m.label, 24);
      const w = text.length * 6.3 + 22;
      const alignRight = width > 0 && x + w > width;
      const from = alignRight ? x - w : x;
      const to = alignRight ? x : x + w;
      let lane = ends.findIndex((end) => end < from - 2);
      if (lane < 0) {
        if (ends.length < MAX_LANES) {
          lane = ends.length;
          ends.push(to);
        } else {
          lane = i % MAX_LANES;
          ends[lane] = Math.max(ends[lane], to);
        }
      } else ends[lane] = to;
      return { ...m, pct, lane, alignRight, text };
    });
  }, [tl, width]);
  const lanes = Math.max(1, ...placed.map((m) => m.lane + 1));
  const ticks = useMemo(() => axisTicks(tl), [tl]);
  const todayPct = pctOf(tl, tl.today);

  return (
    <div className="ov-tl-wrap">
      <div className="ov-tl" ref={ref}>
        <div className="ov-tl-axis">
          {ticks.map((t) => (
            <span key={t.date} style={{ left: `${pctOf(tl, t.date)}%` }}>
              {t.label}
            </span>
          ))}
        </div>
        <div className="ov-tl-phases">
          {tl.phases.map((ph) => {
            const left = pctOf(tl, ph.start);
            const w = Math.max(0, pctOf(tl, ph.end) - left);
            if (w <= 0) return null;
            return (
              <div
                key={ph.id}
                className={`ov-tl-phase ${ph.id === tl.currentPhase ? 'current' : ''}`}
                style={{ left: `${left}%`, width: `${w}%`, ['--ph' as string]: ph.color }}
                title={tl.approximate ? `${ph.label} (estimated)` : `${ph.label}: ${fmt.dateMedium(ph.start)} – ${fmt.dateMedium(ph.end)}`}
              >
                <span>{ph.label}</span>
              </div>
            );
          })}
        </div>
        <div className="ov-tl-markers" style={{ height: lanes * LANE_H + 6 }}>
          {placed.map((m) => (
            <div
              key={m.id}
              className={`ov-tl-marker ${m.alignRight ? 'right' : ''} ${m.done ? 'done' : ''}`}
              style={{ left: `${m.pct}%`, ['--mc' as string]: m.color }}
              title={`${m.label} — ${fmt.dateLong(m.date)}`}
            >
              <i style={{ height: m.lane * LANE_H + 12 }} />
              <span style={{ top: m.lane * LANE_H + 4 }}>{m.text}</span>
            </div>
          ))}
        </div>
        {tl.todayInRange && (
          <div className="ov-tl-today" style={{ left: `${todayPct}%` }}>
            <span>Today</span>
          </div>
        )}
      </div>
      {!tl.approximate && (
        <div className="ov-tl-legend">
          {tl.phases.map((ph) => (
            <div key={ph.id} className={`ov-tl-leg ${ph.id === tl.currentPhase ? 'current' : ''}`}>
              <span className="color-dot" style={{ background: ph.color }} />
              <b>{ph.label}</b>
              <span className="muted">
                {fmt.dateMedium(ph.start).replace(/, \d{4}$/, '')} – {fmt.dateMedium(ph.end).replace(/, \d{4}$/, '')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ======================================================================== readiness */

function ReadinessCard() {
  const p = useProjectData();
  const model = useScriptModel();
  const checks = useMemo(() => readinessChecks(p, model), [p, model]);
  const applicable = checks.filter((c) => !c.na);
  const done = applicable.filter((c) => c.done).length;
  const pct = applicable.length ? done / applicable.length : 1;
  return (
    <Card
      title="Shoot readiness"
      actions={
        <span className="ov-ready-score">
          <b>{done}</b>/{applicable.length} ready
        </span>
      }
      padded={false}
    >
      <div className="ov-ready-head">
        <Progress value={pct} color={pct >= 1 ? 'var(--success)' : pct >= 0.6 ? 'var(--accent)' : 'var(--warning)'} />
        <span className="muted small">{pct >= 1 ? 'Everything is in place for the shoot.' : `${applicable.length - done} item${applicable.length - done === 1 ? '' : 's'} still open`}</span>
      </div>
      <div className="ov-checks">
        {checks.map((c) => (
          <CheckRow key={c.id} c={c} />
        ))}
      </div>
    </Card>
  );
}

function CheckRow({ c }: { c: ReadinessCheck }) {
  const Icon = c.na ? CircleMinus : c.done ? CircleCheck : Circle;
  const missing = !c.done && !c.na && c.missing?.length ? c.missing : undefined;
  return (
    <button type="button" className={`ov-check ${c.done ? 'done' : ''} ${c.na ? 'na' : ''}`} onClick={() => navigate(c.module)} title="Open module">
      <Icon size={18} className="ov-check-icon" />
      <div className="grow">
        <div className="ov-check-label">{c.label}</div>
        <div className="ov-check-detail">{c.detail}</div>
        {missing && (
          <div className="ov-check-missing" title={missing.join('\n')}>
            Missing: {missing.slice(0, 3).join(', ')}
            {missing.length > 3 ? ` +${missing.length - 3} more` : ''}
          </div>
        )}
      </div>
      {!c.done && !c.na && c.progress > 0 && (
        <span className="ov-check-pct">
          <span className="ov-bar small">
            <span style={{ width: `${Math.round(c.progress * 100)}%` }} />
          </span>
        </span>
      )}
      <ChevronRight size={14} className="ov-check-go" />
    </button>
  );
}

/* ======================================================================== upcoming */

function dueClass(due: string | undefined, today: string): string {
  if (!due) return '';
  const d = diffDays(today, due);
  if (d < 0) return 'overdue';
  if (d <= 2) return 'soon';
  return '';
}

function UpcomingCard() {
  const tasks = useProject((p) => p.tasks);
  const milestones = useProject((p) => p.milestones);
  const status = useProject((p) => p.meta.status);
  const fmt = useFormatters();
  const [draft, setDraft] = useState('');
  const today = todayISO();

  const nextTasks = useMemo(() => {
    const open = tasks.filter((t) => t.status !== 'done');
    const dated = open.filter((t) => isISO(t.due)).sort((a, b) => (a.due! < b.due! ? -1 : a.due! > b.due! ? 1 : 0));
    const rank = { high: 0, normal: 1, low: 2 } as const;
    const undated = open.filter((t) => !isISO(t.due)).sort((a, b) => rank[a.priority ?? 'normal'] - rank[b.priority ?? 'normal']);
    return [...dated, ...undated].slice(0, 6);
  }, [tasks]);

  const nextMilestones = useMemo(
    () =>
      milestones
        .filter((m) => !m.done && isISO(m.date))
        .sort((a, b) => (a.date! < b.date! ? -1 : 1))
        .slice(0, 4),
    [milestones],
  );

  const phase = STATUS_PHASE[status] ?? 'pre';
  const add = () => {
    const title = draft.trim();
    if (!title) return;
    taskOps.add({ id: uid('task'), title, phase, status: 'todo', priority: 'normal' });
    setDraft('');
    toast(`Task added to ${optionLabel(PHASES, phase)}`, 'success', { duration: 2200 });
  };

  return (
    <Card title="Up next" actions={<Button size="sm" variant="ghost" onClick={() => navigate('tasks')}>All tasks</Button>} padded={false}>
      <div className="ov-quickadd">
        <Plus size={15} />
        <input
          className="input bare"
          value={draft}
          placeholder={`Add a ${optionLabel(PHASES, phase).toLowerCase()} task and press Enter`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            } else if (e.key === 'Escape') setDraft('');
          }}
          aria-label="Quick add task"
        />
      </div>
      {nextTasks.length === 0 ? (
        <div className="ov-empty-row">
          <CircleCheck size={16} /> No open tasks — nice work.
        </div>
      ) : (
        <div className="ov-tasks">
          {nextTasks.map((t) => {
            const color = optionColor(PHASES, t.phase);
            const cls = dueClass(t.due, today);
            return (
              <div key={t.id} className="ov-task">
                <Checkbox checked={false} onChange={(v) => taskOps.update(t.id, { status: v ? 'done' : 'todo' }, false)} title="Mark done" />
                <span className="color-dot" style={{ background: color }} title={optionLabel(PHASES, t.phase)} />
                <button type="button" className="ov-task-title" onClick={() => navigate('tasks', { taskId: t.id })}>
                  {t.title || 'Untitled task'}
                  {t.priority === 'high' && <Flag size={12} className="ov-high" />}
                </button>
                {t.assignee && <Avatar name={t.assignee} size={20} />}
                <span className={`ov-due ${cls}`} title={t.due ? fmt.dateLong(t.due) : undefined}>
                  {t.due ? (cls === 'overdue' ? `Overdue · ${fmt.dateMedium(t.due).replace(/, \d{4}$/, '')}` : relativeDay(t.due, today)) : 'No date'}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <div className="ov-sub-head">
        <span>Milestones</span>
        <button type="button" className="ov-link" onClick={() => navigate('tasks', { tab: 'milestones' })}>
          Manage
        </button>
      </div>
      {nextMilestones.length === 0 ? (
        <div className="ov-empty-row muted">
          No upcoming milestones.{' '}
          <button
            type="button"
            className="ov-link"
            onClick={() => {
              milestoneOps.add({ id: uid('ms'), name: 'New milestone', phase, date: undefined });
              navigate('tasks', { tab: 'milestones' });
            }}
          >
            Add one
          </button>
        </div>
      ) : (
        <div className="ov-milestones">
          {nextMilestones.map((m) => {
            const overdue = m.date! < today;
            return (
              <div key={m.id} className="ov-ms">
                <Flag size={13} style={{ color: optionColor(PHASES, m.phase) }} />
                <span className="grow ellipsis">{m.name || 'Milestone'}</span>
                <span className="muted small nowrap">{fmt.dateMedium(m.date).replace(/, \d{4}$/, '')}</span>
                <span className={`ov-due ${overdue ? 'overdue' : ''}`}>{relativeDay(m.date!, today)}</span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ======================================================================== notes */

function NotesCard() {
  const notes = useProject((p) => p.notes);
  return (
    <Card title="Project notes" actions={<span className="muted tiny">Saved automatically</span>}>
      <Textarea
        className="ov-notes"
        minRows={5}
        value={notes}
        placeholder="Ideas, decisions, risks, contacts to call back… anything the team should know."
        onChange={(v) => update((d) => void (d.notes = v), { coalesce: 'overview:notes' })}
        aria-label="Project notes"
      />
    </Card>
  );
}

