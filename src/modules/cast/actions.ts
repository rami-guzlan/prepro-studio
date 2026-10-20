/* Data operations of the Cast & Characters module (all undoable via update()). */
import type { CastMember, Character, ID } from '@/types';
import type { ScriptModel } from '@/derived/script';
import { getProject, undo, update } from '@/store/project';
import { optionLabel, RATE_UNITS, CAST_STATUSES } from '@/lib/constants';
import type { CsvColumn } from '@/lib/csv';
import { uid } from '@/lib/id';
import { confirmDialog, promptDialog, toast } from '@/ui';
import { characterStats, MEASUREMENTS, rolesByCast, saveCsv, sortByBoard, sortCastByBoard } from './util';

/* ------------------------------------------------------------------ cast members */

export function addCastMember(partial?: Partial<CastMember>): ID {
  const id = uid('cast');
  const member: CastMember = { id, name: '', status: 'considering', ...partial };
  update((d) => {
    d.cast.push(member);
  });
  return id;
}

export function duplicateCastMember(id: ID): ID | undefined {
  const src = getProject().cast.find((m) => m.id === id);
  if (!src) return undefined;
  const copy: CastMember = { ...(JSON.parse(JSON.stringify(src)) as CastMember), id: uid('cast'), name: src.name ? `${src.name} (copy)` : '' };
  update((d) => {
    const i = d.cast.findIndex((m) => m.id === id);
    d.cast.splice(i < 0 ? d.cast.length : i + 1, 0, copy);
  });
  return copy.id;
}

