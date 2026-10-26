/* A small, safe Markdown renderer for the agent guide, briefs and imported docs:
   headings, paragraphs, lists (incl. task lists), tables, code blocks, quotes, rules
   and inline bold / italic / code / links / images. Builds React elements (no HTML
   injection); images are shown as their path, links are not navigable. */
import { memo, useMemo, type ReactNode } from 'react';
import { Image as ImageIcon } from 'lucide-react';

type Block =
  | { t: 'h'; level: number; text: string }
  | { t: 'p'; text: string }
  | { t: 'ul' | 'ol'; items: string[] }
  | { t: 'code'; lang: string; text: string }
  | { t: 'quote'; text: string }
  | { t: 'table'; head: string[]; rows: string[][] }
  | { t: 'hr' };

const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'));

export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = /^\s*(```|~~~)\s*([\w-]*)/.exec(line);
    if (fence) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) buf.push(lines[i++]);
      i++;
      out.push({ t: 'code', lang: fence[2], text: buf.join('\n') });
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      out.push({ t: 'h', level: h[1].length, text: h[2].replace(/\s+#+\s*$/, '') });
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push({ t: 'hr' });
      i++;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(splitRow(lines[i++]));
      out.push({ t: 'table', head, rows });
      continue;
    }
    if (/^\s*>/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push({ t: 'quote', text: buf.join(' ') });
      continue;
    }
    const li = /^\s*([-*+]|\d+[.)])\s+/.exec(line);
    if (li) {
      const ordered = /\d/.test(li[1]);
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (m) {
          items.push(m[2]);
          i++;
        } else if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) {
          items[items.length - 1] += ` ${lines[i].trim()}`;
          i++;
        } else break;
      }
      out.push({ t: ordered ? 'ol' : 'ul', items });
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*```|\s*~~~|\s*>|\s*([-*+]|\d+[.)])\s+)/.test(lines[i]) && !/^\s*\|.*\|\s*$/.test(lines[i])) buf.push(lines[i++].trim());
    if (!buf.length) {
      // a line no block rule accepted (e.g. a lone table row): show it as text
      buf.push(lines[i++].trim());
    }
    out.push({ t: 'p', text: buf.join(' ') });
  }
  return out;
}

/** Inline: `code`, **bold**, _italic_ / *italic*, ![alt](src), [text](url). */
export function inline(text: string, key = 'i'): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(!\[[^\]]*\]\([^)]*\))|(\[[^\]]+\]\([^)]*\))|(\b_[^_]+_\b)|(\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const s = m[0];
    const k = `${key}-${n++}`;
    if (m[1]) nodes.push(<code key={k}>{s.slice(1, -1)}</code>);
    else if (m[2]) nodes.push(<strong key={k}>{inline(s.slice(2, -2), k)}</strong>);
    else if (m[3]) {
      const mm = /^!\[([^\]]*)\]\(([^)]*)\)$/.exec(s)!;
      nodes.push(
        <span key={k} className="md-img" title={mm[2]}>
          <ImageIcon size={12} /> {mm[1] || mm[2]}
        </span>,
      );
    } else if (m[4]) {
      const mm = /^\[([^\]]+)\]\(([^)]*)\)$/.exec(s)!;
      nodes.push(
        <span key={k} className="md-link" title={mm[2]}>
          {inline(mm[1], k)}
        </span>,
      );
    } else nodes.push(<em key={k}>{inline(s.slice(1, -1), k)}</em>);
    last = m.index + s.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function Item({ text, k }: { text: string; k: string }) {
  const task = /^\[( |x|X)\]\s+(.*)$/.exec(text);
  if (task)
    return (
      <li className="md-task">
        <input type="checkbox" checked={task[1] !== ' '} readOnly tabIndex={-1} aria-hidden /> {inline(task[2], k)}
      </li>
    );
  return <li>{inline(text, k)}</li>;
}

export const Markdown = memo(function Markdown({ text, className, headingIds }: { text: string; className?: string; headingIds?: boolean }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <div className={['md', className].filter(Boolean).join(' ')}>
      {blocks.map((b, i) => {
        const k = `b${i}`;
        switch (b.t) {
          case 'h': {
            const Tag = `h${Math.min(6, b.level)}` as 'h1';
            return (
              <Tag key={k} id={headingIds ? `md-${b.text.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : undefined}>
                {inline(b.text, k)}
              </Tag>
            );
          }
          case 'p':
            return <p key={k}>{inline(b.text, k)}</p>;
          case 'ul':
          case 'ol': {
            const Tag = b.t;
            return (
              <Tag key={k}>
                {b.items.map((it, j) => (
                  <Item key={j} text={it} k={`${k}-${j}`} />
                ))}
              </Tag>
            );
          }
          case 'code':
            return (
              <pre key={k} className="md-code">
                <code>{b.text}</code>
              </pre>
            );
          case 'quote':
            return <blockquote key={k}>{inline(b.text, k)}</blockquote>;
          case 'table':
            return (
              <div key={k} className="md-table-wrap">
                <table className="md-table">
                  <thead>
                    <tr>
                      {b.head.map((h, j) => (
                        <th key={j}>{inline(h, `${k}h${j}`)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>
                        {b.head.map((_, c) => (
                          <td key={c}>{inline(r[c] ?? '', `${k}r${j}c${c}`)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'hr':
            return <hr key={k} />;
          default:
            return null;
        }
      })}
    </div>
  );
});
