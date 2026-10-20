/* Content list: sortable table with optional grouping (stage, campaign, pillar,
   format, owner). Click a row to open the editor. */
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, CalendarDays, ChevronDown, ChevronRight, MoreHorizontal } from 'lucide-react';
import type { Formatters } from '@/lib/format';
import { readLS, writeLS } from '@/store/app';
import { FORMATS, STAGES, STAGE_BY_ID } from '@/spaces/constants';
import type { ContentPiece } from '@/spaces/types';
import { openContent } from '@/spaces/ui';
import { AssetImage, Avatar, IconButton, Menu, openContextMenu } from '@/ui';
import { naturalCompare } from '@/lib/text';
import { shortDate, type Lookups } from './Board';
import { CampaignChip, ChannelDots, FormatIcon, PillarTag, PriorityFlag, StageBadge } from './parts';
import { checklistProgress, contentMenuItems, deleteContent, formatLabel, nextPostInfo } from './shared';
import { setContentOrder } from './store';

export type GroupBy = 'none' | 'stage' | 'campaign' | 'pillar' | 'format' | 'owner';

export const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'none', label: 'No grouping' },
  { value: 'stage', label: 'Group by stage' },
  { value: 'campaign', label: 'Group by campaign' },
  { value: 'pillar', label: 'Group by pillar' },
  { value: 'format', label: 'Group by format' },
  { value: 'owner', label: 'Group by owner' },
];

type SortKey = 'title' | 'format' | 'stage' | 'pillar' | 'campaign' | 'channels' | 'next' | 'owner' | 'checklist';
type Sort = { key: SortKey; dir: 1 | -1 } | null;

interface Group {
  key: string;
  label: ReactNode;
  color?: string;
  rows: ContentPiece[];
}

const LS_SORT = 'prepro.space.content.listSort';

