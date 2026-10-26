/* Design system › Review & finishing: the review checklist and the finishing workflow. */
import { useRef, useState } from 'react';
import { ClipboardCheck, ListChecks, Plus } from 'lucide-react';
import { Button, Input, Textarea } from '@/ui';
import { DEFAULT_REVIEW_CRITERIA } from '../types';
import { dsSet, dsUpdate } from '../ops';
import { ItemActions, SectionHead, SubHead, Teach, useDS } from './shared';

/** Empty criteria are dropped when the design system is read, so clearing one removes it (keeps indexes aligned). */
function setCriterion(i: number, text: string) {
  if (!text) removeCriterion(i);
  else dsUpdate((ds) => void (ds.review.criteria[i] = text), { coalesce: `ds:review.criteria:${i}` });
}
function moveCriterion(from: number, to: number) {
  dsUpdate((ds) => {
    const l = ds.review.criteria;
    if (to < 0 || to >= l.length) return;
    const [x] = l.splice(from, 1);
    l.splice(to, 0, x);
  });
}
function removeCriterion(i: number) {
  dsUpdate((ds) => void ds.review.criteria.splice(i, 1));
}
function addStandard() {
  dsUpdate((ds) => {
    for (const c of DEFAULT_REVIEW_CRITERIA) if (!ds.review.criteria.includes(c)) ds.review.criteria.push(c);
  });
}

export function ReviewSection() {
  const ds = useDS();
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const criteria = ds.review.criteria;
  const missingStandard = DEFAULT_REVIEW_CRITERIA.filter((c) => !criteria.includes(c)).length;
  const add = () => {
    const t = draft.trim();
    if (!t) return;
    dsUpdate((d) => void d.review.criteria.push(t));
    setDraft('');
    ref.current?.focus();
  };
  return (
    <div className="ds-section">
      <SectionHead icon={ClipboardCheck} title="Review & finishing" intro="How every result is checked before it ships, and how exact elements (logos, fonts, small text) are placed over generated art afterwards." />

      <div className="ds-card">
        <SubHead
          title="Review checklist"
          hint="Every agent checks its results against these"
          actions={
            criteria.length > 0 &&
            missingStandard > 0 && (
              <Button size="sm" variant="ghost" icon={ListChecks} onClick={addStandard}>
                Add the standard checklist
              </Button>
            )
          }
        />
        {criteria.length === 0 && (
          <Teach
            icon={ListChecks}
            title="Make “on brand” checkable"
            actions={
              <Button icon={ListChecks} onClick={addStandard}>
                Add the standard checklist
              </Button>
            }
          >
            Hierarchy, imagery, palette balance, typography, logo integrity, readability at the smallest size, format and safe areas … Start from the standard eight and edit them.
          </Teach>
        )}
        {criteria.length > 0 && (
          <ol className="ds-criteria">
            {criteria.map((c, i) => (
              <li key={i} className="ds-criterion">
                <span className="ds-criterion-box" aria-hidden />
                <Input bare className="grow" value={c} aria-label={`Criterion ${i + 1}`} onChange={(v) => setCriterion(i, v)} />
                <ItemActions index={i} count={criteria.length} onMove={moveCriterion} onDelete={() => removeCriterion(i)} label="criterion" />
              </li>
            ))}
          </ol>
        )}
        <div className="ds-quickadd" style={{ marginTop: 8 }}>
          <Input
            ref={ref}
            className="grow"
            value={draft}
            placeholder="Add a check and press Enter, e.g. The product is the hero, not the model"
            aria-label="New criterion"
            onChange={setDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button icon={Plus} disabled={!draft.trim()} onClick={add}>
            Add
          </Button>
        </div>
      </div>

      <div className="ds-card">
        <SubHead title="Finishing workflow" hint="Used by every brief unless it says otherwise" />
        <Textarea
          autoGrow
          minRows={4}
          value={ds.review.finishing}
          aria-label="Finishing workflow"
          placeholder={'e.g.\n1. Generate the art without text or logo, leaving the safe area clear.\n2. Place the real logo file (logos/) bottom-left at 6 % of the width.\n3. Set exact copy in Montserrat ExtraBold from the type scale.\n4. Export at 2x; check the review list at phone size.'}
          onChange={(v) => dsSet('review.finishing', v)}
        />
      </div>
    </div>
  );
}
