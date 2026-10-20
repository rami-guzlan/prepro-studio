/* Breakdown sheet editor for one scene: header fields + colour-coded category boxes. */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Printer, RotateCcw, X } from 'lucide-react';
import type { BreakdownElement, Character, ID, SceneMeta } from '@/types';
import type { SceneInfo, ScriptModel } from '@/script-core/model';
import { update, useFormatters, useProject } from '@/store/project';
import { navigate, openPrint, readLS, writeLS } from '@/store/app';
import { CATEGORY_BY_ID, ELEMENT_STATUSES, optionColor, optionLabel } from '@/lib/constants';
import { castForCharacter, locationForSet } from '@/derived/project';
import { rowsToEighths } from '@/script-core/pagination';
import { uid } from '@/lib/id';
import { Badge, Button, Combo, Field, IconButton, Kbd, NumberInput, Select, Textarea } from '@/ui';
import { AddPicker, type PickItem } from './AddPicker';
import {
  ELEMENT_CATEGORIES,
  addElementToSceneDraft,
  characterMap,
  characterNameIndex,
  createElementDraft,
  elementLinks,
  elementMap,
  elementsByCategory,
  intExtLabel,
  nextCharacterNumber,
  normalizeName,
  parseEighths,
  removeElementFromSceneDraft,
  sceneCharacters,
  sceneElements,
  sceneMetaDraft,
  sortCharacters,
  stripStyle,
  type ElCategory,
} from './logic';

const SCRIPT_DAY_SUGGESTIONS = ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Night 1', 'Night 2', 'Night 3'];

function setMeta(sid: ID, patch: Partial<SceneMeta>, key: string) {
  update((d) => void Object.assign(sceneMetaDraft(d, sid), patch), { coalesce: `scene:${sid}:${key}` });
}

/* ---------------------------------------------------------------- page length input */

function EighthsInput({ scene, model }: { scene: SceneInfo; model: ScriptModel }) {
  const fmt = useFormatters();
  const override = scene.meta?.eighthsOverride;
  const rows = model.pagination.sceneRows.get(scene.id) ?? 0;
  const auto = rowsToEighths(rows, model.pagination.geometry.linesPerPage);
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(override != null ? fmt.eighths(override) : '');
  }, [override, focused, fmt]);
  const commit = () => {
    const v = parseEighths(text);
    if (!text.trim()) setMeta(scene.id, { eighthsOverride: undefined }, 'eighths');
    else if (v != null && v > 0) setMeta(scene.id, { eighthsOverride: v }, 'eighths');
    else setText(override != null ? fmt.eighths(override) : '');
  };
  return (
    <div className="row" style={{ gap: 4 }}>
      <input
        className="input"
        value={text}
        placeholder={`${fmt.eighths(auto)} (auto)`}
        title="Page length in eighths, e.g. 1 3/8 or 5/8. Leave empty to use the length from the script."
        onFocus={(e) => {
          setFocused(true);
          requestAnimationFrame(() => e.target.select());
        }}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setText(override != null ? fmt.eighths(override) : '');
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {override != null && <IconButton icon={RotateCcw} size="sm" label={`Reset to script length (${fmt.eighths(auto)})`} onClick={() => setMeta(scene.id, { eighthsOverride: undefined }, 'eighths')} />}
    </div>
  );
}

/* ---------------------------------------------------------------- boxes */

function Box({ color, title, count, children, footer, wide }: { color: string; title: string; count?: number; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <section className={`breakdown-box ${wide ? 'wide' : ''}`} style={{ ['--cat' as any]: color } as CSSProperties}>
      <header className="breakdown-box-head">
        <span className="breakdown-box-swatch" />
        <span className="grow ellipsis">{title}</span>
        {count != null && count > 0 && <span className="breakdown-box-count">{count}</span>}
      </header>
      <div className="breakdown-box-body">{children}</div>
      {footer && <div className="breakdown-box-foot">{footer}</div>}
    </section>
  );
}

