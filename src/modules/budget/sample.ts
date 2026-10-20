import type { BudgetLine, ProjectData } from '@/types';
import type { SampleContext } from '@/sample/context';
import { uid } from '@/lib/id';
import { templateBudget } from '@/templates';

type Fill = Partial<Omit<BudgetLine, 'id' | 'description'>>;

/* Micro-budget numbers for the sample short (2 shoot days, reduced crew rates, weekend rentals). */
const FILL: Record<string, Fill> = {
  'Script / writer fee': { qty: 1, rate: 400, actual: 400, notes: 'Paid on signing' },
  Producer: { qty: 2, rate: 150, notes: 'Reduced rate, back-end points' },
  Director: { qty: 2, rate: 250 },
  'Principal cast': { qty: 2, rate: 175, x: 4, fringePct: 10, notes: '4 principals · SAG-AFTRA Short Project · fringe = payroll service fee' },
  'Background / extras': { qty: 1, rate: 75, x: 3, notes: 'Crew background on the roof (Sc. 1 & 3)' },
  '1st AD': { qty: 2, rate: 225 },
  'Production assistants': { qty: 2, rate: 125, x: 2 },
  'Director of Photography': { qty: 3, rate: 275, notes: '1 tech scout + 2 shoot days' },
  '1st AC': { qty: 2, rate: 200 },
  'Camera package rental': { qty: 1, rate: 1100, actual: 1100, notes: 'Lensworks weekend rate (pick up Fri, return Mon = 1-day charge) — Alexa Mini + Cooke S4/i, see Gear list' },
  Gaffer: { qty: 2, rate: 225 },
  'Key Grip': { qty: 2, rate: 200 },
  'Lighting & grip package': { qty: 1, rate: 475, actual: 475, notes: 'Lensworks weekend rate incl. generator' },
  'Sound mixer (with kit)': { qty: 2, rate: 300, notes: 'Day rate includes the mixer’s kit' },
  'Production designer': { qty: 2, rate: 150 },
  'Props & set dressing': { qty: 1, rate: 300, actual: 342, notes: 'Vintage camera rental, script pages, edit-suite dressing' },
  'Wardrobe stylist': { qty: 2, rate: 150 },
  'Wardrobe purchases': { qty: 1, rate: 350, actual: 268, notes: 'Red coat ×2 (hero + double), DP vest, PA hoodies' },
  'HMU artist': { qty: 2, rate: 175 },
  'HMU kit fee': { qty: 2, rate: 25 },
  'Location fees': { qty: 1, rate: 1200, actual: 1200, notes: 'Hollis Building — rooftop + stairwell (deposit paid)' },
  Permits: { qty: 1, rate: 200, actual: 185, notes: 'NYC MOME permit + parking holds' },
  'Vehicle rental': { qty: 4, rate: 95, notes: 'Cargo van Fri–Mon (Enterprise)' },
  'Fuel & parking': { qty: 1, rate: 110 },
  Meals: { qty: 2, rate: 12, x: 18, notes: '18 people × 2 days' },
  'Craft services': { qty: 2, rate: 60 },
  Expendables: { qty: 1, rate: 150, actual: 150 },
  'Hard drives & media': { qty: 3, rate: 120, actual: 360, notes: '3 × 2TB SSD (3-2-1 backups)' },
  Editor: { qty: 5, rate: 160 },
  Colorist: { qty: 1, rate: 350 },
  'Sound design & mix': { qty: 1, rate: 600 },
  'Music licensing / composer': { qty: 1, rate: 300, notes: 'Library track + custom stinger' },
  'Motion graphics': { qty: 1, rate: 150, notes: 'Titles & end credits' },
  'Captions / subtitles': { qty: 1, rate: 60 },
  'Production insurance': { qty: 1, rate: 450, actual: 450, notes: 'Short-term production policy incl. equipment' },
  'Contracts & clearances': { qty: 1, rate: 150 },
  'Misc.': { qty: 1, rate: 100 },
};

/** Adds demo data for the budget module to the sample project (mutates p). */
export async function seedSample(p: ProjectData, _ctx: SampleContext): Promise<void> {
  if (!p.budget.categories.length) p.budget.categories = templateBudget();
  for (const cat of p.budget.categories) {
    for (const line of cat.lines) {
      const f = FILL[line.description];
      if (f) Object.assign(line, f);
    }
  }
  const locations = p.budget.categories.find((c) => c.code === '2700') ?? p.budget.categories.find((c) => /location/i.test(c.name));
  if (locations && !locations.lines.some((l) => /studio 9/i.test(l.description))) {
    locations.lines.push({ id: uid('bl'), description: 'Edit suite — Studio 9 Post (Day 2)', qty: 1, unit: 'day', rate: 400, x: 1 });
  }
  p.budget.contingencyPct = 10;
  p.budget.notes =
    'Micro-budget short, 2 shoot days + 1 tech scout. Crew at reduced day rates (no overtime budgeted — 10-hr days).\n' +
    'Camera & lighting packages at the Lensworks weekend rate (pick up Friday, return Monday, charged as one day).\n' +
    'Cast under the SAG-AFTRA Short Project Agreement; fringe covers the payroll service fee only.\n' +
    'Excluded: festival fees, deliverables beyond the DCP/ProRes master, marketing.';
}
