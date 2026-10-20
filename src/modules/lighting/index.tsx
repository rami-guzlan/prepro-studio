/* ==========================================================================
   Lighting Diagrams — top-down lighting & camera plots.
   Left: diagram list + item library · Centre: SVG plot editor ·
   Right: inspector (item / selection / diagram settings, objects list).
   ========================================================================== */
import './lighting.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FileCode, FileImage, LayoutTemplate, Lightbulb, PackagePlus, Plus } from 'lucide-react';
import type { LightingDiagram } from '@/types';
import { getProject, useProject, useProjectId } from '@/store/project';
import { navigate, readLS, useApp, writeLS } from '@/store/app';
import { useScriptModel } from '@/derived/script';
import { Button, EmptyState, ExportMenu, Menu, ModuleHeader, toast } from '@/ui';
import { PAL_DARK, PAL_LIGHT } from './color';
import { countLights, newDiagram, totalWatts } from './model';
import { addDiagram, addLightsToGear } from './ops';
import { TEMPLATES } from './templates';
import Editor, { type EditorApi, type ViewPrefs } from './Editor';
import { Inspector } from './Inspector';
import { DiagramList, Library } from './LeftPane';
import { newDiagramItems, printKey } from './menus';
import { exportDiagramPng, exportDiagramSvg, exportLegendCsv } from './exporters';

const EMPTY: LightingDiagram[] = [];
const LS_PREFS = 'prepro.lighting.prefs';
const LS_INSPECTOR = 'prepro.lighting.inspector';

