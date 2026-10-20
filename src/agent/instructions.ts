/* What a connecting AI agent is told about PrePro Studio (MCP `instructions`)
   and the ready-made prompts it can offer the user. */

export const INSTRUCTIONS = `PrePro Studio is the user's local pre-production & post-planning app for video productions: Final Draft-style screenplay or two-column A/V script, Mind Dump brainstorming board, storyboards, shot lists, lighting diagrams, cast & characters, crew, contacts, locations, script breakdown, props/wardrobe/elements, shooting schedule (stripboard, Day Out of Days), call sheets, gear, budget, post-production (schedule, deliverables, graphics, music cues, VFX, ADR, edit notes) and printable PDFs.

There are two kinds of workspaces:
- PROJECTS = one production (a film / video with script, team, shoot and post).
- MARKETING SPACES = ongoing marketing for a goal (a personal brand, a YouTube channel, a film's release campaign): strategy (goals, audiences, content pillars, messaging, tactics), channels with cadence, an Ideas board, multiformat CONTENT pieces moving idea → writing → planning → production → editing → ready → published, each with posts (channel, date, time, caption, status, results), a content calendar, batch shoot days, campaigns & milestones, a brand kit, results and links to projects.

Everything you change appears live in the app window the user is looking at and is saved automatically. Each tool call is one undo step: the user can press Ctrl+Z, or you can call undo.

How to work
1. Call get_app_state first. Tools act on what is OPEN: a project (list_projects / open_project / create_project / open_demo_project) or a Marketing Space (list_spaces / open_space / create_space / open_demo_space).
2. Scenes come from the screenplay. Read it with get_script (Fountain text) or list_scenes; write with write_script (Fountain). Scene ids link shots, schedule strips, breakdown elements and lighting diagrams, so prefer write_script modes that keep ids (append, insert_*, replace_scenes) over replace_all. A/V projects (script mode "av") use the av_rows collection.
3. Every other list is a collection: describe_data shows them all; then list_items / add_items / update_items / delete_items / move_items. References accept ids or names; scenes also accept their number ("12") or heading.
4. Single values (title, logline, client, director, shoot dates, target runtime, title page, paper size, print watermark, schedule start date, contingency %…) use get_fields / set_fields.
5. Specialised tools: mind_use_board / mind_add_notes / mind_organize / mind_send_notes (brainstorm boards — several per project or space, one per idea batch or category; pass board:"Name" to put ideas on their own board), import_image (storyboard frames, headshots, location photos, logos — you may draw storyboard sketches as SVG), lighting_* (plots measured in feet or metres), get_schedule / schedule_scenes / schedule_action, get_call_sheet / update_call_sheet, tag_script (breakdown), apply_template / budget_quick_fill, get_report (readiness, breakdown, budget, timeline …), list_documents / export_pdf / preview_document.
6. In a Marketing Space: describe_data lists its collections (content, posts, content_shots, content_checklist, channels, pillars, goals, personas, tactics, campaigns, milestones, shoots, assets, mind_notes …). add_items {collection:"content"} can create a piece with its posts in one call ({title, format, stage, pillarId, campaignId, concept, hook, script or copy, posts:[{channelId:"Instagram", date, time, caption, hashtags, status}]}); schedule / reschedule by updating posts (parentId = content). get_space_calendar and get_space_report give the big picture; set_fields edits strategy.* and meta.*; mind_* tools work on the Ideas board; link_projects links productions.
7. Use show_in_app to bring up what you just changed (in spaces also {content:{contentId, tab}} opens the content editor), and screenshot_app or preview_document to check visual results.
8. Ask the user before big or destructive changes (replacing the whole script, deleting many items, delete_project). Never invent real people's contact details.

Formats: dates YYYY-MM-DD; times HH:MM (24h); money as plain numbers in the project currency; page lengths in eighths ("1 3/8").`;

export interface PromptDef {
  name: string;
  title: string;
  description: string;
  /** `default` fills the {placeholder} when the user leaves the argument empty */
  arguments?: { name: string; description: string; required?: boolean; default?: string }[];
  messages: { role: 'user'; text: string }[];
}

