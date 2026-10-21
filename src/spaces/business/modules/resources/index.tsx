/* Resources: the commonly needed assets of the business to pull from in one
   click — brand assets, templates, contracts & forms, checklists, guides, tool
   links, finance docs. Text resources copy to the clipboard, links open in the
   browser, files open / download (drop files anywhere to add them). Pin the ones
   you use most. Sales enablement material can be shown alongside (read-only). */
import '../../biz.css';
import '../../library.css';
import { useMemo, useState } from 'react';
import { ClipboardCopy, Download, ExternalLink, FileText, Library, Link2, Paperclip, Pin, PinOff, Plus, Presentation, Trash2, Type, Upload } from 'lucide-react';
import { useSpace } from '@/store/space';
import { navigateSpace, readLS, writeLS } from '@/store/app';
import { exportCsv } from '@/backend';
import { plural, safeFileName } from '@/lib/text';
import { todayISO } from '@/lib/dates';
import { Button, Combo, EmptyState, ExportMenu, Field, IconButton, Input, Menu, Modal, ModuleHeader, SearchInput, Select, Switch, Textarea, confirmDialog, toast } from '@/ui';
import { copyText, openUrl } from '@/spaces/modules/assets/actions';
import { useFileDrop } from '@/spaces/modules/assets/resources';
import { ENABLEMENT_CATEGORIES, LIBRARY_CATEGORIES, RESOURCE_KINDS } from '../../constants';
import { addItem, makeResource, removeItems, updateItem } from '../../ops';
import { FileBox, FileViewer, downloadBizFile, droppedFiles, pickFiles } from '../../files';
import { Pill, rowKeys, useBiz, useNavParams } from '../../ui';
import type { BizFile, BizResource, ResourceKind } from '../../types';

const catInfo = (r: BizResource) => {
  const list = r.section === 'enablement' ? ENABLEMENT_CATEGORIES : LIBRARY_CATEGORIES;
  const o = list.find((c) => c.value === r.category);
  return { id: r.category || 'other', label: o?.label ?? (r.category || 'Other'), color: o?.color ?? '#868e96' };
};

const KIND_ICON = { text: Type, file: Paperclip, link: Link2 } as const;

