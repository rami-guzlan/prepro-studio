/* Budget detail: collapsible account cards (by section) with editable line items. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, ChevronsDownUp, ChevronsUpDown, Copy, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import type { BudgetCategory, BudgetLine, ID } from '@/types';
import { listOps, update, useFormatters, useProject, useProjectId } from '@/store/project';
import { readLS, writeLS } from '@/store/app';
import { uid } from '@/lib/id';
import { matchesQuery, plural } from '@/lib/text';
import { Button, Checkbox, DataTable, EmptyState, Input, Menu, SearchInput, Toolbar, confirmDialog, type Column, type MenuItem } from '@/ui';
import { SECTIONS, UNITS, catActual, catTotal, lineActual, lineTotal, summarize, varianceTone, type SectionId } from './calc';
import { Wallet } from 'lucide-react';

/** Sum of column widths: the table scrolls horizontally instead of squeezing inputs. */
function minTableWidth<T>(cols: Column<T>[], extra = 40): number {
  return cols.filter((c) => !c.hidden).reduce((n, c) => n + (typeof c.width === 'number' ? c.width : c.minWidth ?? 140), extra);
}

const lineOps = (catId: ID) => listOps<BudgetLine>((d) => d.budget.categories.find((c) => c.id === catId)?.lines ?? [], `budget:${catId}`);

function patchCat(id: ID, patch: Partial<BudgetCategory>) {
  update(
    (d) => {
      const c = d.budget.categories.find((x) => x.id === id);
      if (c) Object.assign(c, patch);
    },
    { coalesce: `budget:cat:${id}:${Object.keys(patch).join(',')}` },
  );
}

function moveCat(id: ID, dir: -1 | 1) {
  update((d) => {
    const cats = d.budget.categories;
    const i = cats.findIndex((c) => c.id === id);
    if (i < 0) return;
    const sec = cats[i].section;
    let j = i + dir;
    while (j >= 0 && j < cats.length && cats[j].section !== sec) j += dir;
    if (j < 0 || j >= cats.length) return;
    const [c] = cats.splice(i, 1);
    cats.splice(j, 0, c);
  });
}

export function newLine(): BudgetLine {
  return { id: uid('bl'), description: '', qty: 1, unit: 'day', rate: 0, x: 1 };
}

function Variance({ estimate, actual }: { estimate: number; actual: number }) {
  const fmt = useFormatters();
  const tone = varianceTone(estimate, actual);
  if (tone === 'none') return <span className="muted">—</span>;
  const v = estimate - actual;
  return <span className={`budget-var ${tone}`}>{v < 0 ? `−${fmt.money(-v)}` : fmt.money(v)}</span>;
}

/* ---------------------------------------------------------------- category card */

