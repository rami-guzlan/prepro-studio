/* Strategy › Audience: persona cards. */
import { useMemo } from 'react';
import { Copy, MoreHorizontal, Plus, Trash2, Users } from 'lucide-react';
import type { Persona } from '@/spaces/types';
import { useSpace } from '@/store/space';
import { uid } from '@/lib/id';
import { Button, EmptyState, IconButton, ImageDrop, Menu, Textarea } from '@/ui';
import { addPersona, deletePersona, focusSelect, personaOps, plural } from './shared';

type PersonaField = 'demographics' | 'pains' | 'desires' | 'whereTheyAre' | 'objections' | 'notes';

const FIELDS: { key: PersonaField; label: string; placeholder: string }[] = [
  { key: 'demographics', label: 'Demographics', placeholder: 'Age, location, job, life stage, budget…' },
  { key: 'pains', label: 'Pains & frustrations', placeholder: 'What keeps them stuck? What do they complain about?' },
  { key: 'desires', label: 'Desires & goals', placeholder: 'What do they want to make, become, feel or achieve?' },
  { key: 'whereTheyAre', label: 'Where they are online', placeholder: 'Platforms, communities, newsletters, creators they already follow…' },
  { key: 'objections', label: 'Objections', placeholder: 'Why might they scroll past, not subscribe or not buy a ticket?' },
  { key: 'notes', label: 'Notes', placeholder: 'Real quotes, example people, content they love…' },
];

export function AudienceTab({ focusId, onAdded }: { focusId: string | null; onAdded: (id: string) => void }) {
  const personas = useSpace((s) => s.personas);
  const content = useSpace((s) => s.content);
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of content) if (c.personaId) m.set(c.personaId, (m.get(c.personaId) ?? 0) + 1);
    return m;
  }, [content]);

  if (!personas?.length) {
    return (
      <div className="sp-strategy-page">
        <EmptyState
          icon={Users}
          title="Who are you talking to?"
          description="Describe the 1–3 people you make content for: what they struggle with, what they want and where they hang out online. Every idea gets sharper when it’s for someone."
          action={
            <Button variant="primary" icon={Plus} onClick={() => onAdded(addPersona())}>
              Add a persona
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="sp-strategy-page">
      <div className="sp-strategy-personas">
        {personas.map((p) => (
          <PersonaCard key={p.id} p={p} used={usage.get(p.id) ?? 0} autoFocus={p.id === focusId} onDuplicated={onAdded} />
        ))}
        <button type="button" className="sp-strategy-add-card" onClick={() => onAdded(addPersona())}>
          <Plus size={18} />
          Add persona
        </button>
      </div>
    </div>
  );
}

function PersonaCard({ p, used, autoFocus, onDuplicated }: { p: Persona; used: number; autoFocus: boolean; onDuplicated: (id: string) => void }) {
  const set = (patch: Partial<Persona>, coalesce = true) => personaOps.update(p.id, patch, coalesce);
  return (
    <div className="sp-strategy-persona card">
      <div className="sp-strategy-persona-head">
        <ImageDrop value={p.photo} onChange={(name) => set({ photo: name }, false)} aspect={1} width={64} round label="Photo" />
        <div className="sp-strategy-persona-names">
          <input
            ref={autoFocus ? focusSelect : undefined}
            className="sp-strategy-title-input"
            value={p.name}
            placeholder="Name, e.g. “Indie Ines”"
            onChange={(e) => set({ name: e.target.value })}
            aria-label="Persona name"
          />
          <input className="sp-strategy-sub-input" value={p.summary ?? ''} placeholder="One line, e.g. Indie filmmakers, 20–35, first feature" onChange={(e) => set({ summary: e.target.value || undefined })} aria-label="Summary" />
          {used > 0 && <span className="muted tiny">{plural(used, 'content piece')} made for them</span>}
        </div>
        <Menu
          align="end"
          trigger={<IconButton icon={MoreHorizontal} label="Persona actions" size="sm" />}
          items={[
            {
              label: 'Duplicate',
              icon: Copy,
              onClick: () => {
                const copy = personaOps.duplicate(p.id, () => uid('per'));
                if (copy) onDuplicated(copy.id);
              },
            },
            { separator: true },
            { label: 'Delete persona', icon: Trash2, danger: true, onClick: () => deletePersona(p) },
          ]}
        />
      </div>
      <div className="sp-strategy-persona-fields">
        {FIELDS.map((f) => (
          <label key={f.key} className="sp-strategy-pfield">
            <span>{f.label}</span>
            <Textarea bare autoGrow minRows={1} value={p[f.key]} placeholder={f.placeholder} onChange={(v) => set({ [f.key]: v || undefined } as Partial<Persona>)} />
          </label>
        ))}
      </div>
    </div>
  );
}
