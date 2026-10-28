/* Accounts & outreach: lead (with its touches), account, list and team dialogs. */
import { useState } from 'react';
import { ExternalLink, Mail, Plus, Send, Trash2, X } from 'lucide-react';
import type { ID } from '@/types';
import type { LeadStage, TouchChannel } from '@/spaces/types';
import { LEAD_STAGES, LIST_COLORS, MEMBER_COLORS, SEGMENTS, TIERS, TOUCH_CHANNELS, channelLabel, isRsvp } from '@/spaces/outreach';
import { useSpace } from '@/store/space';
import { todayISO } from '@/lib/dates';
import { plural } from '@/lib/text';
import { Button, Checkbox, Combo, DateInput, Field, FormGrid, IconButton, Input, Modal, NumberInput, Select, Textarea, confirmDialog } from '@/ui';
import { addLead, addMember, deleteAccounts, deleteLead, deleteList, deleteTouch, logTouch, moveLead, removeMember, toggleAccountList, updateAccount, updateLead, updateList, updateMember } from './ops';
import { MemberDot, MemberSelect, StagePill, StageSelect, meId, shortDate, useOutreach } from './shared';

const webUrl = (s: string) => (/^[a-z][a-z0-9+.-]*:/i.test(s.trim()) ? s.trim() : `https://${s.trim()}`);

/* ---------------------------------------------------------------- lead */

