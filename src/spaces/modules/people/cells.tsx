/* People & Brands: one editor per column type (used in the table, the row dialog and board cards). */
import { useState } from 'react';
import { AlignLeft, Banknote, Calendar, CircleDot, ExternalLink, Hash, Link2, Mail, Megaphone, Phone, Plus, SquareCheck, Tags, Type, type LucideIcon } from 'lucide-react';
import type { CrmColumn, CrmColumnType, CrmRow, CrmSheet } from '@/spaces/types';
import { optionOf, isFollowUpColumn } from '@/spaces/crm';
import { useSpace } from '@/store/space';
import { backend } from '@/backend';
import { todayISO } from '@/lib/dates';
import { Checkbox, DateInput, IconButton, Input, NumberInput, Popover, Select, Textarea, promptDialog, type AnchorRect } from '@/ui';
import { openUrl } from '../assets/actions';
import { addOption, setValue } from './ops';

export const TYPE_ICON: Record<CrmColumnType, LucideIcon> = {
  text: Type,
  longtext: AlignLeft,
  select: CircleDot,
  multi: Tags,
  number: Hash,
  money: Banknote,
  date: Calendar,
  email: Mail,
  phone: Phone,
  url: Link2,
  checkbox: SquareCheck,
  campaign: Megaphone,
};

export function currencySymbol(code: string | undefined): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code || 'USD' }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? '$';
  } catch {
    return '$';
  }
}

const ADD = '__add_option__';

/** Coloured pill style for a select value. */
export function pillStyle(color: string | undefined) {
  return color ? { color, background: `color-mix(in srgb, ${color} 15%, transparent)` } : undefined;
}

function MultiCell({ sheet, col, row, form }: { sheet: CrmSheet; col: CrmColumn; row: CrmRow; form?: boolean }) {
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const [text, setText] = useState('');
  const v = row.values[col.id];
  const ids = Array.isArray(v) ? (v as string[]) : [];
  const chosen = ids.map((id) => optionOf(col, id)).filter((o): o is NonNullable<typeof o> => !!o);
  const set = (next: string[]) => setValue(sheet.id, row.id, col.id, next, false);
  const addNew = () => {
    const label = text.trim();
    if (!label) return;
    const existing = col.options?.find((o) => o.label.toLowerCase() === label.toLowerCase());
    const id = existing?.id ?? addOption(sheet.id, col.id, label);
    if (id && !ids.includes(id)) set([...ids, id]);
    setText('');
  };
  return (
    <>
      <button
        type="button"
        className={`sp-crm-multi ${form ? 'form input' : ''}`}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAnchor({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
        }}
        aria-label={`${col.name}: ${chosen.map((o) => o.label).join(', ') || 'none'}`}
      >
        {chosen.length ? (
          chosen.map((o) => (
            <span key={o.id} className="sp-crm-chip" style={pillStyle(o.color)}>
              {o.label}
            </span>
          ))
        ) : (
          <span className="sp-crm-empty">—</span>
        )}
      </button>
      <Popover anchor={anchor} onClose={() => setAnchor(null)}>
        <div className="sp-crm-pop">
          {(col.options ?? []).map((o) => (
            <label key={o.id} className="sp-crm-pop-item">
              <input type="checkbox" checked={ids.includes(o.id)} onChange={(e) => set(e.target.checked ? [...ids, o.id] : ids.filter((x) => x !== o.id))} />
              <span className="sp-crm-chip" style={pillStyle(o.color)}>
                {o.label}
              </span>
            </label>
          ))}
          <div className="sp-crm-pop-add">
            <Plus size={13} />
            <input
              className="input sm bare"
              value={text}
              placeholder="New option, Enter to add"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addNew();
                }
              }}
            />
          </div>
        </div>
      </Popover>
    </>
  );
}

