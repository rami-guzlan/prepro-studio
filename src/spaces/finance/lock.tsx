/* Personal Finances screen lock: a PIN (stored by the backend as a salted hash)
   unlocks the finances on screen for this app session. It is a UI lock only:
   connected AI agents use the finance tools whether or not the screen is locked
   (in the hosted version the server keeps finances private to the owner).
   Locks again after 15 minutes without activity, from the sidebar, or when the
   app closes. Note: this is not encryption of the files on disk. */
import './lock.css';
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { LockKeyhole } from 'lucide-react';
import { backend } from '@/backend';
import { Button, Field, Modal } from '@/ui';

export const AUTO_LOCK_MS = 15 * 60 * 1000;

interface LockState {
  unlocked: boolean;
  lastActive: number;
  /** pending unlock prompt */
  prompt: { mode: 'unlock' | 'create' | 'change'; resolve: (ok: boolean) => void } | null;
}

export const useFinanceLock = create<LockState>(() => ({ unlocked: false, lastActive: Date.now(), prompt: null }));

export function isFinanceUnlocked(): boolean {
  const s = useFinanceLock.getState();
  if (s.unlocked && Date.now() - s.lastActive > AUTO_LOCK_MS) {
    lockFinances();
    return false;
  }
  return s.unlocked;
}

const lockListeners = new Set<() => void>();
/** Called when the finances lock (e.g. to leave the open finance space). */
export function onFinanceLock(fn: () => void): () => void {
  lockListeners.add(fn);
  return () => lockListeners.delete(fn);
}

export function lockFinances() {
  if (!useFinanceLock.getState().unlocked) return;
  useFinanceLock.setState({ unlocked: false });
  for (const fn of lockListeners) fn();
}

export function touchFinances() {
  if (useFinanceLock.getState().unlocked) useFinanceLock.setState({ lastActive: Date.now() });
}

/** Ask for the PIN (or to create one the first time). Resolves true when unlocked. */
export async function requestFinanceUnlock(): Promise<boolean> {
  if (isFinanceUnlocked()) return true;
  const { set } = await backend.financePin.status();
  return new Promise<boolean>((resolve) => useFinanceLock.setState({ prompt: { mode: set ? 'unlock' : 'create', resolve } }));
}

export function requestPinChange(): Promise<boolean> {
  return new Promise<boolean>((resolve) => useFinanceLock.setState({ prompt: { mode: 'change', resolve } }));
}

function PinInput({ value, onChange, autoFocus, label }: { value: string; onChange: (v: string) => void; autoFocus?: boolean; label: string }) {
  return (
    <input
      className="input fin-pin-input"
      type="password"
      inputMode="numeric"
      autoComplete="off"
      maxLength={12}
      autoFocus={autoFocus}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
    />
  );
}

/** Mounted once in the app shell. */
export function FinanceLockHost() {
  const prompt = useFinanceLock((s) => s.prompt);
  const [pin, setPin] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // activity keeps the session alive; check the idle timeout every 30 s
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const touch = () => touchFinances();
    window.addEventListener('pointerdown', touch, true);
    window.addEventListener('keydown', touch, true);
    timer.current = window.setInterval(() => void isFinanceUnlocked(), 30000);
    return () => {
      window.removeEventListener('pointerdown', touch, true);
      window.removeEventListener('keydown', touch, true);
      window.clearInterval(timer.current);
    };
  }, []);

  useEffect(() => {
    setPin('');
    setNext('');
    setAgain('');
    setError('');
  }, [prompt]);

  if (!prompt) return null;
  const close = (ok: boolean) => {
    useFinanceLock.setState({ prompt: null });
    prompt.resolve(ok);
  };
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (prompt.mode === 'unlock') {
        const r = await backend.financePin.verify(pin);
        if (!r.ok) {
          setError(r.error ?? 'Wrong PIN');
          setPin('');
          return;
        }
        useFinanceLock.setState({ unlocked: true, lastActive: Date.now() });
        close(true);
        return;
      }
      if (next !== again) {
        setError('The two PINs don’t match');
        return;
      }
      const r = await backend.financePin.set(prompt.mode === 'change' ? pin : null, next);
      if (!r.ok) {
        setError(r.error ?? 'Could not set the PIN');
        return;
      }
      useFinanceLock.setState({ unlocked: true, lastActive: Date.now() });
      close(true);
    } finally {
      setBusy(false);
    }
  };
  const title = prompt.mode === 'unlock' ? 'Unlock Personal Finances' : prompt.mode === 'create' ? 'Create a PIN for Personal Finances' : 'Change the finances PIN';
  const ready = prompt.mode === 'unlock' ? pin.length >= 4 : next.length >= 4 && again.length >= 4 && (prompt.mode === 'create' || pin.length >= 4);
  return (
    <Modal
      open
      size="sm"
      title={title}
      onClose={() => close(false)}
      footer={
        <>
          <div className="spacer" />
          <Button onClick={() => close(false)}>Cancel</Button>
          <Button variant="primary" disabled={!ready || busy} onClick={() => void submit()}>
            {prompt.mode === 'unlock' ? 'Unlock' : 'Save PIN'}
          </Button>
        </>
      }
    >
      <form
        className="fin-lock"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) void submit();
        }}
      >
        <div className="fin-lock-icon">
          <LockKeyhole size={26} />
        </div>
        <p className="muted small" style={{ margin: 0, textAlign: 'center' }}>
          {prompt.mode === 'unlock'
            ? 'Your finances stay locked for this session until you lock them, close the app or leave it idle for 15 minutes. Connected AI agents can only read them while unlocked.'
            : 'Use 4 to 12 digits. It unlocks your finances in this app and for your connected AI agents.'}
        </p>
        {(prompt.mode === 'unlock' || prompt.mode === 'change') && (
          <Field label={prompt.mode === 'unlock' ? 'PIN' : 'Current PIN'}>
            <PinInput value={pin} onChange={setPin} autoFocus label="PIN" />
          </Field>
        )}
        {prompt.mode !== 'unlock' && (
          <>
            <Field label="New PIN">
              <PinInput value={next} onChange={setNext} autoFocus={prompt.mode === 'create'} label="New PIN" />
            </Field>
            <Field label="Repeat the new PIN">
              <PinInput value={again} onChange={setAgain} label="Repeat the new PIN" />
            </Field>
          </>
        )}
        {error && <div className="fin-lock-error">{error}</div>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
