/* Final Draft (.fdx) import & export. */
import type { ElementType, TitlePage } from '@/types';
import type { Para, Run } from './paragraphs';
import type { ParsedScript } from './fountain';
import { uid } from '@/lib/id';
import { escapeXml } from '@/lib/text';

const FDX_TO_TYPE: Record<string, ElementType> = {
  'scene heading': 'scene_heading',
  action: 'action',
  character: 'character',
  parenthetical: 'parenthetical',
  dialogue: 'dialogue',
  transition: 'transition',
  shot: 'shot',
  general: 'general',
  'cast list': 'general',
  'new act': 'general',
  'end of act': 'general',
  lyrics: 'dialogue',
};

const TYPE_TO_FDX: Record<ElementType, string> = {
  scene_heading: 'Scene Heading',
  action: 'Action',
  character: 'Character',
  parenthetical: 'Parenthetical',
  dialogue: 'Dialogue',
  transition: 'Transition',
  shot: 'Shot',
  general: 'General',
};

function textRuns(p: Element): Run[] {
  const runs: Run[] = [];
  for (const t of Array.from(p.children)) {
    if (t.tagName !== 'Text') continue;
    const style = (t.getAttribute('Style') ?? '').toLowerCase();
    const text = (t.textContent ?? '').replace(/\r/g, '');
    if (!text) continue;
    const r: Run = { text };
    if (style.includes('bold')) r.b = true;
    if (style.includes('italic')) r.i = true;
    if (style.includes('underline')) r.u = true;
    if (style.includes('allcaps')) r.text = r.text.toUpperCase();
    runs.push(r);
  }
  return runs;
}

function paraFrom(el: Element, dual: boolean): Para | null {
  const typeName = (el.getAttribute('Type') ?? 'Action').toLowerCase();
  if (/^outline/.test(typeName)) return null;
  const type = FDX_TO_TYPE[typeName] ?? 'action';
  let runs = textRuns(el);
  if (type === 'scene_heading' || type === 'character' || type === 'transition' || type === 'shot') runs = runs.map((r) => ({ ...r, text: r.text.toUpperCase() }));
  const p: Para = { type, text: runs.map((r) => r.text).join(''), runs };
  if (type === 'scene_heading') p.sid = uid('sc');
  if (dual && type === 'character') p.dual = true;
  const align = el.getAttribute('Alignment');
  if ((type === 'action' || type === 'general') && align && /center/i.test(align)) p.align = 'center';
  return p;
}

export function parseFdx(xml: string): ParsedScript {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Not a valid Final Draft (.fdx) file');
  const root = doc.documentElement;
  const content = Array.from(root.children).find((c) => c.tagName === 'Content');
  const paras: Para[] = [];
  const sceneNumbers: Record<string, string> = {};
  const synopses: Record<string, string> = {};
  if (content) {
    for (const el of Array.from(content.children)) {
      if (el.tagName !== 'Paragraph') continue;
      const dd = Array.from(el.children).find((c) => c.tagName === 'DualDialogue');
      if (dd) {
        let cues = 0;
        for (const inner of Array.from(dd.children)) {
          if (inner.tagName !== 'Paragraph') continue;
          if ((inner.getAttribute('Type') ?? '').toLowerCase() === 'character') cues++;
          const p = paraFrom(inner, cues === 2);
          if (p) paras.push(p);
        }
        continue;
      }
      const p = paraFrom(el, false);
      if (!p) continue;
      if (p.type === 'scene_heading') {
        const n = el.getAttribute('Number');
        if (n && p.sid) sceneNumbers[p.sid] = n;
        const sp = Array.from(el.children).find((c) => c.tagName === 'SceneProperties');
        const summary = sp ? Array.from(sp.children).find((c) => c.tagName === 'Summary') : null;
        const sumText = summary?.textContent?.trim();
        if (sumText && p.sid) synopses[p.sid] = sumText;
      }
      paras.push(p);
    }
  }

  // ---- title page (heuristic)
  const titlePage: Partial<TitlePage> = {};
  const tpEl = Array.from(root.children).find((c) => c.tagName === 'TitlePage');
  if (tpEl) {
    const tpContent = Array.from(tpEl.children).find((c) => c.tagName === 'Content');
    const items = Array.from(tpContent?.children ?? [])
      .filter((c) => c.tagName === 'Paragraph')
      .map((p) => ({ align: (p.getAttribute('Alignment') ?? 'Left').toLowerCase(), text: textRuns(p).map((r) => r.text).join('').trim() }));
    const centered = items.filter((x) => x.align === 'center' && x.text);
    const left = items.filter((x) => x.align === 'left' && x.text);
    const right = items.filter((x) => x.align === 'right' && x.text);
    if (centered[0]) titlePage.title = centered[0].text;
    const creditIdx = centered.findIndex((x, i) => i > 0 && /^(written|screenplay|teleplay|story)?\s*by\b|^by$/i.test(x.text));
    if (creditIdx > 0) {
      titlePage.credit = centered[creditIdx].text;
      const authors = centered.slice(creditIdx + 1).filter((x) => !/^based on/i.test(x.text));
      if (authors.length) titlePage.authors = authors.map((x) => x.text).join('\n');
      const src = centered.find((x) => /^based on/i.test(x.text));
      if (src) titlePage.source = src.text;
    } else if (centered[1]) titlePage.authors = centered.slice(1).map((x) => x.text).join('\n');
    if (left.length) titlePage.contact = left.map((x) => x.text).join('\n');
    if (right.length) titlePage.draftDate = right.map((x) => x.text).join('\n');
  }
  return { paras, titlePage, synopses, sceneNumbers };
}

