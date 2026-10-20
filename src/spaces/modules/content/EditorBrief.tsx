/* Content editor › Brief: concept, hook, CTA, audience, goals, specs,
   references, repurposing links and notes. */
import { useMemo } from 'react';
import { ExternalLink, Recycle, Sparkles, Users, X } from 'lucide-react';
import { navigateSpace } from '@/store/app';
import { useSpace } from '@/store/space';
import { FORMAT_BY_ID, PLATFORM_BY_ID } from '@/spaces/constants';
import { closeContent, openContent } from '@/spaces/ui';
import type { ContentFormat, ContentPiece } from '@/spaces/types';
import { Button, Combo, Field, IconButton, Input, MultiSelect, Select, Textarea } from '@/ui';
import { FormatIcon, StageBadge } from './parts';
import { findLinks, formatLabel, openUrl, patchContent, withMissing } from './shared';
import { openRepurpose } from './store';

const LENGTHS: Partial<Record<ContentFormat, string[]>> = {
  short_video: ['0:15', '0:30', '0:45', '1:00', '1:30', '3:00'],
  teaser: ['0:06', '0:10', '0:15', '0:30'],
  trailer: ['0:30', '1:00', '1:30', '2:00', '2:30'],
  long_video: ['5:00', '8:00', '10:00', '15:00', '20:00', '30:00'],
  livestream: ['30 min', '60 min', '90 min', '120 min'],
  podcast: ['20 min', '30 min', '45 min', '60 min', '90 min'],
  ad: ['0:06', '0:15', '0:30', '1:00'],
  story: ['0:15', '0:30', '1:00'],
  article: ['600 words', '1000 words', '1500 words', '2500 words'],
  newsletter: ['300 words', '600 words', '1000 words'],
  text: ['100 words', '300 words'],
  carousel: ['5 slides', '8 slides', '10 slides'],
};

const ASPECTS = ['9:16', '16:9', '4:5', '1:1', '2:3', '4:3', '2.39:1'];

