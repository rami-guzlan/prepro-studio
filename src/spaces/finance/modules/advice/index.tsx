/* Advice & insights: insights computed from your data (pin / dismiss), advice
   saved by connected AI agents (finance_add_advice) and your own notes. */
import { useMemo, useState } from 'react';
import { Lightbulb, Plus } from 'lucide-react';
import { plural } from '@/lib/text';
import { Button, Checkbox, EmptyState, ModuleHeader, Tabs, Toolbar } from '@/ui';
import type { FinInsight } from '../../types';
import { computeInsights } from '../../calc';
import { AdviceModal, ComputedInsightItem, SavedInsightItem } from '../../parts';
import { AskAgentCard, FinCard, FinPage, NotAdviceNote, useFinance, useFmt, useToday } from '../../ui';

type Filter = 'active' | 'pinned' | 'agent' | 'dismissed';

export default function AdviceModule() {
  const f = useFinance();
  const fmt = useFmt();
  const { today } = useToday();
  const [filter, setFilter] = useState<Filter>('active');
  const [showDismissed, setShowDismissed] = useState(false);
  const [edit, setEdit] = useState<FinInsight | 'new' | null>(null);
  const all = useMemo(() => computeInsights(f, today, (n) => fmt.money(n, { cents: false }), true), [f, today, fmt]);
  const dismissedKeys = new Set(f.settings.dismissedInsights);
  const computed = all.filter((i) => showDismissed || !dismissedKeys.has(i.key));
  const saved = useMemo(() => {
    const list = f.insights.filter((i) => (filter === 'dismissed' ? i.dismissed : filter === 'pinned' ? i.pinned && !i.dismissed : filter === 'agent' ? i.source === 'agent' && !i.dismissed : !i.dismissed));
    return list.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.date.localeCompare(a.date));
  }, [f.insights, filter]);
  const counts = {
    active: f.insights.filter((i) => !i.dismissed).length,
    pinned: f.insights.filter((i) => i.pinned && !i.dismissed).length,
    agent: f.insights.filter((i) => i.source === 'agent' && !i.dismissed).length,
    dismissed: f.insights.filter((i) => i.dismissed).length,
  };

  return (
    <div className="module">
      <ModuleHeader
        title="Advice & insights"
        icon={Lightbulb}
        subtitle={`${plural(computed.length, 'insight')} from your data · ${plural(counts.active, 'saved note')}`}
        actions={
          <Button icon={Plus} onClick={() => setEdit('new')}>
            Write a note
          </Button>
        }
      />
      <Toolbar>
        <div className="fin-tabscroll">
          <Tabs
            tabs={[
              { id: 'active', label: 'Saved', count: counts.active },
              { id: 'pinned', label: 'Pinned', count: counts.pinned },
              { id: 'agent', label: 'From agents', count: counts.agent },
              { id: 'dismissed', label: 'Dismissed', count: counts.dismissed },
            ]}
            value={filter}
            onChange={setFilter}
          />
        </div>
        <div className="spacer" />
        <Checkbox checked={showDismissed} onChange={setShowDismissed} label="Show dismissed insights" />
      </Toolbar>
      <div className="module-body">
        <FinPage>
          <NotAdviceNote />
          <div className="fin-grid-2">
            <div className="col" style={{ gap: 16, minWidth: 0 }}>
              <FinCard title="Saved advice & notes" sub="From your agents (finance_add_advice), pinned insights and your own notes">
                {saved.length ? (
                  <div className="fin-insights">
                    {saved.map((i) => (
                      <SavedInsightItem key={i.id} i={i} onEdit={(x) => setEdit(x)} />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={Lightbulb}
                    title={filter === 'dismissed' ? 'Nothing dismissed' : 'No saved advice yet'}
                    description={filter === 'dismissed' ? undefined : 'Ask a connected agent to review your finances and save its advice here, pin an insight from below, or write your own note.'}
                    style={{ padding: 20 }}
                  />
                )}
              </FinCard>
              <FinCard title="Insights from your data" sub="Recomputed every time your data changes">
                {computed.length ? (
                  <div className="fin-insights">
                    {computed.map((i) => (
                      <ComputedInsightItem key={i.key} i={i} dismissed={dismissedKeys.has(i.key)} />
                    ))}
                  </div>
                ) : (
                  <p className="fin-muted-note" style={{ margin: 0 }}>
                    {f.transactions.length ? 'Nothing stands out right now — good sign. Insights look at category changes, budgets, new subscriptions, large payments, cash flow, card use, interest and your emergency fund.' : 'Import statements to get insights.'}
                  </p>
                )}
              </FinCard>
            </div>
            <AskAgentCard />
          </div>
        </FinPage>
      </div>
      {edit && <AdviceModal insight={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
