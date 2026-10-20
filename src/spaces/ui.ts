/* UI state shared by Marketing Space screens: the content editor (opens over
   any module) and the cached list of production projects for linking. */
import { create } from 'zustand';
import { useEffect } from 'react';
import type { ProjectSummary } from '@/types';
import { backend } from '@/backend';

export type ContentTab = 'brief' | 'write' | 'produce' | 'publish' | 'results';

interface SpaceUIState {
  /** content piece open in the editor (null = closed) */
  contentId: string | null;
  contentTab: ContentTab;
  projects: ProjectSummary[] | null;
}

export const useSpaceUI = create<SpaceUIState>(() => ({ contentId: null, contentTab: 'brief', projects: null }));

/** Open a content piece in the editor (from any space screen). */
export function openContent(id: string, tab: ContentTab = 'brief') {
  useSpaceUI.setState({ contentId: id, contentTab: tab });
}

export function closeContent() {
  useSpaceUI.setState({ contentId: null });
}

export async function refreshProjectList() {
  try {
    useSpaceUI.setState({ projects: await backend.listProjects() });
  } catch {
    useSpaceUI.setState({ projects: [] });
  }
}

/** All production projects (for linking to spaces / campaigns / content). */
export function useProjectList(): ProjectSummary[] {
  const list = useSpaceUI((s) => s.projects);
  useEffect(() => {
    if (list === null) void refreshProjectList();
  }, [list]);
  return list ?? [];
}
