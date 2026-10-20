/* UI state shared by the screenplay editor, toolbar, navigator and inspector. */
import { create } from 'zustand';
import type { EditorView } from 'prosemirror-view';
import type { ElementType } from '@/types';
import type { SmartState } from './editor/smartType';
import type { PageInfo } from './editor/pageview';
import { readLS, writeLS } from '@/store/app';

export type ScriptTab = 'script' | 'titlepage' | 'cards' | 'mind';

interface ScriptUIState {
  view: EditorView | null;
  element: ElementType;
  /** scene containing the cursor */
  sceneId: string | null;
  /** page containing the cursor (1-based) */
  page: number;
  pageInfo: PageInfo | null;
  smart: SmartState | null;
  hasSelection: boolean;
  /** tags under the cursor / selection */
  cursorTags: { cat: string; id: string }[];
  cursorNote: string | null;
  findOpen: boolean;
  replaceOpen: boolean;
  tab: ScriptTab;
  showNavigator: boolean;
  showInspector: boolean;
  showTags: boolean;
  focusMode: boolean;
}

export const useScriptUI = create<ScriptUIState>(() => ({
  view: null,
  element: 'action',
  sceneId: null,
  page: 1,
  pageInfo: null,
  smart: null,
  hasSelection: false,
  cursorTags: [],
  cursorNote: null,
  findOpen: false,
  replaceOpen: false,
  tab: 'script',
  showNavigator: readLS('prepro.script.nav', true),
  showInspector: readLS('prepro.script.inspector', true),
  showTags: readLS('prepro.script.tags', true),
  focusMode: false,
}));

export function setScriptUIPref(key: 'showNavigator' | 'showInspector' | 'showTags', value: boolean) {
  const lsKey = { showNavigator: 'prepro.script.nav', showInspector: 'prepro.script.inspector', showTags: 'prepro.script.tags' }[key];
  writeLS(lsKey, value);
  useScriptUI.setState({ [key]: value } as Partial<ScriptUIState>);
}
