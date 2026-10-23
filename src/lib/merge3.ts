/* Three-way merge of JSON documents for live co-editing.

   merge3(base, mine, theirs): `base` is the last version both sides agreed on,
   `mine` has my unsaved changes, `theirs` is what someone else saved.
   - Objects merge key by key.
   - Lists of items with an `id` merge item by item: both sides' additions are
     kept, a deletion on either side wins, and items edited on both sides merge
     field by field. Order follows the side that reordered.
   - Anything else (text, numbers, plain lists): if only one side changed it,
     that change wins; if both did, mine wins (it is the newer edit here).
   Unchanged subtrees keep their identity (cheap with immer's structural sharing). */

type J = unknown;

const isObj = (v: J): v is Record<string, J> => !!v && typeof v === 'object' && !Array.isArray(v);

export function deepEqual(a: J, b: J): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as J[];
    if (a.length !== bb.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], bb[i])) return false;
    return true;
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!deepEqual((a as any)[k], (b as any)[k])) return false;
  return true;
}

const hasIds = (arr: J[]) => arr.length > 0 && arr.every((x) => isObj(x) && (typeof x.id === 'string' || typeof x.id === 'number'));

function idList(arr: J[]): string[] {
  return arr.map((x) => String((x as any).id));
}

function mergeById(base: J[], mine: J[], theirs: J[]): J[] {
  const B = new Map(base.map((x) => [String((x as any).id), x]));
  const M = new Map(mine.map((x) => [String((x as any).id), x]));
  const T = new Map(theirs.map((x) => [String((x as any).id), x]));

  // order: whoever reordered the shared items decides; theirs by default
  const common = (ids: string[], other: Map<string, J>) => ids.filter((id) => B.has(id) && other.has(id));
  const baseOrder = common(idList(base), M).filter((id) => T.has(id)).join('\u0000');
  const mineOrder = common(idList(mine), T).filter((id) => B.has(id)).join('\u0000');
  const mineFirst = mineOrder !== baseOrder;
  const order = mineFirst ? idList(mine) : idList(theirs);

  const out: J[] = [];
  const placed = new Set<string>();
  const emit = (id: string) => {
    if (placed.has(id)) return;
    const inB = B.has(id);
    const inM = M.has(id);
    const inT = T.has(id);
    if (inB && (!inM || !inT)) return; // deleted on one side
    placed.add(id);
    if (inM && inT) out.push(merge3(B.get(id), M.get(id), T.get(id)));
    else out.push((inM ? M.get(id) : T.get(id)) as J);
  };
  for (const id of order) emit(id);
  // additions from the other side, placed after their predecessor
  const rest = mineFirst ? theirs : mine;
  for (let i = 0; i < rest.length; i++) {
    const id = String((rest[i] as any).id);
    if (placed.has(id) || B.has(id)) continue;
    const prev = i > 0 ? String((rest[i - 1] as any).id) : null;
    const at = prev ? out.findIndex((x) => String((x as any).id) === prev) : -1;
    placed.add(id);
    out.splice(at + 1, 0, rest[i]);
  }
  return out;
}

export function merge3<T = J>(base: J, mine: J, theirs: J): T {
  if (mine === base || mine === theirs) return theirs as T;
  if (theirs === base) return mine as T;
  if (deepEqual(mine, theirs)) return theirs as T;
  if (deepEqual(theirs, base)) return mine as T;
  if (deepEqual(mine, base)) return theirs as T;

  if (isObj(base) && isObj(mine) && isObj(theirs)) {
    const out: Record<string, J> = {};
    const keys = new Set([...Object.keys(mine), ...Object.keys(theirs)]);
    for (const k of keys) {
      const inM = k in mine;
      const inT = k in theirs;
      const inB = k in base;
      if (inM && inT) out[k] = merge3(base[k], mine[k], theirs[k]);
      else if (inM) {
        // removed by them: keep only if I changed it
        if (!inB || !deepEqual(mine[k], base[k])) out[k] = mine[k];
      } else if (inT) {
        if (!inB || !deepEqual(theirs[k], base[k])) out[k] = theirs[k];
      }
    }
    return out as T;
  }

  if (Array.isArray(base) && Array.isArray(mine) && Array.isArray(theirs)) {
    const all = [...base, ...mine, ...theirs];
    if (all.length && hasIds(all as J[])) return mergeById(base, mine, theirs) as T;
  }
  if (Array.isArray(mine) && Array.isArray(theirs) && (base === undefined || (Array.isArray(base) && base.length === 0))) {
    const all = [...mine, ...theirs];
    if (all.length && hasIds(all)) return mergeById([], mine, theirs) as T;
  }
  // two people typing in the same text: keep both edits
  if (typeof base === 'string' && typeof mine === 'string' && typeof theirs === 'string') return diff3([...base], [...mine], [...theirs], (x, y) => x === y).join('') as T;
  // lists without ids (screenplay paragraphs, text runs, plain lists): merge item by item
  if (Array.isArray(base) && Array.isArray(mine) && Array.isArray(theirs)) return diff3(base, mine, theirs, deepEqual, (b, m, t) => merge3(b, m, t)) as T;
  // both changed the same value: mine is the newer edit on this screen
  return mine as T;
}

