/* Creator workspace → Publish: final title, description (with chapters from the
   outline), tags and thumbnail, every platform's status, and how it did. */
import { useState } from 'react';
import { Copy, ExternalLink, ListOrdered, Plus, X } from 'lucide-react';
import type { CreatorData, CreatorPlatform } from '@/types';
import { uid } from '@/lib/id';
import { Button, DateInput, IconButton, ImageDrop, Input, Menu, Select, Textarea, toast } from '@/ui';
import { PLATFORMS, chaptersFromBeats } from './model';
import { editCreator } from './ops';
import { CheckList, Section } from './shared';

const copy = (text: string, what: string) => void navigator.clipboard.writeText(text).then(() => toast(`Copied the ${what}`));
const STATUS = [
  { value: 'todo', label: 'Not yet' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'live', label: 'Live' },
];

const platOps = {
  set: (id: string, patch: Partial<CreatorPlatform>, coalesce = false) =>
    editCreator((c) => {
      const p = c.publish.platforms.find((x) => x.id === id);
      if (p) Object.assign(p, patch);
    }, coalesce ? `plat:${id}` : undefined),
  add: (platform: string) => editCreator((c) => void c.publish.platforms.push({ id: uid('plat'), platform, status: 'todo' })),
  remove: (id: string) => editCreator((c) => void (c.publish.platforms = c.publish.platforms.filter((x) => x.id !== id))),
};

export function PublishTab({ c }: { c: CreatorData }) {
  const [custom, setCustom] = useState('');
  const picked = c.idea.titles.find((t) => t.picked)?.text;
  const missing = PLATFORMS.filter((p) => !c.publish.platforms.some((x) => x.platform === p));
  return (
    <div className="cr-cols">
      <div className="cr-col">
        <Section id="cr-pubtitle" title="Title" actions={<IconButton icon={Copy} size="sm" label="Copy the title" disabled={!c.publish.title} onClick={() => copy(c.publish.title, 'title')} />}>
          <Input value={c.publish.title} placeholder={picked ?? 'The title people will click'} onChange={(title) => editCreator((x) => void (x.publish.title = title), 'pubtitle')} />
          <span className={`cr-count ${c.publish.title.length > 100 ? 'over' : c.publish.title.length > 60 ? 'warn' : ''}`}>{c.publish.title.length} / 100 (aim for under 60)</span>
        </Section>
        <Section
          id="cr-desc"
          title="Description"
          actions={
            <>
              <Button size="sm" variant="ghost" icon={ListOrdered} disabled={!c.idea.beats.length} title="Add chapters from the outline (times from each beat’s length)" onClick={() => editCreator((x) => void (x.publish.description = `${x.publish.description.trim()}\n\nChapters\n${chaptersFromBeats(x.idea.beats)}`.trim()))}>
                Add chapters
              </Button>
              <IconButton icon={Copy} size="sm" label="Copy the description" disabled={!c.publish.description} onClick={() => copy(c.publish.description, 'description')} />
            </>
          }
        >
          <Textarea autoGrow minRows={6} value={c.publish.description} placeholder={'First two lines show before “more”: lead with the payoff.\n\nLinks, chapters, credits…'} onChange={(description) => editCreator((x) => void (x.publish.description = description), 'desc')} />
        </Section>
        <Section title="Tags / hashtags" actions={<IconButton icon={Copy} size="sm" label="Copy the tags" disabled={!c.publish.tags} onClick={() => copy(c.publish.tags, 'tags')} />}>
          <Input value={c.publish.tags} placeholder="comma separated, or #hashtags for social" onChange={(tags) => editCreator((x) => void (x.publish.tags = tags), 'tags')} />
        </Section>
        <Section id="cr-pubthumb" title="Final thumbnail" hint="1280 × 720, readable at phone size">
          <div style={{ maxWidth: 420 }}>
            <ImageDrop value={c.publish.thumbnail} aspect={16 / 9} label="Drop the final thumbnail" onChange={(thumbnail) => editCreator((x) => void (x.publish.thumbnail = thumbnail))} />
          </div>
        </Section>
      </div>
      <div className="cr-col">
        <Section
          id="cr-platforms"
          title="Where it goes"
          actions={
            missing.length > 0 && (
              <Menu
                align="end"
                trigger={
                  <Button size="sm" variant="ghost" icon={Plus}>
                    Platform
                  </Button>
                }
                items={missing.map((p) => ({ label: p, onClick: () => platOps.add(p) }))}
              />
            )
          }
        >
          {c.publish.platforms.map((p) => (
            <div key={p.id} className={`cr-platform ${p.status}`}>
              <b className="ellipsis">{p.platform}</b>
              <Select size="sm" value={p.status} options={STATUS} onChange={(v) => platOps.set(p.id, { status: v as CreatorPlatform['status'] })} aria-label="Status" />
              <DateInput size="sm" value={p.date} onChange={(date) => platOps.set(p.id, { date })} />
              <Input size="sm" value={p.url} placeholder="Link once it’s up" onChange={(url) => platOps.set(p.id, { url: url || undefined }, true)} />
              {p.url && <IconButton icon={ExternalLink} size="sm" label="Open" onClick={() => window.open(/^[a-z]+:/i.test(p.url!) ? p.url : `https://${p.url}`, '_blank', 'noopener')} />}
              <IconButton icon={X} size="sm" label="Remove" onClick={() => platOps.remove(p.id)} />
            </div>
          ))}
          <div className="row" style={{ gap: 6, marginTop: 6 }}>
            <Input size="sm" value={custom} placeholder="Another place (newsletter, podcast…)" onChange={setCustom} onKeyDown={(e) => {
              if (e.key === 'Enter' && custom.trim()) {
                platOps.add(custom.trim());
                setCustom('');
              }
            }} />
          </div>
        </Section>
        <Section id="cr-publist" title="Launch checklist">
          <CheckList items={c.publish.checklist} list="publishChecks" addLabel="Add a step" />
        </Section>
        <Section id="cr-results" title="How it did" hint="Views, watch time, comments worth answering, what to do next time">
          <Textarea autoGrow minRows={4} value={c.publish.results} placeholder={'24 hours: …\n7 days: …\nNext time: …'} onChange={(results) => editCreator((x) => void (x.publish.results = results), 'results')} />
        </Section>
      </div>
    </div>
  );
}
