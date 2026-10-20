/* New content dialog: title, format grid, stage, pillar, campaign, channels and
   an optional first post date → creates the piece + its posts and opens the editor. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Radio } from 'lucide-react';
import type { ID } from '@/types';
import { readLS, writeLS, navigateSpace } from '@/store/app';
import { useSpace } from '@/store/space';
import { FORMATS, STAGES } from '@/spaces/constants';
import { channelColor } from '@/spaces/derive';
import type { ContentFormat, ContentStage } from '@/spaces/types';
import { openContent } from '@/spaces/ui';
import { Button, DateInput, Field, Input, Kbd, Modal, Select, TimeInput } from '@/ui';
import { createContent, defaultChannelsFor } from './shared';
import { closeNewContent, useContentDialogs, type NewContentPreset } from './store';

export const LS_LAST_FORMAT = 'prepro.space.content.lastFormat';

export function NewContentDialog() {
  const preset = useContentDialogs((s) => s.create);
  if (!preset) return null;
  return <NewContentForm preset={preset} />;
}

function NewContentForm({ preset }: { preset: NewContentPreset }) {
  const channels = useSpace((s) => s.channels) ?? [];
  const pillars = useSpace((s) => s.pillars) ?? [];
  const campaigns = useSpace((s) => s.campaigns) ?? [];
  const active = useMemo(() => channels.filter((c) => c.active), [channels]);

  const [title, setTitle] = useState(preset.title ?? '');
  const [format, setFormat] = useState<ContentFormat>(preset.format ?? readLS<ContentFormat>(LS_LAST_FORMAT, 'short_video'));
  const [stage, setStage] = useState<ContentStage>(preset.stage ?? 'idea');
  const [pillarId, setPillarId] = useState(preset.pillarId ?? '');
  const [campaignId, setCampaignId] = useState(preset.campaignId ?? '');
  const [touched, setTouched] = useState(!!preset.channelIds);
  const [channelIds, setChannelIds] = useState<ID[]>(() => preset.channelIds ?? defaultChannelsFor(preset.format ?? readLS<ContentFormat>(LS_LAST_FORMAT, 'short_video'), channels));
  const [date, setDate] = useState<string | undefined>(preset.date);
  const [time, setTime] = useState<string | undefined>();
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => titleRef.current?.focus());
  }, []);

  const pickFormat = (f: ContentFormat) => {
    setFormat(f);
    if (!touched) setChannelIds(defaultChannelsFor(f, channels));
  };

  const toggleChannel = (id: ID) => {
    setTouched(true);
    setChannelIds((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  };

  const submit = () => {
    const ids = channelIds.filter((id) => channels.some((c) => c.id === id));
    const c = createContent(
      {
        title,
        format,
        stage,
        pillarId: pillarId || undefined,
        campaignId: campaignId || undefined,
        owner: preset.owner || undefined,
      },
      { channelIds: ids, date: ids.length ? date : undefined, time },
    );
    writeLS(LS_LAST_FORMAT, format);
    closeNewContent();
    openContent(c.id, preset.openTab ?? 'brief');
  };

  return (
    <Modal
      open
      size="lg"
      title="New content"
      onClose={closeNewContent}
      footer={
        <>
          <span className="muted small row" style={{ gap: 4, marginRight: 'auto' }}>
            <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> to create
          </span>
          <Button onClick={closeNewContent}>Cancel</Button>
          <Button variant="primary" onClick={submit}>
            Create & open
          </Button>
        </>
      }
    >
      <div
        className="sp-content-new"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit();
          }
        }}
      >
        <Input
          ref={titleRef}
          className="sp-content-new-title"
          value={title}
          placeholder="What is it? e.g. “3 lighting tricks for night interiors”"
          onChange={setTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
              e.preventDefault();
              submit();
            }
          }}
          aria-label="Title"
        />

        <div className="sp-content-new-label">Format</div>
        <div className="sp-content-format-grid" role="radiogroup" aria-label="Format">
          {FORMATS.map((f) => {
            const Icon = f.icon;
            const on = f.value === format;
            return (
              <button key={f.value} type="button" role="radio" aria-checked={on} className={`sp-content-format-btn ${on ? 'on' : ''}`} onClick={() => pickFormat(f.value)}>
                <Icon size={18} />
                <span>{f.label}</span>
              </button>
            );
          })}
        </div>

        <div className="sp-content-new-grid">
          <Field label="Stage">
            <Select value={stage} options={STAGES} onChange={(v) => setStage(v as ContentStage)} />
          </Field>
          <Field label="Pillar">
            <Select value={pillarId} options={pillars.map((p) => ({ value: p.id, label: p.name }))} placeholder={pillars.length ? 'No pillar' : 'No pillars yet'} onChange={setPillarId} />
          </Field>
          <Field label="Campaign">
            <Select value={campaignId} options={campaigns.map((p) => ({ value: p.id, label: p.name }))} placeholder={campaigns.length ? 'No campaign' : 'No campaigns yet'} onChange={setCampaignId} />
          </Field>
        </div>

        <div className="sp-content-new-label">Publish on</div>
        {active.length === 0 ? (
          <div className="sp-content-new-nochannels">
            <Radio size={16} />
            <span>No active channels yet. Add the platforms you publish on to plan posts per channel.</span>
            <Button
              size="sm"
              onClick={() => {
                closeNewContent();
                navigateSpace('channels');
              }}
            >
              Set up channels
            </Button>
          </div>
        ) : (
          <>
            <div className="sp-content-channel-picks">
              {active.map((ch) => {
                const on = channelIds.includes(ch.id);
                return (
                  <button
                    key={ch.id}
                    type="button"
                    className={`sp-content-channel-pick ${on ? 'on' : ''}`}
                    style={{ ['--ch' as string]: channelColor(ch) }}
                    aria-pressed={on}
                    onClick={() => toggleChannel(ch.id)}
                  >
                    <span className="box" />
                    {ch.name}
                  </button>
                );
              })}
            </div>
            <div className="row" style={{ marginTop: 10, gap: 10 }}>
              <Field label="First post date (optional)" style={{ width: 200 }}>
                <DateInput value={date} onChange={setDate} disabled={channelIds.length === 0} />
              </Field>
              <Field label="Time" style={{ width: 130 }}>
                <TimeInput value={time} onChange={setTime} disabled={channelIds.length === 0 || !date} />
              </Field>
              <span className="muted small" style={{ alignSelf: 'flex-end', paddingBottom: 7 }}>
                {channelIds.length === 0 ? 'Pick channels to plan posts' : `${channelIds.length} post${channelIds.length === 1 ? '' : 's'} will be planned`}
              </span>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
