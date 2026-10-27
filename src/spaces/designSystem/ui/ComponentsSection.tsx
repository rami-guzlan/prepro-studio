/* Design system › Components & layouts: component cards (props, variants, states, per-theme notes, code),
   layouts (structure, format) and the specimens of imported files. */
import { useMemo, useState } from 'react';
import { Component, Copy, LayoutTemplate, Maximize2, Plus, Trash2 } from 'lucide-react';
import type { DSComponent, DSLayout, DSLayoutKind } from '../types';
import { assetUrl } from '@/backend';
import { Button, Combo, Field, Input, Modal, Select, Textarea } from '@/ui';
import { copyText } from '@/spaces/modules/assets/actions';
import { formatSize } from '../compile';
import { dsAdd, dsPatch, dsRemove } from '../ops';
import { LAYOUT_KINDS } from './options';
import { AssetPick, SectionHead, SpecimenFrame, SubHead, Teach, confirmRemove, useAssets, useDS } from './shared';

/* ---------------------------------------------------------------- previews */

function Thumb({ assetId, file, title }: { assetId?: string; file?: string; title?: string }) {
  const assets = useAssets();
  const img = assetId ? assets.find((a) => a.id === assetId)?.image : undefined;
  if (img) return <img className="ds-thumb-img" src={assetUrl(img)} alt="" draggable={false} />;
  if (file) return <SpecimenFrame file={file} title={title} thumb />;
  return <div className="ds-thumb-none" aria-hidden />;
}

