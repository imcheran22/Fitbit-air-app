import { routeQuestion } from '../../src/coach/answer/route';

describe('routeQuestion', () => {
  it.each([
    // today: today's scores and readings, and "should I train" questions
    ['How am I doing today?', 'today'],
    ['Why is my recovery so low?', 'today'],
    ['What is my HRV this morning?', 'today'],
    ['Is my resting heart rate ok?', 'today'],
    ['Should I train hard today?', 'today'],
    ['How many steps have I done?', 'today'],
    // sleep: last night and this week's sleep
    ['How did I sleep?', 'sleep'],
    ['Why did I wake up so tired?', 'sleep'],
    ['What time should I go to bed tonight?', 'sleep'],
    ['How has my sleep been this week?', 'sleep'],
    ['Was my nap too long?', 'sleep'],
    // trends: weeks, months, habits, correlations, goals
    ['How has my HRV trended this month?', 'trends'],
    ['Does caffeine affect my recovery?', 'trends'],
    ['What habits hurt my scores?', 'trends'],
    ['How was my week?', 'trends'],
    ['Am I making progress on my goals?', 'trends'],
    ['Compare my sleep over the last 30 days', 'trends'],
    ['Did drinking last night change anything for me?', 'trends'],
    // general: health/fitness knowledge, no personal reference
    ['What is HRV?', 'general'],
    ['How much sleep do adults need?', 'general'],
    ['Why does alcohol affect sleep?', 'general'],
    ['Any tips for falling asleep faster?', 'general'],
    ['What does resting heart rate tell you?', 'general'],
    ['Is a cold shower good after a workout?', 'general'],
  ] as const)('%s -> %s', (message, route) => {
    expect(routeQuestion(message)).toBe(route);
  });

  it('routes an ambiguous personal question to today', () => {
    expect(routeQuestion('Talk to me')).toBe('today');
    expect(routeQuestion('hello')).toBe('today');
  });

  it('a short follow-up with no topic of its own inherits the previous question\'s route', () => {
    expect(routeQuestion('why?', 'How did I sleep?')).toBe('sleep');
    expect(routeQuestion('and what should I do about it?', 'Does caffeine affect my recovery?')).toBe('trends');
    expect(routeQuestion('tell me more', 'What is HRV?')).toBe('general');
  });

  it('a follow-up that names its own topic is routed on its own', () => {
    expect(routeQuestion('what about my sleep?', 'Does caffeine affect my recovery?')).toBe('sleep');
    expect(routeQuestion('and my HRV today?', 'How did I sleep?')).toBe('today');
  });

  it('a short follow-up without a previous question is ambiguous, so today', () => {
    expect(routeQuestion('why?')).toBe('today');
  });

  it.each([
    ["How's recovery today?", 'today'],
    ["What's today's score?", 'today'],
    ['Is HRV up today?', 'today'],
    ['How was last night?', 'sleep'],
    ["How was last night's sleep?", 'sleep'],
    ['Any change in recovery this week?', 'trends'],
    ['How are we doing today?', 'today'],
  ] as const)('an implicitly personal question never routes to general: %s -> %s', (message, route) => {
    expect(routeQuestion(message)).toBe(route);
  });

  // Final review I1: these all reached `general` and got no data.
  it.each([
    ['Why is recovery low?', 'today'],
    ['How did sleep go?', 'sleep'],
    ['Why is resting heart rate up?', 'today'],
    ['How many steps so far?', 'today'],
    ["How's HRV right now?", 'today'],
    ['Is HRV down lately?', 'trends'],
    ['How is recovery looking?', 'today'],
    ['Is recovery high?', 'today'],
    ['How is sleep score doing?', 'sleep'],
    ['Is readiness up?', 'today'],
    ['How is HRV currently?', 'today'],
    ['Can I run tomorrow?', 'today'],
    ['Has sleep improved recently?', 'trends'],
  ] as const)('a question about a user-only score or a metric\'s state is never general: %s -> %s', (message, route) => {
    expect(routeQuestion(message)).toBe(route);
  });

  it.each([
    ['Should I work out today?', 'today'],
    ['Should I hit the gym this morning?', 'today'],
    ['Can I exercise right now?', 'today'],
  ] as const)('a workout question about today goes to today, not trends: %s -> %s', (message, route) => {
    expect(routeQuestion(message)).toBe(route);
  });

  it.each([
    'How much sleep do adults need?',
    'What is HRV?',
    'What is recovery?',
    'What causes low HRV?',
    'What does a high resting heart rate mean?',
    'What is a good sleep score?',
    'How many steps should adults take?',
    'Is caffeine bad for sleep?',
    'What is HRV?',
    'Tips for better sleep?',
    'Is 7 hours of sleep enough?',
    // R49: mechanism and population shapes stay general even with a score or state word.
    'Why does HRV go down with age?',
    'How is the recovery score calculated?',
    'Why is HRV higher in the morning?',
    'Is it bad to run when HRV is low?',
    'Does stretching help recovery?',
  ])('keeps a definitional or population question general: %s', (message) => {
    expect(routeQuestion(message)).toBe('general');
  });

  it('a personal follow-up to a general question routes on the previous topic, personally', () => {
    expect(routeQuestion('and what is mine?', 'What is HRV?')).toBe('today');
    expect(routeQuestion('is mine normal?', 'What does resting heart rate tell you?')).toBe('today');
    expect(routeQuestion('how about for me?', 'How much sleep do adults need?')).toBe('sleep');
    // "tell me" is an imperative, not a personal reference
    expect(routeQuestion('tell me more', 'What is HRV?')).toBe('general');
  });

  it('a today metric beats a sleep match that rests only on "night" or "tired"', () => {
    expect(routeQuestion('Why is my recovery low after last night?')).toBe('today');
    expect(routeQuestion("I'm tired, should I train today?")).toBe('today');
    expect(routeQuestion('Why did I wake up so tired?')).toBe('sleep');
  });

  it('is case- and apostrophe-insensitive', () => {
    expect(routeQuestion('HOW DID I SLEEP')).toBe('sleep');
    expect(routeQuestion('What’s HRV?')).toBe('general');
  });

  // The questions the app sends when a today bar, a sentence word or a
  // suggestion is tapped (mobile/src/lib/coachToday.ts). Kept in step by hand.
  it.each([
    ['Why is my recovery lower than usual today?', 'today'],
    ['Why is my recovery higher than usual today?', 'today'],
    ['Why is my HRV lower than usual today?', 'today'],
    ['Why is my resting heart rate higher than usual today?', 'today'],
    ["How's my recovery looking today?", 'today'],
    ["How's my HRV looking today?", 'today'],
    ["How's my resting heart rate looking today?", 'today'],
    ['Should I train hard today?', 'today'],
    ['Why was my sleep shorter than usual last night?', 'sleep'],
    ['Why was my sleep longer than usual last night?', 'sleep'],
    ['How did I sleep last night?', 'sleep'],
    ['How much sleep do adults really need?', 'general'],
    ['What is HRV, and why does it matter?', 'general'],
    ['What helps the body recover after a hard workout?', 'general'],
  ])('routes the app question %p to %s', (message, route) => {
    expect(routeQuestion(message)).toBe(route);
    // A tapped question also routes the same mid-conversation.
    expect(routeQuestion(message, 'How did I sleep?')).toBe(route);
  });

  // The follow-up chips under an answer card (mobile/src/lib/coachAnswers.ts),
  // each sent after the question the card answered. Kept in step by hand.
  it.each([
    ["What's been affecting my sleep lately?", 'How did I sleep last night?', 'trends'],
    ["How's my sleep this week?", 'How did I sleep last night?', 'sleep'],
    ['Should I train today?', "How's my recovery looking today?", 'today'],
    ['What moved my recovery?', "How's my recovery looking today?", 'today'],
    ["What's been affecting my HRV lately?", "How's my HRV looking today?", 'trends'],
    ["How's my HRV this week?", "How's my HRV looking today?", 'trends'],
    ["What's been moving my resting heart rate lately?", "How's my resting heart rate looking today?", 'trends'],
    ["How's my resting heart rate this week?", "How's my resting heart rate looking today?", 'trends'],
    ['How have my steps been this week?', 'How many steps have I done?', 'trends'],
    // No topic of its own: inherits the habit question it follows.
    ['How sure is that?', 'Does caffeine affect my recovery?', 'trends'],
    ['Which habit should I change first?', 'Does caffeine affect my recovery?', 'trends'],
    // Under a card-less general answer: the same topic, about the user.
    ['How does that apply to me?', 'How much sleep do adults really need?', 'sleep'],
    ['How does that apply to me?', 'What is HRV, and why does it matter?', 'today'],
  ])('routes the follow-up %p after %p to %s', (message, previous, route) => {
    expect(routeQuestion(message, previous)).toBe(route);
  });
});
