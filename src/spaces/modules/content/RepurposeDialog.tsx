/* Repurpose: turn one piece (a long video, a trailer …) into several derived
   pieces (sourceId = original) with their own formats and channels. */
import { useMemo, useState } from 'react';
import { Plus, Recycle, X } from 'lucide-react';
import type { ID } from '@/types';
import { useSpace, updateSpace } from '@/store/space';
import { FORMATS } from '@/spaces/constants';
import { makeContent, makePost } from '@/spaces/defaults';
import { channelColor } from '@/spaces/derive';
import type { Channel, ContentFormat, ContentPiece } from '@/spaces/types';
import { uid } from '@/lib/id';
import { truncate } from '@/lib/text';
import { Button, IconButton, Input, Modal, Select, toast } from '@/ui';
import { FormatIcon } from './parts';
import { FORMAT_NOUN, defaultChannelsFor, formatLabel } from './shared';
import { closeRepurpose, useContentDialogs } from './store';

interface Draft {
  key: string;
  format: ContentFormat;
  title: string;
  channelIds: ID[];
}

const PRESETS: { label: string; formats: ContentFormat[] }[] = [
  { label: '3 shorts', formats: ['short_video', 'short_video', 'short_video'] },
  { label: 'Carousel', formats: ['carousel'] },
  { label: 'Newsletter blurb', formats: ['newsletter'] },
  { label: 'Thread / text post', formats: ['text'] },
  { label: 'Teaser', formats: ['teaser'] },
  { label: 'Still / quote card', formats: ['image'] },
  { label: 'Stories', formats: ['story'] },
  { label: 'Blog article', formats: ['article'] },
];

export function RepurposeDialog() {
  const id = useContentDialogs((s) => s.repurposeId);
  const source = useSpace((s) => (id ? s.content.find((c) => c.id === id) : undefined));
  if (!id || !source) return null;
  return <RepurposeForm key={id} source={source} />;
}

function RepurposeForm({ source }: { source: ContentPiece }) {
  const channels = useSpace((s) => s.channels) ?? [];
  const content = useSpace((s) => s.content) ?? [];
  const active = useMemo(() => channels.filter((c) => c.active), [channels]);
  const existing = useMemo(() => content.filter((c) => c.sourceId === source.id).length, [content, source.id]);
  const [rows, setRows] = useState<Draft[]>([]);
  const base = source.title?.trim() || 'Untitled content';

  const titleFor = (format: ContentFormat, list: Draft[]) => {
    const same = list.filter((r) => r.format === format).length;
    const noun = FORMAT_NOUN[format];
    return same > 0 || format === 'short_video' || format === 'image' || format === 'story' ? `${base} — ${noun} #${same + 1}` : `${base} — ${noun}`;
  };

  const add = (formats: ContentFormat[]) =>
    setRows((list) => {
      const next = [...list];
      for (const f of formats) next.push({ key: uid('rp'), format: f, title: titleFor(f, next), channelIds: defaultChannelsFor(f, channels) });
      return next;
    });

  const patch = (key: string, p: Partial<Draft>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const create = () => {
    if (!rows.length) return;
    const pieces = rows.map((r) =>
      makeContent({
        title: r.title.trim() || titleFor(r.format, []),
        format: r.format,
        stage: 'idea',
        sourceId: source.id,
        concept: source.concept,
        pillarId: source.pillarId,
        campaignId: source.campaignId,
        projectId: source.projectId,
        personaId: source.personaId,
        goalIds: source.goalIds?.length ? [...source.goalIds] : undefined,
        keywords: source.keywords,
        cta: source.cta,
        owner: source.owner,
        priority: source.priority,
        posts: r.channelIds.filter((cid) => channels.some((c) => c.id === cid)).map((cid) => makePost(cid)),
      }),
    );
    for (const p of pieces) for (const k of Object.keys(p) as (keyof ContentPiece)[]) if (p[k] === undefined) delete p[k];
    updateSpace((d) => {
      const i = d.content.findIndex((c) => c.id === source.id);
      d.content.splice(i < 0 ? d.content.length : i + 1, 0, ...pieces);
    });
    toast(`Created ${pieces.length} piece${pieces.length === 1 ? '' : 's'} from “${truncate(base, 40)}”`);
    closeRepurpose();
  };

  return (
    <Modal
      open
      size="lg"
      title={
        <span className="row" style={{ gap: 8 }}>
          <Recycle size={17} /> Repurpose
        </span>
      }
      onClose={closeRepurpose}
      footer={
        <>
          <span className="muted small" style={{ marginRight: 'auto' }}>
            New pieces start as ideas and keep a link to the original.
          </span>
          <Button onClick={closeRepurpose}>Cancel</Button>
          <Button variant="primary" disabled={!rows.length} onClick={create} title="Ctrl+Enter">
            {rows.length ? `Create ${rows.length} piece${rows.length === 1 ? '' : 's'}` : 'Create'}
          </Button>
        </>
      }
    >
      <div
        className="sp-content-rp"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            create();
          }
        }}
      >
        <div className="sp-content-rp-source">
          <FormatIcon format={source.format} size={18} />
          <div className="grow">
            <div className="strong ellipsis">{base}</div>
            <div className="muted small">
              {formatLabel(source.format)} · concept, pillar, campaign, persona, goals and linked project are copied
              {existing ? ` · ${existing} piece${existing === 1 ? '' : 's'} already made from it` : ''}
            </div>
          </div>
        </div>

        <div className="sp-content-new-label">Quick add</div>
        <div className="sp-content-rp-presets">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="sp-content-rp-preset" onClick={() => add(p.formats)}>
              <FormatIcon format={p.formats[0]} size={14} />
              {p.label}
            </button>
          ))}
          <button type="button" className="sp-content-rp-preset ghost" onClick={() => add(['short_video'])}>
            <Plus size={14} /> Custom
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="sp-content-rp-empty">Pick what to make from it, e.g. three shorts for TikTok, Reels and Shorts, a carousel and a newsletter blurb.</div>
        ) : (
          <div className="sp-content-rp-rows">
            {rows.map((r) => (
              <div key={r.key} className="sp-content-rp-row">
                <div className="sp-content-rp-row-main">
                  <span className="sp-content-rp-icon">
                    <FormatIcon format={r.format} size={15} />
                  </span>
                  <Select
                    size="sm"
                    value={r.format}
                    options={FORMATS}
                    onChange={(v) => {
                      const f = v as ContentFormat;
                      patch(r.key, { format: f, channelIds: defaultChannelsFor(f, channels) });
                    }}
                    style={{ width: 170 }}
                    aria-label="Format"
                  />
                  <Input size="sm" value={r.title} onChange={(v) => patch(r.key, { title: v })} placeholder="Title" aria-label="Title" style={{ flex: 1 }} />
                  <IconButton icon={X} size="sm" label="Remove" onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))} />
                </div>
                {active.length > 0 && <ChannelToggles channels={active} value={r.channelIds} onChange={(ids) => patch(r.key, { channelIds: ids })} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function ChannelToggles({ channels, value, onChange }: { channels: Channel[]; value: ID[]; onChange: (ids: ID[]) => void }) {
  return (
    <div className="sp-content-channel-picks sm">
      {channels.map((ch) => {
        const on = value.includes(ch.id);
        return (
          <button
            key={ch.id}
            type="button"
            className={`sp-content-channel-pick ${on ? 'on' : ''}`}
            style={{ ['--ch' as string]: channelColor(ch) }}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== ch.id) : [...value, ch.id])}
          >
            <span className="box" />
            {ch.name}
          </button>
        );
      })}
    </div>
  );
}
