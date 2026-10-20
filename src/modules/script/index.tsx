/* Script module: screenplay editor (Final Draft-style), title page, index cards,
   and the two-column A/V script editor for corporate / documentary work. */
import './script.css';
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bold,
  Columns2,
  FileDown,
  FileInput,
  FileText,
  Highlighter,
  Italic,
  MessageSquarePlus,
  PanelLeft,
  PanelRight,
  Search,
  Tag,
  Underline,
  Users2,
  ScrollText,
} from 'lucide-react';
import type { BreakdownCategory, ElementType } from '@/types';
import { toggleMark } from 'prosemirror-commands';
import { ELEMENT_LABELS, ELEMENT_SHORTCUTS, ELEMENT_TYPES, screenplaySchema as schema } from '@/script-core/schema';
import { BREAKDOWN_CATEGORIES } from '@/lib/constants';
import { useCommand } from '@/lib/commands';
import { openPrint, useApp } from '@/store/app';
import { update, useProject } from '@/store/project';
import { useScriptModel } from '@/derived/script';
import { Button, IconButton, Menu, ModuleHeader, Select, Tabs, UnderlineTabs, confirmDialog, type MenuItem } from '@/ui';
import { useScriptUI, setScriptUIPref, type ScriptTab } from './scriptUI';
import { ScreenplayEditor } from './editor/ScreenplayEditor';
import { setElement, toggleDual } from './editor/commands';
import { addNote, scrollToScene, tagSelection, untag } from './editor/actions';
import { Navigator } from './Navigator';
import { Inspector } from './Inspector';
import { FindBar } from './FindBar';
import { TitlePageEditor } from './TitlePageEditor';
import { IndexCards } from './IndexCards';
import { MindDump } from './mind/MindDump';
import { mindTotals } from '@/lib/mind';
import { exportFdx, exportFountain, exportPlainText, importIntoProject } from './exports';

const AVScriptEditor = lazy(() => import('../avscript'));

const TAG_CSS = BREAKDOWN_CATEGORIES.map((c) => `.sp-page .tag[data-cat="${c.id}"]{--tag-color:${c.color}}`).join('\n');

