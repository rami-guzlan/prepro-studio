import type { ReactNode } from 'react';
import type { PrintContext, PrintDocDef } from '@/print/types';
import { Check, DocHeader, KV } from '@/print/components';
import type { ProjectData, Shot } from '@/types';
import type { SceneInfo } from '@/derived/script';
import { scheduleInfo } from '@/derived/project';
import { aspectToNumber, optionLabel, SOUND_TYPES } from '@/lib/constants';
import { plural } from '@/lib/text';
import { groupShots, isOmitted, type ShotGroup } from './shotData';

/* ------------------------------------------------------------------ helpers */

interface PCol {
  key: string;
  header: ReactNode;
  width?: string;
  cls?: string;
  cell: (s: Shot) => ReactNode;
}

function findDp(p: ProjectData): string {
  const dp = p.crew.find((c) => /director of photography|cinematographer|\bdop\b|\bdp\b/i.test(c.position ?? ''));
  return dp?.name ?? '';
}

function sumMinutes(shots: Shot[], key: 'setupMinutes' | 'shootMinutes') {
  return shots.reduce((n, s) => n + (isOmitted(s) ? 0 : s[key] ?? 0), 0);
}

function Thumb({ ctx, shot, w, h }: { ctx: PrintContext; shot: Shot; w: number; h: number }) {
  const img = shot.image ? ctx.asset(shot.image) : '';
  const drw = shot.drawing ? ctx.asset(shot.drawing) : '';
  return (
    <div className={['slp-thumb', !img && drw && 'draw-only'].filter(Boolean).join(' ')} style={{ width: `${w}in`, height: `${h}in` }}>
      {img && <img className="i" src={img} alt="" />}
      {drw && <img className="d" src={drw} alt="" />}
    </div>
  );
}

const CSS = `
.slp-table { table-layout: fixed; }
.slp-table td { vertical-align: top; }
.slp-table th { white-space: nowrap; }
.slp-num { font-weight: 800; font-size: 9.6pt; letter-spacing: -0.01em; }
.slp-thumb { position: relative; overflow: hidden; border: 0.5pt solid #b9b9c3; background: #f1f1f4; border-radius: 1.5pt; }
.slp-thumb.draw-only { background: #fff; }
.slp-thumb img { position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: block; max-width: none; }
.slp-thumb img.i { object-fit: cover; }
.slp-thumb img.d { object-fit: fill; }
.slp-desc { white-space: pre-wrap; word-break: break-word; }
.slp-audio { margin-top: 2pt; font-style: italic; color: #4d4d58; white-space: pre-wrap; font-size: 7.6pt; }
.slp-tag { display: inline-block; font-size: 6pt; font-weight: 800; letter-spacing: 0.06em; padding: 0.5pt 3pt; border-radius: 2pt; background: #141418; color: #fff; vertical-align: 1pt; margin-right: 3pt; }
.slp-small { font-size: 7.3pt; color: #4d4d58; }
.slp-specs div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.slp-notes { white-space: pre-wrap; font-size: 7.6pt; }
.slp-cast { font-size: 7.6pt; }
.slp-table tr.slp-scene td { background: #f3f3f6; border-left: 3pt solid var(--pp-accent); border-bottom: 0.75pt solid #c9c9d1; padding: 5pt 6pt 4pt; break-after: avoid; page-break-after: avoid; }
.slp-scene-no { display: inline-block; min-width: 16pt; text-align: center; font-weight: 800; padding: 0.5pt 4pt; border-radius: 2.5pt; border: 0.75pt solid #33333c; margin-right: 6pt; font-size: 8.4pt; }
.slp-scene-h { font-weight: 800; font-size: 8.6pt; text-transform: uppercase; letter-spacing: 0.03em; }
.slp-scene-meta { float: right; font-size: 7.4pt; color: #55555e; font-weight: 600; }
.slp-syn { margin-top: 2pt; font-size: 7.4pt; color: #66666f; }
.slp-table tr.slp-day td { background: var(--pp-accent); color: #fff; font-weight: 800; font-size: 9pt; padding: 5pt 7pt; letter-spacing: 0.02em; break-after: avoid; page-break-after: avoid; }
.slp-day-meta { float: right; font-weight: 600; font-size: 7.6pt; opacity: 0.92; }
.slp-table tr.slp-omit td { color: #9a9aa3; }
.slp-table tr.slp-omit .slp-desc { text-decoration: line-through; }
.slp-table tr.slp-omit .slp-thumb { opacity: 0.4; }
.slp-total td { font-weight: 700; background: #f6f6f9; border-top: 1pt solid #888; }
.slp-info { margin: -4pt 0 10pt; }
.slp-note { margin: 6pt 0 0; font-size: 7.4pt; color: #707078; }
`;