function ElementRow({ scene, el, characters }: { scene: SceneInfo; el: BreakdownElement; characters: Map<ID, Character> }) {
  const links = elementLinks(scene, el);
  const removable = links.manual || links.linked;
  const statusColor = optionColor(ELEMENT_STATUSES, el.status) ?? 'var(--text-3)';
  const chr = el.characterId ? characters.get(el.characterId) : undefined;
  return (
    <div className="breakdown-item">
      <span className="breakdown-status-dot" style={{ background: statusColor }} title={el.status ? `Status: ${optionLabel(ELEMENT_STATUSES, el.status)}` : 'No status'} />
      <button type="button" className="breakdown-item-name" title="Open in Props, Wardrobe & Elements" onClick={() => navigate('elements', { elementId: el.id })}>
        {el.name || 'Unnamed'}
      </button>
      {(el.quantity ?? 1) > 1 && <span className="breakdown-item-sub">×{el.quantity}</span>}
      {chr && <span className="breakdown-item-sub ellipsis">{chr.name}</span>}
      <span className="spacer" />
      {links.tagged && (
        <span className="breakdown-tagbadge" title="Tagged in the script text — remove the tag in the Script editor">
          in script
        </span>
      )}
      {removable ? (
        <button
          type="button"
          className="breakdown-item-x"
          aria-label={`Remove ${el.name} from this scene`}
          title={links.tagged ? 'Remove the manual link (the script tag stays)' : 'Remove from this scene'}
          onClick={() => update((d) => removeElementFromSceneDraft(d, scene.id, el.id))}
        >
          <X size={13} />
        </button>
      ) : (
        <span className="breakdown-item-x-spacer" />
      )}
    </div>
  );
}

function CategoryBox({ scene, cat, els, allElements, characters, extra }: { scene: SceneInfo; cat: ElCategory; els: BreakdownElement[]; allElements: BreakdownElement[]; characters: Map<ID, Character>; extra?: ReactNode }) {
  const def = CATEGORY_BY_ID[cat];
  const inScene = useMemo(() => new Set(scene.elementIds), [scene.elementIds]);
  const items: PickItem[] = useMemo(
    () =>
      allElements
        .filter((e) => e.category === cat && !inScene.has(e.id))
        .map((e) => ({ id: e.id, label: e.name || 'Unnamed', sub: e.description ? e.description.slice(0, 40) : undefined })),
    [allElements, cat, inScene],
  );
  const taken = useMemo(() => new Set(els.map((e) => e.name.toUpperCase())), [els]);
  return (
    <Box
      color={def.color}
      title={def.label}
      count={els.length}
      footer={
        <AddPicker
          items={items}
          taken={taken}
          placeholder={`Add ${def.short.toLowerCase()}…`}
          onPick={(id) => update((d) => addElementToSceneDraft(d, scene.id, id))}
          onCreate={(name) =>
            update((d) => {
              const id = createElementDraft(d, cat, name);
              addElementToSceneDraft(d, scene.id, id);
            })
          }
        />
      }
    >
      {extra}
      {els.length === 0 && !extra && <div className="breakdown-none">None</div>}
      {els.map((el) => (
        <ElementRow key={el.id} scene={scene} el={el} characters={characters} />
      ))}
    </Box>
  );
}

function CastBox({ scene, characters }: { scene: SceneInfo; characters: Character[] }) {
  const cast = useProject((p) => p.cast);
  const byId = useMemo(() => characterMap(characters), [characters]);
  const names = useMemo(() => characterNameIndex(characters), [characters]);
  const inScene = sceneCharacters(scene, byId);
  const speakingIds = useMemo(() => new Set(scene.speaking.map((n) => names.get(n)).filter(Boolean) as ID[]), [scene.speaking, names]);
  const taggedIds = useMemo(() => new Set(scene.tagged.filter((t) => t.cat === 'cast').map((t) => t.id)), [scene.tagged]);
  const manualIds = new Set(scene.meta?.characterIds ?? []);
  const inSceneIds = new Set(inScene.map((c) => c.id));
  const items: PickItem[] = sortCharacters(characters.filter((c) => !inSceneIds.has(c.id))).map((c) => ({
    id: c.id,
    label: c.name,
    sub: [c.number != null ? `#${c.number}` : '', castForCharacter({ cast }, c)?.name ?? ''].filter(Boolean).join(' · '),
  }));
  const taken = new Set(inScene.map((c) => c.name.toUpperCase()));
  const def = CATEGORY_BY_ID.cast;

  return (
    <Box
      color={def.color}
      title={def.label}
      count={inScene.length}
      footer={
        <AddPicker
          items={items}
          taken={taken}
          placeholder="Add cast (non-speaking)…"
          createHint="New character"
          onPick={(id) =>
            update((d) => {
              const m = sceneMetaDraft(d, scene.id);
              const list = (m.characterIds ??= []);
              if (!list.includes(id)) list.push(id);
            })
          }
          onCreate={(name) =>
            update((d) => {
              const id = uid('chr');
              d.characters.push({ id, name: normalizeName(name), number: nextCharacterNumber(d.characters), manual: true });
              const m = sceneMetaDraft(d, scene.id);
              (m.characterIds ??= []).push(id);
            })
          }
        />
      }
    >
      {inScene.length === 0 && <div className="breakdown-none">No characters in this scene</div>}
      {inScene.map((c) => {
        const speaking = speakingIds.has(c.id);
        const tagged = taggedIds.has(c.id);
        const manual = manualIds.has(c.id);
        const actor = castForCharacter({ cast }, c);
        return (
          <div key={c.id} className="breakdown-item">
            <span className="breakdown-board" title="Cast board ID">
              {c.number ?? '–'}
            </span>
            <button type="button" className="breakdown-item-name" title="Open in Cast & Characters" onClick={() => navigate('cast', { characterId: c.id })}>
              {c.name}
            </button>
            {actor && <span className="breakdown-item-sub ellipsis">{actor.name}</span>}
            <span className="spacer" />
            {speaking ? (
              <span className="breakdown-tagbadge speaking" title="Has dialogue in this scene">
                speaking
              </span>
            ) : tagged ? (
              <span className="breakdown-tagbadge" title="Tagged in the script text">
                in script
              </span>
            ) : (
              <span className="breakdown-tagbadge silent" title="Present but not speaking">
                silent
              </span>
            )}
            {manual && !speaking && !tagged ? (
              <button
                type="button"
                className="breakdown-item-x"
                aria-label={`Remove ${c.name} from this scene`}
                title="Remove from this scene"
                onClick={() =>
                  update((d) => {
                    const m = d.scenes[scene.id];
                    if (m?.characterIds) m.characterIds = m.characterIds.filter((x) => x !== c.id);
                  })
                }
              >
                <X size={13} />
              </button>
            ) : (
              <span className="breakdown-item-x-spacer" />
            )}
          </div>
        );
      })}
    </Box>
  );
}

