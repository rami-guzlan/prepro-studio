/* ProseMirror schema for screenplays: one textblock per element. */
import { Schema, type NodeSpec, type MarkSpec, type Node as PMNode } from 'prosemirror-model';
import type { ElementType } from '@/types';

export const ELEMENT_TYPES: ElementType[] = [
  'scene_heading',
  'action',
  'character',
  'parenthetical',
  'dialogue',
  'transition',
  'shot',
  'general',
];

export const ELEMENT_LABELS: Record<ElementType, string> = {
  scene_heading: 'Scene Heading',
  action: 'Action',
  character: 'Character',
  parenthetical: 'Parenthetical',
  dialogue: 'Dialogue',
  transition: 'Transition',
  shot: 'Shot',
  general: 'General',
};

/** Ctrl+<digit> shortcuts (Final Draft defaults). */
export const ELEMENT_SHORTCUTS: Record<ElementType, string> = {
  scene_heading: '1',
  action: '2',
  character: '3',
  parenthetical: '4',
  dialogue: '5',
  transition: '6',
  shot: '7',
  general: '0',
};

export const UPPERCASE_ELEMENTS = new Set<ElementType>(['scene_heading', 'character', 'transition', 'shot']);

function element(type: ElementType, attrs: NodeSpec['attrs'] = {}): NodeSpec {
  return {
    group: 'block',
    content: 'inline*',
    attrs,
    parseDOM: [
      {
        tag: `p[data-el="${type}"]`,
        getAttrs(dom) {
          const el = dom as HTMLElement;
          const out: Record<string, unknown> = {};
          if (attrs && 'sid' in attrs) out.sid = el.getAttribute('data-sid') || null;
          if (attrs && 'dual' in attrs) out.dual = el.getAttribute('data-dual') === 'true';
          if (attrs && 'align' in attrs) out.align = el.getAttribute('data-align') || null;
          return out;
        },
      },
    ],
    toDOM(node: PMNode) {
      const a: Record<string, string> = { 'data-el': type, class: `el el-${type}` };
      if (node.attrs.sid) a['data-sid'] = node.attrs.sid;
      if (node.attrs.dual) a['data-dual'] = 'true';
      if (node.attrs.align) a['data-align'] = node.attrs.align;
      return ['p', a, 0];
    },
  };
}

const nodes: Record<string, NodeSpec> = {
  doc: { content: 'block+' },
  scene_heading: element('scene_heading', { sid: { default: null } }),
  action: {
    ...element('action', { align: { default: null } }),
    parseDOM: [
      ...(element('action', { align: { default: null } }).parseDOM ?? []),
      // generic paragraphs pasted from elsewhere become Action
      { tag: 'p', priority: 10 },
      { tag: 'div', priority: 5 },
      { tag: 'li', priority: 5 },
      { tag: 'h1', priority: 5 },
      { tag: 'h2', priority: 5 },
      { tag: 'h3', priority: 5 },
    ],
  },
  character: element('character', { dual: { default: false } }),
  parenthetical: element('parenthetical'),
  dialogue: element('dialogue'),
  transition: element('transition'),
  shot: element('shot'),
  general: element('general', { align: { default: null } }),
  text: { group: 'inline' },
  hard_break: {
    inline: true,
    group: 'inline',
    selectable: false,
    parseDOM: [{ tag: 'br' }],
    toDOM: () => ['br'],
  },
};

const marks: Record<string, MarkSpec> = {
  bold: {
    parseDOM: [{ tag: 'strong' }, { tag: 'b', getAttrs: (n) => (n as HTMLElement).style.fontWeight !== 'normal' && null }, { style: 'font-weight=bold' }],
    toDOM: () => ['strong', 0],
  },
  italic: {
    parseDOM: [{ tag: 'em' }, { tag: 'i' }, { style: 'font-style=italic' }],
    toDOM: () => ['em', 0],
  },
  underline: {
    parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }],
    toDOM: () => ['u', 0],
  },
  /** breakdown tag: cat = BreakdownCategory, id = element id (or character id for 'cast') */
  tag: {
    attrs: { cat: {}, id: {} },
    inclusive: false,
    excludes: '',
    parseDOM: [
      {
        tag: 'span.tag',
        getAttrs: (n) => ({ cat: (n as HTMLElement).getAttribute('data-cat'), id: (n as HTMLElement).getAttribute('data-id') }),
      },
    ],
    toDOM: (m) => ['span', { class: 'tag', 'data-cat': m.attrs.cat, 'data-id': m.attrs.id }, 0],
  },
  /** script note anchor: id = ScriptNote.id */
  note: {
    attrs: { id: {} },
    inclusive: false,
    excludes: '',
    parseDOM: [{ tag: 'span.note-mark', getAttrs: (n) => ({ id: (n as HTMLElement).getAttribute('data-note') }) }],
    toDOM: (m) => ['span', { class: 'note-mark', 'data-note': m.attrs.id }, 0],
  },
};

export const screenplaySchema = new Schema({ nodes, marks });
