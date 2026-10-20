/* VFX shot list. */
import { useMemo } from 'react';
import { Copy, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { PostStatus, VfxShot } from '@/types';
import { POST_STATUSES, optionColor } from '@/lib/constants';
import { uid } from '@/lib/id';
import { getProject, update, useFormatters, useProject } from '@/store/project';
import { Button, EmptyState, Select, Toolbar, confirmDialog, type Column } from '@/ui';
import { PostTable, SceneSelect, ShotSelect, StatusSelect, Summary } from './components';
import { VFX_COMPLEXITY, nextVfxCode, vfxOps } from './shared';

async function removeItem(v: VfxShot) {
  const ok = await confirmDialog({ title: 'Delete VFX shot?', message: `${v.code} will be removed.`, confirmLabel: 'Delete', danger: true });
  if (ok) vfxOps.remove(v.id);
}

export function VfxTab() {
  const rows = useProject((p) => p.post.vfx);
  const contacts = useProject((p) => p.contacts);
  const crew = useProject((p) => p.crew);
  const shots = useProject((p) => p.shots);
  const fmt = useFormatters();

  const vendors = useMemo(() => {
    const s = new Set<string>(['In-house']);
    for (const c of contacts) if (c.category === 'post' || c.category === 'vendor') s.add(c.company || c.name);
    for (const c of crew) if (c.department === 'VFX' || c.department === 'Post-production') s.add(c.name);
    for (const v of rows) if (v.vendor) s.add(v.vendor);
    return [...s];
  }, [contacts, crew, rows]);

  const add = () => vfxOps.add({ id: uid('vfx'), code: nextVfxCode(getProject().post.vfx), description: '', status: 'not_started', complexity: 'medium' });

  const total = rows.reduce((a, v) => a + (v.cost ?? 0), 0);
  const flagged = shots.filter((s) => s.vfx && !rows.some((v) => v.shotId === s.id));

  const columns: Column<VfxShot>[] = [
    { key: 'code', header: 'Code', type: 'text', width: 96, style: { fontFamily: 'var(--font-mono)', fontWeight: 650 }, footer: <span className="muted">{rows.length}</span> },
    {
      key: 'sceneId',
      header: 'Scene',
      width: 190,
      sortValue: (v) => v.sceneId ?? '',
      render: (v) => (
        <SceneSelect
          value={v.sceneId}
          onChange={(sid) => {
            const sh = v.shotId ? getProject().shots.find((s) => s.id === v.shotId) : undefined;
            vfxOps.update(v.id, { sceneId: sid, shotId: sh && sh.sceneId !== sid ? undefined : v.shotId }, false);
          }}
        />
      ),
    },
    {
      key: 'shotId',
      header: 'Shot',
      width: 130,
      sortable: false,
      render: (v) => <ShotSelect value={v.shotId} sceneId={v.sceneId} onChange={(shotId, sceneId) => vfxOps.update(v.id, { shotId, sceneId: v.sceneId ?? sceneId }, false)} />,
    },
    { key: 'description', header: 'Description', type: 'textarea', minWidth: 240, placeholder: 'What has to be done' },
    { key: 'vendor', header: 'Vendor', type: 'combo', suggestions: vendors, width: 150, placeholder: '—' },
    {
      key: 'complexity',
      header: 'Complexity',
      width: 112,
      sortValue: (v) => VFX_COMPLEXITY.findIndex((c) => c.value === v.complexity),
      render: (v) => (
        <Select
          bare
          size="sm"
          value={v.complexity ?? ''}
          options={VFX_COMPLEXITY}
          placeholder="—"
          onChange={(c) => vfxOps.update(v.id, { complexity: (c || undefined) as VfxShot['complexity'] }, false)}
          style={{ color: optionColor(VFX_COMPLEXITY, v.complexity), fontWeight: 600 }}
        />
      ),
    },
    { key: 'due', header: 'Due', type: 'date', width: 132 },
    { key: 'cost', header: 'Cost', type: 'money', width: 104, footer: fmt.money(total, { cents: false }) },
    {
      key: 'status',
      header: 'Status',
      width: 128,
      sortValue: (v) => POST_STATUSES.findIndex((s) => s.value === v.status),
      render: (v) => <StatusSelect value={v.status} options={POST_STATUSES} onChange={(s) => vfxOps.update(v.id, { status: s as PostStatus }, false)} />,
    },
    { key: 'notes', header: 'Notes', type: 'text', minWidth: 150, placeholder: 'Notes' },
  ];

  const addFlagged = () => {
    update((d) => {
      for (const s of flagged) {
        d.post.vfx.push({
          id: uid('vfx'),
          code: nextVfxCode(d.post.vfx as VfxShot[]),
          sceneId: s.sceneId,
          shotId: s.id,
          description: s.description || s.title || '',
          status: 'not_started',
          complexity: 'medium',
        });
      }
    });
  };

  const duplicate = (v: VfxShot) =>
    update((d) => {
      const a = d.post.vfx;
      const i = a.findIndex((x) => x.id === v.id);
      if (i < 0) return;
      a.splice(i + 1, 0, { ...(JSON.parse(JSON.stringify(a[i])) as VfxShot), id: uid('vfx'), code: nextVfxCode(a as VfxShot[]) });
    });

  return (
    <>
      <Toolbar>
        <Button icon={Plus} onClick={add}>
          Add VFX shot
        </Button>
        {flagged.length > 0 && (
          <Button icon={Sparkles} onClick={addFlagged} title="Shots marked as VFX in the shot list">
            Add {flagged.length} VFX shot{flagged.length === 1 ? '' : 's'} from shot list
          </Button>
        )}
        <div className="spacer" />
        <Summary>
          <span>
            <b>{rows.length}</b> shot{rows.length === 1 ? '' : 's'}
          </span>
          {VFX_COMPLEXITY.map((c) => {
            const n = rows.filter((v) => v.complexity === c.value).length;
            return n ? (
              <span key={c.value}>
                <b>{n}</b> {c.label.toLowerCase()}
              </span>
            ) : null;
          })}
          <span>
            Total <b>{fmt.money(total, { cents: false })}</b>
          </span>
        </Summary>
      </Toolbar>
      <div className="module-body padded">
        {rows.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="No VFX shots"
            description="Track every visual effect — clean-ups, sky replacements, screen comps, titles in 3D — with a code, vendor, cost and due date."
            action={
              <div className="row">
                <Button variant="primary" icon={Plus} onClick={add}>
                  Add VFX shot
                </Button>
                {flagged.length > 0 && <Button onClick={addFlagged}>Add {flagged.length} from shot list</Button>}
              </div>
            }
          />
        ) : (
          <PostTable
            rows={rows}
            columns={columns}
            minWidth={1500}
            showFooter
            onChange={(id, patch) => vfxOps.update(id, patch, !('due' in patch))}
            onReorder={(id, before) => vfxOps.moveBefore(id, before)}
            rowActions={(v) => [
              { label: 'Duplicate', icon: Copy, onClick: () => duplicate(v) },
              { separator: true },
              { label: 'Delete', icon: Trash2, danger: true, onClick: () => removeItem(v) },
            ]}
          />
        )}
      </div>
    </>
  );
}
