import type { CSSProperties, ReactNode } from 'react';
import { Download, FileDown, Printer, Sheet, type LucideIcon } from 'lucide-react';
import type { Option } from '@/lib/constants';
import { initials } from '@/lib/text';
import { assetUrl } from '@/backend';
import { openPrint } from '@/store/app';
import { Button } from './Button';
import { Menu, type MenuItem } from './Menu';

/* ---------------------------------------------------------------- module chrome */

export function ModuleHeader({ title, subtitle, icon: Icon, actions, children }: { title: ReactNode; subtitle?: ReactNode; icon?: LucideIcon; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="module-header">
      {Icon && (
        <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={17} />
        </div>
      )}
      <div className="titles">
        <h1>{title}</h1>
        {subtitle != null && <div className="subtitle">{subtitle}</div>}
      </div>
      {children}
      {actions != null && <div className="actions">{actions}</div>}
    </div>
  );
}

export function Toolbar({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="module-toolbar" style={style}>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- tabs */

export interface TabDef<K extends string = string> {
  id: K;
  label: ReactNode;
  icon?: LucideIcon;
  count?: number;
}

export function Tabs<K extends string>({ tabs, value, onChange, style }: { tabs: TabDef<K>[]; value: K; onChange: (k: K) => void; style?: CSSProperties }) {
  return (
    <div className="tabs" role="tablist" style={style}>
      {tabs.map((t) => {
        const Icon = t.icon;
        return (
          <button key={t.id} type="button" role="tab" aria-selected={value === t.id} className={value === t.id ? 'on' : ''} onClick={() => onChange(t.id)}>
            {Icon && <Icon />}
            {t.label}
            {t.count != null && <span className="count">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function UnderlineTabs<K extends string>({ tabs, value, onChange }: { tabs: TabDef<K>[]; value: K; onChange: (k: K) => void }) {
  return (
    <div className="underline-tabs" role="tablist">
      {tabs.map((t) => {
        const Icon = t.icon;
        return (
          <button key={t.id} type="button" role="tab" aria-selected={value === t.id} className={value === t.id ? 'on' : ''} onClick={() => onChange(t.id)}>
            {Icon && <Icon />}
            {t.label}
            {t.count != null && <span className="badge" style={{ height: 18, padding: '0 6px' }}>{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- badges */

export function Badge({ children, color, tone, style, title }: { children: ReactNode; color?: string; tone?: 'accent' | 'success' | 'warning' | 'danger'; style?: CSSProperties; title?: string }) {
  const s: CSSProperties = color ? { background: `color-mix(in srgb, ${color} 16%, transparent)`, color, ...style } : style ?? {};
  return (
    <span className={['badge', tone].filter(Boolean).join(' ')} style={s} title={title}>
      {children}
    </span>
  );
}

/** Badge for a value from an option list with colours (e.g. CAST_STATUSES). */
export function StatusBadge({ value, options, dot = true }: { value: string | undefined; options: Option[]; dot?: boolean }) {
  if (!value) return null;
  const o = options.find((x) => x.value === value);
  const color = o?.color ?? '#888';
  return (
    <Badge color={color}>
      {dot && <span className="dot" />}
      {o?.label ?? value}
    </Badge>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

/* ---------------------------------------------------------------- avatar */

export function Avatar({ name, photo, size = 32, color, style }: { name: string; photo?: string; size?: number; color?: string; style?: CSSProperties }) {
  const url = assetUrl(photo);
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.38)),
        ...(color ? { background: `color-mix(in srgb, ${color} 20%, transparent)`, color } : {}),
        ...style,
      }}
      title={name}
    >
      {url ? <img src={url} alt="" draggable={false} /> : initials(name || '?')}
    </span>
  );
}

/* ---------------------------------------------------------------- empty state */

export function EmptyState({ icon: Icon, title, description, action, style }: { icon?: LucideIcon; title: ReactNode; description?: ReactNode; action?: ReactNode; style?: CSSProperties }) {
  return (
    <div className="empty" style={style}>
      {Icon && (
        <div className="empty-icon">
          <Icon />
        </div>
      )}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

/* ---------------------------------------------------------------- stats */

export function Stat({ label, value, sub, style }: { label: ReactNode; value: ReactNode; sub?: ReactNode; style?: CSSProperties }) {
  return (
    <div className="stat" style={style}>
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      {sub != null && <span className="sub">{sub}</span>}
    </div>
  );
}

export function Progress({ value, color, style }: { value: number; color?: string; style?: CSSProperties }) {
  return (
    <div className="progress" style={style}>
      <div style={{ width: `${Math.max(0, Math.min(100, value * 100))}%`, background: color }} />
    </div>
  );
}

export function Card({ title, actions, children, style, bodyStyle, padded = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; style?: CSSProperties; bodyStyle?: CSSProperties; padded?: boolean }) {
  return (
    <div className="card" style={style}>
      {(title != null || actions != null) && (
        <div className="card-header">
          {title != null && <h3>{title}</h3>}
          <div className="spacer" />
          {actions}
        </div>
      )}
      <div className={padded ? 'card-body' : undefined} style={bodyStyle}>
        {children}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- print / export menu */

export interface ExportMenuProps {
  /** print document ids from the print registry, e.g. [{ id: 'cast-list', label: 'Cast list' }] */
  docs?: { id: string; label: string; options?: Record<string, unknown> }[];
  /** CSV exports */
  csv?: { label: string; onClick: () => void }[];
  extra?: MenuItem[];
  label?: string;
}

/** Standard "Print / Export" dropdown used in module headers. */
export function ExportMenu({ docs = [], csv = [], extra = [], label = 'Print / Export' }: ExportMenuProps) {
  const items: MenuItem[] = [];
  if (docs.length) {
    items.push({ header: 'Print & PDF' });
    for (const d of docs) items.push({ label: d.label, icon: Printer, onClick: () => openPrint(d.id, d.options) });
  }
  if (csv.length) {
    if (items.length) items.push({ separator: true });
    items.push({ header: 'Spreadsheet' });
    for (const c of csv) items.push({ label: c.label, icon: Sheet, onClick: c.onClick });
  }
  if (extra.length) {
    if (items.length) items.push({ separator: true });
    items.push(...extra);
  }
  if (docs.length === 1 && csv.length === 0 && extra.length === 0) {
    return (
      <Button icon={Printer} onClick={() => openPrint(docs[0].id, docs[0].options)}>
        {label}
      </Button>
    );
  }
  return <Menu align="end" trigger={<Button icon={FileDown}>{label}</Button>} items={items} />;
}

export { Download };
