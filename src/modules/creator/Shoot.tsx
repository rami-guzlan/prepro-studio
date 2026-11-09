/* Creator workspace → Shoot: pre-roll checks, the shot list to tick, a quick
   take log, the teleprompter and a full-screen shoot mode for a solo shoot. */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clapperboard, FlipHorizontal, Maximize2, Minus, Pause, Play, Plus, RotateCcw, X } from 'lucide-react';
import type { CreatorData } from '@/types';
import { uid } from '@/lib/id';
import { Button, IconButton, Input, Select, Textarea } from '@/ui';
import { SHOT_KINDS } from './model';
import { editCreator } from './ops';
import { shotOps } from './Plan';
import { CheckList, Section } from './shared';
import { SprintTimer } from './Today';

/** What the prompter shows: the outline beats, or text of your own. */
export function prompterText(c: CreatorData): string {
  if (c.shoot.prompter.source === 'text' && c.shoot.prompter.text.trim()) return c.shoot.prompter.text;
  return c.idea.beats
    .filter((b) => b.text.trim())
    .map((b) => b.text.trim())
    .join('\n\n');
}

export function Teleprompter({ c, tall }: { c: CreatorData; tall?: boolean }) {
  const p = c.shoot.prompter;
  const box = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const text = prompterText(c);
  const set = (patch: Partial<CreatorData['shoot']['prompter']>) => editCreator((x) => void Object.assign(x.shoot.prompter, patch), 'prompter');

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (t: number) => {
      const el = box.current;
      if (el) {
        el.scrollTop += ((t - last) / 1000) * p.speed * 12;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) setPlaying(false);
      }
      last = t;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, p.speed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.code !== 'Space' || t.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (!box.current?.isConnected) return;
      e.preventDefault();
      setPlaying((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={`cr-prompter ${tall ? 'tall' : ''}`}>
      <div className="cr-prompter-bar">
        <Button size="sm" variant={playing ? 'default' : 'primary'} icon={playing ? Pause : Play} onClick={() => setPlaying(!playing)} title="Space bar starts and stops">
          {playing ? 'Pause' : 'Roll'}
        </Button>
        <IconButton icon={RotateCcw} size="sm" label="Back to the top" onClick={() => box.current && (box.current.scrollTop = 0)} />
        <span className="muted small">Speed</span>
        <IconButton icon={Minus} size="sm" label="Slower" onClick={() => set({ speed: Math.max(1, p.speed - 1) })} />
        <b className="small">{p.speed}</b>
        <IconButton icon={Plus} size="sm" label="Faster" onClick={() => set({ speed: Math.min(15, p.speed + 1) })} />
        <span className="muted small">Size</span>
        <IconButton icon={Minus} size="sm" label="Smaller text" onClick={() => set({ size: Math.max(20, p.size - 4) })} />
        <IconButton icon={Plus} size="sm" label="Bigger text" onClick={() => set({ size: Math.min(96, p.size + 4) })} />
        <IconButton icon={FlipHorizontal} size="sm" label="Mirror (for a beam-splitter prompter)" className={p.mirror ? 'on' : ''} onClick={() => set({ mirror: !p.mirror })} />
        <div className="spacer" />
        <Select size="sm" value={p.source} options={[{ value: 'beats', label: 'From the outline' }, { value: 'text', label: 'My own text' }]} onChange={(v) => set({ source: v as 'beats' | 'text' })} aria-label="Prompter text" />
      </div>
      {p.source === 'text' && !tall && (
        <Textarea autoGrow minRows={3} value={p.text} placeholder="Paste or write the words to read" onChange={(t) => set({ text: t })} />
      )}
      <div ref={box} className="cr-prompter-view" style={{ fontSize: p.size, transform: p.mirror ? 'scaleX(-1)' : undefined }}>
        <div className="cr-prompter-pad" />
        {text ? text.split('\n').map((l, i) => <p key={i}>{l || ' '}</p>) : <p className="muted">Write the outline on the Idea tab (or your own text above) and it shows here.</p>}
        <div className="cr-prompter-pad" />
      </div>
    </div>
  );
}

function ShotChecklist({ c, big }: { c: CreatorData; big?: boolean }) {
  if (!c.plan.shots.length) return <p className="muted small">No shots yet. Add them on the Plan tab, or just roll and log takes below.</p>;
  return (
    <div className={`cr-shotbig ${big ? 'big' : ''}`}>
      {SHOT_KINDS.map((k) => {
        const shots = c.plan.shots.filter((s) => s.kind === k.value);
        if (!shots.length) return null;
        return (
          <div key={k.value}>
            <div className="cr-shotgroup-label">{k.label}</div>
            {shots.map((s) => (
              <div key={s.id} className={`cr-shotbig-row ${s.done ? 'done' : ''}`}>
                <button type="button" className="cr-tick" aria-pressed={!!s.done} aria-label="Got it" onClick={() => shotOps.toggle(s.id)} />
                <span className="grow" onClick={() => shotOps.toggle(s.id)}>
                  {s.text || 'Untitled shot'}
                </span>
                <button type="button" className="cr-takes" title="Count a take" onClick={() => shotOps.take(s.id)}>
                  {s.takes ?? 0} takes +
                </button>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function TakeLog({ c }: { c: CreatorData }) {
  const [text, setText] = useState('');
  const add = () => {
    if (!text.trim()) return;
    editCreator((x) => void x.shoot.log.unshift({ id: uid('log'), at: new Date().toISOString(), text: text.trim() }));
    setText('');
  };
  return (
    <div className="cr-log">
      <div className="row" style={{ gap: 6 }}>
        <Input value={text} placeholder="e.g. Take 3 is the one, laughed at the end" onChange={setText} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <Button size="sm" onClick={add} disabled={!text.trim()}>
          Log
        </Button>
      </div>
      <ul>
        {c.shoot.log.slice(0, 20).map((l) => (
          <li key={l.id}>
            <span className="muted small">{new Date(l.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span> {l.text}
            <IconButton icon={X} size="sm" label="Remove" onClick={() => editCreator((x) => void (x.shoot.log = x.shoot.log.filter((y) => y.id !== l.id)))} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Full screen: prompter on the left, checks, shots and the log on the right. Esc closes. */
export function ShootMode({ c, onClose }: { c: CreatorData; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const done = c.plan.shots.filter((s) => s.done).length;
  return createPortal(
    <div className="cr-shootmode" role="dialog" aria-label="Shoot mode">
      <div className="cr-shootmode-head">
        <Clapperboard size={18} />
        <b>Shoot mode</b>
        <span className="muted small">
          {done} of {c.plan.shots.length} shots
        </span>
        <div className="spacer" />
        <SprintTimer stage="shoot" compact />
        <Button icon={X} onClick={onClose}>
          Close (Esc)
        </Button>
      </div>
      <div className="cr-shootmode-body">
        <Teleprompter c={c} tall />
        <div className="cr-shootmode-side">
          <h4>Before you roll</h4>
          <CheckList items={c.shoot.preroll} list="preroll" big />
          <h4>Shots</h4>
          <ShotChecklist c={c} big />
          <h4>Take notes</h4>
          <TakeLog c={c} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function ShootTab({ c, onShootMode }: { c: CreatorData; onShootMode: () => void }) {
  return (
    <div className="cr-cols">
      <div className="cr-col">
        <div className="cr-shootcta">
          <div className="grow">
            <b>Ready to roll?</b>
            <div className="muted small">Shoot mode puts the prompter, your checks and the shots on one screen. Space bar rolls the prompter.</div>
          </div>
          <Button variant="primary" icon={Maximize2} onClick={onShootMode}>
            Shoot mode
          </Button>
        </div>
        <Section id="cr-preroll" title="Before you roll" hint="Every time you set up">
          <CheckList items={c.shoot.preroll} list="preroll" addLabel="Add a check" />
        </Section>
        <Section id="cr-shotlist" title="Shots">
          <ShotChecklist c={c} />
        </Section>
        <Section title="Take notes" hint="So the edit goes faster">
          <TakeLog c={c} />
        </Section>
      </div>
      <div className="cr-col">
        <Section title="Teleprompter">
          <Teleprompter c={c} />
        </Section>
      </div>
    </div>
  );
}
