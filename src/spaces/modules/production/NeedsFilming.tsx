/* "Needs filming": video / audio pieces in writing, planning or shooting that are
   not on a shoot day yet — add them to a session, or start a new one with them. */
import { useMemo, useState } from 'react';
import { CalendarPlus, ChevronDown, Clapperboard, FolderKanban, PartyPopper, Sparkles } from 'lucide-react';
import type { ContentPiece, ShootSession } from '@/spaces/types';
import { FORMAT_BY_ID, STAGES } from '@/spaces/constants';
import { firstPostDate } from '@/spaces/derive';
import { openContent } from '@/spaces/ui';
import { navigateSpace } from '@/store/app';
import { useSpaceFormatters } from '@/store/space';
import { addDays, diffDays, todayISO } from '@/lib/dates';
import { plural } from '@/lib/text';
import { Button, Checkbox, EmptyState, Menu, StatusBadge, type MenuItem } from '@/ui';
import { addPiecesToShoot, createShootWithPieces } from './actions';
import { estimateLabel, scriptEstimate } from './model';
import { undoToast } from './parts';

const STAGE_RANK: Record<string, number> = { production: 0, planning: 1, writing: 2 };

export function NeedsFilming({
  pieces,
  upcoming,
  hasContent,
  onSelect,
}: {
  pieces: ContentPiece[];
  upcoming: ShootSession[];
  hasContent: boolean;
  onSelect: (id: string) => void;
}) {
  const fmt = useSpaceFormatters();
  const today = todayISO();
  const [sel, setSel] = useState<string[]>([]);
  const list = useMemo(
    () =>
      [...pieces].sort(
        (a, b) => (firstPostDate(a) ?? '~').localeCompare(firstPostDate(b) ?? '~') || (STAGE_RANK[a.stage] ?? 9) - (STAGE_RANK[b.stage] ?? 9) || (a.title ?? '').localeCompare(b.title ?? ''),
      ),
    [pieces],
  );
  const selected = sel.filter((id) => pieces.some((p) => p.id === id));
  const allSel = list.length > 0 && selected.length === list.length;

  const addTo = (shoot: ShootSession, ids: string[]) => {
    const n = addPiecesToShoot(shoot.id, ids);
    setSel([]);
    undoToast(`${plural(n, 'piece')} added to ${shoot.title || 'the shoot day'}`);
  };
  const newWith = (ids: string[]) => {
    const id = createShootWithPieces(ids, { title: 'Shoot day', date: addDays(today, 1) });
    setSel([]);
    onSelect(id);
    undoToast(`New shoot day with ${plural(ids.length, 'piece')}`);
  };
  const targets = (ids: string[]): MenuItem[] => [
    ...(upcoming.length ? [{ header: 'Add to shoot day' } as MenuItem] : []),
    ...upcoming.map((s) => ({
      label: `${s.title || 'Shoot day'}${s.date ? ` · ${fmt.dateMedium(s.date)}` : ''}`,
      icon: Clapperboard,
      onClick: () => addTo(s, ids),
    })),
    ...(upcoming.length ? [{ separator: true } as MenuItem] : []),
    { label: 'New shoot day with ' + (ids.length > 1 ? `these ${ids.length}` : 'this piece'), icon: CalendarPlus, onClick: () => newWith(ids) },
  ];

  if (!hasContent) {
    return (
      <div className="sp-production-needs">
        <EmptyState
          icon={FolderKanban}
          title="No content yet"
          description="Plan videos, shorts, trailers and podcast episodes in Content. Pieces that need filming show up here so you can batch them into shoot days."
          action={
            <Button variant="primary" icon={FolderKanban} onClick={() => navigateSpace('content')}>
              Open Content
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="sp-production-needs">
      <div className="sp-production-needs-head">
        <h2>Needs filming</h2>
        <p>Video and audio pieces in Writing, Planning or Shooting that aren’t on a shoot day yet — soonest post date first. Batch several into one day.</p>
      </div>
      {list.length === 0 ? (
        <EmptyState
          icon={PartyPopper}
          title="Everything is on a shoot day"
          description="Every video and audio piece in Writing, Planning or Shooting is planned for filming. New pieces will appear here."
          style={{ padding: '40px 20px' }}
        />
      ) : (
        <>
          <div className="sp-production-needs-bar">
            <Checkbox checked={allSel} onChange={(v) => setSel(v ? list.map((c) => c.id) : [])} label={selected.length ? `${selected.length} selected` : 'Select all'} />
            <span className="spacer" />
            {selected.length > 0 && (
              <>
                <Button size="sm" variant="primary" icon={CalendarPlus} onClick={() => newWith(selected)}>
                  New shoot day with {selected.length > 1 ? `these ${selected.length}` : 'this piece'}
                </Button>
                {upcoming.length > 0 && (
                  <Menu
                    align="end"
                    trigger={
                      <Button size="sm" iconRight={ChevronDown}>
                        Add to shoot day
                      </Button>
                    }
                    items={() => targets(selected)}
                  />
                )}
              </>
            )}
          </div>
          <div className="sp-production-needs-list" role="list">
            {list.map((c) => {
              const FIcon = FORMAT_BY_ID[c.format]?.icon ?? Sparkles;
              const first = firstPostDate(c);
              const days = first ? diffDays(today, first) : null;
              const whenCls = days == null ? 'none' : days < 0 ? 'late' : days <= 7 ? 'soon' : '';
              const est = scriptEstimate(c);
              const on = selected.includes(c.id);
              return (
                <div key={c.id} className={`sp-production-need ${on ? 'selected' : ''}`} role="listitem">
                  <Checkbox checked={on} onChange={(v) => setSel((s) => (v ? [...s, c.id] : s.filter((x) => x !== c.id)))} />
                  <span className="sp-production-ficon" title={FORMAT_BY_ID[c.format]?.label}>
                    <FIcon />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span className="row" style={{ gap: 8, minWidth: 0 }}>
                      <button type="button" className="sp-production-ptitle" onClick={() => openContent(c.id, 'produce')}>
                        {c.title || 'Untitled content'}
                      </button>
                      <StatusBadge value={c.stage} options={STAGES} />
                    </span>
                    {(c.hook || c.concept) && (
                      <span className="small muted ellipsis" style={{ display: 'block', marginTop: 2 }}>
                        {c.hook || c.concept}
                      </span>
                    )}
                  </span>
                  <span className={`when ${whenCls}`} title={first ? fmt.dateLong(first) : undefined}>
                    {first ? (days! < 0 ? `Post was due ${fmt.dateMedium(first)}` : `Posts ${fmt.dateMedium(first)}${days! <= 7 ? (days === 0 ? ' · today' : ` · in ${days}d`) : ''}`) : 'Not scheduled'}
                  </span>
                  <span className="shots">
                    {(c.shots ?? []).length ? plural(c.shots.length, 'shot') : 'No shots'}
                    {est ? ` · ${estimateLabel(est)}` : ''}
                  </span>
                  <Menu
                    align="end"
                    trigger={
                      <Button size="sm" iconRight={ChevronDown}>
                        Add to session
                      </Button>
                    }
                    items={() => targets([c.id])}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
