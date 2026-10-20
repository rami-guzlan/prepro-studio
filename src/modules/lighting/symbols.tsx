/* ==========================================================================
   Pure SVG drawing of lighting-plot items (top-down symbols, beams, camera
   field-of-view wedges and labels). No hooks, no state, no event handlers:
   everything here also runs inside renderToStaticMarkup (print / export).

   Local item frame: centred on (x, y), facing "up" (-y) at rotation 0,
   rotation is clockwise in degrees.
   ========================================================================== */
import type { ReactNode } from 'react';
import type { DiagramItem } from '@/types';
import { kindDef, type KindDef } from './library';
import { beamColor, darken, mix, textOn, type Palette } from './color';
import { boxSize, fmtLength, hfov, itemPoints, itemRot, itemScale, lnum, pbool, pnum, pstr, textLines, type P } from './model';

export const FONT = "Inter, 'Segoe UI', Arial, sans-serif";
const SW = 1.5;

export interface DrawCtx {
  pal: Palette;
  /** canvas px per unit */
  ppu: number;
  units: 'ft' | 'm';
  /** unique prefix for gradient ids */
  idp: string;
  /** editor mode: adds invisible hit areas */
  editor?: boolean;
  /** text scale for captions / dimensions / small text (print legibility; 1 in the editor) */
  ts?: number;
}

const safeId = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '');
const f = (n: number) => Math.round(n * 100) / 100;

function outline(c: DrawCtx, fill: string, width = SW) {
  return { fill, stroke: c.pal.ink, strokeWidth: width, strokeLinejoin: 'round' as const };
}

/* ======================================================================== symbols */

function lightColorOf(item: DiagramItem): string {
  const def = kindDef(item.kind);
  return beamColor(pnum(item, 'cct') ?? pnum({ props: def.props }, 'cct'), pstr(item, 'gel'), item.color);
}

function octagon(r: number): string {
  const pts: string[] = [];
  for (let k = 0; k < 8; k++) {
    const a = ((22.5 + k * 45) * Math.PI) / 180;
    pts.push(`${f(Math.cos(a) * r)},${f(Math.sin(a) * r)}`);
  }
  return pts.join(' ');
}

function yoke(c: DrawCtx, x: number, y0: number, y1: number) {
  return <path d={`M${-x + 2},${y0} L${-x},${y0} L${-x},${y1} L${x},${y1} L${x},${y0} L${x - 2},${y0}`} fill="none" stroke={c.pal.ink2} strokeWidth={2} strokeLinejoin="round" />;
}

function drawLight(item: DiagramItem, def: KindDef, c: DrawCtx): ReactNode {
  const p = c.pal;
  const bc = lightColorOf(item);
  const bcInk = darken(bc, 0.35);
  switch (def.kind) {
    case 'light.fresnel':
      return (
        <>
          {yoke(c, 19, -2, 10)}
          <rect x={-14} y={-14} width={28} height={27} rx={5} {...outline(c, p.body)} />
          <line x1={-8} y1={6} x2={8} y2={6} stroke={p.ink3} strokeWidth={1} />
          <line x1={-8} y1={9} x2={8} y2={9} stroke={p.ink3} strokeWidth={1} />
          <rect x={-13} y={-18} width={26} height={4.5} rx={1} {...outline(c, bc, 1.2)} />
          <path d="M-13,-17.5 L-20,-24.5 M13,-17.5 L20,-24.5" stroke={p.ink} strokeWidth={2.2} strokeLinecap="round" />
        </>
      );
    case 'light.panel':
      return (
        <>
          {yoke(c, 23, -5, 7)}
          <rect x={-20} y={-8} width={40} height={8} rx={1.5} {...outline(c, p.body)} />
          <rect x={-19} y={-10.5} width={38} height={2.6} rx={1} {...outline(c, bc, 1)} />
          <rect x={-7} y={1} width={14} height={8} rx={1.5} {...outline(c, p.body2, 1.2)} />
        </>
      );
    case 'light.mat':
      return (
        <>
          <rect x={-27} y={-7} width={54} height={7} rx={1} {...outline(c, p.body2)} />
          <rect x={-26} y={-9.5} width={52} height={2.6} rx={1} {...outline(c, bc, 1)} />
          <path d="M-27,-3.5 L27,-3.5" stroke={p.ink3} strokeWidth={0.8} />
          <path d="M0,0 C0,4 6,4 6,8" fill="none" stroke={p.ink2} strokeWidth={1.2} />
          <rect x={1} y={8} width={11} height={6} rx={1} {...outline(c, p.metal2, 1.1)} />
        </>
      );
    case 'light.softbox':
      return (
        <>
          <path d="M-8,8 L-25,-15 L25,-15 L8,8 Z" {...outline(c, p.body2)} />
          <path d="M-3,8 L-11,-15 M3,8 L11,-15" stroke={p.ink3} strokeWidth={0.9} />
          <rect x={-26} y={-18.5} width={52} height={4} rx={1} {...outline(c, bc, 1.2)} />
          <rect x={-7} y={8} width={14} height={11} rx={2.5} {...outline(c, p.body)} />
        </>
      );
    case 'light.lantern':
      return (
        <>
          <polygon points={octagon(21)} {...outline(c, p.body2)} />
          <polygon points={octagon(14)} fill={bc} stroke={bcInk} strokeWidth={0.9} />
          <path
            d={Array.from({ length: 8 }, (_, k) => {
              const a = ((22.5 + k * 45) * Math.PI) / 180;
              return `M${f(Math.cos(a) * 14)},${f(Math.sin(a) * 14)} L${f(Math.cos(a) * 21)},${f(Math.sin(a) * 21)}`;
            }).join(' ')}
            stroke={p.ink3}
            strokeWidth={0.9}
          />
          <circle r={4} {...outline(c, p.body, 1.2)} />
        </>
      );
    case 'light.chinaball':
      return (
        <>
          <circle r={17} {...outline(c, bc)} />
          <circle r={11.5} fill="none" stroke={bcInk} strokeWidth={0.8} opacity={0.7} />
          <circle r={6} fill="none" stroke={bcInk} strokeWidth={0.8} opacity={0.7} />
          <circle r={2.6} {...outline(c, p.body, 1)} />
        </>
      );
    case 'light.tube':
      return (
        <>
          <rect x={-3} y={3} width={6} height={5} rx={1} {...outline(c, p.metal2, 1)} />
          <rect x={-30} y={-4} width={60} height={8} rx={4} {...outline(c, bc)} />
          <path d={[-21, -14, -7, 0, 7, 14, 21].map((x) => `M${x},-2.6 L${x},2.6`).join(' ')} stroke={bcInk} strokeWidth={0.8} opacity={0.7} />
          <rect x={-34} y={-4.5} width={6} height={9} rx={1.5} {...outline(c, p.metal, 1.1)} />
          <rect x={28} y={-4.5} width={6} height={9} rx={1.5} {...outline(c, p.metal, 1.1)} />
        </>
      );
    case 'light.ring':
      return (
        <>
          <line x1={0} y1={3} x2={0} y2={13.5} stroke={p.metal2} strokeWidth={2} />
          <circle r={19.5} fill="none" stroke={p.ink} strokeWidth={SW} />
          <circle r={16.5} fill="none" stroke={bc} strokeWidth={5} />
          <circle r={13.5} fill="none" stroke={p.ink} strokeWidth={SW} />
          <rect x={-4} y={-3} width={8} height={6} rx={1} {...outline(c, p.metal, 1)} />
        </>
      );
    case 'light.par':
      return (
        <>
          {yoke(c, 14, -4, 14)}
          <rect x={-10} y={-14} width={20} height={30} rx={4} {...outline(c, p.body)} />
          <line x1={-6} y1={10} x2={6} y2={10} stroke={p.ink3} strokeWidth={1} />
          <line x1={-6} y1={13} x2={6} y2={13} stroke={p.ink3} strokeWidth={1} />
          <rect x={-6.5} y={-26} width={13} height={12} rx={1} {...outline(c, p.body2)} />
          <rect x={-10.5} y={-22} width={4} height={4} rx={0.8} {...outline(c, p.metal2, 0.9)} />
          <rect x={6.5} y={-22} width={4} height={4} rx={0.8} {...outline(c, p.metal2, 0.9)} />
          <rect x={-6.5} y={-29} width={13} height={3} rx={1} {...outline(c, bc, 1)} />
        </>
      );
    case 'light.hmi':
      return (
        <>
          <path d="M5,14 C5,20 9,21 10,24" fill="none" stroke={p.ink2} strokeWidth={1.4} />
          {yoke(c, 22, -4, 12)}
          <rect x={-18} y={-16} width={36} height={30} rx={6} {...outline(c, p.body)} />
          <rect x={-17} y={-21} width={34} height={5} rx={1} {...outline(c, bc, 1.2)} />
          <path d="M-17,-20.5 L-24.5,-29 M17,-20.5 L24.5,-29" stroke={p.ink} strokeWidth={2.4} strokeLinecap="round" />
          <text x={0} y={4} fontSize={8} fontWeight={800} fontFamily={FONT} fill={p.ink2} textAnchor="middle">
            HMI
          </text>
          <rect x={8} y={20} width={16} height={10} rx={1.5} {...outline(c, p.metal, 1.2)} />
        </>
      );
    case 'light.practical':
      return (
        <>
          <circle r={15} {...outline(c, p.body)} />
          <circle r={9} fill={bc} stroke={p.ink} strokeWidth={1} />
          <line x1={-9} y1={0} x2={9} y2={0} stroke={bcInk} strokeWidth={0.8} />
          <circle r={3.5} fill="#fff8dc" stroke={p.ink} strokeWidth={0.8} />
        </>
      );
    case 'light.window':
      return (
        <>
          <rect x={-33} y={-4.5} width={66} height={9} {...outline(c, p.body)} />
          <rect x={-31} y={-2.2} width={62} height={4.4} fill={bc} opacity={0.95} />
          <path d="M-10.5,-4.5 L-10.5,4.5 M10.5,-4.5 L10.5,4.5" stroke={p.ink} strokeWidth={1.2} />
          <line x1={-35} y1={7} x2={35} y2={7} stroke={p.ink2} strokeWidth={1.5} />
        </>
      );
    case 'light.sun':
      return (
        <>
          <path
            d={Array.from({ length: 8 }, (_, k) => k)
              .filter((k) => k !== 0)
              .map((k) => {
                const a = ((k * 45 - 90) * Math.PI) / 180;
                return `M${f(Math.cos(a) * 15)},${f(Math.sin(a) * 15)} L${f(Math.cos(a) * 22)},${f(Math.sin(a) * 22)}`;
              })
              .join(' ')}
            stroke="#f2a20c"
            strokeWidth={2.4}
            strokeLinecap="round"
          />
          <circle r={11.5} fill="#ffcf3f" stroke="#c97f00" strokeWidth={1.5} />
          <path d="M0,-27 L-5,-18 L5,-18 Z" fill={p.ink} />
        </>
      );
    case 'light.screen':
      return (
        <>
          <rect x={-2} y={-2} width={4} height={6} fill={p.metal2} />
          <rect x={-9} y={3} width={18} height={6} rx={2} {...outline(c, p.body2, 1.1)} />
          <rect x={-20} y={-6.5} width={40} height={5} rx={1} {...outline(c, p.metal, 1.2)} />
          <rect x={-19} y={-9} width={38} height={2.4} rx={0.8} fill={bc} />
        </>
      );
    default:
      return <circle r={14} {...outline(c, bc)} />;
  }
}

