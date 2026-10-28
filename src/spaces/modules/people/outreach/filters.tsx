/* Accounts & outreach: the filter bar (industry, tier, owner, stage, activity)
   and the sort. Each filter is a chip that opens a checklist and stays open
   while you tick. */
import { useState, type ReactNode } from 'react';
import { ArrowDownUp, Check, ChevronDown, X } from 'lucide-react';
import type { LeadStage } from '@/spaces/types';
import { ACCOUNT_SORTS, ACTIVITY_FILTERS, LEAD_STAGES, NO_SEGMENT, TIERS, filterCount, segmentsInUse, stageInfo, type AccountSort, type ActivityFilter, type OutreachFilter } from '@/spaces/outreach';
import { Popover, type AnchorRect } from '@/ui';
import { useOutreach } from './shared';

interface Opt<T> {
  value: T;
  label: string;
  hint?: string;
  color?: string;
  count?: number;
}

function Chip<T extends string | number>({ label, options, value, onChange, single, icon }: { label: string; options: Opt<T>[]; value: T[]; onChange: (v: T[]) => void; single?: boolean; icon?: ReactNode }) {
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const on = value.length > 0;
  const shown = on ? (value.length === 1 ? options.find((o) => o.value === value[0])?.label ?? String(value[0]) : `${value.length} picked`) : '';
  return (
    <>
      <span className={`or-fchip ${on ? 'on' : ''}`}>
        <button
          type="button"
          aria-expanded={!!anchor}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setAnchor(anchor ? null : { left: r.left, top: r.top, right: r.right, bottom: r.bottom });
          }}
        >
          {icon}
          {label}
          {on && <b>: {shown}</b>}
          <ChevronDown size={12} />
        </button>
        {on && !single && (
          <button type="button" className="or-fchip-x" aria-label={`Clear ${label}`} onClick={() => onChange([])}>
            <X size={12} />
          </button>
        )}
      </span>
      <Popover anchor={anchor} onClose={() => setAnchor(null)}>
        <div className="or-fpop" role="listbox" aria-multiselectable={!single}>
          {options.length === 0 && <div className="muted small" style={{ padding: 8 }}>Nothing to pick yet</div>}
          {options.map((o) => {
            const picked = value.includes(o.value);
            return (
              <button
                key={String(o.value)}
                type="button"
                role="option"
                aria-selected={picked}
                className={`or-fopt ${picked ? 'on' : ''}`}
                title={o.hint}
                onClick={() => {
                  if (single) {
                    onChange(picked ? [] : [o.value]);
                    setAnchor(null);
                  } else onChange(picked ? value.filter((x) => x !== o.value) : [...value, o.value]);
                }}
              >
                <span className="or-fcheck">{picked && <Check size={12} />}</span>
                {o.color && <i className="or-fdot" style={{ background: o.color }} />}
                <span className="grow ellipsis">{o.label}</span>
                {o.count != null && <span className="muted small">{o.count}</span>}
              </button>
            );
          })}
          {!single && value.length > 0 && (
            <button type="button" className="or-fopt clear" onClick={() => onChange([])}>
              Clear
            </button>
          )}
        </div>
      </Popover>
    </>
  );
}

export function FilterBar({ f, onChange, showSort }: { f: OutreachFilter; onChange: (patch: Partial<OutreachFilter>) => void; showSort: boolean }) {
  const o = useOutreach();
  const segs = segmentsInUse(o);
  const n = filterCount(f);
  return (
    <div className="or-filters" role="group" aria-label="Filters">
      <Chip<string> label="Industry" value={f.segments ?? []} onChange={(segments) => onChange({ segments })} options={segs.map((x) => ({ value: x.value, label: x.value === NO_SEGMENT ? 'No industry set' : x.value, count: x.count }))} />
      <Chip<number>
        label="Tier"
        value={f.tiers ?? []}
        onChange={(tiers) => onChange({ tiers })}
        options={[...TIERS.map((t) => ({ value: t.value as number, label: t.label, count: o.accounts.filter((a) => a.tier === t.value).length })), { value: 0, label: 'No tier', count: o.accounts.filter((a) => !a.tier).length }]}
      />
      <Chip<string> label="Owner" single value={f.ownerId ? [f.ownerId] : []} onChange={(v) => onChange({ ownerId: v[0] || undefined })} options={o.team.map((m) => ({ value: m.id, label: m.name, color: m.color }))} />
      <Chip<LeadStage> label="Stage" value={f.stages ?? []} onChange={(stages) => onChange({ stages })} options={LEAD_STAGES.map((s) => ({ value: s.value, label: s.label, hint: s.hint, color: stageInfo(s.value).color }))} />
      <Chip<ActivityFilter> label="Activity" value={f.activity ?? []} onChange={(activity) => onChange({ activity })} options={ACTIVITY_FILTERS.map((a) => ({ value: a.value, label: a.label, hint: a.hint }))} />
      {showSort && (
        <Chip<AccountSort>
          label="Sort"
          single
          icon={<ArrowDownUp size={12} />}
          value={f.sort && f.sort !== 'default' ? [f.sort] : []}
          onChange={(v) => onChange({ sort: v[0] ?? 'default' })}
          options={ACCOUNT_SORTS.filter((x) => x.value !== 'default')}
        />
      )}
      {n > 0 && (
        <button type="button" className="or-fclear" onClick={() => onChange({ segments: [], tiers: [], ownerId: undefined, stages: [], activity: [] })}>
          Clear filters
        </button>
      )}
    </div>
  );
}
