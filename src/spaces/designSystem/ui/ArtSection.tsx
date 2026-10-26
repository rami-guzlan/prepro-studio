/* Design system › Art direction: what an image model needs — how the elements work together, imagery,
   composition, colour behaviour, typography in images, substitutions and signature treatments. */
import { Brush, Plus, Sparkles, Wand2 } from 'lucide-react';
import type { DSTreatment } from '../types';
import { Button, Field, Input, Textarea } from '@/ui';
import { dsAdd, dsMove, dsPatch, dsRemove, dsSet } from '../ops';
import { AssetPick, ItemActions, LevelSelect, SectionHead, SubHead, Teach, confirmRemove, useDS } from './shared';

const IMAGERY: [key: string, label: string, placeholder: string][] = [
  ['subjects', 'Approved subjects', 'e.g. real professionals at work, hands on tools, city architecture'],
  ['style', 'Style', 'photography / illustration / 3D / collage … e.g. documentary photography'],
  ['lighting', 'Lighting', 'e.g. hard window light, deep shadows, no flat studio light'],
  ['camera', 'Camera & angles', 'e.g. 35mm, eye level or slightly low, shallow depth of field'],
  ['cropping', 'Cropping', 'e.g. tight, off-centre, cut through faces and objects'],
  ['realism', 'Realism', 'e.g. photoreal, never glossy CGI'],
  ['people', 'People', 'e.g. diverse, mid-action, never looking at the camera'],
  ['avoid', 'Avoid', 'e.g. stock handshakes, lightbulbs, robots, neon “AI” glows'],
];

const COLOR_BEHAVIOR: [key: string, label: string, placeholder: string][] = [
  ['dominant', 'Dominant colours', 'e.g. near-black backgrounds dominate'],
  ['accents', 'Accents', 'e.g. one cyan accent per frame, never two accent colours together'],
  ['coverage', 'Approximate coverage', 'e.g. 70 % black, 20 % white, 10 % cyan'],
  ['photoTreatment', 'Photo treatment', 'e.g. monochrome, high contrast, slight grain'],
  ['backgrounds', 'Backgrounds', 'e.g. solid black or deep navy; no gradients behind text'],
  ['lightDark', 'Light vs dark', 'e.g. light versions swap black for warm white; the accent stays'],
];

function TreatmentCard({ t, index, count }: { t: DSTreatment; index: number; count: number }) {
  const up = (patch: Partial<DSTreatment>) => dsPatch('treatments', t.id, patch);
  const opt = (v: string) => v || undefined;
  return (
    <div className="ds-treat" data-ds-id={t.id}>
      <div className="ds-treat-img">
        <AssetPick value={t.exampleAssetId} onChange={(exampleAssetId) => dsPatch('treatments', t.id, { exampleAssetId }, false)} label="Example image" />
      </div>
      <div className="ds-treat-body">
        <div className="row" style={{ gap: 6 }}>
          <Input size="sm" className="strong grow" value={t.name} placeholder="e.g. Angular photo crops" aria-label="Treatment name" onChange={(name) => up({ name })} />
          <LevelSelect value={t.level} compact onChange={(level) => dsPatch('treatments', t.id, { level }, false)} />
          <ItemActions
            index={index}
            count={count}
            onMove={(a, b) => dsMove('treatments', a, b)}
            label="treatment"
            onDelete={async () => {
              if (await confirmRemove(`the treatment “${t.name || 'Untitled'}”`, !!(t.description || t.whereToUse))) dsRemove('treatments', [t.id]);
            }}
          />
        </div>
        <Textarea autoGrow minRows={2} value={t.description} placeholder="What it is, precisely enough to reproduce" aria-label="Description" onChange={(v) => up({ description: opt(v) })} />
        <div className="ds-grid-2 tight">
          <Field label="Where to use">
            <Input size="sm" value={t.whereToUse} placeholder="e.g. covers and hero images" onChange={(v) => up({ whereToUse: opt(v) })} />
          </Field>
          <Field label="Avoid">
            <Input size="sm" value={t.avoid} placeholder="e.g. on portraits, more than once per page" onChange={(v) => up({ avoid: opt(v) })} />
          </Field>
        </div>
      </div>
    </div>
  );
}

