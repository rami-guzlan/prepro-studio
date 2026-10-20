/* Quick-start diagram templates (and the builder also used by the sample
   project). Positions are written in diagram units (ft / m) for clarity. */
import type { DiagramItem, LightingDiagram } from '@/types';
import { angleTo, makeItem, newDiagram, type P } from './model';

/** Incremental builder: positions in units, converted to canvas px. */
export class PlotBuilder {
  d: LightingDiagram;
  constructor(name: string, widthU: number, heightU: number, ppu: number, units: 'ft' | 'm' = 'ft') {
    this.d = { ...newDiagram(name, units), pxPerUnit: ppu, width: Math.round(widthU * ppu), height: Math.round(heightU * ppu) };
  }
  get ppu() {
    return this.d.pxPerUnit;
  }
  /** Add an item at (x, y) units. `size` in units for box kinds, `facing` = a point (units) the item turns towards. */
  add(kind: string, x: number, y: number, o: { rot?: number; facing?: P; size?: [number, number]; label?: string; color?: string; props?: Record<string, unknown>; scale?: number; points?: P[]; locked?: boolean } = {}): DiagramItem {
    const ppu = this.ppu;
    const it = makeItem(kind, this.d, x * ppu, y * ppu, { props: o.props });
    if (o.size) {
      it.w = Math.round(o.size[0] * ppu);
      it.h = Math.round(o.size[1] * ppu);
    }
    if (o.facing) it.rotation = Math.round(angleTo([x, y], o.facing));
    if (o.rot != null) it.rotation = o.rot;
    if (o.label != null) it.label = o.label;
    if (o.color) it.color = o.color;
    if (o.scale) it.scale = o.scale;
    if (o.locked) it.locked = true;
    if (o.points) it.points = o.points.map(([px, py]) => [Math.round((px - x) * ppu), Math.round((py - y) * ppu)] as [number, number]);
    this.d.items.push(it);
    return it;
  }
}

export interface TemplateDef {
  id: string;
  label: string;
  description: string;
  build: () => LightingDiagram;
}

