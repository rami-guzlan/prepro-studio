import type { Location, ProjectData } from '@/types';
import type { SampleContext } from '@/sample/context';

/* Stylised SVG "location photos" (3:2) for the sample project. */

const W = 800;
const H = 533;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function svg(defs: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 2}" height="${H * 2}"><defs>${defs}</defs>${body}</svg>`;
}

function waterTower(x: number, base: number, s: number, fill: string): string {
  const w = 34 * s;
  const h = 38 * s;
  const legH = 28 * s;
  const top = base - legH - h;
  const sw = (n: number) => (n * s).toFixed(2);
  return `<g fill="${fill}" stroke="${fill}" stroke-linecap="round">
<line x1="${x + 4 * s}" y1="${base}" x2="${x + 8 * s}" y2="${base - legH}" stroke-width="${sw(2.4)}"/>
<line x1="${x + w - 4 * s}" y1="${base}" x2="${x + w - 8 * s}" y2="${base - legH}" stroke-width="${sw(2.4)}"/>
<line x1="${x + w / 2}" y1="${base}" x2="${x + w / 2}" y2="${base - legH}" stroke-width="${sw(2)}"/>
<line x1="${x + 6 * s}" y1="${base - legH * 0.5}" x2="${x + w - 6 * s}" y2="${base - legH * 0.5}" stroke-width="${sw(1.4)}"/>
<line x1="${x + 6 * s}" y1="${base}" x2="${x + w - 7 * s}" y2="${base - legH * 0.5}" stroke-width="${sw(1)}"/>
<rect x="${x}" y="${top}" width="${w}" height="${h}" rx="${3 * s}" stroke="none"/>
<polygon points="${x - 3 * s},${top + 2} ${x + w / 2},${top - 17 * s} ${x + w + 3 * s},${top + 2}" stroke="none"/>
<line x1="${x}" y1="${top + h * 0.35}" x2="${x + w}" y2="${top + h * 0.35}" stroke="rgba(255,255,255,0.08)" stroke-width="${sw(1.5)}"/>
<line x1="${x}" y1="${top + h * 0.7}" x2="${x + w}" y2="${top + h * 0.7}" stroke="rgba(255,255,255,0.08)" stroke-width="${sw(1.5)}"/>
</g>`;
}

/** Skyline of buildings (with lit windows) between x0..x1, rising from `base`. */
function skyline(seed: number, base: number, minH: number, maxH: number, fill: string, windowFill: string | null, towers: number): string {
  const r = rng(seed);
  let x = -10;
  let out = '';
  let wins = '';
  const tops: [number, number, number][] = [];
  while (x < W + 10) {
    const bw = 40 + r() * 70;
    const bh = minH + r() * (maxH - minH);
    out += `<rect x="${x.toFixed(1)}" y="${(base - bh).toFixed(1)}" width="${(bw + 1).toFixed(1)}" height="${(bh + 2).toFixed(1)}"/>`;
    if (r() < 0.25) out += `<rect x="${(x + bw * 0.3).toFixed(1)}" y="${(base - bh - 14).toFixed(1)}" width="${(bw * 0.4).toFixed(1)}" height="16"/>`;
    tops.push([x, bw, base - bh]);
    if (windowFill) {
      for (let wy = base - bh + 10; wy < base - 8; wy += 13) {
        for (let wx = x + 6; wx < x + bw - 8; wx += 11) {
          if (r() < 0.22) wins += `<rect x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="5" height="7"/>`;
        }
      }
    }
    x += bw;
  }
  let tw = '';
  for (let i = 0; i < towers; i++) {
    const t = tops[Math.floor(r() * tops.length)];
    if (!t) continue;
    tw += waterTower(t[0] + t[1] * 0.25, t[2] + 1, 0.7 + r() * 0.5, fill);
  }
  return `<g fill="${fill}">${out}</g>${tw}${windowFill ? `<g fill="${windowFill}">${wins}</g>` : ''}`;
}

const SKY_DEFS = `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1b4d"/><stop offset="0.42" stop-color="#8e3b6b"/><stop offset="0.72" stop-color="#f0743e"/><stop offset="1" stop-color="#ffc56b"/></linearGradient>
<radialGradient id="sun" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fff4d2"/><stop offset="0.3" stop-color="#ffd27a" stop-opacity="0.9"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>`;

