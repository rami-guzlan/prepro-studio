/* Music cue sheet. Duration is calculated from TC in/out when both are set. */
import { Copy, Music2, Plus, Trash2 } from 'lucide-react';
import type { MusicCue, PostStatus } from '@/types';
import { POST_STATUSES } from '@/lib/constants';
import { uid } from '@/lib/id';
import { getProject, useProject } from '@/store/project';
import { Button, EmptyState, Input, Toolbar, confirmDialog, type Column } from '@/ui';
import { PostTable, StatusSelect, Summary } from './components';
import { MUSIC_SOURCES, MUSIC_USAGES, cueSeconds, fmtDur, musicOps, nominalFps, tcSpan } from './shared';

async function removeItem(c: MusicCue) {
  const ok = await confirmDialog({ title: 'Delete music cue?', message: `“${c.cue} ${c.title || ''}” will be removed.`, confirmLabel: 'Delete', danger: true });
  if (ok) musicOps.remove(c.id);
}

/** Next cue number following the '1M1, 1M2 …' convention. */
function nextCueNumber(list: MusicCue[]): string {
  let reel = 1;
  let max = 0;
  for (const c of list) {
    const m = /^(\d+)\s*M\s*(\d+)$/i.exec(c.cue?.trim() ?? '');
    if (m) {
      const r = parseInt(m[1], 10);
      const n = parseInt(m[2], 10);
      if (r > reel || (r === reel && n > max)) {
        reel = r;
        max = n;
      }
    }
  }
  return `${reel}M${max + 1}`;
}

const USAGE_SHORT = MUSIC_USAGES.map((u) => ({ value: u.value, label: u.value }));

export function MusicTab() {
  const rows = useProject((p) => p.post.music);
  const frameRate = useProject((p) => p.meta.frameRate);
  const fps = nominalFps(frameRate);

  const add = () => musicOps.add({ id: uid('cue'), cue: nextCueNumber(getProject().post.music), title: '', status: 'not_started', source: 'original', usage: 'BI' });

  const tcSet = (key: 'tcIn' | 'tcOut') => (value: string, row: MusicCue): Partial<MusicCue> => {
    const patch: Partial<MusicCue> = { [key]: value || undefined };
    const span = tcSpan(key === 'tcIn' ? value : row.tcIn, key === 'tcOut' ? value : row.tcOut, fps);
    if (span != null) patch.duration = fmtDur(span);
    return patch;
  };

  const total = rows.reduce((a, c) => a + (cueSeconds(c, fps) ?? 0), 0);
  const missing = rows.filter((c) => cueSeconds(c, fps) == null).length;

  const columns: Column<MusicCue>[] = [
    { key: 'cue', header: 'Cue', type: 'text', width: 70, placeholder: '1M1', style: { fontWeight: 650 } },
    { key: 'title', header: 'Title', type: 'text', minWidth: 170, placeholder: 'Track title', footer: <span className="muted">{rows.length} cue{rows.length === 1 ? '' : 's'}</span> },
    { key: 'composer', header: 'Composer', type: 'text', width: 150, placeholder: '—' },
    { key: 'publisher', header: 'Publisher', type: 'text', width: 150, placeholder: '—' },
    { key: 'source', header: 'Source', type: 'select', options: MUSIC_SOURCES, width: 150 },
    { key: 'tcIn', header: 'TC in', type: 'text', width: 116, placeholder: '01:00:00:00', set: tcSet('tcIn'), style: { fontFamily: 'var(--font-mono)' } },
    { key: 'tcOut', header: 'TC out', type: 'text', width: 116, placeholder: '01:00:30:00', set: tcSet('tcOut'), style: { fontFamily: 'var(--font-mono)' } },
    {
      key: 'duration',
      header: 'Duration',
      width: 86,
      align: 'right',
      sortValue: (c) => cueSeconds(c, fps) ?? -1,
      footer: <span title="Total music duration">{fmtDur(total) || '0:00'}</span>,
      render: (c) => {
        const span = tcSpan(c.tcIn, c.tcOut, fps);
        if (span != null)
          return (
            <span className="post-calc" title="Calculated from TC in / TC out">
              {fmtDur(span)}
            </span>
          );
        return <Input bare size="sm" value={c.duration} placeholder="0:30" onChange={(v) => musicOps.update(c.id, { duration: v || undefined })} style={{ textAlign: 'right' }} />;
      },
    },
    { key: 'usage', header: 'Usage', type: 'select', options: USAGE_SHORT, width: 70 },
    { key: 'license', header: 'License', type: 'text', width: 150, placeholder: 'Status / ID' },
    {
      key: 'status',
      header: 'Status',
      width: 128,
      sortValue: (c) => POST_STATUSES.findIndex((s) => s.value === c.status),
      render: (c) => <StatusSelect value={c.status} options={POST_STATUSES} onChange={(v) => musicOps.update(c.id, { status: v as PostStatus }, false)} />,
    },
    { key: 'notes', header: 'Notes', type: 'text', minWidth: 160, placeholder: 'Notes' },
  ];

  return (
    <>
      <Toolbar>
        <Button icon={Plus} onClick={add}>
          Add cue
        </Button>
        <div className="spacer" />
        <Summary>
          <span>
            <b>{rows.length}</b> cue{rows.length === 1 ? '' : 's'}
          </span>
          <span>
            Total music <b>{fmtDur(total) || '0:00'}</b>
          </span>
          {missing > 0 && rows.length > 0 && <span className="muted">{missing} without timing</span>}
          <span className="muted">{fps} fps timecode</span>
        </Summary>
      </Toolbar>
      <div className="module-body padded">
        {rows.length === 0 ? (
          <EmptyState
            icon={Music2}
            title="No music cues yet"
            description="Log every piece of music with its timecode, composer, publisher and license. The cue sheet is required by broadcasters, festivals and performing-rights societies."
            action={
              <Button variant="primary" icon={Plus} onClick={add}>
                Add first cue
              </Button>
            }
          />
        ) : (
          <>
            <PostTable
              rows={rows}
              columns={columns}
              minWidth={1500}
              showFooter
              onChange={(id, patch) => musicOps.update(id, patch, !('source' in patch) && !('usage' in patch))}
              onReorder={(id, before) => musicOps.moveBefore(id, before)}
              rowActions={(c) => [
                { label: 'Duplicate', icon: Copy, onClick: () => musicOps.duplicate(c.id, () => uid('cue')) },
                { separator: true },
                { label: 'Delete', icon: Trash2, danger: true, onClick: () => removeItem(c) },
              ]}
            />
            <div className="post-legend">
              {MUSIC_USAGES.map((u) => (
                <span key={u.value}>
                  <b>{u.value}</b> {u.label.replace(/^\w+ – /, '').toLowerCase()}
                </span>
              ))}
              <span className="muted">· Timecode as HH:MM:SS:FF or MM:SS</span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
