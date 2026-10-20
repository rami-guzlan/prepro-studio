/* Right pane: properties of the selected item(s), diagram settings when
   nothing is selected, and an Objects list (visibility / lock / select). */
import { useMemo, useState, type ReactNode } from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDown,
  ArrowUp,
  BringToFront,
  CopyPlus,
  Crosshair,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  PackagePlus,
  RotateCcw,
  RotateCw,
  SendToBack,
  Trash2,
} from 'lucide-react';
import type { DiagramItem, LightingDiagram } from '@/types';
import { useProject } from '@/store/project';
import { navigate } from '@/store/app';
import { sceneLabel, useScriptModel } from '@/derived/script';
import { locationForScene } from '@/derived/project';
import { LENSES, SHOT_EQUIPMENT } from '@/lib/constants';
import { matchesQuery, titleCase, truncate } from '@/lib/text';
import { Button, ColorPicker, Combo, Field, IconButton, ImageDrop, Input, MultiSelect, NumberInput, SearchInput, Select, Switch, Tabs, Textarea, toast } from '@/ui';
import {
  BOUNCE_SURFACES,
  CAMERA_BODIES,
  CATEGORIES,
  CREW_ROLES,
  FIXTURE_BY_NAME,
  FIXTURES,
  LIGHT_PURPOSES,
  MODIFIERS,
  PURPOSE_COLORS,
  SENSORS,
  kindDef,
  isLightKind,
} from './library';
import { GELS, beamColor, effectiveCct, type Palette } from './color';
import {
  boxSize,
  cloneItems,
  dims,
  fmtLength,
  hfov,
  itemAABB,
  itemPoints,
  itemRot,
  itemScale,
  itemTitle,
  lightNumbers,
  lightRows,
  lnum,
  normDeg,
  num,
  pbool,
  pnum,
  pstr,
  totalWatts,
  unitLabel,
} from './model';
import { addItems, addLightsToGear, patchDiagram, patchItem, patchItems, patchProps, removeItems, renumberLights, reorderItems, setDiagramShots } from './ops';
import { KindIcon } from './render';

const DIFFUSIONS = ['1/4 Grid cloth', '1/2 Grid cloth', 'Full Grid cloth', 'Light Grid', 'Silent Grid', '216 Full White', '250 Half White', '251 Quarter White', 'Opal', 'Hampshire Frost', 'Muslin', 'Unbleached muslin'];

function Sec({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="light-sec">
      <div className="light-sec-title">
        <span>{title}</span>
        {right}
      </div>
      <div className="light-sec-body">{children}</div>
    </div>
  );
}

function Grid2({ children }: { children: ReactNode }) {
  return <div className="light-grid2">{children}</div>;
}

function Range({ value, min, max, step = 1, onChange }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return <input className="light-range" type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />;
}

/* ======================================================================== item */

function TransformSec({ d, item }: { d: LightingDiagram; item: DiagramItem }) {
  const def = kindDef(item.kind);
  const { ppu, units } = dims(d);
  const u = unitLabel(units);
  const set = (patch: Partial<DiagramItem>) => patchItem(d.id, item.id, patch, Object.keys(patch).join(','));
  const toU = (px: number) => Math.round((px / ppu) * 100) / 100;
  const size = def.shape === 'box' ? boxSize(item, def, ppu) : null;
  return (
    <Sec title="Position & size">
      <Grid2>
        <Field label={`X (${u})`}>
          <NumberInput size="sm" value={toU(item.x)} onChange={(v) => v != null && set({ x: Math.round(v * ppu) })} />
        </Field>
        <Field label={`Y (${u})`}>
          <NumberInput size="sm" value={toU(item.y)} onChange={(v) => v != null && set({ y: Math.round(v * ppu) })} />
        </Field>
        {def.shape !== 'path' && (
          <Field label="Rotation (°)">
            <div className="row" style={{ gap: 4 }}>
              <NumberInput size="sm" value={Math.round(itemRot(item))} onChange={(v) => v != null && set({ rotation: normDeg(v) })} style={{ flex: 1 }} />
              <IconButton icon={RotateCcw} label="Rotate −90°" size="sm" onClick={() => set({ rotation: normDeg(itemRot(item) - 90) })} />
              <IconButton icon={RotateCw} label="Rotate +90°" size="sm" onClick={() => set({ rotation: normDeg(itemRot(item) + 90) })} />
            </div>
          </Field>
        )}
        {(def.shape === 'symbol' || def.shape === 'text') && (
          <Field label="Scale">
            <NumberInput size="sm" value={Math.round(itemScale(item) * 100) / 100} onChange={(v) => v != null && v > 0 && set({ scale: Math.min(8, Math.max(0.2, v)) })} />
          </Field>
        )}
        {size && (
          <>
            <Field label={`Width (${u})`}>
              <NumberInput size="sm" value={toU(size.w)} onChange={(v) => v != null && v > 0 && set({ w: Math.max(2, Math.round(v * ppu)) })} />
            </Field>
            <Field label={`Depth (${u})`}>
              <NumberInput size="sm" value={toU(size.h)} onChange={(v) => v != null && v > 0 && set({ h: Math.max(2, Math.round(v * ppu)) })} />
            </Field>
          </>
        )}
      </Grid2>
      <div className="row" style={{ gap: 14, marginTop: 4 }}>
        <Switch checked={!!item.locked} onChange={(v) => patchItem(d.id, item.id, { locked: v })} label="Locked" />
        <Switch checked={!!item.hidden} onChange={(v) => patchItem(d.id, item.id, { hidden: v })} label="Hidden" />
      </div>
      <div className="row" style={{ gap: 4, marginTop: 6 }}>
        <span className="muted tiny" style={{ marginRight: 'auto' }}>
          Arrange
        </span>
        <IconButton icon={BringToFront} label="Bring to front" size="sm" onClick={() => reorderItems(d.id, [item.id], 'front')} />
        <IconButton icon={ArrowUp} label="Bring forward" size="sm" onClick={() => reorderItems(d.id, [item.id], 'forward')} />
        <IconButton icon={ArrowDown} label="Send backward" size="sm" onClick={() => reorderItems(d.id, [item.id], 'backward')} />
        <IconButton icon={SendToBack} label="Send to back" size="sm" onClick={() => reorderItems(d.id, [item.id], 'back')} />
      </div>
    </Sec>
  );
}

