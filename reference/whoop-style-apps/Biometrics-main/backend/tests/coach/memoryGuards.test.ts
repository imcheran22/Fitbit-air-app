import { classifyHealthFact } from '../../src/coach/guardrails/healthFact';
import { classifyMemoryFeedback } from '../../src/coach/guardrails/memoryFeedback';
import { validateMemoryInput, MEMORY_CATEGORIES, MAX_MEMORY_VALUE_CHARS } from '../../src/coach/memory';

describe('health-fact classifier (memory second layer)', () => {
  it.each([
    'has a knee injury',
    'I am on medication for blood pressure',
    'diagnosed with hypertension',
    'takes 20 mg of something at night',
    'recovering from surgery',
    'has type 2 diabetes',
    'suffers from insomnia and anxiety',
    'my back pain flares up',
    'pregnant, due in spring',
    'heart condition',
    'takes melatonin',
    'feeling depressed lately',
  ])('blocks %j', (value) => {
    expect(classifyHealthFact(value).blocked).toBe(true);
  });

  it.each([
    'Training for a half marathon in October',
    'Runs at 6am on weekdays',
    'Prefers short, direct answers',
    'Wants to get stronger this year',
    'Lifts on Monday, Wednesday and Friday',
    'Likes evening workouts',
  ])('allows %j', (value) => {
    expect(classifyHealthFact(value).blocked).toBe(false);
  });

  it('is case- and apostrophe-insensitive', () => {
    expect(classifyHealthFact('HAS A KNEE INJURY').blocked).toBe(true);
  });
});

describe('memory input validation (allowlist)', () => {
  it('has exactly the three closed categories', () => {
    expect([...MEMORY_CATEGORIES]).toEqual(['TRAINING_GOAL', 'SCHEDULE', 'PREFERENCE']);
  });

  it('accepts a valid proposal and trims it', () => {
    expect(validateMemoryInput({ category: 'SCHEDULE', value: '  Runs at 6am  ' })).toEqual({
      ok: true,
      category: 'SCHEDULE',
      value: 'Runs at 6am',
    });
  });

  it.each([
    [{ category: 'MEDICAL', value: 'x' }, 'invalid_category'],
    [{ category: 'training_goal', value: 'x' }, 'invalid_category'],
    [{ category: undefined, value: 'x' }, 'invalid_category'],
    [{ category: 'PREFERENCE' }, 'invalid_value'],
    [{ category: 'PREFERENCE', value: 12 }, 'invalid_value'],
    [{ category: 'PREFERENCE', value: '   ' }, 'invalid_value'],
    [{ category: 'PREFERENCE', value: 'x'.repeat(MAX_MEMORY_VALUE_CHARS + 1) }, 'value_too_long'],
    [{ category: 'PREFERENCE', value: 'has a knee injury' }, 'health_content'],
  ])('rejects %j as %s', (input, reason) => {
    expect(validateMemoryInput(input)).toEqual({ ok: false, reason });
  });

  it('accepts exactly 140 characters', () => {
    expect(validateMemoryInput({ category: 'PREFERENCE', value: 'a'.repeat(140) }).ok).toBe(true);
  });

  it('rejects non-object input', () => {
    expect(validateMemoryInput(null)).toEqual({ ok: false, reason: 'invalid_category' });
    expect(validateMemoryInput('x')).toEqual({ ok: false, reason: 'invalid_category' });
  });
});

describe('next-message feedback detector', () => {
  const HALF = 'Training for a half-marathon in March';
  const MORNING = 'Prefers morning workouts';

  it.each([
    'thanks, what about my HRV',
    'ok how is my sleep score this week',
    'sounds good. can you compare last night to yesterday',
    'yes that is right',
    'that is right, thanks',
  ])('confirms on an uncorrected message: %j', (m) => {
    expect(classifyMemoryFeedback(m, HALF)).toBe('confirm');
  });

  // Rule 1: explicit memory-directed dismissal, whatever the entry says.
  it.each([
    'forget that',
    'forget it, how is my sleep',
    'Forget this please',
    'remove that',
    'delete it',
    'erase this',
    'scratch that',
    'ignore that',
    'disregard it',
    'discard this',
    'undo that',
    'cancel that',
    "don't remember that",
    "don't save it",
    "don't store this",
    "don't keep that",
    "that's not right",
    'no, that is not right',
    "that's not correct",
    "that's not true",
    "that's not accurate",
    "that's wrong",
    'that is wrong',
    'that was wrong',
    "that's incorrect",
    "that's a mistake",
    'you got that wrong',
    'you got it wrong',
    'never mind that',
    'nevermind it',
    'THAT’S NOT RIGHT', // curly apostrophe, upper case
    'DON’T SAVE THAT',
  ])('dismisses on an explicit memory-directed dismissal: %j', (m) => {
    expect(classifyMemoryFeedback(m, HALF)).toBe('dismiss');
    expect(classifyMemoryFeedback(m, MORNING)).toBe('dismiss');
    expect(classifyMemoryFeedback(m)).toBe('dismiss'); // needs no entry value
  });

  // Rule 2: a correction cue AND a shared content word with THAT entry.
  it.each([
    ["Actually it's a full marathon", HALF],
    ['no, the marathon is in April', HALF],
    ['I meant a 10k instead of the half', HALF],
    ['not mornings, I switched to evening workouts', MORNING],
    ['I changed the race, it is not in March any more', HALF],
    ['wrong, I prefer workouts in the morning', MORNING],
  ])('dismisses on a topical correction: %j against %j', (m, value) => {
    expect(classifyMemoryFeedback(m, value)).toBe('dismiss');
  });

  it('matches content words through light stemming', () => {
    expect(classifyMemoryFeedback('not marathons, actually', HALF)).toBe('dismiss');
    expect(classifyMemoryFeedback('no I am not training for that', 'Trains for a half marathon')).toBe('dismiss'); // trains / training -> train
    expect(classifyMemoryFeedback('actually I moved my workout', 'Likes morning workouts')).toBe('dismiss');
  });

  // The false positives that motivated the rewrite: a cue about something else must not delete.
  it.each([
    ['why is my score not higher', MORNING],
    ['I can’t believe how well I slept', MORNING],
    ["I can't believe how well I slept", HALF],
    ['no problem, thanks', MORNING],
    ['no problem, thanks', HALF],
    ['actually, how did I sleep last night', HALF],
    ['not sure what my HRV means', MORNING],
    ['wait, what does recovery mean', HALF],
    ['please stop the notifications', MORNING],
  ])('confirms a cue that is about something else: %j against %j', (m, value) => {
    expect(classifyMemoryFeedback(m, value)).toBe('confirm');
  });

  it('shared stop-words or words shorter than 3 letters never count', () => {
    expect(classifyMemoryFeedback('no, that is not for you and not with them', 'This is for you with them')).toBe('confirm');
    expect(classifyMemoryFeedback('no, go to it', 'Wants to go')).toBe('confirm');
  });

  it('a shared content word without any correction cue confirms', () => {
    expect(classifyMemoryFeedback('how is my marathon training going', HALF)).toBe('confirm');
  });

  it('an empty message is not a dismissal (deleting silently on no evidence is the wrong bias)', () => {
    expect(classifyMemoryFeedback('', HALF)).toBe('confirm');
    expect(classifyMemoryFeedback('   ', HALF)).toBe('confirm');
  });

  it('without an entry value only the explicit rule can dismiss', () => {
    expect(classifyMemoryFeedback('nope')).toBe('confirm');
    expect(classifyMemoryFeedback('I meant something else')).toBe('confirm');
  });
});
