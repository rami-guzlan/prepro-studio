/* Pencil-style SVG storyboard sketches for the sample project ("The Last Take").
   Pure string builders — no DOM needed. Lines get a little deterministic jitter
   and a faint second pass so they read as hand drawn. */

type P = [number, number];

const INK = '#1f1f24';
const SOFT = '#8a8a93';
const TONE = '#e7e6e2';
const MOVE = '#e8590c'; // camera-movement arrows
const COAT = '#c0392b'; // June's red coat

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n: number) => (Math.round(n * 10) / 10).toString();

interface LineOpts {
  w?: number;
  c?: string;
  dash?: string;
  ghost?: boolean;
  fill?: string;
  close?: boolean;
  opacity?: number;
}

export class Sketch {
  parts: string[] = [];
  defs: string[] = [];
  private rnd: () => number;
  private clipN = 0;
  constructor(
    public W: number,
    public H: number,
    seed: number,
  ) {
    this.rnd = mulberry32(seed);
  }
  j(n = 1.4) {
    return (this.rnd() - 0.5) * 2 * n;
  }
  /** x / y helpers in percent of the frame */
  x(p: number) {
    return (p / 100) * this.W;
  }
  y(p: number) {
    return (p / 100) * this.H;
  }

  line(x1: number, y1: number, x2: number, y2: number, o: LineOpts = {}) {
    const w = o.w ?? 2.2;
    const c = o.c ?? INK;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const bow = Math.min(2.2, len / 120);
    const path = (k: number) => {
      const mx = (x1 + x2) / 2 + this.j(bow * k);
      const my = (y1 + y2) / 2 + this.j(bow * k);
      return `M${f(x1 + this.j(0.7 * k))} ${f(y1 + this.j(0.7 * k))} Q${f(mx)} ${f(my)} ${f(x2 + this.j(0.7 * k))} ${f(y2 + this.j(0.7 * k))}`;
    };
    const dash = o.dash ? ` stroke-dasharray="${o.dash}"` : '';
    this.parts.push(`<path d="${path(1)}" fill="none" stroke="${c}" stroke-width="${f(w)}" stroke-linecap="round"${dash}${o.opacity != null ? ` opacity="${o.opacity}"` : ''}/>`);
    if (o.ghost !== false && !o.dash) this.parts.push(`<path d="${path(2.2)}" fill="none" stroke="${c}" stroke-width="${f(w * 0.55)}" stroke-linecap="round" opacity="0.28"/>`);
  }

  poly(pts: P[], o: LineOpts = {}) {
    const w = o.w ?? 2.2;
    const c = o.c ?? INK;
    const d = (k: number) => pts.map((p, i) => `${i ? 'L' : 'M'}${f(p[0] + this.j(0.8 * k))} ${f(p[1] + this.j(0.8 * k))}`).join(' ') + (o.close ? ' Z' : '');
    const dash = o.dash ? ` stroke-dasharray="${o.dash}"` : '';
    this.parts.push(
      `<path d="${d(1)}" fill="${o.fill ?? 'none'}" stroke="${c}" stroke-width="${f(w)}" stroke-linejoin="round" stroke-linecap="round"${dash}${o.opacity != null ? ` opacity="${o.opacity}"` : ''}/>`,
    );
    if (o.ghost !== false && !o.dash) this.parts.push(`<path d="${d(2)}" fill="none" stroke="${c}" stroke-width="${f(w * 0.5)}" stroke-linejoin="round" opacity="0.25"/>`);
  }

  rect(x: number, y: number, w: number, h: number, o: LineOpts = {}) {
    this.poly(
      [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ],
      { ...o, close: true },
    );
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, o: LineOpts = {}) {
    const w = o.w ?? 2.2;
    const c = o.c ?? INK;
    this.parts.push(
      `<ellipse cx="${f(cx + this.j(0.6))}" cy="${f(cy + this.j(0.6))}" rx="${f(rx)}" ry="${f(ry)}" fill="${o.fill ?? 'none'}" stroke="${c}" stroke-width="${f(w)}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}${o.opacity != null ? ` opacity="${o.opacity}"` : ''}/>`,
    );
    if (o.ghost !== false && !o.dash) this.parts.push(`<ellipse cx="${f(cx + this.j(1.6))}" cy="${f(cy + this.j(1.6))}" rx="${f(rx + this.j(1.5))}" ry="${f(ry + this.j(1.5))}" fill="none" stroke="${c}" stroke-width="${f(w * 0.5)}" opacity="0.25"/>`);
  }

  path(d: string, o: LineOpts = {}) {
    this.parts.push(
      `<path d="${d}" fill="${o.fill ?? 'none'}" stroke="${o.c ?? INK}" stroke-width="${f(o.w ?? 2.2)}" stroke-linecap="round" stroke-linejoin="round"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}${o.opacity != null ? ` opacity="${o.opacity}"` : ''}/>`,
    );
  }

  /** Diagonal pencil hatching inside a rectangle. */
  hatch(x: number, y: number, w: number, h: number, gap = 9, c = SOFT, op = 0.55) {
    const id = `h${++this.clipN}`;
    this.defs.push(`<clipPath id="${id}"><rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"/></clipPath>`);
    const lines: string[] = [];
    for (let k = -h; k < w; k += gap) lines.push(`M${f(x + k)} ${f(y + h)} L${f(x + k + h)} ${f(y)}`);
    this.parts.push(`<g clip-path="url(#${id})" opacity="${op}"><path d="${lines.join(' ')}" stroke="${c}" stroke-width="1.1" fill="none"/></g>`);
  }