function LightSec({ d, item }: { d: LightingDiagram; item: DiagramItem }) {
  const { units } = dims(d);
  const u = unitLabel(units);
  const setP = (props: Record<string, unknown>) => patchProps(d.id, item.id, props);
  const cct = pnum(item, 'cct') ?? pnum({ props: kindDef(item.kind).props }, 'cct');
  const gel = pstr(item, 'gel');
  const eff = effectiveCct(cct, gel);
  const color = beamColor(cct, gel, item.color);
  const intensity = lnum(item, 'intensity', 100);
  const beam = lnum(item, 'beam', 60);
  const purpose = pstr(item, 'purpose');
  return (
    <>
      <Sec title="Light">
        <Field label="Purpose">
          <div className="light-chips">
            {LIGHT_PURPOSES.map((p) => (
              <button key={p} type="button" className={`light-chip ${purpose === p ? 'on' : ''}`} style={purpose === p ? { background: PURPOSE_COLORS[p], borderColor: PURPOSE_COLORS[p], color: '#fff' } : undefined} onClick={() => setP({ purpose: purpose === p ? undefined : p })}>
                {p}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Fixture / model">
          <Combo
            size="sm"
            value={pstr(item, 'fixture')}
            suggestions={FIXTURES.map((f) => f.name)}
            placeholder={kindDef(item.kind).label}
            onChange={(v) => {
              const known = FIXTURE_BY_NAME.get(v.trim().toLowerCase());
              const patch: Record<string, unknown> = { fixture: v };
              if (known && pnum(item, 'watts') == null && known.watts) patch.watts = known.watts;
              if (known?.cct && pnum(item, 'cct') == null) patch.cct = known.cct;
              setP(patch);
            }}
          />
        </Field>
        <Grid2>
          <Field label="Power (W)">
            <NumberInput size="sm" value={pnum(item, 'watts')} onChange={(v) => setP({ watts: v })} />
          </Field>
          <Field label="Channel / dimmer">
            <Input size="sm" value={pstr(item, 'channel')} placeholder="e.g. DMX 12" onChange={(v) => setP({ channel: v })} />
          </Field>
        </Grid2>
      </Sec>
      <Sec title="Colour" right={<span className="light-swatch" style={{ background: color }} title={`Beam colour ${color}`} />}>
        <Grid2>
          <Field label="CCT (K)">
            <NumberInput size="sm" value={cct} onChange={(v) => setP({ cct: v })} />
          </Field>
          <Field label="Gel">
            <Combo size="sm" value={gel} suggestions={GELS.map((g) => g.name)} placeholder="None" onChange={(v) => setP({ gel: v })} />
          </Field>
        </Grid2>
        <div className="light-chips" style={{ marginTop: 2 }}>
          {[2700, 3200, 4300, 5600, 6500].map((k) => (
            <button key={k} type="button" className={`light-chip ${cct === k ? 'on' : ''}`} onClick={() => setP({ cct: k })}>
              {k}K
            </button>
          ))}
        </div>
        {gel && eff !== cct && <div className="muted tiny">≈ {eff}K with {gel}</div>}
        <Field label="Beam colour override (RGB fixtures)">
          <ColorPicker value={item.color} allowNone onChange={(v) => patchItem(d.id, item.id, { color: v }, 'color')} />
        </Field>
      </Sec>
      <Sec title="Output & beam">
        <Field label={`Intensity — ${intensity}%`}>
          <div className="row" style={{ gap: 8 }}>
            <Range value={intensity} min={0} max={100} onChange={(v) => setP({ intensity: v })} />
            <NumberInput size="sm" value={intensity} onChange={(v) => setP({ intensity: v == null ? undefined : Math.max(0, Math.min(100, v)) })} style={{ width: 64 }} />
          </div>
        </Field>
        <Field label="Modifier">
          <Combo size="sm" value={pstr(item, 'modifier', pstr({ props: kindDef(item.kind).props }, 'modifier'))} suggestions={MODIFIERS} placeholder="None" onChange={(v) => setP({ modifier: v })} />
        </Field>
        <Field label={`Beam angle — ${beam}°`}>
          <div className="row" style={{ gap: 8 }}>
            <Range value={beam} min={4} max={360} onChange={(v) => setP({ beam: v })} />
            <NumberInput size="sm" value={beam} onChange={(v) => v != null && setP({ beam: Math.max(2, Math.min(360, v)) })} style={{ width: 64 }} />
          </div>
        </Field>
        <Grid2>
          <Field label={`Throw (${u})`}>
            <NumberInput size="sm" value={lnum(item, 'throw', 10)} onChange={(v) => v != null && v > 0 && setP({ throw: v })} />
          </Field>
          <Field label={`Height (${u})`}>
            <NumberInput size="sm" value={pnum(item, 'height')} onChange={(v) => setP({ height: v })} />
          </Field>
          <Field label="Number (L#)">
            <NumberInput size="sm" value={lightNumbers(d.items).get(item.id)} onChange={(v) => v != null && v > 0 && setP({ n: Math.round(v) })} />
          </Field>
        </Grid2>
      </Sec>
    </>
  );
}

function CameraSec({ d, item }: { d: LightingDiagram; item: DiagramItem }) {
  const { units } = dims(d);
  const u = unitLabel(units);
  const setP = (props: Record<string, unknown>) => patchProps(d.id, item.id, props);
  const def = kindDef(item.kind);
  const lens = pnum(item, 'lens') ?? pnum({ props: def.props }, 'lens');
  const sensor = pstr(item, 'sensor', pstr({ props: def.props }, 'sensor', 's35'));
  const fov = hfov(lens, sensor);
  return (
    <Sec title="Camera">
      <Grid2>
        <Field label="Camera ID">
          <Input size="sm" value={item.label ?? ''} placeholder="A" onChange={(v) => patchItem(d.id, item.id, { label: v }, 'label')} />
        </Field>
        <Field label="Lens (mm)">
          <NumberInput size="sm" value={lens} onChange={(v) => setP({ lens: v })} />
        </Field>
      </Grid2>
      <div className="light-chips">
        {LENSES.filter((l) => /^\d+mm$/.test(l.value) && [14, 18, 24, 35, 50, 85, 100, 135].includes(parseInt(l.value))).map((l) => (
          <button key={l.value} type="button" className={`light-chip ${lens === parseInt(l.value) ? 'on' : ''}`} onClick={() => setP({ lens: parseInt(l.value) })}>
            {l.label}
          </button>
        ))}
      </div>
      <Field label="Body / model">
        <Combo size="sm" value={pstr(item, 'body')} suggestions={CAMERA_BODIES} placeholder={def.label} onChange={(v) => setP({ body: v })} />
      </Field>
      <Field label="Sensor" hint={fov ? `Horizontal field of view ≈ ${num(fov)}°` : undefined}>
        <Select size="sm" value={sensor} options={SENSORS.map((s) => ({ value: s.value, label: s.label }))} onChange={(v) => setP({ sensor: v })} />
      </Field>
      <Grid2>
        <Field label={`Height (${u})`}>
          <NumberInput size="sm" value={pnum(item, 'height')} onChange={(v) => setP({ height: v })} />
        </Field>
        <Field label={`FOV length (${u})`}>
          <NumberInput size="sm" value={lnum(item, 'fovLength', 15)} onChange={(v) => v != null && v > 0 && setP({ fovLength: v })} />
        </Field>
      </Grid2>
      <Switch checked={pbool(item, 'showFov', true)} onChange={(v) => setP({ showFov: v })} label="Show field of view" />
      <Field label="Support">
        <Combo size="sm" value={pstr(item, 'support')} suggestions={SHOT_EQUIPMENT.map((o) => o.value)} placeholder="Sticks, dolly, gimbal…" onChange={(v) => setP({ support: v })} />
      </Field>
    </Sec>
  );
}

function PersonSec({ d, item }: { d: LightingDiagram; item: DiagramItem }) {
  const characters = useProject((p) => p.characters) ?? [];
  const cast = useProject((p) => p.cast) ?? [];
  const setP = (props: Record<string, unknown>) => patchProps(d.id, item.id, props);
  const charId = pstr(item, 'characterId');
  const ch = characters.find((c) => c.id === charId);
  const actor = ch?.castId ? cast.find((m) => m.id === ch.castId) : undefined;
  if (item.kind === 'person.monitor') {
    return (
      <Sec title="Video village">
        <Field label="Label">
          <Input size="sm" value={item.label ?? ''} onChange={(v) => patchItem(d.id, item.id, { label: v }, 'label')} />
        </Field>
      </Sec>
    );
  }
  return (
    <Sec title={item.kind === 'person.crew' ? 'Crew member' : 'Actor / subject'}>
      <Field label="Name on plot">
        <Input size="sm" value={item.label ?? ''} onChange={(v) => patchItem(d.id, item.id, { label: v }, 'label')} />
      </Field>
      {item.kind === 'person.crew' ? (
        <Field label="Role">
          <Combo size="sm" value={pstr(item, 'role')} suggestions={CREW_ROLES} placeholder="e.g. Boom operator" onChange={(v) => setP({ role: v })} />
        </Field>
      ) : (
        characters.length > 0 && (
          <Field label="Character" hint={actor ? `Played by ${actor.name}` : undefined}>
            <Select
              size="sm"
              value={charId}
              placeholder="—"
              options={characters.map((c) => ({ value: c.id, label: titleCase(c.name) }))}
              onChange={(v) => {
                const c = characters.find((x) => x.id === v);
                patchItem(d.id, item.id, { props: { characterId: v || undefined }, ...(c ? { label: titleCase(c.name) } : {}) }, 'character');
              }}
            />
          </Field>
        )
      )}
      <Field label="Colour">
        <ColorPicker value={item.color} onChange={(v) => patchItem(d.id, item.id, { color: v }, 'color')} />
      </Field>
    </Sec>
  );
}

function GripSec({ d, item }: { d: LightingDiagram; item: DiagramItem }) {
  const setP = (props: Record<string, unknown>) => patchProps(d.id, item.id, props);
  return (
    <Sec title={kindDef(item.kind).label}>
      <Field label="Label">
        <Input size="sm" value={item.label ?? ''} onChange={(v) => patchItem(d.id, item.id, { label: v }, 'label')} placeholder="e.g. 4x4 Bounce" />
      </Field>
      {item.kind === 'grip.bounce' && (
        <Field label="Surface">
          <Select size="sm" value={pstr(item, 'surface', 'white')} options={BOUNCE_SURFACES} onChange={(v) => setP({ surface: v })} />
        </Field>
      )}
      {item.kind === 'grip.diffusion' && (
        <Field label="Diffusion">
          <Combo size="sm" value={pstr(item, 'diffusion')} suggestions={DIFFUSIONS} onChange={(v) => setP({ diffusion: v })} />
        </Field>
      )}
      {['grip.flag', 'grip.scrim', 'grip.diffusion', 'grip.bounce', 'grip.negfill'].includes(item.kind) && (
        <div className="muted tiny">Thin frames are drawn edge-on (standing). Make the depth at least a third of the width to show an overhead frame.</div>
      )}
    </Sec>
  );
}

function AnnotationSec({ d, item }: { d: LightingDiagram; item: DiagramItem }) {
  const def = kindDef(item.kind);
  const { ppu, units } = dims(d);
  const setP = (props: Record<string, unknown>) => patchProps(d.id, item.id, props);
  const setColor = (v: string | undefined) => patchItem(d.id, item.id, { color: v }, 'color');
  if (def.shape === 'text') {
    return (
      <Sec title="Text">
        <Textarea value={item.label ?? ''} autoGrow minRows={2} onChange={(v) => patchItem(d.id, item.id, { label: v }, 'label')} />
        <Grid2>
          <Field label="Size (px)">
            <NumberInput size="sm" value={pnum(item, 'size', 16)} onChange={(v) => v != null && v > 2 && setP({ size: v })} />
          </Field>
          <Field label="Weight">
            <Switch checked={pbool(item, 'bold')} onChange={(v) => setP({ bold: v })} label="Bold" />
          </Field>
        </Grid2>
        <Field label="Colour">
          <ColorPicker value={item.color} allowNone onChange={setColor} />
        </Field>
      </Sec>
    );
  }
  if (def.shape === 'path') {
    const pts = itemPoints(item);
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const isDim = def.kind === 'note.dimension';
    return (
      <Sec title={def.label} right={<span className="muted tiny">{fmtLength(len / ppu, units)}</span>}>
        <Field label={isDim ? 'Text (leave empty for the measured length)' : 'Label'}>
          <Input size="sm" value={item.label ?? ''} placeholder={isDim ? fmtLength(len / ppu, units) : 'e.g. Dolly in'} onChange={(v) => patchItem(d.id, item.id, { label: v }, 'label')} />
        </Field>
        <Grid2>
          <Field label="Line width">
            <NumberInput size="sm" value={pnum(item, 'width', isDim ? 1.25 : def.kind === 'note.arrow' ? 2.5 : 2)} onChange={(v) => v != null && v > 0 && setP({ width: v })} />
          </Field>
          {!isDim && (
            <Field label="Arrowheads">
              <Select
                size="sm"
                value={pstr(item, 'head', def.kind === 'note.arrow' ? 'end' : 'none')}
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'end', label: 'End' },
                  { value: 'start', label: 'Start' },
                  { value: 'both', label: 'Both' },
                ]}
                onChange={(v) => setP({ head: v })}
              />
            </Field>
          )}
        </Grid2>
        {!isDim && (
          <div className="row" style={{ gap: 14 }}>
            <Switch checked={pbool(item, 'dashed')} onChange={(v) => setP({ dashed: v })} label="Dashed" />
            <Switch checked={pbool(item, 'curved')} onChange={(v) => setP({ curved: v })} label="Curved" />
          </div>
        )}
        <Field label="Colour">
          <ColorPicker value={item.color} allowNone onChange={setColor} />
        </Field>
        {!isDim && (
          <div className="row" style={{ gap: 6 }}>
            <Button size="sm" onClick={() => patchItem(d.id, item.id, { points: [...pts].reverse() })}>
              Reverse direction
            </Button>
            <span className="muted tiny">{pts.length} points · double-click the line to add, a point to remove</span>
          </div>
        )}
      </Sec>
    );
  }
  return (
    <Sec title={def.label}>
      <Field label="Label">
        <Input size="sm" value={item.label ?? ''} onChange={(v) => patchItem(d.id, item.id, { label: v }, 'label')} />
      </Field>
      <div className="row" style={{ gap: 14 }}>
        <Switch checked={pbool(item, 'fill', true)} onChange={(v) => setP({ fill: v })} label="Filled" />
        <Switch checked={pbool(item, 'dashed')} onChange={(v) => setP({ dashed: v })} label="Dashed" />
      </div>
      <Field label="Colour">
        <ColorPicker value={item.color} onChange={setColor} />
      </Field>
    </Sec>
  );
}

