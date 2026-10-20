/* Breakdown summary: scenes × categories matrix with counts and totals. */
import { useMemo, useState, type CSSProperties } from 'react';
import type { ID } from '@/types';
import type { ScriptModel } from '@/script-core/model';
import { useFormatters, useProject } from '@/store/project';
import { readLS, writeLS } from '@/store/app';
import { CATEGORY_BY_ID } from '@/lib/constants';
import { Checkbox } from '@/ui';
import { ELEMENT_CATEGORIES, characterMap, elementMap, intExtLabel, sceneCharacters, sceneElements, stripStyle, type ElCategory } from './logic';

export function SummaryMatrix({ model, onOpen }: { model: ScriptModel; onOpen: (sceneId: ID) => void }) {
  const fmt = useFormatters();
  const elements = useProject((p) => p.elements);
  const characters = useProject((p) => p.characters);
  const [showAll, setShowAllState] = useState<boolean>(() => readLS('prepro.breakdown.matrixAll', false));
  const setShowAll = (v: boolean) => {
    writeLS('prepro.breakdown.matrixAll', v);
    setShowAllState(v);
  };

  const data = useMemo(() => {
    const elById = elementMap(elements);
    const charById = characterMap(characters);
    const unique = new Map<string, Set<ID>>();
    const add = (cat: string, id: ID) => {
      const set = unique.get(cat) ?? new Set<ID>();
      set.add(id);
      unique.set(cat, set);
    };
    let pages = 0;
    const rows = model.scenes.map((s) => {
      const counts = new Map<string, { n: number; names: string[] }>();
      const chars = sceneCharacters(s, charById);
      counts.set('cast', { n: chars.length, names: chars.map((c) => (c.number != null ? `${c.number}. ${c.name}` : c.name)) });
      for (const c of chars) add('cast', c.id);
      for (const el of sceneElements(s, elById)) {
        const e = counts.get(el.category) ?? { n: 0, names: [] };
        e.n++;
        e.names.push(el.name);
        counts.set(el.category, e);
        add(el.category, el.id);
      }
      pages += s.eighths;
      let total = 0;
      for (const v of counts.values()) total += v.n;
      return { scene: s, counts, total };
    });
    return { rows, unique, pages };
  }, [model, elements, characters]);

  const cats = useMemo(() => {
    const list = [CATEGORY_BY_ID.cast, ...ELEMENT_CATEGORIES];
    return showAll ? list : list.filter((c) => c.id === 'cast' || (data.unique.get(c.id)?.size ?? 0) > 0);
  }, [showAll, data]);

  const max = useMemo(() => {
    let m = 1;
    for (const r of data.rows) for (const v of r.counts.values()) m = Math.max(m, v.n);
    return m;
  }, [data]);

  if (model.scenes.length === 0) return null;

  const uniqueTotal = [...data.unique.entries()].reduce((n, [k, set]) => n + (cats.some((c) => c.id === k) ? set.size : 0), 0);

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row">
        <span className="muted small">
          {model.scenes.length} scenes · {fmt.eighths(data.pages)} pages · click a cell to open that scene's breakdown sheet
        </span>
        <span className="spacer" />
        <Checkbox checked={showAll} onChange={setShowAll} label="Show empty categories" />
      </div>
      <div className="table-wrap">
        <table className="table breakdown-matrix">
          <thead>
            <tr>
              <th className="breakdown-matrix-num">Sc.</th>
              <th style={{ minWidth: 220 }}>Scene</th>
              <th className="num">Pages</th>
              {cats.map((c) => (
                <th key={c.id} className="breakdown-matrix-cat" title={c.label} style={{ ['--cat' as any]: c.color } as CSSProperties}>
                  <span className="breakdown-matrix-catlabel">{c.short}</span>
                </th>
              ))}
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map(({ scene, counts, total }) => {
              const strip = stripStyle(scene.stripKey);
              return (
                <tr key={scene.id}>
                  <td className="breakdown-matrix-num">
                    <button type="button" className="breakdown-matrix-scene" style={{ background: strip.bg, color: strip.fg }} title={`Open scene ${scene.number}`} onClick={() => onOpen(scene.id)}>
                      {scene.number}
                    </button>
                  </td>
                  <td>
                    <button type="button" className="breakdown-matrix-heading" onClick={() => onOpen(scene.id)} title={scene.heading}>
                      <span className="ellipsis">{scene.set || scene.heading || 'Untitled scene'}</span>
                      <span className="muted tiny nowrap">
                        {intExtLabel(scene.intExt)} · {scene.dayNight || '—'}
                      </span>
                    </button>
                  </td>
                  <td className="num">{fmt.eighths(scene.eighths)}</td>
                  {cats.map((c) => {
                    const v = counts.get(c.id);
                    const n = v?.n ?? 0;
                    const strength = n ? 10 + Math.round((n / max) * 30) : 0;
                    return (
                      <td
                        key={c.id}
                        className={`breakdown-matrix-cell ${n ? 'has' : ''}`}
                        style={n ? ({ background: `color-mix(in srgb, ${c.color} ${strength}%, transparent)` } as CSSProperties) : undefined}
                        title={n ? `${c.label}:\n${v!.names.join('\n')}` : `${c.label}: none`}
                        onClick={() => onOpen(scene.id)}
                      >
                        {n || <span className="breakdown-matrix-zero">·</span>}
                      </td>
                    );
                  })}
                  <td className="num strong">{total || <span className="muted">0</span>}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="breakdown-matrix-foot">
              <td />
              <td>Unique per category</td>
              <td className="num">{fmt.eighths(data.pages)}</td>
              {cats.map((c) => (
                <td key={c.id} className="breakdown-matrix-cell">
                  {data.unique.get(c.id as ElCategory | 'cast')?.size ?? 0}
                </td>
              ))}
              <td className="num">{uniqueTotal}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