  text(x: number, y: number, s: string, o: { size?: number; c?: string; anchor?: 'start' | 'middle' | 'end'; rotate?: number; weight?: number } = {}) {
    const rot = o.rotate ? ` transform="rotate(${o.rotate} ${f(x)} ${f(y)})"` : '';
    this.parts.push(
      `<text x="${f(x)}" y="${f(y)}" font-family="'Segoe Print','Bradley Hand','Comic Sans MS',cursive" font-size="${o.size ?? 15}" font-weight="${o.weight ?? 700}" fill="${o.c ?? MOVE}" text-anchor="${o.anchor ?? 'start'}"${rot}>${s.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`,
    );
  }

  /** Movement arrow along 2 (straight) or 3 (curved) points. */
  arrow(pts: P[], o: { c?: string; w?: number; dash?: string; head?: number } = {}) {
    const c = o.c ?? MOVE;
    const w = o.w ?? 3;
    const [a, b, cc] = pts;
    const end = cc ?? b;
    const ctrl = cc ? b : null;
    const d = ctrl ? `M${f(a[0])} ${f(a[1])} Q${f(ctrl[0])} ${f(ctrl[1])} ${f(end[0])} ${f(end[1])}` : `M${f(a[0])} ${f(a[1])} L${f(end[0])} ${f(end[1])}`;
    this.path(d, { c, w, dash: o.dash ?? '10 7' });
    const from = ctrl ?? a;
    const ang = Math.atan2(end[1] - from[1], end[0] - from[0]);
    const hl = o.head ?? 16;
    const p1: P = [end[0] - Math.cos(ang - 0.42) * hl, end[1] - Math.sin(ang - 0.42) * hl];
    const p2: P = [end[0] - Math.cos(ang + 0.42) * hl, end[1] - Math.sin(ang + 0.42) * hl];
    this.parts.push(`<path d="M${f(end[0])} ${f(end[1])} L${f(p1[0])} ${f(p1[1])} L${f(p2[0])} ${f(p2[1])} Z" fill="${c}" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"/>`);
  }

  svg(background = true): string {
    const bg = background ? `<rect width="${this.W}" height="${this.H}" fill="#fcfcfa"/>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.W} ${this.H}" width="${this.W}" height="${this.H}"><defs>${this.defs.join('')}</defs>${bg}${this.parts.join('')}</svg>`;
  }
}

/* ------------------------------------------------------------------ props & people */

function waterTower(s: Sketch, x: number, baseY: number, k: number, fill = TONE) {
  const w = 34 * k;
  const h = 30 * k;
  const top = baseY - 34 * k - h;
  s.rect(x - w / 2, top, w, h, { fill, w: 1.8 });
  s.poly(
    [
      [x - w / 2 - 3 * k, top],
      [x, top - 16 * k],
      [x + w / 2 + 3 * k, top],
    ],
    { fill, w: 1.8, close: true },
  );
  for (const dx of [-0.42, -0.14, 0.14, 0.42]) s.line(x + dx * w, top + h, x + dx * w * 1.15, baseY, { w: 1.4 });
  s.line(x - 0.42 * w, top + h + 4 * k, x + 0.42 * w * 1.15, baseY - 4 * k, { w: 1, ghost: false });
  s.line(x + 0.42 * w, top + h + 4 * k, x - 0.42 * w * 1.15, baseY - 4 * k, { w: 1, ghost: false });
  for (let i = 1; i < 4; i++) s.line(x - w / 2, top + (h * i) / 4, x + w / 2, top + (h * i) / 4, { w: 0.8, c: SOFT, ghost: false });
}

/** Skyline silhouette between y0 (roofline base) with buildings up to `maxH`. */
function skyline(s: Sketch, baseY: number, maxH: number, seed = 1, towers: number[] = []) {
  const r = mulberry32(seed);
  let x = -10;
  const pts: P[] = [[-10, baseY]];
  while (x < s.W + 10) {
    const w = 40 + r() * 90;
    const h = maxH * (0.35 + r() * 0.65);
    pts.push([x, baseY - h], [x + w, baseY - h]);
    x += w;
  }
  pts.push([s.W + 10, baseY]);
  s.poly(pts, { fill: TONE, w: 1.6, close: true });
  // windows
  for (let i = 0; i < 26; i++) {
    const wx = r() * s.W;
    const wy = baseY - r() * maxH * 0.35 - 6;
    s.line(wx, wy, wx + 6, wy, { w: 1, c: SOFT, ghost: false });
  }
  for (const tx of towers) waterTower(s, tx, baseY - maxH * (0.55 + r() * 0.25), 0.9);
}

function sun(s: Sketch, cx: number, cy: number, r: number, warm = true) {
  s.ellipse(cx, cy, r, r, { fill: warm ? '#fde8d3' : 'none', w: 1.6 });
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + (i / 8) * Math.PI;
    s.line(cx + Math.cos(a) * (r + 8), cy + Math.sin(a) * (r + 8), cx + Math.cos(a) * (r + 22), cy + Math.sin(a) * (r + 22), { w: 1.2, c: SOFT, ghost: false });
  }
}

type Pose = 'stand' | 'walk' | 'run' | 'cheer' | 'bend' | 'sit';