function SetSec({ d, item }: { d: LightingDiagram; item: DiagramItem }) {
  const colorable = !['set.door', 'set.window', 'set.tv', 'set.plant', 'set.stairs', 'set.bed'].includes(item.kind);
  return (
    <Sec title={kindDef(item.kind).label}>
      <Field label="Label">
        <Input size="sm" value={item.label ?? ''} onChange={(v) => patchItem(d.id, item.id, { label: v }, 'label')} />
      </Field>
      {item.kind === 'set.door' && <Switch checked={pbool(item, 'flip')} onChange={(v) => patchProps(d.id, item.id, { flip: v })} label="Flip swing (hinge on the other side)" />}
      {colorable && (
        <Field label="Colour">
          <ColorPicker value={item.color} allowNone onChange={(v) => patchItem(d.id, item.id, { color: v }, 'color')} />
        </Field>
      )}
    </Sec>
  );
}

function ItemInspector({ d, item, setSel, pal }: { d: LightingDiagram; item: DiagramItem; setSel: (ids: string[]) => void; pal: Palette }) {
  const def = kindDef(item.kind);
  const nums = useMemo(() => lightNumbers(d.items), [d.items]);
  const n = nums.get(item.id);
  const cat = def.category;
  return (
    <div className="light-insp">
      <div className="light-insp-head">
        <div className="light-insp-icon">
          <KindIcon kind={item.kind} pal={pal} size={30} item={item} />
        </div>
        <div className="grow">
          <div className="strong ellipsis">{itemTitle(item, nums)}</div>
          <div className="muted tiny">
            {CATEGORIES.find((c) => c.id === cat)?.label} · {def.label}
          </div>
        </div>
        {n != null && <span className="light-badge">L{n}</span>}
        <IconButton
          icon={CopyPlus}
          label="Duplicate"
          size="sm"
          onClick={() => {
            const clones = cloneItems([item], d.items, 20, 20);
            addItems(d.id, clones);
            setSel(clones.map((c) => c.id));
          }}
        />
        <IconButton
          icon={Trash2}
          label="Delete"
          size="sm"
          onClick={() => {
            removeItems(d.id, [item.id]);
            setSel([]);
          }}
        />
      </div>
      {cat === 'light' && (
        <Sec title="Label">
          <Input size="sm" value={item.label ?? ''} placeholder="Caption on the plot (defaults to the fixture)" onChange={(v) => patchItem(d.id, item.id, { label: v }, 'label')} />
        </Sec>
      )}
      {cat === 'light' && <LightSec d={d} item={item} />}
      {cat === 'camera' && <CameraSec d={d} item={item} />}
      {cat === 'people' && <PersonSec d={d} item={item} />}
      {cat === 'grip' && <GripSec d={d} item={item} />}
      {cat === 'sound' && (
        <Sec title={def.label}>
          <Field label="Label">
            <Input size="sm" value={item.label ?? ''} onChange={(v) => patchItem(d.id, item.id, { label: v }, 'label')} />
          </Field>
        </Sec>
      )}
      {cat === 'set' && <SetSec d={d} item={item} />}
      {cat === 'note' && <AnnotationSec d={d} item={item} />}
      {def.shape !== 'text' && (
        <Sec title="Notes">
          <Textarea value={pstr(item, 'notes')} autoGrow minRows={2} placeholder={cat === 'light' ? 'Rigging, power, safety…' : 'Notes'} onChange={(v) => patchProps(d.id, item.id, { notes: v })} />
        </Sec>
      )}
      <TransformSec d={d} item={item} />
    </div>
  );
}

