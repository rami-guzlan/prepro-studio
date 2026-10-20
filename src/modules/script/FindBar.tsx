import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { Button, Checkbox, IconButton, toast } from '@/ui';
import { useScriptUI } from './scriptUI';
import { findKey, gotoMatch, replaceAll, replaceCurrent, setFind } from './editor/find';

export function FindBar() {
  const open = useScriptUI((s) => s.findOpen);
  const replaceOpen = useScriptUI((s) => s.replaceOpen);
  const view = useScriptUI((s) => s.view);
  const [q, setQ] = useState('');
  const [rep, setRep] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [whole, setWhole] = useState(false);
  const [, force] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      if (view) {
        const { from, to } = view.state.selection;
        const sel = view.state.doc.textBetween(from, to, ' ');
        if (sel && sel.length < 80 && !sel.includes('\n')) setQ(sel);
      }
      setTimeout(() => inputRef.current?.select(), 0);
    } else if (view) setFind(view, { query: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, replaceOpen]);

  useEffect(() => {
    if (!view || !open) return;
    setFind(view, { query: q, matchCase, wholeWord: whole });
    force((n) => n + 1);
  }, [q, matchCase, whole, view, open]);

  if (!open || !view) return null;
  const st = findKey.getState(view.state);
  const count = st?.matches.length ?? 0;
  const cur = st && st.current >= 0 ? st.current + 1 : 0;
  const close = () => {
    useScriptUI.setState({ findOpen: false, replaceOpen: false });
    view.focus();
  };

  return (
    <div className="sp-findbar" data-own-undo>
      <input
        ref={inputRef}
        className="input sm"
        placeholder="Find in script"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            gotoMatch(view, e.shiftKey ? -1 : 1);
            force((n) => n + 1);
          }
          if (e.key === 'Escape') close();
        }}
      />
      <span className="muted small" style={{ minWidth: 60 }}>
        {q ? (count ? `${cur} of ${count}` : 'No results') : ''}
      </span>
      <IconButton icon={ChevronUp} size="sm" label="Previous (Shift+Enter)" onClick={() => { gotoMatch(view, -1); force((n) => n + 1); }} disabled={!count} />
      <IconButton icon={ChevronDown} size="sm" label="Next (Enter)" onClick={() => { gotoMatch(view, 1); force((n) => n + 1); }} disabled={!count} />
      <Checkbox checked={matchCase} onChange={setMatchCase} label="Match case" />
      <Checkbox checked={whole} onChange={setWhole} label="Whole word" />
      {replaceOpen ? (
        <>
          <span className="vdivider" />
          <input className="input sm" placeholder="Replace with" value={rep} onChange={(e) => setRep(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && close()} />
          <Button size="sm" onClick={() => { replaceCurrent(view, rep); force((n) => n + 1); }} disabled={!count}>
            Replace
          </Button>
          <Button
            size="sm"
            onClick={() => {
              const n = replaceAll(view, rep);
              toast(`Replaced ${n} occurrence${n === 1 ? '' : 's'}`);
              force((x) => x + 1);
            }}
            disabled={!count}
          >
            Replace all
          </Button>
        </>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => useScriptUI.setState({ replaceOpen: true })}>
          Replace…
        </Button>
      )}
      <div className="spacer" />
      <IconButton icon={X} size="sm" label="Close (Esc)" onClick={close} />
    </div>
  );
}
