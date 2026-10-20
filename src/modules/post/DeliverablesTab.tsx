/* Deliverables: spec table + "Add from preset". */
import { ChevronDown, Copy, PackageCheck, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { Deliverable, PostStatus } from '@/types';
import { ASPECT_RATIOS, DELIVERY_PLATFORMS, FRAME_RATES, POST_STATUSES, RESOLUTIONS } from '@/lib/constants';
import { parseISODate, todayISO } from '@/lib/dates';
import { uid } from '@/lib/id';
import { getProject, useFormatters, useProject } from '@/store/project';
import { Button, EmptyState, Menu, Toolbar, confirmDialog, toast, type Column, type MenuItem } from '@/ui';
import { PostTable, StatusSelect, Summary } from './components';
import { AUDIO_SPECS, CAPTION_SPECS, CODECS, CONTAINERS, DELIVERABLE_PRESETS, LOUDNESS_SPECS, deliverableOps } from './shared';

const isISO = (d?: string): d is string => !!d && !!parseISODate(d);

function presetItems(): MenuItem[] {
  const out: MenuItem[] = [];
  let group = '';
  for (const p of DELIVERABLE_PRESETS) {
    if (p.group !== group) {
      if (group) out.push({ separator: true });
      out.push({ header: p.group });
      group = p.group;
    }
    out.push({
      label: p.label,
      onClick: () => {
        const meta = getProject().meta;
        deliverableOps.add({ id: uid('dlv'), status: 'not_started', due: meta.deliveryDate, ...p.make(meta) });
        toast(`Added “${p.label}” deliverable`);
      },
    });
  }
  return out;
}

async function removeItem(d: Deliverable) {
  const ok = await confirmDialog({ title: 'Delete deliverable?', message: `“${d.name || 'Untitled'}” will be removed.`, confirmLabel: 'Delete', danger: true });
  if (ok) deliverableOps.remove(d.id);
}

export function DeliverablesTab() {
  const rows = useProject((p) => p.post.deliverables);
  const fmt = useFormatters();
  const today = todayISO();
  const add = () => deliverableOps.add({ id: uid('dlv'), name: 'New deliverable', status: 'not_started', due: getProject().meta.deliveryDate });

  const columns: Column<Deliverable>[] = [
    { key: 'name', header: 'Deliverable', type: 'text', width: 200, placeholder: 'Name' },
    { key: 'platform', header: 'Platform', type: 'combo', suggestions: DELIVERY_PLATFORMS.map((o) => o.value), width: 140, placeholder: '—' },
    { key: 'resolution', header: 'Resolution', type: 'combo', suggestions: RESOLUTIONS.map((o) => o.value), width: 112, placeholder: '—' },
    { key: 'aspectRatio', header: 'Aspect', type: 'combo', suggestions: ASPECT_RATIOS.map((o) => o.value), width: 76, placeholder: '—' },
    { key: 'frameRate', header: 'FPS', type: 'combo', suggestions: FRAME_RATES.map((o) => o.value), width: 72, placeholder: '—' },
    { key: 'codec', header: 'Codec', type: 'combo', suggestions: CODECS, width: 168, placeholder: '—' },
    { key: 'container', header: 'Container', type: 'combo', suggestions: CONTAINERS, width: 86, placeholder: '—' },
    { key: 'audio', header: 'Audio', type: 'combo', suggestions: AUDIO_SPECS, width: 170, placeholder: '—' },
    { key: 'loudness', header: 'Loudness', type: 'combo', suggestions: LOUDNESS_SPECS, width: 150, placeholder: '—' },
    { key: 'captions', header: 'Captions', type: 'combo', suggestions: CAPTION_SPECS, width: 140, placeholder: '—' },
    { key: 'duration', header: 'Duration', type: 'text', width: 84, placeholder: '0:00' },
    { key: 'due', header: 'Due', type: 'date', width: 132 },
    {
      key: 'status',
      header: 'Status',
      width: 128,
      sortValue: (d) => POST_STATUSES.findIndex((s) => s.value === d.status),
      render: (d) => <StatusSelect value={d.status} options={POST_STATUSES} onChange={(v) => deliverableOps.update(d.id, { status: v as PostStatus }, false)} />,
    },
    { key: 'notes', header: 'Notes', type: 'text', width: 260, placeholder: 'Notes' },
  ];

  const done = rows.filter((d) => d.status === 'done').length;
  const next = rows.filter((d) => d.status !== 'done' && isISO(d.due)).sort((a, b) => a.due!.localeCompare(b.due!))[0];
  const overdue = rows.filter((d) => d.status !== 'done' && isISO(d.due) && d.due < today).length;

  return (
    <>
      <Toolbar>
        <Button icon={Plus} onClick={add}>
          Add deliverable
        </Button>
        <Menu trigger={<Button icon={Sparkles} iconRight={ChevronDown}>Add from preset</Button>} items={presetItems} />
        <div className="spacer" />
        <Summary>
          <span>
            <b>{done}</b>/{rows.length} delivered
          </span>
          {next && (
            <span>
              Next due <b>{fmt.dateMedium(next.due)}</b> · {next.name}
            </span>
          )}
          {overdue > 0 && <span className="post-warn">{overdue} overdue</span>}
        </Summary>
      </Toolbar>
      <div className="module-body padded">
        {rows.length === 0 ? (
          <EmptyState
            icon={PackageCheck}
            title="No deliverables yet"
            description="List every file the project has to produce — masters, social cut-downs, captions, thumbnails — with exact specs so nothing is missed at the end."
            action={
              <div className="row">
                <Menu trigger={<Button variant="primary" icon={Sparkles} iconRight={ChevronDown}>Add from preset</Button>} items={presetItems} />
                <Button icon={Plus} onClick={add}>
                  Blank deliverable
                </Button>
              </div>
            }
          />
        ) : (
          <PostTable
            rows={rows}
            columns={columns}
            minWidth={2050}
            onChange={(id, patch) => deliverableOps.update(id, patch, !('due' in patch))}
            onReorder={(id, before) => deliverableOps.moveBefore(id, before)}
            rowStyle={(d) => (d.status === 'done' ? { opacity: 0.7 } : undefined)}
            rowActions={(d) => [
              { label: 'Duplicate', icon: Copy, onClick: () => deliverableOps.duplicate(d.id, () => uid('dlv')) },
              { separator: true },
              { label: 'Delete', icon: Trash2, danger: true, onClick: () => removeItem(d) },
            ]}
          />
        )}
      </div>
    </>
  );
}
