/* Wardrobe plot: scenes × characters, listing each character's wardrobe per scene. */
import { useMemo } from 'react';
import type { ScriptModel } from '@/script-core/model';
import { navigate } from '@/store/app';
import { useProject } from '@/store/project';
import { castForCharacter } from '@/derived/project';
import { EmptyState } from '@/ui';
import { Shirt } from 'lucide-react';
import { stripStyle } from '@/modules/breakdown/logic';
import { buildPlot } from './plot';

export function WardrobePlot({ model }: { model: ScriptModel }) {
  const elements = useProject((p) => p.elements);
  const characters = useProject((p) => p.characters);
  const cast = useProject((p) => p.cast);
  const plot = useMemo(() => buildPlot(model, elements, characters, ['wardrobe']), [model, elements, characters]);

  if (!plot.rows.length || (!plot.chars.length && !plot.unassigned)) {
    return (
      <EmptyState
        icon={Shirt}
        title="Nothing to plot yet"
        description="The wardrobe plot shows which costume each character wears in every scene. Add wardrobe items, set their character and link them to scenes."
      />
    );
  }
  const cols: { id: string; label: string; sub?: string }[] = plot.chars.map((c) => ({
    id: c.id,
    label: `${c.number != null ? `${c.number}. ` : ''}${c.name}`,
    sub: castForCharacter({ cast }, c)?.name,
  }));
  if (plot.unassigned) cols.push({ id: '__none', label: 'Unassigned' });

  return (
    <div className="table-wrap">
      <table className="table elements-plot">
        <thead>
          <tr>
            <th style={{ width: 54 }}>Sc.</th>
            <th style={{ minWidth: 200 }}>Scene</th>
            {cols.map((c) => (
              <th key={c.id} style={{ minWidth: 150 }}>
                <div>{c.label}</div>
                {c.sub && <div className="tiny muted" style={{ fontWeight: 500 }}>{c.sub}</div>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {plot.rows.map((r) => {
            const st = stripStyle(r.stripKey);
            return (
              <tr key={r.sceneId}>
                <td>
                  <button type="button" className="elements-plot-scene" style={{ background: st.bg, color: st.fg }} onClick={() => navigate('breakdown', { sceneId: r.sceneId })} title="Open breakdown sheet">
                    {r.number}
                  </button>
                </td>
                <td>
                  <div className="strong ellipsis" style={{ maxWidth: 320 }}>
                    {r.heading || 'Untitled scene'}
                  </div>
                  {r.scriptDay && <div className="tiny muted">{r.scriptDay}</div>}
                </td>
                {cols.map((c) => {
                  const cell = r.cells.get(c.id);
                  if (!cell || (!cell.present && !cell.items.length)) return <td key={c.id} />;
                  return (
                    <td key={c.id} className={`elements-plot-cell ${cell.items.length ? 'has' : 'gap'}`}>
                      {cell.items.length ? (
                        cell.items.map((e) => (
                          <button key={e.id} type="button" className="elements-plot-item" onClick={() => navigate('elements', { elementId: e.id })}>
                            {e.name || 'Unnamed'}
                          </button>
                        ))
                      ) : (
                        <span className="tiny" title="In this scene, but no wardrobe assigned">
                          In scene — no wardrobe set
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
