import {
  answeringStart,
  attachmentFrame,
  moodEyes,
  showsAttachment,
  ATTACHMENT_DONE_MS,
  ATTACHMENT_LOOP_MS,
} from '../../src/components/characters/attachments/frames';
import { THINKING_ATTACHMENTS } from '../../src/components/characters/thinking';

it.each(THINKING_ATTACHMENTS)('%s draws inside the 36×32 stage, away from the coach body', (id) => {
  for (let t = 0; t < ATTACHMENT_LOOP_MS; t += 50) {
    for (const done of [false, true]) {
      for (const [x, y] of attachmentFrame(id, t, done)) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(36);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThan(32);
      }
    }
  }
});

it.each(THINKING_ATTACHMENTS)('%s has a distinct "answer\'s here" frame and animates while thinking', (id) => {
  const keys = new Set(Array.from({ length: 64 }, (_, i) => JSON.stringify(attachmentFrame(id, i * 50, false))));
  expect(keys.size).toBeGreaterThan(1);
  expect(JSON.stringify(attachmentFrame(id, 0, true))).not.toEqual(JSON.stringify(attachmentFrame(id, 0, false)));
});

it('maps moods to eyes; reduce-motion keeps mood eyes (Review Focus 5)', () => {
  expect(moodEyes('idle', false)).toBe('open');
  expect(moodEyes('idle', true)).toBe('blink');
  expect(moodEyes('thinking', false)).toBe('up');
  expect(moodEyes('answering', true)).toBe('happy');
  expect(moodEyes('resting', false)).toBe('shut');
});

it("bulb's lit frame draws exactly the mockup's on-stage rays and glow corners (R12)", () => {
  const extras = attachmentFrame('bulb', 0, true)
    .filter(([, , c]) => c === '#FEF08A' || c === 'rgba(253,224,71,0.45)')
    .map(([x, y, c]) => `${x},${y},${c === '#FEF08A' ? 'ray' : 'glow'}`)
    .sort();
  expect(extras).toEqual(['23,1,ray', '24,2,ray', '22,5,ray', '23,5,ray', '24,0,glow', '34,0,glow', '24,9,glow', '34,9,glow'].sort());
});

describe('showsAttachment (R25)', () => {
  it('shows throughout thinking', () => {
    expect(showsAttachment('thinking', 0)).toBe(true);
    expect(showsAttachment('thinking', 60_000)).toBe(true);
  });

  it("shows the answer's-here frame for ATTACHMENT_DONE_MS (0.8 s) of answering, then hides it", () => {
    expect(ATTACHMENT_DONE_MS).toBe(800);
    expect(showsAttachment('answering', 0)).toBe(true);
    expect(showsAttachment('answering', 799)).toBe(true);
    expect(showsAttachment('answering', 800)).toBe(false);
    expect(showsAttachment('answering', 2000)).toBe(false);
  });

  it('never shows idle or resting', () => {
    expect(showsAttachment('idle', 0)).toBe(false);
    expect(showsAttachment('resting', 0)).toBe(false);
  });
});

describe('answeringStart', () => {
  it('latches the first running tick of answering and clears on any other mood', () => {
    expect(answeringStart(null, 'thinking', 5000)).toBeNull();
    expect(answeringStart(null, 'answering', 5000)).toBe(5000);
    expect(answeringStart(5000, 'answering', 5900)).toBe(5000);
    expect(answeringStart(5000, 'idle', 6000)).toBeNull();
  });

  it('waits for the clock to tick (t = 0 is a clock not yet started, or a paused one)', () => {
    expect(answeringStart(null, 'answering', 0)).toBeNull();
    expect(answeringStart(null, 'answering', 120)).toBe(120);
  });
});
