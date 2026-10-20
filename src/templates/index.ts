/* Starter templates applied to new projects (tasks, post schedule, deliverables, budget, gear). */
import type { AVRow, BudgetCategory, Deliverable, GearItem, GraphicItem, Phase, PostMilestone, ProjectType, Task } from '@/types';
import { uid } from '@/lib/id';

const T = (title: string, phase: Phase, priority: Task['priority'] = 'normal'): Task => ({
  id: uid('task'),
  title,
  phase,
  status: 'todo',
  priority,
});

function trailerTasks(): Task[] {
  return [
    T('Define trailer goal, audience, platforms & run times', 'development', 'high'),
    T('Watch & log all available footage — pull selects', 'development', 'high'),
    T('Write trailer beat sheet / A/V script', 'development', 'high'),
    T('Approve script, title-card & CTA copy', 'development'),
    T('Music search & licensing (trailer track, stingers)', 'pre', 'high'),
    T('Voiceover: write, cast & book session', 'pre'),
    T('Plan pickups / inserts shoot (if needed)', 'pre'),
    T('Clearances: footage, music, logos, likeness', 'pre', 'high'),
    T('Graphics: title treatment, credits block, end card', 'pre'),
    T('Shoot pickups / inserts', 'production'),
    T('Record voiceover', 'production'),
    T('Rough cut — structure & pacing', 'post', 'high'),
    T('Sound design (risers, hits, whooshes) & mix', 'post'),
    T('Color pass', 'post'),
    T('Fine cut & approvals', 'post', 'high'),
    T('Cutdowns: :60 / :30 / :15 / :06 bumper', 'post'),
    T('Vertical & square versions', 'post'),
    T('Textless version & captions', 'post'),
    T('QC & final approvals', 'delivery', 'high'),
    T('Export & deliver all versions', 'delivery', 'high'),
    T('Thumbnails, poster frame & upload', 'delivery'),
  ];
}

function minidocTasks(): Task[] {
  return [
    T('Define story, angle & audience', 'development', 'high'),
    T('Research & pre-interviews', 'development'),
    T('Choose subjects & locations', 'development', 'high'),
    T('Interview question outline', 'development', 'high'),
    T('Story outline / A/V treatment', 'development'),
    T('Approve budget & schedule', 'development'),
    T('Book interview subjects', 'pre', 'high'),
    T('Subject & location releases prepared', 'pre', 'high'),
    T('Interview setup: lighting plan, 2 cameras, audio', 'pre'),
    T('B-roll & verité shot list', 'pre'),
    T('Archival / stock footage research & licensing', 'pre'),
    T('Location scout & permits', 'pre'),
    T('Book crew & gear', 'pre'),
    T('Schedule & call sheets', 'pre'),
    T('Record interviews (backup audio + room tone)', 'production', 'high'),
    T('Capture B-roll & verité', 'production'),
    T('Collect signed releases on set', 'production', 'high'),
    T('Back up footage daily (3-2-1)', 'production', 'high'),
    T('Transcribe interviews', 'post'),
    T('Paper edit — pick soundbites & story order', 'post', 'high'),
    T('Assembly & rough cut', 'post'),
    T('Review rounds & notes', 'post'),
    T('Picture lock', 'post', 'high'),
    T('Music, sound design & mix', 'post'),
    T('Color grade', 'post'),
    T('Lower thirds, titles & archival credits', 'post'),
    T('Captions / subtitles', 'post'),
    T('QC & approvals', 'delivery', 'high'),
    T('Export & deliver all versions', 'delivery', 'high'),
    T('Archive project, media & releases', 'delivery'),
  ];
}

