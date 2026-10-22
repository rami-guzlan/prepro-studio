/* Shared pieces of the Personal Finances screens: data hooks, amounts,
   category / account pickers, month stepper, "ask your agent" prompts and the
   not-financial-advice note. Every finance module imports this file (and with
   it finance.css). */
import './finance.css';
import { useMemo, useState, type ReactNode } from 'react';
import { Bot, Check, ChevronLeft, ChevronRight, Copy, Info } from 'lucide-react';
import { useSpace, useSpaceFormatters } from '@/store/space';
import { todayISO } from '@/lib/dates';
import { safeFileName, plural } from '@/lib/text';
import { backend, exportCsv } from '@/backend';
import { VIZ } from '@/ui/charts';
import { Button, IconButton, Select, toast } from '@/ui';
import type { FinAccount, FinanceData, FinCategory, FinTransaction } from './types';
import { CATEGORY_GROUPS, normalizeFinance } from './types';
import { accountLabel, merchantOf, monthLabel, monthOf, shiftMonth } from './calc';
import { getFinance } from './ops';

const EMPTY = normalizeFinance({});

/** The finance data of the open space (stable reference). */
export function useFinance(): FinanceData {
  return useSpace((s) => s.finance) ?? EMPTY;
}

export const useFmt = useSpaceFormatters;

/** Today and the current budget month. */
export function useToday(): { today: string; month: string } {
  const startDay = useFinance().settings.monthStartDay;
  const today = todayISO();
  return useMemo(() => ({ today, month: monthOf(today, startDay) }), [today, startDay]);
}

export function useCatMap(): Map<string, FinCategory> {
  const cats = useFinance().categories;
  return useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
}

export function useAccountMap(): Map<string, FinAccount> {
  const accts = useFinance().accounts;
  return useMemo(() => new Map(accts.map((a) => [a.id, a])), [accts]);
}

/* ---------------------------------------------------------------- page chrome */

export function FinPage({ children, narrow }: { children: ReactNode; narrow?: boolean }) {
  return <div className={`fin-page ${narrow ? 'narrow' : ''}`}>{children}</div>;
}

export function FinCard({ title, sub, actions, children, className, flush }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={`card fin-card ${className ?? ''}`}>
      {(title != null || actions != null) && (
        <div className="card-header fin-card-head">
          <div className="fin-card-titles">
            {title != null && <h3>{title}</h3>}
            {sub != null && <span className="muted small">{sub}</span>}
          </div>
          {actions != null && <div className="fin-card-actions">{actions}</div>}
        </div>
      )}
      <div className={flush ? 'fin-card-flush' : 'card-body'}>{children}</div>
    </section>
  );
}

/* ---------------------------------------------------------------- amounts & labels */

/** A signed amount: green "+" for money in, plain "−" for money out. */
export function Amount({ value, signed = true, strong, className }: { value: number | undefined | null; signed?: boolean; strong?: boolean; className?: string }) {
  const fmt = useFmt();
  if (value == null || isNaN(value)) return <span className="muted">—</span>;
  const text = signed ? (value > 0 ? `+${fmt.money(value)}` : value < 0 ? `−${fmt.money(-value)}` : fmt.money(0)) : fmt.money(value);
  return <span className={`fin-amt ${value > 0 && signed ? 'in' : value < 0 && signed ? 'out' : ''} ${strong ? 'strong' : ''} ${className ?? ''}`}>{text}</span>;
}

export function CategoryDot({ slot }: { slot?: number }) {
  return <i className="fin-dot" style={{ background: slot == null ? 'var(--text-3)' : VIZ(slot) }} />;
}

export function CategoryPill({ category }: { category: FinCategory | undefined }) {
  if (!category) return <span className="fin-pill none">Uncategorised</span>;
  return (
    <span className="fin-pill">
      <CategoryDot slot={category.slot} />
      {category.name}
    </span>
  );
}

/** Category options grouped by Income / Essentials / … (labels carry the group). */
export function categoryOptions(cats: FinCategory[]) {
  const order = CATEGORY_GROUPS.map((g) => g.value);
  return [...cats]
    .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.name.localeCompare(b.name))
    .map((c) => ({ value: c.id, label: c.name }));
}

export function CategorySelect({ value, onChange, placeholder = 'Uncategorised', size, bare, className, title }: { value: string | undefined; onChange: (v: string | undefined) => void; placeholder?: string; size?: 'sm' | 'md'; bare?: boolean; className?: string; title?: string }) {
  const cats = useFinance().categories;
  const options = useMemo(() => categoryOptions(cats), [cats]);
  return <Select value={value ?? ''} options={options} placeholder={placeholder} size={size} bare={bare} className={className} title={title} onChange={(v) => onChange(v || undefined)} />;
}

export function AccountSelect({ value, onChange, placeholder = 'No account', size, includeArchived, title }: { value: string | undefined; onChange: (v: string | undefined) => void; placeholder?: string; size?: 'sm' | 'md'; includeArchived?: boolean; title?: string }) {
  const accounts = useFinance().accounts;
  const options = useMemo(() => accounts.filter((a) => includeArchived || !a.archived || a.id === value).map((a) => ({ value: a.id, label: accountLabel(a) })), [accounts, includeArchived, value]);
  return <Select value={value ?? ''} options={options} placeholder={placeholder} size={size} title={title} onChange={(v) => onChange(v || undefined)} />;
}

/* ---------------------------------------------------------------- month stepper */

