/* Deal detail: every field, the activity log, notes, and won / lost actions. */
import { useState } from 'react';
import { CalendarClock, CheckCircle2, FolderKanban, Mail, MessageSquare, Phone, Plus, Trash2, Undo2, UserPlus, Users, XCircle, FileText, StickyNote, Repeat } from 'lucide-react';
import { navigateSpace } from '@/store/app';
import { Button, Combo, DateInput, Field, IconButton, Input, Modal, NumberInput, Select, Textarea, confirmDialog, toast } from '@/ui';
import { DEAL_ACTIVITY_KINDS, DEAL_SOURCES, DEAL_STAGES } from '../../constants';
import { dealProbability, stageInfo, weightedValue } from '../../derive-work';
import { addItem, makeClient, removeItems, updateItem } from '../../ops';
import { OptionPill, clientOptions, useBiz, useFmt, useToday } from '../../ui';
import type { Deal, DealActivityKind, DealStage } from '../../types';
import { addActivity, loseDeal, moveDeal, removeActivity, winDealWithToast } from './deal-ops';
import { LinkSelect, useLinkOptions } from './sales-shared';

const KIND_ICON: Record<DealActivityKind, typeof Phone> = { call: Phone, email: Mail, meeting: Users, proposal: FileText, follow_up: Repeat, note: StickyNote };

