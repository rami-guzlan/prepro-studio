/* Popover listing production projects that are not linked yet. */
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { FolderPlus } from 'lucide-react';
import type { ProjectSummary } from '@/types';
import { PROJECT_STATUSES, PROJECT_TYPES, optionLabel } from '@/lib/constants';
import { matchesQuery } from '@/lib/text';
import { Popover, SearchInput, type AnchorRect } from '@/ui';
import { Poster } from './Poster';

export function ProjectPicker({ anchor, onClose, projects, loading, onPick }: { anchor: AnchorRect | null; onClose: () => void; projects: ProjectSummary[]; loading: boolean; onPick: (p: ProjectSummary) => void }) {
  const [q, setQ] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => projects.filter((p) => matchesQuery([p.title, p.subtitle, optionLabel(PROJECT_TYPES, p.projectType)].join(' '), q)), [projects, q]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const btns = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    if (!btns.length) return;
    e.preventDefault();
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'ArrowDown' ? (i < 0 ? 0 : Math.min(btns.length - 1, i + 1)) : i <= 0 ? -1 : i - 1;
    if (next < 0) (listRef.current?.parentElement?.querySelector('.search input') as HTMLInputElement | null)?.focus();
    else btns[next].focus();
  };

  return (
    <Popover anchor={anchor} onClose={onClose} align="end">
      <div className="sp-projects-picker" onKeyDown={onKey}>
        <div className="menu-label">Link a production project</div>
        {projects.length > 5 && (
          <div style={{ padding: '2px 6px 6px' }}>
            <SearchInput value={q} onChange={setQ} placeholder="Search projects…" width="100%" autoFocus />
          </div>
        )}
        <div className="sp-projects-picker-list" ref={listRef}>
          {loading ? (
            <div className="sp-projects-picker-empty">Loading projects…</div>
          ) : projects.length === 0 ? (
            <div className="sp-projects-picker-empty">
              <FolderPlus size={18} />
              <span>Every project is already linked, or there are none yet. Create productions from the library (Projects tab).</span>
            </div>
          ) : shown.length === 0 ? (
            <div className="sp-projects-picker-empty">No project matches “{q}”.</div>
          ) : (
            shown.map((p, i) => (
              <button
                key={p.id}
                type="button"
                className="sp-projects-pick"
                autoFocus={i === 0 && projects.length <= 5}
                onClick={() => {
                  onClose();
                  onPick(p);
                }}
              >
                <Poster project={p} width={34} />
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="strong ellipsis" style={{ display: 'block' }}>
                    {p.title || 'Untitled project'}
                  </span>
                  <span className="muted tiny ellipsis" style={{ display: 'block' }}>
                    {optionLabel(PROJECT_TYPES, p.projectType)} · {optionLabel(PROJECT_STATUSES, p.status)}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </Popover>
  );
}
