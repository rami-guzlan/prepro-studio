/* Creator workspace: shared pieces (sections, tickable checklists, pick-one
   idea lists, the "move on" bar). */
import { useState, type ReactNode } from 'react';
import { ArrowRight, Check, Plus, RotateCcw, Star, X } from 'lucide-react';
import type { CreatorCheck, CreatorOption, CreatorStage } from '@/types';
import { Button, IconButton, Input } from '@/ui';
import { STAGES, nextStage, stageInfo } from './model';
import { checkOps, setStage } from './ops';

export function Section({ id, title, hint, actions, children }: { id?: string; title: ReactNode; hint?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="cr-sec" id={id}>
      <div className="cr-sec-head">
        <h3>{title}</h3>
        {hint && <span className="muted small">{hint}</span>}
        <div className="spacer" />
        {actions}
      </div>
      {children}
    </section>
  );
}

/** A tickable list with add / rename / remove; big targets when "big" (shoot mode). */
export function CheckList({ items, list, big, addLabel = 'Add an item' }: { items: CreatorCheck[]; list: Parameters<typeof checkOps>[0]; big?: boolean; addLabel?: string }) {
  const ops = checkOps(list);
  const [text, setText] = useState('');
  const done = items.filter((x) => x.done).length;
  return (
    <div className={`cr-checks ${big ? 'big' : ''}`}>
      {items.map((x) => (
        <div key={x.id} className={`cr-check ${x.done ? 'done' : ''}`}>
          <button type="button" className="cr-tick" aria-pressed={!!x.done} aria-label={x.done ? `Untick ${x.label}` : `Tick ${x.label}`} onClick={() => ops.toggle(x.id)}>
            {x.done && <Check size={big ? 18 : 13} />}
          </button>
          {big ? <span className="grow" onClick={() => ops.toggle(x.id)}>{x.label}</span> : <Input bare size="sm" value={x.label} onChange={(v) => ops.rename(x.id, v)} />}
          {!big && <IconButton icon={X} size="sm" label="Remove" onClick={() => ops.remove(x.id)} />}
        </div>
      ))}
      {!big && (
        <div className="cr-check add">
          <Plus size={13} className="muted" />
          <Input
            bare
            size="sm"
            value={text}
            placeholder={addLabel}
            onChange={setText}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && text.trim()) {
                ops.add(text.trim());
                setText('');
              }
            }}
          />
        </div>
      )}
      {done > 0 && (
        <button type="button" className="cr-reset" onClick={() => ops.reset()}>
          <RotateCcw size={12} /> Untick all ({done})
        </button>
      )}
    </div>
  );
}

/** Ideas to choose from (hooks, titles): add, edit, star the one to use. */
export function OptionList({ items, onAdd, onText, onPick, onRemove, placeholder, limit }: { items: CreatorOption[]; onAdd: (text: string) => void; onText: (id: string, text: string) => void; onPick: (id: string) => void; onRemove: (id: string) => void; placeholder: string; limit?: number }) {
  const [text, setText] = useState('');
  const add = () => {
    if (!text.trim()) return;
    onAdd(text.trim());
    setText('');
  };
  return (
    <div className="cr-options">
      {items.map((o) => (
        <div key={o.id} className={`cr-option ${o.picked ? 'picked' : ''}`}>
          <button type="button" className="cr-star" aria-pressed={!!o.picked} title={o.picked ? 'The one we use' : 'Use this one'} onClick={() => onPick(o.id)}>
            <Star size={15} fill={o.picked ? 'currentColor' : 'none'} />
          </button>
          <Input bare value={o.text} onChange={(v) => onText(o.id, v)} />
          {limit && <span className={`cr-count ${o.text.length > limit ? 'over' : ''}`}>{o.text.length}</span>}
          <IconButton icon={X} size="sm" label="Remove" onClick={() => onRemove(o.id)} />
        </div>
      ))}
      <div className="cr-option add">
        <Plus size={15} className="muted" />
        <Input value={text} placeholder={placeholder} onChange={setText} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <Button size="sm" disabled={!text.trim()} onClick={add}>
          Add
        </Button>
      </div>
    </div>
  );
}

/** "Move on to …" when a stage's steps are done (always possible, never forced). */
export function NextStageBar({ stage, current, ready }: { stage: CreatorStage; current: CreatorStage; ready: boolean }) {
  if (stage !== current || stage === 'done') return null;
  const next = stageInfo(nextStage(stage));
  return (
    <div className={`cr-nextbar ${ready ? 'ready' : ''}`}>
      <span className="grow">{ready ? `${stageInfo(stage).label} is done. Keep the ball rolling:` : `When ${stageInfo(stage).label.toLowerCase()} feels good enough, move on. Done beats perfect.`}</span>
      <Button variant={ready ? 'primary' : 'default'} icon={ArrowRight} onClick={() => setStage(next.value)}>
        On to {next.label}
      </Button>
    </div>
  );
}

export const stageIndex = (s: CreatorStage) => STAGES.findIndex((x) => x.value === s);
