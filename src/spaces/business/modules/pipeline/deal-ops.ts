/* Deal write operations used by the pipeline screen (one undo step each). */
import { uid } from '@/lib/id';
import { todayISO } from '@/lib/dates';
import { navigateSpace } from '@/store/app';
import { promptDialog, toast } from '@/ui';
import { bizUpdate, getBiz, winDeal } from '../../ops';
import { stageInfo } from '../../derive-work';
import type { DealActivity, DealStage } from '../../types';

export function addActivity(dealId: string, a: Omit<DealActivity, 'id'>) {
  bizUpdate((b) => {
    const d = b.deals.find((x) => x.id === dealId);
    if (d) d.activities.push({ id: uid('act'), ...a });
  });
}

export function removeActivity(dealId: string, activityId: string) {
  bizUpdate((b) => {
    const d = b.deals.find((x) => x.id === dealId);
    if (d) d.activities = d.activities.filter((a) => a.id !== activityId);
  });
}

/** Win a deal (creates the planning project unless it has one) and offer to open it. */
export function winDealWithToast(dealId: string) {
  const before = getBiz().deals.find((d) => d.id === dealId);
  const had = before?.bizProjectId;
  const projectId = winDeal(dealId);
  const title = before?.title || 'Deal';
  if (projectId)
    toast(had ? `${title} won 🎉` : `${title} won 🎉 — a planning project was created`, 'success', {
      action: { label: 'Open project', onClick: () => navigateSpace('projects', { projectId }) },
    });
  else toast(`${title} won 🎉`);
}

/** Ask for the reason and mark a deal lost. Returns false when cancelled. */
export async function loseDeal(dealId: string): Promise<boolean> {
  const d = getBiz().deals.find((x) => x.id === dealId);
  if (!d) return false;
  const reason = await promptDialog({
    title: `Mark “${d.title || 'deal'}” as lost`,
    message: 'Why was it lost? (price, timing, went with someone else, no budget, no reply …) — helps you spot patterns.',
    defaultValue: d.lostReason ?? '',
    placeholder: 'Reason (optional)',
    confirmLabel: 'Mark lost',
  });
  if (reason == null) return false;
  bizUpdate((b) => {
    const x = b.deals.find((y) => y.id === dealId);
    if (!x) return;
    x.stage = 'lost';
    x.closedDate = todayISO();
    x.probability = 0;
    if (reason.trim()) x.lostReason = reason.trim();
    else delete x.lostReason;
  });
  toast(`${d.title || 'Deal'} marked lost`, 'info');
  return true;
}

/** Move a deal to a stage with the side effects of won / lost. */
export async function moveDeal(dealId: string, stage: DealStage): Promise<void> {
  const d = getBiz().deals.find((x) => x.id === dealId);
  if (!d || d.stage === stage) return;
  if (stage === 'won') return winDealWithToast(dealId);
  if (stage === 'lost') {
    await loseDeal(dealId);
    return;
  }
  bizUpdate((b) => {
    const x = b.deals.find((y) => y.id === dealId);
    if (!x) return;
    const wasClosed = !stageInfo(x.stage).open;
    x.stage = stage;
    if (wasClosed) {
      delete x.closedDate;
      delete x.probability;
      delete x.lostReason;
    }
  });
}
