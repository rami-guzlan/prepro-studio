/* Productions tab of the library: folders, and three views of the productions
   (grid of cards, a sortable list, a board by status). Drag a production onto a
   folder to file it, or onto a board column to change its status. */
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, Folder, FolderPlus, Kanban, LayoutGrid, List, MonitorPlay, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { ProjectStatus, ProjectSummary } from '@/types';
import { PROJECT_STATUSES, PROJECT_TYPES, optionLabel } from '@/lib/constants';
import { makeFormatters } from '@/lib/format';
import { readLS, writeLS } from '@/store/app';
import { Badge, Menu, Tabs, confirmDialog, promptDialog, toast, type MenuItem } from '@/ui';
import { STAGES } from '@/modules/creator/model';
import { moveProjectsToFolder, openProjectById, setProjectStatus } from './projectActions';

const fmt = makeFormatters();
const DRAG = 'application/x-prepro-project';

type View = 'grid' | 'list' | 'board';
type Kind = 'all' | 'creator' | 'production';
type Sort = 'recent' | 'name' | 'status' | 'due';

const FOLDERS_KEY = 'prepro.prod.folders';
/** Empty folders live in this browser; a folder with productions in it comes from the productions themselves. */
const savedFolders = () => readLS<string[]>(FOLDERS_KEY, []);
const saveFolders = (list: string[]) => writeLS(FOLDERS_KEY, [...new Set(list)].sort((a, b) => a.localeCompare(b)));

export const isCreator = (p: ProjectSummary) => p.workflow === 'creator';
/** "Short · Edit" for creator videos, the type for everything else. */
export function kindLabel(p: ProjectSummary) {
  if (!isCreator(p)) return optionLabel(PROJECT_TYPES, p.projectType);
  return `${p.creatorFormat === 'short' ? 'Short' : 'YouTube'} · ${STAGES.find((s) => s.value === p.creatorStage)?.label ?? 'Idea'}`;
}

