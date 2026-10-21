/* Sales Enablement: what you send and say when selling — pitch decks, one-pagers,
   case studies, pricing, proposal templates, email templates, call scripts,
   objection handling and FAQs (resources with section 'enablement'), plus the
   proof to send (featured testimonials and portfolio) and your sales process. */
import '../../biz.css';
import '../../sales.css';
import { useMemo, useState } from 'react';
import { Compass, Copy, ExternalLink, Eye, FileText, Film, Link2, MessageSquareQuote, Pencil, Pin, PinOff, Plus, Presentation, Type } from 'lucide-react';
import type { ID } from '@/types';
import { useSpace } from '@/store/space';
import { navigateSpace } from '@/store/app';
import { plural, safeFileName } from '@/lib/text';
import { exportCsv } from '@/backend';
import { Button, Checkbox, EmptyState, ExportMenu, IconButton, ModuleHeader, SearchInput, Select, toast } from '@/ui';
import { ENABLEMENT_CATEGORIES, RESOURCE_KINDS } from '../../constants';
import { addItem, makeResource, updateItem } from '../../ops';
import { FileViewer, downloadBizFile } from '../../files';
import { useBiz, useFmt, useNavParams } from '../../ui';
import type { BizFile, BizResource } from '../../types';
import { Tags, allTags, copyText, openUrl, quoteText } from '../pipeline/sales-shared';
import { ProofThumb } from '../portfolio/parts';
import { ResourceDialog } from './ResourceDialog';

export const categoryInfo = (id?: string) => ENABLEMENT_CATEGORIES.find((c) => c.value === id) ?? { value: id || 'other', label: id || 'Other', color: '#868e96' };
const KIND_ICON = { text: Type, file: FileText, link: Link2 } as const;