export const TEMPLATES: TemplateDef[] = [
  {
    id: 'interview',
    label: 'Interview 3-point',
    description: 'Seated subject, soft key, fill, hair light, background kick, A/B cameras',
    build: () => {
      const b = new PlotBuilder('Interview — 3-point', 24, 18, 40);
      const subject: P = [12, 7.4];
      const interviewer: P = [10.1, 13.4];
      b.add('set.wall', 12, 1.6, { size: [20, 0.4], label: '' });
      b.add('shape.rect', 12, 2.6, { size: [12, 1.2], label: 'Backdrop / set dressing', color: '#868e96', props: { fill: true, dashed: true } });
      b.add('set.plant', 18.5, 3.6, { size: [2, 2] });
      b.add('set.chair', subject[0], subject[1] + 0.1, { facing: interviewer, size: [1.8, 1.8] });
      b.add('set.chair', interviewer[0], interviewer[1] + 0.2, { facing: subject, size: [1.8, 1.8] });
      b.add('person.actor', subject[0], subject[1], { facing: interviewer, label: 'Subject' });
      b.add('person.crew', interviewer[0], interviewer[1], { facing: subject, label: 'Interviewer', color: '#7c8394' });
      b.add('light.softbox', 7.4, 9.8, { facing: subject, label: 'Key', props: { purpose: 'Key', fixture: 'Aputure LS 600d Pro', watts: 600, cct: 5600, intensity: 70, modifier: 'Softbox', height: 7, beam: 90, throw: 9 } });
      b.add('light.panel', 16.8, 11, { facing: subject, label: 'Fill', props: { purpose: 'Fill', fixture: 'Litepanels Astra 1x1', watts: 100, cct: 5600, intensity: 25, modifier: 'Diffusion 1/2', height: 6, beam: 60, throw: 8 } });
      b.add('light.fresnel', 15.6, 3.8, { facing: subject, label: 'Hair / rim', props: { purpose: 'Back/Rim', fixture: 'ARRI 650 Fresnel', watts: 650, cct: 3200, gel: '1/2 CTB', intensity: 45, modifier: 'Barn doors', height: 8, beam: 30, throw: 7 } });
      b.add('light.par', 5, 4.6, { facing: [9, 1.8], label: 'BG slash', props: { purpose: 'Background', fixture: 'Dedolight DLH4', watts: 150, cct: 3200, intensity: 60, beam: 22, throw: 6 } });
      b.add('camera.cinema', 12.6, 14.3, { facing: subject, label: 'A', props: { lens: 50, sensor: 's35', support: 'Sticks + fluid head', height: 4.5, fovLength: 9 } });
      b.add('camera.mirrorless', 15.4, 13, { facing: subject, label: 'B', props: { lens: 85, sensor: 'ff', support: 'Tripod', height: 4.5, fovLength: 9 } });
      b.add('sound.boom', 12.8, 3.6, { facing: subject, scale: 0.8 });
      b.add('grip.cstand', 6.6, 11.2, {});
      b.add('grip.sandbag', 6.2, 12.1, {});
      b.d.notes = 'Key on the subject’s eyeline side (short side). Fill at ~1.5 stops under key. Hair light gelled 1/2 CTB for separation.';
      return b.d;
    },
  },
  {
    id: 'dialogue',
    label: 'Two-person dialogue',
    description: 'Two actors at a table, cross keys, backlights, A/B over-the-shoulder cameras',
    build: () => {
      const b = new PlotBuilder('Two-person dialogue', 30, 20, 40);
      const a: P = [12.4, 10];
      const c: P = [17.6, 10];
      b.add('set.rug', 15, 10, { size: [11, 7] });
      b.add('set.wall', 15, 1.4, { size: [26, 0.4] });
      b.add('set.window', 8, 1.4, { size: [5, 0.4] });
      b.add('set.table', 15, 10, { size: [4, 2.6] });
      b.add('set.chair', a[0] - 0.2, a[1], { rot: 90, size: [1.8, 1.8] });
      b.add('set.chair', c[0] + 0.2, c[1], { rot: 270, size: [1.8, 1.8] });
      b.add('person.actor', a[0], a[1], { rot: 90, label: 'Actor A', color: '#e5484d' });
      b.add('person.actor', c[0], c[1], { rot: 270, label: 'Actor B', color: '#3e8ef7' });
      b.add('light.practical', 15, 9.6, { label: 'Table lamp', props: { purpose: 'Practical', fixture: 'Household practical bulb', watts: 60, cct: 2700, intensity: 50 } });
      b.add('light.softbox', 19.5, 15.2, { facing: a, label: 'Key A', props: { purpose: 'Key', fixture: 'Aputure LS 300x', watts: 300, cct: 4300, intensity: 60, modifier: 'Softbox', height: 7, beam: 80, throw: 10 } });
      b.add('light.softbox', 10.5, 4.8, { facing: c, label: 'Key B', props: { purpose: 'Key', fixture: 'Aputure LS 300x', watts: 300, cct: 4300, intensity: 60, modifier: 'Softbox', height: 7, beam: 80, throw: 10 } });
      b.add('light.fresnel', 8.2, 6, { facing: a, label: 'Rim A', props: { purpose: 'Back/Rim', fixture: 'ARRI 300 Fresnel', watts: 300, cct: 3200, intensity: 50, modifier: 'Barn doors', height: 8, beam: 30, throw: 8 } });
      b.add('light.fresnel', 21.8, 14, { facing: c, label: 'Rim B', props: { purpose: 'Back/Rim', fixture: 'ARRI 300 Fresnel', watts: 300, cct: 3200, intensity: 50, modifier: 'Barn doors', height: 8, beam: 30, throw: 8 } });
      b.add('light.window', 8, 2.2, { rot: 180, label: 'Window ambience', props: { purpose: 'Motivated', fixture: 'Natural daylight (window)', cct: 5600, intensity: 40, beam: 100, throw: 9 } });
      b.add('grip.bounce', 15, 16.2, { rot: 0, size: [4, 0.2], label: '4x4 Bounce', props: { surface: 'white' } });
      b.add('camera.cinema', 9.2, 11.6, { facing: c, label: 'A', props: { lens: 50, sensor: 's35', support: 'Dolly', height: 5, fovLength: 11 } });
      b.add('camera.cinema', 20.8, 8.4, { facing: a, label: 'B', props: { lens: 50, sensor: 's35', support: 'Sticks + fluid head', height: 5, fovLength: 11 } });
      b.add('sound.boom', 15, 5.6, { rot: 180, scale: 0.85 });
      b.add('person.crew', 15, 3.4, { rot: 180, label: 'Boom op' });
      return b.d;
    },
  },
  {
    id: 'product',
    label: 'Product tabletop',
    description: 'Tabletop on seamless with strip lights, rim, bounce card, flag and a macro slider shot',
    build: () => {
      const b = new PlotBuilder('Product tabletop', 16, 12, 50);
      const prod: P = [8, 5.8];
      b.add('shape.rect', 8, 3.2, { size: [9, 2.6], label: 'White seamless sweep', color: '#868e96', props: { fill: true, dashed: true } });
      b.add('set.table', 8, 5.6, { size: [5, 3] });
      b.add('shape.rect', prod[0], prod[1], { size: [0.8, 0.8], label: '', color: '#e8590c', props: { fill: true } });
      b.add('note.text', prod[0], prod[1] - 1, { label: 'PRODUCT', props: { size: 12, bold: true } });
      b.add('light.softbox', 4.2, 5, { facing: prod, label: 'Strip key', scale: 0.8, props: { purpose: 'Key', fixture: 'Nanlite Forza 300 II', watts: 300, cct: 5600, intensity: 70, modifier: 'Softbox', height: 4, beam: 70, throw: 5 } });
      b.add('light.softbox', 11.6, 3, { facing: prod, label: 'Strip rim', scale: 0.8, props: { purpose: 'Back/Rim', fixture: 'Nanlite Forza 300 II', watts: 300, cct: 5600, intensity: 55, modifier: 'Grid', height: 4, beam: 50, throw: 5 } });
      b.add('light.panel', 8, 1, { rot: 180, label: 'Sweep wash', scale: 0.9, props: { purpose: 'Background', fixture: 'Litepanels Gemini 1x1', watts: 200, cct: 5600, intensity: 40, beam: 90, throw: 3 } });
      b.add('grip.bounce', 10.8, 7.2, { facing: prod, size: [2, 0.15], label: 'Bounce card', props: { surface: 'white' } });
      b.add('grip.flag', 5.6, 8, { facing: prod, size: [1.5, 0.12], label: 'Flag (lens flare)' });
      b.add('grip.slider', 8, 9.8, { rot: 90, size: [3, 0.45], label: 'Slider' });
      b.add('camera.cinema', 8, 9.4, { facing: prod, label: 'A', scale: 0.85, props: { lens: 100, sensor: 's35', support: 'Slider', height: 3.5, fovLength: 5 } });
      b.add('note.arrow', 8.9, 10.6, { points: [[8.9, 10.6], [8.9, 8.6]], label: 'Slow push', props: { dashed: true } });
      b.d.notes = 'Macro 100mm @ T4. Black flags both sides of lens to kill flare; clean product with a duster between takes.';
      return b.d;
    },
  },
  {
    id: 'car',
    label: 'Car interior',
    description: 'Driver & passenger in a picture car, hood mount and side camera, dash tube, soft key through windshield',
    build: () => {
      const b = new PlotBuilder('Car interior', 24, 26, 40);
      const driver: P = [11.2, 12.4];
      const passenger: P = [12.8, 12.4];
      b.add('set.car', 12, 13, { size: [6, 15], label: '' });
      b.add('person.actor', driver[0], driver[1], { rot: 0, label: 'Driver', color: '#e5484d', scale: 0.75 });
      b.add('person.actor', passenger[0], passenger[1], { rot: 0, label: 'Passenger', color: '#3e8ef7', scale: 0.75 });
      b.add('light.tube', 12, 10.4, { rot: 180, label: 'Dash tube', scale: 0.7, props: { purpose: 'Fill', fixture: 'Astera Titan Tube', watts: 72, cct: 5600, intensity: 20, beam: 140, throw: 4 } });
      b.add('light.mat', 8.6, 4.6, { facing: driver, label: 'Soft key (windshield)', props: { purpose: 'Key', fixture: 'Amaran F22c (mat)', watts: 200, cct: 4300, intensity: 50, modifier: 'Diffusion 1/2', height: 5, beam: 100, throw: 10 } });
      b.add('light.tube', 7.4, 19.5, { facing: driver, label: 'Kicker', scale: 0.8, props: { purpose: 'Kicker', fixture: 'Astera Titan Tube', watts: 72, cct: 7500, intensity: 35, beam: 120, throw: 9 } });
      b.add('light.par', 18.8, 20, { facing: passenger, label: 'Passing lights', props: { purpose: 'Motivated', fixture: 'ETC Source Four (Leko)', watts: 575, gel: 'Bastard Amber', intensity: 60, beam: 26, throw: 12, notes: 'On dimmer — chase for passing street lights' } });
      b.add('grip.negfill', 17, 12, { rot: 90, size: [4, 0.2], label: 'Neg fill' });
      b.add('camera.mirrorless', 12, 4.1, { facing: [12, 12], label: 'A', props: { lens: 24, sensor: 'ff', support: 'Car mount', height: 4, fovLength: 9 } });
      b.add('camera.cinema', 18.6, 12.6, { facing: driver, label: 'B', scale: 0.8, props: { lens: 35, sensor: 's35', support: 'Car mount', height: 4, fovLength: 8 } });
      b.add('note.text', 12, 24.6, { label: 'Process trailer / tow rig — direction of travel ↑', props: { size: 13 } });
      return b.d;
    },
  },
];
