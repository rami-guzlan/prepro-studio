/* "Scenes" cell of the elements table: count + scene numbers, with a popover to open,
   link and unlink scenes. */
import { useState } from 'react';
import { ExternalLink, Link2, X } from 'lucide-react';
import type { BreakdownElement } from '@/types';
import type { SceneInfo } from '@/script-core/model';
import { update } from '@/store/project';
import { navigate } from '@/store/app';
import { Popover, Select, type AnchorRect } from '@/ui';
import { elementLinks, removeElementFromSceneDraft, stripStyle } from '@/modules/breakdown/logic';

export function ScenesCell({ el, scenes, allScenes }: { el: BreakdownElement; scenes: SceneInfo[]; allScenes: SceneInfo[] }) {
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const inIds = new Set(scenes.map((s) => s.id));
  const linkable = allScenes.filter((s) => !inIds.has(s.id));
  const numbers = scenes.map((s) => s.number).join(', ');

  return (
    <>
      <button
        type="button"
        className="elements-scenes-btn"
        title={scenes.length ? `Scenes ${numbers}` : 'Not in any scene yet — click to link'}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAnchor(anchor ? null : { left: r.left, top: r.top, right: r.right, bottom: r.bottom });
        }}
      >
        {scenes.length ? (
          <>
            <span className="elements-scenes-count">{scenes.length}</span>
            <span className="ellipsis">{numbers}</span>
          </>
        ) : (
          <span className="elements-scenes-none">
            <Link2 size={12} /> Link
          </span>
        )}
      </button>
      <Popover anchor={anchor} onClose={() => setAnchor(null)}>
        <div className="elements-scenes-pop">
          <div className="menu-label">{scenes.length ? `Appears in ${scenes.length} scene${scenes.length === 1 ? '' : 's'}` : 'Not in any scene yet'}</div>
          {scenes.map((s) => {
            const links = elementLinks(s, el);
            const strip = stripStyle(s.stripKey);
            return (
              <div key={s.id} className="elements-scenes-row">
                <span className="elements-scenes-num" style={{ background: strip.bg, color: strip.fg }}>
                  {s.number}
                </span>
                <button
                  type="button"
                  className="elements-scenes-link"
                  title="Open this scene's breakdown sheet"
                  onClick={() => {
                    setAnchor(null);
                    navigate('breakdown', { sceneId: s.id });
                  }}
                >
                  <span className="ellipsis">{s.heading || 'Untitled scene'}</span>
                  <ExternalLink size={12} />
                </button>
                {links.tagged && <span className="badge accent" style={{ height: 17, fontSize: 10 }}>in script</span>}
                {(links.manual || links.linked) && (
                  <button
                    type="button"
                    className="elements-scenes-x"
                    title={links.tagged ? 'Remove the manual link (the script tag stays)' : 'Remove from this scene'}
                    aria-label="Unlink scene"
                    onClick={() => update((d) => removeElementFromSceneDraft(d, s.id, el.id))}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            );
          })}
          {linkable.length > 0 && (
            <>
              <div className="menu-sep" />
              <Select
                size="sm"
                value=""
                placeholder="Add to scene…"
                options={linkable.map((s) => ({ value: s.id, label: `${s.number}. ${s.heading || 'Untitled scene'}` }))}
                onChange={(sid) => {
                  if (!sid) return;
                  update((d) => {
                    const x = d.elements.find((e) => e.id === el.id);
                    if (!x) return;
                    const list = (x.sceneIds ??= []);
                    if (!list.includes(sid)) list.push(sid);
                  });
                }}
              />
            </>
          )}
        </div>
      </Popover>
    </>
  );
}
