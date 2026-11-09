/* Creator workspace → Plan: run-and-gun planning for a solo shoot. A shot list
   (A-roll straight from the outline, one-tap B-roll ideas), the gear, when and
   where. */
import { useState } from 'react';
import { ListPlus, Plus, X } from 'lucide-react';
import type { CreatorData, CreatorShot, CreatorShotKind } from '@/types';
import { uid } from '@/lib/id';
import { Button, DateInput, IconButton, Input, Menu, Select, Textarea } from '@/ui';
import { SHOT_KINDS, SHOT_PRESETS } from './model';
import { editCreator } from './ops';
import { CheckList, Section } from './shared';

export const shotOps = {
  add: (text: string, kind: CreatorShotKind) => editCreator((c) => void c.plan.shots.push({ id: uid('cshot'), text, kind })),
  set: (id: string, patch: Partial<CreatorShot>, coalesce = false) =>
    editCreator((c) => {
      const s = c.plan.shots.find((x) => x.id === id);
      if (s) Object.assign(s, patch);
    }, coalesce ? `shot:${id}` : undefined),
  toggle: (id: string) =>
    editCreator((c) => {
      const s = c.plan.shots.find((x) => x.id === id);
      if (s) s.done = !s.done;
    }),
  take: (id: string) =>
    editCreator((c) => {
      const s = c.plan.shots.find((x) => x.id === id);
      if (s) s.takes = (s.takes ?? 0) + 1;
    }),
  remove: (id: string) => editCreator((c) => void (c.plan.shots = c.plan.shots.filter((x) => x.id !== id))),
};

/** A-roll shots from the outline beats that don't have one yet. */
function shotsFromBeats(c: CreatorData) {
  const have = new Set(c.plan.shots.map((s) => s.text.trim().toLowerCase()));
  const add = c.idea.beats.filter((b) => b.text.trim() && !have.has(b.text.trim().toLowerCase()));
  if (!add.length) return;
  editCreator((x) => void x.plan.shots.push(...add.map((b) => ({ id: uid('cshot'), text: b.text.trim(), kind: 'a_roll' as const }))));
}

export function PlanTab({ c }: { c: CreatorData }) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState<CreatorShotKind>('b_roll');
  const add = () => {
    if (!text.trim()) return;
    shotOps.add(text.trim(), kind);
    setText('');
  };
  const byKind = (k: CreatorShotKind) => c.plan.shots.filter((s) => s.kind === k);
  return (
    <div className="cr-cols">
      <div className="cr-col">
        <Section
          id="cr-shots"
          title="Shot list"
          hint="Keep it short. You can always grab more."
          actions={
            <>
              <Button size="sm" variant="ghost" icon={ListPlus} disabled={!c.idea.beats.length} title="One talking shot per beat of the outline" onClick={() => shotsFromBeats(c)}>
                A-roll from outline
              </Button>
              <Menu
                align="end"
                trigger={
                  <Button size="sm" variant="ghost" icon={Plus}>
                    B-roll ideas
                  </Button>
                }
                items={SHOT_PRESETS.map((p) => ({ label: p.text, onClick: () => shotOps.add(p.text, p.kind) }))}
              />
            </>
          }
        >
          {SHOT_KINDS.map((k) =>
            byKind(k.value).length ? (
              <div key={k.value} className="cr-shotgroup">
                <div className="cr-shotgroup-label">{k.label}</div>
                {byKind(k.value).map((s) => (
                  <div key={s.id} className={`cr-shotrow ${s.done ? 'done' : ''}`}>
                    <button type="button" className="cr-tick" aria-pressed={!!s.done} aria-label="Got it" onClick={() => shotOps.toggle(s.id)} />
                    <Input bare size="sm" value={s.text} onChange={(t) => shotOps.set(s.id, { text: t }, true)} />
                    <Select size="sm" value={s.kind} options={SHOT_KINDS} onChange={(v) => shotOps.set(s.id, { kind: v as CreatorShotKind })} aria-label="Kind" />
                    <IconButton icon={X} size="sm" label="Remove" onClick={() => shotOps.remove(s.id)} />
                  </div>
                ))}
              </div>
            ) : null,
          )}
          <div className="cr-shotadd">
            <Select size="sm" value={kind} options={SHOT_KINDS} onChange={(v) => setKind(v as CreatorShotKind)} aria-label="Kind" />
            <Input value={text} placeholder="Add a shot and press Enter" onChange={setText} onKeyDown={(e) => e.key === 'Enter' && add()} />
            <Button size="sm" disabled={!text.trim()} onClick={add}>
              Add
            </Button>
          </div>
        </Section>
      </div>
      <div className="cr-col">
        <Section id="cr-when" title="When and where">
          <div className="cr-two">
            <label>
              <span className="muted small">Shoot day</span>
              <DateInput value={c.plan.shootDate} onChange={(shootDate) => editCreator((x) => void (x.plan.shootDate = shootDate))} />
            </label>
            <label>
              <span className="muted small">Where</span>
              <Input value={c.plan.location} placeholder="e.g. home office, window light" onChange={(location) => editCreator((x) => void (x.plan.location = location), 'location')} />
            </label>
          </div>
          <label>
            <span className="muted small">What to wear / bring on camera</span>
            <Input value={c.plan.wardrobe} placeholder="e.g. navy crewneck, the product, a mug" onChange={(wardrobe) => editCreator((x) => void (x.plan.wardrobe = wardrobe), 'wardrobe')} />
          </label>
        </Section>
        <Section id="cr-gear" title="Gear" hint="Tick as you pack">
          <CheckList items={c.plan.gear} list="gear" addLabel="Add gear" />
        </Section>
        <Section title="Setup notes" hint="Settings that worked last time">
          <Textarea autoGrow minRows={3} value={c.plan.notes} placeholder="e.g. 4K 24p, shutter 1/50, ISO 400, key light 45° left, mic 20 cm off-axis" onChange={(notes) => editCreator((x) => void (x.plan.notes = notes), 'plannotes')} />
        </Section>
      </div>
    </div>
  );
}
