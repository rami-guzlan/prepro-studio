/* Business brainstorming: turn notes from the Ideas board (the same board as
   Marketing Spaces, src/spaces/mind.ts) into business items. Title = the note's
   first line, the rest becomes the item's notes. */
import type { IdeaNote } from '@/types';
import { markUsed, readingOrder } from '@/modules/script/mind/ops';
import { todayISO } from '@/lib/dates';
import { toast } from '@/ui/Toast';
import { asOneSpaceStep } from '@/store/space';
import '@/spaces/mind';
import { addItem, makeDeal, makeInitiative, makeSop } from './ops';
import { addStrategyItem, makeOffer, makePriority, quarterOf } from './modules/strategy/ops';

const split = (n: IdeaNote) => {
  const lines = n.text.trim().split('\n');
  const title = lines[0].trim().slice(0, 120) || 'Idea';
  const rest = lines.slice(1).join('\n').trim() || (lines[0].trim().length > 120 ? n.text.trim() : '');
  return { title, rest: rest || undefined };
};

function send(notes: IdeaNote[], what: string, add: (title: string, rest?: string) => void) {
  const list = readingOrder(notes);
  void asOneSpaceStep(() => {
    for (const n of list) {
      const { title, rest } = split(n);
      add(title, rest);
    }
    markUsed(list.map((n) => n.id));
  });
  toast(`Added ${list.length} ${what}${list.length === 1 ? '' : 's'}`);
}

export const notesToInitiatives = (notes: IdeaNote[]) => send(notes, 'growth initiative', (title, notes) => void addItem('initiatives', makeInitiative({ title, notes })));
export const notesToPriorities = (notes: IdeaNote[]) => {
  const quarter = quarterOf(todayISO());
  send(notes, 'priority', (text) => void addStrategyItem('priorities', makePriority({ text, quarter })));
};
export const notesToOffers = (notes: IdeaNote[]) => send(notes, 'offer', (name, description) => void addStrategyItem('offers', makeOffer({ name, description })));
export const notesToDeals = (notes: IdeaNote[]) => send(notes, 'lead', (title, notes) => void addItem('deals', makeDeal({ title, notes })));
export const notesToSops = (notes: IdeaNote[]) => send(notes, 'workflow', (title, notes) => void addItem('sops', makeSop({ title, notes })));
