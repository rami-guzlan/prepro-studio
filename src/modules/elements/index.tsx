/* Props, Wardrobe & Elements: every breakdown element in one editable table,
   grouped by department, with scene links, merge and a wardrobe plot. */
import './elements.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Combine, Copy, ExternalLink, Package, Plus, ScanText, Trash2 } from 'lucide-react';
import type { BreakdownElement, ElementStatus, ID } from '@/types';
import { useScriptModel } from '@/derived/script';
import { getProject, listOps, update, useFormatters, useProject } from '@/store/project';
import { navigate, readLS, useApp, writeLS } from '@/store/app';
import { useCommand } from '@/lib/commands';
import { CATEGORY_BY_ID, DEPARTMENTS, ELEMENT_STATUSES, optionColor } from '@/lib/constants';
import { uid } from '@/lib/id';
import { matchesQuery, naturalCompare, plural } from '@/lib/text';
import {
  Button,
  DataTable,
  EmptyState,
  ExportMenu,
  ImageDrop,
  ModuleHeader,
  SearchInput,
  Select,
  Tabs,
  Toolbar,
  UnderlineTabs,
  confirmDialog,
  toast,
  type Column,
} from '@/ui';
import { ELEMENT_CATEGORY_OPTIONS, ELEMENT_SOURCES, deleteElementDraft, duplicateKey, scenesByElement, sortCharacters, taggedCounts, type ElCategory } from '@/modules/breakdown/logic';
import { GROUPS, GROUP_BY_ID, categoryIndex, defaultCategory, groupOfCategory, inGroup, type GroupId } from './groups';
import { ScenesCell } from './ScenesCell';
import { MergeDialog, type MergeRequest } from './MergeDialog';
import { WardrobePlot } from './WardrobePlot';
import { exportElementsCsv } from './exports';

type StatusFilter = '' | ElementStatus | 'unlinked';
type WardrobeView = 'list' | 'character' | 'plot';

const ops = listOps<BreakdownElement>((d) => d.elements, 'elements');

/** Sum of column widths: the table scrolls horizontally instead of squeezing inputs. */
function minTableWidth<T>(cols: Column<T>[], extra = 40): number {
  return cols.filter((c) => !c.hidden).reduce((n, c) => n + (typeof c.width === 'number' ? c.width : c.minWidth ?? 140), extra);
}


const NEW_NAMES: Partial<Record<ElCategory, string>> = {
  props: 'NEW PROP',
  wardrobe: 'NEW COSTUME',
  makeup: 'NEW LOOK',
  set_dressing: 'NEW SET DRESSING',
  vehicles: 'NEW VEHICLE',
  sfx: 'NEW EFFECT',
  sound: 'NEW SOUND',
};

