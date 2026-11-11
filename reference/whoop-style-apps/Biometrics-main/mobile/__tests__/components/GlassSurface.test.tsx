import { pickMaterial } from '../../src/components/ui/glass-surface';

describe('pickMaterial', () => {
  const ios26 = { platform: 'ios', liquidGlass: true, glassApi: true, reduceTransparency: false };

  it('uses Liquid Glass on iOS 26 when the runtime API is there', () => {
    expect(pickMaterial(ios26)).toBe('glass');
  });

  it('falls back to the system blur when the glass API is missing (older iOS, early iOS 26 betas)', () => {
    expect(pickMaterial({ ...ios26, liquidGlass: false })).toBe('blur');
    expect(pickMaterial({ ...ios26, glassApi: false })).toBe('blur');
  });

  it('is opaque under Reduce Transparency', () => {
    expect(pickMaterial({ ...ios26, reduceTransparency: true })).toBe('solid');
  });

  it('is opaque off iOS', () => {
    expect(pickMaterial({ ...ios26, platform: 'android' })).toBe('solid');
  });
});
