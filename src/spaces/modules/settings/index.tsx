/* Space Settings: identity, look, formats, print defaults, backups. */
import { useEffect, useState } from 'react';
import { Copy, History, RotateCcw, Settings, Trash2 } from 'lucide-react';
import type { SpaceType } from '@/spaces/types';
import { SPACE_TYPES } from '@/spaces/constants';
import { normalizeSpace } from '@/spaces/defaults';
import { replaceSpace, updateSpace, useSpace, useSpaceFormatters } from '@/store/space';
import { backend, type BackupInfo } from '@/backend';
import { Button, Card, ColorPicker, Combo, confirmDialog, DateInput, Field, FormGrid, ImageDrop, Input, ModuleHeader, Select, Switch, Textarea, toast } from '@/ui';
import { deleteSpace, duplicateSpace } from '@/shell/spaceActions';

export default function SpaceSettingsModule() {
  const meta = useSpace((s) => s.meta);
  const settings = useSpace((s) => s.settings);
  const id = useSpace((s) => s.id);
  const fmt = useSpaceFormatters();
  const set = (fn: Parameters<typeof updateSpace>[0], key: string) => updateSpace(fn, { coalesce: `settings:${key}` });

  return (
    <div className="module">
      <ModuleHeader title="Space Settings" icon={Settings} subtitle="Name, look, formats and print defaults of this space" />
      <div className="module-body padded">
        <div className="col" style={{ gap: 16, maxWidth: 920 }}>
          <Card title="Identity">
            <FormGrid min={240}>
              <Field label="Name">
                <Input value={meta.title} onChange={(v) => set((d) => void (d.meta.title = v), 'title')} onBlur={() => backend.setWindowTitle?.(meta.title)} />
              </Field>
              <Field label="Type">
                <Select value={meta.type} onChange={(v) => set((d) => void (d.meta.type = v as SpaceType), 'type')} options={SPACE_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
              </Field>
              <Field label="Owner">
                <Input value={meta.owner ?? ''} onChange={(v) => set((d) => void (d.meta.owner = v || undefined), 'owner')} placeholder="You, your team or the client" />
              </Field>
              <Field label="Emoji">
                <Input value={meta.emoji ?? ''} onChange={(v) => set((d) => void (d.meta.emoji = v.slice(0, 4) || undefined), 'emoji')} placeholder="✨" />
              </Field>
              <Field label="What this space is for" span="all">
                <Textarea value={meta.description} onChange={(v) => set((d) => void (d.meta.description = v), 'description')} rows={3} placeholder="Goal, audience, promise." />
              </Field>
              <Field label="Start date" hint="For campaigns and launches">
                <DateInput value={meta.startDate} onChange={(v) => set((d) => void (d.meta.startDate = v), 'start')} />
              </Field>
              <Field label="End date">
                <DateInput value={meta.endDate} onChange={(v) => set((d) => void (d.meta.endDate = v), 'end')} />
              </Field>
              <Field label="Tags" hint="Comma-separated">
                <Input
                  value={(meta.tags ?? []).join(', ')}
                  onChange={(v) =>
                    set(
                      (d) =>
                        void (d.meta.tags = v
                          .split(',')
                          .map((t) => t.trim())
                          .filter(Boolean)),
                      'tags',
                    )
                  }
                />
              </Field>
            </FormGrid>
          </Card>

          <Card title="Look">
            <div className="row wrap" style={{ gap: 24, alignItems: 'flex-start' }}>
              <Field label="Colour">
                <ColorPicker value={meta.color} onChange={(c) => set((d) => void (d.meta.color = c ?? '#e64980'), 'color')} />
              </Field>
              <Field label="Logo" hint="On printed documents">
                <ImageDrop value={meta.logo} onChange={(n) => updateSpace((d) => void (d.meta.logo = n))} aspect={1} width="120px" contain />
              </Field>
              <Field label="Cover" hint="Shown on the library card">
                <ImageDrop value={meta.cover} onChange={(n) => updateSpace((d) => void (d.meta.cover = n))} aspect={16 / 9} width="240px" />
              </Field>
            </div>
          </Card>

          <Card title="Formats">
            <FormGrid min={200}>
              <Field label="Date format" hint={`Today: ${fmt.dateMedium(new Date().toISOString().slice(0, 10))}`}>
                <Select
                  value={settings.dateFormat}
                  onChange={(v) => set((d) => void (d.settings.dateFormat = v as any), 'dateFormat')}
                  options={[
                    { value: 'MDY', label: 'Month / day / year' },
                    { value: 'DMY', label: 'Day / month / year' },
                    { value: 'YMD', label: 'Year-month-day' },
                  ]}
                />
              </Field>
              <Field label="Time format">
                <Select
                  value={settings.timeFormat}
                  onChange={(v) => set((d) => void (d.settings.timeFormat = v as any), 'timeFormat')}
                  options={[
                    { value: '12h', label: '12-hour (6:30 PM)' },
                    { value: '24h', label: '24-hour (18:30)' },
                  ]}
                />
              </Field>
              <Field label="Currency">
                <Combo value={settings.currency} onChange={(v) => set((d) => void (d.settings.currency = v.toUpperCase().slice(0, 3)), 'currency')} suggestions={['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'CHF', 'SEK', 'JPY', 'INR', 'AED', 'ZAR']} />
              </Field>
              <Field label="Paper size">
                <Select
                  value={settings.paperSize}
                  onChange={(v) => set((d) => void (d.settings.paperSize = v as any), 'paper')}
                  options={[
                    { value: 'letter', label: 'US Letter' },
                    { value: 'a4', label: 'A4' },
                  ]}
                />
              </Field>
              <Field label="Calendar">
                <Switch checked={settings.weekStartsMonday} onChange={(v) => set((d) => void (d.settings.weekStartsMonday = v), 'week')} label="Weeks start on Monday" />
              </Field>
            </FormGrid>
          </Card>

          <Card title="Printed documents">
            <div className="row wrap" style={{ gap: 22 }}>
              <Switch checked={settings.print.showProjectTitle} onChange={(v) => set((d) => void (d.settings.print.showProjectTitle = v), 'p1')} label="Space name in page headers" />
              <Switch checked={settings.print.showLogo} onChange={(v) => set((d) => void (d.settings.print.showLogo = v), 'p2')} label="Show logo" />
              <Switch checked={settings.print.confidential} onChange={(v) => set((d) => void (d.settings.print.confidential = v), 'p3')} label="Mark CONFIDENTIAL" />
              <Switch checked={settings.print.color} onChange={(v) => set((d) => void (d.settings.print.color = v), 'p4')} label="Colour" />
              <Field label="Watermark">
                <Input value={settings.print.watermark ?? ''} onChange={(v) => set((d) => void (d.settings.print.watermark = v || undefined), 'p5')} placeholder="e.g. DRAFT" />
              </Field>
            </div>
          </Card>

          <Backups spaceId={id} />

          <Card title="Space">
            <div className="row wrap" style={{ gap: 10 }}>
              <Button icon={Copy} onClick={() => duplicateSpace(id, meta.title)}>
                Duplicate space
              </Button>
              <Button
                variant="danger"
                icon={Trash2}
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: `Delete “${meta.title}”?`,
                    message: backend.kind === 'electron' ? 'The space folder is moved to the Recycle Bin; you can restore it from there.' : 'This permanently removes the space from this browser.',
                    confirmLabel: 'Delete space',
                    danger: true,
                  });
                  if (ok) await deleteSpace(id);
                }}
              >
                Delete space
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Backups({ spaceId }: { spaceId: string }) {
  const [list, setList] = useState<BackupInfo[] | null>(null);
  const fmt = useSpaceFormatters();
  useEffect(() => {
    backend
      .listBackups(spaceId)
      .then((l) => setList(l.filter((b) => b.name.startsWith('space-'))))
      .catch(() => setList([]));
  }, [spaceId]);
  if (backend.kind !== 'electron') return null;
  return (
    <Card title="Automatic backups">
      <div className="muted small" style={{ marginBottom: 8 }}>
        A snapshot is kept every 10 minutes while you work (last 40). Restoring is one undo step (Ctrl+Z goes back).
      </div>
      {list === null ? (
        <div className="muted small">Loading…</div>
      ) : list.length === 0 ? (
        <div className="muted small row" style={{ gap: 6 }}>
          <History size={14} /> No backups yet — the first one is taken on the next save after 10 minutes.
        </div>
      ) : (
        <div className="col" style={{ gap: 4, maxHeight: 220, overflow: 'auto' }}>
          {list.slice(0, 20).map((b) => (
            <div key={b.name} className="row" style={{ gap: 10 }}>
              <span className="grow small">
                {fmt.dateMedium(b.date.slice(0, 10))} · {new Date(b.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="muted tiny">{Math.round(b.size / 1024)} KB</span>
              <Button
                size="sm"
                icon={RotateCcw}
                onClick={async () => {
                  const ok = await confirmDialog({ title: 'Restore this backup?', message: 'The space returns to this snapshot. You can undo with Ctrl+Z.', confirmLabel: 'Restore' });
                  if (!ok) return;
                  try {
                    replaceSpace(normalizeSpace(await backend.restoreBackup(spaceId, b.name) as any));
                    toast('Backup restored');
                  } catch (e) {
                    toast(`Restore failed: ${e instanceof Error ? e.message : e}`, 'error');
                  }
                }}
              >
                Restore
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
