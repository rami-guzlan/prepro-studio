/* Brand Kit & Assets — logos, colours, fonts, references, templates, media and
   links of the space, plus a read-only view of the brand voice from Strategy. */
import './assets.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, FilePlus2, FileText, Film, ImagePlus, LayoutTemplate, Link2, Loader2, Music, Palette, Plus, Quote, Shapes, Type, Upload, X } from 'lucide-react';
import type { ID } from '@/types';
import type { AssetKind, BrandAsset } from '@/spaces/types';
import { ASSET_KINDS } from '@/spaces/constants';
import { getSpace, useSpace } from '@/store/space';
import { navigateSpace, readLS, writeLS } from '@/store/app';
import { useCommand } from '@/lib/commands';
import { matchesQuery, plural, safeFileName } from '@/lib/text';
import { backend, exportCsv, importDroppedImages, pickImages } from '@/backend';
import { isImageFile } from '@/lib/images';
import { Button, ExportMenu, Input, isModalOpen, Menu, ModuleHeader, SearchInput, toast, Toolbar, type MenuItem } from '@/ui';
import { addAssets, addColor, addImageAssets, copyText, makeAsset } from './actions';
import { AssetEditor, ImageLightbox } from './editors';
import { ColorsGrid, FileList, FontsList, ImagesGallery, LinksSection, LogosGrid, SectionShell, type TileHandlers } from './sections';
import { ResourceModal, addResourcePlaceholder, dropResources, pickResources } from './resources';
import { assetsOfSection, inkOn, keyMessageLines, normalizeHex, SECTIONS, type SectionId } from './util';

const kindLabel = (k: AssetKind) => ASSET_KINDS.find((x) => x.value === k)?.label ?? k;

async function exportAssetsCsv() {
  const s = getSpace();
  if (!s.assets.length) {
    toast('No assets to export yet', 'info');
    return;
  }
  try {
    const path = await exportCsv(safeFileName(`${s.meta.title || 'Space'} - Brand assets`), s.assets, [
      { header: 'Type', value: (a: BrandAsset) => kindLabel(a.kind) },
      { header: 'Name', value: (a) => a.name },
      { header: 'Campaign', value: (a) => (a.campaignId ? s.campaigns.find((c) => c.id === a.campaignId)?.name : '') },
      { header: 'File', value: (a) => a.fileName },
      { header: 'Value', value: (a) => a.value },
      { header: 'Link', value: (a) => a.url },
      { header: 'Tags', value: (a) => (a.tags ?? []).join(', ') },
      { header: 'Notes', value: (a) => a.notes },
    ]);
    if (path) toast(`Exported ${plural(s.assets.length, 'asset')} to ${path.split(/[\\/]/).pop()}`);
    else if (backend.kind === 'web') toast('Asset list downloaded');
  } catch (e) {
    toast(`Could not export: ${e instanceof Error ? e.message : String(e)}`, 'error');
  }
}

/* ---------------------------------------------------------------- side cards */

