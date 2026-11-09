/* Accounts & outreach → Pipeline: every lead as a card in its stage; drag a card
   to move it on. */
import { useState } from 'react';
import type { ID } from '@/types';
import type { LeadStage } from '@/spaces/types';
import { LEAD_STAGES, lastTouch, leadOwner, type LeadRef } from '@/spaces/outreach';
import { todayISO } from '@/lib/dates';
import { setStage } from './ops';
import { MemberDot, shortDate, useOutreach } from './shared';

export function PipelineView({ leads, onOpenLead }: { leads: LeadRef[]; onOpenLead: (accountId: ID, leadId: ID) => void }) {
  const o = useOutreach();
  const [over, setOver] = useState<LeadStage | null>(null);
  const today = todayISO();
  return (
    <div className="or-board">
      {LEAD_STAGES.map((s) => {
        const cards = leads.filter((r) => r.lead.stage === s.value);
        return (
          <div
            key={s.value}
            className={`or-col ${over === s.value ? 'over' : ''}`}
            style={{ ['--st' as string]: s.color }}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes('application/x-prepro-lead')) return;
              e.preventDefault();
              if (over !== s.value) setOver(s.value);
            }}
            onDragLeave={(e) => {
              if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver(null);
            }}
            onDrop={(e) => {
              setOver(null);
              const raw = e.dataTransfer.getData('application/x-prepro-lead');
              if (!raw) return;
              e.preventDefault();
              const { accountId, leadId } = JSON.parse(raw) as { accountId: ID; leadId: ID };
              setStage(accountId, leadId, s.value);
            }}
          >
            <div className="or-col-head" title={s.hint}>
              <span className="or-col-dot" />
              <b>{s.label}</b>
              <span className="muted small">{cards.length}</span>
            </div>
            <div className="or-col-cards">
              {cards.map(({ account, lead }) => {
                const lt = lastTouch(lead);
                const owner = o.team.find((m) => m.id === leadOwner(account, lead));
                const due = lead.nextDate && lead.nextDate <= today;
                return (
                  <button
                    key={lead.id}
                    type="button"
                    className="or-card"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/x-prepro-lead', JSON.stringify({ accountId: account.id, leadId: lead.id }));
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onClick={() => onOpenLead(account.id, lead.id)}
                  >
                    <span className="row" style={{ gap: 6 }}>
                      <b className="grow ellipsis">{lead.name || 'Unnamed lead'}</b>
                      <MemberDot m={owner} size={18} />
                    </span>
                    <span className="small ellipsis">{account.name || 'Untitled account'}</span>
                    {lead.title && <span className="muted small ellipsis">{lead.title}</span>}
                    <span className="muted small">
                      {lt ? `Last touch ${shortDate(lt.date)}` : 'No touches yet'}
                      {lead.nextDate && <span className={due ? 'or-due' : ''}> · next {shortDate(lead.nextDate)}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