/* ======================================================================== multi */

function MultiInspector({ d, items, setSel }: { d: LightingDiagram; items: DiagramItem[]; setSel: (ids: string[]) => void }) {
  const { ppu } = dims(d);
  const ids = items.map((i) => i.id);
  const people = d.items.filter((i) => kindDef(i.kind).category === 'people' && i.kind !== 'person.monitor' && !ids.includes(i.id));
  const aimable = items.filter((i) => ['light', 'camera', 'grip', 'sound'].includes(kindDef(i.kind).category));
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) {
      const c = CATEGORIES.find((x) => x.id === kindDef(i.kind).category)?.label ?? 'Other';
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    return [...m.entries()];
  }, [items]);
  const align = (mode: 'l' | 'c' | 'r' | 't' | 'm' | 'b') => {
    const boxes = items.map((i) => ({ i, b: itemAABB(i, ppu) }));
    const x0 = Math.min(...boxes.map((x) => x.b.x0));
    const x1 = Math.max(...boxes.map((x) => x.b.x1));
    const y0 = Math.min(...boxes.map((x) => x.b.y0));
    const y1 = Math.max(...boxes.map((x) => x.b.y1));
    const patches: Record<string, Partial<DiagramItem>> = {};
    for (const { i, b } of boxes) {
      if (i.locked) continue;
      let dx = 0;
      let dy = 0;
      if (mode === 'l') dx = x0 - b.x0;
      if (mode === 'r') dx = x1 - b.x1;
      if (mode === 'c') dx = (x0 + x1) / 2 - (b.x0 + b.x1) / 2;
      if (mode === 't') dy = y0 - b.y0;
      if (mode === 'b') dy = y1 - b.y1;
      if (mode === 'm') dy = (y0 + y1) / 2 - (b.y0 + b.y1) / 2;
      patches[i.id] = { x: Math.round(i.x + dx), y: Math.round(i.y + dy) };
    }
    patchItems(d.id, patches);
  };
  const setAll = (patch: Partial<DiagramItem>) => {
    const patches: Record<string, Partial<DiagramItem>> = {};
    for (const id of ids) patches[id] = patch;
    patchItems(d.id, patches);
  };
  const allLocked = items.every((i) => i.locked);
  return (
    <div className="light-insp">
      <div className="light-insp-head">
        <div className="grow">
          <div className="strong">{items.length} items selected</div>
          <div className="muted tiny">{counts.map(([k, v]) => `${v} ${k.toLowerCase()}`).join(' · ')}</div>
        </div>
      </div>
      <Sec title="Align">
        <div className="row" style={{ gap: 4 }}>
          <IconButton icon={AlignStartVertical} label="Align left" size="sm" onClick={() => align('l')} />
          <IconButton icon={AlignCenterVertical} label="Align centres horizontally" size="sm" onClick={() => align('c')} />
          <IconButton icon={AlignEndVertical} label="Align right" size="sm" onClick={() => align('r')} />
          <div className="vdivider" />
          <IconButton icon={AlignStartHorizontal} label="Align top" size="sm" onClick={() => align('t')} />
          <IconButton icon={AlignCenterHorizontal} label="Align middles vertically" size="sm" onClick={() => align('m')} />
          <IconButton icon={AlignEndHorizontal} label="Align bottom" size="sm" onClick={() => align('b')} />
        </div>
      </Sec>
      {aimable.length > 0 && people.length > 0 && (
        <Sec title="Aim at">
          <div className="light-chips">
            {people.map((p) => (
              <button
                key={p.id}
                type="button"
                className="light-chip"
                onClick={() => {
                  const patches: Record<string, Partial<DiagramItem>> = {};
                  for (const a of aimable) patches[a.id] = { rotation: Math.round((Math.atan2(p.y - a.y, p.x - a.x) * 180) / Math.PI + 90 + 360) % 360 };
                  patchItems(d.id, patches);
                }}
              >
                <Crosshair size={11} /> {p.label?.trim() || kindDef(p.kind).label}
              </button>
            ))}
          </div>
        </Sec>
      )}
      <Sec title="Colour">
        <ColorPicker value={undefined} allowNone onChange={(v) => setAll({ color: v })} />
      </Sec>
      <Sec title="Actions">
        <div className="row wrap" style={{ gap: 6 }}>
          <Button size="sm" icon={allLocked ? LockOpen : Lock} onClick={() => setAll({ locked: !allLocked })}>
            {allLocked ? 'Unlock' : 'Lock'}
          </Button>
          <Button
            size="sm"
            icon={EyeOff}
            onClick={() => {
              setAll({ hidden: true });
              setSel([]);
            }}
          >
            Hide
          </Button>
          <Button
            size="sm"
            icon={CopyPlus}
            onClick={() => {
              const clones = cloneItems(items, d.items, 20, 20);
              addItems(d.id, clones);
              setSel(clones.map((c) => c.id));
            }}
          >
            Duplicate
          </Button>
          <Button size="sm" icon={BringToFront} onClick={() => reorderItems(d.id, ids, 'front')}>
            Front
          </Button>
          <Button size="sm" icon={SendToBack} onClick={() => reorderItems(d.id, ids, 'back')}>
            Back
          </Button>
          <Button
            size="sm"
            variant="danger"
            icon={Trash2}
            onClick={() => {
              removeItems(d.id, ids);
              setSel([]);
            }}
          >
            Delete
          </Button>
        </div>
      </Sec>
    </div>
  );
}

