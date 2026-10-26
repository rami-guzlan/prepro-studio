/* Design system › Rules: statements and do / don't examples with a level (required / preferred / open)
   and a scope (brand-wide or one campaign), filterable, with quick add. */
import { useMemo, useRef, useState } from 'react';
import { Check, Gavel, Plus, X } from 'lucide-react';
import type { DSLevel, DSRule, DSRuleArea, DSScope } from '../types';
import { Button, Input, SearchInput, Select, Textarea } from '@/ui';
import { matchesQuery } from '@/lib/text';
import { dsAdd, dsMove, dsNewId, dsPatch, dsRemove, dsUpdate } from '../ops';
import { LEVELS, RULE_AREAS, RULE_KINDS } from './options';
import { ItemActions, LevelSelect, SectionHead, Teach, confirmRemove, useCampaignOptions, useDS } from './shared';

type Kind = DSRule['kind'];

function KindSelect({ value, onChange }: { value: Kind; onChange: (k: Kind) => void }) {
  return (
    <select className={`ds-pill ds-kind-${value}`} value={value} aria-label="Kind" onChange={(e) => onChange(e.target.value as Kind)}>
      {RULE_KINDS.map((k) => (
        <option key={k.value} value={k.value}>
          {k.label}
        </option>
      ))}
    </select>
  );
}

function RuleRow({ r, index, count, campaigns }: { r: DSRule; index: number; count: number; campaigns: { value: string; label: string }[] }) {
  const up = (patch: Partial<DSRule>, coalesce = false) => dsPatch('rules', r.id, patch, coalesce);
  return (
    <div className={`ds-rule kind-${r.kind}`} data-ds-id={r.id}>
      <div className="ds-rule-icon" aria-hidden>
        {r.kind === 'do' ? <Check size={14} /> : r.kind === 'dont' ? <X size={14} /> : <Gavel size={13} />}
      </div>
      <div className="ds-rule-main">
        <Textarea bare autoGrow minRows={1} className="ds-rule-text" value={r.text} placeholder="Write the rule…" aria-label="Rule" onChange={(text) => up({ text }, true)} />
        <div className="ds-rule-meta">
          <KindSelect value={r.kind} onChange={(kind) => up({ kind })} />
          <LevelSelect compact value={r.level} onChange={(level) => up({ level })} />
          <Select size="sm" bare className="ds-rule-area" value={r.area} options={RULE_AREAS} aria-label="Area" onChange={(v) => up({ area: v as DSRuleArea })} />
          <Select size="sm" bare className={`ds-rule-scope ${r.scope}`} value={r.scope} options={[{ value: 'brand', label: 'Brand-wide' }, { value: 'campaign', label: 'Campaign only' }]} aria-label="Scope" onChange={(v) => up({ scope: v as DSScope, campaignId: v === 'brand' ? undefined : r.campaignId })} />
          {r.scope === 'campaign' && <Select size="sm" bare value={r.campaignId ?? ''} options={campaigns} placeholder={campaigns.length ? 'Which campaign?' : 'No campaigns yet'} aria-label="Campaign" onChange={(v) => up({ campaignId: v || undefined })} />}
          <Input size="sm" bare className="ds-rule-why" value={r.why} placeholder="Why? (helps agents judge edge cases)" aria-label="Why" onChange={(why) => up({ why: why || undefined }, true)} />
        </div>
      </div>
      <ItemActions
        index={index}
        count={count}
        onMove={(a, b) => dsMove('rules', a, b)}
        label="rule"
        onDelete={async () => {
          if (await confirmRemove('this rule', !!r.text.trim())) dsRemove('rules', [r.id]);
        }}
      />
    </div>
  );
}

const STARTER_RULES: Omit<DSRule, 'id'>[] = [
  { area: 'logo', kind: 'rule', text: 'Use the supplied logo files only — never redraw, recolour, stretch or add effects.', level: 'required', scope: 'brand' },
  { area: 'typography', kind: 'rule', text: 'Exact copy, numbers and small text are placed in finishing, never generated inside an image.', level: 'required', scope: 'brand' },
  { area: 'color', kind: 'rule', text: 'One accent colour per frame.', level: 'preferred', scope: 'brand' },
  { area: 'imagery', kind: 'dont', text: 'Stock clichés: handshakes, lightbulbs, glowing robots.', level: 'required', scope: 'brand' },
];

