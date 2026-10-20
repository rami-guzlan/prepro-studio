import { useEffect, useState } from 'react';
import { BookOpen, Building2, Clapperboard, FilePlus2, Film, GraduationCap, LayoutTemplate, Megaphone, Mic, Music, Popcorn, Smartphone, Sparkles, Tv, Video } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ProjectSummary, ProjectType } from '@/types';
import { PROJECT_TYPES } from '@/lib/constants';
import { AV_TYPES } from '@/store/defaults';
import { backend } from '@/backend';
import { Button, Checkbox, ColorPicker, Field, Input, Modal, Select } from '@/ui';
import { createAndOpen, type CopyFromOptions } from './projectActions';

const TYPE_ICONS: Record<ProjectType, LucideIcon> = {
  short: Clapperboard,
  feature: Film,
  commercial: Megaphone,
  music_video: Music,
  trailer: Popcorn,
  corporate: Building2,
  training: GraduationCap,
  social: Smartphone,
  documentary: BookOpen,
  minidoc: Video,
  interview: Mic,
  episodic: Tv,
  other: Sparkles,
};

/** What the template adds, per type (shown under the "Template" choice). */
function templateSummary(type: ProjectType): string {
  switch (type) {
    case 'trailer':
      return 'Trailer beat structure (hook → setup → escalation → title → button → end card), trailer checklist, 8 deliverables (master, teaser, 9:16, 1:1, bumper, textless…), graphics list, budget & gear.';
    case 'minidoc':
      return 'Mini-doc story structure (cold open → subject → challenge → journey → resolution), interview & B-roll checklist, deliverables with social cutdowns, lower thirds, budget & interview gear.';
    case 'social':
      return 'Checklist, platform deliverables (YouTube, Shorts, Reels, LinkedIn), budget & gear list.';
    case 'corporate':
    case 'training':
      return 'Client-approval checklist, web/LMS deliverables with captions, budget & gear list.';
    default:
      return 'Pre-production checklist, post schedule, deliverables, budget template & gear list.';
  }
}

const COPY_DEFAULT: Omit<CopyFromOptions, 'sourceId'> = { branding: true, cast: true, crew: true, locations: true };

export function NewProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ProjectType>('short');
  const [mode, setMode] = useState<'screenplay' | 'av'>('screenplay');
  const [modeTouched, setModeTouched] = useState(false);
  const [color, setColor] = useState('#7c5cff');
  const [start, setStart] = useState<'template' | 'blank'>('template');
  const [busy, setBusy] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [copy, setCopy] = useState(COPY_DEFAULT);

  useEffect(() => {
    if (!open) return;
    backend
      .listProjects()
      .then(setProjects)
      .catch(() => setProjects([]));
  }, [open]);

  const source = projects.find((p) => p.id === sourceId);
  const suggestedTitle = source ? `${source.title} — ${type === 'trailer' ? 'Trailer' : type === 'minidoc' ? 'Behind the Scenes' : type === 'social' ? 'Social Cutdowns' : 'Companion'}` : '';

  const create = async () => {
    setBusy(true);
    const p = await createAndOpen(
      { title: title.trim() || suggestedTitle || 'Untitled Project', projectType: type, scriptMode: mode, color, withTemplates: start === 'template' },
      sourceId ? { sourceId, ...copy } : undefined,
    );
    setBusy(false);
    if (p) {
      onClose();
      setTitle('');
      setSourceId('');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New project"
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={create} disabled={busy}>
            {busy ? 'Creating…' : start === 'blank' ? 'Create blank project' : 'Create project'}
          </Button>
        </>
      }
    >
      <div className="col" style={{ gap: 16 }}>
        <Field label="Project title">
          <Input
            autoFocus
            value={title}
            onChange={setTitle}
            placeholder={suggestedTitle || 'e.g. Spring Campaign — Hero Film'}
            onKeyDown={(e) => {
              if (e.key === 'Enter') create();
            }}
          />
        </Field>
        <Field label="What are you making?">
          <div className="type-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {PROJECT_TYPES.map((t) => {
              const Icon = TYPE_ICONS[t.value] ?? Sparkles;
              return (
                <button
                  key={t.value}
                  type="button"
                  className={`type-option ${type === t.value ? 'on' : ''}`}
                  onClick={() => {
                    setType(t.value);
                    if (!modeTouched) setMode(AV_TYPES.includes(t.value) ? 'av' : 'screenplay');
                  }}
                >
                  <Icon />
                  <span className="t">{t.label}</span>
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
                An empty project — no checklist, structure, deliverables, budget or gear. Build everything yourself.
              </span>
            </button>
          </div>
        </Field>

        <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Field label="Script format" hint={mode === 'av' ? 'Two columns: picture on the left, sound / narration on the right.' : 'Industry screenplay format (Final Draft style).'}>
            <Select
              value={mode}
              onChange={(v) => {
                setMode(v as 'screenplay' | 'av');
                setModeTouched(true);
              }}
              options={[
                { value: 'screenplay', label: 'Screenplay' },
                { value: 'av', label: 'Two-column A/V script' },
              ]}
            />
          </Field>
          <Field label="Project colour">
            <ColorPicker value={color} onChange={(c) => setColor(c ?? '#7c5cff')} />
          </Field>
        </div>

        {projects.length > 0 && (
          <Field label="Based on an existing project (optional)" hint="Great for a trailer, teaser or BTS mini-doc of a film you already planned here.">
            <Select
              value={sourceId}
              onChange={setSourceId}
              placeholder="— Start fresh —"
              options={projects.map((p) => ({ value: p.id, label: p.title }))}
            />
            {sourceId && (
              <div className="row wrap" style={{ gap: 16, marginTop: 8 }}>
                <span className="muted small">Copy:</span>
                <Checkbox checked={copy.branding} onChange={(v) => setCopy({ ...copy, branding: v })} label="Branding & key people" />
                <Checkbox checked={copy.cast} onChange={(v) => setCopy({ ...copy, cast: v })} label="Cast & characters" />
                <Checkbox checked={copy.crew} onChange={(v) => setCopy({ ...copy, crew: v })} label="Crew & contacts" />
                <Checkbox checked={copy.locations} onChange={(v) => setCopy({ ...copy, locations: v })} label="Locations" />
              </div>
            )}
          </Field>
        )}
      </div>
    </Modal>
  );
}
