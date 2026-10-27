/* Brand Kit & Assets → Share for review (hosted version only): no-sign-in review
   links for chosen sections (images, videos …), and the feedback that comes back.
   The links and feedback live on the server (server/reviews.mjs), not in the space. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Copy, ExternalLink, FileText, MessageSquareText, Power, Send, Trash2 } from 'lucide-react';
import type { BrandAsset } from '@/spaces/types';
import { assetUrl } from '@/backend';
import { reviewApi, type ReviewLink } from '@/backend/cloud';
import { useSpace, useSpaceId } from '@/store/space';
import { plural } from '@/lib/text';
import { Button, Checkbox, confirmDialog, Field, Input, Modal, Select, Textarea, toast } from '@/ui';
import { copyText } from './actions';
import { assetsOfSection, normalizeHex, SECTIONS, type SectionId } from './util';

const EXPIRY = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '0', label: 'Never (until turned off)' },
];
const DECISION_LABEL = { approve: 'Approved', changes: 'Needs changes', comment: 'Comment', '': '' } as const;
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const isOpen = (l: ReviewLink) => !l.revoked && (!l.expiresAt || l.expiresAt > new Date().toISOString());

/** Review links of the open space, refreshed when someone sends feedback. */
function useReviewLinks() {
  const spaceId = useSpaceId();
  const [links, setLinks] = useState<ReviewLink[] | null>(null);
  const load = useCallback(() => {
    if (!spaceId) return;
    reviewApi
      .list(spaceId)
      .then(setLinks)
      .catch(() => setLinks([]));
  }, [spaceId]);
  useEffect(() => {
    load();
    const on = (e: Event) => {
      if ((e as CustomEvent).detail?.id === spaceId) load();
    };
    window.addEventListener('prepro:review', on);
    return () => window.removeEventListener('prepro:review', on);
  }, [load, spaceId]);
  return { links, load, spaceId };
}

export function ShareForReviewButton() {
  const [open, setOpen] = useState(false);
  const { links, load, spaceId } = useReviewLinks();
  const responses = links?.reduce((n, l) => n + l.responses.length, 0) ?? 0;
  return (
    <>
      <Button icon={Send} title="A link anyone can open without signing in, to look at chosen sections and send feedback" onClick={() => setOpen(true)}>
        Share for review{responses ? ` · ${plural(responses, 'response')}` : ''}
      </Button>
      {open && <ReviewDialog links={links ?? []} reload={load} spaceId={spaceId} onClose={() => setOpen(false)} />}
    </>
  );
}

