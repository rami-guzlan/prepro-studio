/* Form controls. All controls are "controlled": pass value + onChange.
   Text inputs call onChange on every keystroke; pair with update(..., { coalesce })
   or listOps().update() which coalesces typing into one undo step. */
import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Search, X } from 'lucide-react';
import type { Option } from '@/lib/constants';
import { SWATCHES } from '@/lib/constants';

/* ---------------------------------------------------------------- Input */

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'size'> {
  value: string | undefined | null;
  onChange: (value: string) => void;
  bare?: boolean;
  size?: 'sm' | 'md';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ value, onChange, bare, size, className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={['input', bare && 'bare', size === 'sm' && 'sm', className].filter(Boolean).join(' ')}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={rest.type === 'email' || rest.type === 'tel' ? false : rest.spellCheck}
      {...rest}
    />
  );
});

/* ---------------------------------------------------------------- NumberInput */

export interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'size'> {
  value: number | undefined | null;
  onChange: (value: number | undefined) => void;
  bare?: boolean;
  size?: 'sm' | 'md';
  /** show as money-ish text with 2 decimals when not focused */
  decimals?: number;
  prefix?: string;
}

export function NumberInput({ value, onChange, bare, size, className, decimals, prefix, style, ...rest }: NumberInputProps) {
  const [text, setText] = useState<string>(value == null ? '' : String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value == null || isNaN(value) ? '' : String(value));
  }, [value, focused]);
  const display = !focused && value != null && decimals != null ? value.toFixed(decimals) : text;
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', ...style }}>
      {prefix && (
        <span style={{ position: 'absolute', left: bare ? 0 : 8, color: 'var(--text-3)', pointerEvents: 'none', fontSize: 12 }}>{prefix}</span>
      )}
      <input
        className={['input', bare && 'bare', size === 'sm' && 'sm', className].filter(Boolean).join(' ')}
        inputMode="decimal"
        value={display}
        style={{ textAlign: 'right', paddingLeft: prefix ? (bare ? 12 : 20) : undefined, fontVariantNumeric: 'tabular-nums' }}
        onFocus={(e) => {
          setFocused(true);
          setText(value == null ? '' : String(value));
          requestAnimationFrame(() => e.target.select());
        }}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          if (t.trim() === '') onChange(undefined);
          else {
            const n = parseFloat(t.replace(/[^0-9.\-]/g, ''));
            if (!isNaN(n)) onChange(n);
          }
        }}
        {...rest}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- Textarea */

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> {
  value: string | undefined | null;
  onChange: (value: string) => void;
  bare?: boolean;
  /** grow with content */
  autoGrow?: boolean;
  minRows?: number;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { value, onChange, bare, autoGrow, minRows = 2, className, style, ...rest },
  ref,
) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!autoGrow || !el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value, autoGrow]);
  useEffect(() => {
    const el = inner.current;
    if (!autoGrow || !el || typeof ResizeObserver === 'undefined') return;
    let lastW = el.clientWidth;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === lastW) return;
      lastW = el.clientWidth;
      // defer: resizing inside the observer callback triggers "ResizeObserver loop" warnings
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight + 2}px`;
      });
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [autoGrow]);
  return (
    <textarea
      ref={(el) => {
        inner.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      }}
      className={['textarea', bare && 'bare', className].filter(Boolean).join(' ')}
      value={value ?? ''}
      rows={minRows}
      style={{ ...(autoGrow ? { resize: 'none', overflow: 'hidden' } : {}), ...style }}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  );
});

/* ---------------------------------------------------------------- Select */

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value' | 'size'> {
  value: string | undefined | null;
  onChange: (value: string) => void;
  options: (Option | string)[];
  /** label for the empty option; omit to hide the empty option */
  placeholder?: string;
  bare?: boolean;
  size?: 'sm' | 'md';
}

export function Select({ value, onChange, options, placeholder, bare, size, className, ...rest }: SelectProps) {
  const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const known = value == null || value === '' || opts.some((o) => o.value === value);
  return (
    <select
      className={['select', bare && 'bare', size === 'sm' && 'sm', className].filter(Boolean).join(' ')}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    >
      {placeholder != null && <option value="">{placeholder}</option>}
      {!known && <option value={value!}>{value}</option>}
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* ---------------------------------------------------------------- Combo (free text + suggestions) */

export interface ComboProps extends Omit<InputProps, 'list'> {
  suggestions: string[];
}

let comboCounter = 0;
/** Text input with a dropdown of suggestions (native datalist) – free text allowed. */
export function Combo({ suggestions, ...rest }: ComboProps) {
  const [id] = useState(() => `combo-${++comboCounter}`);
  return (
    <>
      <Input {...rest} list={id} />
      <datalist id={id}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}

/* ---------------------------------------------------------------- Checkbox / Switch */

export function Checkbox({ checked, onChange, label, disabled, title }: { checked: boolean | undefined; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean; title?: string }) {
  return (
    <label className="checkbox" title={title} onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label != null && <span>{label}</span>}
    </label>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean | undefined; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
      {label != null && <span>{label}</span>}
    </label>
  );
}

/* ---------------------------------------------------------------- Date / Time */

export function DateInput({ value, onChange, bare, size, className, ...rest }: { value?: string; onChange: (v: string | undefined) => void; bare?: boolean; size?: 'sm' | 'md'; style?: CSSProperties; disabled?: boolean; className?: string; title?: string }) {
  return (
    <input
      type="date"
      className={['input', bare && 'bare', size === 'sm' && 'sm', className].filter(Boolean).join(' ')}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      {...rest}
    />
  );
}

export function TimeInput({ value, onChange, bare, size, className, ...rest }: { value?: string; onChange: (v: string | undefined) => void; bare?: boolean; size?: 'sm' | 'md'; style?: CSSProperties; disabled?: boolean; className?: string; title?: string }) {
  return (
    <input
      type="time"
      className={['input', bare && 'bare', size === 'sm' && 'sm', className].filter(Boolean).join(' ')}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      {...rest}
    />
  );
}

/* ---------------------------------------------------------------- Field / FormGrid */

export function Field({ label, hint, children, span, className, style }: { label?: ReactNode; hint?: ReactNode; children: ReactNode; span?: 2 | 'all'; className?: string; style?: CSSProperties }) {
  return (
    <div className={['field', span === 2 && 'span-2', span === 'all' && 'span-all', className].filter(Boolean).join(' ')} style={style}>
      {label != null && <label>{label}</label>}
      {children}
      {hint != null && <span className="hint">{hint}</span>}
    </div>
  );
}

export function FormGrid({ children, min = 200, style }: { children: ReactNode; min?: number; style?: CSSProperties }) {
  return (
    <div className="form-grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, ...style }}>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- SearchInput */

export function SearchInput({ value, onChange, placeholder = 'Search…', width = 220, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; width?: number | string; autoFocus?: boolean }) {
  return (
    <div className="search" style={{ width }}>
      <Search />
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onChange('');
        }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          style={{ position: 'absolute', right: 6, border: 0, background: 'none', color: 'var(--text-3)', cursor: 'pointer', display: 'flex' }}
          aria-label="Clear search"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- ColorPicker */

export function ColorPicker({ value, onChange, swatches = SWATCHES, allowCustom = true, allowNone = false }: { value?: string; onChange: (v: string | undefined) => void; swatches?: string[]; allowCustom?: boolean; allowNone?: boolean }) {
  return (
    <div className="swatches">
      {allowNone && (
        <button
          type="button"
          className={`swatch ${!value ? 'on' : ''}`}
          title="None"
          onClick={() => onChange(undefined)}
          style={{ background: 'repeating-linear-gradient(45deg, var(--bg-elev) 0 3px, var(--border-strong) 3px 5px)' }}
        />
      )}
      {swatches.map((c) => (
        <button key={c} type="button" className={`swatch ${value?.toLowerCase() === c.toLowerCase() ? 'on' : ''}`} style={{ background: c }} onClick={() => onChange(c)} title={c} />
      ))}
      {allowCustom && (
        <label className="swatch" title="Custom colour" style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)', position: 'relative', overflow: 'hidden' }}>
          <input type="color" value={value ?? '#7c5cff'} onChange={(e) => onChange(e.target.value)} style={{ opacity: 0, position: 'absolute', inset: 0, cursor: 'pointer' }} />
        </label>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- MultiSelect (chips) */

export function MultiSelect({ value, onChange, options, placeholder = 'Add…', size }: { value: string[]; onChange: (v: string[]) => void; options: Option[]; placeholder?: string; size?: 'sm' | 'md' }) {
  const remaining = options.filter((o) => !value.includes(o.value));
  return (
    <div className="row wrap" style={{ gap: 4, minHeight: 30, alignItems: 'center' }}>
      {value.map((v) => {
        const o = options.find((x) => x.value === v);
        return (
          <span key={v} className="chip">
            {o?.color && <span className="color-dot" style={{ background: o.color }} />}
            {o?.label ?? v}
            <button type="button" aria-label="Remove" onClick={() => onChange(value.filter((x) => x !== v))}>
              <X size={12} />
            </button>
          </span>
        );
      })}
      {remaining.length > 0 && (
        <select
          className={['select', 'bare', size === 'sm' ? 'sm' : ''].join(' ')}
          value=""
          style={{ width: 'auto', minWidth: 90, color: 'var(--text-3)' }}
          onChange={(e) => {
            if (e.target.value) onChange([...value, e.target.value]);
          }}
        >
          <option value="">{placeholder}</option>
          {remaining.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
