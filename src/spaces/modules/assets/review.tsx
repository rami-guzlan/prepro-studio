/* Brand Kit & Assets → Share for review (hosted version only): no-sign-in review
   links for chosen sections (images, videos …), and the feedback that comes back.
   The links and feedback live on the server (server/reviews.mjs), not in the space. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, MessageSquareText, Power, Send, Trash2 } from 'lucide-react';
import type { BrandAsset } from '@/spaces/types';
import { assetUrl } from '@/backend';
import { reviewApi, type ReviewLink, type ReviewResponse } from '@/backend/cloud';
import { useSpace, useSpaceId } from '@/store/space';
import { plural } from '@/lib/text';
import { Button, Checkbox, confirmDialog, Field, Input, Modal, Select, Textarea, toast } from '@/ui';
import { copyText } from './actions';
import { assetsOfSection, SECTIONS, type SectionId } from './util';

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

  const create = async () => {
    if (!sections.length) return toast('Choose at least one section', 'error');
    setBusy(true);
    try {
      const l = await reviewApi.create(spaceId, { title, message, sections, showNotes, days: Number(days) });
      setMade(l.token);
      reload();
      await copyText(reviewApi.url(l.token), 'the review link');
    } catch (e) {
      toast(`Could not create the link: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: SectionId) => setSections((s) => (s.includes(id) ? s.filter((x) => x !== id) : SECTIONS.map((d) => d.id).filter((x) => x === id || s.includes(x))));

  return (
    <Modal open onClose={onClose} size="lg" title="Share for review">
      <div className="sp-review">
        <p className="muted small" style={{ marginTop: 0 }}>
          Anyone with the link can see the sections you choose, mark each item Approve or Needs changes, comment and send it back to you. No account needed. It always shows the current items of those sections, nothing else from this space.
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
              <div className="spacer" />
              <Button variant="primary" icon={Send} disabled={busy || !sections.length} onClick={() => void create()}>
                Create link
              </Button>
            </div>
          </div>
        </div>

        {links.length > 0 && <h3 className="sp-review-h">Review links</h3>}
        {links.map((l) => (
          <LinkCard key={l.token} link={l} fresh={l.token === made} assets={assets} spaceId={spaceId} reload={reload} />
        ))}
      </div>
    </Modal>
  );
}

function LinkCard({ link: l, fresh, assets, spaceId, reload }: { link: ReviewLink; fresh: boolean; assets: BrandAsset[]; spaceId: string; reload: () => void }) {
  const [showAll, setShowAll] = useState(fresh || l.responses.length > 0);
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
  const sectionNames = l.sections.map((id) => SECTIONS.find((s) => s.id === id)?.title ?? id).join(', ');
  const status = l.revoked ? 'Turned off' : !open ? 'Expired' : l.expiresAt ? `Open until ${new Date(l.expiresAt).toLocaleDateString()}` : 'Open';
  return (
    <div className={`sp-review-link ${open ? '' : 'closed'} ${fresh ? 'fresh' : ''}`}>
      <div className="sp-review-link-head">
        <div className="grow">
          <div className="strong">{l.title}</div>
          <div className="muted small">
            {sectionNames} · {status} · {plural(l.views || 0, 'view')} · by {l.createdByName}, {when(l.createdAt)}
          </div>
        </div>
        <Button size="sm" icon={Copy} disabled={!open} onClick={() => void copyText(url, 'the review link')}>
          Copy link
        </Button>
        <Button size="sm" variant="ghost" icon={ExternalLink} disabled={!open} title="Open the review page" onClick={() => window.open(url, '_blank', 'noopener')} />
        <Button size="sm" variant="ghost" icon={Power} title={l.revoked ? 'Turn the link back on' : 'Turn the link off'} onClick={() => void act(() => reviewApi.change(spaceId, l.token, { revoked: !l.revoked }))} />
        <Button
          size="sm"
          variant="ghost"
          icon={Trash2}
          title="Delete the link and its feedback"
          onClick={() =>
            void confirmDialog({ title: 'Delete this review link?', message: `“${l.title}” stops working and its ${plural(l.responses.length, 'response')} are deleted.`, confirmLabel: 'Delete', danger: true }).then(
              (ok) => {
                if (ok) void act(() => reviewApi.remove(spaceId, l.token));
              },
            )
          }
        />
      </div>
      {fresh && (
        <div className="sp-review-url">
          <Check size={14} /> Link copied: <code>{url}</code>
        </div>
      )}
      {l.responses.length > 0 && (
        <div className="sp-review-responses">
          <button type="button" className="sp-review-toggle" onClick={() => setShowAll((v) => !v)}>
            <MessageSquareText size={14} /> {plural(l.responses.length, 'response')} {showAll ? '▾' : '▸'}
          </button>
          {showAll && [...l.responses].reverse().map((r) => <Response key={r.id} r={r} assets={assets} />)}
        </div>
      )}
    </div>
  );
}

function Response({ r, assets }: { r: ReviewResponse; assets: BrandAsset[] }) {
  const items = Object.entries(r.items);
  return (
    <div className="sp-review-resp">
      <div className="row" style={{ gap: 8 }}>
        <span className="strong">{r.name}</span>
        {r.decision && <span className={`sp-review-dec ${r.decision}`}>{r.decision === 'approve' ? 'Approved all' : DECISION_LABEL[r.decision]}</span>}
        <span className="muted small">{when(r.at)}</span>
      </div>
      {r.overall && <p className="sp-review-text">{r.overall}</p>}
      {items.length > 0 && (
        <div className="sp-review-items">
          {items.map(([id, f]) => {
            const a = assets.find((x) => x.id === id);
            return (
              <div key={id} className="sp-review-item">
                <div className="sp-review-thumb">{a?.image ? <img src={assetUrl(a.image)} alt="" /> : null}</div>
                <div className="grow">
                  <div className="row" style={{ gap: 8 }}>
                    <span className="ellipsis">{a?.name || (a ? 'Untitled' : 'Item no longer in the kit')}</span>
                    {f.decision && <span className={`sp-review-dec ${f.decision}`}>{DECISION_LABEL[f.decision]}</span>}
                  </div>
                  {f.comment && <p className="sp-review-text">{f.comment}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