export default function ResourcesModule() {
  const b = useBiz();
  const spaceId = useSpace((s) => s.id);
  const title = useSpace((s) => s.meta.title);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [withSales, setWithSales] = useState(() => readLS<boolean>(`prepro.biz.res.sales.${spaceId}`, false));
  const [editing, setEditing] = useState<string | null>(null);
  const [viewing, setViewing] = useState<BizFile | null>(null);

  const create = (kind: ResourceKind, patch: Partial<BizResource> = {}) => {
    const r = makeResource({ title: patch.title ?? `New ${kind === 'text' ? 'text snippet' : kind === 'link' ? 'link' : 'file'}`, kind, section: 'library', category: cat || (kind === 'link' ? 'tool' : kind === 'text' ? 'template' : 'brand'), ...patch });
    addItem('resources', r);
    setEditing(r.id);
    return r;
  };
  const addFilesResource = async () => {
    const files = await pickFiles('Add files to Resources');
    if (files.length) create('file', { title: files[0].fileName.replace(/\.[^.]+$/, ''), files });
  };
  const drop = useFileDrop(async (fs) => {
    const files = await droppedFiles(fs);
    if (!files.length) return;
    for (const f of files) addItem('resources', makeResource({ title: f.fileName.replace(/\.[^.]+$/, ''), kind: 'file', section: 'library', category: cat || 'other', files: [f] }));
    toast(`Added ${plural(files.length, 'file')} to Resources`);
  });
  useNavParams((p) => {
    const r = p.resourceId ? b.resources.find((x) => x.id === p.resourceId) : undefined;
    if (r?.section === 'enablement') navigateSpace('enablement', { resourceId: r.id });
    else if (r) setEditing(r.id);
    if (p.new) create((p.kind as ResourceKind) || 'text');
  });

  const all = useMemo(() => b.resources.filter((r) => r.section === 'library' || withSales), [b.resources, withSales]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all.filter((r) => (!cat || (r.category || 'other') === cat) && (!s || [r.title, r.description, r.text, r.url, ...(r.tags ?? []), ...(r.files ?? []).map((f) => f.fileName)].join(' ').toLowerCase().includes(s)));
  }, [all, q, cat]);
  const pinned = shown.filter((r) => r.pinned);
  const groups = useMemo(() => {
    const m = new Map<string, { label: string; color: string; items: BizResource[] }>();
    for (const r of shown) {
      const c = catInfo(r);
      const key = r.section === 'enablement' ? `sales:${c.id}` : c.id;
      const g = m.get(key) ?? { label: r.section === 'enablement' ? `Sales · ${c.label}` : c.label, color: c.color, items: [] };
      g.items.push(r);
      m.set(key, g);
    }
    const order = (k: string) => {
      const i = LIBRARY_CATEGORIES.findIndex((c) => c.value === k);
      return k.startsWith('sales:') ? 100 + ENABLEMENT_CATEGORIES.findIndex((c) => `sales:${c.value}` === k) : i < 0 ? 50 : i;
    };
    return [...m.entries()].sort(([a], [z]) => order(a) - order(z));
  }, [shown]);
  const lib = b.resources.filter((r) => r.section === 'library');
  const salesCount = b.resources.length - lib.length;
  const usedCats = [...new Set(all.map((r) => r.category || 'other'))];
  const cur = editing ? b.resources.find((r) => r.id === editing) : undefined;

  const exportList = async () => {
    const path = await exportCsv(safeFileName(`${title} - Resources`), all, [
      { header: 'Title', value: (x) => x.title },
      { header: 'Section', value: (x) => (x.section === 'enablement' ? 'Sales enablement' : 'Library') },
      { header: 'Category', value: (x) => catInfo(x).label },
      { header: 'Kind', value: (x) => RESOURCE_KINDS.find((k) => k.value === x.kind)?.label },
      { header: 'Link', value: (x) => x.url },
      { header: 'Files', value: (x) => (x.files ?? []).map((f) => f.fileName).join('; ') },
      { header: 'Description', value: (x) => x.description },
      { header: 'Tags', value: (x) => (x.tags ?? []).join(', ') },
      { header: 'Pinned', value: (x) => (x.pinned ? 'yes' : '') },
      { header: 'Updated', value: (x) => x.updatedAt },
      { header: 'Text', value: (x) => x.text },
    ]);
    if (path) toast(`Exported ${plural(all.length, 'resource')}`);
  };

  const addMenu = [
    { label: 'Text to copy (template, snippet)', icon: Type, onClick: () => void create('text') },
    { label: 'Link (tool, folder, brand page)', icon: Link2, onClick: () => void create('link') },
    { label: 'File(s)…', icon: Upload, onClick: () => void addFilesResource() },
  ];

  return (
    <div className={`module biz ${drop.over ? 'biz-dropping' : ''}`} {...drop.props}>
      <ModuleHeader
        title="Resources"
        icon={Library}
        subtitle={lib.length ? `${plural(lib.length, 'resource')} · ${lib.filter((r) => r.pinned).length} pinned` : 'Templates, brand assets, files and links you reuse'}
        actions={
          <>
            <ExportMenu
              docs={[
                { id: 'space-biz-resources', label: 'Resource index (PDF)' },
                { id: 'space-biz-resources', label: 'Library + sales enablement', options: { section: 'all' } },
              ]}
              csv={[{ label: 'Resources (CSV)', onClick: () => void exportList() }]}
            />
            <Menu align="end" trigger={<Button variant="primary" icon={Plus}>Add resource</Button>} items={addMenu} />
          </>
        }
      />
      {lib.length === 0 && !withSales ? (
        <EmptyState
          icon={Library}
          title="Keep what you reuse one click away"
          description="Logos and brand guidelines, email and proposal templates, contract forms, checklists, tax documents and the links to your tools. Text copies to the clipboard in one click; drop files anywhere on this screen to add them."
          action={
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button variant="primary" icon={Type} onClick={() => void create('text')}>
                Add a text template
              </Button>
              <Button icon={Upload} onClick={() => void addFilesResource()}>
                Add files
              </Button>
              <Button icon={Link2} onClick={() => void create('link')}>
                Add a link
              </Button>
              {salesCount > 0 && (
                <Button variant="ghost" icon={Presentation} onClick={() => setWithSales(true)}>
                  Show sales enablement ({salesCount})
                </Button>
              )}
            </div>
          }
        />
      ) : (
        <div className="biz-page">
          <div className="lib-toolbar">
            <SearchInput value={q} onChange={setQ} placeholder="Search titles, text, tags, files…" width={260} />
            <span className="muted tiny lib-hide-narrow">Tip: drop files anywhere here to add them</span>
            <Select size="sm" value={cat} placeholder="All categories" options={[...LIBRARY_CATEGORIES.filter((c) => usedCats.includes(c.value) || c.value === cat), ...(withSales ? ENABLEMENT_CATEGORIES.filter((c) => usedCats.includes(c.value) && !LIBRARY_CATEGORIES.some((l) => l.value === c.value)) : [])]} onChange={setCat} aria-label="Category" />
            <span className="spacer" />
            <Switch
              checked={withSales}
              onChange={(v) => {
                setWithSales(v);
                writeLS(`prepro.biz.res.sales.${spaceId}`, v);
              }}
              label={`Include sales enablement${salesCount ? ` (${salesCount})` : ''}`}
            />
          </div>
          
          {pinned.length > 0 && (
            <section className="lib-section">
              <div className="biz-section-head">
                <h3>
                  <Pin size={13} /> Pinned
                </h3>
              </div>
              <div className="lib-pinned">
                {pinned.map((r) => (
                  <ResourceCard key={r.id} r={r} compact onEdit={() => setEditing(r.id)} onView={setViewing} />
                ))}
              </div>
            </section>
          )}

          {groups.length === 0 ? (
            <div className="biz-empty-line">Nothing matches.</div>
          ) : (
            groups.map(([key, g]) => (
              <section key={key} className="lib-section">
                <div className="biz-section-head">
                  <Pill color={g.color}>{g.label}</Pill>
                  <span className="muted tiny">{g.items.length}</span>
                  {key.startsWith('sales:') && (
                    <button type="button" className="biz-link small" onClick={() => navigateSpace('enablement')}>
                      Edit in Sales Enablement
                    </button>
                  )}
                </div>
                <div className="biz-cards">
                  {g.items.map((r) => (
                    <ResourceCard key={r.id} r={r} onEdit={() => (r.section === 'enablement' ? navigateSpace('enablement', { resourceId: r.id }) : setEditing(r.id))} onView={setViewing} />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      )}
      {drop.over && <div className="biz-drop-hint">Drop to add to Resources</div>}
      {cur && <ResourceEditor r={cur} onClose={() => setEditing(null)} />}
      {viewing && <FileViewer file={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

/* ---------------------------------------------------------------- card */

function ResourceCard({ r, compact, onEdit, onView }: { r: BizResource; compact?: boolean; onEdit: () => void; onView: (f: BizFile) => void }) {
  const c = catInfo(r);
  const Icon = KIND_ICON[r.kind] ?? FileText;
  const sales = r.section === 'enablement';
  const files = r.files ?? [];
  const primary =
    r.kind === 'text' ? (
      <Button size="sm" icon={ClipboardCopy} disabled={!r.text?.trim()} onClick={() => void copyText(r.text ?? '', `“${r.title || 'text'}”`)}>
        Copy
      </Button>
    ) : r.kind === 'link' ? (
      <Button size="sm" icon={ExternalLink} disabled={!r.url?.trim()} onClick={() => openUrl(r.url)}>
        Open
      </Button>
    ) : files.length ? (
      <>
        <Button size="sm" icon={FileText} onClick={() => onView(files[0])}>
          {files.length > 1 ? `Open (${files.length})` : 'Open'}
        </Button>
        <IconButton icon={Download} size="sm" label={`Download ${files[0].fileName}`} onClick={() => void downloadBizFile(files[0])} />
      </>
    ) : (
      <span className="muted tiny">No file yet</span>
    );
  return (
    <div className={`lib-res ${compact ? 'compact' : ''}`} style={{ ['--rc' as string]: c.color }}>
      <div className="lib-res-main" role="button" onClick={onEdit} {...rowKeys(onEdit)} title={sales ? 'Open in Sales Enablement' : 'Edit'}>
        <span className="lib-res-icon">
          <Icon size={15} />
        </span>
        <div className="biz-grow">
          <span className="biz-strong ellipsis">{r.title || 'Untitled'}</span>
          {!compact && (r.description || r.kind === 'link') && <span className="muted small lib-res-desc">{r.description || r.url}</span>}
          {!compact && r.kind === 'text' && !r.description && r.text && <span className="muted small lib-res-desc">{r.text.slice(0, 140)}</span>}
          {!compact && r.kind === 'file' && files.length > 0 && !r.description && <span className="muted small lib-res-desc">{files.map((f) => f.fileName).join(', ')}</span>}
        </div>
      </div>
      {!compact && ((r.tags?.length ?? 0) > 0 || sales) && (
        <div className="lib-tags">
          {sales && <span className="lib-tag sales">Sales</span>}
          {(r.tags ?? []).map((t) => (
            <span key={t} className="lib-tag">
              {t}
            </span>
          ))}
        </div>
      )}
      <div className="lib-res-actions">
        {primary}
        <span className="spacer" />
        {!sales && <IconButton icon={r.pinned ? PinOff : Pin} size="sm" label={r.pinned ? 'Unpin' : 'Pin to the top'} onClick={() => updateItem('resources', r.id, { pinned: !r.pinned || undefined }, false)} />}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- editor */

function ResourceEditor({ r, onClose }: { r: BizResource; onClose: () => void }) {
  const b = useBiz();
  const up = (patch: Partial<BizResource>, coalesce = true) => updateItem('resources', r.id, { ...patch, updatedAt: todayISO() }, coalesce);
  const [tags, setTags] = useState((r.tags ?? []).join(', '));
  const sops = b.sops.filter((s) => s.resourceIds.includes(r.id));
  const sales = r.section === 'enablement';
  const remove = async () => {
    if (await confirmDialog({ title: `Delete “${r.title || 'this resource'}”?`, message: `${r.files?.length ? `${plural(r.files.length, 'file')} are removed with it. ` : ''}${sops.length ? `It is unlinked from ${plural(sops.length, 'procedure')}. ` : ''}You can undo with Ctrl+Z.`, confirmLabel: 'Delete', danger: true })) {
      removeItems('resources', [r.id]);
      onClose();
    }
  };
  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={sales ? 'Sales enablement resource' : 'Resource'}
      footer={
        <>
          <Button variant="danger" icon={Trash2} onClick={() => void remove()}>
            Delete
          </Button>
          <div className="spacer" />
          {r.kind === 'text' && (
            <Button icon={ClipboardCopy} disabled={!r.text?.trim()} onClick={() => void copyText(r.text ?? '', `“${r.title || 'text'}”`)}>
              Copy text
            </Button>
          )}
          {r.kind === 'link' && (
            <Button icon={ExternalLink} disabled={!r.url?.trim()} onClick={() => openUrl(r.url)}>
              Open link
            </Button>
          )}
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="biz-form lib-res-form">
        <Field label="Title" span="all">
          <Input autoFocus value={r.title} placeholder="e.g. Welcome email, Logo pack, Brand guidelines" onChange={(v) => up({ title: v })} />
        </Field>
        <Field label="Kind">
          <Select value={r.kind} options={RESOURCE_KINDS} onChange={(v) => up({ kind: v as ResourceKind }, false)} />
        </Field>
        <Field label="Category">
          <Select value={r.category ?? ''} placeholder="—" options={sales ? ENABLEMENT_CATEGORIES : LIBRARY_CATEGORIES} onChange={(v) => up({ category: v || undefined }, false)} />
        </Field>
        <Field label="Section">
          <Select value={r.section} options={[{ value: 'library', label: 'Resources (library)' }, { value: 'enablement', label: 'Sales Enablement' }]} onChange={(v) => up({ section: v as BizResource['section'] }, false)} />
        </Field>
        <Field label="Description" span="all">
          <Input value={r.description} placeholder="What it is / when to use it" onChange={(v) => up({ description: v || undefined })} />
        </Field>
        {r.kind === 'link' && (
          <Field label="Link" span="all">
            <div className="row" style={{ gap: 4 }}>
              <Input value={r.url} placeholder="https://…" onChange={(v) => up({ url: v || undefined })} />
              <IconButton icon={ExternalLink} label="Open link" disabled={!r.url?.trim()} onClick={() => openUrl(r.url)} />
            </div>
          </Field>
        )}
        {r.kind === 'text' && (
          <Field label="Text" span="all" hint="Use placeholders like [Client name] — copy, paste and fill in.">
            <Textarea autoGrow minRows={8} className="lib-res-text" value={r.text} placeholder="Paste or write the template…" onChange={(v) => up({ text: v || undefined })} />
          </Field>
        )}
        {r.kind === 'file' && (
          <div className="span-all">
            <FileBox target={{ list: 'resources', id: r.id, field: 'files' }} files={r.files} label="Files" empty="Drop files here or click Attach (logos, PDFs, templates, fonts …)" />
          </div>
        )}
        <Field label="Tags" span="all" hint="comma separated">
          <Combo
            value={tags}
            suggestions={[...new Set(b.resources.flatMap((x) => x.tags ?? []))]}
            onChange={(v) => {
              setTags(v);
              up({ tags: v.split(',').map((t) => t.trim()).filter(Boolean).length ? [...new Set(v.split(',').map((t) => t.trim()).filter(Boolean))] : undefined });
            }}
          />
        </Field>
        <Field label=" ">
          <Switch checked={r.pinned} onChange={(v) => up({ pinned: v || undefined }, false)} label="Pinned to the top" />
        </Field>
        {sops.length > 0 && (
          <Field label="Used in" span="all">
            <div className="lib-chips">
              {sops.map((s) => (
                <button key={s.id} type="button" className="lib-chip" onClick={() => navigateSpace('sops', { sopId: s.id })}>
                  {s.title || 'Untitled'}
                </button>
              ))}
            </div>
          </Field>
        )}
      </div>
    </Modal>
  );
}
