/* Marketing Space — Production: batch shoot planning.
   Left: shoot sessions (upcoming first, past collapsed) + "Needs filming".
   Right: the selected session (logistics, run of show, combined shot list). */
import './production.css';
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { CalendarPlus, ChevronDown, ChevronRight, CircleCheck, Clapperboard, Inbox, Plus } from 'lucide-react';
import type { ShootSession } from '@/spaces/types';
import { getSpace, useSpace, useSpaceFormatters } from '@/store/space';
import { openPrint, readLS, useApp, writeLS } from '@/store/app';
import { exportCsv, isDesktop } from '@/backend';
import { addDays, todayISO } from '@/lib/dates';
import { formatSeconds } from '@/lib/format';
import { plural, safeFileName } from '@/lib/text';
import { useCommand } from '@/lib/commands';
import { Button, ExportMenu, IconButton, ModuleHeader, Progress, confirmDialog, toast } from '@/ui';
import { createShootSession, deleteShoot } from './actions';
import { addablePieces, indexSessions, isSessionFilmed, needsFilming, shotKindLabel, shotStats, splitSessions } from './model';
import { NeedsFilming } from './NeedsFilming';
import { DateBadge, shootPrintValue, undoToast } from './parts';
import { SessionDetail } from './SessionDetail';

const NEEDS = 'needs';

async function exportShotList(shootId: string) {
  const s = getSpace();
  const sh = s.shoots.find((x) => x.id === shootId);
  if (!sh) return;
  const pieces = indexSessions(s).pieces.get(shootId) ?? [];
  const rows = pieces.flatMap((c, pi) => (c.shots ?? []).map((shot, i) => ({ c, pi, shot, i })));
  try {
    const path = await exportCsv(safeFileName(`${s.meta.title} - ${sh.title || 'Shoot day'} shot list`), rows, [
      { header: 'Order', value: (r) => r.pi + 1 },
      { header: 'Content', value: (r) => r.c.title },
      { header: 'Shot #', value: (r) => r.i + 1 },
      { header: 'Description', value: (r) => r.shot.description },
      { header: 'Kind', value: (r) => shotKindLabel(r.shot.kind) },
      { header: 'Framing', value: (r) => r.shot.framing },
      { header: 'Duration', value: (r) => (r.shot.duration != null ? formatSeconds(r.shot.duration) : '') },
      { header: 'Location', value: (r) => r.shot.location || r.c.location || sh.location },
      { header: 'Done', value: (r) => !!r.shot.done },
      { header: 'Notes', value: (r) => r.shot.notes },
    ]);
    if (path) toast(`Saved ${path}`);
    else if (!isDesktop) toast('CSV downloaded');
  } catch (e) {
    toast(`Export failed: ${(e as Error).message}`, 'error');
  }
}

