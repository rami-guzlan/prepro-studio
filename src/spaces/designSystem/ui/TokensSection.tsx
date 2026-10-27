/* Design system › Spacing & shape: spacing, radius, border, shadow, grid, breakpoint, motion, opacity tokens
   grouped by group, with visual previews. */
import { useMemo } from 'react';
import { Plus, Ruler } from 'lucide-react';
import type { DSToken, DSTokenGroup } from '../types';
import { Button, Input, Menu } from '@/ui';
import { dsAdd, dsNewId, dsPatch, dsRemove, dsUpdate } from '../ops';
import { TOKEN_GROUPS } from './options';
import { ItemActions, SectionHead, SubHead, Teach, confirmRemove, useDS } from './shared';

function focusRow(id: string) {
  setTimeout(() => {
    const el = document.querySelector<HTMLElement>(`[data-ds-id="${id}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const inp = el?.querySelector<HTMLInputElement>('input');
    inp?.focus();
    inp?.select();
  }, 40);
}

/** A length in px for previews ("16px", "1rem", "1.5em", "12" → px), capped. */
function lengthPx(v: string, cap = 320): number | null {
  const m = /^\s*(-?[\d.]+)\s*(px|rem|em)?\s*$/i.exec(v);
  if (!m) return null;
  const n = parseFloat(m[1]) * (m[2] && m[2].toLowerCase() !== 'px' ? 16 : 1);
  return isFinite(n) ? Math.max(0, Math.min(cap, n)) : null;
}

function Preview({ t }: { t: DSToken }) {
  const v = t.value.trim();
  if (!v) return <span className="ds-tokprev none" />;
  switch (t.group) {
    case 'spacing':
    case 'breakpoint': {
      const px = lengthPx(v, t.group === 'breakpoint' ? 2000 : 320);
      if (px == null) return <span className="ds-tokprev none" />;
      const w = t.group === 'breakpoint' ? Math.max(4, (px / 2000) * 160) : Math.max(2, px / 2);
      return (
        <span className="ds-tokprev bar" title={`${Math.round(px)}px`}>
          <span style={{ width: Math.min(160, w) }} />
        </span>
      );
    }
    case 'radius':
      return <span className="ds-tokprev box" style={{ borderRadius: v }} />;
    case 'shadow':
      return <span className="ds-tokprev box shadow" style={{ boxShadow: v }} />;
    case 'border':
      return <span className="ds-tokprev box border" style={/^[\d.]+(px)?$/.test(v) ? { borderWidth: v, borderStyle: 'solid' } : { border: v }} />;
    case 'opacity': {
      const n = parseFloat(v);
      return <span className="ds-tokprev box opacity" style={{ opacity: isFinite(n) ? (n > 1 ? n / 100 : n) : 1 }} />;
    }
    default:
      return <span className="ds-tokprev none" />;
  }
}

const SPACING = [4, 8, 12, 16, 24, 32, 48, 64];

function addStarters(group: DSTokenGroup) {
  const rows: [string, string][] =
    group === 'spacing'
      ? SPACING.map((n, i) => [`space-${i + 1}`, `${n}px`])
      : group === 'radius'
        ? [
            ['radius-sm', '4px'],
            ['radius-md', '8px'],
            ['radius-lg', '16px'],
            ['radius-pill', '999px'],
          ]
        : group === 'shadow'
          ? [
              ['shadow-sm', '0 1px 2px rgba(0,0,0,.08)'],
              ['shadow-md', '0 4px 16px rgba(0,0,0,.12)'],
              ['shadow-lg', '0 18px 50px rgba(0,0,0,.2)'],
            ]
          : [];
  dsUpdate((ds) => {
    for (const [name, value] of rows) if (!ds.tokens.some((t) => t.group === group && t.name === name)) ds.tokens.push({ id: dsNewId('tokens'), group, name, value });
  });
}

export function TokensSection() {
  const ds = useDS();
  const groups = useMemo(() => TOKEN_GROUPS.filter((g) => ds.tokens.some((t) => t.group === g.value)), [ds.tokens]);
  const add = (group: DSTokenGroup) => {
    const g = TOKEN_GROUPS.find((x) => x.value === group)!;
    const n = ds.tokens.filter((t) => t.group === group).length;
    focusRow(dsAdd('tokens', { group, name: n ? '' : g.example[0], value: n ? '' : g.example[1] }));
  };
  const addMenu = (
    <Menu
      align="end"
      trigger={
        <Button size="sm" variant={ds.tokens.length ? 'ghost' : 'primary'} icon={Plus}>
          Add token
        </Button>
      }
      items={[...TOKEN_GROUPS.map((g) => ({ label: g.label, onClick: () => add(g.value) })), { separator: true }, { label: 'Spacing scale (4 → 64px)', onClick: () => addStarters('spacing') }, { label: 'Radius set', onClick: () => addStarters('radius') }, { label: 'Shadow set', onClick: () => addStarters('shadow') }]}
    />
  );
  return (
    <div className="ds-section">
      <SectionHead icon={Ruler} title="Spacing & shape" intro="The measurements that make layouts feel like one family: spacing steps, corner radius, borders, shadows, grid, breakpoints, motion and opacity. Exported to tokens.json and tokens.css." actions={ds.tokens.length > 0 ? addMenu : undefined} />
      {ds.tokens.length === 0 ? (
        <div className="ds-card">
          <Teach
            icon={Ruler}
            title="A spacing scale is the quickest win"
            actions={
              <>
                <Button icon={Plus} onClick={() => addStarters('spacing')}>
                  Add an 8-step spacing scale
                </Button>
                <Button variant="ghost" icon={Plus} onClick={() => addStarters('radius')}>
                  Add radius set
                </Button>
                {addMenu}
              </>
            }
          >
            Agents laying out pages pick paddings and gaps from these steps instead of guessing. Values are CSS (16px, 1rem, 0 4px 16px rgba(…)).
          </Teach>
        </div>
      ) : (
        groups.map((g) => {
          const list = ds.tokens.filter((t) => t.group === g.value);
          return (
            <div key={g.value} className="ds-card">
              <SubHead
                title={g.label}
                hint={g.hint}
                actions={
                  <Button size="sm" variant="ghost" icon={Plus} onClick={() => add(g.value)}>
                    Add
                  </Button>
                }
              />
              <div className="ds-tokens">
                {list.map((t) => (
                  <div key={t.id} className="ds-token" data-ds-id={t.id}>
                    <Input size="sm" className="mono strong" value={t.name} placeholder={g.example[0]} aria-label="Token name" onChange={(name) => dsPatch('tokens', t.id, { name })} />
                    <Input size="sm" className="mono" value={t.value} placeholder={g.example[1]} aria-label="Value" onChange={(value) => dsPatch('tokens', t.id, { value })} />
                    <Preview t={t} />
                    <Input size="sm" className="ds-token-notes" value={t.notes} placeholder="Notes" aria-label="Notes" onChange={(notes) => dsPatch('tokens', t.id, { notes: notes || undefined })} />
                    <ItemActions
                      index={0}
                      count={1}
                      label="token"
                      onDelete={async () => {
                        if (await confirmRemove(`the token ${t.name || ''}`.trim(), !!t.notes)) dsRemove('tokens', [t.id]);
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
