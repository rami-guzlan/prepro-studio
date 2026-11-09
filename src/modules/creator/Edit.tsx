/* Creator workspace → Edit: a pass-by-pass checklist, the outline as a cut
   guide, exported versions and notes. */
import { useState } from 'react';
import { Copy, ExternalLink, Plus, X } from 'lucide-react';
import type { CreatorData } from '@/types';
import { uid } from '@/lib/id';
import { todayISO } from '@/lib/dates';
import { Button, IconButton, Input, Textarea, toast } from '@/ui';
import { fmtSeconds, outlineSeconds } from './model';
import { editCreator } from './ops';
import { CheckList, Section } from './shared';

const openUrl = (u: string) => window.open(/^[a-z]+:/i.test(u) ? u : `https://${u}`, '_blank', 'noopener');

export function EditTab({ c }: { c: CreatorData }) {
  const [label, setLabel] = useState('');
  const addVersion = () => {
    const n = c.edit.versions.length + 1;
    editCreator((x) => void x.edit.versions.unshift({ id: uid('ver'), label: label.trim() || `v${n}`, date: todayISO() }));
    setLabel('');
  };
  let t = 0;
  return (
    <div className="cr-cols">
      <div className="cr-col">
        <Section id="cr-editlist" title="Edit passes" hint="One at a time, top to bottom">
          <CheckList items={c.edit.checklist} list="editChecks" addLabel="Add a pass" />
        </Section>
        <Section id="cr-versions" title="Versions" hint="Each export, with a link to watch it">
          <div className="row" style={{ gap: 6, marginBottom: 8 }}>
            <Input value={label} placeholder={`v${c.edit.versions.length + 1} (rough cut, final …)`} onChange={setLabel} onKeyDown={(e) => e.key === 'Enter' && addVersion()} />
            <Button icon={Plus} onClick={addVersion}>
              Log export
            </Button>
          </div>
          {c.edit.versions.map((v) => (
            <div key={v.id} className="cr-version">
              <b>{v.label}</b>
              <span className="muted small">{v.date}</span>
              <Input bare size="sm" value={v.url} placeholder="Link (Drive, Frame.io, unlisted video …)" onChange={(url) => editCreator((x) => void (x.edit.versions.find((y) => y.id === v.id)!.url = url || undefined), `verurl:${v.id}`)} />
              {v.url && <IconButton icon={ExternalLink} size="sm" label="Open" onClick={() => openUrl(v.url!)} />}
              <Input bare size="sm" value={v.note} placeholder="Notes" onChange={(note) => editCreator((x) => void (x.edit.versions.find((y) => y.id === v.id)!.note = note || undefined), `vernote:${v.id}`)} />
              <IconButton icon={X} size="sm" label="Remove" onClick={() => editCreator((x) => void (x.edit.versions = x.edit.versions.filter((y) => y.id !== v.id)))} />
            </div>
          ))}
        </Section>
      </div>
      <div className="cr-col">
        <Section title="Cut guide" hint={c.idea.beats.length ? `target about ${fmtSeconds(outlineSeconds(c.idea.beats))}` : 'Your outline shows here'}>
          {c.idea.beats.length === 0 ? (
            <p className="muted small">Outline the beats on the Idea tab and they show here as the order of the cut.</p>
          ) : (
            <ol className="cr-cutguide">
              {c.idea.beats.map((b) => {
                const at = t;
                t += b.seconds ?? 0;
                return (
                  <li key={b.id} className={b.kind ?? 'point'}>
                    <span className="mono small">{fmtSeconds(at)}</span>
                    <span className="grow">{b.text || <span className="muted">Untitled beat</span>}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </Section>
        <Section title="Project file">
          <div className="row" style={{ gap: 6 }}>
            <Input value={c.edit.projectFile} placeholder="e.g. D:\Edits\my-video.prproj or a link" onChange={(projectFile) => editCreator((x) => void (x.edit.projectFile = projectFile), 'projfile')} />
            <IconButton icon={Copy} label="Copy" disabled={!c.edit.projectFile} onClick={() => void navigator.clipboard.writeText(c.edit.projectFile).then(() => toast('Copied'))} />
          </div>
        </Section>
        <Section title="Edit notes">
          <Textarea autoGrow minRows={4} value={c.edit.notes} placeholder="Cut this, keep that, music idea, feedback to apply…" onChange={(notes) => editCreator((x) => void (x.edit.notes = notes), 'editnotes')} />
        </Section>
      </div>
    </div>
  );
}
