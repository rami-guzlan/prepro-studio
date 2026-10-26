/* The demo Marketing Space: the release campaign of the demo film "The Last
   Take" — every space screen filled in, dates relative to today so the
   calendar always looks alive. */
import type { IdeaGroup, IdeaLink, IdeaNote } from '@/types';
import { backend } from '@/backend';
import { addDays, todayISO } from '@/lib/dates';
import { uid } from '@/lib/id';
import { newBoard } from '@/lib/mind';
import { makeSheet, parseValue } from './crm';
import { sampleDesignSystem } from './designSystem/sample';
import { createSpace, makeChannel, makeChecklistItem, makeContent, makePost, makeShot } from './defaults';
import type { BrandAsset, Campaign, CrmSheet, ContentPiece, ContentPost, Goal, Persona, PostMetrics, ShootSession, SpaceData, SpaceMilestone, Tactic } from './types';

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Simple branded artwork for thumbnails (SVG). */
function thumbSvg(title: string, sub: string, color: string, vertical = false): string {
  const w = vertical ? 900 : 1600;
  const h = vertical ? 1600 : 900;
  const words = title.toUpperCase().split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const wd of words) {
    if ((cur + ' ' + wd).trim().length > (vertical ? 12 : 18)) {
      lines.push(cur.trim());
      cur = wd;
    } else cur += ' ' + wd;
  }
  if (cur.trim()) lines.push(cur.trim());
  const fs = vertical ? 110 : 120;
  const y0 = h / 2 - ((lines.length - 1) * fs * 1.05) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#16161a"/></linearGradient>
<radialGradient id="sun" cx="0.78" cy="0.28" r="0.35"><stop offset="0" stop-color="#ffd8a8" stop-opacity="0.9"/><stop offset="1" stop-color="#ffd8a8" stop-opacity="0"/></radialGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g)"/><rect width="${w}" height="${h}" fill="url(#sun)"/>
<g fill="#16161a" opacity="0.55"><rect x="0" y="${h * 0.78}" width="${w}" height="${h * 0.22}"/><rect x="${w * 0.08}" y="${h * 0.62}" width="${w * 0.07}" height="${h * 0.16}"/><rect x="${w * 0.7}" y="${h * 0.58}" width="${w * 0.09}" height="${h * 0.2}"/><rect x="${w * 0.4}" y="${h * 0.66}" width="${w * 0.05}" height="${h * 0.12}"/></g>
${lines.map((l, i) => `<text x="${w / 2}" y="${y0 + i * fs * 1.05}" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="${fs}" fill="#fff" text-anchor="middle" dominant-baseline="middle">${esc(l)}</text>`).join('')}
<text x="${w / 2}" y="${h * 0.9}" font-family="Arial, sans-serif" font-size="${vertical ? 44 : 46}" letter-spacing="6" fill="#ffe8cc" text-anchor="middle">${esc(sub.toUpperCase())}</text>
</svg>`;
}

const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 240" width="600" height="240"><rect width="600" height="240" rx="24" fill="#16161a"/><circle cx="120" cy="120" r="62" fill="#e8590c"/><rect x="58" y="128" width="124" height="54" fill="#16161a"/><text x="210" y="112" font-family="Arial Black, Arial" font-weight="900" font-size="56" fill="#fff">THE LAST</text><text x="210" y="172" font-family="Arial Black, Arial" font-weight="900" font-size="56" fill="#e8590c">TAKE</text></svg>`;

/** A one-page PDF (title band + paragraphs, '# ' lines are headings) for the demo resources. */
async function simplePdf(title: string, lines: string[]): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  doc.setTitle(`The Last Take — ${title}`);
  const page = doc.addPage([612, 792]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawRectangle({ x: 0, y: 700, width: 612, height: 92, color: rgb(0.91, 0.35, 0.05) });
  page.drawText('THE LAST TAKE', { x: 48, y: 760, size: 10, font: bold, color: rgb(1, 0.91, 0.8) });
  page.drawText(title, { x: 48, y: 728, size: 24, font: bold, color: rgb(1, 1, 1) });
  let y = 660;
  for (const raw of lines) {
    if (raw.startsWith('# ')) {
      y -= 6;
      page.drawText(raw.slice(2), { x: 48, y, size: 13, font: bold, color: rgb(0.09, 0.09, 0.1) });
      y -= 20;
      continue;
    }
    const words = raw.split(' ');
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, 11) > 516) {
        page.drawText(line, { x: 48, y, size: 11, font, color: rgb(0.2, 0.2, 0.24) });
        y -= 15;
        line = w;
      } else line = next;
    }
    if (line) page.drawText(line, { x: 48, y, size: 11, font, color: rgb(0.2, 0.2, 0.24) });
    y -= 21;
  }
  return doc.save();
}

