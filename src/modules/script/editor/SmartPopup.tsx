/* Floating SmartType suggestion list positioned at the cursor. */
import { createPortal } from 'react-dom';
import { useScriptUI } from '../scriptUI';
import { acceptSmart } from './smartType';

const KIND_LABEL: Record<string, string> = {
  intro: 'Scene intro',
  set: 'Locations',
  time: 'Time of day',
  character: 'Characters',
  ext: 'Extensions',
  transition: 'Transitions',
  shot: 'Shots',
};

export function SmartPopup() {
  const smart = useScriptUI((s) => s.smart);
  const view = useScriptUI((s) => s.view);
  if (!smart?.active || !view || !view.hasFocus()) return null;
  let coords: { left: number; bottom: number; top: number };
  try {
    coords = view.coordsAtPos(smart.from);
  } catch {
    return null;
  }
  const below = coords.bottom + 220 < window.innerHeight;
  return createPortal(
    <div
      className="popover sp-smart"
      style={{ left: coords.left - 6, top: below ? coords.bottom + 4 : undefined, bottom: below ? undefined : window.innerHeight - coords.top + 4, minWidth: 200 }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="menu-label">{KIND_LABEL[smart.kind] ?? 'Suggestions'}</div>
      {smart.items.map((it, i) => (
        <button key={it.label + i} className={`menu-item ${i === smart.index ? 'focused' : ''}`} onMouseDown={(e) => { e.preventDefault(); acceptSmart(view, i); }}>
          <span className="sp-smart-label">{it.label}</span>
        </button>
      ))}
      <div className="sp-smart-hint">
        <kbd className="kbd">↵</kbd>/<kbd className="kbd">Tab</kbd> accept · <kbd className="kbd">Esc</kbd> dismiss
      </div>
    </div>,
    document.body,
  );
}
