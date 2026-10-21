/* Edit one sales enablement resource (text to copy, file(s) or a link). */
import { Copy, ExternalLink, Trash2 } from 'lucide-react';
import { todayISO } from '@/lib/dates';
import { Button, Checkbox, Field, Input, Modal, Select, Textarea, confirmDialog } from '@/ui';
import { ENABLEMENT_CATEGORIES, RESOURCE_KINDS } from '../../constants';
import { removeItems, updateItem } from '../../ops';
import { FileBox } from '../../files';
import type { BizResource, ResourceKind } from '../../types';
import { TagsInput, copyText, openUrl } from '../pipeline/sales-shared';

const TEXT_HINT: Record<string, string> = {
  email_template: 'Subject line first, then the body. Use [Name], [Company] … as placeholders you replace when sending.',
  call_script: 'Opening, discovery questions, how you present the offer, next step.',
  objections: 'One objection per paragraph: “It’s too expensive” → your answer.',
  faq: 'Q: … / A: … pairs you can paste into emails or proposals.',
  pricing: 'Packages, what’s included, prices and payment terms.',
};

export function ResourceDialog({ r, onClose }: { r: BizResource; onClose: () => void }) {
  const up = (patch: Partial<BizResource>, coalesce = true) => updateItem('resources', r.id, { ...patch, updatedAt: todayISO() }, coalesce);
  const isEmpty = !r.title.trim() && !r.text?.trim() && !r.url?.trim() && !(r.files ?? []).length && !r.description;
  const close = () => {
    if (isEmpty) removeItems('resources', [r.id]);
    onClose();
  };
  const remove = async () => {
    if (await confirmDialog({ title: `Delete “${r.title || 'resource'}”?`, message: 'Its files are removed from the kit too. You can undo with Ctrl+Z.', confirmLabel: 'Delete', danger: true })) {
      removeItems('resources', [r.id]);
      onClose();
    }
  };
  return (
    <Modal
      open
      size="lg"
      onClose={close}
      title={r.title || 'New sales resource'}
      footer={
        <>
          <Button variant="ghost" icon={Trash2} onClick={() => void remove()}>
            Delete
          </Button>
          <div className="spacer" />
          {r.kind === 'text' && (
            <Button icon={Copy} disabled={!r.text?.trim()} onClick={() => void copyText(r.text ?? '', 'Copied to the clipboard')}>
              Copy text
            </Button>
          )}
          {r.kind === 'link' && (
            <Button icon={ExternalLink} disabled={!r.url} onClick={() => openUrl(r.url)}>
              Open link
            </Button>
          )}
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        </>
      }
    >
      <div className="biz-form">
        <Field label="Title" span="all">
          <Input autoFocus={!r.title} value={r.title} placeholder="e.g. Follow-up after discovery call" onChange={(v) => up({ title: v })} />
        </Field>
        <Field label="Category">
          <Select value={r.category || 'other'} options={ENABLEMENT_CATEGORIES} onChange={(v) => up({ category: v }, false)} />
        </Field>
        <Field label="Kind">
          <Select value={r.kind} options={RESOURCE_KINDS} onChange={(v) => up({ kind: v as ResourceKind }, false)} />
        </Field>
        <Field label="When to use it" span="all">
          <Input value={r.description} placeholder="e.g. Send within 24 h of the first call" onChange={(v) => up({ description: v || undefined })} />
        </Field>
        {r.kind === 'link' && (
          <Field label="Link" span="all" hint="Google Slides, Notion, Dropbox, Vimeo, Calendly …">
            <Input value={r.url} placeholder="https://…" onChange={(v) => up({ url: v || undefined })} />
          </Field>
        )}
        {r.kind === 'text' && (
          <Field label="Text" span="all" hint={TEXT_HINT[r.category ?? ''] ?? 'Plain text or Markdown — copied exactly as written.'}>
            <Textarea className="sl-mono" autoGrow minRows={8} value={r.text} placeholder={'Subject: Great talking today, [Name]\n\nHi [Name],\n\n…'} onChange={(v) => up({ text: v || undefined })} />
          </Field>
        )}
        <Field label="Tags" span={2}>
          <TagsInput value={r.tags} onChange={(tags) => up({ tags }, false)} />
        </Field>
        <Field label=" ">
          <Checkbox checked={r.pinned} onChange={(v) => up({ pinned: v || undefined }, false)} label="Pinned (top of its category)" />
        </Field>
      </div>
      {(r.kind === 'file' || (r.files ?? []).length > 0) && (
        <div style={{ marginTop: 12 }}>
          <FileBox target={{ list: 'resources', id: r.id, field: 'files' }} files={r.files} label="Files" empty="Drop the deck, one-pager, PDF or template here, or click Attach." />
        </div>
      )}
    </Modal>
  );
}
