/* Design system › Imported files: design-system files imported into the space, their documents
   (kept verbatim for agents) and preview cards. */
import { useState } from 'react';
import { ChevronDown, ChevronRight, FileStack, FileText, Maximize2, Trash2, Upload } from 'lucide-react';
import { Button, IconButton } from '@/ui';
import { plural } from '@/lib/text';
import { dsRemove } from '../ops';
import type { DSSource } from '../types';
import { pickImport } from './io';
import { Markdown } from './Markdown';
import { SpecimenModal } from './ComponentsSection';
import { SectionHead, SpecimenFrame, Teach, confirmRemove, useDS } from './shared';

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function Doc({ d }: { d: DSSource['docs'][number] }) {
  const [open, setOpen] = useState(false);
  const md = /\.(md|markdown)$/i.test(d.path) || /^#\s/m.test(d.text);
  return (
    <div className={`ds-doc ${open ? 'open' : ''}`}>
      <button type="button" className="ds-doc-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <FileText size={14} className="muted" />
        <b className="ellipsis">{d.title}</b>
        <span className="muted small ellipsis">{d.path}</span>
        <span className="spacer" />
        <span className="muted small">{Math.max(1, Math.round(d.text.length / 1000))}k chars</span>
      </button>
      {open && <div className="ds-doc-body">{md ? <Markdown text={d.text} /> : <pre className="ds-pre">{d.text}</pre>}</div>}
    </div>
  );
}

function SourceCard({ s }: { s: DSSource }) {
  const [spec, setSpec] = useState<{ file: string; title: string } | null>(null);
  return (
    <div className="ds-card ds-source">
      <div className="ds-source-head">
        <FileStack size={18} className="muted" />
        <div className="grow" style={{ minWidth: 0 }}>
          <b className="ellipsis" style={{ display: 'block' }}>
            {s.fileName}
          </b>
          <span className="muted small">
            {s.importedAt ? `Imported ${fmtDate(s.importedAt)}` : 'Imported'}
            {` · ${plural(s.docs.length, 'document')} · ${plural(s.cards.length, 'preview card')}`}
          </span>
        </div>
        <IconButton
          icon={Trash2}
          label="Remove this import"
          onClick={async () => {
            if (await confirmRemove(`the import “${s.fileName}” (its documents and preview cards; colours, fonts and other items it created stay)`, true)) dsRemove('sources', [s.id]);
          }}
        />
      </div>
      {s.summary && <p className="ds-source-summary">{s.summary}</p>}
      {s.docs.length > 0 && (
        <div className="ds-docs">
          <div className="section-title">Documents (kept verbatim in the agent guide)</div>
          {s.docs.map((d, i) => (
            <Doc key={`${d.path}-${i}`} d={d} />
          ))}
        </div>
      )}
      {s.cards.length > 0 && (
        <div>
          <div className="section-title">Preview cards</div>
          <div className="ds-cards small">
            {s.cards.map((c, i) => (
              <button key={`${c.path}-${i}`} type="button" className="ds-cardtile" onClick={() => setSpec({ file: c.file, title: c.title })}>
                <div className="ds-cardtile-thumb">
                  <SpecimenFrame file={c.file} title={c.title} thumb />
                  <span className="ds-cardtile-zoom">
                    <Maximize2 size={13} />
                  </span>
                </div>
                <div className="ds-cardtile-body">
                  <b className="ellipsis">{c.title}</b>
                  {c.category && <span className="muted small ellipsis">{c.category}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      {spec && <SpecimenModal file={spec.file} title={spec.title} onClose={() => setSpec(null)} />}
    </div>
  );
}

export function SourcesSection() {
  const ds = useDS();
  return (
    <div className="ds-section">
      <SectionHead
        icon={FileStack}
        title="Imported files"
        intro="Design-system files imported into this space — for example a Claude Design design-system .zip. Their colours, fonts, tokens, components and rules are merged into the sections; the original documents stay here, verbatim, for agents to read."
        actions={
          <Button icon={Upload} onClick={() => void pickImport()}>
            Import design system…
          </Button>
        }
      />
      {ds.sources.length === 0 ? (
        <div className="ds-card">
          <Teach
            icon={Upload}
            title="Bring in an existing design system"
            actions={
              <Button variant="primary" icon={Upload} onClick={() => void pickImport()}>
                Import design system…
              </Button>
            }
          >
            Import a Claude Design design-system .zip (or tokens.json, a .css file with custom properties, Markdown guidelines, fonts and images). You can also drop a .zip anywhere on Brand Kit & Assets.
          </Teach>
        </div>
      ) : (
        ds.sources.map((s) => <SourceCard key={s.id} s={s} />)
      )}
    </div>
  );
}
