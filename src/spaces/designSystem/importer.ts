/* Import of design-system files into the open Marketing Space: a Claude Design
   design-system .zip (or any design-system zip), loose Markdown / CSS / tokens
   JSON / images / fonts / HTML cards.
   parse.ts reads the files (pure, untrusted input); this file stores the files
   through the backend (Electron, web and cloud alike) and merges everything into
   the space in ONE undo step. Re-importing a file with the same name replaces
   that source's docs / cards and updates items matched by name. */
import type { Draft } from 'immer';
import type { BrandAsset, SpaceData } from '@/spaces/types';
import type { DesignSystem, DSComponent, DSLayout, DSSource } from './types';
import { backend } from '@/backend';
import { getSpace } from '@/store/space';
import { uid } from '@/lib/id';
import { dsNewId, dsUpdate } from './ops';
import { DS_ACCEPT_EXT, extOf, parseDesignSystemFiles, summarizeParsed, type DSInputFile, type DSParsed, type ParsedFile } from './parse';

export interface DSImportResult {
  /** one-line summary, e.g. "18 colours, 9 type styles, 4 logos, README" */
  summary: string;
  warnings: string[];
  /** what was imported (new + updated), for tests and agents */
  counts?: Record<string, number>;
  /** the DSSource the import created or replaced */
  sourceId?: string;
}

/** The cloud server accepts assets up to 31 MB; keep the stored original below that. */
const MAX_ORIGINAL = 30 * 1024 * 1024;

const lc = (s: string | undefined) => (s ?? '').trim().toLowerCase();

function sourceNameOf(files: DSInputFile[]): string {
  const names = files.map((f) => f.name.split(/[\\/]/).pop() || 'file');
  if (names.length === 1) return names[0];
  const s = [...names].sort().join(', ');
  return s.length > 120 ? `${s.slice(0, 117)}…` : s;
}

