/* Accounts & outreach: small shared pieces (stage pill and picker, team member
   picker and dot, who "I" am when logging a touch). */
import type { ID } from '@/types';
import type { LeadStage, Outreach, OutreachMember } from '@/spaces/types';
import { LEAD_STAGES, emptyOutreach, stageInfo } from '@/spaces/outreach';
import { useSpace } from '@/store/space';
import { cloudBoot } from '@/backend/cloud';
import { promptDialog, Select } from '@/ui';
import { addMember, getOutreach } from './ops';

const EMPTY = emptyOutreach();
export const useOutreach = (): Outreach => useSpace((s) => s.outreach) ?? EMPTY;

export function StagePill({ stage }: { stage: LeadStage }) {
  const s = stageInfo(stage);
  return (
    <span className="or-stage" style={{ ['--st' as string]: s.color }} title={s.hint}>
      {s.label}
    </span>
  );
}

export function StageSelect({ value, onChange, size = 'sm' }: { value: LeadStage; onChange: (v: LeadStage) => void; size?: 'sm' | 'md' }) {
  return (
    <span className="or-stage-select" style={{ ['--st' as string]: stageInfo(value).color }}>
      <Select size={size} value={value} options={LEAD_STAGES.map((s) => ({ value: s.value, label: s.label }))} onChange={(v) => onChange(v as LeadStage)} aria-label="Stage" />
    </span>
  );
}

export function MemberDot({ m, size = 20 }: { m: OutreachMember | undefined; size?: number }) {
  if (!m) return <span className="or-dot none" style={{ width: size, height: size }} title="Unassigned" />;
  const initials = m.name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span className="or-dot" style={{ width: size, height: size, background: m.color ?? 'var(--accent)', fontSize: Math.round(size * 0.42) }} title={m.name}>
      {initials}
    </span>
  );
}

const NEW = '__new__';

/** Team member picker; "Add someone…" asks for a name and adds them to the team. */
export function MemberSelect({ value, onChange, team, placeholder = 'Unassigned', size = 'sm' }: { value: ID | undefined; onChange: (v: ID | undefined) => void; team: OutreachMember[]; placeholder?: string; size?: 'sm' | 'md' }) {
  return (
    <Select
      size={size}
      value={value ?? ''}
      placeholder={placeholder}
      options={[...team.map((m) => ({ value: m.id, label: m.name })), { value: NEW, label: 'Add someone…' }]}
      onChange={(v) => {
        if (v === NEW) {
          void promptDialog({ title: 'Add a team member', placeholder: 'Name', confirmLabel: 'Add' }).then((name) => {
            const id = name ? addMember(name) : undefined;
            if (id) onChange(id);
          });
          return;
        }
        onChange(v || undefined);
      }}
      aria-label="Owner"
    />
  );
}

/** The signed-in person on the team (hosted version), added the first time they log a touch. */
export function meId(create = false): ID | undefined {
  const name = cloudBoot?.account?.name?.trim();
  if (!name) return getOutreach().team[0]?.id;
  const hit = getOutreach().team.find((m) => m.name.toLowerCase() === name.toLowerCase());
  return hit?.id ?? (create ? addMember(name) : undefined);
}

export const shortDate = (iso: string | undefined) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');
