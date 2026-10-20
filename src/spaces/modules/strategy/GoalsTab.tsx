/* Strategy › Goals: measurable goals as editable cards, sorted by due date. */
import { useMemo } from 'react';
import { Copy, MoreHorizontal, Plus, Target, Trash2 } from 'lucide-react';
import type { Goal, GoalStatus } from '@/spaces/types';
import { GOAL_STATUSES, METRICS } from '@/spaces/constants';
import { goalProgress } from '@/spaces/derive';
import { useSpace, useSpaceFormatters } from '@/store/space';
import { diffDays, todayISO } from '@/lib/dates';
import { uid } from '@/lib/id';
import { optionColor } from '@/lib/constants';
import { Button, Combo, DateInput, EmptyState, Field, IconButton, Menu, NumberInput, Select, Textarea } from '@/ui';
import { addGoal, deleteGoal, focusSelect, goalElapsed, goalOps, goalPace, isISO } from './shared';

const METRIC_SUGGESTIONS = [
  'Followers (all channels)',
  'YouTube subscribers',
  'Instagram followers',
  'TikTok followers',
  'Newsletter subscribers',
  'Trailer views',
  'Views per video',
  'Watch time (hours)',
  'Engagement rate',
  'Website visits',
  'Email sign-ups',
  'Festival selections',
  'Tickets sold',
  'Revenue',
  ...METRICS.map((m) => m.label),
];

const UNIT_SUGGESTIONS = ['followers', 'subscribers', 'views', 'hours', '%', 'sign-ups', 'clicks', 'festivals', 'tickets', 'leads', '$'];

const QUICK_GOALS: Partial<Goal>[] = [
  { title: 'Grow the audience', metric: 'Followers (all channels)', unit: 'followers' },
  { title: 'Build an email list', metric: 'Newsletter subscribers', unit: 'subscribers' },
  { title: 'Get the trailer seen', metric: 'Trailer views', unit: 'views' },
  { title: 'Post consistently', metric: 'Posts per week', unit: 'posts' },
];

