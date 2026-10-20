/* Merge duplicate breakdown elements. Elements tagged in the script text can only be kept
   (the tags reference their id), never merged away. */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Combine } from 'lucide-react';
import type { BreakdownElement, ID } from '@/types';
import { update, useProject } from '@/store/project';
import { CATEGORY_BY_ID } from '@/lib/constants';
import { naturalCompare, plural } from '@/lib/text';
import { Button, EmptyState, Modal, Select, toast } from '@/ui';
import { duplicateKey, mergeElementsDraft } from '@/modules/breakdown/logic';

export interface MergeRequest {
  /** merge this element into another one; omit to scan for duplicates */
  sourceId?: ID;
}

function catLabel(el: BreakdownElement) {
  return CATEGORY_BY_ID[el.category]?.label ?? el.category;
}

function Name({ el }: { el: BreakdownElement }) {
  return (
    <span className="row" style={{ gap: 6, minWidth: 0 }}>
      <span className="color-dot" style={{ background: CATEGORY_BY_ID[el.category]?.color ?? '#888', width: 8, height: 8 }} />
      <span className="strong ellipsis">{el.name || 'Unnamed'}</span>
      <span className="muted small nowrap">{catLabel(el)}</span>
    </span>
  );
}

function mergeMany(sourceIds: ID[], targetId: ID) {
  update((d) => {
    for (const s of sourceIds) mergeElementsDraft(d, s, targetId);
  });
}

/* ---------------------------------------------------------------- single merge */

