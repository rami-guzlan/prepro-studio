/* Right-hand panel: current scene details, breakdown tags in the scene, script notes. */
import { useMemo, useState } from 'react';
import { Check, Lock, MessageSquarePlus, ScanText, Trash2, Undo2 } from 'lucide-react';
import { useScriptModel } from '@/derived/script';
import { update, useProject, useFormatters } from '@/store/project';
import { navigate } from '@/store/app';
import { BREAKDOWN_CATEGORIES, CATEGORY_BY_ID, STRIP_COLORS, SWATCHES } from '@/lib/constants';
import { Button, ColorPicker, Field, IconButton, Input, NumberInput, Tabs, Textarea, confirmDialog } from '@/ui';
import { useScriptUI } from './scriptUI';
import { addNote, notePos, removeNoteMarks, scrollToPos } from './editor/actions';
import { screenplaySchema as schema } from '@/script-core/schema';

type Tab = 'scene' | 'notes';

export function Inspector() {
  const [tab, setTab] = useState<Tab>('scene');
  const notes = useProject((p) => p.script.notes);
  const openNotes = Object.values(notes).filter((n) => !n.resolved).length;
  return (
    <div className="sp-inspector">
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'scene', label: 'Scene' },
            { id: 'notes', label: 'Notes', count: openNotes || undefined },
          ]}
        />
      </div>
      {tab === 'scene' ? <SceneInspector /> : <NotesPanel />}
    </div>
  );
}