function drawCamera(item: DiagramItem, def: KindDef, c: DrawCtx): ReactNode {
  const p = c.pal;
  switch (def.kind) {
    case 'camera.mirrorless':
      return (
        <>
          <rect x={-6} y={10} width={12} height={7} rx={2} {...outline(c, p.metal2, 1.2)} />
          <rect x={-20} y={-3} width={40} height={15} rx={4} {...outline(c, p.metal)} />
          <rect x={11} y={-6} width={10} height={18} rx={4} {...outline(c, p.metal)} />
          <rect x={-8} y={-19} width={16} height={16} rx={2} {...outline(c, p.metal2)} />
          <path d="M-8,-14 L8,-14 M-8,-9 L8,-9" stroke={p.metalInk} strokeWidth={1} />
          <circle cx={-13} cy={2} r={2.2} fill={p.metalInk} />
        </>
      );
    case 'camera.phone':
      return (
        <>
          <path d="M-12,-2 C-12,9 12,9 12,-2" fill="none" stroke={p.metal2} strokeWidth={3} strokeLinecap="round" />
          <rect x={-4} y={4} width={8} height={13} rx={4} {...outline(c, p.metal, 1.2)} />
          <rect x={-11} y={-8} width={22} height={6} rx={1.5} {...outline(c, p.metal)} />
          <circle cx={5} cy={-8.6} r={1.9} fill={p.metalInk} stroke={p.ink} strokeWidth={0.8} />
        </>
      );
    case 'camera.drone':
      return (
        <>
          <path d="M-19,-19 L19,19 M19,-19 L-19,19" stroke={p.metal2} strokeWidth={3.5} strokeLinecap="round" />
          {(
            [
              [-19, -19],
              [19, -19],
              [-19, 19],
              [19, 19],
            ] as P[]
          ).map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r={10} fill={p.body2} fillOpacity={0.85} stroke={p.ink} strokeWidth={1} />
              <line x1={x - 8} y1={y + 2} x2={x + 8} y2={y - 2} stroke={p.ink2} strokeWidth={1.6} strokeLinecap="round" />
              <circle cx={x} cy={y} r={2} fill={p.metal} />
            </g>
          ))}
          <rect x={-9} y={-12} width={18} height={24} rx={5} {...outline(c, p.metal)} />
          <circle cx={0} cy={-13.5} r={4} {...outline(c, p.metal2, 1.1)} />
          <circle cx={-5} cy={-9} r={1.2} fill="#e5484d" />
          <circle cx={5} cy={-9} r={1.2} fill="#2fb36d" />
        </>
      );
    default: {
      const support = pstr(item, 'support').toLowerCase();
      const sticks = /tripod|sticks|hi-hat/.test(support);
      return (
        <>
          {sticks && <path d="M0,4 L-17,22 M0,4 L17,22 M0,4 L0,-14" stroke={p.ink3} strokeWidth={1.6} strokeLinecap="round" strokeDasharray="3 2" />}
          <path d="M-16,-32 L16,-32 L11,-23 L-11,-23 Z" {...outline(c, p.metal2)} />
          <rect x={-7.5} y={-24} width={15} height={13} rx={1.5} {...outline(c, p.metal)} />
          <path d="M-7.5,-19.5 L7.5,-19.5 M-7.5,-15.5 L7.5,-15.5" stroke={p.metalInk} strokeWidth={1} />
          <rect x={-13} y={-11} width={26} height={36} rx={3} {...outline(c, p.metal)} />
          <rect x={-3.5} y={-7} width={7} height={22} rx={3.5} fill={p.metal2} stroke={p.metalInk} strokeWidth={1} />
          <rect x={-21} y={-5} width={8} height={13} rx={2} {...outline(c, p.metal2)} />
          <rect x={-10} y={25} width={20} height={7} rx={1.5} {...outline(c, p.metal2)} />
        </>
      );
    }
  }
}

