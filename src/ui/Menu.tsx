/* Popover, dropdown menus and right-click context menus. */
import { cloneElement, useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, type LucideIcon } from 'lucide-react';
import { create } from 'zustand';
import { isTopOverlay, popOverlay, pushOverlay } from './overlayStack';

export interface MenuItem {
  label?: string;
  icon?: LucideIcon;
  onClick?: () => void;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  /** render a separator */
  separator?: boolean;
  /** render a small section header */
  header?: string;
  /** small colour dot shown before the label */
  swatch?: string;
}

/* ---------------------------------------------------------------- positioning */

export interface AnchorRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function usePosition(anchor: AnchorRect | null, align: 'start' | 'end' = 'start') {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const el = ref.current;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = align === 'end' ? anchor.right - w : anchor.left;
    let top = anchor.bottom + 4;
    if (left + w > vw - 8) left = Math.max(8, vw - w - 8);
    if (left < 8) left = 8;
    if (top + h > vh - 8) {
      const above = anchor.top - h - 4;
      top = above > 8 ? above : Math.max(8, vh - h - 8);
    }
    setPos({ left, top });
  }, [anchor, align]);
  return { ref, pos };
}

export function Popover({
  anchor,
  onClose,
  children,
  align = 'start',
  className,
  style,
}: {
  anchor: AnchorRect | null;
  onClose: () => void;
  children: ReactNode;
  align?: 'start' | 'end';
  className?: string;
  style?: React.CSSProperties;
}) {
  const { ref, pos } = usePosition(anchor, align);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!anchor) return;
    const id = pushOverlay();
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTopOverlay(id)) {
        e.stopPropagation();
        e.preventDefault();
        closeRef.current();
      }
    };
    const onBlur = () => closeRef.current();
    const t = setTimeout(() => window.addEventListener('mousedown', onDown, true), 0);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onBlur);
    return () => {
      popOverlay(id);
      clearTimeout(t);
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [anchor, ref]);
  if (!anchor) return null;
  return createPortal(
    <div
      ref={ref}
      className={['popover', className].filter(Boolean).join(' ')}
      style={{ left: pos?.left ?? anchor.left, top: pos?.top ?? anchor.bottom + 4, visibility: pos ? 'visible' : 'hidden', ...style }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>,
    document.body,
  );
}

export function MenuList({ items, onDone }: { items: MenuItem[]; onDone: () => void }) {
  return (
    <div role="menu">
      {items.map((it, i) => {
        if (it.separator) return <div key={i} className="menu-sep" />;
        if (it.header) return <div key={i} className="menu-label">{it.header}</div>;
        const Icon = it.icon;
        return (
          <button
            key={i}
            type="button"
            role="menuitem"
            className={`menu-item ${it.danger ? 'danger' : ''}`}
            disabled={it.disabled}
            onClick={() => {
              onDone();
              it.onClick?.();
            }}
          >
            {it.checked != null ? <Check style={{ visibility: it.checked ? 'visible' : 'hidden' }} /> : Icon ? <Icon /> : null}
            {it.swatch && <span className="menu-swatch" style={{ background: it.swatch }} />}
            <span>{it.label}</span>
            {it.shortcut && <span className="shortcut">{it.shortcut}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Wrap a trigger element (usually a <Button>) to show a dropdown menu on click. */
export function Menu({ trigger, items, align = 'start' }: { trigger: ReactElement<any>; items: MenuItem[] | (() => MenuItem[]); align?: 'start' | 'end' }) {
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const resolved = anchor ? (typeof items === 'function' ? items() : items) : [];
  return (
    <>
      {cloneElement(trigger, {
        onClick: (e: React.MouseEvent<HTMLElement>) => {
          e.stopPropagation();
          if (anchor) {
            setAnchor(null);
            return;
          }
          const r = e.currentTarget.getBoundingClientRect();
          setAnchor({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
        },
        'aria-expanded': !!anchor,
      })}
      <Popover anchor={anchor} onClose={() => setAnchor(null)} align={align}>
        <MenuList items={resolved} onDone={() => setAnchor(null)} />
      </Popover>
    </>
  );
}

/* ---------------------------------------------------------------- context menu */

const useCtx = create<{ anchor: AnchorRect | null; items: MenuItem[] }>(() => ({ anchor: null, items: [] }));

/** Open a context menu at the mouse position: onContextMenu={(e) => openContextMenu(e, items)} */
export function openContextMenu(e: { clientX: number; clientY: number; preventDefault: () => void; stopPropagation?: () => void }, items: MenuItem[]) {
  e.preventDefault();
  e.stopPropagation?.();
  useCtx.setState({ anchor: { left: e.clientX, top: e.clientY, right: e.clientX, bottom: e.clientY }, items });
}

export function ContextMenuHost() {
  const { anchor, items } = useCtx();
  return (
    <Popover anchor={anchor} onClose={() => useCtx.setState({ anchor: null })}>
      <MenuList items={items} onDone={() => useCtx.setState({ anchor: null })} />
    </Popover>
  );
}