export function DealDialog({ deal: d, onClose }: { deal: Deal; onClose: () => void }) {
  const b = useBiz();
  const fmt = useFmt();
  const today = useToday();
  const links = useLinkOptions();
  const up = (patch: Partial<Deal>, coalesce = true) => updateItem('deals', d.id, patch, coalesce);
  const client = d.clientId ? b.clients.find((c) => c.id === d.clientId) : undefined;
  const open = stageInfo(d.stage).open;
  const offers = b.strategy.offers.filter((o) => o.active || o.id === d.offerId);
  const project = d.bizProjectId ? b.projects.find((p) => p.id === d.bizProjectId) : undefined;

  const [kind, setKind] = useState<DealActivityKind>('call');
  const [actDate, setActDate] = useState<string>(today);
  const [actText, setActText] = useState('');
  const logActivity = () => {
    const text = actText.trim();
    if (!text) return;
    addActivity(d.id, { kind, date: actDate || today, text });
    setActText('');
  };

  const close = () => {
    // drop a brand-new deal that was never filled in
    if (!d.title.trim() && !d.clientId && !d.contactName && !d.company && d.value == null && !d.activities.length && !d.notes) removeItems('deals', [d.id]);
    onClose();
  };

  const remove = async () => {
    if (await confirmDialog({ title: `Delete “${d.title || 'deal'}”?`, message: 'Its activity log is deleted too. A project created from it stays. You can undo with Ctrl+Z.', confirmLabel: 'Delete deal', danger: true })) {
      removeItems('deals', [d.id]);
      onClose();
    }
  };

  const saveAsClient = () => {
    const name = d.contactName || d.company;
    if (!name) {
      toast('Fill in a contact name or company first', 'info');
      return;
    }
    const c = makeClient({ name, company: d.contactName ? d.company : undefined, email: d.email, phone: d.phone });
    addItem('clients', c);
    up({ clientId: c.id }, false);
    toast(`Added ${name} to Clients`);
  };

  const setStage = (s: DealStage) => void moveDeal(d.id, s);
  const pickOffer = (id: string | undefined) => {
    const o = offers.find((x) => x.id === id);
    up({ offerId: id, ...(o?.price != null && d.value == null ? { value: o.price } : {}) }, false);
  };

  const acts = [...d.activities].sort((a, z) => z.date.localeCompare(a.date));

  return (
    <Modal
      open
      size="lg"
      onClose={close}
      title={
        <span className="row" style={{ gap: 8 }}>
          {d.title || 'New deal'}
          <OptionPill value={d.stage} options={DEAL_STAGES} />
        </span>
      }
      footer={
        <>
          <Button variant="ghost" icon={Trash2} onClick={() => void remove()}>
            Delete
          </Button>
          <div className="spacer" />
          {open ? (
            <>
              <Button icon={XCircle} onClick={() => void loseDeal(d.id)}>
                Mark lost
              </Button>
              <Button variant="primary" icon={CheckCircle2} onClick={() => winDealWithToast(d.id)}>
                Mark won
              </Button>
            </>
          ) : (
            <>
              <Button icon={Undo2} onClick={() => setStage('negotiation')}>
                Reopen
              </Button>
              <Button variant="primary" onClick={close}>
                Done
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="sl-deal">
        {d.stage === 'won' && (
          <div className="biz-note sl-won-note">
            <CheckCircle2 size={15} /> Won {d.closedDate ? fmt.date(d.closedDate) : ''}
            {project ? (
              <Button size="sm" icon={FolderKanban} onClick={() => navigateSpace('projects', { projectId: project.id })}>
                Open project “{project.name || 'Untitled'}”
              </Button>
            ) : (
              <Button size="sm" icon={FolderKanban} onClick={() => winDealWithToast(d.id)}>
                Create the project
              </Button>
            )}
          </div>
        )}
        {d.stage === 'lost' && (
          <div className="biz-note warn">
            <XCircle size={15} /> Lost {d.closedDate ? fmt.date(d.closedDate) : ''}
          </div>
        )}
        <div className="biz-form">
          <Field label="Deal" span="all">
            <Input autoFocus={!d.title} value={d.title} placeholder="e.g. Brightline — spring product launch film" onChange={(v) => up({ title: v })} />
          </Field>
          <Field label="Stage">
            <Select value={d.stage} options={DEAL_STAGES.map((s) => ({ value: s.value, label: s.label }))} onChange={(v) => setStage(v as DealStage)} />
          </Field>
          <Field label="Client" hint={client ? undefined : 'Or fill in the prospect below'}>
            <div className="row" style={{ gap: 4 }}>
              <Select value={d.clientId ?? ''} placeholder="New prospect (not a client yet)" options={clientOptions(b, d.clientId)} onChange={(v) => up({ clientId: v || undefined }, false)} />
              {!client && <IconButton icon={UserPlus} label="Save the contact as a client" onClick={saveAsClient} />}
            </div>
          </Field>
          {!client && (
            <>
              <Field label="Contact name">
                <Input value={d.contactName} onChange={(v) => up({ contactName: v || undefined })} />
              </Field>
              <Field label="Company">
                <Input value={d.company} onChange={(v) => up({ company: v || undefined })} />
              </Field>
              <Field label="Email">
                <div className="row" style={{ gap: 4 }}>
                  <Input type="email" value={d.email} onChange={(v) => up({ email: v || undefined })} />
                  {d.email && (
                    <a className="btn icon" href={`mailto:${d.email}`} aria-label="Email" title="Email">
                      <Mail size={15} />
                    </a>
                  )}
                </div>
              </Field>
              <Field label="Phone">
                <div className="row" style={{ gap: 4 }}>
                  <Input type="tel" value={d.phone} onChange={(v) => up({ phone: v || undefined })} />
                  {d.phone && (
                    <a className="btn icon" href={`tel:${d.phone}`} aria-label="Call" title="Call">
                      <Phone size={15} />
                    </a>
                  )}
                </div>
              </Field>
            </>
          )}
          <Field label="Source">
            <Combo suggestions={DEAL_SOURCES} value={d.source} placeholder="Referral, LinkedIn, website…" onChange={(v) => up({ source: v || undefined })} />
          </Field>
          <Field label="Offer / service" hint={offers.length ? undefined : 'Add offers in Strategy to pick them here'}>
            <LinkSelect value={d.offerId} options={offers.map((o) => ({ value: o.id, label: o.price != null ? `${o.name} · ${fmt.money(o.price, { cents: false })}${o.priceNote ? ` ${o.priceNote}` : ''}` : o.name }))} onChange={pickOffer} />
          </Field>
          <Field label="Value" hint={d.value ? `Weighted ${fmt.money(weightedValue(d), { cents: false })}` : 'Expected deal value'}>
            <NumberInput decimals={2} value={d.value} onChange={(v) => up({ value: v ?? undefined })} />
          </Field>
          <Field label="Win chance %" hint={!open ? undefined : d.probability == null ? `Stage default ${stageInfo(d.stage).probability}%` : 'Your estimate (clear for the stage default)'}>
            <NumberInput value={open ? d.probability : dealProbability(d)} disabled={!open} placeholder={String(stageInfo(d.stage).probability)} onChange={(v) => up({ probability: v == null ? undefined : Math.max(0, Math.min(100, Math.round(v))) })} />
          </Field>
          <Field label="Expected close">
            <DateInput value={d.expectedClose} onChange={(v) => up({ expectedClose: v }, false)} />
          </Field>
          <Field label="Created">
            <DateInput value={d.createdAt} onChange={(v) => up({ createdAt: v || today }, false)} />
          </Field>
          <Field label="Next step" span={2}>
            <Input value={d.nextStep} placeholder="e.g. Send proposal, follow up on budget" onChange={(v) => up({ nextStep: v || undefined })} />
          </Field>
          <Field label="Next step date" hint={d.nextStepDate && open && d.nextStepDate < today ? <span className="biz-out">Overdue</span> : undefined}>
            <DateInput value={d.nextStepDate} onChange={(v) => up({ nextStepDate: v }, false)} />
          </Field>
          {!open && (
            <Field label={d.stage === 'won' ? 'Won on' : 'Lost on'}>
              <DateInput value={d.closedDate} onChange={(v) => up({ closedDate: v }, false)} />
            </Field>
          )}
          {d.stage === 'lost' && (
            <Field label="Lost reason" span="all">
              <Input value={d.lostReason} placeholder="Price, timing, chose someone else…" onChange={(v) => up({ lostReason: v || undefined })} />
            </Field>
          )}
          <Field label="Marketing Space" hint="e.g. the campaign that brought the lead">
            <LinkSelect value={d.spaceId} options={links.spaces} onChange={(v) => up({ spaceId: v }, false)} />
          </Field>
          <Field label="Production">
            <LinkSelect value={d.projectId} options={links.projects} onChange={(v) => up({ projectId: v }, false)} />
          </Field>
        </div>

        <div className="biz-section-head">
          <h3>Activity</h3>
          <span className="muted small">{d.activities.length || ''}</span>
        </div>
        <div className="sl-act-form">
          <Select size="sm" value={kind} options={DEAL_ACTIVITY_KINDS} onChange={(v) => setKind(v as DealActivityKind)} aria-label="Activity type" />
          <DateInput size="sm" value={actDate} onChange={(v) => setActDate(v ?? today)} />
          <Input size="sm" value={actText} placeholder="What happened? e.g. Discovery call — budget ~$8k, decision by Friday" onChange={setActText} onKeyDown={(e) => e.key === 'Enter' && logActivity()} aria-label="Activity" />
          <Button size="sm" icon={Plus} disabled={!actText.trim()} onClick={logActivity}>
            Log
          </Button>
        </div>
        {acts.length === 0 ? (
          <div className="biz-empty-line">No calls, emails or meetings logged yet.</div>
        ) : (
          <ol className="sl-acts">
            {acts.map((a) => {
              const Icon = KIND_ICON[a.kind] ?? MessageSquare;
              return (
                <li key={a.id}>
                  <span className="sl-act-icon">
                    <Icon size={13} />
                  </span>
                  <div className="biz-grow">
                    <div className="small">
                      <b>{DEAL_ACTIVITY_KINDS.find((k) => k.value === a.kind)?.label ?? a.kind}</b> <span className="muted">· {a.date ? fmt.date(a.date) : 'no date'}</span>
                    </div>
                    <div className="biz-pre">{a.text}</div>
                  </div>
                  <IconButton icon={Trash2} size="sm" label="Remove" onClick={() => removeActivity(d.id, a.id)} />
                </li>
              );
            })}
          </ol>
        )}

        <div className="biz-section-head">
          <h3>Notes</h3>
        </div>
        <Textarea autoGrow minRows={3} value={d.notes} placeholder="Needs, decision makers, budget, objections, what they liked…" onChange={(v) => up({ notes: v || undefined })} />
        {open && d.nextStepDate && (
          <p className="muted tiny" style={{ marginTop: 8 }}>
            <CalendarClock size={11} /> Follow-ups dated today or earlier show up in “Follow-ups due” on the pipeline and the overview.
          </p>
        )}
      </div>
    </Modal>
  );
}
