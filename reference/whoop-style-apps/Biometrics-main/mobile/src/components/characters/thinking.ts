// The two thinking settings (spec §4, §5). Ids match backend/src/coach/thinking.ts.
export const THINKING_ATTACHMENTS = ['bulb', 'cloud', 'typing', 'hourglass', 'gears', 'question', 'sparkles', 'clock', 'spinner'] as const;
export type ThinkingAttachmentId = (typeof THINKING_ATTACHMENTS)[number];
export const DEFAULT_THINKING_ATTACHMENT: ThinkingAttachmentId = 'bulb';

export const THINKING_TEXTS = ['lines', 'placeholder', 'tag', 'typewriter', 'nameplate', 'steps', 'shimmer', 'bouncy', 'dialog', 'strip'] as const;
export type ThinkingTextId = (typeof THINKING_TEXTS)[number];
export const DEFAULT_THINKING_TEXT: ThinkingTextId = 'steps';

const has = (list: readonly string[], v: unknown) => typeof v === 'string' && list.includes(v);
export const isThinkingAttachment = (v: unknown): v is ThinkingAttachmentId => has(THINKING_ATTACHMENTS, v);
export const isThinkingText = (v: unknown): v is ThinkingTextId => has(THINKING_TEXTS, v);

export const THINKING_ATTACHMENT_NAMES: Record<ThinkingAttachmentId, { name: string; blurb: string }> = {
  bulb: { name: 'Lightbulb', blurb: 'Flickers while it thinks, lights up when the answer lands.' },
  cloud: { name: 'Thought cloud', blurb: 'A thought bubble; the dots fill in one by one.' },
  typing: { name: 'Typing bubble', blurb: 'Three bouncing dots, like "is typing".' },
  hourglass: { name: 'Hourglass', blurb: 'Sand trickles through, grain by grain.' },
  gears: { name: 'Gears', blurb: 'Two cogs turning together.' },
  question: { name: '? → !', blurb: 'A question mark that pops into an !.' },
  sparkles: { name: 'Sparkles', blurb: 'Little stars twinkle around the head.' },
  clock: { name: 'Clock', blurb: 'The hand sweeps round, then a ding.' },
  spinner: { name: 'Spinner', blurb: 'A ring of pixels chasing each other.' },
};

export const THINKING_TEXT_NAMES: Record<ThinkingTextId, { name: string; blurb: string }> = {
  lines: { name: 'Personality lines', blurb: 'Your coach says what it is up to, in its own words.' },
  placeholder: { name: 'Reply placeholder', blurb: 'A shimmering reply bubble the answer flows into.' },
  tag: { name: 'Pixel status tag', blurb: 'A game-style THINKING tag with a blinking cursor.' },
  typewriter: { name: 'Typewriter', blurb: 'Your coach types its line letter by letter.' },
  nameplate: { name: 'Nameplate', blurb: 'A small name tag under your coach.' },
  steps: { name: "What it's doing", blurb: 'The real steps, ticked off as they happen.' },
  shimmer: { name: 'Colour shimmer', blurb: 'A sweep of your coach’s colour, with a timer.' },
  bouncy: { name: 'Bouncy letters', blurb: '"thinking" does a little wave.' },
  dialog: { name: 'Retro dialog box', blurb: 'An RPG text box the answer types into.' },
  strip: { name: 'Progress strip', blurb: 'A slim card with a moving progress strip.' },
};
