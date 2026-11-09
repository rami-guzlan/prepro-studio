/* Creator workspace → Idea: the premise in one sentence, hooks and titles to
   pick from, the thumbnail idea and a rough outline of beats. */
import { ArrowDown, ArrowUp, Lightbulb, Plus, Wand2, X } from 'lucide-react';
import type { CreatorBeat, CreatorData } from '@/types';
import { uid } from '@/lib/id';
import { Button, IconButton, ImageDrop, Input, Menu, NumberInput, Select, Textarea, confirmDialog } from '@/ui';
import { BEAT_KINDS, HOOK_PROMPTS, OUTLINE_TEMPLATES, fmtSeconds, outlineSeconds } from './model';
import { editCreator } from './ops';
import { OptionList, Section } from './shared';

type OptKey = 'hooks' | 'titles';
const optOps = (k: OptKey) => ({
  onAdd: (text: string) => editCreator((c) => void c.idea[k].push({ id: uid('opt'), text, picked: c.idea[k].length === 0 })),
  onText: (id: string, text: string) =>
    editCreator((c) => {
      const o = c.idea[k].find((x) => x.id === id);
      if (o) o.text = text;
    }, `${k}:${id}`),
  onPick: (id: string) =>
    editCreator((c) => {
      for (const o of c.idea[k]) o.picked = o.id === id ? !o.picked : false;
      // the picked title is the working title for publishing
      if (k === 'titles') {
        const t = c.idea.titles.find((x) => x.picked);
        if (t && !c.publish.title.trim()) c.publish.title = t.text;
      }
    }),
  onRemove: (id: string) => editCreator((c) => void (c.idea[k] = c.idea[k].filter((x) => x.id !== id))),
});

const beatOps = {
  add: (patch: Partial<CreatorBeat> = {}) => editCreator((c) => void c.idea.beats.push({ id: uid('beat'), text: '', kind: 'point', seconds: 30, ...patch })),
  set: (id: string, patch: Partial<CreatorBeat>, coalesce = true) =>
    editCreator((c) => {
      const b = c.idea.beats.find((x) => x.id === id);
      if (b) Object.assign(b, patch);
    }, coalesce ? `beat:${id}:${Object.keys(patch).join()}` : undefined),
  move: (id: string, dir: -1 | 1) =>
    editCreator((c) => {
      const i = c.idea.beats.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= c.idea.beats.length) return;
      const [b] = c.idea.beats.splice(i, 1);
      c.idea.beats.splice(j, 0, b);
    }),
  remove: (id: string) => editCreator((c) => void (c.idea.beats = c.idea.beats.filter((x) => x.id !== id))),
};

async function applyTemplate(c: CreatorData, id: string) {
  const t = OUTLINE_TEMPLATES.find((x) => x.id === id);
  if (!t) return;
  if (c.idea.beats.some((b) => b.text.trim()) && !(await confirmDialog({ title: `Replace the outline with “${t.label}”?`, message: 'Your current beats are replaced. You can undo with Ctrl+Z.', confirmLabel: 'Replace' }))) return;
  editCreator((x) => void (x.idea.beats = t.beats.map((b) => ({ id: uid('beat'), text: b.text, kind: b.kind, seconds: b.seconds }))));
}