/** Import files (a Claude Design design-system .zip, tokens.json, .css, .md, images, fonts, .html). */
export async function importDesignSystemFiles(files: { name: string; data: Uint8Array }[]): Promise<DSImportResult> {
  const space = getSpace();
  if (!space) throw new Error('Open a Marketing Space first');
  if (!files.length) return { summary: 'Nothing to import', warnings: [] };
  const sourceName = sourceNameOf(files);
  const parsed = parseDesignSystemFiles(files, sourceName);
  const warnings = [...parsed.warnings];
  const sid = space.id;

  /* ---------------- store files (outside the undo step: assets are append-only) */
  const stored = new Map<string, string>();
  const existing = space.assets;
  for (const f of parsed.files) {
    const reuse = f.kind !== 'card' ? existing.find((a) => a.fileName === f.path && a.fileSize === f.data.length && (a.tags ?? []).includes(sourceName)) : undefined;
    const name = reuse ? reuse.image || reuse.file : undefined;
    if (name) {
      stored.set(f.path, name);
      continue;
    }
    try {
      stored.set(f.path, await backend.importAsset(sid, f.data, f.ext || extOf(f.path) || 'bin'));
    } catch (e) {
      warnings.push(`Could not store ${f.path}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  let original: string | undefined;
  if (files.length === 1) {
    const f = files[0];
    if (f.data.length <= MAX_ORIGINAL) {
      try {
        original = await backend.importAsset(sid, f.data, extOf(f.name) || 'bin');
      } catch (e) {
        warnings.push(`Could not keep the original file: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else warnings.push('The original file is too large to keep a copy (it was still imported)');
  }

  const counts: Record<string, number> = {};
  const bump = (k: string, n = 1) => (counts[k] = (counts[k] ?? 0) + n);
  let sourceId = '';

  /* ---------------- merge in one undo step */
  dsUpdate((ds, d) => {
    sourceId = mergeParsed(ds, d, parsed, { sourceName, stored, original, bump });
  });

  const summary = summarizeParsed(parsed);
  return { summary, warnings, counts, sourceId };
}

interface MergeCtx {
  sourceName: string;
  stored: Map<string, string>;
  original?: string;
  bump: (k: string, n?: number) => void;
}

function mergeParsed(ds: Draft<DesignSystem>, d: Draft<SpaceData>, p: DSParsed, c: MergeCtx): string {
  const { sourceName, stored, bump } = c;
  if (!ds.name?.trim() && p.name) ds.name = p.name;
  if (!ds.summary?.trim() && p.summary) ds.summary = p.summary;

  /* ---- colours (assets) */
  for (const col of p.colors) {
    const hit = d.assets.find((a) => a.kind === 'color' && ((col.cssVar && a.cssVar === col.cssVar) || lc(a.name) === lc(col.name)));
    if (hit) {
      hit.value = col.value;
      if (col.cssVar) hit.cssVar = col.cssVar;
      if (col.group) hit.group = col.group;
      if (col.role) hit.role = col.role;
      if (col.notes && !hit.notes) hit.notes = col.notes;
      bump('colorsUpdated');
    } else {
      d.assets.push(clean({ id: uid('ast'), kind: 'color', name: col.name, value: col.value, cssVar: col.cssVar, group: col.group, role: col.role, notes: col.notes, tags: [sourceName] }) as BrandAsset);
      bump('colors');
    }
  }

  /* ---- files: logos, images, fonts */
  const assetIdByPath = new Map<string, string>();
  for (const f of p.files) {
    if (f.kind === 'card') continue;
    const name = stored.get(f.path);
    if (!name) continue;
    const hit = d.assets.find((a) => a.fileName === f.path && (a.tags ?? []).includes(sourceName) && (a.kind === f.kind || (f.kind !== 'font' && (a.kind === 'logo' || a.kind === 'image'))));
    const patch: Partial<BrandAsset> = f.kind === 'font' ? { file: name, value: f.family, weights: f.weight ? String(f.weight) : undefined } : { image: name };
    if (hit) {
      Object.assign(hit, clean(patch));
      hit.fileSize = f.data.length;
      assetIdByPath.set(f.path, hit.id);
      bump(`${f.kind}sUpdated`);
    } else {
      const a = clean({ id: uid('ast'), kind: f.kind, name: f.name, fileName: f.path, fileSize: f.data.length, tags: f.tags, ...patch }) as BrandAsset;
      d.assets.push(a);
      assetIdByPath.set(f.path, a.id);
      bump(`${f.kind}s`);
    }
  }

  /* ---- font families without a file of their own */
  for (const fam of p.families) {
    const fileAssets = d.assets.filter((a) => a.kind === 'font' && lc(a.value) === lc(fam.family));
    const weights = fam.weights.length ? fam.weights.join(', ') : undefined;
    if (fileAssets.length) {
      const own = fileAssets.find((a) => !a.file) ?? (fileAssets.length === 1 ? fileAssets[0] : undefined);
      if (own && weights && (!own.weights || own.weights.split(',').length < fam.weights.length)) own.weights = weights;
      continue;
    }
    d.assets.push(clean({ id: uid('ast'), kind: 'font', name: fam.role || fam.family, value: fam.family, weights, notes: fam.stack && fam.stack !== fam.family ? `CSS: ${fam.stack}` : undefined, tags: [sourceName] }) as BrandAsset);
    bump('fonts');
  }

  /* ---- themes & semantic tokens */
  const themeId = new Map<string, string>();
  const hasDefault = ds.themes.some((t) => t.isDefault);
  for (const t of p.themes) {
    const hit = ds.themes.find((x) => lc(x.name) === lc(t.name));
    if (hit) {
      themeId.set(t.key, hit.id);
      continue;
    }
    const id = dsNewId('themes');
    ds.themes.push(clean({ id, name: t.name, mode: t.mode, isDefault: t.isDefault && !hasDefault ? true : undefined }));
    themeId.set(t.key, id);
    bump('themes');
  }
  for (const st of p.semantic) {
    const values: Record<string, string> = {};
    for (const [k, v] of Object.entries(st.values)) if (themeId.has(k)) values[themeId.get(k)!] = v;
    const hit = ds.semanticTokens.find((x) => x.name === st.name);
    if (hit) {
      Object.assign(hit.values, values);
      if (st.description && !hit.description) hit.description = st.description;
      bump('semanticTokensUpdated');
    } else {
      ds.semanticTokens.push(clean({ id: dsNewId('semanticTokens'), name: st.name, description: st.description, values }));
      bump('semanticTokens');
    }
  }

  /* ---- type styles & tokens */
  for (const t of p.typeStyles) {
    const hit = ds.typeStyles.find((x) => lc(x.name) === lc(t.name));
    if (hit) {
      Object.assign(hit, clean(t));
      bump('typeStylesUpdated');
    } else {
      ds.typeStyles.push(clean({ ...t, id: dsNewId('typeStyles') }));
      bump('typeStyles');
    }
  }
  for (const t of p.tokens) {
    const hit = ds.tokens.find((x) => x.group === t.group && x.name === t.name);
    if (hit) {
      hit.value = t.value;
      if (t.notes) hit.notes = t.notes;
      bump('tokensUpdated');
    } else {
      ds.tokens.push(clean({ ...t, id: dsNewId('tokens') }));
      bump('tokens');
    }
  }

  /* ---- components & layouts (pointing at the stored html) */
  for (const comp of p.components) {
    const file = comp.cardPath ? stored.get(comp.cardPath) : undefined;
    const preview = comp.previewPath ? assetIdByPath.get(comp.previewPath) : undefined;
    const hit = ds.components.find((x) => lc(x.name) === lc(comp.name));
    if (hit) {
      if (file) hit.file = file;
      if (preview && !hit.previewAssetId) hit.previewAssetId = preview;
      if (comp.code && !hit.code) hit.code = comp.code;
      if (comp.description && !hit.description) hit.description = comp.description;
      bump('componentsUpdated');
    } else {
      ds.components.push(clean<DSComponent>({ id: dsNewId('components'), name: comp.name, category: comp.category, description: comp.description, file, previewAssetId: preview, code: comp.code }));
      bump('components');
    }
  }
  for (const l of p.layouts) {
    const file = l.cardPath ? stored.get(l.cardPath) : undefined;
    const preview = l.previewPath ? assetIdByPath.get(l.previewPath) : undefined;
    const hit = ds.layouts.find((x) => lc(x.name) === lc(l.name));
    if (hit) {
      if (file) hit.file = file;
      if (preview && !hit.previewAssetId) hit.previewAssetId = preview;
      bump('layoutsUpdated');
    } else {
      ds.layouts.push(clean<DSLayout>({ id: dsNewId('layouts'), name: l.name, kind: l.kind, description: l.description, file, previewAssetId: preview }));
      bump('layouts');
    }
  }

  /* ---- the source (docs verbatim, cards) */
  const cards = p.files
    .filter((f): f is ParsedFile & { title: string } => f.kind === 'card' && stored.has(f.path))
    .map((f) => clean({ path: f.path, title: f.title || f.name, file: stored.get(f.path)!, category: f.category }));
  const src: Omit<DSSource, 'id'> = clean({
    fileName: sourceName,
    file: c.original,
    importedAt: new Date().toISOString(),
    summary: summarizeParsed(p),
    docs: p.docs,
    cards,
  });
  const prev = ds.sources.find((x) => x.fileName === sourceName);
  bump('docs', p.docs.length);
  bump('cards', cards.length);
  if (prev) {
    Object.assign(prev, src);
    if (!c.original) delete prev.file;
    return prev.id;
  }
  const id = dsNewId('sources');
  ds.sources.push({ id, ...src, docs: src.docs ?? [], cards: src.cards ?? [] } as DSSource);
  return id;
}

/** Remove undefined / empty-string fields. */
function clean<T extends object>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') out[k] = v;
  return out as T;
}

/** File-picker filters for design-system files. */
export const DS_IMPORT_FILTERS = [
  { name: 'Design system (zip, Markdown, CSS, tokens JSON, images, fonts, HTML)', extensions: DS_ACCEPT_EXT },
  { name: 'Zip archive', extensions: ['zip'] },
];

/** Ask for files with the file picker, then import them. Returns null when cancelled. */
export async function pickAndImportDesignSystem(): Promise<DSImportResult | null> {
  const files = await backend.openFiles({ filters: DS_IMPORT_FILTERS, multiple: true, title: 'Import a design system' });
  if (!files.length) return null;
  return importDesignSystemFiles(files.map((f) => ({ name: f.name, data: f.data })));
}
