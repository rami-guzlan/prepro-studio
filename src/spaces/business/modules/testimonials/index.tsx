/* Testimonials: what clients say, with rating, photo, permission to use it
   publicly and links to the client and project. One click copies a quote. */
import '../../biz.css';
import '../../sales.css';
import { useMemo, useState } from 'react';
import { Copy, ExternalLink, FolderKanban, MessageSquareQuote, Pencil, Plus, Star, Trash2, UserRound } from 'lucide-react';
import type { ID } from '@/types';
import { useSpace } from '@/store/space';
import { navigateSpace } from '@/store/app';
import { plural, safeFileName } from '@/lib/text';
import { exportCsv } from '@/backend';
import { AssetImage, Avatar, Button, Checkbox, Combo, DateInput, EmptyState, ExportMenu, Field, IconButton, ImageDrop, Input, Modal, ModuleHeader, SearchInput, Select, Textarea, confirmDialog, toast } from '@/ui';
import { TESTIMONIAL_PERMISSIONS } from '../../constants';
import { clientLabel } from '../../derive';
import { addItem, makeTestimonial, removeItems, updateItem } from '../../ops';
import { OptionPill, clientOptions, useBiz, useFmt, useNavParams } from '../../ui';
import type { Testimonial, TestimonialPermission } from '../../types';
import { LinkSelect, Stars, Tags, TagsInput, bizProjectOptions, copyText, openUrl, quoteText } from '../pipeline/sales-shared';

const SOURCES = ['Email', 'LinkedIn', 'Google review', 'Instagram', 'Video', 'Text message', 'Survey', 'In person', 'Other'];