export function MonthStepper({ value, onChange, max }: { value: string; onChange: (k: string) => void; max?: string }) {
  const { month } = useToday();
  const limit = max ?? month;
  return (
    <div className="fin-month">
      <IconButton icon={ChevronLeft} size="sm" label="Previous month" onClick={() => onChange(shiftMonth(value, -1))} />
      <span className="fin-month-label">{monthLabel(value, true)}</span>
      <IconButton icon={ChevronRight} size="sm" label="Next month" disabled={value >= limit} onClick={() => onChange(shiftMonth(value, 1))} />
      {value !== month && (
        <Button size="sm" variant="ghost" onClick={() => onChange(month)}>
          This month
        </Button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- agent prompts */

export const AGENT_PROMPTS: { title: string; prompt: string }[] = [
  {
    title: 'Import statements from my email',
    prompt:
      'Search my email for my latest bank and credit card statements (CSV, OFX/QFX or PDF attachments from my banks). Download each one and import it into PrePro Studio Personal Finances with finance_import_transactions into the matching account. For PDFs, read the PDF yourself and pass the transactions as rows. Then tell me how many were imported and which were duplicates.',
  },
  {
    title: 'Build my budget (YNAB style)',
    prompt:
      'Read my budget in PrePro Studio Personal Finances with finance_budget {action:"read"}. Using my last 3 months (finance_report), set sensible targets for each category with finance_budget {action:"set_target"} — monthly amounts for regular bills, "by_date" targets for irregular true expenses — then assign this month’s Ready to Assign until it is zero (auto_assign underfunded first), cover any overspending with move, and explain the plan in a few lines.',
  },
  {
    title: 'Review this month',
    prompt: 'Use finance_report for this month vs last month in PrePro Studio Personal Finances. Summarise income, spending, savings rate, the categories that changed most and anything unusual. Save the 3 most useful points with finance_add_advice.',
  },
  {
    title: 'Tidy my categories',
    prompt: 'List my uncategorised transactions in PrePro Studio Personal Finances, categorise them with finance_categorize and create rules for merchants that repeat so future imports are categorised automatically.',
  },
  {
    title: 'Plan to be debt-free',
    prompt: 'Look at my accounts, budgets and goals in PrePro Studio Personal Finances and use finance_plan to compare avalanche vs snowball with a realistic extra payment based on my average monthly surplus. Suggest a plan and save it with finance_add_advice (educational, not professional advice).',
  },
  {
    title: 'Find savings',
    prompt: 'Go through my last 3 months in PrePro Studio Personal Finances (finance_report grouped by merchant and category). Find subscriptions I could cancel and categories where I could cut back, estimate the yearly savings and save the advice with finance_add_advice.',
  },
];

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function PromptRow({ title, prompt }: { title: string; prompt: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="fin-prompt">
      <div className="fin-prompt-text">
        <b>{title}</b>
        <span>{prompt}</span>
      </div>
      <Button
        size="sm"
        icon={done ? Check : Copy}
        onClick={async () => {
          if (await copy(prompt)) {
            setDone(true);
            window.setTimeout(() => setDone(false), 1600);
          } else toast('Could not copy — select the text instead', 'error');
        }}
      >
        {done ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}

export function AskAgentCard({ prompts = AGENT_PROMPTS, limit, compact }: { prompts?: { title: string; prompt: string }[]; limit?: number; compact?: boolean }) {
  const shown = limit ? prompts.slice(0, limit) : prompts;
  return (
    <FinCard
      title={
        <span className="row" style={{ gap: 6 }}>
          <Bot size={15} /> Ask your agent
        </span>
      }
      sub={compact ? undefined : 'Connected AI agents (Claude and others via MCP) can read and organise your finances while they are unlocked.'}
    >
      <div className="fin-prompts">
        {shown.map((p) => (
          <PromptRow key={p.title} {...p} />
        ))}
      </div>
      <p className="fin-footnote">Agents use their own email / drive connectors to find statements, then the finance_* tools here. They stop working the moment you lock your finances.</p>
    </FinCard>
  );
}

export function NotAdviceNote({ children }: { children?: ReactNode }) {
  return (
    <div className="fin-notice">
      <Info size={15} />
      <span>{children ?? 'Not financial advice. Insights and suggestions here (including from AI agents) are educational estimates from your own data. For decisions about investing, debt, taxes or retirement, talk to a qualified professional.'}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- CSV export */

export async function exportTransactionsCsv(txs: FinTransaction[], label: string) {
  if (!txs.length) {
    toast('No transactions to export', 'info');
    return;
  }
  const f = getFinance();
  const cats = new Map(f.categories.map((c) => [c.id, c.name]));
  const accts = new Map(f.accounts.map((a) => [a.id, accountLabel(a)]));
  try {
    const path = await exportCsv(safeFileName(`Finances - ${label}`), txs, [
      { header: 'Date', value: (t: FinTransaction) => t.date },
      { header: 'Description', value: (t) => t.description },
      { header: 'Merchant', value: (t) => merchantOf(t) },
      { header: 'Amount', value: (t) => t.amount },
      { header: 'Account', value: (t) => (t.accountId ? accts.get(t.accountId) : '') },
      { header: 'Category', value: (t) => (t.category ? cats.get(t.category) ?? t.category : '') },
      { header: 'Transfer', value: (t) => !!t.transfer },
      { header: 'Recurring', value: (t) => !!t.recurring },
      { header: 'Tags', value: (t) => (t.tags ?? []).join(', ') },
      { header: 'Notes', value: (t) => t.notes },
    ]);
    if (path) toast(`Exported ${plural(txs.length, 'transaction')} to ${path.split(/[\\/]/).pop()}`);
    else if (backend.kind !== 'electron') toast('Transactions CSV downloaded');
  } catch (e) {
    toast(`Could not export: ${e instanceof Error ? e.message : String(e)}`, 'error');
  }
}

/** Percent text, e.g. 0.234 → "23%". */
export const pct = (x: number | null | undefined, digits = 0) => (x == null || !isFinite(x) ? '—' : `${(x * 100).toFixed(digits)}%`);
