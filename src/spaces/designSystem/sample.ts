/* The design system of the demo Marketing Space ("The Last Take" release
   campaign): golden-hour orange on night black, Bebas Neue + Inter, countdown
   motifs. Used by src/spaces/sample.ts (demo space and the self-test). */
import type { BrandAsset, Campaign } from '@/spaces/types';
import { uid } from '@/lib/id';
import { DEFAULT_REVIEW_CRITERIA, type DesignSystem, type DSRule } from './types';

const NEAR_MISS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" width="1200" height="900">
<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb347"/><stop offset="0.55" stop-color="#ff7e5f"/><stop offset="1" stop-color="#feb47b"/></linearGradient></defs>
<rect width="1200" height="900" fill="url(#s)"/><circle cx="600" cy="520" r="170" fill="#fff3d6" opacity="0.85"/>
<rect y="640" width="1200" height="260" fill="#f6a96b"/><path d="M0 700 Q300 640 600 700 T1200 700 V900 H0Z" fill="#e88a4f"/>
<text x="600" y="210" font-family="Brush Script MT, cursive" font-size="120" fill="#ffffff" text-anchor="middle">Chase the Light</text>
<text x="600" y="300" font-family="Georgia, serif" font-style="italic" font-size="40" fill="#ffffff" text-anchor="middle">a beautiful journey ✨</text></svg>`;

const OFF_BRAND = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" width="1200" height="900">
<defs><linearGradient id="n" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b0b3a"/><stop offset="1" stop-color="#05283f"/></linearGradient></defs>
<rect width="1200" height="900" fill="url(#n)"/>
<g stroke="#00e5ff" stroke-width="3" opacity="0.6">${Array.from({ length: 12 }, (_, i) => `<line x1="0" y1="${600 + i * 25}" x2="1200" y2="${560 + i * 30}"/>`).join('')}</g>
<rect x="160" y="170" width="880" height="330" rx="40" fill="none" stroke="#ff2bd6" stroke-width="10"/>
<text x="600" y="330" font-family="Arial Black, Arial" font-weight="900" font-size="120" fill="#ff2bd6" text-anchor="middle">EPIC!!!</text>
<text x="600" y="440" font-family="Arial, sans-serif" font-size="54" fill="#00e5ff" text-anchor="middle">MUST-SEE MOVIE EVENT</text>
<circle cx="980" cy="760" r="70" fill="#ffe600"/><text x="980" y="776" font-family="Arial Black" font-size="34" fill="#1b0b3a" text-anchor="middle">NEW</text></svg>`;

export interface SampleDesignSystemInput {
  /** colour / font / logo / image assets already in the space (by name) */
  assets: BrandAsset[];
  campaigns: { trailer: Campaign; premiere: Campaign };
  /** stored image names */
  images: { poster?: string; trailer?: string; portrait?: string };
  /** store an SVG in the space, returns the asset name */
  storeSvg: (svg: string) => Promise<string>;
}

