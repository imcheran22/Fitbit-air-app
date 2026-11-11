// Compiles the type tokens the way NativeWind does on device (see
// jest-mocks/compileClass) and checks the native styles against spec §2.
import { FONTS, TYPE_TOKENS } from '../../src/theme';
import { inputNumberStyle, inputTextStyle } from '../../src/components/ui/input-style';
import { compile, staticStyle, type Rules } from '../../jest-mocks/compileClass';

const SCALE: Array<[string, { fontSize: number; lineHeight: number; letterSpacing?: number }]> = [
  ['text-score', { fontSize: 72, lineHeight: 72, letterSpacing: -3 }],
  ['text-number', { fontSize: 40, lineHeight: 44, letterSpacing: -1.5 }],
  ['text-display', { fontSize: 28, lineHeight: 32, letterSpacing: -0.4 }],
  ['text-heading', { fontSize: 22, lineHeight: 27, letterSpacing: -0.2 }],
  ['text-headline', { fontSize: 17, lineHeight: 22 }],
  ['text-body', { fontSize: 15, lineHeight: 21 }],
  ['text-caption', { fontSize: 13, lineHeight: 18 }],
  ['text-fine', { fontSize: 11, lineHeight: 14 }],
  ['text-page-title', { fontSize: 20, lineHeight: 26, letterSpacing: 1 }],
  ['text-label', { fontSize: 11, lineHeight: 14, letterSpacing: 1 }],
];

describe('the type scale compiled for native', () => {
  let rules14: Rules;
  let rules16: Rules;
  const classes = [...SCALE.map(([c]) => c), 'font-pixel', 'font-sans'];

  beforeAll(async () => {
    [rules14, rules16] = await Promise.all([compile(classes, 14), compile(classes, 16)]);
  }, 30000);

  it.each(SCALE)('%s draws at its px size, line height and tracking', (cls, expected) => {
    const style = staticStyle(rules14, cls);
    expect(style.fontSize).toBe(expected.fontSize);
    expect(style.lineHeight).toBe(expected.lineHeight);
    if (expected.letterSpacing === undefined) expect(style.letterSpacing).toBeUndefined();
    else expect(style.letterSpacing as number).toBeCloseTo(expected.letterSpacing, 5);
  });

  it('uses no rem-based size: every token compiles the same at rem 14 and rem 16', () => {
    const remDependent = classes.filter((c) => JSON.stringify(rules14.get(c)) !== JSON.stringify(rules16.get(c)));
    expect(remDependent).toEqual([]);
  });

  it('lists exactly these tokens, in this order, in TYPE_TOKENS', () => {
    expect(TYPE_TOKENS.map((t) => `text-${t}`)).toEqual(SCALE.map(([c]) => c));
  });

  it('maps font-pixel to Silkscreen and font-sans to Geist', () => {
    expect(staticStyle(rules14, 'font-pixel')).toEqual({ fontFamily: FONTS.pixel });
    expect(staticStyle(rules14, 'font-sans')).toEqual({ fontFamily: FONTS.sans });
  });
});

describe('input styles', () => {
  it('set Geist at the body size (and semibold tabular for a number field)', () => {
    expect(inputTextStyle).toEqual({ fontFamily: FONTS.sans, fontSize: 15 });
    expect(inputNumberStyle).toEqual({ fontFamily: FONTS.sansSemibold, fontSize: 15, fontVariant: ['tabular-nums'] });
  });
});
