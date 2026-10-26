/* Design system › Typography: typefaces (font assets) and the type scale with live specimens. */
import { useMemo, type CSSProperties } from 'react';
import { ExternalLink, Plus, TriangleAlert, Type } from 'lucide-react';
import type { BrandAsset } from '@/spaces/types';
import type { DSTextCase, DSTypeStyle } from '../types';
import { useSpace } from '@/store/space';
import { Button, Checkbox, Combo, Field, IconButton, Input, Select } from '@/ui';
import { addAssets, assetOps, deleteAsset, fontAvailable, makeAsset, openUrl } from '@/spaces/modules/assets/actions';
import { fontStack } from '@/spaces/modules/assets/util';
import { typeSpec } from '../compile';
import { dsAdd, dsMove, dsNewId, dsPatch, dsRemove, dsSet, dsUpdate } from '../ops';
import { TEXT_CASES, WEIGHTS } from './options';
import { ItemActions, SectionHead, SubHead, Teach, confirmRemove, useAssets, useDS } from './shared';

function focusRow(id: string) {
  setTimeout(() => {
    const el = document.querySelector<HTMLElement>(`[data-ds-id="${id}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    el?.querySelector<HTMLInputElement>('input')?.focus();
  }, 40);
}

/* ---------------------------------------------------------------- typefaces */

function FontRow({ a }: { a: BrandAsset }) {
  const fam = a.value?.trim();
  const ok = fam ? fontAvailable(fam) : true;
  const up = (patch: Partial<BrandAsset>) => assetOps.update(a.id, patch);
  return (
    <div className="ds-font" data-ds-id={a.id}>
      <div className="ds-font-sample" style={{ fontFamily: fontStack(fam) }} aria-hidden>
        Aa
      </div>
      <div className="ds-font-fields">
        <Field label="Family">
          <Input size="sm" className="strong" value={a.value} placeholder="e.g. Montserrat" onChange={(value) => up({ value })} />
        </Field>
        <Field label="Role">
          <Input size="sm" value={a.name} placeholder="e.g. Headlines" onChange={(name) => up({ name })} />
        </Field>
        <Field label="Weights">
          <Input size="sm" value={a.weights} placeholder="e.g. 400, 700, 800" onChange={(weights) => up({ weights: weights || undefined })} />
        </Field>
        <Field label={a.file ? 'File' : 'Download / licence link'}>
          {a.file ? (
            <span className="ds-font-file ellipsis" title={a.fileName}>
              {a.fileName || 'Font file'}
            </span>
          ) : (
            <div className="row" style={{ gap: 2 }}>
              <Input size="sm" value={a.url} placeholder="https://fonts.google.com/…" onChange={(url) => up({ url: url || undefined })} />
              {a.url?.trim() && <IconButton icon={ExternalLink} size="sm" label="Open link" onClick={() => openUrl(a.url)} />}
            </div>
          )}
        </Field>
        <Field label="Usage" span="all">
          <Input size="sm" value={a.notes} placeholder="Where to use it, sizes, licence notes…" onChange={(notes) => up({ notes: notes || undefined })} />
        </Field>
      </div>
      <div className="ds-item-actions col">
        {fam && !ok && (
          <span className="ds-warn" title="Not installed on this computer: previews use a fallback font.">
            <TriangleAlert size={13} />
          </span>
        )}
        <ItemActions index={0} count={1} label="font" onDelete={() => void deleteAsset(a)} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- type styles */

const CASE_CSS: Record<DSTextCase, CSSProperties['textTransform']> = { none: 'none', upper: 'uppercase', lower: 'lowercase', title: 'capitalize', sentence: 'none' };

/** Specimen sizes are shown at their real size up to 96px. */
function specimenStyle(t: DSTypeStyle): CSSProperties {
  const size = t.size?.trim();
  const px = size && /^[\d.]+px$/.test(size) ? parseFloat(size) : undefined;
  return {
    fontFamily: fontStack(t.family),
    fontWeight: t.weight,
    fontSize: px ? `${Math.min(px, 96)}px` : size || undefined,
    lineHeight: t.lineHeight || undefined,
    letterSpacing: t.letterSpacing || undefined,
    textTransform: t.case ? CASE_CSS[t.case] : undefined,
    fontStyle: t.italic ? 'italic' : undefined,
  };
}

function StyleRow({ t, index, count, families, sample }: { t: DSTypeStyle; index: number; count: number; families: string[]; sample: string }) {
  const up = (patch: Partial<DSTypeStyle>, coalesce = true) => dsPatch('typeStyles', t.id, patch, coalesce);
  const big = t.size && /^[\d.]+px$/.test(t.size.trim()) && parseFloat(t.size) > 96;
  return (
    <div className="ds-tstyle" data-ds-id={t.id}>
      <div className="ds-tstyle-specimen" title={typeSpec(t)}>
        <div className="ds-tstyle-text" style={specimenStyle(t)}>
          {t.case === 'sentence' ? sample.charAt(0).toUpperCase() + sample.slice(1).toLowerCase() : sample}
        </div>
        <div className="ds-tstyle-meta">
          <b>{t.name || 'Untitled style'}</b> · {typeSpec(t) || 'no specs yet'}
          {big && <span className="muted"> · shown at 96px</span>}
        </div>
      </div>
      <div className="ds-tstyle-fields">
        <Input size="sm" className="strong" value={t.name} placeholder="Name, e.g. H1" aria-label="Style name" onChange={(name) => up({ name })} />
        <Combo size="sm" value={t.family} suggestions={families} placeholder="Family" aria-label="Font family" onChange={(family) => up({ family })} />
        <Select size="sm" value={t.weight != null ? String(t.weight) : ''} options={WEIGHTS} placeholder="Weight" aria-label="Weight" onChange={(v) => up({ weight: v ? Number(v) : undefined }, false)} />
        <Input size="sm" value={t.size} placeholder="Size, e.g. 48px" aria-label="Size" onChange={(size) => up({ size: size || undefined })} />
        <Input size="sm" value={t.lineHeight} placeholder="Line height, e.g. 1.1" aria-label="Line height" onChange={(lineHeight) => up({ lineHeight: lineHeight || undefined })} />
        <Input size="sm" value={t.letterSpacing} placeholder="Tracking, e.g. -0.02em" aria-label="Letter spacing" onChange={(letterSpacing) => up({ letterSpacing: letterSpacing || undefined })} />
        <Select size="sm" value={t.case ?? 'none'} options={TEXT_CASES} aria-label="Case" onChange={(v) => up({ case: v === 'none' ? undefined : (v as DSTextCase) }, false)} />
        <Checkbox checked={t.italic} onChange={(v) => up({ italic: v || undefined }, false)} label="Italic" />
        <Input size="sm" className="mono" value={t.cssVar} placeholder="--type-h1" aria-label="CSS variable" onChange={(cssVar) => up({ cssVar: cssVar || undefined })} />
        <Input size="sm" className="ds-tstyle-usage" value={t.usage} placeholder="Use for… (e.g. one per page, the main promise)" aria-label="Usage" onChange={(usage) => up({ usage: usage || undefined })} />
      </div>
      <ItemActions
        index={index}
        count={count}
        onMove={(a, b) => dsMove('typeStyles', a, b)}
        label="style"
        onDelete={async () => {
          if (await confirmRemove(`the style “${t.name || 'Untitled'}”`, !!(t.size || t.usage))) dsRemove('typeStyles', [t.id]);
        }}
      />
    </div>
  );
}

function addStarterScale(head: string, body: string) {
  const starter: Omit<DSTypeStyle, 'id'>[] = [
    { name: 'Display', family: head, weight: 800, size: '72px', lineHeight: '1', letterSpacing: '-0.02em', usage: 'One big statement per page or slide' },
    { name: 'H1', family: head, weight: 700, size: '48px', lineHeight: '1.1', letterSpacing: '-0.01em', usage: 'Page and slide titles' },
    { name: 'H2', family: head, weight: 700, size: '32px', lineHeight: '1.2', usage: 'Section titles' },
    { name: 'Eyebrow', family: head, weight: 600, size: '13px', lineHeight: '1.2', letterSpacing: '0.12em', case: 'upper', usage: 'Small label above a title' },
    { name: 'Body', family: body, weight: 400, size: '16px', lineHeight: '1.5', usage: 'Running text' },
    { name: 'Caption', family: body, weight: 400, size: '12px', lineHeight: '1.4', usage: 'Captions, footnotes, sources' },
  ];
  dsUpdate((ds) => {
    for (const s of starter) if (!ds.typeStyles.some((x) => x.name.toLowerCase() === s.name.toLowerCase())) ds.typeStyles.push({ id: dsNewId('typeStyles'), ...s });
  });
}

export function TypeSection() {
  const ds = useDS();
  const assets = useAssets();
  const fonts = useMemo(() => assets.filter((a) => a.kind === 'font'), [assets]);
  const tagline = useSpace((s) => s.strategy?.tagline);
  const families = useMemo(() => [...new Set([...fonts.map((f) => f.value?.trim()).filter((x): x is string => !!x), ...ds.typeStyles.map((t) => t.family).filter(Boolean)])], [fonts, ds.typeStyles]);
  const sample = tagline?.trim() || 'Learning that moves the numbers';
  const head = fonts[0]?.value?.trim() || families[0] || 'Inter';
  const body = fonts[1]?.value?.trim() || head;
  const addFont = () => focusRow(addAssets([makeAsset('font', { name: fonts.length ? 'Body' : 'Headlines' })])[0]);
  return (
    <div className="ds-section">
      <SectionHead icon={Type} title="Typography" intro="The typefaces you license or load, and the type scale built from them. Each style is shown in its real font, weight, size and tracking." />

      <div className="ds-card">
        <SubHead
          title="Typefaces"
          hint="Same fonts as the Assets tab"
          actions={
            fonts.length > 0 && (
              <Button size="sm" variant="ghost" icon={Plus} onClick={addFont}>
                Add font
              </Button>
            )
          }
        />
        {fonts.length === 0 ? (
          <Teach
            icon={Type}
            title="Which fonts, which weights, where to get them"
            actions={
              <Button icon={Plus} onClick={addFont}>
                Add font
              </Button>
            }
          >
            List each family with the weights you actually use and a download or licence link (or import the font files with a design-system zip). Agents use the family names; the guide links the files.
          </Teach>
        ) : (
          <div className="ds-fonts">
            {fonts.map((a) => (
              <FontRow key={a.id} a={a} />
            ))}
          </div>
        )}
      </div>

      <div className="ds-card">
        <SubHead
          title="Type styles"
          hint="The scale: name, family, weight, size / line height, tracking, case"
          actions={
            ds.typeStyles.length > 0 && (
              <>
                <Button size="sm" variant="ghost" icon={Plus} onClick={() => addStarterScale(head, body)}>
                  Add missing starters
                </Button>
                <Button size="sm" variant="ghost" icon={Plus} onClick={() => focusRow(dsAdd('typeStyles', { name: '', family: head }))}>
                  Add style
                </Button>
              </>
            )
          }
        />
        {ds.typeStyles.length === 0 ? (
          <Teach
            icon={Type}
            title="Give agents a type scale, not just font names"
            actions={
              <>
                <Button icon={Plus} onClick={() => addStarterScale(head, body)}>
                  Start from a 6-step scale
                </Button>
                <Button variant="ghost" icon={Plus} onClick={() => focusRow(dsAdd('typeStyles', { name: 'H1', family: head }))}>
                  Add one style
                </Button>
              </>
            }
          >
            Display, H1, H2, Eyebrow, Body, Caption … with exact sizes, line heights, tracking and case. Uses {head}
            {body !== head ? ` and ${body}` : ''} — edit anything afterwards.
          </Teach>
        ) : (
          <div className="ds-tstyles">
            {ds.typeStyles.map((t, i) => (
              <StyleRow key={t.id} t={t} index={i} count={ds.typeStyles.length} families={families} sample={sample} />
            ))}
          </div>
        )}
        {ds.typeStyles.length > 0 && (
          <Field label="Font substitutions" hint="What to use when the real fonts are not available (also in Art direction)" style={{ marginTop: 14 }}>
            <SubstitutionsInput />
          </Field>
        )}
      </div>
    </div>
  );
}

function SubstitutionsInput() {
  const ds = useDS();
  return <Input value={ds.artDirection.substitutions} placeholder="e.g. Montserrat → Arial Black for headlines, Arial for body" onChange={(v) => dsSet('artDirection.substitutions', v)} />;
}