export function LeadDialog({ accountId, leadId, onClose, onOpenAccount }: { accountId: ID; leadId: ID; onClose: () => void; onOpenAccount?: (id: ID) => void }) {
  const o = useOutreach();
  // the lead may have moved to another account while open
  const account = o.accounts.find((a) => a.id === accountId && a.leads.some((l) => l.id === leadId)) ?? o.accounts.find((a) => a.leads.some((l) => l.id === leadId));
  const lead = account?.leads.find((l) => l.id === leadId);
  const [touch, setTouch] = useState<{ date: string; channel: TouchChannel; byId?: ID; note: string; stage: LeadStage | '' }>(() => ({ date: todayISO(), channel: 'email', byId: meId(), note: '', stage: '' }));
  if (!account || !lead) return null;
  const up = (patch: Parameters<typeof updateLead>[2], coalesce = true) => updateLead(account.id, lead.id, patch, coalesce);
  const touches = [...lead.touches].sort((a, b) => b.date.localeCompare(a.date));

  const log = () => {
    const by = touch.byId ?? meId(true);
    logTouch(account.id, lead.id, { date: touch.date || todayISO(), channel: touch.channel, byId: by, note: touch.note.trim() || undefined }, { stage: touch.stage || undefined });
    setTouch((t) => ({ ...t, note: '', stage: '', byId: by }));
  };
  const remove = async () => {
    if (await confirmDialog({ title: `Delete ${lead.name || 'this lead'}?`, message: `${plural(lead.touches.length, 'logged touch', 'logged touches')} go with it. You can undo with Ctrl+Z.`, confirmLabel: 'Delete', danger: true })) {
      deleteLead(account.id, lead.id);
      onClose();
    }
  };

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={
        <span className="row" style={{ gap: 10 }}>
          {lead.name || 'New lead'} <StagePill stage={lead.stage} />
        </span>
      }
      footer={
        <>
          <Button variant="ghost" icon={Trash2} onClick={() => void remove()}>
            Delete
          </Button>
          <div className="spacer" />
          {onOpenAccount && (
            <Button
              onClick={() => {
                onClose();
                onOpenAccount(account.id);
              }}
            >
              {account.name || 'Account'}
            </Button>
          )}
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="or-lead">
        <FormGrid min={220}>
          <Field label="Name">
            <Input autoFocus={!lead.name} value={lead.name} placeholder="Full name" onChange={(name) => up({ name })} />
          </Field>
          <Field label="Title">
            <Input value={lead.title} placeholder="e.g. Head of L&D" onChange={(title) => up({ title: title || undefined })} />
          </Field>
          <Field label="Account">
            <Select value={account.id} options={o.accounts.map((a) => ({ value: a.id, label: a.name || 'Untitled account' }))} onChange={(to) => moveLead(account.id, lead.id, to)} />
          </Field>
          <Field label="Email">
            <div className="row" style={{ gap: 4 }}>
              <Input value={lead.email} placeholder="name@company.com" onChange={(email) => up({ email: email || undefined })} />
              <IconButton icon={Mail} label="Write an email" disabled={!lead.email} onClick={() => window.open(`mailto:${lead.email}`)} />
            </div>
          </Field>
          <Field label="LinkedIn">
            <div className="row" style={{ gap: 4 }}>
              <Input value={lead.linkedin} placeholder="linkedin.com/in/…" onChange={(linkedin) => up({ linkedin: linkedin || undefined })} />
              <IconButton icon={ExternalLink} label="Open the profile" disabled={!lead.linkedin} onClick={() => window.open(webUrl(lead.linkedin!), '_blank', 'noopener')} />
            </div>
          </Field>
          <Field label="Phone">
            <Input value={lead.phone} onChange={(phone) => up({ phone: phone || undefined })} />
          </Field>
          <Field label="Stage">
            <StageSelect size="md" value={lead.stage} onChange={(stage) => up({ stage }, false)} />
          </Field>
          <Field label="Owner" hint={!lead.ownerId && account.ownerId ? 'The account owner, unless you pick someone' : undefined}>
            <MemberSelect size="md" team={o.team} value={lead.ownerId} placeholder={account.ownerId ? `Account owner` : 'Unassigned'} onChange={(ownerId) => up({ ownerId }, false)} />
          </Field>
          <Field label="Next step">
            <Input value={lead.nextStep} placeholder="e.g. Send the agenda" onChange={(nextStep) => up({ nextStep: nextStep || undefined })} />
          </Field>
          <Field label="Next step by">
            <DateInput value={lead.nextDate} onChange={(nextDate) => up({ nextDate }, false)} />
          </Field>
          <Field label="Notes" span="all">
            <Textarea autoGrow minRows={2} value={lead.notes} placeholder="What they care about, how you know them, what they said…" onChange={(notes) => up({ notes: notes || undefined })} />
          </Field>
        </FormGrid>

        <div className="or-touches">
          <h3>Outreach</h3>
          <div className="or-touch-form">
            <DateInput value={touch.date} onChange={(date) => setTouch((t) => ({ ...t, date: date ?? todayISO() }))} />
            <Select size="md" value={touch.channel} options={TOUCH_CHANNELS} onChange={(channel) => setTouch((t) => ({ ...t, channel: channel as TouchChannel }))} aria-label="Channel" />
            <MemberSelect size="md" team={o.team} value={touch.byId} placeholder="Who" onChange={(byId) => setTouch((t) => ({ ...t, byId }))} />
            <Select size="md" value={touch.stage} placeholder="Keep the stage" options={LEAD_STAGES.map((s) => ({ value: s.value, label: `Now ${s.label}` }))} onChange={(stage) => setTouch((t) => ({ ...t, stage: stage as LeadStage | '' }))} aria-label="New stage" />
            <Input value={touch.note} placeholder="What happened (optional)" onChange={(note) => setTouch((t) => ({ ...t, note }))} onKeyDown={(e) => e.key === 'Enter' && log()} />
            <Button variant="primary" icon={Send} onClick={log}>
              Log touch
            </Button>
          </div>
          {touches.length === 0 ? (
            <p className="muted small">No outreach logged yet. Log each email, LinkedIn message or call here so the team sees it.</p>
          ) : (
            <ol className="or-timeline">
              {touches.map((t) => {
                const by = o.team.find((m) => m.id === t.byId);
                return (
                  <li key={t.id}>
                    <MemberDot m={by} size={22} />
                    <div className="grow">
                      <div>
                        <b>{channelLabel(t.channel)}</b> <span className="muted">· {shortDate(t.date)} · {by?.name ?? 'Someone'}</span>
                      </div>
                      {t.note && <div className="or-timeline-note">{t.note}</div>}
                    </div>
                    <IconButton icon={X} size="sm" label="Remove this touch" onClick={() => deleteTouch(account.id, lead.id, t.id)} />
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- account */

export function AccountDialog({ accountId, onClose, onOpenLead }: { accountId: ID; onClose: () => void; onOpenLead: (accountId: ID, leadId: ID) => void }) {
  const o = useOutreach();
  const a = o.accounts.find((x) => x.id === accountId);
  if (!a) return null;
  const up = (patch: Parameters<typeof updateAccount>[1], coalesce = true) => updateAccount(a.id, patch, coalesce);
  const remove = async () => {
    if (await confirmDialog({ title: `Delete ${a.name || 'this account'}?`, message: `Its ${plural(a.leads.length, 'lead')} and their outreach go with it. You can undo with Ctrl+Z.`, confirmLabel: 'Delete', danger: true })) {
      deleteAccounts([a.id]);
      onClose();
    }
  };
  return (
    <Modal
      open
      size="lg"
      onClose={() => {
        if (!a.name.trim() && !a.leads.length) deleteAccounts([a.id]);
        onClose();
      }}
      title={a.name || 'New account'}
      footer={
        <>
          <Button variant="ghost" icon={Trash2} onClick={() => void remove()}>
            Delete
          </Button>
          <div className="spacer" />
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <FormGrid min={220}>
        <Field label="Account">
          <Input autoFocus={!a.name} value={a.name} placeholder="e.g. First Federal Bank" onChange={(name) => up({ name })} />
        </Field>
        <Field label="Segment">
          <Combo value={a.segment} suggestions={SEGMENTS} placeholder="Bank, insurer …" onChange={(segment) => up({ segment: segment || undefined })} />
        </Field>
        <Field label="Tier">
          <Select value={a.tier ? String(a.tier) : ''} placeholder="No tier" options={TIERS.map((t) => ({ value: String(t.value), label: t.label }))} onChange={(v) => up({ tier: v ? (Number(v) as 1 | 2 | 3) : undefined }, false)} />
        </Field>
        <Field label="Owner">
          <MemberSelect size="md" team={o.team} value={a.ownerId} onChange={(ownerId) => up({ ownerId }, false)} />
        </Field>
        <Field label="Website" span={2}>
          <Input value={a.website} placeholder="company.com" onChange={(website) => up({ website: website || undefined })} />
        </Field>
        <Field label="Lists" span="all">
          {o.lists.length ? (
            <div className="row wrap" style={{ gap: 14 }}>
              {o.lists.map((l) => (
                <Checkbox key={l.id} checked={a.listIds.includes(l.id)} onChange={(on) => toggleAccountList(a.id, l.id, on)} label={l.name} />
              ))}
            </div>
          ) : (
            <span className="muted small">No lists yet. Make one with New list.</span>
          )}
        </Field>
        <Field label="Notes" span="all">
          <Textarea autoGrow minRows={2} value={a.notes} placeholder="Why this account, who we know there, what's going on…" onChange={(notes) => up({ notes: notes || undefined })} />
        </Field>
      </FormGrid>
      <div className="or-acc-leads">
        <div className="row" style={{ gap: 8 }}>
          <h3>Leads</h3>
          <span className="muted small">{plural(a.leads.length, 'lead')} · {a.leads.filter(isRsvp).length} RSVP</span>
          <div className="spacer" />
          <Button size="sm" icon={Plus} onClick={() => onOpenLead(a.id, addLead(a.id, { ownerId: undefined }))}>
            Add lead
          </Button>
        </div>
        {a.leads.map((l) => (
          <button key={l.id} type="button" className="or-acc-lead" onClick={() => onOpenLead(a.id, l.id)}>
            <span className="grow ellipsis">
              <b>{l.name || 'Unnamed lead'}</b>
              {l.title && <span className="muted"> · {l.title}</span>}
            </span>
            <StagePill stage={l.stage} />
          </button>
        ))}
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- list */

export function ListDialog({ listId, onClose }: { listId: ID; onClose: () => void }) {
  const o = useOutreach();
  const campaigns = useSpace((s) => s.campaigns);
  const l = o.lists.find((x) => x.id === listId);
  if (!l) return null;
  const count = o.accounts.filter((a) => a.listIds.includes(l.id)).length;
  const up = (patch: Parameters<typeof updateList>[1], coalesce = true) => updateList(l.id, patch, coalesce);
  return (
    <Modal
      open
      onClose={onClose}
      title="Account list"
      footer={
        <>
          <Button
            variant="ghost"
            icon={Trash2}
            onClick={() =>
              void confirmDialog({ title: `Delete the list “${l.name}”?`, message: `Its ${plural(count, 'account')} stay in Accounts, just off this list.`, confirmLabel: 'Delete list', danger: true }).then((ok) => {
                if (ok) {
                  deleteList(l.id);
                  onClose();
                }
              })
            }
          >
            Delete list
          </Button>
          <div className="spacer" />
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <FormGrid min={200}>
        <Field label="Name" span="all">
          <Input autoFocus value={l.name} onChange={(name) => up({ name })} />
        </Field>
        <Field label="RSVP goal" hint="How many yeses this list should bring in">
          <NumberInput value={l.goal} onChange={(goal) => up({ goal })} />
        </Field>
        <Field label="Event date">
          <DateInput value={l.eventDate} onChange={(eventDate) => up({ eventDate }, false)} />
        </Field>
        <Field label="Campaign">
          <Select value={l.campaignId ?? ''} placeholder="None" options={campaigns.map((c) => ({ value: c.id, label: c.name || 'Untitled campaign' }))} onChange={(v) => up({ campaignId: v || undefined }, false)} />
        </Field>
        <Field label="Colour">
          <div className="row" style={{ gap: 6 }}>
            {LIST_COLORS.map((c) => (
              <button key={c} type="button" className={`or-swatch ${l.color === c ? 'on' : ''}`} style={{ background: c }} aria-label={c} onClick={() => up({ color: c }, false)} />
            ))}
          </div>
        </Field>
        <Field label="Description" span="all">
          <Textarea autoGrow minRows={2} value={l.description} placeholder="Who belongs on it and why" onChange={(description) => up({ description: description || undefined })} />
        </Field>
      </FormGrid>
    </Modal>
  );
}

/* ---------------------------------------------------------------- team */

export function TeamDialog({ onClose }: { onClose: () => void }) {
  const o = useOutreach();
  const [name, setName] = useState('');
  const add = () => {
    if (addMember(name)) setName('');
  };
  const owned = (id: ID) => o.accounts.filter((a) => a.ownerId === id).length + o.accounts.reduce((n, a) => n + a.leads.filter((l) => l.ownerId === id).length, 0);
  return (
    <Modal open onClose={onClose} title="Outreach team" footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <p className="muted small" style={{ marginTop: 0 }}>
        The people who own accounts and leads and log outreach. In the hosted version you are added the first time you log a touch.
      </p>
      <div className="or-team">
        {o.team.map((m, i) => (
          <div key={m.id} className="or-team-row">
            <MemberDot m={m} size={26} />
            <Input value={m.name} onChange={(v) => updateMember(m.id, { name: v }, true)} />
            <div className="row" style={{ gap: 4 }}>
              {MEMBER_COLORS.slice(0, 6).map((c) => (
                <button key={c} type="button" className={`or-swatch sm ${m.color === c ? 'on' : ''}`} style={{ background: c }} aria-label={c} onClick={() => updateMember(m.id, { color: c })} />
              ))}
            </div>
            <IconButton
              icon={Trash2}
              label="Remove from the team"
              onClick={() =>
                void confirmDialog({ title: `Remove ${m.name || 'this person'}?`, message: owned(m.id) ? `What they own (${owned(m.id)}) becomes unassigned.` : undefined, confirmLabel: 'Remove', danger: true }).then((ok) => ok && removeMember(m.id))
              }
              data-i={i}
            />
          </div>
        ))}
        <div className="or-team-row">
          <Input value={name} placeholder="Add someone" onChange={setName} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <Button icon={Plus} disabled={!name.trim()} onClick={add}>
            Add
          </Button>
        </div>
      </div>
    </Modal>
  );
}