export function BriefTab({ c }: { c: ContentPiece }) {
  const personas = useSpace((s) => s.personas) ?? [];
  const goals = useSpace((s) => s.goals) ?? [];
  const content = useSpace((s) => s.content) ?? [];
  const channels = useSpace((s) => s.channels) ?? [];
  const set = (patch: Partial<ContentPiece>, field: string) => patchContent(c.id, patch, field);

  const derived = useMemo(() => content.filter((x) => x.sourceId === c.id), [content, c.id]);
  const source = c.sourceId ? content.find((x) => x.id === c.sourceId) : undefined;
  const sourceOptions = useMemo(
    () =>
      withMissing(
        content
          .filter((x) => x.id !== c.id && x.sourceId !== c.id)
          .map((x) => ({ value: x.id, label: `${x.title || 'Untitled content'} · ${formatLabel(x.format)}` }))
          .sort((a, b) => a.label.localeCompare(b.label)),
        c.sourceId,
        'Deleted piece',
      ),
    [content, c.id, c.sourceId],
  );
  const persona = c.personaId ? personas.find((p) => p.id === c.personaId) : undefined;
  const fmtAspect = FORMAT_BY_ID[c.format]?.aspect;
  const platformAspects = useMemo(() => {
    const ids = new Set(c.posts.map((p) => p.channelId));
    const out: string[] = [];
    for (const ch of channels) {
      if (!ids.has(ch.id)) continue;
      const a = PLATFORM_BY_ID[ch.platform]?.aspect;
      if (a) out.push(`${PLATFORM_BY_ID[ch.platform].label} ${a}`);
    }
    return [...new Set(out)];
  }, [c.posts, channels]);
  const links = useMemo(() => findLinks(c.references), [c.references]);
  const goalOptions = useMemo(() => goals.map((g) => ({ value: g.id, label: g.title || 'Untitled goal' })), [goals]);
  const validGoalIds = (c.goalIds ?? []).filter((id) => goals.some((g) => g.id === id));

  return (
    <div className="sp-content-tab sp-content-brief">
      <section className="sp-content-sec">
        <Field label="Concept" hint="The core idea or angle in one or two sentences — why would anyone stop for this?">
          <Textarea autoGrow minRows={3} className="sp-content-concept" value={c.concept} placeholder="e.g. Three cheap lighting setups that make a tiny apartment look like a film set at night." onChange={(v) => set({ concept: v || undefined }, 'concept')} />
        </Field>
        <div className="sp-content-2col">
          <Field label="Hook" hint="The first line / the first 3 seconds">
            <Textarea autoGrow minRows={2} value={c.hook} placeholder="“You don’t need a big budget for this shot.”" onChange={(v) => set({ hook: v || undefined }, 'hook')} />
          </Field>
          <Field label="Call to action" hint="One clear next step">
            <Textarea autoGrow minRows={2} value={c.cta} placeholder="Follow for part 2 · Link in bio · Watch the full film" onChange={(v) => set({ cta: v || undefined }, 'cta')} />
          </Field>
        </div>
      </section>

      <section className="sp-content-sec">
        <h4 className="sp-content-sec-title">Audience & goals</h4>
        <div className="sp-content-2col">
          <Field label="Audience persona" hint={persona?.summary || (personas.length ? undefined : 'Describe your audiences in Strategy')}>
            {personas.length ? (
              <Select value={c.personaId ?? ''} options={withMissing(personas.map((p) => ({ value: p.id, label: p.name || 'Untitled persona' })), c.personaId, 'Deleted persona')} placeholder="Everyone / not set" onChange={(v) => set({ personaId: v || undefined }, 'persona')} />
            ) : (
              <Button
                icon={Users}
                onClick={() => {
                  closeContent();
                  navigateSpace('strategy');
                }}
              >
                Add audience personas
              </Button>
            )}
          </Field>
          <Field label="Supports goals" hint={goals.length ? undefined : 'Set measurable goals in Strategy'}>
            {goals.length ? <MultiSelect value={validGoalIds} options={goalOptions} placeholder="Add goal…" onChange={(v) => set({ goalIds: v.length ? v : undefined }, 'goals')} /> : <span className="muted small">No goals yet</span>}
          </Field>
        </div>
      </section>

      <section className="sp-content-sec">
        <h4 className="sp-content-sec-title">Specs</h4>
        <div className="sp-content-3col">
          <Field label="Target length" hint="e.g. 0:45, 8 min or 1200 words">
            <Combo value={c.length} suggestions={LENGTHS[c.format] ?? []} placeholder="0:45" onChange={(v) => set({ length: v || undefined }, 'length')} />
          </Field>
          <Field
            label="Aspect ratio"
            hint={
              fmtAspect && c.aspect !== fmtAspect ? (
                <button type="button" className="sp-content-linkbtn" onClick={() => set({ aspect: fmtAspect }, 'aspect')}>
                  <Sparkles size={11} /> Use {fmtAspect} ({formatLabel(c.format)})
                </button>
              ) : platformAspects.length ? (
                platformAspects.join(' · ')
              ) : undefined
            }
          >
            <Combo value={c.aspect} suggestions={ASPECTS} placeholder={fmtAspect ?? '16:9'} onChange={(v) => set({ aspect: v || undefined }, 'aspect')} />
          </Field>
          <Field label="Keywords" hint="Search terms, topics, SEO">
            <Input value={c.keywords} placeholder="night lighting, budget, practicals" onChange={(v) => set({ keywords: v || undefined }, 'keywords')} />
          </Field>
        </div>
      </section>

      <section className="sp-content-sec">
        <Field label="References & inspiration" hint="Links, accounts, videos to learn from — one per line">
          <Textarea autoGrow minRows={2} value={c.references} placeholder="https://…" onChange={(v) => set({ references: v || undefined }, 'references')} />
        </Field>
        {links.length > 0 && (
          <div className="sp-content-links">
            {links.map((l) => (
              <button key={l} type="button" className="sp-content-link" onClick={() => openUrl(l)} title={`Open ${l}`}>
                <ExternalLink size={12} />
                <span className="ellipsis">{l.replace(/^https?:\/\/(www\.)?/i, '')}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="sp-content-sec">
        <h4 className="sp-content-sec-title">Repurposing</h4>
        <div className="sp-content-2col">
          <Field label="Repurposed from">
            <div className="row" style={{ gap: 6 }}>
              <Select value={c.sourceId ?? ''} options={sourceOptions} placeholder="Original piece" onChange={(v) => set({ sourceId: v || undefined }, 'source')} style={{ flex: 1, minWidth: 0 }} />
              {source && <IconButton icon={ExternalLink} label="Open the original" onClick={() => openContent(source.id)} />}
              {c.sourceId && <IconButton icon={X} label="Unlink" onClick={() => set({ sourceId: undefined }, 'source')} />}
            </div>
          </Field>
          <Field label={`Made from this piece${derived.length ? ` (${derived.length})` : ''}`}>
            <div className="sp-content-derived">
              {derived.map((d) => (
                <button key={d.id} type="button" className="sp-content-derived-item" onClick={() => openContent(d.id)}>
                  <FormatIcon format={d.format} size={13} />
                  <span className="ellipsis grow">{d.title || 'Untitled content'}</span>
                  <StageBadge stage={d.stage} />
                </button>
              ))}
              <Button size="sm" icon={Recycle} onClick={() => openRepurpose(c.id)}>
                Repurpose into new pieces…
              </Button>
            </div>
          </Field>
        </div>
      </section>

      <section className="sp-content-sec">
        <Field label="Notes">
          <Textarea autoGrow minRows={3} value={c.notes} placeholder="Anything else: approvals, music licences, collaborators, ideas for later…" onChange={(v) => set({ notes: v || undefined }, 'notes')} />
        </Field>
      </section>
    </div>
  );
}