function BrandVoiceCard() {
  const st = useSpace((s) => s.strategy);
  const tagline = st?.tagline?.trim();
  const voice = st?.voice?.trim();
  const msgs = useMemo(() => keyMessageLines(st?.keyMessages), [st?.keyMessages]);
  const empty = !tagline && !voice && !msgs.length;
  return (
    <div className="card sp-assets-voice">
      <div className="card-header">
        <Quote size={14} className="muted" />
        <h3>Brand voice</h3>
        <div className="spacer" />
        <button type="button" className="sp-assets-link" onClick={() => navigateSpace('strategy', { tab: 'messaging' })}>
          {empty ? 'Define it' : 'Edit in Strategy'} <ArrowRight size={12} />
        </button>
      </div>
      <div className="card-body">
        {empty ? (
          <p className="muted small" style={{ margin: 0 }}>
            No tagline, tone of voice or key messages yet. Write them in Strategy → Messaging so every caption, script and thumbnail sounds like the same brand.
          </p>
        ) : (
          <div className="col" style={{ gap: 12 }}>
            {tagline && <div className="sp-assets-tagline">“{tagline}”</div>}
            {voice && (
              <div>
                <div className="section-title">Tone of voice</div>
                <div className="sp-assets-pre">{voice}</div>
              </div>
            )}
            {msgs.length > 0 && (
              <div>
                <div className="section-title">Key messages</div>
                <ol className="sp-assets-msgs">
                  {msgs.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function GlanceCard({ assets, onJump }: { assets: BrandAsset[]; onJump: (id: SectionId) => void }) {
  const colors = useMemo(() => assets.filter((a) => a.kind === 'color' && normalizeHex(a.value)), [assets]);
  return (
    <div className="card sp-assets-glance">
      {colors.length > 0 && (
        <div className="sp-assets-palette" role="list" aria-label="Palette">
          {colors.map((c) => {
            const hex = normalizeHex(c.value)!;
            return (
              <button key={c.id} type="button" role="listitem" style={{ background: hex, color: inkOn(hex) }} title={`${c.name ? `${c.name} · ` : ''}${hex} — click to copy`} onClick={() => copyText(hex)}>
                <span>{hex}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="sp-assets-jump">
        {SECTIONS.map((s) => {
          const n = assetsOfSection(assets, s.id).length;
          const Icon = s.icon;
          return (
            <button key={s.id} type="button" className={n ? '' : 'none'} onClick={() => onJump(s.id)}>
              <Icon size={13} />
              <span className="grow ellipsis">{s.title}</span>
              <span className="n">{n || '–'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- module */

export default function AssetsModule() {
  const assets = useSpace((s) => s.assets) ?? [];
  const tagline = useSpace((s) => s.strategy?.tagline);
  const title = useSpace((s) => s.meta?.title);
  const [q, setQ] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<SectionId[]>(() => readLS<SectionId[]>('prepro.sp-assets.collapsed', []));
  const [editing, setEditing] = useState<ID | null>(null);
  const [viewing, setViewing] = useState<ID | null>(null);
  const [fileOver, setFileOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sample, setSample] = useState('');
  const [focusId, setFocusId] = useState<ID | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useCommand('find', () => {
    searchRef.current?.querySelector('input')?.focus();
    return true;
  });

  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of assets) for (const t of a.tags ?? []) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [assets]);
  const allTags = useMemo(() => tagCounts.map(([t]) => t), [tagCounts]);
  const filtering = !!q.trim() || tags.length > 0;
  const filtered = useMemo(
    () => (filtering ? assets.filter((a) => tags.every((t) => a.tags?.includes(t)) && matchesQuery([a.name, a.value, a.url, a.notes, (a.tags ?? []).join(' '), kindLabel(a.kind)].join(' '), q)) : assets),
    [assets, tags, q, filtering],
  );
  const images = useMemo(() => assetsOfSection(filtered, 'images'), [filtered]);
  const counts = useMemo(() => ({ colors: assets.filter((a) => a.kind === 'color').length, fonts: assets.filter((a) => a.kind === 'font').length, logos: assets.filter((a) => a.kind === 'logo').length }), [assets]);

  // drop any tags that no longer exist (e.g. after an undo)
  useEffect(() => {
    if (tags.some((t) => !allTags.includes(t))) setTags((ts) => ts.filter((t) => allTags.includes(t)));
  }, [allTags, tags]);

  // focus the first field of a freshly added tile
  useEffect(() => {
    if (!focusId) return;
    const t = setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`.sp-assets [data-id="${focusId}"]`);
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      const input = el?.querySelector<HTMLInputElement>('input');
      input?.focus();
      input?.select();
      setFocusId(null);
    }, 40);
    return () => clearTimeout(t);
  }, [focusId]);

  const saveCollapsed = (fn: (prev: SectionId[]) => SectionId[]) =>
    setCollapsed((prev) => {
      const next = fn(prev);
      if (next !== prev) writeLS('prepro.sp-assets.collapsed', next);
      return next;
    });
  const expand = (id: SectionId) => saveCollapsed((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : prev));
  const toggle = (id: SectionId) => saveCollapsed((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  const clearFilters = () => {
    setQ('');
    setTags([]);
  };

  const importImages = async (files: File[]) => {
    const imgs = files.filter(isImageFile);
    if (!imgs.length) {
      toast('Only images can be dropped here. Add other files as links or templates.', 'error');
      return;
    }
    setBusy(true);
    try {
      const names = await importDroppedImages(imgs);
      clearFilters();
      expand('images');
      addImageAssets(names);
    } catch (e) {
      toast(`Could not import: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  /** Dropped files: images go to Images & references, everything else becomes a resource. */
  const importFiles = (files: File[]) => {
    const imgs = files.filter(isImageFile);
    const other = files.filter((f) => !isImageFile(f));
    if (imgs.length) void importImages(imgs);
    if (other.length) {
      clearFilters();
      expand('links');
      void dropResources(other);
    }
  };

  const uploadResources = () => {
    clearFilters();
    expand('links');
    void pickResources();
  };

  const pickInto = async (kind: 'image' | 'logo') => {
    try {
      const names = await pickImages(true);
      if (!names.length) return;
      clearFilters();
      expand(kind === 'logo' ? 'logos' : 'images');
      addImageAssets(names, kind);
    } catch (e) {
      toast(`Could not import: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };

  const add = (kind: AssetKind) => {
    clearFilters();
    if (kind === 'logo' || kind === 'image') {
      void pickInto(kind);
      return;
    }
    const section = SECTIONS.find((s) => s.kinds.includes(kind))?.id ?? 'links';
    expand(section);
    if (kind === 'color') setFocusId(addColor());
    else if (kind === 'font') setFocusId(addAssets([makeAsset('font')])[0]);
    else setEditing(addAssets([makeAsset(kind)])[0]);
  };

  // paste images anywhere (outside text fields)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (isModalOpen() || t?.closest?.('input, textarea, select, [contenteditable="true"], .image-drop')) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter(isImageFile);
      if (!files.length) return;
      e.preventDefault();
      void importImages(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const h: TileHandlers = {
    onEdit: setEditing,
    onTag: (t) => setTags((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t])),
    activeTags: tags,
  };

  const addItems: MenuItem[] = [
    { label: 'Logo…', icon: Shapes, onClick: () => add('logo') },
    { label: 'Colour', icon: Palette, onClick: () => add('color') },
    { label: 'Font', icon: Type, onClick: () => add('font') },
    { label: 'Images & references…', icon: ImagePlus, onClick: () => add('image') },
    { separator: true },
    { label: 'Template', icon: LayoutTemplate, onClick: () => add('template') },
    { label: 'Video / footage', icon: Film, onClick: () => add('video') },
    { label: 'Music / sound', icon: Music, onClick: () => add('audio') },
    { label: 'Link', icon: Link2, onClick: () => add('link') },
    { label: 'Document', icon: FileText, onClick: () => add('doc') },
    { separator: true },
    { label: 'Resource files (upload)…', icon: Upload, onClick: uploadResources },
  ];

  const editingAsset = editing ? assets.find((a) => a.id === editing) : undefined;
  const shown = SECTIONS.map((def) => ({ def, items: assetsOfSection(filtered, def.id), total: assetsOfSection(assets, def.id).length })).filter((s) => !filtering || s.items.length > 0);
  const subtitle = assets.length
    ? [plural(assets.length, 'asset'), counts.logos && plural(counts.logos, 'logo'), counts.colors && plural(counts.colors, 'colour'), counts.fonts && plural(counts.fonts, 'font')].filter(Boolean).join(' · ')
    : 'Logos, colours, fonts, references, templates and links';
  const sampleText = sample || tagline?.trim() || title?.trim() || 'The quick brown fox jumps over the lazy dog';

  const sectionBody = (id: SectionId, items: BrandAsset[]) => {
    const def = SECTIONS.find((s) => s.id === id)!;
    switch (id) {
      case 'logos':
        return <LogosGrid items={items} h={h} canAdd={!filtering} />;
      case 'colors':
        return <ColorsGrid items={items} h={h} onAdd={filtering ? undefined : () => add('color')} />;
      case 'fonts':
        return <FontsList items={items} h={h} sample={sampleText} onAdd={filtering ? undefined : () => add('font')} />;
      case 'images':
        return <ImagesGallery items={items} h={h} onOpen={setViewing} canAdd={!filtering} />;
      case 'links':
        return <LinksSection items={items} h={h} def={def} filtering={filtering} onAdd={filtering ? undefined : () => add(def.addKind)} />;
      default:
        return <FileList items={items} h={h} def={def} onAdd={filtering ? undefined : () => add(def.addKind)} />;
    }
  };

  const sectionActions = (id: SectionId) => {
    if (filtering) return null;
    if (id === 'fonts')
      return (
        <Input size="sm" className="sp-assets-sample" value={sample} placeholder={`Sample: ${sampleText}`} aria-label="Font sample text" onChange={setSample} />
      );
    if (id === 'links')
      return (
        <Menu
          align="end"
          trigger={
            <Button size="sm" variant="ghost" icon={Plus}>
              Add
            </Button>
          }
          items={[
            { label: 'Upload resource files…', icon: Upload, onClick: uploadResources },
            { label: 'Resource link / placeholder', icon: FilePlus2, onClick: () => setEditing(addResourcePlaceholder()) },
            { separator: true },
            { label: 'Link', icon: Link2, onClick: () => add('link') },
            { label: 'Document', icon: FileText, onClick: () => add('doc') },
            { label: 'Other', icon: Plus, onClick: () => add('other') },
          ]}
        />
      );
    const def = SECTIONS.find((s) => s.id === id)!;
    return (
      <Button size="sm" variant="ghost" icon={Plus} onClick={() => add(def.addKind)}>
        {def.addLabel}
      </Button>
    );
  };

  return (
    <div
      className={`module sp-assets ${fileOver ? 'fileover' : ''}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        if (e.nativeEvent.defaultPrevented) {
          if (fileOver) setFileOver(false);
          return;
        }
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (!fileOver) setFileOver(true);
      }}
      onDragLeave={(e) => {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setFileOver(false);
      }}
      onDrop={(e) => {
        setFileOver(false);
        if (e.nativeEvent.defaultPrevented || !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        importFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <ModuleHeader
        title="Brand Kit & Assets"
        icon={Palette}
        subtitle={subtitle}
        actions={
          <>
            <ExportMenu docs={[{ id: 'space-brand-kit', label: 'Brand kit (PDF)' }]} csv={[{ label: 'Asset list (CSV)', onClick: exportAssetsCsv }]} />
            <Menu
              align="end"
              items={addItems}
              trigger={
                <Button variant="primary" icon={Plus}>
                  Add asset
                </Button>
              }
            />
          </>
        }
      />
      {assets.length > 0 && (
        <Toolbar>
          <div ref={searchRef}>
            <SearchInput value={q} onChange={setQ} placeholder="Search assets…" />
          </div>
          {tagCounts.length > 0 && (
            <div className="sp-assets-tagbar" role="group" aria-label="Filter by tag">
              {tagCounts.map(([t, n]) => (
                <button key={t} type="button" className={`sp-assets-tag ${tags.includes(t) ? 'on' : ''}`} aria-pressed={tags.includes(t)} onClick={() => h.onTag(t)}>
                  #{t} <span className="n">{n}</span>
                </button>
              ))}
            </div>
          )}
          {filtering && (
            <Button size="sm" variant="ghost" icon={X} onClick={clearFilters}>
              Clear
            </Button>
          )}
          <div className="spacer" />
          {busy ? (
            <span className="muted small row" style={{ gap: 6 }}>
              <Loader2 size={14} className="spin" /> Importing…
            </span>
          ) : (
            <span className="muted small">Drop images or files anywhere to add them</span>
          )}
        </Toolbar>
      )}
      <div className="module-body">
        <div className="sp-assets-layout">
          <div className="sp-assets-main">
            {assets.length === 0 && (
              <div className="sp-assets-intro">
                <div className="sp-assets-intro-icon">
                  <Palette />
                </div>
                <div className="grow">
                  <h3>Build your brand kit</h3>
                  <p>Drop your logo, add your colours and fonts, and collect the references, templates, music and links you reuse — plus the downloadable resources (playbooks, one-pagers, sequence maps …) of each campaign. It all stays in this space and prints as a brand sheet for collaborators.</p>
                  <div className="row wrap" style={{ gap: 6 }}>
                    <Button icon={Shapes} onClick={() => add('logo')}>
                      Add logo
                    </Button>
                    <Button icon={Palette} onClick={() => add('color')}>
                      Add colour
                    </Button>
                    <Button icon={Type} onClick={() => add('font')}>
                      Add font
                    </Button>
                    <Button icon={ImagePlus} onClick={() => add('image')}>
                      Add images
                    </Button>
                    <Button icon={Upload} onClick={uploadResources}>
                      Upload resources
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {filtering && shown.length === 0 && (
              <div className="empty" style={{ padding: 40 }}>
                <h3>No assets match</h3>
                <p>Try another search or tag.</p>
                <Button onClick={clearFilters}>Clear filters</Button>
              </div>
            )}
            {shown.map(({ def, items, total }) => (
              <SectionShell key={def.id} def={def} count={items.length} total={total} collapsed={!filtering && collapsed.includes(def.id)} onToggle={() => toggle(def.id)} actions={sectionActions(def.id)}>
                {sectionBody(def.id, items)}
              </SectionShell>
            ))}
          </div>
          <aside className="sp-assets-side">
            <BrandVoiceCard />
            {assets.length > 0 && (
              <GlanceCard
                assets={assets}
                onJump={(id) => {
                  expand(id);
                  setTimeout(() => document.getElementById(`sp-assets-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
                }}
              />
            )}
          </aside>
        </div>
      </div>

      {fileOver && (
        <div className="sp-assets-dropzone" aria-hidden>
          <div>
            <ImagePlus />
            <span>Drop images → Images & references · other files → Links & documents</span>
          </div>
        </div>
      )}
      {editingAsset &&
        (editingAsset.kind === 'resource' || editingAsset.file ? (
          <ResourceModal key={editingAsset.id} asset={editingAsset} onClose={() => setEditing(null)} />
        ) : (
          <AssetEditor key={editingAsset.id} asset={editingAsset} allTags={allTags} onClose={() => setEditing(null)} />
        ))}
      {viewing && images.some((a) => a.id === viewing) && <ImageLightbox images={images} id={viewing} onId={setViewing} onClose={() => setViewing(null)} allTags={allTags} />}
    </div>
  );
}
