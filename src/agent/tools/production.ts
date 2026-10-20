/* Shooting schedule, call sheets, quick-start templates (crew, gear) and
   budget quick fill. */
import type { CallSheet, ShootDay, StripItem } from '@/types';
import { update } from '@/store/project';
import { uid } from '@/lib/id';
import { BONEYARD, boneyardScenes, computeDays, computeDood, dayWarnings, sortDayItems } from '@/modules/schedule/logic';
import { emptyCallSheet, resolveCallSheet } from '@/modules/callsheets/logic';
import { CREW_TEMPLATES } from '@/modules/crew/data';
import { addPositions } from '@/modules/crew/actions';
import { GEAR_PRESETS, planPreset } from '@/modules/gear/logic';
import { addGearDraft, addPeopleDraft } from '@/modules/budget/quickfill';
import { clean, fail, fmt, model, normDate, normTime, plural, project, requireScene, resolveRef } from '../ctx';
import { defineTool } from '../tool';
import { anyObj, arr, enm, int, obj, opt, str } from '../schema';

/* ---------------------------------------------------------------- schedule */

function dayId(ref: string): string {
  return resolveRef('shoot_days', ref);
}

function scheduleOut(includeDood = false) {
  const p = project();
  const m = model(p);
  const f = fmt(p);
  const rows = computeDays(p, m);
  const charName = new Map(p.characters.map((c) => [c.id, c.name]));
  const locName = new Map(p.locations.map((l) => [l.id, l.name]));
  const days = rows.map((r) =>
    clean({
      id: r.day.id,
      label: r.day.label || `Day ${r.number}`,
      date: r.date,
      autoDate: r.date && r.autoDate ? true : undefined,
      pages: f.eighths(r.eighths),
      estMinutes: r.minutes || undefined,
      items: r.day.items.map((it) => {
        if (it.type === 'banner') return { type: 'banner', itemId: it.id, text: it.text };
        const s = m.sceneById.get(it.sceneId);
        return clean({ type: 'scene', itemId: it.id, sceneId: it.sceneId, number: s?.number, heading: s?.heading ?? '(deleted scene)', length: s ? f.eighths(s.eighths) : undefined });
      }),
      characters: r.characterIds.map((id) => charName.get(id) ?? id),
      locations: r.locationIds.map((id) => locName.get(id) ?? id),
      warnings: dayWarnings(r, rows, p).map((w) => w.text),
      notes: r.day.notes,
    }),
  );
  const unscheduled = boneyardScenes(p.schedule, m).map((s) => clean({ sceneId: s.id, number: s.number, heading: s.heading, length: f.eighths(s.eighths), estMinutes: s.meta?.estMinutes }));
  return clean({
    startDate: p.schedule.startDate,
    skipWeekends: p.schedule.skipWeekends || undefined,
    days,
    unscheduled,
    dayOutOfDays: includeDood
      ? computeDood(rows, p.characters, p.cast).map((r) => clean({ character: r.character.name, actor: r.cast?.name, codes: r.codes.join(' '), work: r.work, hold: r.hold, start: r.start, finish: r.finish }))
      : undefined,
  });
}

/* ---------------------------------------------------------------- call sheets */

const CS_TEXT = ['parking', 'basecamp', 'generalNotes', 'safetyNotes', 'specialInstructions', 'extras', 'walkieChannels', 'advanceNotes', 'quote'] as const;
const CS_TIMES = ['crewCall', 'shootingCall', 'breakfast', 'lunch', 'estWrap'] as const;

