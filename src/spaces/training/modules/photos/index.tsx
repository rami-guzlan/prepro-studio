/* Progress photos: add today's photo (upload, drop or webcam with a ghost of the
   last photo in the same pose), browse by pose, compare two days, and play the
   one-photo-per-day timelapse with speed control and video export. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, Columns2, Film, ImagePlus, Images, Trash2 } from 'lucide-react';
import { Button, Checkbox, confirmDialog, DateInput, EmptyState, Field, IconButton, Modal, ModuleHeader, Select, Tabs, Textarea, toast, UnderlineTabs, AssetImage } from '@/ui';
import { useSpaceFormatters } from '@/store/space';
import { toISODate } from '@/lib/dates';
import { isImageFile } from '@/lib/images';
import { POSES, type Pose, type ProgressPhoto } from '../../types';
import { storePhoto } from '../../photoStore';
import { updateTraining } from '../../ops';
import { weightSeries } from '../../calc';
import { useNavParams, useToday, useTraining, useUnits } from '../../ui';
import { CaptureModal } from './Capture';
import { Timelapse } from './Timelapse';
import { Compare } from './Compare';

type Tab = 'gallery' | 'timelapse' | 'compare';

export default function TrainingPhotos() {
  const t = useTraining();
  const params = useNavParams();
  const today = useToday();
  const [tab, setTab] = useState<Tab>(params.tab === 'timelapse' || params.tab === 'compare' ? params.tab : 'gallery');
  const [pose, setPose] = useState<Pose>(POSES.some((p) => p.value === params.pose) ? params.pose : 'front');
  const [filter, setFilter] = useState<Pose | 'all'>('all');
  const [capture, setCapture] = useState(!!params.capture);
  const [adding, setAdding] = useState<File[] | null>(null);
  const [open, setOpen] = useState<string | null>(params.photoId ?? null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (params.tab === 'timelapse' || params.tab === 'compare' || params.tab === 'gallery') setTab(params.tab);
    if (POSES.some((p) => p.value === params.pose)) setPose(params.pose);
    if (params.capture) setCapture(true);
    if (params.photoId) {
      setTab('gallery');
      setOpen(params.photoId);
    }
  }, [params]);

  const todayCount = t.photos.filter((p) => p.date === today).length;
  const counts = useMemo(() => Object.fromEntries(POSES.map((p) => [p.value, t.photos.filter((x) => x.pose === p.value).length])) as Record<Pose, number>, [t.photos]);
  const days = new Set(t.photos.map((p) => p.date)).size;

  return (
    <div className="module tr-module">
      <ModuleHeader
        title="Progress Photos"
        icon={Camera}
        subtitle={t.photos.length ? `${t.photos.length} photos over ${days} days${todayCount ? ` · ${todayCount} today` : ' · none today yet'}` : 'One photo a day, same pose — watch the change'}
        actions={
          <>
            <Button icon={ImagePlus} onClick={() => fileInput.current?.click()}>
              Upload
            </Button>
            <Button variant="primary" icon={Camera} onClick={() => setCapture(true)}>
              Take photo
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []).filter(isImageFile);
                if (files.length) setAdding(files);
                e.target.value = '';
              }}
            />
          </>
        }
      />
      <UnderlineTabs
        tabs={[
          { id: 'gallery', label: 'Gallery', icon: Images, count: t.photos.length },
          { id: 'timelapse', label: 'Timelapse', icon: Film },
          { id: 'compare', label: 'Compare', icon: Columns2 },
        ]}
        value={tab}
        onChange={(x) => setTab(x as Tab)}
      />
      <div
        className={`module-body ${dragOver ? 'tr-drop-on' : ''}`}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const files = Array.from(e.dataTransfer.files).filter(isImageFile);
          if (files.length) setAdding(files);
        }}
      >
        {tab === 'gallery' && <Gallery filter={filter} setFilter={setFilter} counts={counts} onOpen={setOpen} onTake={() => setCapture(true)} onUpload={() => fileInput.current?.click()} />}
        {tab === 'timelapse' && <Timelapse pose={pose} setPose={setPose} />}
        {tab === 'compare' && <Compare pose={pose} setPose={setPose} />}
      </div>
      {capture && <CaptureModal initialPose={pose} onClose={() => setCapture(false)} />}
      {adding && <AddPhotosModal files={adding} defaultPose={filter === 'all' ? pose : filter} onClose={() => setAdding(null)} />}
      {open && <Lightbox id={open} setId={setOpen} filter={filter} />}
    </div>
  );
}

function Gallery({ filter, setFilter, counts, onOpen, onTake, onUpload }: { filter: Pose | 'all'; setFilter: (f: Pose | 'all') => void; counts: Record<Pose, number>; onOpen: (id: string) => void; onTake: () => void; onUpload: () => void }) {
  const t = useTraining();
  const fmt = useSpaceFormatters();
  const list = useMemo(() => [...t.photos].filter((p) => filter === 'all' || p.pose === filter).sort((a, b) => b.date.localeCompare(a.date)), [t.photos, filter]);
  const byMonth = useMemo(() => {
    const m = new Map<string, ProgressPhoto[]>();
    for (const p of list) m.set(p.date.slice(0, 7), [...(m.get(p.date.slice(0, 7)) ?? []), p]);
    return [...m.entries()];
  }, [list]);

  if (!t.photos.length)
    return (
      <div className="tr-page">
        <EmptyState
          icon={Camera}
          title="Your first progress photo"
          description="Front, side and back in the same spot and light — daily or weekly. The webcam view shows a faint ghost of your last photo so every shot lines up, and the timelapse turns them into a video. Drop photos here to import older ones (each file's date can be used)."
          action={
            <div className="row wrap" style={{ gap: 8, justifyContent: 'center' }}>
              <Button variant="primary" icon={Camera} onClick={onTake}>
                Take photo
              </Button>
              <Button icon={ImagePlus} onClick={onUpload}>
                Upload
              </Button>
            </div>
          }
        />
        <p className="tr-note" style={{ textAlign: 'center' }}>
          Photos stay on this computer inside your Training folder.
        </p>
      </div>
    );

  return (
    <div className="tr-page">
      <Tabs tabs={[{ id: 'all', label: 'All', count: t.photos.length }, ...POSES.map((p) => ({ id: p.value, label: p.label, count: counts[p.value] }))]} value={filter} onChange={(v) => setFilter(v as Pose | 'all')} />
      {byMonth.map(([month, photos]) => (
        <section key={month} className="tr-gallery-month">
          <h4>{fmt.dateMedium(`${month}-01`).replace(/ \d+,/, '').replace(/^1 /, '')}</h4>
          <div className="tr-gallery">
            {photos.map((p) => (
              <button key={p.id} type="button" className="tr-thumb" onClick={() => onOpen(p.id)} aria-label={`${p.pose} photo ${fmt.dateMedium(p.date)}`}>
                <AssetImage name={p.asset} fit="cover" />
                <span className="tr-thumb-cap">
                  <b>{fmt.dateShort(p.date)}</b>
                  {filter === 'all' && <span>{POSES.find((x) => x.value === p.pose)?.label}</span>}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function AddPhotosModal({ files, defaultPose, onClose }: { files: File[]; defaultPose: Pose; onClose: () => void }) {
  const today = useToday();
  const [date, setDate] = useState<string | undefined>(today);
  const [pose, setPose] = useState<Pose>(defaultPose);
  const [useFileDates, setUseFileDates] = useState(files.length > 1);
  const [cycle, setCycle] = useState(false);
  const [busy, setBusy] = useState(false);
  const previews = useMemo(() => files.slice(0, 12).map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  const order: Pose[] = ['front', 'side', 'back'];

  const save = async () => {
    setBusy(true);
    let n = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const d = useFileDates && f.lastModified ? toISODate(new Date(f.lastModified)) : date ?? today;
        const p = cycle ? order[i % 3] : pose;
        await storePhoto(f, d, p);
        n++;
      }
      toast(`Added ${n} photo${n === 1 ? '' : 's'}`);
      onClose();
    } catch (e) {
      toast(`Added ${n}; could not add the rest: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Add ${files.length} photo${files.length === 1 ? '' : 's'}`}
      size="md"
      footer={
        <>
          <div className="spacer" />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Add'}
          </Button>
        </>
      }
    >
      <div className="tr-add-previews">
        {previews.map((u, i) => (
          <img key={i} src={u} alt="" />
        ))}
        {files.length > 12 && <span className="muted small">+{files.length - 12} more</span>}
      </div>
      <div className="tr-form-grid">
        <Field label="Date">
          <DateInput value={date} onChange={setDate} disabled={useFileDates} />
        </Field>
        <Field label="Pose">
          <Select value={pose} onChange={(v) => setPose(v as Pose)} options={POSES} disabled={cycle} />
        </Field>
        {files.length > 1 && (
          <Field span="all">
            <div className="col" style={{ gap: 6 }}>
              <Checkbox checked={useFileDates} onChange={setUseFileDates} label="Use each file's own date (importing older photos)" />
              <Checkbox checked={cycle} onChange={setCycle} label="Files are in front / side / back order" />
            </div>
          </Field>
        )}
      </div>
    </Modal>
  );
}

function Lightbox({ id, setId, filter }: { id: string; setId: (id: string | null) => void; filter: Pose | 'all' }) {
  const t = useTraining();
  const u = useUnits();
  const fmt = useSpaceFormatters();
  const list = useMemo(() => [...t.photos].filter((p) => filter === 'all' || p.pose === filter).sort((a, b) => a.date.localeCompare(b.date)), [t.photos, filter]);
  const i = list.findIndex((p) => p.id === id);
  const p = list[i] ?? t.photos.find((x) => x.id === id);
  const ws = useMemo(() => weightSeries(t), [t]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'ArrowLeft' && i > 0) setId(list[i - 1].id);
      if (e.key === 'ArrowRight' && i >= 0 && i < list.length - 1) setId(list[i + 1].id);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [i, list, setId]);
  if (!p) return null;
  const w = ws.filter((x) => x.date <= p.date).pop();
  const patch = (x: Partial<ProgressPhoto>, coalesce?: string) =>
    updateTraining(
      (tr) => {
        const ph = tr.photos.find((y) => y.id === p.id);
        if (!ph) return;
        for (const [k, v] of Object.entries(x)) {
          if (v === undefined || v === '') delete (ph as any)[k];
          else (ph as any)[k] = v;
        }
        tr.photos.sort((a, b) => a.date.localeCompare(b.date));
      },
      coalesce ? { coalesce } : undefined,
    );
  const remove = async () => {
    if (!(await confirmDialog({ title: 'Delete this photo?', message: `${POSES.find((x) => x.value === p.pose)?.label} photo of ${fmt.dateMedium(p.date)}. Ctrl+Z brings it back.`, confirmLabel: 'Delete', danger: true }))) return;
    const next = list[i + 1] ?? list[i - 1];
    updateTraining((tr) => {
      tr.photos = tr.photos.filter((x) => x.id !== p.id);
    });
    setId(next && next.id !== p.id ? next.id : null);
  };
  return (
    <Modal
      open
      onClose={() => setId(null)}
      title={`${fmt.dateLong(p.date)}`}
      size="xl"
      footer={
        <>
          <Button variant="danger" icon={Trash2} onClick={remove}>
            Delete
          </Button>
          <div className="spacer" />
          <span className="muted small">{i >= 0 ? `${i + 1} / ${list.length}` : ''}</span>
          <IconButton icon={ChevronLeft} label="Previous photo" disabled={i <= 0} onClick={() => setId(list[i - 1].id)} />
          <IconButton icon={ChevronRight} label="Next photo" disabled={i < 0 || i >= list.length - 1} onClick={() => setId(list[i + 1].id)} />
        </>
      }
    >
      <div className="tr-lightbox">
        <div className="tr-lightbox-img">
          <AssetImage name={p.asset} fit="contain" />
        </div>
        <div className="tr-lightbox-side">
          <Field label="Date">
            <DateInput value={p.date} onChange={(date) => date && patch({ date })} />
          </Field>
          <Field label="Pose">
            <Select value={p.pose} onChange={(v) => patch({ pose: v as Pose })} options={POSES} />
          </Field>
          {w && (
            <p className="small">
              Weight {w.date === p.date ? 'that day' : `on ${fmt.dateShort(w.date)}`}: <b>{u.weight(w.kg)}</b>
            </p>
          )}
          <Field label="Notes">
            <Textarea value={p.notes ?? ''} onChange={(notes) => patch({ notes }, `photo:${p.id}:notes`)} rows={4} placeholder="Morning, fasted, after leg day…" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
