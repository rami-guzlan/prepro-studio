/* Vector sketch operations rendered onto a transparent canvas layer.
   The layer is saved as a transparent PNG over the (untouched) frame image. */

export type Tool = 'pen' | 'highlighter' | 'eraser' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'text';
export type Pt = [number, number];

export type Op =
  | { t: 'stroke'; tool: 'pen' | 'highlighter' | 'eraser'; color: string; width: number; pts: Pt[] }
  | { t: 'shape'; tool: 'line' | 'arrow' | 'rect' | 'ellipse'; color: string; width: number; a: Pt; b: Pt; dashed: boolean }
  | { t: 'text'; color: string; size: number; at: Pt; text: string }
  | { t: 'clear' };

export const SKETCH_COLORS = ['#111111', '#ffffff', '#e5484d', '#f76707', '#fcc419', '#2fb36d', '#3e8ef7', '#7c5cff'];

export const FONT_STACK = "'Inter Variable', 'Inter', 'Segoe UI', Arial, sans-serif";

/** Highlighter strokes are wider and translucent. */
const HIGHLIGHT_ALPHA = 0.38;

export function textSize(width: number): number {
  return Math.round(18 + width * 3.2);
}

function isLight(color: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 186;
}

function strokePath(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath();
  if (pts.length === 1) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    ctx.lineTo(pts[0][0] + 0.01, pts[0][1]);
    return;
  }
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last[0], last[1]);
}

/** Constrain the second point of a shape (Shift): 45° lines, squares and circles. */
export function constrain(tool: Tool, a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (tool === 'line' || tool === 'arrow') {
    const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const len = Math.hypot(dx, dy);
    return [a[0] + Math.cos(ang) * len, a[1] + Math.sin(ang) * len];
  }
  const s = Math.max(Math.abs(dx), Math.abs(dy));
  return [a[0] + Math.sign(dx || 1) * s, a[1] + Math.sign(dy || 1) * s];
}

export function drawOp(ctx: CanvasRenderingContext2D, op: Op, w: number, h: number) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (op.t) {
    case 'clear':
      ctx.clearRect(0, 0, w, h);
      break;
    case 'stroke': {
      if (op.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = op.width * 2.5;
      } else if (op.tool === 'highlighter') {
        ctx.globalAlpha = HIGHLIGHT_ALPHA;
        ctx.strokeStyle = op.color;
        ctx.lineWidth = op.width * 3.2;
        ctx.lineCap = 'square';
      } else {
        ctx.strokeStyle = op.color;
        ctx.lineWidth = op.width;
      }
      strokePath(ctx, op.pts);
      ctx.stroke();
      break;
    }
    case 'shape': {
      ctx.strokeStyle = op.color;
      ctx.fillStyle = op.color;
      ctx.lineWidth = op.width;
      if (op.dashed) ctx.setLineDash([op.width * 2.6, op.width * 2.2]);
      const [ax, ay] = op.a;
      const [bx, by] = op.b;
      if (op.tool === 'line' || op.tool === 'arrow') {
        const len = Math.hypot(bx - ax, by - ay);
        const head = Math.max(16, op.width * 4.2);
        const ang = Math.atan2(by - ay, bx - ax);
        // stop the shaft under the arrow head so the tip stays sharp
        const ex = op.tool === 'arrow' && len > head ? bx - Math.cos(ang) * head * 0.6 : bx;
        const ey = op.tool === 'arrow' && len > head ? by - Math.sin(ang) * head * 0.6 : by;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        if (op.tool === 'arrow' && len > 2) {
          ctx.setLineDash([]);
          const spread = Math.PI / 7;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(bx - Math.cos(ang - spread) * head, by - Math.sin(ang - spread) * head);
          ctx.lineTo(bx - Math.cos(ang) * head * 0.55, by - Math.sin(ang) * head * 0.55);
          ctx.lineTo(bx - Math.cos(ang + spread) * head, by - Math.sin(ang + spread) * head);
          ctx.closePath();
          ctx.fill();
        }
      } else if (op.tool === 'rect') {
        ctx.beginPath();
        ctx.rect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.ellipse((ax + bx) / 2, (ay + by) / 2, Math.abs(bx - ax) / 2 || 0.5, Math.abs(by - ay) / 2 || 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case 'text': {
      const lines = op.text.split('\n');
      ctx.font = `700 ${op.size}px ${FONT_STACK}`;
      ctx.textBaseline = 'top';
      const lh = op.size * 1.18;
      // halo for legibility over photos
      ctx.lineWidth = Math.max(3, op.size * 0.2);
      ctx.strokeStyle = isLight(op.color) ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.92)';
      ctx.fillStyle = op.color;
      lines.forEach((l, i) => {
        ctx.strokeText(l, op.at[0], op.at[1] + i * lh);
        ctx.fillText(l, op.at[0], op.at[1] + i * lh);
      });
      break;
    }
  }
  ctx.restore();
}

/** Render base layer (previous drawing) + ops into ctx (canvas cleared first). */
export function renderLayer(ctx: CanvasRenderingContext2D, base: CanvasImageSource | null, ops: Op[], w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  // everything before the last "clear" is invisible
  let start = 0;
  for (let i = ops.length - 1; i >= 0; i--) {
    if (ops[i].t === 'clear') {
      start = i + 1;
      break;
    }
  }
  if (start === 0 && base) ctx.drawImage(base, 0, 0, w, h);
  for (let i = start; i < ops.length; i++) drawOp(ctx, ops[i], w, h);
}