const PLAYBOOK_MD = `# Trailer drop-day playbook

Goal: the trailer reaches 50k views across channels in launch week.

## The day (all times local)
- 08:00  Final export check: 16:9 master, 9:16 cut-down, 1:1 for X
- 12:00  Teaser countdown story on Instagram ("6 hours")
- 17:30  Newsletter goes out with the private link (subscribers see it first)
- 18:00  Premiere on YouTube + Instagram Reel + TikTok + X, all at golden hour
- 18:15  Cast and crew share; pin the comment with the festival date
- 21:00  Reply to every comment; save the best for the "reactions" carousel

## Owners
- Upload and captions: Sofia
- Cut-downs: Chloe
- Replies and community: everyone, 30 minutes each

## After 48 hours
- Post the reactions carousel
- Log results in PrePro (Results → Log results)
`;

const SEQUENCE_MD = `# Release-week email sequence map

Audience: newsletter subscribers + festival sign-ups.

| Day | Email | Goal | CTA |
| --- | --- | --- | --- |
| -7 | "One week of light left" | Remind and build anticipation | Add the release to your calendar |
| -3 | Behind the take: the stairs scene | Story + BTS clip | Watch the 60 s clip |
| 0 | It's out: watch The Last Take | Views on release day | Watch the full film |
| +2 | Thank you + director's note | Gratitude, shares | Share with one friend |
| +7 | What's next | Keep the list warm | Reply with your favourite moment |

Branch: anyone who did not open day 0 gets a resend with a new subject line on day +1.
`;

const m = (views: number, likes: number, comments: number, shares: number, saves: number, extra: Partial<PostMetrics> = {}): PostMetrics => ({ views, likes, comments, shares, saves, ...extra });

