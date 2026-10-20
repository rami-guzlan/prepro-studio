/* Detail panel for one cast member (headshot, roles, contact, agent, deal, health, notes). */
import { useMemo } from 'react';
import { Copy, MoreHorizontal, Printer, Ruler, Trash2, X } from 'lucide-react';
import type { CastMember, ID } from '@/types';
import { listOps, useFormatters, useProject } from '@/store/project';
import { openPrint } from '@/store/app';
import { CAST_STATUSES, RATE_UNITS } from '@/lib/constants';
import { Button, Combo, Field, IconButton, ImageDrop, Input, Menu, MultiSelect, NumberInput, Select, Switch, Textarea } from '@/ui';
import { deleteCastMember, duplicateCastMember, setRoles } from './actions';
import { currencySymbol, hasMeasurements, LinkInput, MEASUREMENTS, PRONOUN_SUGGESTIONS, sortByBoard, UNION_SUGGESTIONS } from './util';

const ops = listOps<CastMember>((d) => d.cast, 'cast');

export function CastDetail({
  member: m,
  autoFocusName,
  onClose,
  onSelect,
  onOpenSizes,
}: {
  member: CastMember;
  autoFocusName?: boolean;
  onClose: () => void;
  onSelect: (id: ID | null) => void;
  onOpenSizes: () => void;
}) {
  const characters = useProject((p) => p.characters);
  const cast = useProject((p) => p.cast);
  const currency = useProject((p) => p.settings.currency);
  const fmt = useFormatters();
  const set = (patch: Partial<CastMember>) => ops.update(m.id, patch);

  const roleIds = useMemo(() => sortByBoard(characters.filter((c) => c.castId === m.id)).map((c) => c.id), [characters, m.id]);
  const charOptions = useMemo(
    () =>
      sortByBoard(characters).map((c) => {
        const other = c.castId && c.castId !== m.id ? cast.find((x) => x.id === c.castId) : undefined;
        return {
          value: c.id,
          label: `${c.number != null ? `${c.number} · ` : ''}${c.name}${other ? ` (played by ${other.name || 'another actor'})` : ''}`,
          color: c.color,
        };
      }),
    [characters, cast, m.id],
  );

  const sizesFilled = MEASUREMENTS.filter((f) => m.measurements?.[f.key]?.trim());

  return (
    <div className="cast-detail">
      <div className="cast-detail-head">
        <Input
          key={m.id}
          className="cast-detail-name"
          value={m.name}
          placeholder="Actor name"
          autoFocus={autoFocusName}
          onFocus={(e) => autoFocusName && e.currentTarget.select()}
          onChange={(name) => set({ name })}
        />
        <Menu
          align="end"
          trigger={<IconButton icon={MoreHorizontal} label="More actions" size="sm" />}
          items={[
            { label: 'Print cast sheet', icon: Printer, onClick: () => openPrint('cast-sheets', { only: m.id }) },
            { label: 'Duplicate', icon: Copy, onClick: () => onSelect(duplicateCastMember(m.id) ?? m.id) },
            { separator: true },
            { label: 'Delete', icon: Trash2, danger: true, onClick: () => deleteCastMember(m.id).then((ok) => ok && onClose()) },
          ]}
        />
        <IconButton icon={X} label="Close (Esc)" size="sm" onClick={onClose} />
      </div>

      <div className="cast-detail-body">
        <div className="cast-detail-top">
          <div className="cast-detail-photo">
            <ImageDrop value={m.photo} onChange={(photo) => set({ photo })} aspect={3 / 4} label="Headshot" maxSize={1600} />
          </div>
          <div className="col grow" style={{ gap: 10, minWidth: 0 }}>
            <Field label="Status">
              <Select value={m.status} options={CAST_STATUSES} onChange={(v) => set({ status: v as CastMember['status'] })} />
            </Field>
            <Field label="Pronouns">
              <Combo value={m.pronouns} suggestions={PRONOUN_SUGGESTIONS} placeholder="she/her" onChange={(pronouns) => set({ pronouns })} />
            </Field>
            <Field label="Role(s)">
              <MultiSelect value={roleIds} options={charOptions} placeholder={characters.length ? 'Add role…' : 'No characters yet'} onChange={(ids) => setRoles(m.id, ids)} />
            </Field>
          </div>
        </div>

        <Section title="Contact">
          <Field label="Phone">
            <LinkInput kind="tel" value={m.phone} placeholder="(555) 010-0000" onChange={(phone) => set({ phone })} />
          </Field>
          <Field label="Email">
            <LinkInput kind="email" value={m.email} placeholder="name@example.com" onChange={(email) => set({ email })} />
          </Field>
          <Field label="Address" span="all">
            <Textarea autoGrow minRows={1} value={m.address} placeholder="Street, city" onChange={(address) => set({ address })} />
          </Field>
        </Section>

        <Section title="Representation">
          <Field label="Agent">
            <Input value={m.agent} onChange={(agent) => set({ agent })} />
          </Field>
          <Field label="Agency">
            <Input value={m.agency} onChange={(agency) => set({ agency })} />
          </Field>
          <Field label="Agent phone">
            <LinkInput kind="tel" value={m.agentPhone} onChange={(agentPhone) => set({ agentPhone })} />
          </Field>
          <Field label="Agent email">
            <LinkInput kind="email" value={m.agentEmail} onChange={(agentEmail) => set({ agentEmail })} />
          </Field>
        </Section>

        <Section title="Deal & paperwork">
          <Field label="Union">
            <Combo value={m.union} suggestions={UNION_SUGGESTIONS} onChange={(union) => set({ union })} />
          </Field>
          <Field label="Rate" hint={m.rate != null && m.rateUnit ? `${fmt.money(m.rate)} ${RATE_UNITS.find((u) => u.value === m.rateUnit)?.label ?? ''}` : undefined}>
            <div className="row" style={{ gap: 6 }}>
              <NumberInput value={m.rate} decimals={2} prefix={currencySymbol(currency)} onChange={(rate) => set({ rate })} style={{ flex: 1 }} />
              <Select value={m.rateUnit ?? ''} placeholder="—" options={RATE_UNITS} onChange={(v) => set({ rateUnit: (v || undefined) as CastMember['rateUnit'] })} style={{ width: 90 }} />
            </div>
          </Field>
          <div className="row span-all" style={{ gap: 18, paddingTop: 2 }}>
            <Switch checked={m.releaseSigned} onChange={(releaseSigned) => set({ releaseSigned })} label="Release signed" />
            <Switch checked={m.contractSigned} onChange={(contractSigned) => set({ contractSigned })} label="Contract signed" />
          </div>
        </Section>

        <Section title="Availability">
          <Field span="all">
            <Textarea autoGrow minRows={2} value={m.availability} placeholder="Dates available, conflicts, hold dates…" onChange={(availability) => set({ availability })} />
          </Field>
        </Section>

        <Section title="Health & safety">
          <Field label="Dietary">
            <Input value={m.dietary} placeholder="Vegetarian, halal…" onChange={(dietary) => set({ dietary })} />
          </Field>
          <Field label="Allergies">
            <Input value={m.allergies} placeholder="None known" onChange={(allergies) => set({ allergies })} />
          </Field>
          <Field label="Medical notes" span="all">
            <Textarea autoGrow minRows={1} value={m.medical} placeholder="Conditions, medication the set medic should know about" onChange={(medical) => set({ medical })} />
          </Field>
          <Field label="Emergency contact">
            <Input value={m.emergencyName} placeholder="Name (relationship)" onChange={(emergencyName) => set({ emergencyName })} />
          </Field>
          <Field label="Emergency phone">
            <LinkInput kind="tel" value={m.emergencyPhone} onChange={(emergencyPhone) => set({ emergencyPhone })} />
          </Field>
        </Section>

        <Section
          title="Sizes"
          right={
            <Button size="sm" variant="ghost" icon={Ruler} onClick={onOpenSizes}>
              {hasMeasurements(m.measurements) ? 'Edit sizes' : 'Add sizes'}
            </Button>
          }
        >
          {sizesFilled.length ? (
            <div className="cast-sizes-summary span-all">
              {sizesFilled.map((f) => (
                <div key={f.key}>
                  <span>{f.label}</span>
                  <strong>{m.measurements?.[f.key]}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted small span-all">No wardrobe measurements yet.</div>
          )}
        </Section>

        <Section title="Notes">
          <Field span="all">
            <Textarea autoGrow minRows={3} value={m.notes} placeholder="Anything else production should know" onChange={(notes) => set({ notes })} />
          </Field>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="cast-detail-section">
      <div className="cast-detail-section-head">
        <span className="section-title" style={{ margin: 0 }}>
          {title}
        </span>
        <div className="spacer" />
        {right}
      </div>
      <div className="cast-detail-grid">{children}</div>
    </section>
  );
}
