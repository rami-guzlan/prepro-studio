/* Workflows & SOPs: step-by-step procedures, workflows and checklists grouped
   by category. Each one can be "run" (e.g. onboarding a specific client): tick the
   steps of that run and finish it; runs are kept as history. Related resources
   open from here. Copy as text or print as an SOP manual. */
import '../../biz.css';
import '../../library.css';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, BookOpenCheck, CheckCircle2, CheckSquare, ClipboardCopy, FileText, Link2, ListChecks, Play, Plus, RotateCcw, Square, Trash2, X } from 'lucide-react';
import type { ID } from '@/types';
import { useSpace } from '@/store/space';
import { navigateSpace, readLS, writeLS } from '@/store/app';
import { exportCsv } from '@/backend';
import { plural, safeFileName } from '@/lib/text';
import { todayISO } from '@/lib/dates';
import { Button, Combo, EmptyState, ExportMenu, Field, IconButton, Input, Menu, ModuleHeader, SearchInput, Select, Textarea, confirmDialog, promptDialog, toast } from '@/ui';
import { Meter } from '@/ui/charts';
import { copyText } from '@/spaces/modules/assets/actions';
import { SOP_KINDS } from '../../constants';
import { addItem, makeSop, removeItems } from '../../ops';
import { OptionPill, rowKeys, useBiz, useFmt, useNavParams } from '../../ui';
import type { Sop, SopKind, SopRun, SopStep } from '../../types';
import {
  SOP_CATEGORIES,
  SOP_FREQUENCIES,
  STARTER_SOPS,
  addSteps,
  finishRun,
  makeStep,
  moveStep,
  patchRun,
  patchSop,
  patchStep,
  removeRun,
  removeStep,
  runProgress,
  setRunSteps,
  sopFromStarter,
  sopText,
  startRun,
  stepsFromText,
  updateSop,
} from './ops';

const kindLabel = (k: SopKind) => SOP_KINDS.find((x) => x.value === k)?.label ?? k;

