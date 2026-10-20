/* ADR (dialogue replacement) list + "Import dialogue line" from the screenplay. */
import { useEffect, useMemo, useState } from 'react';
import { Copy, Import, Mic, Plus, Trash2 } from 'lucide-react';
import type { AdrLine, Character, PostStatus } from '@/types';
import { POST_STATUSES, type Option } from '@/lib/constants';
import { uid } from '@/lib/id';
import { titleCase, truncate } from '@/lib/text';
import { parseCue } from '@/script-core/heading';
import { useScriptModel, type ScriptModel } from '@/derived/script';
import { update, useProject } from '@/store/project';
import { Button, EmptyState, Modal, Select, Toolbar, confirmDialog, toast, type Column } from '@/ui';
import { PostTable, SceneSelect, StatusSelect, Summary } from './components';
import { ADR_REASONS, adrOps } from './shared';

async function removeItem(a: AdrLine) {
  const ok = await confirmDialog({ title: 'Delete ADR line?', message: a.line ? `“${truncate(a.line, 80)}” will be removed.` : 'This ADR line will be removed.', confirmLabel: 'Delete', danger: true });
  if (ok) adrOps.remove(a.id);
}

export interface DialogueLine {
  key: string;
  sceneId: string;
  name: string;
  characterId?: string;
  text: string;
}

function characterIndex(chars: Character[]) {
  const m = new Map<string, string>();
  for (const c of chars) {
    m.set(c.name.toUpperCase(), c.id);
    for (const a of c.aliases ?? []) m.set(a.toUpperCase(), c.id);
  }
  return m;
}

/** Every dialogue paragraph with its speaker, scene by scene. */
export function dialogueLines(model: ScriptModel, chars: Character[]): DialogueLine[] {
  const idx = characterIndex(chars);
  const out: DialogueLine[] = [];
  for (const s of model.scenes) {
    let cue = '';
    for (let i = s.paraStart + 1; i < s.paraEnd; i++) {
      const p = model.paras[i];
      if (!p) continue;
      if (p.type === 'character') cue = parseCue(p.text).name;
      else if (p.type === 'dialogue') {
        if (cue && p.text.trim()) out.push({ key: `${s.id}:${i}`, sceneId: s.id, name: cue, characterId: idx.get(cue), text: p.text.trim() });
      } else if (p.type !== 'parenthetical') cue = '';
    }
  }
  return out;
}

export function AdrTab() {
  const rows = useProject((p) => p.post.adr);
  const characters = useProject((p) => p.characters);
  const [importOpen, setImportOpen] = useState(false);

  const charOptions = useMemo<Option[]>(() => characters.map((c) => ({ value: c.id, label: titleCase(c.name) })), [characters]);
  const add = () => adrOps.add({ id: uid('adr'), line: '', status: 'not_started' });

  const columns: Column<AdrLine>[] = [
    {
      key: 'characterId',
      header: 'Character',
      width: 150,
      sortValue: (a) => charOptions.find((o) => o.value === a.characterId)?.label ?? '',
      render: (a) => {
        const opts = a.characterId && !charOptions.some((o) => o.value === a.characterId) ? [{ value: a.characterId, label: '(deleted)' }, ...charOptions] : charOptions;
        return <Select bare size="sm" value={a.characterId ?? ''} options={opts} placeholder="—" onChange={(v) => adrOps.update(a.id, { characterId: v || undefined }, false)} style={{ fontWeight: 600 }} />;
      },
    },
    {
      key: 'sceneId',
      header: 'Scene',
      width: 190,
      sortValue: (a) => a.sceneId ?? '',
      render: (a) => <SceneSelect value={a.sceneId} onChange={(v) => adrOps.update(a.id, { sceneId: v }, false)} />,
    },
    { key: 'line', header: 'Line', type: 'textarea', minWidth: 260, placeholder: 'Dialogue to re-record', style: { fontFamily: 'var(--font-script)' } },
    { key: 'reason', header: 'Reason', type: 'combo', suggestions: ADR_REASONS, width: 150, placeholder: '—' },
    { key: 'tc', header: 'TC', type: 'text', width: 116, placeholder: '01:00:00:00', style: { fontFamily: 'var(--font-mono)' } },
    {
      key: 'status',
      header: 'Status',
      width: 128,
      sortValue: (a) => POST_STATUSES.findIndex((s) => s.value === a.status),
      render: (a) => <StatusSelect value={a.status} options={POST_STATUSES} onChange={(v) => adrOps.update(a.id, { status: v as PostStatus }, false)} />,
    },
    { key: 'notes', header: 'Notes', type: 'text', minWidth: 160, placeholder: 'Notes' },
  ];

  const people = new Set(rows.map((r) => r.characterId).filter(Boolean)).size;
  const done = rows.filter((r) => r.status === 'done').length;

  return (
    <>
      <Toolbar>
        <Button icon={Plus} onClick={add}>
          Add ADR line
        </Button>
        <Button icon={Import} onClick={() => setImportOpen(true)}>
          Import dialogue line
        </Button>
        <div className="spacer" />
        <Summary>
          <span>
            <b>{rows.length}</b> line{rows.length === 1 ? '' : 's'}
          </span>
          <span>
            <b>{people}</b> actor{people === 1 ? '' : 's'}
          </span>
          <span>
            <b>{done}</b> recorded
          </span>
        </Summary>
      </Toolbar>
      <div className="module-body padded">
        {rows.length === 0 ? (
          <EmptyState
            icon={Mic}
            title="No ADR lines"
            description="List the lines that need re-recording (noise, performance, new lines) so you can book one efficient session per actor."
            action={
              <div className="row">
                <Button variant="primary" icon={Import} onClick={() => setImportOpen(true)}>
                  Import dialogue line
                </Button>
                <Button icon={Plus} onClick={add}>
                  Add manually
                </Button>
              </div>
            }
          />
        ) : (
          <PostTable
            rows={rows}
            columns={columns}
            minWidth={1150}
            onChange={(id, patch) => adrOps.update(id, patch)}
            onReorder={(id, before) => adrOps.moveBefore(id, before)}
            rowActions={(a) => [
              { label: 'Duplicate', icon: Copy, onClick: () => adrOps.duplicate(a.id, () => uid('adr')) },
              { separator: true },
              { label: 'Delete', icon: Trash2, danger: true, onClick: () => removeItem(a) },
            ]}
          />
        )}
      </div>
      <ImportDialogueModal open={importOpen} onClose={() => setImportOpen(false)} />
    </>
  );
}

function ImportDialogueModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const model = useScriptModel();
  const characters = useProject((p) => p.characters);
  const adr = useProject((p) => p.post.adr);
  const lines = useMemo(() => dialogueLines(model, characters), [model, characters]);
  const scenesWithDialogue = useMemo(() => model.scenes.filter((s) => lines.some((l) => l.sceneId === s.id)), [model, lines]);
  const [sceneId, setSceneId] = useState('');
  const [added, setAdded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setAdded(new Set());
    setSceneId((cur) => (cur && scenesWithDialogue.some((s) => s.id === cur) ? cur : scenesWithDialogue[0]?.id ?? ''));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const existing = useMemo(() => new Set(adr.map((a) => `${a.characterId ?? ''}|${a.line.trim()}`)), [adr]);
  const shown = lines.filter((l) => !sceneId || l.sceneId === sceneId);

  const addLine = (l: DialogueLine) => {
    update((d) => {
      d.post.adr.push({ id: uid('adr'), characterId: l.characterId, sceneId: l.sceneId, line: l.text, status: 'not_started' });
    });
    setAdded((s) => new Set(s).add(l.key));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Import dialogue line"
      headerExtra={
        scenesWithDialogue.length > 0 ? (
          <Select
            size="sm"
            value={sceneId}
            options={[{ value: '', label: 'All scenes' }, ...scenesWithDialogue.map((s) => ({ value: s.id, label: truncate(`${s.number}. ${s.heading}`, 40) }))]}
            onChange={setSceneId}
            style={{ width: 260 }}
          />
        ) : undefined
      }
      footer={
        <>
          <span className="muted small">{added.size ? `${added.size} line${added.size === 1 ? '' : 's'} added` : 'Click a line to add it to the ADR list'}</span>
          <div className="spacer" />
          <Button
            variant="primary"
            onClick={() => {
              if (added.size) toast(`Added ${added.size} ADR line${added.size === 1 ? '' : 's'}`);
              onClose();
            }}
          >
            Done
          </Button>
        </>
      }
    >
      {lines.length === 0 ? (
        <div className="muted">The screenplay has no dialogue yet. Write or import a script in the Script module, or add ADR lines manually.</div>
      ) : (
        <div className="post-dlg">
          {shown.map((l) => {
            const isIn = added.has(l.key) || existing.has(`${l.characterId ?? ''}|${l.text}`);
            return (
              <button key={l.key} type="button" className={`post-dlg-line ${isIn ? 'in' : ''}`} onClick={() => !added.has(l.key) && addLine(l)} disabled={added.has(l.key)}>
                <span className="post-dlg-name">{l.name}</span>
                <span className="post-dlg-text">{l.text}</span>
                <span className="post-dlg-add">{isIn ? 'In list' : <Plus size={14} />}</span>
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
