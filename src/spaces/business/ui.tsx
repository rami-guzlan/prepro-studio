/* Shared hooks and small components of the business screens. */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SpaceSummary } from '@/spaces/types';
import type { Option } from '@/lib/constants';
import { useSpace, useSpaceFormatters } from '@/store/space';
import { useApp } from '@/store/app';
import { todayISO } from '@/lib/dates';
import { backend } from '@/backend';
import { Select } from '@/ui';
import { EMPTY_BIZ, clientName } from './derive';
import { PERIODS, type PeriodId } from './constants';
import type { BusinessData } from './types';

export function useBiz(): BusinessData {
  return useSpace((s) => s.business) ?? EMPTY_BIZ;
}

export function useToday(): string {
  const [today, setToday] = useState(todayISO);
  useEffect(() => {
    const t = window.setInterval(() => setToday(todayISO()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return today;
}

export const useFmt = useSpaceFormatters;

/** Re-render every `ms` (running timer). */
export function useTick(active: boolean, ms = 1000): number {
  const [n, setN] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setN(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [active, ms]);
  return n;
}

/* navigations already acted on (React StrictMode runs effects twice in development;
   actions like "create a new invoice" must happen once per navigation) */
const handledNav = new Set<number>();

/** Run `fn(params)` once per navigation to the screen with parameters (agents, other screens). */
export function useNavParams(fn: (p: Record<string, any>) => void) {
  const params = useApp((s) => s.params);
  const navKey = useApp((s) => s.navKey);
  useEffect(() => {
    if (!params || !Object.keys(params).length || handledNav.has(navKey)) return;
    handledNav.add(navKey);
    fn(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navKey]);
}

export function clientOptions(b: BusinessData, includeArchivedId?: string): Option[] {
  return b.clients
    .filter((c) => !c.archived || c.id === includeArchivedId)
    .map((c) => ({ value: c.id, label: c.company && c.name ? `${c.name} (${c.company})` : clientName(c) }));
}

export function contractorOptions(b: BusinessData): Option[] {
  return b.contractors.map((c) => ({ value: c.id, label: c.name || 'Unnamed contractor' }));
}

export function streamOptions(b: BusinessData): Option[] {
  return b.streams.map((s) => ({ value: s.id, label: s.name || 'Unnamed stream' }));
}

export function categoryOptions(b: BusinessData): Option[] {
  return b.settings.expenseCategories.map((c) => ({ value: c.id, label: c.label, color: c.color }));
}

/** Marketing Spaces for linking (cached per mount). */
export function useMarketingSpaces(): SpaceSummary[] {
  const [list, setList] = useState<SpaceSummary[]>([]);
  useEffect(() => {
    let alive = true;
    backend.listSpaces().then(
      (l) => alive && setList(l.filter((s) => (s.kind ?? 'marketing') === 'marketing')),
      () => alive && setList([]),
    );
    return () => {
      alive = false;
    };
  }, []);
  return list;
}

export function PeriodSelect({ value, onChange }: { value: PeriodId; onChange: (p: PeriodId) => void }) {
  return <Select size="sm" value={value} onChange={(v) => onChange(v as PeriodId)} options={PERIODS.map((p) => ({ value: p.value, label: p.label }))} aria-label="Period" />;
}

/** Signed money with colour (positive = success, negative = danger). */
export function Money({ value, tone, strong }: { value: number; tone?: 'auto' | 'in' | 'out'; strong?: boolean }) {
  const fmt = useFmt();
  const cls = tone === 'in' ? 'biz-in' : tone === 'out' ? 'biz-out' : tone === 'auto' ? (value < 0 ? 'biz-out' : value > 0 ? 'biz-in' : '') : '';
  return <span className={`biz-money ${cls} ${strong ? 'strong' : ''}`}>{fmt.money(value)}</span>;
}

export function Pill({ color, children, title }: { color?: string; children: ReactNode; title?: string }) {
  return (
    <span className="biz-pill" style={color ? { ['--pc' as string]: color } : undefined} title={title}>
      <i />
      {children}
    </span>
  );
}

export function OptionPill({ value, options }: { value?: string; options: Option[] }) {
  if (!value) return null;
  const o = options.find((x) => x.value === value);
  return <Pill color={o?.color}>{o?.label ?? value}</Pill>;
}

/** Keyboard: Enter on a row opens it. */
export const rowKeys = (open: () => void) => ({
  tabIndex: 0,
  onKeyDown: (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.target === e.currentTarget) open();
  },
});

export function useSearchFilter<T>(items: T[], q: string, text: (x: T) => string): T[] {
  return useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((x) => text(x).toLowerCase().includes(s));
  }, [items, q, text]);
}