function rooftopSkyline(): string {
  return svg(
    SKY_DEFS,
    `<rect width="${W}" height="${H}" fill="url(#sky)"/>
<circle cx="560" cy="345" r="150" fill="url(#sun)"/>
<circle cx="560" cy="345" r="30" fill="#fff1c9"/>
${skyline(7, 400, 40, 140, '#6a3460', null, 3)}
${skyline(21, 440, 30, 190, '#2b1834', 'rgba(255,207,115,0.85)', 4)}
<rect y="438" width="${W}" height="${H - 438}" fill="#1a0f1f"/>
<rect y="430" width="${W}" height="12" fill="#3a2436"/>
<g fill="rgba(255,255,255,0.05)">${Array.from({ length: 60 }, (_, i) => `<circle cx="${(i * 137) % W}" cy="${460 + ((i * 53) % 70)}" r="1.6"/>`).join('')}</g>`,
  );
}

function rooftopTower(): string {
  return svg(
    SKY_DEFS,
    `<rect width="${W}" height="${H}" fill="url(#sky)"/>
<circle cx="640" cy="300" r="170" fill="url(#sun)"/>
<circle cx="640" cy="300" r="26" fill="#fff1c9"/>
${skyline(5, 420, 20, 90, '#7a3c63', null, 2)}
${waterTower(70, 420, 4.6, '#22131f')}
<rect x="470" y="300" width="230" height="140" fill="#2a1828"/>
<polygon points="460,300 710,300 700,286 470,286" fill="#33202f"/>
<rect x="545" y="338" width="64" height="102" fill="#ffb45e"/>
<rect x="545" y="338" width="64" height="102" fill="url(#sun)" opacity="0.5"/>
<rect x="553" y="346" width="20" height="26" fill="#ffe2a8"/>
<polygon points="545,440 609,440 660,533 500,533" fill="rgba(255,180,94,0.18)"/>
<rect y="430" width="${W}" height="${H - 430}" fill="#1c1019"/>
<rect y="424" width="${W}" height="10" fill="#3a2436"/>
<g fill="rgba(255,255,255,0.06)">${Array.from({ length: 70 }, (_, i) => `<circle cx="${(i * 89) % W}" cy="${450 + ((i * 41) % 80)}" r="1.7"/>`).join('')}</g>`,
  );
}

function rooftopCamera(): string {
  return svg(
    SKY_DEFS,
    `<rect width="${W}" height="${H}" fill="url(#sky)"/>
<circle cx="250" cy="360" r="160" fill="url(#sun)"/>
<circle cx="250" cy="360" r="28" fill="#fff1c9"/>
${skyline(13, 430, 30, 150, '#3b2140', 'rgba(255,207,115,0.7)', 3)}
<rect y="420" width="${W}" height="${H - 420}" fill="#170d18"/>
<rect y="412" width="${W}" height="12" fill="#2d1a2b"/>
<g fill="#0e070f" stroke="#0e070f" stroke-linecap="round">
<line x1="560" y1="300" x2="500" y2="500" stroke-width="7"/>
<line x1="560" y1="300" x2="625" y2="505" stroke-width="7"/>
<line x1="560" y1="300" x2="575" y2="510" stroke-width="7"/>
<line x1="525" y1="420" x2="605" y2="420" stroke-width="3"/>
<rect x="520" y="282" width="80" height="22" rx="3"/>
<rect x="500" y="212" width="120" height="74" rx="8"/>
<rect x="430" y="226" width="74" height="44" rx="6"/>
<rect x="400" y="216" width="36" height="64" rx="4"/>
<rect x="520" y="186" width="80" height="12" rx="4"/>
<line x1="528" y1="198" x2="528" y2="212" stroke-width="6"/>
<line x1="592" y1="198" x2="592" y2="212" stroke-width="6"/>
<circle cx="560" cy="249" r="20" fill="#20111f"/>
<rect x="620" y="226" width="44" height="30" rx="3"/>
</g>`,
  );
}

