import { DEFAULT_CHARACTER_ID, isCharacterId, type CharacterId } from './types';

export interface CharacterInfo {
  id: CharacterId;
  /** Card number in the picker, 1–15 (spec §1 order). */
  number: number;
  name: string;
  /** Glow and picker accent (spec §1). */
  accent: string;
  /** Dark ground of the coach's recap share images, tinted toward the accent (recap restyle). */
  ground: string;
  /** Short focus chip on the picker card (spec §1). */
  focus: string;
  /** Local copy for the picker; matches backend persona v4 exactly (spec §6). */
  tagline: string;
  greeting: string;
  /** Personality lines shown while thinking (spec §5). App-side only. */
  thinkingLines: readonly [string, string, string];
}

// Pure data: no Skia import, so screens and tests can use it freely.
export const CHARACTERS: Record<CharacterId, CharacterInfo> = {
  mochi: {
    id: 'mochi', number: 1, name: 'Mochi', accent: '#F9A8D4', ground: '#2A1420', focus: 'Rest',
    tagline: 'Soft and gentle. Rest is never something to feel bad about.',
    greeting: 'Hey you. No pressure today. How are you feeling?',
    thinkingLines: ['mulling it over', 'getting comfy with your numbers', 'taking a soft look'],
  },
  boba: {
    id: 'boba', number: 2, name: 'Boba', accent: '#E0B48A', ground: '#261A12', focus: 'Daily habits',
    tagline: 'Bubbly and upbeat. Keeps your daily habits topped up.',
    greeting: "Sip check! Want to see today's habits?",
    thinkingLines: ['stirring the pearls', 'shaking things up', 'sipping through your data'],
  },
  sprout: {
    id: 'sprout', number: 3, name: 'Sprout', accent: '#4ADE80', ground: '#0F2018', focus: 'Progress',
    tagline: 'Celebrates small, steady growth, week after week.',
    greeting: "Look how far you've come. Want to see this month?",
    thinkingLines: ['soaking it in', 'growing an answer', 'checking the roots'],
  },
  avo: {
    id: 'avo', number: 4, name: 'Avo', accent: '#A3E635', ground: '#16200E', focus: 'Energy',
    tagline: 'Calm, and quietly obsessed with what fuels you.',
    greeting: 'Want to look at where your energy went today?',
    thinkingLines: ['crunching the numbers', 'weighing up your fuel', 'pitting the facts'],
  },
  peep: {
    id: 'peep', number: 5, name: 'Peep', accent: '#FDE047', ground: '#1E1A0E', focus: 'Motivation',
    tagline: 'Tiny, loud, and your biggest cheerleader.',
    greeting: "You showed up! That's already a win. What's next?",
    thinkingLines: ['pecking through your data', 'flapping through your week', 'chirping up an answer'],
  },
  bun: {
    id: 'bun', number: 6, name: 'Bun', accent: '#CBD5E1', ground: '#161A22', focus: 'Rest days',
    tagline: 'Gentle. A big believer in taking it easy.',
    greeting: 'Shall we plan a softer day?',
    thinkingLines: ['hopping through your week', 'nibbling on the numbers', 'thinking softly'],
  },
  kit: {
    id: 'kit', number: 7, name: 'Kit', accent: '#FB923C', ground: '#26160E', focus: 'Bedtime',
    tagline: 'Dry wit. Gently judges your bedtime.',
    greeting: "Oh, you're up. Want to talk about last night?",
    thinkingLines: ['pretending not to care', 'judging your bedtime', 'licking a paw, one sec'],
  },
  axo: {
    id: 'axo', number: 8, name: 'Axo', accent: '#F472B6', ground: '#27101E', focus: 'Recovery',
    tagline: 'Endlessly cheerful, all about bouncing back.',
    greeting: 'Want to see how your recovery is doing?',
    thinkingLines: ['regenerating ideas', 'bouncing back with an answer', 'wiggling its gills'],
  },
  boo: {
    id: 'boo', number: 9, name: 'Boo', accent: '#C7D2FE', ground: '#141633', focus: 'Wind-down',
    tagline: "Quiet and kind. Shows up when it's late.",
    greeting: "Still up? Let's wind down together.",
    thinkingLines: ['floating through your data', 'haunting your trends', 'peeking at last night'],
  },
  cap: {
    id: 'cap', number: 10, name: 'Cap', accent: '#EF4444', ground: '#260F10', focus: 'Balance',
    tagline: 'Grounded, with a little whimsy.',
    greeting: 'Want to find a calmer rhythm this week?',
    thinkingLines: ['getting to the root of it', 'finding your balance', 'sprouting an idea'],
  },
  jelly: {
    id: 'jelly', number: 11, name: 'Jelly', accent: '#A78BFA', ground: '#1A1430', focus: 'Breathing',
    tagline: 'Floaty and chill. Loves a breathing break.',
    greeting: "Breathe in… and out. What's on your mind?",
    thinkingLines: ['drifting through the numbers', 'breathing it in', 'floating an idea'],
  },
  pengu: {
    id: 'pengu', number: 12, name: 'Pengu', accent: '#7C93B8', ground: '#111826', focus: 'Consistency',
    tagline: 'Steady over flashy, one waddle at a time.',
    greeting: 'Want to see how your streak is going?',
    thinkingLines: ['waddling through your week', 'sliding through the data', 'huddling up an answer'],
  },
  luna: {
    id: 'luna', number: 13, name: 'Luna', accent: '#FEF08A', ground: '#12132A', focus: 'Sleep',
    tagline: 'Sleepy moon. Your sleep coach, obviously.',
    greeting: "Mmm, hi. Want to talk about last night's sleep?",
    thinkingLines: ['counting stars', 'reading last night', 'tucking in the numbers'],
  },
  gloop: {
    id: 'gloop', number: 14, name: 'Gloop', accent: '#84CC16', ground: '#142010', focus: 'Workouts',
    tagline: 'Bouncy. Turns every workout into play.',
    greeting: 'Boing! Ready to move a little today?',
    thinkingLines: ['bubbling up an answer', 'bouncing through your week', 'going gloopy for a sec'],
  },
  bao: {
    id: 'bao', number: 15, name: 'Bao', accent: '#94A3B8', ground: '#15191F', focus: 'Movement',
    tagline: 'Big-hearted, into snacks and stretches.',
    greeting: "Time for a stretch? I'll do it with you.",
    thinkingLines: ['chewing it over', 'stretching for an answer', 'rolling through your data'],
  },
};

/** Any id the app doesn't know (retired coach, old build, bad cache, null) is Mochi. */
export function characterInfo(id: string | null | undefined): CharacterInfo {
  return CHARACTERS[isCharacterId(id) ? id : DEFAULT_CHARACTER_ID];
}