export async function deleteCastMember(id: ID): Promise<boolean> {
  const p = getProject();
  const m = p.cast.find((x) => x.id === id);
  if (!m) return false;
  const roles = p.characters.filter((c) => c.castId === id);
  const ok = await confirmDialog({
    title: `Delete ${m.name || 'this cast member'}?`,
    message: roles.length
      ? `${m.name || 'They'} will be removed from the cast and unlinked from ${roles.map((r) => r.name).join(', ')}.`
      : 'The cast member and their contact details will be removed.',
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return false;
  update((d) => {
    d.cast = d.cast.filter((x) => x.id !== id);
    for (const c of d.characters) if (c.castId === id) delete c.castId;
  });
  toast(`Deleted ${m.name || 'cast member'}`, 'success', { action: { label: 'Undo', onClick: () => undo() } });
  return true;
}

/** Make `castId` play exactly the characters in `charIds`. */
export function setRoles(castId: ID, charIds: ID[]) {
  update((d) => {
    for (const c of d.characters) {
      if (charIds.includes(c.id)) c.castId = castId;
      else if (c.castId === castId) delete c.castId;
    }
  });
}

/* ------------------------------------------------------------------ characters */

export async function addCharacter(): Promise<ID | undefined> {
  const name = await promptDialog({ title: 'Add character', message: 'Name as it appears in character cues (e.g. "OFFICER RUIZ").', placeholder: 'CHARACTER NAME', confirmLabel: 'Add' });
  const n = name?.trim().toUpperCase();
  if (!n) return undefined;
  const p = getProject();
  const existing = p.characters.find((c) => c.name.toUpperCase() === n || (c.aliases ?? []).some((a) => a.toUpperCase() === n));
  if (existing) {
    toast(`${n} already exists${existing.name.toUpperCase() !== n ? ` (alias of ${existing.name})` : ''}`, 'info');
    return existing.id;
  }
  const id = uid('chr');
  const number = p.characters.reduce((mx, c) => Math.max(mx, c.number ?? 0), 0) + 1;
  update((d) => {
    d.characters.push({ id, name: n, number, manual: true });
  });
  return id;
}

/** Re-number board ids 1..n by importance (scene count desc, then first appearance). */
export function renumberCharacters(model: ScriptModel) {
  const p = getProject();
  if (!p.characters.length) return;
  const stats = characterStats(p.characters, model);
  const order = [...p.characters].sort((a, b) => {
    const sa = stats.get(a.id)!;
    const sb = stats.get(b.id)!;
    return (
      sb.scenes.length - sa.scenes.length ||
      sa.firstScene - sb.firstScene ||
      (a.number ?? 1e9) - (b.number ?? 1e9) ||
      a.name.localeCompare(b.name)
    );
  });
  const num = new Map(order.map((c, i) => [c.id, i + 1]));
  update((d) => {
    for (const c of d.characters) c.number = num.get(c.id);
  });
  toast(`Renumbered ${order.length} characters by importance`, 'success', { action: { label: 'Undo', onClick: () => undo() } });
}

function remapIds(ids: ID[] | undefined, from: ID, to: ID | null): ID[] | undefined {
  if (!ids?.includes(from)) return ids;
  const out: ID[] = [];
  for (const id of ids) {
    const v = id === from ? to : id;
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

/** Merge `srcId` into `targetId`: names become aliases, links move to the target, source is deleted. */
export function mergeCharacters(srcId: ID, targetId: ID) {
  if (srcId === targetId) return;
  const p = getProject();
  const src = p.characters.find((c) => c.id === srcId);
  const tgt = p.characters.find((c) => c.id === targetId);
  if (!src || !tgt) return;
  update((d) => {
    const s = d.characters.find((c) => c.id === srcId);
    const t = d.characters.find((c) => c.id === targetId);
    if (!s || !t) return;
    const tName = t.name.toUpperCase();
    const aliases: string[] = [];
    for (const a of [...(t.aliases ?? []), s.name, ...(s.aliases ?? [])]) {
      const u = a.trim().toUpperCase();
      if (u && u !== tName && !aliases.includes(u)) aliases.push(u);
    }
    t.aliases = aliases;
    if (!t.castId && s.castId) t.castId = s.castId;
    if (!t.description && s.description) t.description = s.description;
    if (!t.age && s.age) t.age = s.age;
    if (!t.gender && s.gender) t.gender = s.gender;
    if (!t.color && s.color) t.color = s.color;
    if (s.notes) t.notes = t.notes ? `${t.notes}\n${s.notes}` : s.notes;
    for (const sm of Object.values(d.scenes)) {
      const next = remapIds(sm.characterIds, srcId, targetId);
      if (next !== sm.characterIds) sm.characterIds = next;
    }
    for (const el of d.elements ?? []) if (el.characterId === srcId) el.characterId = targetId;
    for (const sh of d.shots ?? []) {
      const next = remapIds(sh.characterIds, srcId, targetId);
      if (next !== sh.characterIds) sh.characterIds = next;
    }
    for (const a of d.post?.adr ?? []) if (a.characterId === srcId) a.characterId = targetId;
    d.characters = d.characters.filter((c) => c.id !== srcId);
  });
  toast(`Merged ${src.name} into ${tgt.name}`, 'success', { action: { label: 'Undo', onClick: () => undo() } });
}

export async function deleteCharacter(id: ID): Promise<boolean> {
  const c = getProject().characters.find((x) => x.id === id);
  if (!c) return false;
  const ok = await confirmDialog({
    title: `Delete ${c.name}?`,
    message: 'The character is removed from scenes, shots and wardrobe links it was added to manually.',
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return false;
  update((d) => {
    for (const sm of Object.values(d.scenes)) {
      const next = remapIds(sm.characterIds, id, null);
      if (next !== sm.characterIds) sm.characterIds = next;
    }
    for (const sh of d.shots ?? []) {
      const next = remapIds(sh.characterIds, id, null);
      if (next !== sh.characterIds) sh.characterIds = next;
    }
    for (const el of d.elements ?? []) if (el.characterId === id) delete el.characterId;
    d.characters = d.characters.filter((x) => x.id !== id);
  });
  toast(`Deleted ${c.name}`, 'success', { action: { label: 'Undo', onClick: () => undo() } });
  return true;
}

/* ------------------------------------------------------------------ CSV */

export function exportCastCsv() {
  const p = getProject();
  const roles = rolesByCast(p.characters);
  const rows = sortCastByBoard(p.cast, roles);
  const cols: CsvColumn<CastMember>[] = [
    { header: 'Board #', value: (m) => (roles.get(m.id) ?? []).map((c) => c.number).filter((n) => n != null).join(', ') },
    { header: 'Name', value: (m) => m.name },
    { header: 'Roles', value: (m) => (roles.get(m.id) ?? []).map((c) => c.name).join(', ') },
    { header: 'Status', value: (m) => optionLabel(CAST_STATUSES, m.status) },
    { header: 'Pronouns', value: (m) => m.pronouns },
    { header: 'Phone', value: (m) => m.phone },
    { header: 'Email', value: (m) => m.email },
    { header: 'Address', value: (m) => m.address },
    { header: 'Agent', value: (m) => m.agent },
    { header: 'Agency', value: (m) => m.agency },
    { header: 'Agent phone', value: (m) => m.agentPhone },
    { header: 'Agent email', value: (m) => m.agentEmail },
    { header: 'Union', value: (m) => m.union },
    { header: 'Rate', value: (m) => m.rate },
    { header: 'Rate unit', value: (m) => (m.rateUnit ? optionLabel(RATE_UNITS, m.rateUnit).replace(/^\/\s*/, '') : '') },
    { header: 'Availability', value: (m) => m.availability },
    { header: 'Dietary', value: (m) => m.dietary },
    { header: 'Allergies', value: (m) => m.allergies },
    { header: 'Medical', value: (m) => m.medical },
    { header: 'Emergency contact', value: (m) => m.emergencyName },
    { header: 'Emergency phone', value: (m) => m.emergencyPhone },
    { header: 'Release signed', value: (m) => !!m.releaseSigned },
    { header: 'Contract signed', value: (m) => !!m.contractSigned },
    ...MEASUREMENTS.map((f) => ({ header: f.label, value: (m: CastMember) => m.measurements?.[f.key] })),
    { header: 'Notes', value: (m) => m.notes },
  ];
  return saveCsv(p.meta.title, 'Cast', rows, cols);
}

export function exportCharactersCsv(model: ScriptModel) {
  const p = getProject();
  const stats = characterStats(p.characters, model);
  const rows = sortByBoard(p.characters);
  const cols: CsvColumn<Character>[] = [
    { header: '#', value: (c) => c.number },
    { header: 'Character', value: (c) => c.name },
    { header: 'Aliases', value: (c) => (c.aliases ?? []).join(', ') },
    { header: 'Played by', value: (c) => p.cast.find((m) => m.id === c.castId)?.name ?? '' },
    { header: 'Scenes', value: (c) => stats.get(c.id)?.scenes.length ?? 0 },
    { header: 'Scene numbers', value: (c) => (stats.get(c.id)?.scenes ?? []).map((s) => s.number).join(', ') },
    { header: 'Speeches', value: (c) => stats.get(c.id)?.speeches ?? 0 },
    { header: 'Words', value: (c) => stats.get(c.id)?.words ?? 0 },
    { header: 'Description', value: (c) => c.description },
    { header: 'Age', value: (c) => c.age },
    { header: 'Gender', value: (c) => c.gender },
    { header: 'Notes', value: (c) => c.notes },
  ];
  return saveCsv(p.meta.title, 'Characters', rows, cols);
}