/** Fills colour / font fields on the existing assets, adds the extra palette and reference images, and returns the design system. */
export async function sampleDesignSystem(x: SampleDesignSystemInput): Promise<{ designSystem: DesignSystem; assets: BrandAsset[] }> {
  const a = (name: string, kind: BrandAsset['kind'], extra: Partial<BrandAsset> = {}): BrandAsset => ({ id: uid('ast'), name, kind, ...extra });
  const byName = (n: string) => x.assets.find((v) => v.name === n);
  const patch = (n: string, p: Partial<BrandAsset>) => {
    const hit = byName(n);
    if (hit) Object.assign(hit, p);
  };
  patch('Magic hour', { group: 'Core', role: 'primary', cssVar: '--color-magic-hour', onColor: '#16161a', coverage: '10 %', notes: 'The accent: titles, the countdown, one shape per frame. Never a background fill on more than a third of the frame.' });
  patch('Night', { group: 'Core', role: 'background', cssVar: '--color-night', onColor: '#f5e6c8', coverage: '70 %', notes: 'Default background; shadows of every photo fall to this.' });
  patch('Coat cream', { group: 'Core', role: 'text', cssVar: '--color-cream', onColor: '#16161a', coverage: '20 %', notes: 'Type on dark; light-theme background.' });
  patch('Bebas Neue', { weights: '400' });
  patch('Inter', { weights: '400, 600, 800' });

  const extra: BrandAsset[] = [
    a('Ember', 'color', { value: '#c2410c', group: 'Core', role: 'secondary', cssVar: '--color-ember', onColor: '#f5e6c8', notes: 'Pressed / hover state of Magic hour; teaser artwork' }),
    a('Sun', 'color', { value: '#ffd8a8', group: 'Core', role: 'accent', cssVar: '--color-sun', onColor: '#16161a', coverage: '≤ 5 %', notes: 'Only the sun glow and highlights' }),
    a('Smoke', 'color', { value: '#3a3a42', group: 'Neutrals', role: 'neutral', cssVar: '--color-smoke', onColor: '#f5e6c8', notes: 'Raised surfaces on Night' }),
    a('Ash', 'color', { value: '#b9b9c2', group: 'Neutrals', role: 'border', cssVar: '--color-ash', onColor: '#16161a', notes: 'Rules, dividers, secondary text on Night' }),
    a('Paper', 'color', { value: '#fbf6ec', group: 'Neutrals', role: 'surface', cssVar: '--color-paper', onColor: '#16161a', notes: 'Light theme surface (press kit, one-pagers)' }),
    a('Dusk violet', 'color', { value: '#7c5cff', group: 'Pillars', role: 'data', cssVar: '--color-pillar-bts', notes: 'Behind-the-scenes pillar tags only' }),
    a('Crew green', 'color', { value: '#2fb36d', group: 'Pillars', role: 'data', cssVar: '--color-pillar-cast', notes: 'Cast & crew pillar tags only' }),
    a('Festival blue', 'color', { value: '#3e8ef7', group: 'Pillars', role: 'data', cssVar: '--color-pillar-news', notes: 'Announcements pillar tags only' }),
  ];
  const imgTrailer = x.images.trailer ? a('Trailer thumbnail', 'image', { image: x.images.trailer, tags: ['reference', 'trailer'] }) : undefined;
  const imgPortrait = x.images.portrait ? a('June portrait card', 'image', { image: x.images.portrait, tags: ['reference', 'cast'] }) : undefined;
  const imgNear = a('Sunset stock look (near miss)', 'image', { image: await x.storeSvg(NEAR_MISS), tags: ['reference', 'near miss'] });
  const imgOff = a('Neon blockbuster look (off brand)', 'image', { image: await x.storeSvg(OFF_BRAND), tags: ['reference', 'off brand'] });
  extra.push(...([imgTrailer, imgPortrait, imgNear, imgOff].filter(Boolean) as BrandAsset[]));
  const poster = x.assets.find((v) => v.kind === 'image' && v.image === x.images.poster);

  const night = uid('dsth');
  const day = uid('dsth');
  const st = (name: string, n: string, d: string, description: string) => ({ id: uid('dsst'), name, description, values: { [night]: n, [day]: d } });
  const tk = (group: DesignSystem['tokens'][number]['group'], name: string, value: string, notes?: string) => ({ id: uid('dstk'), group, name, value, notes });

  const igPost = { id: uid('dsf'), name: 'Instagram post', width: 1080, height: 1350, aspect: '4:5', safeArea: '80 px on every side; keep the bottom 160 px free of key text (caption overlay)', minText: '28 px', background: '#16161a', resolution: '1x PNG', notes: 'Feed crop is 4:5; check the 1:1 grid preview' };
  const story = { id: uid('dsf'), name: 'Story / Reel cover', width: 1080, height: 1920, aspect: '9:16', safeArea: 'Top 250 px and bottom 340 px are covered by UI', minText: '36 px', background: '#16161a', resolution: '1x PNG' };
  const thumb = { id: uid('dsf'), name: 'YouTube thumbnail', width: 1280, height: 720, aspect: '16:9', safeArea: 'Bottom-right 220×90 px hidden by the timestamp', minText: '72 px (readable at 160 px wide)', background: '#16161a', resolution: '1x JPG < 2 MB' };
  const onePager = { id: uid('dsf'), name: 'Press one-pager', width: 210, height: 297, unit: 'mm' as const, aspect: 'A4', safeArea: '15 mm margins', minText: '8 pt', background: '#fbf6ec', resolution: '300 dpi PDF', notes: 'Light theme (Daylight)' };

  const rule = (area: DSRule['area'], kind: DSRule['kind'], level: DSRule['level'], text: string, why?: string, campaignId?: string): DSRule => ({ id: uid('dsr'), area, kind, level, text, why, scope: campaignId ? 'campaign' : 'brand', campaignId });
  const rules: DSRule[] = [
    rule('logo', 'rule', 'required', 'Use the supplied logo file only — never redraw, recolour, outline or stretch it; keep clear space equal to the height of the sun disc.', 'It is the one fixed mark across festival, press and social.'),
    rule('color', 'rule', 'required', 'Night is the ground: at least two thirds of every frame is Night or a shadow falling to it; Magic hour covers no more than ~10 %.', 'Orange only glows against black — spread it and it turns into a warning sign.'),
    rule('typography', 'rule', 'required', 'Titles in Bebas Neue, all caps; everything else in Inter. No script, serif or rounded fonts.'),
    rule('imagery', 'dont', 'required', 'No neon, chrome, lens flares or stock-sunset gradients; no hype words like "epic" or "must-see" in artwork.', 'Off-brand blockbuster language (see the off-brand reference).'),
    rule('composition', 'rule', 'preferred', 'One focal point per frame, placed on the lower third, with the title above it and the countdown or date in a corner.'),
    rule('imagery', 'do', 'preferred', 'Shoot or generate at real golden hour: low warm side light, long shadows, faces half in shadow.'),
    rule('accessibility', 'rule', 'required', 'Body text and captions keep 4.5:1 contrast; never put cream text on Magic hour.'),
    rule('layout', 'rule', 'preferred', 'Keep a 80 px safe margin (Instagram) and leave the bottom band free for captions and UI.'),
    rule('treatment', 'rule', 'open', 'Film grain strength is up to the editor — none to subtle.'),
    rule('voice', 'dont', 'preferred', 'Don’t explain the plot in artwork: tease with the clock and the light, not the story.'),
    rule('composition', 'do', 'required', 'Every trailer-launch asset shows the countdown (minutes left of daylight) in the top-right corner.', 'The countdown is the trailer campaign’s signature.', x.campaigns.trailer.id),
    rule('color', 'rule', 'preferred', 'Premiere assets may use Daylight (cream background) for press and festival print.', undefined, x.campaigns.premiere.id),
  ];

  const ref = (title: string, assetId: string | undefined, roles: DesignSystem['references'][number]['roles'], verdict: DesignSystem['references'][number]['verdict'], borrow?: string, ignore?: string, why?: string, campaignId?: string) => ({ id: uid('dsrf'), title, assetId, roles, verdict, borrow, ignore, why, mode: 'dark' as const, campaignId });
  const references = [
    ref('Official poster', poster?.id, ['style', 'composition', 'color'], 'on_brand', 'The orange-to-night gradient, the sun disc top right, the skyline silhouette and the stacked all-caps title.', 'The exact title text — set it in finishing.', 'Everything we stand for in one frame: warm light, deep black, one idea.'),
    ref('Trailer thumbnail', imgTrailer?.id, ['composition'], 'on_brand', 'Wide 16:9 balance: title centred, horizon in the lower fifth, generous black above.', 'The trailer wording.', undefined, x.campaigns.trailer.id),
    ref('June portrait card', imgPortrait?.id, ['mood', 'typography'], 'on_brand', 'The calm, close portrait mood and the small spaced caption under the name.', 'The green pillar colour — it belongs to the cast pillar tag only.'),
    ref('Sunset stock look', imgNear.id, ['color', 'mood'], 'near_miss', 'Only the warmth of the light.', 'The pastel gradient, the script font, the emoji and the centred sun.', 'Warm and pretty but generic: no black, no tension, reads like a travel ad.'),
    ref('Neon blockbuster look', imgOff.id, ['style'], 'off_brand', undefined, 'Everything.', 'Cold neon, hype words and badges — the opposite of a quiet one-take indie film.'),
  ];

  const ds: DesignSystem = {
    name: 'The Last Take — Golden Hour design system',
    summary: 'How everything for The Last Take looks: golden-hour orange glowing out of night black, tall all-caps titles and a countdown that runs through the whole campaign. For posters, social posts, thumbnails, the press kit and every generated image.',
    version: '1.2',
    updatedAt: new Date().toISOString(),
    agentNotes:
      'Read the Rules first: Required rules are non-negotiable. Build every image prompt from a brief (Generation briefs) and the references’ roles. Generate artwork without text; the real title lockup, logo and dates are placed in finishing. When unsure between two options, pick the darker, quieter one.',
    intent: {
      audience: 'Indie film lovers (25–40) and filmmakers who discover films through festivals, Letterboxd and Instagram.',
      impression: 'This is a small, handmade film with real tension — something you want to see before everyone else.',
      purpose: 'Stop the scroll with light and time, then send people to the trailer, the premiere and release day.',
      personality: [
        { id: uid('dsw'), word: 'Urgent', looksLike: 'A clock or countdown in the frame, diagonal light, people mid-movement' },
        { id: uid('dsw'), word: 'Warm', looksLike: 'Golden side light, skin tones kept natural, orange only where the sun hits' },
        { id: uid('dsw'), word: 'Handmade', looksLike: 'Real locations, visible grain, imperfect framing — never glossy CGI' },
      ],
    },
    themes: [
      { id: night, name: 'Night', mode: 'dark', isDefault: true, notes: 'Social, trailer, thumbnails — everything on screen.' },
      { id: day, name: 'Daylight', mode: 'light', notes: 'Press kit, one-pagers and festival print; Magic hour turns to Ember for text.' },
    ],
    semanticTokens: [
      st('--surface', '#16161a', '#fbf6ec', 'Page / frame background'),
      st('--surface-raised', '#3a3a42', '#f5e6c8', 'Cards, panels, story stickers'),
      st('--text-heading', '#f5e6c8', '#16161a', 'Titles'),
      st('--text-body', '#b9b9c2', '#3a3a42', 'Body copy and captions'),
      st('--accent', '#e8590c', '#c2410c', 'The one accent: countdown, key word, CTA'),
      st('--accent-ink', '#16161a', '#fbf6ec', 'Text on --accent'),
      st('--rule', 'rgba(245,230,200,.18)', 'rgba(22,22,26,.16)', 'Hairlines and dividers'),
      st('--stat-value', '#ffd8a8', '#c2410c', 'Big numbers (minutes left, views, dates)'),
    ],
    typeStyles: [
      { id: uid('dsty'), name: 'Display', family: 'Bebas Neue', weight: 400, size: '120px', lineHeight: '0.92', letterSpacing: '0.01em', case: 'upper', usage: 'Poster and thumbnail titles, 1–3 words per line', cssVar: '--type-display' },
      { id: uid('dsty'), name: 'H1', family: 'Bebas Neue', weight: 400, size: '64px', lineHeight: '1', letterSpacing: '0.02em', case: 'upper', usage: 'Slide and post headlines', cssVar: '--type-h1' },
      { id: uid('dsty'), name: 'H2', family: 'Inter', weight: 800, size: '28px', lineHeight: '1.15', letterSpacing: '-0.01em', usage: 'Section heads in the press kit', cssVar: '--type-h2' },
      { id: uid('dsty'), name: 'Eyebrow', family: 'Inter', weight: 700, size: '13px', lineHeight: '1.2', letterSpacing: '0.18em', case: 'upper', usage: 'Above titles: OFFICIAL SELECTION · 12 MIN', cssVar: '--type-eyebrow' },
      { id: uid('dsty'), name: 'Body', family: 'Inter', weight: 400, size: '16px', lineHeight: '1.5', usage: 'Press kit and newsletter body', cssVar: '--type-body' },
      { id: uid('dsty'), name: 'Caption', family: 'Inter', weight: 600, size: '13px', lineHeight: '1.4', letterSpacing: '0.02em', usage: 'Credits, photo captions, legal', cssVar: '--type-caption' },
      { id: uid('dsty'), name: 'Countdown numeral', family: 'Bebas Neue', weight: 400, size: '180px', lineHeight: '0.85', usage: 'The minutes-left clock (12:00 → 00:00)', cssVar: '--type-stat' },
    ],
    tokens: [
      ...[4, 6, 8, 12, 16, 20, 28, 36].map((v, i) => tk('spacing', `space-${i + 1}`, `${v}px`)),
      tk('radius', 'radius-card', '8px', 'Cards and stickers'),
      tk('radius', 'radius-callout', '7px'),
      tk('radius', 'radius-badge', '4px', 'Countdown badge'),
      tk('radius', 'radius-tile', '3px', 'Thumbnails in grids'),
      tk('shadow', 'shadow-poster', '0 18px 40px rgba(0,0,0,.55)', 'Floating poster / card on Night'),
      tk('border', 'border-rule', '1px solid var(--rule)'),
      tk('motion', 'ease-countdown', 'cubic-bezier(.2,.8,.2,1)', 'Number flips in the countdown'),
    ],
    components: [
      { id: uid('dscm'), name: 'CountdownBadge', category: 'Brand motifs', description: 'The minutes-of-daylight-left clock that appears on every trailer-launch asset.', props: 'minutes — 00 to 12\nlabel — e.g. "MIN OF LIGHT LEFT"\nsize — sm | lg', variants: 'Filled (Magic hour on Night), outline (Daylight)', states: 'Last minute: numerals turn Sun', themeNotes: 'Daylight: Ember fill, Paper text', usage: 'Top-right corner, 64 px from the edges' },
      { id: uid('dscm'), name: 'TitleLockup', category: 'Brand motifs', description: 'THE LAST / TAKE stacked in Display with the sun disc. Supplied as a file — never re-typeset.', props: 'theme — night | daylight\nwithTagline — boolean', usage: 'Posters, end cards, thumbnails (finishing only)' },
      { id: uid('dscm'), name: 'QuoteCard', category: 'Cards', description: 'Press quote on a raised surface with the outlet as an eyebrow.', props: 'quote — max 120 characters\noutlet — publication name\nstars — 0–5 (optional)', variants: 'Square (1:1), story (9:16)', themeNotes: 'Night: --surface-raised; Daylight: Coat cream' },
    ],
    layouts: [
      { id: uid('dsly'), name: 'Poster', kind: 'social', description: 'The key art adapted to a feed post.', structure: 'sun disc top right · eyebrow · Display title (2 lines) · skyline silhouette on the lower third · date + CTA in the bottom band', formatId: igPost.id, previewAssetId: poster?.id },
      { id: uid('dsly'), name: 'Story countdown', kind: 'social', description: 'Daily story during the trailer launch.', structure: 'CountdownBadge (lg) centred · one-line hook in H1 · still from the film filling the lower half · sticker space at the bottom', formatId: story.id },
      { id: uid('dsly'), name: 'Trailer thumbnail', kind: 'web', description: 'YouTube thumbnail for trailer and BTS videos.', structure: 'face or figure on the left third, half in shadow · 2–3 word Display title on the right · CountdownBadge (sm) top right', formatId: thumb.id, previewAssetId: imgTrailer?.id },
    ],
    artDirection: {
      imagery: {
        subjects: 'The crew and cast at work on a city rooftop and stairwell; hands on gear; the sun dropping between water towers; the clock.',
        style: 'Naturalistic cinema stills with 35 mm grain — never illustration, 3D or glossy CGI.',
        lighting: 'Real golden hour: low, warm, hard side light from frame right; deep shadows that fall to black.',
        camera: 'Eye level or slightly low; 35–50 mm; a little handheld tilt is welcome.',
        cropping: 'Tight on faces (forehead may be cut); wide shots keep the horizon in the lower fifth.',
        realism: 'Photographic, believable, slightly imperfect.',
        people: 'Real-looking crew of mixed ages; candid, mid-action; never posing at the camera except cast portraits.',
        avoid: 'Neon, lens-flare overlays, pastel sunsets, stock smiles, clapperboard clichés, popcorn.',
      },
      composition: 'One focal point per frame on the lower third; titles in the top half; at least 40 % of the frame in near-black negative space; corners hold the countdown and the date.',
      relationships:
        'Night black is the stage and fills most of every frame; the orange exists only where the sun touches something — a face, a rail, the title — so the eye goes straight to it. The title always sits above the light source and never competes with a face: if a face is the focal point the title moves to the opposite side and shrinks. The countdown is the one graphic element that may overlap the image, always in a corner and always in Magic hour. Text never lies on busy detail — it sits on shadow. Photos and type share one warm light direction (from the right), so gradients, shadows and glows all fall to the left.',
      colorBehavior: {
        dominant: 'Night (#16161a) and deep shadows',
        accents: 'Magic hour for the title / countdown only; Sun for glow and highlights',
        coverage: '70 % Night, 20 % Coat cream, 10 % Magic hour',
        photoTreatment: 'Warm grade, crushed blacks, highlights rolled off to cream; no teal-and-orange split toning.',
        backgrounds: 'Night or a photo that falls to Night; Daylight theme uses Paper.',
        lightDark: 'Daylight swaps Night ↔ Paper and Magic hour → Ember for text; photography stays the same.',
      },
      typographyInImages: 'Titles in Bebas Neue all caps, tight leading, 1–3 words per line; eyebrows in Inter Bold with wide tracking; never more than two sizes per frame. Exact text is placed in finishing — generated images contain no lettering.',
      substitutions: 'Bebas Neue → Oswald or League Gothic; Inter → Helvetica Neue / Arial.',
    },
    treatments: [
      { id: uid('dstr'), name: 'Golden-hour gradient', description: 'Magic hour bleeding into Night from the top right corner, as if the sun is just out of frame.', whereToUse: 'Backgrounds of posters, title cards, end cards', avoid: 'Behind body text; more than one gradient per frame', level: 'required', exampleAssetId: poster?.id },
      { id: uid('dstr'), name: 'Countdown clock', description: 'Minutes of daylight left (12 → 0) as a badge or big numeral.', whereToUse: 'Trailer-launch assets, stories, the premiere countdown', avoid: 'Release-day assets (the clock has run out)', level: 'preferred' },
      { id: uid('dstr'), name: 'Film grain', description: 'Fine 35 mm grain over photos and gradients.', whereToUse: 'Stills, posters', avoid: 'Logos and small text', level: 'open' },
    ],
    rules,
    references,
    formats: [igPost, story, thumb, onePager],
    briefs: [
      {
        id: uid('dsb'),
        name: 'Countdown story frame',
        objective: 'Daily story that builds urgency for the trailer drop.',
        audience: 'Followers who have seen the poster but not the trailer',
        formatId: story.id,
        copy: '12 MIN OF LIGHT LEFT\nTrailer Friday 18:00',
        ruleIds: [rules[0].id, rules[1].id, rules[2].id, rules[10].id],
        referenceIds: [references[0].id, references[3].id],
        variation: 'The still (any rooftop moment), the minutes left, the hook line',
        review: 'Countdown readable at thumbnail size; top 250 px and bottom 340 px free',
        finishing: 'Place the CountdownBadge and the copy in Instagram / Canva on the generated still; add the logo only on the last day.',
        campaignId: x.campaigns.trailer.id,
      },
      {
        id: uid('dsb'),
        name: 'Festival premiere poster (feed)',
        objective: 'Announce the festival premiere and drive ticket sales.',
        formatId: igPost.id,
        copy: 'WORLD PREMIERE\nGolden Hour Film Festival',
        ruleIds: [rules[0].id, rules[1].id, rules[2].id, rules[4].id, rules[11].id],
        referenceIds: [references[0].id, references[2].id, references[4].id],
        variation: 'Night or Daylight theme; which cast member is shown',
        finishing: 'TitleLockup file + laurels from the festival press kit, placed over the art.',
        campaignId: x.campaigns.premiere.id,
      },
    ],
    review: {
      criteria: [...DEFAULT_REVIEW_CRITERIA, 'Light direction: warm light comes from the right in photo, gradient and shadows', 'The frame still reads at 160 px wide (thumbnail test)'],
      finishing: 'Generate imagery without any text or logos. Then, in Canva / Figma: place the TitleLockup or logo file (never redrawn), set copy in Bebas Neue / Inter from the type styles, add the CountdownBadge, export at the format’s size and check the safe areas with the overlay template.',
    },
    sources: [],
  };
  return { designSystem: ds, assets: extra };
}