export function templateTasks(type: ProjectType): Task[] {
  if (type === 'trailer') return trailerTasks();
  if (type === 'minidoc') return minidocTasks();
  const isClient = ['commercial', 'corporate', 'training', 'social'].includes(type);
  const isScripted = ['short', 'feature', 'commercial', 'music_video', 'episodic', 'corporate', 'training', 'social'].includes(type);
  const tasks: Task[] = [];
  if (isClient) {
    tasks.push(T('Confirm creative brief, objectives & audience', 'development', 'high'));
    tasks.push(T('Agree budget, timeline & approval rounds with client', 'development', 'high'));
  }
  if (isScripted) tasks.push(T('Lock script / treatment', 'development', 'high'));
  if (type === 'documentary' || type === 'interview') {
    tasks.push(T('Research & interview question outline', 'development', 'high'));
    tasks.push(T('Book interview subjects', 'pre', 'high'));
  }
  tasks.push(
    T('Approve production budget', 'development'),
    T('Hire key crew (DP, Gaffer, Sound, PD)', 'pre', 'high'),
    T('Casting & talent confirmations', 'pre', 'high'),
    T('Location scouting & photos', 'pre'),
    T('Secure location agreements & permits', 'pre', 'high'),
    T('Production insurance / certificate of insurance', 'pre', 'high'),
    T('Shot list & storyboards', 'pre'),
    T('Lighting diagrams & camera plan', 'pre'),
    T('Book equipment rentals', 'pre'),
    T('Wardrobe fittings & approvals', 'pre'),
    T('Props & set dressing sourced', 'pre'),
    T('Tech scout with HODs', 'pre'),
    T('Lock shooting schedule', 'pre', 'high'),
    T('Prepare talent & location releases', 'pre'),
    T('Safety plan / risk assessment', 'pre'),
    T('Catering, parking & transportation', 'pre'),
    T('Media management plan (cards, backups, DIT)', 'pre'),
    T('Send call sheets (24h before each day)', 'production', 'high'),
    T('Collect signed releases on set', 'production'),
    T('Back up footage daily (3-2-1)', 'production', 'high'),
    T('Wrap report & equipment returns', 'production'),
    T('Ingest, sync & organize footage', 'post'),
    T('Assembly / rough cut', 'post'),
    T('Review rounds & notes', 'post'),
    T('Picture lock', 'post', 'high'),
    T('Sound design, music & mix', 'post'),
    T('Color grade', 'post'),
    T('Graphics, titles & lower thirds', 'post'),
    T('Captions / subtitles', 'post'),
    T('QC & final approvals', 'delivery', 'high'),
    T('Export & deliver all versions', 'delivery', 'high'),
    T('Archive project & media', 'delivery'),
  );
  return tasks;
}

export function templatePostSchedule(): PostMilestone[] {
  return [
    'Ingest & sync',
    'Assembly cut',
    'Rough cut',
    'Review & notes',
    'Fine cut',
    'Picture lock',
    'Music & sound design',
    'Color grade',
    'Graphics & VFX',
    'Final mix',
    'Captions & QC',
    'Delivery',
  ].map((name) => ({ id: uid('pm'), name, status: 'not_started' as const }));
}

const D = (p: Partial<Deliverable> & { name: string }): Deliverable => ({ id: uid('dlv'), status: 'not_started', ...p });

