/* Graphics & titles list (lower thirds, title/end cards, callouts …). */
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Copy, Plus, Trash2, Type, UserSquare } from 'lucide-react';
import type { GraphicItem, PostStatus } from '@/types';
import { POST_STATUSES } from '@/lib/constants';
import { uid } from '@/lib/id';
import { titleCase } from '@/lib/text';
import { charactersForCast } from '@/derived/project';
import { update, useProject } from '@/store/project';
import { Button, Checkbox, EmptyState, Menu, Modal, Toolbar, confirmDialog, toast, type Column } from '@/ui';
import { PostTable, SceneSelect, StatusSelect, Summary } from './components';
import { GRAPHIC_KINDS, graphicOps } from './shared';

async function removeItem(g: GraphicItem) {
  const ok = await confirmDialog({ title: 'Delete graphic?', message: `“${g.text || g.kind}” will be removed.`, confirmLabel: 'Delete', danger: true });
  if (ok) graphicOps.remove(g.id);
}

export function GraphicsTab() {
  const rows = useProject((p) => p.post.graphics);
  const [ltOpen, setLtOpen] = useState(false);
  const add = (kind = 'Lower third') => graphicOps.add({ id: uid('gfx'), kind, text: '', status: 'not_started' });

  const columns: Column<GraphicItem>[] = [
    { key: 'n', header: '#', width: 40, align: 'right', render: (g) => <span className="muted">{rows.indexOf(g) + 1}</span>, sortable: false },
    { key: 'kind', header: 'Kind', type: 'select', options: GRAPHIC_KINDS, width: 130 },
    { key: 'text', header: 'Text', type: 'textarea', minWidth: 200, placeholder: 'On-screen text', style: { fontWeight: 600 } },
    { key: 'subtext', header: 'Subtext', type: 'textarea', minWidth: 160, placeholder: 'Second line / title' },
    {
      key: 'sceneId',
      header: 'Scene',
      width: 190,
      sortValue: (g) => g.sceneId ?? '',
      render: (g) => <SceneSelect value={g.sceneId} onChange={(v) => graphicOps.update(g.id, { sceneId: v }, false)} />,
    },
    { key: 'tcIn', header: 'TC in', type: 'text', width: 112, placeholder: '00:00:00:00', style: { fontFamily: 'var(--font-mono)' } },
    { key: 'duration', header: 'Dur.', type: 'text', width: 70, placeholder: '0:05' },
    {
      key: 'status',
      header: 'Status',
      width: 128,
      sortValue: (g) => POST_STATUSES.findIndex((s) => s.value === g.status),
      render: (g) => <StatusSelect value={g.status} options={POST_STATUSES} onChange={(v) => graphicOps.update(g.id, { status: v as PostStatus }, false)} />,
    },
    { key: 'notes', header: 'Notes', type: 'text', minWidth: 160, placeholder: 'Notes' },
  ];

  const kinds = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of rows) m.set(g.kind || 'Other', (m.get(g.kind || 'Other') ?? 0) + 1);
    return [...m.entries()];
  }, [rows]);
  const done = rows.filter((g) => g.status === 'done' || g.status === 'approved').length;

  return (
    <>
      <Toolbar>
        <Button icon={Plus} onClick={() => add()}>
          Add graphic
        </Button>
        <Menu trigger={<Button iconRight={ChevronDown}>Add…</Button>} items={GRAPHIC_KINDS.map((k) => ({ label: k, icon: Type, onClick: () => add(k) }))} />
        <Button icon={UserSquare} onClick={() => setLtOpen(true)}>
          Lower thirds for cast &amp; crew
        </Button>
        <div className="spacer" />
        <Summary>
          {kinds.map(([k, n]) => (
            <span key={k}>
              <b>{n}</b> {k.toLowerCase()}
              {n === 1 || /s$/.test(k) ? '' : 's'}
            </span>
          ))}
          {rows.length > 0 && (
            <span>
              <b>{done}</b>/{rows.length} approved
            </span>
          )}
        </Summary>
      </Toolbar>
      <div className="module-body padded">
        {rows.length === 0 ? (
          <EmptyState
            icon={Type}
            title="No graphics yet"
            description="Track every lower third, title card, callout, chart and disclaimer with its exact wording, so the editor and motion designer work from one approved list."
            action={
              <div className="row">
                <Button variant="primary" icon={UserSquare} onClick={() => setLtOpen(true)}>
                  Lower thirds for cast &amp; crew
                </Button>
                <Button icon={Plus} onClick={() => add('Title card')}>
                  Add title card
                </Button>
              </div>
            }
          />
        ) : (
          <PostTable
            rows={rows}
            columns={columns}
            minWidth={1180}
            onChange={(id, patch) => graphicOps.update(id, patch, !('kind' in patch))}
            onReorder={(id, before) => graphicOps.moveBefore(id, before)}
            rowActions={(g) => [
              { label: 'Duplicate', icon: Copy, onClick: () => graphicOps.duplicate(g.id, () => uid('gfx')) },
              { separator: true },
              { label: 'Delete', icon: Trash2, danger: true, onClick: () => removeItem(g) },
            ]}
          />
        )}
      </div>
      <LowerThirdsModal open={ltOpen} onClose={() => setLtOpen(false)} />
    </>
  );
}

