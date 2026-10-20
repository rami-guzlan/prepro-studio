/* Search-or-create input used in breakdown category boxes:
   type to find an existing item, ↑/↓ + Enter to pick, or create a new one. */
import { useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { matchesQuery } from '@/lib/text';

export interface PickItem {
  id: string;
  label: string;
  sub?: string;
  color?: string;
}

export function AddPicker({
  items,
  onPick,
  onCreate,
  placeholder = 'Add…',
  taken,
  createHint = 'Create',
}: {
  items: PickItem[];
  onPick: (id: string) => void;
  onCreate?: (name: string) => void;
  placeholder?: string;
  /** uppercase names already present (creation is blocked for these) */
  taken?: Set<string>;
  createHint?: string;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const query = q.trim();
  const upper = query.toUpperCase();
  const matches = useMemo(() => items.filter((i) => matchesQuery(`${i.label} ${i.sub ?? ''}`, q)).slice(0, 8), [items, q]);
  const exact = items.some((i) => i.label.toUpperCase() === upper);
  const isTaken = !!query && !!taken?.has(upper);
  const canCreate = !!onCreate && !!query && !exact && !isTaken;
  const total = matches.length + (canCreate ? 1 : 0);

  const choose = (index: number) => {
    if (index < matches.length) {
      onPick(matches[index].id);
    } else if (canCreate) {
      onCreate!(query);
    } else return;
    setQ('');
    setHi(0);
  };

  return (
    <div className="breakdown-picker">
      <div className="breakdown-picker-input">
        <Plus size={13} />
        <input
          ref={inputRef}
          className="input sm bare"
          value={q}
          placeholder={placeholder}
          onChange={(e) => {
            setQ(e.target.value);
            setHi(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setHi((h) => (total ? (h + 1) % total : 0));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHi((h) => (total ? (h - 1 + total) % total : 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (!query && !open) return;
              // exact match first, otherwise highlighted row
              const ex = matches.findIndex((m) => m.label.toUpperCase() === upper);
              choose(ex >= 0 && hi === 0 ? ex : hi);
            } else if (e.key === 'Escape') {
              if (q) {
                e.stopPropagation();
                setQ('');
              } else inputRef.current?.blur();
            }
          }}
        />
      </div>
      {open && (total > 0 || isTaken) && (
        <div className="breakdown-picker-menu" onMouseDown={(e) => e.preventDefault()}>
          {matches.map((m, i) => (
            <button key={m.id} type="button" className={`breakdown-picker-item ${hi === i ? 'on' : ''}`} onMouseEnter={() => setHi(i)} onClick={() => choose(i)}>
              {m.color && <span className="color-dot" style={{ background: m.color, width: 8, height: 8 }} />}
              <span className="ellipsis">{m.label}</span>
              {m.sub && <span className="breakdown-picker-sub">{m.sub}</span>}
            </button>
          ))}
          {canCreate && (
            <button type="button" className={`breakdown-picker-item create ${hi === matches.length ? 'on' : ''}`} onMouseEnter={() => setHi(matches.length)} onClick={() => choose(matches.length)}>
              <Plus size={13} />
              <span className="ellipsis">
                {createHint} “{upper}”
              </span>
            </button>
          )}
          {isTaken && !canCreate && matches.length === 0 && <div className="breakdown-picker-note">Already in this scene</div>}
        </div>
      )}
    </div>
  );
}
