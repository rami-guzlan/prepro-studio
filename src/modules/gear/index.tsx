/* Gear & Equipment: packing list + rental costs, grouped by category. */
import './gear.css';
import { useMemo, useRef, useState } from 'react';
import { Camera, Copy, FolderInput, Lightbulb, PackageCheck, PackagePlus, Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { GearItem, GearStatus, ID } from '@/types';
import { getProject, listOps, update, useFormatters, useProject } from '@/store/project';
import { useCommand } from '@/lib/commands';
import { GEAR_STATUSES, optionColor } from '@/lib/constants';
import { uid } from '@/lib/id';
import { matchesQuery, naturalCompare, plural } from '@/lib/text';
import { exportGearCsv } from './exports';
import {
  Button,
  DataTable,
  EmptyState,
  ExportMenu,
  Menu,
  ModuleHeader,
  Progress,
  SearchInput,
  Select,
  Toolbar,
  confirmDialog,
  promptDialog,
  toast,
  type Column,
  type MenuItem,
} from '@/ui';
import { GEAR_PRESETS, GEAR_SOURCES, categoryOrder, gearFromLight, gearTotal, lineTotal, planLightImport, planPreset, shootDayCount } from './logic';

const ops = listOps<GearItem>((d) => d.gear, 'gear');

/** Sum of column widths: the table scrolls horizontally instead of squeezing inputs. */
function minTableWidth<T>(cols: Column<T>[], extra = 40): number {
  return cols.filter((c) => !c.hidden).reduce((n, c) => n + (typeof c.width === 'number' ? c.width : c.minWidth ?? 140), extra);
}


export default function GearModule() {
  const gear = useProject((p) => p.gear);
  const crew = useProject((p) => p.crew);
  const contacts = useProject((p) => p.contacts);
  const diagrams = useProject((p) => p.diagrams);
  const schedule = useProject((p) => p.schedule);
  const fmt = useFormatters();

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'' | GearStatus>('');
  const [source, setSource] = useState<'' | GearItem['source']>('');
  const [highlight, setHighlight] = useState<ID | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useCommand('find', () => {
    searchRef.current?.querySelector('input')?.focus();
    return true;
  });

  const defaultDays = shootDayCount({ schedule });
  const crewById = useMemo(() => new Map(crew.map((c) => [c.id, c])), [crew]);
  const order = useMemo(() => categoryOrder(gear), [gear]);
  const currency = useMemo(() => fmt.money(0).replace(/[\d.,\s  ]/g, '') || '$', [fmt]);

  const rows = useMemo(
    () =>
      gear.filter((g) => {
        if (status && g.status !== status) return false;
        if (source && g.source !== source) return false;
        const who = g.assignedTo ? crewById.get(g.assignedTo)?.name ?? '' : '';
        return matchesQuery(`${g.name} ${g.category} ${g.vendor ?? ''} ${g.serial ?? ''} ${g.notes ?? ''} ${who}`, query);
      }),
    [gear, status, source, query, crewById],
  );

  const grand = useMemo(() => gearTotal(gear, defaultDays), [gear, defaultDays]);
  const rentalTotal = useMemo(() => gearTotal(gear.filter((g) => g.source === 'rental'), defaultDays), [gear, defaultDays]);
  const visibleTotal = useMemo(() => gearTotal(rows, defaultDays), [rows, defaultDays]);
  const packed = gear.filter((g) => g.checked).length;
  const lightPlan = useMemo(() => planLightImport({ diagrams, gear }), [diagrams, gear]);

  const vendorSuggestions = useMemo(() => {
    const s = new Set<string>();
    for (const c of contacts) if (c.category === 'rental' || c.category === 'vendor') s.add(c.company || c.name);
    for (const g of gear) if (g.vendor) s.add(g.vendor);
    return [...s].sort(naturalCompare);
  }, [contacts, gear]);
  const crewOptions = useMemo(
    () =>
      [...crew]
        .sort((a, b) => naturalCompare(a.name, b.name))
        .map((c) => ({ value: c.id, label: c.position ? `${c.name} — ${c.position}` : c.name })),
    [crew],
  );

  /* ---------------------------------------------------------------- actions */

  const focusRow = (id: ID) => {
    setHighlight(id);
    requestAnimationFrame(() => {
      const row = bodyRef.current?.querySelector<HTMLElement>('tr.selected');
      row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const input = row?.querySelector<HTMLInputElement>('input.input');
      input?.focus();
      input?.select();
    });
    setTimeout(() => setHighlight((h) => (h === id ? null : h)), 3500);
  };

  const addItem = (category: string) => {
    const item: GearItem = { id: uid('gear'), category, name: '', qty: 1, source: 'owned', status: 'needed' };
    const p = getProject();
    // insert after the last item of the same category so it shows up where expected
    let index = -1;
    p.gear.forEach((g, i) => {
      if ((g.category || 'Other') === category) index = i;
    });
    ops.add(item, index >= 0 ? index + 1 : undefined);
    setQuery('');
    setStatus('');
    setSource('');
    focusRow(item.id);
  };

  const remove = async (g: GearItem) => {
    const ok = await confirmDialog({ title: `Delete ${g.name || 'this item'}?`, message: 'You can bring it back with Undo (Ctrl+Z).', confirmLabel: 'Delete', danger: true });
    if (ok) ops.remove(g.id);
  };

  const moveTo = async (g: GearItem, cat?: string) => {
    let category = cat;
    if (!category) {
      const v = await promptDialog({ title: 'Move to new category', placeholder: 'e.g. Special Equipment', confirmLabel: 'Move' });
      category = v?.trim();
    }
    if (!category) return;
    ops.update(g.id, { category }, false);
  };

  const importLights = async () => {
    const plan = planLightImport(getProject());
    if (!plan.lights.length) {
      toast('No lights on the lighting diagrams yet', 'info');
      return;
    }
    if (!plan.add.length) {
      toast(`All ${plural(plan.lights.length, 'light')} from the diagrams are already on the list`, 'info');
      return;
    }
    const ok = await confirmDialog({
      title: 'Import lights from lighting diagrams',
      message: (
        <div className="col" style={{ gap: 8 }}>
          <div>
            Add {plural(plan.add.length, 'fixture')} to <b>Lighting</b>:
          </div>
          <ul className="gear-importlist">
            {plan.add.map((l) => (
              <li key={l.name}>
                <b>{l.qty}×</b> {l.name}
                {l.diagrams.length > 0 && <span className="muted"> — {l.diagrams.join(', ')}</span>}
              </li>
            ))}
          </ul>
          {plan.skip.length > 0 && <div className="small muted">Already on the list (skipped): {plan.skip.map((l) => l.name).join(', ')}</div>}
          <div className="small muted">Quantities use the most units of each fixture needed in any single diagram.</div>
        </div>
      ),
      confirmLabel: `Add ${plural(plan.add.length, 'light')}`,
    });
    if (!ok) return;
    const items = plan.add.map(gearFromLight);
    update((d) => {
      let index = -1;
      d.gear.forEach((g, i) => {
        if ((g.category || '').toLowerCase() === 'lighting') index = i;
      });
      d.gear.splice(index >= 0 ? index + 1 : d.gear.length, 0, ...(items as typeof d.gear));
    });
    toast(`Added ${plural(items.length, 'light')} from lighting diagrams`);
  };

  const addPreset = (id: string) => {
    const preset = GEAR_PRESETS.find((x) => x.id === id);
    if (!preset) return;
    const { add, skipped } = planPreset(preset, getProject().gear);
    if (!add.length) {
      toast(`Everything in the ${preset.label.toLowerCase()} is already on the list`, 'info');
      return;
    }
    update((d) => {
      d.gear.push(...(add as typeof d.gear));
    });
    toast(`Added ${plural(add.length, 'item')} from ${preset.label}${skipped ? ` (${skipped} already on the list)` : ''}`);
  };

  const resetPacked = async () => {
    const ok = await confirmDialog({
      title: 'Reset packed checkboxes?',
      message: `Un-checks all ${plural(packed, 'packed item')} so you can run the checklist again (e.g. at wrap or for the next shoot).`,
      confirmLabel: 'Reset',
    });
    if (!ok) return;
    update((d) => {
      for (const g of d.gear) if (g.checked) g.checked = false;
    });
  };

  /* ---------------------------------------------------------------- table */

  const statusColumn: Column<GearItem> = {
    key: 'status',
    header: 'Status',
    width: 130,
    sortValue: (g) => GEAR_STATUSES.findIndex((s) => s.value === g.status),
    render: (g) => (
      <div className="row" style={{ gap: 6 }}>
        <span className="color-dot" style={{ background: optionColor(GEAR_STATUSES, g.status) ?? 'var(--border-strong)', width: 8, height: 8 }} />
        <Select bare size="sm" value={g.status} options={GEAR_STATUSES} onChange={(v) => ops.update(g.id, { status: v as GearStatus }, false)} />
      </div>
    ),
  };

  const columns: Column<GearItem>[] = [
    { key: 'checked', header: <PackageCheck size={14} aria-label="Packed" />, type: 'checkbox', width: 40, align: 'center', sortValue: (g) => (g.checked ? 1 : 0) },
    { key: 'name', header: 'Item', type: 'text', width: 250, placeholder: 'Item name', footer: plural(rows.length, 'item') },
    { key: 'qty', header: 'Qty', type: 'number', width: 60, set: (v) => ({ qty: v == null ? 1 : Math.max(0, Math.round(v)) }), footer: fmt.number(rows.reduce((n, g) => n + (g.qty ?? 0), 0)) },
    { key: 'source', header: 'Source', type: 'select', width: 104, options: GEAR_SOURCES, set: (v) => ({ source: (v || 'owned') as GearItem['source'] }) },
    { key: 'vendor', header: 'Vendor', type: 'combo', width: 160, suggestions: vendorSuggestions, placeholder: 'Vendor' },
    { key: 'dayRate', header: 'Day rate', type: 'money', width: 100, prefix: currency },
    { key: 'days', header: 'Days', type: 'number', width: 64, placeholder: String(Math.max(1, defaultDays)), set: (v) => ({ days: v == null ? undefined : Math.max(0, v) }) },
    { key: 'flatCost', header: 'Flat cost', type: 'money', width: 100, prefix: currency },
    {
      key: 'total',
      header: 'Total',
      width: 110,
      align: 'right',
      sortValue: (g) => lineTotal(g, defaultDays),
      render: (g) => {
        const t = lineTotal(g, defaultDays);
        return <span className={t ? 'gear-total' : 'muted'}>{t ? fmt.money(t) : '—'}</span>;
      },
      footer: fmt.money(visibleTotal),
    },
    statusColumn,
    { key: 'assignedTo', header: 'Assigned to', type: 'select', width: 170, options: crewOptions, placeholder: '—', set: (v) => ({ assignedTo: v || undefined }) },
    { key: 'serial', header: 'Serial #', type: 'text', width: 120, placeholder: 'Serial' },
    { key: 'notes', header: 'Notes', type: 'textarea', minWidth: 180, placeholder: 'Notes' },
  ];

  const rowActions = (g: GearItem): MenuItem[] => [
    {
      label: 'Duplicate',
      icon: Copy,
      onClick: () => {
        const c = ops.duplicate(g.id, () => uid('gear'));
        if (c) focusRow(c.id);
      },
    },
    { separator: true },
    { header: 'Move to category' },
    ...order
      .filter((c) => c !== (g.category || 'Other'))
      .slice(0, 18)
      .map((c): MenuItem => ({ label: c, icon: FolderInput, onClick: () => moveTo(g, c) })),
    { label: 'New category…', icon: Plus, onClick: () => moveTo(g) },
    { separator: true },
    { label: 'Delete', icon: Trash2, danger: true, onClick: () => remove(g) },
  ];

  const presetMenu: MenuItem[] = [
    { header: 'Add a kit' },
    ...GEAR_PRESETS.map((pr): MenuItem => ({ label: `${pr.label} — ${pr.items.length} items`, icon: PackagePlus, onClick: () => addPreset(pr.id) })),
  ];
  const addMenu: MenuItem[] = [{ header: 'Add to category' }, ...order.map((c): MenuItem => ({ label: c, onClick: () => addItem(c) }))];

  const subtitle = gear.length
    ? `${plural(gear.length, 'item')} · ${packed}/${gear.length} packed · ${fmt.money(grand)}${rentalTotal && rentalTotal !== grand ? ` (rentals ${fmt.money(rentalTotal)})` : ''}`
    : 'Equipment lists & rentals';

  const header = (
    <ModuleHeader
      title="Gear & Equipment"
      icon={Camera}
      subtitle={subtitle}
      actions={
        <>
          <ExportMenu
            docs={[
              { id: 'gear-list', label: 'Gear list (with costs)', options: { showCosts: true } },
              { id: 'gear-list', label: 'Packing list (no costs)', options: { showCosts: false } },
              { id: 'rental-order', label: 'Rental order' },
            ]}
            csv={[{ label: 'Gear list (CSV)', onClick: exportGearCsv }]}
          />
          <Menu trigger={<Button icon={PackagePlus}>Add from preset</Button>} items={presetMenu} align="end" />
          <Menu trigger={<Button variant="primary" icon={Plus}>Add item</Button>} items={addMenu} align="end" />
        </>
      }
    />
  );

  if (gear.length === 0) {
    return (
      <div className="module">
        {header}
        <div className="module-body">
          <EmptyState
            icon={Camera}
            title="No gear yet"
            description="Start from a kit preset, pull the lights from your lighting diagrams, or add items one by one. Day rates × shoot days add up automatically."
            action={
              <div className="row wrap" style={{ justifyContent: 'center' }}>
                <Menu trigger={<Button variant="primary" icon={PackagePlus}>Add from preset</Button>} items={presetMenu} />
                <Button icon={Lightbulb} disabled={!lightPlan.add.length} onClick={importLights} title={lightPlan.lights.length ? undefined : 'No lights on the lighting diagrams yet'}>
                  Import lights{lightPlan.add.length ? ` (${lightPlan.add.length})` : ''}
                </Button>
                <Button icon={Plus} onClick={() => addItem('Camera')}>
                  Add item
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
      <Toolbar>
        <div ref={searchRef}>
          <SearchInput value={query} onChange={setQuery} placeholder="Search gear…" />
        </div>
        <Select value={status} onChange={(v) => setStatus(v as '' | GearStatus)} placeholder="All statuses" options={GEAR_STATUSES} style={{ width: 140 }} />
        <Select value={source} onChange={(v) => setSource(v as '' | GearItem['source'])} placeholder="All sources" options={GEAR_SOURCES} style={{ width: 130 }} />
        <Button
          icon={Lightbulb}
          onClick={importLights}
          disabled={!lightPlan.lights.length}
          title={lightPlan.lights.length ? `${plural(lightPlan.lights.length, 'fixture')} on lighting diagrams · ${lightPlan.add.length} not on this list yet` : 'No lights on the lighting diagrams yet'}
        >
          Import lights from diagrams{lightPlan.add.length ? ` (${lightPlan.add.length})` : ''}
        </Button>
        <Button icon={RotateCcw} onClick={resetPacked} disabled={!packed}>
          Reset packed
        </Button>
        <span className="spacer" />
        <div className="gear-packed" title={`${packed} of ${gear.length} items packed`}>
          <span className="small">
            <b>{packed}</b>/{gear.length} packed
          </span>
          <Progress value={gear.length ? packed / gear.length : 0} color={packed === gear.length ? 'var(--success)' : undefined} style={{ width: 110 }} />
        </div>
      </Toolbar>
      <div className="module-body padded" ref={bodyRef}>
        <div className="gear-tablewrap" style={{ ['--gear-minw' as any]: `${minTableWidth(columns, 64)}px` }}>
          <DataTable<GearItem>
            rows={rows}
            columns={columns}
            onChange={(id, patch) => ops.update(id, patch)}
            onReorder={(id, beforeId) => ops.moveBefore(id, beforeId)}
            rowActions={rowActions}
            selectedId={highlight ?? undefined}
            groupBy={(g) => g.category || 'Other'}
            groupOrder={order}
            groupHeader={(cat, list) => {
              const sub = gearTotal(list, defaultDays);
              const done = list.filter((g) => g.checked).length;
              return (
                <div className="row gear-grouphead">
                  <span>{cat}</span>
                  {sub > 0 && <span className="gear-groupsum">{fmt.money(sub)}</span>}
                  <span className="muted" style={{ fontWeight: 500 }}>
                    {plural(list.length, 'item')} · {done}/{list.length} packed
                  </span>
                  <button type="button" className="btn ghost sm" onClick={() => addItem(cat)} title={`Add an item to ${cat}`}>
                    <Plus /> Add
                  </button>
                </div>
              );
            }}
            rowStyle={(g) => (g.checked ? { opacity: 0.72 } : undefined)}
            showFooter
            emptyText={query || status || source ? 'No gear matches the current filters.' : 'No gear yet.'}
          />
        </div>
        <div className="gear-foot muted small">
          Line total = flat cost + day rate × days × qty. Empty “Days” uses the {plural(Math.max(1, defaultDays), 'shoot day')} in the schedule
          {defaultDays === 0 ? ' (no shoot days scheduled yet, so 1 day)' : ''}. Drag rows to reorder; use the row menu to move an item to another category.
        </div>
      </div>
    </div>
  );
}