/** Frame-type grip (flags, silks, diffusion, bounce, neg) drawn in a w×h box. */
function drawFrame(item: DiagramItem, def: KindDef, c: DrawCtx, w: number, h: number): ReactNode {
  const p = c.pal;
  const x = -w / 2;
  const y = -h / 2;
  const overhead = h >= w * 0.3;
  let fill = '#ffffff';
  let pattern: ReactNode = null;
  const midLine = (dash: string, color: string, width = 1) =>
    overhead ? (
      <path d={`M${x},${y} L${-x},${-y} M${-x},${y} L${x},${-y}`} stroke={color} strokeWidth={width} strokeDasharray={dash} />
    ) : (
      <line x1={x + 2} y1={0} x2={-x - 2} y2={0} stroke={color} strokeWidth={width} strokeDasharray={dash} />
    );
  switch (def.kind) {
    case 'grip.flag':
      fill = '#25262b';
      break;
    case 'grip.negfill':
      fill = '#141519';
      pattern = midLine('', '#3a3c44', 1);
      break;
    case 'grip.scrim':
      fill = '#ffffff';
      pattern = midLine('4 3', '#9da1ae');
      break;
    case 'grip.diffusion':
      fill = '#eaf2ff';
      pattern = midLine('1.5 2.5', '#6f8fc4', 1.3);
      break;
    case 'grip.bounce': {
      const s = pstr(item, 'surface', 'white');
      if (s === 'silver') {
        fill = '#c5cad4';
        pattern = midLine('6 2', '#8b919f');
      } else if (s === 'gold') {
        fill = '#e6b83f';
        pattern = midLine('6 2', '#b38719');
      } else if (s === 'zebra') {
        fill = '#c5cad4';
        const stripes: ReactNode[] = [];
        const n = Math.max(2, Math.round(w / 10));
        for (let i = 0; i < n; i += 2) stripes.push(<rect key={i} x={x + (i * w) / n} y={y} width={w / n} height={h} fill="#e6b83f" />);
        pattern = <>{stripes}</>;
      } else if (s === 'ultrabounce') {
        fill = '#ffffff';
        pattern = overhead ? null : <rect x={x} y={0} width={w} height={h / 2} fill="#1b1c20" />;
      } else {
        fill = '#ffffff';
      }
      break;
    }
  }
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx={overhead ? 0 : Math.min(2, h / 3)} fill={fill} fillOpacity={overhead ? 0.6 : 1} />
      {pattern}
      <rect x={x} y={y} width={w} height={h} rx={overhead ? 0 : Math.min(2, h / 3)} fill="none" stroke={p.ink} strokeWidth={overhead ? 2 : 1.2} />
      {!overhead && (
        <>
          <circle cx={x} cy={0} r={Math.max(1.6, Math.min(3, h * 0.6))} fill={p.metal2} stroke={p.ink} strokeWidth={0.8} />
          <circle cx={-x} cy={0} r={Math.max(1.6, Math.min(3, h * 0.6))} fill={p.metal2} stroke={p.ink} strokeWidth={0.8} />
        </>
      )}
    </>
  );
}

function drawGrip(item: DiagramItem, def: KindDef, c: DrawCtx, w: number, h: number): ReactNode {
  const p = c.pal;
  switch (def.kind) {
    case 'grip.flag':
    case 'grip.scrim':
    case 'grip.diffusion':
    case 'grip.bounce':
    case 'grip.negfill':
      return drawFrame(item, def, c, w, h);
    case 'grip.vflat': {
      const d = `M${f(-w / 2)},${f(-h / 2)} L0,${f(h / 2)} L${f(w / 2)},${f(-h / 2)}`;
      return (
        <>
          <path d={d} fill="none" stroke={p.ink} strokeWidth={7.6} strokeLinejoin="miter" strokeLinecap="square" />
          <path d={d} fill="none" stroke="#1b1c20" strokeWidth={5.6} strokeLinejoin="miter" strokeLinecap="square" />
          <path d={d} fill="none" stroke="#ffffff" strokeWidth={1.8} strokeLinejoin="miter" />
        </>
      );
    }
    case 'grip.umbrella':
      return (
        <>
          <line x1={0} y1={-10} x2={0} y2={15} stroke={p.metal2} strokeWidth={2} />
          <path d="M-22,2 Q0,-27 22,2 Q0,-7 -22,2 Z" {...outline(c, p.body)} />
          <path d="M0,-3 L-15,-6 M0,-3 L-7,-11 M0,-3 L7,-11 M0,-3 L15,-6" stroke={p.ink3} strokeWidth={0.8} />
          <circle cx={0} cy={15} r={2.6} fill={p.metal} />
        </>
      );
    case 'grip.cstand': {
      const legs = [90, 210, 330].map((a) => {
        const r = (a * Math.PI) / 180;
        return [Math.cos(r) * 17, 4 + Math.sin(r) * 17] as P;
      });
      return (
        <>
          <path d={legs.map(([x, y]) => `M0,4 L${f(x)},${f(y)}`).join(' ')} stroke={p.metal2} strokeWidth={2.6} strokeLinecap="round" />
          {legs.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={1.8} fill={p.metal} />
          ))}
          <line x1={0} y1={4} x2={0} y2={-19} stroke={p.ink2} strokeWidth={2} strokeLinecap="round" />
          <circle cx={0} cy={4} r={3.6} {...outline(c, p.body, 1.2)} />
          <circle cx={0} cy={-6} r={2.6} {...outline(c, p.metal, 0.8)} />
          <circle cx={0} cy={-19} r={2} fill={p.metal} />
        </>
      );
    }
    case 'grip.sandbag':
      return (
        <>
          <rect x={-14} y={-8} width={28} height={16} rx={6} {...outline(c, '#c9ac7a')} />
          <line x1={0} y1={-8} x2={0} y2={8} stroke="#8f7446" strokeWidth={1.1} />
          <path d="M-5,-8 Q0,-12.5 5,-8" fill="none" stroke={p.ink2} strokeWidth={1.2} />
        </>
      );
    case 'grip.applebox':
      return (
        <>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={1.5} fill={p.wood} stroke={p.woodInk} strokeWidth={1.3} />
          <rect x={-w / 2 + 3} y={-h / 2 + 3} width={Math.max(1, w - 6)} height={Math.max(1, h - 6)} fill="none" stroke={p.woodInk} strokeWidth={0.7} />
          <ellipse cx={-w * 0.3} cy={0} rx={w * 0.08} ry={h * 0.12} fill={darken(p.wood, 0.35)} />
          <ellipse cx={w * 0.3} cy={0} rx={w * 0.08} ry={h * 0.12} fill={darken(p.wood, 0.35)} />
        </>
      );
    case 'grip.track': {
      const step = c.units === 'm' ? c.ppu * 0.3 : c.ppu;
      const n = Math.max(2, Math.floor(w / Math.max(6, step)));
      const sleepers: string[] = [];
      for (let i = 0; i <= n; i++) {
        const x = -w / 2 + (i * w) / n;
        sleepers.push(`M${f(x)},${f(-h / 2)} L${f(x)},${f(h / 2)}`);
      }
      return (
        <>
          <path d={sleepers.join(' ')} stroke="#a27a52" strokeWidth={2.6} />
          <line x1={-w / 2} y1={-h * 0.28} x2={w / 2} y2={-h * 0.28} stroke={p.metal} strokeWidth={2.6} />
          <line x1={-w / 2} y1={h * 0.28} x2={w / 2} y2={h * 0.28} stroke={p.metal} strokeWidth={2.6} />
          <rect x={-w / 2 - 2} y={-h * 0.36} width={4} height={h * 0.72} fill={p.ink} />
          <rect x={w / 2 - 2} y={-h * 0.36} width={4} height={h * 0.72} fill={p.ink} />
        </>
      );
    }
    case 'grip.slider': {
      const cw = Math.min(Math.max(10, w * 0.16), 22);
      return (
        <>
          <circle cx={-w / 2 + 3} cy={0} r={Math.max(2.5, h * 0.45)} fill={p.metal2} stroke={p.ink} strokeWidth={0.8} />
          <circle cx={w / 2 - 3} cy={0} r={Math.max(2.5, h * 0.45)} fill={p.metal2} stroke={p.ink} strokeWidth={0.8} />
          <rect x={-w / 2} y={-h * 0.3} width={w} height={h * 0.6} rx={1.5} fill={p.metal2} stroke={p.ink} strokeWidth={1} />
          <rect x={-cw / 2} y={-h * 0.5} width={cw} height={h} rx={2} fill={p.metal} stroke={p.ink} strokeWidth={1} />
        </>
      );
    }
    case 'grip.wind':
      return (
        <>
          <path d="M-10,-18 L-10,-26 M0,-18 L0,-26 M10,-18 L10,-26" stroke={p.ink3} strokeWidth={1.5} strokeDasharray="2.5 2" strokeLinecap="round" />
          <path d="M-13,-24 L-10,-27.5 L-7,-24 M-3,-24 L0,-27.5 L3,-24 M7,-24 L10,-27.5 L13,-24" fill="none" stroke={p.ink3} strokeWidth={1.3} strokeLinejoin="round" />
          <rect x={-19} y={-15} width={38} height={34} rx={5} {...outline(c, p.body2)} />
          <circle cx={0} cy={2} r={14} fill={p.body} stroke={p.ink2} strokeWidth={1} />
          {[0, 120, 240].map((a) => (
            <path key={a} d="M0,0 C5,-4 5,-10 0,-12.5 C-2.5,-8.5 -2.5,-4 0,0 Z" fill={p.ink3} transform={`translate(0 2) rotate(${a})`} />
          ))}
          <circle cx={0} cy={2} r={2.6} fill={p.ink2} />
        </>
      );
    default:
      return null;
  }
}

