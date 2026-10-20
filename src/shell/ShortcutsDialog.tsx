import { Fragment } from 'react';
import { useApp } from '@/store/app';
import { Kbd, Modal } from '@/ui';

const GROUPS: { title: string; rows: [string, string[]][] }[] = [
  {
    title: 'Everywhere',
    rows: [
      ['Undo / Redo', ['Ctrl', 'Z', '/', 'Ctrl', 'Y']],
      ['Save now', ['Ctrl', 'S']],
      ['Print & Export (current document)', ['Ctrl', 'P']],
      ['Find', ['Ctrl', 'F']],
      ['New project', ['Ctrl', 'Shift', 'N']],
      ['New marketing space', ['Ctrl', 'Shift', 'M']],
      ['Library (projects & spaces)', ['Ctrl', 'Shift', 'H']],
      ['Project / space settings', ['Ctrl', ',']],
      ['Toggle sidebar', ['Ctrl', '\\']],
      ['Keyboard shortcuts', ['F1']],
    ],
  },
  {
    title: 'Script — elements (Final Draft style)',
    rows: [
      ['General', ['Ctrl', '0']],
      ['Scene Heading', ['Ctrl', '1']],
      ['Action', ['Ctrl', '2']],
      ['Character', ['Ctrl', '3']],
      ['Parenthetical', ['Ctrl', '4']],
      ['Dialogue', ['Ctrl', '5']],
      ['Transition', ['Ctrl', '6']],
      ['Shot', ['Ctrl', '7']],
      ['Next element (Enter flow)', ['Enter']],
      ['Change / next element (Tab flow)', ['Tab']],
      ['Previous element', ['Shift', 'Tab']],
      ['Line break inside element', ['Shift', 'Enter']],
    ],
  },
  {
    title: 'Script — editing',
    rows: [
      ['Bold / Italic / Underline', ['Ctrl', 'B', 'I', 'U']],
      ['Dual dialogue (on a character)', ['Ctrl', 'D']],
      ['Accept SmartType suggestion', ['Enter', '/', 'Tab']],
      ['Dismiss suggestions', ['Esc']],
      ['Find & replace', ['Ctrl', 'H']],
      ['Go to scene', ['Ctrl', 'G']],
      ['Add script note', ['Ctrl', 'Alt', 'M']],
      ['Tag selection for breakdown', ['Ctrl', 'Alt', 'T']],
      ['Zoom in / out', ['Ctrl', '+', '/', '-']],
    ],
  },
];

export function ShortcutsDialog() {
  const open = useApp((s) => s.shortcutsOpen);
  return (
    <Modal open={open} onClose={() => useApp.setState({ shortcutsOpen: false })} title="Keyboard shortcuts" size="lg">
      <div className="col" style={{ gap: 20 }}>
        {GROUPS.map((g) => (
          <div key={g.title}>
            <div className="section-title">{g.title}</div>
            <div className="shortcut-grid">
              {g.rows.map(([label, keys]) => (
                <div className="shortcut-row" key={label}>
                  <span>{label}</span>
                  <span className="keys">
                    {keys.map((k, i) => (
                      <Fragment key={i}>{k === '/' ? <span className="muted">/</span> : <Kbd>{k}</Kbd>}</Fragment>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
