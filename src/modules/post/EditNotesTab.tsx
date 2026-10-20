/* Edit notes (review feedback per cut version) with filters. */
import { useMemo, useRef, useState } from 'react';
import { Copy, MessageSquareText, Plus, SearchX, Trash2 } from 'lucide-react';
import type { EditNote } from '@/types';
import { uid } from '@/lib/id';
import { matchesQuery, naturalCompare, truncate } from '@/lib/text';
import { useCommand } from '@/lib/commands';
import { getProject, useProject } from '@/store/project';
import { Button, EmptyState, SearchInput, Select, Tabs, Toolbar, confirmDialog, type Column } from '@/ui';
import { PostTable, StatusSelect } from './components';
import { NOTE_STATUSES, noteOps } from './shared';

type StatusFilter = 'all' | EditNote['status'];

async function removeItem(n: EditNote) {
  const ok = await confirmDialog({ title: 'Delete note?', message: n.note ? `“${truncate(n.note, 80)}” will be removed.` : 'This note will be removed.', confirmLabel: 'Delete', danger: true });
  if (ok) noteOps.remove(n.id);
}

export function EditNotesTab() {
  const notes = useProject((p) => p.post.editNotes);
  const crew = useProject((p) => p.crew);
  const meta = useProject((p) => p.meta);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [version, setVersion] = useState('');
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLDivElement>(null);

  useCommand('find', () => {
    searchRef.current?.querySelector('input')?.focus();
    return true;
  });

  const versions = useMemo(() => [...new Set(notes.map((n) => n.version?.trim()).filter((v): v is string => !!v))].sort(naturalCompare), [notes]);
  const authors = useMemo(() => {
    const s = new Set<string>();
    for (const n of [meta.director, meta.producer, meta.client]) if (n) s.add(n);
    for (const c of crew) if (c.status !== 'declined') s.add(c.name);
    for (const n of notes) if (n.author) s.add(n.author);
    return [...s];
  }, [crew, notes, meta.director, meta.producer, meta.client]);

  const rows = useMemo(
    () =>
      notes.filter(
        (n) => (status === 'all' || n.status === status) && (!version || (n.version ?? '').trim() === version) && matchesQuery(`${n.note} ${n.author ?? ''} ${n.tc ?? ''} ${n.version ?? ''}`, query),
      ),
    [notes, status, version, query],
  );

  const add = () => {
    const all = getProject().post.editNotes;
    const v = version || all[all.length - 1]?.version || 'v1';
    noteOps.add({ id: uid('note'), version: v, note: '', status: 'open' });
    if (status !== 'all' && status !== 'open') setStatus('all');
  };

  const count = (s: StatusFilter) => (s === 'all' ? notes.length : notes.filter((n) => n.status === s).length);

  const columns: Column<EditNote>[] = [
    { key: 'version', header: 'Version', type: 'combo', suggestions: versions, width: 140, placeholder: 'v1' },
    { key: 'tc', header: 'TC', type: 'text', width: 116, placeholder: '00:00:00:00', style: { fontFamily: 'var(--font-mono)' } },
    { key: 'note', header: 'Note', type: 'textarea', minWidth: 320, placeholder: 'What should change?' },
    { key: 'author', header: 'Author', type: 'combo', suggestions: authors, width: 160, placeholder: '—' },
    {
      key: 'status',
      header: 'Status',
      width: 128,
      sortValue: (n) => NOTE_STATUSES.findIndex((s) => s.value === n.status),
      render: (n) => <StatusSelect value={n.status} options={NOTE_STATUSES} onChange={(v) => noteOps.update(n.id, { status: v as EditNote['status'] }, false)} />,
    },
  ];

  return (
    <>
      <Toolbar>
        <Button icon={Plus} onClick={add}>
          Add note
        </Button>
        <div className="vdivider" />
        <Tabs<StatusFilter>
          value={status}
          onChange={setStatus}
          tabs={[
            { id: 'all', label: 'All', count: count('all') },
            ...NOTE_STATUSES.map((s) => ({ id: s.value as StatusFilter, label: s.label, count: count(s.value) })),
          ]}
        />
        <Select size="sm" value={version} options={versions} placeholder="All versions" onChange={setVersion} style={{ width: 150 }} aria-label="Filter by version" />
        <div ref={searchRef}>
          <SearchInput value={query} onChange={setQuery} placeholder="Search notes…" width={200} />
        </div>
      </Toolbar>
      <div className="module-body padded">
        {notes.length === 0 ? (
          <EmptyState
            icon={MessageSquareText}
            title="No edit notes yet"
            description="Collect review feedback per cut — with timecode, author and status — and tick notes off as the editor addresses them."
            action={
              <Button variant="primary" icon={Plus} onClick={add}>
                Add first note
              </Button>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No notes match"
            description="Change the filters or search."
            action={
              <Button
                onClick={() => {
                  setStatus('all');
                  setVersion('');
                  setQuery('');
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <PostTable
            rows={rows}
            columns={columns}
            minWidth={900}
            onChange={(id, patch) => noteOps.update(id, patch)}
            onReorder={status === 'all' && !version && !query ? (id, before) => noteOps.moveBefore(id, before) : undefined}
            rowStyle={(n) => (n.status !== 'open' ? { opacity: 0.66 } : undefined)}
            rowActions={(n) => [
              { label: n.status === 'open' ? 'Mark addressed' : 'Reopen', onClick: () => noteOps.update(n.id, { status: n.status === 'open' ? 'addressed' : 'open' }, false) },
              { label: 'Duplicate', icon: Copy, onClick: () => noteOps.duplicate(n.id, () => uid('note')) },
              { separator: true },
              { label: 'Delete', icon: Trash2, danger: true, onClick: () => removeItem(n) },
            ]}
          />
        )}
      </div>
    </>
  );
}
