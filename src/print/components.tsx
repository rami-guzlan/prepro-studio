/* Building blocks for printed documents. Render-only (no hooks/effects):
   they are turned into static HTML with renderToStaticMarkup. */
import { Fragment, type CSSProperties, type ReactNode } from 'react';
import type { PrintContext } from './types';

export function DocHeader({ ctx, title, subtitle, meta }: { ctx: PrintContext; title: ReactNode; subtitle?: ReactNode; meta?: ReactNode }) {
  const p = ctx.project;
  const logo = p.settings.print.showLogo && p.meta.logo ? ctx.asset(p.meta.logo) : '';
  return (
    <div className="pp-doc-header">
      {logo && <img className="pp-logo" src={logo} alt="" />}
      <div className="pp-titles">
        <div className="pp-project">
          {p.meta.title}
          {p.meta.subtitle ? ` · ${p.meta.subtitle}` : ''}
        </div>
        <h1>{title}</h1>
        {subtitle != null && subtitle !== '' && <div className="pp-sub">{subtitle}</div>}
      </div>
      <div className="pp-meta">{meta ?? ctx.today}</div>
    </div>
  );
}

export function PSection({ title, children, className, style, right }: { title?: ReactNode; children: ReactNode; className?: string; style?: CSSProperties; right?: ReactNode }) {
  return (
    <div className={['pp-section', className].filter(Boolean).join(' ')} style={style}>
      {title != null && (
        <div className="pp-section-title" style={right ? { display: 'flex', justifyContent: 'space-between', gap: 10 } : undefined}>
          <span>{title}</span>
          {right != null && <span style={{ fontWeight: 600, textTransform: 'none', letterSpacing: 0, color: '#666' }}>{right}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

export interface PCol<T> {
  header: ReactNode;
  width?: string;
  align?: 'left' | 'right' | 'center';
  num?: boolean;
  cell: (row: T, index: number) => ReactNode;
  style?: CSSProperties;
}

export function PTable<T>({
  columns,
  rows,
  groupBy,
  groupLabel,
  zebra,
  bordered,
  footer,
  empty = 'None.',
  className,
  style,
  rowStyle,
}: {
  columns: PCol<T>[];
  rows: T[];
  groupBy?: (row: T) => string;
  groupLabel?: (group: string, rows: T[]) => ReactNode;
  zebra?: boolean;
  bordered?: boolean;
  /** cells of a total row (aligned with columns) */
  footer?: ReactNode[];
  empty?: ReactNode;
  className?: string;
  style?: CSSProperties;
  rowStyle?: (row: T) => CSSProperties | undefined;
}) {
  const renderRow = (r: T, i: number) => (
    <tr key={i} style={rowStyle?.(r)}>
      {columns.map((c, ci) => (
        <td key={ci} className={c.num ? 'num' : undefined} style={{ textAlign: c.align, ...c.style }}>
          {c.cell(r, i)}
        </td>
      ))}
    </tr>
  );
  let body: ReactNode;
  if (rows.length === 0) {
    body = (
      <tr>
        <td colSpan={columns.length} className="pp-muted" style={{ textAlign: 'center', padding: '10pt' }}>
          {empty}
        </td>
      </tr>
    );
  } else if (groupBy) {
    const groups = new Map<string, T[]>();
    for (const r of rows) {
      const g = groupBy(r) || '—';
      groups.set(g, [...(groups.get(g) ?? []), r]);
    }
    let idx = 0;
    body = [...groups.entries()].map(([g, gr]) => (
      <Fragment key={g}>
        <tr className="pp-group">
          <td colSpan={columns.length}>{groupLabel ? groupLabel(g, gr) : g}</td>
        </tr>
        {gr.map((r) => renderRow(r, idx++))}
      </Fragment>
    ));
  } else {
    body = rows.map(renderRow);
  }
  return (
    <table className={['pp-table', zebra && 'pp-zebra', bordered && 'pp-bordered', className].filter(Boolean).join(' ')} style={style}>
      <colgroup>
        {columns.map((c, i) => (
          <col key={i} style={{ width: c.width }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {columns.map((c, i) => (
            <th key={i} className={c.num ? 'num' : undefined} style={{ textAlign: c.align }}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{body}</tbody>
      {footer && (
        <tfoot>
          <tr className="pp-total">
            {footer.map((f, i) => (
              <td key={i} className={columns[i]?.num ? 'num' : undefined}>
                {f}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}

/** Key/value grid; empty values are skipped unless keepEmpty. */
export function KV({ items, cols = 3, keepEmpty, style }: { items: [ReactNode, ReactNode][]; cols?: number; keepEmpty?: boolean; style?: CSSProperties }) {
  const shown = keepEmpty ? items : items.filter(([, v]) => v != null && v !== '' && v !== false);
  if (!shown.length) return null;
  return (
    <div className="pp-kv" style={{ ['--pp-cols' as any]: cols, ...style }}>
      {shown.map(([k, v], i) => (
        <div key={i}>
          <div className="pp-k">{k}</div>
          <div className="pp-v">{v === '' || v == null ? ' ' : v}</div>
        </div>
      ))}
    </div>
  );
}

export function Box({ title, children, style, className }: { title?: ReactNode; children: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <div className={['pp-box', className].filter(Boolean).join(' ')} style={style}>
      {title != null && <div className="pp-box-title">{title}</div>}
      {children}
    </div>
  );
}

export function Photo({ src, width, height, aspect, contain, style, placeholder }: { src?: string; width?: string; height?: string; aspect?: number; contain?: boolean; style?: CSSProperties; placeholder?: ReactNode }) {
  return (
    <div
      className={['pp-photo', contain && 'contain'].filter(Boolean).join(' ')}
      style={{ width: width ?? '100%', height, aspectRatio: height ? undefined : aspect ? String(aspect) : undefined, ...style }}
    >
      {src ? (
        <img src={src} alt="" />
      ) : (
        placeholder != null && <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: '7pt' }}>{placeholder}</div>
      )}
    </div>
  );
}

export function Check({ on }: { on?: boolean }) {
  return <span className={['pp-check', on && 'on'].filter(Boolean).join(' ')} />;
}

export function Dot({ color }: { color: string }) {
  return <span className="pp-dot" style={{ background: color }} />;
}

export function PBadge({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span className="pp-badge" style={color ? { background: `${color}26`, color } : undefined}>
      {children}
    </span>
  );
}

/** Multi-line text with preserved line breaks. */
export function Pre({ children, style }: { children?: string; style?: CSSProperties }) {
  if (!children) return null;
  return (
    <div className="pp-pre" style={style}>
      {children}
    </div>
  );
}
