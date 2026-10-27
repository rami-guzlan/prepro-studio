/* New Business Management space: name, kind of business, owner details, and optional
   links to Marketing Spaces and Productions. */
import { useEffect, useState } from 'react';
import type { ProjectSummary } from '@/types';
import type { SpaceSummary } from '@/spaces/types';
import type { BusinessType } from '@/spaces/business/types';
import { BUSINESS_TYPES } from '@/spaces/business/constants';
import { backend } from '@/backend';
import { Button, ColorPicker, Field, Input, Modal, MultiSelect, Textarea } from '@/ui';
import { createSpaceAndOpen } from './spaceActions';

const TYPE_COLORS: Record<BusinessType, string> = {
  side_hustle: '#0a66c2',
  freelance: '#15aabf',
  company: '#364fc7',
  creator: '#e8590c',
  partner: '#2fb36d',
  other: '#868e96',
};

export function NewBusinessDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<BusinessType>('side_hustle');
  const [description, setDescription] = useState('');
  const [legalName, setLegalName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [role, setRole] = useState('');
  const [color, setColor] = useState<string | undefined>();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [spaces, setSpaces] = useState<SpaceSummary[]>([]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [spaceIds, setSpaceIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    backend.listProjects().then((l) => setProjects(l.filter((p) => !p.demo)), () => setProjects([]));
    backend.listSpaces().then((l) => setSpaces(l.filter((s) => (s.kind ?? 'marketing') === 'marketing' && !s.demo)), () => setSpaces([]));
  }, [open]);

  const reset = () => {
    setTitle('');
    setDescription('');
    setLegalName('');
    setOwnerName('');
    setRole('');
    setProjectIds([]);
    setSpaceIds([]);
    setColor(undefined);
  };

  const create = async () => {
    setBusy(true);
    const t = BUSINESS_TYPES.find((x) => x.value === type)!;
    const s = await createSpaceAndOpen({
      title: title.trim() || 'Untitled business',
      kind: 'business',
      type: 'business',
      description: description.trim(),
      color: color ?? TYPE_COLORS[type],
      emoji: t.emoji,
      projectIds,
      spaceIds,
      kindData: { profile: { type, legalName: legalName.trim() || undefined, ownerName: ownerName.trim() || undefined, role: type === 'partner' ? role.trim() || undefined : undefined } },
    });
    setBusy(false);
    if (s) {
      reset();
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="New business"
      footer={
        <>
          <div className="spacer" />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy || !title.trim()} onClick={() => void create()}>
            {busy ? 'Creating…' : 'Create business'}
          </Button>
        </>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        <div className="new-kind-grid">
          {BUSINESS_TYPES.map((t) => (
            <button key={t.value} type="button" className={`new-kind-card ${type === t.value ? 'on' : ''}`} onClick={() => setType(t.value)} style={{ ['--kc' as string]: TYPE_COLORS[t.value] }}>
              <span className="emoji">{t.emoji}</span>
              <b>{t.label}</b>
              <span className="muted small">{t.description}</span>
            </button>
          ))}
        </div>
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <Field label="Name">
            <Input autoFocus value={title} onChange={setTitle} placeholder="e.g. Riverside Studio, Trailer edits, Consulting" />
          </Field>
          <Field label="Colour">
            <ColorPicker value={color ?? TYPE_COLORS[type]} onChange={(c) => setColor(c ?? undefined)} />
          </Field>
          <Field label="Legal / registered name" hint="Used on invoices and documents">
            <Input value={legalName} onChange={setLegalName} placeholder="Optional, e.g. Riverside Media LLC" />
          </Field>
          <Field label="Your name (signer)">
            <Input value={ownerName} onChange={setOwnerName} placeholder="Optional" />
          </Field>
          {type === 'partner' && (
            <Field label="Your role" span="all">
              <Input value={role} onChange={setRole} placeholder="e.g. Co-founder, 20% partner, Head of marketing" />
            </Field>
          )}
          <Field label="What it does" span="all">
            <Textarea value={description} onChange={setDescription} rows={2} placeholder="Offer, clients, how it makes money." />
          </Field>
          <Field label="Linked Marketing Spaces" hint="Optional: the marketing this business runs">
            <MultiSelect value={spaceIds} options={spaces.map((s) => ({ value: s.id, label: s.title }))} placeholder={spaces.length ? 'Add space…' : 'No marketing spaces yet'} onChange={setSpaceIds} />
          </Field>
          <Field label="Linked Productions" hint="Optional: videos and films it makes">
            <MultiSelect value={projectIds} options={projects.map((p) => ({ value: p.id, label: p.title }))} placeholder={projects.length ? 'Add production…' : 'No productions yet'} onChange={setProjectIds} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