/** Stick / silhouette figure standing on footY, `h` tall. */
function figure(s: Sketch, x: number, footY: number, h: number, o: { pose?: Pose; face?: 1 | -1; silhouette?: boolean; coat?: boolean; headset?: boolean; prop?: 'walkie' | 'script' } = {}) {
  const pose = o.pose ?? 'stand';
  const face = o.face ?? 1;
  const w = o.silhouette ? Math.max(3, h * 0.07) : Math.max(1.8, h * 0.022);
  const c = o.silhouette ? '#2a2a30' : INK;
  const r = h * 0.075;
  const lean = pose === 'run' ? face * h * 0.07 : pose === 'bend' ? face * h * 0.12 : 0;
  const sit = pose === 'sit';
  const hipY = sit ? footY - h * 0.3 : footY - h * 0.48;
  const neckY = footY - h + r * 2.1 + (sit ? h * 0.18 : 0) + (pose === 'bend' ? h * 0.08 : 0);
  const headX = x + lean * 1.2;
  const shX = x + lean;
  const shY = neckY + h * 0.04;
  // head
  s.ellipse(headX, neckY - r * 1.05, r * 0.92, r, { fill: o.silhouette ? c : '#fcfcfa', w: o.silhouette ? 1 : w, c });
  if (o.headset) {
    s.path(`M${f(headX - r)} ${f(neckY - r * 1.2)} Q${f(headX)} ${f(neckY - r * 3)} ${f(headX + r)} ${f(neckY - r * 1.2)}`, { w: w * 0.8, c });
    s.ellipse(headX + face * r * 0.95, neckY - r, r * 0.3, r * 0.42, { fill: c, w: 1, c, ghost: false });
  }
  // coat (behind the limbs)
  if (o.coat) {
    s.poly(
      [
        [shX - h * 0.08, shY],
        [shX + h * 0.08, shY],
        [x + h * 0.13 + (pose === 'walk' || pose === 'run' ? -face * h * 0.05 : 0), hipY + h * 0.2],
        [x - h * 0.13 - (pose === 'walk' || pose === 'run' ? face * h * 0.08 : 0), hipY + h * 0.22],
      ],
      { fill: COAT, c: '#5a1a14', w: 1.4, close: true, opacity: 0.92 },
    );
  }
  // torso
  s.line(shX, neckY, x, hipY, { w, c });
  // legs
  const legs: [P, P][] = (() => {
    switch (pose) {
      case 'walk':
        return [
          [[x + face * h * 0.06, hipY + h * 0.24], [x + face * h * 0.15, footY]],
          [[x - face * h * 0.04, hipY + h * 0.25], [x - face * h * 0.13, footY]],
        ];
      case 'run':
        return [
          [[x + face * h * 0.16, hipY + h * 0.14], [x + face * h * 0.12, hipY + h * 0.36]],
          [[x - face * h * 0.08, hipY + h * 0.26], [x - face * h * 0.22, footY - h * 0.03]],
        ];
      case 'sit':
        return [
          [[x + face * h * 0.2, hipY], [x + face * h * 0.22, footY]],
          [[x + face * h * 0.17, hipY + 2], [x + face * h * 0.18, footY]],
        ];
      default:
        return [
          [[x - h * 0.03, hipY + h * 0.25], [x - h * 0.07, footY]],
          [[x + h * 0.03, hipY + h * 0.25], [x + h * 0.07, footY]],
        ];
    }
  })();
  for (const [knee, foot] of legs) {
    s.line(x, hipY, knee[0], knee[1], { w, c });
    s.line(knee[0], knee[1], foot[0], foot[1], { w, c });
  }
  // arms
  const arms: [P, P][] = (() => {
    switch (pose) {
      case 'cheer':
        return [
          [[shX - h * 0.12, shY - h * 0.06], [shX - h * 0.16, shY - h * 0.24]],
          [[shX + h * 0.12, shY - h * 0.06], [shX + h * 0.17, shY - h * 0.25]],
        ];
      case 'run':
        return [
          [[shX + face * h * 0.1, shY + h * 0.1], [shX + face * h * 0.2, shY + h * 0.02]],
          [[shX - face * h * 0.08, shY + h * 0.13], [shX - face * h * 0.16, shY + h * 0.2]],
        ];
      case 'walk':
        return [
          [[shX + face * h * 0.07, shY + h * 0.14], [shX + face * h * 0.12, shY + h * 0.27]],
          [[shX - face * h * 0.06, shY + h * 0.14], [shX - face * h * 0.1, shY + h * 0.27]],
        ];
      case 'bend':
        return [
          [[shX + face * h * 0.08, shY + h * 0.12], [shX + face * h * 0.16, shY + h * 0.2]],
          [[shX + face * h * 0.04, shY + h * 0.14], [shX + face * h * 0.13, shY + h * 0.24]],
        ];
      default:
        return [
          [[shX - h * 0.08, shY + h * 0.14], [shX - h * 0.1, shY + h * 0.28]],
          [[shX + h * 0.08, shY + h * 0.14], [shX + h * 0.1, shY + h * 0.28]],
        ];
    }
  })();
  for (const [elbow, hand] of arms) {
    s.line(shX, shY, elbow[0], elbow[1], { w, c });
    s.line(elbow[0], elbow[1], hand[0], hand[1], { w, c });
  }
  const hand = arms[0][1];
  if (o.prop === 'walkie') {
    s.rect(hand[0] - h * 0.02, hand[1] - h * 0.07, h * 0.04, h * 0.08, { fill: c, w: 1, c });
    s.line(hand[0] + h * 0.01, hand[1] - h * 0.07, hand[0] + h * 0.01, hand[1] - h * 0.12, { w: 1.2, c });
  } else if (o.prop === 'script') {
    s.rect(hand[0] - h * 0.03, hand[1] - h * 0.02, h * 0.07, h * 0.09, { fill: '#fcfcfa', w: 1.2, c });
  }
}