function drawSound(item: DiagramItem, def: KindDef, c: DrawCtx): ReactNode {
  const p = c.pal;
  switch (def.kind) {
    case 'sound.boom':
      return (
        <>
          <path d="M-11,-50 Q0,-61 11,-50" fill="none" stroke={p.ink3} strokeWidth={1.2} strokeDasharray="3 2" />
          <line x1={0} y1={46} x2={0} y2={-30} stroke={p.metal2} strokeWidth={3.2} strokeLinecap="round" />
          <line x1={0} y1={44} x2={0} y2={-28} stroke={p.metalInk} strokeWidth={0.7} />
          <rect x={-6} y={-38} width={12} height={10} rx={2} fill="none" stroke={p.ink} strokeWidth={1.2} />
          <rect x={-4.5} y={-48} width={9} height={22} rx={4.5} {...outline(c, '#8d929f', 1.2)} />
          <rect x={-2.5} y={40} width={5} height={8} rx={2} fill={p.metal} />
        </>
      );
    case 'sound.lav':
      return (
        <>
          <path d="M0,3 C2,8 7,4 8,9" fill="none" stroke={p.ink2} strokeWidth={1} />
          <rect x={4} y={8.5} width={7} height={4} rx={1} {...outline(c, p.metal, 0.8)} />
          <rect x={-1.5} y={-7.5} width={3} height={4} fill={p.metal2} />
          <circle r={4} {...outline(c, p.metal, 1.1)} />
        </>
      );
    case 'sound.recorder':
      return (
        <>
          <path d="M-19,-6 Q-26,0 -19,6 M19,-6 Q26,0 19,6" fill="none" stroke={p.ink2} strokeWidth={1.4} />
          <rect x={-19} y={-12} width={38} height={24} rx={4} {...outline(c, '#3f434f')} />
          <rect x={-15} y={-8.5} width={30} height={12} rx={2} fill="#1d1f26" />
          <rect x={-12} y={-5.5} width={9} height={2} fill="#2fb36d" />
          <rect x={-12} y={-1.5} width={6} height={2} fill="#f5a524" />
          <rect x={2} y={-5.5} width={10} height={6} rx={1} fill="#5aa2ff" opacity={0.85} />
          {[-10, -4, 2, 8].map((x) => (
            <circle key={x} cx={x} cy={8} r={1.9} fill="#c9ccd6" />
          ))}
        </>
      );
    default:
      return null;
  }
}

function drawPerson(item: DiagramItem, def: KindDef, c: DrawCtx): ReactNode {
  const p = c.pal;
  const col = item.color || def.color || '#e5484d';
  switch (def.kind) {
    case 'person.crew':
      return (
        <>
          <ellipse cx={0} cy={2} rx={21} ry={9.5} fill={mix(col, p.paper, 0.55)} stroke={col} strokeWidth={1.8} />
          <circle r={8.5} fill={col} stroke={p.ink} strokeWidth={1.1} />
          <path d="M-9.5,0 L9.5,0" stroke={p.ink} strokeWidth={1.8} />
          <rect x={-11} y={-2.5} width={3} height={5} rx={1} fill={p.ink} />
          <rect x={8} y={-2.5} width={3} height={5} rx={1} fill={p.ink} />
          <path d="M-2.8,-7.8 L0,-12.8 L2.8,-7.8 Z" fill={p.ink} />
        </>
      );
    case 'person.monitor':
      return (
        <>
          <line x1={0} y1={-17} x2={0} y2={-24} stroke={p.metal2} strokeWidth={2} />
          <rect x={-16} y={-21} width={32} height={5} rx={1} {...outline(c, p.metal, 1.2)} />
          <rect x={-15} y={-16.2} width={30} height={1.8} fill="#5aa2ff" />
          {[-11, 11].map((x) => (
            <g key={x}>
              <rect x={x - 6} y={2} width={12} height={12} rx={1.5} fill={p.wood} stroke={p.woodInk} strokeWidth={1.1} />
              <rect x={x - 6.5} y={12} width={13} height={3} rx={1} fill={p.woodInk} />
            </g>
          ))}
        </>
      );
    default:
      return (
        <>
          <ellipse cx={0} cy={2} rx={23} ry={10.5} {...outline(c, col)} />
          <circle r={9.5} {...outline(c, p.body, 1.3)} />
          <path d="M-3.2,-8.6 L0,-14.5 L3.2,-8.6 Z" fill={p.ink} />
        </>
      );
  }
}