function callSheetOut(dayRef: string) {
  const p = project();
  const m = model(p);
  const f = fmt(p);
  const id = dayId(dayRef);
  const index = p.schedule.days.findIndex((d) => d.id === id);
  const r = resolveCallSheet(p, m, index);
  if (!r) fail('No such shoot day.');
  return clean({
    dayId: id,
    day: `Day ${r.row.number} of ${r.row.total}`,
    date: r.row.date,
    version: r.cs.version,
    customized: r.exists,
    times: { crewCall: r.crewCall, shootingCall: r.shootingCall, breakfast: r.breakfast, lunch: r.lunch, estWrap: r.estWrap },
    weather: r.weather,
    sun: { sunrise: r.sun.sunrise, sunset: r.sun.sunset, goldenHour: r.sun.goldenEvening },
    locations: r.locations.map((l) => clean({ id: l.id, name: l.name, address: l.address, parking: l.parking })),
    hospital: r.hospital,
    basecamp: r.basecamp,
    parking: r.parking,
    scenes: r.items.map((it) =>
      it.kind === 'banner'
        ? { banner: it.text }
        : clean({ sceneId: it.scene.id, number: it.scene.number, heading: it.scene.heading, length: f.eighths(it.scene.eighths), cast: it.cast.map((c) => c.label ?? c.number).join(', '), location: it.location?.name, synopsis: it.synopsis }),
    ),
    cast: r.castRows.map((c) =>
      clean({ castId: c.cast.id, name: c.cast.name, roles: c.characters.map((x) => x.name).join(', '), status: c.status, working: c.working, pickup: c.pickup, call: c.call, hmu: c.hmu, onSet: c.onSet, notes: c.notes }),
    ),
    uncastCharacters: r.uncast.map((c) => c.name),
    extras: r.extras,
    crew: r.crewGroups.map((g) => ({ department: g.dept, people: g.rows.map((x) => clean({ crewId: x.crew.id, name: x.crew.name, position: x.crew.position, call: x.call, notes: x.notes })) })),
    departmentNotes: Object.fromEntries(r.deptNotes.filter((n) => n.text || n.suggestion).map((n) => [n.key, n.text || `(suggested) ${n.suggestion}`])),
    generalNotes: r.cs.generalNotes,
    safetyNotes: r.cs.safetyNotes || (r.safetySuggestion ? `(suggested) ${r.safetySuggestion}` : undefined),
    specialInstructions: r.cs.specialInstructions,
    walkieChannels: r.cs.walkieChannels,
    advanceSchedule: r.next ? { day: `Day ${r.next.number}`, date: r.next.date, scenes: r.nextItems.map((it) => (it.kind === 'scene' ? `${it.scene.number}. ${it.scene.heading}` : it.text)) } : undefined,
    keyContacts: r.keyContacts,
    missing: r.missing,
  });
}

/* ================================================================ tools */

