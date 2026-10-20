/* Fountain (https://fountain.io) import & export. Also used to parse plain
   text screenplays and pasted text. */
import type { TitlePage } from '@/types';
import type { Para, Run } from './paragraphs';
import { uid } from '@/lib/id';
import { isSceneHeadingText } from './heading';

export interface ParsedScript {
  paras: Para[];
  titlePage: Partial<TitlePage>;
  /** scene id -> synopsis (from '=' lines) */
  synopses: Record<string, string>;
  /** scene id -> locked scene number (from #12A#) */
  sceneNumbers: Record<string, string>;
}

/* ---------------------------------------------------------------- emphasis */

interface Style {
  b?: boolean;
  i?: boolean;
  u?: boolean;
}

const MARKERS: { m: string; style: keyof Style | 'bi' }[] = [
  { m: '***', style: 'bi' },
  { m: '**', style: 'b' },
  { m: '*', style: 'i' },
  { m: '_', style: 'u' },
];

/** Parse Fountain emphasis (*italic*, **bold**, ***both***, _underline_) into runs. */
export function parseEmphasis(src: string, base: Style = {}): Run[] {
  const s = src.replace(/\\\*/g, '\u0001').replace(/\\_/g, '\u0002');
  const out: Run[] = [];
  const unesc = (t: string) => t.replace(/\u0001/g, '*').replace(/\u0002/g, '_');
  const push = (text: string, st: Style) => {
    if (!text) return;
    const r: Run = { text: unesc(text) };
    if (st.b) r.b = true;
    if (st.i) r.i = true;
    if (st.u) r.u = true;
    out.push(r);
  };
  let i = 0;
  let plainStart = 0;
  while (i < s.length) {
    let matched = false;
    for (const { m, style } of MARKERS) {
      if (!s.startsWith(m, i)) continue;
      // closing marker on the same line, non-empty content not starting with space
      const close = s.indexOf(m, i + m.length);
      const nl = s.indexOf('\n', i);
      if (close < 0 || (nl >= 0 && nl < close) || close === i + m.length || s[i + m.length] === ' ') continue;
      push(s.slice(plainStart, i), base);
      const inner = s.slice(i + m.length, close);
      const st: Style = { ...base };
      if (style === 'bi') {
        st.b = true;
        st.i = true;
      } else st[style] = true;
      for (const r of parseEmphasis(inner.replace(/\u0001/g, '\\*').replace(/\u0002/g, '\\_'), st)) out.push(r);
      i = close + m.length;
      plainStart = i;
      matched = true;
      break;
    }
    if (!matched) i++;
  }
  push(s.slice(plainStart), base);
  return mergeRuns(out);
}

function mergeRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (last && !!last.b === !!r.b && !!last.i === !!r.i && !!last.u === !!r.u && !last.tags && !r.tags) last.text += r.text;
    else out.push({ ...r });
  }
  return out;
}

function mkPara(type: Para['type'], text: string, extra: Partial<Para> = {}): Para {
  const runs = parseEmphasis(text);
  return { type, text: runs.map((r) => r.text).join(''), runs, ...extra };
}

/* ---------------------------------------------------------------- parse */

const TITLE_KEYS: Record<string, keyof TitlePage> = {
  title: 'title',
  credit: 'credit',
  author: 'authors',
  authors: 'authors',
  source: 'source',
  'draft date': 'draftDate',
  date: 'draftDate',
  draft: 'draft',
  revision: 'draft',
  contact: 'contact',
  copyright: 'copyright',
  notes: 'notes',
};

function isUpperLine(t: string): boolean {
  const core = t.replace(/\([^)]*\)/g, '').replace(/\^$/, '').trim();
  return /[A-Z]/.test(core) && core === core.toUpperCase() && !/[a-z]/.test(core);
}

const KNOWN_TRANSITIONS = /^(FADE (IN|OUT|TO BLACK)|CUT TO BLACK|SMASH CUT|MATCH CUT|JUMP CUT|DISSOLVE|INTERCUT|TIME CUT|BACK TO)/;

export interface FountainOptions {
  /** join hard-wrapped lines with spaces (plain-text / PDF text imports) */
  joinLines?: boolean;
}

