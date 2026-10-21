/* Compare two days of the same pose: side by side or with a before/after slider,
   with the weight and waist on each day and the difference. */
import { useEffect, useMemo, useState } from 'react';
import { Columns2, SlidersHorizontal, SplitSquareVertical } from 'lucide-react';
import { EmptyState, Select, Tabs, AssetImage } from '@/ui';
import { useSpaceFormatters } from '@/store/space';
import { diffDays } from '@/lib/dates';
import { POSES, type Pose, type ProgressPhoto } from '../../types';
import { metricSeries, weightSeries } from '../../calc';
import { unitKit } from '../../units';
import { useTraining } from '../../ui';
import { dailyFrames } from './Timelapse';

export function Compare({ pose, setPose }: { pose: Pose; setPose: (p: Pose) => void }) {
  const t = useTraining();
  const fmt = useSpaceFormatters();
  const u = unitKit(t.profile.units);
  const frames = useMemo(() => dailyFrames(t, pose), [t, pose]);
  const [aId, setA] = useState<string>('');
  const [bId, setB] = useState<string>('');
  const [mode, setMode] = useState<'side' | 'slider'>('side');
  const [cut, setCut] = useState(50);
  useEffect(() => {
    setA(frames[0]?.id ?? '');
    setB(frames[frames.length - 1]?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pose]);
  const a = frames.find((f) => f.id === aId) ?? frames[0];
  const b = frames.find((f) => f.id === bId) ?? frames[frames.length - 1];
  const ws = useMemo(() => weightSeries(t), [t]);
  const waist = useMemo(() => metricSeries(t, 'waistCm'), [t]);
  const near = <T extends { date: string }>(xs: T[], d: string) => xs.filter((x) => x.date <= d).pop() ?? xs.find((x) => x.date > d && diffDays(d, x.date) <= 3);

  if (frames.length < 2)
    return (
      <div className="tr-page">
        <div className="tr-tl-controls">
          <Select value={pose} onChange={(v) => setPose(v as Pose)} options={POSES} aria-label="Pose" />
        </div>
        <EmptyState icon={Columns2} title="Need two days to compare" description={`Take ${frames.length ? 'another' : 'a'} ${pose} photo on a different day and compare them here side by side or with a slider.`} />
      </div>
    );

  const opts = frames.map((f) => ({ value: f.id, label: fmt.dateMedium(f.date) }));
  const info = (p: ProgressPhoto) => {
    const w = near(ws, p.date);
    const wa = near(waist, p.date);
    return { w: w?.kg, waist: wa?.value };
  };
  const ia = info(a);
  const ib = info(b);

  return (
    <div className="tr-page">
      <div className="tr-tl-controls">
        <Select value={pose} onChange={(v) => setPose(v as Pose)} options={POSES} aria-label="Pose" />
        <Select value={a.id} onChange={setA} options={opts} aria-label="Before" />
        <span className="muted">vs</span>
        <Select value={b.id} onChange={setB} options={opts} aria-label="After" />
        <div className="spacer" />
        <Tabs
          tabs={[
            { id: 'side', label: 'Side by side', icon: SplitSquareVertical },
            { id: 'slider', label: 'Slider', icon: SlidersHorizontal },
          ]}
          value={mode}
          onChange={(v) => setMode(v as 'side' | 'slider')}
        />
      </div>
      <div className="tr-compare-sum">
        <span>
          <b>{Math.abs(diffDays(a.date, b.date))}</b> days apart
        </span>
        {ia.w != null && ib.w != null && (
          <span>
            weight <b>{u.delta(ib.w - ia.w)}</b>
          </span>
        )}
        {ia.waist != null && ib.waist != null && (
          <span>
            waist <b>{`${ib.waist - ia.waist > 0 ? '+' : ''}${u.length(ib.waist - ia.waist)}`}</b>
          </span>
        )}
      </div>
      {mode === 'side' ? (
        <div className="tr-compare">
          {[
            { p: a, i: ia, label: 'Before' },
            { p: b, i: ib, label: 'After' },
          ].map(({ p, i, label }) => (
            <figure key={label}>
              <AssetImage name={p.asset} fit="contain" />
              <figcaption>
                <b>{fmt.dateMedium(p.date)}</b>
                <span className="muted">{[i.w != null ? u.weight(i.w) : '', i.waist != null ? `waist ${u.length(i.waist)}` : ''].filter(Boolean).join(' · ')}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <div className="tr-slider-compare">
          <div className="tr-slider-stage">
            <AssetImage name={b.asset} fit="contain" />
            <div className="tr-slider-top" style={{ clipPath: `inset(0 ${100 - cut}% 0 0)` }}>
              <AssetImage name={a.asset} fit="contain" />
            </div>
            <div className="tr-slider-line" style={{ left: `${cut}%` }} />
            <span className="tr-slider-tag left">{fmt.dateShort(a.date)}</span>
            <span className="tr-slider-tag right">{fmt.dateShort(b.date)}</span>
          </div>
          <input type="range" min={0} max={100} value={cut} onChange={(e) => setCut(Number(e.target.value))} aria-label="Before / after position" />
        </div>
      )}
    </div>
  );
}