export function templateDeliverables(type: ProjectType): Deliverable[] {
  switch (type) {
    case 'social':
      return [
        D({ name: 'YouTube master', platform: 'YouTube', resolution: '3840x2160', aspectRatio: '16:9', codec: 'H.264', container: 'MP4', audio: 'Stereo', loudness: '-14 LUFS' }),
        D({ name: 'Vertical cut', platform: 'YouTube Shorts', resolution: '1080x1920', aspectRatio: '9:16', codec: 'H.264', container: 'MP4', audio: 'Stereo', loudness: '-14 LUFS', captions: 'Burned-in' }),
        D({ name: 'Reels / TikTok', platform: 'Instagram Reels', resolution: '1080x1920', aspectRatio: '9:16', codec: 'H.264', container: 'MP4', audio: 'Stereo', loudness: '-14 LUFS', captions: 'Burned-in' }),
        D({ name: 'LinkedIn feed', platform: 'LinkedIn', resolution: '1080x1350', aspectRatio: '4:5', codec: 'H.264', container: 'MP4', audio: 'Stereo', captions: 'SRT sidecar' }),
        D({ name: 'Thumbnail', platform: 'YouTube', resolution: '1280x720', aspectRatio: '16:9', codec: 'JPG' }),
      ];
    case 'corporate':
    case 'training':
      return [
        D({ name: 'Web master', platform: 'Website', resolution: '1920x1080', aspectRatio: '16:9', codec: 'H.264', container: 'MP4', audio: 'Stereo', loudness: '-16 LUFS' }),
        D({ name: 'LMS version', platform: 'LMS / SCORM', resolution: '1920x1080', aspectRatio: '16:9', codec: 'H.264', container: 'MP4', audio: 'Stereo', captions: 'SRT / VTT' }),
        D({ name: 'Social cutdown', platform: 'LinkedIn', resolution: '1080x1350', aspectRatio: '4:5', codec: 'H.264', container: 'MP4', captions: 'Burned-in' }),
        D({ name: 'Captions file', platform: 'Website', captions: 'SRT + VTT' }),
        D({ name: 'Transcript', platform: 'Website', codec: 'DOCX / PDF' }),
        D({ name: 'Archive master', platform: 'Archive master', resolution: '3840x2160', codec: 'ProRes 422 HQ', container: 'MOV', audio: 'Stereo + stems' }),
      ];
    case 'commercial':
      return [
        D({ name: ':30 broadcast master', platform: 'Broadcast', resolution: '1920x1080', aspectRatio: '16:9', codec: 'ProRes 422 HQ', container: 'MOV', audio: 'Stereo', loudness: '-24 LKFS', duration: '0:30' }),
        D({ name: ':15 cutdown', platform: 'Broadcast', resolution: '1920x1080', aspectRatio: '16:9', codec: 'ProRes 422 HQ', container: 'MOV', loudness: '-24 LKFS', duration: '0:15' }),
        D({ name: 'Social 9:16', platform: 'Instagram Reels', resolution: '1080x1920', aspectRatio: '9:16', codec: 'H.264', container: 'MP4', loudness: '-14 LUFS' }),
        D({ name: 'Social 1:1', platform: 'Instagram Feed', resolution: '1080x1080', aspectRatio: '1:1', codec: 'H.264', container: 'MP4' }),
        D({ name: 'Textless master', platform: 'Archive master', resolution: '3840x2160', codec: 'ProRes 4444', container: 'MOV' }),
      ];
    case 'music_video':
      return [
        D({ name: 'Master', platform: 'YouTube', resolution: '3840x2160', aspectRatio: '16:9', codec: 'H.264', container: 'MP4', audio: 'Stereo (label master)' }),
        D({ name: 'Vertical cut', platform: 'Instagram Reels', resolution: '1080x1920', aspectRatio: '9:16', codec: 'H.264', container: 'MP4' }),
        D({ name: 'Archive master', platform: 'Archive master', resolution: '3840x2160', codec: 'ProRes 422 HQ', container: 'MOV' }),
      ];
    case 'trailer':
      return [
        D({ name: 'Trailer master', platform: 'Archive master', resolution: '3840x2160', aspectRatio: '16:9', codec: 'ProRes 422 HQ', container: 'MOV', audio: 'Stereo + stems', loudness: '-24 LKFS', duration: '2:00' }),
        D({ name: 'Web trailer', platform: 'YouTube', resolution: '3840x2160', aspectRatio: '16:9', codec: 'H.264', container: 'MP4', audio: 'Stereo', loudness: '-14 LUFS', duration: '2:00', captions: 'SRT sidecar' }),
        D({ name: 'Teaser :30', platform: 'YouTube', resolution: '1920x1080', aspectRatio: '16:9', codec: 'H.264', container: 'MP4', loudness: '-14 LUFS', duration: '0:30' }),
        D({ name: 'Social teaser 9:16 :15', platform: 'Instagram Reels', resolution: '1080x1920', aspectRatio: '9:16', codec: 'H.264', container: 'MP4', loudness: '-14 LUFS', duration: '0:15', captions: 'Burned-in' }),
        D({ name: 'Square cut 1:1 :30', platform: 'Instagram Feed', resolution: '1080x1080', aspectRatio: '1:1', codec: 'H.264', container: 'MP4', duration: '0:30', captions: 'Burned-in' }),
        D({ name: 'Bumper :06', platform: 'YouTube', resolution: '1920x1080', aspectRatio: '16:9', codec: 'H.264', container: 'MP4', duration: '0:06' }),
        D({ name: 'Textless version', platform: 'Archive master', resolution: '3840x2160', codec: 'ProRes 422 HQ', container: 'MOV' }),
        D({ name: 'Thumbnail / poster frame', platform: 'YouTube', resolution: '1280x720', aspectRatio: '16:9', codec: 'JPG' }),
      ];
    case 'minidoc':
      return [
        D({ name: 'Mini-doc master', platform: 'YouTube', resolution: '3840x2160', aspectRatio: '16:9', codec: 'H.264', container: 'MP4', audio: 'Stereo', loudness: '-14 LUFS', captions: 'SRT sidecar' }),
        D({ name: 'Archive master', platform: 'Archive master', resolution: '3840x2160', codec: 'ProRes 422 HQ', container: 'MOV', audio: 'Stereo + stems' }),
        D({ name: 'Social cutdown 9:16 (60s)', platform: 'Instagram Reels', resolution: '1080x1920', aspectRatio: '9:16', codec: 'H.264', container: 'MP4', loudness: '-14 LUFS', duration: '1:00', captions: 'Burned-in' }),
        D({ name: 'Social cutdown 4:5', platform: 'LinkedIn', resolution: '1080x1350', aspectRatio: '4:5', codec: 'H.264', container: 'MP4', captions: 'Burned-in' }),
        D({ name: 'Trailer / teaser :30', platform: 'YouTube', resolution: '1920x1080', aspectRatio: '16:9', codec: 'H.264', container: 'MP4', duration: '0:30' }),
        D({ name: 'Captions file', platform: 'YouTube', captions: 'SRT + VTT' }),
        D({ name: 'Transcript', platform: 'Website', codec: 'DOCX / PDF' }),
      ];
    case 'documentary':
    case 'interview':
      return [
        D({ name: 'Master', platform: 'YouTube', resolution: '3840x2160', aspectRatio: '16:9', codec: 'H.264', container: 'MP4', audio: 'Stereo', loudness: '-14 LUFS' }),
        D({ name: 'Audio podcast version', platform: 'Website', codec: 'MP3 / WAV', audio: 'Stereo', loudness: '-16 LUFS' }),
        D({ name: 'Social clips (x3)', platform: 'LinkedIn', resolution: '1080x1350', aspectRatio: '4:5', codec: 'H.264', container: 'MP4', captions: 'Burned-in' }),
        D({ name: 'Captions file', platform: 'YouTube', captions: 'SRT' }),
      ];
    default:
      return [
        D({ name: 'Picture master', platform: 'Archive master', resolution: '3840x2160', aspectRatio: '2.39:1', codec: 'ProRes 4444', container: 'MOV', audio: '5.1 + Stereo' }),
        D({ name: 'Festival screener', platform: 'Festival', resolution: '1920x1080', codec: 'H.264', container: 'MP4', audio: 'Stereo' }),
        D({ name: 'DCP', platform: 'Cinema / DCP', resolution: '2048x858', codec: 'JPEG2000', audio: '5.1' }),
        D({ name: 'Stems (DME) + M&E', platform: 'Archive master', audio: 'WAV stems' }),
        D({ name: 'Subtitles', platform: 'Festival', captions: 'SRT (EN)' }),
      ];
  }
}

