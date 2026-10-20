import type { IdeaGroup, IdeaLink, IdeaNote, ProjectData } from '@/types';
import type { SampleContext } from '@/sample/context';
import { newBoard } from '@/lib/mind';

/** Adds a sample Mind Dump (two boards: the film itself, and the BTS mini-doc) to the sample project. */
export async function seedSample(p: ProjectData, _ctx: SampleContext): Promise<void> {
  const n = (id: string, text: string, x: number, y: number, color: string, used = false): IdeaNote => ({ id, text, x, y, w: 200, h: 120, color, used });
  const notes: IdeaNote[] = [
    n('idea_s1', 'A crew racing the sunset — the light is the villain', 60, 80, '#fff3a3', true),
    n('idea_s2', 'June stuck on the stairs while the sky changes colour', 284, 80, '#fff3a3', true),
    n('idea_s3', 'The take they almost missed', 508, 80, '#fff3a3'),
    n('idea_v1', 'Water towers as silhouettes against orange sky', 60, 340, '#b5d8ff'),
    n('idea_v2', 'Handheld on the stairs — breathless, spiralling', 284, 340, '#b5d8ff'),
    n('idea_v3', 'Freeze frame on June, backlit — end on it', 508, 340, '#b5d8ff', true),
    n('idea_m1', 'Music: ticking-clock pulse that stops dead on "Cut!"', 820, 80, '#cdb4ff'),
    n('idea_m2', 'Silence in the edit suite — just the hum of monitors', 820, 220, '#cdb4ff'),
    n('idea_q1', 'Do we need scene 4, or end on the roof?', 820, 400, '#ffc8dd'),
  ];
  const groups: IdeaGroup[] = [
    { id: 'grp_story', title: 'Story', x: 32, y: 26, w: 704, h: 202, color: '#7c5cff' },
    { id: 'grp_look', title: 'Look & camera', x: 32, y: 286, w: 704, h: 202, color: '#3e8ef7' },
    { id: 'grp_sound', title: 'Sound', x: 792, y: 26, w: 256, h: 342, color: '#2fb36d' },
  ];
  const links: IdeaLink[] = [
    { id: 'link_1', from: 'idea_s1', to: 'idea_s2' },
    { id: 'link_2', from: 'idea_s2', to: 'idea_s3' },
    { id: 'link_3', from: 'idea_s3', to: 'idea_v3' },
  ];
  const film = newBoard('The film', {
    color: '#7c5cff',
    text: `- the whole film happens in the last 12 minutes of daylight
- what's at stake for Maya? her first feature? a promise?
- June's coat = the only strong colour in the frame
- comedy in the stairs, emotion on the roof
- maybe a title card: "12 minutes of light"
- BTS mini-doc later — keep the walkie chatter recorded`,
    notes,
    groups,
    links,
  });
  const bts = newBoard('BTS mini-doc', {
    color: '#f08c00',
    text: `- follow Maya from call time to the last shot
- keep every walkie chatter recording
- 3 to 4 minutes, cut for YouTube + verticals`,
    notes: [
      n('idea_b1', 'Cold open: the elevator OUT OF SERVICE sign', 60, 80, '#ffd6a5'),
      n('idea_b2', 'Gear going up nine flights — time-lapse', 284, 80, '#ffd6a5'),
      n('idea_b3', 'Interview June on the roof after wrap', 60, 240, '#b9f0d0'),
      n('idea_b4', 'Clock overlay: minutes of light left', 284, 240, '#b9f0d0'),
    ],
    groups: [{ id: 'grp_bts', title: 'Moments to catch', x: 32, y: 26, w: 480, h: 360, color: '#f08c00' }],
    links: [{ id: 'link_b1', from: 'idea_b1', to: 'idea_b2' }],
  });
  p.script.mind = { boards: [film, bts] };
}