export function GoalsTab({ focusId, onAdded }: { focusId: string | null; onAdded: (id: string) => void }) {
  const goals = useSpace((s) => s.goals);
  const campaigns = useSpace((s) => s.campaigns);
  const sorted = useMemo(() => [...(goals ?? [])].sort((a, b) => (a.due ?? '9999-99').localeCompare(b.due ?? '9999-99')), [goals]);
  const campaignOptions = useMemo(() => (campaigns ?? []).map((c) => ({ value: c.id, label: c.name || 'Campaign', color: c.color })), [campaigns]);

  if (sorted.length === 0) {
    return (
      <div className="sp-strategy-page">
        <EmptyState
          icon={Target}
          title="What does success look like?"
          description="Goals turn a vague “grow the channel” into a number and a date. Start with one or two — you can track progress here and on the Overview."
          action={
            <div className="col" style={{ alignItems: 'center', gap: 12 }}>
              <Button variant="primary" icon={Plus} onClick={() => onAdded(addGoal())}>
                Add a goal
              </Button>
              <div className="sp-strategy-quick">
                <span className="muted small">or start from</span>
                {QUICK_GOALS.map((q) => (
                  <button key={q.title} type="button" className="sp-strategy-quick-chip" onClick={() => onAdded(addGoal(q))}>
                    {q.title}
                  </button>
                ))}
              </div>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="sp-strategy-page">
      <div className="sp-strategy-goals">
        {sorted.map((g) => (
          <GoalCard key={g.id} g={g} campaignOptions={campaignOptions} autoFocus={g.id === focusId} onDuplicated={onAdded} />
        ))}
        <button type="button" className="sp-strategy-add-card" onClick={() => onAdded(addGoal())}>
          <Plus size={18} />
          Add goal
        </button>
      </div>
    </div>
  );
}

function GoalCard({ g, campaignOptions, autoFocus, onDuplicated }: { g: Goal; campaignOptions: { value: string; label: string; color?: string }[]; autoFocus: boolean; onDuplicated: (id: string) => void }) {
  const fmt = useSpaceFormatters();
  const today = todayISO();
  const p = goalProgress(g);
  const elapsed = goalElapsed(g, today);
  const pace = goalPace(g, today);
  const color = optionColor(GOAL_STATUSES, g.status) ?? '#888';
  const set = (patch: Partial<Goal>, coalesce = false) => goalOps.update(g.id, patch, coalesce);
  const overdue = g.status !== 'done' && isISO(g.due) && g.due < today;
  const days = isISO(g.due) ? diffDays(today, g.due) : null;
  const dueText = days == null ? '' : overdue ? `Overdue by ${-days} day${days === -1 ? '' : 's'}` : days === 0 ? 'Due today' : `${days} day${days === 1 ? '' : 's'} left`;

  return (
    <div className={`sp-strategy-goal card ${g.status === 'done' ? 'done' : ''}`} style={{ ['--gc' as string]: color }}>
      <div className="sp-strategy-goal-head">
        <Select
          className="sp-strategy-pill"
          value={g.status}
          options={GOAL_STATUSES}
          onChange={(v) => set({ status: v as GoalStatus })}
          style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}
          aria-label="Goal status"
        />
        <span className="spacer" />
        {dueText && <span className={`sp-strategy-due ${overdue ? 'overdue' : ''}`}>{dueText}</span>}
        <Menu
          align="end"
          trigger={<IconButton icon={MoreHorizontal} label="Goal actions" size="sm" />}
          items={[
            {
              label: 'Duplicate',
              icon: Copy,
              onClick: () => {
                const copy = goalOps.duplicate(g.id, () => uid('goal'));
                if (copy) onDuplicated(copy.id);
              },
            },
            { separator: true },
            { label: 'Delete goal', icon: Trash2, danger: true, onClick: () => deleteGoal(g) },
          ]}
        />
      </div>
      <input
        ref={autoFocus ? focusSelect : undefined}
        className="sp-strategy-title-input"
        value={g.title}
        placeholder="Goal, e.g. Reach 10k subscribers"
        onChange={(e) => set({ title: e.target.value }, true)}
        aria-label="Goal title"
      />
      <Textarea
        bare
        autoGrow
        minRows={1}
        className="sp-strategy-goal-desc"
        value={g.description}
        placeholder="Why it matters and how you’ll get there"
        onChange={(v) => set({ description: v || undefined }, true)}
        aria-label="Goal description"
      />

      <div className="sp-strategy-goal-progress">
        <div className="sp-strategy-goal-nums">
          {p != null ? (
            <>
              <b>{fmt.number(g.current, 2)}</b>
              <span>
                / {fmt.number(g.target, 2)} {g.unit ?? ''}
              </span>
              <span className="spacer" />
              {pace && <span className={`sp-strategy-pace ${pace.tone}`}>{pace.label}</span>}
              <b style={{ color }}>{Math.round(p * 100)}%</b>
            </>
          ) : (
            <span className="muted small">Fill in current and target to see progress.</span>
          )}
        </div>
        <div className="sp-strategy-bar" title={elapsed != null ? `${Math.round(elapsed * 100)}% of the time window has passed` : undefined}>
          <span className="fill" style={{ width: `${Math.round((p ?? 0) * 100)}%`, background: color }} />
          {elapsed != null && g.status !== 'done' && <span className="tick" style={{ left: `${Math.round(elapsed * 100)}%` }} />}
        </div>
      </div>

      <div className="sp-strategy-goal-grid">
        <Field label="Metric" className="wide">
          <Combo size="sm" value={g.metric} suggestions={METRIC_SUGGESTIONS} placeholder="What you measure" onChange={(v) => set({ metric: v || undefined }, true)} />
        </Field>
        <Field label="Unit">
          <Combo size="sm" value={g.unit} suggestions={UNIT_SUGGESTIONS} placeholder="views" onChange={(v) => set({ unit: v || undefined }, true)} />
        </Field>
        <Field label="Baseline">
          <NumberInput size="sm" value={g.baseline} placeholder="0" onChange={(v) => set({ baseline: v }, true)} />
        </Field>
        <Field label="Current">
          <NumberInput size="sm" value={g.current} placeholder="—" onChange={(v) => set({ current: v }, true)} />
        </Field>
        <Field label="Target">
          <NumberInput size="sm" value={g.target} placeholder="—" onChange={(v) => set({ target: v }, true)} />
        </Field>
        <Field label="Start">
          <DateInput size="sm" value={g.start} onChange={(v) => set({ start: v })} />
        </Field>
        <Field label="Due">
          <DateInput size="sm" value={g.due} onChange={(v) => set({ due: v })} />
        </Field>
        <Field label="Campaign" className="wide">
          <Select size="sm" value={g.campaignId && campaignOptions.some((o) => o.value === g.campaignId) ? g.campaignId : ''} options={campaignOptions} placeholder={campaignOptions.length ? 'None' : 'No campaigns yet'} onChange={(v) => set({ campaignId: v || undefined })} />
        </Field>
      </div>
      <Textarea
        bare
        autoGrow
        minRows={1}
        className="sp-strategy-goal-notes"
        value={g.notes}
        placeholder="Notes — where the number comes from, when you last checked…"
        onChange={(v) => set({ notes: v || undefined }, true)}
        aria-label="Goal notes"
      />
    </div>
  );
}