export const productionTools = [
  defineTool({
    name: 'get_schedule',
    title: 'Read the shooting schedule',
    description: 'The stripboard: shoot days with dates, scenes in shooting order, pages, estimated minutes, cast and locations per day, warnings (long days, double bookings, uncast roles …) and the unscheduled scenes (boneyard). Set dood for the cast Day Out of Days.',
    readOnly: true,
    input: obj({ dood: opt({ type: 'boolean', description: 'include the Day Out of Days (SW / W / WF / H codes per character)' }) }),
    run({ dood }: { dood?: boolean }) {
      return { data: scheduleOut(!!dood) };
    },
  }),

  defineTool({
    name: 'schedule_scenes',
    title: 'Put scenes on a shoot day',
    description:
      'Moves scenes onto a shoot day in the given order (removing them from wherever they were), onto a new day, or back to the boneyard (unscheduled). dayId accepts a day id, "Day 2", a date, "new" or "boneyard". With "new", newDay sets the date / label of the created day.',
    input: obj({
      sceneIds: { ...arr(str('scene id or number')), minItems: 1 },
      dayId: str('day id, "Day 3", a YYYY-MM-DD date of a day, "new" or "boneyard"'),
      position: opt({ type: ['string', 'integer'], description: '"start", "end" (default) or an index among the day’s strips' }),
      newDay: opt(obj({ date: opt(str()), label: opt(str()), notes: opt(str()) })),
    }),
    run(a: { sceneIds: string[]; dayId: string; position?: 'start' | 'end' | number; newDay?: { date?: string; label?: string; notes?: string } }) {
      const p = project();
      const m = model(p);
      const ids = a.sceneIds.map((x) => requireScene(x, m).id);
      const target = a.dayId === 'new' ? 'new' : a.dayId === BONEYARD || a.dayId.toLowerCase() === 'unscheduled' ? BONEYARD : dayId(a.dayId);
      const newDay: ShootDay | null = target === 'new' ? { id: uid('day'), items: [], ...(a.newDay?.date ? { date: normDate(a.newDay.date) } : {}), ...(a.newDay?.label ? { label: a.newDay.label } : {}), ...(a.newDay?.notes ? { notes: a.newDay.notes } : {}) } : null;
      let label = 'the boneyard';
      update((d) => {
        const existing = new Map<string, StripItem>();
        for (const day of d.schedule.days)
          day.items = day.items.filter((it) => {
            if (it.type === 'scene' && ids.includes(it.sceneId)) {
              existing.set(it.sceneId, { ...it });
              return false;
            }
            return true;
          });
        if (target === BONEYARD) {
          if (d.schedule.boneyardOrder) d.schedule.boneyardOrder = [...d.schedule.boneyardOrder.filter((x) => !ids.includes(x)), ...ids];
          return;
        }
        let day = newDay ?? d.schedule.days.find((x) => x.id === target);
        if (newDay) {
          d.schedule.days.push(newDay as any);
          day = d.schedule.days[d.schedule.days.length - 1];
        }
        const items: StripItem[] = ids.map((sid) => existing.get(sid) ?? { id: uid('st'), type: 'scene', sceneId: sid });
        const at = a.position === 'start' ? 0 : typeof a.position === 'number' ? Math.max(0, Math.min(day!.items.length, a.position)) : day!.items.length;
        day!.items.splice(at, 0, ...(items as any));
        if (d.schedule.boneyardOrder) d.schedule.boneyardOrder = d.schedule.boneyardOrder.filter((x) => !ids.includes(x));
        label = day!.label || `Day ${d.schedule.days.indexOf(day!) + 1}`;
      });
      return { data: { moved: ids.length, to: label, dayId: newDay?.id ?? (target === BONEYARD ? undefined : target) }, summary: `Scheduled ${plural(ids.length, 'scene')} on ${label}` };
    },
  }),

  defineTool({
    name: 'schedule_action',
    title: 'Schedule actions',
    description:
      'Stripboard actions: "add_days" (count new empty days), "schedule_all" (every unscheduled scene onto one new day), "sort_day" (dayId, by "location" or "script"), "add_banner" (dayId, text e.g. "COMPANY MOVE" / "LUNCH — 1 HOUR", color, position), "remove_banner" (dayId, itemId), "clear_schedule" (all scenes back to the boneyard, days kept), "delete_all_days", "auto_dates" (remove fixed dates so days follow schedule.startDate), "sync_project_dates" (copy first/last shoot date into the project info).',
    input: obj({
      action: enm(['add_days', 'schedule_all', 'sort_day', 'add_banner', 'remove_banner', 'clear_schedule', 'delete_all_days', 'auto_dates', 'sync_project_dates'] as const),
      dayId: opt(str()),
      count: opt(int(undefined, 1)),
      by: opt(enm(['location', 'script'] as const)),
      text: opt(str()),
      color: opt(str()),
      position: opt(int('index among the day’s strips', 0)),
      itemId: opt(str('strip item id (from get_schedule)')),
    }),
    run(a: { action: string; dayId?: string; count?: number; by?: 'location' | 'script'; text?: string; color?: string; position?: number; itemId?: string }) {
      const p = project();
      const m = model(p);
      const needDay = () => {
        if (!a.dayId) fail(`${a.action} needs dayId.`);
        return dayId(a.dayId);
      };
      switch (a.action) {
        case 'add_days': {
          const n = a.count ?? 1;
          const days: ShootDay[] = Array.from({ length: n }, () => ({ id: uid('day'), items: [] }));
          update((d) => void d.schedule.days.push(...(days as any)));
          return { data: { added: days.map((x) => x.id) }, summary: `Added ${plural(n, 'shoot day')}` };
        }
        case 'schedule_all': {
          const scenes = boneyardScenes(p.schedule, m);
          if (!scenes.length) return { text: 'Every scene is already scheduled.' };
          const day: ShootDay = { id: uid('day'), items: scenes.map((s) => ({ id: uid('st'), type: 'scene' as const, sceneId: s.id })) };
          update((d) => {
            d.schedule.days.push(day as any);
            delete d.schedule.boneyardOrder;
          });
          return { data: { dayId: day.id, scenes: scenes.length }, summary: `Scheduled ${plural(scenes.length, 'scene')} on a new day` };
        }
        case 'sort_day': {
          const id = needDay();
          const src = p.schedule.days.find((x) => x.id === id)!.items;
          const sorted = sortDayItems(src, a.by ?? 'location', p, m);
          update((d) => {
            const day = d.schedule.days.find((x) => x.id === id)!;
            day.items = sorted.map((it) => ({ ...it })) as any;
          });
          return { data: { sorted: sorted.length }, summary: `Sorted a shoot day by ${a.by ?? 'location'}` };
        }
        case 'add_banner': {
          const id = needDay();
          if (!a.text) fail('add_banner needs text.');
          const item: StripItem = { id: uid('st'), type: 'banner', text: a.text, color: a.color || '#f5a524' };
          update((d) => {
            const day = d.schedule.days.find((x) => x.id === id)!;
            const at = a.position == null ? day.items.length : Math.min(day.items.length, a.position);
            day.items.splice(at, 0, item as any);
          });
          return { data: { itemId: item.id }, summary: `Added “${a.text}” to the schedule` };
        }
        case 'remove_banner': {
          const id = needDay();
          if (!a.itemId) fail('remove_banner needs itemId.');
          update((d) => {
            const day = d.schedule.days.find((x) => x.id === id)!;
            day.items = day.items.filter((x) => !(x.id === a.itemId && x.type === 'banner'));
          });
          return { data: { removed: a.itemId }, summary: 'Removed a schedule banner' };
        }
        case 'clear_schedule':
          update((d) => {
            for (const day of d.schedule.days) day.items = day.items.filter((it) => it.type !== 'scene');
            delete d.schedule.boneyardOrder;
          });
          return { data: { cleared: true }, summary: 'Cleared the schedule' };
        case 'delete_all_days':
          update((d) => {
            d.schedule.days = [];
            delete d.schedule.boneyardOrder;
            d.callSheets = {};
          });
          return { data: { deleted: p.schedule.days.length }, summary: 'Deleted all shoot days' };
        case 'auto_dates':
          update((d) => {
            for (const day of d.schedule.days) delete day.date;
          });
          return { data: { ok: true }, summary: 'Shoot days now follow the start date' };
        case 'sync_project_dates': {
          const dates = computeDays(p, m)
            .map((r) => r.date)
            .filter((x): x is string => !!x)
            .sort();
          if (!dates.length) fail('Shoot days have no dates yet: set schedule.startDate (set_fields) or day dates first.');
          update((d) => {
            d.meta.shootStart = dates[0];
            d.meta.shootEnd = dates[dates.length - 1];
          });
          return { data: { shootStart: dates[0], shootEnd: dates[dates.length - 1] }, summary: 'Updated the project shoot dates' };
        }
      }
      fail(`Unknown action ${a.action}`);
    },
  }),

  defineTool({
    name: 'get_call_sheet',
    title: 'Read a call sheet',
    description: 'The call sheet of a shoot day as it prints: times, weather, sunrise/sunset, locations, nearest hospital, scenes, cast calls (pickup / call / hair & makeup / on set), crew calls by department, department notes, safety notes, advance schedule, and what is still missing.',
    readOnly: true,
    input: obj({ dayId: str('day id or "Day 2"') }),
    run({ dayId: d }: { dayId: string }) {
      return { data: callSheetOut(d) };
    },
  }),

  defineTool({
    name: 'update_call_sheet',
    title: 'Edit a call sheet',
    description:
      'Fills in a shoot day’s call sheet. Times are HH:MM (24h). castCalls / crewCalls are keyed by cast / crew id or name; crew call may also be "N/C" (not called) or "O/C" (on call). deptNotes are keyed by department (Camera, Grip & Electric, Sound, Art/Props, Wardrobe, Hair & Makeup, Locations, Transportation, Catering, VFX). null clears a value.',
    input: obj({
      dayId: str('day id or "Day 2"'),
      crewCall: opt({ type: ['string', 'null'] }),
      shootingCall: opt({ type: ['string', 'null'] }),
      breakfast: opt({ type: ['string', 'null'] }),
      lunch: opt({ type: ['string', 'null'] }),
      estWrap: opt({ type: ['string', 'null'] }),
      weather: opt(anyObj('{ summary, high, low, precip, sunrise, sunset }')),
      hospital: opt(anyObj('{ name, address, phone } (overrides the location’s hospital)')),
      locationIds: opt({ type: ['array', 'null'], items: { type: 'string' }, description: 'override the day’s locations (ids or names)' }),
      parking: opt({ type: ['string', 'null'] }),
      basecamp: opt({ type: ['string', 'null'] }),
      generalNotes: opt({ type: ['string', 'null'] }),
      safetyNotes: opt({ type: ['string', 'null'] }),
      specialInstructions: opt({ type: ['string', 'null'] }),
      extras: opt({ type: ['string', 'null'] }),
      walkieChannels: opt({ type: ['string', 'null'] }),
      advanceNotes: opt({ type: ['string', 'null'] }),
      quote: opt({ type: ['string', 'null'] }),
      version: opt({ type: ['integer', 'null'] }),
      castCalls: opt(anyObj('{ "<cast id or name>": { pickup, call, hmu, onSet, notes } }')),
      crewCalls: opt(anyObj('{ "<crew id or name>": { call, notes } }')),
      deptNotes: opt(anyObj('{ "Camera": "…", "Sound": "…" }')),
    }),
    run(a: Record<string, any>) {
      const p = project();
      const id = dayId(a.dayId);
      const patch: Partial<CallSheet> & Record<string, unknown> = {};
      const unset: string[] = [];
      for (const k of CS_TIMES) if (a[k] !== undefined) a[k] === null ? unset.push(k) : (patch[k] = normTime(a[k], k));
      for (const k of CS_TEXT) if (a[k] !== undefined) a[k] === null ? unset.push(k) : (patch[k] = String(a[k]));
      if (a.version !== undefined) a.version === null ? unset.push('version') : (patch.version = a.version);
      if (a.locationIds !== undefined) a.locationIds === null ? unset.push('locationIds') : (patch.locationIds = a.locationIds.map((x: string) => resolveRef('locations', x, p)));
      const weather = a.weather ? Object.fromEntries(Object.entries(a.weather).map(([k, v]) => [k, v == null ? null : String(v)])) : null;
      const hospital = a.hospital ? Object.fromEntries(Object.entries(a.hospital).map(([k, v]) => [k, v == null ? null : String(v)])) : null;
      const castCalls = Object.entries(a.castCalls ?? {}).map(([ref, v]: [string, any]) => {
        const cid = resolveRef('cast', ref, p);
        const c: Record<string, string | null> = {};
        for (const k of ['pickup', 'call', 'hmu', 'onSet'] as const) if (v?.[k] !== undefined) c[k] = v[k] === null ? null : normTime(v[k], `castCalls.${ref}.${k}`)!;
        if (v?.notes !== undefined) c.notes = v.notes;
        return [cid, c] as const;
      });
      const crewCalls = Object.entries(a.crewCalls ?? {}).map(([ref, v]: [string, any]) => {
        const cid = resolveRef('crew', ref, p);
        const val = typeof v === 'string' ? { call: v } : v;
        const c: Record<string, string | null> = {};
        if (val?.call !== undefined) c.call = val.call === null ? null : normTime(val.call, `crewCalls.${ref}.call`)!;
        if (val?.notes !== undefined) c.notes = val.notes;
        return [cid, c] as const;
      });
      update((d) => {
        const cs = (d.callSheets[id] ??= emptyCallSheet(id) as any);
        Object.assign(cs, patch);
        for (const k of unset) delete (cs as any)[k];
        const mergeObj = (key: 'weather' | 'hospital', src: Record<string, unknown> | null) => {
          if (!src) return;
          const cur: Record<string, unknown> = { ...(cs[key] ?? {}) };
          for (const [k, v] of Object.entries(src)) v === null ? delete cur[k] : (cur[k] = v);
          cs[key] = cur;
        };
        mergeObj('weather', weather);
        mergeObj('hospital', hospital);
        for (const [cid, c] of castCalls) {
          const cur: any = { ...(cs.castCalls[cid] ?? {}) };
          for (const [k, v] of Object.entries(c)) v === null ? delete cur[k] : (cur[k] = v);
          cs.castCalls[cid] = cur;
        }
        for (const [cid, c] of crewCalls) {
          const cur: any = { ...(cs.crewCalls[cid] ?? {}) };
          for (const [k, v] of Object.entries(c)) v === null ? delete cur[k] : (cur[k] = v);
          cs.crewCalls[cid] = cur;
        }
        for (const [k, v] of Object.entries(a.deptNotes ?? {})) {
          if (v === null || v === '') delete cs.deptNotes[k];
          else cs.deptNotes[k] = String(v);
        }
      });
      const idx = p.schedule.days.findIndex((x) => x.id === id);
      return { data: { dayId: id, updated: true }, summary: `Updated the Day ${idx + 1} call sheet` };
    },
  }),

  defineTool({
    name: 'apply_template',
    title: 'Add a crew or gear template',
    description:
      'Quick starts: kind "crew" adds open positions for a crew size (' +
      CREW_TEMPLATES.map((t) => `${t.id}: ${t.label}`).join('; ') +
      ') — fill in names later with update_items. Kind "gear" adds a kit (' +
      GEAR_PRESETS.map((g) => `${g.id}: ${g.label}`).join('; ') +
      '), skipping items already on the list.',
    input: obj({ kind: enm(['crew', 'gear'] as const), id: str('template id') }),
    run(a: { kind: 'crew' | 'gear'; id: string }) {
      const p = project();
      if (a.kind === 'crew') {
        const t = CREW_TEMPLATES.find((x) => x.id === a.id);
        if (!t) fail(`Unknown crew template. Use one of: ${CREW_TEMPLATES.map((x) => x.id).join(', ')}`);
        const have = new Set(p.crew.map((c) => `${c.department}|${c.position}`.toLowerCase()));
        const list = t.positions.filter(([dep, pos]) => !have.has(`${dep}|${pos}`.toLowerCase()));
        const n = list.length ? addPositions(list) : 0;
        return { data: { added: n, skipped: t.positions.length - n }, summary: `Added ${plural(n, 'crew position')} (${t.label})` };
      }
      const preset = GEAR_PRESETS.find((x) => x.id === a.id);
      if (!preset) fail(`Unknown gear preset. Use one of: ${GEAR_PRESETS.map((x) => x.id).join(', ')}`);
      const { add, skipped } = planPreset(preset, p.gear);
      if (add.length) update((d) => void d.gear.push(...(add as any)));
      return { data: { added: add.length, skipped }, summary: `Added ${plural(add.length, 'gear item')} (${preset.label})` };
    },
  }),

  defineTool({
    name: 'budget_quick_fill',
    title: 'Fill the budget from cast, crew and gear',
    description: 'Adds budget lines from what is already planned: "people" (a line per cast / crew member with a rate, using the number of shoot days) and/or "gear" (one line with the gear list total). Existing matching lines are updated instead of duplicated.',
    input: obj({ what: { ...arr(enm(['people', 'gear'] as const)), minItems: 1 } }),
    run({ what }: { what: ('people' | 'gear')[] }) {
      const p = project();
      const f = fmt(p);
      const out: Record<string, unknown> = {};
      update((d) => {
        if (what.includes('people')) out.people = addPeopleDraft(d);
        if (what.includes('gear')) out.gear = addGearDraft(d, f.money);
      });
      return { data: out, summary: `Filled the budget from ${what.join(' & ')}` };
    },
  }),
];