function SingleMerge({ sourceId, tagged, sceneCount, onClose }: { sourceId: ID; tagged: Map<ID, number>; sceneCount: Map<ID, number>; onClose: () => void }) {
  const elements = useProject((p) => p.elements);
  const source = elements.find((e) => e.id === sourceId);
  const [targetId, setTargetId] = useState<string>('');
  const options = useMemo(() => {
    if (!source) return [];
    return elements
      .filter((e) => e.id !== source.id)
      .sort((a, b) => (a.category === source.category ? 0 : 1) - (b.category === source.category ? 0 : 1) || naturalCompare(a.name, b.name))
      .map((e) => ({ value: e.id, label: `${e.name || 'Unnamed'} — ${catLabel(e)}` }));
  }, [elements, source]);
  useEffect(() => {
    if (!source) onClose();
  }, [source, onClose]);
  if (!source) return null;
  const target = elements.find((e) => e.id === targetId);
  const srcTagged = (tagged.get(source.id) ?? 0) > 0;
  const tgtTagged = target ? (tagged.get(target.id) ?? 0) > 0 : false;
  const blocked = srcTagged && (!target || tgtTagged);

  const doMerge = (from: BreakdownElement, into: BreakdownElement) => {
    mergeMany([from.id], into.id);
    toast(`Merged ${from.name} into ${into.name}`);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Merge element"
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {target && srcTagged && !tgtTagged ? (
            <Button variant="primary" icon={Combine} onClick={() => doMerge(target, source)}>
              Merge {target.name} into {source.name}
            </Button>
          ) : (
            <Button variant="primary" icon={Combine} disabled={!target || blocked} onClick={() => target && doMerge(source, target)}>
              Merge
            </Button>
          )}
        </>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        <div className="elements-merge-pair">
          <div className="elements-merge-card">
            <div className="tiny muted">Merge</div>
            <Name el={source} />
            <div className="tiny muted">
              {plural(sceneCount.get(source.id) ?? 0, 'scene')}
              {srcTagged ? ' · tagged in script' : ''}
            </div>
          </div>
          <ArrowRight size={18} className="muted" />
          <div className="elements-merge-card">
            <div className="tiny muted">Into</div>
            <Select value={targetId} onChange={setTargetId} placeholder="Choose the element to keep…" options={options} />
            {target && (
              <div className="tiny muted">
                {plural(sceneCount.get(target.id) ?? 0, 'scene')}
                {tgtTagged ? ' · tagged in script' : ''}
              </div>
            )}
          </div>
        </div>
        <p className="small text-2" style={{ margin: 0 }}>
          Scene links move to the element you keep, empty fields (photo, vendor, cost…) are filled in from the merged element and its notes are appended. The merged element is then deleted. Undo with Ctrl+Z.
        </p>
        {srcTagged && (
          <div className="elements-warn">
            <AlertTriangle size={15} />
            <div>
              <b>{source.name}</b> is tagged in the script text, so it has to be the element you keep.
              {target && tgtTagged
                ? ' Both elements are tagged — remove or re-tag one of them in the Script editor first.'
                : target
                  ? ` The button below merges ${target.name} into ${source.name} instead.`
                  : ''}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- duplicate finder */

function DuplicateFinder({ tagged, sceneCount, onClose }: { tagged: Map<ID, number>; sceneCount: Map<ID, number>; onClose: () => void }) {
  const elements = useProject((p) => p.elements);
  const groups = useMemo(() => {
    const m = new Map<string, BreakdownElement[]>();
    for (const e of elements) {
      const k = duplicateKey(e.name);
      if (!k) continue;
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m.values()].filter((g) => g.length > 1);
  }, [elements]);
  const [keepers, setKeepers] = useState<Record<string, ID>>({});

  const keeperOf = (g: BreakdownElement[]) => {
    const key = duplicateKey(g[0].name);
    const chosen = keepers[key];
    if (chosen && g.some((e) => e.id === chosen)) return chosen;
    const tag = g.find((e) => (tagged.get(e.id) ?? 0) > 0);
    if (tag) return tag.id;
    return [...g].sort((a, b) => (sceneCount.get(b.id) ?? 0) - (sceneCount.get(a.id) ?? 0))[0].id;
  };

  const mergeGroup = (g: BreakdownElement[]) => {
    const keep = keeperOf(g);
    const sources = g.filter((e) => e.id !== keep && !(tagged.get(e.id) ?? 0));
    if (!sources.length) return;
    mergeMany(
      sources.map((e) => e.id),
      keep,
    );
    toast(`Merged ${plural(sources.length, 'duplicate')} into ${g.find((e) => e.id === keep)?.name}`);
  };

  return (
    <Modal open onClose={onClose} title="Merge duplicates" size="lg" footer={<Button onClick={onClose}>Done</Button>}>
      {groups.length === 0 ? (
        <EmptyState icon={Combine} title="No duplicates found" description="Elements with the same name (ignoring case, spaces and punctuation) show up here so you can merge them." />
      ) : (
        <div className="col" style={{ gap: 12 }}>
          <p className="small text-2" style={{ margin: 0 }}>
            Pick the element to keep in each group. Scene links move to it and the others are deleted. Elements tagged in the script text can only be kept, not merged away.
          </p>
          {groups.map((g) => {
            const keep = keeperOf(g);
            const key = duplicateKey(g[0].name);
            const blocked = g.filter((e) => e.id !== keep && (tagged.get(e.id) ?? 0) > 0);
            const mergeable = g.filter((e) => e.id !== keep && !(tagged.get(e.id) ?? 0));
            return (
              <div key={key} className="elements-dupgroup">
                {g.map((e) => (
                  <label key={e.id} className={`elements-dupitem ${keep === e.id ? 'on' : ''}`}>
                    <input type="radio" name={`keep-${key}`} checked={keep === e.id} onChange={() => setKeepers((k) => ({ ...k, [key]: e.id }))} />
                    <Name el={e} />
                    <span className="spacer" />
                    <span className="tiny muted nowrap">
                      {plural(sceneCount.get(e.id) ?? 0, 'scene')}
                      {(tagged.get(e.id) ?? 0) > 0 ? ' · tagged' : ''}
                    </span>
                    {keep === e.id && <span className="badge accent">keep</span>}
                  </label>
                ))}
                {blocked.length > 0 && (
                  <div className="elements-warn small">
                    <AlertTriangle size={14} />
                    <span>
                      {blocked.map((b) => b.name).join(', ')} {blocked.length === 1 ? 'is' : 'are'} tagged in the script and can't be merged away — keep it, or re-tag in the Script editor.
                    </span>
                  </div>
                )}
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <Button size="sm" variant="primary" icon={Combine} disabled={!mergeable.length} onClick={() => mergeGroup(g)}>
                    Merge {mergeable.length ? plural(mergeable.length, 'element') : ''} into kept
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

export function MergeDialog({ request, tagged, sceneCount, onClose }: { request: MergeRequest | null; tagged: Map<ID, number>; sceneCount: Map<ID, number>; onClose: () => void }) {
  if (!request) return null;
  if (request.sourceId) return <SingleMerge sourceId={request.sourceId} tagged={tagged} sceneCount={sceneCount} onClose={onClose} />;
  return <DuplicateFinder tagged={tagged} sceneCount={sceneCount} onClose={onClose} />;
}
