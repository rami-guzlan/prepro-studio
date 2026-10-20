/* Strategy › Messaging (positioning, value proposition, tagline, voice, key
   messages, competitors) and Strategy › Notes. */
import type { LucideIcon } from 'lucide-react';
import { Crosshair, Gem, Megaphone, MessageCircle, NotebookPen, Quote, Swords } from 'lucide-react';
import type { Strategy } from '@/spaces/types';
import { updateSpace, useSpace } from '@/store/space';
import { Textarea } from '@/ui';

type TextKey = Exclude<keyof Strategy, 'tagline'>;

function setStrategy(key: keyof Strategy, value: string) {
  updateSpace(
    (d) => {
      (d.strategy as Strategy)[key] = value as never;
    },
    { coalesce: `strategy:${key}` },
  );
}

const FIELDS: { key: TextKey; title: string; icon: LucideIcon; hint: string; placeholder: string; rows: number }[] = [
  {
    key: 'positioning',
    title: 'Positioning',
    icon: Crosshair,
    hint: 'Who is this for, what do you give them, why you?',
    placeholder:
      'For [who] who [need or frustration], [this space] is the [what it is] that [main benefit].\nUnlike [the alternative], we [what makes us different].\n\ne.g. For indie filmmakers who feel they need a big crew to make something good, this channel shows how real short films get made with friends, one weekend and a borrowed light.',
    rows: 5,
  },
  {
    key: 'valueProp',
    title: 'Value proposition',
    icon: Gem,
    hint: 'Why should they care? What do they get here that they can’t get anywhere else?',
    placeholder: 'e.g. Every post leaves you with one thing you can use on your next shoot — no gear talk for gear’s sake, just what worked on set.',
    rows: 4,
  },
  {
    key: 'voice',
    title: 'Voice & tone',
    icon: MessageCircle,
    hint: 'How you sound: three adjectives, words you use, words you never use.',
    placeholder: 'Warm, direct, a little nerdy.\nWe say: “here’s how”, “on set”, “try this”.\nWe never say: “hack”, “guru”, “game-changer”.',
    rows: 4,
  },
  {
    key: 'keyMessages',
    title: 'Key messages',
    icon: Megaphone,
    hint: 'The 3–5 things every piece should reinforce. One per line.',
    placeholder: '1. Great films come from small crews and big ideas.\n2. Show the process, not just the result.\n3. The film is out on … — here’s where to watch it.',
    rows: 5,
  },
  {
    key: 'competitors',
    title: 'Competitors & inspiration',
    icon: Swords,
    hint: 'Who else talks to this audience? What do they do well — and where is the gap you fill?',
    placeholder: '@channel — great editing breakdowns, but never shows the messy process.\n@creator — brilliant hooks; we can borrow the 3-second cold open.',
    rows: 5,
  },
];

export function MessagingTab() {
  const strategy = useSpace((s) => s.strategy);
  const filled = FIELDS.filter((f) => (strategy?.[f.key] ?? '').trim()).length + (strategy?.tagline?.trim() ? 1 : 0);

  return (
    <div className="sp-strategy-page">
      <div className="sp-strategy-msg-intro">
        <div className="grow">
          <h3>Messaging</h3>
          <p className="muted small">The words behind every caption, script and pitch. Fill it in once, then come back whenever a piece feels off-brand.</p>
        </div>
        <span className="sp-strategy-count" title="Fields filled in">
          {filled}/{FIELDS.length + 1}
        </span>
      </div>

      <div className="card sp-strategy-tagline">
        <div className="sp-strategy-msg-title">
          <Quote size={15} />
          <b>Tagline</b>
          <span className="muted small">— the whole thing in a few words.</span>
        </div>
        <input
          className="sp-strategy-tagline-input"
          value={strategy?.tagline ?? ''}
          placeholder="e.g. Real films. Small crews. No excuses."
          onChange={(e) => setStrategy('tagline', e.target.value)}
          aria-label="Tagline"
        />
      </div>

      <div className="sp-strategy-msg-grid">
        {FIELDS.map((f) => {
          const Icon = f.icon;
          return (
            <div key={f.key} className="card sp-strategy-msg">
              <div className="sp-strategy-msg-title">
                <Icon size={15} />
                <b>{f.title}</b>
              </div>
              <div className="sp-strategy-msg-hint">{f.hint}</div>
              <Textarea autoGrow minRows={f.rows} value={strategy?.[f.key] ?? ''} placeholder={f.placeholder} onChange={(v) => setStrategy(f.key, v)} aria-label={f.title} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function NotesTab() {
  const notes = useSpace((s) => s.strategy?.notes);
  return (
    <div className="sp-strategy-page">
      <div className="card sp-strategy-notes">
        <div className="sp-strategy-msg-title">
          <NotebookPen size={15} />
          <b>Strategy notes</b>
          <span className="spacer" />
          <span className="muted tiny">Saved automatically</span>
        </div>
        <Textarea
          autoGrow
          minRows={16}
          value={notes ?? ''}
          placeholder={'Research, meeting notes with your collaborator, what you learned from the last launch, platform changes to keep an eye on, experiments to try next quarter…'}
          onChange={(v) => setStrategy('notes', v)}
          aria-label="Strategy notes"
        />
      </div>
    </div>
  );
}