/* ---------------------------------------------------------------- sheet */

export function SheetEditor({ scene, model, index, total, onPrev, onNext }: { scene: SceneInfo; model: ScriptModel; index: number; total: number; onPrev: () => void; onNext: () => void }) {
  const fmt = useFormatters();
  const elements = useProject((p) => p.elements);
  const characters = useProject((p) => p.characters);
  const locations = useProject((p) => p.locations);
  const metas = useProject((p) => p.scenes);
  const [showEmpty, setShowEmptyState] = useState<boolean>(() => readLS('prepro.breakdown.showEmpty', true));
  const setShowEmpty = (fn: (v: boolean) => boolean) =>
    setShowEmptyState((v) => {
      const next = fn(v);
      writeLS('prepro.breakdown.showEmpty', next);
      return next;
    });

  const elById = useMemo(() => elementMap(elements), [elements]);
  const charById = useMemo(() => characterMap(characters), [characters]);
  const els = useMemo(() => sceneElements(scene, elById), [scene, elById]);
  const grouped = useMemo(() => elementsByCategory(els), [els]);
  const meta = scene.meta;
  const strip = stripStyle(scene.stripKey);
  const autoLoc = locationForSet({ locations }, scene.set);
  const manualLoc = meta?.locationId ? locations.find((l) => l.id === meta.locationId) : undefined;
  const scriptDays = useMemo(() => {
    const s = new Set<string>(SCRIPT_DAY_SUGGESTIONS);
    for (const m of Object.values(metas ?? {})) if (m?.scriptDay) s.add(m.scriptDay);
    return [...s];
  }, [metas]);

  const otherCats = ELEMENT_CATEGORIES.filter((c) => c.id !== 'extras');
  const shownCats = showEmpty ? otherCats : otherCats.filter((c) => (grouped.get(c.id as ElCategory)?.length ?? 0) > 0);
  const hiddenCount = otherCats.length - shownCats.length;

  return (
    <div className="breakdown-sheet">
      <div className="breakdown-sheet-head card">
        <div className="breakdown-sheet-strip" style={{ background: strip.bg, color: strip.fg }} title={strip.label}>
          <span className="breakdown-sheet-num">{scene.number}</span>
          <span className="breakdown-sheet-striplabel">{strip.label}</span>
        </div>
        <div className="breakdown-sheet-main">
          <div className="breakdown-sheet-top">
            <div className="breakdown-sheet-titles">
              <div className="breakdown-sheet-kicker">
                Breakdown sheet · Scene {index + 1} of {total}
              </div>
              <h2 className="breakdown-sheet-heading">{scene.heading || 'Untitled scene'}</h2>
            </div>
            <div className="breakdown-sheet-actions">
              <div className="btn-group">
                <Button size="sm" icon={ChevronLeft} disabled={index <= 0} onClick={onPrev} title="Previous scene (Alt+↑)">
                  Prev
                </Button>
                <Button size="sm" iconRight={ChevronRight} disabled={index >= total - 1} onClick={onNext} title="Next scene (Alt+↓)">
                  Next
                </Button>
              </div>
              <Button size="sm" icon={ExternalLink} onClick={() => navigate('script', { sceneId: scene.id })}>
                Open in script
              </Button>
              <IconButton icon={Printer} size="sm" variant="default" label="Print this breakdown sheet" onClick={() => openPrint('breakdown-sheets', { sceneId: scene.number })} />
            </div>
          </div>

          <div className="breakdown-fields">
            <Field label="Int / Ext">
              <div className="breakdown-static">{intExtLabel(scene.intExt)}</div>
            </Field>
            <Field label="Day / Night">
              <div className="breakdown-static">{scene.dayNight || scene.time || '—'}</div>
            </Field>
            <Field label="Set" className="breakdown-span-2">
              <div className="breakdown-static ellipsis" title={scene.set}>
                {scene.set || '—'}
              </div>
            </Field>
            <Field
              label="Location"
              className="breakdown-span-2"
              hint={manualLoc ? 'Set manually for this scene' : autoLoc ? 'Matched from the set name' : locations.length ? 'No location lists this set yet' : undefined}
            >
              <Select
                value={manualLoc ? manualLoc.id : ''}
                placeholder={autoLoc ? `Auto: ${autoLoc.name}` : locations.length ? '— Not set —' : 'No locations yet'}
                options={locations.map((l) => ({ value: l.id, label: l.name || 'Untitled location' }))}
                onChange={(v) => setMeta(scene.id, { locationId: v || undefined }, 'location')}
              />
            </Field>
            <Field label="Page length" hint={`Script page ${scene.page}`}>
              <EighthsInput scene={scene} model={model} />
            </Field>
            <Field label="Script day">
              <Combo value={meta?.scriptDay ?? ''} suggestions={scriptDays} placeholder="e.g. Day 1" onChange={(v) => setMeta(scene.id, { scriptDay: v || undefined }, 'scriptDay')} />
            </Field>
            <Field label="Est. shoot time" hint={meta?.estMinutes ? fmt.minutes(meta.estMinutes) : 'Minutes'}>
              <NumberInput value={meta?.estMinutes} placeholder="min" onChange={(v) => setMeta(scene.id, { estMinutes: v != null && v > 0 ? Math.round(v) : undefined }, 'estMinutes')} />
            </Field>
            <Field label="Synopsis" className="breakdown-span-all">
              <Textarea
                autoGrow
                minRows={1}
                value={meta?.synopsis ?? ''}
                placeholder={scene.firstAction ? `e.g. ${scene.firstAction.slice(0, 90)}${scene.firstAction.length > 90 ? '…' : ''}` : 'One-line description of the scene'}
                onChange={(v) => setMeta(scene.id, { synopsis: v || undefined }, 'synopsis')}
              />
            </Field>
          </div>
        </div>
      </div>

      <div className="row" style={{ margin: '18px 0 10px' }}>
        <h3 className="section-title" style={{ margin: 0 }}>
          Elements
        </h3>
        <span className="muted small">
          {els.length} element{els.length === 1 ? '' : 's'} · {scene.characterIds.filter((id) => charById.has(id)).length} cast
        </span>
        <span className="spacer" />
        <Button size="sm" variant="ghost" onClick={() => setShowEmpty((v) => !v)}>
          {showEmpty ? 'Hide empty categories' : `Show all categories${hiddenCount ? ` (+${hiddenCount})` : ''}`}
        </Button>
      </div>

      <div className="breakdown-boxes">
        <CastBox scene={scene} characters={characters} />
        <CategoryBox
          scene={scene}
          cat="extras"
          els={grouped.get('extras') ?? []}
          allElements={elements}
          characters={charById}
          extra={
            <Textarea
              className="breakdown-extras"
              autoGrow
              minRows={1}
              value={meta?.extras ?? ''}
              placeholder="Background description, e.g. 20 diners, 2 waiters"
              onChange={(v) => setMeta(scene.id, { extras: v || undefined }, 'extras')}
            />
          }
        />
        {shownCats.map((c) => (
          <CategoryBox key={c.id} scene={scene} cat={c.id as ElCategory} els={grouped.get(c.id as ElCategory) ?? []} allElements={elements} characters={charById} />
        ))}
        <Box color="#868e96" title="Notes" wide>
          <Textarea
            className="breakdown-notes"
            autoGrow
            minRows={3}
            value={meta?.notes ?? ''}
            placeholder="Production notes for this scene: special requirements, safety, continuity…"
            onChange={(v) => setMeta(scene.id, { notes: v || undefined }, 'notes')}
          />
        </Box>
      </div>

      <div className="breakdown-hints muted tiny">
        <Kbd>Alt</Kbd>+<Kbd>↑</Kbd>/<Kbd>↓</Kbd> previous / next scene · <Kbd>Ctrl</Kbd>+<Kbd>P</Kbd> print this sheet · tags made in the Script editor show as <Badge style={{ height: 16 }}>in script</Badge>
      </div>
    </div>
  );
}
