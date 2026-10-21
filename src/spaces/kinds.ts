/* Workspace kinds built on the space machinery (store, autosave, folders, assets,
   undo, agent data tools):

   - marketing  Marketing Spaces (many)      src/spaces/modules/*
   - business   Business Management (many)    src/spaces/business/*
   - finance    Personal Finances (one, PIN)  src/spaces/finance/*
   - training   Training (one)                src/spaces/training/*

   Each non-marketing kind exports a SpaceKindDef from src/spaces/<kind>/index.ts:
   its sidebar modules, print documents and a compact summary used by the
   holistic coach (studio_context agent tool). */
import type { LucideIcon } from 'lucide-react';
import { BriefcaseBusiness, Dumbbell, Megaphone, Wallet } from 'lucide-react';
import type { SpaceData, SpaceKind } from './types';
import type { SpacePrintDocDef } from './print/types';
import type { SpaceModuleDef } from './registry';

export interface SpaceKindDef {
  modules: SpaceModuleDef[];
  /** sidebar group order */
  groups: string[];
  printDocs: SpacePrintDocDef[];
  /** short structured summary for agents (the holistic coach). Keep it small: numbers, dates, short lists. */
  coachSummary(s: SpaceData, todayISO: string): Record<string, unknown>;
  /** show_in_app parameters per module id, e.g. { invoices: 'invoiceId' } (shown to agents) */
  navParams?: Record<string, string>;
}

export interface KindInfo {
  kind: SpaceKind;
  /** library / sidebar label */
  label: string;
  /** one item, e.g. "business" */
  noun: string;
  /** folder under the projects folder */
  folder: string;
  icon: LucideIcon;
  color: string;
  /** only one per user */
  singleton: boolean;
}

export const KIND_INFO: Record<SpaceKind, KindInfo> = {
  marketing: { kind: 'marketing', label: 'Marketing Spaces', noun: 'marketing space', folder: 'Marketing Spaces', icon: Megaphone, color: '#7c5cff', singleton: false },
  business: { kind: 'business', label: 'Business Management', noun: 'business', folder: 'Businesses', icon: BriefcaseBusiness, color: '#0a66c2', singleton: false },
  finance: { kind: 'finance', label: 'Personal Finances', noun: 'personal finances', folder: 'Personal Finances', icon: Wallet, color: '#2fb36d', singleton: true },
  training: { kind: 'training', label: 'Training', noun: 'training', folder: 'Training', icon: Dumbbell, color: '#e8590c', singleton: true },
};

export function spaceKind(s: { meta?: { kind?: SpaceKind } } | null | undefined): SpaceKind {
  return s?.meta?.kind ?? 'marketing';
}