function drawSet(item: DiagramItem, def: KindDef, c: DrawCtx, w: number, h: number): ReactNode {
  const p = c.pal;
  const x = -w / 2;
  const y = -h / 2;
  const glass = '#9cc2e6';
  switch (def.kind) {
    case 'set.wall':
      return <rect x={x} y={y} width={w} height={h} fill={item.color || p.wall} stroke={p.ink} strokeWidth={1} />;
    case 'set.door': {
      const r = Math.min(w, h);
      const flip = pbool(item, 'flip');
      return (
        <g transform={flip ? 'scale(-1 1)' : undefined}>
          <rect x={x - 3} y={-y - 3} width={4} height={6} fill={p.wall} />
          <rect x={-x - 1} y={-y - 3} width={4} height={6} fill={p.wall} />
          <path d={`M${f(x)},${f(-y - r)} A${f(r)},${f(r)} 0 0 1 ${f(x + r)},${f(-y)}`} fill="none" stroke={p.ink2} strokeWidth={1} strokeDasharray="4 3" />
          <rect x={x} y={-y - r} width={3} height={r} fill={p.body} stroke={p.ink} strokeWidth={1.1} />
        </g>
      );
    }
    case 'set.window':
      return (
        <>
          <rect x={x} y={y} width={w} height={h} fill={p.body} stroke={p.ink} strokeWidth={1.2} />
          <line x1={x + 2} y1={-h * 0.15} x2={-x - 2} y2={-h * 0.15} stroke={glass} strokeWidth={1.3} />
          <line x1={x + 2} y1={h * 0.15} x2={-x - 2} y2={h * 0.15} stroke={glass} strokeWidth={1.3} />
          <rect x={x - 2} y={y - 1} width={4} height={h + 2} fill={p.wall} />
          <rect x={-x - 2} y={y - 1} width={4} height={h + 2} fill={p.wall} />
        </>
      );
    case 'set.table':
    case 'set.desk': {
      const fill = item.color || p.wood;
      return (
        <>
          <rect x={x} y={y} width={w} height={h} rx={Math.min(5, h * 0.1)} fill={fill} stroke={p.woodInk} strokeWidth={1.5} />
          <rect x={x + 4} y={y + 4} width={Math.max(1, w - 8)} height={Math.max(1, h - 8)} rx={2} fill="none" stroke={p.woodInk} strokeWidth={0.6} opacity={0.7} />
          {def.kind === 'set.desk' && <rect x={-x - w * 0.3} y={y + 5} width={w * 0.25} height={Math.max(1, h - 10)} fill="none" stroke={p.woodInk} strokeWidth={0.8} strokeDasharray="3 2" />}
        </>
      );
    }
    case 'set.roundtable':
      return (
        <>
          <ellipse rx={w / 2} ry={h / 2} fill={item.color || p.wood} stroke={p.woodInk} strokeWidth={1.5} />
          <ellipse rx={Math.max(1, w / 2 - 5)} ry={Math.max(1, h / 2 - 5)} fill="none" stroke={p.woodInk} strokeWidth={0.6} opacity={0.7} />
        </>
      );
    case 'set.chair':
      return (
        <>
          <rect x={x} y={y} width={w} height={h * 0.8} rx={3} {...outline(c, item.color || p.body2, 1.2)} />
          <rect x={x} y={-y - h * 0.26} width={w} height={h * 0.26} rx={2} {...outline(c, item.color ? darken(item.color, 0.2) : p.body3, 1.2)} />
        </>
      );
    case 'set.sofa': {
      const arm = Math.max(4, w * 0.09);
      const back = Math.max(5, h * 0.3);
      const seatW = w - arm * 2;
      const fill = item.color || p.body2;
      return (
        <>
          <rect x={x} y={y} width={w} height={h} rx={6} {...outline(c, fill, 1.3)} />
          <path d={[1, 2].map((k) => `M${f(x + arm + (seatW * k) / 3)},${f(y + 2)} L${f(x + arm + (seatW * k) / 3)},${f(-y - back)}`).join(' ')} stroke={p.ink3} strokeWidth={1} />
          <rect x={x} y={-y - back} width={w} height={back} rx={4} {...outline(c, darken(fill, 0.12), 1.2)} />
          <rect x={x} y={y} width={arm} height={h} rx={4} {...outline(c, darken(fill, 0.12), 1.2)} />
          <rect x={-x - arm} y={y} width={arm} height={h} rx={4} {...outline(c, darken(fill, 0.12), 1.2)} />
        </>
      );
    }
    case 'set.bed':
      return (
        <>
          <rect x={x} y={y} width={w} height={h} rx={3} {...outline(c, p.body, 1.3)} />
          <rect x={x} y={y} width={w} height={Math.max(3, h * 0.05)} fill={p.wood} stroke={p.woodInk} strokeWidth={1} />
          <rect x={-w * 0.41} y={y + h * 0.08} width={w * 0.38} height={h * 0.13} rx={5} {...outline(c, p.body2, 1)} />
          <rect x={w * 0.03} y={y + h * 0.08} width={w * 0.38} height={h * 0.13} rx={5} {...outline(c, p.body2, 1)} />
          <rect x={x} y={y + h * 0.3} width={w} height={h * 0.7} rx={3} {...outline(c, item.color || p.body3, 1)} />
          <line x1={x} y1={y + h * 0.37} x2={-x} y2={y + h * 0.37} stroke={p.ink3} strokeWidth={1} />
        </>
      );
    case 'set.counter': {
      const r = Math.max(2.5, Math.min(h * 0.14, w * 0.04));
      return (
        <>
          <rect x={x} y={y} width={w} height={h} rx={2} {...outline(c, item.color || p.body2, 1.3)} />
          <line x1={x} y1={y + 3} x2={-x} y2={y + 3} stroke={p.ink3} strokeWidth={0.8} />
          <rect x={-w * 0.3} y={-h * 0.28} width={w * 0.18} height={h * 0.56} rx={4} fill="#dfe8f2" stroke={p.ink} strokeWidth={1} />
          <circle cx={-w * 0.21} cy={h * 0.36} r={1.6} fill={p.metal} />
          {(
            [
              [-1, -1],
              [1, -1],
              [-1, 1],
              [1, 1],
            ] as P[]
          ).map(([a, b], i) => (
            <circle key={i} cx={w * 0.22 + a * r * 1.6} cy={b * h * 0.2} r={r} fill="none" stroke={p.ink2} strokeWidth={1} />
          ))}
        </>
      );
    }
    case 'set.tv':
      return (
        <>
          <rect x={-w * 0.12} y={0} width={w * 0.24} height={h * 0.9} rx={1} fill={p.metal2} />
          <rect x={x} y={y} width={w} height={h} rx={1} {...outline(c, p.metal, 1.2)} />
          <rect x={x + 1} y={y - 1.6} width={Math.max(1, w - 2)} height={1.8} fill="#5aa2ff" opacity={0.9} />
        </>
      );
    case 'set.plant': {
      const r = Math.min(w, h) / 2;
      return (
        <>
          {Array.from({ length: 8 }, (_, k) => (
            <ellipse key={k} cx={0} cy={-r * 0.5} rx={r * 0.24} ry={r * 0.5} fill="#6cbf6f" stroke="#3f8a44" strokeWidth={0.9} transform={`rotate(${k * 45})`} />
          ))}
          <circle r={r * 0.3} fill="#b9805a" stroke="#7d5232" strokeWidth={1} />
        </>
      );
    }
    case 'set.car': {
      const paint = item.color || '#cfd4dd';
      const seat = '#7b8091';
      return (
        <>
          {(
            [
              [-1, -0.3],
              [1, -0.3],
              [-1, 0.3],
              [1, 0.3],
            ] as P[]
          ).map(([sx, sy], i) => (
            <rect key={i} x={sx * (w / 2) - 3} y={sy * h - h * 0.06} width={6} height={h * 0.12} rx={2} fill="#2b2d33" />
          ))}
          <rect x={x - w * 0.09} y={-h * 0.14} width={w * 0.1} height={h * 0.03} rx={1} {...outline(c, paint, 1)} />
          <rect x={-x - w * 0.01} y={-h * 0.14} width={w * 0.1} height={h * 0.03} rx={1} {...outline(c, paint, 1)} />
          <rect x={x} y={y} width={w} height={h} rx={w * 0.28} {...outline(c, paint, 1.6)} />
          <rect x={-w * 0.36} y={y + 3} width={w * 0.18} height={3.5} rx={1} fill="#ffe9a8" stroke={p.ink} strokeWidth={0.6} />
          <rect x={w * 0.18} y={y + 3} width={w * 0.18} height={3.5} rx={1} fill="#ffe9a8" stroke={p.ink} strokeWidth={0.6} />
          <rect x={-w * 0.4} y={-h * 0.1} width={w * 0.8} height={h * 0.4} rx={4} fill="#e9ebf0" stroke={p.ink} strokeWidth={0.8} />
          <path d={`M${f(-w * 0.4)},${f(-h * 0.1)} L${f(w * 0.4)},${f(-h * 0.1)} L${f(w * 0.33)},${f(-h * 0.2)} L${f(-w * 0.33)},${f(-h * 0.2)} Z`} fill={glass} stroke={p.ink} strokeWidth={1} />
          <path d={`M${f(-w * 0.36)},${f(h * 0.3)} L${f(w * 0.36)},${f(h * 0.3)} L${f(w * 0.3)},${f(h * 0.37)} L${f(-w * 0.3)},${f(h * 0.37)} Z`} fill={glass} stroke={p.ink} strokeWidth={1} />
          <rect x={-w * 0.4} y={-h * 0.1} width={w * 0.8} height={h * 0.035} fill="#5b606f" />
          <rect x={-w * 0.34} y={-h * 0.03} width={w * 0.28} height={h * 0.12} rx={4} fill={seat} stroke={p.ink} strokeWidth={0.8} />
          <rect x={w * 0.06} y={-h * 0.03} width={w * 0.28} height={h * 0.12} rx={4} fill={seat} stroke={p.ink} strokeWidth={0.8} />
          <ellipse cx={-w * 0.2} cy={-h * 0.045} rx={w * 0.11} ry={Math.max(1.5, h * 0.012)} fill="none" stroke={p.ink} strokeWidth={2} />
          <rect x={-w * 0.36} y={h * 0.16} width={w * 0.72} height={h * 0.11} rx={4} fill={seat} stroke={p.ink} strokeWidth={0.8} />
        </>
      );
    }
    case 'set.stairs': {
      const tread = c.units === 'm' ? c.ppu * 0.28 : c.ppu * 0.9;
      const n = Math.max(3, Math.round(h / Math.max(6, tread)));
      const lines: string[] = [];
      for (let i = 1; i < n; i++) lines.push(`M${f(x)},${f(y + (i * h) / n)} L${f(-x)},${f(y + (i * h) / n)}`);
      return (
        <>
          <rect x={x} y={y} width={w} height={h} {...outline(c, p.body2, 1.2)} />
          <path d={lines.join(' ')} stroke={p.ink2} strokeWidth={0.9} />
          <line x1={0} y1={-y - 6} x2={0} y2={y + 12} stroke={p.ink} strokeWidth={1.4} />
          <path d={`M-4,${f(y + 14)} L0,${f(y + 7)} L4,${f(y + 14)}`} fill="none" stroke={p.ink} strokeWidth={1.4} />
          <text x={0} y={y + 22} fontSize={8} fontWeight={700} fontFamily={FONT} fill={p.ink} textAnchor="middle" stroke={p.body2} strokeWidth={3} paintOrder="stroke">
            UP
          </text>
        </>
      );
    }
    case 'set.rug': {
      const col = item.color || def.color || '#b9a37f';
      const fringe: string[] = [];
      for (let yy = y + 3; yy <= -y - 3; yy += 5) fringe.push(`M${f(x)},${f(yy)} L${f(x - 4)},${f(yy)} M${f(-x)},${f(yy)} L${f(-x + 4)},${f(yy)}`);
      return (
        <>
          <path d={fringe.join(' ')} stroke={col} strokeWidth={0.8} />
          <rect x={x} y={y} width={w} height={h} fill={col} fillOpacity={0.28} stroke={col} strokeWidth={1.2} />
          <rect x={x + 6} y={y + 6} width={Math.max(1, w - 12)} height={Math.max(1, h - 12)} fill="none" stroke={col} strokeWidth={1} strokeDasharray="5 3" opacity={0.8} />
        </>
      );
    }
    case 'set.watertower': {
      const r = Math.min(w, h) / 2;
      const spokes: string[] = [];
      for (let k = 0; k < 12; k++) {
        const a = (k * 30 * Math.PI) / 180;
        spokes.push(`M0,0 L${f(Math.cos(a) * r * 0.86)},${f(Math.sin(a) * r * 0.86)}`);
      }
      return (
        <>
          <circle r={r} fill="none" stroke={p.ink2} strokeWidth={1} strokeDasharray="4 3" />
          {[45, 135, 225, 315].map((a) => {
            const rr = (a * Math.PI) / 180;
            return <rect key={a} x={Math.cos(rr) * r * 0.93 - 3} y={Math.sin(rr) * r * 0.93 - 3} width={6} height={6} fill={p.metal2} />;
          })}
          <circle r={r * 0.86} fill={item.color || p.wood} stroke={p.woodInk} strokeWidth={1.5} />
          <path d={spokes.join(' ')} stroke={p.woodInk} strokeWidth={0.7} opacity={0.8} />
          <circle r={Math.max(2, r * 0.1)} fill={p.woodInk} />
        </>
      );
    }
    default:
      return <rect x={x} y={y} width={w} height={h} {...outline(c, item.color || p.body2, 1.2)} />;
  }
}

