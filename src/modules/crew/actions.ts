/* Data operations of the Crew module. */
import type { CrewMember, ID } from '@/types';
import { getProject, undo, update } from '@/store/project';
import { CREW_STATUSES, optionLabel, RATE_UNITS } from '@/lib/constants';
import type { CsvColumn } from '@/lib/csv';
import { uid } from '@/lib/id';
import { confirmDialog, toast } from '@/ui';
import { crewSorted } from './data';
import { saveCsv } from './util';

export function addCrewMember(partial?: Partial<CrewMember>): ID {
  const id = uid('crew');
  const member: CrewMember = { id, name: '', department: 'Production', position: '', status: 'considering', ...partial };
  update((d) => {
    // insert after the last member of the same department so the list stays grouped
    let at = -1;
    d.crew.forEach((c, i) => {
      if ((c.department || 'Other') === member.department) at = i;
    });
    if (at < 0) d.crew.push(member);
    else d.crew.splice(at + 1, 0, member);
  });
  return id;
}

export function addPositions(list: [string, string][]): number {
  if (!list.length) return 0;
  const members: CrewMember[] = list.map(([department, position]) => ({ id: uid('crew'), name: '', department, position, status: 'considering' }));
  update((d) => {
    for (const m of members) {
      let at = -1;
      d.crew.forEach((c, i) => {
        if ((c.department || 'Other') === m.department) at = i;
      });
      if (at < 0) d.crew.push(m);
      else d.crew.splice(at + 1, 0, m);
    }
  });
  toast(`Added ${members.length} ${members.length === 1 ? 'position' : 'positions'} — fill in the names as you hire`, 'success', {
    action: { label: 'Undo', onClick: () => undo() },
  });
  return members.length;
}

export function duplicateCrewMember(id: ID): ID | undefined {
  const src = getProject().crew.find((m) => m.id === id);
  if (!src) return undefined;
  const copy: CrewMember = { ...(JSON.parse(JSON.stringify(src)) as CrewMember), id: uid('crew'), name: src.name ? `${src.name} (copy)` : '' };
  update((d) => {
    const i = d.crew.findIndex((m) => m.id === id);
    d.crew.splice(i < 0 ? d.crew.length : i + 1, 0, copy);
  });
  return copy.id;
}

export async function deleteCrewMember(id: ID): Promise<boolean> {
  const p = getProject();
  const m = p.crew.find((x) => x.id === id);
  if (!m) return false;
  const label = m.name || m.position || 'this crew member';
  const gear = (p.gear ?? []).filter((g) => g.assignedTo === id).length;
  const ok = await confirmDialog({
    title: `Delete ${label}?`,
    message: `${m.position ? `${m.position} · ` : ''}${m.department}${gear ? `\n${gear} gear ${gear === 1 ? 'item is' : 'items are'} assigned to them and will become unassigned.` : ''}`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return false;
  update((d) => {
    d.crew = d.crew.filter((x) => x.id !== id);
    for (const g of d.gear ?? []) if (g.assignedTo === id) delete g.assignedTo;
  });
  toast(`Deleted ${label}`, 'success', { action: { label: 'Undo', onClick: () => undo() } });
  return true;
}

export function exportCrewCsv() {
  const p = getProject();
  const cols: CsvColumn<CrewMember>[] = [
    { header: 'Department', value: (m) => m.department },
    { header: 'Position', value: (m) => m.position },
    { header: 'Name', value: (m) => m.name },
    { header: 'Status', value: (m) => optionLabel(CREW_STATUSES, m.status) },
    { header: 'Pronouns', value: (m) => m.pronouns },
    { header: 'Phone', value: (m) => m.phone },
    { header: 'Email', value: (m) => m.email },
    { header: 'Address', value: (m) => m.address },
    { header: 'Union', value: (m) => m.union },
    { header: 'Rate', value: (m) => m.rate },
    { header: 'Rate unit', value: (m) => (m.rateUnit ? optionLabel(RATE_UNITS, m.rateUnit).replace(/^\/\s*/, '') : '') },
    { header: 'Default call', value: (m) => m.defaultCall },
    { header: 'Deal memo', value: (m) => !!m.dealMemo },
    { header: 'Kit', value: (m) => m.kit },
    { header: 'Dietary', value: (m) => m.dietary },
    { header: 'Allergies', value: (m) => m.allergies },
    { header: 'Emergency contact', value: (m) => m.emergencyName },
    { header: 'Emergency phone', value: (m) => m.emergencyPhone },
    { header: 'Notes', value: (m) => m.notes },
  ];
  return saveCsv(p.meta.title, 'Crew', crewSorted(p.crew), cols);
}
