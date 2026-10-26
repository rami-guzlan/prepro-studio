/* Exports of the design system.
   - zip  = a portable bundle any agent can read:
       README.md            the guide (compileGuide) — read this first
       SKILL.md             a tiny skill file pointing at README.md (Claude skills / Claude Design)
       design-system.json   everything as structured JSON
       tokens.json          design tokens (W3C $value / $type)
       tokens.css           CSS custom properties (:root + one block per theme)
       briefs/<slug>.md     one file per generation brief
       logos/ fonts/ images/ templates/ files/   asset files at bundlePath(asset)
       sources/<source>/…   imported docs (README.md, SKILL.md …) and preview cards, verbatim
   - md / json / css = single files.
   Files are saved with the backend's save dialog (desktop) or a download (web / cloud). */
import { strToU8, zipSync } from 'fflate';
import type { SpaceData } from '@/spaces/types';
import { backend, saveBinaryFile, saveTextFile } from '@/backend';
import { getSpace } from '@/store/space';
import { safeFileName, slugify } from '@/lib/text';
import { toast } from '@/ui/Toast';
import { bundlePath, compileBrief, compileCss, compileGuide, compileTokens, dsOf } from './compile';
import { designSystemJson } from './structured';

/** zip = the full bundle (README.md guide, tokens.json, tokens.css, logos/, fonts/, images/, briefs/) */
export type DSExportFormat = 'zip' | 'md' | 'json' | 'css';

/** Base name of exported files, e.g. "The Last Take design system". */
export function dsExportName(s: SpaceData): string {
  const ds = dsOf(s);
  return safeFileName(ds.name?.trim() || `${s.meta.title} design system`);
}

function skillMd(s: SpaceData): string {
  const ds = dsOf(s);
  const name = slugify(ds.name || `${s.meta.title} design system`, 60);
  const desc = (ds.summary || s.meta.description || `The design system of ${s.meta.title}`).replace(/\s+/g, ' ').trim();
  return `---
name: ${name}
description: ${JSON.stringify(`Design system and art direction for ${s.meta.title}. Use for any visual, slide, page, image prompt or UI for this brand. ${desc}`.slice(0, 900))}
---

# ${ds.name || `${s.meta.title} design system`}

Before you design or generate anything visual for this brand, read \`README.md\` in this folder: it is the complete guide (intent, colour, type, tokens, components, art direction, rules by level, references, formats, briefs, review).

- Tokens: \`tokens.css\` (CSS custom properties, one block per theme) and \`tokens.json\` (W3C design tokens).
- Everything as structured data: \`design-system.json\`.
- Real logo, font and image files: \`logos/\`, \`fonts/\`, \`images/\`. Never redraw logos or render exact text inside generated images — place the real files afterwards.
- Ready-made generation briefs: \`briefs/\`.
`;
}

/** Files of the bundle (path → bytes). Reads asset files through the backend. */
export async function buildDesignSystemBundle(s: SpaceData, opts: { includeSources?: boolean } = {}): Promise<{ files: Record<string, Uint8Array>; missing: string[] }> {
  const ds = dsOf(s);
  const files: Record<string, Uint8Array> = {};
  const missing: string[] = [];
  files['README.md'] = strToU8(compileGuide(s, { includeSources: false }));
  files['SKILL.md'] = strToU8(skillMd(s));
  files['design-system.json'] = strToU8(JSON.stringify(designSystemJson(s), null, 2));
  files['tokens.json'] = strToU8(JSON.stringify(compileTokens(s), null, 2));
  files['tokens.css'] = strToU8(compileCss(s));
  const used = new Set<string>();
  for (const b of ds.briefs) {
    let slug = slugify(b.name || 'brief', 60);
    while (used.has(slug)) slug += '-2';
    used.add(slug);
    files[`briefs/${slug}.md`] = strToU8(compileBrief(s, b));
  }
  for (const a of s.assets) {
    if (!['logo', 'font', 'image', 'template'].includes(a.kind)) continue;
    const path = bundlePath(a);
    const stored = a.file || a.image;
    if (!path || !stored) continue;
    try {
      const bytes = await backend.readAsset(s.id, stored);
      if (bytes) files[path] = bytes;
      else missing.push(a.name || stored);
    } catch {
      missing.push(a.name || stored);
    }
  }
  if (opts.includeSources !== false) {
    const usedSrc = new Set<string>();
    for (const src of ds.sources) {
      let base = slugify(src.fileName.replace(/\.[^.]+$/, ''), 50);
      while (usedSrc.has(base)) base += '-2';
      usedSrc.add(base);
      for (const d of src.docs) files[`sources/${base}/${d.path}`] = strToU8(d.text);
      for (const c of src.cards) {
        try {
          const bytes = await backend.readAsset(s.id, c.file);
          if (bytes) files[`sources/${base}/${c.path}`] = bytes;
        } catch {
          missing.push(c.path);
        }
      }
    }
  }
  return { files, missing };
}

/** The bundle as zip bytes. */
export async function buildDesignSystemZip(s: SpaceData): Promise<{ bytes: Uint8Array; missing: string[] }> {
  const { files, missing } = await buildDesignSystemBundle(s);
  const tree: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
  for (const [p, b] of Object.entries(files)) tree[p] = [b, { level: /\.(png|jpe?g|webp|gif|woff2?|zip|avif)$/i.test(p) ? 0 : 6 }];
  return { bytes: zipSync(tree), missing };
}

/** Single-file exports as text. */
export function designSystemText(s: SpaceData, format: 'md' | 'json' | 'css'): { fileName: string; text: string } {
  const base = dsExportName(s);
  if (format === 'md') return { fileName: `${base}.md`, text: compileGuide(s, { includeSources: true }) };
  if (format === 'json') return { fileName: `${base} tokens.json`, text: JSON.stringify(compileTokens(s), null, 2) };
  return { fileName: `${base} tokens.css`, text: compileCss(s) };
}

function saved(path: string | null, fileName: string) {
  if (path) toast(`Saved ${fileName}`, 'success', { action: backend.reveal ? { label: 'Show', onClick: () => backend.reveal!(path) } : undefined });
}

export async function exportDesignSystem(format: DSExportFormat): Promise<void> {
  const s = getSpace();
  if (format === 'zip') {
    const { bytes, missing } = await buildDesignSystemZip(s);
    const fileName = `${dsExportName(s)}.zip`;
    const path = await saveBinaryFile(fileName, bytes, [{ name: 'Zip archive', extensions: ['zip'] }]);
    saved(path, fileName);
    if (missing.length) toast(`${missing.length} file${missing.length === 1 ? '' : 's'} could not be read and ${missing.length === 1 ? 'is' : 'are'} missing from the bundle`, 'info');
    return;
  }
  const { fileName, text } = designSystemText(s, format);
  const filters = format === 'md' ? [{ name: 'Markdown', extensions: ['md'] }] : format === 'json' ? [{ name: 'JSON', extensions: ['json'] }] : [{ name: 'CSS', extensions: ['css'] }];
  saved(await saveTextFile(fileName, text, filters), fileName);
}
