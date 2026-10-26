/* Design system › Overview: name, summary, how agents should use it, brand intent and personality. */
import { BookOpen, Bot, Plus, Smile } from 'lucide-react';
import { uid } from '@/lib/id';
import { useSpace } from '@/store/space';
import { Button, Field, Input, Textarea } from '@/ui';
import { dsSet, dsUpdate } from '../ops';
import { ItemActions, SectionHead, SubHead, Teach, confirmRemove, useDS } from './shared';

function addWord(): string {
  const id = uid('dsw');
  dsUpdate((ds) => void ds.intent.personality.push({ id, word: '', looksLike: '' }));
  return id;
}

function patchWord(id: string, patch: { word?: string; looksLike?: string }) {
  dsUpdate(
    (ds) => {
      const w = ds.intent.personality.find((x) => x.id === id);
      if (w) Object.assign(w, patch);
    },
    { coalesce: `ds:intent.personality:${id}:${Object.keys(patch).join(',')}` },
  );
}

function moveWord(from: number, to: number) {
  dsUpdate((ds) => {
    const l = ds.intent.personality;
    if (to < 0 || to >= l.length) return;
    const [x] = l.splice(from, 1);
    l.splice(to, 0, x);
  });
}

function removeWord(id: string) {
  dsUpdate((ds) => {
    ds.intent.personality = ds.intent.personality.filter((x) => x.id !== id);
  });
}

const focusNew = (id: string) => setTimeout(() => document.querySelector<HTMLInputElement>(`[data-ds-id="${id}"] input`)?.focus(), 30);

export function OverviewSection() {
  const ds = useDS();
  const title = useSpace((s) => s.meta?.title);
  const i = ds.intent;
  return (
    <div className="ds-section">
      <SectionHead
        icon={BookOpen}
        title="Overview"
        intro="What this design system is for and how anyone — a designer, Claude Design, an image model or a coding agent — should use it. The agent guide opens with this page."
      />

      <div className="ds-card">
        <div className="ds-grid-2">
          <Field label="Name">
            <Input value={ds.name} placeholder={`${title || 'Brand'} design system`} onChange={(v) => dsSet('name', v)} />
          </Field>
          <Field label="Version">
            <Input value={ds.version} placeholder="e.g. 1.0" onChange={(v) => dsSet('version', v)} />
          </Field>
          <Field label="Summary" span="all" hint="One paragraph: what the system covers and what it is used to make.">
            <Textarea autoGrow minRows={3} value={ds.summary} placeholder="e.g. The visual system of Intuition’s proposals, decks and social posts: a dark, confident look built on oversized type, a cyan accent and a spectrum motif." onChange={(v) => dsSet('summary', v)} />
          </Field>
        </div>
      </div>

      <div className="ds-card ds-card-accent">
        <SubHead title={<><Bot size={15} /> How agents should use this</>} hint="Shown first in the agent guide" />
        <Textarea
          autoGrow
          minRows={4}
          value={ds.agentNotes}
          placeholder={'e.g.\n- Start from the Cover and Content layouts; never invent new colours.\n- Use the real logo files and place exact copy in finishing — never generate text inside images.\n- When unsure between two options, pick the quieter one.'}
          onChange={(v) => dsSet('agentNotes', v)}
        />
      </div>

      <div className="ds-card">
        <SubHead title="Brand intent" hint="Who it is for and what the visuals have to achieve" />
        <div className="ds-grid-3">
          <Field label="Audience">
            <Textarea autoGrow minRows={2} value={i.audience} placeholder="e.g. Heads of L&D at US banks and insurers" onChange={(v) => dsSet('intent.audience', v)} />
          </Field>
          <Field label="Impression to leave">
            <Textarea autoGrow minRows={2} value={i.impression} placeholder="e.g. Serious, modern experts who make learning measurable" onChange={(v) => dsSet('intent.impression', v)} />
          </Field>
          <Field label="Purpose of the visuals">
            <Textarea autoGrow minRows={2} value={i.purpose} placeholder="e.g. Stop the scroll, then make one idea instantly clear" onChange={(v) => dsSet('intent.purpose', v)} />
          </Field>
        </div>
      </div>

      <div className="ds-card">
        <SubHead
          title="Personality"
          hint="Adjectives only help a model when you say what they look like"
          actions={
            i.personality.length > 0 && (
              <Button size="sm" variant="ghost" icon={Plus} onClick={() => focusNew(addWord())}>
                Add word
              </Button>
            )
          }
        />
        {i.personality.length === 0 ? (
          <Teach
            icon={Smile}
            title="Turn adjectives into visible choices"
            actions={
              <Button icon={Plus} onClick={() => focusNew(addWord())}>
                Add a personality word
              </Button>
            }
          >
            “Confident” means nothing to a generator. “Confident → oversized type, few elements, lots of black” does. Add 3–5 words and what each looks like in practice.
          </Teach>
        ) : (
          <div className="ds-words">
            {i.personality.map((w, idx) => (
              <div key={w.id} className="ds-word" data-ds-id={w.id}>
                <Input className="ds-word-word strong" value={w.word} placeholder="e.g. Confident" aria-label="Word" onChange={(v) => patchWord(w.id, { word: v })} />
                <span className="ds-word-arrow" aria-hidden>
                  →
                </span>
                <Input
                  className="grow"
                  value={w.looksLike}
                  placeholder="what it looks like, e.g. oversized type, few elements, lots of black"
                  aria-label="What it looks like"
                  onChange={(v) => patchWord(w.id, { looksLike: v })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && idx === i.personality.length - 1) focusNew(addWord());
                  }}
                />
                <ItemActions
                  index={idx}
                  count={i.personality.length}
                  onMove={moveWord}
                  label="word"
                  onDelete={async () => {
                    if (await confirmRemove('this word', !!(w.word || w.looksLike))) removeWord(w.id);
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