export default function EnablementModule() {
  const b = useBiz();
  const title = useSpace((s) => s.meta.title);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [tag, setTag] = useState('');
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [sel, setSel] = useState<ID | null>(null);
  const [viewing, setViewing] = useState<BizFile | null>(null);

  const all = useMemo(() => b.resources.filter((r) => r.section === 'enablement'), [b.resources]);
  const tags = useMemo(() => allTags(all), [all]);

  const add = (category?: string, kind: BizResource['kind'] = 'text') => {
    const r = makeResource({ section: 'enablement', kind, category: category || undefined });
    addItem('resources', r);
    setSel(r.id);
  };

  useNavParams((p) => {
    if (p.resourceId && all.some((r) => r.id === p.resourceId)) setSel(p.resourceId);
    if (p.category) setCat(String(p.category));
    if (p.new) add(p.category);
  });

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all.filter((r) => {
      if (cat && (r.category || 'other') !== cat) return false;
      if (tag && !(r.tags ?? []).includes(tag)) return false;
      if (pinnedOnly && !r.pinned) return false;
      if (!s) return true;
      return [r.title, r.description, r.text, r.url, ...(r.tags ?? []), ...(r.files ?? []).map((f) => f.fileName)].join(' ').toLowerCase().includes(s);
    });
  }, [all, q, cat, tag, pinnedOnly]);

  const groups = useMemo(() => {
    const known = ENABLEMENT_CATEGORIES.map((c) => c.value);
    const extra = [...new Set(list.map((r) => r.category || 'other').filter((c) => !known.includes(c)))];
    return [...known, ...extra]
      .map((c) => ({ cat: categoryInfo(c), items: list.filter((r) => (r.category || 'other') === c).sort((a, z) => Number(!!z.pinned) - Number(!!a.pinned) || a.title.localeCompare(z.title)) }))
      .filter((g) => g.items.length);
  }, [list]);

  const res = all.find((r) => r.id === sel);
  const featuredT = b.testimonials.filter((t) => t.featured).sort((a, z) => Number(z.permission === 'granted') - Number(a.permission === 'granted'));
  const featuredP = b.portfolio.filter((p) => p.featured);
  const process = b.strategy.salesProcess?.trim();

  const exportList = async () => {
    const path = await exportCsv(safeFileName(`${title} - Sales enablement`), all, [
      { header: 'Title', value: (r) => r.title },
      { header: 'Category', value: (r) => categoryInfo(r.category).label },
      { header: 'Kind', value: (r) => RESOURCE_KINDS.find((k) => k.value === r.kind)?.label ?? r.kind },
      { header: 'Description', value: (r) => r.description },
      { header: 'Link', value: (r) => r.url },
      { header: 'Files', value: (r) => (r.files ?? []).map((f) => f.fileName).join('; ') },
      { header: 'Text', value: (r) => r.text },
      { header: 'Tags', value: (r) => (r.tags ?? []).join(', ') },
      { header: 'Pinned', value: (r) => (r.pinned ? 'yes' : '') },
      { header: 'Updated', value: (r) => r.updatedAt },
    ]);
    if (path) toast(`Exported ${plural(all.length, 'resource')}`);
  };

  return (
    <div className="module biz">
      <ModuleHeader
        title="Sales Enablement"
        icon={Presentation}
        subtitle={all.length ? `${plural(all.length, 'resource')} · ${all.filter((r) => r.kind === 'text').length} ready to copy` : 'Pitch decks, case studies, pricing, scripts, email templates'}
        actions={
          <>
            <ExportMenu docs={[{ id: 'space-biz-sales-kit', label: cat ? `Sales kit — ${categoryInfo(cat).label}` : 'Sales enablement kit', options: { category: cat } }]} csv={[{ label: 'Resources (CSV)', onClick: () => void exportList() }]} />
            <Button variant="primary" icon={Plus} onClick={() => add(cat)}>
              Add resource
            </Button>
          </>
        }
      />
      <div className="module-body sl-page">
        {process ? (
          <section className="sl-process">
            <div className="biz-section-head">
              <h3>Your sales process</h3>
              <div className="spacer" />
              <Button size="sm" variant="ghost" icon={Compass} onClick={() => navigateSpace('strategy')}>
                Edit in Strategy
              </Button>
            </div>
            <div className="biz-pre small">{process}</div>
          </section>
        ) : (
          <div className="biz-note">
            Write down how you sell — from first contact to signed — in{' '}
            <button type="button" className="biz-link" onClick={() => navigateSpace('strategy')}>
              Strategy → Sales process
            </button>{' '}
            and it shows here and in the printed sales kit.
          </div>
        )}

        {(featuredT.length > 0 || featuredP.length > 0) && (
          <section className="sl-proof">
            <div className="biz-section-head">
              <h3>Proof to send</h3>
              <span className="muted small">featured testimonials and work</span>
              <div className="spacer" />
              <Button size="sm" variant="ghost" icon={MessageSquareQuote} onClick={() => navigateSpace('testimonials')}>
                Testimonials
              </Button>
              <Button size="sm" variant="ghost" icon={Film} onClick={() => navigateSpace('portfolio')}>
                Portfolio
              </Button>
            </div>
            <div className="sl-strip">
              {featuredP.map((p) => (
                <div key={p.id} className="sl-strip-card work">
                  <button type="button" className="sl-strip-thumb" onClick={() => navigateSpace('portfolio', { itemId: p.id })} title="Open in Portfolio">
                    <ProofThumb item={p} />
                  </button>
                  <div className="sl-strip-row">
                    <span className="ellipsis biz-strong small">{p.title || 'Untitled'}</span>
                    {p.url && <IconButton icon={ExternalLink} size="sm" label="Open link" onClick={() => openUrl(p.url)} />}
                    {p.url && <IconButton icon={Copy} size="sm" label="Copy link" onClick={() => void copyText(p.url!, 'Link copied')} />}
                  </div>
                </div>
              ))}
              {featuredT.map((t) => (
                <div key={t.id} className="sl-strip-card quote">
                  <p className="small">“{t.quote.length > 160 ? `${t.quote.slice(0, 157)}…` : t.quote}”</p>
                  <div className="sl-strip-row">
                    <span className="ellipsis muted small">— {[t.author, t.company].filter(Boolean).join(', ')}</span>
                    {t.permission !== 'granted' && <span className="biz-tag" title="Not cleared for public use">private</span>}
                    <IconButton icon={Copy} size="sm" label="Copy quote" onClick={() => void copyText(quoteText(t), 'Quote copied')} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {all.length === 0 ? (
          <EmptyState
            icon={Presentation}
            title="Build your sales kit"
            description="Keep everything you send or say when selling in one place: your pitch deck and one-pager, pricing, proposal template, email templates and call scripts you copy with one click, objection handling and FAQs."
            action={
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Button variant="primary" icon={Type} onClick={() => add('email_template', 'text')}>
                  Add an email template
                </Button>
                <Button icon={FileText} onClick={() => add('pitch_deck', 'file')}>
                  Add a pitch deck
                </Button>
              </div>
            }
          />
        ) : (
          <>
            <div className="sl-toolbar">
              <SearchInput value={q} onChange={setQ} placeholder="Search the kit…" width={220} />
              <Select size="sm" value={cat} placeholder="All categories" options={ENABLEMENT_CATEGORIES} onChange={setCat} aria-label="Category" />
              {tags.length > 0 && <Select size="sm" value={tag} placeholder="All tags" options={tags} onChange={setTag} aria-label="Tag" />}
              <Checkbox checked={pinnedOnly} onChange={setPinnedOnly} label="Pinned only" />
            </div>
            {groups.length === 0 && <div className="biz-empty-line">Nothing matches.</div>}
            {groups.map((g) => (
              <section key={g.cat.value} className="sl-group">
                <div className="biz-section-head">
                  <i className="sl-dot" style={{ background: g.cat.color }} />
                  <h3>{g.cat.label}</h3>
                  <span className="muted small">{g.items.length}</span>
                  <div className="spacer" />
                  <IconButton icon={Plus} size="sm" label={`Add to ${g.cat.label}`} onClick={() => add(g.cat.value)} />
                </div>
                <div className="sl-res-grid">
                  {g.items.map((r) => (
                    <ResourceCard key={r.id} r={r} onOpen={() => setSel(r.id)} onView={setViewing} onTag={(t) => setTag(tag === t ? '' : t)} activeTag={tag} />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
      {res && <ResourceDialog key={res.id} r={res} onClose={() => setSel(null)} />}
      {viewing && <FileViewer file={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function ResourceCard({ r, onOpen, onView, onTag, activeTag }: { r: BizResource; onOpen: () => void; onView: (f: BizFile) => void; onTag: (t: string) => void; activeTag: string }) {
  const fmt = useFmt();
  const Icon = KIND_ICON[r.kind] ?? FileText;
  const files = r.files ?? [];
  const preview = r.kind === 'text' ? (r.text ?? '').trim() : '';
  return (
    <article className={`sl-res ${r.pinned ? 'pinned' : ''}`}>
      <div className="sl-res-head">
        <span className="sl-res-icon" title={RESOURCE_KINDS.find((k) => k.value === r.kind)?.label}>
          <Icon size={15} />
        </span>
        <button type="button" className="sl-res-title" onClick={onOpen} title="Edit">
          {r.title || <span className="muted">Untitled</span>}
        </button>
        <IconButton icon={r.pinned ? PinOff : Pin} size="sm" label={r.pinned ? 'Unpin' : 'Pin to the top'} onClick={() => updateItem('resources', r.id, { pinned: !r.pinned || undefined }, false)} />
      </div>
      {r.description && <div className="muted small sl-clamp2">{r.description}</div>}
      {preview && (
        <pre className="sl-res-text" onClick={onOpen}>
          {preview}
        </pre>
      )}
      {r.kind === 'link' && r.url && <div className="muted tiny ellipsis">{r.url}</div>}
      {r.kind === 'file' && (files.length ? <div className="muted tiny ellipsis">{files.map((f) => f.fileName).join(' · ')}</div> : <div className="muted tiny">No file attached yet</div>)}
      <Tags tags={r.tags} onClick={onTag} active={activeTag} />
      <div className="sl-res-actions">
        {r.kind === 'text' && (
          <Button size="sm" variant="primary" icon={Copy} disabled={!preview} onClick={() => void copyText(r.text ?? '', `“${r.title || 'Text'}” copied`)}>
            Copy
          </Button>
        )}
        {r.kind === 'link' && (
          <>
            <Button size="sm" icon={ExternalLink} disabled={!r.url} onClick={() => openUrl(r.url)}>
              Open
            </Button>
            <IconButton icon={Copy} size="sm" label="Copy link" disabled={!r.url} onClick={() => void copyText(r.url ?? '', 'Link copied')} />
          </>
        )}
        {r.kind === 'file' && files.length > 0 && (
          <>
            <Button size="sm" icon={Eye} onClick={() => onView(files[0])}>
              View
            </Button>
            <Button size="sm" onClick={() => void downloadBizFile(files[0])}>
              Download
            </Button>
          </>
        )}
        <div className="spacer" />
        {r.updatedAt && <span className="muted tiny">{fmt.dateShort(r.updatedAt)}</span>}
        <IconButton icon={Pencil} size="sm" label="Edit" onClick={onOpen} />
      </div>
    </article>
  );
}
