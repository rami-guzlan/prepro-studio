/* Accounts & outreach → Accounts: target accounts, each opening into its leads
   (stage, owner and next step editable in place; log a touch in one click). */
import { useState } from 'react';
import { ChevronDown, ChevronRight, MessageSquarePlus, Plus } from 'lucide-react';
import type { ID } from '@/types';
import type { TargetAccount } from '@/spaces/types';
import { accountLastTouch, accountStage, isRsvp, lastTouch, leadOwner, stageInfo } from '@/spaces/outreach';
import { readLS, writeLS } from '@/store/app';
import { todayISO } from '@/lib/dates';
import { Button, DateInput, IconButton, Input } from '@/ui';
import { addLead, logTouch, setStage, updateAccount, updateLead } from './ops';
import { MemberDot, MemberSelect, StagePill, StageSelect, meId, shortDate, useOutreach } from './shared';

const OPEN_KEY = 'prepro.or.open';

export function AccountsView({ accounts, onOpenAccount, onOpenLead, onAddAccount }: { accounts: TargetAccount[]; onOpenAccount: (id: ID) => void; onOpenLead: (accountId: ID, leadId: ID) => void; onAddAccount: () => void }) {
  const o = useOutreach();
  const [open, setOpen] = useState<ID[]>(() => readLS<ID[]>(OPEN_KEY, []));
  const toggle = (id: ID) =>
    setOpen((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      writeLS(OPEN_KEY, next.slice(-200));
      return next;
    });
  const allOpen = accounts.length > 0 && accounts.every((a) => open.includes(a.id));
  const today = todayISO();

  if (!accounts.length)
    return (
      <div className="or-empty">
        <p className="muted">No accounts here yet.</p>
        <Button variant="primary" icon={Plus} onClick={onAddAccount}>
          Add an account
        </Button>
      </div>
    );

  return (
    <div className="or-accounts" role="table" aria-label="Accounts">
      <div className="or-acc-head" role="row">
        <button type="button" className="or-chev" aria-label={allOpen ? 'Close all' : 'Open all'} onClick={() => setOpen(allOpen ? [] : accounts.map((a) => a.id))}>
          {allOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <span>Account</span>
        <span>Owner</span>
        <span>Leads</span>
        <span>Furthest</span>
        <span>Last touch</span>
        <span />
      </div>
      {accounts.map((a) => {
        const isOpen = open.includes(a.id);
        const owner = o.team.find((m) => m.id === a.ownerId);
        const best = accountStage(a);
        const rsvps = a.leads.filter(isRsvp).length;
        const last = accountLastTouch(a);
        return (
          <div key={a.id} className={`or-acc ${isOpen ? 'open' : ''}`} role="rowgroup">
            <div className="or-acc-row" role="row" onDoubleClick={() => onOpenAccount(a.id)}>
              <button type="button" className="or-chev" aria-expanded={isOpen} aria-label={isOpen ? 'Hide leads' : 'Show leads'} onClick={() => toggle(a.id)}>
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <button type="button" className="or-acc-name" onClick={() => toggle(a.id)} title="Show the leads (double-click to open the account)">
                <b className="ellipsis">{a.name || 'Untitled account'}</b>
                <span className="muted small ellipsis">{[a.tier ? `Tier ${a.tier}` : '', a.segment].filter(Boolean).join(' · ')}</span>
              </button>
              <span className="or-acc-owner">
                <MemberDot m={owner} />
                <span className="ellipsis small">{owner?.name ?? <span className="muted">Unassigned</span>}</span>
              </span>
              <span className="or-acc-count">
                <span className="or-stagebar" aria-label="Leads by stage">
                  {a.leads.map((l) => (
                    <i key={l.id} style={{ background: stageInfo(l.stage).color }} title={`${l.name || 'Lead'}: ${stageInfo(l.stage).label}`} />
                  ))}
                </span>
                <span className="small">
                  {a.leads.length}
                  {rsvps > 0 && <b className="or-rsvp"> · {rsvps} RSVP</b>}
                </span>
              </span>
              <span>{best ? <StagePill stage={best} /> : <span className="muted small">No leads</span>}</span>
              <span className="small muted">{last ? shortDate(last) : '–'}</span>
              <span className="or-acc-actions">
                <Button size="sm" variant="ghost" onClick={() => onOpenAccount(a.id)}>
                  Open
                </Button>
              </span>
            </div>
            {isOpen && (
              <div className="or-leads" role="rowgroup">
                {a.leads.map((l) => {
                  const lt = lastTouch(l);
                  const due = l.nextDate && l.nextDate <= today && !isRsvp(l) && l.stage !== 'declined';
                  return (
                    <div key={l.id} className="or-lead-row" role="row">
                      <button type="button" className="or-lead-name" onClick={() => onOpenLead(a.id, l.id)} title="Open the lead">
                        <b className="ellipsis">{l.name || 'Unnamed lead'}</b>
                        <span className="muted small ellipsis">{l.title}</span>
                      </button>
                      <MemberSelect team={o.team} value={l.ownerId} placeholder={a.ownerId ? 'Account owner' : 'Unassigned'} onChange={(ownerId) => updateLead(a.id, l.id, { ownerId })} />
                      <StageSelect value={l.stage} onChange={(s) => setStage(a.id, l.id, s)} />
                      <Input size="sm" value={l.nextStep} placeholder="Next step" onChange={(nextStep) => updateLead(a.id, l.id, { nextStep: nextStep || undefined }, true)} />
                      <span className={due ? 'or-due' : ''}>
                        <DateInput size="sm" value={l.nextDate} onChange={(nextDate) => updateLead(a.id, l.id, { nextDate })} />
                      </span>
                      <span className="small muted ellipsis" title={lt?.note}>
                        {lt ? `${shortDate(lt.date)} · ${l.touches.length}` : 'No touches'}
                      </span>
                      <IconButton
                        icon={MessageSquarePlus}
                        size="sm"
                        label="Log a touch today (email). Open the lead for more."
                        onClick={() => logTouch(a.id, l.id, { channel: 'email', byId: meId(true) ?? leadOwner(a, l) })}
                      />
                    </div>
                  );
                })}
                <div className="or-lead-add">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Plus}
                    onClick={() => {
                      const id = addLead(a.id);
                      onOpenLead(a.id, id);
                    }}
                  >
                    Add lead
                  </Button>
                  {!a.ownerId && o.team.length > 0 && (
                    <span className="row small muted" style={{ gap: 6 }}>
                      Account owner
                      <MemberSelect team={o.team} value={a.ownerId} onChange={(ownerId) => updateAccount(a.id, { ownerId })} />
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
