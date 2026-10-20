/* Pure project-level derivations used by the Overview dashboard and its
   printed documents: budget totals, readiness checks, dated events and the
   production timeline. No React in here. */
import type { Budget, Character, Phase, ProjectData, ProjectStatus } from '@/types';
import type { ModuleId } from '@/store/app';
import type { ScriptModel } from '@/derived/script';
import { castForCharacter, dayDates, locationForScene, sceneDayIndex, scheduleInfo } from '@/derived/project';
import { PHASES, POST_STATUSES, optionColor } from '@/lib/constants';
import { addDays, diffDays, parseISODate, todayISO } from '@/lib/dates';

/* ---------------------------------------------------------------- small helpers */

export const isISO = (d: string | undefined | null): d is string => !!d && !!parseISODate(d);

export const STATUS_PHASE: Record<ProjectStatus, Phase> = {
  development: 'development',
  pre: 'pre',
  production: 'production',
  post: 'post',
  delivered: 'delivery',
  archived: 'delivery',
};

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return isFinite(n) ? n : 0;
};

/* ---------------------------------------------------------------- budget */

export interface BudgetTotals {
  subtotal: number;
  contingency: number;
  insurance: number;
  tax: number;
  total: number;
  actual: number;
  lines: number;
  priced: number;
}

/** Line amount = qty × rate × x × (1 + fringe %). Total adds contingency (and insurance / tax when set). */
export function budgetTotals(b: Budget | undefined): BudgetTotals {
  let subtotal = 0;
  let actual = 0;
  let lines = 0;
  let priced = 0;
  for (const c of b?.categories ?? []) {
    for (const l of c.lines ?? []) {
      lines++;
      const x = l.x == null ? 1 : num(l.x);
      const amt = num(l.qty) * num(l.rate) * x * (1 + num(l.fringePct) / 100);
      if (amt > 0) priced++;
      subtotal += amt;
      actual += num(l.actual);
    }
  }
  const contingency = (subtotal * num(b?.contingencyPct)) / 100;
  const insurance = (subtotal * num(b?.insurancePct)) / 100;
  const tax = (subtotal * num(b?.taxPct)) / 100;
  return { subtotal, contingency, insurance, tax, total: subtotal + contingency + insurance + tax, actual, lines, priced };
}

/* ---------------------------------------------------------------- people / shoot */