function SessionItem({ sh, active, past, pieces, onSelect }: { sh: ShootSession; active: boolean; past?: boolean; pieces: ReturnType<typeof indexSessions>['pieces']; onSelect: (id: string) => void }) {
  const list = pieces.get(sh.id) ?? [];
  const stats = shotStats(list);
  const filmed = isSessionFilmed(list);
  const fmt = useSpaceFormatters();
  return (
    <button
      type="button"
      id={`sp-production-item-${sh.id}`}
      role="option"
      aria-selected={active}
      className={`list-item sp-production-item ${active ? 'active' : ''} ${past ? 'past' : ''}`}
      onClick={() => onSelect(sh.id)}
    >
      <DateBadge date={sh.date} />
      <div className="grow">
        <div className="strong ellipsis">{sh.title || 'Shoot day'}</div>
        <div className="meta ellipsis">
          {[sh.callTime && `Call ${fmt.time(sh.callTime)}`, sh.location].filter(Boolean).join(' · ') || (sh.date ? fmt.dateMedium(sh.date) : 'No date yet')}
        </div>
        <div className="sp-production-mini">
          {filmed ? (
            <span className="sp-production-filmed">
              <CircleCheck /> Filmed
            </span>
          ) : (
            <>
              <span>{plural(list.length, 'piece')}</span>
              {stats.total > 0 && (
                <>
                  <Progress value={stats.done / stats.total} color={stats.done === stats.total ? 'var(--success)' : undefined} />
                  <span>
                    {stats.done}/{stats.total}
                  </span>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </button>
  );
}

export default function ProductionModule() {
  const shoots = useSpace((s) => s.shoots) ?? [];
  const content = useSpace((s) => s.content) ?? [];
  const params = useApp((s) => s.params);
  const navKey = useApp((s) => s.navKey);
  const today = todayISO();

  const idx = useMemo(() => indexSessions({ shoots, content }), [shoots, content]);
  const { upcoming, past } = useMemo(() => splitSessions(shoots, today), [shoots, today]);
  const needs = useMemo(() => needsFilming(content, idx), [content, idx]);
  const candidates = useMemo(() => addablePieces(content, idx), [content, idx]);
  const locationSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const s of shoots) if (s.location?.trim()) set.add(s.location.trim());
    for (const c of content) if (c.location?.trim()) set.add(c.location.trim());
    return [...set].sort();
  }, [shoots, content]);

  const [showPast, setShowPast] = useState(() => readLS<boolean>('prepro.spprod.past', false));
  const [selected, setSelected] = useState<string>(() => {
    if (params?.shootId && shoots.some((s) => s.id === params.shootId)) return params.shootId as string;
    return upcoming[0]?.id ?? NEEDS;
  });
  useEffect(() => {
    const id = params?.shootId as string | undefined;
    if (id && shoots.some((s) => s.id === id)) {
      setSelected(id);
      if (past.some((s) => s.id === id)) setShowPast(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navKey]);
  const current = selected !== NEEDS ? shoots.find((s) => s.id === selected) : undefined;
  useEffect(() => {
    if (selected !== NEEDS && !current) setSelected(upcoming[0]?.id ?? NEEDS);
  }, [selected, current, upcoming]);
  useEffect(() => {
    if (current && past.some((s) => s.id === current.id) && !showPast) setShowPast(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const select = (id: string | null) => setSelected(id ?? upcoming.find((s) => s.id !== selected)?.id ?? NEEDS);
  const togglePast = () => {
    writeLS('prepro.spprod.past', !showPast);
    setShowPast(!showPast);
  };
  const newShoot = () => {
    const id = createShootSession({ title: 'Shoot day', date: addDays(today, 1) });
    setSelected(id);
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLInputElement>('.sp-production-title input');
      el?.focus();
      el?.select();
    });
  };

  const order = [NEEDS, ...upcoming.map((s) => s.id), ...(showPast ? past.map((s) => s.id) : [])];
  const onListKey = async (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const i = order.indexOf(selected);
      const next = order[Math.max(0, Math.min(order.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      setSelected(next);
      document.getElementById(next === NEEDS ? 'sp-production-needs-item' : `sp-production-item-${next}`)?.focus();
    } else if (e.key === 'Delete' && current) {
      e.preventDefault();
      const n = (idx.pieces.get(current.id) ?? []).length;
      const ok = await confirmDialog({
        title: `Delete “${current.title || 'Shoot day'}”?`,
        message: n ? `${plural(n, 'piece')} stay in Content but are no longer planned on a shoot day.` : 'This shoot day will be removed.',
        confirmLabel: 'Delete',
        danger: true,
      });
      if (ok) {
        deleteShoot(current.id);
        select(null);
        undoToast('Shoot day deleted');
      }
    }
  };

  useCommand('print', () => {
    openPrint('space-shoot-plan', current ? { shoot: shootPrintValue(current, shoots) } : { shoot: '' });
    return true;
  });

  const subtitle = shoots.length
    ? [plural(shoots.length, 'shoot day'), `${upcoming.length} upcoming`, needs.length ? `${plural(needs.length, 'piece')} need filming` : 'nothing waiting'].join(' · ')
    : needs.length
      ? `${plural(needs.length, 'piece')} need filming`
      : 'Batch shoot days and shot lists';

  return (
    <div className="module sp-production">
      <ModuleHeader
        title="Production"
        icon={Clapperboard}
        subtitle={subtitle}
        actions={
          <>
            <ExportMenu
              docs={[
                ...(current ? [{ id: 'space-shoot-plan', label: `Shoot plan — ${current.title || 'Shoot day'}`, options: { shoot: shootPrintValue(current, shoots) } }] : []),
                { id: 'space-shoot-plan', label: 'All upcoming shoot plans', options: { shoot: '' } },
              ]}
              csv={current ? [{ label: `Shot list — ${current.title || 'Shoot day'} (CSV)`, onClick: () => exportShotList(current.id) }] : []}
            />
            <Button variant="primary" icon={CalendarPlus} onClick={newShoot}>
              New shoot day
            </Button>
          </>
        }
      />
      <div className="split">
        <div className="pane-left sp-production-list">
          <div className="sp-production-list-head">
            <span className="section-title">Shoot days</span>
            <IconButton size="sm" icon={Plus} label="New shoot day" onClick={newShoot} />
          </div>
          <div className="sp-production-list-body" role="listbox" aria-label="Shoot days" onKeyDown={onListKey}>
            <button
              type="button"
              id="sp-production-needs-item"
              role="option"
              aria-selected={selected === NEEDS}
              className={`list-item sp-production-item sp-production-needs-item ${selected === NEEDS ? 'active' : ''}`}
              onClick={() => setSelected(NEEDS)}
            >
              <div className="sp-production-datebadge">
                <Inbox />
              </div>
              <div className="grow">
                <div className="strong">Needs filming</div>
                <div className="meta">{needs.length ? `${plural(needs.length, 'piece')} without a shoot day` : 'All planned'}</div>
              </div>
              {needs.length > 0 && <span className="badge warning">{needs.length}</span>}
            </button>
            <div className="sp-production-group">Upcoming</div>
            {upcoming.map((sh) => (
              <SessionItem key={sh.id} sh={sh} active={sh.id === selected} pieces={idx.pieces} onSelect={setSelected} />
            ))}
            {upcoming.length === 0 && (
              <div className="sp-production-list-empty">
                No upcoming shoot days.
                <div style={{ marginTop: 8 }}>
                  <Button size="sm" icon={CalendarPlus} onClick={newShoot}>
                    New shoot day
                  </Button>
                </div>
              </div>
            )}
            {past.length > 0 && (
              <>
                <button type="button" className="sp-production-group" aria-expanded={showPast} onClick={togglePast}>
                  {showPast ? <ChevronDown /> : <ChevronRight />}
                  Past ({past.length})
                </button>
                {showPast && past.map((sh) => <SessionItem key={sh.id} sh={sh} active={sh.id === selected} past pieces={idx.pieces} onSelect={setSelected} />)}
              </>
            )}
          </div>
        </div>
        <div className="pane-main">
          {current ? (
            <SessionDetail
              key={current.id}
              shoot={current}
              shoots={shoots}
              pieces={idx.pieces.get(current.id) ?? []}
              missing={idx.missing.get(current.id) ?? []}
              candidates={candidates}
              locationSuggestions={locationSuggestions}
              onSelect={select}
            />
          ) : (
            <NeedsFilming pieces={needs} upcoming={upcoming} hasContent={content.length > 0} onSelect={setSelected} />
          )}
        </div>
      </div>
    </div>
  );
}
