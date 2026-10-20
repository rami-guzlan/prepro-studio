/* "Quick add crew": add a template crew or the standard positions of a department. */
import { useMemo, useState } from 'react';
import { Check, Plus, Sparkles } from 'lucide-react';
import type { CrewMember } from '@/types';
import { DEPARTMENTS, POSITIONS_BY_DEPT } from '@/lib/constants';
import { Button, Checkbox, Modal } from '@/ui';
import { CREW_TEMPLATES, departmentPositions } from './data';
import { addPositions } from './actions';

interface Item {
  key: string;
  dept: string;
  position: string;
  exists: boolean;
}

function buildItems(list: [string, string][], crew: CrewMember[]): Item[] {
  // count existing crew per dept/position so templates with repeated positions (2 PAs) work
  const have = new Map<string, number>();
  for (const c of crew) {
    const k = `${(c.department || 'Other').toLowerCase()}|${c.position.trim().toLowerCase()}`;
    have.set(k, (have.get(k) ?? 0) + 1);
  }
  return list.map(([dept, position], i) => {
    const k = `${dept.toLowerCase()}|${position.toLowerCase()}`;
    const n = have.get(k) ?? 0;
    if (n > 0) have.set(k, n - 1);
    return { key: `${i}`, dept, position, exists: n > 0 };
  });
}

export function QuickAddModal({ crew, initial, onClose }: { crew: CrewMember[]; initial?: string; onClose: () => void }) {
  const [choice, setChoice] = useState<string>(initial ?? 'small');
  const list = useMemo<[string, string][]>(() => {
    if (choice.startsWith('dept:')) return departmentPositions(choice.slice(5));
    return CREW_TEMPLATES.find((t) => t.id === choice)?.positions ?? [];
  }, [choice]);
  const items = useMemo(() => buildItems(list, crew), [list, crew]);
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const selected = items.filter((it) => !it.exists && !unchecked.has(it.key));

  const toggle = (key: string, on: boolean) =>
    setUnchecked((s) => {
      const n = new Set(s);
      if (on) n.delete(key);
      else n.add(key);
      return n;
    });
  const pick = (c: string) => {
    setChoice(c);
    setUnchecked(new Set());
  };
  const submit = () => {
    if (!selected.length) return;
    addPositions(selected.map((it) => [it.dept, it.position]));
    onClose();
  };

  const template = CREW_TEMPLATES.find((t) => t.id === choice);
  const deptName = choice.startsWith('dept:') ? choice.slice(5) : '';
  let lastDept = '';

  return (
    <Modal
      open
      size="lg"
      title="Quick add crew"
      onClose={onClose}
      bodyStyle={{ padding: 0 }}
      footer={
        <>
          <span className="muted small">Positions are added without names — fill them in as you hire.</span>
          <div className="spacer" />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Plus} disabled={!selected.length} onClick={submit}>
            {selected.length ? `Add ${selected.length} ${selected.length === 1 ? 'position' : 'positions'}` : 'Nothing to add'}
          </Button>
        </>
      }
    >
      <div
        className="crew-qa"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !(e.target as HTMLElement).closest('button')) submit();
        }}
      >
        <div className="crew-qa-left">
          <div className="menu-label">Templates</div>
          {CREW_TEMPLATES.map((t) => (
            <button key={t.id} type="button" className={`list-item ${choice === t.id ? 'active' : ''}`} onClick={() => pick(t.id)}>
              <Sparkles size={14} className="muted" />
              <span className="grow">{t.label}</span>
              <span className="tiny muted">{t.positions.length}</span>
            </button>
          ))}
          <div className="menu-label" style={{ marginTop: 8 }}>
            Department positions
          </div>
          {DEPARTMENTS.filter((d) => POSITIONS_BY_DEPT[d]?.length).map((d) => (
            <button key={d} type="button" className={`list-item ${choice === `dept:${d}` ? 'active' : ''}`} onClick={() => pick(`dept:${d}`)}>
              <span className="grow">{d}</span>
              <span className="tiny muted">{POSITIONS_BY_DEPT[d].length}</span>
            </button>
          ))}
        </div>
        <div className="crew-qa-right">
          <div className="crew-qa-title">
            <h3>{template ? template.label : `${deptName} department`}</h3>
            <p className="muted small">{template ? template.description : `Standard ${deptName.toLowerCase()} positions.`}</p>
          </div>
          <div className="crew-qa-list">
            {items.map((it) => {
              const header = it.dept !== lastDept ? it.dept : '';
              lastDept = it.dept;
              return (
                <div key={it.key}>
                  {header && !deptName && <div className="crew-qa-dept">{header}</div>}
                  <div className={`crew-qa-item ${it.exists ? 'exists' : ''}`} onClick={it.exists ? undefined : () => toggle(it.key, unchecked.has(it.key))}>
                    {it.exists ? (
                      <span className="crew-qa-have" title="Already on your crew list">
                        <Check size={13} />
                      </span>
                    ) : (
                      <Checkbox checked={!unchecked.has(it.key)} onChange={(v) => toggle(it.key, v)} />
                    )}
                    <span className="grow">{it.position}</span>
                    {it.exists && <span className="tiny muted">already on crew</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
