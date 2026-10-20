/* Corkboard of index cards: one per scene, editable synopsis, drag to restructure the script. */
import { useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import { useScriptModel } from '@/derived/script';
import { getProject, update, useFormatters } from '@/store/project';
import { STRIP_COLORS } from '@/lib/constants';
import { EmptyState, toast } from '@/ui';
import { useScriptUI } from './scriptUI';

/** Move a scene inside the stored doc JSON. Returns the new doc or null. */
function moveSceneInJson(doc: any, sid: string, beforeSid: string | null): any | null {
  const content: any[] = [...(doc?.content ?? [])];
  const heads: { sid: string; i: number }[] = [];
  content.forEach((n, i) => n.type === 'scene_heading' && heads.push({ sid: n.attrs?.sid, i }));
  const k = heads.findIndex((h) => h.sid === sid);
  if (k < 0 || heads.length < 2) return null;
  const start = heads[k].i;
  const end = k + 1 < heads.length ? heads[k + 1].i : content.length;
  const block = content.splice(start, end - start);
  let at: number;
  if (beforeSid) {
    at = content.findIndex((n) => n.type === 'scene_heading' && n.attrs?.sid === beforeSid);
    if (at < 0) return null;
  } else at = content.length;
  content.splice(at, 0, ...block);
  return { ...doc, content };
}

export function IndexCards() {
  const model = useScriptModel();
  const fmt = useFormatters();
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const move = (sid: string, beforeSid: string | null) => {
    const before = getProject().script.doc;
    const next = moveSceneInJson(before, sid, beforeSid);
    if (!next) return;
    update((d) => {
      d.script.doc = next;
      d.script.revision++;
    }, { history: false });
    toast('Scene moved', 'success', {
      action: {
        label: 'Undo',
        onClick: () =>
          update((d) => {
            d.script.doc = before as any;
            d.script.revision++;
          }, { history: false }),
      },
    });
  };

  if (!model.scenes.length) {
    return <EmptyState icon={LayoutGrid} title="No scenes yet" description="Write scene headings in the script and each scene becomes an index card here." />;
  }

  return (
    <div className="module-body" onDragEnd={() => { setDrag(null); setOver(null); }}>
      <div className="muted small" style={{ padding: '14px 20px 0' }}>
        Drag cards to restructure the script · write a one-line synopsis on each card.
      </div>
      <div className="sp-cards">
        {model.scenes.map((s) => {
          const strip = STRIP_COLORS[s.stripKey] ?? STRIP_COLORS.OTHER;
          return (
            <div
              key={s.id}
              className={`sp-card ${drag === s.id ? 'dragging' : ''} ${over === s.id && drag !== s.id ? 'drop-before' : ''}`}
              style={{ ['--card-color' as any]: s.meta?.color ?? strip.bg }}
              onDragOver={(e) => {
                if (!drag) return;
                e.preventDefault();
                setOver(s.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (drag && drag !== s.id) move(drag, s.id);
                setDrag(null);
                setOver(null);
              }}
            >
              <div
                className="sp-card-head"
                draggable
                onDragStart={(e) => {
                  setDrag(s.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDoubleClick={() => {
                  useScriptUI.setState({ tab: 'script' });
                  setTimeout(() => {
                    const v = useScriptUI.getState().view;
                    if (v) import('./editor/actions').then((m) => m.scrollToScene(v, s.id));
                  }, 60);
                }}
                title="Drag to move · double-click to open in the script"
              >
                <span className="num">{s.number}</span>
                <span className="heading">{s.heading || 'UNTITLED SCENE'}</span>
              </div>
              <textarea
                value={s.meta?.synopsis ?? ''}
                placeholder={s.firstAction ? s.firstAction.slice(0, 140) : 'What happens in this scene?'}
                onChange={(e) => {
                  const v = e.target.value;
                  update((d) => void ((d.scenes[s.id] ??= { id: s.id }).synopsis = v), { coalesce: `scene:${s.id}:synopsis` });
                }}
              />
              <div className="sp-card-foot">
                <span>{fmt.eighths(s.eighths)} pg</span>
                <span>·</span>
                <span className="ellipsis">{s.speaking.join(', ') || 'No dialogue'}</span>
              </div>
            </div>
          );
        })}
        {drag && (
          <div
            className="sp-card"
            style={{ background: 'transparent', boxShadow: 'none', border: '2px dashed var(--border-strong)', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (drag) move(drag, null);
              setDrag(null);
            }}
          >
            Move to the end
          </div>
        )}
      </div>
    </div>
  );
}
