import type { Deliverable, EditNote, PostMilestone, ProjectData } from '@/types';
import type { SampleContext } from '@/sample/context';
import { SAMPLE_SCENES } from '@/sample/context';
import { uid } from '@/lib/id';
import { templatePostSchedule } from '@/templates';
import { fmtDur, tcSpan } from './shared';

const SCHEDULE: Record<string, Partial<PostMilestone>> = {
  'Ingest & sync': { start: '2026-11-09', end: '2026-11-10', owner: 'Chloe Martin' },
  'Assembly cut': { start: '2026-11-11', end: '2026-11-13', owner: 'Chloe Martin' },
  'Rough cut': { start: '2026-11-16', end: '2026-11-18', owner: 'Chloe Martin' },
  'Review & notes': { start: '2026-11-19', end: '2026-11-20', owner: 'Elena Ward', notes: 'Producer + director screening at Studio 9.' },
  'Fine cut': { start: '2026-11-23', end: '2026-11-25', owner: 'Chloe Martin' },
  'Picture lock': { start: '2026-11-27', end: '2026-11-27', owner: 'Elena Ward' },
  'Music & sound design': {
    start: '2026-11-02',
    end: '2026-12-04',
    owner: 'Studio 9 Post',
    status: 'in_progress',
    notes: 'Composer writing to the animatic; temp score approved.',
  },
  'Color grade': { start: '2026-11-30', end: '2026-12-03', owner: 'Studio 9 Post' },
  'Graphics & VFX': {
    start: '2026-10-26',
    end: '2026-12-02',
    owner: 'Chloe Martin',
    status: 'in_progress',
    notes: 'Title design in progress; sky replacement only if Nov 7 is overcast.',
  },
  'Final mix': { start: '2026-12-07', end: '2026-12-09', owner: 'Studio 9 Post' },
  'Captions & QC': { start: '2026-12-10', end: '2026-12-11', owner: 'Chloe Martin' },
  Delivery: { start: '2026-12-14', end: '2026-12-15', owner: 'Marcus Chen' },
};

const DELIVERABLES: Record<string, Partial<Deliverable>> = {
  'Picture master': { due: '2026-12-15', frameRate: '23.976', resolution: '4096x1716', notes: 'Graded master + textless version at the end.' },
  'Festival screener': { due: '2026-12-11', frameRate: '23.976', loudness: '-24 LKFS', notes: 'Private Vimeo link for submissions; letterboxed 2.39 in 16:9.' },
  DCP: { due: '2026-12-15', frameRate: '24', aspectRatio: '2.39:1', container: 'MXF (SMPTE DCP)', notes: 'Conform 23.976 → 24. Test at the festival tech check.' },
  'Stems (DME) + M&E': { due: '2026-12-15', codec: 'WAV 48 kHz / 24-bit' },
  Subtitles: { due: '2026-12-11', codec: 'SRT (UTF-8)', status: 'not_started' },
};

const WORKFLOW = `CAMERA & MEDIA
• Camera A: ARRI Alexa Mini LF   Codec: ProRes 4444 XQ   Format: 4096×1716 (2.39) @ 23.976 fps
• Colour: LogC4 / AWG4 — show LUT "LastTake_Show_v2.cube" on all monitors
• Card naming: A001, A002 …   Audio: Sound Devices 833, rolls SD001 … (BWF 48 kHz / 24-bit)
• Slate every take; timecode jam-synced at call and after lunch (Tentacle on camera)

ON-SET DATA (3-2-1 rule)
• Offload with checksum verification (xxHash64) to the RAID shuttle + a backup SSD
• 3 copies on 2 different media, 1 taken off-site by the producer every night
• Never format a card until 2 verified copies exist — DIT signs the media log
• Elevator is out: the data cart stays on the 9th-floor landing (outlets on every landing)

FOLDER STRUCTURE
• /THE_LAST_TAKE/01_Footage/DAY_01/A001   /02_Audio/DAY_01   /03_Proxies
• /04_Graphics   /05_Music   /06_VFX   /07_Exports

POST
• Proxies: ProRes 422 Proxy 1080p with burned-in TC + clip name (rendered overnight)
• Editing: DaVinci Resolve — shared project on the Studio 9 server
• Review: private review links, versions v01, v02 … notes logged in Post › Edit Notes
• Colour: Studio 9 Post — Rec.709 for web/screener, P3-D65 for the DCP
• Final mix: 5.1 + stereo fold-down, DME stems + M&E
`;