/** Head & shoulders for close shots. `side`: -1 looks left, 1 right, 0 to camera. */
function bust(s: Sketch, cx: number, baseY: number, k: number, o: { side?: -1 | 0 | 1; headset?: boolean; coat?: boolean; hairWind?: boolean; dark?: boolean } = {}) {
  const side = o.side ?? 0;
  const headR = 46 * k;
  const headY = baseY - 150 * k;
  const fill = o.dark ? '#2a2a30' : '#fcfcfa';
  // shoulders
  s.path(
    `M${f(cx - 150 * k)} ${f(baseY)} Q${f(cx - 140 * k)} ${f(baseY - 70 * k)} ${f(cx - 40 * k)} ${f(baseY - 86 * k)} L${f(cx + 40 * k)} ${f(baseY - 86 * k)} Q${f(cx + 140 * k)} ${f(baseY - 70 * k)} ${f(cx + 150 * k)} ${f(baseY)} Z`,
    { fill: o.coat ? COAT : o.dark ? '#2a2a30' : TONE, c: o.coat ? '#5a1a14' : INK, w: 2.2 },
  );
  if (o.coat) {
    s.path(`M${f(cx - 40 * k)} ${f(baseY - 86 * k)} L${f(cx - 70 * k)} ${f(baseY - 40 * k)} L${f(cx - 20 * k)} ${f(baseY - 60 * k)}`, { c: '#5a1a14', w: 2 });
    s.path(`M${f(cx + 40 * k)} ${f(baseY - 86 * k)} L${f(cx + 70 * k)} ${f(baseY - 40 * k)} L${f(cx + 20 * k)} ${f(baseY - 60 * k)}`, { c: '#5a1a14', w: 2 });
  }
  // neck
  s.line(cx - 18 * k, baseY - 86 * k, cx - 16 * k, headY + headR * 0.8, { w: 2 });
  s.line(cx + 18 * k, baseY - 86 * k, cx + 16 * k, headY + headR * 0.8, { w: 2 });
  // head
  s.ellipse(cx + side * 4 * k, headY, headR * 0.86, headR, { fill, w: 2.4 });
  if (!o.dark) {
    // hair
    s.path(`M${f(cx - headR * 0.9)} ${f(headY - headR * 0.1)} Q${f(cx - headR * 0.6)} ${f(headY - headR * 1.25)} ${f(cx + headR * 0.4)} ${f(headY - headR * 1.02)} Q${f(cx + headR * 0.95)} ${f(headY - headR * 0.7)} ${f(cx + headR * 0.88)} ${f(headY + headR * 0.1)}`, {
      w: 2.4,
    });
    if (o.hairWind) {
      for (let i = 0; i < 4; i++) s.path(`M${f(cx + headR * 0.7)} ${f(headY - headR * (0.8 - i * 0.25))} q${f(40 * k)} ${f(-10 * k)} ${f(70 * k + i * 12 * k)} ${f(8 * k)}`, { w: 1.6, c: SOFT });
    }
    // face
    const fx = cx + side * headR * 0.35;
    if (side === 0) {
      s.line(fx - 16 * k, headY - 4 * k, fx - 6 * k, headY - 5 * k, { w: 2, ghost: false });
      s.line(fx + 6 * k, headY - 5 * k, fx + 16 * k, headY - 4 * k, { w: 2, ghost: false });
      s.line(fx, headY + 2 * k, fx - 3 * k, headY + 16 * k, { w: 1.4, ghost: false });
      s.line(fx - 9 * k, headY + 28 * k, fx + 9 * k, headY + 27 * k, { w: 1.6, ghost: false });
    } else {
      s.line(fx + side * 6 * k, headY - 5 * k, fx + side * 16 * k, headY - 6 * k, { w: 2, ghost: false });
      s.path(`M${f(cx + side * headR * 0.84)} ${f(headY - 4 * k)} l${f(side * 10 * k)} ${f(14 * k)} l${f(-side * 9 * k)} ${f(3 * k)}`, { w: 1.6 });
      s.line(fx + side * 2 * k, headY + 28 * k, fx + side * 14 * k, headY + 27 * k, { w: 1.6, ghost: false });
      s.ellipse(cx - side * headR * 0.3, headY + 2 * k, 7 * k, 11 * k, { w: 1.4, ghost: false });
    }
  }
  if (o.headset) {
    s.path(`M${f(cx - headR * 0.92)} ${f(headY)} Q${f(cx)} ${f(headY - headR * 1.65)} ${f(cx + headR * 0.92)} ${f(headY)}`, { w: 3.2 });
    s.ellipse(cx + (side === 0 ? -1 : -side) * headR * 0.86, headY + 4 * k, 9 * k, 15 * k, { fill: INK, w: 1 });
    s.path(`M${f(cx - headR * 0.8)} ${f(headY + 14 * k)} q${f(10 * k)} ${f(26 * k)} ${f(40 * k)} ${f(26 * k)}`, { w: 1.6 });
  }
}

function monitor(s: Sketch, x: number, y: number, w: number, h: number, o: { glow?: boolean; back?: boolean; stand?: boolean } = {}) {
  s.rect(x, y, w, h, { fill: o.back ? '#3a3a42' : o.glow ? '#f1f1ef' : TONE, w: 2.2 });
  if (!o.back) s.rect(x + w * 0.06, y + h * 0.08, w * 0.88, h * 0.8, { w: 1.2, c: SOFT, ghost: false, fill: o.glow ? '#ffffff' : 'none' });
  if (o.stand !== false) {
    s.line(x + w / 2, y + h, x + w / 2, y + h + h * 0.35, { w: 2.4 });
    s.line(x + w / 2 - w * 0.2, y + h + h * 0.35, x + w / 2 + w * 0.2, y + h + h * 0.35, { w: 2.4 });
  }
}