export const PROMPTS: PromptDef[] = [
  {
    name: 'plan_the_shoot',
    title: 'Plan the shoot',
    description: 'Review the script, map locations, schedule the shoot days and prepare call sheets.',
    arguments: [
      { name: 'days', description: 'number of shoot days (optional)', default: 'as few' },
      { name: 'start', description: 'first shoot date YYYY-MM-DD (optional)', default: 'on the project shoot start date (ask me if there is none)' },
    ],
    messages: [
      {
        role: 'user',
        text: 'Help me plan the shoot for the project that is open in PrePro Studio. Start with get_app_state and list_scenes. Check every scene has a location (map script sets to locations), estimate shooting time per scene, then propose a schedule over {days} shoot day(s) as you sensibly can, starting {start} — group scenes by location and cast, keep days under 12 hours — and wait for my OK before writing it with schedule_scenes. Then fill in the call sheets (crew call, lunch, wrap, cast calls) and show me the result.',
      },
    ],
  },
  {
    name: 'break_down_the_script',
    title: 'Break down the script',
    description: 'Tag cast, props, wardrobe, vehicles, effects and more in every scene.',
    messages: [
      {
        role: 'user',
        text: 'Do a full script breakdown of the open PrePro Studio project. Read the screenplay with get_script, then tag props, wardrobe, makeup, vehicles, animals, SFX, VFX, sound, music, set dressing and special equipment with tag_script, note extras per scene with update_scenes, and give me a summary per scene from get_report {report:"breakdown"}. Ask me about anything ambiguous.',
      },
    ],
  },
  {
    name: 'brainstorm',
    title: 'Brainstorm on the Mind Dump',
    description: 'Get ideas out on the Mind Dump board, cluster them, then turn the best into scenes.',
    arguments: [{ name: 'topic', description: 'what we are brainstorming', required: true }],
    messages: [
      {
        role: 'user',
        text: 'Let’s brainstorm: {topic}. Pin lots of short ideas on the Mind Dump board of the open PrePro Studio project with mind_add_notes, grouped by theme (story, look & camera, sound, locations, people). Then help me pick the strongest ones and, when I agree, turn them into scenes or A/V rows with mind_send_notes. Open the board with show_in_app {module:"script", params:{tab:"mind"}}.',
      },
    ],
  },
  {
    name: 'shot_list_and_storyboard',
    title: 'Shot list & storyboard',
    description: 'Design coverage for scenes and draw simple storyboard frames.',
    arguments: [{ name: 'scenes', description: 'scene numbers, or "all"', default: 'all scenes' }],
    messages: [
      {
        role: 'user',
        text: 'Create a shot list for scene(s) {scenes} of the open PrePro Studio project: read them with get_script, propose coverage (shot size, angle, movement, lens, camera, est. minutes) and add the shots with add_items {collection:"shots"}. Then draw a simple 16:9 storyboard sketch for each shot as SVG and attach it with import_image {svg, attachTo:{collection:"shots", id, field:"image"}}. Check the result with preview_document {docId:"storyboard"}.',
      },
    ],
  },
  {
    name: 'plan_content',
    title: 'Plan a content calendar',
    description: 'In a Marketing Space: turn goals, pillars and channels into a scheduled multiformat content plan.',
    arguments: [{ name: 'weeks', description: 'how many weeks to plan', default: '4' }],
    messages: [
      {
        role: 'user',
        text: 'Help me plan content for the Marketing Space that is open in PrePro Studio (get_app_state; open one with list_spaces / open_space if needed). Read the strategy (get_fields), goals, pillars and channels with their cadence (list_items), and what is already scheduled (get_space_calendar). Then propose a {weeks}-week plan that hits each channel’s cadence and balances the pillars: for each piece the title, format, hook, pillar and the posts per channel with dates and times. Wait for my OK, then create it with add_items {collection:"content"} (posts included) and show me the calendar.',
      },
    ],
  },
  {
    name: 'write_content',
    title: 'Write a content piece',
    description: 'In a Marketing Space: write the script or copy and the captions for a piece.',
    arguments: [{ name: 'piece', description: 'title of the content piece', required: true }],
    messages: [
      {
        role: 'user',
        text: 'In the open Marketing Space, find the content piece "{piece}" (list_items {collection:"content"}). Read the space strategy (voice, key messages, pillars) and the piece brief, then write it: for video a tight script (hook in the first 3 seconds, body, CTA) fitting the target length; for text formats the copy. Then write a caption, title and hashtags for each of its posts, respecting each platform’s limits. Save with update_items (content) and update_items (posts, parentId = the piece), move it to the right stage and open it with show_in_app {content:{contentId, tab:"write"}}.',
      },
    ],
  },
];