/** Editor for one value. `form` = full-size inputs (row dialog), otherwise compact table cells. */
export function CrmCell({ sheet, col, row, form, autoFocus }: { sheet: CrmSheet; col: CrmColumn; row: CrmRow; form?: boolean; autoFocus?: boolean }) {
  const campaigns = useSpace((s) => s.campaigns);
  const currency = useSpace((s) => s.settings?.currency);
  const v = row.values[col.id];
  const set = (value: unknown, coalesce = true) => setValue(sheet.id, row.id, col.id, value, coalesce);
  const bare = !form;
  const size = form ? undefined : 'sm';
  const str = typeof v === 'string' ? v : v == null ? '' : String(v);

  switch (col.type) {
    case 'longtext':
      return <Textarea bare={bare} autoGrow minRows={form ? 3 : 1} className={form ? undefined : 'sp-crm-longtext'} value={str} placeholder={form ? col.name : undefined} onChange={(t) => set(t)} />;
    case 'select': {
      const o = optionOf(col, v);
      return (
        <Select
          bare={bare}
          size={size}
          className={o ? 'sp-crm-pill' : 'sp-crm-pill empty'}
          style={pillStyle(o?.color)}
          value={o ? o.id : ''}
          placeholder="—"
          options={[...(col.options ?? []).map((x) => ({ value: x.id, label: x.label })), { value: ADD, label: '+ Add option…' }]}
          onChange={async (val) => {
            if (val !== ADD) return set(val || undefined, false);
            const label = (await promptDialog({ title: `New option for “${col.name}”`, placeholder: 'e.g. Negotiating', confirmLabel: 'Add' }))?.trim();
            if (!label) return;
            const id = col.options?.find((x) => x.label.toLowerCase() === label.toLowerCase())?.id ?? addOption(sheet.id, col.id, label);
            if (id) set(id, false);
          }}
          aria-label={col.name}
        />
      );
    }
    case 'multi':
      return <MultiCell sheet={sheet} col={col} row={row} form={form} />;
    case 'number':
      return <NumberInput bare={bare} size={size} value={typeof v === 'number' ? v : undefined} onChange={(n) => set(n)} aria-label={col.name} />;
    case 'money':
      return <NumberInput bare={bare} size={size} decimals={2} prefix={currencySymbol(currency)} value={typeof v === 'number' ? v : undefined} onChange={(n) => set(n)} aria-label={col.name} />;
    case 'date': {
      const late = isFollowUpColumn(col) && !!str && str <= todayISO();
      return (
        <span className={`sp-crm-date ${late ? 'late' : ''}`} title={late ? 'Follow-up due' : undefined}>
          <DateInput bare={bare} size={size} value={str || undefined} onChange={(d) => set(d, false)} />
        </span>
      );
    }
    case 'checkbox':
      return <Checkbox checked={v === true} onChange={(b) => set(b || undefined, false)} label={form ? col.name : undefined} />;
    case 'campaign':
      return (
        <Select
          bare={bare}
          size={size}
          value={typeof v === 'string' && campaigns.some((c) => c.id === v) ? v : ''}
          placeholder={campaigns.length ? '—' : 'No campaigns yet'}
          options={campaigns.map((c) => ({ value: c.id, label: c.name || 'Untitled campaign' }))}
          onChange={(val) => set(val || undefined, false)}
          aria-label={col.name}
        />
      );
    case 'email':
    case 'url':
    case 'phone': {
      const go = col.type === 'email' ? () => backend.openExternal?.(`mailto:${str.trim()}`) : col.type === 'url' ? () => openUrl(str) : () => backend.openExternal?.(`tel:${str.replace(/[^\d+]/g, '')}`);
      return (
        <span className="sp-crm-linkcell">
          <Input bare={bare} size={size} autoFocus={autoFocus} value={str} placeholder={form ? (col.type === 'email' ? 'name@example.com' : col.type === 'url' ? 'https://…' : '') : undefined} onChange={(t) => set(t)} aria-label={col.name} />
          {str.trim() && (col.type !== 'phone' || backend.openExternal) && (
            <IconButton icon={col.type === 'email' ? Mail : col.type === 'url' ? ExternalLink : Phone} size="sm" label={col.type === 'email' ? 'Write an email' : col.type === 'url' ? 'Open link' : 'Call'} onClick={go} />
          )}
        </span>
      );
    }
    case 'text':
    default:
      return <Input bare={bare} size={size} autoFocus={autoFocus} value={str} placeholder={form ? col.name : undefined} onChange={(t) => set(t)} aria-label={col.name} />;
  }
}