function CategoryCard({
  cat,
  open,
  onToggle,
  currency,
  query,
  hideZero,
  isFirst,
  isLast,
}: {
  cat: BudgetCategory;
  open: boolean;
  onToggle: (open?: boolean) => void;
  currency: string;
  query: string;
  hideZero: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  const fmt = useFormatters();
  const nameRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const focusLineRef = useRef<ID | null>(null);
  const ops = useMemo(() => lineOps(cat.id), [cat.id]);
  const total = catTotal(cat);
  const actual = catActual(cat);
  const nameMatches = !!query.trim() && matchesQuery(`${cat.code ?? ''} ${cat.name}`, query);
  const lines = cat.lines.filter((l) => {
    if (hideZero && !lineTotal(l) && !lineActual(l)) return false;
    if (query.trim() && !nameMatches) return matchesQuery(`${l.description} ${l.notes ?? ''} ${l.unit}`, query);
    return true;
  });

  // focus the description of a freshly added / duplicated line
  useEffect(() => {
    const id = focusLineRef.current;
    if (!id) return;
    const i = lines.findIndex((l) => l.id === id);
    if (i < 0) return;
    focusLineRef.current = null;
    const input = cardRef.current?.querySelector<HTMLInputElement>(`tbody tr:nth-child(${i + 1}) input.input`);
    input?.focus();
    input?.select();
  });

  const addLine = () => {
    const l = newLine();
    ops.add(l);
    focusLineRef.current = l.id;
    onToggle(true);
  };

  const removeLine = async (l: BudgetLine) => {
    if (lineTotal(l) || lineActual(l) || l.description.trim()) {
      const ok = await confirmDialog({
        title: `Delete “${l.description || 'this line'}”?`,
        message: lineTotal(l) ? `It adds ${fmt.money(lineTotal(l))} to ${cat.name}. Undo with Ctrl+Z.` : 'Undo with Ctrl+Z.',
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
    }
    ops.remove(l.id);
  };

  const removeCat = async () => {
    const ok = await confirmDialog({
      title: `Delete account “${cat.code ? `${cat.code} ` : ''}${cat.name}”?`,
      message: cat.lines.length ? `Its ${plural(cat.lines.length, 'line')} (${fmt.money(total)}) will be deleted too. Undo with Ctrl+Z.` : 'Undo with Ctrl+Z.',
      confirmLabel: 'Delete account',
      danger: true,
    });
    if (ok) update((d) => void (d.budget.categories = d.budget.categories.filter((c) => c.id !== cat.id)));
  };

  const columns: Column<BudgetLine>[] = [
    { key: 'description', header: 'Description', type: 'text', minWidth: 220, placeholder: 'Line item', footer: plural(lines.length, 'line') },
    { key: 'qty', header: 'Qty', type: 'number', width: 70, set: (v) => ({ qty: v ?? 0 }) },
    { key: 'unit', header: 'Unit', type: 'combo', width: 92, suggestions: UNITS, placeholder: 'unit' },
    { key: 'rate', header: 'Rate', type: 'money', width: 110, prefix: currency, set: (v) => ({ rate: v ?? 0 }) },
    { key: 'x', header: '×', type: 'number', width: 56, placeholder: '1', set: (v) => ({ x: v ?? 1 }) },
    { key: 'fringePct', header: 'Fringe %', type: 'number', width: 76, placeholder: '0' },
    {
      key: 'total',
      header: 'Total',
      width: 120,
      align: 'right',
      sortValue: (l) => lineTotal(l),
      render: (l) => <span className={lineTotal(l) ? 'budget-num strong' : 'muted'}>{lineTotal(l) ? fmt.money(lineTotal(l)) : fmt.money(0)}</span>,
      footer: fmt.money(lines.reduce((n, l) => n + lineTotal(l), 0)),
    },
    { key: 'actual', header: 'Actual', type: 'money', width: 110, prefix: currency, placeholder: '—', footer: actual ? fmt.money(lines.reduce((n, l) => n + lineActual(l), 0)) : '' },
    {
      key: 'variance',
      header: 'Variance',
      width: 110,
      align: 'right',
      sortValue: (l) => lineTotal(l) - lineActual(l),
      render: (l) => <Variance estimate={lineTotal(l)} actual={lineActual(l)} />,
      footer: actual ? <Variance estimate={lines.reduce((n, l) => n + lineTotal(l), 0)} actual={lines.reduce((n, l) => n + lineActual(l), 0)} /> : '',
    },
    { key: 'notes', header: 'Notes', type: 'text', minWidth: 160, placeholder: 'Notes' },
  ];

  const menu: MenuItem[] = [
    { label: 'Add line', icon: Plus, onClick: addLine },
    {
      label: 'Rename',
      icon: Pencil,
      onClick: () =>
        requestAnimationFrame(() => {
          nameRef.current?.focus();
          nameRef.current?.select();
        }),
    },
    { label: 'Move up', icon: ArrowUp, disabled: isFirst, onClick: () => moveCat(cat.id, -1) },
    { label: 'Move down', icon: ArrowDown, disabled: isLast, onClick: () => moveCat(cat.id, 1) },
    { separator: true },
    { header: 'Section' },
    ...SECTIONS.map((s): MenuItem => ({ label: s.label, checked: cat.section === s.id, onClick: () => patchCat(cat.id, { section: s.id }) })),
    { separator: true },
    { label: 'Delete account', icon: Trash2, danger: true, onClick: removeCat },
  ];

  return (
    <div ref={cardRef} className={`card budget-cat ${open ? 'open' : ''}`} id={`budget-cat-${cat.id}`}>
      <div
        className="budget-cat-head"
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('input,button,select,textarea,a')) onToggle();
        }}
      >
        <button type="button" className="btn ghost sm icon budget-chev" aria-label={open ? 'Collapse' : 'Expand'} aria-expanded={open} onClick={() => onToggle()}>
          <ChevronRight />
        </button>
        <Input bare size="sm" className="budget-code" value={cat.code ?? ''} placeholder="Code" onChange={(v) => patchCat(cat.id, { code: v || undefined })} aria-label="Account code" />
        <Input ref={nameRef} bare size="sm" className="budget-name" value={cat.name} placeholder="Account name" onChange={(v) => patchCat(cat.id, { name: v })} aria-label="Account name" />
        <span className="muted small nowrap">{plural(cat.lines.length, 'line')}</span>
        <span className="spacer" />
        {actual > 0 && (
          <span className="budget-cat-actual small nowrap" title="Actual spend">
            Actual {fmt.money(actual)}
          </span>
        )}
        <span className="budget-cat-total nowrap">{fmt.money(total)}</span>
        <Menu
          align="end"
          trigger={
            <button type="button" className="btn ghost sm icon" aria-label="Account actions">
              <MoreHorizontal />
            </button>
          }
          items={menu}
        />
      </div>
      {open && (
        <div className="budget-cat-body">
          <div className="budget-tablewrap" style={{ ['--budget-minw' as any]: `${minTableWidth(columns, 64)}px` }}>
            <DataTable<BudgetLine>
              rows={lines}
              columns={columns}
              onChange={(id, patch) => ops.update(id, patch)}
              onReorder={query || hideZero ? undefined : (id, before) => ops.moveBefore(id, before)}
              showFooter={lines.length > 0}
              style={{ borderRadius: 0, border: 0, borderTop: '1px solid var(--border)' }}
              emptyText={query || hideZero ? 'No matching lines.' : 'No lines yet.'}
              rowActions={(l) => {
                const i = cat.lines.findIndex((x) => x.id === l.id);
                return [
                  {
                    label: 'Duplicate',
                    icon: Copy,
                    onClick: () => {
                      const c = ops.duplicate(l.id, () => uid('bl'));
                      if (c) focusLineRef.current = c.id;
                    },
                  },
                  { label: 'Move up', icon: ArrowUp, disabled: i <= 0, onClick: () => ops.move(i, i - 1) },
                  { label: 'Move down', icon: ArrowDown, disabled: i < 0 || i >= cat.lines.length - 1, onClick: () => ops.move(i, i + 1) },
                  { separator: true },
                  { label: 'Delete line', icon: Trash2, danger: true, onClick: () => removeLine(l) },
                ];
              }}
            />
          </div>
          <div className="budget-cat-foot">
            <Button size="sm" variant="ghost" icon={Plus} onClick={addLine}>
              Add line
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- detail view */

export function DetailView({ focusCat, onFocused, onAddCategory }: { focusCat: ID | null; onFocused: () => void; onAddCategory: (s: SectionId) => void }) {
  const budget = useProject((p) => p.budget);
  const pid = useProjectId();
  const fmt = useFormatters();
  const [collapsed, setCollapsedState] = useState<Record<string, boolean>>(() => readLS(`prepro.budget.collapsed.${pid}`, {}));
  const setCollapsed = (next: Record<string, boolean>) => {
    setCollapsedState(next);
    writeLS(`prepro.budget.collapsed.${pid}`, next);
  };
  const [query, setQuery] = useState('');
  const [hideZero, setHideZero] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const currency = useMemo(() => fmt.money(0).replace(/[\d.,\s  ]/g, '') || '$', [fmt]);
  const summary = useMemo(() => summarize(budget), [budget]);

  // scroll to / expand a category requested from the top sheet
  useEffect(() => {
    if (!focusCat) return;
    if (collapsed[focusCat]) setCollapsed({ ...collapsed, [focusCat]: false });
    const raf = requestAnimationFrame(() => {
      document.getElementById(`budget-cat-${focusCat}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      onFocused();
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusCat]);

  const allIds = budget.categories.map((c) => c.id);
  const anyOpen = allIds.some((id) => !collapsed[id]);

  if (!budget.categories.length) {
    return (
      <EmptyState
        icon={Wallet}
        title="No accounts yet"
        description="Add budget accounts (e.g. 2100 Camera) and their line items, or use Quick fill to pull in cast & crew rates."
        action={
          <Menu
            trigger={
              <Button variant="primary" icon={Plus}>
                Add account
              </Button>
            }
            items={SECTIONS.map((s) => ({ label: s.label, onClick: () => onAddCategory(s.id) }))}
          />
        }
      />
    );
  }

  return (
    <div ref={rootRef}>
      <Toolbar style={{ padding: '0 0 12px', border: 0, background: 'transparent' }}>
        <SearchInput value={query} onChange={setQuery} placeholder="Search lines…" />
        <Checkbox checked={hideZero} onChange={setHideZero} label="Hide empty lines" />
        <span className="spacer" />
        <Button
          size="sm"
          icon={anyOpen ? ChevronsDownUp : ChevronsUpDown}
          onClick={() => setCollapsed(Object.fromEntries(allIds.map((id) => [id, anyOpen])))}
        >
          {anyOpen ? 'Collapse all' : 'Expand all'}
        </Button>
      </Toolbar>
      {summary.sections.map((sec) => {
        const cats = sec.cats.map((c) => c.cat);
        const visible = query.trim()
          ? cats.filter((c) => matchesQuery(`${c.code ?? ''} ${c.name}`, query) || c.lines.some((l) => matchesQuery(`${l.description} ${l.notes ?? ''} ${l.unit}`, query)))
          : cats;
        if (!visible.length && query.trim()) return null;
        return (
          <section key={sec.def.id} className="budget-section">
            <div className="budget-section-head" style={{ ['--sec' as any]: sec.def.color }}>
              <span className="budget-section-dot" />
              <h3>{sec.def.label}</h3>
              <span className="muted small">{plural(cats.length, 'account')}</span>
              <span className="spacer" />
              {sec.actual > 0 && <span className="small muted nowrap">Actual {fmt.money(sec.actual)}</span>}
              <span className="budget-section-total">{fmt.money(sec.total)}</span>
              <Button size="sm" variant="ghost" icon={Plus} onClick={() => onAddCategory(sec.def.id)}>
                Account
              </Button>
            </div>
            {visible.length === 0 && <div className="budget-section-empty muted small">No accounts in this section.</div>}
            {visible.map((c, i) => (
              <CategoryCard
                key={c.id}
                cat={c}
                open={!!query.trim() || !collapsed[c.id]}
                onToggle={(open) => setCollapsed({ ...collapsed, [c.id]: open == null ? !collapsed[c.id] : !open })}
                currency={currency}
                query={query}
                hideZero={hideZero}
                isFirst={i === 0}
                isLast={i === visible.length - 1}
              />
            ))}
          </section>
        );
      })}
      <div className="budget-detail-total">
        <span>Subtotal (before contingency, insurance & tax)</span>
        <span className="spacer" />
        {summary.actual > 0 && <span className="muted small">Actual {fmt.money(summary.actual)}</span>}
        <b>{fmt.money(summary.subtotal)}</b>
      </div>
    </div>
  );
}
