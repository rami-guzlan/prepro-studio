/* Project settings: project info, format, regional, script formatting,
   Final Draft-style element flow (Tab/Enter), print defaults, backups. */
import { useEffect, useState } from 'react';
import { Archive, FolderOpen, History, RotateCcw, Settings } from 'lucide-react';
import type { ElementFlow, ElementType, ProjectData } from '@/types';
import { update, replaceProject, useProject, useFormatters } from '@/store/project';
import { defaultFlow, normalizeProject } from '@/store/defaults';
import { ASPECT_RATIOS, FRAME_RATES, PROJECT_STATUSES, PROJECT_TYPES, RESOLUTIONS } from '@/lib/constants';
import { ELEMENT_LABELS, ELEMENT_TYPES } from '@/script-core/schema';
import { backend, type BackupInfo } from '@/backend';
import { Button, Card, ColorPicker, Combo, DateInput, Field, FormGrid, ImageDrop, Input, ModuleHeader, Select, Switch, Textarea, confirmDialog, toast } from '@/ui';
import { exportArchive, revealCurrentProject } from './projectActions';
import { syncCharactersDraft } from '@/derived/script';

type Draftish = (d: ProjectData) => void;
const set = (fn: Draftish, key: string) => update((d) => fn(d as ProjectData), { coalesce: `settings:${key}` });

const ELEMENT_OPTIONS = ELEMENT_TYPES.map((t) => ({ value: t, label: ELEMENT_LABELS[t] }));
const FLOW_COLS: { key: keyof ElementFlow; label: string }[] = [
  { key: 'enter', label: 'Enter (after text)' },
  { key: 'enterEmpty', label: 'Enter (empty)' },
  { key: 'tab', label: 'Tab (after text)' },
  { key: 'tabEmpty', label: 'Tab (empty)' },
  { key: 'shiftTabEmpty', label: 'Shift+Tab (empty)' },
];