/* ---------------------------------------------------------------- lower thirds helper */

interface Person {
  key: string;
  name: string;
  role: string;
  group: 'Cast' | 'Crew';
}

function LowerThirdsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const cast = useProject((p) => p.cast);
  const crew = useProject((p) => p.crew);
  const characters = useProject((p) => p.characters);
  const graphics = useProject((p) => p.post.graphics);

  const people = useMemo<Person[]>(() => {
    const out: Person[] = [];
    for (const c of cast) {
      if (c.status === 'declined') continue;
      const roles = charactersForCast({ characters }, c.id).map((ch) => titleCase(ch.name));
      out.push({ key: c.id, name: c.name, role: roles.length ? roles.join(' / ') : 'Cast', group: 'Cast' });
    }
    for (const c of crew) {
      if (c.status === 'declined') continue;
      out.push({ key: c.id, name: c.name, role: c.position || c.department, group: 'Crew' });
    }
    return out;
  }, [cast, crew, characters]);

  const existing = useMemo(() => new Set(graphics.filter((g) => /lower/i.test(g.kind)).map((g) => g.text.trim().toLowerCase())), [graphics]);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setPicked(new Set(people.filter((p) => p.group === 'Cast' && !existing.has(p.name.trim().toLowerCase())).map((p) => p.key)));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (k: string, v: boolean) =>
    setPicked((s) => {
      const n = new Set(s);
      if (v) n.add(k);
      else n.delete(k);
      return n;
    });
  const setGroup = (g: Person['group'], v: boolean) =>
    setPicked((s) => {
      const n = new Set(s);
      for (const p of people) if (p.group === g) (v ? n.add(p.key) : n.delete(p.key));
      return n;
    });

  const apply = () => {
    const list = people.filter((p) => picked.has(p.key));
    if (!list.length) return;
    update((d) => {
      for (const p of list) d.post.graphics.push({ id: uid('gfx'), kind: 'Lower third', text: p.name, subtext: p.role, status: 'not_started' });
    });
    toast(`Added ${list.length} lower third${list.length === 1 ? '' : 's'}`);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Lower thirds for cast & crew"
      size="md"
      footer={
        <>
          <span className="muted small">{picked.size} selected</span>
          <div className="spacer" />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={apply} disabled={picked.size === 0}>
            Add {picked.size || ''} lower third{picked.size === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      {people.length === 0 ? (
        <div className="muted">Add cast or crew first — each person becomes a lower third with their name and role.</div>
      ) : (
        <div className="post-lt">
          {(['Cast', 'Crew'] as const).map((g) => {
            const list = people.filter((p) => p.group === g);
            if (!list.length) return null;
            const all = list.every((p) => picked.has(p.key));
            return (
              <div key={g} className="post-lt-group">
                <div className="post-lt-head">
                  <Checkbox checked={all} onChange={(v) => setGroup(g, v)} label={<b>{g}</b>} />
                  <span className="muted small">{list.length}</span>
                </div>
                {list.map((p) => {
                  const dup = existing.has(p.name.trim().toLowerCase());
                  return (
                    <label key={p.key} className="post-lt-row">
                      <input type="checkbox" checked={picked.has(p.key)} onChange={(e) => toggle(p.key, e.target.checked)} />
                      <span className="post-lt-card">
                        <b>{p.name}</b>
                        <small>{p.role}</small>
                      </span>
                      {dup && <span className="badge">already added</span>}
                    </label>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
