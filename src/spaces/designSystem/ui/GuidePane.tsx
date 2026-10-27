/* Brand Kit & Assets › Agent guide: readiness + to-do list, the compiled Markdown guide (what agents read),
   copy / export, and how agents get it. */
import '../designSystem.css';
import { useDeferredValue, useMemo, useState } from 'react';
import { ArrowRight, Bot, CheckCircle2, Circle, Copy, Eye, FileCode2 } from 'lucide-react';
import { useSpaceData } from '@/store/space';
import { Button, Tabs } from '@/ui';
import { copyText } from '@/spaces/modules/assets/actions';
import { compileGuide, dsReadiness } from '../compile';
import { EXPORT_ITEMS, runExport } from './io';
import { Markdown } from './Markdown';
import { Readiness } from './DesignSystemPane';
import { DS_SECTIONS, sectionOfMissing, type DSSectionId } from './options';

export function GuidePane({ onJump }: { onJump: (target: DSSectionId | 'assets') => void }) {
  const space = useSpaceData();
  const deferred = useDeferredValue(space);
  const guide = useMemo(() => compileGuide(deferred), [deferred]);
  const { missing } = useMemo(() => dsReadiness(space), [space]);
  const [view, setView] = useState<'read' | 'source'>('read');
  const words = useMemo(() => guide.split(/\s+/).length, [guide]);

  return (
    <div className="ds-guide">
      <aside className="ds-guide-side">
        <div className="ds-card">
          <Readiness compact />
          {missing.length > 0 ? (
            <>
              <div className="section-title" style={{ marginTop: 14 }}>
                Still missing
              </div>
              <ul className="ds-missing">
                {missing.map((m) => {
                  const target = sectionOfMissing(m);
                  const label = target === 'assets' ? 'Assets' : DS_SECTIONS.find((s) => s.id === target)?.label;
                  return (
                    <li key={m}>
                      <button type="button" onClick={() => onJump(target)} title={`Go to ${label}`}>
                        <Circle size={12} className="muted" />
                        <span className="grow">{m}</span>
                        <span className="muted small ds-missing-where">{label}</span>
                        <ArrowRight size={12} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="ds-ready-done">
              <CheckCircle2 size={14} /> Everything an agent needs is in place.
            </p>
          )}
        </div>

        <div className="ds-card">
          <div className="section-title">Export</div>
          <div className="ds-export-list">
            {EXPORT_ITEMS.map((x) => {
              const Icon = x.icon;
              return (
                <button key={x.format} type="button" className="ds-export" onClick={() => void runExport(x.format)}>
                  <Icon size={16} />
                  <span className="grow">
                    <b>{x.label}</b>
                    <span className="muted small">{x.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="ds-card ds-explain">
          <div className="section-title">
            <Bot size={12} /> How agents get it
          </div>
          <p>
            <b>Agents connected to PrePro Studio</b> call the <code>design_system</code> tool and receive this guide (or one part of it, e.g. only the rules or one brief) together with the tokens.
          </p>
          <p>
            <b>Anywhere else</b> — Claude Design, Claude Code, an image model — export the <b>bundle (.zip)</b>: its <code>README.md</code> is this guide, next to <code>tokens.json</code>, <code>tokens.css</code> and the logo, font and image files it links to.
          </p>
          <p className="muted small">Edits in the Design system and Assets tabs show up here immediately.</p>
        </div>
      </aside>

      <div className="ds-card ds-guide-doc">
        <div className="ds-guide-bar">
          <Tabs<'read' | 'source'>
            tabs={[
              { id: 'read', label: 'Read', icon: Eye },
              { id: 'source', label: 'Markdown', icon: FileCode2 },
            ]}
            value={view}
            onChange={setView}
          />
          <span className="muted small">{words.toLocaleString()} words</span>
          <div className="spacer" />
          <Button icon={Copy} onClick={() => copyText(guide, 'the guide as Markdown')}>
            Copy Markdown
          </Button>
        </div>
        {view === 'read' ? <Markdown text={guide} className="ds-guide-md" /> : <pre className="ds-pre ds-guide-src">{guide}</pre>}
      </div>
    </div>
  );
}
