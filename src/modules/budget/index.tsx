/* Budget: top sheet, detail (accounts + line items) and actuals. */
import './budget.css';
import { useMemo, useState } from 'react';
import { Camera, LayoutList, Plus, Receipt, Sheet, Users, Wallet, WandSparkles } from 'lucide-react';
import type { ID } from '@/types';
import { getProject, update, useFormatters, useProject } from '@/store/project';
import { readLS, writeLS } from '@/store/app';
import { uid } from '@/lib/id';
import { plural } from '@/lib/text';
import { templateBudget } from '@/templates';
import { Button, EmptyState, ExportMenu, Menu, ModuleHeader, UnderlineTabs, promptDialog, toast, type MenuItem } from '@/ui';
import { SECTIONS, SECTION_BY_ID, insertIndex, nextCode, summarize, type SectionId } from './calc';
import { DetailView, newLine } from './Detail';
import { TopSheet } from './TopSheet';
import { ActualsView } from './Actuals';
import { addGearDraft, addPeopleDraft, type PeopleFillResult } from './quickfill';
import { exportBudgetCsv } from './exports';

type Tab = 'top' | 'detail' | 'actuals';

export default function BudgetModule() {
  const budget = useProject((p) => p.budget);
  const fmt = useFormatters();
  const [tab, setTabState] = useState<Tab>(() => readLS<Tab>('prepro.budget.tab', 'top'));
  const setTab = (t: Tab) => {
    writeLS('prepro.budget.tab', t);
    setTabState(t);
  };
  const [focusCat, setFocusCat] = useState<ID | null>(null);
  const s = useMemo(() => summarize(budget), [budget]);
  const lineCount = budget.categories.reduce((n, c) => n + c.lines.length, 0);

  const addCategory = async (section: SectionId) => {
    const name = await promptDialog({
      title: `New ${SECTION_BY_ID[section].label.toLowerCase()} account`,
      placeholder: section === 'post' ? 'e.g. Subtitling' : section === 'atl' ? 'e.g. Rights & Options' : 'e.g. Stunts',
      confirmLabel: 'Add account',
    });
    if (!name?.trim()) return;
    const id = uid('bc');
    update((d) => {
      const code = nextCode(d.budget, section);
      d.budget.categories.splice(insertIndex(d.budget, section), 0, { id, code, name: name.trim(), section, lines: [newLine()] });
    });
    setTab('detail');
    setFocusCat(id);
  };

  const quickPeople = () => {
    const p = getProject();
    const withRate = p.cast.filter((c) => c.rate && c.status !== 'declined').length + p.crew.filter((c) => c.rate && c.status !== 'declined').length;
    if (!withRate) {
      toast('No cast or crew with a rate yet — add day rates in Cast & Crew first.', 'info');
      return;
    }
    let res: PeopleFillResult | null = null;
    update((d) => {
      res = addPeopleDraft(d);
    });
    const r = res as PeopleFillResult | null;
    if (!r) return;
    const parts = [
      r.added ? `added ${plural(r.added, 'line')}` : '',
      r.filled ? `filled ${plural(r.filled, 'template line')}` : '',
      r.skipped ? `${r.skipped} already in the budget` : '',
      r.created.length ? `new account${r.created.length === 1 ? '' : 's'}: ${r.created.join(', ')}` : '',
    ].filter(Boolean);
    const msg = parts.length ? parts.join(' · ') : 'Nothing to add';
    toast(msg.charAt(0).toUpperCase() + msg.slice(1), r.added || r.filled ? 'success' : 'info');
    if (r.added || r.filled) setTab('detail');
  };

  const quickGear = () => {
    let r: ReturnType<typeof addGearDraft> | null = null;
    update((d) => {
      r = addGearDraft(d, (n) => fmt.money(n, { cents: false }));
    });
    const res = r as ReturnType<typeof addGearDraft> | null;
    if (!res) return;
    if (res.result === 'empty') toast('The gear list has no costs yet — add day rates or flat costs in Gear & Equipment.', 'info');
    else toast(`${res.result === 'added' ? 'Added' : 'Updated'} gear rentals line: ${fmt.money(res.total)}${res.created.length ? ` (new account: ${res.created.join(', ')})` : ''}`);
  };

  const quickMenu: MenuItem[] = [
    { header: 'Quick fill' },
    { label: 'Add cast & crew from People', icon: Users, onClick: quickPeople },
    { label: 'Add gear rentals total', icon: Camera, onClick: quickGear },
  ];
  const addMenu: MenuItem[] = [{ header: 'Add account to' }, ...SECTIONS.map((sec): MenuItem => ({ label: sec.label, onClick: () => addCategory(sec.id) }))];

  const header = (
    <ModuleHeader
      title="Budget"
      icon={Wallet}
      subtitle={
        budget.categories.length
          ? `Grand total ${fmt.money(s.grand, { cents: false })} · ${plural(budget.categories.length, 'account')}, ${plural(lineCount, 'line')}${s.actual ? ` · spent ${fmt.money(s.actual, { cents: false })} (${s.subtotal ? ((s.actual / s.subtotal) * 100).toFixed(0) : 0}%)` : ''}`
          : 'Top sheet, line items & actuals'
      }
      actions={
        <>
          <ExportMenu
            docs={[
              { id: 'budget-topsheet', label: 'Budget top sheet' },
              { id: 'budget-detail', label: 'Budget detail', options: { showActuals: false } },
              { id: 'budget-detail', label: 'Budget detail with actuals', options: { showActuals: true } },
            ]}
            csv={[{ label: 'All budget lines (CSV)', onClick: exportBudgetCsv }]}
          />
          <Menu trigger={<Button icon={WandSparkles}>Quick fill</Button>} items={quickMenu} align="end" />
          <Menu
            trigger={
              <Button variant="primary" icon={Plus}>
                Add account
              </Button>
            }
            items={addMenu}
            align="end"
          />
        </>
      }
    />
  );

  if (!budget.categories.length) {
    return (
      <div className="module">
        {header}
        <div className="module-body">
          <EmptyState
            icon={Wallet}
            title="No budget yet"
            description="Start from the standard chart of accounts (story, cast, camera, grip & electric, post …) or build your own. Quick fill pulls cast & crew rates and the gear list into the budget."
            action={
              <div className="row wrap" style={{ justifyContent: 'center' }}>
                <Button
                  variant="primary"
                  icon={LayoutList}
                  onClick={() => {
                    update((d) => {
                      d.budget.categories = templateBudget();
                    });
                    setTab('detail');
                  }}
                >
                  Start from template
                </Button>
                <Menu trigger={<Button icon={Plus}>Add account</Button>} items={addMenu} />
              </div>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="module">
      {header}
      <UnderlineTabs<Tab>
        tabs={[
          { id: 'top', label: 'Top Sheet', icon: Sheet },
          { id: 'detail', label: 'Detail', icon: LayoutList, count: lineCount },
          { id: 'actuals', label: 'Actuals', icon: Receipt },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="module-body padded">
        <div className="budget-page">
          {tab === 'top' && (
            <TopSheet
              onOpenCategory={(id) => {
                setTab('detail');
                setFocusCat(id);
              }}
            />
          )}
          {tab === 'detail' && <DetailView focusCat={focusCat} onFocused={() => setFocusCat(null)} onAddCategory={addCategory} />}
          {tab === 'actuals' && <ActualsView />}
        </div>
      </div>
    </div>
  );
}
