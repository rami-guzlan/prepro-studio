/* Ideas — the brainstorm board of a business (same board as a Marketing
   Space's Ideas and the script's Mind Dump): write freely, pin sticky notes,
   group them, then turn the strongest into initiatives, priorities, offers,
   leads or workflows. */
import { BookOpenCheck, Flag, Lightbulb, Package, Rocket, Target } from 'lucide-react';
import type { IdeaNote } from '@/types';
import { useSpace } from '@/store/space';
import { MindDump } from '@/modules/script/mind/MindDump';
import { ModuleHeader, type MenuItem } from '@/ui';
import { notesToDeals, notesToInitiatives, notesToOffers, notesToPriorities, notesToSops } from '../../mind';

const EMPTY = { boards: [] };

export default function BizIdeasModule() {
  const mind = useSpace((s) => s.mind) ?? EMPTY;
  const spaceId = useSpace((s) => s.id);

  const sendMenu = (notes: IdeaNote[]): MenuItem[] => {
    const s = notes.length === 1 ? '' : 's';
    const disabled = notes.length === 0;
    return [
      { label: `Growth initiative${s}`, icon: Rocket, disabled, onClick: () => notesToInitiatives(notes) },
      { label: `Priorit${notes.length === 1 ? 'y' : 'ies'} for this quarter`, icon: Flag, disabled, onClick: () => notesToPriorities(notes) },
      { label: `Offer${s}`, icon: Package, disabled, onClick: () => notesToOffers(notes) },
      { label: `Sales lead${s}`, icon: Target, disabled, onClick: () => notesToDeals(notes) },
      { label: `Workflow${s} to write`, icon: BookOpenCheck, disabled, onClick: () => notesToSops(notes) },
    ];
  };

  return (
    <div className="module biz">
      <ModuleHeader title="Ideas" icon={Lightbulb} subtitle="Brainstorm the business: one board per topic, cluster the notes, then turn the strongest into initiatives, priorities, offers, leads or workflows." />
      <MindDump
        mind={mind}
        scopeId={spaceId}
        sendMenu={sendMenu}
        printDocId="space-biz-ideas"
        placeholder={'Just type…\n\n- package: wedding trailer + 3 social cuts\n- partner with two local planners\n- raise the day rate in Q2\n- checklist for delivery day'}
      />
    </div>
  );
}
