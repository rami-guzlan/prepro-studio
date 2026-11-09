/* Creator Workspace (YouTube / social videos) for agents: read where a video
   stands and what to do next; write ideas, the outline, shots, checklists,
   publishing details and the stage. */
import type { CreatorData, CreatorShotKind, CreatorStage } from '@/types';
import { uid } from '@/lib/id';
import { update } from '@/store/project';
import { STAGE_ORDER, STATUS_OF_STAGE, chaptersFromBeats, nextAction, normalizeCreator, overallPercent, stageProgress, stageSteps } from '@/modules/creator/model';
import { clean, fail, project } from '../ctx';
import { defineTool } from '../tool';
import { arr, bool, enm, int, obj, opt, str } from '../schema';

const STAGES = STAGE_ORDER as CreatorStage[];
const SHOT_KINDS: CreatorShotKind[] = ['a_roll', 'b_roll', 'insert', 'screen'];

function creatorOut(c: CreatorData) {
  const steps = stageSteps(c);
  const next = nextAction(c);
  return clean({
    stage: c.stage,
    format: c.format,
    percent: overallPercent(c),
    targetDate: c.targetDate,
    next: next.step ? next.step.label : next.ready ? `"${c.stage}" is done: move on with set.stage` : undefined,
    progress: Object.fromEntries(Object.entries(stageProgress(c)).map(([k, v]) => [k, `${v.done}/${v.total}`])),
    openSteps: Object.fromEntries(Object.entries(steps).map(([k, list]) => [k, list.filter((x) => !x.done).map((x) => x.label)])),
    idea: { ...c.idea, hooks: c.idea.hooks.map((h) => clean({ id: h.id, text: h.text, picked: h.picked })), titles: c.idea.titles.map((h) => clean({ id: h.id, text: h.text, picked: h.picked })) },
    plan: c.plan,
    shoot: { preroll: c.shoot.preroll, log: c.shoot.log.slice(0, 20) },
    edit: c.edit,
    publish: c.publish,
    sessions: c.sessions.length ? { count: c.sessions.length, minutes: c.sessions.reduce((n, s) => n + s.minutes, 0) } : undefined,
  });
}

