/* Categories & rules: edit categories (name, group, how they count, colour,
   auto-categorise keywords) and the rules that categorise / rename imported
   transactions. */
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Pencil, Plus, Repeat, RotateCcw, Sparkles, Tags, Trash2, Wand2 } from 'lucide-react';
import { useApp } from '@/store/app';
import { plural } from '@/lib/text';
import { VIZ } from '@/ui/charts';
import { Button, confirmDialog, EmptyState, IconButton, Input, Menu, ModuleHeader, Select, toast, Toolbar, UnderlineTabs } from '@/ui';
import type { CategoryGroup, CategoryKind, FinCategory } from '../../types';
import { CATEGORY_GROUPS, CATEGORY_KINDS, DEFAULT_CATEGORIES, RULE_MATCHES } from '../../types';
import { accountLabel, byCategory, txOfMonth } from '../../calc';
import { addCategory, applyRules, deleteCategory, ruleMatchCount, updateFinance } from '../../ops';
import { RuleModal } from '../../RuleModal';
import type { FinRule } from '../../types';
import { CategoryPill, FinPage, useAccountMap, useCatMap, useFinance, useFmt, useToday } from '../../ui';

type Tab = 'categories' | 'rules';

export default function CategoriesModule() {
  const f = useFinance();
  const navKey = useApp((s) => s.navKey);
  const params = useApp((s) => s.params);
  const [tab, setTab] = useState<Tab>('categories');
  useEffect(() => {
    if (params?.tab === 'rules' || params?.tab === 'categories') setTab(params.tab);
  }, [navKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const uncategorised = f.transactions.filter((t) => !t.category && !t.transfer).length;
  return (
    <div className="module">
      <ModuleHeader
        title="Categories & rules"
        icon={Tags}
        subtitle={`${plural(f.categories.length, 'category', 'categories')} · ${plural(f.rules.length, 'rule')}${uncategorised ? ` · ${uncategorised} uncategorised` : ''}`}
        actions={
          <Button
            icon={Wand2}
            disabled={!uncategorised}
            onClick={() => {
              const n = applyRules('uncategorized');
              toast(n ? `Categorised ${plural(n, 'transaction')}` : 'No rule or keyword matched the uncategorised transactions', n ? 'success' : 'info');
            }}
          >
            Auto-categorise {uncategorised ? `(${uncategorised})` : ''}
          </Button>
        }
      />
      <Toolbar>
        <div className="fin-tabscroll">
          <UnderlineTabs
            tabs={[
              { id: 'categories', label: 'Categories', icon: Tags, count: f.categories.length },
              { id: 'rules', label: 'Rules', icon: Sparkles, count: f.rules.length },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
      </Toolbar>
      <div className="module-body">
        <FinPage>{tab === 'categories' ? <Categories /> : <Rules />}</FinPage>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- categories */

function Categories() {
  const f = useFinance();
  const fmt = useFmt();
  const { month } = useToday();
  const [name, setName] = useState('');
  const [group, setGroup] = useState<CategoryGroup>('lifestyle');
  const [kind, setKind] = useState<CategoryKind>('expense');
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of f.transactions) if (t.category) m.set(t.category, (m.get(t.category) ?? 0) + 1);
    return m;
  }, [f.transactions]);
  const cats = useCatMap();
  const thisMonth = useMemo(() => new Map(byCategory(txOfMonth(f.transactions, month, f.settings.monthStartDay), cats).map((r) => [r.id, r.amount])), [f.transactions, month, f.settings.monthStartDay, cats]);
  const missing = DEFAULT_CATEGORIES.filter((d) => !f.categories.some((c) => c.id === d.id));
  const patch = (id: string, p: Partial<FinCategory>, coalesce = false) =>
    updateFinance(
      (fd) => {
        const c = fd.categories.find((x) => x.id === id);
        if (c) Object.assign(c, p);
      },
      coalesce ? { coalesce: `fin-cat:${id}:${Object.keys(p).join(',')}` } : undefined,
    );
  const add = () => {
    if (!name.trim()) return;
    if (f.categories.some((c) => c.name.toLowerCase() === name.trim().toLowerCase())) {
      toast('A category with that name exists', 'info');
      return;
    }
    addCategory({ name: name.trim(), group, kind, slot: CATEGORY_GROUPS.find((g) => g.value === group)?.slot ?? 3, keywords: [] });
    setName('');
  };
  const remove = async (c: FinCategory) => {
    const n = counts.get(c.id) ?? 0;
    const target = c.id === 'other' ? undefined : f.categories.find((x) => x.id === 'other') ? 'other' : undefined;
    const ok = await confirmDialog({
      title: `Delete “${c.name}”?`,
      message: n ? `${plural(n, 'transaction')} will move to ${target ? '“Other”' : 'Uncategorised'}; its money moves with them (or back to Ready to Assign), its target and rules are removed.` : `Its assigned money ${target ? 'moves to “Other”' : 'returns to Ready to Assign'}; its target and rules are removed.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) deleteCategory(c.id, target);
  };
  const ordered = [...f.categories].sort((a, b) => CATEGORY_GROUPS.findIndex((g) => g.value === a.group) - CATEGORY_GROUPS.findIndex((g) => g.value === b.group));
  return (
    <>
      <div className="fin-table-wrap">
        <table className="fin-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Group</th>
              <th>Counts as</th>
              <th>Keywords (auto-categorise)</th>
              <th className="num">Used</th>
              <th className="num">This month</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ordered.map((c) => (
              <tr key={c.id}>
                <td>
                  <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                    <Menu
                      trigger={<button type="button" className="fin-swatch on" style={{ background: VIZ(c.slot), borderColor: 'transparent' }} aria-label="Colour" />}
                      items={Array.from({ length: 8 }, (_, i) => ({ label: `Colour ${i + 1}`, swatch: VIZ(i), checked: c.slot === i, onClick: () => patch(c.id, { slot: i }) }))}
                    />
                    <Input size="sm" bare value={c.name} onChange={(v) => patch(c.id, { name: v }, true)} aria-label="Name" style={{ minWidth: 140 }} />
                  </div>
                </td>
                <td>
                  <Select size="sm" bare value={c.group} options={CATEGORY_GROUPS.map((g) => ({ value: g.value, label: g.label }))} onChange={(v) => patch(c.id, { group: v as CategoryGroup })} />
                </td>
                <td>
                  <Select size="sm" bare value={c.kind} options={CATEGORY_KINDS.map((k) => ({ value: k.value, label: k.label }))} onChange={(v) => patch(c.id, { kind: v as CategoryKind })} title={CATEGORY_KINDS.find((k) => k.value === c.kind)?.hint} />
                </td>
                <td style={{ minWidth: 220 }}>
                  <Input
                    size="sm"
                    bare
                    value={(c.keywords ?? []).join(', ')}
                    onChange={(v) => patch(c.id, { keywords: v.split(',').map((x) => x.trimStart().toLowerCase()).filter((x, i, a) => x || i === a.length - 1) }, true)}
                    placeholder="e.g. starbucks, cafe"
                    aria-label="Keywords"
                  />
                </td>
                <td className="num">{counts.get(c.id) ?? 0}</td>
                <td className="num">{thisMonth.get(c.id) ? fmt.money(thisMonth.get(c.id)!, { cents: false }) : <span className="muted">—</span>}</td>
                <td style={{ textAlign: 'right' }}>
                  <IconButton icon={Trash2} size="sm" label="Delete category" onClick={() => void remove(c)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <Input value={name} onChange={setName} placeholder="New category, e.g. Pets" onKeyDown={(e) => e.key === 'Enter' && add()} style={{ flex: '1 1 180px', minWidth: 0, maxWidth: 300 }} />
        <Select value={group} options={CATEGORY_GROUPS.map((g) => ({ value: g.value, label: g.label }))} onChange={(v) => setGroup(v as CategoryGroup)} />
        <Select value={kind} options={CATEGORY_KINDS.map((k) => ({ value: k.value, label: k.label }))} onChange={(v) => setKind(v as CategoryKind)} />
        <Button icon={Plus} disabled={!name.trim()} onClick={add}>
          Add category
        </Button>
        <div className="spacer" />
        {missing.length > 0 && (
          <Button
            variant="ghost"
            icon={RotateCcw}
            onClick={() => {
              updateFinance((fd) => {
                for (const d of missing) fd.categories.push({ ...d, keywords: [...(d.keywords ?? [])], builtIn: true });
              });
              toast(`Restored ${plural(missing.length, 'default category', 'default categories')}`);
            }}
          >
            Restore {plural(missing.length, 'default')}
          </Button>
        )}
      </div>
      <p className="fin-footnote">
        “Counts as” decides the totals: <b>Spending</b> and <b>Income</b> feed the dashboard, <b>Saving / investing</b> is money you set aside (not spending), <b>Transfer</b> is ignored (card payments, moves between your accounts). Keywords match the start of a word in the bank description; rules win over keywords.
      </p>
    </>
  );
}

/* ---------------------------------------------------------------- rules */

function Rules() {
  const f = useFinance();
  const cats = useCatMap();
  const accts = useAccountMap();
  const [edit, setEdit] = useState<FinRule | 'new' | null>(null);
  const remove = (id: string) =>
    updateFinance((fd) => {
      fd.rules = fd.rules.filter((r) => r.id !== id);
    });
  return (
    <>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <span className="muted small">Rules run top to bottom on every import (and when you auto-categorise). The first rule with a category wins.</span>
        <div className="row" style={{ gap: 8 }}>
          <Button
            icon={RotateCcw}
            disabled={!f.rules.length}
            onClick={async () => {
              if (!(await confirmDialog({ title: 'Re-categorise every transaction?', message: 'Rules and keywords run on all transactions and replace categories they match (others keep theirs). Ctrl+Z undoes it.', confirmLabel: 'Re-apply' }))) return;
              const n = applyRules('all');
              toast(`Updated ${plural(n, 'transaction')}`);
            }}
          >
            Re-apply to all
          </Button>
          <Button variant="primary" icon={Plus} onClick={() => setEdit('new')}>
            Add rule
          </Button>
        </div>
      </div>
      {!f.rules.length ? (
        <EmptyState icon={Sparkles} title="No rules yet" description="Create a rule from any transaction (select it → Create rule) or here: “description contains STARBUCKS → Dining & coffee, rename to Starbucks”. Agents can create rules with finance_categorize too." />
      ) : (
        <div className="fin-table-wrap">
          <table className="fin-table">
            <thead>
              <tr>
                <th>When the description…</th>
                <th>Category</th>
                <th>Rename to</th>
                <th>Also</th>
                <th className="num">Matches</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {f.rules.map((r) => (
                <tr key={r.id}>
                  <td className="clickable" onClick={() => setEdit(r)}>
                    <span className="muted small">{RULE_MATCHES.find((m) => m.value === r.matchType)?.label} </span>
                    <b>“{r.match}”</b>
                    {r.accountId && <span className="muted small"> · {accountLabel(accts.get(r.accountId))}</span>}
                  </td>
                  <td>{r.category ? <CategoryPill category={cats.get(r.category)} /> : <span className="muted">—</span>}</td>
                  <td>{r.rename || <span className="muted">—</span>}</td>
                  <td>
                    <span className="fin-flags">
                      {r.transfer && (
                        <span className="fin-badge">
                          <ArrowLeftRight /> transfer
                        </span>
                      )}
                      {r.recurring && (
                        <span className="fin-badge">
                          <Repeat /> recurring
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="num">{ruleMatchCount(r, f.transactions)}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <IconButton icon={Pencil} size="sm" label="Edit rule" onClick={() => setEdit(r)} />
                    <IconButton icon={Trash2} size="sm" label="Delete rule" onClick={() => remove(r.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <RuleModal rule={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  );
}
