/* Marketing Space tools: library (list / open / create / duplicate / delete),
   linked projects, the content calendar and reports. Collections inside a
   space (content, posts, channels, goals …) use the generic data tools. */
import type { SpaceType } from '@/spaces/types';
import { backend } from '@/backend';
import { updateSpace, useSpaceStore } from '@/store/space';
import { addDays, todayISO } from '@/lib/dates';
import { uid } from '@/lib/id';
import { SPACE_TYPES, STAGES } from '@/spaces/constants';
import { allPosts, atRiskContent, cadenceForWeek, countByStage, engagement, goalProgress, overduePosts, sumMetrics, upcomingPosts, weekStart } from '@/spaces/derive';
import { createSpaceAndOpen, deleteSpace, openDemoSpace, openSpaceById } from '@/shell/spaceActions';
import type { SpaceModuleId } from '@/store/app';
import { SPACE_MODULES } from '@/spaces/registry';
import { clean, fail, normDate, plural, space } from '../ctx';
import { defineTool } from '../tool';
import { arr, bool, enm, obj, opt, str } from '../schema';

const SPACE_MODULE_IDS = SPACE_MODULES.map((m) => m.id) as SpaceModuleId[];

async function findSpace(ref: string) {
  const list = await backend.listSpaces();
  const hit = list.find((s) => s.id === ref) ?? list.find((s) => s.title.toLowerCase() === ref.toLowerCase()) ?? list.find((s) => s.title.toLowerCase().includes(ref.toLowerCase()));
  if (!hit) fail(`No space "${ref}". Call list_spaces.`);
  return hit;
}

async function projectIds(refs: string[]): Promise<string[]> {
  const list = await backend.listProjects();
  return refs.map((r) => {
    const p = list.find((x) => x.id === r) ?? list.find((x) => x.title.toLowerCase() === r.toLowerCase()) ?? list.find((x) => x.title.toLowerCase().includes(r.toLowerCase()));
    if (!p) fail(`No project "${r}". Call list_projects.`);
    return p.id;
  });
}

