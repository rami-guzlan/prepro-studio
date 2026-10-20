/* Script file exports (Fountain, Final Draft FDX, formatted plain text) and imports into the open project. */
import type { ProjectData } from '@/types';
import { getScriptModel } from '@/derived/script';
import { syncCharactersDraft } from '@/derived/script';
import { toFountain } from '@/script-core/fountain';
import { toFdx } from '@/script-core/fdx';
import { importScriptFile } from '@/script-core/importers';
import { paginate } from '@/script-core/pagination';
import { backend, saveTextFile } from '@/backend';
import { flushSave } from '@/store/autosave';
import { getProject, update } from '@/store/project';
import { safeFileName } from '@/lib/text';
import { toast } from '@/ui';

async function fresh(): Promise<ProjectData> {
  await flushSave();
  return getProject();
}

function synopses(p: ProjectData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, m] of Object.entries(p.scenes)) if (m.synopsis) out[id] = m.synopsis;
  return out;
}

function lockedNumbers(p: ProjectData): Map<string, string> | undefined {
  const model = getScriptModel(p);
  if (p.settings.script.sceneNumbers === 'none' && !Object.values(p.scenes).some((m) => m.number)) return undefined;
  return new Map(model.scenes.map((s) => [s.id, s.number]));
}

function done(path: string | null, name: string) {
  if (path) toast(`Saved ${name}`, 'success', { action: backend.reveal ? { label: 'Show', onClick: () => backend.reveal!(path) } : undefined });
}

export async function exportFountain() {
  const p = await fresh();
  const model = getScriptModel(p);
  const text = toFountain(model.paras, { titlePage: p.script.titlePage, sceneNumbers: lockedNumbers(p), synopses: synopses(p) });
  const name = `${safeFileName(p.meta.title)}.fountain`;
  done(await saveTextFile(name, text, [{ name: 'Fountain screenplay', extensions: ['fountain'] }]), name);
}

export async function exportFdx() {
  const p = await fresh();
  const model = getScriptModel(p);
  const xml = toFdx(model.paras, { titlePage: p.script.titlePage, sceneNumbers: lockedNumbers(p), synopses: synopses(p) });
  const name = `${safeFileName(p.meta.title)}.fdx`;
  done(await saveTextFile(name, xml, [{ name: 'Final Draft document', extensions: ['fdx'] }]), name);
}

/** Formatted plain text using the real pagination (monospace, page numbers). */
export async function exportPlainText() {
  const p = await fresh();
  const model = getScriptModel(p);
  const pag = paginate(model.paras, { settings: p.settings.script, paper: p.settings.paperSize, contdParas: model.contdParas, sceneNumbers: model.sceneNumbers });
  const out: string[] = [];
  const W = 60;
  for (const page of pag.pages) {
    if (page.number > 1) out.push('\f', ' '.repeat(W - String(page.number).length - 1) + `${page.number}.`, '');
    const rows = new Map<number, string>();
    for (const ln of page.lines) {
      const text = ln.runs.map((r) => r.text).join('');
      const col = Math.max(0, Math.round((ln.left - 1.5) * 10));
      let line = rows.get(ln.row) ?? '';
      let start = col;
      if (ln.align === 'right') start = Math.max(0, Math.round((ln.left + ln.width - 1.5) * 10) - text.length);
      if (ln.align === 'center') start = Math.max(0, col + Math.round((ln.width * 10 - text.length) / 2));
      if (line.length < start) line = line.padEnd(start, ' ');
      line = line.slice(0, start) + text;
      rows.set(ln.row, line);
    }
    const max = Math.max(-1, ...rows.keys());
    for (let r = 0; r <= max; r++) out.push((rows.get(r) ?? '').replace(/\s+$/, ''));
  }
  const name = `${safeFileName(p.meta.title)}.txt`;
  done(await saveTextFile(name, out.join('\r\n') + '\r\n', [{ name: 'Text', extensions: ['txt'] }]), name);
}

/** Import a Fountain / FDX / TXT file into the open project (replace or append). */
export async function importIntoProject(mode: 'replace' | 'append') {
  const files = await backend.openFiles({
    title: 'Import a screenplay',
    filters: [
      { name: 'Screenplays', extensions: ['fountain', 'spmd', 'fdx', 'txt', 'md'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (!files.length) return;
  try {
    await flushSave();
    const imported = importScriptFile(files[0].name, files[0].data);
    update((d) => {
      if (mode === 'replace') {
        d.script.doc = imported.doc as any;
        if (imported.titlePage.title) d.script.titlePage = { ...d.script.titlePage, ...imported.titlePage };
      } else {
        const cur = (d.script.doc as any)?.content ?? [];
        const curIsEmpty = cur.length === 1 && !(cur[0].content?.length);
        d.script.doc = { type: 'doc', content: [...(curIsEmpty ? [] : cur), ...((imported.doc as any).content ?? [])] } as any;
      }
      for (const [sid, m] of Object.entries(imported.scenes)) d.scenes[sid] = { ...(d.scenes[sid] ?? {}), ...m };
      d.script.revision++;
      syncCharactersDraft(d);
    }, { history: false });
    toast(`Imported ${imported.parsed.paras.length} paragraphs from “${files[0].name}”`);
  } catch (e) {
    toast(`Import failed: ${e instanceof Error ? e.message : e}`, 'error');
  }
}
