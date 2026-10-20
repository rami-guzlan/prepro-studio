/* Small shared React pieces for the Post-Production tabs. */
import { useMemo, type ReactNode } from 'react';
import type { Option } from '@/lib/constants';
import { optionColor } from '@/lib/constants';
import { useScriptModel } from '@/derived/script';
import { useProject } from '@/store/project';
import { truncate } from '@/lib/text';
import { DataTable, Select, type DataTableProps } from '@/ui';

/** Select whose text and background are tinted with the option colour. */
export function StatusSelect({ value, options, onChange }: { value: string | undefined; options: Option[]; onChange: (v: string) => void }) {
  const color = optionColor(options, value) ?? 'var(--text-2)';
  return (
    <Select
      bare
      size="sm"
      className="post-status"
      value={value ?? options[0]?.value}
      options={options}
      onChange={onChange}
      style={{ color, background: `color-mix(in srgb, ${color} 13%, transparent)` }}
    />
  );
}

/** Scene picker (handles ids of deleted scenes). */
export function SceneSelect({ value, onChange, placeholder = '—' }: { value: string | undefined; onChange: (v: string | undefined) => void; placeholder?: string }) {
  const model = useScriptModel();
  const options = useMemo(() => {
    const opts: Option[] = model.scenes.map((s) => ({ value: s.id, label: truncate(`${s.number}. ${s.heading || 'Untitled scene'}`, 46) }));
    if (value && !model.sceneById.has(value)) opts.unshift({ value, label: '(deleted scene)' });
    return opts;
  }, [model, value]);
  return <Select bare size="sm" value={value ?? ''} options={options} placeholder={placeholder} onChange={(v) => onChange(v || undefined)} />;
}

/** Shot picker limited to the shots of a scene (all shots when no scene). */
export function ShotSelect({ value, sceneId, onChange }: { value: string | undefined; sceneId: string | undefined; onChange: (shotId: string | undefined, sceneId: string | undefined) => void }) {
  const shots = useProject((p) => p.shots);
  const model = useScriptModel();
  const options = useMemo(() => {
    const list = shots.filter((s) => !sceneId || s.sceneId === sceneId);
    const opts: Option[] = list.map((s) => {
      const sc = s.sceneId ? model.sceneById.get(s.sceneId) : undefined;
      const label = `${!sceneId && sc ? sc.number + '/' : ''}${s.number}${s.title ? ' – ' + s.title : s.description ? ' – ' + s.description : ''}`;
      return { value: s.id, label: truncate(label, 40) };
    });
    if (value && !shots.some((s) => s.id === value)) opts.unshift({ value, label: '(deleted shot)' });
    return opts;
  }, [shots, model, sceneId, value]);
  return (
    <Select
      bare
      size="sm"
      value={value ?? ''}
      options={options}
      placeholder={options.length ? '—' : 'No shots'}
      onChange={(v) => {
        const sh = shots.find((s) => s.id === v);
        onChange(v || undefined, sh?.sceneId);
      }}
    />
  );
}

/** DataTable with module styling and an optional minimum width (horizontal scroll). */
export function PostTable<T extends { id: string }>({ minWidth, ...props }: DataTableProps<T> & { minWidth?: number }) {
  return (
    <div className="post-table" style={minWidth ? ({ ['--post-min' as string]: `${minWidth}px` } as React.CSSProperties) : undefined}>
      <DataTable<T> {...props} />
    </div>
  );
}

export function Summary({ children }: { children: ReactNode }) {
  return <div className="post-summary">{children}</div>;
}
