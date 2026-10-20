/* Combined shot list of a shoot session: every shot of its pieces, grouped by
   piece (editable, writes back to content.shots) or in a suggested filming order. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCheck, Ellipsis, ListOrdered, ListTree, MapPin, Plus, Sparkles, Trash2, Undo2 } from 'lucide-react';
import type { ContentPiece, ShootSession, ShotKind } from '@/spaces/types';
import { FORMAT_BY_ID, SHOT_KINDS } from '@/spaces/constants';
import { openContent } from '@/spaces/ui';
import { readLS, writeLS } from '@/store/app';
import { formatSeconds } from '@/lib/format';
import { plural } from '@/lib/text';
import { Button, Card, Checkbox, Combo, IconButton, Input, Menu, Progress, Select, Tabs } from '@/ui';
import { addShot, removeShot, setAllShotsDone, updateShot } from './actions';
import { FRAMING_SUGGESTIONS, NO_LOCATION, filmingOrder, shotKindShort, shotStats } from './model';
import { DurationInput, undoToast } from './parts';

type Mode = 'piece' | 'order';

export function ShotList({ shoot, pieces }: { shoot: ShootSession; pieces: ContentPiece[] }) {
  const [mode, setModeState] = useState<Mode>(() => (readLS<Mode>('prepro.spprod.shotmode', 'piece') === 'order' ? 'order' : 'piece'));
  const setMode = (m: Mode) => {
    setModeState(m);
    writeLS('prepro.spprod.shotmode', m);
  };
  const stats = useMemo(() => shotStats(pieces), [pieces]);
  const locations = useMemo(() => {
    const set = new Set<string>();
    if (shoot.location?.trim()) set.add(shoot.location.trim());
    for (const p of pieces) {
      if (p.location?.trim()) set.add(p.location.trim());
      for (const s of p.shots ?? []) if (s.location?.trim()) set.add(s.location.trim());
    }
    return [...set];
  }, [shoot.location, pieces]);
  const order = useMemo(() => (mode === 'order' ? filmingOrder(pieces, shoot.location) : []), [mode, pieces, shoot.location]);

  /* focus management for keyboard entry (Enter = new shot, Backspace on empty = delete) */
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const [focusId, setFocusId] = useState<string | null>(null);
  useEffect(() => {
    if (!focusId) return;
    const el = inputs.current.get(focusId);
    if (el) {
      el.focus();
      setFocusId(null);
    }
  }, [focusId, pieces]);

  const ids = pieces.map((p) => p.id);
  const pct = stats.total ? stats.done / stats.total : 0;

  return (
    <Card
      title={
        <span className="row" style={{ gap: 8 }}>
          Shot list
          <span className="badge">{stats.total}</span>
        </span>
      }
      actions={
        <>
          {stats.total > 0 && (
            <span className="row small muted" style={{ gap: 8, marginRight: 4 }}>
              <Progress value={pct} color={pct >= 1 ? 'var(--success)' : undefined} style={{ width: 90 }} />
              {stats.done}/{stats.total} done
            </span>
          )}
          <Tabs<Mode>
            value={mode}
            onChange={setMode}
            tabs={[
              { id: 'piece', label: 'By piece', icon: ListTree },
              { id: 'order', label: 'Filming order', icon: ListOrdered },
            ]}
          />
          <Menu
            align="end"
            trigger={<IconButton icon={Ellipsis} label="More shot list actions" size="sm" />}
            items={[
              { label: 'Tick every shot', icon: CheckCheck, disabled: !stats.total || stats.done === stats.total, onClick: () => setAllShotsDone(ids, true) },
              { label: 'Clear all ticks', icon: Undo2, disabled: !stats.done, onClick: () => setAllShotsDone(ids, false) },
            ]}
          />
        </>
      }
      style={{ overflow: 'hidden' }}
    >
      {pieces.length === 0 ? (
        <div className="sp-production-empty">
          <p>Add content to this shoot day to build the combined shot list.</p>
        </div>
      ) : mode === 'piece' ? (
        <div className="sp-production-shots">
          {pieces.map((c) => {
            const shots = c.shots ?? [];
            const done = shots.filter((s) => s.done).length;
            const FIcon = FORMAT_BY_ID[c.format]?.icon ?? Sparkles;
            const all = shots.length > 0 && done === shots.length;
            const add = () => {
              const last = shots[shots.length - 1];
              const id = addShot(c.id, { kind: last?.kind ?? 'a_roll', location: last?.location });
              setFocusId(id);
            };
            return (
              <div key={c.id} className="sp-production-shotgroup">
                <div className="sp-production-shotgroup-head">
                  <Checkbox checked={all} disabled={!shots.length} onChange={(v) => setAllShotsDone([c.id], v)} title={all ? 'Untick all shots of this piece' : 'Tick all shots of this piece'} />
                  <FIcon />
                  <button type="button" className="sp-production-ptitle" onClick={() => openContent(c.id, 'produce')} title="Open in the content editor">
                    {c.title || 'Untitled content'}
                  </button>
                  <span className={`count ${all ? 'ok' : ''}`}>{shots.length ? `${done}/${shots.length}` : 'no shots'}</span>
                  <span className="spacer" />
                  <Button size="sm" variant="ghost" icon={Plus} onClick={add}>
                    Add shot
                  </Button>
                </div>
                {shots.length > 0 ? (
                  <>
                    <div className="sp-production-shothead" aria-hidden>
                      <span />
                      <span style={{ textAlign: 'right' }}>#</span>
                      <span>Shot</span>
                      <span>Kind</span>
                      <span>Framing</span>
                      <span style={{ textAlign: 'right' }}>Dur.</span>
                      <span>Location</span>
                      <span />
                    </div>
                    {shots.map((s, i) => (
                      <div key={s.id} className={`sp-production-shot ${s.done ? 'done' : ''}`}>
                        <Checkbox checked={s.done} onChange={(v) => updateShot(c.id, s.id, { done: v || undefined }, false)} title="Filmed" />
                        <span className="num">{i + 1}</span>
                        <Input
                          bare
                          size="sm"
                          className="desc-input"
                          ref={(el) => {
                            if (el) inputs.current.set(s.id, el);
                            else inputs.current.delete(s.id);
                          }}
                          value={s.description}
                          placeholder="Describe the shot…"
                          aria-label={`Shot ${i + 1} description`}
                          onChange={(v) => updateShot(c.id, s.id, { description: v })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const id = addShot(c.id, { kind: s.kind, location: s.location }, s.id);
                              setFocusId(id);
                            } else if (e.key === 'Backspace' && !s.description) {
                              e.preventDefault();
                              const prev = shots[i - 1]?.id ?? shots[i + 1]?.id ?? null;
                              removeShot(c.id, s.id);
                              if (prev) setFocusId(prev);
                            }
                          }}
                        />
                        <Select
                          bare
                          size="sm"
                          value={s.kind ?? ''}
                          placeholder="—"
                          options={SHOT_KINDS}
                          aria-label="Kind"
                          onChange={(v) => updateShot(c.id, s.id, { kind: (v || undefined) as ShotKind | undefined }, false)}
                        />
                        <Combo bare size="sm" value={s.framing} suggestions={FRAMING_SUGGESTIONS} placeholder="Framing" aria-label="Framing" onChange={(v) => updateShot(c.id, s.id, { framing: v })} />
                        <DurationInput value={s.duration} onChange={(v) => updateShot(c.id, s.id, { duration: v }, false)} ariaLabel={`Shot ${i + 1} duration`} />
                        <Combo bare size="sm" value={s.location} suggestions={locations} placeholder={c.location || shoot.location || 'Location'} aria-label="Location" onChange={(v) => updateShot(c.id, s.id, { location: v })} />
                        <IconButton
                          size="sm"
                          icon={Trash2}
                          label="Delete shot"
                          onClick={() => {
                            removeShot(c.id, s.id);
                            undoToast('Shot deleted');
                          }}
                        />
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="sp-production-noshots">No shots yet — add the A-roll, B-roll and inserts this piece needs.</div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="sp-production-shots">
          <p className="sp-production-ordernote">
            Suggested order: shots grouped by location, talking A-roll first while the setup is lit, then B-roll, inserts and screen captures. Tick shots off as you go.
          </p>
          {order.length === 0 && <div className="sp-production-empty">No shots yet. Switch to “By piece” to add them.</div>}
          {order.map((g) => (
            <div key={g.location} className="sp-production-loc">
              <div className="sp-production-loc-head">
                <MapPin />
                <span>{g.location}</span>
                <span className="muted">
                  {plural(g.rows.length, 'shot')}
                  {g.seconds ? ` · ${formatSeconds(g.seconds)}` : ''}
                  {g.location === NO_LOCATION ? ' · set a location on the shot, piece or shoot day' : ''}
                </span>
              </div>
              {g.rows.map(({ piece, shot }, i) => {
                const FIcon = FORMAT_BY_ID[piece.format]?.icon ?? Sparkles;
                return (
                  <div key={shot.id} className={`sp-production-shot order ${shot.done ? 'done' : ''}`}>
                    <Checkbox checked={shot.done} onChange={(v) => updateShot(piece.id, shot.id, { done: v || undefined }, false)} title="Filmed" />
                    <span className="num">{i + 1}</span>
                    <span className="desc" title={shot.description}>
                      {shot.description || <span className="muted">No description</span>}
                    </span>
                    <span className="cell">{shotKindShort(shot.kind)}</span>
                    <span className="cell">{shot.framing}</span>
                    <span className="cell sp-production-dur">{shot.duration != null ? formatSeconds(shot.duration) : ''}</span>
                    <button type="button" className="sp-production-piecechip" onClick={() => openContent(piece.id, 'produce')} title={piece.title}>
                      <FIcon />
                      <span>{piece.title || 'Untitled content'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
