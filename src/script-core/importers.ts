/* Script file import: Final Draft (.fdx), Fountain (.fountain), plain text. */
import type { SceneMeta, TitlePage } from '@/types';
import { parseFountain, type ParsedScript } from './fountain';
import { parseFdx } from './fdx';
import { parasToDoc } from './paragraphs';

export interface ImportedScript {
  doc: unknown;
  titlePage: Partial<TitlePage>;
  /** per-scene metadata found in the file (synopses, locked numbers) */
  scenes: Record<string, SceneMeta>;
  parsed: ParsedScript;
}

export function decodeText(bytes: Uint8Array): string {
  // UTF-8 with fallback to Windows-1252 for old text files
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

export function parseScriptText(name: string, text: string): ParsedScript {
  const lower = name.toLowerCase();
  if (lower.endsWith('.fdx') || /^\s*<\?xml[\s\S]{0,200}<FinalDraft/i.test(text)) return parseFdx(text);
  return parseFountain(text, { joinLines: lower.endsWith('.txt') });
}

export function importScriptFile(name: string, bytes: Uint8Array): ImportedScript {
  const text = decodeText(bytes);
  const parsed = parseScriptText(name, text);
  if (!parsed.paras.length) throw new Error('No screenplay content found in this file');
  const scenes: Record<string, SceneMeta> = {};
  for (const [sid, synopsis] of Object.entries(parsed.synopses)) scenes[sid] = { ...(scenes[sid] ?? { id: sid }), synopsis };
  for (const [sid, number] of Object.entries(parsed.sceneNumbers)) scenes[sid] = { ...(scenes[sid] ?? { id: sid }), number };
  return { doc: parasToDoc(parsed.paras), titlePage: parsed.titlePage, scenes, parsed };
}
