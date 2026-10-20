/* Detail panel for one crew member. */
import { useMemo } from 'react';
import { ArrowRight, Copy, MoreHorizontal, Trash2, X } from 'lucide-react';
import type { CrewMember, ID } from '@/types';
import { listOps, useFormatters, useProject } from '@/store/project';
import { navigate } from '@/store/app';
import { CREW_STATUSES, DEPARTMENTS, POSITIONS_BY_DEPT, RATE_UNITS } from '@/lib/constants';
import { Combo, Field, IconButton, ImageDrop, Input, Menu, NumberInput, Select, Switch, Textarea, TimeInput } from '@/ui';
import { deleteCrewMember, duplicateCrewMember } from './actions';
import { ALL_POSITIONS } from './data';
import { currencySymbol, LinkInput } from './util';

const ops = listOps<CrewMember>((d) => d.crew, 'crew');

export function CrewDetail({ member: m, autoFocusName, onClose, onSelect }: { member: CrewMember; autoFocusName?: boolean; onClose: () => void; onSelect: (id: ID | null) => void }) {
  const currency = useProject((p) => p.settings.currency);
  const gear = useProject((p) => p.gear);
  const fmt = useFormatters();
  const set = (patch: Partial<CrewMember>) => ops.update(m.id, patch);
  const assigned = useMemo(() => (gear ?? []).filter((g) => g.assignedTo === m.id), [gear, m.id]);
  const deptOptions = useMemo(() => {
    const list: string[] = [...DEPARTMENTS];
    if (m.department && !list.includes(m.department)) list.push(m.department);
    return list;
  }, [m.department]);

  return (
    <div className="crew-detail">
      <div className="crew-detail-head">
        <Input
          key={m.id}
          className="crew-detail-name"
          value={m.name}
          placeholder={m.position ? `${m.position} — name TBD` : 'Name'}
          autoFocus={autoFocusName}
          onChange={(name) => set({ name })}
        />
        <Menu
          align="end"
          trigger={<IconButton icon={MoreHorizontal} label="More actions" size="sm" />}
          items={[
            { label: 'Duplicate', icon: Copy, onClick: () => onSelect(duplicateCrewMember(m.id) ?? m.id) },
            { separator: true },
            { label: 'Delete', icon: Trash2, danger: true, onClick: () => deleteCrewMember(m.id).then((ok) => ok && onClose()) },
          ]}
        />
        <IconButton icon={X} label="Close (Esc)" size="sm" onClick={onClose} />
      </div>

      <div className="crew-detail-body">
        <div className="crew-detail-top">
          <div className="crew-detail-photo">
            <ImageDrop value={m.photo} onChange={(photo) => set({ photo })} aspect={1} label="Photo" maxSize={1200} />
          </div>
          <div className="col grow" style={{ gap: 10, minWidth: 0 }}>
            <Field label="Position">
              <Combo value={m.position} suggestions={POSITIONS_BY_DEPT[m.department] ?? ALL_POSITIONS} placeholder="e.g. Gaffer" onChange={(position) => set({ position })} />
            </Field>
            <div className="row" style={{ gap: 8 }}>
              <Field label="Department" style={{ flex: 1 }}>
                <Select value={m.department} options={deptOptions} placeholder={m.department ? undefined : '—'} onChange={(department) => set({ department })} />
              </Field>
              <Field label="Status" style={{ width: 120 }}>
                <Select value={m.status} options={CREW_STATUSES} onChange={(v) => set({ status: v as CrewMember['status'] })} />
              </Field>
            </div>
          </div>
        </div>

        <Section title="Contact">
          <Field label="Phone">
            <LinkInput kind="tel" value={m.phone} placeholder="(555) 010-0000" onChange={(phone) => set({ phone })} />
          </Field>
          <Field label="Email">
            <LinkInput kind="email" value={m.email} placeholder="name@example.com" onChange={(email) => set({ email })} />
          </Field>
          <Field label="Pronouns">
            <Combo value={m.pronouns} suggestions={['she/her', 'he/him', 'they/them']} onChange={(pronouns) => set({ pronouns })} />
          </Field>
          <Field label="Union">
            <Combo value={m.union} suggestions={['IATSE', 'DGA', 'Teamsters', 'IBEW', 'Non-union']} onChange={(union) => set({ union })} />
          </Field>
          <Field label="Address" span="all">
            <Textarea autoGrow minRows={1} value={m.address} placeholder="Street, city" onChange={(address) => set({ address })} />
          </Field>
        </Section>

        <Section title="Deal & call">
          <Field label="Rate" hint={m.rate != null && m.rateUnit ? `${fmt.money(m.rate)} ${RATE_UNITS.find((u) => u.value === m.rateUnit)?.label ?? ''}` : undefined}>
            <div className="row" style={{ gap: 6 }}>
              <NumberInput value={m.rate} decimals={2} prefix={currencySymbol(currency)} onChange={(rate) => set({ rate })} style={{ flex: 1 }} />
              <Select value={m.rateUnit ?? ''} placeholder="—" options={RATE_UNITS} onChange={(v) => set({ rateUnit: (v || undefined) as CrewMember['rateUnit'] })} style={{ width: 90 }} />
            </div>
          </Field>
          <Field label="Default call" hint="Pre-fills their call time on call sheets">
            <TimeInput value={m.defaultCall} onChange={(defaultCall) => set({ defaultCall })} />
          </Field>
          <div className="span-all" style={{ paddingTop: 2 }}>
            <Switch checked={m.dealMemo} onChange={(dealMemo) => set({ dealMemo })} label="Deal memo signed" />
          </div>
          <Field label="Kit / gear they bring" span="all">
            <Textarea autoGrow minRows={2} value={m.kit} placeholder="Kit rental, personal gear, vehicle…" onChange={(kit) => set({ kit })} />
          </Field>
        </Section>

        {assigned.length > 0 && (
          <Section title={`Assigned gear (${assigned.length})`}>
            <div className="span-all crew-gearlist">
              {assigned.map((g) => (
                <div key={g.id} className="row">
                  <span className="grow ellipsis">{g.name}</span>
                  <span className="muted tiny">× {g.qty}</span>
                </div>
              ))}
              <button type="button" className="crew-linkbtn" onClick={() => navigate('gear')}>
                Open Gear & Equipment <ArrowRight size={13} />
              </button>
            </div>
          </Section>
        )}

        <Section title="Health & safety">
          <Field label="Dietary">
            <Input value={m.dietary} placeholder="Vegetarian, halal…" onChange={(dietary) => set({ dietary })} />
          </Field>
          <Field label="Allergies">
            <Input value={m.allergies} placeholder="None known" onChange={(allergies) => set({ allergies })} />
          </Field>
          <Field label="Emergency contact">
            <Input value={m.emergencyName} placeholder="Name (relationship)" onChange={(emergencyName) => set({ emergencyName })} />
          </Field>
          <Field label="Emergency phone">
            <LinkInput kind="tel" value={m.emergencyPhone} onChange={(emergencyPhone) => set({ emergencyPhone })} />
          </Field>
        </Section>

        <Section title="Notes">
          <Field span="all">
            <Textarea autoGrow minRows={3} value={m.notes} placeholder="Availability, preferences, anything else" onChange={(notes) => set({ notes })} />
          </Field>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="crew-detail-section">
      <div className="section-title">{title}</div>
      <div className="crew-detail-grid">{children}</div>
    </section>
  );
}