/* ------------------------------------------------------------------ document */

function renderShotList(ctx: PrintContext) {
  const { project: p, model, options: o, fmt } = ctx;
  const aspect = aspectToNumber(p.meta.aspectRatio);
  const sceneOnly = typeof o.sceneId === 'string' && o.sceneId && (o.sceneId === '__unassigned' || model.sceneById.has(o.sceneId)) ? (o.sceneId as string) : undefined;
  const groups = groupShots(p.shots, model, { filter: (s) => !!o.includeOmitted || !isOmitted(s), onlyKey: sceneOnly });
  const all = groups.flatMap((g) => g.shots);
  const charName = new Map(p.characters.map((c) => [c.id, c.name]));
  const diagramName = new Map(p.diagrams.map((d) => [d.id, d.name || 'Lighting diagram']));
  const compact = ctx.orientation === 'portrait';
  const showThumbs = !!o.showThumbs && all.some((s) => s.image || s.drawing);
  const thumbW = aspect >= 1 ? (compact ? 0.85 : 1.0) : 0.45;
  const thumbH = Math.min(0.85, thumbW / aspect);

  const has = (f: (s: Shot) => unknown) => all.some((s) => !!f(s));
  const castOf = (s: Shot) => (s.characterIds ?? []).map((id) => charName.get(id)).filter(Boolean).join(', ');
  const notesOf = (s: Shot) => {
    const lines: string[] = [];
    if (s.notes) lines.push(s.notes);
    if (s.diagramId && diagramName.has(s.diagramId)) lines.push(`Lighting: ${diagramName.get(s.diagramId)}`);
    return lines.join('\n');
  };
  const camCell = (s: Shot) => {
    const sound = s.sound ? optionLabel(SOUND_TYPES, s.sound) : '';
    const fps = s.frameRate && s.frameRate !== p.meta.frameRate ? `${s.frameRate} fps` : '';
    return (
      <div className="slp-specs">
        {s.camera && <div className="pp-strong">{s.camera}</div>}
        {sound && <div className="slp-small">{sound}</div>}
        {fps && <div className="slp-small">{fps}</div>}
      </div>
    );
  };
  const showTimes = !!o.showTimes && has((s) => s.setupMinutes || s.shootMinutes);
  const showNotes = !!o.showNotes && has((s) => notesOf(s));
  const showCam = has((s) => s.camera || s.sound || (s.frameRate && s.frameRate !== p.meta.frameRate));

  const cols: PCol[] = [
    { key: 'chk', header: '✓', width: '0.22in', cell: (s) => <Check on={s.status === 'shot'} /> },
    { key: 'no', header: '#', width: '0.42in', cell: (s) => <span className="slp-num">{isOmitted(s) ? 'OMIT' : s.number}</span> },
  ];
  if (showThumbs) cols.push({ key: 'thumb', header: 'Frame', width: `${thumbW + 0.12}in`, cell: (s) => <Thumb ctx={ctx} shot={s} w={thumbW} h={thumbH} /> });
  cols.push({
    key: 'desc',
    header: 'Description',
    cell: (s) => (
      <>
        <div className="slp-desc">
          {s.vfx && <span className="slp-tag">VFX</span>}
          {s.description || (s.title ?? '')}
        </div>
        {!!o.showAudio && s.audio && <div className="slp-audio">{s.audio}</div>}
      </>
    ),
  });
  if (compact) {
    cols.push({
      key: 'camera',
      header: 'Camera',
      width: '1.55in',
      cell: (s) => (
        <div className="slp-specs">
          <div className="pp-strong">{[s.shotSize, s.lens].filter(Boolean).join(' · ')}</div>
          {(s.angle || s.movement) && <div className="slp-small">{[s.angle, s.movement].filter(Boolean).join(' · ')}</div>}
          {(s.equipment || s.camera) && <div className="slp-small">{[s.equipment, s.camera && `Cam ${s.camera}`].filter(Boolean).join(' · ')}</div>}
        </div>
      ),
    });
  } else {
    cols.push({ key: 'size', header: 'Size', width: '0.46in', cell: (s) => <span className="pp-strong">{s.shotSize}</span> });
    if (has((s) => s.angle)) cols.push({ key: 'angle', header: 'Angle', width: '0.72in', cell: (s) => s.angle });
    if (has((s) => s.movement)) cols.push({ key: 'move', header: 'Movement', width: '0.74in', cell: (s) => s.movement });
    if (has((s) => s.equipment)) cols.push({ key: 'equip', header: 'Equipment', width: '0.78in', cell: (s) => s.equipment });
    if (has((s) => s.lens)) cols.push({ key: 'lens', header: 'Lens', width: '0.44in', cell: (s) => s.lens });
    if (showCam) cols.push({ key: 'cam', header: 'Cam', width: '0.48in', cell: camCell });
  }
  if (has((s) => s.characterIds?.length)) cols.push({ key: 'cast', header: 'Cast', width: compact ? '0.8in' : '0.9in', cell: (s) => <span className="slp-cast">{castOf(s)}</span> });
  if (showTimes) {
    cols.push({ key: 'setup', header: 'Setup', width: '0.44in', cls: 'num', cell: (s) => (s.setupMinutes ? `${s.setupMinutes}m` : '') });
    cols.push({ key: 'shoot', header: 'Shoot', width: '0.44in', cls: 'num', cell: (s) => (s.shootMinutes ? `${s.shootMinutes}m` : '') });
  }
  if (showNotes) cols.push({ key: 'notes', header: 'Notes', width: compact ? '1.15in' : '1.35in', cell: (s) => <div className="slp-notes">{notesOf(s)}</div> });

  const n = cols.length;
  const head = (
    <thead>
      <tr>
        {cols.map((c) => (
          <th key={c.key} className={c.cls}>
            {c.header}
          </th>
        ))}
      </tr>
    </thead>
  );
  const colgroup = (
    <colgroup>
      {cols.map((c) => (
        <col key={c.key} style={{ width: c.width }} />
      ))}
    </colgroup>
  );
  const rowsFor = (shots: Shot[]) =>
    shots.map((s) => (
      <tr key={s.id} className={isOmitted(s) ? 'slp-omit' : undefined}>
        {cols.map((c) => (
          <td key={c.key} className={c.cls}>
            {c.cell(s)}
          </td>
        ))}
      </tr>
    ));
  const timeText = (shots: Shot[]) => {
    const su = sumMinutes(shots, 'setupMinutes');
    const sh = sumMinutes(shots, 'shootMinutes');
    return su + sh > 0 ? `est. ${fmt.minutes(su + sh)} (setup ${fmt.minutes(su) || '0m'} · shoot ${fmt.minutes(sh) || '0m'})` : '';
  };
  const sceneHeader = (g: ShotGroup) => {
    const sc: SceneInfo | undefined = g.scene;
    const meta = [sc && sc.eighths > 0 ? `${fmt.eighths(sc.eighths)} pg` : '', plural(g.shots.filter((s) => !isOmitted(s)).length, 'shot'), timeText(g.shots)].filter(Boolean).join(' · ');
    const syn = sc ? sc.synopsis || '' : '';
    return (
      <tr className="slp-scene" key={`h-${g.key}`}>
        <td colSpan={n}>
          <span className="slp-scene-meta">{meta}</span>
          {sc && <span className="slp-scene-no">{sc.number}</span>}
          <span className="slp-scene-h">{sc ? sc.heading || 'Untitled scene' : model.scenes.length ? 'Unassigned shots' : 'Shots'}</span>
          {syn && <div className="slp-syn">{syn}</div>}
        </td>
      </tr>
    );
  };

  // top-level sections: either scene groups, or shoot days containing scene groups
  interface Section {
    key: string;
    day?: { title: string; meta: string };
    groups: ShotGroup[];
  }
  let sections: Section[];
  let note = '';
  if (o.groupBy === 'day') {
    const days = scheduleInfo(p, model);
    const byKey = new Map(groups.map((g) => [g.key, g]));
    const assigned = new Set<string>();
    sections = [];
    for (const d of days) {
      const gs: ShotGroup[] = [];
      for (const sid of d.sceneIds) {
        if (assigned.has(sid)) continue;
        assigned.add(sid);
        const g = byKey.get(sid);
        if (g?.shots.length) gs.push(g);
      }
      if (!gs.length) continue;
      const shots = gs.flatMap((g) => g.shots);
      sections.push({
        key: d.day.id,
        day: {
          title: `${d.label.toUpperCase()}${d.date ? ` · ${fmt.dateLong(d.date)}` : ''}`,
          meta: [plural(gs.length, 'scene'), plural(shots.filter((s) => !isOmitted(s)).length, 'shot'), timeText(shots)].filter(Boolean).join(' · '),
        },
        groups: gs,
      });
    }
    const rest = groups.filter((g) => !assigned.has(g.key) && g.shots.length);
    if (rest.length) {
      const shots = rest.flatMap((g) => g.shots);
      sections.push({
        key: 'unscheduled',
        day: { title: sections.length ? 'NOT SCHEDULED' : 'ALL SHOTS', meta: [plural(shots.filter((s) => !isOmitted(s)).length, 'shot'), timeText(shots)].filter(Boolean).join(' · ') },
        groups: rest,
      });
    }
    if (!days.length) note = 'No shoot days in the schedule yet — shots are listed in script order.';
  } else {
    sections = groups.map((g) => ({ key: g.key, groups: [g] }));
  }

  const liveAll = all.filter((s) => !isOmitted(s));
  const scenesCovered = new Set(liveAll.map((s) => s.sceneId).filter((id): id is string => !!id && model.sceneById.has(id))).size;
  const onlyScene = sceneOnly && sceneOnly !== '__unassigned' ? model.sceneById.get(sceneOnly) : undefined;
  const subtitle = [
    plural(liveAll.length, 'shot'),
    plural(scenesCovered, 'scene'),
    timeText(all),
    onlyScene ? `Scene ${onlyScene.number} only` : sceneOnly ? 'Unassigned shots only' : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const dates = p.meta.shootStart ? `${fmt.dateMedium(p.meta.shootStart)}${p.meta.shootEnd && p.meta.shootEnd !== p.meta.shootStart ? ` – ${fmt.dateMedium(p.meta.shootEnd)}` : ''}` : '';

  const sectionRows = (sec: Section) => (
    <>
      {sec.day && (
        <tr className="slp-day">
          <td colSpan={n}>
            <span className="slp-day-meta">{sec.day.meta}</span>
            {sec.day.title}
          </td>
        </tr>
      )}
      {sec.groups.map((g) => (
        <FragmentRows key={g.key}>
          {sceneHeader(g)}
          {rowsFor(g.shots)}
        </FragmentRows>
      ))}
    </>
  );

  const totalRow = (
    <tr className="slp-total">
      <td colSpan={n}>
        Total: {plural(liveAll.length, 'shot')}
        {timeText(all) ? ` · ${timeText(all)}` : ''}
      </td>
    </tr>
  );

  const body = (
    <>
      <DocHeader ctx={ctx} title="Shot List" subtitle={subtitle} />
      <KV
        cols={4}
        style={{ marginTop: -4, marginBottom: 10 }}
        items={[
          ['Director', p.meta.director ?? ''],
          ['Director of photography', findDp(p)],
          ['Format', [p.meta.aspectRatio, p.meta.frameRate && `${p.meta.frameRate} fps`, p.meta.resolution].filter(Boolean).join(' · ')],
          ['Shoot dates', dates],
        ]}
      />
      {o.newPage ? (
        sections.map((sec, i) => (
          <div key={sec.key} className={i > 0 ? 'pp-break-before' : undefined}>
            <table className="pp-table slp-table">
              {colgroup}
              {head}
              <tbody>
                {sectionRows(sec)}
                {i === sections.length - 1 && totalRow}
              </tbody>
            </table>
          </div>
        ))
      ) : (
        <table className="pp-table slp-table">
          {colgroup}
          {head}
          <tbody>
            {sections.map((sec) => (
              <FragmentRows key={sec.key}>{sectionRows(sec)}</FragmentRows>
            ))}
            {totalRow}
          </tbody>
        </table>
      )}
      {note && <div className="slp-note">{note}</div>}
    </>
  );
  return { body, css: CSS };
}

function FragmentRows({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export const printDocs: PrintDocDef[] = [
  {
    id: 'shot-list',
    title: 'Shot List',
    group: 'Visuals',
    orientation: 'landscape',
    description: 'Every shot with size, angle, movement, lens, cast and timing — grouped by scene or shoot day, with on-set checkboxes.',
    options: [
      {
        key: 'groupBy',
        label: 'Group by',
        type: 'select',
        default: 'scene',
        choices: [
          { value: 'scene', label: 'Scene (script order)' },
          { value: 'day', label: 'Shoot day (schedule order)' },
        ],
      },
      { key: 'showThumbs', label: 'Storyboard thumbnails', type: 'boolean', default: true },
      { key: 'showAudio', label: 'Audio / dialogue under the description', type: 'boolean', default: true },
      { key: 'showNotes', label: 'Notes column', type: 'boolean', default: true },
      { key: 'showTimes', label: 'Setup & shoot estimates', type: 'boolean', default: true },
      { key: 'includeOmitted', label: 'Include omitted shots', type: 'boolean', default: false },
      { key: 'newPage', label: 'Start each scene / day on a new page', type: 'boolean', default: false },
    ],
    emptyReason: (p) => (p.shots.length ? false : 'No shots yet — add them in the Shot List'),
    render: renderShotList,
  },
];