function useIsDark(): boolean {
  const read = () => document.documentElement.getAttribute('data-theme') === 'dark';
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const mo = new MutationObserver(() => setDark(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

export default function LightingModule() {
  const diagrams = useProject((p) => p.diagrams) ?? EMPTY;
  const pid = useProjectId();
  const model = useScriptModel();
  const params = useApp((s) => s.params);
  const navKey = useApp((s) => s.navKey);
  const dark = useIsDark();
  const pal = dark ? PAL_DARK : PAL_LIGHT;

  const [activeId, setActiveIdState] = useState<string>(() => readLS<string>(`prepro.lighting.active.${pid}`, ''));
  const active = diagrams.find((d) => d.id === activeId) ?? diagrams[0];
  const setActiveId = (id: string) => {
    setActiveIdState(id);
    writeLS(`prepro.lighting.active.${pid}`, id);
  };

  const [sel, setSel] = useState<string[]>([]);
  const activeKey = active?.id;
  useEffect(() => setSel([]), [activeKey]);

  const [prefs, setPrefsState] = useState<ViewPrefs>(() => ({ snap: true, beams: true, fov: true, labels: true, ...readLS<Partial<ViewPrefs>>(LS_PREFS, {}) }));
  const setPrefs = (p: Partial<ViewPrefs>) =>
    setPrefsState((cur) => {
      const next = { ...cur, ...p };
      writeLS(LS_PREFS, next);
      return next;
    });
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(() => readLS<boolean>(LS_INSPECTOR, true));
  const toggleInspector = () =>
    setInspectorOpen((v) => {
      writeLS(LS_INSPECTOR, !v);
      return !v;
    });

  const apiRef = useRef<EditorApi | null>(null);

  // navigation from other modules: navigate('lighting', { diagramId }) or { sceneId }
  useEffect(() => {
    if (!params) return;
    if (params.diagramId && diagrams.some((d) => d.id === params.diagramId)) setActiveId(params.diagramId);
    else if (params.sceneId) {
      const d = diagrams.find((x) => (x.sceneIds ?? []).includes(params.sceneId));
      if (d) setActiveId(d.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navKey]);

  const createDiagram = (templateId?: string) => {
    const tpl = templateId ? TEMPLATES.find((t) => t.id === templateId) : undefined;
    const d = tpl ? tpl.build() : newDiagram(`Diagram ${diagrams.length + 1}`);
    if (!tpl && typeof params?.sceneId === 'string' && model.sceneById.has(params.sceneId)) d.sceneIds = [params.sceneId];
    addDiagram(d);
    setActiveId(d.id);
    setSel([]);
  };

  const stats = useMemo(() => {
    let lights = 0;
    let watts = 0;
    for (const d of diagrams) {
      lights += countLights(d);
      watts += totalWatts(d);
    }
    return { lights, watts };
  }, [diagrams]);

  const addToGear = () => {
    if (!active) return;
    const r = addLightsToGear(active.id);
    if (!r.added.length) toast(r.skipped.length ? 'All of these fixtures are already on the Gear list' : 'No rentable fixtures on this diagram yet', 'info');
    else
      toast(`Added ${r.added.map((a) => `${a.qty}× ${a.name}`).join(', ')} to Gear${r.skipped.length ? ` · ${r.skipped.length} already listed` : ''}`, 'success', {
        action: { label: 'Open Gear', onClick: () => navigate('gear') },
      });
  };

  const header = (
    <ModuleHeader
      title="Lighting Diagrams"
      icon={Lightbulb}
      subtitle={diagrams.length ? `${diagrams.length} diagram${diagrams.length === 1 ? '' : 's'} · ${stats.lights} light${stats.lights === 1 ? '' : 's'}${stats.watts ? ` · ${stats.watts.toLocaleString()} W` : ''}` : 'Top-down lighting & camera plots'}
      actions={
        <>
          {active && (
            <Button icon={PackagePlus} onClick={addToGear} title="Add this diagram's fixtures to the Gear list (category Lighting)">
              Add lights to Gear
            </Button>
          )}
          <ExportMenu
            docs={[
              ...(active ? [{ id: 'lighting-diagram', label: `This diagram (${active.name || 'untitled'})`, options: { diagram: printKey(active, diagrams) } }] : []),
              { id: 'lighting-diagram', label: 'All diagrams', options: { diagram: 'all' } },
              { id: 'lighting-gear-summary', label: 'Gaffer’s gear summary' },
            ]}
            csv={active ? [{ label: 'Light & camera key (CSV)', onClick: () => exportLegendCsv(getProject(), active) }] : []}
            extra={
              active
                ? [
                    { header: 'Image' },
                    { label: 'Export PNG (2×)', icon: FileImage, onClick: () => exportDiagramPng(getProject(), active) },
                    { label: 'Export SVG (vector)', icon: FileCode, onClick: () => exportDiagramSvg(getProject(), active) },
                  ]
                : []
            }
          />
          <Menu trigger={<Button variant="primary" icon={Plus}>New diagram</Button>} items={() => newDiagramItems(createDiagram)} align="end" />
        </>
      }
    />
  );

  if (!active) {
    return (
      <div className="module">
        {header}
        <div className="module-body">
          <EmptyState
            icon={Lightbulb}
            title="No lighting diagrams yet"
            description="Plot cameras, lights, grip, actors and blocking from above — then print a clean plot with a light key for your gaffer and DP, or push the fixtures to the Gear list."
            action={
              <div className="col" style={{ alignItems: 'center', gap: 12 }}>
                <Button variant="primary" icon={Plus} onClick={() => createDiagram()}>
                  New blank diagram
                </Button>
                <div className="row wrap" style={{ justifyContent: 'center', gap: 6 }}>
                  {TEMPLATES.map((t) => (
                    <Button key={t.id} size="sm" icon={LayoutTemplate} onClick={() => createDiagram(t.id)} title={t.description}>
                      {t.label}
                    </Button>
                  ))}
                </div>
              </div>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="module">
      {header}
      <div className={`split light-split ${inspectorOpen ? '' : 'no-inspector'}`}>
        <div className="pane-left light-left">
          <DiagramList diagrams={diagrams} activeId={active.id} onSelect={setActiveId} onNew={createDiagram} model={model} />
          <Library onAdd={(kind) => apiRef.current?.add(kind)} pal={pal} />
        </div>
        <div className="pane-main light-center">
          <Editor
            key={active.id}
            d={active}
            sel={sel}
            setSel={setSel}
            apiRef={apiRef}
            prefs={prefs}
            setPrefs={setPrefs}
            pal={pal}
            inspectorOpen={inspectorOpen}
            toggleInspector={toggleInspector}
          />
        </div>
        {inspectorOpen && (
          <div className="pane-right light-right">
            <Inspector d={active} sel={sel} setSel={setSel} pal={pal} />
          </div>
        )}
      </div>
    </div>
  );
}
