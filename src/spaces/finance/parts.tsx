/* Insight / advice items and the advice editor, shared by Overview and Advice. */
import { useState } from 'react';
import { ArrowRight, Bot, Calculator, EyeOff, Pencil, Pin, PinOff, RotateCcw, Trash2, User } from 'lucide-react';
import { navigateSpace } from '@/store/app';
import { Button, confirmDialog, Field, IconButton, Input, Modal, Select, Textarea } from '@/ui';
import type { FinInsight, InsightKind } from './types';
import { INSIGHT_KINDS } from './types';
import type { ComputedInsight } from './calc';
import { addAdvice, deleteInsight, dismissInsight, patchInsight, pinComputed } from './ops';
import { useFmt } from './ui';

const KIND_TONE: Record<InsightKind, string> = { tip: 'info', warning: 'warning', opportunity: 'good', summary: 'info' };

export function ComputedInsightItem({ i, dismissed }: { i: ComputedInsight; dismissed?: boolean }) {
  return (
    <div className={`fin-insight ${i.tone} ${dismissed ? 'dismissed' : ''}`}>
      <div className="fin-insight-body">
        <b>{i.title}</b>
        <p>{i.body}</p>
        <div className="fin-insight-meta">
          <span className="row" style={{ gap: 3 }}>
            <Calculator size={11} /> From your data
          </span>
          {i.module && (
            <button type="button" className="fin-link" onClick={() => navigateSpace(i.module!, i.params ?? {})}>
              Look <ArrowRight size={11} style={{ verticalAlign: '-1px' }} />
            </button>
          )}
        </div>
      </div>
      <div className="fin-insight-actions">
        {dismissed ? (
          <IconButton icon={RotateCcw} size="sm" label="Show again" onClick={() => dismissInsight(i.key, false)} />
        ) : (
          <>
            <IconButton icon={Pin} size="sm" label="Pin as a note" onClick={() => pinComputed(i)} />
            <IconButton icon={EyeOff} size="sm" label="Dismiss" onClick={() => dismissInsight(i.key)} />
          </>
        )}
      </div>
    </div>
  );
}

export function SavedInsightItem({ i, onEdit }: { i: FinInsight; onEdit?: (i: FinInsight) => void }) {
  const fmt = useFmt();
  const tone = i.kind ? KIND_TONE[i.kind] : 'info';
  const Src = i.source === 'agent' ? Bot : i.source === 'user' ? User : Calculator;
  return (
    <div className={`fin-insight ${tone} ${i.dismissed ? 'dismissed' : ''}`}>
      <div className="fin-insight-body">
        <b>{i.title || 'Untitled note'}</b>
        {i.body && <p>{i.body}</p>}
        <div className="fin-insight-meta">
          <span className="row" style={{ gap: 3 }}>
            <Src size={11} />
            {i.source === 'agent' ? `From ${i.author || 'an AI agent'}` : i.source === 'user' ? 'Your note' : 'Pinned insight'}
          </span>
          <span>· {fmt.dateMedium(i.date)}</span>
          {i.kind && <span className="fin-badge">{INSIGHT_KINDS.find((k) => k.value === i.kind)?.label}</span>}
          {i.pinned && <span className="fin-badge accent">Pinned</span>}
        </div>
      </div>
      <div className="fin-insight-actions">
        <IconButton icon={i.pinned ? PinOff : Pin} size="sm" label={i.pinned ? 'Unpin' : 'Pin to the overview'} onClick={() => patchInsight(i.id, { pinned: !i.pinned, dismissed: false })} />
        {onEdit && <IconButton icon={Pencil} size="sm" label="Edit" onClick={() => onEdit(i)} />}
        {i.dismissed ? (
          <IconButton icon={RotateCcw} size="sm" label="Restore" onClick={() => patchInsight(i.id, { dismissed: false })} />
        ) : (
          <IconButton icon={EyeOff} size="sm" label="Dismiss" onClick={() => patchInsight(i.id, { dismissed: true, pinned: false })} />
        )}
        <IconButton
          icon={Trash2}
          size="sm"
          label="Delete"
          onClick={async () => {
            if (await confirmDialog({ title: 'Delete this note?', message: i.title, confirmLabel: 'Delete', danger: true })) deleteInsight(i.id);
          }}
        />
      </div>
    </div>
  );
}

/** Write a note / edit saved advice. `insight` undefined = new note. */
export function AdviceModal({ insight, onClose }: { insight?: FinInsight; onClose: () => void }) {
  const [title, setTitle] = useState(insight?.title ?? '');
  const [body, setBody] = useState(insight?.body ?? '');
  const [kind, setKind] = useState<InsightKind | ''>(insight?.kind ?? 'tip');
  const save = () => {
    if (!title.trim()) return;
    if (insight) patchInsight(insight.id, { title: title.trim(), body, kind: kind || undefined });
    else addAdvice({ title: title.trim(), body, kind: kind || undefined, source: 'user', pinned: true });
    onClose();
  };
  return (
    <Modal
      open
      size="md"
      title={insight ? 'Edit note' : 'New note'}
      onClose={onClose}
      footer={
        <>
          <div className="spacer" />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!title.trim()} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="col" style={{ gap: 12 }}>
        <Field label="Title">
          <Input autoFocus value={title} onChange={setTitle} placeholder="e.g. Move the gym membership to the annual plan" onKeyDown={(e) => e.key === 'Enter' && save()} />
        </Field>
        <Field label="Type">
          <Select value={kind} options={INSIGHT_KINDS} onChange={(v) => setKind(v as InsightKind)} />
        </Field>
        <Field label="Details">
          <Textarea value={body} onChange={setBody} minRows={5} autoGrow placeholder="What to do and why" />
        </Field>
      </div>
    </Modal>
  );
}