export default function SopsModule() {
  const b = useBiz();
  const spaceId = useSpace((s) => s.id);
  const title = useSpace((s) => s.meta.title);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<string>('');
  const [sel, setSel] = useState<ID | null>(() => readLS<string | null>(`prepro.biz.sop.${spaceId}`, null));
  const select = (id: ID | null) => {
    setSel(id);
    writeLS(`prepro.biz.sop.${spaceId}`, id);
  };
  const add = (k: SopKind = 'sop') => {
    const s = makeSop({ title: `New ${kindLabel(k).toLowerCase()}`, kind: k });
    addItem('sops', s);
    select(s.id);
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.lib-sop-title input')?.select());
  };
  const addStarter = (i: number) => {
    const s = sopFromStarter(STARTER_SOPS[i]);
    addItem('sops', s);
    select(s.id);
    toast(`Added “${s.title}” — adjust the steps to how you work`);
  };
  useNavParams((p) => {
    if (p.sopId && b.sops.some((x) => x.id === p.sopId)) select(p.sopId);
    if (p.new) add();
  });

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return b.sops.filter((x) => (!kind || x.kind === kind) && (!s || [x.title, x.category, x.trigger, x.owner, x.notes, ...x.steps.map((st) => `${st.text} ${st.detail ?? ''}`)].join(' ').toLowerCase().includes(s)));
  }, [b.sops, q, kind]);
  const groups = useMemo(() => {
    const m = new Map<string, Sop[]>();
    for (const x of list) m.set(x.category || 'Uncategorized', [...(m.get(x.category || 'Uncategorized') ?? []), x]);
    return [...m.entries()].sort(([a], [z]) => (a === 'Uncategorized' ? 1 : z === 'Uncategorized' ? -1 : a.localeCompare(z)));
  }, [list]);
  const cur = b.sops.find((x) => x.id === sel);
  const activeRuns = b.sops.reduce((n, s) => n + s.runs.filter((r) => !r.finishedAt).length, 0);

  const exportList = async () => {
    const rows: { s: Sop; st?: SopStep; i: number }[] = b.sops.flatMap((s) => (s.steps.length ? s.steps.map((st, i) => ({ s, st, i })) : [{ s, i: -1 }]));
    const path = await exportCsv(safeFileName(`${title} - Workflows and SOPs`), rows, [
      { header: 'Title', value: (x) => x.s.title },
      { header: 'Kind', value: (x) => kindLabel(x.s.kind) },
      { header: 'Category', value: (x) => x.s.category },
      { header: 'When to use', value: (x) => x.s.trigger },
      { header: 'Owner', value: (x) => x.s.owner },
      { header: 'Frequency', value: (x) => x.s.frequency },
      { header: 'Step #', value: (x) => (x.i >= 0 ? x.i + 1 : '') },
      { header: 'Step', value: (x) => x.st?.text },
      { header: 'Detail', value: (x) => x.st?.detail },
    ]);
    if (path) toast(`Exported ${plural(b.sops.length, 'procedure')}`);
  };

  const newMenu = [
    ...SOP_KINDS.map((k) => ({ label: `New ${k.label.toLowerCase()}`, icon: k.value === 'checklist' ? ListChecks : k.value === 'workflow' ? Play : FileText, onClick: () => add(k.value) })),
    { separator: true },
    { header: 'Starter templates' },
    ...STARTER_SOPS.map((s, i) => ({ label: s.title, onClick: () => addStarter(i) })),
  ];

  return (
    <div className="module biz">
      <ModuleHeader
        title="Workflows & SOPs"
        icon={BookOpenCheck}
        subtitle={b.sops.length ? `${plural(b.sops.length, 'procedure')}${activeRuns ? ` · ${plural(activeRuns, 'run')} in progress` : ''}` : 'How you do things, step by step'}
        actions={
          <>
            <ExportMenu
              docs={[{ id: 'space-biz-sops', label: 'SOP manual (all)' }, ...(cur ? [{ id: 'space-biz-sops', label: `“${cur.title || 'Untitled'}” only`, options: { sop: cur.id } }] : [])]}
              csv={[{ label: 'All steps (CSV)', onClick: () => void exportList() }]}
            />
            <Menu align="end" trigger={<Button variant="primary" icon={Plus}>New</Button>} items={newMenu} />
          </>
        }
      />
      {b.sops.length === 0 ? (
        <EmptyState
          icon={BookOpenCheck}
          title="Write down how you do things"
          description="Turn what lives in your head into repeatable procedures: client onboarding, delivering a project, monthly bookkeeping, repurposing content. Run a checklist for each client or month and never miss a step — and hand it to a contractor when you grow."
          action={
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button variant="primary" icon={Plus} onClick={() => add('checklist')}>
                New checklist
              </Button>
              <Menu trigger={<Button icon={ListChecks}>Start from a template</Button>} items={STARTER_SOPS.map((s, i) => ({ label: s.title, onClick: () => addStarter(i) }))} />
            </div>
          }
        />
      ) : (
        <div className={`biz-split ${cur ? 'has-sel' : ''}`}>
          <div className="biz-split-list">
            <div className="biz-split-tools">
              <SearchInput value={q} onChange={setQ} placeholder="Search steps, titles…" width="100%" />
              <Select size="sm" value={kind} placeholder="All kinds" options={SOP_KINDS} onChange={setKind} aria-label="Kind" />
            </div>
            <div className="biz-split-items">
              {groups.length === 0 ? (
                <div className="biz-empty-line" style={{ padding: 16 }}>
                  Nothing matches.
                </div>
              ) : (
                groups.map(([cat, items]) => (
                  <div key={cat}>
                    <div className="lib-group-label">{cat}</div>
                    {items.map((x) => {
                      const running = x.runs.filter((r) => !r.finishedAt).length;
                      return (
                        <div key={x.id} role="button" className={`biz-item ${x.id === sel ? 'on' : ''}`} onClick={() => select(x.id)} {...rowKeys(() => select(x.id))}>
                          <div className="row" style={{ gap: 8 }}>
                            <div className="biz-grow">
                              <span className="ellipsis biz-strong">{x.title || 'Untitled'}</span>
                              <span className="ellipsis muted small">{x.trigger || plural(x.steps.length, 'step')}</span>
                            </div>
                            {running > 0 && <span className="biz-tag">{running} running</span>}
                            <OptionPill value={x.kind} options={SOP_KINDS} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="biz-split-main">
            {cur ? (
              <SopEditor key={cur.id} s={cur} onBack={() => select(null)} />
            ) : (
              <EmptyState icon={BookOpenCheck} title="Pick a procedure" description="Open one to edit its steps, start a run or copy it as text." />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- editor */

function SopEditor({ s, onBack }: { s: Sop; onBack: () => void }) {
  const b = useBiz();
  const fmt = useFmt();
  const [newStep, setNewStep] = useState('');
  const [openDetail, setOpenDetail] = useState<Set<string>>(() => new Set(s.steps.filter((x) => x.detail).map((x) => x.id)));
  const up = (patch: Partial<Sop>, coalesce = true) => patchSop(s.id, patch, coalesce);
  const categories = useMemo(() => [...new Set([...SOP_CATEGORIES, ...b.sops.map((x) => x.category).filter(Boolean) as string[]])], [b.sops]);
  const active = s.runs.filter((r) => !r.finishedAt);
  const history = s.runs.filter((r) => r.finishedAt).sort((a, z) => (z.finishedAt ?? '').localeCompare(a.finishedAt ?? ''));
  const resources = s.resourceIds.map((id) => ({ id, r: b.resources.find((x) => x.id === id) }));
  const pickable = b.resources.filter((r) => !s.resourceIds.includes(r.id));

  const addStep = () => {
    const t = newStep.trim();
    if (!t) return;
    const steps = t.includes('\n') ? stepsFromText(t) : [makeStep({ text: t })];
    addSteps(s.id, steps);
    setNewStep('');
  };
  const run = async () => {
    if (!s.steps.length) return toast('Add steps first', 'info');
    const label = await promptDialog({ title: `Start “${s.title || 'Untitled'}”`, message: 'Name this run, e.g. the client, project or month it is for.', placeholder: 'e.g. Brightline Coffee — holiday campaign', confirmLabel: 'Start run' });
    if (label == null) return;
    startRun(s.id, label || fmt.dateMedium(todayISO()));
  };
  const remove = async () => {
    if (await confirmDialog({ title: `Delete “${s.title || 'Untitled'}”?`, message: `${plural(s.steps.length, 'step')} and ${plural(s.runs.length, 'run')} are deleted. You can undo with Ctrl+Z.`, confirmLabel: 'Delete', danger: true })) {
      removeItems('sops', [s.id]);
      onBack();
    }
  };
  const openResource = (id: string) => {
    const r = b.resources.find((x) => x.id === id);
    if (r) navigateSpace(r.section === 'enablement' ? 'enablement' : 'resources', { resourceId: id });
  };
  const toggleDetail = (id: string) =>
    setOpenDetail((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="biz-editor">
      <div className="biz-editor-head">
        <Button className="biz-back" variant="ghost" icon={ArrowLeft} onClick={onBack}>
          Procedures
        </Button>
        <div className="biz-editor-title lib-sop-title">
          <Input value={s.title} placeholder="Title" onChange={(v) => up({ title: v })} aria-label="Title" />
        </div>
        <div className="biz-editor-actions">
          <IconButton icon={ClipboardCopy} label="Copy as text" onClick={() => void copyText(sopText(b, s), 'the steps as text')} />
          <IconButton icon={Trash2} label="Delete" onClick={() => void remove()} />
          <Button variant="primary" icon={Play} onClick={() => void run()}>
            Start run
          </Button>
        </div>
      </div>
      <div className="biz-editor-body">
        {active.map((r) => (
          <RunCard key={r.id} s={s} r={r} />
        ))}

        <div className="biz-form">
          <Field label="Kind">
            <Select value={s.kind} options={SOP_KINDS} onChange={(v) => up({ kind: v as SopKind }, false)} />
          </Field>
          <Field label="Category">
            <Combo value={s.category} suggestions={categories} placeholder="Clients, Delivery…" onChange={(v) => up({ category: v || undefined })} />
          </Field>
          <Field label="Owner">
            <Input value={s.owner} placeholder="Who does it" onChange={(v) => up({ owner: v || undefined })} />
          </Field>
          <Field label="How often">
            <Combo value={s.frequency} suggestions={SOP_FREQUENCIES} placeholder="Per client, monthly…" onChange={(v) => up({ frequency: v || undefined })} />
          </Field>
          <Field label="When to use it" span="all">
            <Input value={s.trigger} placeholder="e.g. A new client signs the proposal" onChange={(v) => up({ trigger: v || undefined })} />
          </Field>
        </div>

        <div className="biz-section-head">
          <h3>Steps</h3>
          <span className="muted small">{plural(s.steps.length, 'step')}</span>
          {s.updatedAt && <span className="muted tiny">· updated {fmt.dateShort(s.updatedAt)}</span>}
        </div>
        {s.steps.length === 0 && <div className="biz-empty-line">No steps yet. Type one below — or paste a list (one step per line).</div>}
        <ol className="lib-sop-steps">
          {s.steps.map((st, idx) => (
            <li key={st.id} className="lib-sop-step">
              <span className="lib-num">{idx + 1}</span>
              <div className="lib-sop-step-main">
                <Input bare value={st.text} placeholder="Step" onChange={(v) => patchStep(s.id, st.id, { text: v })} aria-label={`Step ${idx + 1}`} />
                {openDetail.has(st.id) || st.detail ? (
                  <Textarea bare autoGrow minRows={1} className="lib-sop-detail" value={st.detail} placeholder="Details, links, gotchas…" onChange={(v) => patchStep(s.id, st.id, { detail: v || undefined })} aria-label="Details" />
                ) : (
                  <button type="button" className="biz-link tiny" onClick={() => toggleDetail(st.id)}>
                    + details
                  </button>
                )}
              </div>
              <div className="lib-sop-step-tools">
                <IconButton icon={ArrowUp} size="sm" label="Move up" disabled={idx === 0} onClick={() => moveStep(s.id, st.id, -1)} />
                <IconButton icon={ArrowDown} size="sm" label="Move down" disabled={idx === s.steps.length - 1} onClick={() => moveStep(s.id, st.id, 1)} />
                <IconButton icon={Trash2} size="sm" label="Delete step" onClick={() => removeStep(s.id, st.id)} />
              </div>
            </li>
          ))}
        </ol>
        <div className="lib-add-row">
          <Textarea
            autoGrow
            minRows={1}
            value={newStep}
            placeholder="Add a step… (Enter adds; paste several lines to add many)"
            onChange={setNewStep}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                addStep();
              }
            }}
            aria-label="New step"
          />
          <Button icon={Plus} disabled={!newStep.trim()} onClick={addStep}>
            Add
          </Button>
        </div>

        <div className="biz-section-head">
          <h3>Related resources</h3>
          <span className="muted small">Templates, files and links used in this procedure</span>
        </div>
        <div className="lib-chips">
          {resources.map(({ id, r }) => (
            <span key={id} className="lib-chip">
              <button type="button" className="lib-chip-main" disabled={!r} onClick={() => openResource(id)} title={r ? `Open in ${r.section === 'enablement' ? 'Sales Enablement' : 'Resources'}` : 'Deleted'}>
                <Link2 size={11} />
                {r?.title || 'Deleted resource'}
              </button>
              <button type="button" className="lib-chip-x" aria-label="Remove" onClick={() => updateSop(s.id, (x) => void (x.resourceIds = x.resourceIds.filter((y) => y !== id)))}>
                <X size={11} />
              </button>
            </span>
          ))}
          <Select
            size="sm"
            value=""
            placeholder={pickable.length ? 'Add a resource…' : b.resources.length ? 'All resources added' : 'No resources yet'}
            disabled={!pickable.length}
            options={pickable.map((r) => ({ value: r.id, label: `${r.title || 'Untitled'}${r.section === 'enablement' ? ' (sales)' : ''}` }))}
            onChange={(v) => v && updateSop(s.id, (x) => void x.resourceIds.push(v))}
            aria-label="Add a resource"
          />
          {!b.resources.length && (
            <button type="button" className="biz-link small" onClick={() => navigateSpace('resources')}>
              Go to Resources
            </button>
          )}
        </div>

        {history.length > 0 && (
          <>
            <div className="biz-section-head">
              <h3>Run history</h3>
              <span className="muted small">{plural(history.length, 'finished run')}</span>
            </div>
            <div className="biz-list">
              {history.map((r) => {
                const pr = runProgress(s, r);
                return (
                  <div key={r.id} className="biz-list-row static">
                    <CheckCircle2 size={14} className={pr.done === pr.total ? 'biz-in' : 'muted'} />
                    <span className="biz-grow ellipsis">{r.label || 'Run'}</span>
                    <span className="muted small biz-nowrap">
                      {fmt.dateShort(r.startedAt)} → {fmt.dateShort(r.finishedAt)}
                    </span>
                    <span className="small biz-nowrap">
                      {pr.done}/{pr.total}
                    </span>
                    <IconButton icon={RotateCcw} size="sm" label="Reopen run" onClick={() => finishRun(s.id, r.id, false)} />
                    <IconButton icon={Trash2} size="sm" label="Delete run" onClick={() => removeRun(s.id, r.id)} />
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="biz-form">
          <Field label="Notes" span="all">
            <Textarea autoGrow minRows={2} value={s.notes} placeholder="Why it is done this way, exceptions, who to ask…" onChange={(v) => up({ notes: v || undefined })} />
          </Field>
        </div>
      </div>
    </div>
  );
}

function RunCard({ s, r }: { s: Sop; r: SopRun }) {
  const fmt = useFmt();
  const pr = runProgress(s, r);
  const done = new Set(r.done);
  const complete = pr.total > 0 && pr.done === pr.total;
  return (
    <div className="lib-run">
      <div className="lib-run-head">
        <Play size={14} className="lib-run-icon" />
        <Input bare value={r.label} placeholder="Run" onChange={(v) => patchRun(s.id, r.id, { label: v || undefined })} aria-label="Run name" />
        <span className="muted tiny biz-nowrap">started {fmt.dateShort(r.startedAt)}</span>
        <IconButton
          icon={Trash2}
          size="sm"
          label="Cancel run"
          onClick={async () => {
            if (await confirmDialog({ title: 'Cancel this run?', message: 'The run and its ticks are removed. You can undo with Ctrl+Z.', confirmLabel: 'Cancel run', danger: true })) removeRun(s.id, r.id);
          }}
        />
      </div>
      <div className="row small" style={{ gap: 8 }}>
        <Meter value={pr.done} max={Math.max(1, pr.total)} tone={complete ? 'good' : undefined} label="Run progress" />
        <span className="biz-nowrap">
          {pr.done}/{pr.total}
        </span>
      </div>
      <div className="lib-run-steps">
        {s.steps.map((st, i) => (
          <button key={st.id} type="button" className={`lib-run-step ${done.has(st.id) ? 'done' : ''}`} onClick={() => setRunSteps(s.id, r.id, [st.id], !done.has(st.id))} title={st.detail || undefined}>
            {done.has(st.id) ? <CheckSquare size={15} /> : <Square size={15} />}
            <span className="lib-num">{i + 1}</span>
            <span className="lib-run-text">{st.text || 'Untitled step'}</span>
          </button>
        ))}
      </div>
      <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
        {!complete && pr.total > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setRunSteps(s.id, r.id, s.steps.map((x) => x.id), true)}>
            Tick all
          </Button>
        )}
        <Button size="sm" variant={complete ? 'primary' : 'default'} icon={CheckCircle2} onClick={() => finishRun(s.id, r.id)}>
          Finish run
        </Button>
      </div>
    </div>
  );
}
