/* Strategy › Pillars: recurring themes with target vs actual share of content;
   click a pillar (its piece count or its slice of the mix) to see and edit its content. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, GripVertical, Layers, Plus, Scale, Trash2, TriangleAlert } from 'lucide-react';
import type { Pillar } from '@/spaces/types';
import { PILLAR_COLORS } from '@/spaces/constants';
import { updateSpace, useSpace } from '@/store/space';
import { useApp } from '@/store/app';
import { SWATCHES } from '@/lib/constants';
import { Button, EmptyState, IconButton, NumberInput } from '@/ui';
import { ColorButton, addPillar, deletePillar, focusSelect, pillarOps, plural } from './shared';
import { PillarContentPanel } from './PillarContent';
import { NONE } from '../content/shared';

const PILLAR_SWATCHES = [...PILLAR_COLORS, ...SWATCHES.filter((c) => !PILLAR_COLORS.includes(c))].slice(0, 16);

export function PillarsTab({ focusId, onAdded }: { focusId: string | null; onAdded: (id: string) => void }) {
  const pillars = useSpace((s) => s.pillars);
  const content = useSpace((s) => s.content);

  const stats = useMemo(() => {
    const ids = new Set(pillars.map((p) => p.id));
    const counts = new Map<string, number>();
    let unassigned = 0;
    for (const c of content) {
      if (c.pillarId && ids.has(c.pillarId)) counts.set(c.pillarId, (counts.get(c.pillarId) ?? 0) + 1);
      else unassigned++;
    }
    const targetSum = pillars.reduce((a, p) => a + (p.targetShare ?? 0), 0);
    const anyTarget = pillars.some((p) => p.targetShare != null);
    return { counts, unassigned, total: content.length, targetSum, anyTarget };
  }, [pillars, content]);

  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);

  // the pillar whose content is shown below the list (deep link: navigateSpace('strategy', { tab: 'pillars', pillarId }))
  const params = useApp((s) => s.params);
  const navKey = useApp((s) => s.navKey);
  const [openId, setOpenId] = useState<string | null>(() => (typeof params?.pillarId === 'string' ? params.pillarId : null));
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof params?.pillarId === 'string') setOpenId(params.pillarId);
  }, [navKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (openId) requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [openId]);
  // a deleted pillar closes its panel
  useEffect(() => {
    if (openId && openId !== NONE && !pillars.some((p) => p.id === openId)) setOpenId(null);
  }, [pillars, openId]);
  const toggle = (id: string) => setOpenId((cur) => (cur === id ? null : id));

  if (!pillars.length) {
    return (
      <div className="sp-strategy-page">
        <EmptyState
          icon={Layers}
          title="Define your content pillars"
          description="Pillars are the 3–5 recurring themes your content is built around — e.g. Behind the scenes, Craft & how-to, Story & opinion. Give each a target share and see if your actual mix matches."
          action={
            <Button variant="primary" icon={Plus} onClick={() => onAdded(addPillar())}>
              Add a pillar
            </Button>
          }
        />
      </div>
    );
  }

  const share = (id: string) => (stats.total ? ((stats.counts.get(id) ?? 0) / stats.total) * 100 : 0);
  const sumOk = !stats.anyTarget || Math.round(stats.targetSum) === 100;

  const distribute = () => {
    const n = pillars.length;
    const base = Math.floor(100 / n);
    let rest = 100 - base * n;
    updateSpace((d) => {
      for (const p of d.pillars) {
        p.targetShare = base + (rest > 0 ? 1 : 0);
        if (rest > 0) rest--;
      }
    });
  };

  const onDrop = () => {
    const id = dragId;
    const target = drop;
    setDragId(null);
    setDrop(null);
    if (!id || !target || target.id === id) return;
    if (!target.after) pillarOps.moveBefore(id, target.id);
    else {
      const order = pillars.map((p) => p.id).filter((x) => x !== id);
      const i = order.indexOf(target.id);
      pillarOps.moveBefore(id, order[i + 1] ?? null);
    }
  };

  return (
    <div className="sp-strategy-page">
      <div className="card sp-strategy-mix">
        <div className="sp-strategy-mix-head">
          <h3>Content mix</h3>
          <span className="muted small">
            {stats.total ? (
              <>
                {plural(stats.total, 'piece')} ·{' '}
                {stats.unassigned ? (
                  <button type="button" className="sp-strategy-link" onClick={() => toggle(NONE)} title="Show the pieces without a pillar">
                    {stats.unassigned} without a pillar
                  </button>
                ) : (
                  'all assigned'
                )}
              </>
            ) : (
              'No content yet — actual shares appear as you add pieces'
            )}
          </span>
        </div>
        <MixBar label="Target" segments={pillars.map((p) => ({ id: p.id, color: p.color, value: p.targetShare ?? 0, name: p.name }))} total={Math.max(100, stats.targetSum)} striped />
        <MixBar
          label="Actual"
          segments={[
            ...pillars.map((p) => ({ id: p.id, color: p.color, value: stats.counts.get(p.id) ?? 0, name: p.name })),
            { id: '_none', color: 'var(--border-strong)', value: stats.unassigned, name: 'No pillar' },
          ]}
          total={stats.total}
          onSelect={toggle}
          selected={openId}
        />
        {!sumOk && (
          <div className="sp-strategy-warn">
            <TriangleAlert size={15} />
            <span className="grow">
              Target shares add up to <b>{Math.round(stats.targetSum)}%</b> — adjust them so they total 100%.
            </span>
            <Button size="sm" icon={Scale} onClick={distribute}>
              Split evenly
            </Button>
          </div>
        )}
      </div>

      <div
        className="card sp-strategy-pillars"
        onDragLeave={(e) => {
          if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDrop(null);
        }}
      >
        <div className="sp-strategy-pillars-head">
          <span />
          <span>Pillar</span>
          <span className="num">Target</span>
          <span>Target vs actual share</span>
          <span />
        </div>
        {pillars.map((p, i) => {
          const actual = share(p.id);
          const count = stats.counts.get(p.id) ?? 0;
          const isDrop = drop?.id === p.id;
          return (
            <div
              key={p.id}
              className={`sp-strategy-pillar ${openId === p.id ? 'open' : ''} ${dragId === p.id ? 'dragging' : ''} ${isDrop ? (drop!.after ? 'drop-after' : 'drop-before') : ''}`}
              onDragOver={
                dragId
                  ? (e) => {
                      e.preventDefault();
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const after = e.clientY > r.top + r.height / 2;
                      if (drop?.id !== p.id || drop.after !== after) setDrop({ id: p.id, after });
                    }
                  : undefined
              }
              onDrop={
                dragId
                  ? (e) => {
                      e.preventDefault();
                      onDrop();
                    }
                  : undefined
              }
            >
              <div className="sp-strategy-pillar-order">
                <span
                  className="sp-strategy-grip"
                  draggable
                  title="Drag to reorder"
                  onDragStart={(e) => {
                    setDragId(p.id);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', p.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setDrop(null);
                  }}
                >
                  <GripVertical size={15} />
                </span>
                <div className="sp-strategy-arrows">
                  <IconButton icon={ArrowUp} size="sm" label="Move up" disabled={i === 0} onClick={() => pillarOps.move(i, i - 1)} />
                  <IconButton icon={ArrowDown} size="sm" label="Move down" disabled={i === pillars.length - 1} onClick={() => pillarOps.move(i, i + 1)} />
                </div>
              </div>
              <div className="sp-strategy-pillar-main">
                <div className="row" style={{ gap: 8 }}>
                  <ColorButton value={p.color} swatches={PILLAR_SWATCHES} onChange={(c) => pillarOps.update(p.id, { color: c }, false)} label="Pillar colour" />
                  <input
                    ref={p.id === focusId ? focusSelect : undefined}
                    className="sp-strategy-title-input"
                    value={p.name}
                    placeholder="Pillar name"
                    onChange={(e) => pillarOps.update(p.id, { name: e.target.value })}
                    aria-label="Pillar name"
                  />
                  <button type="button" className={`sp-pillar-open ${openId === p.id ? 'on' : ''}`} onClick={() => toggle(p.id)} aria-expanded={openId === p.id} title={openId === p.id ? 'Hide this pillar’s content' : 'See and edit this pillar’s content'}>
                    {plural(count, 'piece')}
                    <ChevronRight size={14} />
                  </button>
                </div>
                <input
                  className="sp-strategy-sub-input"
                  value={p.description ?? ''}
                  placeholder="What belongs here — e.g. sets, edits, mistakes, wins"
                  onChange={(e) => pillarOps.update(p.id, { description: e.target.value || undefined })}
                  aria-label="Pillar description"
                />
              </div>
              <div className="sp-strategy-pillar-target">
                <NumberInput size="sm" value={p.targetShare} placeholder="—" onChange={(v) => pillarOps.update(p.id, { targetShare: v == null ? undefined : Math.max(0, Math.min(100, v)) })} aria-label="Target share in percent" />
                <span className="muted">%</span>
              </div>
              <div className="sp-strategy-pillar-bars">
                <ShareBar label="Target" value={p.targetShare ?? 0} color={p.color} striped text={p.targetShare != null ? `${p.targetShare}%` : '—'} />
                <ShareBar
                  label="Actual"
                  value={actual}
                  color={p.color}
                  text={
                    <button type="button" className="sp-strategy-link" onClick={() => toggle(p.id)} title="See and edit these pieces">
                      {Math.round(actual)}% · {plural(count, 'piece')}
                    </button>
                  }
                  diff={p.targetShare != null && stats.total > 0 ? actual - p.targetShare : undefined}
                />
              </div>
              <IconButton icon={Trash2} size="sm" label="Delete pillar" onClick={() => deletePillar(p)} />
            </div>
          );
        })}
        <div className="sp-strategy-pillars-foot">
          <Button size="sm" variant="ghost" icon={Plus} onClick={() => onAdded(addPillar())}>
            Add pillar
          </Button>
          <span className="spacer" />
          {stats.anyTarget && (
            <span className={`small ${sumOk ? 'muted' : 'sp-strategy-warn-text'}`}>
              Targets total <b>{Math.round(stats.targetSum)}%</b>
            </span>
          )}
        </div>
      </div>

      {openId && (
        <div ref={panelRef} className="sp-pillar-panel-anchor">
          <PillarContentPanel pillarId={openId} onClose={() => setOpenId(null)} onSwitch={setOpenId} />
        </div>
      )}
    </div>
  );
}

function ShareBar({ label, value, color, striped, text, diff }: { label: string; value: number; color: string; striped?: boolean; text: ReactNode; diff?: number }) {
  const off = diff != null && Math.abs(diff) >= 10;
  return (
    <div className="sp-strategy-share">
      <span className="sp-strategy-share-label">{label}</span>
      <span className="sp-strategy-share-track">
        <span className={striped ? 'striped' : ''} style={{ width: `${Math.max(0, Math.min(100, value))}%`, ['--pc' as string]: color }} />
      </span>
      <span className="sp-strategy-share-val">
        {text}
        {off && (
          <span className={`sp-strategy-diff ${diff! > 0 ? 'over' : 'under'}`} title={diff! > 0 ? 'More than planned' : 'Less than planned'}>
            {diff! > 0 ? '+' : ''}
            {Math.round(diff!)}
          </span>
        )}
      </span>
    </div>
  );
}

function MixBar({ label, segments, total, striped, onSelect, selected }: { label: string; segments: { id: string; color: string; value: number; name: string }[]; total: number; striped?: boolean; onSelect?: (id: string) => void; selected?: string | null }) {
  return (
    <div className="sp-strategy-mixrow">
      <span className="sp-strategy-share-label">{label}</span>
      <div className="sp-strategy-mixbar">
        {total > 0 &&
          segments
            .filter((s) => s.value > 0)
            .map((s) => (
              <span
                key={s.id}
                className={`${striped ? 'striped' : ''} ${onSelect ? 'clickable' : ''} ${selected === (s.id === '_none' ? NONE : s.id) ? 'on' : ''}`}
                style={{ width: `${(s.value / total) * 100}%`, ['--pc' as string]: s.color }}
                title={`${s.name || 'Pillar'}: ${striped ? `${s.value}%` : `${s.value} (${Math.round((s.value / total) * 100)}%)`}${onSelect ? ' — click to see the pieces' : ''}`}
                role={onSelect ? 'button' : undefined}
                tabIndex={onSelect ? 0 : undefined}
                onClick={onSelect ? () => onSelect(s.id === '_none' ? NONE : s.id) : undefined}
                onKeyDown={onSelect ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(s.id === '_none' ? NONE : s.id)) : undefined}
              >
                {(s.value / total) * 100 >= 9 && <em>{s.name}</em>}
              </span>
            ))}
      </div>
    </div>
  );
}