function stairwellSpiral(): string {
  const r = (k: number) => Math.pow(0.8, k);
  let rects = '';
  for (let k = 0; k < 12; k++) {
    const f = r(k);
    const w = 900 * f;
    const h = 640 * f;
    const x = 400 - w / 2 + k * 7;
    const y = 266 - h / 2 + k * 4;
    const t = k / 11;
    const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
    const fill = `rgb(${mix(28, 246)},${mix(24, 231)},${mix(30, 200)})`;
    rects += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(40 * f).toFixed(1)}" fill="${fill}"/>`;
    rects += `<rect x="${(x + 10 * f).toFixed(1)}" y="${(y + 10 * f).toFixed(1)}" width="${(w - 20 * f).toFixed(1)}" height="${(h - 20 * f).toFixed(1)}" rx="${(34 * f).toFixed(1)}" fill="none" stroke="rgba(214,160,92,${(0.95 - t * 0.5).toFixed(2)})" stroke-width="${(9 * f).toFixed(2)}"/>`;
    // balusters on the near edge
    for (let b = 0; b < 14; b++) {
      const bx = x + 16 * f + ((w - 32 * f) / 13) * b;
      rects += `<line x1="${bx.toFixed(1)}" y1="${(y + h - 14 * f).toFixed(1)}" x2="${bx.toFixed(1)}" y2="${(y + h - 40 * f).toFixed(1)}" stroke="rgba(30,20,20,${(0.6 - t * 0.4).toFixed(2)})" stroke-width="${(3 * f).toFixed(2)}"/>`;
    }
  }
  return svg(
    `<radialGradient id="sky" cx="0.56" cy="0.56" r="0.18"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>`,
    `<rect width="${W}" height="${H}" fill="#151217"/>${rects}<rect width="${W}" height="${H}" fill="url(#sky)"/>`,
  );
}

function stairwellLanding(): string {
  return svg(
    `<linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ece4cf"/><stop offset="1" stop-color="#d8cdb2"/></linearGradient>
<radialGradient id="lamp" cx="0.5" cy="0" r="0.8"><stop offset="0" stop-color="#fff8e0" stop-opacity="0.9"/><stop offset="1" stop-color="#fff8e0" stop-opacity="0"/></radialGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#wall)"/>
<rect y="300" width="${W}" height="233" fill="#5f7f6c"/>
<rect y="296" width="${W}" height="8" fill="#4a6655"/>
<rect x="470" y="150" width="150" height="300" fill="#7d4b32"/>
<rect x="478" y="158" width="134" height="284" fill="#8f5a3d"/>
<rect x="515" y="180" width="60" height="80" fill="#cfe3ea"/>
<line x1="545" y1="180" x2="545" y2="260" stroke="#8f5a3d" stroke-width="3"/>
<circle cx="596" cy="310" r="7" fill="#d7b46a"/>
<rect x="640" y="140" width="56" height="56" rx="6" fill="#1f2a44"/>
<text x="668" y="183" font-family="Arial, Helvetica, sans-serif" font-size="40" font-weight="700" fill="#ffffff" text-anchor="middle">9</text>
<rect x="320" y="18" width="160" height="14" rx="4" fill="#fffbe8"/>
<rect width="${W}" height="${H}" fill="url(#lamp)"/>
<g fill="#8c8a83">${Array.from({ length: 9 }, (_, i) => `<polygon points="${-20 + i * 46},${533 - i * 30} ${30 + i * 46},${533 - i * 30} ${30 + i * 46},${520 - i * 30} ${-20 + i * 46},${520 - i * 30}"/>`).join('')}</g>
<g fill="#6f6d67">${Array.from({ length: 9 }, (_, i) => `<rect x="${-20 + i * 46}" y="${520 - i * 30}" width="50" height="30"/>`).join('')}</g>
<line x1="0" y1="430" x2="420" y2="170" stroke="#2f2a26" stroke-width="10" stroke-linecap="round"/>
${Array.from({ length: 9 }, (_, i) => `<line x1="${20 + i * 46}" y1="${418 - i * 28.6}" x2="${20 + i * 46}" y2="${520 - i * 30}" stroke="#2f2a26" stroke-width="4"/>`).join('')}
<rect x="0" y="450" width="${W}" height="83" fill="rgba(0,0,0,0.08)"/>`,
  );
}

