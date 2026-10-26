/* The design system as one structured JSON object for agents and tools
   (design_system {action:"get", format:"json"}, design-system.json in the
   bundle). Asset references are resolved to names and bundle paths so the
   output stands on its own. Pure: no store, no backend. */
import type { SpaceData, BrandAsset } from '@/spaces/types';
import { bundlePath, compileTokens, dsOf, formatSize, LEVEL_LABEL, REFERENCE_ROLE_HINT, typeSpec } from './compile';

const clean = <T,>(v: T): T => {
  if (Array.isArray(v)) return v.map(clean) as unknown as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      if (x === undefined || x === null || x === '') continue;
      if (Array.isArray(x) && !x.length) continue;
      if (x && typeof x === 'object' && !Array.isArray(x) && !Object.keys(x).length) continue;
      out[k] = clean(x);
    }
    return out as T;
  }
  return v;
};

function assetRef(a: BrandAsset | undefined) {
  if (!a) return undefined;
  return clean({ id: a.id, name: a.name, kind: a.kind, file: bundlePath(a) || undefined, storedAs: a.file || a.image, url: a.url });
}

/** Everything an agent needs, as JSON. */
export function designSystemJson(s: SpaceData): Record<string, unknown> {
  const ds = dsOf(s);
  const asset = (id?: string) => (id ? s.assets.find((a) => a.id === id) : undefined);
  const campaign = (id?: string) => (id ? s.campaigns.find((c) => c.id === id)?.name : undefined);
  const themeName = (id: string) => ds.themes.find((t) => t.id === id)?.name ?? id;
  return clean({
    name: ds.name || `${s.meta.title} design system`,
    summary: ds.summary || s.meta.description,
    version: ds.version,
    updatedAt: ds.updatedAt,
    howToUse: ds.agentNotes,
    levels: { required: 'must always hold', preferred: 'the default — deviate only with a reason', open: 'up to the maker' },
    scopes: { brand: 'applies everywhere', campaign: 'only for the named campaign — never carry into other work' },
    intent: { ...ds.intent, personality: ds.intent.personality.map((w) => ({ word: w.word, looksLike: w.looksLike })) },
    tokens: compileTokens(s),
    colors: s.assets
      .filter((a) => a.kind === 'color')
      .map((c) => ({ name: c.name, value: c.value, group: c.group, role: c.role, cssVar: c.cssVar, onColor: c.onColor, coverage: c.coverage, usage: c.notes })),
    themes: ds.themes.map((t) => ({ name: t.name, mode: t.mode, default: t.isDefault || undefined, notes: t.notes })),
    semanticTokens: ds.semanticTokens.map((t) => ({ name: t.name, description: t.description, values: Object.fromEntries(Object.entries(t.values).map(([k, v]) => [themeName(k), v])) })),
    typefaces: s.assets.filter((a) => a.kind === 'font').map((f) => ({ family: f.value || f.name, role: f.name !== f.value ? f.name : undefined, weights: f.weights, notes: f.notes, file: bundlePath(f) || undefined, url: f.url })),
    typeStyles: ds.typeStyles.map((t) => ({ ...t, id: undefined, spec: typeSpec(t) })),
    otherTokens: ds.tokens.map((t) => ({ group: t.group, name: t.name, value: t.value, notes: t.notes })),
    logos: s.assets.filter((a) => a.kind === 'logo').map((l) => ({ name: l.name, notes: l.notes, file: bundlePath(l) || undefined, storedAs: l.image || l.file, rule: 'use exactly as supplied — never redraw, recolour or distort' })),
    components: ds.components.map((c) => ({ ...c, id: undefined, preview: assetRef(asset(c.previewAssetId)), previewAssetId: undefined })),
    layouts: ds.layouts.map((l) => ({ ...l, id: undefined, format: ds.formats.find((f) => f.id === l.formatId)?.name, formatId: undefined, preview: assetRef(asset(l.previewAssetId)), previewAssetId: undefined })),
    artDirection: ds.artDirection,
    treatments: ds.treatments.map((t) => ({ name: t.name, level: t.level, description: t.description, whereToUse: t.whereToUse, avoid: t.avoid, example: assetRef(asset(t.exampleAssetId)) })),
    rules: ds.rules
      .filter((r) => r.text.trim())
      .map((r) => ({ id: r.id, level: r.level, levelLabel: LEVEL_LABEL[r.level], area: r.area, kind: r.kind, text: r.text, why: r.why, scope: r.scope, campaign: r.scope === 'campaign' ? campaign(r.campaignId) ?? 'one campaign only' : undefined })),
    references: ds.references.map((r) => ({
      id: r.id,
      title: r.title || asset(r.assetId)?.name,
      verdict: r.verdict,
      image: assetRef(asset(r.assetId)),
      controls: r.roles.map((x) => ({ role: x, meaning: REFERENCE_ROLE_HINT[x] ?? x })),
      borrow: r.borrow,
      ignore: r.ignore,
      why: r.why,
      mode: r.mode && r.mode !== 'any' ? r.mode : undefined,
      campaign: campaign(r.campaignId),
    })),
    formats: ds.formats.map((f) => ({ ...f, id: undefined, size: formatSize(f) || undefined })),
    briefs: ds.briefs.map((b) => ({
      id: b.id,
      name: b.name,
      objective: b.objective,
      audience: b.audience,
      format: ds.formats.find((f) => f.id === b.formatId)?.name,
      copy: b.copy,
      rules: b.ruleIds.map((id) => ds.rules.find((r) => r.id === id)?.text).filter(Boolean),
      references: b.referenceIds.map((id) => ds.references.find((r) => r.id === id)?.title).filter(Boolean),
      variation: b.variation,
      review: b.review,
      finishing: b.finishing,
      campaign: campaign(b.campaignId),
    })),
    review: ds.review,
    voice: clean({ tagline: s.strategy?.tagline, toneOfVoice: s.strategy?.voice, keyMessages: s.strategy?.keyMessages }),
    sources: ds.sources.map((x) => ({ fileName: x.fileName, importedAt: x.importedAt, summary: x.summary, docs: x.docs.map((d) => ({ path: d.path, title: d.title, chars: d.text.length })), cards: x.cards.length })),
  });
}