function ReviewDialog({ links, reload, spaceId, onClose }: { links: ReviewLink[]; reload: () => void; spaceId: string; onClose: () => void }) {
  const assets = useSpace((s) => s.assets) ?? [];
  const spaceTitle = useSpace((s) => s.meta?.title) ?? '';
  const counts = useMemo(() => Object.fromEntries(SECTIONS.map((s) => [s.id, assetsOfSection(assets, s.id).length])) as Record<SectionId, number>, [assets]);
  const [sections, setSections] = useState<SectionId[]>(() => (['images', 'video'] as SectionId[]).filter((id) => counts[id] > 0));
  const [title, setTitle] = useState(`${spaceTitle || 'Brand kit'} review`);
  const [message, setMessage] = useState('');
  const [days, setDays] = useState('30');
  const [showNotes, setShowNotes] = useState(true);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<string | null>(null);
  // items picked per section; a section without an entry shares all of its items (new ones too)
  const [picks, setPicks] = useState<Partial<Record<SectionId, string[]>>>({});
  // the link whose feedback is open (null: the list)
  const [viewing, setViewing] = useState<string | null>(null);
  const shown = links.find((l) => l.token === viewing);

  const create = async () => {
    if (!sections.length) return toast('Choose at least one section', 'error');
    const empty = sections.find((id) => picks[id]?.length === 0);
    if (empty) return toast(`Pick at least one item in ${SECTIONS.find((s) => s.id === empty)!.title}, or untick it`, 'error');
    const chosen = Object.fromEntries(sections.filter((id) => picks[id]).map((id) => [id, picks[id]!]));
    setBusy(true);
    try {
      const l = await reviewApi.create(spaceId, { title, message, sections, picks: chosen, showNotes, days: Number(days) });
      setMade(l.token);
      reload();
      await copyText(reviewApi.url(l.token), 'the review link');
    } catch (e) {
      toast(`Could not create the link: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const pickItem = (sec: SectionId, id: string) =>
    setPicks((p) => {
      const all = assetsOfSection(assets, sec).map((a) => a.id);
      const cur = p[sec] ?? all;
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : all.filter((x) => x === id || cur.includes(x));
      const out = { ...p };
      if (next.length === all.length) delete out[sec];
      else out[sec] = next;
      return out;
    });
  /** Pick or drop a group of items (a campaign's resources) at once. */
  const pickGroup = (sec: SectionId, ids: string[], on: boolean) =>
    setPicks((p) => {
      const all = assetsOfSection(assets, sec).map((a) => a.id);
      const cur = p[sec] ?? all;
      const next = on ? all.filter((x) => ids.includes(x) || cur.includes(x)) : cur.filter((x) => !ids.includes(x));
      const out = { ...p };
      if (next.length === all.length) delete out[sec];
      else out[sec] = next;
      return out;
    });
  const campaigns = useSpace((s) => s.campaigns) ?? [];
  /** Links & documents split into general items and each campaign's resources; other sections are one group. */
  const groupsOf = (sec: SectionId, items: BrandAsset[]) => {
    if (sec !== 'links' || !items.some((a) => a.campaignId)) return [{ key: '', name: '', items }];
    const general = items.filter((a) => !a.campaignId || !campaigns.some((c) => c.id === a.campaignId));
    const per = campaigns.map((c) => ({ key: c.id, name: c.name || 'Untitled campaign', items: items.filter((a) => a.campaignId === c.id) })).filter((g) => g.items.length);
    return [...(general.length ? [{ key: 'general', name: 'General', items: general }] : []), ...per];
  };
  const pickAll = (sec: SectionId, on: boolean) =>
    setPicks((p) => {
      const out = { ...p };
      if (on) delete out[sec];
      else out[sec] = [];
      return out;
    });

  const toggle = (id: SectionId) => setSections((s) => (s.includes(id) ? s.filter((x) => x !== id) : SECTIONS.map((d) => d.id).filter((x) => x === id || s.includes(x))));

  return (
    <Modal open onClose={onClose} size="lg" title="Share for review">
      {shown ? (
        <LinkDetail link={shown} assets={assets} spaceId={spaceId} reload={reload} onBack={() => setViewing(null)} />
      ) : (
        <div className="sp-review">
          <p className="muted small" style={{ marginTop: 0 }}>
            Anyone with the link can see what you choose, mark each item Approve or Needs changes, comment and send it back to you. No account needed. Tick the sections, then untick any items to leave
            out. Nothing else from this space is shared.
          </p>
          <div className="sp-review-new">
            <div className="sp-review-sections" role="group" aria-label="Sections to share">
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                return (
                  <label key={s.id} className={`sp-review-section ${sections.includes(s.id) ? 'on' : ''} ${counts[s.id] ? '' : 'none'}`}>
                    <input type="checkbox" checked={sections.includes(s.id)} onChange={() => toggle(s.id)} />
                    <Icon size={14} />
                    <span className="grow">{s.title}</span>
                    <span className="n">{counts[s.id] || '–'}</span>
                  </label>
                );
              })}
            </div>
            <div className="col" style={{ gap: 10 }}>
              <Field label="Title">
                <Input value={title} onChange={setTitle} />
              </Field>
              <Field label="Note for the reviewer">
                <Textarea value={message} rows={3} placeholder="What should they look at? What do you need from them, and by when?" onChange={setMessage} />
              </Field>
              <div className="row wrap" style={{ gap: 12, alignItems: 'flex-end' }}>
                <Field label="Link works for">
                  <Select value={days} options={EXPIRY} onChange={setDays} />
                </Field>
                <Checkbox checked={showNotes} onChange={setShowNotes} label="Show each item’s notes" />
              </div>
            </div>
          </div>

          {sections.some((id) => counts[id] > 0) && (
            <div className="sp-review-picks">
              <h3 className="sp-review-h">Pick what to share</h3>
              {sections
                .filter((id) => counts[id] > 0)
                .map((sec) => {
                  const def = SECTIONS.find((s) => s.id === sec)!;
                  const items = assetsOfSection(assets, sec);
                  const sel = picks[sec];
                  const n = sel ? sel.length : items.length;
                  return (
                    <div key={sec} className="sp-review-pick">
                      <div className="sp-review-pick-head">
                        <span className="strong">{def.title}</span>
                        <span className="muted small">{sel ? `${n} of ${items.length} picked` : `All ${items.length}, and any you add later`}</span>
                        <div className="spacer" />
                        <button type="button" className="sp-review-linkbtn" disabled={!sel} onClick={() => pickAll(sec, true)}>
                          All
                        </button>
                        <button type="button" className="sp-review-linkbtn" disabled={sel?.length === 0} onClick={() => pickAll(sec, false)}>
                          None
                        </button>
                      </div>
                      {groupsOf(sec, items).map((g) => {
                        const ids = g.items.map((a) => a.id);
                        const onCount = ids.filter((id) => !sel || sel.includes(id)).length;
                        return (
                          <div key={g.key} className="sp-review-pick-group">
                            {g.name && (
                              <div className="sp-review-pick-sub">
                                <span>{g.name}</span>
                                <span className="muted small">
                                  {onCount} of {g.items.length}
                                </span>
                                <button type="button" className="sp-review-linkbtn" disabled={onCount === ids.length} onClick={() => pickGroup(sec, ids, true)}>
                                  All
                                </button>
                                <button type="button" className="sp-review-linkbtn" disabled={onCount === 0} onClick={() => pickGroup(sec, ids, false)}>
                                  None
                                </button>
                              </div>
                            )}
                            <div className="sp-review-pick-grid">
                              {g.items.map((a) => {
                                const on = !sel || sel.includes(a.id);
                                return (
                                  <button key={a.id} type="button" className={`sp-review-tile ${on ? 'on' : ''}`} aria-pressed={on} title={a.name || 'Untitled'} onClick={() => pickItem(sec, a.id)}>
                                    <PickThumb a={a} />
                                    <span className="sp-review-tile-name ellipsis">{a.name || a.fileName || 'Untitled'}</span>
                                    <span className="sp-review-tile-check">{on && <Check size={12} />}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
            </div>
          )}
          {/* below the picker, so the items are picked first */}
          <div className="sp-review-create">
            <span className="muted small">{sections.length ? `Shares ${sectionSummary(sections, picks, counts)}` : 'Tick at least one section'}</span>
            <Button variant="primary" icon={Send} disabled={busy || !sections.length} onClick={() => void create()}>
              Create link
            </Button>
          </div>

          {links.length > 0 && <h3 className="sp-review-h">Review links · click one to see its feedback</h3>}
          {links.map((l) => (
            <LinkRow key={l.token} link={l} fresh={l.token === made} onOpen={() => setViewing(l.token)} />
          ))}
        </div>
      )}
    </Modal>
  );
}

function LinkRow({ link: l, fresh, onOpen }: { link: ReviewLink; fresh: boolean; onOpen: () => void }) {
  const url = reviewApi.url(l.token);
  const n = l.responses.length;
  return (
    <div className={`sp-review-link ${isOpen(l) ? '' : 'closed'} ${fresh ? 'fresh' : ''}`}>
      <button type="button" className="sp-review-row" onClick={onOpen} title="See the feedback and manage the link">
        <span className="grow">
          <span className="strong">{l.title}</span>
          <span className="muted small sp-review-meta">
            {sectionNames(l)} · {statusOf(l)} · {plural(l.views || 0, 'view')}
          </span>
        </span>
        <span className={`sp-review-count ${n ? 'has' : ''}`}>
          <MessageSquareText size={14} /> {n ? plural(n, 'response') : 'No feedback yet'}
        </span>
        <ChevronRight size={16} className="muted" />
      </button>
      {fresh && (
        <div className="sp-review-url">
          <Check size={14} /> Link copied: <code>{url}</code>
        </div>
      )}
    </div>
  );
}

/** "3 of 14 Images & references, all Video / footage" */
const sectionSummary = (sections: SectionId[], picks: Partial<Record<SectionId, string[]>>, counts: Record<SectionId, number>) =>
  sections
    .map((id) => {
      const t = SECTIONS.find((s) => s.id === id)!.title;
      return picks[id] ? `${picks[id]!.length} of ${counts[id]} ${t}` : `all ${t}`;
    })
    .join(', ');

const sectionNames = (l: ReviewLink) =>
  l.sections
    .map((id) => {
      const t = SECTIONS.find((s) => s.id === id)?.title ?? id;
      return l.picks?.[id] ? `${t} (${plural(l.picks[id].length, 'item')})` : t;
    })
    .join(', ');
const statusOf = (l: ReviewLink) => (l.revoked ? 'Turned off' : !isOpen(l) ? 'Expired' : l.expiresAt ? `Open until ${new Date(l.expiresAt).toLocaleDateString()}` : 'Open');

/** One review link: its feedback by item and by person, and the link's controls. */
function LinkDetail({ link: l, assets, spaceId, reload, onBack }: { link: ReviewLink; assets: BrandAsset[]; spaceId: string; reload: () => void; onBack: () => void }) {
  const url = reviewApi.url(l.token);
  const open = isOpen(l);
  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };
  const responses = useMemo(() => [...l.responses].reverse(), [l.responses]);
  // every item someone gave a decision or a comment on, in Brand Kit order
  const byItem = useMemo(() => {
    const ids = new Set(responses.flatMap((r) => Object.keys(r.items)));
    const known = assets.filter((a) => ids.has(a.id));
    const gone = [...ids].filter((id) => !assets.some((a) => a.id === id));
    return [...known.map((a) => ({ id: a.id, a })), ...gone.map((id) => ({ id, a: undefined }))].map(({ id, a }) => ({
      id,
      a,
      notes: responses.filter((r) => r.items[id]).map((r) => ({ r, f: r.items[id] })),
    }));
  }, [responses, assets]);
  const tally = useMemo(() => {
    let approve = 0;
    let changes = 0;
    for (const r of l.responses) for (const f of Object.values(r.items)) f.decision === 'approve' ? approve++ : f.decision === 'changes' && changes++;
    return { approve, changes };
  }, [l.responses]);
  const overall = responses.filter((r) => r.overall || r.decision);

  return (
    <div className="sp-review-detail">
      <button type="button" className="sp-review-back" onClick={onBack}>
        <ArrowLeft size={14} /> All review links
      </button>
      <div className="sp-review-detail-head">
        <div className="grow">
          <h3>{l.title}</h3>
          <div className="muted small">
            {sectionNames(l)} · {statusOf(l)} · {plural(l.views || 0, 'view')} · by {l.createdByName}, {when(l.createdAt)}
          </div>
        </div>
        <Button size="sm" icon={Copy} disabled={!open} onClick={() => void copyText(url, 'the review link')}>
          Copy link
        </Button>
        <Button size="sm" variant="ghost" icon={ExternalLink} disabled={!open} title="Open the review page" onClick={() => window.open(url, '_blank', 'noopener')} />
        <Button
          size="sm"
          variant="ghost"
          icon={Power}
          title={l.revoked ? 'Turn the link back on' : 'Turn the link off'}
          onClick={() => void act(() => reviewApi.change(spaceId, l.token, { revoked: !l.revoked }))}
        />
        <Button
          size="sm"
          variant="ghost"
          icon={Trash2}
          title="Delete the link and its feedback"
          onClick={() =>
            void confirmDialog({
              title: 'Delete this review link?',
              message: `“${l.title}” stops working and its ${plural(l.responses.length, 'response')} are deleted.`,
              confirmLabel: 'Delete',
              danger: true,
            }).then((ok) => {
              if (ok) void act(() => reviewApi.remove(spaceId, l.token)).then(onBack);
            })
          }
        />
      </div>
      {l.message && <p className="sp-review-text muted">{l.message}</p>}

      {!l.responses.length ? (
        <div className="sp-review-empty">
          <MessageSquareText size={20} />
          <div>
            <div className="strong">No feedback yet</div>
            <div className="muted small">
              {open ? 'When someone sends feedback from the link, it shows up here, and you get a notice if this space is open.' : 'This link is not open, so nobody can send feedback through it.'}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="sp-review-summary">
            <span>
              <strong>{plural(l.responses.length, 'response')}</strong> from {[...new Set(l.responses.map((r) => r.name))].join(', ')}
            </span>
            {tally.approve > 0 && <span className="sp-review-dec approve">{tally.approve} approved</span>}
            {tally.changes > 0 && <span className="sp-review-dec changes">{tally.changes} need changes</span>}
          </div>

          {overall.length > 0 && (
            <>
              <h4 className="sp-review-sub">Overall</h4>
              {overall.map((r) => (
                <div key={r.id} className="sp-review-note">
                  <div className="row" style={{ gap: 8 }}>
                    <span className="strong">{r.name}</span>
                    {r.decision && <span className={`sp-review-dec ${r.decision}`}>{r.decision === 'approve' ? 'Approved all' : DECISION_LABEL[r.decision]}</span>}
                    <span className="muted small">{when(r.at)}</span>
                  </div>
                  {r.overall && <p className="sp-review-text">{r.overall}</p>}
                </div>
              ))}
            </>
          )}

          {byItem.length > 0 && (
            <>
              <h4 className="sp-review-sub">By item</h4>
              {byItem.map(({ id, a, notes }) => (
                <div key={id} className="sp-review-byitem">
                  <ItemThumb a={a} />
                  <div className="grow">
                    <div className="strong ellipsis">{a?.name || (a ? 'Untitled' : 'Item no longer in the kit')}</div>
                    {notes.map(({ r, f }) => (
                      <div key={r.id} className="sp-review-note">
                        <div className="row" style={{ gap: 8 }}>
                          <span>{r.name}</span>
                          {f.decision && <span className={`sp-review-dec ${f.decision}`}>{DECISION_LABEL[f.decision]}</span>}
                          <span className="muted small">{when(r.at)}</span>
                        </div>
                        {f.comment && <p className="sp-review-text">{f.comment}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}

const VIDEO_FILE = /\.(mp4|mov|webm|m4v)$/i;

/** Small picture of an item in the picker: its image, a video's first frame, a colour swatch, or its kind's icon. */
function PickThumb({ a }: { a: BrandAsset }) {
  const hex = a.kind === 'color' ? normalizeHex(a.value) : null;
  if (hex) return <span className="sp-review-tile-pic" style={{ background: hex }} />;
  if (a.image) return <img className="sp-review-tile-pic" src={assetUrl(a.image)} alt="" loading="lazy" />;
  if (a.file && VIDEO_FILE.test(a.fileName || a.file)) return <video className="sp-review-tile-pic" src={`${assetUrl(a.file)}#t=0.5`} muted playsInline preload="metadata" />;
  const Icon = a.file ? FileText : (SECTIONS.find((s) => s.kinds.includes(a.kind))?.icon ?? FileText);
  return (
    <span className="sp-review-tile-pic icon">
      <Icon size={18} />
    </span>
  );
}

/** A still of the item: its image, else the first frame of its video file. Click to open it full size. */
function ItemThumb({ a }: { a: BrandAsset | undefined }) {
  const src = a?.image ? assetUrl(a.image) : a?.file && VIDEO_FILE.test(a.fileName || a.file) ? assetUrl(a.file) : '';
  if (!src) return <div className="sp-review-bigthumb" />;
  return (
    <button type="button" className="sp-review-bigthumb" title="Open full size" onClick={() => window.open(src, '_blank', 'noopener')}>
      {a?.image ? <img src={src} alt="" /> : <video src={`${src}#t=0.5`} muted playsInline preload="metadata" />}
    </button>
  );
}
