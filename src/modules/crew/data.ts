/* Pure data helpers for the Crew module (safe for print docs). */
import type { CrewMember } from '@/types';
import { DEPARTMENTS, POSITIONS_BY_DEPT } from '@/lib/constants';
import { crewByDepartment } from '@/derived/project';

export interface CrewTemplate {
  id: string;
  label: string;
  description: string;
  /** [department, position] */
  positions: [string, string][];
}

export const CREW_TEMPLATES: CrewTemplate[] = [
  {
    id: 'small',
    label: 'Small crew',
    description: 'Run-and-gun essentials for a doc, interview or micro-short.',
    positions: [
      ['Direction', 'Director'],
      ['Production', 'Producer'],
      ['Camera', 'Director of Photography'],
      ['Electric', 'Gaffer'],
      ['Sound', 'Production Sound Mixer'],
      ['Production', 'Production Assistant'],
    ],
  },
  {
    id: 'commercial',
    label: 'Commercial / corporate',
    description: 'Client-facing shoot with agency, DIT, hair & makeup and wardrobe.',
    positions: [
      ['Client / Agency', 'Client'],
      ['Client / Agency', 'Agency Producer'],
      ['Production', 'Executive Producer'],
      ['Production', 'Producer'],
      ['Production', 'Production Coordinator'],
      ['Production', 'Production Assistant'],
      ['Direction', 'Director'],
      ['Direction', '1st Assistant Director'],
      ['Camera', 'Director of Photography'],
      ['Camera', '1st AC (Focus Puller)'],
      ['Camera', 'DIT'],
      ['Grip', 'Key Grip'],
      ['Electric', 'Gaffer'],
      ['Sound', 'Production Sound Mixer'],
      ['Art', 'Art Director'],
      ['Wardrobe', 'Wardrobe Supervisor'],
      ['Hair & Makeup', 'Key Makeup Artist'],
      ['Catering / Craft', 'Craft Services'],
      ['Post-production', 'Editor'],
    ],
  },
  {
    id: 'narrative',
    label: 'Full narrative',
    description: 'Scripted short or feature with every core department staffed.',
    positions: [
      ['Production', 'Producer'],
      ['Production', 'Line Producer'],
      ['Production', 'Production Manager'],
      ['Production', 'Production Coordinator'],
      ['Production', 'Production Assistant'],
      ['Production', 'Production Assistant'],
      ['Direction', 'Director'],
      ['Direction', '1st Assistant Director'],
      ['Direction', '2nd Assistant Director'],
      ['Direction', 'Script Supervisor'],
      ['Camera', 'Director of Photography'],
      ['Camera', 'Camera Operator'],
      ['Camera', '1st AC (Focus Puller)'],
      ['Camera', '2nd AC'],
      ['Camera', 'DIT'],
      ['Camera', 'Still Photographer'],
      ['Grip', 'Key Grip'],
      ['Grip', 'Best Boy Grip'],
      ['Grip', 'Dolly Grip'],
      ['Electric', 'Gaffer'],
      ['Electric', 'Best Boy Electric'],
      ['Electric', 'Electrician'],
      ['Sound', 'Production Sound Mixer'],
      ['Sound', 'Boom Operator'],
      ['Art', 'Production Designer'],
      ['Art', 'Art Director'],
      ['Art', 'Set Decorator'],
      ['Art', 'Set Dresser'],
      ['Props', 'Prop Master'],
      ['Wardrobe', 'Costume Designer'],
      ['Wardrobe', 'Wardrobe Supervisor'],
      ['Hair & Makeup', 'Key Makeup Artist'],
      ['Hair & Makeup', 'Key Hair Stylist'],
      ['Locations', 'Location Manager'],
      ['Transportation', 'Transportation Coordinator'],
      ['Catering / Craft', 'Caterer'],
      ['Catering / Craft', 'Craft Services'],
      ['Post-production', 'Editor'],
      ['Other', 'Medic'],
    ],
  },
];

/** All standard positions of a department as [department, position] pairs. */
export function departmentPositions(dept: string): [string, string][] {
  return (POSITIONS_BY_DEPT[dept] ?? []).map((p) => [dept, p]);
}

export const ALL_POSITIONS: string[] = Object.values(POSITIONS_BY_DEPT).flat();

/** Departments in standard order, plus any custom ones used by the crew. */
export function departmentOrder(crew: CrewMember[]): string[] {
  const out: string[] = [...DEPARTMENTS];
  for (const c of crew) if (c.department && !out.includes(c.department)) out.push(c.department);
  return out;
}

/** Crew flattened in department order (stored order within a department). */
export function crewSorted(crew: CrewMember[]): CrewMember[] {
  return crewByDepartment(crew, DEPARTMENTS).flatMap(([, list]) => list);
}

export function deptOf(c: CrewMember): string {
  return c.department || 'Other';
}
