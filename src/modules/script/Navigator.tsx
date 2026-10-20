/* Scene navigator: jump to scenes, drag to reorder scenes in the script. */
import { useMemo, useRef, useState } from 'react';
import { useCommand } from '@/lib/commands';
import { STRIP_COLORS } from '@/lib/constants';
import { formatEighths } from '@/lib/format';
import { matchesQuery } from '@/lib/text';
import { useScriptModel } from '@/derived/script';
import { SearchInput } from '@/ui';
import { useScriptUI } from './scriptUI';
import { moveScene, scrollToScene } from './editor/actions';

export function Navigator() {
  const model = useScriptModel();
  const view = useScriptUI((s) => s.view);
  const current = useScriptUI((s) => s.sceneId);
  const pageInfo = useScriptUI((s) => s.pageInfo);
  const [q, setQ] = useState('');
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useCommand('goto-scene', () => {
    searchRef.current?.querySelector('input')?.focus();
    return true;
  });

  const scenes = useMemo(
    () => model.scenes.filter((s) => matchesQuery(`${s.number} ${s.heading} ${s.synopsis} ${s.speaking.join(' ')}`, q)),
    [model.scenes, q],
  );

  return (
    <div className="sp-nav">
      <div className="sp-nav-head">
        <div className="row">
          <span className="section-title" style={{ margin: 0 }}>
            Scenes · {model.scenes.length}
          </span>
        </div>
        <div ref={searchRef}>
          <SearchInput value={q} onChange={setQ} placeholder="Go to scene… (Ctrl+G)" width="100%" />
        </div>
      </div>
      <div className="sp-nav-list" onDragLeave={() => setOver(null)}>
        {scenes.length === 0 && <div className="muted small" style={{ padding: 12 }}>{model.scenes.length ? 'No matching scenes.' : 'Scenes appear here as you write scene headings (Ctrl+1).'}</div>}
        {scenes.map((s) => {
          const strip = STRIP_COLORS[s.stripKey] ?? STRIP_COLORS.OTHER;
          const page = pageInfo?.pagination.scenePage.get(s.id) ?? s.page;
          return (
            <button
              key={s.id}
              className={`sp-scene-item ${current === s.id ? 'active' : ''} ${over === s.id && drag !== s.id ? 'drop-before' : ''}`}
              draggable={!q}
              onDragStart={(e) => {
                setDrag(s.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => {
                setDrag(null);
                setOver(null);
              }}
              onDragOver={(e) => {
                if (!drag) return;
                e.preventDefault();
                setOver(s.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (view && drag && drag !== s.id) moveScene(view, drag, s.id);
                setDrag(null);
                setOver(null);
              }}
              onClick={() => view && scrollToScene(view, s.id)}
              title="Click to jump · drag to reorder"
            >
              <span className="sp-scene-num" style={{ background: strip.bg }}>
                {s.number}
              </span>
              <span className="sp-scene-text">
                <span className="sp-scene-heading">{s.heading || 'Untitled scene'}</span>
                <span className="sp-scene-meta">
                  p.{page} · {formatEighths(s.eighths)} pg{s.speaking.length ? ` · ${s.speaking.slice(0, 3).join(', ')}${s.speaking.length > 3 ? '…' : ''}` : ''}
                </span>
                {s.synopsis && <span className="sp-scene-meta" style={{ display: 'block', fontStyle: 'italic' }}>{s.synopsis}</span>}
              </span>
            </button>
          );
        })}
        {drag && !q && (
          <div
            style={{ height: 40, borderRadius: 7, border: over === '__end' ? '2px dashed var(--accent)' : '2px dashed transparent' }}
            onDragOver={(e) => {
              e.preventDefault();
              setOver('__end');
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (view && drag) moveScene(view, drag, null);
              setDrag(null);
              setOver(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