const B = (code: string, name: string, section: BudgetCategory['section'], lines: [string, string][] = []): BudgetCategory => ({
  id: uid('bc'),
  code,
  name,
  section,
  lines: lines.map(([description, unit]) => ({ id: uid('bl'), description, qty: 0, unit, rate: 0, x: 1 })),
});

export function templateBudget(type?: ProjectType): BudgetCategory[] {
  const cats = baseBudget();
  const add = (code: string, description: string, unit: string) => {
    const c = cats.find((x) => x.code === code);
    if (c) c.lines.push({ id: uid('bl'), description, qty: 0, unit, rate: 0, x: 1 });
  };
  if (type === 'trailer') {
    add('1000', 'Footage / clip licensing', 'flat');
    add('1300', 'Voiceover artist', 'flat');
    add('4000', 'Trailer editor', 'day');
    add('4300', 'Trailer music license', 'flat');
    add('4400', 'Title treatment & end card', 'flat');
  } else if (type === 'minidoc') {
    add('1000', 'Archival / stock footage licensing', 'flat');
    add('1300', 'Subject honorariums', 'each');
    add('4000', 'Interview transcription', 'hour');
    add('4400', 'Lower thirds & maps', 'flat');
  }
  return cats;
}

function baseBudget(): BudgetCategory[] {
  return [
    B('1000', 'Story & Rights', 'atl', [['Script / writer fee', 'flat']]),
    B('1100', 'Producers', 'atl', [['Producer', 'day']]),
    B('1200', 'Director', 'atl', [['Director', 'day']]),
    B('1300', 'Cast', 'atl', [['Principal cast', 'day'], ['Background / extras', 'day']]),
    B('2000', 'Production Staff', 'btl', [['1st AD', 'day'], ['Production assistants', 'day']]),
    B('2100', 'Camera', 'btl', [['Director of Photography', 'day'], ['1st AC', 'day'], ['Camera package rental', 'day']]),
    B('2200', 'Grip & Electric', 'btl', [['Gaffer', 'day'], ['Key Grip', 'day'], ['Lighting & grip package', 'day']]),
    B('2300', 'Sound', 'btl', [['Sound mixer (with kit)', 'day']]),
    B('2400', 'Art Department', 'btl', [['Production designer', 'day'], ['Props & set dressing', 'flat']]),
    B('2500', 'Wardrobe', 'btl', [['Wardrobe stylist', 'day'], ['Wardrobe purchases', 'flat']]),
    B('2600', 'Hair & Makeup', 'btl', [['HMU artist', 'day'], ['HMU kit fee', 'day']]),
    B('2700', 'Locations', 'btl', [['Location fees', 'day'], ['Permits', 'flat']]),
    B('2800', 'Transportation', 'btl', [['Vehicle rental', 'day'], ['Fuel & parking', 'flat']]),
    B('2900', 'Catering & Craft', 'btl', [['Meals', 'each'], ['Craft services', 'day']]),
    B('3000', 'Production Supplies', 'btl', [['Expendables', 'flat'], ['Hard drives & media', 'each']]),
    B('4000', 'Editorial', 'post', [['Editor', 'day']]),
    B('4100', 'Color', 'post', [['Colorist', 'day']]),
    B('4200', 'Sound Post', 'post', [['Sound design & mix', 'flat']]),
    B('4300', 'Music', 'post', [['Music licensing / composer', 'flat']]),
    B('4400', 'Graphics & VFX', 'post', [['Motion graphics', 'flat']]),
    B('4500', 'Deliverables', 'post', [['Captions / subtitles', 'flat']]),
    B('5000', 'Insurance', 'other', [['Production insurance', 'flat']]),
    B('5100', 'Legal & Admin', 'other', [['Contracts & clearances', 'flat']]),
    B('5200', 'Miscellaneous', 'other', [['Misc.', 'flat']]),
  ];
}