function filmCamera(s: Sketch, x: number, y: number, k: number) {
  // body + lens + two reels + tripod
  s.rect(x - 40 * k, y - 26 * k, 80 * k, 52 * k, { fill: TONE, w: 2.2 });
  s.rect(x + 40 * k, y - 12 * k, 30 * k, 24 * k, { fill: '#fcfcfa', w: 2 });
  s.ellipse(x + 76 * k, y, 6 * k, 13 * k, { w: 1.6 });
  s.ellipse(x - 18 * k, y - 50 * k, 24 * k, 24 * k, { w: 2 });
  s.ellipse(x + 22 * k, y - 50 * k, 24 * k, 24 * k, { w: 2 });
  s.ellipse(x - 18 * k, y - 50 * k, 5 * k, 5 * k, { w: 1.2, ghost: false });
  s.ellipse(x + 22 * k, y - 50 * k, 5 * k, 5 * k, { w: 1.2, ghost: false });
  s.line(x, y + 26 * k, x - 50 * k, y + 150 * k, { w: 2.2 });
  s.line(x, y + 26 * k, x + 48 * k, y + 150 * k, { w: 2.2 });
  s.line(x, y + 26 * k, x + 6 * k, y + 160 * k, { w: 2.2 });
}

function pushIn(s: Sketch, inset = 0.16, out = false) {
  const { W, H } = s;
  const ix = W * inset;
  const iy = H * inset;
  s.rect(ix, iy, W - ix * 2, H - iy * 2, { c: MOVE, w: 2, dash: '9 7' });
  const corners: [P, P][] = [
    [[16, 14], [ix - 6, iy - 6]],
    [[W - 16, 14], [W - ix + 6, iy - 6]],
    [[16, H - 14], [ix - 6, H - iy + 6]],
    [[W - 16, H - 14], [W - ix + 6, H - iy + 6]],
  ];
  for (const [a, b] of corners) s.arrow(out ? [b, a] : [a, b], { dash: '1 0', w: 2.6, head: 13 });
}

/* ------------------------------------------------------------------ frames */

export interface SampleFrame {
  image: string;
  drawing?: string;
}