/* ------------------------------------------------------------------ annotations */

function arrowHead(tip: P, from: P, size: number, color: string, key: string): ReactNode {
  const dx = tip[0] - from[0];
  const dy = tip[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const bx = tip[0] - ux * size;
  const by = tip[1] - uy * size;
  const nx = -uy * size * 0.55;
  const ny = ux * size * 0.55;
  return <path key={key} d={`M${f(tip[0])},${f(tip[1])} L${f(bx + nx)},${f(by + ny)} L${f(bx - nx)},${f(by - ny)} Z`} fill={color} />;
}

/** Catmull-Rom → cubic Bézier path through points. */
function smoothPath(pts: P[]): string {
  if (pts.length < 3) return `M${pts.map((p) => `${f(p[0])},${f(p[1])}`).join(' L')}`;
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1: P = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: P = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}

function drawPath(item: DiagramItem, def: KindDef, c: DrawCtx): ReactNode {
  const p = c.pal;
  const pts = itemPoints(item);
  const color = item.color || (def.kind === 'note.dimension' ? p.ink2 : p.ink);
  const width = pnum(item, 'width', def.kind === 'note.arrow' ? 2.5 : 2)!;
  if (def.kind === 'note.dimension') {
    const a = pts[0];
    const b = pts[pts.length - 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    const total = ang + itemRot(item);
    const n = ((total % 360) + 360) % 360;
    const flip = n > 90 && n < 270;
    const mid: P = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const ux = (b[0] - a[0]) / (len || 1);
    const uy = (b[1] - a[1]) / (len || 1);
    const tick = (q: P) => {
      const t = 5;
      return `M${f(q[0] - (ux - uy) * t)},${f(q[1] - (uy + ux) * t)} L${f(q[0] + (ux - uy) * t)},${f(q[1] + (uy + ux) * t)}`;
    };
    const ext = (q: P) => `M${f(q[0] + uy * 7)},${f(q[1] - ux * 7)} L${f(q[0] - uy * 7)},${f(q[1] + ux * 7)}`;
    const text = item.label?.trim() || fmtLength(len / c.ppu, c.units);
    return (
      <>
        <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeWidth={width} />
        <path d={`${tick(a)} ${tick(b)}`} stroke={color} strokeWidth={width + 0.6} strokeLinecap="round" />
        <path d={`${ext(a)} ${ext(b)}`} stroke={color} strokeWidth={0.8} />
        <text
          x={0}
          y={f(-6 * (c.ts ?? 1))}
          transform={`translate(${f(mid[0])} ${f(mid[1])}) rotate(${f(flip ? ang + 180 : ang)})`}
          fontSize={f(10.5 * (c.ts ?? 1))}
          fontWeight={650}
          fontFamily={FONT}
          fill={color}
          textAnchor="middle"
          stroke={p.halo}
          strokeWidth={f(3 * (c.ts ?? 1))}
          strokeLinejoin="round"
          paintOrder="stroke"
        >
          {text}
        </text>
      </>
    );
  }
  const curved = pbool(item, 'curved');
  const dashed = pbool(item, 'dashed');
  const d = curved ? smoothPath(pts) : `M${pts.map((q) => `${f(q[0])},${f(q[1])}`).join(' L')}`;
  const isArrow = def.kind === 'note.arrow';
  const head = isArrow ? pstr(item, 'head', 'end') : pstr(item, 'head', 'none');
  const hs = 5 + width * 2.4;
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const first = pts[0];
  const second = pts[1];
  return (
    <>
      {c.editor && <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(12, width + 10)} strokeLinecap="round" />}
      <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dashed ? `${f(width * 3)} ${f(width * 2.2)}` : undefined} />
      {(head === 'end' || head === 'both') && arrowHead(last, prev, hs, color, 'he')}
      {(head === 'start' || head === 'both') && arrowHead(first, second, hs, color, 'hs')}
    </>
  );
}