export default function ScriptModule() {
  const mode = useProject((p) => p.script.mode);
  const model = useScriptModel();
  const tab = useScriptUI((s) => s.tab);
  const mindCount = useProject((p) => mindTotals(p.script.mind).notes);
  const params = useApp((s) => s.params);
  const navKey = useApp((s) => s.navKey);

  // navigation params: { sceneId } jumps to a scene, { import } opens import
  useEffect(() => {
    if (['script', 'titlepage', 'cards', 'mind'].includes(params?.tab)) useScriptUI.setState({ tab: params.tab });
    if (params?.import) {
      importMenuAction();
    }
    if (params?.sceneId) {
      useScriptUI.setState({ tab: 'script' });
      const tryScroll = (n: number) => {
        const v = useScriptUI.getState().view;
        if (v) scrollToScene(v, params.sceneId);
        else if (n > 0) setTimeout(() => tryScroll(n - 1), 80);
      };
      setTimeout(() => tryScroll(10), 60);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navKey]);

  const subtitle =
    mode === 'av'
      ? 'Two-column audio / video script'
      : `${model.pageCount} page${model.pageCount === 1 ? '' : 's'} · ${model.scenes.length} scene${model.scenes.length === 1 ? '' : 's'} · ~${Math.max(1, Math.round(model.estMinutes))} min · ${model.wordCount.toLocaleString()} words`;

  const exportItems: MenuItem[] =
    mode === 'av'
      ? [
          { header: 'Print & PDF' },
          { label: 'A/V script', icon: FileDown, onClick: () => openPrint('av-script') },
          { separator: true },
          { header: 'Screenplay files' },
          { label: 'Screenplay PDF', icon: FileDown, onClick: () => openPrint('screenplay') },
        ]
      : [
          { header: 'Print & PDF' },
          { label: 'Screenplay', icon: FileDown, shortcut: 'Ctrl+P', onClick: () => openPrint('screenplay') },
          { label: 'Title page only', icon: FileDown, onClick: () => openPrint('title-page') },
          { label: 'Scene report', icon: FileDown, onClick: () => openPrint('scene-report') },
          { label: 'Script notes', icon: FileDown, onClick: () => openPrint('script-notes') },
          { separator: true },
          { header: 'Script files' },
          { label: 'Final Draft (.fdx)', icon: FileText, onClick: exportFdx },
          { label: 'Fountain (.fountain)', icon: FileText, onClick: exportFountain },
          { label: 'Plain text, formatted (.txt)', icon: FileText, onClick: exportPlainText },
        ];

  useCommand('print', () => {
    openPrint(mode === 'av' ? 'av-script' : 'screenplay');
    return true;
  });

  return (
    <div className="module">
      <style>{TAG_CSS}</style>
      <ModuleHeader
        title="Script"
        icon={FileText}
        subtitle={subtitle}
        actions={
          <>
            <Tabs
              value={mode}
              onChange={(v) => update((d) => void (d.script.mode = v))}
              tabs={[
                { id: 'screenplay', label: 'Screenplay', icon: ScrollText },
                { id: 'av', label: 'A/V Script', icon: Columns2 },
              ]}
            />
            <Menu
              align="end"
              trigger={<Button icon={FileInput}>Import</Button>}
              items={[
                { header: 'Fountain · Final Draft (.fdx) · Text' },
                { label: 'Replace current script…', onClick: () => importReplace() },
                { label: 'Append to the end…', onClick: () => importIntoProject('append') },
              ]}
            />
            <Menu align="end" trigger={<Button variant="primary" icon={FileDown}>Print / Export</Button>} items={exportItems} />
          </>
        }
      />
      {mode === 'av' ? (
        <>
          <UnderlineTabs<ScriptTab>
            value={tab === 'mind' ? 'mind' : 'script'}
            onChange={(t) => useScriptUI.setState({ tab: t })}
            tabs={[
              { id: 'script', label: 'A/V Script' },
              { id: 'mind', label: 'Mind Dump', count: mindCount || undefined },
            ]}
          />
          {tab === 'mind' ? (
            <MindDump />
          ) : (
            <div className="module-body">
              <Suspense fallback={<div className="module-loading">Loading…</div>}>
                <AVScriptEditor />
              </Suspense>
            </div>
          )}
        </>
      ) : (
        <>
          <UnderlineTabs<ScriptTab>
            value={tab}
            onChange={(t) => useScriptUI.setState({ tab: t })}
            tabs={[
              { id: 'script', label: 'Script' },
              { id: 'titlepage', label: 'Title Page' },
              { id: 'cards', label: 'Index Cards', count: model.scenes.length || undefined },
              { id: 'mind', label: 'Mind Dump', count: mindCount || undefined },
            ]}
          />
          {tab === 'script' && <ScriptWorkspace />}
          {tab === 'titlepage' && <TitlePageEditor />}
          {tab === 'cards' && <IndexCards />}
          {tab === 'mind' && <MindDump />}
        </>
      )}
    </div>
  );
}

async function importReplace() {
  const ok = await confirmDialog({
    title: 'Replace the current script?',
    message: 'The imported file replaces all script text. Scene metadata is kept where scenes match. A backup of the project is kept automatically.',
    confirmLabel: 'Choose file…',
  });
  if (ok) await importIntoProject('replace');
}

async function importMenuAction() {
  await importReplace();
}

/* ---------------------------------------------------------------- workspace */

/** Zoom 0 = fit the page to the available width. */
function useEffectiveZoom(deskRef: React.RefObject<HTMLDivElement | null>) {
  const zoomSetting = useProject((p) => p.settings.script.zoom ?? 0);
  const paper = useProject((p) => p.settings.paperSize);
  const [deskW, setDeskW] = useState(1000);
  useEffect(() => {
    const el = deskRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDeskW(el.clientWidth));
    ro.observe(el);
    setDeskW(el.clientWidth);
    return () => ro.disconnect();
  }, [deskRef]);
  if (zoomSetting > 0) return zoomSetting;
  const pagePx = (paper === 'a4' ? 8.27 : 8.5) * 96 + 80;
  return Math.max(0.5, Math.min(1.3, Math.floor(((deskW - 24) / pagePx) * 100) / 100));
}

