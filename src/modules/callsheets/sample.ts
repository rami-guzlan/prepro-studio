import type { CallSheet, CastCall, CrewCall, ID, ProjectData } from '@/types';
import type { SampleContext } from '@/sample/context';
import { STANDARD_WALKIES } from './logic';

/** Adds demo data for the callsheets module to the sample project (mutates p). */
export async function seedSample(p: ProjectData, _ctx: SampleContext): Promise<void> {
  const [day1, day2] = p.schedule?.days ?? [];
  if (!day1) return;
  p.callSheets = p.callSheets ?? {};

  const castFor = (character: string): ID | undefined => p.characters.find((c) => c.name === character)?.castId;
  const crewId = (name: string): ID | undefined => p.crew.find((c) => c.name === name)?.id;

  const castCalls = (entries: [string, CastCall][]): Record<ID, CastCall> => {
    const out: Record<ID, CastCall> = {};
    for (const [character, call] of entries) {
      const id = castFor(character);
      if (id) out[id] = call;
    }
    return out;
  };
  const crewCalls = (entries: [string, CrewCall][]): Record<ID, CrewCall> => {
    const out: Record<ID, CrewCall> = {};
    for (const [name, call] of entries) {
      const id = crewId(name);
      if (id) out[id] = call;
    }
    return out;
  };

  const sheet1: CallSheet = {
    dayId: day1.id,
    version: 2,
    crewCall: '06:00',
    shootingCall: '07:30',
    breakfast: '05:30',
    lunch: '12:00',
    estWrap: '18:00',
    weather: { summary: 'Clear, light wind', high: '52°F', low: '41°F', precip: '10%' },
    basecamp: '9th floor lobby — holding, hair & makeup, wardrobe and craft services.',
    safetyNotes:
      'ROOFTOP EDGE: stay behind the taped safety line (6 ft from the edge) at all times. Anyone working within 6 ft of the ledge — camera team and June for Sc 3 — must wear a fall-arrest harness clipped to the anchor points. Harnesses and anchors rigged and checked by the key grip before rehearsal.\nWind machine (Sc 3): sandbag every stand on the roof; no loose items near the ledge.\nStairwell: keep landings clear of cable; gear goes up by hand, two people per case.',
    walkieChannels: STANDARD_WALKIES,
    specialInstructions: 'Closed set on the roof during Sc 3 — essential crew only. Freight elevator is out of service: allow 30 min load-in up 9 floors.',
    generalNotes: 'Sunset is around 4:40 PM. Rooftop scenes MUST start by 3:45 PM — we have one shot at magic hour.',
    advanceNotes: 'Day 2 is a later call (9:00 AM) at Studio 9 Post, Suite B. Street parking on Water St.',
    quote: 'The sun doesn’t do second takes.',
    castCalls: castCalls([
      ['JUNE', { pickup: '05:15', call: '05:45', hmu: '06:00', onSet: '07:15', notes: 'Coat double ready for the stair run' }],
      ['SAM', { call: '06:30', hmu: '06:45', onSet: '07:30', notes: 'V.O. live on walkie in Sc 2' }],
      ['MAYA', { call: '12:30', hmu: '12:45', onSet: '14:00', notes: 'Rooftop only' }],
      ['LEO', { call: '12:30', hmu: '13:00', onSet: '14:00', notes: 'Rooftop only' }],
    ]),
    crewCalls: crewCalls([
      ['Ben Carter', { call: '05:30', notes: 'Open the building with Dana' }],
      ['Hannah Moore', { call: '06:00', notes: 'Rig roof anchors first' }],
    ]),
    deptNotes: {
      Camera: 'Prop 16mm camera is in frame on the roof — not a working camera. Be lit and rolling for Sc 3 by 3:45 PM. Wide + tight on the coat lift.',
      'Grip & Electric': 'Fall-arrest anchors on the roof before rehearsal. Wind machine for the coat lift (Sc 3), sandbag everything. Putt-putt generator as backup for the two 20A roof circuits.',
      Sound: 'Wind protection on all mics. Record a wild track of walkie static and the walkie drop on gravel after Sc 3.',
      'Art/Props': 'Hero 16mm camera on wooden tripod (rented — Prop House NYC). 2 practical walkies; one is the drop walkie. June’s dog-eared, highlighted script.',
      Wardrobe: 'June: red 1960s coat — hero + double for the stairwell run. Steamer in the 9th floor lobby.',
      'Hair & Makeup': 'June first in the chair at 6:00 AM. Sweat and flush touch-ups between stair takes; wind-proof hair for the roof.',
      Locations: 'Building contact on site: Dana Whitfield. Restrooms on the 9th floor, east corridor. Loading zone at the north entrance until 9:00 AM.',
      Transportation: 'Cube truck in the north loading zone until 9:00 AM, then street parking on Hollis Ave. Pickup for Sofia Marín at 5:15 AM.',
      Catering: 'Breakfast from 5:30 AM in the 9th floor lobby. Hot lunch at 12:00 PM for 16. Craft services on the roof from 2:00 PM.',
    },
  };
  p.callSheets[day1.id] = { ...sheet1, ...(p.callSheets[day1.id] ?? {}) };

  if (day2) {
    const sheet2: CallSheet = {
      dayId: day2.id,
      version: 1,
      crewCall: '09:00',
      shootingCall: '10:30',
      breakfast: '08:30',
      lunch: '14:00',
      estWrap: '19:00',
      weather: { summary: 'Partly cloudy', high: '55°F', low: '44°F', precip: '20%' },
      basecamp: 'Studio 9 Post lounge (2nd floor).',
      parking: 'Street parking on Water St; no parking in the Studio 9 courtyard.',
      safetyNotes: 'Tape down and mat every cable crossing in the suite. Blackout duvetyne on the windows — keep both fire exits clear and lit.',
      walkieChannels: STANDARD_WALKIES,
      generalNotes: 'Night interior shot day-for-night. Windows blacked out before camera.',
      quote: 'Twelve minutes of light. We used eleven.',
      castCalls: castCalls([
        ['MAYA', { call: '09:30', hmu: '09:30', onSet: '10:30' }],
        ['LEO', { call: '09:30', hmu: '09:45', onSet: '10:30' }],
      ]),
      crewCalls: crewCalls([
        ['Elena Ward', { call: '09:00' }],
        ['Marcus Chen', { call: '09:00' }],
        ['Tasha Brooks', { call: '08:30' }],
        ['Ivan Petrov', { call: '09:00' }],
        ['Mia Santos', { call: '09:00' }],
        ['Luis Ortega', { call: '08:30', notes: 'Blackout first' }],
        ['Hannah Moore', { call: '08:30' }],
        ['Karim Haddad', { call: '09:30' }],
        ['Grace Liu', { call: '09:00' }],
        ['Nina Patel', { call: '09:00' }],
        ['Ben Carter', { call: '08:00' }],
        ['Chloe Martin', { call: '13:00', notes: 'Playback of the Day 1 take for Sc 4' }],
      ]),
      deptNotes: {
        Camera: 'Monitor wall in frame: shoot at 23.976 with matching refresh on all practical screens.',
        'Grip & Electric': 'Duvetyne on all windows; practicals only plus a soft top light.',
        'Art/Props': 'Bank of 5 monitors (borrowed from Studio 9) dressed as the edit suite. Playback loop of the hero take on the centre screen.',
        Catering: 'Hot lunch at 2:00 PM for 14.',
      },
    };
    p.callSheets[day2.id] = { ...sheet2, ...(p.callSheets[day2.id] ?? {}) };
  }
}