function drawText(item: DiagramItem, c: DrawCtx): ReactNode {
  // in print, small text is raised to a legible minimum (c.ts)
  const size = Math.max(pnum(item, 'size', 16)!, (10.5 * (c.ts ?? 1)) / itemScale(item));
  const lines = textLines(item);
  const lh = size * 1.25;
  const y0 = (-(lines.length - 1) * lh) / 2;
  return (
    <text
      fontSize={size}
      fontFamily={FONT}
      fontWeight={pbool(item, 'bold') ? 700 : 500}
      fill={item.color || c.pal.ink}
      textAnchor="middle"
      stroke={c.pal.halo}
      strokeWidth={Math.max(2, size * 0.2)}
      strokeLinejoin="round"
      paintOrder="stroke"
    >
      {lines.map((l, i) => (
        <tspan key={i} x={0} y={y0 + i * lh} dominantBaseline="central">
          {l || ' '}
        </tspan>
      ))}
    </text>
  );
}

function drawShape(item: DiagramItem, def: KindDef, c: DrawCtx, w: number, h: number): ReactNode {
  const col = item.color || def.color || c.pal.ink;
  const fill = pbool(item, 'fill', true);
  const width = pnum(item, 'width', 1.8)!;
  const dash = pbool(item, 'dashed') ? `${f(width * 4)} ${f(width * 2.5)}` : undefined;
  const common = { fill: fill ? col : 'none', fillOpacity: fill ? 0.12 : undefined, stroke: col, strokeWidth: width, strokeDasharray: dash };
  return def.kind === 'shape.ellipse' ? <ellipse rx={w / 2} ry={h / 2} {...common} /> : <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={3} {...common} />;
}

/** Body of an item in its local frame (no transform). */
export function drawItemBody(item: DiagramItem, c: DrawCtx): ReactNode {
  const def = kindDef(item.kind);
  if (def.shape === 'path') return drawPath(item, def, c);
  if (def.shape === 'text') return drawText(item, c);
  if (def.shape === 'box') {
    const { w, h } = boxSize(item, def, c.ppu);
    if (def.category === 'grip') return drawGrip(item, def, c, w, h);
    if (def.kind.startsWith('shape.')) return drawShape(item, def, c, w, h);
    return drawSet(item, def, c, w, h);
  }
  switch (def.category) {
    case 'light':
      return drawLight(item, def, c);
    case 'camera':
      return drawCamera(item, def, c);
    case 'grip':
      return drawGrip(item, def, c, def.w, def.h);
    case 'sound':
      return drawSound(item, def, c);
    case 'people':
      return drawPerson(item, def, c);
    default:
      return <rect x={-def.w / 2} y={-def.h / 2} width={def.w} height={def.h} {...outline(c, c.pal.body2)} />;
  }
}

export function itemTransform(item: DiagramItem): string {
  const def = kindDef(item.kind);
  const r = itemRot(item);
  const base = `translate(${f(item.x)} ${f(item.y)})${r ? ` rotate(${f(r)})` : ''}`;
  if (def.shape === 'symbol' || def.shape === 'text') {
    const s = itemScale(item);
    return s !== 1 ? `${base} scale(${f(s)})` : base;
  }
  return base;
}

/** A complete item group (transform + body). `data-id` is used by the editor for hit-testing. */
export function ItemGraphic({ item, c, ghost }: { item: DiagramItem; c: DrawCtx; ghost?: boolean }) {
  const def = kindDef(item.kind);
  let hit: ReactNode = null;
  if (c.editor && def.shape === 'symbol') hit = <rect x={-def.w / 2} y={-def.h / 2} width={def.w} height={def.h} fill="transparent" />;
  if (c.editor && def.shape === 'box') {
    const { w, h } = boxSize(item, def, c.ppu);
    const pad = Math.min(w, h) < 10 ? 5 : 0;
    hit = <rect x={-w / 2 - pad} y={-h / 2 - pad} width={w + pad * 2} height={h + pad * 2} fill="transparent" />;
  }
  return (
    <g data-id={item.id} data-locked={c.editor && item.locked ? true : undefined} transform={itemTransform(item)} opacity={ghost ? 0.35 : undefined}>
      {hit}
      {drawItemBody(item, c)}
    </g>
  );
}

/* ======================================================================== beams & FOV */

/** Soft gradient cone of a light (canvas coordinates). */
export function Beam({ item, c }: { item: DiagramItem; c: DrawCtx }) {
  const def = kindDef(item.kind);
  if (def.category !== 'light') return null;
  const s = itemScale(item);
  const beam = Math.max(2, Math.min(360, lnum(item, 'beam', 60)));
  const R = Math.max(4, lnum(item, 'throw', 10) * c.ppu);
  const intensity = Math.max(0, Math.min(100, lnum(item, 'intensity', 100)));
  if (intensity <= 0) return null;
  const color = lightColorOf(item);
  const edge = darken(color, 0.3);
  const k = 0.35 + (0.65 * intensity) / 100;
  const ew = (def.emit?.w ?? 10) * s;
  const ey = (def.emit?.y ?? 0) * s;
  const gid = `${c.idp}b${safeId(item.id)}`;
  const grad = (cx: number, cy: number, r: number) => (
    <defs>
      <radialGradient id={gid} gradientUnits="userSpaceOnUse" cx={f(cx)} cy={f(cy)} r={f(r)}>
        <stop offset="0" stopColor={color} stopOpacity={f(0.62 * k)} />
        <stop offset="0.3" stopColor={color} stopOpacity={f(0.4 * k)} />
        <stop offset="0.7" stopColor={color} stopOpacity={f(0.13 * k)} />
        <stop offset="1" stopColor={color} stopOpacity={0} />
      </radialGradient>
    </defs>
  );
  const transform = `translate(${f(item.x)} ${f(item.y)}) rotate(${f(itemRot(item))})`;
  if (beam >= 359) {
    return (
      <g transform={transform} pointerEvents="none">
        {grad(0, ey, R)}
        <circle cx={0} cy={ey} r={R} fill={`url(#${gid})`} />
        <circle cx={0} cy={ey} r={R} fill="none" stroke={edge} strokeOpacity={0.35} strokeWidth={1} strokeDasharray="5 4" />
      </g>
    );
  }
  const half = (beam / 2) * (Math.PI / 180);
  const p1: P = [-ew / 2, ey];
  const p2: P = [ew / 2, ey];
  const e1: P = [p1[0] - Math.sin(half) * R, p1[1] - Math.cos(half) * R];
  const e2: P = [p2[0] + Math.sin(half) * R, p2[1] - Math.cos(half) * R];
  const arcR = R + ew / 2;
  const large = beam > 180 ? 1 : 0;
  const d = `M${f(p1[0])},${f(p1[1])} L${f(p2[0])},${f(p2[1])} L${f(e2[0])},${f(e2[1])} A${f(arcR)},${f(arcR)} 0 ${large} 0 ${f(e1[0])},${f(e1[1])} Z`;
  return (
    <g transform={transform} pointerEvents="none">
      {grad(0, ey, R + ew / 2)}
      <path d={d} fill={`url(#${gid})`} />
      <path d={`M${f(p1[0])},${f(p1[1])} L${f(e1[0])},${f(e1[1])} M${f(p2[0])},${f(p2[1])} L${f(e2[0])},${f(e2[1])}`} stroke={edge} strokeOpacity={0.5} strokeWidth={1} strokeDasharray="5 4" />
    </g>
  );
}

