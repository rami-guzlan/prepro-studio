/* Design system › References: annotated reference images — what each one controls (roles), what to borrow
   and ignore, and a verdict (on brand / near miss / off brand) with the reason. */
import { useMemo, useState } from 'react';
import { ImagePlus, Images, Plus, Upload } from 'lucide-react';
import type { ID } from '@/types';
import type { DSReference, DSReferenceRole } from '../types';
import { assetUrl } from '@/backend';
import { asOneSpaceStep } from '@/store/space';
import { Button, Field, Input, Popover, Select, Tabs, Textarea, type AnchorRect } from '@/ui';
import { REFERENCE_ROLE_HINT } from '../compile';
import { dsMove, dsNewId, dsPatch, dsRemove, dsUpdate } from '../ops';
import { REF_ROLES, VERDICTS } from './options';
import { AssetPick, ItemActions, SectionHead, Teach, VerdictSelect, confirmRemove, uploadImageAssets, useCampaignOptions, useDS, useImageAssets, useImageDrop } from './shared';

type Filter = 'all' | DSReference['verdict'];

function addRefs(assetIds: (ID | undefined)[], verdict: DSReference['verdict'] = 'on_brand'): ID[] {
  const ids: ID[] = [];
  dsUpdate((ds) => {
    for (const assetId of assetIds) {
      const id = dsNewId('references');
      ids.push(id);
      ds.references.push({ id, title: '', roles: [], verdict, ...(assetId ? { assetId } : {}) });
    }
  });
  return ids;
}

function RefCard({ r, index, count, campaigns }: { r: DSReference; index: number; count: number; campaigns: { value: string; label: string }[] }) {
  const up = (patch: Partial<DSReference>, coalesce = true) => dsPatch('references', r.id, patch, coalesce);
  const opt = (v: string) => v || undefined;
  const toggleRole = (role: DSReferenceRole) => up({ roles: r.roles.includes(role) ? r.roles.filter((x) => x !== role) : [...r.roles, role] }, false);
  return (
    <div className={`ds-ref verdict-${r.verdict}`} data-ds-id={r.id}>
      <div className="ds-ref-img">
        <AssetPick value={r.assetId} onChange={(assetId) => up({ assetId }, false)} label="Pick or drop the image" />
        <div className="ds-ref-verdict">
          <VerdictSelect value={r.verdict} onChange={(verdict) => up({ verdict }, false)} />
        </div>
      </div>
      <div className="ds-ref-body">
        <div className="row" style={{ gap: 4 }}>
          <Input size="sm" className="strong grow" value={r.title} placeholder="Title, e.g. Cover of the 2025 report" aria-label="Title" onChange={(title) => up({ title })} />
          <ItemActions
            index={index}
            count={count}
            onMove={(a, b) => dsMove('references', a, b)}
            label="reference"
            onDelete={async () => {
              if (await confirmRemove('this reference', !!(r.title || r.borrow || r.why))) dsRemove('references', [r.id]);
            }}
          />
        </div>
        <div className="ds-roles" role="group" aria-label="What it controls">
          {REF_ROLES.map((x) => (
            <button key={x.value} type="button" className={`ds-role ${r.roles.includes(x.value) ? 'on' : ''}`} aria-pressed={r.roles.includes(x.value)} title={`${x.label}: ${REFERENCE_ROLE_HINT[x.value]}`} onClick={() => toggleRole(x.value)}>
              {x.label}
            </button>
          ))}
        </div>
        {r.roles.length > 0 && <div className="ds-ref-hint muted small">{r.roles.map((x) => REFERENCE_ROLE_HINT[x]).join('; ')}</div>}
        <Field label="Borrow">
          <Textarea autoGrow minRows={1} value={r.borrow} placeholder="What to take from it" onChange={(v) => up({ borrow: opt(v) })} />
        </Field>
        <Field label="Ignore">
          <Textarea autoGrow minRows={1} value={r.ignore} placeholder="What NOT to take from it" onChange={(v) => up({ ignore: opt(v) })} />
        </Field>
        <Field label={r.verdict === 'on_brand' ? 'Why it is on brand' : 'Why it is not us'}>
          <Textarea autoGrow minRows={1} value={r.why} placeholder={r.verdict === 'near_miss' ? 'e.g. right mood, but the gradient and centred type are not ours' : 'The reason, in one line'} onChange={(v) => up({ why: opt(v) })} />
        </Field>
        <div className="row wrap" style={{ gap: 6 }}>
          <Select size="sm" value={r.mode ?? 'any'} options={[{ value: 'any', label: 'Light or dark' }, { value: 'light', label: 'Light mode' }, { value: 'dark', label: 'Dark mode' }]} aria-label="Mode" onChange={(v) => up({ mode: v === 'any' ? undefined : (v as 'light' | 'dark') }, false)} />
          {campaigns.length > 0 && <Select size="sm" value={r.campaignId ?? ''} options={campaigns} placeholder="All campaigns" aria-label="Campaign" onChange={(v) => up({ campaignId: v || undefined }, false)} />}
        </div>
      </div>
    </div>
  );
}

