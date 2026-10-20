/* Reports (derived overviews), printable documents, PDF export, page previews
   and script / archive files. */
import { strToU8, zipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import type { PaperSize } from '@/types';
import { backend } from '@/backend';
import { flushSave } from '@/store/autosave';
import { getScriptModel } from '@/derived/script';
import { PRINT_DOCS, getPrintDoc } from '@/print/registry';
import { buildDoc } from '@/print/run';
import { toJob } from '@/print/build';
import { toFountain } from '@/script-core/fountain';
import { toFdx } from '@/script-core/fdx';
import { safeFileName } from '@/lib/text';
import { mindTotals } from '@/lib/mind';
import { CATEGORY_BY_ID } from '@/lib/constants';
import { budgetTotals, projectEvents, readinessChecks, shootRange } from '@/modules/overview/derive';
import { summarize } from '@/modules/budget/calc';
import { characterStats } from '@/modules/cast/data';
import { setRows } from '@/modules/locations/data';
import { gearTotal, shootDayCount, categoryOrder } from '@/modules/gear/logic';
import { COLLECTIONS } from '../collections';
import { activeDoc, clean, fail, fmt, itemsOf, model, plural, project } from '../ctx';
import { SPACE_PRINT_DOCS, getSpacePrintDoc } from '@/spaces/print/registry';
import { buildSpaceDoc } from '@/spaces/print/run';
import type { BuiltDoc } from '@/print/build';
import { defineTool } from '../tool';
import { anyObj, arr, bool, enm, int, obj, opt, str } from '../schema';

const REPORTS = ['overview', 'readiness', 'timeline', 'breakdown', 'characters', 'budget', 'gear', 'sets'] as const;

function mcpBridge() {
  const m = window.prepro?.mcp;
  if (!m) fail('This needs the desktop app.');
  return m;
}

async function defaultFolder(): Promise<string> {
  const p = activeDoc().doc;
  const dir = await window.prepro?.projectDir(p.id);
  if (!dir) fail('No project folder (desktop app only).');
  return `${dir}\\exports`;
}

function joinPath(folder: string, name: string) {
  return `${folder.replace(/[\\/]+$/, '')}\\${name}`;
}

function checkDoc(docId: string): { reason: string | false | undefined } {
  const a = activeDoc();
  if (a.kind === 'space') {
    const def = getSpacePrintDoc(docId);
    if (!def) fail(`Unknown document "${docId}" for this Marketing Space. Call list_documents.`);
    return { reason: def.emptyReason?.(a.doc) };
  }
  const def = getPrintDoc(docId);
  if (!def) fail(`Unknown document "${docId}". Call list_documents.`);
  const p = project();
  return { reason: def.emptyReason?.(p, getScriptModel(p)) };
}

/** Build a document of the open project or space. */
function build(docId: string, options: Record<string, unknown>, paper?: PaperSize): BuiltDoc {
  return activeDoc().kind === 'space' ? buildSpaceDoc(docId, options, paper) : buildDoc(docId, options, paper);
}

export const outputTools = [
  defineTool({
    name: 'get_report',
    title: 'Production reports',
    description:
      'Computed overviews: "overview" (key info, counts, budget total, shoot dates, readiness score), "readiness" (pre-production checklist: what is done / missing), "timeline" (all dated events: shoot days, milestones, post, deliverables, tasks), "breakdown" (per scene: cast, extras and elements by category), "characters" (scenes, speeches, words, actor), "budget" (sections, categories, contingency, grand total, actuals), "gear" (totals by category), "sets" (script sets and which location each is mapped to).',
    readOnly: true,
    input: obj({ report: enm(REPORTS) }),
    run({ report }: { report: (typeof REPORTS)[number] }) {
      const p = project();
      const m = model(p);
      const f = fmt(p);
      switch (report) {
        case 'overview': {
          const checks = readinessChecks(p, m);
          const done = checks.filter((c) => c.done || c.na).length;
          const bt = budgetTotals(p.budget);
          const range = shootRange(p);
          return {
            data: clean({
              title: p.meta.title,
              type: p.meta.projectType,
              status: p.meta.status,
              logline: p.meta.logline,
              client: p.meta.client,
              director: p.meta.director,
              producer: p.meta.producer,
              format: `${p.meta.aspectRatio} · ${p.meta.resolution} · ${p.meta.frameRate} fps`,
              targetRuntime: p.meta.targetRuntime,
              script: { mode: p.script.mode, scenes: m.scenes.length, pages: m.pageCount, estMinutes: m.estMinutes, avRows: p.script.av.rows.length, mindNotes: mindTotals(p.script.mind).notes, mindBoards: p.script.mind?.boards.length },
              shoot: { ...range, days: p.schedule.days.length },
              delivery: p.meta.deliveryDate,
              counts: Object.fromEntries(COLLECTIONS.filter((c) => !c.parent && c.kind === 'array').map((c) => [c.name, itemsOf(c, p).length])),
              budget: { total: f.money(bt.total), actual: f.money(bt.actual), lines: bt.lines },
              readiness: `${done}/${checks.length}`,
              nextUp: projectEvents(p, m)
                .filter((e) => e.date >= new Date().toISOString().slice(0, 10) && !e.done)
                .slice(0, 8)
                .map((e) => `${e.date} — ${e.label}`),
            }),
          };
        }
        case 'readiness':
          return { data: readinessChecks(p, m).map((c) => clean({ check: c.label, done: c.done, na: c.na, progress: Math.round(c.progress * 100) + '%', detail: c.detail, missing: c.missing?.slice(0, 12), module: c.module })) };
        case 'timeline':
          return { data: projectEvents(p, m, { tasks: true }).map((e) => clean({ date: e.date, end: e.end, kind: e.kind, label: e.label, detail: e.detail, done: e.done })) };
        case 'breakdown': {
          const chars = new Map(p.characters.map((c) => [c.id, c.name]));
          const els = new Map(p.elements.map((e) => [e.id, e]));
          return {
            data: m.scenes.map((s) => {
              const byCat: Record<string, string[]> = {};
              for (const id of s.elementIds) {
                const e = els.get(id);
                if (e) (byCat[CATEGORY_BY_ID[e.category]?.label ?? e.category] ??= []).push(e.name);
              }
              return clean({ sceneId: s.id, number: s.number, heading: s.heading, length: f.eighths(s.eighths), cast: s.characterIds.map((id) => chars.get(id) ?? id), extras: s.meta?.extras, elements: byCat });
            }),
          };
        }
        case 'characters': {
          const stats = characterStats(p.characters, m);
          return {
            data: p.characters.map((c) => {
              const st = stats.get(c.id);
              return clean({ id: c.id, name: c.name, number: c.number, actor: p.cast.find((x) => x.id === c.castId)?.name, scenes: st?.scenes.map((s) => s.number), speeches: st?.speeches, words: st?.words, pages: st ? f.eighths(st.eighths) : undefined });
            }),
          };
        }
        case 'budget': {
          const s = summarize(p.budget);
          return {
            data: {
              currency: p.settings.currency,
              sections: s.sections.map((sec) => ({ section: sec.def.label, total: f.money(sec.total), actual: f.money(sec.actual), categories: sec.cats.map((c) => clean({ id: c.cat.id, code: c.cat.code, name: c.cat.name, total: f.money(c.total), actual: c.actual ? f.money(c.actual) : undefined })) })),
              subtotal: f.money(s.subtotal),
              contingency: `${s.contingencyPct}% = ${f.money(s.contingency)}`,
              insurance: s.insurancePct ? `${s.insurancePct}% = ${f.money(s.insurance)}` : undefined,
              tax: s.taxPct ? `${s.taxPct}% = ${f.money(s.tax)}` : undefined,
              grandTotal: f.money(s.grand),
              actual: f.money(s.actual),
            },
          };
        }
        case 'gear': {
          const days = shootDayCount(p);
          return {
            data: {
              shootDays: days,
              total: f.money(gearTotal(p.gear, days)),
              byCategory: categoryOrder(p.gear).map((cat) => {
                const items = p.gear.filter((g) => g.category === cat);
                return { category: cat, items: items.length, total: f.money(gearTotal(items, days)), unconfirmed: items.filter((g) => g.status === 'needed').length };
              }),
            },
          };
        }
        case 'sets':
          return { data: setRows(m, p.locations).map((r) => clean({ set: r.set, scenes: r.scenes.map((s) => s.number), pages: f.eighths(r.eighths), location: r.location?.name, locationId: r.location?.id, inScript: r.inScript })) };
      }
    },
  }),

  defineTool({
    name: 'list_documents',
    title: 'List printable documents',
    description:
      'Every printable / exportable document of the open project (screenplay, storyboards, shot list, lighting plots, cast & crew lists, breakdown sheets, schedules, call sheets, budget, post documents, blank templates …) or Marketing Space (one-sheet, strategy brief, campaign plan, content briefs & plan, calendar, posting schedule, shoot plan, results report, brand kit, ideas board) with options and whether it has content yet.',
    readOnly: true,
    global: true,
    input: obj({}),
    run() {
      const a = activeDoc();
      if (a.kind === 'space') {
        return {
          data: SPACE_PRINT_DOCS.map((d) =>
            clean({
              id: d.id,
              title: d.title,
              group: d.group,
              about: d.description,
              orientation: d.orientation,
              options: d.options?.map((o) => clean({ key: o.key, type: o.type, default: o.default, choices: o.type === 'select' ? o.choices.map((c) => c.value) : undefined, about: o.label + (o.hint ? ` (${o.hint})` : '') })),
              empty: d.emptyReason?.(a.doc) || undefined,
            }),
          ),
        };
      }
      const p = project();
      const m = getScriptModel(p);
      return {
        data: PRINT_DOCS.map((d) =>
          clean({
            id: d.id,
            title: d.title,
            group: d.group,
            about: d.description,
            orientation: d.orientation,
            options: d.options?.map((o) => clean({ key: o.key, type: o.type, default: o.default, choices: o.type === 'select' ? o.choices.map((c) => c.value) : undefined, about: o.label + (o.hint ? ` (${o.hint})` : '') })),
            empty: d.emptyReason?.(p, m) || undefined,
          }),
        ),
      };
    },
  }),

  defineTool({
    name: 'export_pdf',
    title: 'Export documents as PDF',
    global: true,
    description:
      'Renders one or more documents of the open project or space to PDF files on disk (default folder: its folder\'s "exports" subfolder) and returns their paths. With merge, all documents go into one PDF (production book / marketing plan). Options per document come from list_documents (e.g. call-sheet {dayId:"2"}, lighting-diagram {diagram:"all"}). paper overrides the project paper size.',
    input: obj({
      documents: { ...arr(obj({ docId: str(), options: opt(anyObj()) })), minItems: 1 },
      merge: opt(bool('combine into one PDF (production book)')),
      fileName: opt(str('file name for a merged PDF or a single document (".pdf" added)')),
      folder: opt(str('absolute output folder')),
      paper: opt(enm(['letter', 'a4'] as const)),
      open: opt(bool('open the PDF afterwards')),
    }),
    async run(a: { documents: { docId: string; options?: Record<string, unknown> }[]; merge?: boolean; fileName?: string; folder?: string; paper?: PaperSize; open?: boolean }) {
      const mcp = mcpBridge();
      if (!backend.renderPdfBytes) fail('PDF export needs the desktop app.');
      const doc0 = activeDoc();
      const docTitle: string = doc0.doc.meta.title;
      const bookName = doc0.kind === 'space' ? 'Marketing Plan' : 'Production Book';
      for (const d of a.documents) {
        const { reason } = checkDoc(d.docId);
        if (reason && a.documents.length === 1) fail(`${d.docId}: ${reason}`);
      }
      const folder = a.folder || (await defaultFolder());
      const paths: string[] = [];
      if (a.merge && a.documents.length > 1) {
        const merged = await PDFDocument.create();
        merged.setTitle(`${docTitle} — ${bookName}`);
        merged.setCreator('PrePro Studio');
        for (const part of a.documents) {
          const doc = build(part.docId, part.options ?? {}, a.paper);
          const bytes = await backend.renderPdfBytes(toJob(doc));
          const src = await PDFDocument.load(bytes);
          for (const pg of await merged.copyPages(src, src.getPageIndices())) merged.addPage(pg);
        }
        const name = `${safeFileName(a.fileName?.replace(/\.pdf$/i, '') || `${docTitle} - ${bookName}`)}.pdf`;
        paths.push(await mcp.writeFile(joinPath(folder, name), await merged.save()));
      } else {
        for (const part of a.documents) {
          const doc = build(part.docId, part.options ?? {}, a.paper);
          const bytes = await backend.renderPdfBytes(toJob(doc));
          const name = a.fileName && a.documents.length === 1 ? `${safeFileName(a.fileName.replace(/\.pdf$/i, ''))}.pdf` : doc.fileName;
          paths.push(await mcp.writeFile(joinPath(folder, name), bytes));
        }
      }
      if (a.open) for (const x of paths) backend.openPath?.(x);
      return { data: { files: paths }, summary: `Exported ${plural(paths.length, 'PDF')}` };
    },
  }),

  defineTool({
    name: 'preview_document',
    title: 'Look at a document page',
    description: 'Renders one page of a printable document of the open project or space as an image so you can check the layout (storyboards, lighting plots, call sheets, calendars, content briefs …). Page images of flowing documents are approximate; the PDF is exact.',
    readOnly: true,
    global: true,
    input: obj({ docId: str(), options: opt(anyObj()), page: opt(int('1-based page (default 1)', 1)), paper: opt(enm(['letter', 'a4'] as const)) }),
    async run(a: { docId: string; options?: Record<string, unknown>; page?: number; paper?: PaperSize }) {
      const mcp = mcpBridge();
      const { reason } = checkDoc(a.docId);
      if (reason) fail(`${a.docId}: ${reason}`);
      const doc = build(a.docId, a.options ?? {}, a.paper);
      const snap = await mcp.snapshot(doc.html, { paper: doc.paper, landscape: doc.orientation === 'landscape', page: a.page ?? 1 });
      return { text: `${doc.title} — page ${Math.min(a.page ?? 1, snap.pages)} of ${snap.approximate ? '≈' : ''}${snap.pages}`, images: [{ data: snap.data, mimeType: snap.mimeType }] };
    },
  }),

  defineTool({
    name: 'export_project_file',
    title: 'Export script or project files',
    description: 'Writes the screenplay as Fountain (.fountain) or Final Draft (.fdx), or the whole project as a PrePro Studio archive (.prepro.zip, re-importable on any computer). Default folder: the project folder\'s "exports" subfolder.',
    input: obj({ format: enm(['fountain', 'fdx', 'archive'] as const), folder: opt(str('absolute output folder')) }),
    async run(a: { format: 'fountain' | 'fdx' | 'archive'; folder?: string }) {
      const mcp = mcpBridge();
      await flushSave();
      const p = project();
      const folder = a.folder || (await defaultFolder());
      const title = safeFileName(p.meta.title);
      if (a.format === 'archive') {
        const files = await backend.readAllProjectFiles(p.id);
        const tree: Record<string, Uint8Array> = {};
        for (const f of files) tree[f.path] = f.data;
        tree['prepro-archive.json'] = strToU8(JSON.stringify({ format: 'prepro-studio-archive', version: 1, exportedAt: new Date().toISOString() }));
        const path = await mcp.writeFile(joinPath(folder, `${title}.prepro.zip`), zipSync(tree, { level: 6 }));
        return { data: { file: path }, summary: 'Exported a project archive' };
      }
      const m = getScriptModel(p);
      const synopses: Record<string, string> = {};
      for (const [id, meta] of Object.entries(p.scenes)) if (meta?.synopsis) synopses[id] = meta.synopsis;
      const locked = Object.values(p.scenes).some((x) => x?.number) || p.settings.script.sceneNumbers !== 'none' ? new Map(m.scenes.map((s) => [s.id, s.number])) : undefined;
      const opts = { titlePage: p.script.titlePage, sceneNumbers: locked, synopses };
      const text = a.format === 'fountain' ? toFountain(m.paras, opts) : toFdx(m.paras, opts);
      const path = await mcp.writeFile(joinPath(folder, `${title}.${a.format}`), text);
      return { data: { file: path }, summary: `Exported the script (${a.format})` };
    },
  }),
];