export function ArtSection() {
  const ds = useDS();
  const ad = ds.artDirection;
  const im = ad.imagery as Record<string, string | undefined>;
  const cb = ad.colorBehavior as Record<string, string | undefined>;
  const addTreatment = () => {
    const id = dsAdd('treatments', { name: '', level: 'preferred' });
    setTimeout(() => document.querySelector<HTMLInputElement>(`[data-ds-id="${id}"] .ds-treat-body input`)?.focus(), 40);
  };
  return (
    <div className="ds-section">
      <SectionHead icon={Brush} title="Art direction" intro="What a generator needs to make new imagery that belongs: how the elements relate, what the pictures show and how, how colour behaves in a frame, and the signature treatments that make it recognisable." />

      <div className="ds-card ds-card-accent ds-relationships">
        <SubHead title={<><Wand2 size={15} /> How the elements work together</>} hint="The single most useful paragraph for an image model" />
        <Textarea
          autoGrow
          minRows={5}
          value={ad.relationships}
          aria-label="How the elements work together"
          placeholder={
            'Describe how type, image, colour and graphic elements relate in one frame. For example:\n“The photo always fills the frame edge to edge and is graded dark; one oversized headline in white sits in the empty third, never over a face. A thin cyan line ties the headline to the single statistic. The logo is small and bottom-left, with clear space equal to its height. Nothing is centred except on covers.”'
          }
          onChange={(v) => dsSet('artDirection.relationships', v)}
        />
      </div>

      <div className="ds-card">
        <SubHead title="Imagery" hint="Subjects, style, light, camera, crop" />
        <div className="ds-grid-2">
          {IMAGERY.map(([k, label, ph]) => (
            <Field key={k} label={label}>
              <Textarea autoGrow minRows={2} value={im[k]} placeholder={ph} onChange={(v) => dsSet(`artDirection.imagery.${k}`, v)} />
            </Field>
          ))}
        </div>
      </div>

      <div className="ds-card">
        <SubHead title="Composition" hint="Hierarchy, focal point, negative space, text-to-image balance, alignment, overlaps" />
        <Textarea autoGrow minRows={3} value={ad.composition} aria-label="Composition" placeholder="e.g. One focal point per frame. At least 40 % negative space. Text left-aligned on a 12-column grid; images may bleed off the edge, text never does." onChange={(v) => dsSet('artDirection.composition', v)} />
      </div>

      <div className="ds-card">
        <SubHead title="Colour behaviour" hint="How colour is distributed in a frame — not just which colours" />
        <div className="ds-grid-2">
          {COLOR_BEHAVIOR.map(([k, label, ph]) => (
            <Field key={k} label={label}>
              <Textarea autoGrow minRows={2} value={cb[k]} placeholder={ph} onChange={(v) => dsSet(`artDirection.colorBehavior.${k}`, v)} />
            </Field>
          ))}
        </div>
      </div>

      <div className="ds-card">
        <div className="ds-grid-2">
          <Field label="Typography in images" hint="Weights, widths, case, spacing, line breaks, hierarchy">
            <Textarea autoGrow minRows={3} value={ad.typographyInImages} placeholder="e.g. Headlines in heavy sans, tight leading, max 6 words per line, break lines on meaning. Never more than two sizes in one image." onChange={(v) => dsSet('artDirection.typographyInImages', v)} />
          </Field>
          <Field label="Font substitutions" hint="Acceptable stand-ins when the real fonts are unavailable">
            <Textarea autoGrow minRows={3} value={ad.substitutions} placeholder="e.g. Montserrat ExtraBold → Arial Black; Inter → Helvetica / Arial" onChange={(v) => dsSet('artDirection.substitutions', v)} />
          </Field>
        </div>
      </div>

      <div className="ds-card">
        <SubHead
          title="Signature treatments"
          hint="The recognisable moves"
          actions={
            ds.treatments.length > 0 && (
              <Button size="sm" variant="ghost" icon={Plus} onClick={addTreatment}>
                Add treatment
              </Button>
            )
          }
        />
        {ds.treatments.length === 0 ? (
          <Teach
            icon={Sparkles}
            title="What makes it unmistakably yours?"
            actions={
              <Button icon={Plus} onClick={addTreatment}>
                Add treatment
              </Button>
            }
          >
            Angular photo crops, film grain, a cyan block behind numbers, a spectrum tick under titles … Describe each precisely, say where it belongs and where not, and mark it required, preferred or open. An example image helps more than any adjective.
          </Teach>
        ) : (
          <div className="ds-treats">
            {ds.treatments.map((t, i) => (
              <TreatmentCard key={t.id} t={t} index={i} count={ds.treatments.length} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