export function ReferencesSection() {
  const ds = useDS();
  const campaigns = useCampaignOptions();
  const images = useImageAssets();
  const [filter, setFilter] = useState<Filter>('all');
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const used = useMemo(() => new Set(ds.references.map((r) => r.assetId).filter(Boolean)), [ds.references]);
  const verdict: DSReference['verdict'] = filter === 'all' ? 'on_brand' : filter;
  const drop = useImageDrop((ids) => addRefs(ids, verdict));
  const list = ds.references.map((r, index) => ({ r, index })).filter(({ r }) => filter === 'all' || r.verdict === filter);
  const tabs = [{ id: 'all' as Filter, label: 'All', count: ds.references.length }, ...VERDICTS.map((v) => ({ id: v.value as Filter, label: v.label, count: ds.references.filter((r) => r.verdict === v.value).length }))];

  const upload = () =>
    void asOneSpaceStep(async () => {
      const ids = await uploadImageAssets(true);
      if (ids.length) addRefs(ids, verdict);
    });

  const addButtons = (
    <>
      <Button
        icon={Images}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAnchor({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
        }}
      >
        From brand kit…
      </Button>
      <Button icon={Upload} onClick={upload}>
        Upload images…
      </Button>
      <Button variant="ghost" icon={Plus} onClick={() => addRefs([undefined], verdict)}>
        Empty reference
      </Button>
    </>
  );

  return (
    <div className="ds-section">
      <SectionHead
        icon={Images}
        title="References"
        intro="Annotated examples. Each one says what it controls — style, composition, an exact asset, a campaign, mood, colour or typography — so “inspiration” never means “copy everything”. Near misses and off-brand examples teach as much as good ones."
        actions={ds.references.length > 0 ? addButtons : undefined}
      />
      {ds.references.length > 0 && <Tabs<Filter> tabs={tabs} value={filter} onChange={setFilter} />}
      <div className={`ds-refs ${drop.over ? 'over' : ''}`} {...drop.props}>
        {ds.references.length === 0 ? (
          <div className="ds-card" style={{ gridColumn: '1 / -1' }}>
            <Teach icon={Images} title="Show, then say what to take" actions={addButtons}>
              Add finished work you are proud of (on brand), attractive work that is not quite you (near misses — say why), and what you never do (off brand). Tick what each reference controls; hover a role to see what it means. Drop images anywhere here.
            </Teach>
          </div>
        ) : (
          list.map(({ r, index }) => <RefCard key={r.id} r={r} index={index} count={filter === 'all' ? ds.references.length : 1} campaigns={campaigns} />)
        )}
        {ds.references.length > 0 && (
          <button type="button" className="ds-ref-add" onClick={upload}>
            <ImagePlus size={20} />
            <span>{drop.over ? 'Drop to add references' : `Drop images or click to add ${VERDICTS.find((v) => v.value === verdict)?.label.toLowerCase()} references`}</span>
          </button>
        )}
      </div>
      <Popover anchor={anchor} onClose={() => setAnchor(null)}>
        <div className="ds-pickpop">
          <b className="small">Click images to add them as references</b>
          {images.length ? (
            <div className="ds-pickgrid">
              {images.map((a) => (
                <button key={a.id} type="button" className={used.has(a.id) ? 'used' : ''} title={`${a.name || 'Untitled'}${used.has(a.id) ? ' (already a reference)' : ''}`} onClick={() => addRefs([a.id], verdict)}>
                  <img src={assetUrl(a.image)} alt={a.name ?? ''} draggable={false} />
                </button>
              ))}
            </div>
          ) : (
            <p className="muted small" style={{ margin: '8px 0 0' }}>
              No images in the brand kit yet — upload some.
            </p>
          )}
        </div>
      </Popover>
    </div>
  );
}