export function SpecimenModal({ file, title, onClose }: { file: string; title: string; onClose: () => void }) {
  return (
    <Modal open size="xl" title={title} onClose={onClose} bodyStyle={{ padding: 0 }}>
      <div className="ds-specimen-big">
        <SpecimenFrame file={file} title={title} />
      </div>
      <div className="muted small" style={{ padding: '8px 16px' }}>
        Imported preview, shown without scripts. Linked styles or images inside the file may be missing.
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- editors */

function ComponentEditor({ c, categories, onClose }: { c: DSComponent; categories: string[]; onClose: () => void }) {
  const up = (patch: Partial<DSComponent>) => dsPatch('components', c.id, patch);
  const opt = (v: string) => v || undefined;
  return (
    <Modal
      open
      size="lg"
      title={c.name || 'Component'}
      onClose={onClose}
      footer={
        <>
          <Button
            variant="danger"
            icon={Trash2}
            onClick={async () => {
              if (await confirmRemove(`the component “${c.name || 'Untitled'}”`, true)) {
                dsRemove('components', [c.id]);
                onClose();
              }
            }}
          >
            Delete
          </Button>
          <div className="spacer" />
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="ds-editor">
        <div className="ds-editor-preview">
          <AssetPick value={c.previewAssetId} onChange={(previewAssetId) => dsPatch('components', c.id, { previewAssetId }, false)} label="Preview image (pick or drop)" contain />
          {c.file && (
            <div className="ds-editor-specimen">
              <div className="section-title">Imported specimen</div>
              <SpecimenFrame file={c.file} title={c.name} />
            </div>
          )}
        </div>
        <div className="ds-grid-2">
          <Field label="Name">
            <Input autoFocus value={c.name} placeholder="PascalCase, e.g. StatCard" onChange={(name) => up({ name })} />
          </Field>
          <Field label="Category">
            <Combo value={c.category} suggestions={categories} placeholder="e.g. Cards, Document blocks" onChange={(v) => up({ category: opt(v) })} />
          </Field>
          <Field label="Description" span="all">
            <Textarea autoGrow minRows={2} value={c.description} placeholder="What it is and what it is for" onChange={(v) => up({ description: opt(v) })} />
          </Field>
          <Field label="Props / slots" span="all" hint="One per line: name — what it holds">
            <Textarea autoGrow minRows={3} className="mono" value={c.props} placeholder={'value — the big number\nlabel — what it counts\nsource — footnote'} onChange={(v) => up({ props: opt(v) })} />
          </Field>
          <Field label="Variants">
            <Textarea autoGrow minRows={2} value={c.variants} placeholder="e.g. default · inverted · with icon" onChange={(v) => up({ variants: opt(v) })} />
          </Field>
          <Field label="States">
            <Textarea autoGrow minRows={2} value={c.states} placeholder="e.g. hover lifts 2px; disabled at 40 %" onChange={(v) => up({ states: opt(v) })} />
          </Field>
          <Field label="Per theme">
            <Textarea autoGrow minRows={2} value={c.themeNotes} placeholder="How it differs in light / dark" onChange={(v) => up({ themeNotes: opt(v) })} />
          </Field>
          <Field label="Use">
            <Textarea autoGrow minRows={2} value={c.usage} placeholder="When to use it (and when not)" onChange={(v) => up({ usage: opt(v) })} />
          </Field>
          <Field
            label={
              <span className="row" style={{ gap: 6 }}>
                Code snippet
                {c.code?.trim() && (
                  <button type="button" className="sp-assets-link" onClick={() => copyText(c.code!, 'the code')}>
                    <Copy size={11} /> Copy
                  </button>
                )}
              </span>
            }
            span="all"
            hint="Reference markup for coding agents (HTML / JSX / CSS)"
          >
            <Textarea autoGrow minRows={4} className="mono ds-code" spellCheck={false} value={c.code} placeholder={'<div class="stat-card">\n  <span class="stat-value">42%</span>\n  <span class="stat-label">faster ramp-up</span>\n</div>'} onChange={(v) => up({ code: opt(v) })} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function LayoutEditor({ l, onClose }: { l: DSLayout; onClose: () => void }) {
  const ds = useDS();
  const up = (patch: Partial<DSLayout>) => dsPatch('layouts', l.id, patch);
  const opt = (v: string) => v || undefined;
  return (
    <Modal
      open
      size="lg"
      title={l.name || 'Layout'}
      onClose={onClose}
      footer={
        <>
          <Button
            variant="danger"
            icon={Trash2}
            onClick={async () => {
              if (await confirmRemove(`the layout “${l.name || 'Untitled'}”`, true)) {
                dsRemove('layouts', [l.id]);
                onClose();
              }
            }}
          >
            Delete
          </Button>
          <div className="spacer" />
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="ds-editor">
        <div className="ds-editor-preview">
          <AssetPick value={l.previewAssetId} onChange={(previewAssetId) => dsPatch('layouts', l.id, { previewAssetId }, false)} label="Preview image (pick or drop)" contain />
          {l.file && (
            <div className="ds-editor-specimen">
              <div className="section-title">Imported specimen</div>
              <SpecimenFrame file={l.file} title={l.name} />
            </div>
          )}
        </div>
        <div className="ds-grid-2">
          <Field label="Name">
            <Input autoFocus value={l.name} placeholder="e.g. Cover, Agenda, Content: card grid" onChange={(name) => up({ name })} />
          </Field>
          <Field label="Kind">
            <Select value={l.kind} options={LAYOUT_KINDS} onChange={(v) => dsPatch('layouts', l.id, { kind: v as DSLayoutKind }, false)} />
          </Field>
          <Field label="Format" span="all" hint={ds.formats.length ? undefined : 'Add formats in the Formats section to pick one here'}>
            <Select value={l.formatId ?? ''} options={ds.formats.map((f) => ({ value: f.id, label: `${f.name || 'Untitled'}${formatSize(f) ? ` · ${formatSize(f)}` : ''}` }))} placeholder="Any format" onChange={(v) => dsPatch('layouts', l.id, { formatId: v || undefined }, false)} />
          </Field>
          <Field label="Structure" span="all" hint="Top to bottom / left to right">
            <Textarea autoGrow minRows={2} value={l.structure} placeholder="e.g. eyebrow · title · spectrum tick · 3-column card grid · footer with page number" onChange={(v) => up({ structure: opt(v) })} />
          </Field>
          <Field label="Description" span="all">
            <Textarea autoGrow minRows={2} value={l.description} placeholder="When to use it, what makes it work" onChange={(v) => up({ description: opt(v) })} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- section */

export function ComponentsSection() {
  const ds = useDS();
  const [editC, setEditC] = useState<string | null>(null);
  const [editL, setEditL] = useState<string | null>(null);
  const [spec, setSpec] = useState<{ file: string; title: string } | null>(null);
  const categories = useMemo(() => [...new Set(ds.components.map((c) => c.category?.trim()).filter((x): x is string => !!x))], [ds.components]);
  const cats = useMemo(() => [...new Set(ds.components.map((c) => c.category?.trim() || 'Components'))], [ds.components]);
  const cards = useMemo(() => ds.sources.flatMap((s) => s.cards.map((c) => ({ ...c, from: s.fileName }))), [ds.sources]);
  const cardCats = useMemo(() => [...new Set(cards.map((c) => c.category || 'Specimens'))], [cards]);
  const editingC = ds.components.find((c) => c.id === editC);
  const editingL = ds.layouts.find((l) => l.id === editL);

  const addComponent = () => setEditC(dsAdd('components', { name: '' }));
  const addLayout = () => setEditL(dsAdd('layouts', { name: '', kind: 'page' }));

  return (
    <div className="ds-section">
      <SectionHead icon={Component} title="Components & layouts" intro="The building blocks agents assemble (with their props, variants and states) and the layouts they fill. Add a preview image or a code snippet so a coding agent can rebuild them exactly." />

      <div className="ds-card">
        <SubHead
          title="Components"
          hint={ds.components.length ? `${ds.components.length}` : undefined}
          actions={
            ds.components.length > 0 && (
              <Button size="sm" variant="ghost" icon={Plus} onClick={addComponent}>
                Add component
              </Button>
            )
          }
        />
        {ds.components.length === 0 ? (
          <Teach
            icon={Component}
            title="Name the pieces you reuse"
            actions={
              <Button icon={Plus} onClick={addComponent}>
                Add component
              </Button>
            }
          >
            Stat cards, quote blocks, section headers, buttons, brand motifs … Give each a PascalCase name, its props (one per line), variants and states, and how it changes per theme.
          </Teach>
        ) : (
          cats.map((cat) => (
            <div key={cat} className="ds-cards-group">
              {cats.length > 1 && <div className="ds-group-title"><span>{cat}</span></div>}
              <div className="ds-cards">
                {ds.components
                  .filter((c) => (c.category?.trim() || 'Components') === cat)
                  .map((c) => (
                    <button key={c.id} type="button" className="ds-cardtile" onClick={() => setEditC(c.id)}>
                      <div className="ds-cardtile-thumb">
                        <Thumb assetId={c.previewAssetId} file={c.file} title={c.name} />
                      </div>
                      <div className="ds-cardtile-body">
                        <b className="ellipsis">{c.name || 'Untitled component'}</b>
                        <span className="muted small clamp-2">{c.description || c.usage || 'No description yet'}</span>
                        {c.props && <span className="ds-cardtile-props mono ellipsis">{c.props.split('\n').map((p) => p.split(/\s+[—–-]\s+/)[0].trim()).filter(Boolean).join(' · ')}</span>}
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="ds-card">
        <SubHead
          title="Layouts"
          actions={
            ds.layouts.length > 0 && (
              <Button size="sm" variant="ghost" icon={Plus} onClick={addLayout}>
                Add layout
              </Button>
            )
          }
        />
        {ds.layouts.length === 0 ? (
          <Teach
            icon={LayoutTemplate}
            title="Describe the page and slide patterns"
            actions={
              <Button icon={Plus} onClick={addLayout}>
                Add layout
              </Button>
            }
          >
            Cover, agenda, content grid, quote slide, social post … Write the structure top to bottom (“eyebrow · title · 3-column card grid · footer”) and the format it is built for.
          </Teach>
        ) : (
          <div className="ds-cards">
            {ds.layouts.map((l) => {
              const f = ds.formats.find((x) => x.id === l.formatId);
              return (
                <button key={l.id} type="button" className="ds-cardtile" onClick={() => setEditL(l.id)}>
                  <div className="ds-cardtile-thumb">
                    <Thumb assetId={l.previewAssetId} file={l.file} title={l.name} />
                  </div>
                  <div className="ds-cardtile-body">
                    <b className="ellipsis">{l.name || 'Untitled layout'}</b>
                    <span className="muted small">
                      {LAYOUT_KINDS.find((k) => k.value === l.kind)?.label}
                      {f ? ` · ${f.name}` : ''}
                    </span>
                    {l.structure && <span className="muted small clamp-2">{l.structure}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {cards.length > 0 && (
        <div className="ds-card">
          <SubHead title="Specimens from imported files" hint="Preview cards that came with imported design systems" />
          {cardCats.map((cat) => (
            <div key={cat} className="ds-cards-group">
              {cardCats.length > 1 && <div className="ds-group-title"><span>{cat}</span></div>}
              <div className="ds-cards">
                {cards
                  .filter((c) => (c.category || 'Specimens') === cat)
                  .map((c) => (
                    <button key={`${c.from}/${c.path}`} type="button" className="ds-cardtile" onClick={() => setSpec({ file: c.file, title: c.title })}>
                      <div className="ds-cardtile-thumb">
                        <SpecimenFrame file={c.file} title={c.title} thumb />
                        <span className="ds-cardtile-zoom">
                          <Maximize2 size={13} />
                        </span>
                      </div>
                      <div className="ds-cardtile-body">
                        <b className="ellipsis">{c.title}</b>
                        <span className="muted small ellipsis">{c.from}</span>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {editingC && <ComponentEditor key={editingC.id} c={editingC} categories={categories} onClose={() => setEditC(null)} />}
      {editingL && <LayoutEditor key={editingL.id} l={editingL} onClose={() => setEditL(null)} />}
      {spec && <SpecimenModal file={spec.file} title={spec.title} onClose={() => setSpec(null)} />}
    </div>
  );
}
