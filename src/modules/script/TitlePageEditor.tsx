import type { TitlePage } from '@/types';
import { update, useProject } from '@/store/project';
import { Field, Input, Textarea } from '@/ui';

export function TitlePageEditor() {
  const tp = useProject((p) => p.script.titlePage);
  const set = (patch: Partial<TitlePage>, key: string) => update((d) => void Object.assign(d.script.titlePage, patch), { coalesce: `titlepage:${key}` });
  return (
    <div className="module-body">
      <div className="sp-title-wrap">
        <div className="sp-title-form card card-pad">
          <div className="section-title">Title page</div>
          <Field label="Title">
            <Input value={tp.title} onChange={(v) => set({ title: v }, 'title')} placeholder="THE LAST TAKE" />
          </Field>
          <Field label="Credit">
            <Input value={tp.credit} onChange={(v) => set({ credit: v }, 'credit')} placeholder="Written by" />
          </Field>
          <Field label="Author(s)" hint="One per line">
            <Textarea autoGrow minRows={2} value={tp.authors} onChange={(v) => set({ authors: v }, 'authors')} />
          </Field>
          <Field label="Source" hint="e.g. Based on the short story by …">
            <Textarea autoGrow minRows={1} value={tp.source} onChange={(v) => set({ source: v }, 'source')} />
          </Field>
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Field label="Draft">
              <Input value={tp.draft} onChange={(v) => set({ draft: v }, 'draft')} placeholder="First Draft" />
            </Field>
            <Field label="Draft date">
              <Input value={tp.draftDate} onChange={(v) => set({ draftDate: v }, 'date')} placeholder="October 18, 2026" />
            </Field>
          </div>
          <Field label="Contact (bottom left)" hint="Name, company, email, phone">
            <Textarea autoGrow minRows={3} value={tp.contact} onChange={(v) => set({ contact: v }, 'contact')} />
          </Field>
          <Field label="Copyright / registration (bottom right)">
            <Textarea autoGrow minRows={1} value={tp.notes} onChange={(v) => set({ notes: v }, 'notes')} placeholder="WGA Registered #…" />
          </Field>
        </div>
        <TitleSheet tp={tp} />
      </div>
    </div>
  );
}

/** On-screen preview of the printed title page (same layout as the PDF). */
export function TitleSheet({ tp }: { tp: TitlePage }) {
  const lines = (s?: string) => (s ?? '').split('\n').filter((l, i, a) => l.trim() || i < a.length - 1);
  return (
    <div className="sp-title-sheet">
      <div style={{ position: 'absolute', top: '3.5in', left: '1.5in', right: '1in', textAlign: 'center' }}>
        <div style={{ textDecoration: 'underline', textTransform: 'uppercase' }}>{tp.title || 'UNTITLED'}</div>
        <div style={{ height: 'calc(3in / 6)' }} />
        <div>{tp.credit}</div>
        <div style={{ height: 'calc(1in / 6)' }} />
        {lines(tp.authors).map((l, i) => (
          <div key={i}>{l || ' '}</div>
        ))}
        {tp.source && (
          <>
            <div style={{ height: 'calc(3in / 6)' }} />
            {lines(tp.source).map((l, i) => (
              <div key={i}>{l || ' '}</div>
            ))}
          </>
        )}
      </div>
      <div style={{ position: 'absolute', bottom: '1in', left: '1.5in', maxWidth: '3.4in' }}>
        {lines(tp.contact).map((l, i) => (
          <div key={i}>{l || ' '}</div>
        ))}
      </div>
      <div style={{ position: 'absolute', bottom: '1in', right: '1in', textAlign: 'right', maxWidth: '3in' }}>
        {[tp.draft, tp.draftDate, ...(tp.notes ? lines(tp.notes) : []), tp.copyright].filter(Boolean).map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </div>
  );
}
