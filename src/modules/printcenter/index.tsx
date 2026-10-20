/* Print & Export center: every printable document in one place, plus the
   merged "production book" PDF and data exports. */
import './printcenter.css';
import { useMemo, useState } from 'react';
import { Archive, BookOpen, Check, Eye, FileDown, FileText, GripVertical, Loader2, Printer } from 'lucide-react';
import { PRINT_DOCS, PRINT_GROUPS } from '@/print/registry';
import type { PrintDocDef } from '@/print/types';
import { exportBook, exportDocPdf, printDoc } from '@/print/run';
import { openPrint, readLS, writeLS } from '@/store/app';
import { useProject, useProjectData } from '@/store/project';
import { useScriptModel } from '@/derived/script';
import { backend } from '@/backend';
import { Badge, Button, Checkbox, ModuleHeader, toast } from '@/ui';
import { exportArchive } from '@/shell/projectActions';
import { exportFdx, exportFountain, exportPlainText } from '../script/exports';

const BOOK_DEFAULT = [
  'project-overview',
  'screenplay',
  'scene-report',
  'breakdown-sheets',
  'shooting-schedule',
  'one-liner',
  'call-sheet',
  'shot-list',
  'storyboard',
  'lighting-diagram',
  'cast-list',
  'crew-list',
  'contact-sheet',
  'location-sheets',
  'props-list',
  'wardrobe-list',
  'gear-list',
  'budget-topsheet',
  'deliverables',
];

export default function PrintCenterModule() {
  const project = useProjectData();
  const model = useScriptModel();
  const projectId = useProject((p) => p.id);
  const title = useProject((p) => p.meta.title);
  const [busy, setBusy] = useState<string | null>(null);
  const [book, setBook] = useState<string[]>(() => readLS<string[]>(`prepro.book.${projectId}`, BOOK_DEFAULT).filter((id) => PRINT_DOCS.some((d) => d.id === id)));
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [drag, setDrag] = useState<string | null>(null);

  const saveBook = (ids: string[]) => {
    setBook(ids);
    writeLS(`prepro.book.${projectId}`, ids);
  };

  const empty = useMemo(() => {
    const m = new Map<string, string | false>();
    for (const d of PRINT_DOCS) {
      try {
        m.set(d.id, d.emptyReason ? d.emptyReason(project, model) : false);
      } catch {
        m.set(d.id, false);
      }
    }
    return m;
  }, [project, model]);

  const groups = PRINT_GROUPS.map((g) => [g, PRINT_DOCS.filter((d) => d.group === g)] as const).filter(([, docs]) => docs.length);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const bookDocs = book.map((id) => PRINT_DOCS.find((d) => d.id === id)).filter(Boolean) as PrintDocDef[];
  const bookReady = bookDocs.filter((d) => !empty.get(d.id));

  const exportTheBook = () =>
    run('book', async () => {
      if (!bookReady.length) {
        toast('Choose at least one document that has content', 'info');
        return;
      }
      setProgress({ done: 0, total: bookReady.length });
      try {
        await exportBook(
          bookReady.map((d) => ({ docId: d.id, options: d.id === 'call-sheet' ? { allDays: true } : undefined })),
          (done, total) => setProgress({ done, total }),
        );
      } catch (e) {
        toast(`Production book failed: ${e instanceof Error ? e.message : e}`, 'error');
      } finally {
        setProgress(null);
      }
    });

  return (
    <div className="module">
      <ModuleHeader title="Print & Export" icon={Printer} subtitle={`${PRINT_DOCS.length} documents · PDF, print and data exports`} />
      <div className="module-body">
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
                          <Button size="sm" icon={FileDown} disabled={!!busy} onClick={() => run(d.id, () => exportDocPdf(d.id))}>
                            {busy === d.id ? 'Exporting…' : 'PDF'}
                          </Button>
                          <Button size="sm" variant="ghost" icon={Printer} disabled={!!busy} onClick={() => run(`p-${d.id}`, () => printDoc(d.id))}>
                            Print
                          </Button>
                          <div className="spacer" />
                          <Checkbox checked={inBook} onChange={(v) => saveBook(v ? [...book, d.id] : book.filter((x) => x !== d.id))} title="Include in the production book" />
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
                <h3>Production book</h3>
              </div>
              <div className="card-body col" style={{ gap: 10 }}>
                <div className="muted small">
                  One PDF with every checked document, in this order — ideal to share with HODs or print for set. Drag to reorder.
                </div>
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
                  {busy === 'book' ? 'Building…' : `Export production book (${bookReady.length})`}
                </Button>
                {backend.kind !== 'electron' && <div className="tiny muted">In the browser each document opens its own print dialog. The desktop app merges them into a single PDF.</div>}
                <div className="row" style={{ gap: 6 }}>
                  <Button size="sm" variant="ghost" onClick={() => saveBook(BOOK_DEFAULT.filter((id) => PRINT_DOCS.some((d) => d.id === id)))}>
                    Reset selection
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => saveBook([])}>
                    Clear
                  </Button>
                </div>
              </div>
            </div>

            <div className="card" style={{ marginTop: 14 }}>
              <div className="card-header">
                <FileText size={16} />
                <h3>Script files</h3>
              </div>
              <div className="card-body col" style={{ gap: 6 }}>
                <Button icon={FileDown} onClick={exportFdx}>
                  Final Draft (.fdx)
                </Button>
                <Button icon={FileDown} onClick={exportFountain}>
                  Fountain (.fountain)
                </Button>
                <Button icon={FileDown} onClick={exportPlainText}>
                  Formatted text (.txt)
                </Button>
              </div>
            </div>

            <div className="card" style={{ marginTop: 14 }}>
              <div className="card-header">
                <Archive size={16} />
                <h3>Whole project</h3>
              </div>
              <div className="card-body col" style={{ gap: 8 }}>
                <div className="muted small">A .zip with all data and images — for backups, moving to another computer, or handing over to a colleague who also uses PrePro Studio.</div>
                <Button icon={Archive} onClick={() => exportArchive(projectId, title)}>
                  Export project archive
                </Button>
                <div className="tiny muted">Spreadsheet (CSV) exports are in each module’s Print / Export menu. Storyboard frames can be exported as PNGs for Miro from the Storyboard module.</div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