export default function TestimonialsModule() {
  const b = useBiz();
  const title = useSpace((s) => s.meta.title);
  const [q, setQ] = useState('');
  const [perm, setPerm] = useState('');
  const [client, setClient] = useState('');
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [sel, setSel] = useState<ID | null>(null);

  const add = (clientId?: string) => {
    const c = clientId ? b.clients.find((x) => x.id === clientId) : undefined;
    const t = makeTestimonial({ clientId: c?.id, author: c?.name ?? '', company: c?.company });
    addItem('testimonials', t);
    setSel(t.id);
  };

  useNavParams((p) => {
    if (p.testimonialId && b.testimonials.some((t) => t.id === p.testimonialId)) setSel(p.testimonialId);
    if (p.clientId) setClient(p.clientId);
    if (p.new) add(p.clientId);
  });

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return b.testimonials
      .filter((t) => {
        if (perm && t.permission !== perm) return false;
        if (client && t.clientId !== client) return false;
        if (featuredOnly && !t.featured) return false;
        if (!s) return true;
        return [t.quote, t.author, t.role, t.company, t.source, ...(t.tags ?? [])].join(' ').toLowerCase().includes(s);
      })
      .sort((a, z) => Number(!!z.featured) - Number(!!a.featured) || (z.date ?? '').localeCompare(a.date ?? ''));
  }, [b.testimonials, q, perm, client, featuredOnly]);

  const rated = b.testimonials.filter((t) => t.rating);
  const avg = rated.length ? rated.reduce((n, t) => n + (t.rating ?? 0), 0) / rated.length : null;
  const granted = b.testimonials.filter((t) => t.permission === 'granted').length;
  const usedClients = b.clients.filter((c) => b.testimonials.some((t) => t.clientId === c.id));
  const cur = b.testimonials.find((t) => t.id === sel);

  const exportList = async () => {
    const path = await exportCsv(safeFileName(`${title} - Testimonials`), b.testimonials, [
      { header: 'Quote', value: (t) => t.quote },
      { header: 'Author', value: (t) => t.author },
      { header: 'Role', value: (t) => t.role },
      { header: 'Company', value: (t) => t.company },
      { header: 'Client', value: (t) => clientLabel(b, t.clientId) },
      { header: 'Date', value: (t) => t.date },
      { header: 'Rating', value: (t) => t.rating },
      { header: 'Source', value: (t) => t.source },
      { header: 'Link', value: (t) => t.url },
      { header: 'Permission', value: (t) => TESTIMONIAL_PERMISSIONS.find((p) => p.value === t.permission)?.label },
      { header: 'Featured', value: (t) => (t.featured ? 'yes' : '') },
      { header: 'Tags', value: (t) => (t.tags ?? []).join(', ') },
    ]);
    if (path) toast(`Exported ${plural(b.testimonials.length, 'testimonial')}`);
  };

  return (
    <div className="module biz">
      <ModuleHeader
        title="Testimonials"
        icon={MessageSquareQuote}
        subtitle={b.testimonials.length ? `${b.testimonials.length} · ${granted} OK to use publicly${avg ? ` · ★ ${avg.toFixed(1)} average` : ''}` : 'What clients say, with permission to use it'}
        actions={
          <>
            <ExportMenu
              docs={[
                { id: 'space-biz-testimonials', label: 'Testimonials sheet (approved)', options: { onlyApproved: true } },
                { id: 'space-biz-testimonials', label: 'All testimonials (internal)', options: { onlyApproved: false } },
              ]}
              csv={[{ label: 'Testimonials (CSV)', onClick: () => void exportList() }]}
            />
            <Button variant="primary" icon={Plus} onClick={() => add(client || undefined)}>
              Add testimonial
            </Button>
          </>
        }
      />
      <div className="module-body sl-page">
        {b.testimonials.length === 0 ? (
          <EmptyState
            icon={MessageSquareQuote}
            title="Collect what clients say"
            description="Paste kind words from emails, reviews and DMs, note who said it, and track whether you have permission to use it publicly. Feature the best ones — they show up in Sales Enablement, ready to copy into proposals."
            action={
              <Button variant="primary" icon={Plus} onClick={() => add()}>
                Add a testimonial
              </Button>
            }
          />
        ) : (
          <>
            <div className="sl-toolbar">
              <SearchInput value={q} onChange={setQ} placeholder="Search quotes…" width={200} />
              <Select size="sm" value={perm} placeholder="Any permission" options={TESTIMONIAL_PERMISSIONS} onChange={setPerm} aria-label="Permission" />
              {usedClients.length > 0 && <Select size="sm" value={client} placeholder="All clients" options={usedClients.map((c) => ({ value: c.id, label: clientLabel(b, c.id) }))} onChange={setClient} aria-label="Client" />}
              <Checkbox checked={featuredOnly} onChange={setFeaturedOnly} label="Featured only" />
            </div>
            {list.length === 0 ? (
              <div className="biz-empty-line">Nothing matches.</div>
            ) : (
              <div className="sl-t-grid">
                {list.map((t) => (
                  <TestimonialCard key={t.id} t={t} onOpen={() => setSel(t.id)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
      {cur && <TestimonialDialog key={cur.id} t={cur} onClose={() => setSel(null)} />}
    </div>
  );
}

function TestimonialCard({ t, onOpen }: { t: Testimonial; onOpen: () => void }) {
  const b = useBiz();
  const fmt = useFmt();
  const project = t.bizProjectId ? b.projects.find((p) => p.id === t.bizProjectId) : undefined;
  return (
    <article className={`sl-t ${t.featured ? 'featured' : ''}`}>
      <div className="sl-t-top">
        <Stars value={t.rating} />
        <div className="spacer" />
        <OptionPill value={t.permission} options={TESTIMONIAL_PERMISSIONS} />
        <IconButton icon={Star} size="sm" className={t.featured ? 'sl-star-on' : ''} label={t.featured ? 'Featured — click to unfeature' : 'Feature it'} onClick={() => updateItem('testimonials', t.id, { featured: !t.featured || undefined }, false)} />
      </div>
      <blockquote className="sl-quote" onClick={onOpen}>
        {t.quote || <span className="muted">No quote yet</span>}
      </blockquote>
      <div className="sl-t-who">
        {t.photo ? <AssetImage name={t.photo} className="sl-t-photo" /> : <Avatar name={t.author || '?'} size={34} />}
        <div className="biz-grow">
          <b className="ellipsis">{t.author || 'Unknown'}</b>
          <span className="muted small ellipsis">{[t.role, t.company].filter(Boolean).join(', ')}</span>
        </div>
      </div>
      <Tags tags={t.tags} />
      <div className="sl-res-actions">
        <Button size="sm" icon={Copy} disabled={!t.quote.trim()} onClick={() => void copyText(quoteText(t), 'Quote copied')}>
          Copy quote
        </Button>
        {t.url && <IconButton icon={ExternalLink} size="sm" label={`Open the original${t.source ? ` (${t.source})` : ''}`} onClick={() => openUrl(t.url)} />}
        {t.clientId && <IconButton icon={UserRound} size="sm" label={`Client: ${clientLabel(b, t.clientId)}`} onClick={() => navigateSpace('clients', { clientId: t.clientId })} />}
        {project && <IconButton icon={FolderKanban} size="sm" label={`Project: ${project.name}`} onClick={() => navigateSpace('projects', { projectId: project.id })} />}
        <div className="spacer" />
        <span className="muted tiny">{[t.source, t.date ? fmt.dateShort(t.date) : ''].filter(Boolean).join(' · ')}</span>
        <IconButton icon={Pencil} size="sm" label="Edit" onClick={onOpen} />
      </div>
    </article>
  );
}

function TestimonialDialog({ t, onClose }: { t: Testimonial; onClose: () => void }) {
  const b = useBiz();
  const up = (patch: Partial<Testimonial>, coalesce = true) => updateItem('testimonials', t.id, patch, coalesce);
  const isEmpty = !t.quote.trim() && !t.photo && !t.url;
  const close = () => {
    if (isEmpty) removeItems('testimonials', [t.id]);
    onClose();
  };
  const remove = async () => {
    if (await confirmDialog({ title: `Delete the testimonial from ${t.author || 'this client'}?`, message: 'You can undo with Ctrl+Z.', confirmLabel: 'Delete', danger: true })) {
      removeItems('testimonials', [t.id]);
      onClose();
    }
  };
  const pickClient = (id: string | undefined) => {
    const c = id ? b.clients.find((x) => x.id === id) : undefined;
    up({ clientId: id, ...(c && !t.author ? { author: c.name } : {}), ...(c?.company && !t.company ? { company: c.company } : {}) }, false);
  };
  return (
    <Modal
      open
      size="lg"
      onClose={close}
      title={t.author ? `Testimonial — ${t.author}` : 'New testimonial'}
      footer={
        <>
          <Button variant="ghost" icon={Trash2} onClick={() => void remove()}>
            Delete
          </Button>
          <div className="spacer" />
          <Button icon={Copy} disabled={!t.quote.trim()} onClick={() => void copyText(quoteText(t), 'Quote copied')}>
            Copy quote
          </Button>
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        </>
      }
    >
      <div className="sl-t-edit">
        <div className="sl-t-edit-photo">
          <ImageDrop value={t.photo} onChange={(v) => up({ photo: v }, false)} aspect={1} round label="Headshot or logo" maxSize={600} />
        </div>
        <div className="biz-form">
          <Field label="Quote" span="all">
            <Textarea autoFocus={!t.quote} autoGrow minRows={4} value={t.quote} placeholder="What they said, word for word" onChange={(v) => up({ quote: v })} />
          </Field>
          <Field label="Author">
            <Input value={t.author} placeholder="Name" onChange={(v) => up({ author: v })} />
          </Field>
          <Field label="Role / title">
            <Input value={t.role} placeholder="e.g. Head of Marketing" onChange={(v) => up({ role: v || undefined })} />
          </Field>
          <Field label="Company">
            <Input value={t.company} onChange={(v) => up({ company: v || undefined })} />
          </Field>
          <Field label="Client">
            <LinkSelect value={t.clientId} options={clientOptions(b, t.clientId)} onChange={pickClient} />
          </Field>
          <Field label="Project">
            <LinkSelect value={t.bizProjectId} options={bizProjectOptions(b, t.bizProjectId)} onChange={(v) => up({ bizProjectId: v }, false)} />
          </Field>
          <Field label="Date">
            <DateInput value={t.date} onChange={(v) => up({ date: v }, false)} />
          </Field>
          <Field label="Rating">
            <Stars value={t.rating} onChange={(v) => up({ rating: v }, false)} />
          </Field>
          <Field label="Permission to use publicly">
            <Select value={t.permission} options={TESTIMONIAL_PERMISSIONS} onChange={(v) => up({ permission: v as TestimonialPermission }, false)} />
          </Field>
          <Field label="Where it was given">
            <Combo suggestions={SOURCES} value={t.source} placeholder="Email, LinkedIn, Google review…" onChange={(v) => up({ source: v || undefined })} />
          </Field>
          <Field label="Link to the original">
            <Input value={t.url} placeholder="https://…" onChange={(v) => up({ url: v || undefined })} />
          </Field>
          <Field label="Tags" span={2}>
            <TagsInput value={t.tags} onChange={(tags) => up({ tags }, false)} />
          </Field>
          <Field label=" ">
            <Checkbox checked={t.featured} onChange={(v) => up({ featured: v || undefined }, false)} label="Featured (proof to send)" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
