import type { CrewMember, ProjectData } from '@/types';
import type { SampleContext } from '@/sample/context';
import { uid } from '@/lib/id';

const DETAILS: Record<string, Partial<CrewMember>> = {
  'Elena Ward': {
    pronouns: 'she/her',
    union: 'DGA',
    dietary: 'Pescatarian',
    emergencyName: 'Tom Ward (partner)',
    emergencyPhone: '(555) 010-3901',
    notes: 'Writer/director. Final say on takes; prefers playback on the 17" monitor, not the onboard.',
  },
  'Marcus Chen': {
    pronouns: 'he/him',
    address: '77 Water St, Suite 410, Brooklyn, NY 11201',
    emergencyName: 'Lily Chen (sister)',
    emergencyPhone: '(555) 010-3902',
    notes: 'Holds the location agreement and certificate of insurance — call before any company move.',
  },
  'Tasha Brooks': {
    pronouns: 'she/her',
    kit: 'Walkies ×8 with surveillance earpieces, bullhorn, first-aid kit, sides printer.',
    emergencyName: 'Dion Brooks (brother)',
    emergencyPhone: '(555) 010-3903',
  },
  'Ivan Petrov': {
    pronouns: 'he/him',
    union: 'IATSE Local 600',
    kit: 'Owner/operator: ARRI Alexa Mini LF package, Cooke Panchro/i Classic primes (18–135), 2× SmallHD Cine 7, wireless follow focus. Kit fee $450/day.',
    dietary: 'No restrictions',
    emergencyName: 'Marta Petrova (wife)',
    emergencyPhone: '(555) 010-3904',
  },
  'Mia Santos': {
    pronouns: 'she/her',
    kit: 'AC cart, Teradek Bolt 6 XT, slate, 4× CFexpress cards, focus marks kit.',
    dietary: 'Vegetarian',
  },
  'Luis Ortega': {
    pronouns: 'he/him',
    union: 'IATSE Local 52',
    kit: '2× Aputure 600d Pro, 2× Nova P300c, 4× C-stands, 12×12 frame with ultrabounce, Honda EU7000 generator, cable package.',
    emergencyName: 'Rosa Ortega (mother)',
    emergencyPhone: '(555) 010-3906',
  },
  'Hannah Moore': {
    pronouns: 'she/her',
    kit: 'Grip truck (1-ton), sandbags ×20, apple boxes, rooftop-safe weight kit, safety harness.',
    allergies: 'Bee stings (carries EpiPen)',
    emergencyName: 'Sean Moore (husband)',
    emergencyPhone: '(555) 010-3907',
  },
  'Karim Haddad': {
    pronouns: 'he/him',
    kit: 'Sound Devices 888, Sennheiser MKH 50 + MKH 416, 3× Lectrosonics wireless, Rycote windshields (rooftop wind!), timecode boxes.',
    dietary: 'Halal',
  },
  'Grace Liu': {
    pronouns: 'she/her',
    kit: 'Full HMU kit, set chair, airbrush, 1960s hair styling tools, touch-up bags.',
    notes: 'Needs a power outlet and a mirror near the stairwell for touch-ups between climbs.',
  },
  'Nina Patel': {
    pronouns: 'she/her',
    kit: 'Rolling rack, steamer, sewing kit, two red coats (hero + stunt/double).',
    emergencyName: 'Raj Patel (father)',
    emergencyPhone: '(555) 010-3910',
  },
  'Ben Carter': {
    pronouns: 'he/him',
    dietary: 'Vegan',
    notes: 'Has a van — handles the craft/water run and the Lensworks pickup on Nov 6.',
  },
  'Chloe Martin': {
    pronouns: 'she/her',
    kit: 'DaVinci Resolve suite at Studio 9; will receive dailies on shuttle drives.',
  },
};

/** Adds demo data for the crew module to the sample project (mutates p). */
export async function seedSample(p: ProjectData, _ctx: SampleContext): Promise<void> {
  for (const c of p.crew) {
    const d = DETAILS[c.name];
    if (d) Object.assign(c, d);
  }
  // a boom operator on hold so hiring statuses show up in the sample
  const boomAt = p.crew.findIndex((c) => c.department === 'Sound');
  const boom: CrewMember = {
    id: uid('crew'),
    name: 'Jamie Flores',
    department: 'Sound',
    position: 'Boom Operator',
    status: 'hold',
    phone: '(555) 010-3022',
    email: 'jamie@crew.example',
    rate: 450,
    rateUnit: 'day',
    defaultCall: '07:00',
    notes: 'On hold for Nov 7 — confirming by Oct 30.',
  };
  if (boomAt >= 0) p.crew.splice(boomAt + 1, 0, boom);
  else p.crew.push(boom);
}
