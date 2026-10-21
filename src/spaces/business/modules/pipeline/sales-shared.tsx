/* Small helpers shared by the sales screens (pipeline, enablement, testimonials,
   portfolio): external links, clipboard, video thumbnails, stars, tag input and
   the linked production / Marketing Space picker. */
import '../../sales.css';
import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import type { Option } from '@/lib/constants';
import { backend } from '@/backend';
import { useProjectList } from '@/spaces/ui';
import { Input, Select, toast } from '@/ui';
import { useMarketingSpaces } from '../../ui';
import type { BusinessData, Testimonial } from '../../types';

/** Add https:// to bare domains. */
export function normalizeUrl(url: string): string {
  const u = url.trim();
  if (!u) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return u;
  return `https://${u}`;
}

/** Open a web link in the system browser (desktop) or a new tab (web). */
export function openUrl(url: string | undefined) {
  if (!url?.trim()) return;
  const u = normalizeUrl(url);
  if (backend.openExternal) backend.openExternal(u);
  else window.open(u, '_blank', 'noopener');
}

export async function copyText(text: string, what = 'Copied to the clipboard') {
  try {
    await navigator.clipboard.writeText(text);
    toast(what);
  } catch {
    toast('Could not copy — select the text and press Ctrl+C', 'error');
  }
}

/** “Quote” — Author, Role, Company */
export function quoteText(t: Pick<Testimonial, 'quote' | 'author' | 'role' | 'company'>): string {
  const who = [t.author, t.role, t.company].filter(Boolean).join(', ');
  return `“${t.quote.trim()}”${who ? `\n— ${who}` : ''}`;
}

/** YouTube video id from a watch / share / shorts / embed URL. */
export function youTubeId(url: string | undefined): string | undefined {
  if (!url) return;
  const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/i);
  return m?.[1];
}

/** Thumbnail URL for a video link when it can be derived (YouTube). */
export function videoThumb(url: string | undefined): string | undefined {
  const id = youTubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : undefined;
}

export function Stars({ value, onChange, size = 14 }: { value?: number; onChange?: (v: number | undefined) => void; size?: number }) {
  const v = Math.max(0, Math.min(5, Math.round(value ?? 0)));
  if (!onChange) {
    if (!v) return null;
    return (
      <span className="sl-stars" aria-label={`${v} out of 5 stars`} title={`${v} / 5`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} size={size} className={i <= v ? 'on' : ''} />
        ))}
      </span>
    );
  }
  return (
    <span className="sl-stars edit" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={v === i}
          aria-label={`${i} star${i > 1 ? 's' : ''}`}
          className={i <= v ? 'on' : ''}
          onClick={() => onChange(v === i ? undefined : i)}
        >
          <Star size={size + 2} />
        </button>
      ))}
    </span>
  );
}

const splitTags = (s: string) => [...new Set(s.split(',').map((t) => t.trim()).filter(Boolean))];

/** Comma-separated tags, committed on blur / Enter. */
export function TagsInput({ value, onChange, placeholder = 'Comma-separated, e.g. brand film, coffee' }: { value?: string[]; onChange: (tags: string[] | undefined) => void; placeholder?: string }) {
  const joined = (value ?? []).join(', ');
  const [draft, setDraft] = useState(joined);
  useEffect(() => setDraft(joined), [joined]);
  const commit = () => {
    const tags = splitTags(draft);
    if (tags.join(', ') !== joined) onChange(tags.length ? tags : undefined);
    else setDraft(joined);
  };
  return <Input value={draft} placeholder={placeholder} onChange={setDraft} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />;
}

export function Tags({ tags, onClick, active }: { tags?: string[]; onClick?: (t: string) => void; active?: string }) {
  if (!tags?.length) return null;
  return (
    <span className="sl-tags">
      {tags.map((t) =>
        onClick ? (
          <button key={t} type="button" className={`sl-tagchip ${active === t ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); onClick(t); }}>
            #{t}
          </button>
        ) : (
          <span key={t} className="sl-tagchip">
            #{t}
          </span>
        ),
      )}
    </span>
  );
}

/** Production + Marketing Space options for "linked" pickers. */
export function useLinkOptions(): { projects: Option[]; spaces: Option[] } {
  const projects = useProjectList();
  const spaces = useMarketingSpaces();
  return {
    projects: projects.filter((p) => !p.demo).map((p) => ({ value: p.id, label: `🎬 ${p.title}` })),
    spaces: spaces.filter((s) => !s.demo).map((s) => ({ value: s.id, label: `📣 ${s.title}` })),
  };
}

export function bizProjectOptions(b: BusinessData, includeId?: string): Option[] {
  return b.projects.filter((p) => p.status !== 'cancelled' || p.id === includeId).map((p) => ({ value: p.id, label: p.name || 'Untitled project' }));
}

/** Select that keeps an id even when the option list doesn't have it (deleted / not loaded). */
export function LinkSelect({ value, options, onChange, placeholder = 'None', missing = '(not found)' }: { value?: string; options: Option[]; onChange: (v: string | undefined) => void; placeholder?: string; missing?: string }) {
  const opts = value && !options.some((o) => o.value === value) ? [...options, { value, label: missing }] : options;
  return <Select value={value ?? ''} placeholder={placeholder} options={opts} onChange={(v) => onChange(v || undefined)} />;
}

/** Unique sorted tags of a list. */
export function allTags(items: { tags?: string[] }[]): string[] {
  return [...new Set(items.flatMap((x) => x.tags ?? []))].sort((a, z) => a.localeCompare(z));
}

export const yearOf = (iso?: string) => (iso && /^\d{4}/.test(iso) ? iso.slice(0, 4) : '');
