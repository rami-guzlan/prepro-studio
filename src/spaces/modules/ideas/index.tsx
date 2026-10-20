/* Ideas — the brainstorm board of a Marketing Space (same board as the
   script's Mind Dump): write freely, pin sticky notes, group them, then turn
   the best ones into content pieces. */
import { FileText, GalleryHorizontal, Lightbulb, Mail, MessageSquareText, MonitorPlay, Smartphone, Flag, PenLine } from 'lucide-react';
import type { IdeaNote } from '@/types';
import { useSpace } from '@/store/space';
import { navigateSpace } from '@/store/app';
import { MindDump } from '@/modules/script/mind/MindDump';
import { notesToContent, notesToMilestones } from '@/spaces/mind';
import { Button, ModuleHeader, type MenuItem } from '@/ui';
import type { ContentFormat } from '@/spaces/types';

const EMPTY = { boards: [] };

export default function IdeasModule() {
  const mind = useSpace((s) => s.mind) ?? EMPTY;
  const spaceId = useSpace((s) => s.id);
  const ideaCount = useSpace((s) => s.content.filter((c) => c.stage === 'idea').length);

  const sendMenu = (notes: IdeaNote[]): MenuItem[] => {
    const n = notes.length;
    const s = n === 1 ? '' : 's';
    const disabled = n === 0;
    const as = (label: string, icon: MenuItem['icon'], format: ContentFormat): MenuItem => ({ label, icon, disabled, onClick: () => notesToContent(notes, { format, stage: 'idea' }) });
    return [
      as(`Short video idea${s} (Reel / TikTok / Short)`, Smartphone, 'short_video'),
      as(`Long-form video idea${s}`, MonitorPlay, 'long_video'),
      as(`Carousel idea${s}`, GalleryHorizontal, 'carousel'),
      as(`Text post / thread idea${s}`, MessageSquareText, 'text'),
      as(`Newsletter idea${s}`, Mail, 'newsletter'),
      as(`Article idea${s}`, FileText, 'article'),
      { label: `Content to write now${n > 1 ? ` (${n})` : ''}`, icon: PenLine, disabled, onClick: () => notesToContent(notes, { stage: 'writing' }) },
      { label: `Milestone${s}`, icon: Flag, disabled, onClick: () => notesToMilestones(notes) },
    ];
  };

  return (
    <div className="module">
      <ModuleHeader
        title="Ideas"
        icon={Lightbulb}
        subtitle="Get every idea out, one board per batch or category, cluster them, then turn the strongest into content."
        actions={
          <Button icon={Lightbulb} onClick={() => navigateSpace('content', { stage: 'idea' })}>
            {ideaCount} idea{ideaCount === 1 ? '' : 's'} in Content
          </Button>
        }
      />
      <MindDump
        mind={mind}
        scopeId={spaceId}
        sendMenu={sendMenu}
        printDocId="space-ideas"
        placeholder={
          'Just type…\n\n- series idea: one lighting trick a week\n- behind the scenes of the rooftop shoot\n- answer the most asked question from comments\n- collab: live trailer breakdown'
        }
      />
    </div>
  );
}
