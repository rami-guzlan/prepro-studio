/* Formula engine for the shared Strategy calculator (src/spaces/calc).

   Lines have a name and a formula. A formula is arithmetic over numbers and
   other lines' names: + - * / ^ %, parentheses, and min/max/round/sum/avg.
     "Day rate"         1800
     "Shoots per month" 4
     "Monthly revenue"  Day rate * Shoots per month
     "Margin"           (Monthly revenue - 2500) / Monthly revenue * 100
   Names match case-insensitively; spaces inside names are fine. Numbers may
   use $ , and k / m suffixes (1.2k = 1200). "%" after a number means /100.
   No eval: a small recursive-descent parser. */

export interface CalcLine {
  id: string;
  label: string;
  expr: string;
  /** how to show the result */
  format?: 'number' | 'money' | 'percent';
}

export type CalcResult = { ok: true; value: number } | { ok: false; error: string };

type Tok = { t: 'num'; v: number } | { t: 'name'; v: string } | { t: 'op'; v: string };

const FUNCS: Record<string, (xs: number[]) => number> = {
  min: (x) => Math.min(...x),
  max: (x) => Math.max(...x),
  sum: (x) => x.reduce((a, b) => a + b, 0),
  avg: (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN),
  round: (x) => {
    const p = 10 ** (x[1] ?? 0);
    return Math.round(x[0] * p) / p;
  },
  abs: (x) => Math.abs(x[0]),
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function tokenize(src: string, names: string[]): Tok[] {
  const out: Tok[] = [];
  // longest names first, so "monthly revenue total" wins over "monthly revenue"
  const sorted = [...names].sort((a, b) => b.length - a.length);
  let i = 0;
  const s = src;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c) || c === '$' || c === '€' || c === '£') {
      i++;
      continue;
    }
    // thousands separators only in groups of three, so "max(2000, Costs)" still splits on the comma
    const num = /^(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+\.?\d*|\.\d+)([km])?(?![a-z])/i.exec(s.slice(i));
    if (num) {
      let v = parseFloat(num[1].replace(/,/g, ''));
      if (num[2]) v *= num[2].toLowerCase() === 'k' ? 1e3 : 1e6;
      out.push({ t: 'num', v });
      i += num[0].length;
      continue;
    }
    if ('+-*/^(),%x×÷'.includes(c)) {
      const v = c === 'x' || c === '×' ? '*' : c === '÷' ? '/' : c;
      // "x" only counts as times between values, never inside a name
      if (c === 'x' && !(out.length && (out[out.length - 1].t === 'num' || out[out.length - 1].v === ')'))) {
        /* fall through to names */
      } else {
        out.push({ t: 'op', v });
        i++;
        continue;
      }
    }
    const rest = norm(s.slice(i));
    const hit = sorted.find((n) => rest.startsWith(n) && !/[a-z0-9]/i.test(rest[n.length] ?? ''));
    if (hit) {
      // advance over the original text the normalized name covers
      let consumed = 0;
      let j = i;
      while (consumed < hit.length && j < s.length) {
        if (/\s/.test(s[j])) {
          while (j < s.length && /\s/.test(s[j])) j++;
          consumed++;
        } else {
          j++;
          consumed++;
        }
      }
      out.push({ t: 'name', v: hit });
      i = j;
      continue;
    }
    const word = /^[a-z_]+/i.exec(s.slice(i));
    if (word && FUNCS[word[0].toLowerCase()]) {
      out.push({ t: 'name', v: word[0].toLowerCase() });
      i += word[0].length;
      continue;
    }
    throw new Error(word ? `Unknown name "${word[0]}"` : `Unexpected "${c}"`);
  }
  return out;
}

function parse(toks: Tok[], lookup: (name: string) => number): number {
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.t === 'op' && peek()!.v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new Error(`Expected "${v}"`);
    p++;
  };
  function expr(): number {
    let v = term();
    while (isOp('+') || isOp('-')) v = toks[p++].v === '+' ? v + term() : v - term();
    return v;
  }
  function term(): number {
    let v = power();
    while (isOp('*') || isOp('/')) {
      const op = toks[p++].v;
      const r = power();
      if (op === '/' && r === 0) throw new Error('Division by zero');
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function power(): number {
    const b = unary();
    if (isOp('^')) {
      p++;
      return b ** power();
    }
    return b;
  }
  function unary(): number {
    if (isOp('-')) {
      p++;
      return -unary();
    }
    if (isOp('+')) {
      p++;
      return unary();
    }
    return postfix();
  }
  function postfix(): number {
    let v = atom();
    while (isOp('%')) {
      p++;
      v /= 100;
    }
    return v;
  }
  function atom(): number {
    const t = toks[p];
    if (!t) throw new Error('Formula ends too early');
    if (t.t === 'num') {
      p++;
      return t.v;
    }
    if (t.t === 'op' && t.v === '(') {
      p++;
      const v = expr();
      expect(')');
      return v;
    }
    if (t.t === 'name') {
      p++;
      if (FUNCS[t.v] && isOp('(')) {
        p++;
        const args: number[] = [];
        if (!isOp(')')) {
          args.push(expr());
          while (isOp(',')) {
            p++;
            args.push(expr());
          }
        }
        expect(')');
        return FUNCS[t.v](args);
      }
      return lookup(t.v);
    }
    throw new Error(`Unexpected "${t.v}"`);
  }
  const v = expr();
  if (p < toks.length) throw new Error(`Unexpected "${(toks[p] as Tok).v}"`);
  return v;
}

/** Results for every line, by line id. Lines can use the lines above or below them. */
export function evaluate(lines: CalcLine[]): Map<string, CalcResult> {
  const byName = new Map<string, CalcLine>();
  for (const l of lines) if (l.label.trim()) byName.set(norm(l.label), l);
  const names = [...byName.keys()].filter((n) => !FUNCS[n]);
  const out = new Map<string, CalcResult>();
  const visiting = new Set<string>();

  function value(l: CalcLine): number {
    const done = out.get(l.id);
    if (done) {
      if (done.ok) return done.value;
      throw new Error(`"${l.label}" has an error`);
    }
    if (visiting.has(l.id)) throw new Error(`Circular: "${l.label}" depends on itself`);
    visiting.add(l.id);
    try {
      if (!l.expr.trim()) throw new Error('Empty');
      const v = parse(tokenize(l.expr, names), (name) => value(byName.get(name)!));
      if (!Number.isFinite(v)) throw new Error('Not a number');
      out.set(l.id, { ok: true, value: v });
      return v;
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      if (!out.has(l.id)) out.set(l.id, { ok: false, error });
      throw e;
    } finally {
      visiting.delete(l.id);
    }
  }
  for (const l of lines) {
    try {
      value(l);
    } catch {
      /* recorded */
    }
  }
  return out;
}
