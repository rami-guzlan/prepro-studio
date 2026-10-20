import type { CastMember, ProjectData } from '@/types';
import type { SampleContext } from '@/sample/context';

type HairStyle = 'long' | 'curly' | 'short' | 'crop';

/** Abstract 3:4 headshot placeholder: tonal head-and-shoulders silhouette on a gradient. */
function headshotSvg(o: { bg: [string, string]; hair: HairStyle; garment: string; light?: string }): string {
  // the silhouette is drawn opaque inside a translucent group so overlapping shapes don't double up
  const tone = '#2b2436';
  const hairTone = '#07060b';
  const hairBack =
    o.hair === 'long'
      ? `<path d="M90 186 C86 112 118 94 150 94 C186 94 216 112 212 186 C216 252 228 300 240 326 L60 326 C72 300 86 252 90 186 Z" fill="${hairTone}"/>`
      : o.hair === 'curly'
        ? [
            [150, 116, 36],
            [110, 130, 31],
            [190, 130, 31],
            [94, 170, 27],
            [206, 170, 27],
            [98, 208, 24],
            [202, 208, 24],
            [104, 240, 18],
            [196, 240, 18],
          ]
            .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${hairTone}"/>`)
            .join('')
        : '';
  const hairFront =
    o.hair === 'long'
      ? `<path d="M96 170 C98 122 126 104 152 104 C184 104 206 126 206 168 C186 140 158 132 130 146 C116 153 104 161 96 170 Z" fill="${hairTone}"/>`
      : o.hair === 'curly'
        ? `<circle cx="150" cy="122" r="30" fill="${hairTone}"/><circle cx="122" cy="132" r="24" fill="${hairTone}"/><circle cx="178" cy="132" r="24" fill="${hairTone}"/>`
        : o.hair === 'short'
          ? `<path d="M96 172 C94 118 124 100 152 100 C184 100 208 118 206 172 C200 150 186 138 166 136 C140 133 116 142 96 172 Z" fill="${hairTone}"/><path d="M108 214 C114 250 132 262 150 262 C168 262 186 250 192 214 C184 236 168 244 150 244 C132 244 116 236 108 214 Z" fill="${hairTone}" opacity="0.8"/>`
          : `<path d="M98 168 C96 126 110 106 126 106 L132 90 L146 104 L158 88 L168 104 L184 94 L186 112 C204 122 208 142 204 168 C190 146 170 140 150 142 C128 144 110 152 98 168 Z" fill="${hairTone}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" width="600" height="800">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" stop-color="${o.bg[0]}"/><stop offset="1" stop-color="${o.bg[1]}"/></linearGradient>
<radialGradient id="glow" cx="0.5" cy="0.4" r="0.55"><stop offset="0" stop-color="${o.light ?? '#ffffff'}" stop-opacity="0.38"/><stop offset="1" stop-color="${o.light ?? '#ffffff'}" stop-opacity="0"/></radialGradient>
<linearGradient id="shade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.18"/></linearGradient>
</defs>
<rect width="300" height="400" fill="url(#bg)"/>
<rect width="300" height="400" fill="url(#glow)"/>
<g opacity="0.62">
${hairBack}
<path d="M126 236 L126 300 Q150 318 174 300 L174 236 Z" fill="${tone}"/>
<ellipse cx="150" cy="180" rx="54" ry="66" fill="${tone}"/>
${hairFront}
</g>
<path d="M14 400 C22 332 76 302 150 300 C224 302 278 332 286 400 Z" fill="${o.garment}"/>
<path d="M14 400 C22 332 76 302 150 300 C224 302 278 332 286 400 Z" fill="url(#shade)"/>
<path d="M118 302 L150 346 L182 302" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="3" stroke-linejoin="round"/>
<path d="M98 150 C104 128 122 116 140 114" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="3" stroke-linecap="round"/>
<rect width="300" height="400" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="8"/>
</svg>`;
}