export async function createSampleSpace(): Promise<SpaceData> {
  const t = todayISO();
  const d = (n: number) => addDays(t, n);
  const projects = await backend.listProjects().catch(() => []);
  const demoProject = projects.find((p) => p.demo);
  const s = createSpace({ title: 'The Last Take — Release Campaign', type: 'campaign', withTemplate: false, color: '#e8590c', emoji: '🎬', projectIds: demoProject ? [demoProject.id] : [] });
  s.meta.description = 'Get The Last Take seen: build curiosity, launch the trailer, fill the festival premiere and drive views on release day.';
  s.meta.owner = 'Golden Hour Pictures';
  s.meta.startDate = d(-21);
  s.meta.endDate = d(52);
  s.meta.demo = true;
  s.meta.tags = ['short film', 'release', 'festival'];
  await backend.createSpace(s);
  const img = async (svg: string) => backend.importAsset(s.id, new TextEncoder().encode(svg), 'svg');

  /* ---------------- strategy */
  s.strategy = {
    positioning: 'A one-take short about a film crew racing the last twelve minutes of daylight. Made by a tiny crew with a lot of heart — the campaign shows that energy.',
    valueProp: 'Twelve minutes of real-time tension and a love letter to people who make films. Short enough to watch on a lunch break, made to watch on a big screen.',
    tagline: 'Twelve minutes of light. One take.',
    voice: 'Warm, a little breathless, behind-the-scenes honest. We talk like the crew talks on set. No hype words ("epic", "must-see"); show, don\'t shout. Golden-hour orange is our colour.',
    keyMessages: '1. It all happens in one take, in real time.\n2. A small crew made something big — the story behind it is half the fun.\n3. Premiere at the festival, then free online on release day.\n4. Sign up to get the link first.',
    competitors: 'Watch how A24 shorts and festival darlings tease with mood, not plot. Creators to learn from: film-school channels that show the craft (lighting breakdowns, storyboard vs. final).',
    notes: 'Budget is tiny: everything organic, with one small boosted post for the trailer. Chloe edits the cut-downs.',
  };
  const personas: Persona[] = [
    { id: uid('per'), name: 'Indie film lovers', summary: '25–40, go to festivals, follow A24 and Letterboxd', pains: 'Trailers that spoil everything; too much content, too little craft', desires: 'Discover something special before everyone else', whereTheyAre: 'Instagram, Letterboxd, YouTube, newsletters', objections: 'Why watch a short?' },
    { id: uid('per'), name: 'Filmmakers & students', summary: '18–30, making their own shorts', pains: 'Want to learn how others pulled it off on a budget', desires: 'Behind-the-scenes, breakdowns, gear lists', whereTheyAre: 'YouTube, TikTok, Reddit' },
    { id: uid('per'), name: 'Friends & family of the crew', summary: 'Our first amplifiers', desires: 'Celebrate the people they know', whereTheyAre: 'Instagram, WhatsApp, Facebook' },
  ];
  s.personas = personas;
  const pillars = [
    { id: uid('pil'), name: 'Story & characters', description: 'Hook people on June, Maya and Leo and the race against the light', color: '#e8590c', targetShare: 35 },
    { id: uid('pil'), name: 'Behind the scenes', description: 'How a tiny crew pulled off one take', color: '#7c5cff', targetShare: 25 },
    { id: uid('pil'), name: 'Cast & crew', description: 'Faces and voices of the team', color: '#2fb36d', targetShare: 20 },
    { id: uid('pil'), name: 'Announcements & countdown', description: 'Dates, screenings, links', color: '#3e8ef7', targetShare: 20 },
  ];
  s.pillars = pillars;
  const [pStory, pBts, pCast, pNews] = pillars.map((p) => p.id);

  /* ---------------- channels */
  const ig = makeChannel('instagram', { name: 'Instagram', handle: '@thelasttakefilm', url: 'https://instagram.com/', cadence: 4, cadenceUnit: 'week', followers: 1840, bestTimes: 'Tue / Thu / Sun 18:00' });
  const tt = makeChannel('tiktok', { name: 'TikTok', handle: '@thelasttakefilm', url: 'https://tiktok.com/', cadence: 3, cadenceUnit: 'week', followers: 960, bestTimes: 'Weekdays 19:00' });
  const yt = makeChannel('youtube', { name: 'YouTube', handle: 'Golden Hour Pictures', url: 'https://youtube.com/', cadence: 1, cadenceUnit: 'week', followers: 410 });
  const x = makeChannel('x', { name: 'X', handle: '@goldenhourpix', cadence: 5, cadenceUnit: 'week', followers: 620 });
  const nl = makeChannel('newsletter', { name: 'Newsletter', handle: 'The Last Take — updates', cadence: 2, cadenceUnit: 'month', followers: 312 });
  const press = makeChannel('press', { name: 'Press & festivals', notes: 'Press kit + screener links for festivals and blogs' });
  s.channels = [ig, tt, yt, x, nl, press];

  /* ---------------- campaigns & milestones */
  const camp = (name: string, objective: string, a: number, b: number, color: string, status: Campaign['status'], cta: string): Campaign => ({
    id: uid('camp'),
    name,
    objective,
    start: d(a),
    end: d(b),
    status,
    color,
    cta,
    projectId: demoProject?.id,
    channelIds: [ig.id, tt.id, x.id],
  });
  const cTease = camp('Tease', 'Create curiosity before anything is revealed', -21, -8, '#868e96', 'complete', 'Follow for the trailer');
  const cTrailer = camp('Trailer launch', 'Maximum reach for the trailer', -7, 6, '#e8590c', 'active', 'Watch the trailer');
  const cPremiere = camp('Festival premiere', 'Fill seats at the premiere and get press', 7, 30, '#7c5cff', 'planning', 'Get premiere tickets');
  const cRelease = camp('Release', 'Drive views of the full film online', 31, 52, '#2fb36d', 'planning', 'Watch the full film');
  cTrailer.budget = 150;
  s.campaigns = [cTease, cTrailer, cPremiere, cRelease];
  const ms = (name: string, n: number, c: Campaign, done = false): SpaceMilestone => ({ id: uid('sms'), name, date: d(n), campaignId: c.id, done: done || undefined });
  s.milestones = [
    ms('Poster reveal', -18, cTease, true),
    ms('Teaser drop', -12, cTease, true),
    ms('Trailer drop', -3, cTrailer, true),
    ms('Press kit sent to 30 blogs', 5, cTrailer),
    ms('Festival premiere', 14, cPremiere),
    ms('Release day', 31, cRelease),
  ];

  /* ---------------- goals & tactics */
  const goals: Goal[] = [
    { id: uid('goal'), title: 'Trailer views', metric: 'Trailer views (all platforms)', unit: 'views', baseline: 0, current: 18400, target: 50000, due: d(30), status: 'on_track', campaignId: cTrailer.id },
    { id: uid('goal'), title: 'Festival selections', metric: 'Official selections', unit: 'festivals', baseline: 0, current: 2, target: 5, due: d(45), status: 'on_track' },
    { id: uid('goal'), title: 'Release-day sign-ups', metric: 'Newsletter subscribers', unit: 'subscribers', baseline: 120, current: 312, target: 1000, due: d(31), status: 'at_risk', campaignId: cRelease.id },
    { id: uid('goal'), title: 'Grow Instagram', metric: 'Instagram followers', unit: 'followers', baseline: 1200, current: 1840, target: 5000, due: d(52), status: 'at_risk' },
  ];
  s.goals = goals;
  const tactic = (title: string, status: Tactic['status'], channelIds: string[], c?: Campaign, extra: Partial<Tactic> = {}): Tactic => ({ id: uid('tac'), title, status, channelIds, campaignId: c?.id, ...extra });
  s.tactics = [
    tactic('Countdown stories 7 days before every drop', 'active', [ig.id, tt.id], cTrailer, { owner: 'Sam' }),
    tactic('Reply to every comment in the first hour', 'active', [ig.id, tt.id, yt.id], undefined, { owner: 'Everyone' }),
    tactic('Cast takeovers on Instagram stories', 'planned', [ig.id], cPremiere, { owner: 'Sofia', start: d(8), end: d(13) }),
    tactic('Press kit outreach to 30 film blogs', 'active', [press.id], cTrailer, { owner: 'Marcus', budget: 0 }),
    tactic('Boost the trailer to indie film audiences', 'done', [ig.id], cTrailer, { budget: 150, start: d(-3), end: d(4) }),
    tactic('Premiere ticket reminders by newsletter', 'planned', [nl.id], cPremiere),
  ];

  /* ---------------- content */
  const post = (ch: { id: string }, n: number, time: string, status: ContentPost['status'], extra: Partial<ContentPost> = {}): ContentPost => makePost(ch.id, { date: d(n), time, status, ...extra });
  const done = (c: ContentPiece) => {
    for (const k of c.checklist) k.done = true;
    return c;
  };

  const poster = done(
    makeContent({
      title: 'Poster reveal',
      format: 'image',
      stage: 'published',
      pillarId: pNews,
      campaignId: cTease.id,
      projectId: demoProject?.id,
      concept: 'June on the ledge against the sun — the one image that says everything.',
      hook: 'Twelve minutes of light. One take.',
      cta: 'Follow for the teaser',
      thumbnail: await img(thumbSvg('The Last Take', 'Official poster', '#e8590c', true)),
      posts: [
        post(ig, -18, '18:00', 'published', { caption: 'Twelve minutes of light. One take. 🌇\nOur short film THE LAST TAKE is coming. Teaser next week.', hashtags: '#shortfilm #indiefilm #oneshot', metrics: m(9200, 812, 64, 41, 120, { followersGained: 140 }), metricsAt: d(-10) }),
        post(x, -18, '18:05', 'published', { caption: 'Twelve minutes of light. One take. Poster for our short THE LAST TAKE.', metrics: m(4100, 233, 18, 37, 12) }),
      ],
    }),
  );
  const teaser = done(
    makeContent({
      title: 'Teaser (15 s)',
      format: 'teaser',
      stage: 'published',
      pillarId: pStory,
      campaignId: cTease.id,
      projectId: demoProject?.id,
      concept: 'Only sound and the sun: the walkie crackles, "Where\'s June?", cut to black.',
      hook: '"We\'ve got twelve minutes of usable light."',
      length: '0:15',
      aspect: '9:16',
      script: 'HOOK (0–3 s)\nSun touching the water towers. Walkie crackle.\n\nSETUP\nMAYA (V.O.): We\'ve got twelve minutes of usable light. Where\'s June?\n\nPAYOFF\nJune\'s feet racing up the stairs. Hard cut to black.\n\nCARD\nTHE LAST TAKE — trailer Friday',
      thumbnail: await img(thumbSvg('Where is June?', 'Teaser', '#c2410c', true)),
      posts: [
        post(ig, -12, '19:00', 'published', { caption: 'Where\'s June? 👀 Trailer Friday.', metrics: m(14800, 1120, 96, 210, 188, { followersGained: 210 }) }),
        post(tt, -12, '19:30', 'published', { caption: 'POV: you have 12 minutes of daylight left #filmmaking #shortfilm', metrics: m(22100, 1890, 140, 260, 300, { followersGained: 380 }) }),
        post(yt, -12, '18:00', 'published', { title: 'THE LAST TAKE — teaser', metrics: m(1900, 120, 14, 9, 0) }),
      ],
    }),
  );
  const trailer = done(
    makeContent({
      title: 'Official trailer',
      format: 'trailer',
      stage: 'published',
      priority: 'high',
      pillarId: pStory,
      campaignId: cTrailer.id,
      projectId: demoProject?.id,
      goalIds: [goals[0].id],
      concept: 'The whole race against the light in 90 seconds — without showing the final take.',
      hook: 'Sun on the water towers + "We\'ve got twelve minutes of usable light."',
      cta: 'Premiere at the festival — link in bio',
      length: '1:30',
      aspect: '16:9',
      script: 'HOOK\nThe sun hanging over the skyline. MAYA: "We\'ve got twelve minutes of usable light."\n\nWORLD\nA tiny crew on a rooftop. Gear going up nine floors by hand.\n\nCONFLICT\nJune is stuck in the stairwell. The elevator is dead.\n\nESCALATION\nCuts get faster. The light drops. Leo checks the meter. Sam sprints.\n\nTITLE\nTHE LAST TAKE\n\nBUTTON\nJUNE (breathless): "Nine floors. Nobody mentioned nine floors."\n\nCARD\nFestival premiere — dates soon',
      thumbnail: await img(thumbSvg('Official trailer', 'The Last Take', '#e8590c')),
      posts: [
        post(yt, -3, '17:00', 'published', { title: 'THE LAST TAKE — Official Trailer (2026)', caption: 'A film crew. A rooftop. Twelve minutes of light. One take.', metrics: m(18400, 1310, 188, 240, 0, { ctr: 7.4, watchHours: 290, avgViewSec: 57, followersGained: 160 }) }),
        post(ig, -3, '18:00', 'published', { caption: 'The trailer is here. 🌇 Twelve minutes of light. One take. Full trailer on YouTube — link in bio.', metrics: m(12600, 1480, 132, 310, 260, { followersGained: 190 }) }),
        post(x, -3, '18:10', 'published', { caption: 'The trailer for THE LAST TAKE is out. One take, twelve minutes of light. ▶️', metrics: m(5200, 410, 37, 96, 21, { clicks: 640 }) }),
        post(tt, -2, '19:00', 'published', { caption: 'We had 12 minutes of light to shoot this. Trailer 🔗 in bio', metrics: m(26300, 2310, 201, 412, 389, { followersGained: 520 }) }),
      ],
    }),
  );
  const castJune = makeContent({
    title: 'Meet the cast: June',
    format: 'carousel',
    stage: 'ready',
    pillarId: pCast,
    campaignId: cTrailer.id,
    concept: 'Sofia Marín as June: 5 slides — portrait, quote, a BTS moment, her favourite line, premiere date.',
    copy: 'Slide 1: Meet June.\n---\nSlide 2: "Nine floors. Nobody mentioned nine floors."\n---\nSlide 3: Sofia ran the stairs 14 times in one evening.\n---\nSlide 4: Her favourite moment: the freeze frame.\n---\nSlide 5: Festival premiere — link in bio.',
    thumbnail: await img(thumbSvg('Meet June', 'Sofia Marín', '#2fb36d', true)),
    posts: [post(ig, 1, '18:00', 'scheduled', { caption: 'Meet June. 🧥 Sofia Marín ran nine floors fourteen times for this role. Swipe →', hashtags: '#castreveal #shortfilm' })],
  });
  castJune.checklist.forEach((k, i) => (k.done = i < 5));
  const castMaya = makeContent({
    title: 'Meet the cast: Maya & Leo',
    format: 'carousel',
    stage: 'editing',
    pillarId: pCast,
    campaignId: cTrailer.id,
    concept: 'Director and DP — the two voices on the walkie.',
    posts: [post(ig, 4, '18:00', 'draft'), post(x, 4, '18:30', 'draft')],
  });
  const reel = makeContent({
    title: '"12 minutes of light" — BTS reel',
    format: 'short_video',
    stage: 'editing',
    priority: 'high',
    pillarId: pBts,
    campaignId: cTrailer.id,
    projectId: demoProject?.id,
    concept: 'Timer on screen counting down from 12:00 over real BTS of the rooftop shoot.',
    hook: 'On-screen timer 12:00 + "This is how long we had."',
    cta: 'Trailer in bio',
    length: '0:45',
    aspect: '9:16',
    script: 'HOOK (0–3 s)\nTimer 12:00 starts. "This is how long we had to shoot the ending."\n\nBODY\nGear up the stairs → June running → Leo with the light meter → monitor shot.\n\nPAYOFF\nTimer hits 0:00 on "Cut!" — the crew cheers.\n\nCTA\n"Trailer in bio."',
    shots: [makeShot({ description: 'Timer overlay plate (screen)', kind: 'graphic', done: true }), makeShot({ description: 'Gear going up the stairwell', kind: 'b_roll', done: true }), makeShot({ description: 'Crew cheering at wrap', kind: 'b_roll', done: true })],
    thumbnail: await img(thumbSvg('12:00', 'Behind the scenes', '#7c5cff', true)),
    posts: [post(tt, 2, '19:00', 'scheduled', { caption: 'We had 12 minutes. ⏱️ #bts #filmmaking' }), post(ig, 2, '19:30', 'scheduled', { caption: 'This is how long we had to shoot the ending. ⏱️' })],
  });
  reel.checklist.forEach((k, i) => (k.done = i < 3));
  const thread = makeContent({
    title: 'Director’s note: why one take?',
    format: 'text',
    stage: 'writing',
    pillarId: pStory,
    campaignId: cTrailer.id,
    concept: 'Elena explains the one-take choice in 6 posts.',
    copy: '1/ We shot the ending of THE LAST TAKE in one take. Here\'s why.\n\n2/ The film is about running out of time. Cutting would have cheated the clock.\n\n3/ …',
    posts: [post(x, 5, '12:00', 'draft'), post(ig, 5, '12:30', 'draft', { caption: '' })],
  });
  const making = makeContent({
    title: 'Making the rooftop: a one-take breakdown',
    format: 'long_video',
    stage: 'planning',
    pillarId: pBts,
    campaignId: cPremiere.id,
    projectId: demoProject?.id,
    concept: '8-minute breakdown: storyboard vs. final, lighting plan, how we rehearsed the walk.',
    hook: 'Split screen: storyboard frame vs. final frame.',
    length: '8:00',
    script: 'COLD OPEN\nThe last 10 seconds of the take, then rewind.\n\nINTRO\nElena & Leo on the rooftop: "Let\'s show you how we did it."\n\nSECTION 1 — the plan\nStoryboard, the 12-minute window, the walk.\n\nSECTION 2 — the light\nLeo\'s lighting diagram: sun as key, bounce from the water tower.\n\nSECTION 3 — the run\nWhat went wrong in takes 1–4.\n\nOUTRO & CTA\nPremiere dates + subscribe.',
    shots: [
      makeShot({ description: 'Elena & Leo intro on the rooftop', kind: 'a_roll', framing: 'Two-shot MS', location: 'Rooftop' }),
      makeShot({ description: 'Storyboard pages on the table', kind: 'insert', framing: 'Top-down' }),
      makeShot({ description: 'Leo walks the lighting plan', kind: 'a_roll', framing: 'MCU' }),
      makeShot({ description: 'Water tower bounce, wide', kind: 'b_roll', framing: 'Wide', location: 'Rooftop' }),
      makeShot({ description: 'Screen capture of the edit timeline', kind: 'screen' }),
    ],
    location: 'Hollis Building rooftop',
    talent: 'Elena (director), Leo (DP)',
    gear: 'FX3 + 24mm, lav x2, small LED for faces',
    posts: [post(yt, 12, '17:00', 'draft', { title: 'How we shot a one-take ending in 12 minutes of light' })],
  });
  const premiereAnn = makeContent({
    title: 'Festival premiere announcement',
    format: 'image',
    stage: 'ready',
    pillarId: pNews,
    campaignId: cPremiere.id,
    concept: 'Laurel + date + venue on the poster artwork.',
    thumbnail: await img(thumbSvg('World premiere', 'Official selection', '#3e8ef7', true)),
    posts: [post(ig, 10, '12:00', 'scheduled', { caption: 'Official selection 🎉 THE LAST TAKE premieres in two weeks. Tickets in bio.' }), post(x, 10, '12:05', 'scheduled'), post(nl, 10, '08:00', 'draft', { title: 'We\'re premiering!' })],
  });
  const newsletter = makeContent({
    title: 'Newsletter #3: premiere tickets',
    format: 'newsletter',
    stage: 'writing',
    pillarId: pNews,
    campaignId: cPremiere.id,
    goalIds: [goals[2].id],
    copy: 'Subject: Twelve minutes of light — come see it big\n\nHi friends,\n\nThe Last Take premieres at the festival in two weeks…',
    posts: [post(nl, 9, '08:00', 'draft', { title: 'Twelve minutes of light — come see it big' })],
  });
  const countdown = makeContent({ title: 'Premiere countdown stories', format: 'story', stage: 'idea', pillarId: pNews, campaignId: cPremiere.id, concept: '3-2-1 stories with the sun lower in each frame.', posts: [post(ig, 11, '20:00', 'draft'), post(ig, 12, '20:00', 'draft'), post(ig, 13, '20:00', 'draft')] });
  const qa = makeContent({ title: 'Cast Q&A clips', format: 'short_video', stage: 'idea', pillarId: pCast, campaignId: cPremiere.id, concept: 'Ask the cast the 5 most asked questions from the comments.' });
  const score = makeContent({ title: 'Behind the score: the ticking clock', format: 'short_video', stage: 'idea', pillarId: pBts, concept: 'The composer explains the ticking motif.' });
  const vertical = makeContent({ title: 'Release-day trailer cut-down (vertical)', format: 'short_video', stage: 'idea', pillarId: pStory, campaignId: cRelease.id, sourceId: trailer.id, projectId: demoProject?.id, aspect: '9:16', length: '0:30', concept: '30-second vertical version of the trailer ending on "Watch now".' });
  const pressKit = makeContent({ title: 'Press kit & screener page', format: 'article', stage: 'ready', pillarId: pNews, campaignId: cTrailer.id, concept: 'Synopsis, stills, director statement, credits, screener link.', posts: [post(press, 5, '09:00', 'scheduled', { title: 'THE LAST TAKE — press kit' })] });

  s.content = [poster, teaser, trailer, castJune, castMaya, reel, thread, making, premiereAnn, newsletter, countdown, qa, score, vertical, pressKit];

  /* ---------------- shoots */
  const shootBts: ShootSession = {
    id: uid('shoot'),
    title: 'BTS & interviews on the roof',
    date: d(6),
    callTime: '15:00',
    wrapTime: '19:30',
    location: 'Hollis Building rooftop',
    contentIds: [making.id, qa.id, score.id],
    people: 'Elena, Leo, Sofia, Daniel, Ivan (camera)',
    gear: 'FX3 + 24mm & 50mm, 2 lavs, Zoom F3, small LED, reflector',
    checklist: [makeChecklistItem('Roof access confirmed with Dana'), makeChecklistItem('Questions list for the cast Q&A'), makeChecklistItem('Batteries charged')],
    notes: 'Golden hour 18:10–18:40: save it for the breakdown intro.',
  };
  const shootPortraits: ShootSession = { id: uid('shoot'), title: 'Cast portraits', date: d(-10), callTime: '10:00', wrapTime: '13:00', location: 'Studio 9', contentIds: [castJune.id, castMaya.id], checklist: [], notes: 'Poster-style portraits, cream backdrop.' };
  s.shoots = [shootBts, shootPortraits];
  for (const c of [making, qa, score]) {
    c.shootId = shootBts.id;
    c.shootDate = shootBts.date;
  }
  for (const c of [castJune, castMaya]) {
    c.shootId = shootPortraits.id;
    c.shootDate = shootPortraits.date;
  }

  /* ---------------- brand kit */
  const asset = (name: string, kind: BrandAsset['kind'], extra: Partial<BrandAsset> = {}): BrandAsset => ({ id: uid('ast'), name, kind, ...extra });
  const logo = await img(LOGO);
  s.meta.logo = logo;
  s.meta.cover = poster.thumbnail;
  s.assets = [
    asset('Primary logo', 'logo', { image: logo }),
    asset('Magic hour', 'color', { value: '#e8590c', notes: 'Main accent' }),
    asset('Night', 'color', { value: '#16161a', notes: 'Backgrounds' }),
    asset('Coat cream', 'color', { value: '#f5e6c8', notes: 'Type on dark' }),
    asset('Bebas Neue', 'font', { value: 'Bebas Neue', notes: 'Titles, all caps' }),
    asset('Inter', 'font', { value: 'Inter', notes: 'Body text and captions' }),
    asset('Poster artwork', 'image', { image: poster.thumbnail, tags: ['poster'] }),
    asset('Countdown story template', 'template', { url: 'https://www.canva.com/', tags: ['stories'] }),
    asset('Press kit folder', 'link', { url: 'https://drive.google.com/', tags: ['press'], campaignId: cPremiere.id }),
    asset('Score stems (ticking clock)', 'audio', { notes: 'Ask Daniel for the 30 s loop' }),
  ];

  /* ---------------- campaign resources (downloadable files stored in the space) */
  const enc = (t: string) => new TextEncoder().encode(t);
  const file = async (fileName: string, bytes: Uint8Array) => ({ file: await backend.importAsset(s.id, bytes, fileName.split('.').pop() || 'bin'), fileName, fileSize: bytes.length });
  const onePager = await file('The Last Take - press one-pager.pdf', await simplePdf('Press one-pager', [
    '# Logline',
    'A one-take short about a film crew racing the last twelve minutes of daylight.',
    '# Details',
    'Short film, 12 minutes, 2.39:1, stereo. Written and directed by Elena Ward. Produced by Golden Hour Pictures.',
    '# Screenings',
    'Festival premiere, then online release. Screener on request.',
    '# Contact',
    'press@example.com',
  ]));
  const guide = await file('Behind the light - lighting guide.pdf', await simplePdf('Behind the light', [
    '# How we lit a film with twelve minutes of sun',
    'Free guide for newsletter subscribers: the three setups we used on the rooftop, the stairwell and the final shot.',
    '# 1. Water-tower bounce',
    'A 4x4 bounce on the roof edge kept faces readable as the sun dropped behind the towers.',
    '# 2. Stairwell practicals',
    'Warm practical bulbs on every landing, dimmed to match the sky through the windows.',
    '# 3. The last shot',
    'No lights at all: the actors faced the sun and we waited for it.',
  ]));
  const playbook = await file('Trailer drop-day playbook.md', enc(PLAYBOOK_MD));
  const sequence = await file('Release-week email sequence map.md', enc(SEQUENCE_MD));
  s.assets.push(
    asset('Behind the light (lighting guide)', 'resource', { ...guide, resourceType: 'guide', gated: true, campaignId: cTease.id, url: 'https://example.com/lighting-guide', notes: 'Free PDF for newsletter sign-ups; the link in bio goes to the opt-in page' }),
    asset('Trailer drop-day playbook', 'resource', { ...playbook, resourceType: 'playbook', campaignId: cTrailer.id, notes: 'Hour-by-hour plan for launch day' }),
    asset('Press one-pager', 'resource', { ...onePager, resourceType: 'one_pager', campaignId: cPremiere.id, notes: 'Attach to every festival and press pitch' }),
    asset('Festival submission tracker', 'resource', { resourceType: 'template', campaignId: cPremiere.id, url: 'https://docs.google.com/spreadsheets/', notes: 'Shared sheet: deadlines, fees, status' }),
    asset('Release-week email sequence map', 'resource', { ...sequence, resourceType: 'sequence_map', campaignId: cRelease.id, notes: '5 emails from day -7 to day +7' }),
  );

  /* ---------------- design system (Brand Kit & Assets → Design system) */
  {
    const { designSystem, assets } = await sampleDesignSystem({
      assets: s.assets,
      campaigns: { trailer: cTrailer, premiere: cPremiere },
      images: { poster: poster.thumbnail, trailer: trailer.thumbnail, portrait: castJune.thumbnail },
      storeSvg: img,
    });
    s.assets.splice(s.assets.findIndex((x) => x.kind === 'font'), 0, ...assets.filter((x) => x.kind === 'color'));
    s.assets.splice(s.assets.findIndex((x) => x.kind === 'template'), 0, ...assets.filter((x) => x.kind !== 'color'));
    s.designSystem = designSystem;
  }

  /* ---------------- people & brands */
  const sheet = (template: string, name: string, rows: Record<string, unknown>[]): CrmSheet => {
    const sh = makeSheet(template, { name });
    for (const r of rows) {
      const values: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) {
        const col = sh.columns.find((c) => c.name === k);
        if (col) values[col.id] = parseValue(col, v, { campaigns: s.campaigns, createOptions: true });
      }
      sh.rows.push({ id: uid('row'), values, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    return sh;
  };
  s.crm = [
    sheet('press', 'Press & festivals', [
      { Outlet: 'Short Film Weekly', Contact: 'Editor', 'Beat / topic': 'Shorts, indie', Status: 'Covered', 'Pitched on': d(-12), Coverage: 'https://example.com/short-film-weekly', Notes: 'Ran the poster + a 3-line review' },
      { Outlet: 'Indie Lens Podcast', Contact: 'Host', 'Beat / topic': 'Filmmaking craft', Status: 'Replied', 'Pitched on': d(-5), Notes: 'Wants Elena for an episode after the premiere' },
      { Outlet: 'City Arts Desk', Contact: 'Film writer', 'Beat / topic': 'Local culture', Status: 'Pitched', 'Pitched on': d(-2) },
      { Outlet: 'Golden Hour Film Festival', Contact: 'Programming team', 'Beat / topic': 'Premiere', Status: 'To pitch', Notes: 'Send the press one-pager + screener link' },
    ]),
    sheet('brand_deals', 'Partners & sponsors', [
      { Brand: 'Rooftop Coffee Co.', Contact: 'Marketing lead', Stage: 'Contracted', Deliverables: '2 stories + logo on the premiere poster', Fee: 500, Due: d(9), Campaign: 'Festival premiere' },
      { Brand: 'LensRent', Contact: 'Partnerships', Stage: 'Negotiating', Deliverables: 'Gear discount code in the BTS reel caption', Fee: 300, Due: d(14), Campaign: 'Trailer launch' },
      { Brand: 'Indie Cinema Club', Contact: 'Community manager', Stage: 'Paid', Deliverables: 'Members-only early screening', Fee: 250, Paid: true, Campaign: 'Release' },
    ]),
  ];

  /* ---------------- ideas board */
  const note = (text: string, x0: number, y0: number, color: string, used = false): IdeaNote => ({ id: uid('idea'), text, x: x0, y: y0, w: 200, h: 130, color, used: used || undefined });
  const n1 = note('One take. No second chances.', 60, 110, '#fff3a3', true);
  const n2 = note('What would you do with 12 minutes of light?', 284, 110, '#fff3a3');
  const n3 = note('Timer on screen counting down over BTS', 508, 110, '#fff3a3', true);
  const n4 = note('Cast reacting to the trailer', 60, 420, '#b5d8ff');
  const n5 = note('Split screen: storyboard vs final', 284, 420, '#b5d8ff', true);
  const n6 = note('Ask followers: what\'s your "last take" story?', 508, 420, '#b5d8ff');
  const n7 = note('Sunset photo challenge with #lasttake', 790, 250, '#ffd6a5');
  const groups: IdeaGroup[] = [
    { id: uid('grp'), title: 'Hooks', x: 32, y: 56, w: 704, h: 210, color: '#e8590c' },
    { id: uid('grp'), title: 'Formats to try', x: 32, y: 366, w: 704, h: 210, color: '#3e8ef7' },
  ];
  const links: IdeaLink[] = [{ id: uid('link'), from: n3.id, to: n5.id }];
  const hooks = newBoard('Release campaign', {
    color: '#e64980',
    text: '- the countdown is our whole campaign: everything counts down\n- every drop at golden hour (18:00)\n- Chloe cuts the verticals\n- what if the release is at sunset in every time zone?',
    notes: [n1, n2, n3, n4, n5, n6, n7],
    groups,
    links,
  });
  const t1 = note('Trailer breakdown: why the stairs scene works', 60, 80, '#cdb4ff');
  const t2 = note('Re-cut the trailer in 3 genres (horror, rom-com, heist)', 284, 80, '#cdb4ff');
  const t3 = note('Fans vote on the next trailer to break down', 508, 80, '#b5d8ff');
  const trailers = newBoard('Trailer breakdowns', {
    color: '#3e8ef7',
    text: '- one trailer breakdown a week on the second channel\n- Chloe edits, I write the voice-over',
    notes: [t1, t2, t3],
    links: [{ id: uid('link'), from: t1.id, to: t2.id }],
  });
  const later = newBoard('Someday / maybe', {
    color: '#868e96',
    notes: [note('Festival Q&A live stream', 60, 80, '#e9ecef'), note('Director’s commentary track', 284, 80, '#e9ecef')],
  });
  s.mind = { boards: [hooks, trailers, later] };
  s.notes = 'Weekly sync with Chloe on Mondays: check the calendar, swap anything that is not ready.';
  await backend.saveSpace(s);
  return s;
}
