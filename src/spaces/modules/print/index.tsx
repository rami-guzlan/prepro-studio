/* Print & Export for a Marketing Space: every document, plus one merged
   "marketing plan" PDF in the order you choose. */
import '@/modules/printcenter/printcenter.css';
import { useMemo, useState } from 'react';
import { BookOpen, Check, Eye, FileDown, FileText, GripVertical, Loader2, Printer } from 'lucide-react';
import { SPACE_PRINT_GROUPS, printDocsFor } from '@/spaces/print/registry';
import type { SpacePrintDocDef } from '@/spaces/print/types';
import { exportSpaceBook, exportSpaceDocPdf, printSpaceDoc } from '@/spaces/print/run';
import { openPrint, readLS, writeLS } from '@/store/app';
import { useSpace, useSpaceData } from '@/store/space';
import { backend } from '@/backend';
import { Badge, Button, Checkbox, EmptyState, ModuleHeader, toast } from '@/ui';

const BOOK_DEFAULT = ['space-overview', 'space-strategy', 'space-campaign-plan', 'space-content-plan', 'space-calendar', 'space-shoot-plan', 'space-results-report', 'space-brand-kit'];

export default function SpacePrintModule() {
  const space = useSpaceData();
  const spaceId = useSpace((s) => s.id);
  const kind = useSpace((s) => s.meta.kind ?? 'marketing');
  const DOCS = useMemo(() => printDocsFor(kind), [kind]);
  const bookName = kind === 'marketing' ? 'marketing plan' : kind === 'business' ? 'business book' : kind === 'finance' ? 'finance report' : 'training report';
  const BookName = bookName[0].toUpperCase() + bookName.slice(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [book, setBook] = useState<string[]>(() => readLS<string[]>(`prepro.spacebook.${spaceId}`, kind === 'marketing' ? BOOK_DEFAULT : DOCS.map((d) => d.id)).filter((id) => DOCS.some((d) => d.id === id)));
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [drag, setDrag] = useState<string | null>(null);

  const saveBook = (ids: string[]) => {
    setBook(ids);
    writeLS(`prepro.spacebook.${spaceId}`, ids);
  };

  const empty = useMemo(() => {
    const m = new Map<string, string | false>();
    for (const d of DOCS) {
      try {
        m.set(d.id, d.emptyReason ? d.emptyReason(space) : false);
      } catch {
        m.set(d.id, false);
      }
    }
    return m;
  }, [space, DOCS]);

  const groups = SPACE_PRINT_GROUPS.map((g) => [g, DOCS.filter((d) => d.group === g)] as const).filter(([, docs]) => docs.length);
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };
  const bookDocs = book.map((id) => DOCS.find((d) => d.id === id)).filter(Boolean) as SpacePrintDocDef[];
  const bookReady = bookDocs.filter((d) => !empty.get(d.id));

  const exportTheBook = () =>
    run('book', async () => {
      if (!bookReady.length) {
        toast('Choose at least one document that has content', 'info');
        return;
      }
      setProgress({ done: 0, total: bookReady.length });
      try {
        await exportSpaceBook(
          bookReady.map((d) => ({ docId: d.id })),
          (done, total) => setProgress({ done, total }),
        );
      } catch (e) {
        toast(`${BookName} failed: ${e instanceof Error ? e.message : e}`, 'error');
      } finally {
        setProgress(null);
      }
    });

  return (
    <div className="module">
      <ModuleHeader title="Print & Export" icon={Printer} subtitle={`${DOCS.length} documents · PDF and print`} />
      <div className="module-body">
        {DOCS.length === 0 ? (
          <EmptyState icon={Printer} title="No documents yet" />
        ) : (
          <div className="pc-layout">
            <div className="pc-docs">
              {groups.map(([g, docs]) => (
                <section key={g} className="pc-group">
                  <div className="section-title">{g}</div>
                  <div className="pc-grid">
                    {docs.map((d) => {
                      const reason = empty.get(d.id);
                      const inBook = book.includes(d.id);
                      return (
                        <div key={d.id} className={`pc-doc card ${reason ? 'is-empty' : ''}`}>
                          <div className="pc-doc-head">
                            <FileText size={16} />
                            <span className="strong grow">{d.title}</span>
                            {d.orientation === 'landscape' && <Badge>Landscape</Badge>}
                          </div>
                          {d.description && <div className="muted small pc-desc">{d.description}</div>}
                          {reason && <div className="pc-empty small">{reason}</div>}
                          <div className="row" style={{ gap: 6, marginTop: 'auto' }}>
                            <Button size="sm" icon={Eye} onClick={() => openPrint(d.id)}>
                              Preview
                            </Button>
                            <Button size="sm" icon={FileDown} disabled={!!busy} onClick={() => run(d.id, () => exportSpaceDocPdf(d.id))}>
                              {busy === d.id ? 'Exporting…' : 'PDF'}
                            </Button>
                            <Button size="sm" variant="ghost" icon={Printer} disabled={!!busy} onClick={() => run(`p-${d.id}`, () => printSpaceDoc(d.id))}>
                              Print
                            </Button>
                            <div className="spacer" />
                            <Checkbox checked={inBook} onChange={(v) => saveBook(v ? [...book, d.id] : book.filter((x) => x !== d.id))} title={`Include in the ${bookName} PDF`} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>

            <aside className="pc-side">
              <div className="card">
                <div className="card-header">
                  <BookOpen size={16} />
                  <h3>{BookName}</h3>
                </div>
                <div className="card-body col" style={{ gap: 10 }}>
                  <div className="muted small">One PDF with every checked document, in this order — to share with collaborators, clients or the team. Drag to reorder.</div>
                  <div className="pc-book-list">
                    {bookDocs.length === 0 && <div className="muted small">Tick documents on the left to add them.</div>}
                    {bookDocs.map((d) => (
                      <div
                        key={d.id}
                        className={`pc-book-item ${empty.get(d.id) ? 'is-empty' : ''}`}
                        draggable
                        onDragStart={() => setDrag(d.id)}
                        onDragEnd={() => setDrag(null)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (!drag || drag === d.id) return;
                          const next = book.filter((x) => x !== drag);
                          next.splice(next.indexOf(d.id), 0, drag);
                          saveBook(next);
                        }}
                      >
                        <GripVertical size={13} className="muted" />
                        <span className="grow ellipsis">{d.title}</span>
                        {empty.get(d.id) ? <span className="tiny muted">skipped</span> : <Check size={13} color="var(--success)" />}
                      </div>
                    ))}
                  </div>
                  {progress && (
                    <div className="row small muted" style={{ gap: 6 }}>
                      <Loader2 size={14} className="spin" /> Rendering {Math.min(progress.done + 1, progress.total)} of {progress.total}…
                    </div>
                  )}
                  <Button variant="primary" icon={FileDown} disabled={!!busy} onClick={exportTheBook}>
                    {busy === 'book' ? 'Building…' : `Export ${bookName} (${bookReady.length})`}
                  </Button>
                  {backend.kind !== 'electron' && <div className="tiny muted">In the browser each document opens its own print dialog. The desktop app merges them into one PDF.</div>}
                  <div className="row" style={{ gap: 6 }}>
                    <Button size="sm" variant="ghost" onClick={() => saveBook(BOOK_DEFAULT.filter((id) => DOCS.some((d) => d.id === id)))}>
                      Reset selection
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => saveBook([])}>
                      Clear
                    </Button>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