function SceneInspector() {
  const model = useScriptModel();
  const sceneId = useScriptUI((s) => s.sceneId);
  const pageInfo = useScriptUI((s) => s.pageInfo);
  const elements = useProject((p) => p.elements);
  const characters = useProject((p) => p.characters);
  const fmt = useFormatters();
  const scene = sceneId ? model.sceneById.get(sceneId) : undefined;
  if (!scene) {
    return (
      <div className="sp-insp-section">
        <div className="muted small">Place the cursor in a scene to see its details. Start a scene with Ctrl+1 (Scene Heading).</div>
      </div>
    );
  }
  const meta = scene.meta ?? { id: scene.id };
  const setMeta = (patch: Record<string, unknown>, key: string) =>
    update(
      (d) => {
        const m = (d.scenes[scene.id] ??= { id: scene.id });
        Object.assign(m, patch);
      },
      { coalesce: `scene:${scene.id}:${key}` },
    );
  const strip = STRIP_COLORS[scene.stripKey] ?? STRIP_COLORS.OTHER;
  const page = pageInfo?.pagination.scenePage.get(scene.id) ?? scene.page;
  const elementsInScene = scene.elementIds.map((id) => elements.find((e) => e.id === id)).filter(Boolean) as typeof elements;
  const castInScene = scene.characterIds.map((id) => characters.find((c) => c.id === id)).filter(Boolean) as typeof characters;

  return (
    <>
      <div className="sp-insp-section">
        <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
          <span className="sp-scene-num" style={{ background: strip.bg, minWidth: 30, height: 24 }}>
            {scene.number}
          </span>
          <div className="grow">
            <div className="strong" style={{ fontFamily: 'var(--font-script)', fontSize: 13 }}>
              {scene.heading || 'Untitled scene'}
            </div>
            <div className="muted small">
              Page {page} · {fmt.eighths(scene.eighths)} pages · {strip.label}
            </div>
          </div>
        </div>
        <Field label="Synopsis" hint="Shown on index cards, strips and breakdown sheets">
          <Textarea autoGrow minRows={2} value={meta.synopsis} onChange={(v) => setMeta({ synopsis: v }, 'synopsis')} placeholder="One-line summary of the scene" />
        </Field>
        <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Field label="Scene # (lock)" hint={meta.number ? 'Locked' : 'Auto'}>
            <div className="row" style={{ gap: 4 }}>
              <Input size="sm" value={meta.number} placeholder={scene.number} onChange={(v) => setMeta({ number: v.trim() || undefined }, 'number')} />
              {!meta.number && <IconButton icon={Lock} label="Lock current number" size="sm" onClick={() => setMeta({ number: scene.number }, 'number-lock')} />}
            </div>
          </Field>
          <Field label="Est. shoot time (min)">
            <NumberInput size="sm" value={meta.estMinutes} onChange={(v) => setMeta({ estMinutes: v }, 'est')} />
          </Field>
          <Field label="Story day">
            <Input size="sm" value={meta.scriptDay} onChange={(v) => setMeta({ scriptDay: v }, 'day')} placeholder="Day 1" />
          </Field>
          <Field label="Extras">
            <Input size="sm" value={meta.extras} onChange={(v) => setMeta({ extras: v }, 'extras')} placeholder="e.g. 10 diners" />
          </Field>
        </div>
        <Field label="Card colour">
          <ColorPicker value={meta.color} onChange={(c) => setMeta({ color: c }, 'color')} swatches={SWATCHES.slice(0, 10)} allowCustom={false} allowNone />
        </Field>
      </div>
      <div className="sp-insp-section">
        <div className="row">
          <span className="section-title" style={{ margin: 0 }}>
            Breakdown
          </span>
          <div className="spacer" />
          <Button size="sm" variant="ghost" icon={ScanText} onClick={() => navigate('breakdown', { sceneId: scene.id })}>
            Sheet
          </Button>
        </div>
        {castInScene.length > 0 && (
          <div className="row wrap" style={{ gap: 4 }}>
            {castInScene.map((c) => (
              <span key={c.id} className="sp-tag-chip" style={{ background: `${CATEGORY_BY_ID.cast.color}22`, color: CATEGORY_BY_ID.cast.color }}>
                {c.number ? `${c.number}. ` : ''}
                {c.name}
              </span>
            ))}
          </div>
        )}
        {elementsInScene.length === 0 ? (
          <div className="muted small">No elements tagged yet. Select a word in the script, then use Tag (or right-click) to add props, wardrobe, vehicles…</div>
        ) : (
          <div className="col" style={{ gap: 6 }}>
            {BREAKDOWN_CATEGORIES.filter((c) => elementsInScene.some((e) => e.category === c.id)).map((c) => (
              <div key={c.id}>
                <div className="tiny strong" style={{ color: c.color, marginBottom: 2 }}>
                  {c.label}
                </div>
                <div className="row wrap" style={{ gap: 4 }}>
                  {elementsInScene
                    .filter((e) => e.category === c.id)
                    .map((e) => (
                      <span key={e.id} className="sp-tag-chip" style={{ background: `${c.color}22`, color: c.color }} title={e.description}>
                        {e.name}
                      </span>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="sp-insp-section">
        <Field label="Scene notes">
          <Textarea autoGrow minRows={3} value={meta.notes} onChange={(v) => setMeta({ notes: v }, 'notes')} placeholder="Production notes for this scene" />
        </Field>
      </div>
    </>
  );
}

function NotesPanel() {
  const notes = useProject((p) => p.script.notes);
  const view = useScriptUI((s) => s.view);
  const cursorNote = useScriptUI((s) => s.cursorNote);
  const [showResolved, setShowResolved] = useState(false);
  const fmt = useFormatters();
  // order notes by position in the document
  const ordered = useMemo(() => {
    const order = new Map<string, number>();
    if (view) {
      view.state.doc.descendants((node, pos) => {
        if (!node.isText) return true;
        for (const m of node.marks) if (m.type === schema.marks.note && !order.has(m.attrs.id)) order.set(m.attrs.id, pos);
        return true;
      });
    }
    return Object.values(notes)
      .filter((n) => showResolved || !n.resolved)
      .sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, view, showResolved, view?.state.doc]);

  return (
    <div className="sp-insp-section" style={{ borderBottom: 0 }}>
      <div className="row">
        <Button size="sm" icon={MessageSquarePlus} onClick={() => view && addNote(view)} disabled={!view}>
          Add note
        </Button>
        <div className="spacer" />
        <label className="checkbox small">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Resolved
        </label>
      </div>
      {ordered.length === 0 && <div className="muted small">No notes. Select text and press Ctrl+Alt+M to attach a note.</div>}
      {ordered.map((n) => (
        <div key={n.id} className={`sp-note-card ${n.resolved ? 'resolved' : ''} ${cursorNote === n.id ? 'active' : ''}`}>
          <Textarea bare autoGrow minRows={1} value={n.text} onChange={(v) => update((d) => void (d.script.notes[n.id].text = v), { coalesce: `note:${n.id}` })} />
          <div className="row" style={{ gap: 4 }}>
            <span className="tiny muted">{fmt.dateMedium(n.createdAt.slice(0, 10))}</span>
            <div className="spacer" />
            <IconButton
              icon={Undo2}
              size="sm"
              label="Go to note"
              onClick={() => {
                if (!view) return;
                const pos = notePos(view, n.id);
                if (pos >= 0) scrollToPos(view, pos);
              }}
            />
            <IconButton icon={Check} size="sm" label={n.resolved ? 'Reopen' : 'Resolve'} onClick={() => update((d) => void (d.script.notes[n.id].resolved = !n.resolved))} />
            <IconButton
              icon={Trash2}
              size="sm"
              label="Delete note"
              onClick={async () => {
                if (!(await confirmDialog({ title: 'Delete this note?', confirmLabel: 'Delete', danger: true }))) return;
                if (view) removeNoteMarks(view, n.id);
                update((d) => void delete d.script.notes[n.id]);
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
