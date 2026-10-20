/* New Marketing Space: name, type, starting template, optional linked projects. */
import { useEffect, useState } from 'react';
import { FilePlus2, LayoutTemplate } from 'lucide-react';
import type { ProjectSummary } from '@/types';
import type { SpaceType } from '@/spaces/types';
import { SPACE_TYPES } from '@/spaces/constants';
import { todayISO } from '@/lib/dates';
import { backend } from '@/backend';
import { Button, ColorPicker, DateInput, Field, Input, Modal, MultiSelect, Textarea } from '@/ui';
import { createSpaceAndOpen } from './spaceActions';

const TYPE_COLORS: Record<SpaceType, string> = {
  personal_brand: '#7c5cff',
  channel: '#e5484d',
  campaign: '#e8590c',
  business: '#0a66c2',
  event: '#e64980',
  other: '#15aabf',
};

function templateSummary(type: SpaceType): string {
  switch (type) {
    case 'personal_brand':
      return 'YouTube, Instagram, TikTok, LinkedIn & newsletter with weekly cadences; 4 content pillars; audience & email goals; 3 starter ideas.';
    case 'channel':
      return 'YouTube + Shorts + Instagram with a weekly rhythm; pillars for episodes, cut-downs and community; subscriber & views goals.';
    case 'campaign':
      return 'Release phases (tease → trailer launch → premiere → release) with dates and milestones, launch channels incl. press, 4 pillars, goals and 6 starter content pieces (poster, teaser, trailer, cast intro, BTS, countdown).';
    case 'business':
      return 'LinkedIn, Instagram, blog & newsletter; education / customer stories / product / culture pillars; lead & reach goals.';
    case 'event':
      return 'Announce → ticket push → recap phases with milestones, channels and starter content.';
    default:
      return 'Two channels and one general pillar.';
  }
}

export function NewSpaceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<SpaceType>('personal_brand');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<string | undefined>();
  const [start, setStart] = useState<'template' | 'blank'>('template');
  const [startDate, setStartDate] = useState<string | undefined>(todayISO());
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    backend
      .listProjects()
      .then(setProjects)
      .catch(() => setProjects([]));
  }, [open]);

  const linked = projects.find((p) => p.id === projectIds[0]);
  const suggested = type === 'campaign' && linked ? `${linked.title} — Release campaign` : '';
  const timeBoxed = type === 'campaign' || type === 'event';

  const create = async () => {
    setBusy(true);
    const s = await createSpaceAndOpen(
      {
        title: title.trim() || suggested || 'Untitled Space',
        type,
        withTemplate: start === 'template',
        description: description.trim() || undefined,
        color: color ?? TYPE_COLORS[type],
        projectIds,
        startDate: timeBoxed ? startDate : undefined,
      },
      { coverFromProjectId: type === 'campaign' ? projectIds[0] : undefined },
    );
    setBusy(false);
    if (s) {
      onClose();
      setTitle('');
      setDescription('');
      setProjectIds([]);
      setColor(undefined);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New marketing space"
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={create} disabled={busy}>
            {busy ? 'Creating…' : 'Create space'}
          </Button>
        </>
      }
    >
      <div className="col" style={{ gap: 16 }}>
        <p className="muted small" style={{ margin: 0 }}>
          A space holds a marketing goal and everything around it: strategy, ideas, content from first draft to published post, a visual calendar, shoot days, campaigns,
          brand assets and results. Link production projects when the space promotes them.
        </p>
        <Field label="Name">
          <Input
            autoFocus
            value={title}
            onChange={setTitle}
            placeholder={suggested || 'e.g. My Personal Brand, Second Channel, Short Film — Release'}
            onKeyDown={(e) => {
              if (e.key === 'Enter') create();
            }}
          />
        </Field>
        <Field label="What kind of space?">
          <div className="type-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {SPACE_TYPES.map((t) => {
              const Icon = t.icon;
              return (
                <button key={t.value} type="button" className={`type-option ${type === t.value ? 'on' : ''}`} onClick={() => setType(t.value)}>
                  <Icon />
                  <span className="t">{t.label}</span>
                  <span className="muted small" style={{ lineHeight: 1.35 }}>
                    {t.description}
                  </span>
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Starting point">
          <div className="type-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button type="button" className={`type-option ${start === 'template' ? 'on' : ''}`} onClick={() => setStart('template')}>
              <LayoutTemplate />
              <span className="t">Template</span>
              <span className="muted small" style={{ lineHeight: 1.4 }}>
                {templateSummary(type)}
              </span>
            </button>
            <button type="button" className={`type-option ${start === 'blank' ? 'on' : ''}`} onClick={() => setStart('blank')}>
              <FilePlus2 />
              <span className="t">Blank</span>
              <span className="muted small" style={{ lineHeight: 1.4 }}>
                An empty space: add channels, pillars, goals and content yourself.
              </span>
            </button>
          </div>
        </Field>
        <Field label="What is this space for? (optional)">
          <Textarea value={description} onChange={setDescription} rows={2} placeholder="One or two sentences: the goal, the audience, the promise." />
        </Field>
        <div className="form-grid" style={{ gridTemplateColumns: timeBoxed ? '1fr 1fr 1fr' : '1fr 1fr' }}>
          {projects.length > 0 && (
            <Field label="Linked projects (optional)" hint="Productions this space promotes.">
              <MultiSelect value={projectIds} onChange={setProjectIds} options={projects.map((p) => ({ value: p.id, label: p.title }))} placeholder="Link a project…" />
            </Field>
          )}
          {timeBoxed && (
            <Field label="Campaign start" hint="Phases and milestones are dated from here.">
              <DateInput value={startDate} onChange={setStartDate} />
            </Field>
          )}
          <Field label="Colour">
            <ColorPicker value={color ?? TYPE_COLORS[type]} onChange={(c) => setColor(c ?? undefined)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