export function ProductionsLibrary({
  projects,
  card,
  menu,
  lead,
  onNew,
  refresh,
}: {
  projects: ProjectSummary[];
  /** the existing project card, with its menu */
  card: (p: ProjectSummary, menu: MenuItem[]) => ReactNode;
  menu: (p: ProjectSummary) => MenuItem[];
  /** "New production" and demo cards at the start of the grid */
  lead: ReactNode;
  onNew: (folder?: string) => void;
  refresh: () => void;
}) {
  const [view, setViewState] = useState<View>(() => readLS<View>('prepro.prod.view', 'grid'));
  const [kind, setKindState] = useState<Kind>(() => readLS<Kind>('prepro.prod.kind', 'all'));
  const [sort, setSortState] = useState<Sort>(() => readLS<Sort>('prepro.prod.sort', 'recent'));
  const [folder, setFolder] = useState<string>(() => readLS<string>('prepro.prod.folder', ''));
  const [q, setQ] = useState('');
  const [extra, setExtra] = useState<string[]>(savedFolders);
  const [over, setOver] = useState<string | null>(null);
  const setView = (v: View) => (setViewState(v), writeLS('prepro.prod.view', v));
  const setKind = (v: Kind) => (setKindState(v), writeLS('prepro.prod.kind', v));
  const setSort = (v: Sort) => (setSortState(v), writeLS('prepro.prod.sort', v));
  const openFolder = (f: string) => (setFolder(f), writeLS('prepro.prod.folder', f));

  const folders = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of extra) m.set(f, 0);
    for (const p of projects) if (p.folder) m.set(p.folder, (m.get(p.folder) ?? 0) + 1);
    return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, extra]);
  const folderNames = folders.map((f) => f.name);
  const inFolder = folder && folderNames.includes(folder) ? folder : '';

  const searching = !!q.trim();
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    let out = projects.filter((p) => (kind === 'all' ? true : kind === 'creator' ? isCreator(p) : !isCreator(p)));
    // searching and the board look across every folder; grid and list show the open folder
    if (s) out = out.filter((p) => [p.title, p.subtitle, p.folder, kindLabel(p)].join(' ').toLowerCase().includes(s));
    else if (view !== 'board') out = out.filter((p) => (p.folder ?? '') === inFolder);
    else if (inFolder) out = out.filter((p) => p.folder === inFolder);
    const statusIdx = (p: ProjectSummary) => PROJECT_STATUSES.findIndex((x) => x.value === p.status);
    const by: Record<Sort, (a: ProjectSummary, b: ProjectSummary) => number> = {
      recent: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
      name: (a, b) => a.title.localeCompare(b.title),
      status: (a, b) => statusIdx(a) - statusIdx(b) || b.updatedAt.localeCompare(a.updatedAt),
      due: (a, b) => (a.targetDate ?? '9999').localeCompare(b.targetDate ?? '9999') || b.updatedAt.localeCompare(a.updatedAt),
    };
    return [...out].sort(by[sort]);
  }, [projects, kind, q, view, inFolder, sort]);

  /* ---- folders */
  const newFolder = async () => {
    const name = (await promptDialog({ title: 'New folder', placeholder: 'e.g. Client work, YouTube 2027', confirmLabel: 'Create' }))?.trim();
    if (!name) return;
    if (folderNames.some((f) => f.toLowerCase() === name.toLowerCase())) return toast('There is a folder with that name already', 'info');
    const next = [...extra, name];
    setExtra(next);
    saveFolders(next);
  };
  const renameFolder = async (from: string) => {
    const name = (await promptDialog({ title: 'Rename folder', defaultValue: from, confirmLabel: 'Rename' }))?.trim();
    if (!name || name === from) return;
    const ids = projects.filter((p) => p.folder === from).map((p) => p.id);
    if (ids.length && !(await moveProjectsToFolder(ids, name))) return;
    const next = [...extra.filter((f) => f !== from), name];
    setExtra(next);
    saveFolders(next);
    if (inFolder === from) openFolder(name);
    refresh();
  };
  const deleteFolder = async (name: string) => {
    const ids = projects.filter((p) => p.folder === name).map((p) => p.id);
    if (ids.length && !(await confirmDialog({ title: `Delete the folder “${name}”?`, message: `Its ${ids.length} production${ids.length === 1 ? '' : 's'} move back to the top level. Nothing is deleted.`, confirmLabel: 'Delete folder' }))) return;
    if (ids.length && !(await moveProjectsToFolder(ids, ''))) return;
    const next = extra.filter((f) => f !== name);
    setExtra(next);
    saveFolders(next);
    if (inFolder === name) openFolder('');
    refresh();
  };
  const fileInto = async (ids: string[], name: string) => {
    if (await moveProjectsToFolder(ids, name)) {
      toast(name ? `Moved to ${name}` : 'Moved to the top level');
      refresh();
    }
  };

  /** Extra menu items: move to a folder. */
  const moveItems = (p: ProjectSummary): MenuItem[] => [
    { header: 'Move to folder' },
    ...(p.folder ? [{ label: 'Top level (no folder)', icon: ArrowLeft, onClick: () => void fileInto([p.id], '') }] : []),
    ...folderNames.filter((f) => f !== p.folder).map((f): MenuItem => ({ label: f, icon: Folder, onClick: () => void fileInto([p.id], f) })),
    {
      label: 'New folder…',
      icon: FolderPlus,
      onClick: async () => {
        const name = (await promptDialog({ title: 'New folder', placeholder: 'Folder name', confirmLabel: 'Create and move' }))?.trim();
        if (name) void fileInto([p.id], name);
      },
    },
  ];
  const fullMenu = (p: ProjectSummary): MenuItem[] => {
    const base = menu(p);
    const i = base.findIndex((x) => x.separator);
    return i < 0 ? [...base, { separator: true }, ...moveItems(p)] : [...base.slice(0, i), { separator: true }, ...moveItems(p), ...base.slice(i)];
  };

  const dropProps = (target: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG)) return;
      e.preventDefault();
      if (over !== target) setOver(target);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver(null);
    },
    onDrop: (e: React.DragEvent) => {
      setOver(null);
      const id = e.dataTransfer.getData(DRAG);
      if (!id) return;
      e.preventDefault();
      if (target.startsWith('status:')) void setProjectStatus(id, target.slice(7) as ProjectStatus).then((ok) => ok && refresh());
      else void fileInto([id], target.slice(7));
    },
  });
  const dragProps = (p: ProjectSummary) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(DRAG, p.id);
      e.dataTransfer.effectAllowed = 'move';
    },
  });

  const creatorCount = projects.filter(isCreator).length;

  return (
    <div className="plib">
      <div className="plib-bar">
        {inFolder && !searching ? (
          <span className="plib-crumb">
            <button type="button" onClick={() => openFolder('')} {...dropProps('folder:')} className={over === 'folder:' ? 'over' : ''}>
              <ArrowLeft size={14} /> All productions
            </button>
            <span className="muted">/</span>
            <b>
              <Folder size={14} /> {inFolder}
            </b>
          </span>
        ) : (
          <b className="plib-title">{searching ? 'Search results' : view === 'board' ? (inFolder ? `Board · ${inFolder}` : 'Board · every production') : 'All productions'}</b>
        )}
        <div className="spacer" />
        <label className="plib-search">
          <Search size={14} />
          <input value={q} placeholder="Search productions" onChange={(e) => setQ(e.target.value)} aria-label="Search productions" />
        </label>
        {creatorCount > 0 && (
          <select className="plib-select" value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label="Show">
            <option value="all">Everything</option>
            <option value="creator">YouTube / social</option>
            <option value="production">Full productions</option>
          </select>
        )}
        <select className="plib-select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="recent">Recently edited</option>
          <option value="name">Name</option>
          <option value="status">Status</option>
          <option value="due">Publish date</option>
        </select>
        <Tabs<View>
          value={view}
          onChange={setView}
          tabs={[
            { id: 'grid', label: 'Grid', icon: LayoutGrid },
            { id: 'list', label: 'List', icon: List },
            { id: 'board', label: 'Board', icon: Kanban },
          ]}
        />
      </div>

      {!inFolder && !searching && view !== 'board' && (
        <div className="plib-folders">
          {folders.map((f) => (
            <div key={f.name} className={`plib-folder ${over === `folder:${f.name}` ? 'over' : ''}`} {...dropProps(`folder:${f.name}`)}>
              <button type="button" className="plib-folder-open" onClick={() => openFolder(f.name)}>
                <Folder size={18} />
                <span className="ellipsis">{f.name}</span>
                <span className="muted small">{f.count}</span>
              </button>
              <Menu
                align="end"
                trigger={
                  <button type="button" className="plib-folder-more" aria-label="Folder actions">
                    <MoreHorizontal size={14} />
                  </button>
                }
                items={[
                  { label: 'Rename…', icon: Pencil, onClick: () => void renameFolder(f.name) },
                  { label: 'Delete folder…', icon: Trash2, danger: true, onClick: () => void deleteFolder(f.name) },
                ]}
              />
            </div>
          ))}
          <button type="button" className="plib-folder add" onClick={() => void newFolder()}>
            <FolderPlus size={16} /> New folder
          </button>
          {folders.length > 0 && <span className="muted small plib-hint">Drag a production onto a folder to file it.</span>}
        </div>
      )}

      {view === 'grid' && (
        <div className="project-grid">
          {!searching && lead}
          {inFolder && !searching && (
            <button className="new-card" onClick={() => onNew(inFolder)}>
              <Plus size={26} />
              New in {inFolder}
            </button>
          )}
          {list.map((p) => (
            <div key={p.id} className="plib-drag" {...dragProps(p)}>
              {card(p, fullMenu(p))}
            </div>
          ))}
        </div>
      )}

      {view === 'list' && (
        <div className="plib-list" role="table">
          <div className="plib-row head" role="row">
            <span>Title</span>
            <span>Kind</span>
            <span>Status</span>
            <span>Folder</span>
            <span>Publish / deliver</span>
            <span>Edited</span>
            <span />
          </div>
          {list.length === 0 && <div className="plib-empty muted">{searching ? 'Nothing matches.' : 'No productions here yet.'}</div>}
          {list.map((p) => {
            const st = PROJECT_STATUSES.find((s) => s.value === p.status);
            return (
              <div key={p.id} className="plib-row" role="row" tabIndex={0} onClick={() => openProjectById(p.id)} onKeyDown={(e) => e.key === 'Enter' && openProjectById(p.id)} {...dragProps(p)}>
                <span className="plib-name">
                  <i className="plib-swatch" style={{ background: p.color }} />
                  {isCreator(p) && <MonitorPlay size={14} className="muted" />}
                  <b className="ellipsis">{p.title}</b>
                  {p.demo && <Badge tone="accent">Demo</Badge>}
                </span>
                <span className="small ellipsis">{kindLabel(p)}</span>
                <span>{st && <Badge color={st.color}>{st.label}</Badge>}</span>
                <span className="small muted ellipsis">{p.folder ?? '–'}</span>
                <span className="small">{p.targetDate ? fmt.dateMedium(p.targetDate) : <span className="muted">–</span>}</span>
                <span className="small muted">{fmt.dateMedium(p.updatedAt.slice(0, 10))}</span>
                <span onClick={(e) => e.stopPropagation()}>
                  <Menu
                    align="end"
                    trigger={
                      <button className="btn sm icon ghost" aria-label="Production actions">
                        <MoreHorizontal />
                      </button>
                    }
                    items={fullMenu(p)}
                  />
                </span>
              </div>
            );
          })}
          <button type="button" className="plib-row add" onClick={() => onNew(inFolder || undefined)}>
            <Plus size={14} /> New production{inFolder ? ` in ${inFolder}` : ''}
          </button>
        </div>
      )}

      {view === 'board' && (
        <div className="plib-board">
          {PROJECT_STATUSES.filter((s) => s.value !== 'archived' || list.some((p) => p.status === 'archived')).map((s) => {
            const cards = list.filter((p) => p.status === s.value);
            return (
              <div key={s.value} className={`plib-col ${over === `status:${s.value}` ? 'over' : ''}`} style={{ ['--st' as string]: s.color }} {...dropProps(`status:${s.value}`)}>
                <div className="plib-col-head">
                  <i />
                  <b>{s.label}</b>
                  <span className="muted small">{cards.length}</span>
                </div>
                {cards.map((p) => (
                  <button key={p.id} type="button" className="plib-card" onClick={() => openProjectById(p.id)} {...dragProps(p)}>
                    <span className="row" style={{ gap: 6 }}>
                      <i className="plib-swatch" style={{ background: p.color }} />
                      <b className="grow ellipsis">{p.title}</b>
                    </span>
                    <span className="small muted ellipsis">
                      {kindLabel(p)}
                      {p.folder ? ` · ${p.folder}` : ''}
                    </span>
                    {p.targetDate && <span className="small">Publish by {fmt.dateMedium(p.targetDate)}</span>}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
      {view !== 'grid' && list.length > 0 && <p className="muted small plib-hint">{view === 'board' ? 'Drag a production to another column to change its status.' : 'Drag a row onto a folder (back at All productions) to file it.'}</p>}
    </div>
  );
}