/** Adds demo data for the post module to the sample project (mutates p). */
export async function seedSample(p: ProjectData, _ctx: SampleContext): Promise<void> {
  const post = p.post;
  if (!post.schedule.length) post.schedule = templatePostSchedule();
  for (const m of post.schedule) Object.assign(m, SCHEDULE[m.name] ?? {});

  for (const d of post.deliverables) Object.assign(d, DELIVERABLES[d.name] ?? {});
  post.deliverables.push(
    {
      id: uid('dlv'),
      name: 'BTS promo (1 min)',
      platform: 'YouTube',
      resolution: '1920x1080',
      aspectRatio: '16:9',
      frameRate: '23.976',
      codec: 'H.264 High, 10–16 Mbps',
      container: 'MP4',
      audio: 'Stereo AAC 48 kHz',
      loudness: '-14 LUFS, -1 dBTP',
      captions: 'SRT sidecar',
      duration: '1:00',
      due: '2026-12-01',
      status: 'not_started',
      notes: 'Cut from the A/V promo script; release with the festival announcement.',
    },
    {
      id: uid('dlv'),
      name: 'Instagram teaser (9:16)',
      platform: 'Instagram Reels',
      resolution: '1080x1920',
      aspectRatio: '9:16',
      frameRate: '23.976',
      codec: 'H.264 High',
      container: 'MP4',
      audio: 'Stereo AAC 48 kHz',
      loudness: '-14 LUFS',
      captions: 'Burned-in',
      duration: '0:20',
      due: '2026-12-01',
      status: 'not_started',
      notes: 'June at the ledge, coat in the wind — title at the end.',
    },
  );

  post.graphics = [
    {
      id: uid('gfx'),
      kind: 'Title card',
      text: 'THE LAST TAKE',
      subtext: 'Golden Hour Pictures presents',
      sceneId: SAMPLE_SCENES.roof1,
      tcIn: '01:00:04:00',
      duration: '0:04',
      status: 'in_progress',
      notes: 'Condensed sans, warm white; fades up over the skyline.',
    },
    {
      id: uid('gfx'),
      kind: 'Lower third',
      text: 'BROOKLYN — 4:21 PM',
      subtext: 'Twelve minutes of light left',
      sceneId: SAMPLE_SCENES.roof1,
      tcIn: '01:00:12:00',
      duration: '0:04',
      status: 'review',
      notes: 'Bottom-left, same typeface as the title.',
    },
    {
      id: uid('gfx'),
      kind: 'End card',
      text: 'Written & directed by Elena Ward',
      subtext: 'Produced by Marcus Chen · Golden Hour Pictures',
      sceneId: SAMPLE_SCENES.edit,
      tcIn: '01:03:40:00',
      duration: '0:50',
      status: 'not_started',
      notes: 'Full end-credit roll; finish on the festival laurels card.',
    },
  ];

  const cue = (c: Omit<ProjectData['post']['music'][number], 'id' | 'duration'>) => ({ id: uid('cue'), ...c, duration: fmtDur(tcSpan(c.tcIn, c.tcOut, 24)) });
  post.music = [
    cue({
      cue: '1M1',
      title: 'Racing the Light',
      composer: 'Ava Lindqvist',
      publisher: 'Golden Hour Music (ASCAP)',
      source: 'original',
      tcIn: '01:00:10:00',
      tcOut: '01:01:42:12',
      usage: 'BI',
      license: 'Work for hire — signed',
      status: 'in_progress',
      notes: 'Builds under the stairwell climb; hard out on the door.',
    }),
    cue({
      cue: '1M2',
      title: 'Magic Hour (End Titles)',
      composer: 'Ava Lindqvist',
      publisher: 'Golden Hour Music (ASCAP)',
      source: 'original',
      tcIn: '01:03:38:00',
      tcOut: '01:04:30:00',
      usage: 'ET',
      license: 'Work for hire — signed',
      status: 'not_started',
    }),
  ];

  const roofShots = p.shots.filter((s) => s.sceneId === SAMPLE_SCENES.roof2);
  const roofShot = roofShots.find((s) => s.vfx) ?? roofShots.find((s) => /WS|EWS|EST/i.test(s.shotSize ?? '')) ?? roofShots[0];
  post.vfx = [
    {
      id: uid('vfx'),
      code: 'VFX_010',
      sceneId: SAMPLE_SCENES.roof2,
      shotId: roofShot?.id,
      description: 'Sky replacement (backup) — if the magic-hour sky is overcast on Nov 7, replace it with the clean plate shot on the tech scout.',
      vendor: 'In-house (Chloe Martin)',
      complexity: 'medium',
      due: '2026-12-02',
      cost: 600,
      status: 'not_started',
      notes: 'Shoot clean sky plates at 4:15 PM on the tech scout (Oct 31).',
    },
  ];

  const june = p.characters.find((c) => c.name === 'JUNE');
  post.adr = [
    {
      id: uid('adr'),
      characterId: june?.id,
      sceneId: SAMPLE_SCENES.roof2,
      line: 'I never said goodbye. Not to the city. Not to you. I thought if I stayed quiet long enough, it would all stay exactly where I left it.',
      reason: 'Wind noise',
      tc: '01:02:31:10',
      status: 'not_started',
      notes: 'Wind machine in the take. Book Sofia for one hour at Studio 9 after picture lock — keep the breaths.',
    },
  ];

  const note = (version: string, tc: string, text: string, author: string, status: EditNote['status']): EditNote => ({ id: uid('note'), version, tc: tc || undefined, note: text, author, status });
  post.editNotes = [
    note('Animatic v1', '00:00:41:00', 'Stairwell section drags — trim to three beats and lose the second landing.', 'Elena Ward', 'addressed'),
    note('Animatic v1', '00:01:05:00', 'Add a drone establishing shot of the building.', 'Marcus Chen', 'wontfix'),
    note('Animatic v2', '00:01:58:12', 'Hold on June’s look to lens two seconds longer before “Cut!”.', 'Marcus Chen', 'open'),
    note('Animatic v2', '00:02:40:00', 'Try the dissolve to the edit suite on the music swell instead of the cut.', 'Elena Ward', 'open'),
    note('Animatic v2', '', 'Temp music is too busy under the monologue — drop to the pad only.', 'Chloe Martin', 'open'),
  ];

  post.workflow = WORKFLOW;
}
