/* Picker: add video / audio pieces (idea … shooting, not on another shoot day) to a session. */
import { useMemo, useState } from 'react';
import { FolderKanban, Plus, Sparkles } from 'lucide-react';
import type { ContentFormat, ContentPiece } from '@/spaces/types';
import { FORMATS, FORMAT_BY_ID, STAGES } from '@/spaces/constants';
import { firstPostDate } from '@/spaces/derive';
import { navigateSpace } from '@/store/app';
import { useSpaceFormatters } from '@/store/space';
import { matchesQuery, plural } from '@/lib/text';
import { Button, Checkbox, EmptyState, Input, Modal, SearchInput, Select, StatusBadge } from '@/ui';
import { addPiecesToShoot, createPieceForShoot } from './actions';
import { FILMABLE_STAGES } from './model';
import { undoToast } from './parts';

export const FILMABLE_FORMATS = FORMATS.filter((f) => f.video || f.audio).map((f) => ({ value: f.value, label: f.label }));

export function AddContentModal({ open, onClose, shootId, shootTitle, candidates }: { open: boolean; onClose: () => void; shootId: string; shootTitle: string; candidates: ContentPiece[] }) {
  const fmt = useSpaceFormatters();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [format, setFormat] = useState<ContentFormat>('short_video');
  const list = useMemo(() => {
    const rank = (c: ContentPiece) => FILMABLE_STAGES.length - FILMABLE_STAGES.indexOf(c.stage);
    return candidates
      .filter((c) => matchesQuery(`${c.title} ${c.hook ?? ''} ${c.concept ?? ''}`, q))
      .sort((a, b) => (firstPostDate(a) ?? '~').localeCompare(firstPostDate(b) ?? '~') || rank(a) - rank(b) || (a.title ?? '').localeCompare(b.title ?? ''));
  }, [candidates, q]);
  const allSel = list.length > 0 && list.every((c) => sel.includes(c.id));

  const close = () => {
    setSel([]);
    setQ('');
    setTitle('');
    onClose();
  };
  const add = () => {
    if (!sel.length) return;
    const n = addPiecesToShoot(shootId, sel);
    close();
    undoToast(`${plural(n, 'piece')} added to ${shootTitle || 'the shoot day'}`);
  };
  const create = () => {
    const t = title.trim();
    if (!t) return;
    createPieceForShoot(shootId, t, format);
    setTitle('');
    undoToast(`“${t}” created and added`);
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title="Add content to film"
      footer={
        <>
          <span className="muted small" style={{ marginRight: 'auto' }}>
            {sel.length ? `${plural(sel.length, 'piece')} selected` : 'Video & audio pieces from Idea to Shooting that are not on another shoot day'}
          </span>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" icon={Plus} disabled={!sel.length} onClick={add}>
            {sel.length > 1 ? `Add ${sel.length} pieces` : 'Add piece'}
          </Button>
        </>
      }
    >
      <div className="col" style={{ gap: 12 }}>
        {candidates.length > 0 && (
          <div className="row" style={{ gap: 10 }}>
            <SearchInput value={q} onChange={setQ} placeholder="Search pieces…" width="100%" autoFocus />
            <Checkbox checked={allSel} onChange={(v) => setSel(v ? [...new Set([...sel, ...list.map((c) => c.id)])] : sel.filter((id) => !list.some((c) => c.id === id)))} label="All" />
          </div>
        )}
        {candidates.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="Nothing waiting to be filmed"
            description="Pieces show up here when they are video or audio, between Idea and Shooting, and not planned on another shoot day. Create one below or plan more in Content."
            action={
              <Button
                icon={FolderKanban}
                onClick={() => {
                  close();
                  navigateSpace('content');
                }}
              >
                Open Content
              </Button>
            }
            style={{ padding: '18px 10px' }}
          />
        ) : (
          <div className="sp-production-needs-list" style={{ maxHeight: 380, overflow: 'auto' }} role="listbox" aria-multiselectable aria-label="Pieces">
            {list.map((c) => {
              const FIcon = FORMAT_BY_ID[c.format]?.icon ?? Sparkles;
              const on = sel.includes(c.id);
              const first = firstPostDate(c);
              return (
                <label key={c.id} className={`sp-production-need ${on ? 'selected' : ''}`} style={{ cursor: 'pointer', gridTemplateColumns: '26px 30px minmax(0,1fr) 130px 120px' }}>
                  <input type="checkbox" checked={on} onChange={(e) => setSel((s) => (e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)))} />
                  <span className="sp-production-ficon">
                    <FIcon />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span className="strong ellipsis" style={{ display: 'block' }}>
                      {c.title || 'Untitled content'}
                    </span>
                    {c.hook && (
                      <span className="small muted ellipsis" style={{ display: 'block' }}>
                        {c.hook}
                      </span>
                    )}
                  </span>
                  <span className={`when ${first ? '' : 'none'}`}>{first ? `Posts ${fmt.dateMedium(first)}` : 'Not scheduled'}</span>
                  <StatusBadge value={c.stage} options={STAGES} />
                </label>
              );
            })}
            {list.length === 0 && <div className="sp-production-list-empty">No piece matches “{q}”.</div>}
          </div>
        )}
        <div>
          <div className="section-title">Or create a new piece for this shoot day</div>
          <div className="sp-production-quickadd" style={{ marginTop: 0 }}>
            <Input
              value={title}
              onChange={setTitle}
              placeholder="Title, e.g. Gear tour in 60 seconds"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  create();
                }
              }}
            />
            <Select value={format} onChange={(v) => setFormat(v as ContentFormat)} options={FILMABLE_FORMATS} />
            <Button icon={Plus} disabled={!title.trim()} onClick={create}>
              Create
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