export function RulesSection() {
  const ds = useDS();
  const campaigns = useCampaignOptions();
  const [area, setArea] = useState('');
  const [level, setLevel] = useState('');
  const [scope, setScope] = useState('');
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState('');
  const [draftKind, setDraftKind] = useState<Kind>('rule');
  const [draftLevel, setDraftLevel] = useState<DSLevel>('required');
  const draftRef = useRef<HTMLInputElement>(null);

  const filtering = !!(area || level || scope || q.trim());
  const list = useMemo(
    () =>
      ds.rules
        .map((r, index) => ({ r, index }))
        .filter(({ r }) => (!area || r.area === area) && (!level || r.level === level) && (!scope || (scope.startsWith('c:') ? r.scope === 'campaign' && r.campaignId === scope.slice(2) : r.scope === scope)) && (!q.trim() || matchesQuery(`${r.text} ${r.why ?? ''}`, q))),
    [ds.rules, area, level, scope, q],
  );
  const counts = useMemo(() => Object.fromEntries(LEVELS.map((l) => [l.value, ds.rules.filter((r) => r.level === l.value).length])), [ds.rules]);

  const quickAdd = () => {
    const text = draft.trim();
    if (!text) return;
    const sc = scope.startsWith('c:') ? { scope: 'campaign' as const, campaignId: scope.slice(2) } : { scope: (scope || 'brand') as DSScope };
    dsAdd('rules', { text, kind: draftKind, level: draftLevel, area: (area || 'brand') as DSRuleArea, ...sc });
    setDraft('');
    draftRef.current?.focus();
  };

  const addStarters = () =>
    dsUpdate((d) => {
      for (const r of STARTER_RULES) if (!d.rules.some((x) => x.text === r.text)) d.rules.push({ id: dsNewId('rules'), ...r });
    });

  const scopeOptions = [{ value: 'brand', label: 'Brand-wide' }, { value: 'campaign', label: 'Any campaign' }, ...campaigns.map((c) => ({ value: `c:${c.value}`, label: `Campaign: ${c.label}` }))];

  return (
    <div className="ds-section">
      <SectionHead
        icon={Gavel}
        title="Rules"
        intro="Label each decision required, preferred or open, and separate permanent brand rules from campaign-specific ones — so an agent knows what it may never break, what it should default to, and where it is free."
      />

      <div className="ds-levels-legend">
        {LEVELS.map((l) => (
          <button key={l.value} type="button" className={`ds-legend ds-level-${l.value} ${level === l.value ? 'on' : ''}`} aria-pressed={level === l.value} onClick={() => setLevel(level === l.value ? '' : l.value)} title={`Show only ${l.label.toLowerCase()} rules`}>
            <span className={`ds-pill static ds-level-${l.value}`}>{l.label}</span>
            <span className="muted small">{l.hint}</span>
            <b>{counts[l.value] ?? 0}</b>
          </button>
        ))}
      </div>

      <div className="ds-card">
        <div className="ds-quickadd">
          <KindSelect value={draftKind} onChange={setDraftKind} />
          <LevelSelect compact value={draftLevel} onChange={setDraftLevel} />
          <Input
            ref={draftRef}
            className="grow"
            value={draft}
            placeholder={draftKind === 'do' ? 'Do… (an example behaviour)' : draftKind === 'dont' ? 'Don’t… (an example to avoid)' : 'Add a rule and press Enter'}
            aria-label="New rule"
            onChange={setDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                quickAdd();
              }
            }}
          />
          <Button variant="primary" icon={Plus} disabled={!draft.trim()} onClick={quickAdd}>
            Add
          </Button>
        </div>

        {ds.rules.length > 0 && (
          <div className="ds-filters">
            <SearchInput value={q} onChange={setQ} placeholder="Search rules…" width={200} />
            <Select size="sm" value={area} options={RULE_AREAS} placeholder="All areas" aria-label="Filter by area" onChange={setArea} />
            <Select size="sm" value={level} options={LEVELS.map((l) => ({ value: l.value, label: l.label }))} placeholder="All levels" aria-label="Filter by level" onChange={setLevel} />
            <Select size="sm" value={scope} options={scopeOptions} placeholder="Brand & campaigns" aria-label="Filter by scope" onChange={setScope} />
            {filtering && (
              <Button
                size="sm"
                variant="ghost"
                icon={X}
                onClick={() => {
                  setArea('');
                  setLevel('');
                  setScope('');
                  setQ('');
                }}
              >
                Clear
              </Button>
            )}
            <div className="spacer" />
            <span className="muted small">{filtering ? `${list.length} of ${ds.rules.length}` : `${ds.rules.length} rules`}</span>
          </div>
        )}

        {ds.rules.length === 0 ? (
          <Teach
            icon={Gavel}
            title="Decisions, not descriptions"
            actions={
              <Button variant="ghost" icon={Plus} onClick={addStarters}>
                Add four common rules to edit
              </Button>
            }
          >
            Label decisions <b>required</b>, <b>preferred</b> or <b>open</b>; separate permanent brand rules from campaign-specific ones. Add a “why” — it lets an agent judge cases the rule did not foresee. Use Do / Don’t for concrete examples.
          </Teach>
        ) : list.length === 0 ? (
          <div className="muted small" style={{ padding: '16px 4px' }}>
            No rules match these filters.
          </div>
        ) : (
          <div className="ds-rules">
            {list.map(({ r, index }) => (
              <RuleRow key={r.id} r={r} index={index} count={filtering ? 1 : ds.rules.length} campaigns={campaigns} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