export function sampleSketches(aspect: number): Record<string, SampleFrame> {
  const H = 400;
  const W = Math.round(H * (aspect > 0 ? aspect : 16 / 9));
  const out: Record<string, SampleFrame> = {};
  const mk = (seed: number) => new Sketch(W, H, seed);

  /* --- Scene 1: rooftop, dusk --- */
  {
    const s = mk(11);
    sun(s, s.x(78), s.y(60), 34);
    skyline(s, s.y(66), s.y(26), 4, [s.x(18), s.x(52), s.x(88)]);
    s.poly([[0, s.y(78)], [s.W, s.y(74)]], { w: 2.4 });
    s.hatch(0, s.y(76), s.W, s.y(24), 10, SOFT, 0.35);
    figure(s, s.x(30), s.y(90), 52, { headset: true });
    figure(s, s.x(36), s.y(91), 50, { pose: 'bend', face: -1 });
    filmCamera(s, s.x(41), s.y(80), 0.22);
    figure(s, s.x(47), s.y(90), 48, { pose: 'walk', face: -1 });
    pushIn(s, 0.2);
    s.text(s.x(50), s.y(12), 'PUSH IN', { anchor: 'middle' });
    out.shot_sample_r1_1 = { image: s.svg() };
  }
  {
    const s = mk(12);
    skyline(s, s.y(62), s.y(20), 7, [s.x(80)]);
    s.ellipse(s.x(86), s.y(14), 30, 30, { fill: '#fde8d3', w: 1.4 });
    for (let i = 0; i < 5; i++) s.line(s.x(70 - i * 6), s.y(10 + i * 9), s.x(76 - i * 6), s.y(12 + i * 9), { c: SOFT, w: 1.2, ghost: false });
    bust(s, s.x(60), s.H + 10, 1.5, { side: -1, headset: true });
    monitor(s, s.x(4), s.y(46), s.x(28), s.y(40), { back: true, stand: false });
    out.shot_sample_r1_2 = { image: s.svg() };
  }
  {
    const s = mk(13);
    skyline(s, s.y(56), s.y(18), 9, [s.x(12), s.x(64)]);
    s.poly([[0, s.y(70)], [s.W, s.y(68)]], { w: 2.4 });
    filmCamera(s, s.x(38), s.y(44), 1.05);
    figure(s, s.x(62), s.y(96), 250, { pose: 'bend', face: -1 });
    s.arrow([[s.x(12), s.y(94)], [s.x(48), s.y(94)]]);
    s.text(s.x(13), s.y(89), 'TRUCK R');
    out.shot_sample_r1_3 = { image: s.svg() };
  }
  {
    const s = mk(14);
    skyline(s, s.y(50), s.y(20), 15, [s.x(30), s.x(74)]);
    sun(s, s.x(56), s.y(48), 26);
    s.poly([[0, s.y(62)], [s.W, s.y(60)]], { w: 2.4 });
    s.hatch(0, s.y(61), s.W, s.y(39), 12, SOFT, 0.28);
    figure(s, s.x(22), s.y(92), 150, { pose: 'run', face: 1, prop: 'walkie' });
    figure(s, s.x(70), s.y(92), 158, { headset: true, face: -1 });
    monitor(s, s.x(76), s.y(56), s.x(12), s.y(16));
    s.arrow([[s.x(16), s.y(16)], [s.x(46), s.y(4)], [s.x(70), s.y(16)]]);
    s.text(s.x(42), s.y(13), 'PAN', { anchor: 'middle' });
    out.shot_sample_r1_4 = { image: s.svg() };
  }

  /* --- Scene 2: stairwell --- */
  {
    const s = mk(21);
    const cx = s.W / 2;
    const cy = s.H / 2;
    for (let i = 0; i < 7; i++) {
      const k = 1 - i * 0.13;
      const w = s.W * 0.78 * k;
      const h = s.H * 0.9 * k;
      s.rect(cx - w / 2, cy - h / 2, w, h, { w: 2.2 - i * 0.2, fill: i === 6 ? '#2a2a30' : i % 2 ? '#f2f1ee' : 'none' });
      if (i < 6) for (let t = 0; t < 6; t++) s.line(cx - w / 2 + (w * t) / 6, cy - h / 2, cx - w / 2 + (w * t) / 6 + 6, cy - h / 2 + h * 0.065, { w: 0.9, c: SOFT, ghost: false });
    }
    // June seen from above on a landing
    s.ellipse(s.x(66), s.y(64), 15, 15, { fill: '#2a2a30', w: 1 });
    s.ellipse(s.x(66), s.y(70), 26, 16, { fill: COAT, c: '#5a1a14', w: 1.4, opacity: 0.92 });
    s.text(s.x(74), s.y(78), 'JUNE', { c: INK, size: 13 });
    out.shot_sample_st_1 = { image: s.svg() };
  }
  {
    const s = mk(22);
    // stairs climbing to the right
    for (let i = 0; i < 9; i++) {
      const x = s.x(-5 + i * 12);
      const y = s.y(100 - i * 11);
      s.poly([[x, y], [x, y - s.y(11)], [x + s.x(12), y - s.y(11)]], { w: 2 });
    }
    s.line(s.x(-2), s.y(70), s.x(100), s.y(-6), { w: 2.6 });
    for (let i = 0; i < 9; i++) s.line(s.x(4 + i * 12), s.y(70 - i * 9.4), s.x(4 + i * 12), s.y(88 - i * 11), { w: 1.2, c: SOFT });
    figure(s, s.x(46), s.y(62), 230, { pose: 'run', face: 1, coat: true, prop: 'script' });
    out.shot_sample_st_2 = { image: s.svg() };
    const d = mk(122);
    d.arrow([[d.x(16), d.y(90)], [d.x(48), d.y(84)], [d.x(78), d.y(30)]], { w: 3.4 });
    d.text(d.x(66), d.y(56), 'TRACK WITH JUNE');
    out.shot_sample_st_2.drawing = d.svg(false);
  }
  {
    const s = mk(23);
    // coat sleeve
    s.poly([[0, s.y(58)], [s.x(34), s.y(48)], [s.x(40), s.y(96)], [0, s.y(100)]], { fill: COAT, c: '#5a1a14', w: 2, close: true, opacity: 0.92 });
    s.hatch(0, s.y(50), s.x(38), s.y(50), 8, '#5a1a14', 0.25);
    // hand
    s.path(`M${f(s.x(34))} ${f(s.y(52))} Q${f(s.x(48))} ${f(s.y(42))} ${f(s.x(58))} ${f(s.y(50))} L${f(s.x(60))} ${f(s.y(84))} Q${f(s.x(48))} ${f(s.y(96))} ${f(s.x(38))} ${f(s.y(92))} Z`, { fill: '#f6efe8', w: 2.4 });
    // walkie
    s.rect(s.x(48), s.y(18), s.x(14), s.y(62), { fill: '#2f2f36', w: 2.4 });
    s.rect(s.x(50), s.y(24), s.x(10), s.y(14), { fill: '#9fa3a8', w: 1.2 });
    for (let i = 0; i < 5; i++) s.line(s.x(50.5), s.y(46 + i * 4), s.x(59.5), s.y(46 + i * 4), { w: 1.4, c: '#8a8a93', ghost: false });
    s.line(s.x(58), s.y(18), s.x(59), s.y(2), { w: 4 });
    for (let i = 0; i < 4; i++) s.path(`M${f(s.x(64 + i * 3))} ${f(s.y(20 - i * 2))} q${f(s.x(2))} ${f(s.y(8))} 0 ${f(s.y(16 + i * 4))}`, { w: 1.6, c: MOVE });
    // fingers over the walkie
    for (let i = 0; i < 3; i++) s.path(`M${f(s.x(46))} ${f(s.y(54 + i * 8))} q${f(s.x(9))} ${f(s.y(-2))} ${f(s.x(15))} ${f(s.y(2))}`, { w: 2.2, fill: '#f6efe8' });
    // script pages
    s.poly([[s.x(70), s.y(40)], [s.x(96), s.y(34)], [s.x(99), s.y(92)], [s.x(73), s.y(98)]], { fill: '#fcfcfa', w: 2, close: true });
    for (let i = 0; i < 8; i++) s.line(s.x(74), s.y(48 + i * 6), s.x(94), s.y(43 + i * 6), { w: 1, c: SOFT, ghost: false });
    out.shot_sample_st_3 = { image: s.svg() };
  }
  {
    const s = mk(24);
    const vx = s.W / 2;
    const vy = s.y(18);
    for (let i = 0; i < 6; i++) {
      const k = 1 - i * 0.16;
      const w = s.W * 0.95 * k;
      const h = s.H * 1.6 * k;
      s.rect(vx - w / 2, vy + s.y(82) - h, w, h, { w: 2 - i * 0.2, fill: i === 5 ? '#d9d8d4' : 'none' });
    }
    for (const [x, y] of [[0, 0], [s.W, 0], [0, s.H], [s.W, s.H]] as P[]) s.line(x, y, vx, vy, { w: 1.2, c: SOFT });
    for (let i = 0; i < 10; i++) s.line(s.x(6 + i * 9), s.y(100), vx + (s.x(6 + i * 9) - vx) * 0.25, vy + s.y(20), { w: 0.9, c: SOFT, ghost: false });
    s.arrow([[s.x(90), s.y(88)], [s.x(90), s.y(14)]], { w: 3.2 });
    s.text(s.x(88), s.y(56), 'TILT UP', { anchor: 'end' });
    out.shot_sample_st_4 = { image: s.svg() };
  }

  /* --- Scene 3: rooftop, magic hour --- */
  {
    const s = mk(31);
    // wall + door frame
    s.rect(0, 0, s.W, s.H, { fill: '#efeeea', w: 0, ghost: false });
    s.hatch(0, 0, s.W, s.H, 14, SOFT, 0.18);
    const dx = s.x(38);
    const dw = s.x(24);
    s.rect(dx, s.y(10), dw, s.y(90), { fill: '#fde8d3', w: 3 });
    for (let i = 0; i < 9; i++) s.line(dx + dw / 2, s.y(60), dx + dw / 2 + Math.cos(-Math.PI / 2 + (i - 4) * 0.28) * dw * 0.8, s.y(60) + Math.sin(-Math.PI / 2 + (i - 4) * 0.28) * s.y(48), { w: 1, c: '#e3a36c', ghost: false });
    // door swung open toward camera
    s.poly([[dx + dw, s.y(10)], [dx + dw + s.x(14), s.y(2)], [dx + dw + s.x(14), s.y(108)], [dx + dw, s.y(100)]], { fill: '#d8d6d0', w: 2.6, close: true });
    s.ellipse(dx + dw + s.x(11), s.y(58), 5, 5, { fill: INK, w: 1 });
    figure(s, dx + dw / 2, s.y(98), 250, { silhouette: true, pose: 'walk', face: 1 });
    // motion lines
    for (let i = 0; i < 3; i++) s.line(dx + dw + s.x(17), s.y(30 + i * 18), dx + dw + s.x(24), s.y(28 + i * 18), { w: 1.6, c: SOFT });
    out.shot_sample_r2_1 = { image: s.svg() };
  }
  {
    const s = mk(32);
    sun(s, s.x(72), s.y(56), 40);
    skyline(s, s.y(58), s.y(24), 21, [s.x(24), s.x(90)]);
    s.poly([[0, s.y(66)], [s.W, s.y(62)]], { w: 2.8 });
    s.rect(0, s.y(62), s.W, s.y(6), { fill: '#d8d6d0', w: 1.6 });
    s.hatch(0, s.y(68), s.W, s.y(32), 11, SOFT, 0.3);
    figure(s, s.x(54), s.y(95), 210, { pose: 'walk', face: 1, coat: true });
    s.arrow([[s.x(14), s.y(96)], [s.x(30), s.y(84)], [s.x(46), s.y(92)]]);
    s.text(s.x(10), s.y(80), 'STEADICAM FOLLOW');
    out.shot_sample_r2_2 = { image: s.svg() };
  }
  {
    const s = mk(33);
    s.ellipse(s.x(20), s.y(40), 46, 46, { fill: '#fde8d3', w: 1.4 });
    skyline(s, s.y(70), s.y(22), 33, [s.x(12)]);
    bust(s, s.x(56), s.H + 6, 1.75, { side: 0, coat: true, hairWind: true });
    for (let i = 0; i < 4; i++) s.path(`M${f(s.x(80))} ${f(s.y(30 + i * 9))} q${f(s.x(6))} ${f(s.y(-3))} ${f(s.x(14))} 0`, { w: 1.4, c: SOFT });
    out.shot_sample_r2_3 = { image: s.svg() };
    const d = mk(133);
    pushIn(d, 0.22);
    d.text(d.x(50), d.y(14), 'SLOW PUSH IN — HOLD FOR THE SPEECH', { anchor: 'middle', size: 14 });
    out.shot_sample_r2_3.drawing = d.svg(false);
  }
  {
    const s = mk(34);
    skyline(s, s.y(50), s.y(20), 41, [s.x(50)]);
    s.ellipse(s.x(86), s.y(26), 24, 24, { fill: '#fde8d3', w: 1.4 });
    bust(s, s.x(33), s.H + 30, 1.1, { side: 1, headset: true });
    bust(s, s.x(66), s.H + 36, 1.15, { side: -1 });
    monitor(s, s.x(30), s.y(70), s.x(40), s.y(34), { back: true, stand: false });
    out.shot_sample_r2_4 = { image: s.svg() };
  }
  {
    const s = mk(35);
    sun(s, s.x(50), s.y(52), 30);
    skyline(s, s.y(54), s.y(22), 52, [s.x(14), s.x(84)]);
    s.poly([[0, s.y(62)], [s.W, s.y(60)]], { w: 2.4 });
    s.hatch(0, s.y(61), s.W, s.y(39), 12, SOFT, 0.28);
    figure(s, s.x(22), s.y(92), 150, { pose: 'cheer', headset: true });
    figure(s, s.x(38), s.y(90), 160, { pose: 'cheer' });
    figure(s, s.x(60), s.y(93), 148, { pose: 'cheer', coat: true });
    figure(s, s.x(78), s.y(91), 140, { pose: 'cheer' });
    // walkie on the gravel
    s.rect(s.x(46), s.y(92), s.x(5), s.y(4), { fill: '#2f2f36', w: 1.6 });
    s.path(`M${f(s.x(52))} ${f(s.y(90))} l6 -8 l5 6 l6 -9 l5 7`, { c: MOVE, w: 2 });
    s.text(s.x(53), s.y(83), 'CRACKLE', { size: 12 });
    s.text(s.x(3), s.y(9), '(HANDHELD)', { c: SOFT, size: 13 });
    out.shot_sample_r2_5 = { image: s.svg() };
  }

  /* --- Scene 4: edit suite, night --- */
  {
    const s = mk(41);
    s.rect(0, 0, s.W, s.H, { fill: '#3b3b42', w: 0, ghost: false });
    for (let r = 0; r < 2; r++)
      for (let c = 0; c < 3; c++) monitor(s, s.x(14 + c * 25), s.y(10 + r * 30), s.x(21), s.y(24), { glow: true, stand: false });
    s.rect(0, s.y(72), s.W, s.y(28), { fill: '#26262b', w: 2 });
    figure(s, s.x(36), s.y(98), 170, { silhouette: true, pose: 'sit', face: 1 });
    figure(s, s.x(60), s.y(98), 180, { silhouette: true, pose: 'sit', face: -1 });
    pushIn(s, 0.14, true);
    s.text(s.x(50), s.y(96), 'PULL OUT', { anchor: 'middle', c: '#ffb38a' });
    out.shot_sample_ed_1 = { image: s.svg() };
  }
  {
    const s = mk(42);
    s.rect(0, 0, s.W, s.H, { fill: '#46464e', w: 0, ghost: false });
    monitor(s, s.x(56), s.y(6), s.x(40), s.y(36), { glow: true, stand: false });
    bust(s, s.x(64), s.H + 10, 1.15, { side: -1 });
    for (let i = 0; i < 5; i++) s.line(s.x(66), s.y(30), s.x(46 + i * 4), s.y(46 + i * 3), { w: 1, c: '#dcdcd6', ghost: false, opacity: 0.6 });
    bust(s, s.x(16), s.H + 120, 2.1, { dark: true });
    out.shot_sample_ed_2 = { image: s.svg() };
  }
  {
    const s = mk(43);
    // keyboard in perspective
    const rows = 4;
    const cols = 9;
    const pitch = s.W * 0.106;
    const keyW = s.W * 0.094;
    const sc = (t: number) => 0.75 + 0.25 * t; // keys further away are smaller
    const left = (c: number, t: number) => s.W / 2 + (c - (cols - 1) / 2) * pitch * sc(t) - (keyW * sc(t)) / 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const t0 = r / rows;
        const t1 = (r + 0.85) / rows;
        const y0 = s.y(30 + t0 * 70);
        const y1 = s.y(30 + t1 * 70);
        const hot = r === 2 && c === 5;
        s.poly(
          [
            [left(c, t0), y0],
            [left(c, t0) + keyW * sc(t0), y0],
            [left(c, t1) + keyW * sc(t1), y1],
            [left(c, t1), y1],
          ],
          { close: true, w: 1.6, fill: hot ? '#fde8d3' : '#f2f1ee' },
        );
        if (hot) s.text(left(c, t1) + (keyW * sc(t1)) / 2, (y0 + y1) / 2 + 5, 'SAVE', { anchor: 'middle', c: INK, size: 13 });
      }
    }
    // finger coming down on SAVE
    s.path(`M${f(s.x(72))} ${f(s.y(-4))} L${f(s.x(64))} ${f(s.y(58))} Q${f(s.x(66))} ${f(s.y(68))} ${f(s.x(71))} ${f(s.y(62))} L${f(s.x(84))} ${f(s.y(-4))}`, { fill: '#f6efe8', w: 2.4 });
    s.path(`M${f(s.x(65))} ${f(s.y(56))} q${f(s.x(2))} ${f(s.y(-6))} ${f(s.x(5))} ${f(s.y(-2))}`, { w: 1.4 });
    out.shot_sample_ed_3 = { image: s.svg() };
  }
  {
    const s = mk(44);
    s.rect(0, 0, s.W, s.H, { fill: '#2c2c33', w: 0, ghost: false });
    // monitor filling frame
    s.rect(s.x(6), s.y(6), s.x(88), s.y(84), { fill: '#fcfcfa', w: 3 });
    sun(s, s.x(52), s.y(58), 36);
    skyline(s, s.y(62), s.y(18), 61, [s.x(28), s.x(78)]);
    s.rect(s.x(6), s.y(62), s.x(88), s.y(28), { fill: '#e2e0da', w: 1.2 });
    figure(s, s.x(50), s.y(86), 150, { silhouette: true, coat: true, face: 1 });
    for (const [x, y] of [[12, 12], [88, 12], [12, 82], [88, 82]] as P[]) {
      s.line(s.x(x) - 8, s.y(y), s.x(x) + 8, s.y(y), { c: '#0ca678', w: 2, ghost: false });
      s.line(s.x(x), s.y(y) - 8, s.x(x), s.y(y) + 8, { c: '#0ca678', w: 2, ghost: false });
    }
    s.text(s.x(7), s.y(97), 'VFX: screen replacement — tracking markers', { c: '#9ae6c8', size: 12 });
    pushIn(s, 0.26);
    out.shot_sample_ed_4 = { image: s.svg() };
  }
  return out;
}