const G = (category: string, name: string, qty = 1): GearItem => ({
  id: uid('gear'),
  category,
  name,
  qty,
  source: 'owned',
  status: 'needed',
});

export function templateGear(type: ProjectType): GearItem[] {
  const base: GearItem[] = [
    G('Camera', 'Camera body (A cam)'),
    G('Lenses', 'Lens kit'),
    G('Media & Storage', 'Media cards', 4),
    G('Media & Storage', 'Backup SSDs', 2),
    G('Power', 'Camera batteries', 6),
    G('Camera Support', 'Tripod + fluid head'),
    G('Monitoring', 'On-camera monitor'),
    G('Lighting', 'LED key light + softbox'),
    G('Lighting', 'LED fill / panel', 2),
    G('Grip', 'C-stands', 4),
    G('Grip', 'Sandbags', 6),
    G('Grip', '5-in-1 reflector / bounce'),
    G('Sound', 'Shotgun mic + boom pole'),
    G('Sound', 'Wireless lav kit', 2),
    G('Sound', 'Audio recorder'),
    G('Power', 'Extension cords & power strips', 4),
    G('Expendables', 'Gaffer tape, clips, gels'),
  ];
  if (type === 'minidoc') {
    base.push(G('Camera', 'Camera body (B cam)'), G('Camera Support', 'Gimbal (B-roll)'), G('Lenses', 'ND / variable ND filters'), G('Sound', 'Timecode sync box', 2));
  }
  if (type === 'interview' || type === 'corporate' || type === 'training' || type === 'documentary') {
    base.push(G('Camera', 'Camera body (B cam)'), G('Teleprompter', 'Teleprompter (if scripted to camera)'));
  }
  if (type === 'social') base.push(G('Camera Support', 'Gimbal'));
  return base;
}