export function ContentList({ pieces, lookups, fmt, today, groupBy }: { pieces: ContentPiece[]; lookups: Lookups; fmt: Formatters; today: string; groupBy: GroupBy }) {
  const [sort, setSortState] = useState<Sort>(() => readLS<Sort>(LS_SORT, null));
  const setSort = (s: Sort) => {
    setSortState(s);
    writeLS(LS_SORT, s);
  };
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const sorted = useMemo(() => {
    const stageIdx = (c: ContentPiece) => STAGES.findIndex((s) => s.value === c.stage);
    if (!sort) {
      // default: pipeline order (stage, then manual order)
      return pieces.map((c, i) => ({ c, i })).sort((a, b) => stageIdx(a.c) - stageIdx(b.c) || a.i - b.i).map((x) => x.c);
    }
    const val = (c: ContentPiece): string | number | undefined => {
      switch (sort.key) {
        case 'title':
          return c.title || '';
        case 'format':
          return FORMATS.findIndex((f) => f.value === c.format);
        case 'stage':
          return stageIdx(c);
        case 'pillar':
          return c.pillarId ? lookups.pillars.get(c.pillarId)?.name : undefined;
        case 'campaign':
          return c.campaignId ? lookups.campaigns.get(c.campaignId)?.name : undefined;
        case 'channels':
          return c.posts.length || undefined;
        case 'next': {
          const n = nextPostInfo(c, today);
          return n ? `${n.date} ${n.time ?? ''}` : undefined;
        }
        case 'owner':
          return c.owner?.trim() || undefined;
        case 'checklist': {
          const p = checklistProgress(c);
          return p.total ? p.done / p.total : undefined;
        }
      }
    };
    return [...pieces].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va == null || va === '') return vb == null || vb === '' ? 0 : 1;
      if (vb == null || vb === '') return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sort.dir;
      return naturalCompare(String(va), String(vb)) * sort.dir;
    });
  }, [pieces, sort, lookups, today]);

  const groups = useMemo<Group[]>(() => {
    if (groupBy === 'none') return [{ key: 'all', label: '', rows: sorted }];
    const map = new Map<string, ContentPiece[]>();
    const keyOf = (c: ContentPiece): string => {
      switch (groupBy) {
        case 'stage':
          return c.stage;
        case 'campaign':
          return c.campaignId && lookups.campaigns.has(c.campaignId) ? c.campaignId : '';
        case 'pillar':
          return c.pillarId && lookups.pillars.has(c.pillarId) ? c.pillarId : '';
        case 'format':
          return c.format;
        case 'owner':
          return c.owner?.trim() ?? '';
      }
      return '';
    };
    for (const c of sorted) {
      const k = keyOf(c);
      map.set(k, [...(map.get(k) ?? []), c]);
    }
    let order: string[];
    if (groupBy === 'stage') order = STAGES.map((s) => s.value);
    else if (groupBy === 'campaign') order = [...lookups.campaigns.keys(), ''];
    else if (groupBy === 'pillar') order = [...lookups.pillars.keys(), ''];
    else if (groupBy === 'format') order = FORMATS.map((f) => f.value);
    else order = [...[...map.keys()].filter(Boolean).sort((a, b) => a.localeCompare(b)), ''];
    return order
      .filter((k) => map.has(k))
      .map((k) => {
        const rows = map.get(k)!;
        if (groupBy === 'stage') return { key: k, label: STAGE_BY_ID[k as ContentPiece['stage']]?.label ?? k, color: STAGE_BY_ID[k as ContentPiece['stage']]?.color, rows };
        if (groupBy === 'campaign') {
          const c = lookups.campaigns.get(k);
          return { key: k || 'none', label: c?.name ?? 'No campaign', color: c?.color, rows };
        }
        if (groupBy === 'pillar') {
          const p = lookups.pillars.get(k);
          return { key: k || 'none', label: p?.name ?? 'No pillar', color: p?.color, rows };
        }
        if (groupBy === 'format')
          return {
            key: k,
            label: (
              <span className="row" style={{ gap: 6 }}>
                <FormatIcon format={k as ContentPiece['format']} size={13} /> {formatLabel(k as ContentPiece['format'])}
              </span>
            ),
            rows,
          };
        return { key: k || 'none', label: k || 'Unassigned', rows };
      });
  }, [sorted, groupBy, lookups]);

  const ordered = useMemo(() => groups.flatMap((g) => g.rows.map((c) => c.id)), [groups]);
  useEffect(() => setContentOrder(ordered), [ordered]);

  const head = (key: SortKey, label: string, cls?: string) => {
    const on = sort?.key === key;
    return (
      <th
        className={['sortable', cls].filter(Boolean).join(' ')}
        onClick={() => setSort(on ? (sort!.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 })}
        aria-sort={on ? (sort!.dir === 1 ? 'ascending' : 'descending') : undefined}
      >
        <span className="row" style={{ gap: 3, display: 'inline-flex' }}>
          {label}
          {on && (sort!.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
        </span>
      </th>
    );
  };

  const toggle = (k: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <div className="sp-content-list-wrap">
      <table className="table sp-content-table">
        <colgroup>
          <col style={{ width: '30%' }} />
          <col style={{ width: 150 }} />
          <col style={{ width: 110 }} />
          <col style={{ width: 140 }} />
          <col style={{ width: 150 }} />
          <col style={{ width: 110 }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 120 }} />
          <col style={{ width: 96 }} />
          <col style={{ width: 40 }} />
        </colgroup>
        <thead>
          <tr>
            {head('title', 'Title')}
            {head('format', 'Format')}
            {head('stage', 'Stage')}
            {head('pillar', 'Pillar')}
            {head('campaign', 'Campaign')}
            {head('channels', 'Channels')}
            {head('next', 'Next post')}
            {head('owner', 'Owner')}
            {head('checklist', 'Checklist')}
            <th />
          </tr>
        </thead>
        <tbody>
          {pieces.length === 0 && (
            <tr>
              <td colSpan={10} className="sp-content-list-empty">
                Nothing matches the current filters.
              </td>
            </tr>
          )}
          {groups.map((g) => (
            <Fragment key={g.key}>
              {groupBy !== 'none' && (
                <tr className="group-row sp-content-group-row" onClick={() => toggle(g.key)}>
                  <td colSpan={10}>
                    <span className="row" style={{ gap: 7 }}>
                      {collapsed.has(g.key) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      {g.color && <span className="color-dot" style={{ background: g.color }} />}
                      <span>{g.label}</span>
                      <span className="sp-content-count">{g.rows.length}</span>
                    </span>
                  </td>
                </tr>
              )}
              {!collapsed.has(g.key) && g.rows.map((c) => <Row key={c.id} c={c} lookups={lookups} fmt={fmt} today={today} />)}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ c, lookups, fmt, today }: { c: ContentPiece; lookups: Lookups; fmt: Formatters; today: string }) {
  const pillar = c.pillarId ? lookups.pillars.get(c.pillarId) : undefined;
  const campaign = c.campaignId ? lookups.campaigns.get(c.campaignId) : undefined;
  const next = nextPostInfo(c, today);
  const prog = checklistProgress(c);
  return (
    <tr
      className="sp-content-row"
      tabIndex={0}
      data-content-id={c.id}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        openContent(c.id);
      }}
      onContextMenu={(e) => openContextMenu(e, contentMenuItems(c))}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          openContent(c.id);
        } else if (e.key === 'Delete') {
          e.preventDefault();
          void deleteContent(c.id);
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const el = (e.key === 'ArrowDown' ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling) as HTMLElement | null;
          if (el?.classList.contains('sp-content-row')) el.focus();
        }
      }}
    >
      <td>
        <div className="sp-content-row-title">
          <span className="sp-content-row-thumb">{c.thumbnail ? <AssetImage name={c.thumbnail} /> : <FormatIcon format={c.format} size={14} />}</span>
          <span className="ellipsis strong">{c.title || 'Untitled content'}</span>
          <PriorityFlag priority={c.priority} />
        </div>
      </td>
      <td>
        <span className="row text-2" style={{ gap: 6 }}>
          <FormatIcon format={c.format} size={13} />
          <span className="ellipsis">{formatLabel(c.format)}</span>
        </span>
      </td>
      <td>
        <StageBadge stage={c.stage} />
      </td>
      <td className="sp-content-cell-clip">{pillar ? <PillarTag pillar={pillar} /> : <span className="muted">—</span>}</td>
      <td className="sp-content-cell-clip">{campaign ? <CampaignChip campaign={campaign} /> : <span className="muted">—</span>}</td>
      <td>{c.posts.length ? <ChannelDots posts={c.posts} channels={lookups.channels} fmtDate={(d) => shortDate(fmt, d)} /> : <span className="muted small">No posts</span>}</td>
      <td>
        {next ? (
          <span className={['sp-content-due', next.overdue && 'overdue', next.published && 'done'].filter(Boolean).join(' ')} title={fmt.dateLong(next.date)}>
            <CalendarDays size={12} />
            {shortDate(fmt, next.date)}
          </span>
        ) : (
          <span className="muted small">Unscheduled</span>
        )}
      </td>
      <td>
        {c.owner?.trim() ? (
          <span className="row" style={{ gap: 6, minWidth: 0 }}>
            <Avatar name={c.owner} size={20} />
            <span className="ellipsis">{c.owner}</span>
          </span>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td>
        {prog.total ? (
          <span className="sp-content-mini-progress" title={`${prog.done} of ${prog.total} done`}>
            <span className="bar">
              <span style={{ width: `${(prog.done / prog.total) * 100}%` }} className={prog.done === prog.total ? 'complete' : ''} />
            </span>
            <span className="small text-2">
              {prog.done}/{prog.total}
            </span>
          </span>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td className="actions-cell">
        <Menu align="end" trigger={<IconButton icon={MoreHorizontal} size="sm" label="Content actions" />} items={() => contentMenuItems(c)} />
      </td>
    </tr>
  );
}
