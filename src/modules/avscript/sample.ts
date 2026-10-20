import type { AVRow, ProjectData } from '@/types';
import type { SampleContext } from '@/sample/context';
import { uid } from '@/lib/id';

/* Simple 16:9 storyboard-style frames for the behind-the-scenes promo. */
const W = 320;
const H = 180;
const svg = (body: string, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs>${body}</svg>`;

const SKY = `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2350"/><stop offset="0.55" stop-color="#e8590c"/><stop offset="1" stop-color="#ffd8a8"/></linearGradient>`;

const skyline = svg(
  `<rect width="${W}" height="${H}" fill="url(#sky)"/>
   <circle cx="236" cy="118" r="20" fill="#ffe8cc" opacity="0.9"/>
   <g fill="#14121f">
     <rect x="0" y="120" width="40" height="60"/><rect x="38" y="98" width="30" height="82"/><rect x="66" y="128" width="44" height="52"/>
     <rect x="108" y="86" width="26" height="94"/><rect x="132" y="112" width="40" height="68"/><rect x="170" y="132" width="34" height="48"/>
     <rect x="202" y="104" width="30" height="76"/><rect x="230" y="138" width="46" height="42"/><rect x="274" y="116" width="46" height="64"/>
     <rect x="48" y="78" width="12" height="16" rx="2"/><path d="M46 78 L54 70 L62 78 Z"/><rect x="49" y="94" width="2" height="6"/><rect x="57" y="94" width="2" height="6"/>
     <rect x="208" y="86" width="14" height="18" rx="2"/><path d="M206 86 L215 77 L224 86 Z"/><rect x="209" y="104" width="2" height="5"/><rect x="219" y="104" width="2" height="5"/>
   </g>
   <text x="160" y="40" fill="#fff" font-family="Arial, sans-serif" font-size="10" text-anchor="middle" letter-spacing="2" opacity="0.85">GOLDEN HOUR PICTURES PRESENTS</text>`,
  SKY,
);

const stairwell = svg(
  `<rect width="${W}" height="${H}" fill="#1f2a2e"/>
   <g fill="none" stroke="#8fb3b0" stroke-width="3" opacity="0.9">
     <ellipse cx="160" cy="92" rx="118" ry="70"/><ellipse cx="160" cy="92" rx="92" ry="54"/><ellipse cx="160" cy="92" rx="68" ry="40"/>
     <ellipse cx="160" cy="92" rx="46" ry="27"/><ellipse cx="160" cy="92" rx="26" ry="15"/>
   </g>
   <circle cx="160" cy="92" r="8" fill="#f8f3e6" opacity="0.8"/>
   <g fill="#0f1416"><rect x="40" y="132" width="22" height="34" rx="3"/><circle cx="51" cy="126" r="7"/><rect x="246" y="136" width="30" height="20" rx="3"/></g>
   <text x="14" y="22" fill="#c9dedc" font-family="Arial, sans-serif" font-size="13" font-weight="bold">9</text>`,
);

const ledge = svg(
  `<rect width="${W}" height="${H}" fill="url(#sky)"/>
   <circle cx="250" cy="104" r="26" fill="#fff4e6" opacity="0.85"/>
   <rect x="0" y="146" width="${W}" height="34" fill="#1a1626"/>
   <g fill="#c92a2a"><path d="M150 146 L156 104 Q160 94 166 104 L174 146 Z"/><path d="M174 120 Q192 112 200 122 Q186 124 176 130 Z" opacity="0.9"/></g>
   <circle cx="161" cy="90" r="8" fill="#2b2026"/>
   <g fill="#0e0c15"><rect x="12" y="104" width="18" height="44" rx="4"/><circle cx="21" cy="96" r="8"/><rect x="40" y="118" width="40" height="28" rx="3"/><rect x="58" y="96" width="4" height="24"/></g>`,
  SKY,
);

const titleCard = svg(
  `<rect width="${W}" height="${H}" fill="#0b0b0f"/>
   <rect x="40" y="116" width="240" height="1.5" fill="#e8590c"/>
   <text x="160" y="104" fill="#fff6ea" font-family="Arial Narrow, Arial, sans-serif" font-size="34" font-weight="bold" text-anchor="middle" letter-spacing="5">THE LAST TAKE</text>
   <text x="160" y="138" fill="#b9b2a8" font-family="Arial, sans-serif" font-size="9" text-anchor="middle" letter-spacing="3">COMING TO FESTIVALS 2027</text>`,
);

/** Adds demo data for the avscript module to the sample project (mutates p). */
export async function seedSample(p: ProjectData, ctx: SampleContext): Promise<void> {
  if (p.script.av?.rows?.length) return;
  const [imgSkyline, imgStairs, imgLedge, imgTitle] = await Promise.all([ctx.addSvg(skyline), ctx.addSvg(stairwell), ctx.addSvg(ledge), ctx.addSvg(titleCard)]);

  const row = (r: Omit<AVRow, 'id'>): AVRow => ({ id: uid('av'), ...r });
  const rows: AVRow[] = [
    row({
      segment: 'Cold open',
      video: 'EWS — Brooklyn skyline at dusk, water towers in silhouette.\nSUPER: Golden Hour Pictures presents',
      audio: 'MUSIC: Low synth pulse fades up.\nSFX: City hum, distant traffic.',
      duration: 6,
      image: imgSkyline,
    }),
    row({
      video: 'Handheld — the crew hauls cases up the stairwell, nine floors. Quick cuts on each landing number.',
      audio: 'ELENA (V.O.): The elevator was dead. So everything — camera, lights, all of us — went up nine flights of stairs.',
      image: imgStairs,
    }),
    row({
      video: 'CU — Sofia in the red coat on a landing, catching her breath, laughing.',
      audio: 'SOFIA: Nobody mentioned nine floors! [laughs]',
      duration: 4,
    }),
    row({
      segment: 'Racing the light',
      video: 'Time-lapse — the sun sinks toward the water towers.\nGFX: countdown 12:00 → 0:00, lower right.',
      audio: 'ELENA (V.O.): We had twelve minutes of usable light. One setup. No second takes.\nMUSIC: Pulse builds.',
    }),
    row({
      video: 'MS — Ivan checks exposure on the monitor while Luis flags the bounce.',
      audio: 'IVAN: The sky does the lighting. We just stay out of its way.',
      duration: 5,
    }),
    row({
      video: 'WS — June at the ledge, coat lifting in the wind; crew silhouettes in the foreground.',
      audio: 'SFX: Wind gust.\nMARCUS (V.O.): And then… it just happened.',
      duration: 6,
      image: imgLedge,
    }),
    row({
      video: 'CU — playback on the monitor; the crew erupts. A walkie drops onto the gravel.',
      audio: 'MUSIC: Hits and swells.\nSFX: Walkie crackle.',
      duration: 5,
      notes: 'Use the real crackle recorded wild on set.',
    }),
    row({
      video: 'Title card — THE LAST TAKE.\nSUPER: Coming to festivals in 2027 · goldenhour.example',
      audio: 'NARRATOR: The Last Take. Twelve minutes. One shot.\nMUSIC: Button.',
      duration: 6,
      image: imgTitle,
    }),
  ];

  p.script.av = {
    ...(p.script.av ?? {}),
    rows,
    videoLabel: p.script.av?.videoLabel || 'VIDEO',
    audioLabel: p.script.av?.audioLabel || 'AUDIO',
    showImages: true,
    showDurations: true,
  };
}
