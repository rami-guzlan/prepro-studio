/* Print / export preview dialog. Opened with openPrint(docId, options). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { FileDown, Loader2, Printer, RefreshCw } from 'lucide-react';
import type { PaperSize, PrintSettings } from '@/types';
import type { Orientation, PrintOptionDef } from './types';
import { getPrintDoc } from './registry';
import { buildDocument, defaultOptions, makeContext, paperSizeIn, toJob, type BuiltDoc } from './build';
import { exportBuiltPdf } from './run';
import { backend } from '@/backend';
import { closePrint, useApp } from '@/store/app';
import { update, useProject, useProjectData } from '@/store/project';
import { updateSpace, useSpace, useSpaceData } from '@/store/space';
import { getSpacePrintDoc } from '@/spaces/print/registry';
import { buildSpaceDocument, makeSpaceContext } from '@/spaces/print/build';
import type { SpacePrintDocDef } from '@/spaces/print/types';
import type { PrintDocDef } from './types';
import { Button, Checkbox, Field, Input, Modal, Select, Switch, toast } from '@/ui';

export function PrintPreviewHost() {
  const req = useApp((s) => s.print);
  const view = useApp((s) => s.view);
  if (!req) return null;
  if (view === 'space') {
    const sdef = getSpacePrintDoc(req.docId);
    if (!sdef) {
      return (
        <Modal open onClose={closePrint} title="Print" size="sm">
          Unknown document “{req.docId}”.
        </Modal>
      );
    }
    return <SpacePrintPreview key={req.docId + JSON.stringify(req.options ?? {})} def={sdef} initial={req.options ?? {}} />;
  }
  const def = getPrintDoc(req.docId);
  if (!def) {
    return (
      <Modal open onClose={closePrint} title="Print" size="sm">
        Unknown document “{req.docId}”.
      </Modal>
    );
  }
  return <ProjectPrintPreview key={req.docId + JSON.stringify(req.options ?? {})} def={def} initial={req.options ?? {}} />;
}

function ProjectPrintPreview({ def, initial }: { def: PrintDocDef; initial: Record<string, unknown> }) {
  const project = useProjectData();
  const printSettings = useProject((p) => p.settings.print);
  return (
    <PrintPreview
      def={def}
      initial={initial}
      data={project}
      defaultPaper={project.settings.paperSize}
      printSettings={printSettings}
      setPrint={(patch) => update((d) => void Object.assign(d.settings.print, patch), { coalesce: 'print-settings' })}
      build={(options, paper, orientation) => buildDocument(def, makeContext(project, def, options, paper, orientation))}
    />
  );
}

function SpacePrintPreview({ def, initial }: { def: SpacePrintDocDef; initial: Record<string, unknown> }) {
  const space = useSpaceData();
  const printSettings = useSpace((s) => s.settings.print);
  return (
    <PrintPreview
      def={def}
      initial={initial}
      data={space}
      defaultPaper={space.settings.paperSize}
      printSettings={printSettings}
      setPrint={(patch) => updateSpace((d) => void Object.assign(d.settings.print, patch), { coalesce: 'print-settings' })}
      build={(options, paper, orientation) => buildSpaceDocument(def, makeSpaceContext(space, def, options, paper, orientation))}
    />
  );
}

interface PreviewDef {
  title: string;
  description?: string;
  orientation?: Orientation;
  options?: PrintOptionDef[];
}

function PrintPreview({
  def,
  initial,
  data,
  defaultPaper,
  printSettings,
  setPrint,
  build,
}: {
  def: PreviewDef;
  initial: Record<string, unknown>;
  /** the project / space (rebuilds when it changes) */
  data: unknown;
  defaultPaper: PaperSize;
  printSettings: PrintSettings;
  setPrint: (patch: Partial<PrintSettings>) => void;
  build: (options: Record<string, any>, paper: PaperSize, orientation: Orientation) => BuiltDoc;
}) {
  const [options, setOptions] = useState<Record<string, any>>(() => ({ ...defaultOptions(def as PrintDocDef), ...initial }));
  const [paper, setPaper] = useState<PaperSize>(defaultPaper);
  const [orientation, setOrientation] = useState<Orientation>(def.orientation ?? 'portrait');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [rendering, setRendering] = useState(false);
  const [busy, setBusy] = useState<'' | 'export' | 'print'>('');
  const desktop = backend.kind === 'electron' && !!backend.tempPdf;
  const frameWrap = useRef<HTMLDivElement>(null);
  const [wrapW, setWrapW] = useState(800);

  const built: BuiltDoc | { error: string } = useMemo(() => {
    try {
      return build(options, paper, orientation);
    } catch (e) {
      console.error(e);
      return { error: e instanceof Error ? e.message : String(e) };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, data, options, paper, orientation]);

  // desktop: render the real PDF for an exact preview
  useEffect(() => {
    if (!desktop || 'error' in built) return;
    let cancelled = false;
    setRendering(true);
    const t = setTimeout(async () => {
      try {
        const res = await backend.tempPdf!(toJob(built));
        if (cancelled) return;
        setPdfUrl(res.url);
        setPdfBytes(res.bytes);
      } catch (e) {
        if (!cancelled) toast(`Preview failed: ${e instanceof Error ? e.message : e}`, 'error');
      } finally {
        if (!cancelled) setRendering(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [built, desktop]);

  useEffect(() => {
    const el = frameWrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWrapW(el.clientWidth));
    ro.observe(el);
    setWrapW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const effOrientation = 'error' in built ? orientation : built.orientation;
  const size = paperSizeIn(paper, effOrientation);
  const scale = Math.min(1.25, Math.max(0.3, (wrapW - 56) / (size.w * 96)));
  const srcDoc = 'error' in built ? '' : built.html.replace('</head>', `<style>@media screen { html { zoom: ${scale.toFixed(3)}; } }</style></head>`);

  const doExport = async () => {
    if ('error' in built) return;
    setBusy('export');
    try {
      if (desktop && pdfBytes && !rendering && backend.savePdfBytes) {
        const path = await backend.savePdfBytes(pdfBytes, built.fileName);
        if (path) toast(`Saved ${built.fileName}`, 'success', { action: backend.reveal ? { label: 'Show', onClick: () => backend.reveal!(path) } : undefined });
      } else await exportBuiltPdf(built);
    } finally {
      setBusy('');
    }
  };

  const doPrint = async () => {
    if ('error' in built) return;
    setBusy('print');
    try {
      if (desktop && pdfBytes && !rendering && backend.previewPdfBytes) await backend.previewPdfBytes(pdfBytes, built.title);
      else await backend.printPdf(toJob(built));
    } catch (e) {
      toast(`Print failed: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setBusy('');
    }
  };

  const setOpt = (k: string, v: unknown) => setOptions((o) => ({ ...o, [k]: v }));

  return (
    <Modal
      open
      onClose={closePrint}
      size="full"
      title={`${def.title}`}
      bodyStyle={{ padding: 0, display: 'flex', overflow: 'hidden' }}
      headerExtra={
        <div className="row" style={{ gap: 6 }}>
          {rendering && (
            <span className="muted small row" style={{ gap: 6 }}>
              <Loader2 size={14} className="spin" /> Rendering…
            </span>
          )}
          <Button icon={Printer} onClick={doPrint} disabled={!!busy || 'error' in built}>
            Print…
          </Button>
          <Button variant="primary" icon={FileDown} onClick={doExport} disabled={!!busy || 'error' in built}>
            {busy === 'export' ? 'Exporting…' : 'Export PDF'}
          </Button>
        </div>
      }
    >
      <div ref={frameWrap} style={{ flex: 1, minWidth: 0, background: '#8c8c96', position: 'relative' }}>
        {'error' in built ? (
          <div className="empty" style={{ color: '#fff' }}>
            <h3 style={{ color: '#fff' }}>Could not build this document</h3>
            <p>{built.error}</p>
          </div>
        ) : desktop ? (
          pdfUrl ? (
            <iframe key={pdfUrl} title="PDF preview" src={pdfUrl} style={{ width: '100%', height: '100%', border: 0, display: 'block' }} />
          ) : (
            <div className="center" style={{ height: '100%', color: '#fff', gap: 8 }}>
              <Loader2 className="spin" /> Rendering preview…
            </div>
          )
        ) : (
          <iframe title="Print preview" srcDoc={srcDoc} style={{ width: '100%', height: '100%', border: 0, display: 'block' }} />
        )}
      </div>
      <div style={{ width: 300, flexShrink: 0, borderLeft: '1px solid var(--border)', overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {def.description && <div className="muted small">{def.description}</div>}
        <div className="section-title">Page</div>
        <Field label="Paper size">
          <Select
            value={paper}
            onChange={(v) => setPaper(v as PaperSize)}
            options={[
              { value: 'letter', label: 'US Letter (8.5 × 11 in)' },
              { value: 'a4', label: 'A4 (210 × 297 mm)' },
            ]}
          />
        </Field>
        {def.orientation && (
          <Field label="Orientation">
            <Select
              value={orientation}
              onChange={(v) => setOrientation(v as Orientation)}
              options={[
                { value: 'portrait', label: 'Portrait' },
                { value: 'landscape', label: 'Landscape' },
              ]}
            />
          </Field>
        )}
        {(def.options?.length ?? 0) > 0 && <div className="section-title" style={{ marginTop: 6 }}>Options</div>}
        {def.options?.map((o) => {
          if (o.type === 'boolean') return <Checkbox key={o.key} checked={!!options[o.key]} onChange={(v) => setOpt(o.key, v)} label={o.label} />;
          if (o.type === 'select')
            return (
              <Field key={o.key} label={o.label} hint={o.hint}>
                <Select value={String(options[o.key] ?? '')} onChange={(v) => setOpt(o.key, v)} options={o.choices} />
              </Field>
            );
          if (o.type === 'number')
            return (
              <Field key={o.key} label={o.label} hint={o.hint}>
                <input className="input" type="number" min={o.min} max={o.max} value={options[o.key] ?? ''} onChange={(e) => setOpt(o.key, e.target.value === '' ? o.default : Number(e.target.value))} />
              </Field>
            );
          return (
            <Field key={o.key} label={o.label} hint={o.hint}>
              <Input value={options[o.key] ?? ''} onChange={(v) => setOpt(o.key, v)} />
            </Field>
          );
        })}
        <div className="section-title" style={{ marginTop: 6 }}>All documents</div>
        <Switch checked={printSettings.showProjectTitle} onChange={(v) => setPrint({ showProjectTitle: v })} label="Project title in header" />
        <Switch checked={printSettings.showLogo} onChange={(v) => setPrint({ showLogo: v })} label="Show logo" />
        <Switch checked={printSettings.confidential} onChange={(v) => setPrint({ confidential: v })} label="Mark CONFIDENTIAL" />
        <Switch checked={printSettings.color} onChange={(v) => setPrint({ color: v })} label="Colour images" />
        <Field label="Watermark" hint="e.g. DRAFT — leave empty for none">
          <Input value={printSettings.watermark ?? ''} onChange={(v) => setPrint({ watermark: v })} placeholder="None" />
        </Field>
        <div className="spacer" />
        {desktop ? (
          <div className="muted tiny">The preview is the exact PDF. Print… opens it in a print-ready window (Ctrl+P).</div>
        ) : (
          <div className="muted tiny">In the browser, Print and Export open the system print dialog — choose “Save as PDF” to export.</div>
        )}
        {desktop && (
          <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => setOptions((o) => ({ ...o }))}>
            Refresh preview
          </Button>
        )}
      </div>
    </Modal>
  );
}
