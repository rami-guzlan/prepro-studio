/* Screenplay tools: read / write the script as Fountain, scenes, find &
   replace, breakdown tags, script notes, characters. A/V scripts use the
   av_rows collection (generic data tools). */
import type { Draft } from 'immer';
import type { BreakdownCategory, ProjectData, SceneMeta, ScriptNote } from '@/types';
import { update } from '@/store/project';
import { uid } from '@/lib/id';
import { locationForScene, sceneDayIndex } from '@/derived/project';
import { parseFountain, toFountain } from '@/script-core/fountain';
import { importScriptFile } from '@/script-core/importers';
import { parseCue } from '@/script-core/heading';
import type { Para, Run } from '@/script-core/paragraphs';
import { BREAKDOWN_CATEGORIES } from '@/lib/constants';
import { parseEighths } from '@/modules/breakdown/logic';
import { COLLECTIONS } from '../collections';
import { clean, fail, fmt, model, plural, project, requireScene, resolveRef } from '../ctx';
import { liveParas, writeParas } from '../docops';
import { defineTool } from '../tool';
import { arr, bool, enm, obj, opt, str } from '../schema';

type D = Draft<ProjectData>;

const CATS = BREAKDOWN_CATEGORIES.map((c) => c.id);

/* ---------------------------------------------------------------- runs */

function runsOf(p: Para): Run[] {
  return p.runs.length ? p.runs.map((r) => ({ ...r })) : p.text ? [{ text: p.text }] : [];
}

function splitAt(runs: Run[], pos: number): Run[] {
  const out: Run[] = [];
  let at = 0;
  for (const r of runs) {
    const end = at + r.text.length;
    if (pos > at && pos < end) {
      out.push({ ...r, text: r.text.slice(0, pos - at) }, { ...r, text: r.text.slice(pos - at) });
    } else out.push(r);
    at = end;
  }
  return out;
}

function mapRange(p: Para, from: number, to: number, fn: (r: Run) => Run) {
  let runs = splitAt(splitAt(runsOf(p), from), to);
  let at = 0;
  runs = runs.map((r) => {
    const s = at;
    at += r.text.length;
    return s >= from && s + r.text.length <= to && r.text.length ? fn(r) : r;
  });
  p.runs = runs;
}

function replaceRange(p: Para, from: number, to: number, text: string) {
  const runs = splitAt(splitAt(runsOf(p), from), to);
  const out: Run[] = [];
  let at = 0;
  let inserted = false;
  for (const r of runs) {
    const s = at;
    at += r.text.length;
    if (s >= from && s < to) {
      if (!inserted) {
        const { tags, notes, ...style } = r;
        if (text) out.push({ ...style, text });
        inserted = true;
      }
      continue;
    }
    if (!inserted && s >= to) {
      if (text) out.push({ text });
      inserted = true;
    }
    out.push(r);
  }
  if (!inserted && text) out.push({ text });
  p.runs = out.filter((r) => r.text.length);
  p.text = p.runs.map((r) => r.text).join('');
}