function editSuiteWall(): string {
  const mon = (x: number, y: number, w: number, h: number, fill: string, extra = '') =>
    `<rect x="${x - 6}" y="${y - 6}" width="${w + 12}" height="${h + 12}" rx="4" fill="#05060a"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>${extra}`;
  return svg(
    `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a1f4f"/><stop offset="0.6" stop-color="#f0743e"/><stop offset="1" stop-color="#ffc56b"/></linearGradient>
<linearGradient id="blue" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#16324f"/><stop offset="1" stop-color="#2d6c9e"/></linearGradient>
<radialGradient id="glow" cx="0.5" cy="0.35" r="0.6"><stop offset="0" stop-color="#ff9d5c" stop-opacity="0.35"/><stop offset="1" stop-color="#ff9d5c" stop-opacity="0"/></radialGradient>`,
    `<rect width="${W}" height="${H}" fill="#0b0d12"/>
<rect width="${W}" height="${H}" fill="url(#glow)"/>
${mon(250, 70, 300, 168, 'url(#sky)', `<g fill="#2b1834">${[0, 1, 2, 3, 4, 5, 6].map((i) => `<rect x="${250 + i * 44}" y="${180 - ((i * 37) % 50)}" width="40" height="${58 + ((i * 37) % 50)}"/>`).join('')}</g><rect x="384" y="150" width="10" height="30" fill="#140a14"/><circle cx="389" cy="146" r="6" fill="#140a14"/>`)}
${mon(70, 90, 160, 90, 'url(#blue)')}
${mon(570, 90, 160, 90, 'url(#blue)', `<polyline points="580,160 600,140 620,150 640,120 660,135 680,110 700,128 720,118" fill="none" stroke="#7fe0a0" stroke-width="2"/>`)}
${mon(70, 200, 160, 90, '#121a24', `<g fill="#3e8ef7">${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `<rect x="${80 + i * 14}" y="${280 - ((i * 23) % 60) - 10}" width="9" height="${((i * 23) % 60) + 10}"/>`).join('')}</g>`)}
${mon(570, 200, 160, 90, '#1a1410', `<g stroke="#f5a524" stroke-width="2">${[0, 1, 2, 3, 4].map((i) => `<line x1="580" y1="${215 + i * 16}" x2="${600 + ((i * 53) % 110)}" y2="${215 + i * 16}"/>`).join('')}</g>`)}
<rect x="0" y="360" width="${W}" height="173" fill="#07080b"/>
<rect x="40" y="350" width="720" height="16" rx="3" fill="#1a1d24"/>
<rect x="300" y="330" width="200" height="22" rx="3" fill="#14161c"/>
<g fill="#020203">
<circle cx="300" cy="400" r="40"/><path d="M230 533 C238 460 268 440 300 440 C332 440 362 460 370 533 Z"/>
<circle cx="500" cy="395" r="44"/><path d="M420 533 C428 455 462 436 500 436 C538 436 572 455 580 533 Z"/>
</g>
<path d="M266 382 C268 354 286 344 300 344 C318 344 334 356 334 384 C322 368 288 366 266 382 Z" fill="#020203"/>`,
  );
}

function editSuiteTimeline(): string {
  const tracks = [
    { y: 352, color: '#7c5cff', clips: [[30, 140], [180, 120], [312, 210], [540, 200]] },
    { y: 384, color: '#3e8ef7', clips: [[30, 90], [130, 260], [400, 150], [560, 180]] },
    { y: 420, color: '#2fb36d', clips: [[30, 300], [340, 400]] },
    { y: 452, color: '#2fb36d', clips: [[90, 220], [420, 260]] },
    { y: 484, color: '#f5a524', clips: [[30, 710]] },
  ];
  return svg(
    `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1b4d"/><stop offset="0.55" stop-color="#e2683b"/><stop offset="1" stop-color="#ffcf7a"/></linearGradient>`,
    `<rect width="${W}" height="${H}" fill="#14161c"/>
<rect x="0" y="0" width="${W}" height="30" fill="#1d2028"/>
<g fill="#5b6070">${[0, 1, 2, 3, 4].map((i) => `<rect x="${16 + i * 60}" y="11" width="40" height="8" rx="2"/>`).join('')}</g>
<rect x="200" y="44" width="400" height="225" fill="url(#sky)"/>
<path d="M200 269 L200 220 L250 220 L250 190 L300 190 L300 230 L360 230 L360 205 L430 205 L430 240 L520 240 L520 215 L600 215 L600 269 Z" fill="#26162b"/>
<rect x="420" y="150" width="22" height="70" rx="8" fill="#1a0d12"/>
<circle cx="431" cy="140" r="12" fill="#1a0d12"/>
<path d="M418 170 C404 190 404 214 420 222 L420 170 Z" fill="#a8261f"/>
<rect x="20" y="44" width="160" height="225" fill="#1b1e26"/>
<g fill="#2a2f3a">${[0, 1, 2, 3].map((i) => `<rect x="32" y="${58 + i * 50}" width="64" height="38" rx="3"/><rect x="104" y="${66 + i * 50}" width="64" height="8" rx="2"/>`).join('')}</g>
<rect x="620" y="44" width="160" height="225" fill="#1b1e26"/>
<g stroke="#7fe0a0" stroke-width="1.5" fill="none" opacity="0.8"><polyline points="632,250 660,180 690,210 720,120 750,190 768,160"/></g>
<rect x="0" y="290" width="${W}" height="${H - 290}" fill="#101217"/>
<rect x="0" y="300" width="${W}" height="20" fill="#1a1d24"/>
<g fill="#5b6070">${Array.from({ length: 20 }, (_, i) => `<rect x="${30 + i * 37}" y="306" width="1.5" height="10"/>`).join('')}</g>
${tracks.map((t) => t.clips.map(([x, w]) => `<rect x="${x}" y="${t.y}" width="${w - 4}" height="26" rx="3" fill="${t.color}" opacity="0.85"/>`).join('')).join('')}
<rect x="455" y="300" width="2" height="233" fill="#ff4d4d"/>
<polygon points="449,300 463,300 456,310" fill="#ff4d4d"/>`,
  );
}