const DETAILS: Record<string, { svg: Parameters<typeof headshotSvg>[0]; data: Partial<CastMember> }> = {
  'Priya Raman': {
    svg: { bg: ['#4fb3c8', '#2c3e8f'], hair: 'long', garment: 'rgba(16,22,48,0.78)' },
    data: {
      pronouns: 'she/her',
      address: '214 Bergen St, Apt 3, Brooklyn, NY 11217',
      agent: 'Jordan Blake',
      agency: 'Northlight Talent',
      agentPhone: '(555) 010-4410',
      agentEmail: 'jordan@northlight.example',
      availability: 'Available Nov 1–20. Holding Nov 7–8 for us.\nConflict: Nov 12 (theatre matinee).',
      dietary: 'Vegetarian',
      allergies: 'None known',
      emergencyName: 'Arjun Raman (brother)',
      emergencyPhone: '(555) 010-2290',
      notes: 'Wears glasses off camera — contacts on set. Prefers sides emailed the night before.',
      measurements: { height: '5\'6"', weight: '128 lb', chest: '34"', waist: '27"', hips: '37"', inseam: '30"', jacket: '6 / S', shirt: 'S', pants: '27 × 30', dress: '6', shoe: '8', hair: 'Black, long', eyes: 'Brown' },
    },
  },
  'Sofia Marín': {
    svg: { bg: ['#f7a072', '#9c2f3f'], hair: 'curly', garment: '#b8322a', light: '#ffe2c4' },
    data: {
      pronouns: 'she/her',
      address: '88 Nassau Ave, Brooklyn, NY 11222',
      agent: 'Camille Duret',
      agency: 'Duret & Vance Management',
      agentPhone: '(555) 010-4522',
      agentEmail: 'camille@duretvance.example',
      availability: 'Fully available Nov 2–15.\nRed coat fitting: Tue Nov 3, 2:00 PM with Nina (wardrobe).',
      dietary: 'Gluten-free',
      allergies: 'Penicillin',
      medical: 'Mild asthma — inhaler in her bag. Stairwell run: plan rests between takes and keep water on every landing.',
      emergencyName: 'Luis Marín (father)',
      emergencyPhone: '(555) 010-2377',
      notes: 'Happy to do the full nine-floor climb twice; stunt double not required.',
      measurements: { height: '5\'4"', weight: '118 lb', chest: '33"', waist: '25"', hips: '35"', inseam: '29"', jacket: '4 / XS', shirt: 'XS', pants: '25 × 29', dress: '4', shoe: '7.5', hat: '22"', hair: 'Auburn, curly, shoulder length', eyes: 'Hazel' },
    },
  },
  'Daniel Okafor': {
    svg: { bg: ['#f5c26b', '#8a4b1f'], hair: 'short', garment: 'rgba(40,26,14,0.78)', light: '#fff1d6' },
    data: {
      pronouns: 'he/him',
      address: '1020 Fulton St, Brooklyn, NY 11238',
      agent: 'Marcus Hill',
      agency: 'Hill Talent Group',
      agentPhone: '(555) 010-4633',
      agentEmail: 'marcus@hilltalent.example',
      availability: 'Available Nov 5–9. Hard out 7:00 PM on Sun Nov 8.',
      dietary: 'No pork',
      allergies: 'Shellfish (severe — EpiPen with him)',
      emergencyName: 'Ada Okafor (wife)',
      emergencyPhone: '(555) 010-2468',
      measurements: { height: '6\'1"', weight: '190 lb', chest: '42"', waist: '34"', inseam: '32"', neck: '16"', sleeve: '34"', jacket: '42L', shirt: '16 / 34', pants: '34 × 32', shoe: '11', hat: '7 3/8', glove: 'L', hair: 'Black, short; full beard', eyes: 'Brown' },
    },
  },
  'Alex Kim': {
    svg: { bg: ['#8fd694', '#1f6f6b'], hair: 'crop', garment: 'rgba(14,40,36,0.78)' },
    data: {
      pronouns: 'they/them',
      address: '35 Meserole St, Brooklyn, NY 11206',
      availability: 'Weekends only until Nov 6, then free all of Nov 7–8.',
      dietary: 'Vegan',
      allergies: 'None known',
      emergencyName: 'Grace Kim (mother)',
      emergencyPhone: '(555) 010-2581',
      notes: 'Self-represented. First professional role — Tasha (1st AD) will do a set-etiquette walkthrough at call.',
      measurements: { height: '5\'9"', weight: '145 lb', chest: '36"', waist: '29"', inseam: '31"', neck: '15"', sleeve: '33"', jacket: '38R', shirt: 'M', pants: '29 × 31', shoe: '9.5', hair: 'Black, messy crop', eyes: 'Brown' },
    },
  },
};

const CHARACTER_COLORS: Record<string, string> = { MAYA: '#3e8ef7', JUNE: '#e5484d', LEO: '#f5a524', SAM: '#2fb36d' };

/** Adds demo data for the cast module to the sample project (mutates p). */
export async function seedSample(p: ProjectData, ctx: SampleContext): Promise<void> {
  for (const c of p.characters) if (!c.color && CHARACTER_COLORS[c.name]) c.color = CHARACTER_COLORS[c.name];
  for (const m of p.cast) {
    const d = DETAILS[m.name];
    if (!d) continue;
    Object.assign(m, d.data);
    try {
      m.photo = await ctx.addSvg(headshotSvg(d.svg));
    } catch {
      /* image is optional */
    }
  }
}