function occurrences(text: string, needle: string, matchCase: boolean, wholeWord: boolean): number[] {
  const out: number[] = [];
  if (!needle) return out;
  const hay = matchCase ? text : text.toLowerCase();
  const nd = matchCase ? needle : needle.toLowerCase();
  let i = hay.indexOf(nd);
  while (i >= 0) {
    const before = text[i - 1];
    const after = text[i + needle.length];
    const isWord = (c?: string) => !!c && /[\p{L}\p{N}_']/u.test(c);
    if (!wholeWord || (!isWord(before) && !isWord(after))) out.push(i);
    i = hay.indexOf(nd, i + Math.max(1, needle.length));
  }
  return out;
}

/* ---------------------------------------------------------------- scenes */

/** [start, end) paragraph ranges of scenes (by id) in the current paragraphs. */
function sceneRanges(paras: Para[]): Map<string, [number, number]> {
  const heads: number[] = [];
  paras.forEach((p, i) => p.type === 'scene_heading' && heads.push(i));
  const m = new Map<string, [number, number]>();
  heads.forEach((s, k) => {
    const sid = paras[s].sid;
    if (sid) m.set(sid, [s, k + 1 < heads.length ? heads[k + 1] : paras.length]);
  });
  return m;
}

function isEmptyDoc(paras: Para[]) {
  return paras.length === 0 || (paras.length === 1 && !paras[0].text.trim());
}

function sceneSummary(full = false) {
  const p = project();
  const m = model(p);
  const f = fmt(p);
  const days = sceneDayIndex(p);
  const charName = new Map(p.characters.map((c) => [c.id, c.name]));
  const elName = new Map(p.elements.map((e) => [e.id, e]));
  const shots = new Map<string, number>();
  for (const s of p.shots) if (s.sceneId) shots.set(s.sceneId, (shots.get(s.sceneId) ?? 0) + 1);
  return m.scenes.map((s) =>
    clean({
      id: s.id,
      number: s.number,
      heading: s.heading,
      page: s.page,
      length: f.eighths(s.eighths),
      synopsis: s.synopsis,
      firstAction: full || !s.synopsis ? s.firstAction.slice(0, 160) : undefined,
      characters: s.characterIds.map((id) => charName.get(id) ?? id),
      elements: full ? s.elementIds.map((id) => elName.get(id)).filter(Boolean).map((e) => `${e!.name} (${e!.category})`) : s.elementIds.length || undefined,
      location: locationForScene(p, s)?.name,
      shootDay: days.has(s.id) ? p.schedule.days[days.get(s.id)!]?.label || `Day ${days.get(s.id)! + 1}` : undefined,
      shots: shots.get(s.id),
      estMinutes: s.meta?.estMinutes,
      scriptDay: s.meta?.scriptDay,
      extras: s.meta?.extras,
      color: s.meta?.color,
      notes: full ? s.meta?.notes : undefined,
    }),
  );
}

/** Parse Fountain / FDX / TXT from text or a file on disk. */
async function parseInput(a: { fountain?: string; filePath?: string }) {
  if (a.fountain != null && a.filePath) fail('Pass either fountain text or filePath, not both.');
  if (a.filePath) {
    const f = await window.prepro?.mcp?.readFile(a.filePath);
    if (!f) fail('Reading files needs the desktop app.');
    const imp = importScriptFile(f.name, f.data);
    return { paras: imp.parsed.paras, titlePage: imp.parsed.titlePage, synopses: imp.parsed.synopses, numbers: imp.parsed.sceneNumbers };
  }
  if (a.fountain == null || !a.fountain.trim()) fail('Pass the script as Fountain text in "fountain" (or a filePath).');
  const parsed = parseFountain(a.fountain);
  if (!parsed.paras.length) fail('No screenplay content found in the Fountain text.');
  return { paras: parsed.paras, titlePage: parsed.titlePage, synopses: parsed.synopses, numbers: parsed.sceneNumbers };
}

const normHead = (s: string) => s.toUpperCase().replace(/\s+/g, ' ').replace(/[.\s-]+$/, '').trim();

/* ---------------------------------------------------------------- tagging helpers */

function findOrCreateTarget(d: D, cat: BreakdownCategory, name: string): string {
  const N = name.toUpperCase().replace(/\s+/g, ' ').trim();
  if (cat === 'cast') {
    const ex = d.characters.find((c) => c.name.toUpperCase() === N || (c.aliases ?? []).some((a) => a.toUpperCase() === N));
    if (ex) return ex.id;
    const id = uid('chr');
    d.characters.push({ id, name: N, number: d.characters.reduce((m, c) => Math.max(m, c.number ?? 0), 0) + 1, manual: true });
    return id;
  }
  const ex = d.elements.find((e) => e.category === cat && e.name.toUpperCase() === N);
  if (ex) return ex.id;
  const id = uid('el');
  d.elements.push({ id, category: cat as any, name: N, status: 'needed' });
  return id;
}

/* ================================================================ tools */

export const scriptTools = [
  defineTool({
    name: 'list_scenes',
    title: 'List scenes',
    description:
      'All scenes of the screenplay in order: id, number, heading, page, length (pages in eighths), synopsis, characters, breakdown elements, mapped location, shoot day, shot count, estimates. Scene ids are what other tools (shots, schedule, update_scenes …) use.',
    readOnly: true,
    input: obj({ detail: opt(bool('include element names, notes and first action line')) }),
    run({ detail }: { detail?: boolean }) {
      const p = project();
      const m = model(p);
      return {
        data: {
          scriptMode: p.script.mode,
          sceneCount: m.scenes.length,
          pages: m.pageCount,
          estRuntimeMinutes: m.estMinutes,
          scenes: sceneSummary(!!detail),
          ...(p.script.mode === 'av' ? { note: `This project uses the two-column A/V script (${p.script.av.rows.length} rows): list_items { collection: "av_rows" }.` } : {}),
        },
      };
    },
  }),

  defineTool({
    name: 'get_script',
    title: 'Read the screenplay',
    description:
      'Returns the screenplay as Fountain text (the plain-text screenplay format: scene headings like "INT. KITCHEN - NIGHT", CHARACTER cues in caps, dialogue below, "(parentheticals)", transitions ending in "TO:", "= synopsis" lines) plus an index of scene ids. Pass sceneIds (ids or numbers) to read only some scenes. For A/V projects the A/V rows are included too.',
    readOnly: true,
    input: obj({ sceneIds: opt(arr(str(), 'scene ids or numbers; omit for the whole script')), includeTitlePage: opt(bool('default true for the whole script')) }),
    run(a: { sceneIds?: string[]; includeTitlePage?: boolean }) {
      const p = project();
      const paras = liveParas();
      const m = model(p);
      const synopses: Record<string, string> = {};
      for (const [id, meta] of Object.entries(p.scenes)) if (meta?.synopsis) synopses[id] = meta.synopsis;
      let selected = paras;
      let scenes = m.scenes;
      if (a.sceneIds?.length) {
        const wanted = a.sceneIds.map((x) => requireScene(x, m));
        const ranges = sceneRanges(paras);
        selected = wanted.flatMap((s) => {
          const r = ranges.get(s.id);
          return r ? paras.slice(r[0], r[1]) : [];
        });
        scenes = wanted;
      }
      const whole = !a.sceneIds?.length;
      const text = isEmptyDoc(selected) ? '' : toFountain(selected, { titlePage: whole && a.includeTitlePage !== false ? p.script.titlePage : undefined, synopses });
      const av = p.script.mode === 'av' || (isEmptyDoc(paras) && p.script.av.rows.length)
        ? p.script.av.rows.map((r, i) => clean({ id: r.id, n: i + 1, segment: r.segment, video: r.video, audio: r.audio, duration: r.duration }))
        : undefined;
      return {
        text: text ? text : '(The screenplay is empty.)',
        data: clean({ scenes: scenes.map((s) => ({ id: s.id, number: s.number, heading: s.heading })), pages: whole ? m.pageCount : undefined, avScript: av }),
      };
    },
  }),

  defineTool({
    name: 'write_script',
    title: 'Write screenplay pages',
    description:
      'Writes screenplay text in Fountain format (or imports a .fountain / .fdx / .txt file with filePath). Modes: "append" (add at the end), "insert_before" / "insert_after" a scene (sceneId), "replace_scenes" (rewrite the given scenes: new scenes take over their ids in order so shots, schedule and breakdown stay linked), "replace_all" (whole script; scenes with the same heading keep their ids). Character records are created for new speaking roles; "= text" under a heading sets the scene synopsis. The user can undo with Ctrl+Z in the script.',
    input: obj({
      mode: enm(['append', 'insert_before', 'insert_after', 'replace_scenes', 'replace_all'] as const),
      fountain: opt(str('screenplay in Fountain format')),
      filePath: opt(str('absolute path of a .fountain / .fdx / .txt file instead of text')),
      sceneId: opt(str('for insert_before / insert_after: scene id or number')),
      sceneIds: opt(arr(str(), 'for replace_scenes: scenes to replace (ids or numbers)')),
      keepSceneNumbers: opt(bool('honour #12# locked scene numbers in the text (default false)')),
    }),
    async run(a: { mode: 'append' | 'insert_before' | 'insert_after' | 'replace_scenes' | 'replace_all'; fountain?: string; filePath?: string; sceneId?: string; sceneIds?: string[]; keepSceneNumbers?: boolean }) {
      const p = project();
      const input = await parseInput(a);
      const paras = liveParas();
      const m = model(p);
      const ranges = sceneRanges(paras);
      const incoming = input.paras.map((x) => ({ ...x }));
      const newHeads = incoming.filter((x) => x.type === 'scene_heading');
      const remap = new Map<string, string>(); // parsed sid -> final sid
      let out: Para[];

      if (a.mode === 'replace_all') {
        const old = m.scenes.map((s) => ({ id: s.id, h: normHead(s.heading) }));
        const used = new Set<string>();
        for (const h of newHeads) {
          const hit = old.find((o) => !used.has(o.id) && o.h === normHead(h.text));
          if (hit) {
            used.add(hit.id);
            remap.set(h.sid!, hit.id);
          }
        }
        if (old.length === newHeads.length)
          newHeads.forEach((h, i) => {
            if (!remap.has(h.sid!) && !used.has(old[i].id)) {
              used.add(old[i].id);
              remap.set(h.sid!, old[i].id);
            }
          });
        out = incoming;
      } else if (a.mode === 'replace_scenes') {
        if (!a.sceneIds?.length) fail('replace_scenes needs sceneIds.');
        const targets = a.sceneIds.map((x) => requireScene(x, m));
        newHeads.forEach((h, i) => targets[i] && remap.set(h.sid!, targets[i].id));
        const drop = new Set<number>();
        for (const t of targets) {
          const r = ranges.get(t.id);
          if (r) for (let i = r[0]; i < r[1]; i++) drop.add(i);
        }
        const firstIdx = Math.min(...targets.map((t) => ranges.get(t.id)?.[0] ?? Infinity));
        out = [];
        paras.forEach((x, i) => {
          if (i === firstIdx) out.push(...incoming);
          if (!drop.has(i)) out.push(x);
        });
        if (!isFinite(firstIdx)) out.push(...incoming);
      } else if (a.mode === 'append') {
        out = isEmptyDoc(paras) ? incoming : [...paras, ...incoming];
      } else {
        if (!a.sceneId) fail(`${a.mode} needs sceneId.`);
        const s = requireScene(a.sceneId, m);
        const r = ranges.get(s.id)!;
        const at = a.mode === 'insert_before' ? r[0] : r[1];
        out = [...paras.slice(0, at), ...incoming, ...paras.slice(at)];
      }
      for (const x of out) if (x.type === 'scene_heading' && x.sid && remap.has(x.sid)) x.sid = remap.get(x.sid);
      const finalSid = (sid: string) => remap.get(sid) ?? sid;
      const replacedIds = new Set<string>(a.mode === 'replace_all' ? m.scenes.map((s) => s.id) : a.mode === 'replace_scenes' ? (a.sceneIds ?? []).map((x) => requireScene(x, m).id) : []);
      const keptIds = new Set(out.filter((x) => x.type === 'scene_heading' && x.sid).map((x) => x.sid!));
      const removed = [...replacedIds].filter((id) => !keptIds.has(id));

      update((d) => {
        writeParas(d, out);
        for (const [sid, syn] of Object.entries(input.synopses)) {
          const id = finalSid(sid);
          d.scenes[id] = { ...(d.scenes[id] ?? { id }), synopsis: syn };
        }
        if (a.keepSceneNumbers)
          for (const [sid, num] of Object.entries(input.numbers)) {
            const id = finalSid(sid);
            d.scenes[id] = { ...(d.scenes[id] ?? { id }), number: num };
          }
        if (input.titlePage && Object.keys(input.titlePage).length && (a.mode === 'replace_all' || isEmptyDoc(paras))) d.script.titlePage = { ...d.script.titlePage, ...input.titlePage } as any;
        if (removed.length) unlinkScenes(d, new Set(removed));
      });
      const after = model();
      const written = new Set(newHeads.map((h) => finalSid(h.sid!)));
      return {
        data: clean({
          scenesWritten: newHeads.length,
          scenes: after.scenes.filter((s) => written.has(s.id)).map((s) => ({ id: s.id, number: s.number, heading: s.heading, page: s.page })),
          removedScenes: removed.length ? removed : undefined,
          totalScenes: after.scenes.length,
          pages: after.pageCount,
          characters: after.speakingNames,
        }),
        summary: `Wrote ${plural(newHeads.length, 'scene')} (${a.mode.replace('_', ' ')})`,
      };
    },
  }),

  defineTool({
    name: 'edit_script_text',
    title: 'Find & replace in the script',
    description:
      'Finds text in the screenplay and replaces it (formatting around it is kept). Limit to scenes with sceneIds. Returns the number of replacements. To rename a role everywhere use rename_character.',
    input: obj({
      find: str(),
      replace: str('replacement text ("" deletes)'),
      sceneIds: opt(arr(str(), 'only in these scenes (ids or numbers)')),
      matchCase: opt(bool('default false')),
      wholeWord: opt(bool('default false')),
      firstOnly: opt(bool('replace only the first match')),
    }),
    run(a: { find: string; replace: string; sceneIds?: string[]; matchCase?: boolean; wholeWord?: boolean; firstOnly?: boolean }) {
      project();
      const paras = liveParas();
      const m = model();
      let range: [number, number][] | null = null;
      if (a.sceneIds?.length) {
        const rs = sceneRanges(paras);
        range = a.sceneIds.map((x) => rs.get(requireScene(x, m).id)!).filter(Boolean);
      }
      const inRange = (i: number) => !range || range.some(([s, e]) => i >= s && i < e);
      let count = 0;
      const touched = new Set<number>();
      for (let i = 0; i < paras.length && !(a.firstOnly && count); i++) {
        if (!inRange(i)) continue;
        const pos = occurrences(paras[i].text, a.find, !!a.matchCase, !!a.wholeWord);
        if (!pos.length) continue;
        const list = a.firstOnly ? pos.slice(0, 1) : pos;
        for (const at of [...list].reverse()) replaceRange(paras[i], at, at + a.find.length, a.replace);
        count += list.length;
        touched.add(i);
      }
      if (!count) return { data: { replaced: 0 }, text: `No matches for "${a.find}".` };
      update((d) => writeParas(d, paras));
      const scenes = [...new Set([...touched].map((i) => m.sceneOfPara[i]).filter((k) => k >= 0).map((k) => m.scenes[k]?.number))];
      return { data: { replaced: count, scenes }, summary: `Replaced ${plural(count, 'match', 'matches')} of “${a.find}”` };
    },
  }),

  defineTool({
    name: 'update_scenes',
    title: 'Update scene details',
    description:
      'Changes per-scene data: heading text, synopsis (index card), color, estMinutes (shooting time), scriptDay ("Day 1" story day), locationId (real location override), extras (background description), number (locked scene number), notes, eighths (page-length override, e.g. "1 3/8" or 11), characterIds (non-speaking characters present) and elementIds (breakdown elements linked manually). null clears a value.',
    input: obj({
      updates: {
        ...arr(
          obj({
            sceneId: str('scene id or number'),
            heading: opt(str('new scene heading, e.g. "EXT. ROOFTOP - NIGHT"')),
            synopsis: opt({ type: ['string', 'null'] }),
            color: opt({ type: ['string', 'null'] }),
            estMinutes: opt({ type: ['number', 'null'] }),
            scriptDay: opt({ type: ['string', 'null'] }),
            locationId: opt({ type: ['string', 'null'], description: 'location id or name' }),
            extras: opt({ type: ['string', 'null'] }),
            number: opt({ type: ['string', 'null'], description: 'locked scene number' }),
            notes: opt({ type: ['string', 'null'] }),
            eighths: opt({ type: ['string', 'number', 'null'], description: 'page length override' }),
            characterIds: opt({ type: ['array', 'null'], items: { type: 'string' }, description: 'character ids or names (replaces the manual list)' }),
            elementIds: opt({ type: ['array', 'null'], items: { type: 'string' }, description: 'element ids or names (replaces the manual list)' }),
          }),
        ),
        minItems: 1,
      },
    }),
    run({ updates }: { updates: Record<string, any>[] }) {
      const p = project();
      const m = model(p);
      const paras = liveParas();
      let docChanged = false;
      const plans = updates.map((u) => {
        const s = requireScene(u.sceneId, m);
        const meta: Partial<SceneMeta> & Record<string, unknown> = {};
        const unset: string[] = [];
        const put = (k: keyof SceneMeta, val: unknown) => (val === null ? unset.push(k) : val !== undefined && (meta[k] = val as never));
        put('synopsis', u.synopsis);
        put('color', u.color);
        put('estMinutes', u.estMinutes);
        put('scriptDay', u.scriptDay);
        put('extras', u.extras);
        put('number', u.number);
        put('notes', u.notes);
        if (u.locationId !== undefined) put('locationId', u.locationId === null ? null : resolveRef('locations', u.locationId, p));
        if (u.eighths !== undefined) {
          if (u.eighths === null) unset.push('eighthsOverride');
          else {
            const e = typeof u.eighths === 'number' ? u.eighths : parseEighths(String(u.eighths));
            if (e == null) fail(`eighths "${u.eighths}" not understood. Use e.g. "1 3/8" or 11.`);
            meta.eighthsOverride = e;
          }
        }
        if (u.characterIds !== undefined) put('characterIds', u.characterIds === null ? null : u.characterIds.map((x: string) => resolveRef('characters', x, p)));
        if (u.elementIds !== undefined) put('elementIds', u.elementIds === null ? null : u.elementIds.map((x: string) => resolveRef('elements', x, p)));
        if (u.heading) {
          const hp = paras[s.paraStart];
          if (hp) {
            hp.text = String(u.heading).toUpperCase().trim();
            hp.runs = [{ text: hp.text }];
            docChanged = true;
          }
        }
        return { id: s.id, meta, unset };
      });
      update((d) => {
        for (const pl of plans) {
          const cur: any = { ...(d.scenes[pl.id] ?? { id: pl.id }), ...pl.meta };
          for (const k of pl.unset) delete cur[k];
          d.scenes[pl.id] = cur;
        }
        if (docChanged) writeParas(d, paras);
      });
      return { data: { updated: plans.length }, summary: `Updated ${plural(plans.length, 'scene')}` };
    },
  }),

  defineTool({
    name: 'delete_scenes',
    title: 'Delete scenes',
    description: 'Removes whole scenes (heading and everything until the next heading) from the screenplay. Their shots become unassigned and they leave the schedule. Ctrl+Z in the script editor (or the undo tool) restores them.',
    destructive: true,
    input: obj({ sceneIds: { ...arr(str(), 'scene ids or numbers'), minItems: 1 } }),
    run({ sceneIds }: { sceneIds: string[] }) {
      project();
      const m = model();
      const paras = liveParas();
      const ranges = sceneRanges(paras);
      const ids = new Set(sceneIds.map((x) => requireScene(x, m).id));
      const drop = new Set<number>();
      for (const id of ids) {
        const r = ranges.get(id);
        if (r) for (let i = r[0]; i < r[1]; i++) drop.add(i);
      }
      const out = paras.filter((_, i) => !drop.has(i));
      update((d) => {
        writeParas(d, out);
        unlinkScenes(d, ids);
      });
      return { data: { deleted: ids.size, remainingScenes: model().scenes.length }, summary: `Deleted ${plural(ids.size, 'scene')}` };
    },
  }),

  defineTool({
    name: 'move_scenes',
    title: 'Reorder scenes',
    description: 'Moves scenes (keeping their order) before another scene, or to the start / end of the screenplay. Scene numbers update automatically unless locked.',
    input: obj({ sceneIds: { ...arr(str()), minItems: 1 }, beforeSceneId: opt(str('scene id or number')), position: opt(enm(['start', 'end'] as const)) }),
    run(a: { sceneIds: string[]; beforeSceneId?: string; position?: 'start' | 'end' }) {
      project();
      const m = model();
      const paras = liveParas();
      const ranges = sceneRanges(paras);
      const ids = a.sceneIds.map((x) => requireScene(x, m).id);
      const moving: Para[] = [];
      const drop = new Set<number>();
      for (const id of ids) {
        const r = ranges.get(id)!;
        moving.push(...paras.slice(r[0], r[1]));
        for (let i = r[0]; i < r[1]; i++) drop.add(i);
      }
      const rest = paras.filter((_, i) => !drop.has(i));
      let at: number;
      if (a.beforeSceneId) {
        const target = requireScene(a.beforeSceneId, m).id;
        if (ids.includes(target)) fail('beforeSceneId is one of the scenes being moved.');
        at = rest.findIndex((x) => x.type === 'scene_heading' && x.sid === target);
      } else if (a.position === 'start') at = Math.max(0, rest.findIndex((x) => x.type === 'scene_heading'));
      else at = rest.length;
      rest.splice(at, 0, ...moving);
      update((d) => writeParas(d, rest));
      return { data: { moved: ids.length, order: model().scenes.map((s) => `${s.number}. ${s.heading}`) }, summary: `Moved ${plural(ids.length, 'scene')}` };
    },
  }),

  defineTool({
    name: 'tag_script',
    title: 'Tag breakdown elements in the script',
    description:
      'Script breakdown: marks every occurrence of `text` in the screenplay (or in sceneIds) as a breakdown element of `category` — props, wardrobe, vehicles, sfx, vfx, makeup, set_dressing, animals, extras, stunts, sound, music, special_equipment, greenery, security, misc — or cast (a character). The element is created if needed (name = `name` or the text in caps). Tagged elements show on breakdown sheets, the elements list, schedule strips and call sheets.',
    input: obj({
      text: str('text to find, e.g. "walkie-talkie"'),
      category: enm(CATS as any),
      name: opt(str('element / character name if different from the text')),
      sceneIds: opt(arr(str(), 'only tag in these scenes')),
      firstOnly: opt(bool('tag only the first occurrence')),
    }),
    run(a: { text: string; category: BreakdownCategory; name?: string; sceneIds?: string[]; firstOnly?: boolean }) {
      project();
      const m = model();
      const paras = liveParas();
      const rs = sceneRanges(paras);
      const range = a.sceneIds?.length ? a.sceneIds.map((x) => rs.get(requireScene(x, m).id)!).filter(Boolean) : null;
      const hits: [number, number][] = [];
      for (let i = 0; i < paras.length; i++) {
        if (range && !range.some(([s, e]) => i >= s && i < e)) continue;
        for (const at of occurrences(paras[i].text, a.text, false, true)) hits.push([i, at]);
        if (a.firstOnly && hits.length) break;
      }
      let targetId = '';
      update((d) => {
        targetId = findOrCreateTarget(d, a.category, a.name || a.text);
        for (const [i, at] of a.firstOnly ? hits.slice(0, 1) : hits) {
          mapRange(paras[i], at, at + a.text.length, (r) => (r.tags?.some((t) => t.id === targetId) ? r : { ...r, tags: [...(r.tags ?? []), { cat: a.category, id: targetId }] }));
        }
        if (hits.length) writeParas(d, paras);
        else if (a.sceneIds?.length && a.category !== 'cast') {
          // not in the text: link to the scenes manually
          for (const x of a.sceneIds) {
            const sid = requireScene(x, m).id;
            const meta = (d.scenes[sid] ??= { id: sid });
            meta.elementIds = [...new Set([...(meta.elementIds ?? []), targetId])];
          }
        }
      });
      const scenes = [...new Set(hits.map(([i]) => m.scenes[m.sceneOfPara[i]]?.number).filter(Boolean))];
      return {
        data: { id: targetId, category: a.category, tagged: a.firstOnly ? Math.min(1, hits.length) : hits.length, scenes, ...(hits.length ? {} : { note: a.sceneIds?.length ? 'Text not found; linked to the scenes manually.' : 'Text not found in the script; the element exists but is not linked to any scene.' }) },
        summary: `Tagged “${a.text}” as ${a.category} (${plural(hits.length, 'place')})`,
      };
    },
  }),

  defineTool({
    name: 'add_script_note',
    title: 'Add a script note',
    description: 'Attaches a note to text in the screenplay (shown in the script editor and the script notes report). `quote` is the script text to anchor on; without it the note goes on the scene heading of sceneId.',
    input: obj({ text: str('the note'), quote: opt(str('script text the note refers to')), sceneId: opt(str('scene id or number (narrows the search / anchor)')), color: opt(str('#rrggbb')), author: opt(str()) }),
    run(a: { text: string; quote?: string; sceneId?: string; color?: string; author?: string }) {
      project();
      const m = model();
      const paras = liveParas();
      const rs = sceneRanges(paras);
      const scene = a.sceneId ? requireScene(a.sceneId, m) : undefined;
      const [from, to] = scene ? rs.get(scene.id)! : [0, paras.length];
      let at: [number, number, number] | null = null;
      if (a.quote) {
        for (let i = from; i < to && !at; i++) {
          const pos = occurrences(paras[i].text, a.quote, false, false);
          if (pos.length) at = [i, pos[0], pos[0] + a.quote.length];
        }
        if (!at) fail(`"${a.quote}" was not found${scene ? ` in scene ${scene.number}` : ''}.`);
      } else if (scene) at = [from, 0, paras[from].text.length];
      else fail('Pass a quote or a sceneId to anchor the note.');
      if (at![2] === at![1]) fail('That scene heading is empty; pass a quote instead.');
      const note: ScriptNote = { id: uid('note'), text: a.text, color: a.color || '#f5a524', author: a.author || 'AI agent', createdAt: new Date().toISOString() };
      mapRange(paras[at![0]], at![1], at![2], (r) => ({ ...r, notes: [...(r.notes ?? []), note.id] }));
      update((d) => {
        d.script.notes[note.id] = note;
        writeParas(d, paras);
      });
      return { data: { id: note.id, scene: m.scenes[m.sceneOfPara[at![0]]]?.number }, summary: 'Added a script note' };
    },
  }),

  defineTool({
    name: 'rename_character',
    title: 'Rename a character',
    description: 'Renames a role everywhere it is a character cue (keeping extensions like (V.O.)) and on the character record (cast link, description and breakdown data are kept). Optionally also replaces the name in action and dialogue text.',
    input: obj({ from: str('current name or character id'), to: str('new name'), inText: opt(bool('also replace the name in action/dialogue (whole word, case-sensitive caps and Title case)')) }),
    run(a: { from: string; to: string; inText?: boolean }) {
      const p = project();
      const id = resolveRef('characters', a.from, p);
      const ch = p.characters.find((x) => x.id === id)!;
      const oldName = ch.name.toUpperCase();
      const newName = a.to.toUpperCase().trim();
      if (!newName) fail('New name is empty.');
      if (p.characters.some((x) => x.id !== id && x.name.toUpperCase() === newName)) fail(`A character named ${newName} already exists.`);
      const paras = liveParas();
      let cues = 0;
      let mentions = 0;
      const title = (s: string) => s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
      for (const para of paras) {
        if (para.type === 'character') {
          const cue = parseCue(para.text);
          if (cue.name === oldName) {
            replaceRange(para, 0, oldName.length, newName);
            cues++;
          }
        } else if (a.inText && para.type !== 'scene_heading') {
          for (const [o, n] of [
            [oldName, newName],
            [title(oldName), title(newName)],
          ]) {
            const pos = occurrences(para.text, o, true, true);
            for (const at of [...pos].reverse()) replaceRange(para, at, at + o.length, n);
            mentions += pos.length;
          }
        }
      }
      update((d) => {
        const c = d.characters.find((x) => x.id === id)!;
        c.name = newName;
        writeParas(d, paras);
      });
      return { data: { id, from: oldName, to: newName, cues, mentions }, summary: `Renamed ${oldName} to ${newName}` };
    },
  }),
];

/** Remove links to scenes that no longer exist (schedule strips, shots, elements, diagrams, post items). */
export function unlinkScenes(d: D, ids: Set<string>) {
  for (const day of d.schedule.days) day.items = day.items.filter((it) => !(it.type === 'scene' && ids.has(it.sceneId)));
  if (d.schedule.boneyardOrder) d.schedule.boneyardOrder = d.schedule.boneyardOrder.filter((x) => !ids.has(x));
  for (const c of COLLECTIONS) {
    const fields = c.fields.filter((f) => f.ref === 'scenes');
    if (!fields.length || c.parent) continue;
    const list = c.draft(d) as any[];
    if (!Array.isArray(list)) continue;
    for (const it of list)
      for (const f of fields) {
        if (f.type === 'ref' && ids.has(it[f.name])) delete it[f.name];
        if (f.type === 'ref[]' && Array.isArray(it[f.name])) it[f.name] = it[f.name].filter((x: string) => !ids.has(x));
      }
  }
  for (const id of ids) delete d.scenes[id];
}

