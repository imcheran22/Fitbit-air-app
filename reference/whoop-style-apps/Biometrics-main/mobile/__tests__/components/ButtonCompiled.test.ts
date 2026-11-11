// Compiles the Button's classes the way NativeWind does on device (see
// jest-mocks/compileClass) and checks the native styles. Class-string tests
// can't catch a rem-based class drawing 12.5% small, or a colour class that
// also sets a border width.
import { buttonTextVariants, buttonVariants, type ButtonSize, type ButtonVariant } from '../../src/components/ui/button';
import { cn } from '../../src/lib/utils';
import { compile, setsProperty, staticStyle, type Rules } from '../../jest-mocks/compileClass';

const VARIANTS: ButtonVariant[] = ['default', 'outline', 'secondary', 'ghost', 'destructive', 'link'];
const SIZES: ButtonSize[] = ['xs', 'sm', 'default', 'lg', 'icon', 'icon-xs', 'icon-sm', 'icon-lg'];
// The padding classes the Button adds beside an icon, and its group classes.
const EXTRA = 'pl-[8px] pr-[8px] pl-[6px] pr-[6px] pl-[10px] pr-[10px] -ml-px rounded-r-none rounded-l-none rounded-none border-l border-l-border opacity-50';

function allClasses(): string[] {
  const set = new Set<string>(EXTRA.split(' '));
  for (const variant of VARIANTS) {
    for (const size of SIZES) {
      for (const c of cn(buttonVariants({ variant, size })).split(' ')) set.add(c);
      for (const c of buttonTextVariants({ variant, size }).split(' ')) set.add(c);
    }
  }
  return [...set].filter(Boolean);
}

describe('Button classes compiled for native', () => {
  let rules14: Rules;
  let rules16: Rules;
  const classes = allClasses();

  beforeAll(async () => {
    [rules14, rules16] = await Promise.all([compile(classes, 14), compile(classes, 16)]);
  }, 30000);

  it('compiles every class (no typos, nothing web-only)', () => {
    const missing = classes.filter((c) => !rules14.has(c));
    expect(missing).toEqual([]);
  });

  it('uses no rem-based sizes: every class compiles the same at rem 14 and rem 16', () => {
    const remDependent = classes.filter((c) => JSON.stringify(rules14.get(c)) !== JSON.stringify(rules16.get(c)));
    expect(remDependent).toEqual([]);
  });

  it.each<[ButtonSize, Record<string, number>]>([
    ['xs', { height: 24, paddingLeft: 8, paddingRight: 8 }],
    ['sm', { height: 32, paddingLeft: 10, paddingRight: 10 }],
    ['default', { height: 36, paddingLeft: 10, paddingRight: 10 }],
    ['lg', { height: 40, paddingLeft: 12, paddingRight: 12 }],
    ['icon-xs', { width: 24, height: 24 }],
    ['icon-sm', { width: 32, height: 32 }],
    ['icon', { width: 36, height: 36 }],
    ['icon-lg', { width: 40, height: 40 }],
  ])('%s draws at its shadcn px size', (size, expected) => {
    const style = Object.assign({}, ...cn(buttonVariants({ size })).split(' ').map((c) => staticStyle(rules14, c)));
    expect(style).toEqual(expect.objectContaining({ ...expected, borderRadius: 8, borderWidth: 1 }));
  });

  it.each<[ButtonSize, number, number]>([
    ['xs', 11, 14],
    ['sm', 13, 18],
    ['default', 15, 21],
    ['lg', 15, 21],
  ])('%s label is %dpx on a %dpx line', (size, fontSize, lineHeight) => {
    const style = Object.assign({}, ...buttonTextVariants({ size }).split(' ').map((c) => staticStyle(rules14, c)));
    expect(style).toEqual(expect.objectContaining({ fontSize, lineHeight }));
  });

  it('keeps the dark outline border 1 px: dark:border-input sets only the colour', () => {
    expect(staticStyle(rules14, 'border')).toEqual({ borderWidth: 1 });
    expect(setsProperty(rules14, 'dark:border-input', 'borderColor')).toBe(true);
    expect(setsProperty(rules14, 'dark:border-input', 'borderWidth')).toBe(false);
  });

  it('gives the outline no native shadow', () => {
    for (const c of cn(buttonVariants({ variant: 'outline' })).split(' ')) {
      expect(setsProperty(rules14, c, 'shadowOpacity')).toBe(false);
      expect(setsProperty(rules14, c, 'elevation')).toBe(false);
    }
  });
});