export function parseFountain(input: string, opts: FountainOptions = {}): ParsedScript {
  let text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
  text = text.replace(/\/\*[\s\S]*?\*\//g, ''); // boneyard
  text = text.replace(/\[\[[\s\S]*?\]\]/g, ''); // notes

  // ---- title page
  const titlePage: Partial<TitlePage> = {};
  const lines = text.split('\n');
  let start = 0;
  if (/^\s*(title|credit|author|authors|source|draft date|date|contact|copyright|notes|revision|draft)\s*:/i.test(lines[0] ?? '')) {
    let key: keyof TitlePage | null = null;
    let i = 0;
    for (; i < lines.length; i++) {
      const ln = lines[i];
      if (!ln.trim()) break;
      const m = /^\s*([A-Za-z ]+?)\s*:\s*(.*)$/.exec(ln);
      if (m && !/^\s{2,}/.test(ln) && TITLE_KEYS[m[1].toLowerCase()] !== undefined) {
        key = TITLE_KEYS[m[1].toLowerCase()];
        const v = m[2].trim();
        if (v) titlePage[key] = (titlePage[key] ? titlePage[key] + '\n' : '') + v.replace(/^_+|_+$/g, '').replace(/\*/g, '');
      } else if (m && !/^\s{2,}/.test(ln)) {
        key = null; // unknown key
      } else if (key) {
        titlePage[key] = (titlePage[key] ? titlePage[key] + '\n' : '') + ln.trim().replace(/\*/g, '');
      }
    }
    start = i;
  }

  const paras: Para[] = [];
  const synopses: Record<string, string> = {};
  const sceneNumbers: Record<string, string> = {};
  let lastSceneId: string | null = null;
  type State = 'none' | 'action' | 'dialogue';
  let state: State = 'none';
  const join = opts.joinLines ? ' ' : '\n';

  const appendTo = (p: Para, more: string) => {
    const runs = parseEmphasis(more);
    if (p.runs.length) {
      const sep: Run = { text: join };
      p.runs.push(sep, ...runs);
    } else p.runs.push(...runs);
    p.text = p.runs.map((r) => r.text).join('');
  };

  const isBlank = (i: number) => i >= lines.length || !lines[i].trim();

  for (let i = start; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    if (!t) {
      state = 'none';
      continue;
    }
    if (state === 'dialogue') {
      const last = paras[paras.length - 1];
      if (/^\(.*\)?$/.test(t) && t.startsWith('(')) {
        paras.push(mkPara('parenthetical', t));
      } else if (last && last.type === 'dialogue') {
        appendTo(last, t);
      } else if (last && last.type === 'parenthetical' && !last.text.trim().endsWith(')')) {
        appendTo(last, t); // multi-line parenthetical
      } else {
        paras.push(mkPara('dialogue', t));
      }
      continue;
    }
    if (state === 'action') {
      const last = paras[paras.length - 1];
      if (last && (last.type === 'action' || last.type === 'general')) {
        appendTo(last, t.replace(/^!/, ''));
        continue;
      }
    }
    // ---- new block
    if (/^={3,}$/.test(t)) continue; // page break
    if (/^#+/.test(t)) continue; // section
    if (/^=(?!=)/.test(t)) {
      if (lastSceneId) synopses[lastSceneId] = (synopses[lastSceneId] ? synopses[lastSceneId] + ' ' : '') + t.replace(/^=\s*/, '');
      continue;
    }
    if (/^\.(?!\.)/.test(t) || isSceneHeadingText(t)) {
      let h = t.replace(/^\./, '').trim();
      const sid = uid('sc');
      const num = /\s*#([^#]+)#\s*$/.exec(h);
      if (num) {
        sceneNumbers[sid] = num[1].trim();
        h = h.slice(0, num.index).trim();
      }
      paras.push(mkPara('scene_heading', h.toUpperCase(), { sid }));
      lastSceneId = sid;
      state = 'none';
      continue;
    }
    if (t.startsWith('!')) {
      paras.push(mkPara('action', t.slice(1)));
      state = 'action';
      continue;
    }
    if (t.startsWith('>') && t.endsWith('<')) {
      paras.push(mkPara('action', t.slice(1, -1).trim(), { align: 'center' }));
      state = 'none';
      continue;
    }
    if (t.startsWith('>')) {
      paras.push(mkPara('transition', t.slice(1).trim().toUpperCase()));
      state = 'none';
      continue;
    }
    if (t.startsWith('~')) {
      paras.push(mkPara('action', t.slice(1).trim()));
      paras[paras.length - 1].runs.forEach((r) => (r.i = true));
      state = 'action';
      continue;
    }
    const upper = isUpperLine(t);
    if (upper && (/TO:$/.test(t) || KNOWN_TRANSITIONS.test(t)) && isBlank(i + 1) && !t.startsWith('@')) {
      paras.push(mkPara('transition', t));
      state = 'none';
      continue;
    }
    if ((t.startsWith('@') || upper) && !isBlank(i + 1) && t.length < 60) {
      let cue = t.replace(/^@/, '');
      let dual = false;
      if (/\^\s*$/.test(cue)) {
        dual = true;
        cue = cue.replace(/\s*\^\s*$/, '');
      }
      paras.push(mkPara('character', cue.toUpperCase(), dual ? { dual: true } : {}));
      state = 'dialogue';
      continue;
    }
    paras.push(mkPara('action', t));
    state = 'action';
  }

  return { paras, titlePage, synopses, sceneNumbers };
}

/* ---------------------------------------------------------------- export */

function runsToFountain(runs: Run[]): string {
  return runs
    .map((r) => {
      let t = r.text.replace(/\*/g, '\\*').replace(/_/g, '\\_');
      if (!t.trim()) return t;
      const lead = t.match(/^\s*/)![0];
      const trail = t.match(/\s*$/)![0];
      t = t.trim();
      if (r.b && r.i) t = `***${t}***`;
      else if (r.b) t = `**${t}**`;
      else if (r.i) t = `*${t}*`;
      if (r.u) t = `_${t}_`;
      return lead + t + trail;
    })
    .join('');
}

export interface FountainExportOptions {
  titlePage?: Partial<TitlePage>;
  /** scene id -> scene number to append as #n# */
  sceneNumbers?: Map<string, string> | Record<string, string>;
  /** scene id -> synopsis written as '= synopsis' */
  synopses?: Record<string, string>;
}

export function toFountain(paras: Para[], opts: FountainExportOptions = {}): string {
  const out: string[] = [];
  const tp = opts.titlePage;
  if (tp && (tp.title || tp.authors)) {
    const kv = (k: string, v?: string) => {
      if (!v?.trim()) return;
      const ls = v.split('\n');
      if (ls.length === 1) out.push(`${k}: ${ls[0]}`);
      else {
        out.push(`${k}:`);
        for (const l of ls) out.push(`    ${l}`);
      }
    };
    kv('Title', tp.title);
    kv('Credit', tp.credit);
    kv('Author', tp.authors);
    kv('Source', tp.source);
    kv('Draft', tp.draft);
    kv('Draft date', tp.draftDate);
    kv('Contact', tp.contact);
    kv('Copyright', tp.copyright);
    kv('Notes', tp.notes);
    out.push('');
  }
  const num = (sid?: string) => {
    if (!sid || !opts.sceneNumbers) return undefined;
    return opts.sceneNumbers instanceof Map ? opts.sceneNumbers.get(sid) : opts.sceneNumbers[sid];
  };
  let prev: Para['type'] | null = null;
  for (const p of paras) {
    const tight = (prev === 'character' || prev === 'parenthetical' || prev === 'dialogue') && (p.type === 'parenthetical' || p.type === 'dialogue');
    if (prev !== null && !tight) out.push('');
    const body = runsToFountain(p.runs.length ? p.runs : [{ text: p.text }]);
    switch (p.type) {
      case 'scene_heading': {
        const n = num(p.sid);
        const h = body.trim().toUpperCase();
        out.push(`${isSceneHeadingText(h) ? '' : '.'}${h}${n ? ` #${n}#` : ''}`);
        const syn = p.sid ? opts.synopses?.[p.sid] : undefined;
        if (syn) out.push('', `= ${syn.replace(/\n/g, ' ')}`);
        break;
      }
      case 'character': {
        const c = body.trim();
        out.push(`${isUpperLine(c) ? '' : '@'}${c}${p.dual ? ' ^' : ''}`);
        break;
      }
      case 'parenthetical': {
        const c = body.trim();
        out.push(c.startsWith('(') ? c : `(${c})`);
        break;
      }
      case 'dialogue':
        out.push(body);
        break;
      case 'transition': {
        const c = body.trim().toUpperCase();
        out.push(/TO:$/.test(c) ? c : `> ${c}`);
        break;
      }
      case 'action':
      case 'general':
      case 'shot':
      default: {
        if (p.align === 'center') {
          out.push(`> ${body.trim()} <`);
          break;
        }
        const first = body.split('\n')[0].trim();
        const risky = isUpperLine(first) || isSceneHeadingText(first) || /TO:$/.test(first) || first.startsWith('>') || first.startsWith('.') || first.startsWith('@') || first.startsWith('=') || first.startsWith('#');
        out.push(risky ? `!${body}` : body);
      }
    }
    prev = p.type;
  }
  return out.join('\n') + '\n';
}