function ScriptWorkspace() {
  const showNav = useScriptUI((s) => s.showNavigator);
  const showInsp = useScriptUI((s) => s.showInspector);
  const deskRef = useRef<HTMLDivElement>(null);
  const zoom = useEffectiveZoom(deskRef);

  useCommand('find', () => {
    useScriptUI.setState({ findOpen: true });
    return true;
  });

  const onKeyDown = (e: React.KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    const view = useScriptUI.getState().view;
    if (!view) return;
    const k = e.key.toLowerCase();
    if (mod && k === 'h') {
      e.preventDefault();
      useScriptUI.setState({ findOpen: true, replaceOpen: true });
    } else if (mod && k === 'g') {
      e.preventDefault();
      if (!useScriptUI.getState().showNavigator) setScriptUIPref('showNavigator', true);
      setTimeout(() => (document.querySelector('.sp-nav input') as HTMLInputElement | null)?.focus(), 30);
    } else if (mod && e.altKey && k === 'm') {
      e.preventDefault();
      addNote(view);
    } else if (mod && e.altKey && k === 't') {
      e.preventDefault();
      (document.querySelector('.sp-tag-btn') as HTMLButtonElement | null)?.click();
    } else if (mod && (k === '=' || k === '+') && !e.shiftKey && e.altKey) {
      e.preventDefault();
      setZoom(Math.min(2, (zoom || 1) + 0.1));
    } else if (mod && k === '-' && e.altKey) {
      e.preventDefault();
      setZoom(Math.max(0.5, (zoom || 1) - 0.1));
    }
  };

  return (
    <>
      <ScriptToolbar />
      <div className="sp-layout" onKeyDown={onKeyDown}>
        {showNav && <Navigator />}
        <div className="sp-desk" ref={deskRef}>
          <FindBar />
          <div className="sp-zoom" style={{ zoom }}>
            <ScreenplayEditor />
          </div>
        </div>
        {showInsp && <Inspector />}
      </div>
      <StatusBar />
    </>
  );
}

function setZoom(z: number) {
  update((d) => void (d.settings.script.zoom = Math.round(z * 100) / 100), { history: false });
}