/* ======================================================================== diagram settings */

function DiagramSettings({ d }: { d: LightingDiagram }) {
  const model = useScriptModel();
  const shots = useProject((p) => p.shots) ?? [];
  const locations = useProject((p) => p.locations) ?? [];
  const { w, h, ppu, units } = dims(d);
  const u = unitLabel(units);
  const sceneOptions = useMemo(() => model.scenes.map((s) => ({ value: s.id, label: truncate(sceneLabel(s), 48) })), [model.scenes]);
  const sceneIds = (d.sceneIds ?? []).filter((id) => model.sceneById.has(id));
  const linkedShots = useMemo(() => {
    const set = new Set((d.shotIds ?? []).filter((id) => shots.some((s) => s.id === id)));
    for (const s of shots) if (s.diagramId === d.id) set.add(s.id);
    return [...set];
  }, [d.shotIds, d.id, shots]);
  const shotOptions = useMemo(() => {
    const preferred = new Set(sceneIds);
    const sorted = [...shots].sort((a, b) => Number(preferred.has(b.sceneId ?? '')) - Number(preferred.has(a.sceneId ?? '')));
    return sorted.map((s) => {
      const sc = s.sceneId ? model.sceneById.get(s.sceneId) : undefined;
      return { value: s.id, label: truncate(`${sc ? `Sc ${sc.number} · ` : ''}Shot ${s.number}${s.title || s.description ? ` — ${s.title || s.description}` : ''}`, 52) };
    });
  }, [shots, model.sceneById, sceneIds]);
  const suggestedLoc = useMemo(() => {
    if (d.locationId) return undefined;
    for (const id of sceneIds) {
      const l = locationForScene({ locations }, model.sceneById.get(id));
      if (l) return l;
    }
    return undefined;
  }, [d.locationId, sceneIds, locations, model.sceneById]);
  const watts = totalWatts(d);
  const nLights = lightRows(d).length;
  const bgOpacity = Math.round((typeof d.backgroundOpacity === 'number' ? d.backgroundOpacity : 0.6) * 100);
  return (
    <div className="light-insp">
      <Sec title="Diagram">
        <Field label="Name">
          <Input size="sm" value={d.name} onChange={(v) => patchDiagram(d.id, { name: v }, 'name')} />
        </Field>
        <Field label="Scenes">
          {sceneOptions.length ? <MultiSelect size="sm" value={sceneIds} options={sceneOptions} placeholder="Link a scene…" onChange={(v) => patchDiagram(d.id, { sceneIds: v })} /> : <span className="muted tiny">No scenes in the script yet.</span>}
        </Field>
        <Field label="Shots">
          {shotOptions.length ? (
            <MultiSelect size="sm" value={linkedShots} options={shotOptions} placeholder="Link a shot…" onChange={(v) => setDiagramShots(d.id, v)} />
          ) : (
            <span className="muted tiny">
              No shots yet —{' '}
              <a href="#" onClick={(e) => (e.preventDefault(), navigate('shots'))}>
                open the Shot List
              </a>
            </span>
          )}
        </Field>
        <Field label="Location">
          <Select size="sm" value={d.locationId ?? ''} placeholder="—" options={locations.map((l) => ({ value: l.id, label: l.name }))} onChange={(v) => patchDiagram(d.id, { locationId: v || undefined })} />
        </Field>
        {suggestedLoc && (
          <Button size="sm" variant="ghost" onClick={() => patchDiagram(d.id, { locationId: suggestedLoc.id })}>
            Use “{suggestedLoc.name}” (from the scene)
          </Button>
        )}
      </Sec>
      <Sec title="Room & grid">
        <Grid2>
          <Field label={`Width (${u})`}>
            <NumberInput size="sm" value={Math.round((w / ppu) * 10) / 10} onChange={(v) => v != null && v > 0 && patchDiagram(d.id, { width: Math.round(Math.min(400, v) * ppu) }, 'width')} />
          </Field>
          <Field label={`Depth (${u})`}>
            <NumberInput size="sm" value={Math.round((h / ppu) * 10) / 10} onChange={(v) => v != null && v > 0 && patchDiagram(d.id, { height: Math.round(Math.min(400, v) * ppu) }, 'height')} />
          </Field>
          <Field label="Units">
            <Select
              size="sm"
              value={units}
              options={[
                { value: 'ft', label: 'Feet' },
                { value: 'm', label: 'Metres' },
              ]}
              onChange={(v) => {
                if (v === units) return;
                const k = v === 'm' ? 3.28084 : 1 / 3.28084;
                patchDiagram(d.id, { units: v as 'ft' | 'm', pxPerUnit: Math.round(ppu * k * 100) / 100 });
              }}
            />
          </Field>
          <Field label={`Scale (px per ${u})`}>
            <NumberInput size="sm" value={ppu} onChange={(v) => v != null && v >= 4 && v <= 600 && patchDiagram(d.id, { pxPerUnit: v }, 'ppu')} />
          </Field>
        </Grid2>
        <div className="muted tiny">Scale calibrates the grid (e.g. to a floor plan): it changes how many {u} the room measures, not where things sit.</div>
        <Switch checked={d.showGrid !== false} onChange={(v) => patchDiagram(d.id, { showGrid: v })} label="Show grid" />
      </Sec>
      <Sec title="Floor plan / background">
        <ImageDrop value={d.background} onChange={(name) => patchDiagram(d.id, { background: name })} aspect={w / h} contain label="Drop a floor plan or click" />
        {d.background && (
          <Field label={`Opacity — ${bgOpacity}%`}>
            <Range value={bgOpacity} min={5} max={100} onChange={(v) => patchDiagram(d.id, { backgroundOpacity: v / 100 }, 'bgop')} />
          </Field>
        )}
      </Sec>
      <Sec title="Notes">
        <Textarea value={d.notes ?? ''} autoGrow minRows={3} placeholder="Power plan, rigging, safety, sun times…" onChange={(v) => patchDiagram(d.id, { notes: v }, 'notes')} />
      </Sec>
      <Sec title="Power & lights">
        <div className="light-stats">
          <div>
            <b>{nLights}</b>
            <span>lights</span>
          </div>
          <div>
            <b>{watts.toLocaleString()}</b>
            <span>watts</span>
          </div>
          <div>
            <b>{num(watts / 120)}</b>
            <span>A @ 120 V</span>
          </div>
          <div>
            <b>{num(watts / 230)}</b>
            <span>A @ 230 V</span>
          </div>
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          <Button size="sm" onClick={() => renumberLights(d.id, false)} disabled={!nLights} title="Close gaps: 1, 2, 3…">
            Renumber
          </Button>
          <Button size="sm" onClick={() => renumberLights(d.id, true)} disabled={!nLights} title="Number lights left to right">
            Renumber left → right
          </Button>
          <Button
            size="sm"
            icon={PackagePlus}
            disabled={!nLights}
            onClick={() => {
              const r = addLightsToGear(d.id);
              if (!r.added.length) toast(r.skipped.length ? 'All of these fixtures are already on the Gear list' : 'No rentable fixtures on this diagram', 'info');
              else toast(`Added ${r.added.map((a) => `${a.qty}× ${a.name}`).join(', ')} to Gear${r.skipped.length ? ` (${r.skipped.length} already listed)` : ''}`, 'success', { action: { label: 'Open Gear', onClick: () => navigate('gear') } });
            }}
          >
            Add lights to Gear
          </Button>
        </div>
      </Sec>
    </div>
  );
}

