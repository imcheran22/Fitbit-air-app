import { nightsToGo } from '../../src/lib/regularityCopy';

describe('nightsToGo', () => {
  it('counts the nights still needed for a 7-night score (4 at least)', () => {
    expect(nightsToGo(7, 0)).toBe(4);
    expect(nightsToGo(7, 2)).toBe(2);
    expect(nightsToGo(7, 3)).toBe(1);
  });

  it('counts against 15 for a 30-night score', () => {
    expect(nightsToGo(30, 10)).toBe(5);
  });

  it('never goes below zero', () => {
    expect(nightsToGo(7, 4)).toBe(0);
    expect(nightsToGo(7, 6)).toBe(0);
    expect(nightsToGo(30, 20)).toBe(0);
  });
});