export default function ProjectSettingsModule() {
  const meta = useProject((p) => p.meta);
  const settings = useProject((p) => p.settings);
  const projectId = useProject((p) => p.id);
  const s = settings.script;
  const fmt = useFormatters();

  return (
    <div className="module">
      <ModuleHeader
        title="Project Settings"
        icon={Settings}
        subtitle="Saved with this project"
        actions={
          <>
            {backend.openProjectFolder && (
              <Button icon={FolderOpen} onClick={() => revealCurrentProject()}>
                Project folder
              </Button>
            )}
            <Button icon={Archive} onClick={() => exportArchive(projectId, meta.title)}>
              Export archive
            </Button>
          </>
        }
      />
      <div className="module-body">
        <div className="settings-page">
          <Card title="Project">
            <div className="row" style={{ alignItems: 'flex-start', gap: 18 }}>
              <div className="col" style={{ width: 180, flexShrink: 0 }}>
                <span className="field-label">Cover image</span>
                <ImageDrop value={meta.poster} onChange={(v) => set((d) => void (d.meta.poster = v), 'poster')} aspect={16 / 10} label="Cover image" />
                <span className="field-label" style={{ marginTop: 8 }}>Logo (print headers)</span>
                <ImageDrop value={meta.logo} onChange={(v) => set((d) => void (d.meta.logo = v), 'logo')} aspect={2} contain label="Logo" />
              </div>
              <div className="grow">
                <FormGrid min={210}>
                  <Field label="Title" span={2}>
                    <Input value={meta.title} onChange={(v) => set((d) => void (d.meta.title = v), 'title')} />
                  </Field>
                  <Field label="Subtitle / version">
                    <Input value={meta.subtitle} onChange={(v) => set((d) => void (d.meta.subtitle = v), 'subtitle')} placeholder="e.g. Episode 2, 30s spot" />
                  </Field>
                  <Field label="Type">
                    <Select value={meta.projectType} onChange={(v) => set((d) => void (d.meta.projectType = v as any), 'type')} options={PROJECT_TYPES} />
                  </Field>
                  <Field label="Status">
                    <Select value={meta.status} onChange={(v) => set((d) => void (d.meta.status = v as any), 'status')} options={PROJECT_STATUSES} />
                  </Field>
                  <Field label="Client">
                    <Input value={meta.client} onChange={(v) => set((d) => void (d.meta.client = v), 'client')} />
                  </Field>
                  <Field label="Production company">
                    <Input value={meta.productionCompany} onChange={(v) => set((d) => void (d.meta.productionCompany = v), 'company')} />
                  </Field>
                  <Field label="Director">
                    <Input value={meta.director} onChange={(v) => set((d) => void (d.meta.director = v), 'director')} />
                  </Field>
                  <Field label="Producer">
                    <Input value={meta.producer} onChange={(v) => set((d) => void (d.meta.producer = v), 'producer')} />
                  </Field>
                  <Field label="Writer">
                    <Input value={meta.writer} onChange={(v) => set((d) => void (d.meta.writer = v), 'writer')} />
                  </Field>
                  <Field label="Logline" span="all">
                    <Textarea autoGrow minRows={2} value={meta.logline} onChange={(v) => set((d) => void (d.meta.logline = v), 'logline')} />
                  </Field>
                  <Field label="Colour" span="all">
                    <ColorPicker value={meta.color} onChange={(v) => set((d) => void (d.meta.color = v ?? '#7c5cff'), 'color')} />
                  </Field>
                </FormGrid>
              </div>
            </div>
          </Card>

          <Card title="Format & dates">
            <FormGrid min={190}>
              <Field label="Aspect ratio">
                <Combo value={meta.aspectRatio} onChange={(v) => set((d) => void (d.meta.aspectRatio = v), 'aspect')} suggestions={ASPECT_RATIOS.map((a) => a.value)} />
              </Field>
              <Field label="Resolution">
                <Combo value={meta.resolution} onChange={(v) => set((d) => void (d.meta.resolution = v), 'res')} suggestions={RESOLUTIONS.map((a) => a.value)} />
              </Field>
              <Field label="Frame rate">
                <Combo value={meta.frameRate} onChange={(v) => set((d) => void (d.meta.frameRate = v), 'fps')} suggestions={FRAME_RATES.map((a) => a.value)} />
              </Field>
              <Field label="Target runtime" hint="mm:ss">
                <Input value={meta.targetRuntime} onChange={(v) => set((d) => void (d.meta.targetRuntime = v), 'runtime')} placeholder="03:00" />
              </Field>
              <Field label="Shoot start">
                <DateInput value={meta.shootStart} onChange={(v) => set((d) => void (d.meta.shootStart = v), 'ss')} />
              </Field>
              <Field label="Shoot end">
                <DateInput value={meta.shootEnd} onChange={(v) => set((d) => void (d.meta.shootEnd = v), 'se')} />
              </Field>
              <Field label="Delivery date">
                <DateInput value={meta.deliveryDate} onChange={(v) => set((d) => void (d.meta.deliveryDate = v), 'dd')} />
              </Field>
            </FormGrid>
          </Card>

          <Card title="Regional">
            <FormGrid min={190}>
              <Field label="Paper size" hint="Used for every PDF and print">
                <Select
                  value={settings.paperSize}
                  onChange={(v) => set((d) => void (d.settings.paperSize = v as any), 'paper')}
                  options={[
                    { value: 'letter', label: 'US Letter' },
                    { value: 'a4', label: 'A4' },
                  ]}
                />
              </Field>
              <Field label="Date format" hint={fmt.date('2026-10-18')}>
                <Select
                  value={settings.dateFormat}
                  onChange={(v) => set((d) => void (d.settings.dateFormat = v as any), 'datefmt')}
                  options={[
                    { value: 'MDY', label: 'MM/DD/YYYY' },
                    { value: 'DMY', label: 'DD/MM/YYYY' },
                    { value: 'YMD', label: 'YYYY-MM-DD' },
                  ]}
                />
              </Field>
              <Field label="Time format" hint={fmt.time('14:30')}>
                <Select
                  value={settings.timeFormat}
                  onChange={(v) => set((d) => void (d.settings.timeFormat = v as any), 'timefmt')}
                  options={[
                    { value: '12h', label: '12-hour (2:30 PM)' },
                    { value: '24h', label: '24-hour (14:30)' },
                  ]}
                />
              </Field>
              <Field label="Currency" hint={fmt.money(1250)}>
                <Combo value={settings.currency} onChange={(v) => set((d) => void (d.settings.currency = v.toUpperCase().slice(0, 3)), 'currency')} suggestions={['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'CHF', 'SEK', 'JPY', 'INR', 'AED', 'ZAR']} />
              </Field>
            </FormGrid>
          </Card>

          <Card title="Screenplay formatting">
            <FormGrid min={230}>
              <Field label="Font">
                <Select value={s.font} onChange={(v) => set((d) => void (d.settings.script.font = v as any), 'font')} options={['Courier Prime', 'Courier New']} />
              </Field>
              <Field label="Scene numbers">
                <Select
                  value={s.sceneNumbers}
                  onChange={(v) => set((d) => void (d.settings.script.sceneNumbers = v as any), 'scenenums')}
                  options={[
                    { value: 'none', label: 'Hidden' },
                    { value: 'left', label: 'Left margin' },
                    { value: 'right', label: 'Right margin' },
                    { value: 'both', label: 'Both margins' },
                  ]}
                />
              </Field>
              <Field label="Blank lines before scene headings">
                <Select value={String(s.sceneHeadingSpacing)} onChange={(v) => set((d) => void (d.settings.script.sceneHeadingSpacing = Number(v) as 1 | 2), 'shs')} options={['1', '2']} />
              </Field>
              <Field label="Header text (top left of each page)">
                <Input value={s.header} onChange={(v) => set((d) => void (d.settings.script.header = v), 'header')} placeholder="e.g. BLUE REVISION 10/18/26" />
              </Field>
              <Field label="Footer text">
                <Input value={s.footer} onChange={(v) => set((d) => void (d.settings.script.footer = v), 'footer')} placeholder="Optional" />
              </Field>
            </FormGrid>
            <div className="row wrap" style={{ gap: 18, marginTop: 14 }}>
              <Switch checked={s.sceneHeadingBold} onChange={(v) => set((d) => void (d.settings.script.sceneHeadingBold = v), 'shb')} label="Bold scene headings" />
              <Switch checked={s.autoContd} onChange={(v) => set((d) => void (d.settings.script.autoContd = v), 'contd')} label="Automatic (CONT'D)" />
              <Switch checked={s.moreContd} onChange={(v) => set((d) => void (d.settings.script.moreContd = v), 'more')} label="(MORE) / (CONT'D) at page breaks" />
              <Switch checked={s.firstPageNumber} onChange={(v) => set((d) => void (d.settings.script.firstPageNumber = v), 'p1')} label="Number page 1" />
              <Switch checked={s.smartType} onChange={(v) => set((d) => void (d.settings.script.smartType = v), 'st')} label="SmartType autocomplete" />
              <Switch checked={s.smartFormat} onChange={(v) => set((d) => void (d.settings.script.smartFormat = v), 'sf')} label="Smart formatting (INT./EXT., CUT TO:)" />
            </div>
          </Card>

          <Card
            title="Element flow — Tab & Enter (like Final Draft › Elements)"
            actions={
              <Button size="sm" icon={RotateCcw} onClick={() => set((d) => void (d.settings.script.flow = defaultFlow()), 'flow-reset')}>
                Reset to defaults
              </Button>
            }
            padded={false}
          >
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>In element</th>
                    {FLOW_COLS.map((c) => (
                      <th key={c.key}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ELEMENT_TYPES.map((t) => (
                    <tr key={t}>
                      <td className="strong nowrap">{ELEMENT_LABELS[t]}</td>
                      {FLOW_COLS.map((c) => (
                        <td key={c.key}>
                          <Select
                            bare
                            size="sm"
                            value={s.flow[t]?.[c.key] ?? defaultFlow()[t][c.key]}
                            options={ELEMENT_OPTIONS}
                            onChange={(v) =>
                              set((d) => {
                                d.settings.script.flow[t] = { ...(d.settings.script.flow[t] ?? defaultFlow()[t]), [c.key]: v as ElementType };
                              }, `flow:${t}:${c.key}`)
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Printing defaults">
            <div className="row wrap" style={{ gap: 18 }}>
              <Switch checked={settings.print.showProjectTitle} onChange={(v) => set((d) => void (d.settings.print.showProjectTitle = v), 'pt')} label="Project title in page headers" />
              <Switch checked={settings.print.showLogo} onChange={(v) => set((d) => void (d.settings.print.showLogo = v), 'pl')} label="Logo on documents" />
              <Switch checked={settings.print.confidential} onChange={(v) => set((d) => void (d.settings.print.confidential = v), 'pc')} label="Mark CONFIDENTIAL" />
              <Switch checked={settings.print.color} onChange={(v) => set((d) => void (d.settings.print.color = v), 'pcol')} label="Colour images" />
            </div>
            <div style={{ maxWidth: 320, marginTop: 12 }}>
              <Field label="Watermark">
                <Input value={settings.print.watermark} onChange={(v) => set((d) => void (d.settings.print.watermark = v), 'wm')} placeholder="None" />
              </Field>
            </div>
          </Card>

          <Backups projectId={projectId} />
        </div>
      </div>
    </div>
  );
}

function Backups({ projectId }: { projectId: string }) {
  const [list, setList] = useState<BackupInfo[] | null>(null);
  const fmt = useFormatters();
  useEffect(() => {
    backend.listBackups(projectId).then(setList).catch(() => setList([]));
  }, [projectId]);
  const restore = async (b: BackupInfo) => {
    const ok = await confirmDialog({
      title: 'Restore this backup?',
      message: `The project will go back to how it was on ${new Date(b.date).toLocaleString()}. You can undo this with Ctrl+Z.`,
      confirmLabel: 'Restore',
    });
    if (!ok) return;
    try {
      const data = normalizeProject(await backend.restoreBackup(projectId, b.name));
      data.id = projectId;
      syncCharactersDraft(data as any);
      replaceProject(data);
      toast('Backup restored — reopen the Script screen to see restored text');
    } catch (e) {
      toast(`Restore failed: ${e instanceof Error ? e.message : e}`, 'error');
    }
  };
  return (
    <Card title={<span className="row" style={{ gap: 6 }}><History size={15} /> Automatic backups</span>}>
      <p className="muted small" style={{ marginTop: 0 }}>
        A snapshot is kept at most every 10 minutes while you work (last 40). {backend.kind === 'electron' ? 'They live in the backups folder inside the project folder.' : 'They are stored in this browser.'}
      </p>
      {list === null ? (
        <div className="muted">Loading…</div>
      ) : list.length === 0 ? (
        <div className="muted">No backups yet.</div>
      ) : (
        <div className="list" style={{ maxHeight: 240, overflow: 'auto' }}>
          {list.map((b) => (
            <div key={b.name} className="row" style={{ padding: '5px 4px', borderBottom: '1px solid var(--border)' }}>
              <span className="grow">
                {fmt.dateMedium(b.date.slice(0, 10))} · {new Date(b.date).toLocaleTimeString()}
              </span>
              {b.size > 0 && <span className="muted small">{Math.round(b.size / 1024)} KB</span>}
              <Button size="sm" onClick={() => restore(b)}>
                Restore
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