/* ---------------------------------------------------------------- story structures (A/V script) */

const R = (segment: string | undefined, video: string, audio: string, duration?: number): AVRow => ({ id: uid('av'), segment, video, audio, duration });

/** Beat structure pre-filled into the two-column A/V script. */
export function templateAvRows(type: ProjectType): AVRow[] {
  if (type === 'trailer') {
    return [
      R('HOOK', 'Striking opening image — the one shot that stops the scroll.', 'SFX: silence, then a single sound. Or a line of dialogue that poses the question.', 8),
      R('SETUP', 'Establish the world and the main character.', 'MUSIC: track starts low.\nVO / dialogue: who is this about, what do they want?', 20),
      R('INCITING MOMENT', 'The problem appears — stakes become clear.', 'Dialogue line that states what is at stake.', 15),
      R('ESCALATION', 'Rising montage — fastest cuts, best moments, bigger and bigger.', 'MUSIC: build with risers; SFX: hits on the cuts.', 30),
      R(undefined, 'SUPER: key quote / laurels / critic line', 'MUSIC: continues to build.', 5),
      R('TITLE', 'SUPER: title treatment', 'MUSIC: big hit, then silence.', 5),
      R('BUTTON', 'Final beat — a joke, twist or emotional line.', 'Dialogue button.', 6),
      R('END CARD', 'SUPER: release date / platform / call to action · credits block · logo', 'MUSIC: sting out.', 6),
    ];
  }
  if (type === 'minidoc') {
    return [
      R('COLD OPEN', 'Verité moment or striking B-roll that drops us into the story.', 'NAT SOUND, then the strongest soundbite.', 20),
      R('TITLE', 'SUPER: title', 'MUSIC: theme in.', 5),
      R('MEET THE SUBJECT', 'Interview (A-cam) intercut with B-roll of daily life.\nSUPER: lower third — name, role', 'SUBJECT: who they are, in their own words.', 45),
      R('THE CHALLENGE', 'B-roll / archival illustrating the problem.', 'SUBJECT: what is at stake and why it matters.', 60),
      R('THE JOURNEY', 'Verité sequence — the subject in action.', 'NAT SOUND + SUBJECT: what they are trying.', 90),
      R('TURNING POINT', 'The moment things change.', 'SUBJECT: the realisation / outcome.', 45),
      R('RESOLUTION', 'Where they are now — warm closing images.', 'SUBJECT: reflection, final line.\nMUSIC: swells.', 40),
      R('END CARD', 'SUPER: where are they now · call to action · credits', 'MUSIC: outro.', 10),
    ];
  }
  return [];
}

/** Graphics list pre-filled in Post-Production. */
export function templateGraphics(type: ProjectType): GraphicItem[] {
  const Gx = (kind: string, text: string, subtext?: string): GraphicItem => ({ id: uid('gfx'), kind, text, subtext, status: 'not_started' });
  if (type === 'trailer') return [Gx('Title card', 'Title treatment'), Gx('Title card', 'Quote / laurels card'), Gx('End card', 'Release date · platform · CTA'), Gx('End card', 'Credits block'), Gx('Disclaimer', 'Rating / legal card')];
  if (type === 'minidoc') return [Gx('Title card', 'Title'), Gx('Lower third', 'Subject name', 'Role / organisation'), Gx('Callout', 'Archival source credit'), Gx('End card', 'Where are they now / CTA'), Gx('End card', 'Credits')];
  return [];
}
