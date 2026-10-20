import type { GearItem, ProjectData } from '@/types';
import type { SampleContext } from '@/sample/context';
import { uid } from '@/lib/id';

const LW = 'Lensworks Rentals';

/** Adds demo data for the gear module to the sample project (mutates p). */
export async function seedSample(p: ProjectData, _ctx: SampleContext): Promise<void> {
  const crew = (position: RegExp) => p.crew.find((c) => position.test(c.position))?.id;
  const ac = crew(/1st AC/i);
  const dp = crew(/Director of Photography/i);
  const gaffer = crew(/Gaffer/i);
  const grip = crew(/Key Grip/i);
  const sound = crew(/Sound Mixer/i);
  const pa = crew(/Production Assistant/i);

  const G = (category: string, name: string, extra: Partial<GearItem> = {}): GearItem => ({
    id: uid('gear'),
    category,
    name,
    qty: 1,
    source: 'rental',
    vendor: LW,
    status: 'confirmed',
    days: 1,
    ...extra,
  });
  const owned = { source: 'owned' as const, vendor: undefined, days: undefined, status: 'confirmed' as const };

  // Lensworks gives a weekend rate: pick up Friday, return Monday, charged as 1 day.
  p.gear = [
    // camera
    G('Camera', 'ARRI Alexa Mini (body + accessories)', { dayRate: 350, assignedTo: ac, serial: 'AMN-4471', checked: true, notes: 'Weekend rate: pick up Fri, return Mon (1-day charge). 4K 2.39 sensor crop, ProRes 4444.' }),
    G('Camera', 'Matte box + follow focus', { dayRate: 35, assignedTo: ac, checked: true }),
    G('Camera', 'Wireless follow focus (Teradek RT)', { dayRate: 60, assignedTo: ac, serial: 'TRT-20915', checked: true }),
    // lenses
    G('Lenses', 'Cooke S4/i prime set (18, 25, 32, 50, 75, 100mm)', { dayRate: 250, assignedTo: ac, serial: 'CK-S4-0193', checked: true, notes: 'Check back focus at the rental house.' }),
    G('Lenses', 'Filter kit: ND 0.3–1.2, Pola, Black Pro-Mist 1/8', { dayRate: 30, assignedTo: ac }),
    // support
    G('Camera Support', 'O’Connor 2575 head + standard / baby legs + hi-hat', { dayRate: 75, assignedTo: ac }),
    G('Camera Support', 'Easyrig Vario 5', { dayRate: 45, assignedTo: dp, status: 'reserved', notes: 'For the stairwell follow (Sc. 2).' }),
    // monitoring
    G('Monitoring', 'Wireless video (Teradek Bolt 6) TX + 2 RX', { dayRate: 90, assignedTo: ac }),
    G('Monitoring', 'Director’s monitor 17" + stand', { dayRate: 40, assignedTo: pa }),
    // power
    G('Power', 'V-mount batteries 150Wh', { qty: 8, dayRate: 8, assignedTo: ac, checked: true }),
    G('Power', 'Dual V-mount chargers', { qty: 2, dayRate: 8, assignedTo: ac }),
    G('Power', 'Honda EU2200i generator (putt-putt)', { dayRate: 75, assignedTo: gaffer, status: 'reserved', notes: 'Backup for the roof — only two 20A circuits up there.' }),
    G('Power', 'Stingers 25 ft', { ...owned, qty: 6, assignedTo: gaffer }),
    // media
    G('Media & Storage', 'CFast 2.0 cards 256GB', { qty: 4, dayRate: 12, assignedTo: ac, checked: true }),
    G('Media & Storage', 'Backup SSDs 2TB', { qty: 3, source: 'purchase', vendor: 'B&H Photo', days: undefined, flatCost: 360, status: 'picked_up', assignedTo: ac }),
    G('Media & Storage', 'DIT laptop + RAID + card readers', { ...owned, assignedTo: ac, notes: 'Offload with checksums; 3 copies before formatting.' }),
    // lighting
    G('Lighting', 'Aputure LS 600d Pro', { qty: 2, dayRate: 65, assignedTo: gaffer, notes: 'Rooftop key + sunset backlight boost.' }),
    G('Lighting', 'Light Dome II softbox', { dayRate: 15, assignedTo: gaffer }),
    G('Lighting', 'Aputure Nova P300c', { dayRate: 50, assignedTo: gaffer, status: 'reserved' }),
    G('Lighting', 'Astera Titan tube kit (8 tubes)', { dayRate: 95, assignedTo: gaffer, status: 'reserved', notes: 'Edit suite: hidden monitor glow + background.' }),
    // grip
    G('Grip', 'C-stands', { qty: 8, dayRate: 6, assignedTo: grip }),
    G('Grip', '8x8 frame + 1/2 grid + ultrabounce', { dayRate: 40, assignedTo: grip, notes: 'Wind on the roof — bag it double.' }),
    G('Grip', 'Flag kit (24x36, 18x24, cutters)', { dayRate: 20, assignedTo: grip }),
    G('Grip', 'Sandbags', { ...owned, qty: 12, assignedTo: grip }),
    // sound (mixer's own kit, covered by the kit fee in the budget)
    G('Sound', 'Sound Devices 833 mixer-recorder', { ...owned, assignedTo: sound, notes: 'Mixer’s kit — kit fee in the budget.' }),
    G('Sound', 'Boom pole + Schoeps CMC641 + blimp', { ...owned, assignedTo: sound }),
    G('Sound', 'Wireless lav kits', { ...owned, qty: 4, assignedTo: sound }),
    G('Sound', 'Comtek receivers (director, script)', { ...owned, qty: 2, assignedTo: sound }),
    G('Sound', 'Timecode boxes (Tentacle Sync E)', { ...owned, qty: 3, assignedTo: sound }),
    // production
    G('Production', 'Walkie-talkies + surveillance headsets', { qty: 10, dayRate: 5, assignedTo: pa, status: 'confirmed' }),
    G('Production', 'Stair-climbing hand truck', { dayRate: 35, assignedTo: pa, status: 'needed', notes: 'Freight elevator is out — 9 floors of stairs.' }),
    G('Production', 'First aid kit + burn kit', { ...owned, assignedTo: pa, checked: true }),
    // vehicles
    G('Vehicles', 'Cargo van (Fri–Mon)', { source: 'rental', vendor: 'Enterprise Truck Rental', days: undefined, flatCost: 380, status: 'reserved', assignedTo: pa }),
    // expendables
    G('Expendables', 'Expendables: gaffer tape, black wrap, C-47s, gels, AA batteries', { source: 'purchase', vendor: 'Filmtools', days: undefined, flatCost: 150, status: 'picked_up', assignedTo: gaffer }),
  ];

  // Lights drawn on the lighting diagrams are left for the "Import lights from diagrams" button to demo.
}