/** Characters with at least one line of dialogue in the screenplay. */
export function speakingCharacters(p: Pick<ProjectData, 'characters'>, model: ScriptModel): Character[] {
  const idx = new Map<string, Character>();
  for (const c of p.characters) {
    idx.set(c.name.toUpperCase(), c);
    for (const a of c.aliases ?? []) idx.set(a.toUpperCase(), c);
  }
  const out: Character[] = [];
  for (const n of model.speakingNames) {
    const c = idx.get(n.toUpperCase());
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

export interface ShootRange {
  start?: string;
  end?: string;
  days: number;
}

/** Shoot start / end: explicit project dates win, otherwise the scheduled shoot days. */
export function shootRange(p: ProjectData): ShootRange {
  const dates = dayDates(p).filter(isISO).sort();
  const start = isISO(p.meta.shootStart) ? p.meta.shootStart : dates[0];
  let end = isISO(p.meta.shootEnd) ? p.meta.shootEnd : dates[dates.length - 1];
  if (!end || (start && end < start)) end = start;
  return { start, end, days: p.schedule.days.length };
}

/* ---------------------------------------------------------------- readiness */

export interface ReadinessCheck {
  id: string;
  label: string;
  detail: string;
  done: boolean;
  /** not applicable to this project (counts as done, shown muted) */
  na?: boolean;
  /** 0..1 partial progress */
  progress: number;
  module: ModuleId;
  /** names of what is still missing (shown as hint) */
  missing?: string[];
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

export function readinessChecks(p: ProjectData, model: ScriptModel): ReadinessCheck[] {
  const checks: ReadinessCheck[] = [];
  const avRows = p.script?.av?.rows?.length ?? 0;
  const sceneCount = model.scenes.length;

  // 1. script
  {
    const done = sceneCount > 0 || avRows > 0;
    const parts: string[] = [];
    if (sceneCount) parts.push(`${sceneCount} scene${sceneCount === 1 ? '' : 's'} · ${model.pageCount} page${model.pageCount === 1 ? '' : 's'}`);
    if (avRows) parts.push(`${avRows} A/V row${avRows === 1 ? '' : 's'}`);
    checks.push({
      id: 'script',
      label: 'Script has scenes',
      detail: done ? parts.join(' · ') : 'Write or import a script to break it down',
      done,
      progress: done ? 1 : 0,
      module: 'script',
    });
  }

  // 2. speaking characters cast & confirmed
  {
    const speaking = speakingCharacters(p, model);
    const missing = speaking.filter((c) => castForCharacter(p, c)?.status !== 'confirmed');
    const ok = speaking.length - missing.length;
    checks.push({
      id: 'cast',
      label: 'Every speaking role cast',
      detail: speaking.length ? `${ok} of ${speaking.length} speaking roles confirmed` : 'No speaking roles in the script',
      done: speaking.length > 0 && missing.length === 0,
      na: speaking.length === 0,
      progress: speaking.length ? ratio(ok, speaking.length) : 1,
      module: 'cast',
      missing: missing.map((c) => c.name),
    });
  }

  // 3. locations of scheduled scenes confirmed
  {
    const scheduled = [...sceneDayIndex(p).keys()].map((id) => model.sceneById.get(id)).filter((s): s is NonNullable<typeof s> => !!s);
    const missing: string[] = [];
    let ok = 0;
    for (const s of scheduled) {
      const loc = locationForScene(p, s);
      if (loc?.status === 'confirmed') ok++;
      else missing.push(loc ? `${loc.name} (${loc.status})` : `${s.set || s.heading || 'Scene ' + s.number} — no location`);
    }
    checks.push({
      id: 'locations',
      label: 'Locations confirmed for scheduled scenes',
      detail: scheduled.length ? `${ok} of ${scheduled.length} scheduled scenes have a confirmed location` : 'No scenes scheduled yet',
      done: scheduled.length > 0 && ok === scheduled.length,
      progress: ratio(ok, scheduled.length),
      module: 'locations',
      missing: [...new Set(missing)],
    });
  }

  // 4. permits
  {
    const needing = p.locations.filter((l) => l.status !== 'declined' && (l.permitRequired || l.permitStatus === 'needed' || l.permitStatus === 'applied'));
    const approved = needing.filter((l) => l.permitStatus === 'approved');
    checks.push({
      id: 'permits',
      label: 'Permits approved',
      detail: needing.length ? `${approved.length} of ${needing.length} required permits approved` : 'No location requires a permit',
      done: needing.length === approved.length,
      na: needing.length === 0,
      progress: needing.length ? ratio(approved.length, needing.length) : 1,
      module: 'locations',
      missing: needing.filter((l) => l.permitStatus !== 'approved').map((l) => `${l.name} (${l.permitStatus ?? 'needed'})`),
    });
  }

  // 5. releases & contracts
  {
    const cast = p.cast.filter((c) => c.status === 'confirmed');
    const crew = p.crew.filter((c) => c.status === 'confirmed');
    const releases = cast.filter((c) => c.releaseSigned).length;
    const contracts = cast.filter((c) => c.contractSigned).length;
    const memos = crew.filter((c) => c.dealMemo).length;
    const total = cast.length * 2 + crew.length;
    const signed = releases + contracts + memos;
    const parts: string[] = [];
    if (cast.length) parts.push(`Releases ${releases}/${cast.length}`, `Contracts ${contracts}/${cast.length}`);
    if (crew.length) parts.push(`Deal memos ${memos}/${crew.length}`);
    const missing: string[] = [];
    for (const c of cast) {
      if (!c.releaseSigned) missing.push(`${c.name} — release`);
      if (!c.contractSigned) missing.push(`${c.name} — contract`);
    }
    for (const c of crew) if (!c.dealMemo) missing.push(`${c.name} — deal memo`);
    checks.push({
      id: 'paperwork',
      label: 'Releases & contracts signed',
      detail: total ? parts.join(' · ') : 'No confirmed cast or crew yet',
      done: total > 0 && signed === total,
      na: total === 0,
      progress: total ? ratio(signed, total) : 1,
      module: 'cast',
      missing,
    });
  }

  // 6. call sheets
  {
    const days = p.schedule.days;
    const info = scheduleInfo(p, model);
    const ready = days.filter((d) => !!p.callSheets?.[d.id]?.crewCall);
    checks.push({
      id: 'callsheets',
      label: 'Call sheet with crew call for every shoot day',
      detail: days.length ? `${ready.length} of ${days.length} shoot day${days.length === 1 ? '' : 's'} ready` : 'No shoot days scheduled yet',
      done: days.length > 0 && ready.length === days.length,
      progress: ratio(ready.length, days.length),
      module: 'callsheets',
      missing: info.filter((d) => !p.callSheets?.[d.day.id]?.crewCall).map((d) => d.label),
    });
  }

  // 7. shots for every scene
  {
    const withShots = new Set(p.shots.filter((s) => s.status !== 'omitted' && s.sceneId).map((s) => s.sceneId!));
    const scenes = model.scenes;
    const ok = scenes.filter((s) => withShots.has(s.id)).length;
    checks.push({
      id: 'shots',
      label: 'Shots planned for every scene',
      detail: scenes.length ? `${ok} of ${scenes.length} scenes have a shot list` : avRows ? 'A/V script — plan shots in the Shot List' : 'No scenes yet',
      done: scenes.length > 0 ? ok === scenes.length : p.shots.length > 0,
      progress: scenes.length ? ratio(ok, scenes.length) : p.shots.length ? 1 : 0,
      module: 'shots',
      missing: scenes.filter((s) => !withShots.has(s.id)).map((s) => `${s.number}. ${s.heading}`),
    });
  }

  // 8. gear
  {
    const gear = p.gear;
    const ok = gear.filter((g) => g.status === 'confirmed' || g.status === 'picked_up' || g.status === 'returned').length;
    checks.push({
      id: 'gear',
      label: 'Gear confirmed or picked up',
      detail: gear.length ? `${ok} of ${gear.length} items confirmed` : 'No gear listed yet',
      done: gear.length > 0 && ok === gear.length,
      progress: ratio(ok, gear.length),
      module: 'gear',
    });
  }

  // 9. budget
  {
    const t = budgetTotals(p.budget);
    checks.push({
      id: 'budget',
      label: 'Budget filled in',
      detail: t.lines ? `${t.priced} of ${t.lines} lines priced` : 'No budget lines yet',
      done: t.subtotal > 0 && t.priced >= Math.ceil(t.lines * 0.5),
      progress: ratio(t.priced, t.lines),
      module: 'budget',
    });
  }

  return checks;
}

/* ---------------------------------------------------------------- dated events */

export type EventKind = 'key' | 'shoot' | 'milestone' | 'post' | 'deliverable' | 'task';

export const EVENT_KINDS: Record<EventKind, { label: string; plural: string; color: string }> = {
  key: { label: 'Key date', plural: 'key dates', color: '#e5484d' },
  shoot: { label: 'Shoot day', plural: 'shoot days', color: '#f5a524' },
  milestone: { label: 'Milestone', plural: 'milestones', color: '#7c5cff' },
  post: { label: 'Post', plural: 'post steps', color: '#a464f5' },
  deliverable: { label: 'Deliverable', plural: 'deliverables', color: '#2fb36d' },
  task: { label: 'Task', plural: 'tasks', color: '#3e8ef7' },
};

export interface ProjectEvent {
  id: string;
  date: string;
  /** inclusive end date for ranges */
  end?: string;
  kind: EventKind;
  label: string;
  detail?: string;
  color: string;
  done?: boolean;
  module: ModuleId;
  params?: Record<string, unknown>;
}

export function projectEvents(p: ProjectData, model: ScriptModel, opts: { tasks?: boolean; doneTasks?: boolean } = {}): ProjectEvent[] {
  const ev: ProjectEvent[] = [];
  const today = todayISO();
  const info = scheduleInfo(p, model);
  for (const d of info) {
    if (!isISO(d.date)) continue;
    const sets = d.sets.slice(0, 3).join(', ');
    ev.push({
      id: `day:${d.day.id}`,
      date: d.date,
      kind: 'shoot',
      label: `${d.label} — Shoot`,
      detail: [d.scenes.length ? `${d.scenes.length} scene${d.scenes.length === 1 ? '' : 's'}` : 'No scenes yet', sets].filter(Boolean).join(' · '),
      color: EVENT_KINDS.shoot.color,
      done: d.date < today,
      module: 'schedule',
    });
  }
  if (!info.some((d) => isISO(d.date))) {
    if (isISO(p.meta.shootStart)) ev.push({ id: 'key:shootStart', date: p.meta.shootStart, kind: 'key', label: 'Shoot starts', color: EVENT_KINDS.shoot.color, module: 'schedule' });
    if (isISO(p.meta.shootEnd) && p.meta.shootEnd !== p.meta.shootStart)
      ev.push({ id: 'key:shootEnd', date: p.meta.shootEnd, kind: 'key', label: 'Shoot wraps', color: EVENT_KINDS.shoot.color, module: 'schedule' });
  }
  if (isISO(p.meta.deliveryDate)) ev.push({ id: 'key:delivery', date: p.meta.deliveryDate, kind: 'key', label: 'Final delivery', color: EVENT_KINDS.key.color, module: 'post' });

  for (const m of p.milestones) {
    if (!isISO(m.date)) continue;
    ev.push({
      id: `ms:${m.id}`,
      date: m.date,
      kind: 'milestone',
      label: m.name || 'Milestone',
      detail: [PHASES.find((x) => x.value === m.phase)?.label, m.notes].filter(Boolean).join(' · '),
      color: optionColor(PHASES, m.phase) ?? EVENT_KINDS.milestone.color,
      done: !!m.done,
      module: 'tasks',
      params: { tab: 'milestones' },
    });
  }
  for (const s of p.post.schedule) {
    const start = isISO(s.start) ? s.start : isISO(s.end) ? s.end : undefined;
    if (!start) continue;
    const end = isISO(s.end) && s.end >= start ? s.end : undefined;
    ev.push({
      id: `post:${s.id}`,
      date: start,
      end: end && end !== start ? end : undefined,
      kind: 'post',
      label: s.name || 'Post milestone',
      detail: [POST_STATUSES.find((x) => x.value === s.status)?.label, s.owner].filter(Boolean).join(' · '),
      color: optionColor(POST_STATUSES, s.status) ?? EVENT_KINDS.post.color,
      done: s.status === 'done' || s.status === 'approved',
      module: 'post',
    });
  }
  for (const d of p.post.deliverables) {
    if (!isISO(d.due)) continue;
    ev.push({
      id: `dlv:${d.id}`,
      date: d.due,
      kind: 'deliverable',
      label: `Due: ${d.name || 'Deliverable'}`,
      detail: [d.platform, POST_STATUSES.find((x) => x.value === d.status)?.label].filter(Boolean).join(' · '),
      color: EVENT_KINDS.deliverable.color,
      done: d.status === 'done',
      module: 'post',
    });
  }
  if (opts.tasks) {
    for (const t of p.tasks) {
      if (!isISO(t.due)) continue;
      if (t.status === 'done' && opts.doneTasks === false) continue;
      ev.push({
        id: `task:${t.id}`,
        date: t.due,
        kind: 'task',
        label: t.title || 'Untitled task',
        detail: [PHASES.find((x) => x.value === t.phase)?.label, t.assignee].filter(Boolean).join(' · '),
        color: EVENT_KINDS.task.color,
        done: t.status === 'done',
        module: 'tasks',
        params: { taskId: t.id },
      });
    }
  }
  const order: EventKind[] = ['key', 'shoot', 'milestone', 'post', 'deliverable', 'task'];
  return ev.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : order.indexOf(a.kind) - order.indexOf(b.kind)));
}

/* ---------------------------------------------------------------- timeline */

export interface TimelinePhase {
  id: Phase;
  label: string;
  color: string;
  start: string;
  end: string;
}

export interface TimelineMarker {
  id: string;
  date: string;
  label: string;
  color: string;
  kind: EventKind;
  done?: boolean;
}

export interface TimelineModel {
  start: string;
  end: string;
  span: number;
  phases: TimelinePhase[];
  markers: TimelineMarker[];
  today: string;
  todayInRange: boolean;
  /** phases are estimated (no shoot dates) */
  approximate: boolean;
  currentPhase: Phase;
}

const maxISO = (list: (string | undefined)[]) => list.filter(isISO).sort().pop();
const minISO = (list: (string | undefined)[]) => list.filter(isISO).sort()[0];
const clampISO = (d: string, lo: string, hi: string) => (d < lo ? lo : d > hi ? hi : d);

export function buildTimeline(p: ProjectData, model: ScriptModel): TimelineModel | null {
  const today = todayISO();
  const events = projectEvents(p, model, { tasks: true });
  const shoot = shootRange(p);
  const all: string[] = [];
  for (const e of events) {
    all.push(e.date);
    if (e.end) all.push(e.end);
  }
  for (const d of [shoot.start, shoot.end, p.meta.deliveryDate]) if (isISO(d)) all.push(d);
  if (!all.length) return null;
  all.sort();
  let lo = all[0];
  let hi = all[all.length - 1];
  const created = p.meta.createdAt?.slice(0, 10);
  if (isISO(created) && created < lo && diffDays(created, lo) <= 90) lo = created;
  if (today < lo && diffDays(today, lo) <= 60) lo = today;
  if (today > hi && diffDays(hi, today) <= 60) hi = today;
  if (diffDays(lo, hi) < 14) {
    const mid = addDays(lo, Math.round(diffDays(lo, hi) / 2));
    lo = addDays(mid, -7);
    hi = addDays(mid, 7);
  }
  const pad = Math.max(1, Math.round(diffDays(lo, hi) * 0.03));
  const start = addDays(lo, -pad);
  const end = addDays(hi, pad);
  const span = Math.max(1, diffDays(start, end));

  let b1: string;
  let b2: string;
  let b3: string;
  let b4: string;
  let b5: string;
  let approximate = false;
  if (shoot.start) {
    b2 = shoot.start;
    b3 = addDays(shoot.end ?? shoot.start, 1);
    const devEnd =
      maxISO(p.milestones.filter((m) => m.phase === 'development').map((m) => m.date)) ??
      maxISO(p.tasks.filter((t) => t.phase === 'development').map((t) => t.due));
    b1 = devEnd && devEnd > start && devEnd < b2 ? devEnd : addDays(start, Math.round(diffDays(start, b2) * 0.35));
    const delivery = isISO(p.meta.deliveryDate)
      ? p.meta.deliveryDate
      : maxISO([
          ...p.post.deliverables.map((d) => d.due),
          ...p.post.schedule.map((s) => s.end),
          ...p.milestones.filter((m) => m.phase === 'delivery').map((m) => m.date),
        ]);
    if (delivery && delivery > b3) {
      const qc = minISO(p.post.schedule.filter((s) => /\b(qc|deliver)/i.test(s.name) && isISO(s.start) && s.start! >= b3).map((s) => s.start));
      b4 = qc && qc < delivery ? qc : addDays(delivery, -Math.max(2, Math.round(diffDays(b3, delivery) * 0.15)));
      b5 = delivery;
    } else {
      b4 = addDays(b3, Math.round(diffDays(b3, end) * 0.75));
      b5 = end;
    }
  } else {
    approximate = true;
    const w = [0.18, 0.32, 0.12, 0.3, 0.08];
    let acc = 0;
    const at = (i: number) => {
      acc += w[i];
      return addDays(start, Math.round(span * acc));
    };
    b1 = at(0);
    b2 = at(1);
    b3 = at(2);
    b4 = at(3);
    b5 = end;
  }
  // keep boundaries ordered and inside the range
  b1 = clampISO(b1, start, end);
  b2 = clampISO(b2, b1, end);
  b3 = clampISO(b3, b2, end);
  b4 = clampISO(b4, b3, end);
  b5 = clampISO(b5, b4, end);
  const bounds = [start, b1, b2, b3, b4, b5];
  const phases: TimelinePhase[] = PHASES.map((ph, i) => ({ id: ph.value, label: ph.label, color: ph.color ?? '#888', start: bounds[i], end: bounds[i + 1] }));

  const markers: TimelineMarker[] = [];
  const seen = new Set<string>();
  const add = (m: TimelineMarker) => {
    const key = `${m.date}|${m.label.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    markers.push(m);
  };
  if (shoot.start) add({ id: 'shoot-start', date: shoot.start, label: 'Shoot', color: EVENT_KINDS.shoot.color, kind: 'key', done: shoot.start < today });
  if (shoot.end && shoot.end !== shoot.start) add({ id: 'shoot-end', date: shoot.end, label: 'Wrap', color: EVENT_KINDS.shoot.color, kind: 'key', done: shoot.end < today });
  if (isISO(p.meta.deliveryDate)) add({ id: 'delivery', date: p.meta.deliveryDate, label: 'Delivery', color: EVENT_KINDS.key.color, kind: 'key' });
  for (const m of p.milestones) if (isISO(m.date)) add({ id: `ms:${m.id}`, date: m.date, label: m.name || 'Milestone', color: optionColor(PHASES, m.phase) ?? '#7c5cff', kind: 'milestone', done: !!m.done });
  for (const s of p.post.schedule)
    if (isISO(s.end)) add({ id: `post:${s.id}`, date: s.end, label: s.name || 'Post', color: optionColor(POST_STATUSES, s.status) ?? '#a464f5', kind: 'post', done: s.status === 'done' || s.status === 'approved' });
  markers.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const todayInRange = today >= start && today <= end;
  const byDate = phases.find((ph) => today >= ph.start && today < ph.end);
  const currentPhase: Phase = !approximate && todayInRange && byDate ? byDate.id : STATUS_PHASE[p.meta.status] ?? 'development';
  return { start, end, span, phases, markers, today, todayInRange, approximate, currentPhase };
}

export function pctOf(t: Pick<TimelineModel, 'start' | 'span'>, date: string): number {
  return Math.max(0, Math.min(100, (diffDays(t.start, date) / t.span) * 100));
}

/** 'today', 'tomorrow', 'in 5 days', '3 days ago' */
export function relativeDay(date: string, today = todayISO()): string {
  const d = diffDays(today, date);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  if (d > 1 && d < 60) return `in ${d} days`;
  if (d < -1 && d > -60) return `${-d} days ago`;
  if (d >= 60) return `in ${Math.round(d / 7)} weeks`;
  return `${Math.round(-d / 7)} weeks ago`;
}