/* ---------------------------------------------------------------- export */

function runsXml(runs: Run[]): string {
  if (!runs.length) return '<Text></Text>';
  return runs
    .map((r) => {
      const styles = [r.b && 'Bold', r.i && 'Italic', r.u && 'Underline'].filter(Boolean).join('+');
      return `<Text${styles ? ` Style="${styles}"` : ''}>${escapeXml(r.text)}</Text>`;
    })
    .join('');
}

function splitHardBreaks(p: Para): Run[][] {
  const lines: Run[][] = [[]];
  for (const r of p.runs.length ? p.runs : [{ text: p.text }]) {
    const parts = r.text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ ...r, text: part });
    });
  }
  return lines;
}

function paraXml(p: Para, number?: string, synopsis?: string): string {
  const type = TYPE_TO_FDX[p.type];
  const align = p.align === 'center' ? ' Alignment="Center"' : '';
  return splitHardBreaks(p)
    .map((runs, i) => {
      const num = i === 0 && number ? ` Number="${escapeXml(number)}"` : '';
      const props = i === 0 && p.type === 'scene_heading' && synopsis ? `<SceneProperties><Summary><Paragraph><Text>${escapeXml(synopsis)}</Text></Paragraph></Summary></SceneProperties>` : '';
      return `    <Paragraph Type="${type}"${num}${align}>${props}${runsXml(runs)}</Paragraph>`;
    })
    .join('\n');
}

export interface FdxExportOptions {
  titlePage?: Partial<TitlePage>;
  sceneNumbers?: Map<string, string>;
  synopses?: Record<string, string>;
}

export function toFdx(paras: Para[], opts: FdxExportOptions = {}): string {
  const body: string[] = [];
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    // dual dialogue: group = first speaker's block + second (dual) speaker's block
    if (p.type === 'character') {
      let j = i + 1;
      while (j < paras.length && (paras[j].type === 'parenthetical' || paras[j].type === 'dialogue')) j++;
      if (j < paras.length && paras[j].type === 'character' && paras[j].dual) {
        let k = j + 1;
        while (k < paras.length && (paras[k].type === 'parenthetical' || paras[k].type === 'dialogue')) k++;
        const inner = paras
          .slice(i, k)
          .map((x) => paraXml({ ...x, dual: false }).replace(/^ {4}/gm, '        '))
          .join('\n');
        body.push(`    <Paragraph>\n      <DualDialogue>\n${inner}\n      </DualDialogue>\n    </Paragraph>`);
        i = k - 1;
        continue;
      }
    }
    body.push(paraXml(p, p.sid ? opts.sceneNumbers?.get(p.sid) : undefined, p.sid ? opts.synopses?.[p.sid] : undefined));
  }

  const tp = opts.titlePage ?? {};
  const tpParas: string[] = [];
  const c = (text = '') => `      <Paragraph Alignment="Center"><Text>${escapeXml(text)}</Text></Paragraph>`;
  const l = (text = '') => `      <Paragraph Alignment="Left"><Text>${escapeXml(text)}</Text></Paragraph>`;
  for (let i = 0; i < 18; i++) tpParas.push(c());
  if (tp.title) tpParas.push(c(tp.title));
  tpParas.push(c(), c());
  if (tp.credit) tpParas.push(c(tp.credit));
  tpParas.push(c());
  for (const a of (tp.authors ?? '').split('\n')) if (a.trim()) tpParas.push(c(a));
  if (tp.source) {
    tpParas.push(c(), c());
    for (const s of tp.source.split('\n')) tpParas.push(c(s));
  }
  for (let i = 0; i < 16; i++) tpParas.push(l());
  for (const s of [tp.draft, tp.draftDate].filter(Boolean) as string[]) tpParas.push(l(s));
  for (const s of (tp.contact ?? '').split('\n')) if (s.trim()) tpParas.push(l(s));
  if (tp.copyright) tpParas.push(l(tp.copyright));

  return `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
${body.join('\n')}
  </Content>
  <TitlePage>
    <Content>
${tpParas.join('\n')}
    </Content>
  </TitlePage>
</FinalDraft>
`;
}
