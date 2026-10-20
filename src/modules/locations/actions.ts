/* Data operations of the Locations module. */
import type { ID, Location } from '@/types';
import { getProject, undo, update } from '@/store/project';
import { LOCATION_STATUSES, optionLabel } from '@/lib/constants';
import type { CsvColumn } from '@/lib/csv';
import { uid } from '@/lib/id';
import { titleCase } from '@/lib/text';
import { confirmDialog, toast } from '@/ui';
import { LOCATION_KINDS, PERMIT_STATUSES } from './data';
import { saveCsv } from './util';

export function addLocation(partial?: Partial<Location>): ID {
  const id = uid('loc');
  const loc: Location = { id, name: '', status: 'scouting', photos: [], sets: [], ...partial };
  update((d) => {
    d.locations.push(loc);
  });
  return id;
}

/** New location named after a set, with that set assigned (removed from any other location). */
export function addLocationForSet(set: string): ID {
  const id = uid('loc');
  const key = set.toUpperCase();
  update((d) => {
    for (const l of d.locations) l.sets = (l.sets ?? []).filter((s) => s.toUpperCase() !== key);
    d.locations.push({ id, name: titleCase(set), status: 'scouting', photos: [], sets: [key] });
  });
  return id;
}

export function duplicateLocation(id: ID): ID | undefined {
  const src = getProject().locations.find((l) => l.id === id);
  if (!src) return undefined;
  // sets stay with the original so set → location stays unambiguous
  const copy: Location = { ...(JSON.parse(JSON.stringify(src)) as Location), id: uid('loc'), name: src.name ? `${src.name} (copy)` : '', sets: [] };
  update((d) => {
    const i = d.locations.findIndex((l) => l.id === id);
    d.locations.splice(i < 0 ? d.locations.length : i + 1, 0, copy);
  });
  return copy.id;
}

export async function deleteLocation(id: ID): Promise<boolean> {
  const l = getProject().locations.find((x) => x.id === id);
  if (!l) return false;
  const label = l.name || 'this location';
  const ok = await confirmDialog({
    title: `Delete ${label}?`,
    message: l.sets?.length ? `Its sets (${l.sets.join(', ')}) will become unassigned.` : 'Photos and scouting details for this location will be removed.',
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return false;
  update((d) => {
    d.locations = d.locations.filter((x) => x.id !== id);
    for (const sm of Object.values(d.scenes)) if (sm.locationId === id) delete sm.locationId;
    for (const cs of Object.values(d.callSheets ?? {})) if (cs.locationIds?.includes(id)) cs.locationIds = cs.locationIds.filter((x) => x !== id);
    for (const sh of d.shots ?? []) if (sh.locationId === id) delete sh.locationId;
    for (const dg of d.diagrams ?? []) if (dg.locationId === id) delete dg.locationId;
  });
  toast(`Deleted ${label}`, 'success', { action: { label: 'Undo', onClick: () => undo() } });
  return true;
}

/** Assign a set to a location (null = unassign). A set belongs to one location at a time. */
export function assignSet(set: string, locId: ID | null) {
  const key = set.trim().toUpperCase();
  if (!key) return;
  const p = getProject();
  const prev = p.locations.find((l) => l.id !== locId && (l.sets ?? []).some((s) => s.toUpperCase() === key));
  const target = locId ? p.locations.find((l) => l.id === locId) : undefined;
  update((d) => {
    for (const l of d.locations) {
      if (l.id === locId) continue;
      if ((l.sets ?? []).some((s) => s.toUpperCase() === key)) l.sets = l.sets.filter((s) => s.toUpperCase() !== key);
    }
    if (locId) {
      const l = d.locations.find((x) => x.id === locId);
      if (l) {
        l.sets ??= [];
        if (!l.sets.some((s) => s.toUpperCase() === key)) l.sets.push(key);
      }
    }
  });
  if (prev && target) toast(`${key} moved from ${prev.name || 'another location'} to ${target.name || 'this location'}`, 'info');
}

export function removeSet(locId: ID, set: string) {
  const key = set.toUpperCase();
  update((d) => {
    const l = d.locations.find((x) => x.id === locId);
    if (l) l.sets = (l.sets ?? []).filter((s) => s.toUpperCase() !== key);
  });
}

export function exportLocationsCsv() {
  const p = getProject();
  const cols: CsvColumn<Location>[] = [
    { header: 'Name', value: (l) => l.name },
    { header: 'Status', value: (l) => optionLabel(LOCATION_STATUSES, l.status) },
    { header: 'Kind', value: (l) => (l.kind ? optionLabel(LOCATION_KINDS, l.kind) : '') },
    { header: 'Address', value: (l) => l.address },
    { header: 'Latitude', value: (l) => l.lat },
    { header: 'Longitude', value: (l) => l.lng },
    { header: 'Sets', value: (l) => (l.sets ?? []).join(', ') },
    { header: 'Contact', value: (l) => l.contactName },
    { header: 'Contact phone', value: (l) => l.contactPhone },
    { header: 'Contact email', value: (l) => l.contactEmail },
    { header: 'Fee', value: (l) => l.fee },
    { header: 'Permit required', value: (l) => !!l.permitRequired },
    { header: 'Permit status', value: (l) => (l.permitStatus ? optionLabel(PERMIT_STATUSES, l.permitStatus) : '') },
    { header: 'Availability', value: (l) => l.availability },
    { header: 'Parking', value: (l) => l.parking },
    { header: 'Power', value: (l) => l.power },
    { header: 'Restrooms', value: (l) => l.restrooms },
    { header: 'Load-in', value: (l) => l.loadIn },
    { header: 'Wi-Fi', value: (l) => l.wifi },
    { header: 'Hospital', value: (l) => l.hospital?.name },
    { header: 'Hospital address', value: (l) => l.hospital?.address },
    { header: 'Hospital phone', value: (l) => l.hospital?.phone },
    { header: 'Photos', value: (l) => l.photos?.length ?? 0 },
    { header: 'Tech scout notes', value: (l) => l.scoutNotes },
    { header: 'Notes', value: (l) => l.notes },
  ];
  return saveCsv(p.meta.title, 'Locations', p.locations, cols);
}