function ScriptToolbar() {
  const view = useScriptUI((s) => s.view);
  const element = useScriptUI((s) => s.element);
  const showNav = useScriptUI((s) => s.showNavigator);
  const showInsp = useScriptUI((s) => s.showInspector);
  const showTags = useScriptUI((s) => s.showTags);
  const cursorTags = useScriptUI((s) => s.cursorTags);
  const pageView = useProject((p) => p.settings.script.pageView);
  const zoom = useProject((p) => p.settings.script.zoom ?? 0);

  const run = (fn: (v: NonNullable<typeof view>) => void) => () => {
    if (!view) return;
    fn(view);
    view.focus();
  };

  const tagItems = (all: boolean): MenuItem[] => BREAKDOWN_CATEGORIES.map((c) => ({ label: c.label, onClick: () => view && tagSelection(view, c.id as BreakdownCategory, all) }));

  return (
    <div className="sp-toolbar">
      <IconButton icon={PanelLeft} label="Scene navigator" active={showNav} onClick={() => setScriptUIPref('showNavigator', !showNav)} />
      <span className="vdivider" />
      <Select
        className="sp-el-select"
        size="sm"
        value={element}
        onChange={(v) => {
          if (!view) return;
          setElement(v as ElementType)(view.state, view.dispatch);
          view.focus();
        }}
        options={ELEMENT_TYPES.map((t) => ({ value: t, label: `${ELEMENT_LABELS[t]}  (Ctrl+${ELEMENT_SHORTCUTS[t]})` }))}
      />
      <IconButton icon={Bold} label="Bold (Ctrl+B)" size="sm" onClick={run((v) => toggleMark(schema.marks.bold)(v.state, v.dispatch))} />
      <IconButton icon={Italic} label="Italic (Ctrl+I)" size="sm" onClick={run((v) => toggleMark(schema.marks.italic)(v.state, v.dispatch))} />
      <IconButton icon={Underline} label="Underline (Ctrl+U)" size="sm" onClick={run((v) => toggleMark(schema.marks.underline)(v.state, v.dispatch))} />
      <IconButton icon={Users2} label="Dual dialogue (Ctrl+D)" size="sm" onClick={run((v) => toggleDual(v.state, v.dispatch))} />
      <span className="vdivider" />
      <Menu
        trigger={
          <Button size="sm" icon={Tag} className="sp-tag-btn">
            Tag
          </Button>
        }
        items={() => [
          { header: 'Tag selection / word as' },
          ...tagItems(false),
          { separator: true },
          { header: 'Tag every occurrence as' },
          ...BREAKDOWN_CATEGORIES.slice(0, 6).map((c) => ({ label: `${c.label} (all)`, onClick: () => view && tagSelection(view, c.id as BreakdownCategory, true) })),
          { separator: true },
          { label: 'Remove tag', disabled: !cursorTags.length, onClick: () => view && untag(view) },
        ]}
      />
      <Button size="sm" icon={MessageSquarePlus} onClick={run((v) => addNote(v))}>
        Note
      </Button>
      <IconButton icon={Highlighter} label={showTags ? 'Hide tag highlights' : 'Show tag highlights'} size="sm" active={showTags} onClick={() => setScriptUIPref('showTags', !showTags)} />
      <IconButton icon={Search} label="Find & replace (Ctrl+F / Ctrl+H)" size="sm" onClick={() => useScriptUI.setState({ findOpen: true })} />
      <div className="spacer" />
      <Tabs
        value={pageView ? 'page' : 'draft'}
        onChange={(v) => update((d) => void (d.settings.script.pageView = v === 'page'), { history: false })}
        tabs={[
          { id: 'page', label: 'Pages' },
          { id: 'draft', label: 'Draft' },
        ]}
      />
      <Select
        size="sm"
        style={{ width: 84 }}
        value={String(zoom)}
        onChange={(v) => setZoom(Number(v))}
        options={['0', '0.6', '0.75', '0.9', '1', '1.1', '1.25', '1.5', '1.75', '2'].map((z) => ({ value: z, label: z === '0' ? 'Fit' : `${Math.round(Number(z) * 100)}%` }))}
      />
      <IconButton icon={PanelRight} label="Scene inspector & notes" active={showInsp} onClick={() => setScriptUIPref('showInspector', !showInsp)} />
    </div>
  );
}

function StatusBar() {
  const element = useScriptUI((s) => s.element);
  const page = useScriptUI((s) => s.page);
  const info = useScriptUI((s) => s.pageInfo);
  const sceneId = useScriptUI((s) => s.sceneId);
  const flow = useProject((p) => p.settings.script.flow);
  const pages = info?.pagination.pages.length ?? 1;
  const sceneNum = sceneId ? info?.sceneNumbers.get(sceneId) : undefined;
  const f = flow[element];
  const hints = useMemo(() => {
    if (!f) return null;
    return (
      <span className="flow-hint">
        <b>{ELEMENT_LABELS[element]}</b> · Enter → {ELEMENT_LABELS[f.enter]} · Tab → {ELEMENT_LABELS[f.tab]} · empty Tab → {ELEMENT_LABELS[f.tabEmpty]}
      </span>
    );
  }, [f, element]);
  return (
    <div className="sp-statusbar">
      {hints}
      <div className="spacer" />
      {sceneNum && <span>Scene {sceneNum}</span>}
      <span>
        Page {page} of {pages}
      </span>
    </div>
  );
}