export default function ElementsModule() {
  const elements = useProject((p) => p.elements);
  const characters = useProject((p) => p.characters);
  const contacts = useProject((p) => p.contacts);
  const crew = useProject((p) => p.crew);
  const model = useScriptModel();
  const fmt = useFormatters();
  const params = useApp((s) => s.params);
  const navKey = useApp((s) => s.navKey);

  const [group, setGroupState] = useState<GroupId>(() => readLS<GroupId>('prepro.elements.group', 'all'));
  const setGroup = (g: GroupId) => {
    writeLS('prepro.elements.group', g);
    setGroupState(g);
  };
  const [wardrobeView, setWardrobeViewState] = useState<WardrobeView>(() => readLS<WardrobeView>('prepro.elements.wardrobeView', 'list'));
  const setWardrobeView = (v: WardrobeView) => {
    writeLS('prepro.elements.wardrobeView', v);
    setWardrobeViewState(v);
  };
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [highlight, setHighlight] = useState<{ id: ID; focus?: boolean } | null>(null);
  const [merge, setMerge] = useState<MergeRequest | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const g = GROUP_BY_ID[group] ?? GROUPS[0];

  const scenesBy = useMemo(() => scenesByElement(model), [model]);
  const tagged = useMemo(() => taggedCounts(model), [model]);
  const sceneCount = useMemo(() => new Map([...scenesBy.entries()].map(([k, v]) => [k, v.length])), [scenesBy]);
  const charById = useMemo(() => new Map(characters.map((c) => [c.id, c])), [characters]);

  // navigate('elements', { elementId }) → show and highlight that element
  useEffect(() => {
    const id = params?.elementId as ID | undefined;
    if (!id) return;
    const el = getProject().elements.find((e) => e.id === id);
    if (!el) return;
    setGroupState(groupOfCategory(el.category));
    if (el.category === 'wardrobe') setWardrobeViewState((v) => (v === 'plot' ? 'list' : v));
    setQuery('');
    setStatus('');
    setHighlight({ id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navKey]);

  useEffect(() => {
    if (!highlight) return;
    const raf = requestAnimationFrame(() => {
      const row = tableRef.current?.querySelector<HTMLElement>('tr.selected');
      row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (highlight.focus) {
        const input = row?.querySelector<HTMLInputElement>('input.input');
        input?.focus();
        input?.select();
      }
    });
    const t = setTimeout(() => setHighlight(null), 4000);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [highlight]);

  useCommand('find', () => {
    searchRef.current?.querySelector('input')?.focus();
    return true;
  });

  /* ---------------------------------------------------------------- derived */

  const counts = useMemo(() => {
    const m = new Map<GroupId, number>();
    for (const gr of GROUPS) m.set(gr.id, elements.filter((e) => inGroup(e, gr)).length);
    return m;
  }, [elements]);

  const rows = useMemo(() => {
    return elements.filter((e) => {
      if (!inGroup(e, g)) return false;
      if (status === 'unlinked') {
        if ((scenesBy.get(e.id)?.length ?? 0) > 0) return false;
      } else if (status && e.status !== status) return false;
      const chr = e.characterId ? charById.get(e.characterId)?.name : '';
      return matchesQuery(`${e.name} ${e.description ?? ''} ${e.vendor ?? ''} ${e.owner ?? ''} ${e.notes ?? ''} ${chr ?? ''} ${CATEGORY_BY_ID[e.category]?.label ?? ''}`, query);
    });
  }, [elements, g, status, query, scenesBy, charById]);

  const totalCost = useMemo(() => elements.reduce((n, e) => n + (e.cost ?? 0), 0), [elements]);
  const rowsCost = useMemo(() => rows.reduce((n, e) => n + (e.cost ?? 0), 0), [rows]);
  const rowsQty = useMemo(() => rows.reduce((n, e) => n + (e.quantity ?? 0), 0), [rows]);
  const needed = useMemo(() => elements.filter((e) => e.status === 'needed' || e.status === 'sourcing').length, [elements]);
  const dupGroups = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of elements) {
      const k = duplicateKey(e.name);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.values()].filter((n) => n > 1).length;
  }, [elements]);

  const currency = useMemo(() => fmt.money(0).replace(/[\d.,\s  ]/g, '') || '$', [fmt]);
  const vendorSuggestions = useMemo(() => {
    const s = new Set<string>();
    for (const c of contacts) if (c.category === 'vendor' || c.category === 'rental') s.add(c.company || c.name);
    for (const e of elements) if (e.vendor) s.add(e.vendor);
    return [...s].sort(naturalCompare);
  }, [contacts, elements]);
  const ownerSuggestions = useMemo(() => {
    const s = new Set<string>(DEPARTMENTS.filter((d) => ['Production', 'Art', 'Props', 'Wardrobe', 'Hair & Makeup', 'Camera', 'Grip', 'Electric', 'Sound', 'Locations', 'Stunts', 'VFX', 'Transportation'].includes(d)));
    for (const c of crew) if (c.name) s.add(`${c.name} (${c.position || c.department})`);
    for (const e of elements) if (e.owner) s.add(e.owner);
    return [...s];
  }, [crew, elements]);
  const charOptions = useMemo(() => sortCharacters(characters).map((c) => ({ value: c.id, label: c.number != null ? `${c.number}. ${c.name}` : c.name })), [characters]);

  /* ---------------------------------------------------------------- actions */

  const addElement = () => {
    const cat = defaultCategory(g);
    const el: BreakdownElement = { id: uid('el'), category: cat, name: NEW_NAMES[cat] ?? 'NEW ELEMENT', status: 'needed', quantity: 1 };
    ops.add(el, 0);
    setQuery('');
    setStatus('');
    if (group === 'wardrobe' && wardrobeView === 'plot') setWardrobeView('list');
    setHighlight({ id: el.id, focus: true });
  };

  const duplicate = (e: BreakdownElement) => {
    const copy: BreakdownElement = { ...JSON.parse(JSON.stringify(e)), id: uid('el'), name: `${e.name} (COPY)`, sceneIds: undefined };
    update((d) => {
      const i = d.elements.findIndex((x) => x.id === e.id);
      d.elements.splice(i < 0 ? d.elements.length : i + 1, 0, copy);
    });
    setHighlight({ id: copy.id, focus: true });
  };

  const remove = async (e: BreakdownElement) => {
    const t = tagged.get(e.id) ?? 0;
    const n = scenesBy.get(e.id)?.length ?? 0;
    const ok = await confirmDialog({
      title: `Delete ${e.name || 'this element'}?`,
      message: t
        ? `It is tagged in ${plural(t, 'scene')} of the script. The highlighted text stays in the script but will no longer appear in the breakdown — remove or re-tag it in the Script editor.`
        : n
          ? `It is linked to ${plural(n, 'scene')}; those links will be removed.`
          : 'You can bring it back with Undo (Ctrl+Z).',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    update((d) => deleteElementDraft(d, e.id));
    toast(`Deleted ${e.name || 'element'}`);
  };

  const changeCategory = (e: BreakdownElement, cat: ElCategory) => {
    ops.update(e.id, { category: cat }, false);
    if (!inGroup({ category: cat }, g)) {
      const target = groupOfCategory(cat);
      toast(`Moved ${e.name} to ${CATEGORY_BY_ID[cat].label}`, 'info', {
        action: {
          label: 'Show',
          onClick: () => {
            setGroup(target);
            setHighlight({ id: e.id });
          },
        },
      });
    }
  };

  /* ---------------------------------------------------------------- columns */

  const showCategory = !g.cats || g.cats.length > 1;
  const showCharacter = group === 'all' || group === 'wardrobe' || group === 'makeup';

  const columns: Column<BreakdownElement>[] = [
    {
      key: 'photo',
      header: '',
      width: 56,
      sortable: false,
      render: (e) => (
        <ImageDrop round style={{ borderRadius: 6 }} width={40} height={30} value={e.photo} maxSize={1600} onChange={(v) => ops.update(e.id, { photo: v }, false)} />
      ),
    },
    { key: 'name', header: 'Name', type: 'text', width: 200, placeholder: 'Name', footer: `${plural(rows.length, 'item')}` },
    {
      key: 'category',
      header: 'Category',
      width: 150,
      hidden: !showCategory,
      sortValue: (e) => categoryIndex(e.category),
      render: (e) => (
        <div className="row" style={{ gap: 6 }}>
          <span className="color-dot" style={{ background: CATEGORY_BY_ID[e.category]?.color ?? '#888', width: 8, height: 8 }} />
          <Select bare size="sm" value={e.category} options={ELEMENT_CATEGORY_OPTIONS} onChange={(v) => changeCategory(e, v as ElCategory)} />
        </div>
      ),
    },
    { key: 'description', header: 'Description', type: 'textarea', minWidth: 200, placeholder: 'Description' },
    { key: 'quantity', header: 'Qty', type: 'number', width: 64, footer: rowsQty ? fmt.number(rowsQty) : '' },
    {
      key: 'status',
      header: 'Status',
      width: 130,
      sortValue: (e) => ELEMENT_STATUSES.findIndex((s) => s.value === e.status),
      render: (e) => (
        <div className="row elements-status" style={{ gap: 6 }}>
          <span className="color-dot" style={{ background: optionColor(ELEMENT_STATUSES, e.status) ?? 'var(--border-strong)', width: 8, height: 8 }} />
          <Select bare size="sm" value={e.status ?? ''} placeholder="—" options={ELEMENT_STATUSES} onChange={(v) => ops.update(e.id, { status: (v || undefined) as ElementStatus | undefined }, false)} />
        </div>
      ),
    },
    { key: 'source', header: 'Source', type: 'select', width: 100, options: ELEMENT_SOURCES, set: (v) => ({ source: v || undefined }) },
    { key: 'cost', header: 'Cost', type: 'money', width: 108, prefix: currency, footer: rowsCost ? fmt.money(rowsCost) : '' },
    { key: 'vendor', header: 'Vendor', type: 'combo', width: 150, suggestions: vendorSuggestions, placeholder: 'Vendor' },
    { key: 'owner', header: 'Owner / Dept', type: 'combo', width: 150, suggestions: ownerSuggestions, placeholder: 'Dept / person' },
    {
      key: 'characterId',
      header: 'Character',
      type: 'select',
      width: 130,
      hidden: !showCharacter,
      options: charOptions,
      set: (v) => ({ characterId: v || undefined }),
      sortValue: (e) => (e.characterId ? charById.get(e.characterId)?.number ?? 999 : 9999),
    },
    {
      key: 'scenes',
      header: 'Scenes',
      width: 150,
      sortValue: (e) => scenesBy.get(e.id)?.length ?? 0,
      render: (e) => <ScenesCell el={e} scenes={scenesBy.get(e.id) ?? []} allScenes={model.scenes} />,
    },
    { key: 'notes', header: 'Notes', type: 'textarea', minWidth: 170, placeholder: 'Notes' },
  ];

  /* ---------------------------------------------------------------- grouping */

  const byCharacter = group === 'wardrobe' && wardrobeView === 'character';
  const groupBy = byCharacter ? (e: BreakdownElement) => (e.characterId && charById.has(e.characterId) ? e.characterId : '') : showCategory ? (e: BreakdownElement) => e.category : undefined;
  const groupOrder = byCharacter ? [...charOptions.map((o) => o.value), '—'] : showCategory ? GROUPS.flatMap((x) => x.cats ?? []) : undefined;
  const groupHeader = (key: string, list: BreakdownElement[]) => {
    const cost = list.reduce((n, e) => n + (e.cost ?? 0), 0);
    let label: React.ReactNode;
    if (byCharacter) {
      const c = charById.get(key);
      label = c ? `${c.number != null ? `${c.number}. ` : ''}${c.name}` : 'No character assigned';
    } else {
      const def = CATEGORY_BY_ID[key as ElCategory];
      label = (
        <span className="row" style={{ gap: 6, display: 'inline-flex' }}>
          <span className="color-dot" style={{ background: def?.color ?? '#888', width: 9, height: 9 }} />
          {def?.label ?? key}
        </span>
      );
    }
    return (
      <span className="row" style={{ gap: 10 }}>
        {label}
        <span className="muted" style={{ fontWeight: 500 }}>
          {plural(list.length, 'item')}
          {cost ? ` · ${fmt.money(cost)}` : ''}
        </span>
      </span>
    );
  };

  const docs = [
    { id: 'props-list', label: 'Props list' },
    { id: 'wardrobe-list', label: 'Wardrobe list & plot' },
    { id: 'elements-by-scene', label: 'Elements by scene' },
    { id: 'elements-by-category', label: 'Elements by category' },
  ];

  const header = (
    <ModuleHeader
      title="Props, Wardrobe & Elements"
      icon={Package}
      subtitle={elements.length ? `${plural(elements.length, 'element')} · ${fmt.money(totalCost)} · ${needed} still to source` : 'Everything tagged in the breakdown'}
      actions={
        <>
          <ExportMenu
            docs={docs}
            csv={[
              { label: 'All elements (CSV)', onClick: () => exportElementsCsv(getProject()) },
              ...(rows.length !== elements.length && rows.length ? [{ label: `Current view — ${plural(rows.length, 'item')} (CSV)`, onClick: () => exportElementsCsv(getProject(), rows) }] : []),
            ]}
          />
          <Button variant="primary" icon={Plus} onClick={addElement}>
            Add {g.noun}
          </Button>
        </>
      }
    />
  );

  if (elements.length === 0) {
    return (
      <div className="module">
        {header}
        <div className="module-body">
          <EmptyState
            icon={Package}
            title="No props, wardrobe or elements yet"
            description="Tag items while you read the script (they appear here automatically), add them on a scene's breakdown sheet, or start a list right here."
            action={
              <div className="row">
                <Button variant="primary" icon={Plus} onClick={addElement}>
                  Add {g.noun}
                </Button>
                <Button icon={ScanText} onClick={() => navigate('breakdown')}>
                  Open breakdown
                </Button>
              </div>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="module">
      {header}
      <UnderlineTabs<GroupId> tabs={GROUPS.map((x) => ({ id: x.id, label: x.label, count: counts.get(x.id) ?? 0 }))} value={group} onChange={setGroup} />
      <Toolbar>
        <div ref={searchRef}>
          <SearchInput value={query} onChange={setQuery} placeholder={`Search ${g.id === 'all' ? 'elements' : g.label.toLowerCase()}…`} />
        </div>
        <Select
          value={status}
          onChange={(v) => setStatus(v as StatusFilter)}
          placeholder="All statuses"
          options={[...ELEMENT_STATUSES, { value: 'unlinked', label: 'Not in any scene' }]}
          style={{ width: 160 }}
        />
        {group === 'wardrobe' && (
          <Tabs<WardrobeView>
            tabs={[
              { id: 'list', label: 'List' },
              { id: 'character', label: 'By character' },
              { id: 'plot', label: 'Wardrobe plot' },
            ]}
            value={wardrobeView}
            onChange={setWardrobeView}
          />
        )}
        <span className="spacer" />
        <Button icon={Combine} onClick={() => setMerge({})} title="Find elements with the same name and merge them">
          Merge duplicates{dupGroups ? ` (${dupGroups})` : ''}
        </Button>
      </Toolbar>
      <div className="module-body padded" ref={tableRef}>
        {group === 'wardrobe' && wardrobeView === 'plot' ? (
          <WardrobePlot model={model} />
        ) : (
          <div className="elements-tablewrap" style={{ ['--elements-minw' as any]: `${minTableWidth(columns)}px` }}>
            <DataTable<BreakdownElement>
              rows={rows}
              columns={columns}
              onChange={(id, patch) => ops.update(id, patch)}
              selectedId={highlight?.id}
              groupBy={groupBy}
              groupOrder={groupOrder}
              groupHeader={groupBy ? groupHeader : undefined}
              showFooter
              emptyText={
                query || status ? (
                  'No elements match the current filters.'
                ) : (
                  <span>
                    No {g.label.toLowerCase()} yet.{' '}
                    <button type="button" className="btn sm" onClick={addElement}>
                      <Plus /> Add {g.noun}
                    </button>
                  </span>
                )
              }
              rowActions={(e) => {
                const sc = scenesBy.get(e.id) ?? [];
                return [
                  { label: sc.length ? `Open breakdown (scene ${sc[0].number})` : 'Open breakdown', icon: ExternalLink, onClick: () => navigate('breakdown', sc.length ? { sceneId: sc[0].id } : {}) },
                  { label: 'Duplicate', icon: Copy, onClick: () => duplicate(e) },
                  { label: 'Merge into…', icon: Combine, onClick: () => setMerge({ sourceId: e.id }) },
                  { separator: true },
                  { label: 'Delete', icon: Trash2, danger: true, onClick: () => remove(e) },
                ];
              }}
            />
          </div>
        )}
      </div>
      <MergeDialog request={merge} tagged={tagged} sceneCount={sceneCount} onClose={() => setMerge(null)} />
    </div>
  );
}