export function IdeaTab({ c }: { c: CreatorData }) {
  const total = outlineSeconds(c.idea.beats);
  return (
    <div className="cr-cols">
      <div className="cr-col">
        <Section id="cr-premise" title="The video in one sentence" hint="If you can’t say it, you can’t shoot it">
          <Textarea autoGrow minRows={2} value={c.idea.premise} placeholder="This video shows [who] how to [do what] so they can [get what]." onChange={(premise) => editCreator((x) => void (x.idea.premise = premise), 'premise')} />
          <div className="cr-two">
            <label>
              <span className="muted small">Who it’s for</span>
              <Input value={c.idea.audience} placeholder="e.g. L&D leads new to AI" onChange={(audience) => editCreator((x) => void (x.idea.audience = audience), 'audience')} />
            </label>
            <label>
              <span className="muted small">What they walk away with</span>
              <Input value={c.idea.payoff} placeholder="e.g. a 3-step plan they can use Monday" onChange={(payoff) => editCreator((x) => void (x.idea.payoff = payoff), 'payoff')} />
            </label>
          </div>
        </Section>

        <Section
          id="cr-hooks"
          title="Hooks"
          hint="The first 5 seconds. Write a few, star one."
          actions={
            <Menu
              align="end"
              trigger={
                <Button size="sm" variant="ghost" icon={Lightbulb}>
                  Hook formulas
                </Button>
              }
              items={HOOK_PROMPTS.map((h) => ({ label: h, onClick: () => optOps('hooks').onAdd(h) }))}
            />
          }
        >
          <OptionList items={c.idea.hooks} placeholder="Write a hook and press Enter" {...optOps('hooks')} />
        </Section>

        <Section id="cr-titles" title="Titles" hint="Under 60 characters shows in full on most screens">
          <OptionList items={c.idea.titles} placeholder="Write a title and press Enter" limit={60} {...optOps('titles')} />
        </Section>

        <Section id="cr-thumb" title="Thumbnail idea" hint="One face, one idea, three words or fewer">
          <div className="cr-thumb">
            <div className="cr-thumb-img">
              <ImageDrop value={c.idea.thumbnail.image} aspect={16 / 9} label="Drop a sketch or reference" onChange={(image) => editCreator((x) => void (x.idea.thumbnail.image = image))} />
            </div>
            <div className="col grow" style={{ gap: 8 }}>
              <Textarea autoGrow minRows={2} value={c.idea.thumbnail.concept} placeholder="What’s in the frame? e.g. me pointing at a messy whiteboard, shocked face" onChange={(concept) => editCreator((x) => void (x.idea.thumbnail.concept = concept), 'thumbconcept')} />
              <Input value={c.idea.thumbnail.text} placeholder="Text on the thumbnail (3 words max)" onChange={(text) => editCreator((x) => void (x.idea.thumbnail.text = text), 'thumbtext')} />
              {c.idea.thumbnail.text.trim().split(/\s+/).filter(Boolean).length > 3 && <span className="cr-warn small">That’s more than 3 words. Shorter reads better at phone size.</span>}
            </div>
          </div>
        </Section>
      </div>

      <div className="cr-col">
        <Section
          id="cr-beats"
          title="Outline"
          hint={total ? `about ${fmtSeconds(total)}` : 'The beats you’ll hit. They become the prompter cards and chapters.'}
          actions={
            <Menu
              align="end"
              trigger={
                <Button size="sm" variant="ghost" icon={Wand2}>
                  Start from a shape
                </Button>
              }
              items={OUTLINE_TEMPLATES.map((t) => ({ label: t.label, onClick: () => void applyTemplate(c, t.id) }))}
            />
          }
        >
          <ol className="cr-beats">
            {c.idea.beats.map((b, i) => (
              <li key={b.id} className={`cr-beat ${b.kind ?? 'point'}`}>
                <span className="cr-beat-n">{i + 1}</span>
                <div className="grow col" style={{ gap: 4 }}>
                  <Textarea autoGrow minRows={1} value={b.text} placeholder="What you say or show" onChange={(text) => beatOps.set(b.id, { text })} />
                  <div className="row" style={{ gap: 6 }}>
                    <Select size="sm" value={b.kind ?? 'point'} options={BEAT_KINDS} onChange={(kind) => beatOps.set(b.id, { kind: kind as CreatorBeat['kind'] }, false)} aria-label="Kind" />
                    <span className="cr-secs">
                      <NumberInput size="sm" value={b.seconds} onChange={(seconds) => beatOps.set(b.id, { seconds })} aria-label="Seconds" />
                      <span className="muted small">s</span>
                    </span>
                    <div className="spacer" />
                    <IconButton icon={ArrowUp} size="sm" label="Move up" disabled={i === 0} onClick={() => beatOps.move(b.id, -1)} />
                    <IconButton icon={ArrowDown} size="sm" label="Move down" disabled={i === c.idea.beats.length - 1} onClick={() => beatOps.move(b.id, 1)} />
                    <IconButton icon={X} size="sm" label="Remove" onClick={() => beatOps.remove(b.id)} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <Button size="sm" icon={Plus} onClick={() => beatOps.add(c.idea.beats.length ? {} : { kind: 'hook', seconds: 10 })}>
            Add a beat
          </Button>
        </Section>

        <Section title="Notes" hint="Links, research, anything">
          <Textarea autoGrow minRows={3} value={c.idea.notes} placeholder="Sources, examples, things to mention…" onChange={(notes) => editCreator((x) => void (x.idea.notes = notes), 'ideanotes')} />
        </Section>
      </div>
    </div>
  );
}
