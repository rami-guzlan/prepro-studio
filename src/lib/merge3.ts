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
  // both changed the same value: mine is the newer edit on this screen
  return mine as T;
}