/* ---------------------------------------------------------------- diff3 */

/** Pairs [i in a, j in b] of a longest common subsequence (after trimming the shared ends). */
function lcs<X>(a: X[], b: X[], eq: (x: X, y: X) => boolean): [number, number][] {
  let pre = 0;
  while (pre < a.length && pre < b.length && eq(a[pre], b[pre])) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && eq(a[a.length - 1 - suf], b[b.length - 1 - suf])) suf++;
  const A = a.slice(pre, a.length - suf);
  const B = b.slice(pre, b.length - suf);
  const pairs: [number, number][] = [];
  for (let i = 0; i < pre; i++) pairs.push([i, i]);
  if (A.length && B.length) {
    // a very large middle is left unaligned: it then counts as one replaced block
    if (A.length * B.length <= 4_000_000) {
      const n = A.length;
      const m = B.length;
      const dp = new Uint32Array((n + 1) * (m + 1));
      for (let i = n - 1; i >= 0; i--)
        for (let j = m - 1; j >= 0; j--) dp[i * (m + 1) + j] = eq(A[i], B[j]) ? dp[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(dp[(i + 1) * (m + 1) + j], dp[i * (m + 1) + j + 1]);
      let i = 0;
      let j = 0;
      while (i < n && j < m) {
        if (eq(A[i], B[j])) {
          pairs.push([pre + i, pre + j]);
          i++;
          j++;
        } else if (dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + j + 1]) i++;
        else j++;
      }
    }
  }
  for (let k = suf; k > 0; k--) pairs.push([a.length - k, b.length - k]);
  return pairs;
}

/** Three-way merge of sequences. Unchanged stretches stay, one-sided changes are taken, and where both
    sides changed the same stretch: equal-length blocks merge item by item (mergeItem, for lists), otherwise
    both are kept, mine first (for text: both people's characters stay). */
function diff3<X>(base: X[], mine: X[], theirs: X[], eq: (x: X, y: X) => boolean, mergeItem?: (b: X, m: X, t: X) => X): X[] {
  const mA = new Map(lcs(base, mine, eq));
  const mB = new Map(lcs(base, theirs, eq));
  const out: X[] = [];
  let bi = 0;
  let ai = 0;
  let ti = 0;
  const flush = (bEnd: number, aEnd: number, tEnd: number) => {
    const B = base.slice(bi, bEnd);
    const A = mine.slice(ai, aEnd);
    const T = theirs.slice(ti, tEnd);
    const same = (x: X[], y: X[]) => x.length === y.length && x.every((v, k) => eq(v, y[k]));
    if (same(A, B)) out.push(...T);
    else if (same(T, B)) out.push(...A);
    else if (same(A, T)) out.push(...A);
    else if (mergeItem && A.length === T.length && A.length === B.length) A.forEach((v, k) => out.push(mergeItem(B[k], v, T[k])));
    else out.push(...A, ...T);
  };
  for (let i = 0; i < base.length; i++) {
    const a = mA.get(i);
    const t = mB.get(i);
    // a stable point: this base item is still there on both sides
    if (a == null || t == null || a < ai || t < ti) continue;
    flush(i, a, t);
    out.push(mine[a]);
    bi = i + 1;
    ai = a + 1;
    ti = t + 1;
  }
  flush(base.length, mine.length, theirs.length);
  return out;
}
