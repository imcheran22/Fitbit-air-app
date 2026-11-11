import { cn, mixWithWhite, withAlpha } from '../../src/lib/utils';

describe('cn', () => {
  it('keeps a type token alongside a text colour', () => {
    expect(cn('text-foreground', 'text-caption text-muted-foreground')).toBe('text-caption text-muted-foreground');
    expect(cn('text-label uppercase text-muted-foreground', 'text-foreground')).toBe('text-label uppercase text-foreground');
  });

  it('lets a later type token replace an earlier one, and a one-off size replace a token', () => {
    expect(cn('text-heading', 'text-score')).toBe('text-score');
    expect(cn('text-page-title', 'text-[28px]')).toBe('text-[28px]');
  });

  it('does not read the score colours as the score size', () => {
    expect(cn('text-score', 'text-score-good')).toBe('text-score text-score-good');
  });

  it('treats font-pixel as a family, so it survives a weight class', () => {
    expect(cn('font-pixel', 'font-bold')).toBe('font-pixel font-bold');
  });

  it('merges the custom radii with stock ones', () => {
    expect(cn('rounded-xl', 'rounded-card')).toBe('rounded-card');
  });
});

describe('withAlpha', () => {
  it('turns an rgb() token into rgba()', () => {
    expect(withAlpha('rgb(45, 212, 191)', 0.16)).toBe('rgba(45, 212, 191, 0.16)');
  });

  it('leaves anything else untouched', () => {
    expect(withAlpha('#fff', 0.5)).toBe('#fff');
  });
});

describe('mixWithWhite', () => {
  it('moves each channel a share of the way to white', () => {
    expect(mixWithWhite('rgb(55, 48, 163)', 0.2)).toBe('rgb(95, 89, 181)');
    expect(mixWithWhite('rgb(55, 48, 163)', 0)).toBe('rgb(55, 48, 163)');
    expect(mixWithWhite('rgb(55, 48, 163)', 1)).toBe('rgb(255, 255, 255)');
  });

  it('leaves a colour it cannot read unchanged', () => {
    expect(mixWithWhite('#fff', 0.5)).toBe('#fff');
  });
});