export const creatorTools = [
  defineTool({
    name: 'creator_read',
    title: 'Read the Creator Workspace of the open video',
    description:
      'YouTube / social videos (productions with the Creator Workspace) move through idea → plan → shoot → edit → publish → done. Returns the stage, % done, the next step, open steps per stage, and everything filled in: premise, hooks and titles (one picked), thumbnail idea, outline beats (also the teleprompter and chapters), shot list, gear and pre-roll checks, edit passes and versions, title / description / tags, platforms and results. Says so when the open production does not use the workspace yet.',
    readOnly: true,
    input: obj({}),
    run() {
      const p = project();
      if (p.meta.workflow !== 'creator') return { data: { usesCreatorWorkspace: false, hint: 'Call creator_write with enable:true (format long or short) to switch this production to the Creator Workspace; nothing is removed.' } };
      return { data: creatorOut(normalizeCreator(structuredClone(p.creator))) };
    },
  }),

  defineTool({
    name: 'creator_write',
    title: 'Fill in the Creator Workspace',
    description:
      'Changes the open video’s Creator Workspace in one undo step. enable: switch the production to it. set: stage, format, targetDate, premise, audience, payoff, thumbnailConcept, thumbnailText, notes, shootDate, location, wardrobe, planNotes, editNotes, projectFile, title, description, tags, results. Lists (added to what is there): hooks, titles (pickHook / pickTitle choose one by text or id), beats ({text, kind hook|intro|point|cta|outro, seconds}; replaceBeats to start over), shots ({text, kind a_roll|b_roll|insert|screen}), gear / preroll / editChecks / publishChecks (labels), platforms (names), tick (labels or ids of checks or shots to tick), chapters (true: append chapters from the outline to the description). Setting a stage also sets the production status.',
    destructive: true,
    input: obj({
      enable: opt(bool('switch this production to the Creator Workspace')),
      set: opt(
        obj({
          stage: opt(enm(STAGES)),
          format: opt(enm(['long', 'short'] as const)),
          targetDate: opt(str('YYYY-MM-DD publish by')),
          premise: opt(str()),
          audience: opt(str()),
          payoff: opt(str()),
          thumbnailConcept: opt(str()),
          thumbnailText: opt(str()),
          notes: opt(str()),
          shootDate: opt(str('YYYY-MM-DD')),
          location: opt(str()),
          wardrobe: opt(str()),
          planNotes: opt(str()),
          editNotes: opt(str()),
          projectFile: opt(str()),
          title: opt(str()),
          description: opt(str()),
          tags: opt(str()),
          results: opt(str()),
        }),
      ),
      hooks: opt(arr(str())),
      titles: opt(arr(str())),
      pickHook: opt(str()),
      pickTitle: opt(str()),
      beats: opt(arr(obj({ text: str(), kind: opt(enm(['hook', 'intro', 'point', 'cta', 'outro'] as const)), seconds: opt(int(undefined, 0)) }))),
      replaceBeats: opt(bool()),
      shots: opt(arr(obj({ text: str(), kind: opt(enm(SHOT_KINDS)) }))),
      gear: opt(arr(str())),
      preroll: opt(arr(str())),
      editChecks: opt(arr(str())),
      publishChecks: opt(arr(str())),
      platforms: opt(arr(str())),
      tick: opt(arr(str('label or id of a check or shot'))),
      chapters: opt(bool()),
    }),
    run(a: {
      enable?: boolean;
      set?: Record<string, string | undefined>;
      hooks?: string[];
      titles?: string[];
      pickHook?: string;
      pickTitle?: string;
      beats?: { text: string; kind?: 'hook' | 'intro' | 'point' | 'cta' | 'outro'; seconds?: number }[];
      replaceBeats?: boolean;
      shots?: { text: string; kind?: CreatorShotKind }[];
      gear?: string[];
      preroll?: string[];
      editChecks?: string[];
      publishChecks?: string[];
      platforms?: string[];
      tick?: string[];
      chapters?: boolean;
    }) {
      const p = project();
      if (p.meta.workflow !== 'creator' && !a.enable) fail('This production does not use the Creator Workspace. Pass enable:true to switch it (nothing is removed).');
      const missing: string[] = [];
      update((d) => {
        if (a.enable) d.meta.workflow = 'creator';
        d.creator = normalizeCreator(d.creator as CreatorData | undefined) as typeof d.creator;
        const c = d.creator!;
        const s = a.set ?? {};
        if (s.format === 'long' || s.format === 'short') c.format = s.format;
        if (s.stage && STAGES.includes(s.stage as CreatorStage)) {
          c.stage = s.stage as CreatorStage;
          d.meta.status = STATUS_OF_STAGE[c.stage];
        }
        if (s.targetDate != null) c.targetDate = s.targetDate || undefined;
        const text: [keyof typeof s, (v: string) => void][] = [
          ['premise', (v) => (c.idea.premise = v)],
          ['audience', (v) => (c.idea.audience = v)],
          ['payoff', (v) => (c.idea.payoff = v)],
          ['thumbnailConcept', (v) => (c.idea.thumbnail.concept = v)],
          ['thumbnailText', (v) => (c.idea.thumbnail.text = v)],
          ['notes', (v) => (c.idea.notes = v)],
          ['shootDate', (v) => (c.plan.shootDate = v || undefined)],
          ['location', (v) => (c.plan.location = v)],
          ['wardrobe', (v) => (c.plan.wardrobe = v)],
          ['planNotes', (v) => (c.plan.notes = v)],
          ['editNotes', (v) => (c.edit.notes = v)],
          ['projectFile', (v) => (c.edit.projectFile = v)],
          ['title', (v) => (c.publish.title = v)],
          ['description', (v) => (c.publish.description = v)],
          ['tags', (v) => (c.publish.tags = v)],
          ['results', (v) => (c.publish.results = v)],
        ];
        for (const [k, fn] of text) if (s[k] != null) fn(String(s[k]));
        for (const h of a.hooks ?? []) c.idea.hooks.push({ id: uid('opt'), text: h });
        for (const t of a.titles ?? []) c.idea.titles.push({ id: uid('opt'), text: t });
        const pick = (list: typeof c.idea.hooks, ref?: string) => {
          if (!ref) return;
          const r = ref.trim().toLowerCase();
          const hit = list.find((x) => x.id === ref) ?? list.find((x) => x.text.trim().toLowerCase() === r);
          if (!hit) return void missing.push(ref);
          for (const x of list) x.picked = x === hit;
        };
        pick(c.idea.hooks, a.pickHook);
        pick(c.idea.titles, a.pickTitle);
        if (a.pickTitle && !c.publish.title.trim()) c.publish.title = c.idea.titles.find((x) => x.picked)?.text ?? '';
        if (a.beats) {
          if (a.replaceBeats) c.idea.beats = [];
          for (const b of a.beats) c.idea.beats.push({ id: uid('beat'), text: b.text, kind: b.kind ?? 'point', seconds: b.seconds });
        }
        for (const sh of a.shots ?? []) c.plan.shots.push({ id: uid('cshot'), text: sh.text, kind: sh.kind ?? 'b_roll' });
        for (const g of a.gear ?? []) c.plan.gear.push({ id: uid('chk'), label: g });
        for (const g of a.preroll ?? []) c.shoot.preroll.push({ id: uid('chk'), label: g });
        for (const g of a.editChecks ?? []) c.edit.checklist.push({ id: uid('chk'), label: g });
        for (const g of a.publishChecks ?? []) c.publish.checklist.push({ id: uid('chk'), label: g });
        for (const pl of a.platforms ?? []) if (!c.publish.platforms.some((x) => x.platform.toLowerCase() === pl.toLowerCase())) c.publish.platforms.push({ id: uid('plat'), platform: pl, status: 'todo' });
        for (const t of a.tick ?? []) {
          const r = t.trim().toLowerCase();
          const all = [...c.plan.gear, ...c.shoot.preroll, ...c.edit.checklist, ...c.publish.checklist];
          const chk = all.find((x) => x.id === t || x.label.toLowerCase() === r);
          const shot = c.plan.shots.find((x) => x.id === t || x.text.toLowerCase() === r);
          if (chk) chk.done = true;
          else if (shot) shot.done = true;
          else missing.push(t);
        }
        if (a.chapters) c.publish.description = `${c.publish.description.trim()}\n\nChapters\n${chaptersFromBeats(c.idea.beats)}`.trim();
      });
      const c = normalizeCreator(structuredClone(project().creator));
      return { data: clean({ ...creatorOut(c), notFound: missing.length ? missing : undefined }), summary: `Creator Workspace updated (${c.stage}, ${overallPercent(c)}%)` };
    },
  }),
];