/** Camera field-of-view wedge computed from focal length and sensor width. */
export function FovWedge({ item, c }: { item: DiagramItem; c: DrawCtx }) {
  const def = kindDef(item.kind);
  if (def.category !== 'camera' || pbool(item, 'showFov', true) === false) return null;
  const lens = lnum(item, 'lens', 35);
  const sensor = pstr(item, 'sensor', pstr({ props: def.props }, 'sensor', 's35'));
  const fov = hfov(lens, sensor) ?? 54;
  const half = (Math.min(fov, 170) / 2) * (Math.PI / 180);
  const L = Math.max(10, lnum(item, 'fovLength', 15) * c.ppu);
  const fy = (def.front ?? 0) * itemScale(item);
  const l: P = [-Math.sin(half) * L, fy - Math.cos(half) * L];
  const r: P = [Math.sin(half) * L, fy - Math.cos(half) * L];
  const col = c.pal.camera;
  return (
    <g transform={`translate(${f(item.x)} ${f(item.y)}) rotate(${f(itemRot(item))})`} pointerEvents="none">
      <path d={`M0,${f(fy)} L${f(l[0])},${f(l[1])} A${f(L)},${f(L)} 0 0 1 ${f(r[0])},${f(r[1])} Z`} fill={col} fillOpacity={0.07} />
      <path d={`M${f(l[0])},${f(l[1])} L0,${f(fy)} L${f(r[0])},${f(r[1])}`} fill="none" stroke={col} strokeOpacity={0.75} strokeWidth={1.2} strokeDasharray="7 4" />
      <line x1={0} y1={fy} x2={0} y2={fy - L} stroke={col} strokeOpacity={0.35} strokeWidth={0.9} strokeDasharray="2 4" />
    </g>
  );
}

/* ======================================================================== labels */

export function HaloText({
  x,
  y,
  children,
  size = 10.5,
  fill,
  halo,
  weight = 550,
  anchor = 'middle',
  id,
  ts = 1,
}: {
  x: number;
  y: number;
  children: ReactNode;
  size?: number;
  fill: string;
  halo: string;
  weight?: number;
  anchor?: 'start' | 'middle' | 'end';
  id?: string;
  /** text scale (print legibility) */
  ts?: number;
}) {
  return (
    <text
      data-id={id}
      x={f(x)}
      y={f(y)}
      fontSize={f(size * ts)}
      fontFamily={FONT}
      fontWeight={weight}
      fill={fill}
      textAnchor={anchor}
      dominantBaseline="central"
      stroke={halo}
      strokeWidth={f(3.2 * ts)}
      strokeLinejoin="round"
      paintOrder="stroke"
    >
      {children}
    </text>
  );
}

function badge(x: number, y: number, text: string, fill: string, key: string, id: string, round = false, ts = 1): ReactNode {
  const w = (round ? 16 : Math.max(18, 8 + text.length * 6.2)) * ts;
  return (
    <g key={key} data-id={id}>
      {round ? (
        <circle cx={f(x)} cy={f(y)} r={f(8.5 * ts)} fill={fill} stroke="#ffffff" strokeWidth={f(1.2 * ts)} />
      ) : (
        <rect x={f(x - w / 2)} y={f(y - 7 * ts)} width={f(w)} height={f(14 * ts)} rx={f(7 * ts)} fill={fill} stroke="#ffffff" strokeWidth={f(ts)} />
      )}
      <text x={f(x)} y={f(y)} fontSize={f(9 * ts)} fontWeight={750} fontFamily={FONT} fill={textOn(fill)} textAnchor="middle" dominantBaseline="central">
        {text}
      </text>
    </g>
  );
}

export interface LabelInfo {
  lightNums: Map<string, number>;
  camLetters: Map<string, string>;
}

/** Upright captions, light numbers and camera letters for an item (canvas coordinates). */
export function ItemLabels({ item, c, info, bounds }: { item: DiagramItem; c: DrawCtx; info: LabelInfo; bounds: { x0: number; y0: number; x1: number; y1: number } }) {
  const def = kindDef(item.kind);
  const p = c.pal;
  const ts = c.ts ?? 1;
  const cx = (bounds.x0 + bounds.x1) / 2;
  const out: ReactNode[] = [];
  const caption = (text: string, color = p.ink, weight = 550) => {
    if (!text) return;
    out.push(
      <HaloText key="cap" id={item.id} x={cx} y={bounds.y1 + 9 * ts} fill={color} halo={p.halo} weight={weight} ts={ts}>
        {text}
      </HaloText>,
    );
  };
  if (def.shape === 'text') return null;
  if (def.shape === 'path') {
    if (def.kind === 'note.dimension' || !item.label?.trim()) return null;
    const pts = itemPoints(item);
    const i = Math.max(0, Math.floor((pts.length - 1) / 2));
    const a = pts[i];
    const b = pts[i + 1] ?? a;
    const r = itemRot(item);
    const rad = (r * Math.PI) / 180;
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const wx = item.x + mx * Math.cos(rad) - my * Math.sin(rad);
    const wy = item.y + mx * Math.sin(rad) + my * Math.cos(rad);
    return (
      <HaloText id={item.id} x={wx} y={wy - 11 * ts} fill={item.color || p.ink} halo={p.halo} weight={650} ts={ts}>
        {item.label}
      </HaloText>
    );
  }
  if (def.category === 'light') {
    const n = info.lightNums.get(item.id);
    if (n != null) out.push(badge(bounds.x1 + 3 * ts, bounds.y0 + 3 * ts, `L${n}`, p.ink, 'n', item.id, false, ts));
    caption(item.label?.trim() || pstr(item, 'fixture') || '');
    return <>{out}</>;
  }
  if (def.category === 'camera') {
    const letter = info.camLetters.get(item.id) ?? '';
    if (letter) out.push(badge(bounds.x1 + 2 * ts, bounds.y0 + 3 * ts, letter.slice(0, 3), p.camera, 'cam', item.id, letter.length <= 1, ts));
    const lens = lnum(item, 'lens', 0);
    const support = pstr(item, 'support');
    caption([lens ? `${lens}mm` : '', support].filter(Boolean).join(' · '), p.camera, 650);
    return <>{out}</>;
  }
  const text = item.label?.trim() ?? '';
  if (!text) return null;
  if (def.shape === 'box' && def.category !== 'grip') {
    const { w, h } = boxSize(item, def, c.ppu);
    if (Math.min(w, h) >= 24 && def.kind !== 'set.door') {
      return (
        <HaloText id={item.id} x={item.x} y={item.y} fill={p.ink2} halo={p.halo} size={10.5} weight={600} ts={ts}>
          {text}
        </HaloText>
      );
    }
    if (Math.max(w, h) >= Math.min(w, h) * 4 && def.kind !== 'set.door') {
      // long thin pieces (walls, windows): write the label along the piece, beside it
      let a = (((itemRot(item) + (w >= h ? 0 : 90)) % 360) + 360) % 360;
      if (a > 270) a -= 360;
      else if (a > 90) a -= 180;
      if (a === 90) a = -90;
      const off = Math.min(w, h) / 2 + 8 * ts;
      const r = (a * Math.PI) / 180;
      return (
        <text
          data-id={item.id}
          transform={`translate(${f(item.x + Math.sin(r) * off)} ${f(item.y - Math.cos(r) * off)}) rotate(${f(a)})`}
          fontSize={f(10 * ts)}
          fontFamily={FONT}
          fontWeight={600}
          fill={p.ink2}
          textAnchor="middle"
          dominantBaseline="central"
          stroke={p.halo}
          strokeWidth={f(3.2 * ts)}
          strokeLinejoin="round"
          paintOrder="stroke"
        >
          {text}
        </text>
      );
    }
  }
  caption(text, def.category === 'people' ? p.ink : p.ink2, def.category === 'people' ? 650 : 550);
  return <>{out}</>;
}
