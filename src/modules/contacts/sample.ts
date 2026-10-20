import type { Contact, ProjectData } from '@/types';
import type { SampleContext } from '@/sample/context';
import { uid } from '@/lib/id';

const EXTRA: Record<string, Partial<Contact>> = {
  'Lensworks Rentals': {
    website: 'lensworks.example',
    notes: 'Camera + lighting package. Pickup Fri Nov 6, 4 PM; return Mon Nov 9 by noon. COI on file.',
  },
  'Hollis Building Management': {
    address: '418 Hollis Ave, Brooklyn, NY 11211',
    notes: 'Roof access 6 AM–8 PM. Needs 48 h notice for any change of dates.',
  },
  'Prop House NYC': {
    role: 'Prop rentals',
    address: '240 Banker St, Brooklyn, NY 11222',
    website: 'prophouse.example',
    notes: 'Vintage 16mm camera on hold under "Golden Hour / Last Take".',
  },
  'Studio 9 Post': {
    address: '77 Water St, Brooklyn, NY 11201',
    website: 'studio9.example',
    notes: 'Suite B booked for the edit-suite scene and for the offline edit.',
  },
};

/** Adds demo data for the contacts module to the sample project (mutates p). */
export async function seedSample(p: ProjectData, _ctx: SampleContext): Promise<void> {
  for (const c of p.contacts) {
    const extra = c.company ? EXTRA[c.company] : undefined;
    if (!extra) continue;
    for (const [k, v] of Object.entries(extra) as [keyof Contact, string][]) {
      if (!(c as any)[k]) (c as any)[k] = v;
    }
  }
  p.contacts.push(
    {
      id: uid('ct'),
      name: 'Teresa Delgado',
      company: 'Kettle & Crumb Catering',
      role: 'Owner',
      category: 'vendor',
      phone: '(555) 010-7420',
      email: 'orders@kettlecrumb.example',
      address: '19 Grand St, Brooklyn, NY 11249',
      website: 'kettlecrumb.example',
      notes: 'Hot lunch for 22 on Nov 7 at 12:30. 3 vegetarian, 2 vegan, 1 gluten-free, 1 halal, 1 no pork. Delivers to the lobby only — PAs carry up.',
    },
    {
      id: uid('ct'),
      name: 'Nadia Shah',
      company: 'Reel Cover Insurance',
      role: 'Production insurance broker',
      category: 'other',
      phone: '(555) 010-7555',
      email: 'nadia@reelcover.example',
      notes: 'Short-term production policy + COIs for Hollis Building and Lensworks.',
    },
  );
}
