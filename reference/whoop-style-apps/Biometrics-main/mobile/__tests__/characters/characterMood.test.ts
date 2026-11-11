import { ANSWERING_MS, characterMood } from '../../src/characters/characterMood';

const NOW = 1_000_000;
const base = { sending: false, answeredAt: null, now: NOW, recoveryBand: null } as const;

describe('characterMood', () => {
  it('is thinking while a message is sending', () => {
    expect(characterMood({ ...base, sending: true })).toBe('thinking');
  });

  it('is answering just after a reply arrives', () => {
    expect(characterMood({ ...base, answeredAt: NOW })).toBe('answering');
  });

  it('is still answering 1 ms before ANSWERING_MS has passed', () => {
    expect(characterMood({ ...base, answeredAt: NOW - (ANSWERING_MS - 1) })).toBe('answering');
  });

  it('stops answering exactly at ANSWERING_MS', () => {
    expect(characterMood({ ...base, answeredAt: NOW - ANSWERING_MS })).toBe('idle');
  });

  it('does not treat a reply stamped in the future (clock moved back) as fresh', () => {
    expect(characterMood({ ...base, answeredAt: NOW + 1000 })).toBe('idle');
  });

  it('is resting on a poor recovery day', () => {
    expect(characterMood({ ...base, recoveryBand: 'scorePoor' })).toBe('resting');
  });

  it.each(['scoreExcellent', 'scoreGood', 'scoreFair'] as const)('is idle on a %s recovery day', (band) => {
    expect(characterMood({ ...base, recoveryBand: band })).toBe('idle');
  });

  it('is idle with nothing going on and no recovery score', () => {
    expect(characterMood(base)).toBe('idle');
  });

  it('ANSWERING_MS is 2.5 s', () => {
    expect(ANSWERING_MS).toBe(2500);
  });

  describe('precedence (first match wins)', () => {
    it('sending beats a fresh reply', () => {
      expect(characterMood({ ...base, sending: true, answeredAt: NOW })).toBe('thinking');
    });

    it('sending beats a poor recovery day', () => {
      expect(characterMood({ ...base, sending: true, recoveryBand: 'scorePoor' })).toBe('thinking');
    });

    it('a fresh reply beats a poor recovery day', () => {
      expect(characterMood({ ...base, answeredAt: NOW - 100, recoveryBand: 'scorePoor' })).toBe('answering');
    });

    it('a poor recovery day shows again once the reply is no longer fresh', () => {
      expect(characterMood({ ...base, answeredAt: NOW - ANSWERING_MS, recoveryBand: 'scorePoor' })).toBe('resting');
    });
  });
});
