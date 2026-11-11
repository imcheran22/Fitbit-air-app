import { classifyCrisis, CRISIS_RESOURCES, SAFETY_REPLY } from '../../src/coach/guardrails/crisis';

describe('pre-request crisis classifier', () => {
  it.each([
    ['explicit self-harm', 'I want to kill myself', 'self_harm'],
    ['suicide word', 'thinking about suicide lately', 'self_harm'],
    ['borderline: not wanting to be here', "I just don't want to be here anymore", 'self_harm'],
    ['borderline: better off without me', 'everyone would be better off without me', 'self_harm'],
    ['borderline: cannot go on (curly apostrophe)', 'I can’t go on like this', 'self_harm'],
    ['self harm phrase', 'urges to self-harm after a bad night', 'self_harm'],
    // -ing/-ed phrasings: the patterns covered 'cutting' and 'killing' but not
    // the other verbs, so these common wordings screened as ordinary messages.
    ['progressive: hurting myself', 'i keep hurting myself', 'self_harm'],
    ['progressive: harming myself', 'i have been harming myself', 'self_harm'],
    ['progressive: injuring myself', 'injuring myself again', 'self_harm'],
    ['progressive: ending it all', 'thinking about ending it all', 'self_harm'],
    ['past: hurt myself', 'i hurt myself last night', 'self_harm'],
    ['overdose', 'what happens in an overdose', 'self_harm'],
    ['dosing question', 'how much melatonin should I take to sleep', 'medication'],
    ['borderline: any dose word', 'is a higher dose better?', 'medication'],
    ['milligrams', 'can I take 10 mg of something', 'medication'],
    ['prescription mention', 'my prescription makes me groggy', 'medication'],
    ['chest pain', 'I have chest pain after my run', 'acute_symptom'],
    ['borderline: racing heart', 'my heart is racing and my HRV looks low', 'acute_symptom'],
    ['borderline: dizzy', 'I feel dizzy when I stand up', 'acute_symptom'],
    ['shortness of breath', 'shortness of breath at night', 'acute_symptom'],
    ['fainting', 'I nearly fainted this morning', 'acute_symptom'],
  ])('flags %s', (_label, message, category) => {
    const v = classifyCrisis(message);
    expect(v.triggered).toBe(true);
    expect(v.categories).toContain(category);
  });

  it.each([
    'why is my recovery score lower today',
    'how did I sleep last night',
    'what is my HRV trend this month',
    'which habits hurt my sleep score',
    'my legs hurt after that run',
    'i am taking it all a bit slower this week',
    'should I go to bed earlier',
    'how does alcohol affect my recovery',
    'what was my resting heart rate yesterday',
  ])('lets an ordinary question through: %s', (message) => {
    expect(classifyCrisis(message).triggered).toBe(false);
  });

  it('the fixed reply carries crisis resources and contains no model-generated placeholders', () => {
    expect(CRISIS_RESOURCES.length).toBeGreaterThanOrEqual(3);
    expect(CRISIS_RESOURCES.join(' ')).toMatch(/988/);
    expect(SAFETY_REPLY).not.toMatch(/\{\{/);
  });
});
