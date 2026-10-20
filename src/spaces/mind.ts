/* Connects the shared Mind Dump board (src/modules/script/mind) to the open
   Marketing Space, so its Ideas screen and the board operations (add notes,
   group, tidy …) edit space.mind while a space is shown. Import for its side
   effect wherever space boards are used. */
import type { IdeaNote } from '@/types';
import { getSpace, updateSpace } from '@/store/space';
import { markUsed, readingOrder, registerSpaceMindTarget } from '@/modules/script/mind/ops';
import { uid } from '@/lib/id';
import { toast } from '@/ui/Toast';
import { makeContent } from './defaults';
import type { ContentFormat, ContentStage } from './types';

registerSpaceMindTarget({
  id: () => getSpace().id,
  get: () => getSpace().mind,
  update: (recipe, opts) => updateSpace((d) => recipe(d.mind), opts),
});

function firstLine(t: string) {
  return t.split('\n')[0].trim();
}

/** Turn board notes into content pieces (title = first line, concept = the rest). Returns the new ids. */
export function notesToContent(notes: IdeaNote[], opts: { format?: ContentFormat; stage?: ContentStage } = {}): string[] {
  const pieces = readingOrder(notes).map((n) =>
    makeContent({
      title: firstLine(n.text).slice(0, 120) || 'Idea',
      concept: n.text.split('\n').slice(1).join('\n').trim() || (firstLine(n.text).length > 120 ? n.text.trim() : undefined),
      format: opts.format ?? 'short_video',
      stage: opts.stage ?? 'idea',
    }),
  );
  updateSpace((d) => void d.content.push(...pieces));
  markUsed(notes.map((n) => n.id));
  toast(`Added ${pieces.length} piece${pieces.length === 1 ? '' : 's'} to Content`);
  return pieces.map((p) => p.id);
}

/** Turn notes into campaign milestones (undated). */
export function notesToMilestones(notes: IdeaNote[]): string[] {
  const ms = readingOrder(notes).map((n) => ({ id: uid('sms'), name: firstLine(n.text) || 'Milestone', notes: n.text.split('\n').slice(1).join('\n').trim() || undefined }));
  updateSpace((d) => void d.milestones.push(...ms));
  markUsed(notes.map((n) => n.id));
  toast(`Added ${ms.length} milestone${ms.length === 1 ? '' : 's'}`);
  return ms.map((m) => m.id);
}