/* ======================================================================== objects list */

function ObjectList({ d, sel, setSel, pal }: { d: LightingDiagram; sel: string[]; setSel: (ids: string[]) => void; pal: Palette }) {
  const [q, setQ] = useState('');
  const nums = useMemo(() => lightNumbers(d.items), [d.items]);
  const rows = useMemo(() => [...d.items].reverse().filter((i) => matchesQuery(`${itemTitle(i, nums)} ${kindDef(i.kind).label} ${pstr(i, 'purpose')}`, q)), [d.items, nums, q]);
  const selSet = new Set(sel);
  if (!d.items.length) return <div className="muted small" style={{ padding: 16 }}>Nothing on this diagram yet.</div>;
  return (
    <div className="light-objects">
      <div style={{ padding: '10px 12px 6px' }}>
        <SearchInput value={q} onChange={setQ} placeholder="Filter objects…" width="100%" />
      </div>
      <div className="light-obj-list">
        {rows.map((i) => (
          <div
            key={i.id}
            className={`light-obj ${selSet.has(i.id) ? 'on' : ''} ${i.hidden ? 'is-hidden' : ''}`}
            onClick={(e) => {
              if (e.shiftKey) setSel(selSet.has(i.id) ? sel.filter((x) => x !== i.id) : [...sel, i.id]);
              else setSel([i.id]);
            }}
          >
            <span className="light-obj-icon">
              <KindIcon kind={i.kind} pal={pal} size={20} item={i} />
            </span>
            <span className="grow ellipsis">{itemTitle(i, nums)}</span>
            {isLightKind(i.kind) && pstr(i, 'purpose') && <span className="light-obj-tag" style={{ color: PURPOSE_COLORS[pstr(i, 'purpose')] }}>{pstr(i, 'purpose')}</span>}
            <button
              type="button"
              className={`light-obj-btn ${i.locked ? 'on' : ''}`}
              title={i.locked ? 'Unlock' : 'Lock'}
              onClick={(e) => {
                e.stopPropagation();
                patchItem(d.id, i.id, { locked: !i.locked });
              }}
            >
              {i.locked ? <Lock size={13} /> : <LockOpen size={13} />}
            </button>
            <button
              type="button"
              className={`light-obj-btn ${i.hidden ? 'on' : ''}`}
              title={i.hidden ? 'Show' : 'Hide'}
              onClick={(e) => {
                e.stopPropagation();
                patchItem(d.id, i.id, { hidden: !i.hidden });
              }}
            >
              {i.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
        ))}
        {!rows.length && <div className="muted small" style={{ padding: 12 }}>No matches.</div>}
      </div>
    </div>
  );
}

/* ======================================================================== pane */

export function Inspector({ d, sel, setSel, pal }: { d: LightingDiagram; sel: string[]; setSel: (ids: string[]) => void; pal: Palette }) {
  const [tab, setTab] = useState<'props' | 'objects'>('props');
  const items = useMemo(() => sel.map((id) => d.items.find((i) => i.id === id)).filter((i): i is DiagramItem => !!i), [sel, d.items]);
  return (
    <div className="light-inspector">
      <div className="light-insp-tabs">
        <Tabs
          tabs={[
            { id: 'props', label: items.length === 0 ? 'Diagram' : items.length === 1 ? 'Item' : 'Selection' },
            { id: 'objects', label: 'Objects', count: d.items.length },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      <div className="light-insp-body">
        {tab === 'objects' ? (
          <ObjectList d={d} sel={sel} setSel={setSel} pal={pal} />
        ) : items.length === 0 ? (
          <DiagramSettings d={d} />
        ) : items.length === 1 ? (
          <ItemInspector key={items[0].id} d={d} item={items[0]} setSel={setSel} pal={pal} />
        ) : (
          <MultiInspector d={d} items={items} setSel={setSel} />
        )}
      </div>
    </div>
  );
}