export const spaceTools = [
  defineTool({
    name: 'list_spaces',
    title: 'List Marketing Spaces',
    description: 'All Marketing Spaces (personal brand, channels, release campaigns …) with type, content counts, next scheduled post and which one is open. Spaces are separate from production projects (list_projects).',
    readOnly: true,
    global: true,
    input: obj({}),
    async run() {
      const open = useSpaceStore.getState().space?.id;
      const list = await backend.listSpaces();
      return { data: list.map((s) => clean({ id: s.id, title: s.title, type: s.type, description: s.description, content: s.contentCount, published: s.publishedCount, nextPost: s.nextPost, updated: s.updatedAt.slice(0, 10), demo: s.demo || undefined, open: s.id === open || undefined })) };
    },
  }),

  defineTool({
    name: 'open_space',
    title: 'Open a Marketing Space',
    description: 'Opens a Marketing Space (by id or name) in the app, optionally on a screen. While a space is open the generic data tools (describe_data, list_items, add_items …) work on its content, posts, channels, goals, campaigns etc.',
    global: true,
    noStep: true,
    input: obj({ spaceId: str('space id or name'), module: opt(enm(SPACE_MODULE_IDS)) }),
    async run(a: { spaceId: string; module?: SpaceModuleId }) {
      const hit = await findSpace(a.spaceId);
      await openSpaceById(hit.id, a.module);
      if (useSpaceStore.getState().space?.id !== hit.id) fail(`Could not open “${hit.title}”.`);
      return { data: { opened: hit.id, title: hit.title }, summary: `Opened the space “${hit.title}”` };
    },
  }),

  defineTool({
    name: 'create_space',
    title: 'Create a Marketing Space',
    description:
      'Creates and opens a Marketing Space. type: personal_brand (multichannel creator brand), channel (a YouTube channel / show), campaign (a film or product release), business, event, other. start "template" (default) adds starting channels, content pillars, goals, campaign phases with dated milestones and starter content ideas for the type; "blank" starts empty. projectIds links production projects (e.g. the film a release campaign promotes).',
    global: true,
    noStep: true,
    input: obj({
      title: str(),
      type: enm(SPACE_TYPES.map((t) => t.value) as SpaceType[]),
      start: opt(enm(['template', 'blank'] as const)),
      description: opt(str('what the space is for')),
      color: opt(str('#rrggbb')),
      emoji: opt(str()),
      projectIds: opt(arr(str(), 'production projects to link (ids or titles)')),
      startDate: opt(str('campaign / event start YYYY-MM-DD (phases and milestones are dated from it)')),
    }),
    async run(a: { title: string; type: SpaceType; start?: 'template' | 'blank'; description?: string; color?: string; emoji?: string; projectIds?: string[]; startDate?: string }) {
      const ids = a.projectIds?.length ? await projectIds(a.projectIds) : [];
      const s = await createSpaceAndOpen(
        { title: a.title, type: a.type, withTemplate: a.start !== 'blank', description: a.description, color: a.color, emoji: a.emoji, projectIds: ids, startDate: a.startDate ? normDate(a.startDate) : undefined },
        { coverFromProjectId: a.type === 'campaign' ? ids[0] : undefined },
      );
      if (!s) fail('Could not create the space.');
      return {
        data: { id: s.id, title: s.meta.title, channels: s.channels.map((c) => c.name), pillars: s.pillars.map((p) => p.name), campaigns: s.campaigns.map((c) => c.name), content: s.content.length },
        summary: `Created the space “${s.meta.title}”`,
      };
    },
  }),

  defineTool({
    name: 'open_demo_space',
    title: 'Open the demo Marketing Space',
    description: 'Opens the built-in demo space (the release campaign of the demo film, with every screen filled in) — useful to see what a complete space looks like.',
    global: true,
    noStep: true,
    input: obj({}),
    async run() {
      await openDemoSpace();
      const s = useSpaceStore.getState().space;
      if (!s) fail('The demo space could not be opened.');
      return { data: { id: s.id, title: s.meta.title }, summary: 'Opened the demo space' };
    },
  }),

  defineTool({
    name: 'duplicate_space',
    title: 'Duplicate a Marketing Space',
    description: 'Copies a whole space (with images) under a new name. The copy is not opened.',
    global: true,
    noStep: true,
    input: obj({ spaceId: str('id or name'), title: opt(str()) }),
    async run(a: { spaceId: string; title?: string }) {
      const src = await findSpace(a.spaceId);
      const id = uid('spc');
      const title = a.title || `${src.title} (copy)`;
      await backend.duplicateSpace(src.id, id, title);
      return { data: { id, title }, summary: `Duplicated “${src.title}”` };
    },
  }),

  defineTool({
    name: 'delete_space',
    title: 'Delete a Marketing Space',
    description: 'Moves a space folder to the Recycle Bin. Only when the user explicitly asked to delete that space. Requires confirm: true.',
    global: true,
    noStep: true,
    destructive: true,
    input: obj({ spaceId: str('id or name'), confirm: bool('must be true') }),
    async run(a: { spaceId: string; confirm: boolean }) {
      if (a.confirm !== true) fail('Set confirm: true after the user has explicitly asked to delete this space.');
      const hit = await findSpace(a.spaceId);
      await deleteSpace(hit.id);
      return { data: { deleted: hit.id, title: hit.title }, summary: `Deleted the space “${hit.title}”` };
    },
  }),

  defineTool({
    name: 'link_projects',
    title: 'Link production projects to the space',
    description: 'Adds or removes linked production projects of the open space (e.g. link the film this campaign promotes). Content pieces and campaigns can then reference them with projectId.',
    global: true,
    input: obj({ add: opt(arr(str(), 'project ids or titles')), remove: opt(arr(str(), 'project ids or titles')) }),
    async run(a: { add?: string[]; remove?: string[] }) {
      const s = space();
      const add = a.add?.length ? await projectIds(a.add) : [];
      const remove = a.remove?.length ? await projectIds(a.remove) : [];
      updateSpace((d) => {
        d.projectIds = [...new Set([...d.projectIds.filter((x) => !remove.includes(x)), ...add])];
      });
      const list = await backend.listProjects();
      const now = useSpaceStore.getState().space?.projectIds ?? s.projectIds;
      return { data: { linked: now.map((id) => list.find((p) => p.id === id)?.title ?? id) }, summary: 'Updated linked projects' };
    },
  }),

  defineTool({
    name: 'get_space_calendar',
    title: 'Read the content calendar',
    description: 'Everything scheduled in a date range of the open space: posts (date, time, channel, content, format, stage, status, caption excerpt), shoot days, milestones and campaigns, plus pieces that are not scheduled yet. Default range: today → +14 days.',
    readOnly: true,
    global: true,
    input: obj({ from: opt(str('YYYY-MM-DD')), to: opt(str('YYYY-MM-DD')), includeUnscheduled: opt(bool('default true')) }),
    run(a: { from?: string; to?: string; includeUnscheduled?: boolean }) {
      const s = space();
      const from = normDate(a.from ?? todayISO())!;
      const to = normDate(a.to ?? addDays(from, 14))!;
      const posts = allPosts(s).filter((r) => r.post.date && r.post.date >= from && r.post.date <= to);
      const scheduledIds = new Set(allPosts(s).filter((r) => r.post.date).map((r) => r.content.id));
      return {
        data: clean({
          range: { from, to },
          posts: posts.map((r) =>
            clean({ date: r.post.date, time: r.post.time, channel: r.channel?.name ?? '(deleted channel)', content: r.content.title, contentId: r.content.id, postId: r.post.id, format: r.content.format, stage: r.content.stage, status: r.post.status, title: r.post.title, caption: r.post.caption ? r.post.caption.slice(0, 120) : undefined }),
          ),
          shoots: s.shoots.filter((x) => x.date && x.date >= from && x.date <= to).map((x) => clean({ id: x.id, date: x.date, title: x.title, location: x.location, content: x.contentIds.map((id) => s.content.find((c) => c.id === id)?.title ?? '(deleted)') })),
          milestones: s.milestones.filter((m) => m.date && m.date >= from && m.date <= to).map((m) => clean({ id: m.id, date: m.date, name: m.name, done: m.done })),
          campaigns: s.campaigns.filter((c) => c.start && c.end && c.start <= to && c.end >= from).map((c) => clean({ id: c.id, name: c.name, start: c.start, end: c.end, status: c.status })),
          unscheduled:
            a.includeUnscheduled === false ? undefined : s.content.filter((c) => c.stage !== 'published' && !scheduledIds.has(c.id)).map((c) => clean({ id: c.id, title: c.title, format: c.format, stage: c.stage, posts: c.posts.length || undefined })),
        }),
      };
    },
  }),

  defineTool({
    name: 'get_space_report',
    title: 'Space reports',
    description:
      'Computed overviews of the open space: "overview" (goals progress, pipeline per stage, next 14 days, overdue posts, at-risk content, active campaigns, next milestones), "pipeline" (every piece grouped by stage with next post date), "cadence" (planned posts vs target per channel for the next 4 weeks), "results" (published posts with metrics: totals, by channel / format / pillar, top posts; optional from/to).',
    readOnly: true,
    global: true,
    input: obj({ report: enm(['overview', 'pipeline', 'cadence', 'results'] as const), from: opt(str()), to: opt(str()) }),
    run(a: { report: 'overview' | 'pipeline' | 'cadence' | 'results'; from?: string; to?: string }) {
      const s = space();
      const t = todayISO();
      const ch = new Map(s.channels.map((c) => [c.id, c.name]));
      if (a.report === 'overview') {
        return {
          data: clean({
            space: { title: s.meta.title, type: s.meta.type, description: s.meta.description },
            goals: s.goals.map((g) => clean({ title: g.title, current: g.current, target: g.target, unit: g.unit, due: g.due, status: g.status, progress: goalProgress(g) == null ? undefined : `${Math.round(goalProgress(g)! * 100)}%` })),
            pipeline: countByStage(s.content),
            next14Days: upcomingPosts(s, 14).map((r) => `${r.post.date}${r.post.time ? ' ' + r.post.time : ''} · ${r.channel?.name ?? '?'} · ${r.content.title} (${r.post.status})`),
            overduePosts: overduePosts(s).map((r) => `${r.post.date} · ${r.channel?.name ?? '?'} · ${r.content.title}`),
            atRiskContent: atRiskContent(s).map((c) => `${c.title} (${c.stage})`),
            activeCampaigns: s.campaigns.filter((c) => c.start && c.end && c.start <= t && c.end >= t).map((c) => `${c.name} (${c.start} → ${c.end})`),
            nextMilestones: s.milestones.filter((m) => !m.done && m.date && m.date >= t).sort((x, y) => x.date!.localeCompare(y.date!)).slice(0, 6).map((m) => `${m.date} · ${m.name}`),
          }),
        };
      }
      if (a.report === 'pipeline') {
        return {
          data: STAGES.map((st) => ({
            stage: st.value,
            pieces: s.content
              .filter((c) => c.stage === st.value)
              .map((c) => clean({ id: c.id, title: c.title, format: c.format, next: c.posts.map((p) => p.date).filter(Boolean).sort()[0], channels: [...new Set(c.posts.map((p) => ch.get(p.channelId)))].filter(Boolean) })),
          })),
        };
      }
      if (a.report === 'cadence') {
        const ws = weekStart(t, s.settings.weekStartsMonday);
        return {
          data: [0, 1, 2, 3].map((i) => {
            const start = addDays(ws, i * 7);
            return { week: start, channels: cadenceForWeek(s, start).map((r) => clean({ channel: r.channel.name, planned: r.planned, target: r.target, met: r.target == null ? undefined : r.planned >= r.target })) };
          }),
        };
      }
      const from = a.from ? normDate(a.from)! : '0000-01-01';
      const to = a.to ? normDate(a.to)! : '9999-12-31';
      const pub = allPosts(s).filter((r) => r.post.status === 'published' && r.post.date && r.post.date >= from && r.post.date <= to);
      const group = (key: (r: (typeof pub)[number]) => string | undefined) => {
        const m = new Map<string, typeof pub>();
        for (const r of pub) {
          const k = key(r) ?? '(none)';
          m.set(k, [...(m.get(k) ?? []), r]);
        }
        return [...m.entries()].map(([k, rs]) => {
          const tot = sumMetrics(rs.map((x) => x.post));
          return clean({ name: k, posts: rs.length, views: tot.views, engagement: rs.reduce((n, x) => n + engagement(x.post.metrics), 0), clicks: tot.clicks, followersGained: tot.followersGained });
        });
      };
      const pillars = new Map(s.pillars.map((p) => [p.id, p.name]));
      return {
        data: clean({
          posts: pub.length,
          totals: sumMetrics(pub.map((r) => r.post)),
          byChannel: group((r) => r.channel?.name),
          byFormat: group((r) => r.content.format),
          byPillar: group((r) => (r.content.pillarId ? pillars.get(r.content.pillarId) : undefined)),
          topPosts: [...pub]
            .sort((x, y) => (y.post.metrics?.views ?? 0) - (x.post.metrics?.views ?? 0))
            .slice(0, 10)
            .map((r) => clean({ content: r.content.title, channel: r.channel?.name, date: r.post.date, views: r.post.metrics?.views, engagement: engagement(r.post.metrics) })),
          missingMetrics: pub.filter((r) => !r.post.metrics).length || undefined,
        }),
        summary: `Results for ${plural(pub.length, 'published post')}`,
      };
    },
  }),
];
