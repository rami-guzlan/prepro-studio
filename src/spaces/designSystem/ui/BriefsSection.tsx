/* Design system › Generation briefs: reusable requests for an image model / designer, with a live
   "Brief for an image model" preview (compileBrief). */
import { useEffect, useMemo, useState } from 'react';
import { Copy, CopyPlus, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { DSBrief } from '../types';
import { assetUrl } from '@/backend';
import { useSpaceData } from '@/store/space';
import { readLS, writeLS } from '@/store/app';
import { Button, Field, IconButton, Input, MultiSelect, Select, Textarea } from '@/ui';
import { copyText } from '@/spaces/modules/assets/actions';
import { compileBrief, formatSize, LEVEL_LABEL } from '../compile';
import { dsAdd, dsPatch, dsRemove, dsUpdate, dsNewId } from '../ops';
import { VERDICTS } from './options';
import { Markdown } from './Markdown';
import { SectionHead, Teach, confirmRemove, useAssets, useCampaignOptions, useDS } from './shared';

function BriefEditor({ b }: { b: DSBrief }) {
  const ds = useDS();
  const assets = useAssets();
  const campaigns = useCampaignOptions();
  const space = useSpaceData();
  const up = (patch: Partial<DSBrief>, coalesce = true) => dsPatch('briefs', b.id, patch, coalesce);
  const opt = (v: string) => v || undefined;
  const text = useMemo(() => compileBrief(space, b), [space, b]);
  const ruleOptions = useMemo(() => ds.rules.filter((r) => r.text.trim()).map((r) => ({ value: r.id, label: `[${LEVEL_LABEL[r.level].split(' ')[0]}] ${r.kind === 'dont' ? 'Don’t: ' : r.kind === 'do' ? 'Do: ' : ''}${r.text.length > 70 ? `${r.text.slice(0, 70)}…` : r.text}` })), [ds.rules]);
  const toggleRef = (id: string) => up({ referenceIds: b.referenceIds.includes(id) ? b.referenceIds.filter((x) => x !== id) : [...b.referenceIds, id] }, false);

  return (
    <div className="ds-brief-editor">
      <div className="ds-brief-form">
        <div className="row" style={{ gap: 6 }}>
          <Input className="strong grow" value={b.name} placeholder="Brief name, e.g. Podcast episode cover" aria-label="Brief name" onChange={(name) => up({ name })} />
          <IconButton
            icon={CopyPlus}
            label="Duplicate brief"
            onClick={() =>
              dsUpdate((d) => {
                const i = d.briefs.findIndex((x) => x.id === b.id);
                if (i >= 0) d.briefs.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(b)), id: dsNewId('briefs'), name: `${b.name || 'Brief'} (copy)` });
              })
            }
          />
          <IconButton
            icon={Trash2}
            label="Delete brief"
            onClick={async () => {
              if (await confirmRemove(`the brief “${b.name || 'Untitled'}”`, true)) dsRemove('briefs', [b.id]);
            }}
          />
        </div>
        <div className="ds-grid-2">
          <Field label="Objective" span="all">
            <Textarea autoGrow minRows={2} value={b.objective} placeholder="What the image must achieve" onChange={(v) => up({ objective: opt(v) })} />
          </Field>
          <Field label="Audience">
            <Input value={b.audience} placeholder={ds.intent.audience || 'Defaults to the brand audience'} onChange={(v) => up({ audience: opt(v) })} />
          </Field>
          <Field label="Format" hint={ds.formats.length ? undefined : 'Add formats in the Formats section'}>
            <Select value={b.formatId ?? ''} options={ds.formats.map((f) => ({ value: f.id, label: `${f.name || 'Untitled'}${formatSize(f) ? ` · ${formatSize(f)}` : ''}` }))} placeholder="Choose…" onChange={(v) => up({ formatId: v || undefined }, false)} />
          </Field>
          <Field label="Exact copy" span="all" hint="Placed in finishing — never rendered as generated text">
            <Textarea autoGrow minRows={2} value={b.copy} placeholder={'e.g. EPISODE 42\nWhy onboarding fails'} onChange={(v) => up({ copy: opt(v) })} />
          </Field>
          <Field label="Rules that apply" span="all" hint={b.ruleIds.length ? undefined : 'None picked: the brief uses every required brand rule'}>
            {ruleOptions.length ? <MultiSelect value={b.ruleIds} options={ruleOptions} placeholder="Add rule…" onChange={(ruleIds) => up({ ruleIds }, false)} /> : <span className="muted small">No rules yet — add them in the Rules section.</span>}
          </Field>
          <Field label="References" span="all">
            {ds.references.length ? (
              <div className="ds-brief-refs">
                {ds.references.map((r) => {
                  const a = assets.find((x) => x.id === r.assetId);
                  const on = b.referenceIds.includes(r.id);
                  return (
                    <button key={r.id} type="button" className={`ds-brief-ref ${on ? 'on' : ''} verdict-${r.verdict}`} aria-pressed={on} title={`${r.title || a?.name || 'Reference'} — ${VERDICTS.find((v) => v.value === r.verdict)?.label}${r.roles.length ? ` · controls ${r.roles.join(', ')}` : ''}`} onClick={() => toggleRef(r.id)}>
                      {a?.image ? <img src={assetUrl(a.image)} alt="" draggable={false} /> : <span className="ds-brief-ref-none" />}
                      <span className="ellipsis">{r.title || a?.name || 'Reference'}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <span className="muted small">No references yet — add them in the References section.</span>
            )}
          </Field>
          <Field label="May vary">
            <Textarea autoGrow minRows={2} value={b.variation} placeholder="e.g. subject, crop, time of day" onChange={(v) => up({ variation: opt(v) })} />
          </Field>
          <Field label="Extra review points">
            <Textarea autoGrow minRows={2} value={b.review} placeholder="e.g. the guest must be recognisable at thumbnail size" onChange={(v) => up({ review: opt(v) })} />
          </Field>
          <Field label="Finishing" hint={ds.review.finishing ? 'Empty: uses the finishing workflow from Review & finishing' : undefined}>
            <Textarea autoGrow minRows={2} value={b.finishing} placeholder="What is placed over the art afterwards (logo, exact text)" onChange={(v) => up({ finishing: opt(v) })} />
          </Field>
          <Field label="Campaign">
            <Select value={b.campaignId ?? ''} options={campaigns} placeholder={campaigns.length ? 'Any / brand-wide' : 'No campaigns yet'} onChange={(v) => up({ campaignId: v || undefined }, false)} />
          </Field>
        </div>
      </div>
      <div className="ds-brief-preview">
        <div className="ds-brief-preview-head">
          <Sparkles size={14} />
          <b>Brief for an image model</b>
          <div className="spacer" />
          <Button size="sm" icon={Copy} onClick={() => copyText(text, 'the brief')}>
            Copy
          </Button>
        </div>
        <Markdown text={text} className="ds-brief-md" />
      </div>
    </div>
  );
}

export function BriefsSection() {
  const ds = useDS();
  const [sel, setSel] = useState<string | null>(() => readLS<string | null>('prepro.ds.brief', null));
  const select = (id: string | null) => {
    setSel(id);
    writeLS('prepro.ds.brief', id);
  };
  const cur = ds.briefs.find((b) => b.id === sel) ?? ds.briefs[0];
  useEffect(() => {
    if (sel && !ds.briefs.some((b) => b.id === sel) && ds.briefs[0]) setSel(ds.briefs[0].id);
  }, [ds.briefs, sel]);
  const add = () => select(dsAdd('briefs', { name: `Brief ${ds.briefs.length + 1}`, ruleIds: [], referenceIds: [] }));
  return (
    <div className="ds-section">
      <SectionHead
        icon={Sparkles}
        title="Generation briefs"
        intro="Reusable requests for an image model or a designer: objective, format, exact copy, which rules and references apply, what may vary and how it is finished. The preview is exactly what an agent gets."
        actions={
          ds.briefs.length > 0 && (
            <Button icon={Plus} onClick={add}>
              New brief
            </Button>
          )
        }
      />
      {ds.briefs.length === 0 ? (
        <div className="ds-card">
          <Teach
            icon={Sparkles}
            title="Save the requests you make again and again"
            actions={
              <Button variant="primary" icon={Plus} onClick={add}>
                New brief
              </Button>
            }
          >
            Episode covers, quote cards, event banners … A brief bundles the format, the exact copy (placed afterwards, never generated), the rules and references that apply and what may change between versions. The rest of the design system fills in the art direction automatically.
          </Teach>
        </div>
      ) : (
        <div className="ds-briefs">
          <div className="ds-brief-list" role="listbox" aria-label="Briefs">
            {ds.briefs.map((b) => {
              const f = ds.formats.find((x) => x.id === b.formatId);
              return (
                <button key={b.id} type="button" role="option" aria-selected={cur?.id === b.id} className={cur?.id === b.id ? 'on' : ''} onClick={() => select(b.id)}>
                  <b className="ellipsis">{b.name || 'Untitled brief'}</b>
                  <span className="muted small ellipsis">{[f?.name, b.objective].filter(Boolean).join(' · ') || 'No objective yet'}</span>
                </button>
              );
            })}
          </div>
          {cur && <BriefEditor key={cur.id} b={cur} />}
        </div>
      )}
    </div>
  );
}