const EXTRA: Record<string, { photos: (() => string)[]; data: Partial<Location> }> = {
  'CITY ROOFTOP': {
    photos: [rooftopSkyline, rooftopTower, rooftopCamera],
    data: {
      contactEmail: 'dana@hollis.example',
      availability: 'Roof access 6 AM – 8 PM. Nov 7 confirmed; rain date Sat Nov 14.',
      wifi: 'None on the roof — good 5G signal; bring a hotspot for video village.',
      scoutNotes:
        '• Wind gusts at the parapet: sandbag every stand; 4 extra bags for the monitor.\n• HVAC unit on the north bulkhead cycles every ~15 min — the super can switch it off for takes (ask Dana).\n• Gravel roof: lay layout board for the dolly track.\n• Holding: vacant 9th-floor office (keys from Dana).',
    },
  },
  STAIRWELL: {
    photos: [stairwellSpiral, stairwellLanding],
    data: {
      contactEmail: 'dana@hollis.example',
      availability: 'Stairwell B stays open to residents — PAs hold traffic for ~2 min per take.',
      parking: 'Same as the rooftop: Hollis Ave street parking; loading zone at the north entrance until 9 AM.',
      restrooms: '9th floor, east corridor; lobby restroom on the ground floor.',
      loadIn: 'Ground-floor lobby → stairwell B. No elevator (out of service).',
      wifi: 'Lobby guest Wi-Fi: HollisGuest (no password) — weak above the 4th floor.',
      scoutNotes:
        '• The spiral reads best from the 2nd-floor landing looking up; skylight gives a soft top light until ~3 PM.\n• Heavy echo: lav on June, boom from the landing above.\n• Fluorescent fixtures flicker — replace landings 6–9 with LED tubes or shoot 172.8° shutter.\n• 15A outlet on every landing.',
    },
  },
  'EDIT SUITE': {
    photos: [editSuiteWall, editSuiteTimeline],
    data: {
      contactEmail: 'sam@studio9.example',
      permitRequired: false,
      permitStatus: 'n/a',
      availability: 'Suite B free Sun Nov 8 from 6 PM; must wrap by 2 AM.',
      parking: 'Paid garage at 70 Water St (validated for 4 hours at the front desk).',
      power: 'Plenty of studio circuits. Do not use the machine-room outlets.',
      restrooms: 'End of the hall, 4th floor.',
      loadIn: 'Freight elevator from the Water St loading dock — book with the front desk.',
      wifi: 'Studio9-Guest (password at front desk).',
      scoutNotes:
        '• Dark, treated room — perfect for the monitor-glow look.\n• Swap two side monitors for a 55" OLED for the hero playback.\n• AC is loud: switch off during takes (thermostat by the door).',
    },
  },
};

/** Adds demo data for the locations module to the sample project (mutates p). */
export async function seedSample(p: ProjectData, ctx: SampleContext): Promise<void> {
  for (const l of p.locations) {
    const key = (l.sets ?? []).map((s) => s.toUpperCase()).find((s) => EXTRA[s]);
    if (!key) continue;
    const extra = EXTRA[key];
    for (const [k, v] of Object.entries(extra.data)) {
      const cur = (l as any)[k];
      if (cur == null || cur === '') (l as any)[k] = v;
    }
    if (!l.photos?.length) {
      const names: string[] = [];
      for (const make of extra.photos) {
        try {
          names.push(await ctx.addSvg(make()));
        } catch {
          /* photos are optional */
        }
      }
      l.photos = names;
    }
  }
}
