/* Design system › Colour & themes: the palette (colour assets with group, role, CSS variable …),
   themes and the semantic-token grid (one value per theme). */
import { useMemo, useState } from 'react';
import { Moon, Palette, Plus, Sun, SwatchBook, Trash2 } from 'lucide-react';
import type { BrandAsset } from '@/spaces/types';
import type { DSColorRole } from '../types';
import { asOneSpaceStep, updateSpace } from '@/store/space';
import { Button, ColorPicker, IconButton, Input, Popover, Select, type AnchorRect } from '@/ui';
import { addColor, assetOps, copyText, deleteAsset, HexInput } from '@/spaces/modules/assets/actions';
import { inkOn, normalizeHex } from '@/spaces/modules/assets/util';
import { colorVar } from '../compile';
import { dsAdd, dsMove, dsNewId, dsPatch, dsRemove, dsUpdate } from '../ops';
import { COLOR_ROLES } from './options';
import { CommitInput } from './CommitInput';
import { ItemActions, SectionHead, SubHead, Teach, ValueSwatch, confirmRemove, useAssets, useDS } from './shared';

const UNGROUPED = 'Palette';

function focusRow(id: string) {
  setTimeout(() => {
    const el = document.querySelector<HTMLElement>(`[data-ds-id="${id}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const inp = el?.querySelector<HTMLInputElement>('input');
    inp?.focus();
    inp?.select();
  }, 40);
}

/* ---------------------------------------------------------------- palette */

function ColorRow({ a, groups }: { a: BrandAsset; groups: string[] }) {
  const [pick, setPick] = useState<AnchorRect | null>(null);
  const hex = normalizeHex(a.value);
  const on = normalizeHex(a.onColor) ?? inkOn(hex ?? undefined);
  const up = (patch: Partial<BrandAsset>) => assetOps.update(a.id, patch);
  return (
    <div className="ds-color" data-ds-id={a.id}>
      <button
        type="button"
        className="ds-color-swatch"
        style={{ background: hex ?? undefined, color: on }}
        title="Pick a colour"
        aria-label={`Pick colour (${hex ?? 'none'})`}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPick({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
        }}
      >
        <span>Aa</span>
      </button>
      <div className="ds-color-fields">
        <Input size="sm" className="strong" value={a.name} placeholder="Name" aria-label="Colour name" onChange={(name) => up({ name })} />
        <HexInput value={a.value} onChange={(value) => up({ value })} className="ds-hex" />
        <CommitInput size="sm" value={a.group ?? ''} placeholder="Group" aria-label="Palette group" suggestions={groups} onCommit={(g) => assetOps.update(a.id, { group: g.trim() || undefined }, false)} />
        <Select size="sm" value={a.role ?? ''} placeholder="Role…" options={COLOR_ROLES} aria-label="Role" onChange={(v) => assetOps.update(a.id, { role: (v || undefined) as DSColorRole | undefined }, false)} />
        <Input size="sm" className="mono" value={a.cssVar} placeholder={colorVar({ ...a, cssVar: undefined })} aria-label="CSS variable" title="CSS custom property" onChange={(cssVar) => up({ cssVar: cssVar || undefined })} />
        <div className="ds-color-on" title="Colour of text placed on it">
          <span className="ds-color-on-dot" style={{ background: hex ?? undefined, color: on }}>
            A
          </span>
          <HexInput value={a.onColor} onChange={(onColor) => up({ onColor })} className="ds-hex" />
        </div>
        <Input size="sm" value={a.coverage} placeholder="Coverage, e.g. 10 %" aria-label="Coverage" onChange={(coverage) => up({ coverage: coverage || undefined })} />
        <Input size="sm" className="ds-color-usage" value={a.notes} placeholder="Usage: where it goes, contrast rules…" aria-label="Usage" onChange={(notes) => up({ notes: notes || undefined })} />
      </div>
      <div className="ds-item-actions">
        <IconButton icon={SwatchBook} size="sm" label="Copy hex" disabled={!hex} onClick={() => hex && copyText(hex)} />
        <IconButton icon={Trash2} size="sm" label="Delete colour" onClick={() => void deleteAsset(a)} />
      </div>
      <Popover anchor={pick} onClose={() => setPick(null)}>
        <div style={{ padding: 10 }}>
          <ColorPicker value={hex ?? undefined} onChange={(v) => v && assetOps.update(a.id, { value: v })} />
        </div>
      </Popover>
    </div>
  );
}

function addColorTo(group?: string) {
  void asOneSpaceStep(() => {
    const id = addColor();
    if (group && group !== UNGROUPED)
      updateSpace((d) => {
        const a = d.assets.find((x) => x.id === id);
        if (a) a.group = group;
      });
    focusRow(id);
  });
}

function Palette_({ colors }: { colors: BrandAsset[] }) {
  const groups = useMemo(() => [...new Set(colors.map((c) => c.group?.trim() || UNGROUPED))], [colors]);
  const named = groups.filter((g) => g !== UNGROUPED);
  return (
    <div className="ds-card">
      <SubHead
        title="Palette"
        hint="Same colours as the Assets tab — group them and give each a role"
        actions={
          colors.length > 0 && (
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => addColorTo()}>
              Add colour
            </Button>
          )
        }
      />
      {colors.length === 0 ? (
        <Teach
          icon={Palette}
          title="Start with the colours you already use"
          actions={
            <Button icon={Plus} onClick={() => addColorTo()}>
              Add colour
            </Button>
          }
        >
          Group them (Core, Spectrum, Neutrals …), give each a role (primary, accent, background, text …) and a CSS variable. Say roughly how much of a frame each colour covers — generators copy proportions, not just hues.
        </Teach>
      ) : (
        groups.map((g) => {
          const list = colors.filter((c) => (c.group?.trim() || UNGROUPED) === g);
          return (
            <div key={g} className="ds-color-group">
              {(groups.length > 1 || g !== UNGROUPED) && (
                <div className="ds-group-title">
                  <span>{g}</span>
                  <span className="muted">{list.length}</span>
                  <div className="ds-group-strip" aria-hidden>
                    {list.map((c) => (
                      <span key={c.id} style={{ background: normalizeHex(c.value) ?? 'transparent' }} />
                    ))}
                  </div>
                  <Button size="sm" variant="ghost" icon={Plus} onClick={() => addColorTo(g)}>
                    Add
                  </Button>
                </div>
              )}
              <div className="ds-colors">
                {list.map((a) => (
                  <ColorRow key={a.id} a={a} groups={named} />
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- themes */

function setDefaultTheme(id: string) {
  dsUpdate((ds) => {
    for (const t of ds.themes) {
      if (t.id === id) t.isDefault = true;
      else delete t.isDefault;
    }
  });
}

function addLightDark() {
  dsUpdate((ds) => {
    if (!ds.themes.some((t) => t.mode === 'light')) ds.themes.push({ id: dsNewId('themes'), name: 'Light', mode: 'light', isDefault: !ds.themes.some((t) => t.isDefault) || undefined });
    if (!ds.themes.some((t) => t.mode === 'dark')) ds.themes.push({ id: dsNewId('themes'), name: 'Dark', mode: 'dark' });
  });
}

function Themes() {
  const ds = useDS();
  return (
    <div className="ds-card">
      <SubHead
        title="Themes"
        hint="Light / dark or sub-brands that share the same token names"
        actions={
          ds.themes.length > 0 && (
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => focusRow(dsAdd('themes', { name: `Theme ${ds.themes.length + 1}`, mode: 'light' }))}>
              Add theme
            </Button>
          )
        }
      />
      {ds.themes.length === 0 ? (
        <Teach
          icon={Sun}
          title="One set of token names, a value per theme"
          actions={
            <>
              <Button icon={Plus} onClick={addLightDark}>
                Add Light + Dark
              </Button>
              <Button variant="ghost" icon={Plus} onClick={() => focusRow(dsAdd('themes', { name: 'Default', mode: 'light', isDefault: true }))}>
                Add one theme
              </Button>
            </>
          }
        >
          Themes let an agent switch a whole look by name (e.g. “IKN”, “Intuition Light”, “Intuition Dark”). Note what changes beyond the colours.
        </Teach>
      ) : (
        <div className="ds-themes">
          {ds.themes.map((t, i) => (
            <div key={t.id} className="ds-theme" data-ds-id={t.id}>
              <span className={`ds-theme-mode ${t.mode}`} aria-hidden>
                {t.mode === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
              </span>
              <Input size="sm" className="strong ds-theme-name" value={t.name} placeholder="Theme name" aria-label="Theme name" onChange={(name) => dsPatch('themes', t.id, { name })} />
              <Select size="sm" value={t.mode} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} aria-label="Mode" onChange={(v) => dsPatch('themes', t.id, { mode: v as 'light' | 'dark' }, false)} />
              <label className="ds-radio" title="Default theme (also the :root values in tokens.css)">
                <input type="radio" name="ds-default-theme" checked={!!t.isDefault} onChange={() => setDefaultTheme(t.id)} /> Default
              </label>
              <Input size="sm" className="grow" value={t.notes} placeholder="What changes beyond the colours (e.g. the year sits in a cyan block)" aria-label="Theme notes" onChange={(notes) => dsPatch('themes', t.id, { notes: notes || undefined })} />
              <ItemActions
                index={i}
                count={ds.themes.length}
                onMove={(a, b) => dsMove('themes', a, b)}
                label="theme"
                onDelete={async () => {
                  if (await confirmRemove(`the theme “${t.name || 'Untitled'}” and its token values`, ds.semanticTokens.some((x) => x.values[t.id]))) dsRemove('themes', [t.id]);
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- semantic tokens */

const STARTER_TOKENS: [string, string][] = [
  ['--bg', 'Page background'],
  ['--surface', 'Cards and panels'],
  ['--text', 'Body text'],
  ['--text-muted', 'Secondary text'],
  ['--accent', 'Highlights, links, key numbers'],
  ['--border', 'Hairlines and dividers'],
];

function SemanticTokens({ colors }: { colors: BrandAsset[] }) {
  const ds = useDS();
  const palette = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of colors) if (c.value) m.set(colorVar(c), c.value);
    return m;
  }, [colors]);
  const suggestions = useMemo(() => [...new Set([...colors.map((c) => normalizeHex(c.value)).filter((x): x is string => !!x), ...[...palette.keys()].map((k) => `var(${k})`)])], [colors, palette]);
  const listId = 'ds-token-values';
  const themes = ds.themes;
  const tokens = ds.semanticTokens;

  const setValue = (tokenId: string, themeId: string, v: string) =>
    dsUpdate(
      (d) => {
        const t = d.semanticTokens.find((x) => x.id === tokenId);
        if (!t) return;
        if (v.trim()) t.values[themeId] = v;
        else delete t.values[themeId];
      },
      { coalesce: `ds:semanticTokens:${tokenId}:${themeId}` },
    );

  const addStarters = () =>
    dsUpdate((d) => {
      for (const [name, description] of STARTER_TOKENS) if (!d.semanticTokens.some((t) => t.name === name)) d.semanticTokens.push({ id: dsNewId('semanticTokens'), name, description, values: {} });
    });

  return (
    <div className="ds-card">
      <SubHead
        title="Semantic tokens"
        hint="Role names (--accent, --surface …) with a value per theme — what agents should use instead of raw hex"
        actions={
          tokens.length > 0 && (
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => focusRow(dsAdd('semanticTokens', { name: '--', values: {} }))}>
              Add token
            </Button>
          )
        }
      />
      {tokens.length === 0 ? (
        <Teach
          icon={SwatchBook}
          title="Name colours by what they do"
          actions={
            <>
              <Button icon={Plus} onClick={addStarters}>
                Add the usual six (--bg, --surface, --text …)
              </Button>
              <Button variant="ghost" icon={Plus} onClick={() => focusRow(dsAdd('semanticTokens', { name: '--accent', values: {} }))}>
                Add one token
              </Button>
            </>
          }
        >
          A token like <code>--accent</code> keeps its name in every theme while its value changes. Values can be a hex, <code>var(--color-purple)</code> from the palette, or any CSS value (gradients too).
        </Teach>
      ) : (
        <div className="ds-tokgrid-wrap">
          <datalist id={listId}>
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <table className="ds-tokgrid">
            <thead>
              <tr>
                <th>Token</th>
                {themes.map((t) => (
                  <th key={t.id}>
                    <span className="row" style={{ gap: 5 }}>
                      {t.mode === 'dark' ? <Moon size={12} /> : <Sun size={12} />}
                      {t.name || 'Untitled'}
                    </span>
                  </th>
                ))}
                {themes.length === 0 && <th className="muted">Add a theme to give values</th>}
                <th>Meaning</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {tokens.map((t, i) => (
                <tr key={t.id} data-ds-id={t.id}>
                  <td className="ds-tok-name">
                    <Input size="sm" bare className="mono strong" value={t.name} placeholder="--token" aria-label="Token name" onChange={(name) => dsPatch('semanticTokens', t.id, { name })} />
                  </td>
                  {themes.map((th) => (
                    <td key={th.id} className="ds-tok-cell">
                      <ValueSwatch value={t.values[th.id]} palette={palette} />
                      <Input size="sm" bare className="mono" list={listId} value={t.values[th.id] ?? ''} placeholder="—" aria-label={`${t.name} in ${th.name}`} onChange={(v) => setValue(t.id, th.id, v)} />
                    </td>
                  ))}
                  {themes.length === 0 && <td />}
                  <td className="ds-tok-desc">
                    <Input size="sm" bare value={t.description} placeholder="What it is for" aria-label="Meaning" onChange={(description) => dsPatch('semanticTokens', t.id, { description: description || undefined })} />
                  </td>
                  <td>
                    <ItemActions
                      index={i}
                      count={tokens.length}
                      onMove={(a, b) => dsMove('semanticTokens', a, b)}
                      label="token"
                      onDelete={async () => {
                        if (await confirmRemove(`the token ${t.name}`, Object.values(t.values).some(Boolean))) dsRemove('semanticTokens', [t.id]);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ColorSection() {
  const assets = useAssets();
  const colors = useMemo(() => assets.filter((a) => a.kind === 'color'), [assets]);
  return (
    <div className="ds-section">
      <SectionHead icon={Palette} title="Colour & themes" intro="The palette with its groups and roles, the themes of the system, and the semantic tokens whose values change per theme. Colour edits here and in the Assets tab are the same data." />
      <Palette_ colors={colors} />
      <Themes />
      <SemanticTokens colors={colors} />
    </div>
  );
}
