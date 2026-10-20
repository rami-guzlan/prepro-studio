/* Category groups shown as tabs in the Elements module. */
import type { BreakdownElement } from '@/types';
import { BREAKDOWN_CATEGORIES } from '@/lib/constants';
import type { ElCategory } from '@/modules/breakdown/logic';

export type GroupId = 'all' | 'props' | 'wardrobe' | 'makeup' | 'set' | 'vehicles' | 'effects' | 'sound' | 'other';

export interface GroupDef {
  id: GroupId;
  label: string;
  /** null = every category */
  cats: ElCategory[] | null;
  /** singular noun used for "Add …" */
  noun: string;
}

export const GROUPS: GroupDef[] = [
  { id: 'all', label: 'All', cats: null, noun: 'element' },
  { id: 'props', label: 'Props', cats: ['props'], noun: 'prop' },
  { id: 'wardrobe', label: 'Wardrobe', cats: ['wardrobe'], noun: 'wardrobe item' },
  { id: 'makeup', label: 'Hair & Makeup', cats: ['makeup'], noun: 'look' },
  { id: 'set', label: 'Set Dressing', cats: ['set_dressing', 'greenery'], noun: 'set dressing' },
  { id: 'vehicles', label: 'Vehicles & Animals', cats: ['vehicles', 'animals'], noun: 'vehicle' },
  { id: 'effects', label: 'Effects', cats: ['sfx', 'vfx', 'stunts'], noun: 'effect' },
  { id: 'sound', label: 'Sound & Music', cats: ['sound', 'music'], noun: 'sound' },
  { id: 'other', label: 'Other', cats: ['extras', 'special_equipment', 'security', 'misc'], noun: 'element' },
];

export const GROUP_BY_ID = Object.fromEntries(GROUPS.map((g) => [g.id, g])) as Record<GroupId, GroupDef>;

export function inGroup(el: Pick<BreakdownElement, 'category'>, g: GroupDef): boolean {
  return !g.cats || g.cats.includes(el.category);
}

export function groupOfCategory(cat: ElCategory): GroupId {
  return GROUPS.find((g) => g.cats?.includes(cat))?.id ?? 'other';
}

/** Category sort index (breakdown colour-code order). */
export function categoryIndex(cat: string): number {
  const i = BREAKDOWN_CATEGORIES.findIndex((c) => c.id === cat);
  return i < 0 ? 999 : i;
}

/** Default category for a new element created from a tab. */
export function defaultCategory(g: GroupDef): ElCategory {
  return g.cats?.[0] ?? 'props';
}
