/* UI state of the Content module that outlives a screen: the New content and
   Repurpose dialogs (rendered by <ContentEditorHost/>, so they open from any
   space screen) and the order of pieces the editor steps through. */
import { create } from 'zustand';
import type { ID } from '@/types';
import type { ContentFormat, ContentStage } from '@/spaces/types';

export interface NewContentPreset {
  title?: string;
  stage?: ContentStage;
  format?: ContentFormat;
  pillarId?: ID;
  campaignId?: ID;
  owner?: string;
  channelIds?: ID[];
  /** first post date (YYYY-MM-DD) */
  date?: string;
  /** open the editor on this tab after creating */
  openTab?: 'brief' | 'write' | 'produce' | 'publish' | 'results';
}

interface DialogState {
  /** piece being repurposed */
  repurposeId: ID | null;
  /** New content dialog (null = closed) */
  create: NewContentPreset | null;
}

export const useContentDialogs = create<DialogState>(() => ({ repurposeId: null, create: null }));

export function openRepurpose(id: ID) {
  useContentDialogs.setState({ repurposeId: id });
}

export function closeRepurpose() {
  useContentDialogs.setState({ repurposeId: null });
}

/** Open the New content dialog (from any space screen), optionally prefilled. */
export function openNewContent(preset: NewContentPreset = {}) {
  useContentDialogs.setState({ create: preset });
}

export function closeNewContent() {
  useContentDialogs.setState({ create: null });
}

/** Ids in the order the Content screen currently shows them (prev / next in the editor). */
export const useContentOrder = create<{ ids: ID[] }>(() => ({ ids: [] }));

export function setContentOrder(ids: ID[]) {
  const cur = useContentOrder.getState().ids;
  if (cur.length === ids.length && cur.every((x, i) => x === ids[i])) return;
  useContentOrder.setState({ ids });
}
