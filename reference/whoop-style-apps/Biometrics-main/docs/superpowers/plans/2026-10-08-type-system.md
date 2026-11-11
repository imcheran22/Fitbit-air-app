# Type System (A4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the mobile app from 4 font families and ~75 size/weight combinations to one scale: Geist for everything you read, Silkscreen for page titles and small labels, no Instrument Serif or Menlo, enforced by a convention test.

**Architecture:** Ten px type tokens in `tailwind.config.js` (`text-score` … `text-label`) are the only sizes. `ui/text.tsx` turns a class list into the right face (pixel tokens → Silkscreen, each Geist token → its own weight, a weight class wins) and tabular figures (number tokens, or `tabular-nums`). A new `PageTitle` and the pixel `SectionLabel` carry the pixel voice; one `inputTextStyle` gives every `TextInput` Geist. A guard test (`typography.test.ts`) starts with every not-yet-migrated file allowlisted with its exact count; each migration task deletes its files from that list, so progress is enforced, and the last tasks leave only the permanent exemptions (Campfire scene, share cards, the primitives).

**Tech Stack:** Expo 57, React Native, NativeWind 4 (native rem = 14), tailwind-merge, expo-font, Jest + @testing-library/react-native.

**Spec:** `docs/superpowers/specs/2026-10-08-type-system-design.md` (approved as written: the Campfire panel's section labels become pixel `SectionLabel`s; the Campfire scene, banner and note bubbles render unchanged).

## Global Constraints

- Scope: `mobile/` only. No backend changes. Branch `feature/type-system`, off main `120e739`. One PR at the end, no attribution.
- Families: Geist (`Geist_400Regular`, `Geist_500Medium`, `Geist_600SemiBold`, `Geist_700Bold`, `Geist_800ExtraBold`) and Silkscreen (`Silkscreen`, from `mobile/assets/fonts/Silkscreen-Regular.ttf`). Instrument Serif and Menlo (`MONO`) are removed by the end.
- The scale, verbatim from spec §2 (every value in px; these replace `eyebrow`, `numeral*` and `display*`):

  | Token | Family / weight | Size / line / tracking |
  |---|---|---|
  | `text-score` | Geist 600, tabular | 72 / 72 / −3 |
  | `text-number` | Geist 600, tabular | 40 / 44 / −1.5 |
  | `text-display` | Geist 700 | 28 / 32 / −0.4 |
  | `text-heading` | Geist 600 | 22 / 27 / −0.2 |
  | `text-headline` | Geist 600 | 17 / 22 |
  | `text-body` | Geist 400 | 15 / 21 |
  | `text-caption` | Geist 400 | 13 / 18 |
  | `text-fine` | Geist 500 | 11 / 14 |
  | `text-page-title` | Silkscreen | 20 / 26 / 1, uppercase |
  | `text-label` | Silkscreen | 11 / 14 / 1, uppercase |

- `text-fine` is for chart axes, legends and `xs` buttons only.
- Number tokens are tabular through `Text`; callers stop adding `fontVariant` by hand.
- Native stack headers: Silkscreen 15, every `title` uppercase. `TabsNavigator` loses its stray `fontWeight: '600'`.
- Buttons: `lg`/`default` → `text-body`, `sm` → `text-caption`, `xs` → `text-fine`, all Geist 500.
- Campfire (spec §6): `components/social/CampScene.tsx` and `components/social/CampBanner.tsx` have **zero diff** vs `120e739`. `screens/CampfireScreen.tsx` changes only its two panel labels (TONIGHT'S FIRE, WHO'S HERE) to `SectionLabel`. `components/social/CampNoteCard.tsx` changes only its `TextInput` (the shared input style, spec §3). Shared components (Button, SectionLabel, GoodnightButton, ReportSheet) change globally.
- Share cards (`WeeklyStoryView`, `RecapCardView`, `YearPixelsView`, `RecapShelf`'s tiles, `BadgeShareCard`, `CelebrationModal`) keep their inline `u()`/`a()`-scaled sizes. They use only Geist and pixel already (no serif): no change to their image output.
- Font scaling policy is unchanged (spec §7): never add `allowFontScaling={false}` or a new `maxFontSizeMultiplier`.
- Every `TextInput` uses `inputTextStyle` (or `inputNumberStyle`) from `src/components/ui/input-style.ts`.
- Comments count for the guard: name a token in a comment, never a banned class (`text-sm`, `text-[13px]`, `font-display`, `text-eyebrow`).
- Line numbers in this plan are from `120e739`; match on the quoted text, which is exact.
- Run every command from `mobile/`:
  - Jest: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit <paths>`
  - tsc: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/tsc --noEmit --types jest,node --pretty false`
- Baselines on `120e739`: Jest 241 suites / 2745 tests / 11 snapshots, all passing. tsc exactly these 12 errors and no new ones (line numbers in an edited test file may shift; the file and code may not change):
  - `__tests__/api/client.test.tsx(37,12) TS18046`
  - `__tests__/api/client.test.tsx(57,12) TS18046`
  - `__tests__/components/ActivityHeatmap.test.tsx(206,14) TS18048`
  - `__tests__/components/ActivityHeatmap.test.tsx(207,17) TS2345`
  - `__tests__/components/FactorBar.test.tsx(29,63) TS2339`
  - `__tests__/components/ScoreRing.test.tsx(11,12) TS7053`
  - `__tests__/screens/MetricDetailScreen.test.tsx(50,34) TS2345`
  - `__tests__/screens/MetricDetailScreen.test.tsx(51,34) TS2345`
  - `__tests__/screens/MetricDetailScreen.test.tsx(101,36) TS2345`
  - `__tests__/screens/MetricDetailScreen.test.tsx(102,36) TS2345`
  - `__tests__/screens/MetricDetailScreen.test.tsx(105,36) TS2345`
  - `App.tsx(1,8) TS2882`
- Tests: update a test only where it asserts an old class, the serif, `MONO`, or a title's case. Never weaken a behavioural assertion (what shows, when, for whom). Snapshot updates (`-u`) only after reading the diff and confirming it is class/face/size only.
- Commits: conventional messages (`feat(mobile): …`, `refactor(mobile): …`, `test(mobile): …`). No `Co-Authored-By` trailer, no mention of Claude or AI anywhere.

## Review Focus

1. **Long names in uppercase pixel titles.** A buddy's display name (BuddyWeek), an `@handle` (Chats) or "Your week with <coach>" (Recap) set in 20-px Silkscreen caps must wrap (or truncate where the caller passed `numberOfLines`), never clip, and a screen reader must hear the original case. Pinned: Task 1 `PageTitle.test.tsx` ("wraps a long title…", "reads the original case…"); Task 7 BuddyWeek long-name test; Task 8 Chats handle test.
2. **Dynamic Type on the pixel face.** Page titles and labels must keep scaling with the system text size (the spec keeps `allowFontScaling` as is). Pinned: Task 1 `PageTitle.test.tsx` and `Text.test.tsx` ("keeps scaling with the system text size").
3. **Numbers losing tabular figures** when the hand-written `style={{ fontVariant: ['tabular-nums'] }}` goes. Pinned: Task 1 `Text.test.tsx` (`textStyleFor`); Task 4 metric tile/score ring tests; Task 5 heatmap stat and night sheet tests (rendered `fontVariant`).
4. **Input placeholder in the system font.** iOS draws the placeholder in the input's own font; an input without the shared style shows a system-font placeholder. Pinned: Task 3 `inputs.test.tsx` (each of the four formerly fontless inputs, empty, with its placeholder: Geist 15).
5. **First paint before Silkscreen loads.** With Silkscreen no longer awaited, the first frames of every pixel title would draw in a stand-in face. Pinned: Task 1 `App.test.tsx` ("waits for Silkscreen with Geist…").

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `mobile/tailwind.config.js` | The ten tokens; `fontFamily.pixel`; old keys removed in Task 11 | 1, 11 |
| `mobile/src/theme.ts` | `FONTS.pixel`, `TYPE_TOKENS`; `FONTS.display` removed in Task 11 | 1, 11 |
| `mobile/src/lib/utils.ts` | tailwind-merge knows the tokens and `font-pixel` | 1, 11 |
| `mobile/src/components/ui/text.tsx` | `fontFamilyFor`, `textStyleFor`, `Text` | 1, 11 |
| `mobile/src/components/ui/streaming-text.tsx` | uses `textStyleFor` | 1 |
| `mobile/src/components/ui/page-title.tsx` (new) | `PageTitle` | 1 |
| `mobile/src/components/ui/section-label.tsx` | pixel `text-label` | 1 |
| `mobile/src/components/ui/input-style.ts` (new) | `inputTextStyle`, `inputNumberStyle` | 1 |
| `mobile/App.tsx` | Silkscreen awaited with Geist; serif dropped in Task 11 | 1, 11 |
| `mobile/src/components/coach/thinking/shared.ts` | `pixelFont()` falls back to Geist, not Menlo | 1 |
| `mobile/__tests__/conventions/typography.test.ts` (new) | the guard | 2 (and every later task edits its lists) |
| `mobile/src/navigation/headerStyle.ts` (new) | `headerTitleStyle(color)` for native headers | 3 |
| everything else under `mobile/src` | migrated by area | 3–10 |

## Migration rules (how every table below was decided)

Every replacement in Tasks 3–10 is listed per line. These rules are how the "caption or body by role" choices were made, so a reviewer can check them:

- **R1 body vs caption.** `text-base`, `text-[15px]`, `text-[14px]` → `text-body`. `text-sm`, `text-[13px]`, `text-[13.5px]`, `text-[12.5px]` → `text-body` when it is the thing being read (a sentence that is the card's content, a list row's main line, the coach's words, a row title); `text-caption` when it is secondary (muted lines, errors and notices under a control, timestamps, counts, helper text, values beside a label in a dense row).
- **R2 small.** `text-xs`, `text-[11px]`, `text-[11.5px]`, `text-[10.5px]`, `text-[10px]`, `text-[9px]`, `text-[12px]` → `text-caption`; → `text-fine` only on chart axes, legends, the tab bar, and data-grid cells that must keep their width (named per line).
- **R3 titles.** Serif `display-lg`/`display` screen titles → `PageTitle`. Serif `display-sm`/`display` verdicts, greetings, sheet titles, empty-state lines and story frame values → `text-heading` (the Home greeting → `text-display`; in-page headings that sit under a native header showing the screen's name, such as "Before you use the AI Coach" under AI COACH, → `text-display`, so the pixel title is not doubled; the screens spec §4 names as page titles (PairUp, Highlights, BuddyWeek) use `PageTitle` even under a header). `text-lg font-bold` / `text-xl font-bold` titles → `text-heading`.
- **R4 numbers.** `text-numeral-xl` → `text-score`; `text-numeral-lg` → `text-number`; `text-numeral` → `text-display tabular-nums`; `text-numeral-sm` → `text-heading tabular-nums`. A serif duration ("7h 32m") → `text-display tabular-nums` or `text-heading tabular-nums` by its old size. Small stat values (`text-lg font-bold` beside a label in a tile) → `text-headline tabular-nums`.
- **R5 labels.** `text-eyebrow … uppercase` and every hand-rolled kicker (`uppercase tracking-widest`, `tracking-[1.2px]`, letterSpacing 1–2 on 10–11 px) → `SectionLabel`, or `text-label uppercase` when it must keep its own colour.
- **R6 weights.** Drop a weight class that equals the token's own weight (`font-semibold` on `text-heading`/`text-headline`/`text-score`/`text-number`, `font-bold` on `text-display`); drop `font-bold` on number tokens (they are 600 by spec); keep weights on `text-body`/`text-caption`/`text-fine`.
- **R7 tabular.** Every `style={{ fontVariant: ['tabular-nums'] }}` becomes the `tabular-nums` class (dropped entirely on `text-score`/`text-number`). If that leaves `style` empty, remove the prop.
- **R8 leading/tracking.** Drop a `leading-*` or `tracking-*` that came with a replaced size (the token carries both), unless the line says to keep it.

---

### Task 1: Foundation (tokens, faces, PageTitle, pixel SectionLabel, input style, Silkscreen awaited)

**Files:**
- Modify: `mobile/tailwind.config.js` (fontFamily, fontSize)
- Modify: `mobile/src/theme.ts` (`FONTS`, new `TYPE_TOKENS`)
- Modify: `mobile/src/lib/utils.ts` (tailwind-merge groups)
- Modify: `mobile/src/components/ui/text.tsx`
- Modify: `mobile/src/components/ui/streaming-text.tsx:6,39`
- Create: `mobile/src/components/ui/page-title.tsx`
- Modify: `mobile/src/components/ui/section-label.tsx`
- Create: `mobile/src/components/ui/input-style.ts`
- Modify: `mobile/App.tsx:27-40`
- Modify: `mobile/src/components/coach/thinking/shared.ts:1-20`
- Test: `mobile/__tests__/components/Text.test.tsx` (new), `mobile/__tests__/components/PageTitle.test.tsx` (new), `mobile/__tests__/theme/typeTokens.test.ts` (new), `mobile/__tests__/theme/tokens.test.ts`, `mobile/__tests__/lib/utils.test.ts`, `mobile/__tests__/App.test.tsx`, `mobile/__tests__/components/ThinkingRow.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces (every later task uses these exact names):
  - Classes: `text-score`, `text-number`, `text-display`, `text-heading`, `text-headline`, `text-body`, `text-caption`, `text-fine`, `text-page-title`, `text-label`, `font-pixel`, and the marker class `tabular-nums`.
  - `FONTS.pixel === 'Silkscreen'` (`src/theme.ts`).
  - `TYPE_TOKENS: readonly ['score','number','display','heading','headline','body','caption','fine','page-title','label']` (`src/theme.ts`).
  - `fontFamilyFor(className?: string): string` and `textStyleFor(className?: string): TextStyle` (`src/components/ui/text.tsx`); `Text` unchanged in its props.
  - `PageTitle(props: Omit<TextProps, 'children'> & { className?: string; children: string })` (`src/components/ui/page-title.tsx`): uppercases `children`, `accessibilityRole="header"`, `accessibilityLabel` defaults to the original-case string, wraps unless `numberOfLines` is passed.
  - `SectionLabel` (same props as today) now draws `text-label uppercase text-muted-foreground`.
  - `inputTextStyle: TextStyle = { fontFamily: FONTS.sans, fontSize: 15 }` and `inputNumberStyle: TextStyle = { fontFamily: FONTS.sansSemibold, fontSize: 15, fontVariant: ['tabular-nums'] }` (`src/components/ui/input-style.ts`).
  - `pixelFont(): string` (still exported from `src/components/coach/thinking/shared.ts`, same path: the Campfire files import it): Silkscreen when loaded, else `FONTS.sans`. `shared.ts` no longer re-exports `MONO`.
  - The old keys (`text-eyebrow`, `text-numeral*`, `text-display-sm|lg`, `font-display`, `FONTS.display`) keep working until Task 11.

- [ ] **Step 1: Write the failing tests**

Create `mobile/__tests__/components/Text.test.tsx`:

```tsx
import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { Text, fontFamilyFor, textStyleFor } from '../../src/components/ui/text';
import { SectionLabel } from '../../src/components/ui/section-label';
import { FONTS } from '../../src/theme';

const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never) as Record<string, unknown>;
const classes = (el: { props: { className?: unknown } }) => String(el.props.className).split(' ');

describe('fontFamilyFor', () => {
  it('draws the pixel tokens and font-pixel in Silkscreen, whatever weight class sits beside them', () => {
    expect(fontFamilyFor('text-page-title')).toBe(FONTS.pixel);
    expect(fontFamilyFor('text-label uppercase text-muted-foreground')).toBe(FONTS.pixel);
    expect(fontFamilyFor('font-pixel text-[28px]')).toBe(FONTS.pixel);
    expect(fontFamilyFor('text-label font-semibold')).toBe(FONTS.pixel);
  });

  it('gives each Geist token its own weight', () => {
    expect(fontFamilyFor('text-score')).toBe(FONTS.sansSemibold);
    expect(fontFamilyFor('text-number')).toBe(FONTS.sansSemibold);
    expect(fontFamilyFor('text-display')).toBe(FONTS.sansBold);
    expect(fontFamilyFor('text-heading')).toBe(FONTS.sansSemibold);
    expect(fontFamilyFor('text-headline')).toBe(FONTS.sansSemibold);
    expect(fontFamilyFor('text-body')).toBe(FONTS.sans);
    expect(fontFamilyFor('text-caption text-muted-foreground')).toBe(FONTS.sans);
    expect(fontFamilyFor('text-fine')).toBe(FONTS.sansMedium);
  });

  it('lets a weight class beat the token weight', () => {
    expect(fontFamilyFor('text-body font-semibold')).toBe(FONTS.sansSemibold);
    expect(fontFamilyFor('text-heading font-bold')).toBe(FONTS.sansBold);
    expect(fontFamilyFor('text-display font-medium')).toBe(FONTS.sansMedium);
  });

  it('does not read a colour that starts with a token name as that token', () => {
    expect(fontFamilyFor('text-score-excellent')).toBe(FONTS.sans);
  });

  it('keeps the plain, weight and serif behaviour', () => {
    expect(fontFamilyFor(undefined)).toBe(FONTS.sans);
    expect(fontFamilyFor('font-bold font-medium')).toBe(FONTS.sansBold);
    expect(fontFamilyFor('font-display text-display-lg')).toBe(FONTS.display);
  });
});

describe('textStyleFor', () => {
  it('draws the number tokens with tabular figures', () => {
    expect(textStyleFor('text-score')).toEqual({ fontFamily: FONTS.sansSemibold, fontVariant: ['tabular-nums'] });
    expect(textStyleFor('text-number text-metric-steps')).toEqual({ fontFamily: FONTS.sansSemibold, fontVariant: ['tabular-nums'] });
  });

  it('makes any other text tabular with the tabular-nums class, and nothing else', () => {
    expect(textStyleFor('text-display tabular-nums')).toEqual({ fontFamily: FONTS.sansBold, fontVariant: ['tabular-nums'] });
    expect(textStyleFor('text-caption tabular-nums')).toEqual({ fontFamily: FONTS.sans, fontVariant: ['tabular-nums'] });
    expect(textStyleFor('text-heading')).toEqual({ fontFamily: FONTS.sansSemibold });
    expect(textStyleFor('text-score-good')).toEqual({ fontFamily: FONTS.sans });
    expect(textStyleFor(undefined)).toEqual({ fontFamily: FONTS.sans });
  });
});

describe('Text', () => {
  it('puts the face and the figures on the native text, under a caller style', () => {
    const { getByText } = render(
      <Text className="text-number" style={{ color: 'red' }}>
        42
      </Text>,
    );
    expect(flat(getByText('42'))).toEqual(expect.objectContaining({ fontFamily: FONTS.sansSemibold, fontVariant: ['tabular-nums'], color: 'red' }));
  });
});

describe('SectionLabel', () => {
  it('is the pixel label: text-label, uppercase, muted, with the caller classes', () => {
    const { getByText } = render(<SectionLabel className="flex-1">Your metrics</SectionLabel>);
    const label = getByText('Your metrics');
    expect(classes(label)).toEqual(expect.arrayContaining(['text-label', 'uppercase', 'text-muted-foreground', 'flex-1']));
    expect(classes(label)).not.toContain('font-semibold');
    expect(flat(label).fontFamily).toBe(FONTS.pixel);
  });

  it('keeps scaling with the system text size', () => {
    const label = render(<SectionLabel>Today</SectionLabel>).getByText('Today');
    expect(label.props.allowFontScaling).not.toBe(false);
    expect(label.props.maxFontSizeMultiplier).toBeUndefined();
  });
});
```

Create `mobile/__tests__/components/PageTitle.test.tsx`:

```tsx
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { PageTitle } from '../../src/components/ui/page-title';
import { FONTS } from '../../src/theme';

const family = (testID: string) => (StyleSheet.flatten(screen.getByTestId(testID).props.style) as { fontFamily?: string }).fontFamily;

it('draws the title uppercase in the pixel face, as a header', () => {
  render(<PageTitle testID="t">Activity</PageTitle>);
  const title = screen.getByTestId('t');
  expect(title).toHaveTextContent('ACTIVITY');
  expect(title.props.accessibilityRole).toBe('header');
  expect(String(title.props.className).split(' ')).toContain('text-page-title');
  expect(family('t')).toBe(FONTS.pixel);
});

it('reads the original case to a screen reader', () => {
  render(<PageTitle>Your week with Biscuit</PageTitle>);
  expect(screen.getByRole('header', { name: 'Your week with Biscuit' })).toHaveTextContent('YOUR WEEK WITH BISCUIT');
});

it('wraps a long title rather than clipping it, unless the caller asks for one line', () => {
  const long = 'Pair up with a friend who lives a long way away';
  render(<PageTitle testID="long">{long}</PageTitle>);
  expect(screen.getByTestId('long').props.numberOfLines).toBeUndefined();
  expect(screen.getByTestId('long')).toHaveTextContent(long.toUpperCase());

  render(
    <PageTitle testID="one" numberOfLines={1}>
      @a_very_long_handle_for_a_header
    </PageTitle>,
  );
  expect(screen.getByTestId('one').props.numberOfLines).toBe(1);
});

it('keeps scaling with the system text size', () => {
  render(<PageTitle testID="t">Social</PageTitle>);
  expect(screen.getByTestId('t').props.allowFontScaling).not.toBe(false);
  expect(screen.getByTestId('t').props.maxFontSizeMultiplier).toBeUndefined();
});

it('keeps the pixel face under a one-off size (the sign-in app name)', () => {
  render(
    <PageTitle testID="t" className="font-pixel text-[28px] leading-[34px] tracking-[1px]">
      Biometrics
    </PageTitle>,
  );
  expect(family('t')).toBe(FONTS.pixel);
  expect(screen.getByTestId('t')).toHaveTextContent('BIOMETRICS');
});
```

Create `mobile/__tests__/theme/typeTokens.test.ts` (same compile harness as `ButtonCompiled.test.ts`):

```ts
// Compiles the type tokens the way NativeWind does on device (tailwind with the
// project config, then react-native-css-interop at inlineRem 14) and checks the
// native styles against spec §2.
import * as fs from 'fs';
import * as path from 'path';
import { FONTS, TYPE_TOKENS } from '../../src/theme';
import { inputNumberStyle, inputTextStyle } from '../../src/components/ui/input-style';

process.env.NATIVEWIND_OS = 'ios';
const postcss = require('postcss');
const tailwind = require('tailwindcss');
const { cssToReactNativeRuntime } = require('react-native-css-interop/dist/css-to-rn');
const projectConfig = require('../../tailwind.config.js');

type Rules = Map<string, any>;

async function compile(classes: string[], inlineRem: number): Promise<Rules> {
  const css = fs.readFileSync(path.join(__dirname, '../../global.css'), 'utf8');
  const result = await postcss([tailwind({ ...projectConfig, content: [{ raw: classes.join(' ') }] })]).process(css, { from: undefined });
  const out = cssToReactNativeRuntime(result.css, { inlineRem });
  return out.rules instanceof Map ? out.rules : new Map(Array.isArray(out.rules) ? out.rules : Object.entries(out.rules ?? {}));
}

function staticStyle(rules: Rules, cls: string): Record<string, unknown> {
  const rule = rules.get(cls);
  if (!rule) throw new Error(`${cls} did not compile`);
  const decls: any[][] = rule.n.flatMap((n: any) => n.d);
  return Object.assign({}, ...decls.filter((d) => d.length === 1 && d[0] && typeof d[0] === 'object').map((d) => d[0]));
}

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
```

In `mobile/__tests__/theme/tokens.test.ts`, replace the `describe('type tokens', …)` block (lines 232–246) with:

```ts
describe('type tokens', () => {
  const tailwind = require('../../tailwind.config.js');

  it('registers the sans, pixel and display families under the names App.tsx loads', () => {
    expect(tailwind.theme.extend.fontFamily.sans).toEqual([FONTS.sans]);
    expect(tailwind.theme.extend.fontFamily.pixel).toEqual([FONTS.pixel]);
    expect(tailwind.theme.extend.fontFamily.display).toEqual([FONTS.display]);
  });

  it('loads every family in FONTS in the one awaited useFonts call in App.tsx', () => {
    const app = fs.readFileSync(path.join(__dirname, '../../App.tsx'), 'utf8');
    const calls = app.match(/useFonts\(\{[\s\S]*?\}\)/g) ?? [];
    expect(calls).toHaveLength(1);
    for (const family of Object.values(FONTS)) {
      expect(calls[0]).toMatch(new RegExp(`\\b${family}\\b\\s*[,:]`));
    }
  });
});
```

In `mobile/__tests__/lib/utils.test.ts`, replace the first test (`'keeps a custom font size alongside a text colour'`) and add three, keeping the others for now:

```ts
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
```

In `mobile/__tests__/App.test.tsx`, replace line 19 (`jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));`) with:

```ts
// App's one useFonts call: the test reads the families it asks for and decides whether they are in.
const mockUseFonts = jest.fn((_families: Record<string, unknown>) => [true, null] as [boolean, Error | null]);
jest.mock('expo-font', () => ({ useFonts: (families: Record<string, unknown>) => mockUseFonts(families) }));
```

add `mockUseFonts.mockImplementation(() => [true, null]);` as the first line inside the existing `beforeEach`, and add this test inside `describe('App', …)`:

```ts
  it('waits for Silkscreen with Geist before anything draws', () => {
    (authClient.useSession as jest.Mock).mockReturnValue({ data: null, isPending: false, error: null });
    mockUseFonts.mockImplementation(() => [false, null]);

    const { toJSON } = render(<App />);

    // The splash stays up: no frame of the app (and so no pixel title) draws in a stand-in face.
    expect(toJSON()).toBeNull();
    expect(mockUseFonts).toHaveBeenCalled();
    // Every call is the awaited one: Silkscreen is not loaded on the side any more.
    for (const [families] of mockUseFonts.mock.calls) {
      expect(Object.keys(families)).toEqual(expect.arrayContaining(['Geist_400Regular', 'Geist_600SemiBold', 'Silkscreen']));
    }
  });
```

In `mobile/__tests__/components/ThinkingRow.test.tsx`, change line 6 to `import { SILKSCREEN } from '../../src/components/coach/thinking/shared';`, add `import { FONTS } from '../../src/theme';` under it, and replace the test at lines 154–158 with:

```ts
it('tag falls back to Geist, never a mono face, if Silkscreen did not load', () => {
  mockFontLoaded = false;
  const s = render(<ThinkingRow style="tag" characterId="boba" steps={[]} paused testID="row" />);
  expect(flatStyle(s.getByText('THINKING').props.style).fontFamily).toBe(FONTS.sans);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/components/Text.test.tsx __tests__/components/PageTitle.test.tsx __tests__/theme __tests__/lib/utils.test.ts __tests__/App.test.tsx __tests__/components/ThinkingRow.test.tsx`
Expected: FAIL. `Cannot find module '../../src/components/ui/page-title'` and `…/input-style`; `textStyleFor is not a function`; `FONTS.pixel` undefined; `text-score did not compile`; App test sees two `useFonts` calls, the second without Geist; ThinkingRow sees `Menlo`.

- [ ] **Step 3: Implement**

`mobile/tailwind.config.js`: replace the `fontFamily` and `fontSize` blocks (lines 69–86) with:

```js
      // Family names must match FONTS in src/theme.ts (the expo-font keys).
      // ui/text.tsx resolves the class list to one of these per Text.
      fontFamily: {
        sans: ['Geist_400Regular'],
        pixel: ['Silkscreen'],
        // The serif, until its last call site moves (type-system plan, Task 11).
        display: ['InstrumentSerif_400Regular'],
      },
      // The type scale (docs/superpowers/specs/2026-10-08-type-system-design.md §2).
      // Every size is px: NativeWind's native rem is 14, so a rem class would
      // draw 12.5% small. ui/text.tsx gives each token its weight and face.
      fontSize: {
        score: ['72px', { lineHeight: '72px', letterSpacing: '-3px' }],
        number: ['40px', { lineHeight: '44px', letterSpacing: '-1.5px' }],
        display: ['28px', { lineHeight: '32px', letterSpacing: '-0.4px' }],
        heading: ['22px', { lineHeight: '27px', letterSpacing: '-0.2px' }],
        headline: ['17px', { lineHeight: '22px' }],
        body: ['15px', { lineHeight: '21px' }],
        caption: ['13px', { lineHeight: '18px' }],
        fine: ['11px', { lineHeight: '14px' }],
        'page-title': ['20px', { lineHeight: '26px', letterSpacing: '1px' }],
        label: ['11px', { lineHeight: '14px', letterSpacing: '1px' }],
        // The old keys, until their last call site moves (type-system plan, Task 11).
        eyebrow: ['11px', { lineHeight: '14px', letterSpacing: '1.4px' }],
        'numeral-sm': ['22px', { lineHeight: '26px', letterSpacing: '-0.5px' }],
        numeral: ['30px', { lineHeight: '34px', letterSpacing: '-1px' }],
        'numeral-lg': ['48px', { lineHeight: '52px', letterSpacing: '-1.8px' }],
        'numeral-xl': ['80px', { lineHeight: '84px', letterSpacing: '-3px' }],
        'display-sm': ['22px', { lineHeight: '28px' }],
        'display-lg': ['38px', { lineHeight: '42px' }],
      },
```

`mobile/src/theme.ts`: replace the `FONTS` comment and object (lines 222–234) with:

```ts
// Loaded once in App.tsx (expo-font), all before the splash screen hides.
// React Native picks a face by family name rather than by weight, so each
// weight is its own family; ui/text.tsx maps the classes onto these. Geist is
// everything you read; Silkscreen (pixel) is page titles and small labels.
export const FONTS = {
  sans: 'Geist_400Regular',
  sansMedium: 'Geist_500Medium',
  sansSemibold: 'Geist_600SemiBold',
  sansBold: 'Geist_700Bold',
  sansExtrabold: 'Geist_800ExtraBold',
  pixel: 'Silkscreen',
  // The serif, until its last call site moves (type-system plan, Task 11).
  display: 'InstrumentSerif_400Regular',
} as const;

// The type tokens: the fontSize keys in tailwind.config.js (text-score …
// text-label). lib/utils registers them with tailwind-merge, and Button keeps
// them off its spinner's colour.
export const TYPE_TOKENS = ['score', 'number', 'display', 'heading', 'headline', 'body', 'caption', 'fine', 'page-title', 'label'] as const;
```

`mobile/src/lib/utils.ts`: replace lines 1–16 with:

```ts
import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import { TYPE_TOKENS } from '../theme';

// tailwind-merge only knows Tailwind's stock scales. Unregistered, the type
// tokens in tailwind.config.js read as text *colours*, so
// cn('text-caption', 'text-muted-foreground') would silently drop the size.
// Keep these lists in step with the fontSize/fontFamily/borderRadius keys there.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [...TYPE_TOKENS, 'eyebrow', 'numeral-sm', 'numeral', 'numeral-lg', 'numeral-xl', 'display-sm', 'display-lg'] }],
      'font-family': [{ font: ['sans', 'pixel', 'display'] }],
      rounded: [{ rounded: ['tile', 'card'] }],
    },
  },
});
```

`mobile/src/components/ui/text.tsx` (whole file):

```tsx
import React from 'react';
import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { cn } from '../../lib/utils';
import { FONTS } from '../../theme';

// React Native picks a custom face by family name, so a `font-bold` class alone
// would keep drawing Geist Regular (or a synthesized bold). The class list is
// resolved to a family here instead, in this order:
//   1. the pixel tokens (text-page-title, text-label) and font-pixel: Silkscreen,
//      which has one weight, so a weight class beside them is ignored;
//   2. the serif opt-in, font-display, until its last call site moves;
//   3. a weight class, strongest first, so "font-bold" beats a stray "font-medium";
//   4. the token's own weight (spec §2: display 700; score, number, heading,
//      headline 600; fine 500);
//   5. Geist Regular.
const PIXEL = /(^|\s)(font-pixel|text-page-title|text-label)(\s|$)/;
const SERIF = /(^|\s)font-display(\s|$)/;
const WEIGHT_FAMILIES: Array<[RegExp, string]> = [
  [/(^|\s)font-(extrabold|black)(\s|$)/, FONTS.sansExtrabold],
  [/(^|\s)font-bold(\s|$)/, FONTS.sansBold],
  [/(^|\s)font-semibold(\s|$)/, FONTS.sansSemibold],
  [/(^|\s)font-medium(\s|$)/, FONTS.sansMedium],
];
const TOKEN_FAMILIES: Array<[RegExp, string]> = [
  [/(^|\s)text-display(\s|$)/, FONTS.sansBold],
  [/(^|\s)text-(score|number|heading|headline)(\s|$)/, FONTS.sansSemibold],
  [/(^|\s)text-fine(\s|$)/, FONTS.sansMedium],
];
// The number tokens always draw tabular figures; any other text opts in with
// the `tabular-nums` class (NativeWind compiles that class to nothing on native).
const TABULAR = /(^|\s)(text-score|text-number|tabular-nums)(\s|$)/;

export function fontFamilyFor(className?: string): string {
  if (!className) return FONTS.sans;
  if (PIXEL.test(className)) return FONTS.pixel;
  if (SERIF.test(className)) return FONTS.display;
  for (const [pattern, family] of WEIGHT_FAMILIES) {
    if (pattern.test(className)) return family;
  }
  for (const [pattern, family] of TOKEN_FAMILIES) {
    if (pattern.test(className)) return family;
  }
  return FONTS.sans;
}

/** What a class list means that NativeWind cannot draw on native: the face, and tabular figures. */
export function textStyleFor(className?: string): TextStyle {
  const style: TextStyle = { fontFamily: fontFamilyFor(className) };
  if (className && TABULAR.test(className)) style.fontVariant = ['tabular-nums'];
  return style;
}

// React 19 passes `ref` as a prop, so it reaches the native text through the spread.
export function Text({ className, style, ...props }: TextProps & { className?: string; ref?: React.Ref<RNText> }) {
  return <RNText className={cn('text-foreground', className)} style={[textStyleFor(className), style]} {...props} />;
}
```

`mobile/src/components/ui/streaming-text.tsx`: line 6 `import { fontFamilyFor } from './text';` → `import { textStyleFor } from './text';`; line 39 `style={[{ fontFamily: fontFamilyFor(className) }, style, animatedStyle]}` → `style={[textStyleFor(className), style, animatedStyle]}`.

Create `mobile/src/components/ui/page-title.tsx`:

```tsx
import React from 'react';
import { type TextProps } from 'react-native';
import { cn } from '../../lib/utils';
import { Text } from './text';

export type PageTitleProps = Omit<TextProps, 'children'> & { className?: string; children: string };

// Every screen's title (spec §3): Silkscreen at text-page-title, a header for
// screen readers. The string is uppercased here rather than with a class, so
// what is drawn and what a test reads agree; a screen reader gets the original
// case, which it reads as words rather than spelling out capitals. It wraps by
// default (a long buddy name or handle must not clip): pass numberOfLines to
// truncate instead. Font scaling is left as it is everywhere else.
export function PageTitle({ children, className, accessibilityLabel, ...props }: PageTitleProps) {
  return (
    <Text accessibilityRole="header" accessibilityLabel={accessibilityLabel ?? children} className={cn('text-page-title', className)} {...props}>
      {children.toUpperCase()}
    </Text>
  );
}
```

`mobile/src/components/ui/section-label.tsx` (whole file):

```tsx
import React from 'react';
import { type TextProps } from 'react-native';
import { cn } from '../../lib/utils';
import { Text } from './text';

// The small uppercase pixel label that heads a group ("YOUR METRICS"): the
// text-label token in Silkscreen. Screens use this instead of a bold title per
// card, so hierarchy comes from the numbers.
export function SectionLabel({ className, children, ...props }: TextProps & { className?: string }) {
  return (
    <Text className={cn('text-label uppercase text-muted-foreground', className)} {...props}>
      {children}
    </Text>
  );
}
```

Create `mobile/src/components/ui/input-style.ts`:

```ts
import type { TextStyle } from 'react-native';
import { FONTS } from '../../theme';

// Every TextInput's text (spec §3): Geist at the text-body size. A TextInput
// does not go through ui/text, so without this it (and its placeholder, which
// iOS draws in the input's font) falls back to the system font. No lineHeight:
// on iOS a single-line input with one draws its text low. Spread it first, then
// the input's own layout and colour: style={[inputTextStyle, { … }]}.
export const inputTextStyle: TextStyle = { fontFamily: FONTS.sans, fontSize: 15 };

// A number field (the habit amount): the same size in semibold tabular figures.
export const inputNumberStyle: TextStyle = { fontFamily: FONTS.sansSemibold, fontSize: 15, fontVariant: ['tabular-nums'] };
```

`mobile/App.tsx`: replace lines 27–41 (the comment, both `useFonts` calls and the early return) with:

```tsx
  // Keys are the family names in FONTS (src/theme.ts). The splash screen stays
  // up until they all load, Silkscreen with them, so no pixel title or label
  // ever draws in a stand-in face; a load error still renders the app on
  // system fonts rather than a blank screen.
  const [fontsLoaded, fontError] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
    Geist_800ExtraBold,
    InstrumentSerif_400Regular,
    Silkscreen: require('./assets/fonts/Silkscreen-Regular.ttf'),
  });
  if (!fontsLoaded && !fontError) return null;
```

`mobile/src/components/coach/thinking/shared.ts`: replace lines 1–20 (imports through `pixelFont`) with:

```ts
import { useRef } from 'react';
import { isLoaded } from 'expo-font';
import { useColorScheme } from 'nativewind';
import { chipTextColor } from '../../characters/palette';
import { CHARACTERS } from '../../characters/registry';
import type { CharacterId } from '../../characters/types';
import { useSpriteClock } from '../../characters/useSpriteClock';
import { FONTS } from '../../../theme';

// The pixel face, for the few inline styles that still name it (the Campfire
// scene and the share cards). App.tsx waits for it with Geist before anything
// draws, so it is in; Geist stands in only if the font failed to load.
export const SILKSCREEN = 'Silkscreen';
export { hexAlpha } from '../../characters/palette';

export function pixelFont(): string {
  try {
    return isLoaded(SILKSCREEN) ? SILKSCREEN : FONTS.sans;
  } catch {
    return FONTS.sans;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/components/Text.test.tsx __tests__/components/PageTitle.test.tsx __tests__/theme __tests__/lib/utils.test.ts __tests__/App.test.tsx __tests__/components/ThinkingRow.test.tsx __tests__/components/StreamingText.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the whole suite and tsc**

Run the full Jest command (no paths) and the tsc command.
Expected: one snapshot fails, `__tests__/components/__snapshots__/CorrelationCard.test.tsx.snap`, because it draws a `SectionLabel`: its two label nodes change from `className="text-eyebrow font-semibold uppercase text-muted-foreground flex-1"` / `"fontFamily": "Geist_600SemiBold"` to `className="text-label uppercase text-muted-foreground flex-1"` / `"fontFamily": "Silkscreen"`. Read the diff; if that is all, update it:
`PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/components/CorrelationCard.test.tsx -u`
Then the full suite is green (241 + 3 new suites) and tsc shows exactly the 12 baseline errors.

- [ ] **Step 6: Commit**

```bash
git add mobile/tailwind.config.js mobile/src/theme.ts mobile/src/lib/utils.ts mobile/src/components/ui/text.tsx mobile/src/components/ui/streaming-text.tsx mobile/src/components/ui/page-title.tsx mobile/src/components/ui/section-label.tsx mobile/src/components/ui/input-style.ts mobile/App.tsx mobile/src/components/coach/thinking/shared.ts mobile/__tests__/components/Text.test.tsx mobile/__tests__/components/PageTitle.test.tsx mobile/__tests__/theme/typeTokens.test.ts mobile/__tests__/theme/tokens.test.ts mobile/__tests__/lib/utils.test.ts mobile/__tests__/App.test.tsx mobile/__tests__/components/ThinkingRow.test.tsx mobile/__tests__/components/__snapshots__/CorrelationCard.test.tsx.snap
git commit -m "feat(mobile): one type scale: tokens, PageTitle, pixel SectionLabel, input style; Silkscreen loads with Geist"
```

---

### Task 2: The typography guard

**Files:**
- Create: `mobile/__tests__/conventions/typography.test.ts`

**Interfaces:**
- Consumes: the token names from Task 1 (only as strings).
- Produces: two arrays every later task edits, both `Exception[]` with `type Exception = { file: string; count: number; reason: string }`, keyed by the path under `src/`:
  - `EXEMPT`: permanent (spec §5, §6, and the primitives).
  - `PENDING`: not migrated yet. Each migration task deletes its own entries (and, where it says so, moves a file to `EXEMPT` with a new count). Task 11 leaves it empty.
  - The count is the total number of guard hits in the file (all rules together) and must match exactly.

- [ ] **Step 1: Write the guard**

Create `mobile/__tests__/conventions/typography.test.ts`:

```ts
import fs from 'fs';
import path from 'path';

// The type system (docs/superpowers/specs/2026-10-08-type-system-design.md):
// every text size in src is a token from tailwind.config.js (text-score,
// text-number, text-display, text-heading, text-headline, text-body,
// text-caption, text-fine, text-page-title, text-label), the face comes from
// ui/text, and every TextInput takes the shared input style. This guard reads
// every file under src as text, comments included (so name a token in a
// comment, never a banned class), and fails on:
//   - an arbitrary size: text-[13px]
//   - a stock size: text-xs, sm, base, lg, xl, 2xl … 9xl (NativeWind's rem is
//     14, so these draw 12.5% small, and they are not the scale)
//   - an old token: text-eyebrow, text-numeral*, text-display-sm, text-display-lg
//   - the serif: font-display
//   - an inline fontFamily: or fontSize:
//   - a <TextInput> whose own tag does not use inputTextStyle or inputNumberStyle
//
// EXEMPT lists the files that keep some of these for good, with how many and
// why. PENDING lists the files the migration has not reached yet; each
// migration task deletes its files from it. A count must match exactly: more is
// a new violation, fewer is a stale entry.

const SRC = path.join(__dirname, '../../src');

type Rule = { id: string; pattern: RegExp; fix: string };

const RULES: Rule[] = [
  { id: 'arbitrary size', pattern: /(?<![\w-])text-\[\d[^\]]*\]/g, fix: 'use a type token (text-body, text-caption, …)' },
  { id: 'stock size', pattern: /(?<![\w-])text-(?:xs|sm|base|lg|xl|[2-9]xl)(?![\w-])/g, fix: 'use a type token (text-body, text-caption, …)' },
  { id: 'old token', pattern: /(?<![\w-])text-(?:eyebrow|numeral(?:-sm|-lg|-xl)?|display-(?:sm|lg))(?![\w-])/g, fix: 'see the migration map (spec §4)' },
  { id: 'serif', pattern: /(?<![\w-])font-display(?![\w-])/g, fix: 'the serif is gone: PageTitle, text-heading or text-display' },
  { id: 'inline font', pattern: /\bfont(?:Family|Size)\s*:/g, fix: 'use a type token on a ui/text Text' },
];
// A JSX TextInput tag, not a type argument such as useRef<TextInput>.
const INPUT_START = /(?<![\w.])<TextInput(?=[\s/>])/g;
const INPUT_STYLE = /\binput(?:Text|Number)Style\b/;

type Hit = { file: string; line: number; rule: string; text: string };
type Exception = { file: string; count: number; reason: string };

// prettier-ignore
const EXEMPT: Exception[] = [
  // The Campfire scene (spec §6): its Silkscreen sizes (8–14), letter-spacing and Geist text render exactly as before.
  { file: 'components/social/CampScene.tsx', count: 11, reason: 'the Campfire scene: labels, z-z-z, note bubbles and kicker at their own pixel sizes (spec §6)' },
  { file: 'components/social/CampBanner.tsx', count: 3, reason: 'the camp banner: THE CAMP in pixel 10 over its line (spec §6)' },
  // Share cards (spec §5): images scaled by u() / a(), so their sizes stay inline; Geist and pixel only.
  { file: 'components/recap/WeeklyStoryView.tsx', count: 39, reason: 'the weekly story share card, sized in card units (spec §5)' },
  { file: 'components/recap/RecapCardView.tsx', count: 14, reason: 'the monthly recap share card, sized in card units (spec §5)' },
  { file: 'components/recap/YearPixelsView.tsx', count: 16, reason: 'the Year in Pixels share card, sized in card units (spec §5)' },
  { file: 'components/achievements/BadgeShareCard.tsx', count: 6, reason: 'the badge share card, sized in card units (spec §5)' },
  { file: 'components/achievements/CelebrationModal.tsx', count: 10, reason: 'the badge celebration, drawn like the share card (spec §5)' },
  { file: 'lib/recapShare.ts', count: 2, reason: "the share cards' quote fitting: fontSize is a number it computes, not a style" },
  // SVG <Text> sized in chart units would be exempt too (spec §5); there is none today: the charts draw their labels with ui/text.
  // The primitives that turn tokens into styles.
  { file: 'components/ui/text.tsx', count: 3, reason: 'the Text primitive sets fontFamily from the class list (and reads font-display until Task 11)' },
  { file: 'components/ui/input-style.ts', count: 4, reason: 'the shared input styles: Geist at the body size (spec §3)' },
];

// prettier-ignore
const PENDING: Exception[] = [
  // Task 3
  { file: 'components/ui/button.tsx', count: 3, reason: 'not migrated yet (Task 3)' },
  { file: 'components/ui/text-field.tsx', count: 4, reason: 'not migrated yet (Task 3)' },
  { file: 'components/ui/badge.tsx', count: 1, reason: 'not migrated yet (Task 3)' },
  { file: 'components/ui/settings-list.tsx', count: 4, reason: 'not migrated yet (Task 3)' },
  { file: 'components/ui/segmented-control.tsx', count: 1, reason: 'not migrated yet (Task 3)' },
  { file: 'components/ui/toast.tsx', count: 1, reason: 'not migrated yet (Task 3)' },
  { file: 'components/ui/chat-bubble.tsx', count: 2, reason: 'not migrated yet (Task 3)' },
  { file: 'components/ui/baseline-progress-ring.tsx', count: 1, reason: 'not migrated yet (Task 3)' },
  { file: 'components/ui/factor-bar.tsx', count: 5, reason: 'not migrated yet (Task 3)' },
  { file: 'components/ui/range-chart.tsx', count: 9, reason: 'not migrated yet (Task 3)' },
  { file: 'components/ui/correlation-card.tsx', count: 7, reason: 'not migrated yet (Task 3)' },
  { file: 'navigation/FloatingTabBar.tsx', count: 1, reason: 'not migrated yet (Task 3)' },
  { file: 'navigation/RootNavigator.tsx', count: 1, reason: 'not migrated yet (Task 3)' },
  { file: 'components/social/CampNoteCard.tsx', count: 9, reason: 'not migrated yet (Task 3)' },
  // Task 4
  { file: 'components/ui/score-ring.tsx', count: 3, reason: 'not migrated yet (Task 4)' },
  { file: 'screens/DashboardScreen.tsx', count: 7, reason: 'not migrated yet (Task 4)' },
  { file: 'components/home/recovery-hero.tsx', count: 9, reason: 'not migrated yet (Task 4)' },
  { file: 'components/home/metric-tile.tsx', count: 3, reason: 'not migrated yet (Task 4)' },
  { file: 'components/home/sleep-tile.tsx', count: 5, reason: 'not migrated yet (Task 4)' },
  { file: 'components/home/coach-tile.tsx', count: 2, reason: 'not migrated yet (Task 4)' },
  { file: 'components/home/BuddiesRow.tsx', count: 2, reason: 'not migrated yet (Task 4)' },
  { file: 'components/tomorrow-card.tsx', count: 5, reason: 'not migrated yet (Task 4)' },
  { file: 'components/habit-log-card.tsx', count: 12, reason: 'not migrated yet (Task 4)' },
  { file: 'screens/ScoreDetailScreen.tsx', count: 7, reason: 'not migrated yet (Task 4)' },
  { file: 'screens/ForecastScreen.tsx', count: 5, reason: 'not migrated yet (Task 4)' },
  { file: 'components/forecast/forecast-hero.tsx', count: 3, reason: 'not migrated yet (Task 4)' },
  { file: 'components/forecast/lever-panel.tsx', count: 4, reason: 'not migrated yet (Task 4)' },
  { file: 'components/forecast/contribution-bars.tsx', count: 2, reason: 'not migrated yet (Task 4)' },
  { file: 'components/forecast/track-record-chart.tsx', count: 5, reason: 'not migrated yet (Task 4)' },
  { file: 'screens/MetricsScreen.tsx', count: 12, reason: 'not migrated yet (Task 4)' },
  { file: 'screens/MetricDetailScreen.tsx', count: 8, reason: 'not migrated yet (Task 4)' },
  { file: 'screens/PatternsScreen.tsx', count: 4, reason: 'not migrated yet (Task 4)' },
  // Task 5
  { file: 'screens/ActivityScreen.tsx', count: 2, reason: 'not migrated yet (Task 5)' },
  { file: 'components/activity-heatmap.tsx', count: 15, reason: 'not migrated yet (Task 5)' },
  { file: 'components/activity-sheets.tsx', count: 20, reason: 'not migrated yet (Task 5)' },
  { file: 'components/activity/UsualTiles.tsx', count: 3, reason: 'not migrated yet (Task 5)' },
  { file: 'screens/SleepScreen.tsx', count: 7, reason: 'not migrated yet (Task 5)' },
  { file: 'screens/SleepNightScreen.tsx', count: 11, reason: 'not migrated yet (Task 5)' },
  { file: 'screens/BedtimeGoalScreen.tsx', count: 9, reason: 'not migrated yet (Task 5)' },
  { file: 'components/sleep/MomentsCard.tsx', count: 10, reason: 'not migrated yet (Task 5)' },
  { file: 'components/sleep/RegularityCard.tsx', count: 7, reason: 'not migrated yet (Task 5)' },
  { file: 'components/sleep/Section.tsx', count: 1, reason: 'not migrated yet (Task 5)' },
  { file: 'components/sleep/SleepCyclesCard.tsx', count: 7, reason: 'not migrated yet (Task 5)' },
  { file: 'components/sleep/StageLanes.tsx', count: 5, reason: 'not migrated yet (Task 5)' },
  { file: 'components/sleep/StageStrip.tsx', count: 1, reason: 'not migrated yet (Task 5)' },
  { file: 'components/sleep/WindowChart.tsx', count: 3, reason: 'not migrated yet (Task 5)' },
  // Task 6
  { file: 'components/coach-digest-card.tsx', count: 9, reason: 'not migrated yet (Task 6)' },
  { file: 'components/coach/CoachToday.tsx', count: 9, reason: 'not migrated yet (Task 6)' },
  { file: 'components/coach/TodayBar.tsx', count: 3, reason: 'not migrated yet (Task 6)' },
  { file: 'components/coach/AnswerCard.tsx', count: 8, reason: 'not migrated yet (Task 6)' },
  { file: 'components/coach/CoachMessageRow.tsx', count: 6, reason: 'not migrated yet (Task 6)' },
  { file: 'components/coach/ConversationsSheet.tsx', count: 6, reason: 'not migrated yet (Task 6)' },
  { file: 'components/coach/ErrorCard.tsx', count: 1, reason: 'not migrated yet (Task 6)' },
  { file: 'components/coach/PromptBar.tsx', count: 5, reason: 'not migrated yet (Task 6)' },
  { file: 'components/coach/thinking/Bouncy.tsx', count: 2, reason: 'not migrated yet (Task 6)' },
  { file: 'components/coach/thinking/Dialog.tsx', count: 5, reason: 'not migrated yet (Task 6)' },
  { file: 'components/coach/thinking/Lines.tsx', count: 4, reason: 'not migrated yet (Task 6)' },
  { file: 'components/coach/thinking/Nameplate.tsx', count: 2, reason: 'not migrated yet (Task 6)' },
  { file: 'components/coach/thinking/Placeholder.tsx', count: 3, reason: 'not migrated yet (Task 6)' },
  { file: 'components/coach/thinking/Shimmer.tsx', count: 3, reason: 'not migrated yet (Task 6)' },
  { file: 'components/coach/thinking/Steps.tsx', count: 3, reason: 'not migrated yet (Task 6)' },
  { file: 'components/coach/thinking/Strip.tsx', count: 2, reason: 'not migrated yet (Task 6)' },
  { file: 'components/coach/thinking/Tag.tsx', count: 3, reason: 'not migrated yet (Task 6)' },
  { file: 'components/coach/thinking/Typewriter.tsx', count: 1, reason: 'not migrated yet (Task 6)' },
  { file: 'components/characters/CoachCard.tsx', count: 6, reason: 'not migrated yet (Task 6)' },
  { file: 'screens/CoachScreen.tsx', count: 10, reason: 'not migrated yet (Task 6)' },
  { file: 'screens/CoachConsentScreen.tsx', count: 5, reason: 'not migrated yet (Task 6)' },
  { file: 'screens/CoachMemoryScreen.tsx', count: 7, reason: 'not migrated yet (Task 6)' },
  { file: 'screens/HostedConsentScreen.tsx', count: 4, reason: 'not migrated yet (Task 6)' },
  { file: 'screens/MeetYourCoachScreen.tsx', count: 3, reason: 'not migrated yet (Task 6)' },
  { file: 'screens/ThinkingStyleScreen.tsx', count: 4, reason: 'not migrated yet (Task 6)' },
  { file: 'screens/ThinkingTextScreen.tsx', count: 5, reason: 'not migrated yet (Task 6)' },
  { file: 'components/memory-edit-form.tsx', count: 5, reason: 'not migrated yet (Task 6)' },
  { file: 'components/memory-proposal-chips.tsx', count: 2, reason: 'not migrated yet (Task 6)' },
  { file: 'components/coach-settings-section.tsx', count: 1, reason: 'not migrated yet (Task 6)' },
  { file: 'components/ai-engine-row.tsx', count: 3, reason: 'not migrated yet (Task 6)' },
  // Task 7
  { file: 'screens/SocialScreen.tsx', count: 4, reason: 'not migrated yet (Task 7)' },
  { file: 'screens/SocialStoryScreen.tsx', count: 1, reason: 'not migrated yet (Task 7)' },
  { file: 'components/social/SocialStoryFrame.tsx', count: 9, reason: 'not migrated yet (Task 7)' },
  { file: 'components/social/StoriesRow.tsx', count: 2, reason: 'not migrated yet (Task 7)' },
  { file: 'components/social/TimelineList.tsx', count: 4, reason: 'not migrated yet (Task 7)' },
  { file: 'components/social/CheckInSheet.tsx', count: 4, reason: 'not migrated yet (Task 7)' },
  { file: 'components/social/GoodnightButton.tsx', count: 2, reason: 'not migrated yet (Task 7)' },
  { file: 'components/social/HighlightsCarousel.tsx', count: 4, reason: 'not migrated yet (Task 7)' },
  { file: 'screens/HighlightsScreen.tsx', count: 4, reason: 'not migrated yet (Task 7)' },
  { file: 'screens/CampfireScreen.tsx', count: 16, reason: 'not migrated yet (Task 7)' },
  { file: 'components/buddies/BuddyListRow.tsx', count: 1, reason: 'not migrated yet (Task 7)' },
  { file: 'components/buddies/HandleSetupForm.tsx', count: 3, reason: 'not migrated yet (Task 7)' },
  { file: 'components/buddies/MoodNoticeSheet.tsx', count: 3, reason: 'not migrated yet (Task 7)' },
  { file: 'components/buddies/SharingConsentSheet.tsx', count: 3, reason: 'not migrated yet (Task 7)' },
  { file: 'screens/BuddiesScreen.tsx', count: 1, reason: 'not migrated yet (Task 7)' },
  { file: 'screens/BuddyWeekScreen.tsx', count: 9, reason: 'not migrated yet (Task 7)' },
  { file: 'screens/PairUpScreen.tsx', count: 7, reason: 'not migrated yet (Task 7)' },
  { file: 'screens/BlockedPeopleScreen.tsx', count: 2, reason: 'not migrated yet (Task 7)' },
  // Task 8
  { file: 'components/chats/ChatComposer.tsx', count: 5, reason: 'not migrated yet (Task 8)' },
  { file: 'components/chats/ChatRow.tsx', count: 4, reason: 'not migrated yet (Task 8)' },
  { file: 'components/chats/ChatSettingsSection.tsx', count: 2, reason: 'not migrated yet (Task 8)' },
  { file: 'components/chats/MessageBubble.tsx', count: 10, reason: 'not migrated yet (Task 8)' },
  { file: 'components/chats/NewChatSheet.tsx', count: 3, reason: 'not migrated yet (Task 8)' },
  { file: 'components/chats/NoteComposerSheet.tsx', count: 7, reason: 'not migrated yet (Task 8)' },
  { file: 'components/chats/NotesRow.tsx', count: 3, reason: 'not migrated yet (Task 8)' },
  { file: 'components/chats/ReportSheet.tsx', count: 5, reason: 'not migrated yet (Task 8)' },
  { file: 'components/chats/RequestsList.tsx', count: 4, reason: 'not migrated yet (Task 8)' },
  { file: 'screens/ChatsScreen.tsx', count: 6, reason: 'not migrated yet (Task 8)' },
  { file: 'screens/ChatThreadScreen.tsx', count: 5, reason: 'not migrated yet (Task 8)' },
  { file: 'screens/ChatRequestsScreen.tsx', count: 2, reason: 'not migrated yet (Task 8)' },
  // Task 9
  { file: 'components/recap/RecapShelf.tsx', count: 5, reason: 'not migrated yet (Task 9)' },
  { file: 'components/recap/ShareWithBuddiesButton.tsx', count: 5, reason: 'not migrated yet (Task 9)' },
  { file: 'screens/RecapScreen.tsx', count: 11, reason: 'not migrated yet (Task 9)' },
  { file: 'screens/RecapsScreen.tsx', count: 6, reason: 'not migrated yet (Task 9)' },
  { file: 'screens/RecapStoryScreen.tsx', count: 6, reason: 'not migrated yet (Task 9)' },
  { file: 'screens/RecapBuilderScreen.tsx', count: 6, reason: 'not migrated yet (Task 9)' },
  { file: 'screens/YearInPixelsScreen.tsx', count: 1, reason: 'not migrated yet (Task 9)' },
  { file: 'components/achievements/BadgesCard.tsx', count: 5, reason: 'not migrated yet (Task 9)' },
  { file: 'components/milestones/MilestoneTiles.tsx', count: 4, reason: 'not migrated yet (Task 9)' },
  { file: 'screens/BadgesScreen.tsx', count: 6, reason: 'not migrated yet (Task 9)' },
  { file: 'screens/BadgeDetailScreen.tsx', count: 10, reason: 'not migrated yet (Task 9)' },
  // Task 10
  { file: 'screens/SettingsScreen.tsx', count: 7, reason: 'not migrated yet (Task 10)' },
  { file: 'screens/SignInScreen.tsx', count: 6, reason: 'not migrated yet (Task 10)' },
  { file: 'screens/SignUpScreen.tsx', count: 4, reason: 'not migrated yet (Task 10)' },
  { file: 'screens/ForgotPasswordScreen.tsx', count: 5, reason: 'not migrated yet (Task 10)' },
  { file: 'screens/ResetPasswordScreen.tsx', count: 5, reason: 'not migrated yet (Task 10)' },
  { file: 'screens/SignInMethodsScreen.tsx', count: 3, reason: 'not migrated yet (Task 10)' },
  { file: 'screens/DevicesScreen.tsx', count: 1, reason: 'not migrated yet (Task 10)' },
  { file: 'screens/ConnectHealthScreen.tsx', count: 6, reason: 'not migrated yet (Task 10)' },
  { file: 'components/notifications-section.tsx', count: 2, reason: 'not migrated yet (Task 10)' },
  { file: 'components/delete-account-section.tsx', count: 7, reason: 'not migrated yet (Task 10)' },
  { file: 'screens/dev/CharacterGalleryScreen.tsx', count: 3, reason: 'not migrated yet (Task 10)' },
];

const ALLOWED = [...EXEMPT, ...PENDING];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(tsx?|jsx?)$/.test(entry.name) ? [full] : [];
  });
}

/**
 * The attribute text of the JSX opening tag that starts at `from`, up to its
 * closing `>` at brace depth 0, with comments left out (so a comment naming
 * inputTextStyle does not count). As in buttons.test.ts.
 */
function openingTag(source: string, from: number): string {
  let depth = 0;
  let quote: string | null = null;
  let out = '';
  for (let i = from; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === quote && source[i - 1] !== '\\') quote = null;
    } else if (c === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i);
      i = (end === -1 ? source.length : end) - 1;
      continue;
    } else if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = (end === -1 ? source.length : end + 2) - 1;
      continue;
    } else if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (depth === 0 && c === '>') return out + c;
    out += c;
  }
  return out;
}

const lineOf = (source: string, index: number) => source.slice(0, index).split('\n').length;

/** Every guard hit in one file. */
function findViolations(file: string, source: string): Hit[] {
  const hits: Hit[] = [];
  for (const rule of RULES) {
    for (const m of source.matchAll(rule.pattern)) {
      hits.push({ file, line: lineOf(source, m.index!), rule: rule.id, text: `${m[0]}: ${rule.fix}` });
    }
  }
  for (const m of source.matchAll(INPUT_START)) {
    if (!INPUT_STYLE.test(openingTag(source, m.index!))) {
      hits.push({ file, line: lineOf(source, m.index!), rule: 'input', text: '<TextInput> without inputTextStyle: style={[inputTextStyle, …]}' });
    }
  }
  return hits.sort((a, b) => a.line - b.line);
}

/** Each hit in a file with no entry, and each entry whose file has a different number of hits. */
function violations(hits: Hit[], allowed: Exception[]): string[] {
  const out: string[] = [];
  const files = [...new Set(hits.map((h) => h.file))];
  for (const file of files) {
    const mine = hits.filter((h) => h.file === file);
    const entry = allowed.find((a) => a.file === file);
    if (!entry) for (const h of mine) out.push(`src/${h.file}:${h.line} ${h.rule}, ${h.text}`);
    else if (mine.length !== entry.count) out.push(`src/${file}: expected ${entry.count}, found ${mine.length} (lines ${mine.map((h) => h.line).join(', ')})`);
  }
  for (const a of allowed) if (!files.includes(a.file)) out.push(`src/${a.file}: expected ${a.count}, found 0`);
  return out;
}

function scan(): Hit[] {
  return sourceFiles(SRC)
    .map((full) => path.relative(SRC, full).split(path.sep).join('/'))
    .flatMap((file) => findViolations(file, fs.readFileSync(path.join(SRC, file), 'utf8')));
}

describe('typography convention', () => {
  it('uses the type scale everywhere outside the listed files', () => {
    expect(violations(scan(), ALLOWED)).toEqual([]);
  });

  it('gives every entry one file, a count and a reason, and keeps exempt and pending apart', () => {
    const files = ALLOWED.map((a) => a.file);
    expect(new Set(files).size).toBe(files.length);
    for (const a of ALLOWED) {
      expect(a.reason.trim()).not.toBe('');
      expect(a.count).toBeGreaterThan(0);
    }
  });

  it('fails a deliberately re-added text-[13px] in a migrated file', () => {
    const file = 'components/ui/section-label.tsx';
    const source = fs.readFileSync(path.join(SRC, file), 'utf8') + '\nexport const Again = () => <Text className="text-[13px] text-muted-foreground">x</Text>;\n';
    const line = source.split('\n').length - 1;
    expect(violations(findViolations(file, source), ALLOWED)).toEqual([
      `src/${file}:${line} arbitrary size, text-[13px]: use a type token (text-body, text-caption, …)`,
    ]);
  });

  it('fails one more inline size in an exempt file', () => {
    const file = 'components/social/CampScene.tsx';
    const source = fs.readFileSync(path.join(SRC, file), 'utf8') + '\nconst extra = { fontSize: 9 };\n';
    expect(violations(findViolations(file, source), ALLOWED)).toEqual([expect.stringMatching(/^src\/components\/social\/CampScene\.tsx: expected 11, found 12/)]);
  });

  it('catches every stock size, in any variant, but not the tokens or the colours', () => {
    for (const cls of ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'dark:text-sm']) {
      expect(findViolations('x.tsx', `<Text className="${cls}">x</Text>`)).toHaveLength(1);
    }
    expect(findViolations('x.tsx', '<ScoreRing numeralClassName="text-lg" />')).toHaveLength(1);
    const fine = ['text-body', 'text-caption', 'text-fine', 'text-label', 'text-page-title', 'text-score', 'text-score-excellent', 'text-display', 'text-[#A5B4FC]', 'text-muted-foreground'];
    for (const cls of fine) expect(findViolations('x.tsx', `<Text className="${cls}">x</Text>`)).toEqual([]);
  });

  it('catches the old tokens and the serif', () => {
    for (const cls of ['text-eyebrow', 'text-numeral', 'text-numeral-sm', 'text-numeral-lg', 'text-numeral-xl', 'text-display-sm', 'text-display-lg', 'font-display']) {
      expect(findViolations('x.tsx', `<Text className="${cls}">x</Text>`)).toHaveLength(1);
    }
  });

  it('catches an inline fontFamily or fontSize, and nothing else in a style', () => {
    expect(findViolations('x.tsx', '<Text style={{ fontSize: 12 }}>x</Text>')).toHaveLength(1);
    expect(findViolations('x.tsx', '<Text style={{ fontFamily: FONTS.sans, fontSize: 12 }}>x</Text>')).toHaveLength(2);
    expect(findViolations('x.tsx', "<Text style={{ fontWeight: '600', fontVariant: ['tabular-nums'], letterSpacing: 1 }}>x</Text>")).toEqual([]);
  });

  it('catches a TextInput without the shared input style, and only a JSX tag', () => {
    expect(findViolations('x.tsx', '<TextInput value={v} className="flex-1" />').map((h) => h.rule)).toEqual(['input']);
    expect(findViolations('x.tsx', '<TextInput /* inputTextStyle */ value={v} />').map((h) => h.rule)).toEqual(['input']);
    expect(findViolations('x.tsx', '<TextInput value={v} style={[inputTextStyle, { height: 40 }]} />')).toEqual([]);
    expect(findViolations('x.tsx', '<TextInput\n  value={v}\n  style={inputNumberStyle}\n/>')).toEqual([]);
    expect(findViolations('x.tsx', 'const input = useRef<TextInput>(null); type P = React.RefObject<TextInput | null>;')).toEqual([]);
  });

  it('flags a stale entry', () => {
    expect(violations([], [{ file: 'x.tsx', count: 1, reason: 'gone' }])).toEqual(['src/x.tsx: expected 1, found 0']);
  });
});
```

- [ ] **Step 2: Run it**

Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/conventions/typography.test.ts`
Expected: PASS (every count above was taken from the tree after Task 1). If the first test fails, it prints `src/<file>: expected N, found M (lines …)`: re-read the file; a mismatch means Task 1 touched it differently from this plan, so fix Task 1's change, not the count.

- [ ] **Step 3: Prove it on the real tree**

Add `<Text className="text-[13px]">x</Text>` inside the JSX returned by `mobile/src/components/ui/section-label.tsx` and run the guard again.
Expected: FAIL with `src/components/ui/section-label.tsx:<line> arbitrary size, text-[13px]: use a type token (text-body, text-caption, …)`.
Then revert that file: `git checkout -- mobile/src/components/ui/section-label.tsx`, and rerun: PASS.

- [ ] **Step 4: Commit**

```bash
git add mobile/__tests__/conventions/typography.test.ts
git commit -m "test(mobile): guard the type scale, allowlisting the files not migrated yet"
```

---
### Task 3: Shared primitives, buttons, every TextInput, navigation headers

**Files:**
- Modify: `mobile/src/components/ui/button.tsx:80-93,112-115,291-296`, `mobile/src/components/ui/README.md` (Sizes table)
- Modify: `mobile/src/components/ui/text-field.tsx`, `ui/badge.tsx:18`, `ui/settings-list.tsx:24,84,86,94`, `ui/segmented-control.tsx:71`, `ui/toast.tsx:63`, `ui/chat-bubble.tsx:35,37`, `ui/baseline-progress-ring.tsx:67`, `ui/factor-bar.tsx:45-60`, `ui/range-chart.tsx:177-215`, `ui/correlation-card.tsx:123-154`
- Create: `mobile/src/navigation/headerStyle.ts`
- Modify: `mobile/src/navigation/RootNavigator.tsx:229,236-291`, `navigation/TabsNavigator.tsx:34`, `navigation/FloatingTabBar.tsx:189`
- Modify (the `TextInput` tag only, nothing else in the file): `components/chats/ChatComposer.tsx:80-89`, `components/chats/NoteComposerSheet.tsx:52-60`, `screens/ChatsScreen.tsx:206-214`, `components/social/CampNoteCard.tsx:95-100`, `components/coach/PromptBar.tsx:164-188`, `components/delete-account-section.tsx:84-94`, `screens/SettingsScreen.tsx:88-97`, `components/memory-edit-form.tsx:55-66`, `components/habit-log-card.tsx:171-181`
- Test: `mobile/__tests__/components/inputs.test.tsx` (new), `mobile/__tests__/navigation/headerStyle.test.ts` (new), `__tests__/components/Button.test.tsx`, `__tests__/components/ButtonCompiled.test.ts`, `__tests__/screens/ChatsScreen.test.tsx`, snapshots of `ConfidenceBadge`, `FactorBar`, `CorrelationCard`, `BaselineProgressRing`, `__tests__/conventions/typography.test.ts`

**Interfaces:**
- Consumes: Task 1 tokens, `TYPE_TOKENS`, `inputTextStyle`, `inputNumberStyle`, `FONTS.pixel`.
- Produces:
  - `buttonTextVariants` sizes: `default`/`lg`/`icon`/`icon-sm`/`icon-lg` → `text-body`, `sm` → `text-caption`, `xs`/`icon-xs` → `text-fine`, all with `font-medium`. A link's nominal height is 21 (one `text-body` line).
  - `headerTitleStyle(color: string): { color: string; fontFamily: string; fontSize: number }` and `HEADER_TITLE_SIZE = 15` in `src/navigation/headerStyle.ts`.
  - Every stack `title` in `RootNavigator.tsx` is uppercase; the two screens that call `navigation.setOptions({ title })` (ScoreDetail, MetricDetail) uppercase it in Task 4.
  - `ScoreRing` is not touched here (Task 4 changes it together with all its callers).

- [ ] **Step 1: Write the failing tests**

Create `mobile/__tests__/components/inputs.test.tsx`:

```tsx
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { ChatComposer } from '../../src/components/chats/ChatComposer';
import { NoteComposerSheet } from '../../src/components/chats/NoteComposerSheet';
import { CampNoteCard } from '../../src/components/social/CampNoteCard';
import { DEFAULT_CHARACTER_ID } from '../../src/components/characters/types';
import { FONTS } from '../../src/theme';

jest.mock('../../src/api/chats');

const flat = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style) as Record<string, unknown>;

const mountCampNote = () =>
  render(
    <CampNoteCard inputRef={React.createRef()} draft="" onDraft={jest.fn()} length={0} canShare={false} onShare={jest.fn()} live={null}
      editing={false} onEdit={jest.fn()} onCancel={jest.fn()} onClear={jest.fn()} busy={false} message={null} buddies={2} coachId={DEFAULT_CHARACTER_ID} />,
  );

// iOS draws a placeholder in the input's own font, so an empty input showing
// its placeholder is where a missing font shows first (spec §3: these had none).
const INPUTS: Array<[string, () => unknown, string, string]> = [
  [
    'the chat composer',
    () =>
      render(
        <ChatComposer disabled={false} quote={null} onClearQuote={jest.fn()} replyTo={null} onClearReply={jest.fn()} canShareCheckIn
          onShareCheckIn={jest.fn()} onSticker={jest.fn()} onSend={jest.fn(async () => true)} />,
      ),
    'composer-input',
    'Message…',
  ],
  ['the note composer', () => render(<NoteComposerSheet visible current={null} onClose={jest.fn()} onSaved={jest.fn()} />), 'note-input', 'early night tonight'],
  ['the camp note', mountCampNote, 'camp-note-input', 'Say something to the camp…'],
];

it.each(INPUTS)('%s draws its placeholder and text in Geist at the body size', (_name, mount, testID, placeholder) => {
  mount();
  const input = screen.getByTestId(testID);
  expect(input.props.value ?? '').toBe('');
  expect(input.props.placeholder).toBe(placeholder);
  expect(flat(testID)).toEqual(expect.objectContaining({ fontFamily: FONTS.sans, fontSize: 15 }));
  // The size comes from the style alone: no class fighting it.
  expect(String(input.props.className ?? '')).not.toMatch(/text-(?:base|\[)/);
});

it('the camp note keeps its own box: height, padding, radius and border', () => {
  mountCampNote();
  expect(flat('camp-note-input')).toEqual(
    expect.objectContaining({ height: 76, paddingTop: 12, paddingLeft: 14, paddingRight: 52, borderRadius: 16, borderWidth: 1.5 }),
  );
});
```

In `mobile/__tests__/screens/ChatsScreen.test.tsx`, add `StyleSheet` to the `react-native` import (or add `import { StyleSheet } from 'react-native';`) and `import { FONTS } from '../../src/theme';`, and inside `it('search filters conversations by name or handle', …)` right after its first `fireEvent.changeText(await screen.findByTestId('chats-search'), 'SA');` add:

```ts
  // The fourth fontless input (spec §3): Geist at the body size, placeholder included.
  expect(screen.getByTestId('chats-search').props.placeholder).toBe('Search');
  expect(StyleSheet.flatten(screen.getByTestId('chats-search').props.style)).toEqual(expect.objectContaining({ fontFamily: FONTS.sans, fontSize: 15 }));
```

Create `mobile/__tests__/navigation/headerStyle.test.ts`:

```ts
import fs from 'fs';
import path from 'path';
import { HEADER_TITLE_SIZE, headerTitleStyle } from '../../src/navigation/headerStyle';
import { FONTS } from '../../src/theme';

const read = (file: string) => fs.readFileSync(path.join(__dirname, '../../src/navigation', file), 'utf8');

it('sets native header titles in Silkscreen at 15', () => {
  expect(HEADER_TITLE_SIZE).toBe(15);
  expect(headerTitleStyle('rgb(1, 2, 3)')).toEqual({ color: 'rgb(1, 2, 3)', fontFamily: FONTS.pixel, fontSize: 15 });
});

it('writes every stack screen title in caps, so a pushed header matches the pixel page titles', () => {
  const src = read('RootNavigator.tsx');
  const titles = [...src.matchAll(/title:\s*'([^']*)'/g)].map((m) => m[1]);
  expect(titles.length).toBeGreaterThan(20);
  for (const title of titles) expect(title).toBe(title.toUpperCase());
  expect(src).toContain('title: FORECAST_COPY.title.toUpperCase()');
  expect(src).toContain('headerTitleStyle: headerTitleStyle(colors.foreground)');
});

it('gives the tab header the same title style, without the stray weight', () => {
  const src = read('TabsNavigator.tsx');
  expect(src).not.toMatch(/fontWeight/);
  expect(src).toContain('headerTitleStyle: headerTitleStyle(colors.foreground)');
});
```

In `mobile/__tests__/components/Button.test.tsx`:
- line 103: `expect.arrayContaining(['font-medium', 'text-destructive', 'text-[13px]', 'leading-[18px]'])` → `expect.arrayContaining(['font-medium', 'text-destructive', 'text-caption'])`
- lines 106–111: the table becomes `['xs', 'text-fine'], ['sm', 'text-caption'], ['default', 'text-body'], ['lg', 'text-body']`.
- lines 229–236: `textClassName="text-accent text-[16px]"` → `textClassName="text-accent text-[16px] text-caption text-score-good"`; keep `expect(classes).not.toContain('text-[16px]');` and add `expect(classes).not.toContain('text-caption');` and `expect(classes).toContain('text-score-good');` (a type token is not a colour; a colour that starts with a token's name still is).
- line 396: `toEqual({ top: 12, bottom: 12, left: 0, right: 0 })` → `toEqual({ top: 11.5, bottom: 11.5, left: 0, right: 0 })` (a link is one 21-px `text-body` line now).

In `mobile/__tests__/components/ButtonCompiled.test.ts` (lines 91–95) the label table becomes `['xs', 11, 14], ['sm', 13, 18], ['default', 15, 21], ['lg', 15, 21]`.

- [ ] **Step 2: Run them to verify they fail**

Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/components/inputs.test.tsx __tests__/navigation/headerStyle.test.ts __tests__/components/Button.test.tsx __tests__/components/ButtonCompiled.test.ts __tests__/screens/ChatsScreen.test.tsx`
Expected: FAIL. `Cannot find module '../../src/navigation/headerStyle'`; the inputs have no `fontFamily`; Button labels still `text-[14px]`; ButtonCompiled sees 14/20.

- [ ] **Step 3: Implement**

`mobile/src/components/ui/button.tsx`:
- theme import: `import { MOTION } from '../../theme';` → `import { MOTION, TYPE_TOKENS } from '../../theme';`
- replace lines 81–93 (`TEXT_14`, `TEXT_12`, `buttonTextVariants`) with:

```ts
// The label sizes are type tokens (spec §3): text-body on default, lg and the
// icon sizes, text-caption on sm, text-fine on xs; all Geist 500.
const TEXT_BODY = 'text-body';
const TEXT_FINE = 'text-fine';

export const buttonTextVariants = cva('font-medium', {
  variants: {
    variant: TEXT_COLOR,
    size: {
      default: TEXT_BODY,
      xs: TEXT_FINE,
      sm: 'text-caption',
      lg: TEXT_BODY,
      icon: TEXT_BODY,
      'icon-xs': TEXT_FINE,
      'icon-sm': TEXT_BODY,
      'icon-lg': TEXT_BODY,
    },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});
```

- lines 112–115: `// 14/20 label.` → `// text-body label (15/21).` and `const LINK_HEIGHT = 20;` → `const LINK_HEIGHT = 21;`
- replace `spinnerClass` and its comment (lines 291–296) with:

```ts
// The size classes a textClassName can carry: stock, arbitrary, and the type
// tokens matched whole, so a colour such as text-score-good stays a colour.
const SIZE_CLASS = new RegExp(`^text-(?:\\[\\d|(?:xs|sm|base|lg|xl|\\dxl|${TYPE_TOKENS.join('|')})$)`);

// Only the colour classes of a textClassName, so the spinner follows a label
// colour override without picking up font sizes.
function spinnerClass(variant: ButtonVariant, textClassName?: string): string {
  const colours = (textClassName ?? '').split(/\s+/).filter((c) => /^text-/.test(c) && !SIZE_CLASS.test(c));
  return cn(TEXT_COLOR[variant], colours);
}
```

`mobile/src/components/ui/README.md`, `## Sizes`: the table gets a Label column:

```markdown
| Size | Height | Label | Use |
|---|---|---|---|
| `xs` | 24 | `text-fine` (11) | Chips and tiny inline actions |
| `sm` | 32 | `text-caption` (13) | Card actions, links next to titles |
| `default` | 36 | `text-body` (15) | Most buttons |
| `lg` | 40 | `text-body` (15) | Full-width CTAs: `size="lg" className="w-full"` |
| `icon-xs` / `icon-sm` / `icon` / `icon-lg` | 24 / 32 / 36 / 40, square | — | Icon-only buttons |

Labels are Geist 500 on the type scale (docs/superpowers/specs/2026-10-08-type-system-design.md). Do not resize a label with `textClassName`: pick the button size.
```

`mobile/src/components/ui/text-field.tsx`:
- `import { COLORS, FONTS } from '../../theme';` → `import { COLORS } from '../../theme';`, and add `import { inputTextStyle } from './input-style';`
- line 31 `className="text-sm text-muted-foreground"` → `className="text-caption text-muted-foreground"`
- line 45 `style={{ fontFamily: FONTS.sans }}` → `style={inputTextStyle}`
- line 46 `className="rounded-tile border border-border bg-card px-4 py-3 text-base text-foreground"` → `className="rounded-tile border border-border bg-card px-4 py-3 text-foreground"`

| File:line | Old | New |
|---|---|---|
| `ui/badge.tsx:18` | `cva('text-xs font-medium', {` | `cva('text-caption font-medium', {` |
| `ui/settings-list.tsx:24` | `className="px-4 text-xs text-muted-foreground"` | `className="px-4 text-caption text-muted-foreground"` |
| `ui/settings-list.tsx:84` | `cn('text-base', destructive ?` | `cn('text-body', destructive ?` |
| `ui/settings-list.tsx:86` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `ui/settings-list.tsx:94` | `className="max-w-[55%] text-right text-sm text-muted-foreground"` | `className="max-w-[55%] text-right text-caption text-muted-foreground"` |
| `ui/segmented-control.tsx:71` | `cn('text-sm font-medium',` | `cn('text-caption font-medium',` |
| `ui/toast.tsx:63` | `className="text-sm font-medium"` | `className="text-body font-medium"` |
| `ui/chat-bubble.tsx:35` | `className="text-base text-accent-foreground"` | `className="text-body text-accent-foreground"` |
| `ui/chat-bubble.tsx:37` | `className="text-base leading-6"` | `className="text-body"` |
| `ui/baseline-progress-ring.tsx:67` | `className="text-xs font-semibold"` | `className="text-caption font-semibold tabular-nums"` |
| `ui/factor-bar.tsx:45` | `className="text-sm font-medium"` | `className="text-body font-medium"` |
| `ui/factor-bar.tsx:47` | `className="text-[10px] text-muted-foreground"` ("estimated") | `className="text-caption text-muted-foreground"` |
| `ui/factor-bar.tsx:51` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `ui/factor-bar.tsx:53` | `className="text-sm font-semibold" style={{ fontVariant: ['tabular-nums'] }}` | `className="text-body font-semibold tabular-nums"` |
| `ui/factor-bar.tsx:60` | `className="-mt-1 text-xs text-muted-foreground"` | `className="-mt-1 text-caption text-muted-foreground"` |
| `ui/range-chart.tsx:177` | `className="text-xs text-muted-foreground"` (tooltip date) | `className="text-caption text-muted-foreground"` |
| `ui/range-chart.tsx:178` | `className="text-sm font-bold" style={{ fontVariant: ['tabular-nums'] }}` | `className="text-body font-bold tabular-nums"` |
| `ui/range-chart.tsx:186` | `className="text-[10px] text-muted-foreground"` (axis high) | `className="text-fine text-muted-foreground"` |
| `ui/range-chart.tsx:189` | `className="text-[10px] text-muted-foreground"` (axis low) | `className="text-fine text-muted-foreground"` |
| `ui/range-chart.tsx:198, 199, 200` | `className="text-[11px] text-muted-foreground"` (axis dates) | `className="text-fine text-muted-foreground"` |
| `ui/range-chart.tsx:209` | `className="text-xs text-muted-foreground"` (legend) | `className="text-fine text-muted-foreground"` |
| `ui/range-chart.tsx:215` | `className="text-xs text-muted-foreground"` (legend) | `className="text-fine text-muted-foreground"` |
| `ui/correlation-card.tsx:123` | `className="text-numeral font-semibold" style={{ fontVariant: ['tabular-nums'] }}` | `className="text-display tabular-nums"` |
| `ui/correlation-card.tsx:126` | `className="mb-1 flex-1 text-sm text-muted-foreground"` | `className="mb-1 flex-1 text-caption text-muted-foreground"` |
| `ui/correlation-card.tsx:131` | `className="text-base leading-6"` | `className="text-body"` |
| `ui/correlation-card.tsx:139` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `ui/correlation-card.tsx:146` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `ui/correlation-card.tsx:150` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `ui/correlation-card.tsx:154` | `className="text-xs font-medium text-score-fair"` | `className="text-caption font-medium text-score-fair"` |
| `navigation/FloatingTabBar.tsx:189` | `className="text-[10px] font-semibold"` | `className="text-fine font-semibold"` |

Create `mobile/src/navigation/headerStyle.ts`:

```ts
import { FONTS } from '../theme';

// Native stack and tab headers sit outside NativeWind, so their title takes a
// real style: Silkscreen at 15 (spec §3). Each screen's title is written in
// caps where it is set, so a pushed screen's header (BADGES, FORECAST) matches
// the in-page PageTitle.
export const HEADER_TITLE_SIZE = 15;

export function headerTitleStyle(color: string): { color: string; fontFamily: string; fontSize: number } {
  return { color, fontFamily: FONTS.pixel, fontSize: HEADER_TITLE_SIZE };
}
```

`mobile/src/navigation/RootNavigator.tsx`:
- add `import { headerTitleStyle } from './headerStyle';`; drop `FONTS` from the theme import if nothing else in the file uses it.
- line 229: `headerTitleStyle: { color: colors.foreground, fontFamily: FONTS.sansSemibold },` → `headerTitleStyle: headerTitleStyle(colors.foreground),`
- titles (lines 236–291): `'Score'` → `'SCORE'`; `FORECAST_COPY.title` → `FORECAST_COPY.title.toUpperCase()`; `'Patterns'` → `'PATTERNS'`; `'AI Coach'` → `'AI COACH'`; `'Coach Memory'` → `'COACH MEMORY'`; `'Thinking style'` → `'THINKING STYLE'`; `'Thinking text'` → `'THINKING TEXT'`; `'AI engine'` → `'AI ENGINE'`; `'Sign-in methods'` → `'SIGN-IN METHODS'`; `'Devices'` → `'DEVICES'`; `'Sleep'` → `'SLEEP'`; `'Bedtime goal'` → `'BEDTIME GOAL'`; `'Your recaps'` → `'YOUR RECAPS'`; `'Year in pixels'` → `'YEAR IN PIXELS'`; `'Badges'` → `'BADGES'`; `'Buddy name'` → `'BUDDY NAME'`; `'All buddies'` → `'ALL BUDDIES'`; `'Add a buddy'` → `'ADD A BUDDY'`; `'Blocked people'` → `'BLOCKED PEOPLE'`; `'Highlights'` → `'HIGHLIGHTS'`; `'Requests'` → `'REQUESTS'`; `'Build your recap'` → `'BUILD YOUR RECAP'`. Empty titles (`''`) stay.

`mobile/src/navigation/TabsNavigator.tsx` line 34: `headerTitleStyle: { color: colors.foreground, fontWeight: '600' },` → `headerTitleStyle: headerTitleStyle(colors.foreground),`, plus `import { headerTitleStyle } from './headerStyle';`. The tab `title`s (`'AI Coach'`, `'Profile'`) stay: those headers are hidden and the bar's labels come from `TAB_LABELS`.

The inputs. In each file import `inputTextStyle` (or `inputNumberStyle`) from the relative path to `src/components/ui/input-style`, and drop `FONTS` from the theme import where this was its only use (true for all six files that had `FONTS.sans*` on the input):

| File | Old | New |
|---|---|---|
| `components/chats/ChatComposer.tsx:88` | `className="max-h-28 min-h-[36px] flex-1 rounded-[18px] bg-secondary px-3.5 py-2 text-[15px] text-foreground"` | `style={inputTextStyle}` and `className="max-h-28 min-h-[36px] flex-1 rounded-[18px] bg-secondary px-3.5 py-2 text-foreground"` |
| `components/chats/NoteComposerSheet.tsx:59` | `className="h-11 rounded-xl bg-secondary px-3 text-[15px] text-foreground"` | `style={inputTextStyle}` and `className="h-11 rounded-xl bg-secondary px-3 text-foreground"` |
| `screens/ChatsScreen.tsx:213` | `className="flex-1 text-[15px] text-foreground"` | `style={inputTextStyle}` and `className="flex-1 text-foreground"` |
| `components/social/CampNoteCard.tsx:97-100` | `style={{ height: 76, paddingTop: 12, paddingBottom: 12, paddingLeft: 14, paddingRight: 52, borderRadius: 16, borderWidth: 1.5,` / `borderColor: focused ? TEAL : 'rgba(155,157,166,0.3)', textAlignVertical: 'top' }}` / `className="bg-background/70 text-base text-foreground" />` | `style={[inputTextStyle, { height: 76, paddingTop: 12, paddingBottom: 12, paddingLeft: 14, paddingRight: 52, borderRadius: 16, borderWidth: 1.5,` / `borderColor: focused ? TEAL : 'rgba(155,157,166,0.3)', textAlignVertical: 'top' }]}` / `className="bg-background/70 text-foreground" />`. Nothing else in this file changes. |
| `components/coach/PromptBar.tsx:175-187` | `style={{` … `fontFamily: FONTS.sans,` / `fontSize: 16,` … `}}` | `style={[inputTextStyle, {` … the same object without the `fontFamily` and `fontSize` lines (`flex`, `color`, `height`, `lineHeight: LINE_HEIGHT`, the iOS padding comment, `paddingTop`, `paddingBottom`, `marginVertical`, `textAlignVertical` unchanged) … `}]}` |
| `components/delete-account-section.tsx:93` | `style={{ color: colors.foreground, fontFamily: FONTS.sans }}` | `style={[inputTextStyle, { color: colors.foreground }]}` |
| `screens/SettingsScreen.tsx:96` | `style={{ color: colors.foreground, fontFamily: FONTS.sans }}` | `style={[inputTextStyle, { color: colors.foreground }]}` |
| `components/memory-edit-form.tsx:64-65` | `style={{ color: colors.foreground, fontFamily: FONTS.sans, minHeight: 64, textAlignVertical: 'top' }}` / `className="rounded-tile border border-border bg-background px-3.5 py-3 text-base"` | `style={[inputTextStyle, { color: colors.foreground, minHeight: 64, textAlignVertical: 'top' }]}` / `className="rounded-tile border border-border bg-background px-3.5 py-3"` |
| `components/habit-log-card.tsx:179-180` | `style={{ color: colors.foreground, fontFamily: FONTS.sansSemibold, fontVariant: ['tabular-nums'] }}` / `className="h-10 w-20 rounded-full border border-border bg-muted px-3 text-center text-base"` | `style={[inputNumberStyle, { color: colors.foreground }]}` / `className="h-10 w-20 rounded-full border border-border bg-muted px-3 text-center"` |

`mobile/__tests__/conventions/typography.test.ts`:
- delete these `PENDING` entries: `components/ui/button.tsx`, `components/ui/text-field.tsx`, `components/ui/badge.tsx`, `components/ui/settings-list.tsx`, `components/ui/segmented-control.tsx`, `components/ui/toast.tsx`, `components/ui/chat-bubble.tsx`, `components/ui/baseline-progress-ring.tsx`, `components/ui/factor-bar.tsx`, `components/ui/range-chart.tsx`, `components/ui/correlation-card.tsx`, `navigation/FloatingTabBar.tsx`, `navigation/RootNavigator.tsx`, `components/social/CampNoteCard.tsx`.
- lower these `PENDING` counts (their inputs are done; the rest waits for their own task): `components/chats/ChatComposer.tsx` 5 → 3, `components/chats/NoteComposerSheet.tsx` 7 → 5, `screens/ChatsScreen.tsx` 6 → 4, `components/coach/PromptBar.tsx` 5 → 2, `components/delete-account-section.tsx` 7 → 5, `screens/SettingsScreen.tsx` 7 → 5, `components/memory-edit-form.tsx` 5 → 2, `components/habit-log-card.tsx` 12 → 9.
- add to `EXEMPT`, after the CampBanner entry:
  `{ file: 'components/social/CampNoteCard.tsx', count: 7, reason: 'the Campfire note card keeps its panel text as it is (spec §6); only its input took inputTextStyle (spec §3)' },`
- add to `EXEMPT`, after the input-style entry:
  `{ file: 'navigation/headerStyle.ts', count: 4, reason: 'native headers sit outside NativeWind: Silkscreen 15 (spec §3); the style and its return type' },`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/components __tests__/navigation __tests__/screens/ChatsScreen.test.tsx __tests__/screens/CampfireScreen.test.tsx __tests__/screens/SettingsScreen.test.tsx __tests__/screens/SettingsDeleteAccount.test.tsx __tests__/screens/CoachMemoryScreen.test.tsx __tests__/conventions`
Expected: everything passes except four snapshots: `ConfidenceBadge` (`text-xs` → `text-caption`), `FactorBar` (`text-sm` → `text-body`; the number's `fontVariant` now comes through `Text` from `tabular-nums`, same value), `CorrelationCard` (the number is `text-display tabular-nums` in `Geist_700Bold`, the sentence `text-body`, the captions `text-caption`), `BaselineProgressRing` (`text-caption font-semibold tabular-nums`, which adds `fontVariant: ['tabular-nums']`). Read each diff; when it is only these class/face/figure changes, update them:
`PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/components/ConfidenceBadge.test.tsx __tests__/components/FactorBar.test.tsx __tests__/components/CorrelationCard.test.tsx __tests__/components/BaselineProgressRing.test.tsx -u`

- [ ] **Step 5: Check the Campfire files**

Run: `git diff 120e739 --stat -- mobile/src/components/social/CampScene.tsx mobile/src/components/social/CampBanner.tsx mobile/src/screens/CampfireScreen.tsx`
Expected: no output. `git diff 120e739 -- mobile/src/components/social/CampNoteCard.tsx` shows only the `input-style` import and the `TextInput`'s `style`/`className`.

- [ ] **Step 6: Full suite, tsc, commit**

Run the full Jest command and the tsc command. Expected: all green; only the 12 baseline tsc errors.

```bash
git add mobile/src/components/ui mobile/src/navigation mobile/src/components/chats/ChatComposer.tsx mobile/src/components/chats/NoteComposerSheet.tsx mobile/src/screens/ChatsScreen.tsx mobile/src/components/social/CampNoteCard.tsx mobile/src/components/coach/PromptBar.tsx mobile/src/components/delete-account-section.tsx mobile/src/screens/SettingsScreen.tsx mobile/src/components/memory-edit-form.tsx mobile/src/components/habit-log-card.tsx mobile/__tests__
git commit -m "refactor(mobile): buttons, primitives, inputs and native headers on the type scale"
```

---

### Task 4: Home, score ring, Score detail, Forecast, Trends

**Files:**
- Modify: `mobile/src/components/ui/score-ring.tsx:136-165`
- Modify: `mobile/src/screens/DashboardScreen.tsx`, `components/home/recovery-hero.tsx`, `components/home/metric-tile.tsx`, `components/home/sleep-tile.tsx`, `components/home/coach-tile.tsx`, `components/home/BuddiesRow.tsx`, `components/tomorrow-card.tsx`, `components/habit-log-card.tsx`
- Modify: `mobile/src/screens/ScoreDetailScreen.tsx`, `screens/ForecastScreen.tsx`, `components/forecast/forecast-hero.tsx`, `components/forecast/lever-panel.tsx`, `components/forecast/contribution-bars.tsx`, `components/forecast/track-record-chart.tsx`
- Modify: `mobile/src/screens/MetricsScreen.tsx`, `screens/MetricDetailScreen.tsx`, `screens/PatternsScreen.tsx`
- Modify (one prop each, the other ScoreRing callers): `components/sleep/RegularityCard.tsx:56`, `screens/SleepScreen.tsx:160`
- Test: `__tests__/components/HomeTiles.test.tsx`, `__tests__/components/ScoreRing.test.tsx` (+ snapshot), `__tests__/screens/ScoreDetailScreen.test.tsx`, `__tests__/screens/MetricDetailScreen.test.tsx`, `__tests__/screens/MetricsScreen.test.tsx`, `__tests__/conventions/typography.test.ts`

**Interfaces:**
- Consumes: Task 1 (`PageTitle`, `SectionLabel`, tokens, `tabular-nums`).
- Produces: `ScoreRing`'s `numeralClassName` is a type token (default `text-heading`); the ring adds `tabular-nums` itself and no weight (the token's weight applies). Its `label` renders a `SectionLabel`. Hero rings pass `text-score`, 64-px and 52-px rings pass `text-headline`.

- [ ] **Step 1: Write the failing tests**

`mobile/__tests__/components/HomeTiles.test.tsx`: add `import { StyleSheet } from 'react-native';` and `import { FONTS } from '../../src/theme';`, then add inside `describe('MetricTile', …)`:

```tsx
  it('draws its number in tabular figures on one line that shrinks to fit', () => {
    const { getByText } = render(<MetricTile type="STEPS" series={records('STEPS', [8000, 18400])} onPress={jest.fn()} />);
    const value = getByText('18,400');
    expect(StyleSheet.flatten(value.props.style)).toEqual(expect.objectContaining({ fontFamily: FONTS.sansBold, fontVariant: ['tabular-nums'] }));
    expect(String(value.props.className).split(' ')).toEqual(expect.arrayContaining(['text-display', 'tabular-nums']));
    expect(value.props.numberOfLines).toBe(1);
    expect(value.props.adjustsFontSizeToFit).toBe(true);
  });
```

and inside the `RecoveryHero` describe (next to `'leads with the score, its verdict and its confidence'`):

```tsx
  it('sets the score as text-score in tabular figures under a pixel label, and the verdict in Geist', () => {
    const { getByText } = render(<RecoveryHero score={recovery} failed={false} onPress={jest.fn()} />);
    const score = getByText('78');
    expect(String(score.props.className).split(' ')).toEqual(expect.arrayContaining(['text-score', 'tabular-nums']));
    expect(StyleSheet.flatten(score.props.style)).toEqual(expect.objectContaining({ fontFamily: FONTS.sansSemibold, fontVariant: ['tabular-nums'] }));
    expect(StyleSheet.flatten(getByText('Recovery Score').props.style).fontFamily).toBe(FONTS.pixel);
    expect(StyleSheet.flatten(getByText('HRV is lifting it today.').props.style).fontFamily).toBe(FONTS.sansSemibold);
  });
```

`mobile/__tests__/screens/ScoreDetailScreen.test.tsx` lines 143 and 153: `{ title: 'Recovery Score' }` → `{ title: 'RECOVERY SCORE' }`; line 188: `{ title: 'Sleep Score' }` → `{ title: 'SLEEP SCORE' }` (the native header is pixel caps, spec §3).
`mobile/__tests__/screens/MetricDetailScreen.test.tsx` line 74: `{ title: 'Resting Heart Rate' }` → `{ title: 'RESTING HEART RATE' }`.
`mobile/__tests__/screens/MetricsScreen.test.tsx` line 127: `expect(getByText('Trends')).toBeTruthy();` → `expect(getByText('TRENDS')).toBeTruthy();` and add on the next line `expect(getByRole('header', { name: 'Trends' })).toBeTruthy();` (add `getByRole` to that test's destructured render result).

- [ ] **Step 2: Run them to verify they fail**

Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/components/HomeTiles.test.tsx __tests__/screens/ScoreDetailScreen.test.tsx __tests__/screens/MetricDetailScreen.test.tsx __tests__/screens/MetricsScreen.test.tsx`
Expected: FAIL (metric value is `text-numeral font-bold` in `Geist_700Bold`; the score is `text-numeral-xl`; titles are not caps; no header named Trends).

- [ ] **Step 3: Implement**

`mobile/src/components/ui/score-ring.tsx`:
- add `import { SectionLabel } from './section-label';`
- lines 136–137, the comment: `// Size class for the centre number, so a hero ring can carry a display` / `// numeral and a tile ring a small one. Defaults to the original text-2xl.` → `// The centre number's type token: text-score on a hero ring, text-headline` / `// on a small tile ring. Defaults to text-heading. The ring adds tabular-nums.`
- line 150: `numeralClassName = 'text-2xl',` → `numeralClassName = 'text-heading',`
- lines 157–161, the numeral:

```tsx
  const numeral =
    score === null ? (
      <Text className={`${numeralClassName} text-muted-foreground`}>{'—'}</Text>
    ) : (
      <CountUp value={score} format={(v) => String(Math.round(v))} className={`${numeralClassName} tabular-nums`} />
    );
```

- line 165: `<Text className="text-eyebrow font-semibold uppercase text-muted-foreground">{label}</Text>` → `<SectionLabel>{label}</SectionLabel>`

| File:line | Old | New |
|---|---|---|
| `screens/DashboardScreen.tsx:163` | `className={ring ? 'text-sm font-semibold' : 'text-base font-semibold'}` | `className={ring ? 'text-caption font-semibold' : 'text-body font-semibold'}` |
| `screens/DashboardScreen.tsx:183` | `<Text className="font-display text-display text-center">{title}</Text>` (the fallback screens' title: Reconnect / No data yet / Couldn't load Today; spec §4 lists Dashboard as a screen title) | `<PageTitle className="text-center">{title}</PageTitle>` (import from `../components/ui/page-title`; the existing tests find these titles with case-insensitive regexes, so they keep passing) |
| `screens/DashboardScreen.tsx:184` | `className="text-center text-base text-muted-foreground"` | `className="text-center text-body text-muted-foreground"` |
| `screens/DashboardScreen.tsx:258` | `className="font-display text-display-lg"` (greeting) | `className="text-display"` |
| `screens/DashboardScreen.tsx:313` | `className="text-base leading-snug"` | `className="text-body"` |
| `components/home/recovery-hero.tsx:43` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/home/recovery-hero.tsx:55` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/home/recovery-hero.tsx:83` | `numeralClassName="text-numeral-xl"` | `numeralClassName="text-score"` |
| `components/home/recovery-hero.tsx:91` | `<Text className="text-eyebrow font-semibold uppercase text-muted-foreground">Recovery Score</Text>` | `<SectionLabel>Recovery Score</SectionLabel>` (import `SectionLabel` from `../ui/section-label`) |
| `components/home/recovery-hero.tsx:92` | `className="font-display text-display-sm text-center"` | `className="text-heading text-center"` |
| `components/home/recovery-hero.tsx:96` | `className="font-display text-display-sm text-center"` | `className="text-heading text-center"` |
| `components/home/recovery-hero.tsx:100` | `className="text-xs font-medium text-muted-foreground"` | `className="text-caption font-medium text-muted-foreground"` |
| `components/home/metric-tile.tsx:43` | `className="flex-1 text-sm font-medium"` | `className="flex-1 text-caption font-medium"` |
| `components/home/metric-tile.tsx:52-53` | `className="text-numeral font-bold"` / `style={{ fontVariant: ['tabular-nums'] }}` | `className="text-display tabular-nums"` (delete the `style` line; keep `numberOfLines={1}` and `adjustsFontSizeToFit`) |
| `components/home/metric-tile.tsx:62` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/home/sleep-tile.tsx:37` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/home/sleep-tile.tsx:51` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/home/sleep-tile.tsx:72` | `numeralClassName="text-base"` | `numeralClassName="text-headline"` |
| `components/home/sleep-tile.tsx:76` | `className="text-sm font-semibold"` | `className="text-caption font-semibold"` |
| `components/home/sleep-tile.tsx:82` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/home/coach-tile.tsx:22` | `className="text-base font-semibold"` | `className="text-body font-semibold"` |
| `components/home/coach-tile.tsx:23` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/home/BuddiesRow.tsx:27` | `className="text-sm text-muted-foreground"` ("See all") | `className="text-caption text-muted-foreground"` |
| `components/home/BuddiesRow.tsx:40` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/tomorrow-card.tsx:18` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/tomorrow-card.tsx:36` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/tomorrow-card.tsx:47` | `numeralClassName="text-lg"` | `numeralClassName="text-headline"` |
| `components/tomorrow-card.tsx:50` | `className="text-base font-semibold"` (band) | `className="text-body font-semibold tabular-nums"` |
| `components/tomorrow-card.tsx:53` | `className="text-sm font-semibold text-accent"` | `className="text-caption font-semibold text-accent"` |
| `components/habit-log-card.tsx:77` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/habit-log-card.tsx:139` | `className="text-base font-semibold"` | `className="text-body font-semibold"` |
| `components/habit-log-card.tsx:191` | `className="flex-1 text-sm text-muted-foreground"` | `className="flex-1 text-caption text-muted-foreground"` |
| `components/habit-log-card.tsx:195` | `className="flex-1 text-xs text-muted-foreground"` | `className="flex-1 text-caption text-muted-foreground"` |
| `components/habit-log-card.tsx:209` | `` className={`text-sm ${feedback.kind === 'error' ``  | `` className={`text-caption ${feedback.kind === 'error' `` |
| `components/habit-log-card.tsx:217` | `className="flex-1 text-sm text-muted-foreground"` | `className="flex-1 text-caption text-muted-foreground"` |
| `components/habit-log-card.tsx:227` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/habit-log-card.tsx:239` | `className="text-[10px] text-muted-foreground"` (weekday initial in a day cell) | `className="text-fine text-muted-foreground"` |
| `components/habit-log-card.tsx:247` | `className="text-xs text-muted-foreground"` (day of month in the cell) | `className="text-caption text-muted-foreground tabular-nums"` |
| `screens/ScoreDetailScreen.tsx:70` | `navigation.setOptions({ title: scoreTypeLabel(type) });` | `navigation.setOptions({ title: scoreTypeLabel(type).toUpperCase() });` |
| `screens/ScoreDetailScreen.tsx:151` | `numeralClassName="text-numeral-xl"` | `numeralClassName="text-score"` |
| `screens/ScoreDetailScreen.tsx:160` | `className="text-xs font-medium"` | `className="text-caption font-medium"` |
| `screens/ScoreDetailScreen.tsx:167` | `className="font-display text-display text-center"` (verdict) | `className="text-heading text-center"` |
| `screens/ScoreDetailScreen.tsx:168` | `className="text-center text-sm leading-5 text-muted-foreground"` | `className="text-center text-caption text-muted-foreground"` |
| `screens/ScoreDetailScreen.tsx:192` | `className="flex-1 text-sm"` | `className="flex-1 text-body"` |
| `screens/ScoreDetailScreen.tsx:204` | `` className={`px-4 py-3.5 text-sm ${ `` | `` className={`px-4 py-3.5 text-body ${ `` |
| `screens/ScoreDetailScreen.tsx:227` | `className="flex-1 text-base font-semibold"` | `className="flex-1 text-body font-semibold"` |
| `screens/ForecastScreen.tsx:32` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/ForecastScreen.tsx:51` | `className="text-sm leading-5"` | `className="text-body"` |
| `screens/ForecastScreen.tsx:82` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/ForecastScreen.tsx:92` | `className="text-sm font-medium" style={{ fontVariant: ['tabular-nums'] }}` | `className="text-caption font-medium tabular-nums"` |
| `screens/ForecastScreen.tsx:99` | `className="px-4 text-center text-xs leading-4 text-muted-foreground"` | `className="px-4 text-center text-caption text-muted-foreground"` |
| `components/forecast/forecast-hero.tsx:29` | `numeralClassName="text-numeral-xl"` | `numeralClassName="text-score"` |
| `components/forecast/forecast-hero.tsx:33` | `className="font-display text-display-sm text-center" style={{ fontVariant: ['tabular-nums'] }}` | `className="text-heading text-center tabular-nums"` |
| `components/forecast/lever-panel.tsx:38` | `` className={`text-sm font-medium ${tone}`} `` | `` className={`text-body font-medium ${tone}`} `` |
| `components/forecast/lever-panel.tsx:39` | `` className={`text-sm font-semibold ${tone}`} style={{ fontVariant: ['tabular-nums'] }} `` | `` className={`text-body font-semibold tabular-nums ${tone}`} `` |
| `components/forecast/lever-panel.tsx:55` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/forecast/lever-panel.tsx:56` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/forecast/contribution-bars.tsx:23` | `className="text-sm font-medium"` | `className="text-caption font-medium"` |
| `components/forecast/contribution-bars.tsx:25-26` | `` className={`text-sm font-semibold ${positive ? `` … / `style={{ fontVariant: ['tabular-nums'] }}` | `` className={`text-caption font-semibold tabular-nums ${positive ? `` … (delete the `style` line) |
| `components/forecast/track-record-chart.tsx:48, 49, 50` | `className="text-[11px] text-muted-foreground"` (axis dates) | `className="text-fine text-muted-foreground"` |
| `components/forecast/track-record-chart.tsx:58` | `className="text-xs text-muted-foreground"` (legend) | `className="text-fine text-muted-foreground"` |
| `components/forecast/track-record-chart.tsx:62` | `className="text-xs text-muted-foreground"` (legend) | `className="text-fine text-muted-foreground"` |
| `screens/MetricsScreen.tsx:106` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/MetricsScreen.tsx:127` | `className="text-sm font-medium"` | `className="text-caption font-medium"` |
| `screens/MetricsScreen.tsx:132` | `className="text-numeral font-bold" style={{ fontVariant: ['tabular-nums'] }}` | `className="text-display tabular-nums"` |
| `screens/MetricsScreen.tsx:143` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/MetricsScreen.tsx:150` | `className="py-6 text-center text-xs text-muted-foreground"` | `className="py-6 text-center text-caption text-muted-foreground"` |
| `screens/MetricsScreen.tsx:153` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/MetricsScreen.tsx:156` | `className="flex-1 text-right text-xs text-muted-foreground"` | `className="flex-1 text-right text-caption text-muted-foreground"` |
| `screens/MetricsScreen.tsx:162` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/MetricsScreen.tsx:181` | `<Text className="font-display text-display-lg">Trends</Text>` | `<PageTitle>Trends</PageTitle>` (import from `../components/ui/page-title`) |
| `screens/MetricsScreen.tsx:192` | `className="text-base font-semibold"` | `className="text-body font-semibold"` |
| `screens/MetricsScreen.tsx:193` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/MetricDetailScreen.tsx:53` | `navigation.setOptions({ title: config.label });` | `navigation.setOptions({ title: config.label.toUpperCase() });` |
| `screens/MetricDetailScreen.tsx:83` | `className="text-numeral-lg font-bold" style={{ fontVariant: ['tabular-nums'] }}` | `className="text-number"` |
| `screens/MetricDetailScreen.tsx:90-91` | `className="text-numeral-lg font-bold"` / `style={{ fontVariant: ['tabular-nums'] }}` | `className="text-number"` (delete the `style` line) |
| `screens/MetricDetailScreen.tsx:94` | `className="text-base text-muted-foreground"` | `className="text-body text-muted-foreground"` |
| `screens/MetricDetailScreen.tsx:121` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/MetricDetailScreen.tsx:122` | `className="text-base font-bold" numberOfLines={1} adjustsFontSizeToFit style={{ fontVariant: ['tabular-nums'] }}` | `className="text-headline tabular-nums" numberOfLines={1} adjustsFontSizeToFit` |
| `screens/MetricDetailScreen.tsx:133` | `className={i === 0 ? 'font-display text-display-sm' : 'text-sm text-muted-foreground'}` | `className={i === 0 ? 'text-heading' : 'text-caption text-muted-foreground'}` |
| `screens/PatternsScreen.tsx:106` | `className="font-display text-display-sm"` | `className="text-heading"` |
| `screens/PatternsScreen.tsx:107` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/PatternsScreen.tsx:123` | `className="text-sm"` | `className="text-body"` |
| `components/sleep/RegularityCard.tsx:56` | `numeralClassName="text-lg"` | `numeralClassName="text-headline"` |
| `screens/SleepScreen.tsx:160` | `numeralClassName="text-lg"` | `numeralClassName="text-headline"` |

`__tests__/conventions/typography.test.ts`: delete the `PENDING` entries for `components/ui/score-ring.tsx`, `screens/DashboardScreen.tsx`, `components/home/recovery-hero.tsx`, `components/home/metric-tile.tsx`, `components/home/sleep-tile.tsx`, `components/home/coach-tile.tsx`, `components/home/BuddiesRow.tsx`, `components/tomorrow-card.tsx`, `components/habit-log-card.tsx`, `screens/ScoreDetailScreen.tsx`, `screens/ForecastScreen.tsx`, `components/forecast/forecast-hero.tsx`, `components/forecast/lever-panel.tsx`, `components/forecast/contribution-bars.tsx`, `components/forecast/track-record-chart.tsx`, `screens/MetricsScreen.tsx`, `screens/MetricDetailScreen.tsx`, `screens/PatternsScreen.tsx`; lower `components/sleep/RegularityCard.tsx` 7 → 6 and `screens/SleepScreen.tsx` 7 → 6.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/components/HomeTiles.test.tsx __tests__/components/ScoreRing.test.tsx __tests__/components/TomorrowCard.test.tsx __tests__/components/HabitLogCard.test.tsx __tests__/components/BuddiesRow.test.tsx __tests__/screens/Dashboard* __tests__/screens/ScoreDetail* __tests__/screens/ScoreBands.test.tsx __tests__/screens/ForecastScreen.test.tsx __tests__/screens/Metric* __tests__/screens/PatternsScreen.test.tsx __tests__/screens/SleepScreen.test.tsx __tests__/conventions`
Expected: PASS except the `ScoreRing` snapshot: its number goes from `className="text-foreground text-2xl font-bold"` / `Geist_700Bold` to `className="text-foreground text-heading tabular-nums"` / `Geist_600SemiBold` (same `fontVariant`), the dash from `text-2xl font-bold text-muted-foreground` to `text-heading text-muted-foreground`. Read the diff; when that is all, update it with `-u` on `__tests__/components/ScoreRing.test.tsx`.

- [ ] **Step 5: Full suite, tsc, commit**

Run the full Jest command and the tsc command. Expected: all green; only the 12 baseline tsc errors.

```bash
git add mobile/src mobile/__tests__
git commit -m "refactor(mobile): Home, score ring, Score detail, Forecast and Trends on the type scale"
```

---

### Task 5: Activity and Sleep (heatmap, sheets, tiles, nights, bedtime)

**Files:**
- Modify: `mobile/src/screens/ActivityScreen.tsx:140`, `components/activity-heatmap.tsx`, `components/activity-sheets.tsx`, `components/activity/UsualTiles.tsx`
- Modify: `mobile/src/screens/SleepScreen.tsx`, `screens/SleepNightScreen.tsx`, `screens/BedtimeGoalScreen.tsx`
- Modify: `mobile/src/components/sleep/MomentsCard.tsx`, `sleep/RegularityCard.tsx`, `sleep/Section.tsx`, `sleep/SleepCyclesCard.tsx`, `sleep/StageLanes.tsx`, `sleep/StageStrip.tsx`, `sleep/WindowChart.tsx`
- Test: `__tests__/components/ActivityHeatmap.test.tsx`, `__tests__/components/activity-sheets.test.tsx`, `__tests__/components/UsualTiles.test.tsx`, `__tests__/conventions/typography.test.ts`

**Interfaces:**
- Consumes: Task 1 (`PageTitle`, tokens, `tabular-nums`). Task 4 already set `numeralClassName="text-headline"` in `RegularityCard` and `SleepScreen`.
- Produces: nothing new. `activity-title` is now a `PageTitle` (text drawn in caps, accessible name in the original case).

- [ ] **Step 1: Write the failing tests**

`mobile/__tests__/components/ActivityHeatmap.test.tsx`: the month title is a pixel page title now, drawn in caps. Change the expected text only:
- lines 188, 196, 310: `toHaveTextContent('Steps')` → `toHaveTextContent('STEPS')`
- lines 192, 209, 306: `toHaveTextContent('Sleep')` → `toHaveTextContent('SLEEP')`
- line 318: `toHaveTextContent('Steps & sleep')` → `toHaveTextContent('STEPS & SLEEP')`

and add (with `import { StyleSheet } from 'react-native';` and `import { FONTS } from '../../src/theme';` at the top) inside `describe('ActivityHeatmap', …)`:

```tsx
  it('keeps the stat numbers tabular on one line that shrinks to fit', () => {
    const { getByTestId } = renderHeatmap([['2026-09-19', 1234567]]);
    const total = getByTestId('stat-total');
    expect(StyleSheet.flatten(total.props.style)).toEqual(expect.objectContaining({ fontFamily: FONTS.sansSemibold, fontVariant: ['tabular-nums'] }));
    expect(total.props.numberOfLines).toBe(1);
    expect(total.props.adjustsFontSizeToFit).toBe(true);
  });

  it('reads the page title to a screen reader in its own case', () => {
    // As at line 188: with no sleep loaded the title is the Steps page's.
    const { getByRole } = renderHeatmap([]);
    expect(getByRole('header', { name: 'Steps' })).toHaveTextContent('STEPS');
  });
```

`mobile/__tests__/components/activity-sheets.test.tsx`: add `import { StyleSheet } from 'react-native';` and `import { FONTS } from '../../src/theme';`, and inside `describe('NightDetail', …)`:

```tsx
  it('sets the times in tabular figures and keeps the steps tile value to one shrinking line', () => {
    const { getByTestId, getByText } = render(
      <NightDetail date="2026-09-22" night={NIGHT} goal={480} average={null} stepsLink={STEPS_LINK} onOpenFull={jest.fn()} />,
    );
    for (const id of ['night-detail-bedtime', 'night-detail-wake']) {
      expect(StyleSheet.flatten(getByTestId(id).props.style)).toEqual(expect.objectContaining({ fontFamily: FONTS.sansSemibold, fontVariant: ['tabular-nums'] }));
    }
    expect(StyleSheet.flatten(getByTestId('night-detail-asleep').props.style)).toEqual(expect.objectContaining({ fontVariant: ['tabular-nums'] }));
    const steps = getByText('12,480');
    expect(steps.props.numberOfLines).toBe(1);
    expect(steps.props.adjustsFontSizeToFit).toBe(true);
    expect(StyleSheet.flatten(steps.props.style).fontVariant).toEqual(['tabular-nums']);
  });
```

`mobile/__tests__/components/UsualTiles.test.tsx`: add `import { StyleSheet } from 'react-native';` and:

```tsx
it('keeps each tile to its width: one-line label and change, a tabular value that shrinks to fit', () => {
  const records = [{ id: 'h', metricType: 'HRV' as const, value: 61, recordedAt: '2026-10-06T00:00:00.000Z' }];
  render(<UsualTiles records={records} recovery={[]} today="2026-10-07" />);
  expect(screen.getByText('HRV').props.numberOfLines).toBe(1);
  expect(screen.getByText('No readings from the 30 days before').props.numberOfLines).toBe(1);
  const value = screen.getByText('61.0 ms');
  expect(StyleSheet.flatten(value.props.style).fontVariant).toEqual(['tabular-nums']);
  expect(value.props.numberOfLines).toBe(1);
  expect(value.props.adjustsFontSizeToFit).toBe(true);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/components/ActivityHeatmap.test.tsx __tests__/components/activity-sheets.test.tsx __tests__/components/UsualTiles.test.tsx`
Expected: FAIL (titles not caps, no header role, steps value has no `numberOfLines`).

- [ ] **Step 3: Implement**

| File:line | Old | New |
|---|---|---|
| `screens/ActivityScreen.tsx:140` | `<Text className="font-display text-display-lg">Activity</Text>` | `<PageTitle>Activity</PageTitle>` (import from `../components/ui/page-title`; drop the `Text` import only if now unused) |
| `components/activity-heatmap.tsx:177` | `className="text-xs text-muted-foreground"` (Stat label) | `className="text-caption text-muted-foreground"` |
| `components/activity-heatmap.tsx:178` | `className="text-numeral-sm font-bold" numberOfLines={1} adjustsFontSizeToFit style={{ fontVariant: ['tabular-nums'] }}` | `className="text-heading tabular-nums" numberOfLines={1} adjustsFontSizeToFit` |
| `components/activity-heatmap.tsx:260` | `className="absolute text-[10px] text-muted-foreground"` (month axis) | `className="absolute text-fine text-muted-foreground"` |
| `components/activity-heatmap.tsx:308` | `className="text-base font-semibold"` | `className="text-body font-semibold"` |
| `components/activity-heatmap.tsx:328` | `className="text-base font-semibold"` | `className="text-body font-semibold"` |
| `components/activity-heatmap.tsx:331` | `className="text-sm text-muted-foreground" style={{ fontVariant: ['tabular-nums'] }}` | `className="text-caption text-muted-foreground tabular-nums"` |
| `components/activity-heatmap.tsx:344` | `className="text-center text-[11px] text-muted-foreground"` (weekday axis) | `className="text-center text-fine text-muted-foreground"` |
| `components/activity-heatmap.tsx:368, 370, 374` | `className="text-[11px] text-muted-foreground"` (legend: No data / Less / More) | `className="text-fine text-muted-foreground"` |
| `components/activity-heatmap.tsx:378` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/activity-heatmap.tsx:573-575` | `<Text testID="activity-title" className="font-display text-display-lg">` / `{title}` / `</Text>` | `<PageTitle testID="activity-title">{title}</PageTitle>` (import `PageTitle` from `./ui/page-title`) |
| `components/activity-heatmap.tsx:599` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/activity-heatmap.tsx:640` | `className="text-base font-semibold"` | `className="text-body font-semibold"` |
| `components/activity-sheets.tsx:38` | `className="text-xs text-muted-foreground"` (LinkTile label) | `className="text-caption text-muted-foreground"` |
| `components/activity-sheets.tsx:39` | `<Text className="text-lg font-bold" style={{ fontVariant: ['tabular-nums'] }}>` | `<Text className="text-headline tabular-nums" numberOfLines={1} adjustsFontSizeToFit>` (two LinkTiles share a row: the value must not wrap) |
| `components/activity-sheets.tsx:63` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/activity-sheets.tsx:65` | `className="text-base"` | `className="text-body"` |
| `components/activity-sheets.tsx:70` | `className="text-numeral-lg font-bold" style={{ fontVariant: ['tabular-nums'] }}` | `className="text-number" numberOfLines={1} adjustsFontSizeToFit` |
| `components/activity-sheets.tsx:73` | `className="text-base"` | `className="text-body"` |
| `components/activity-sheets.tsx:77` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/activity-sheets.tsx:109` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/activity-sheets.tsx:132` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/activity-sheets.tsx:134` | `className="text-base"` | `className="text-body"` |
| `components/activity-sheets.tsx:140` | `className="text-numeral-lg font-bold" style={{ fontVariant: ['tabular-nums'] }}` | `className="text-number"` |
| `components/activity-sheets.tsx:143` | `className="text-base text-muted-foreground"` | `className="text-body text-muted-foreground"` |
| `components/activity-sheets.tsx:145` | `className="text-base"` | `className="text-body"` |
| `components/activity-sheets.tsx:153` | `className="text-[11px] text-muted-foreground"` (Bedtime) | `className="text-caption text-muted-foreground"` |
| `components/activity-sheets.tsx:154` | `className="text-sm font-semibold" style={{ fontVariant: ['tabular-nums'] }}` | `className="text-body font-semibold tabular-nums"` |
| `components/activity-sheets.tsx:159` | `className="text-[11px] text-muted-foreground"` (Woke) | `className="text-caption text-muted-foreground"` |
| `components/activity-sheets.tsx:160` | `className="text-sm font-semibold" style={{ fontVariant: ['tabular-nums'] }}` | `className="text-body font-semibold tabular-nums"` |
| `components/activity-sheets.tsx:178` | `className="text-xs text-muted-foreground"` (Sleep score) | `className="text-caption text-muted-foreground"` |
| `components/activity-sheets.tsx:179` | `className="text-lg font-bold" style={{ fontVariant: ['tabular-nums'] }}` | `className="text-headline tabular-nums"` |
| `components/activity-sheets.tsx:196` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/activity/UsualTiles.tsx:60` | `className="text-xs text-muted-foreground" numberOfLines={1}` | `className="text-caption text-muted-foreground" numberOfLines={1}` |
| `components/activity/UsualTiles.tsx:64` | `<Text className="text-numeral-sm font-semibold" style={{ fontVariant: ['tabular-nums'] }}>` | `<Text className="text-heading tabular-nums" numberOfLines={1} adjustsFontSizeToFit>` (two tiles per row at 48%: the value must not wrap) |
| `components/activity/UsualTiles.tsx:69` | `className="text-xs text-muted-foreground" numberOfLines={1}` | `className="text-caption text-muted-foreground" numberOfLines={1}` |
| `screens/SleepScreen.tsx:175` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/SleepScreen.tsx:199` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/SleepScreen.tsx:213` | `className="font-display text-display"` (last night's duration) | `className="text-display tabular-nums"` |
| `screens/SleepScreen.tsx:217` | `className="flex-1 text-sm text-muted-foreground"` | `className="flex-1 text-caption text-muted-foreground"` |
| `screens/SleepScreen.tsx:262` | `className="text-base font-semibold"` | `className="text-body font-semibold"` |
| `screens/SleepScreen.tsx:266` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/SleepNightScreen.tsx:37` | `className="text-sm text-muted-foreground"` (row label) | `className="text-caption text-muted-foreground"` |
| `screens/SleepNightScreen.tsx:38` | `className="text-sm font-semibold" style={{ fontVariant: ['tabular-nums'] }}` | `className="text-body font-semibold tabular-nums"` |
| `screens/SleepNightScreen.tsx:53` | `className="font-display text-display"` (duration) | `className="text-display tabular-nums"` |
| `screens/SleepNightScreen.tsx:54` | `className="text-base text-muted-foreground"` | `className="text-body text-muted-foreground"` |
| `screens/SleepNightScreen.tsx:57` | `className="text-sm text-muted-foreground" style={{ fontVariant: ['tabular-nums'] }}` | `className="text-caption text-muted-foreground tabular-nums"` |
| `screens/SleepNightScreen.tsx:87` | `className="text-sm font-semibold" style={{ fontVariant: ['tabular-nums'] }}` | `className="text-body font-semibold tabular-nums"` |
| `screens/SleepNightScreen.tsx:90` | `className="text-sm font-semibold" style={{ fontVariant: ['tabular-nums'] }}` | `className="text-body font-semibold tabular-nums"` |
| `screens/SleepNightScreen.tsx:109` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/SleepNightScreen.tsx:116` | `className="text-sm"` (nap line) | `className="text-body"` |
| `screens/SleepNightScreen.tsx:164` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/SleepNightScreen.tsx:172` | `className="text-center text-sm text-muted-foreground"` | `className="text-center text-caption text-muted-foreground"` |
| `screens/BedtimeGoalScreen.tsx:227` | `className="text-sm"` (goal-window-line, coloured by style) | `className="text-caption"` |
| `screens/BedtimeGoalScreen.tsx:255` | `className="px-1 text-center text-sm text-destructive"` | `className="px-1 text-center text-caption text-destructive"` |
| `screens/BedtimeGoalScreen.tsx:280` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/BedtimeGoalScreen.tsx:283` | `className="text-sm"` (winddown-preview) | `className="text-body"` |
| `screens/BedtimeGoalScreen.tsx:284` | `className="text-sm font-semibold"` (coach name inside it) | `className="text-body font-semibold"` |
| `screens/BedtimeGoalScreen.tsx:292` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/BedtimeGoalScreen.tsx:299` | `className="px-4 text-sm text-destructive"` | `className="px-4 text-caption text-destructive"` |
| `screens/BedtimeGoalScreen.tsx:329` | `className="flex-1 text-base"` | `className="flex-1 text-body"` |
| `screens/BedtimeGoalScreen.tsx:331` | `className="min-w-[84px] text-center text-base font-semibold" style={{ fontVariant: ['tabular-nums'] }}` | `className="min-w-[84px] text-center text-body font-semibold tabular-nums"` |
| `components/sleep/MomentsCard.tsx:108` | `className="font-display text-display-sm"` (duration) | `className="text-heading tabular-nums"` |
| `components/sleep/MomentsCard.tsx:109` | `className="text-[11px] text-muted-foreground"` ("asleep") | `className="text-caption text-muted-foreground"` |
| `components/sleep/MomentsCard.tsx:116` | `className="flex-1 text-[13px]"` | `className="flex-1 text-caption"` |
| `components/sleep/MomentsCard.tsx:117` | `className="text-[13px] text-muted-foreground" style={{ fontVariant: ['tabular-nums'] }}` | `className="text-caption text-muted-foreground tabular-nums"` |
| `components/sleep/MomentsCard.tsx:120` | `className="w-9 text-right text-[13px]" style={{ fontVariant: ['tabular-nums'] }}` | `className="w-9 text-right text-caption tabular-nums"` |
| `components/sleep/MomentsCard.tsx:132` | `className="text-sm font-medium"` | `className="text-body font-medium"` |
| `components/sleep/MomentsCard.tsx:133` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/sleep/MomentsCard.tsx:135` | `className="font-display text-display-sm"` (value) | `className="text-heading tabular-nums"` |
| `components/sleep/RegularityCard.tsx:34` | `className="text-center text-sm text-muted-foreground"` | `className="text-center text-caption text-muted-foreground"` |
| `components/sleep/RegularityCard.tsx:51` | `className="text-base"` | `className="text-body"` |
| `components/sleep/RegularityCard.tsx:59` | `className="text-sm"` (bedtime spread) | `className="text-body"` |
| `components/sleep/RegularityCard.tsx:64` | `className="text-sm"` (wake spread) | `className="text-body"` |
| `components/sleep/RegularityCard.tsx:104` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/sleep/RegularityCard.tsx:107` | `className="text-sm"` (coach line) | `className="text-body"` |
| `components/sleep/Section.tsx:45` | `className="text-center text-sm text-muted-foreground"` | `className="text-center text-caption text-muted-foreground"` |
| `components/sleep/SleepCyclesCard.tsx:50` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/sleep/SleepCyclesCard.tsx:54` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/sleep/SleepCyclesCard.tsx:60` | `className="text-xs font-semibold"` (cycle number in its 24-px circle) | `className="text-caption font-semibold"` |
| `components/sleep/SleepCyclesCard.tsx:64` | `className="text-sm font-medium" style={{ fontVariant: ['tabular-nums'] }}` | `className="text-body font-medium tabular-nums"` |
| `components/sleep/SleepCyclesCard.tsx:67` | `className="text-xs text-muted-foreground" style={{ fontVariant: ['tabular-nums'] }}` | `className="text-caption text-muted-foreground tabular-nums"` |
| `components/sleep/SleepCyclesCard.tsx:87` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/sleep/SleepCyclesCard.tsx:94` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/sleep/StageLanes.tsx:78` | `className="text-[13px] font-semibold"` (stage name) | `className="text-caption font-semibold"` |
| `components/sleep/StageLanes.tsx:82` | `className="pl-[13px] text-xs text-muted-foreground" style={{ fontVariant: ['tabular-nums'] }}` | `className="pl-[13px] text-caption text-muted-foreground tabular-nums"` |
| `components/sleep/StageLanes.tsx:88` | `className="text-[13px] font-medium"` ("Cycles") | `className="text-caption font-medium"` |
| `components/sleep/StageLanes.tsx:194` | `className="text-xs font-medium"` (cycle numbers on the chart) | `className="text-fine"` |
| `components/sleep/StageLanes.tsx:204` | `className="text-xs text-muted-foreground" style={{ fontVariant: ['tabular-nums'] }}` (time axis) | `className="text-fine text-muted-foreground tabular-nums"` |
| `components/sleep/StageStrip.tsx:98` | `className="text-xs text-muted-foreground"` (legend) | `className="text-fine text-muted-foreground"` |
| `components/sleep/WindowChart.tsx:43` | `className="text-center text-sm text-muted-foreground"` | `className="text-center text-caption text-muted-foreground"` |
| `components/sleep/WindowChart.tsx:60-61` | `className="text-xs text-muted-foreground"` / `style={{ position: 'absolute', left: 0, top: …, fontVariant: ['tabular-nums'] }}` (axis ticks) | `className="text-fine text-muted-foreground tabular-nums"` / the same `style` without `fontVariant` |
| `components/sleep/WindowChart.tsx:136` | `className="flex-1 text-center text-xs text-muted-foreground"` (weekday axis) | `className="flex-1 text-center text-fine text-muted-foreground"` |

`__tests__/conventions/typography.test.ts`: delete the `PENDING` entries for `screens/ActivityScreen.tsx`, `components/activity-heatmap.tsx`, `components/activity-sheets.tsx`, `components/activity/UsualTiles.tsx`, `screens/SleepScreen.tsx`, `screens/SleepNightScreen.tsx`, `screens/BedtimeGoalScreen.tsx`, `components/sleep/MomentsCard.tsx`, `components/sleep/RegularityCard.tsx`, `components/sleep/Section.tsx`, `components/sleep/SleepCyclesCard.tsx`, `components/sleep/StageLanes.tsx`, `components/sleep/StageStrip.tsx`, `components/sleep/WindowChart.tsx`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/components/ActivityHeatmap.test.tsx __tests__/components/activity-sheets.test.tsx __tests__/components/UsualTiles.test.tsx __tests__/components/MomentsCard.test.tsx __tests__/components/SleepCyclesCard.test.tsx __tests__/components/StageLanes.test.tsx __tests__/screens/ActivityScreen.test.tsx __tests__/screens/Sleep* __tests__/screens/BedtimeGoalScreen.test.tsx __tests__/conventions`
Expected: PASS.

- [ ] **Step 5: Full suite, tsc, commit**

Run the full Jest command and the tsc command. Expected: all green; only the 12 baseline tsc errors (the two in `ActivityHeatmap.test.tsx` keep their codes; their line numbers move by the lines added above them, if any).

```bash
git add mobile/src mobile/__tests__
git commit -m "refactor(mobile): Activity and Sleep on the type scale"
```

---

### Task 6: Coach (digest, Today, answers, thinking styles, CoachCard, coach screens)

**Files:**
- Modify: `mobile/src/components/coach-digest-card.tsx`, `components/coach/CoachToday.tsx`, `components/coach/TodayBar.tsx`, `components/coach/AnswerCard.tsx`, `components/coach/CoachMessageRow.tsx`, `components/coach/ConversationsSheet.tsx`, `components/coach/ErrorCard.tsx`, `components/coach/PromptBar.tsx:150-151`
- Modify: `mobile/src/components/coach/thinking/Dialog.tsx`, `thinking/ReplyFrame.tsx:19-21`, `thinking/Tag.tsx`, `thinking/Bouncy.tsx`, `thinking/Lines.tsx`, `thinking/Nameplate.tsx`, `thinking/Placeholder.tsx`, `thinking/Shimmer.tsx`, `thinking/Steps.tsx`, `thinking/Strip.tsx`, `thinking/Typewriter.tsx`
- Modify: `mobile/src/components/characters/CoachCard.tsx`, `components/characters/palette.ts:1-5` (remove `MONO`)
- Modify: `mobile/src/screens/CoachScreen.tsx`, `screens/CoachConsentScreen.tsx`, `screens/CoachMemoryScreen.tsx`, `screens/HostedConsentScreen.tsx`, `screens/MeetYourCoachScreen.tsx`, `screens/ThinkingStyleScreen.tsx`, `screens/ThinkingTextScreen.tsx`
- Modify: `mobile/src/components/memory-edit-form.tsx:69-75`, `components/memory-proposal-chips.tsx`, `components/coach-settings-section.tsx:77`, `components/ai-engine-row.tsx:138-148`
- Test: `__tests__/components/ThinkingRow.test.tsx`, `__tests__/components/CoachToday.test.tsx`, `__tests__/components/AnswerCard.test.tsx`, `__tests__/components/CoachCard.test.tsx`, `__tests__/screens/CoachScreen.test.tsx`, `__tests__/conventions/typography.test.ts`

**Interfaces:**
- Consumes: Task 1 (`PageTitle`, `SectionLabel`, `textStyleFor`, tokens), `pixelFont()` from `thinking/shared.ts`.
- Produces:
  - `DIALOG_TEXT_CLASS = 'text-label leading-[18px]'` (exported from `thinking/Dialog.tsx`); `dialogTextStyle(): TextStyle` now returns only `{ color: DIALOG_INK }`.
  - `replyFrameTextClass(style: ReplyFrameStyle): string | undefined` (exported from `thinking/ReplyFrame.tsx`): `DIALOG_TEXT_CLASS` for `'dialog'`, else `undefined`. `CoachMessageRow` merges it after `text-body`.
  - `BAR_VALUE_WIDTH = 104` (was 96) in `TodayBar.tsx`.
  - `MONO` no longer exists anywhere.

- [ ] **Step 1: Write the failing tests**

`mobile/__tests__/components/ThinkingRow.test.tsx`: change the shared import to `import { SILKSCREEN, pixelFont } from '../../src/components/coach/thinking/shared';` and `import { DIALOG_TEXT_CLASS } from '../../src/components/coach/thinking/Dialog';`, then replace the test `'tag falls back to Geist, never a mono face, if Silkscreen did not load'` (added in Task 1) with:

```tsx
it('pixelFont falls back to Geist, never a mono face, if Silkscreen did not load', () => {
  mockFontLoaded = false;
  expect(pixelFont()).toBe(FONTS.sans);
  mockFontLoaded = true;
  expect(pixelFont()).toBe(SILKSCREEN);
});

it('dialog types its line in the pixel label face on an 18-pt line', () => {
  const s = render(<ThinkingRow style="dialog" characterId="pengu" steps={[]} paused testID="row" />);
  const line = s.getByText(/…$/);
  expect(String(line.props.className).split(' ')).toEqual(expect.arrayContaining(DIALOG_TEXT_CLASS.split(' ')));
  expect(flatStyle(line.props.style).fontFamily).toBe(SILKSCREEN);
});
```

`mobile/__tests__/components/CoachToday.test.tsx`:
- replace the test at lines 115–121 with:

```tsx
  it('sets the value in caption bold tabular figures and the usual smaller in the dimmer usual colour', () => {
    const { getByTestId } = render(<TodayBar bar={recovery} onPress={() => {}} />);
    const classes = (id: string) => String(getByTestId(id).props.className).split(' ');

    expect(classes('today-bar-value-recovery')).toEqual(expect.arrayContaining(['text-caption', 'font-bold', 'tabular-nums']));
    expect(classes('today-bar-usual-recovery')).toContain('text-fine');
    expect(style(getByTestId('today-bar-usual-recovery')).color).toBe(COLORS.light.todayUsual);
    // One line: a value that does not fit truncates rather than wrapping the row.
    expect(getByTestId('today-bar-text-recovery').props.numberOfLines).toBe(1);
  });
```

- lines 157–158, the comment: `// Measured in Geist (12px bold value, 10.5px usual): "10h 48m / 7h 13m" 94.6pt is the` / `// widest; …` → `// Measured in Geist at 12px bold / 10.5px: "10h 48m / 7h 13m" 94.6pt was the widest; at the` / `// type scale's 13px bold tabular / 11px it is about 101pt, so the column is 104.`
- line 159: test name `'gives every row the same 96pt value column, wide enough for the longest value'` → `'gives every row the same 104pt value column, wide enough for the longest value'`; line 162 `.toBe(96)` → `.toBe(104)`; line 280 `.toBe(96)` → `.toBe(104)`.

`mobile/__tests__/components/AnswerCard.test.tsx` lines 86–90: rename the test to `'sets tile captions as text-caption'` and change `toContain('text-[11px]')` → `toContain('text-caption')`.

`mobile/__tests__/components/CoachCard.test.tsx`: add `import { StyleSheet } from 'react-native';` and `import { FONTS } from '../../src/theme';`, and:

```tsx
it('sets the number in the pixel label face, not a system mono, and the name as a Geist heading', () => {
  const s = render(<CoachCard characterId="mochi" paused testID="card" />);
  expect(StyleSheet.flatten(s.getByText('No.01').props.style).fontFamily).toBe(FONTS.pixel);
  expect(String(s.getByText('No.01').props.className).split(' ')).toContain('text-label');
  expect(StyleSheet.flatten(s.getByRole('header', { name: 'Mochi' }).props.style).fontFamily).toBe(FONTS.sansSemibold);
});
```

`mobile/__tests__/screens/CoachScreen.test.tsx` line 725: `const headers = utils.getAllByRole('header').map((h) => h.props.children);` → `const headers = utils.getAllByRole('header').map((h) => h.props.accessibilityLabel ?? h.props.children);` (the page title draws `COACH` and is announced as `Coach`; the expectation on line 726 stays as it is).

- [ ] **Step 2: Run them to verify they fail**

Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/components/ThinkingRow.test.tsx __tests__/components/CoachToday.test.tsx __tests__/components/AnswerCard.test.tsx __tests__/components/CoachCard.test.tsx`
Expected: FAIL (`DIALOG_TEXT_CLASS` undefined, value has no `text-caption`, width 96, caption `text-[11px]`, CoachCard number is Menlo).

- [ ] **Step 3: Implement**

`mobile/src/components/coach/thinking/Dialog.tsx`:
- import line 6: `import { pixelFont, useCoachVoice, useElapsed } from './shared';` → `import { useCoachVoice, useElapsed } from './shared';`
- replace lines 16–19 (`dialogTextStyle`) with:

```ts
/** The text inside the box: the pixel label face on an 18-pt line (it wraps), in light ink. */
export const DIALOG_TEXT_CLASS = 'text-label leading-[18px]';

/** The ink for DIALOG_TEXT_CLASS: the box is dark in both themes. */
export function dialogTextStyle(): TextStyle {
  return { color: DIALOG_INK };
}
```

- line 32: `<Text testID="thinking-dialog-tab" style={{ fontFamily: pixelFont(), fontSize: 11, color: DIALOG_GAP }}>` → `<Text testID="thinking-dialog-tab" className="text-label" style={{ color: DIALOG_GAP }}>`
- line 56: `<Text style={{ position: 'absolute', right: 8, bottom: 4, fontSize: 10, color: accent, transform: [{ translateY: hop ? 2 : 0 }] }}>▼</Text>` → `<Text className="text-fine" style={{ position: 'absolute', right: 8, bottom: 4, color: accent, transform: [{ translateY: hop ? 2 : 0 }] }}>▼</Text>`
- line 59: `<Text style={dialogTextStyle()}>{shown}</Text>` → `<Text className={DIALOG_TEXT_CLASS} style={dialogTextStyle()}>{shown}</Text>`

`mobile/src/components/coach/thinking/ReplyFrame.tsx`: import `{ DialogBox, DIALOG_TEXT_CLASS, dialogTextStyle } from './Dialog'` and add under `replyFrameTextStyle` (lines 19–21):

```ts
/** The streaming answer's type class in a reply frame: the dialog box's pixel text; otherwise none (the row's text-body). */
export function replyFrameTextClass(style: ReplyFrameStyle): string | undefined {
  return style === 'dialog' ? DIALOG_TEXT_CLASS : undefined;
}
```

`mobile/src/components/coach/CoachMessageRow.tsx`: import `replyFrameTextClass` alongside `replyFrameTextStyle`, and `cn` from `../../lib/utils` if not imported; line 68: `className="text-base leading-6" style={replyFrameTextStyle(frame)}` → `className={cn('text-body', replyFrameTextClass(frame))} style={replyFrameTextStyle(frame)}`.

`mobile/src/components/coach/thinking/Tag.tsx`: import `{ hexAlpha, useCoachVoice, useElapsed } from './shared'`; line 23 `<Text style={{ fontFamily: pixelFont(), fontSize: 12, letterSpacing: 0.5, color: text }}>THINKING</Text>` → `<Text className="text-label" style={{ color: text }}>THINKING</Text>`; line 25 `className="text-xs text-muted-foreground"` → `className="text-caption text-muted-foreground"`.

`mobile/src/components/coach/thinking/Shimmer.tsx`: the `fontFamilyFor` import → `textStyleFor`; line 38 `<Animated.Text className="text-sm font-semibold" style={[{ fontFamily: fontFamilyFor('font-semibold'), color: muted }, colorStyle]}>` → `<Animated.Text className="text-caption font-semibold" style={[textStyleFor('text-caption font-semibold'), { color: muted }, colorStyle]}>`; line 41 `className="ml-1.5 text-xs text-muted-foreground" style={{ fontVariant: ['tabular-nums'] }}` → `className="ml-1.5 text-caption text-muted-foreground tabular-nums"`.

`mobile/src/components/characters/CoachCard.tsx`:
- import `{ CHIP_ALPHA, MONO, PANEL_ALPHA, chipTextColor, hexAlpha }` → `{ CHIP_ALPHA, PANEL_ALPHA, chipTextColor, hexAlpha }`
- lines 76–79: `<Text` / `className="absolute left-3.5 top-3 text-[11px] text-muted-foreground"` / `style={{ fontFamily: MONO, fontWeight: '600', letterSpacing: 0.44 }}` / `>` → `<Text className="absolute left-3.5 top-3 text-label text-muted-foreground">`
- line 83: `className="text-[11px] font-semibold"` (focus chip) → `className="text-label uppercase"`
- line 92: `className="text-xl font-bold" style={{ letterSpacing: -0.2 }}` → `className="text-heading"`
- line 95: `className="text-[13px] leading-[18px] text-muted-foreground"` → `className="text-caption text-muted-foreground"` (keep `style={{ minHeight: 36 }}`)
- line 105: `className="text-[13px] leading-[18px]"` → `className="text-caption"`

`mobile/src/components/characters/palette.ts`: delete line 1 (`import { Platform } from 'react-native';`, now unused) and lines 4–5 (the `MONO` comment and export).

| File:line | Old | New |
|---|---|---|
| `components/coach-digest-card.tsx:67` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/coach-digest-card.tsx:86` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/coach-digest-card.tsx:90` | `className="font-display text-display-sm"` (preview) | `className="text-heading"` |
| `components/coach-digest-card.tsx:93` | `className="text-sm font-semibold text-coach"` | `className="text-caption font-semibold text-coach"` |
| `components/coach-digest-card.tsx:101` | `className="font-display text-display"` (sheet title) | `className="text-heading"` |
| `components/coach-digest-card.tsx:102` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/coach-digest-card.tsx:104` | `className="text-base"` | `className="text-body"` |
| `components/coach-digest-card.tsx:107` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/coach/CoachToday.tsx:60` | `className="font-display text-display-sm text-muted-foreground"` | `className="text-heading text-muted-foreground"` |
| `components/coach/CoachToday.tsx:73` | `className="font-display text-display-sm"` | `className="text-heading"` |
| `components/coach/CoachToday.tsx:75` | `className="font-display text-display-sm"` | `className="text-heading"` |
| `components/coach/CoachToday.tsx:87` | `className="font-display text-display-sm"` | `className="text-heading"` |
| `components/coach/CoachToday.tsx:107` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/coach/TodayBar.tsx:26` | `export const BAR_VALUE_WIDTH = 96;` | `export const BAR_VALUE_WIDTH = 104;` |
| `components/coach/TodayBar.tsx:79` | `className="text-xs text-muted-foreground"` (bar label, 58 wide) | `className="text-fine text-muted-foreground"` |
| `components/coach/TodayBar.tsx:103` | `className="font-bold" style={{ fontSize: 12, color: valueColor }}` | `className="text-caption font-bold tabular-nums" style={{ color: valueColor }}` |
| `components/coach/TodayBar.tsx:107` | `style={{ fontSize: 10.5, color: colors.todayUsual }}` | `className="text-fine" style={{ color: colors.todayUsual }}` |
| `components/coach/AnswerCard.tsx:74` | `className="text-base font-bold"` (tile value) | `className="text-body font-bold tabular-nums"` |
| `components/coach/AnswerCard.tsx:77` | `className="text-[11px] text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/coach/AnswerCard.tsx:92` | `className="w-4 text-sm text-muted-foreground"` | `className="w-4 text-caption text-muted-foreground tabular-nums"` |
| `components/coach/AnswerCard.tsx:93` | `className="shrink text-sm"` | `className="shrink text-body"` |
| `components/coach/AnswerCard.tsx:95` | `className="ml-auto text-xs text-foreground/80"` | `className="ml-auto text-caption text-foreground/80"` |
| `components/coach/AnswerCard.tsx:115` | `className="text-base font-semibold"` | `className="text-body font-semibold"` |
| `components/coach/AnswerCard.tsx:134` | `className="text-sm"` (the Try: line) | `className="text-body"` |
| `components/coach/AnswerCard.tsx:155` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/coach/CoachMessageRow.tsx:49` | `className="self-end text-xs text-destructive"` | `className="self-end text-caption text-destructive"` |
| `components/coach/CoachMessageRow.tsx:75` | `className="text-sm font-semibold"` | `className="text-body font-semibold"` |
| `components/coach/CoachMessageRow.tsx:77` | `className="text-sm"` | `className="text-body"` |
| `components/coach/CoachMessageRow.tsx:93` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/coach/CoachMessageRow.tsx:98` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/coach/ConversationsSheet.tsx:116` | `className="px-1 font-display text-display-sm"` | `className="px-1 text-heading"` |
| `components/coach/ConversationsSheet.tsx:141` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/coach/ConversationsSheet.tsx:147` | `className="px-1 text-sm text-muted-foreground"` | `className="px-1 text-caption text-muted-foreground"` |
| `components/coach/ConversationsSheet.tsx:164` | `className="text-right text-sm text-muted-foreground"` | `className="text-right text-caption text-muted-foreground"` |
| `components/coach/ConversationsSheet.tsx:179` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/coach/ErrorCard.tsx:79` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/coach/PromptBar.tsx:150` | `className="text-sm font-semibold"` | `className="text-body font-semibold"` |
| `components/coach/PromptBar.tsx:151` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/coach/thinking/Bouncy.tsx:20` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/coach/thinking/Bouncy.tsx:25` | `className="text-sm font-semibold"` | `className="text-caption font-semibold"` |
| `components/coach/thinking/Lines.tsx:15` | `className="pb-3 text-[13.5px] text-muted-foreground"` | `className="pb-3 text-caption text-muted-foreground"` |
| `components/coach/thinking/Lines.tsx:16` | `className="text-[13.5px] font-semibold"` | `className="text-caption font-semibold"` |
| `components/coach/thinking/Lines.tsx:21` | `className="text-[13.5px] text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/coach/thinking/Lines.tsx:22` | `className="text-[13.5px]"` | `className="text-caption"` |
| `components/coach/thinking/Nameplate.tsx:15, 18` | `className="text-[10.5px] font-semibold"` | `className="text-caption font-semibold"` |
| `components/coach/thinking/Placeholder.tsx:32` | `className="mb-1 text-[11.5px] font-semibold"` | `className="mb-1 text-caption font-semibold"` |
| `components/coach/thinking/Placeholder.tsx:61` | `className="text-[11.5px] text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/coach/thinking/Placeholder.tsx:62` | `className="text-[11.5px] font-semibold"` | `className="text-caption font-semibold"` |
| `components/coach/thinking/Steps.tsx:23` | `className="w-3 text-center text-[12.5px]"` | `className="w-3 text-center text-caption"` |
| `components/coach/thinking/Steps.tsx:26` | `'shrink text-[12.5px] text-muted-foreground' : 'shrink text-[12.5px] text-foreground'` | `'shrink text-caption text-muted-foreground' : 'shrink text-caption text-foreground'` |
| `components/coach/thinking/Strip.tsx:40` | `className="px-3 py-[9px] text-[13px] text-muted-foreground"` | `className="px-3 py-[9px] text-caption text-muted-foreground"` |
| `components/coach/thinking/Strip.tsx:41` | `className="text-[13px] font-semibold"` | `className="text-caption font-semibold"` |
| `components/coach/thinking/Typewriter.tsx:31` | `className="shrink text-[13.5px] font-semibold"` | `className="shrink text-caption font-semibold"` |
| `screens/CoachScreen.tsx:371-373` | `<Text accessibilityRole="header" className="font-display text-display">` / `Coach` / `</Text>` | `<PageTitle>Coach</PageTitle>` (import from `../components/ui/page-title`) |
| `screens/CoachScreen.tsx:413` | `className="text-center text-base text-muted-foreground"` | `className="text-center text-body text-muted-foreground"` |
| `screens/CoachScreen.tsx:428` | `className="text-center text-base text-muted-foreground"` | `className="text-center text-body text-muted-foreground"` |
| `screens/CoachScreen.tsx:454` | `className="px-1 text-sm text-muted-foreground"` | `className="px-1 text-caption text-muted-foreground"` |
| `screens/CoachScreen.tsx:460` | `className="px-1 text-sm text-muted-foreground"` | `className="px-1 text-caption text-muted-foreground"` |
| `screens/CoachScreen.tsx:468` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/CoachScreen.tsx:477` | `className="text-center font-display text-display-sm"` (empty-chat prompt, keeps its header role) | `className="text-center text-heading"` |
| `screens/CoachScreen.tsx:480` | `className="text-center text-sm text-muted-foreground"` | `className="text-center text-caption text-muted-foreground"` |
| `screens/CoachScreen.tsx:491` | `className="shrink text-base"` | `className="shrink text-body"` |
| `screens/CoachConsentScreen.tsx:129` | `className="font-display text-display"` (under the AI COACH header) | `className="text-display"` |
| `screens/CoachConsentScreen.tsx:135` | `className="flex-1 text-sm"` | `className="flex-1 text-body"` |
| `screens/CoachConsentScreen.tsx:142` | `className="text-base leading-6"` | `className="text-body"` |
| `screens/CoachConsentScreen.tsx:153` | `className="flex-1 text-sm text-muted-foreground"` | `className="flex-1 text-caption text-muted-foreground"` |
| `screens/CoachConsentScreen.tsx:160` | `className="text-sm text-destructive"` | `className="text-caption text-destructive"` |
| `screens/CoachMemoryScreen.tsx:91` | `className="text-base"` | `className="text-body"` |
| `screens/CoachMemoryScreen.tsx:95` | `className="flex-1 text-xs text-coach"` | `className="flex-1 text-caption text-coach"` |
| `screens/CoachMemoryScreen.tsx:101` | `className="text-sm text-destructive"` | `className="text-caption text-destructive"` |
| `screens/CoachMemoryScreen.tsx:107` | `className="text-sm font-medium"` | `className="text-body font-medium"` |
| `screens/CoachMemoryScreen.tsx:224` | `className="font-display text-display-sm"` | `className="text-heading"` |
| `screens/CoachMemoryScreen.tsx:225` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/HostedConsentScreen.tsx:115` | `className="font-display text-display"` (keeps its header role) | `className="text-display"` |
| `screens/HostedConsentScreen.tsx:123` | `className="flex-1 text-sm"` | `className="flex-1 text-body"` |
| `screens/HostedConsentScreen.tsx:128` | `className="text-base leading-6"` | `className="text-body"` |
| `screens/HostedConsentScreen.tsx:147` | `className="text-sm text-destructive"` | `className="text-caption text-destructive"` |
| `screens/MeetYourCoachScreen.tsx:117` | `<Text className="text-eyebrow font-semibold uppercase text-muted-foreground">Meet your coach</Text>` | `<SectionLabel>Meet your coach</SectionLabel>` (import from `../components/ui/section-label`) |
| `screens/MeetYourCoachScreen.tsx:151` | `className="text-[11px] font-semibold"` (grid tile name, one line) | `className="text-caption font-semibold"` |
| `screens/MeetYourCoachScreen.tsx:173` | `className="text-center text-sm text-destructive"` | `className="text-center text-caption text-destructive"` |
| `screens/ThinkingStyleScreen.tsx:68` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/ThinkingStyleScreen.tsx:98` | `cn('text-[11px]', isSelected ? 'font-semibold' : '')` | `cn('text-caption', isSelected ? 'font-semibold' : '')` |
| `screens/ThinkingStyleScreen.tsx:109` | `className="text-sm text-destructive"` | `className="text-caption text-destructive"` |
| `screens/ThinkingStyleScreen.tsx:113` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/ThinkingTextScreen.tsx:77` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/ThinkingTextScreen.tsx:82` | `className="text-sm"` (sample question) | `className="text-body"` |
| `screens/ThinkingTextScreen.tsx:103` | `cn('text-base', isSelected ? 'font-semibold' : '')` | `cn('text-body', isSelected ? 'font-semibold' : '')` |
| `screens/ThinkingTextScreen.tsx:104` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/ThinkingTextScreen.tsx:123` | `className="px-4 text-sm text-destructive"` | `className="px-4 text-caption text-destructive"` |
| `components/memory-edit-form.tsx:69-70` | `className="self-end text-xs text-muted-foreground"` / `style={{ fontVariant: ['tabular-nums'] }}` | `className="self-end text-caption text-muted-foreground tabular-nums"` (delete the `style` line) |
| `components/memory-edit-form.tsx:75` | `className="text-sm text-destructive"` | `className="text-caption text-destructive"` |
| `components/memory-proposal-chips.tsx:62` | `className="shrink text-sm"` | `className="shrink text-body"` |
| `components/memory-proposal-chips.tsx:75` | `className="pl-6 text-xs text-destructive"` | `className="pl-6 text-caption text-destructive"` |
| `components/coach-settings-section.tsx:77` | `className="-mt-4 px-4 text-sm text-destructive"` | `className="-mt-4 px-4 text-caption text-destructive"` |
| `components/ai-engine-row.tsx:138` | `className="px-4 text-sm text-muted-foreground"` | `className="px-4 text-caption text-muted-foreground"` |
| `components/ai-engine-row.tsx:143` | `className="px-4 text-sm text-destructive"` | `className="px-4 text-caption text-destructive"` |
| `components/ai-engine-row.tsx:148` | `className="px-4 text-sm text-destructive"` | `className="px-4 text-caption text-destructive"` |

`__tests__/conventions/typography.test.ts`: delete the `PENDING` entries for every file in the Task 6 block: `components/coach-digest-card.tsx`, `components/coach/CoachToday.tsx`, `components/coach/TodayBar.tsx`, `components/coach/AnswerCard.tsx`, `components/coach/CoachMessageRow.tsx`, `components/coach/ConversationsSheet.tsx`, `components/coach/ErrorCard.tsx`, `components/coach/PromptBar.tsx`, `components/coach/thinking/Bouncy.tsx`, `components/coach/thinking/Dialog.tsx`, `components/coach/thinking/Lines.tsx`, `components/coach/thinking/Nameplate.tsx`, `components/coach/thinking/Placeholder.tsx`, `components/coach/thinking/Shimmer.tsx`, `components/coach/thinking/Steps.tsx`, `components/coach/thinking/Strip.tsx`, `components/coach/thinking/Tag.tsx`, `components/coach/thinking/Typewriter.tsx`, `components/characters/CoachCard.tsx`, `screens/CoachScreen.tsx`, `screens/CoachConsentScreen.tsx`, `screens/CoachMemoryScreen.tsx`, `screens/HostedConsentScreen.tsx`, `screens/MeetYourCoachScreen.tsx`, `screens/ThinkingStyleScreen.tsx`, `screens/ThinkingTextScreen.tsx`, `components/memory-edit-form.tsx`, `components/memory-proposal-chips.tsx`, `components/coach-settings-section.tsx`, `components/ai-engine-row.tsx`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `grep -rn "MONO" src __tests__` (from `mobile/`). Expected: no output.
Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/components/ThinkingRow.test.tsx __tests__/components/CoachToday.test.tsx __tests__/components/AnswerCard.test.tsx __tests__/components/CoachCard.test.tsx __tests__/components/CoachDigestCard.test.tsx __tests__/components/ConversationsSheet.test.tsx __tests__/components/PromptBar.test.tsx __tests__/components/MemoryProposalChips.test.tsx __tests__/components/AiEngineRow*.test.tsx __tests__/components/StreamingText.test.tsx __tests__/screens/Coach* __tests__/screens/HostedConsentScreen.test.tsx __tests__/screens/MeetYourCoachScreen.test.tsx __tests__/screens/ThinkingSettings.test.tsx __tests__/screens/SettingsCoach*.test.tsx __tests__/conventions`
Expected: PASS.

- [ ] **Step 5: Full suite, tsc, commit**

Run the full Jest command and the tsc command. Expected: all green; only the 12 baseline tsc errors.

```bash
git add mobile/src mobile/__tests__
git commit -m "refactor(mobile): Coach on the type scale; the thinking pixel text is text-label and Menlo is gone"
```

---

### Task 7: Social, stories, Highlights, Buddies, and the Campfire panel labels

**Files:**
- Modify: `mobile/src/screens/SocialScreen.tsx`, `screens/SocialStoryScreen.tsx:260`, `components/social/SocialStoryFrame.tsx`, `components/social/StoriesRow.tsx`, `components/social/TimelineList.tsx`, `components/social/CheckInSheet.tsx`, `components/social/GoodnightButton.tsx`, `components/social/HighlightsCarousel.tsx`, `screens/HighlightsScreen.tsx`
- Modify (two lines and one import only): `mobile/src/screens/CampfireScreen.tsx:94,352`
- Modify: `mobile/src/components/buddies/BuddyListRow.tsx:21`, `buddies/HandleSetupForm.tsx`, `buddies/MoodNoticeSheet.tsx`, `buddies/SharingConsentSheet.tsx`, `screens/BuddiesScreen.tsx:36`, `screens/BuddyWeekScreen.tsx`, `screens/PairUpScreen.tsx`, `screens/BlockedPeopleScreen.tsx`
- Test: `__tests__/screens/HighlightsScreen.test.tsx`, `__tests__/screens/BuddyWeekScreen.test.tsx`, `__tests__/components/StoriesRow.test.tsx`, `__tests__/screens/CampfireScreen.test.tsx`, `__tests__/conventions/typography.test.ts`

**Interfaces:**
- Consumes: Task 1 (`PageTitle`, `SectionLabel`, tokens).
- Produces: `BuddyWeekScreen`'s title is `<PageTitle testID="buddy-week-name">`. CampfireScreen moves to `EXEMPT` with count 13.

**Campfire rule (spec §6, owner-approved):** in `CampfireScreen.tsx` only the panel's two section labels change, to `SectionLabel` (TONIGHT'S FIRE keeps its foreground colour). The scene kicker and headline (lines 329–330), the fire count and lines, `+N here`, "Who's here" rows, and every other line stay byte-for-byte. `CampScene.tsx` and `CampBanner.tsx` are not opened.

- [ ] **Step 1: Write the failing tests**

`mobile/__tests__/screens/HighlightsScreen.test.tsx` line 21: `toHaveTextContent('Week 40 highlights')` → `toHaveTextContent('WEEK 40 HIGHLIGHTS')`, and add on the next line `expect(screen.getByRole('header', { name: 'Week 40 highlights' })).toBeTruthy();`.

`mobile/__tests__/screens/BuddyWeekScreen.test.tsx`, add:

```tsx
it('wraps a long buddy name in the pixel title instead of clipping it, and reads it in its own case', async () => {
  const long = 'Alexandria Montgomery-Vasquez';
  (fetchBuddyWeek as jest.Mock).mockResolvedValue({ ...WEEK, buddy: { ...WEEK.buddy, displayName: long } });
  render(<BuddyWeekScreen />);
  const title = await screen.findByTestId('buddy-week-name');
  expect(title).toHaveTextContent(long.toUpperCase());
  expect(title.props.numberOfLines).toBeUndefined();
  expect(screen.getByRole('header', { name: long })).toBeTruthy();
});

it('keeps the numbers grid in tabular figures that fit its 36-pt cells', async () => {
  (fetchBuddyWeek as jest.Mock).mockResolvedValue({ ...WEEK, shares: ['steps'], numbers: { steps: dates.map((date) => ({ date, value: 12345 })) } });
  render(<BuddyWeekScreen />);
  const cell = await screen.findByTestId('number-steps-0');
  expect(String(cell.props.className).split(' ')).toEqual(expect.arrayContaining(['w-9', 'text-fine', 'tabular-nums']));
});
```

`mobile/__tests__/components/StoriesRow.test.tsx`, add:

```tsx
it('keeps a long buddy name under its ring to one line', () => {
  render(
    <StoriesRow
      me={{ person: person('me'), checkIn: null }}
      rings={[{ author: { ...person('kai'), displayName: 'Bartholomew Featherstonehaugh' }, unseen: true, locked: false, frameCount: 1, latestAt: '' }]}
      onCheckIn={jest.fn()} onOpenStory={jest.fn()} onSeeAll={jest.fn()}
    />,
  );
  const name = screen.getByText(/Bartholomew/);
  expect(name.props.numberOfLines).toBe(1);
  expect(String(name.props.className).split(' ')).toContain('text-caption');
});
```

`mobile/__tests__/screens/CampfireScreen.test.tsx`: add `StyleSheet` to the `react-native` import on line 2, add `import { FONTS } from '../../src/theme';`, and in the first test (`'draws the night camp: …'`), after line 70 (`expect(screen.getByTestId('camp-fire-count')).toHaveTextContent('3/5');`):

```tsx
  // The panel's two section labels are pixel SectionLabels (owner ruling, spec §6); the scene is untouched.
  for (const label of ["TONIGHT'S FIRE", /^WHO'S HERE · \d+$/]) {
    const el = screen.getByText(label);
    expect(String(el.props.className).split(' ')).toEqual(expect.arrayContaining(['text-label', 'uppercase']));
    expect(StyleSheet.flatten(el.props.style).fontFamily).toBe(FONTS.pixel);
  }
```

- [ ] **Step 2: Run them to verify they fail**

Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/screens/HighlightsScreen.test.tsx __tests__/screens/BuddyWeekScreen.test.tsx __tests__/components/StoriesRow.test.tsx __tests__/screens/CampfireScreen.test.tsx`
Expected: FAIL (titles not caps, no `buddy-week-name`, names `text-xs`, Campfire labels not `text-label`).

- [ ] **Step 3: Implement**

`mobile/src/screens/CampfireScreen.tsx` (import `SectionLabel` from `../components/ui/section-label`; nothing else changes):
- line 94: `<Text className="text-sm tracking-[1px]" style={{ fontFamily: pixelFont() }}>TONIGHT'S FIRE</Text>` → `<SectionLabel className="text-foreground">TONIGHT'S FIRE</SectionLabel>`
- line 352: ``<Text className="text-xs font-semibold tracking-[0.8px] text-muted-foreground">{`WHO'S HERE · ${camp.members.length}`}</Text>`` → ``<SectionLabel>{`WHO'S HERE · ${camp.members.length}`}</SectionLabel>``

| File:line | Old | New |
|---|---|---|
| `screens/SocialScreen.tsx:65` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/SocialScreen.tsx:76` | `className="text-sm"` | `className="text-body"` |
| `screens/SocialScreen.tsx:101` | `<Text className="font-display text-display">Social</Text>` | `<PageTitle>Social</PageTitle>` (import from `../components/ui/page-title`) |
| `screens/SocialScreen.tsx:123` | `className="min-w-5 rounded-full bg-accent px-1.5 text-center text-xs font-bold text-background"` | `className="min-w-5 rounded-full bg-accent px-1.5 text-center text-caption font-bold tabular-nums text-background"` |
| `screens/SocialStoryScreen.tsx:260` | `className="text-center text-sm text-white/80"` | `className="text-center text-caption text-white/80"` |
| `components/social/SocialStoryFrame.tsx:32` | `className="text-center text-lg font-semibold text-white"` | `className="text-center text-headline text-white"` |
| `components/social/SocialStoryFrame.tsx:40, 46, 52, 58` | `className="text-xs font-semibold uppercase tracking-widest text-white/70"` (kickers) | `className="text-label uppercase text-white/70"` |
| `components/social/SocialStoryFrame.tsx:41` | `className="font-display text-display text-white"` | `className="text-heading text-white"` |
| `components/social/SocialStoryFrame.tsx:47, 53, 59` | `className="text-center font-display text-display text-white"` | `className="text-center text-heading text-white"` |
| `components/social/StoriesRow.tsx:49` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/social/StoriesRow.tsx:65` | `className="text-xs text-muted-foreground" numberOfLines={1}` | `className="text-caption text-muted-foreground" numberOfLines={1}` |
| `components/social/TimelineList.tsx:55` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/social/TimelineList.tsx:69` | `className="w-11 text-right text-xs text-muted-foreground"` (H:MM) | `className="w-11 text-right text-caption text-muted-foreground tabular-nums"` |
| `components/social/TimelineList.tsx:71` | `className="flex-1 text-sm"` | `className="flex-1 text-body"` |
| `components/social/TimelineList.tsx:84` | `className="text-sm text-destructive"` | `className="text-caption text-destructive"` |
| `components/social/CheckInSheet.tsx:40` | `className="font-display text-display-sm"` | `className="text-heading"` |
| `components/social/CheckInSheet.tsx:41` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/social/CheckInSheet.tsx:50` | `className="text-sm text-destructive"` | `className="text-caption text-destructive"` |
| `components/social/GoodnightButton.tsx:76` | `className="text-sm font-semibold"` | `className="text-body font-semibold"` |
| `components/social/GoodnightButton.tsx:98` | `className="text-sm text-destructive"` | `className="text-caption text-destructive"` |
| `components/social/HighlightsCarousel.tsx:29` | `` className={`text-[10px] font-semibold uppercase tracking-widest ${color ? '' : 'text-muted-foreground'}`} `` | `` className={`text-label uppercase ${color ? '' : 'text-muted-foreground'}`} `` |
| `components/social/HighlightsCarousel.tsx:33` | `className={index === 0 ? 'font-display text-display-sm' : 'text-sm font-semibold'}` | `className={index === 0 ? 'text-heading' : 'text-body font-semibold'}` |
| `screens/HighlightsScreen.tsx:100` | `<Text testID="highlights-heading" className="font-display text-display">{highlightsTitle(highlights.weekStart)}</Text>` | `<PageTitle testID="highlights-heading">{highlightsTitle(highlights.weekStart)}</PageTitle>` (import from `../components/ui/page-title`) |
| `screens/HighlightsScreen.tsx:101` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/HighlightsScreen.tsx:108` | `` className={`text-[10px] font-semibold uppercase tracking-widest ${color ? '' : 'text-muted-foreground'}`} `` | `` className={`text-label uppercase ${color ? '' : 'text-muted-foreground'}`} `` |
| `screens/HighlightsScreen.tsx:122` | `className="text-sm text-destructive"` | `className="text-caption text-destructive"` |
| `components/buddies/BuddyListRow.tsx:21` | `className="text-sm"` (mood line, coloured by style) | `className="text-caption"` |
| `components/buddies/HandleSetupForm.tsx:54` | `className="font-display text-display"` (under the BUDDY NAME header) | `className="text-display"` |
| `components/buddies/HandleSetupForm.tsx:55` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/buddies/HandleSetupForm.tsx:58` | `className="text-sm text-destructive"` | `className="text-caption text-destructive"` |
| `components/buddies/MoodNoticeSheet.tsx:19` | `className="font-display text-display-sm"` | `className="text-heading"` |
| `components/buddies/MoodNoticeSheet.tsx:21` | `className="text-sm text-destructive"` | `className="text-caption text-destructive"` |
| `components/buddies/SharingConsentSheet.tsx:22` | `className="font-display text-display-sm"` | `className="text-heading"` |
| `components/buddies/SharingConsentSheet.tsx:24` | `className="text-sm text-muted-foreground"` (the sheet's explanation) | `className="text-body text-muted-foreground"` |
| `screens/BuddiesScreen.tsx:36` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/BuddyWeekScreen.tsx:154` | `<Text className="font-display text-display">{week.buddy.displayName}</Text>` | `<PageTitle testID="buddy-week-name">{week.buddy.displayName}</PageTitle>` (import from `../components/ui/page-title`) |
| `screens/BuddyWeekScreen.tsx:155` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/BuddyWeekScreen.tsx:171` | `className="text-xs text-muted-foreground"` (weekday letter over a tile) | `className="text-fine text-muted-foreground"` |
| `screens/BuddyWeekScreen.tsx:177` | `className="text-xs text-muted-foreground"` (row label) | `className="text-caption text-muted-foreground"` |
| `screens/BuddyWeekScreen.tsx:184` | `className="w-9 text-center text-xs"` (number cell, 36 pt) | `className="w-9 text-center text-fine tabular-nums"` |
| `screens/BuddyWeekScreen.tsx:195` | `className="rounded-full bg-muted px-3 py-1 text-xs"` | `className="rounded-full bg-muted px-3 py-1 text-caption"` |
| `screens/BuddyWeekScreen.tsx:208` | `note.error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'` | `note.error ? 'text-caption text-destructive' : 'text-caption text-muted-foreground'` |
| `screens/BuddyWeekScreen.tsx:211` | `className="text-center text-sm text-muted-foreground"` | `className="text-center text-caption text-muted-foreground"` |
| `screens/PairUpScreen.tsx:130` | `<Text className="font-display text-display">Pair up with a friend</Text>` | `<PageTitle>Pair up with a friend</PageTitle>` (spec §4 lists PairUp as a screen title; import from `../components/ui/page-title`) |
| `screens/PairUpScreen.tsx:131` | `className="text-center text-sm text-muted-foreground"` | `className="text-center text-caption text-muted-foreground"` |
| `screens/PairUpScreen.tsx:137` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/PairUpScreen.tsx:140` | `className="text-3xl font-semibold tracking-widest"` (the buddy code; keep its tracking) | `className="text-display font-semibold tracking-widest tabular-nums"` |
| `screens/PairUpScreen.tsx:141` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/PairUpScreen.tsx:158` | `message.error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'` | `message.error ? 'text-caption text-destructive' : 'text-caption text-muted-foreground'` |
| `screens/BlockedPeopleScreen.tsx:73` | `className="pb-2 text-sm text-destructive"` | `className="pb-2 text-caption text-destructive"` |
| `screens/BlockedPeopleScreen.tsx:79` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |

`__tests__/conventions/typography.test.ts`:
- delete the `PENDING` entries for `screens/SocialScreen.tsx`, `screens/SocialStoryScreen.tsx`, `components/social/SocialStoryFrame.tsx`, `components/social/StoriesRow.tsx`, `components/social/TimelineList.tsx`, `components/social/CheckInSheet.tsx`, `components/social/GoodnightButton.tsx`, `components/social/HighlightsCarousel.tsx`, `screens/HighlightsScreen.tsx`, `screens/CampfireScreen.tsx`, `components/buddies/BuddyListRow.tsx`, `components/buddies/HandleSetupForm.tsx`, `components/buddies/MoodNoticeSheet.tsx`, `components/buddies/SharingConsentSheet.tsx`, `screens/BuddiesScreen.tsx`, `screens/BuddyWeekScreen.tsx`, `screens/PairUpScreen.tsx`, `screens/BlockedPeopleScreen.tsx`.
- add to `EXEMPT`, after the CampNoteCard entry:
  `{ file: 'screens/CampfireScreen.tsx', count: 13, reason: 'the Campfire scene chrome and panel text keep their sizes (spec §6); only its two panel labels became SectionLabels' },`

- [ ] **Step 4: Check the Campfire diff**

Run: `git diff 120e739 -- mobile/src/screens/CampfireScreen.tsx`
Expected: exactly three changed spots: the `SectionLabel` import, the TONIGHT'S FIRE line, the WHO'S HERE line.
Run: `git diff 120e739 --stat -- mobile/src/components/social/CampScene.tsx mobile/src/components/social/CampBanner.tsx`
Expected: no output.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/screens/Social* __tests__/screens/Highlights* __tests__/screens/Campfire* __tests__/screens/Buddies* __tests__/screens/BuddyWeekScreen.test.tsx __tests__/screens/BuddyIdentityScreen.test.tsx __tests__/screens/PairUpScreen.test.tsx __tests__/screens/BlockedPeopleScreen.test.tsx __tests__/components/StoriesRow.test.tsx __tests__/components/TimelineList.test.tsx __tests__/components/CheckInSheet.test.tsx __tests__/components/GoodnightButton.test.tsx __tests__/components/HighlightsCarousel.test.tsx __tests__/components/HandleSetupForm.test.tsx __tests__/components/MoodNoticeGate.test.tsx __tests__/components/CampBanner.test.tsx __tests__/components/SceneButtons.test.tsx __tests__/conventions`
Expected: PASS (CampBanner and SceneButtons unchanged: their sources were not touched).

- [ ] **Step 6: Full suite, tsc, commit**

Run the full Jest command and the tsc command. Expected: all green; only the 12 baseline tsc errors.

```bash
git add mobile/src mobile/__tests__
git commit -m "refactor(mobile): Social, stories, Highlights and Buddies on the type scale; Campfire panel labels are SectionLabels"
```

---

### Task 8: Chats (inbox, rows, thread, bubbles, notes, requests, sheets)

**Files:**
- Modify: `mobile/src/components/chats/ChatComposer.tsx:35,95`, `chats/ChatRow.tsx:40-41`, `chats/ChatSettingsSection.tsx:52,95`, `chats/MessageBubble.tsx`, `chats/NewChatSheet.tsx`, `chats/NoteComposerSheet.tsx:50-65`, `chats/NotesRow.tsx`, `chats/ReportSheet.tsx`, `chats/RequestsList.tsx`
- Modify: `mobile/src/screens/ChatsScreen.tsx:154,173,229,234`, `screens/ChatThreadScreen.tsx`, `screens/ChatRequestsScreen.tsx`
- Test: `__tests__/screens/ChatsScreen.test.tsx`, `__tests__/screens/ChatRequestsScreen.test.tsx`, `__tests__/conventions/typography.test.ts`

**Interfaces:**
- Consumes: Task 1 (`PageTitle`, `SectionLabel`, tokens); Task 3 already put `inputTextStyle` on the inputs here.
- Produces: the Chats header (`chats-handle`) and the Requests header are `PageTitle`s.

- [ ] **Step 1: Write the failing tests**

`mobile/__tests__/screens/ChatsScreen.test.tsx`: add `within` to the `@testing-library/react-native` import. In `it('lists conversations …')`:
- line 71: `toHaveTextContent('@tushar')` → `toHaveTextContent('@TUSHAR')`, and add right after it:

```ts
  // The header is the pixel page title: one line, announced in the handle's own case.
  expect(screen.getByTestId('chats-handle').props.numberOfLines).toBe(1);
  expect(screen.getByRole('header', { name: '@tushar' })).toBeTruthy();
  // Crowded rows still fit: one line each for the name and the last message.
  const line = screen.getByTestId('chat-row-ben-line');
  expect(line.props.numberOfLines).toBe(1);
  expect(String(line.props.className).split(' ')).toContain('text-caption');
  expect(within(screen.getByTestId('chat-row-ben')).getByText('Ben').props.numberOfLines).toBe(1);
```

`mobile/__tests__/screens/ChatRequestsScreen.test.tsx` (its tests render the screen directly, `render(<ChatRequestsScreen />)`; the mocks at the top of the file already load a board), add:

```tsx
it('titles the board with the pixel page title', async () => {
  render(<ChatRequestsScreen />);
  expect(await screen.findByRole('header', { name: 'Requests' })).toHaveTextContent('REQUESTS');
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/screens/ChatsScreen.test.tsx __tests__/screens/ChatRequestsScreen.test.tsx`
Expected: FAIL (`@tushar` is not caps; no header named `@tushar`; the row line is `text-[13.5px]`).

- [ ] **Step 3: Implement**

| File:line | Old | New |
|---|---|---|
| `components/chats/ChatComposer.tsx:35` | `className="flex-1 text-xs text-muted-foreground"` | `className="flex-1 text-caption text-muted-foreground"` |
| `components/chats/ChatComposer.tsx:95` | `length > MESSAGE_MAX ? 'self-end text-xs text-destructive' : 'self-end text-xs text-muted-foreground'` | `length > MESSAGE_MAX ? 'self-end text-caption text-destructive tabular-nums' : 'self-end text-caption text-muted-foreground tabular-nums'` |
| `components/chats/ChatRow.tsx:40` | `className={unread ? 'text-[15px] font-bold' : 'text-[15px] font-medium'}` | `className={unread ? 'text-body font-bold' : 'text-body font-medium'}` |
| `components/chats/ChatRow.tsx:41` | `className={unread ? 'text-[13.5px] font-semibold text-foreground' : 'text-[13.5px] text-muted-foreground'}` | `className={unread ? 'text-caption font-semibold text-foreground' : 'text-caption text-muted-foreground'}` |
| `components/chats/ChatSettingsSection.tsx:52` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/chats/ChatSettingsSection.tsx:95` | `className="px-4 text-sm text-destructive"` | `className="px-4 text-caption text-destructive"` |
| `components/chats/MessageBubble.tsx:25` | `className="px-1 text-[11px] text-muted-foreground"` | `className="px-1 text-caption text-muted-foreground"` |
| `components/chats/MessageBubble.tsx:27` | `className="text-[10px] font-semibold tracking-[1.2px] text-muted-foreground"` (card kicker) | `className="text-label uppercase text-muted-foreground"` |
| `components/chats/MessageBubble.tsx:30` | `card.available ? 'flex-1 text-[14px] font-semibold' : 'flex-1 text-[14px] text-muted-foreground'` | `card.available ? 'flex-1 text-body font-semibold' : 'flex-1 text-body text-muted-foreground'` |
| `components/chats/MessageBubble.tsx:53` | `className="px-1 text-[11px] text-muted-foreground"` | `className="px-1 text-caption text-muted-foreground"` |
| `components/chats/MessageBubble.tsx:61` | `className="text-[11px] font-semibold text-muted-foreground"` | `className="text-caption font-semibold text-muted-foreground"` |
| `components/chats/MessageBubble.tsx:66` | `m.mine ? 'text-[15px] leading-5 text-accent-foreground' : 'text-[15px] leading-5 text-foreground'` | `m.mine ? 'text-body text-accent-foreground' : 'text-body text-foreground'` |
| `components/chats/MessageBubble.tsx:76` | both `… px-2 py-0.5 text-[11px]'` (reaction pills) | both `… px-2 py-0.5 text-caption'` |
| `components/chats/NewChatSheet.tsx:17` | `className="text-base font-semibold"` ("New message", sheet title) | `className="text-headline"` |
| `components/chats/NewChatSheet.tsx:20` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/chats/NewChatSheet.tsx:37` | `className="text-sm text-muted-foreground"` (@handle, one line) | `className="text-caption text-muted-foreground"` |
| `components/chats/NoteComposerSheet.tsx:50` | `className="text-base font-semibold"` ("Share a note", sheet title) | `className="text-headline"` |
| `components/chats/NoteComposerSheet.tsx:51` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/chats/NoteComposerSheet.tsx:61` | `length > STATUS_NOTE_MAX ? 'self-end text-xs text-destructive' : 'self-end text-xs text-muted-foreground'` | `length > STATUS_NOTE_MAX ? 'self-end text-caption text-destructive tabular-nums' : 'self-end text-caption text-muted-foreground tabular-nums'` |
| `components/chats/NoteComposerSheet.tsx:65` | `className="text-sm text-destructive"` | `className="text-caption text-destructive"` |
| `components/chats/NotesRow.tsx:17` | `` className={`text-center text-[10.5px] leading-[13px] ${prompt ? `` (two lines in the small bubble over an avatar) | `` className={`text-center text-fine ${prompt ? `` |
| `components/chats/NotesRow.tsx:51` | `className="text-xs text-muted-foreground"` ("Your note") | `className="text-caption text-muted-foreground"` |
| `components/chats/NotesRow.tsx:70` | `className="text-xs text-muted-foreground"` (name, one line) | `className="text-caption text-muted-foreground"` |
| `components/chats/ReportSheet.tsx:89` | `className="text-xl font-bold"` (sheet title) | `className="text-heading"` |
| `components/chats/ReportSheet.tsx:90` | `className="mb-1.5 text-sm text-muted-foreground"` | `className="mb-1.5 text-caption text-muted-foreground"` |
| `components/chats/ReportSheet.tsx:104` | `className="text-[15px]"` | `className="text-body"` |
| `components/chats/ReportSheet.tsx:118` | `className="text-[15px]"` | `className="text-body"` |
| `components/chats/ReportSheet.tsx:120` | `className="text-sm text-destructive"` | `className="text-caption text-destructive"` |
| `components/chats/RequestsList.tsx:116` | `className="text-sm text-destructive"` | `className="text-caption text-destructive"` |
| `components/chats/RequestsList.tsx:126` | `className="text-[15px] font-semibold"` | `className="text-body font-semibold"` |
| `components/chats/RequestsList.tsx:127` | `className="text-[13px] text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/chats/RequestsList.tsx:148` | `className="flex-1 text-[15px]"` | `className="flex-1 text-body"` |
| `screens/ChatsScreen.tsx:154` | ``<Text testID="chats-handle" numberOfLines={1} className="flex-1 text-center text-[17px] font-bold">{home ? `@${home.me.person.handle}` : 'Chats'}</Text>`` | ``<PageTitle testID="chats-handle" numberOfLines={1} className="flex-1 text-center">{home ? `@${home.me.person.handle}` : 'Chats'}</PageTitle>`` (import from `../components/ui/page-title`) |
| `screens/ChatsScreen.tsx:173` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/ChatsScreen.tsx:229` | `className="text-base font-bold"` ("Messages") | `className="text-headline"` |
| `screens/ChatsScreen.tsx:234` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/ChatThreadScreen.tsx:313` | `className="text-[15px] font-bold"` (thread-name, one line) | `className="text-body font-bold"` |
| `screens/ChatThreadScreen.tsx:314` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/ChatThreadScreen.tsx:335` | `className="my-1 self-center overflow-hidden rounded-[10px] bg-secondary px-2.5 py-0.5 text-[11px] text-muted-foreground"` | `className="my-1 self-center overflow-hidden rounded-[10px] bg-secondary px-2.5 py-0.5 text-caption text-muted-foreground"` |
| `screens/ChatThreadScreen.tsx:337` | `className="self-end px-1 text-[11px] text-muted-foreground"` | `className="self-end px-1 text-caption text-muted-foreground"` |
| `screens/ChatThreadScreen.tsx:344` | `className="px-4 pb-1 text-sm text-destructive"` | `className="px-4 pb-1 text-caption text-destructive"` |
| `screens/ChatRequestsScreen.tsx:27` | `className="text-[13.5px] leading-[19px] text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/ChatRequestsScreen.tsx:47` | `<Text accessibilityRole="header" className="text-[17px] font-bold">Requests</Text>` | `<PageTitle>Requests</PageTitle>` (import from `../components/ui/page-title`; drop `Text` from imports only if now unused) |

`__tests__/conventions/typography.test.ts`: delete the `PENDING` entries for `components/chats/ChatComposer.tsx`, `components/chats/ChatRow.tsx`, `components/chats/ChatSettingsSection.tsx`, `components/chats/MessageBubble.tsx`, `components/chats/NewChatSheet.tsx`, `components/chats/NoteComposerSheet.tsx`, `components/chats/NotesRow.tsx`, `components/chats/ReportSheet.tsx`, `components/chats/RequestsList.tsx`, `screens/ChatsScreen.tsx`, `screens/ChatThreadScreen.tsx`, `screens/ChatRequestsScreen.tsx`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/screens/Chat* __tests__/screens/SocialStoryChats.test.tsx __tests__/components/ChatSettingsSection.test.tsx __tests__/components/inputs.test.tsx __tests__/screens/CampfireScreen.test.tsx __tests__/conventions`
Expected: PASS (CampfireScreen uses ReportSheet: only its classes changed).

- [ ] **Step 5: Full suite, tsc, commit**

Run the full Jest command and the tsc command. Expected: all green; only the 12 baseline tsc errors.

```bash
git add mobile/src mobile/__tests__
git commit -m "refactor(mobile): Chats on the type scale; the inbox and Requests headers are pixel page titles"
```

---

### Task 9: Recaps, badges and achievements (share cards stay as they are)

**Files:**
- Modify: `mobile/src/components/recap/RecapShelf.tsx:77` (the empty line only; its tiles are a share-card exemption), `recap/ShareWithBuddiesButton.tsx`
- Modify: `mobile/src/screens/RecapScreen.tsx`, `screens/RecapsScreen.tsx`, `screens/RecapStoryScreen.tsx`, `screens/RecapBuilderScreen.tsx`, `screens/YearInPixelsScreen.tsx:47`
- Modify: `mobile/src/components/achievements/BadgesCard.tsx`, `components/milestones/MilestoneTiles.tsx`, `screens/BadgesScreen.tsx`, `screens/BadgeDetailScreen.tsx`
- Not modified (share cards, spec §5; they already draw only Geist and pixel): `components/recap/WeeklyStoryView.tsx`, `recap/RecapCardView.tsx`, `recap/YearPixelsView.tsx`, `achievements/BadgeShareCard.tsx`, `achievements/CelebrationModal.tsx`
- Test: `__tests__/screens/RecapScreen.test.tsx`, `__tests__/components/BadgesCard.test.tsx`, `__tests__/screens/BadgeDetailScreen.test.tsx`, `__tests__/conventions/typography.test.ts`

**Interfaces:**
- Consumes: Task 1 (`PageTitle`, `SectionLabel`, tokens).
- Produces: `recap-title` and `badge-detail-title` are `PageTitle`s. RecapShelf moves to `EXEMPT` with count 4.

- [ ] **Step 1: Write the failing tests**

`mobile/__tests__/screens/RecapScreen.test.tsx`: the title is a pixel page title, drawn in caps. Change only the expected strings of `recap-title`:
- lines 58, 162: `'September with Mochi'` → `'SEPTEMBER WITH MOCHI'`
- lines 99, 200, 203: `'Your week with Mochi'` → `'YOUR WEEK WITH MOCHI'`
- line 131: `'September with Luna'` → `'SEPTEMBER WITH LUNA'`
- line 137: `'Your week with Luna'` → `'YOUR WEEK WITH LUNA'`
- line 144: `'September with Boba'` → `'SEPTEMBER WITH BOBA'`

and right after line 58 add `expect(screen.getByRole('header', { name: 'September with Mochi' })).toBeTruthy();`.

`mobile/__tests__/components/BadgesCard.test.tsx`: add `import { StyleSheet } from 'react-native';`, change the theme import to `import { COLORS, FONTS } from '../../src/theme';`, and add:

```tsx
it('keeps the tile names to one line under their icons, and sets the count as the pixel label', async () => {
  load.mockResolvedValue(CANVAS);
  render(withCharacter(<BadgesCard onSeeAll={jest.fn()} onOpen={jest.fn()} />));
  const count = await screen.findByTestId('badges-count');
  expect(StyleSheet.flatten(count.props.style).fontFamily).toBe(FONTS.pixel);
  for (const f of FAMILIES) {
    const label = screen.getByTestId(`badges-card-${f}-label`);
    expect(label.props.numberOfLines).toBe(1);
    expect(String(label.props.className).split(' ')).toContain('text-caption');
  }
});
```

`mobile/__tests__/screens/BadgeDetailScreen.test.tsx`: after line 83 (`…props.accessibilityRole).toBe('header');`) add `expect(screen.getByRole('header', { name: 'Sleep goal streak' })).toBeTruthy();` (the name is `FAMILY_NAMES.SLEEP_GOAL` in its own case; lines 34 and 72 keep expecting `'SLEEP GOAL STREAK'`).

- [ ] **Step 2: Run them to verify they fail**

Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/screens/RecapScreen.test.tsx __tests__/components/BadgesCard.test.tsx __tests__/screens/BadgeDetailScreen.test.tsx`
Expected: FAIL (titles not caps or not named in their own case; tile label has no `numberOfLines`; the count is Geist).

- [ ] **Step 3: Implement**

| File:line | Old | New |
|---|---|---|
| `components/recap/RecapShelf.tsx:77` | `className="text-sm text-muted-foreground"` (recap-shelf-empty) | `className="text-caption text-muted-foreground"` |
| `components/recap/ShareWithBuddiesButton.tsx:82` | `className="text-sm text-destructive"` | `className="text-caption text-destructive"` |
| `components/recap/ShareWithBuddiesButton.tsx:85` | `className="font-display text-display-sm"` | `className="text-heading"` |
| `components/recap/ShareWithBuddiesButton.tsx:86` | `className="text-sm"` (preview) | `className="text-body"` |
| `components/recap/ShareWithBuddiesButton.tsx:87` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/RecapScreen.tsx:99` | `className="text-base"` | `className="text-body"` |
| `screens/RecapScreen.tsx:108` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/RecapScreen.tsx:119` | ``<Text testID="recap-title" className="font-display text-display-lg">{`Your week with ${coachName}`}</Text>`` | ``<PageTitle testID="recap-title">{`Your week with ${coachName}`}</PageTitle>`` (import from `../components/ui/page-title`) |
| `screens/RecapScreen.tsx:142` | `className="text-base leading-snug"` | `className="text-body"` |
| `screens/RecapScreen.tsx:186` | ``<Text testID="recap-title" className="font-display text-display-lg">{`${monthName(recap.periodStart)} with ${coachName}`}</Text>`` | ``<PageTitle testID="recap-title">{`${monthName(recap.periodStart)} with ${coachName}`}</PageTitle>`` |
| `screens/RecapScreen.tsx:191` | `className="flex-1 text-base leading-snug"` | `className="flex-1 text-body"` |
| `screens/RecapScreen.tsx:204` | `className="text-center text-xs"` | `className="text-center text-caption"` |
| `screens/RecapScreen.tsx:220` | `className="text-base"` | `className="text-body"` |
| `screens/RecapScreen.tsx:221` | `className="text-base font-semibold"` (change, coloured by style) | `className="text-body font-semibold tabular-nums"` |
| `screens/RecapsScreen.tsx:25` | `className="text-xs font-semibold text-accent"` ("New" tag) | `className="text-label uppercase text-accent"` |
| `screens/RecapsScreen.tsx:30` | `className="font-display text-display-sm"` (recap line, 2 lines) | `className="text-heading"` |
| `screens/RecapsScreen.tsx:70` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/RecapsScreen.tsx:77` | `className="text-base text-muted-foreground"` | `className="text-body text-muted-foreground"` |
| `screens/RecapsScreen.tsx:88` | `className="text-base font-semibold"` | `className="text-body font-semibold"` |
| `screens/RecapStoryScreen.tsx:123` | `className="text-center text-base"` | `className="text-center text-body"` |
| `screens/RecapStoryScreen.tsx:131` | `className="text-center text-base"` | `className="text-center text-body"` |
| `screens/RecapStoryScreen.tsx:249` | `numberOfLines={1} style={{ fontFamily: FONTS.sansSemibold, fontSize: 14, color: tint.text }}` | `numberOfLines={1} className="text-body font-semibold" style={{ color: tint.text }}` |
| `screens/RecapStoryScreen.tsx:250` | `numberOfLines={1} style={{ fontSize: 12, color: tint.soft }}` | `numberOfLines={1} className="text-caption" style={{ color: tint.soft }}` |
| `screens/RecapStoryScreen.tsx:285` | `className="text-center text-sm"` | `className="text-center text-caption"` |
| `screens/RecapBuilderScreen.tsx:121` | `className="text-center text-xs text-muted-foreground"` | `className="text-center text-caption text-muted-foreground"` |
| `screens/RecapBuilderScreen.tsx:126` | `className="text-sm font-semibold"` | `className="text-body font-semibold"` |
| `screens/RecapBuilderScreen.tsx:132` | `className="text-base"` | `className="text-body"` |
| `screens/RecapBuilderScreen.tsx:140` | `notice === 'saved' ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'` | `notice === 'saved' ? 'text-caption text-muted-foreground' : 'text-caption text-destructive'` |
| `screens/RecapBuilderScreen.tsx:151` | `className="text-sm text-destructive"` | `className="text-caption text-destructive"` |
| `screens/YearInPixelsScreen.tsx:47` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/achievements/BadgesCard.tsx:43` | `className="text-xs font-medium text-muted-foreground" style={{ letterSpacing: 2 }}` (badges-count) | `className="text-label text-muted-foreground"` |
| `components/achievements/BadgesCard.tsx:63` | `className="text-center" style={{ fontSize: 11, color: level > 0 ? colors.foreground : colors.muted }}` | `className="text-center text-caption" numberOfLines={1} style={{ color: level > 0 ? colors.foreground : colors.muted }}` (four tiles a row) |
| `components/achievements/BadgesCard.tsx:73` | `className="flex-1 text-sm"` | `className="flex-1 text-body"` |
| `components/achievements/BadgesCard.tsx:74` | `className="text-sm font-semibold"` | `className="text-body font-semibold"` |
| `components/achievements/BadgesCard.tsx:77` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground tabular-nums"` |
| `components/milestones/MilestoneTiles.tsx:85` | `className="text-center text-xs"` | `className="text-center text-caption"` |
| `components/milestones/MilestoneTiles.tsx:89` | `className="text-center" style={{ fontSize: 11, color: COLORS[scheme].muted }}` | `className="text-center text-caption tabular-nums" style={{ color: COLORS[scheme].muted }}` |
| `components/milestones/MilestoneTiles.tsx:94` | `style={{ fontSize: 10, letterSpacing: 0.6, fontFamily: FONTS.sansSemibold, color: LEVEL_UP_COLOR[scheme] }}` (LEVEL UP tag) | `className="text-label" style={{ color: LEVEL_UP_COLOR[scheme] }}` (drop `FONTS` from the theme import if now unused) |
| `screens/BadgesScreen.tsx:25` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/BadgesScreen.tsx:29` | `className="text-base"` | `className="text-body"` |
| `screens/BadgesScreen.tsx:34` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/BadgesScreen.tsx:55` | `className="text-base font-semibold"` | `className="text-body font-semibold"` |
| `screens/BadgesScreen.tsx:56` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/BadgesScreen.tsx:57` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/BadgeDetailScreen.tsx:43` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/BadgeDetailScreen.tsx:49` | `className="text-base"` | `className="text-body"` |
| `screens/BadgeDetailScreen.tsx:69-71` | `<Text testID="badge-detail-title" accessibilityRole="header" className="text-center" style={{ fontFamily: pixelFont(), fontSize: 22 }}>` / `{FAMILY_NAMES[f.family].toUpperCase()}` / `</Text>` | `<PageTitle testID="badge-detail-title" className="text-center">{FAMILY_NAMES[f.family]}</PageTitle>` (import from `../components/ui/page-title`; delete the `pixelFont` import) |
| `screens/BadgeDetailScreen.tsx:72` | `className="text-center text-sm text-muted-foreground" style={{ maxWidth: 290, lineHeight: 20 }}` | `className="text-center text-caption text-muted-foreground" style={{ maxWidth: 290 }}` |
| `screens/BadgeDetailScreen.tsx:79` | `<Text className="text-muted-foreground" style={{ fontSize: 11, letterSpacing: 1.5 }}>{c.label}</Text>` | `<SectionLabel>{c.label}</SectionLabel>` (import from `../components/ui/section-label`) |
| `screens/BadgeDetailScreen.tsx:80` | `<Text className="font-bold" style={{ fontSize: 28 }}>{c.value}</Text>` | `<Text className="text-display tabular-nums">{c.value}</Text>` |
| `screens/BadgeDetailScreen.tsx:92` | `className="text-base font-semibold"` | `className="text-body font-semibold"` |
| `screens/BadgeDetailScreen.tsx:93` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/BadgeDetailScreen.tsx:96` | `style={{ fontSize: 11, letterSpacing: 1, color: tierTextColor(level, accent, dark) }}` (tier tag) | `className="text-label" style={{ color: tierTextColor(level, accent, dark) }}` |

In `screens/RecapStoryScreen.tsx`, drop `FONTS` from the theme import if nothing else uses it.

`__tests__/conventions/typography.test.ts`:
- delete the `PENDING` entries for `components/recap/RecapShelf.tsx`, `components/recap/ShareWithBuddiesButton.tsx`, `screens/RecapScreen.tsx`, `screens/RecapsScreen.tsx`, `screens/RecapStoryScreen.tsx`, `screens/RecapBuilderScreen.tsx`, `screens/YearInPixelsScreen.tsx`, `components/achievements/BadgesCard.tsx`, `components/milestones/MilestoneTiles.tsx`, `screens/BadgesScreen.tsx`, `screens/BadgeDetailScreen.tsx`.
- add to `EXEMPT`, after the YearPixelsView entry:
  `{ file: 'components/recap/RecapShelf.tsx', count: 4, reason: "the recap shelf's cover tiles: a pixel badge and a title drawn with the tile (spec §5)" },`

- [ ] **Step 4: Check the share cards did not change**

Run: `git diff 120e739 --stat -- mobile/src/components/recap/WeeklyStoryView.tsx mobile/src/components/recap/RecapCardView.tsx mobile/src/components/recap/YearPixelsView.tsx mobile/src/components/achievements/BadgeShareCard.tsx mobile/src/components/achievements/CelebrationModal.tsx mobile/src/lib/recapShare.ts`
Expected: no output.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/screens/Recap* __tests__/screens/YearInPixelsScreen.test.tsx __tests__/screens/Badge* __tests__/screens/SettingsBadges.test.tsx __tests__/components/BadgesCard.test.tsx __tests__/components/MilestoneTiles.test.tsx __tests__/components/RecapShelf.test.tsx __tests__/components/RecapShareViews.test.tsx __tests__/components/ShareWithBuddiesButton.test.tsx __tests__/components/CelebrationModal.test.tsx __tests__/components/CelebrationHost.test.tsx __tests__/conventions`
Expected: PASS (RecapShareViews and CelebrationModal unchanged: their sources were not touched).

- [ ] **Step 6: Full suite, tsc, commit**

Run the full Jest command and the tsc command. Expected: all green; only the 12 baseline tsc errors.

```bash
git add mobile/src mobile/__tests__
git commit -m "refactor(mobile): recaps and badges on the type scale; share cards unchanged"
```

---

### Task 10: Settings, sign-in and the rest

**Files:**
- Modify: `mobile/src/screens/SettingsScreen.tsx:99,126,156,157`, `screens/SignInScreen.tsx:84-134`, `screens/SignUpScreen.tsx:25-26,82`, `screens/ForgotPasswordScreen.tsx`, `screens/ResetPasswordScreen.tsx`, `screens/SignInMethodsScreen.tsx`, `screens/DevicesScreen.tsx:116`, `screens/ConnectHealthScreen.tsx`
- Modify: `mobile/src/components/notifications-section.tsx:151`, `components/delete-account-section.tsx:75-104`, `screens/dev/CharacterGalleryScreen.tsx`
- Test: `__tests__/screens/SignInScreen.test.tsx`, `__tests__/screens/SettingsScreen.test.tsx`, `__tests__/conventions/typography.test.ts`

**Interfaces:**
- Consumes: Task 1 (`PageTitle`, tokens).
- Produces: SignInScreen moves to `EXEMPT` with count 1 (the app name at 28, spec §4).

- [ ] **Step 1: Write the failing tests**

`mobile/__tests__/screens/SignInScreen.test.tsx`: add `import { StyleSheet } from 'react-native';` and `import { FONTS } from '../../src/theme';`, and:

```tsx
it('sets the app name in the pixel page-title face at 28, announced in its own case', () => {
  (useAuth as jest.Mock).mockReturnValue(auth());
  const { getByRole } = render(<SignInScreen navigation={navigation} route={{ params: undefined } as any} />);
  const name = getByRole('header', { name: 'Biometrics' });
  expect(name).toHaveTextContent('BIOMETRICS');
  expect(StyleSheet.flatten(name.props.style).fontFamily).toBe(FONTS.pixel);
  expect(String(name.props.className).split(' ')).toEqual(expect.arrayContaining(['font-pixel', 'text-[28px]']));
});
```

`mobile/__tests__/screens/SettingsScreen.test.tsx`, in `it('shows the current zone and hides "Use device time zone" while following the device', …)`: change its render line to `const { getByTestId, queryByTestId, getByRole } = render(<SettingsScreen />);` and add after its `waitFor` line `expect(getByRole('header', { name: 'Profile' })).toHaveTextContent('PROFILE');`.

- [ ] **Step 2: Run them to verify they fail**

Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/screens/SignInScreen.test.tsx __tests__/screens/SettingsScreen.test.tsx`
Expected: FAIL (no header named Biometrics or Profile).

- [ ] **Step 3: Implement**

`mobile/src/screens/dev/CharacterGalleryScreen.tsx` (dev-only, moves onto ui/text):
- line 2: `import { ScrollView, Text, View } from 'react-native';` → `import { ScrollView, View } from 'react-native';`, and add `import { Text } from '../../components/ui/text';` and `import { PageTitle } from '../../components/ui/page-title';`
- lines 29–30: `const heading = { color: foreground, fontSize: 16, fontWeight: '700' as const };` / `const caption = { color: foreground, fontSize: 11 };` → `const ink = { color: foreground };`
- line 36: `<Text style={{ color: foreground, fontSize: 20, fontWeight: '700' }}>Character gallery</Text>` → `<PageTitle style={ink}>Character gallery</PageTitle>`
- line 48: `<Text style={{ color: foreground, fontWeight: '600' }}>` → `<Text className="font-semibold" style={ink}>`
- every `<Text style={caption}>` (lines 56, 70, 80) → `<Text className="text-caption" style={ink}>`
- every `<Text style={heading}>` (lines 64, 77) → `<Text className="text-headline" style={ink}>`

`mobile/src/screens/SignInScreen.tsx` line 84: `<Text className="font-display text-[56px] leading-[60px]">Biometrics</Text>` → `<PageTitle className="font-pixel text-[28px] leading-[34px] tracking-[1px]">Biometrics</PageTitle>` (import from `../components/ui/page-title`; spec §4: the app name in the page-title face at 28; `font-pixel` keeps Silkscreen because `cn` lets `text-[28px]` replace `text-page-title`).

| File:line | Old | New |
|---|---|---|
| `screens/SignInScreen.tsx:85` | `className="text-base text-muted-foreground"` | `className="text-body text-muted-foreground"` |
| `screens/SignInScreen.tsx:87` | `className="text-center text-sm text-foreground"` | `className="text-center text-caption text-foreground"` |
| `screens/SignInScreen.tsx:113` | `className="text-xs text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/SignInScreen.tsx:134` | `className="text-sm text-destructive"` | `className="text-caption text-destructive"` |
| `screens/SettingsScreen.tsx:99` | `className="text-sm text-destructive"` | `className="text-caption text-destructive"` |
| `screens/SettingsScreen.tsx:126` | `className="font-display text-display-lg"` (avatar initial) | `className="text-display"` |
| `screens/SettingsScreen.tsx:156` | `<Text className="font-display text-display">Profile</Text>` | `<PageTitle>Profile</PageTitle>` (import from `../components/ui/page-title`) |
| `screens/SettingsScreen.tsx:157` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `screens/SignUpScreen.tsx:25` | `<Text className="text-center font-display text-display-lg">{title}</Text>` | `<PageTitle className="text-center">{title}</PageTitle>` (import from `../components/ui/page-title`) |
| `screens/SignUpScreen.tsx:26` | `className="text-center text-base text-muted-foreground"` | `className="text-center text-body text-muted-foreground"` |
| `screens/SignUpScreen.tsx:82` | `className="text-sm text-destructive"` | `className="text-caption text-destructive"` |
| `screens/ForgotPasswordScreen.tsx:43` | `<Text className="text-center font-display text-display-lg">Reset your password</Text>` | `<PageTitle className="text-center">Reset your password</PageTitle>` |
| `screens/ForgotPasswordScreen.tsx:45` | `className="text-center text-base text-muted-foreground"` | `className="text-center text-body text-muted-foreground"` |
| `screens/ForgotPasswordScreen.tsx:49` | `className="text-center text-base text-muted-foreground"` | `className="text-center text-body text-muted-foreground"` |
| `screens/ForgotPasswordScreen.tsx:59` | `className="text-sm text-destructive"` | `className="text-caption text-destructive"` |
| `screens/ResetPasswordScreen.tsx:60` | `<Text className="text-center font-display text-display-lg">Choose a new password</Text>` | `<PageTitle className="text-center">Choose a new password</PageTitle>` |
| `screens/ResetPasswordScreen.tsx:61` | `className="text-center text-base text-muted-foreground"` | `className="text-center text-body text-muted-foreground"` |
| `screens/ResetPasswordScreen.tsx:67` | `error === EXPIRED ? 'text-center text-base text-muted-foreground' : 'text-sm text-destructive'` | `error === EXPIRED ? 'text-center text-body text-muted-foreground' : 'text-caption text-destructive'` |
| `screens/SignInMethodsScreen.tsx:83` | `className="px-4 text-sm text-muted-foreground"` | `className="px-4 text-caption text-muted-foreground"` |
| `screens/SignInMethodsScreen.tsx:112` | `className="px-4 text-xs text-muted-foreground"` | `className="px-4 text-caption text-muted-foreground"` |
| `screens/SignInMethodsScreen.tsx:129` | `className="px-4 text-sm text-destructive"` | `className="px-4 text-caption text-destructive"` |
| `screens/DevicesScreen.tsx:116` | `className="px-4 text-sm text-destructive"` | `className="px-4 text-caption text-destructive"` |
| `screens/ConnectHealthScreen.tsx:82` | `<Text className="font-display text-display-lg text-center">Connect your Google Health</Text>` | `<PageTitle className="text-center">Connect your Google Health</PageTitle>` |
| `screens/ConnectHealthScreen.tsx:83` | `className="text-center text-base text-muted-foreground"` | `className="text-center text-body text-muted-foreground"` |
| `screens/ConnectHealthScreen.tsx:97` | `className="flex-1 text-sm text-muted-foreground"` | `className="flex-1 text-caption text-muted-foreground"` |
| `screens/ConnectHealthScreen.tsx:105` | `className="text-center text-sm text-destructive"` | `className="text-center text-caption text-destructive"` |
| `screens/ConnectHealthScreen.tsx:112` | `className="text-center text-xs text-muted-foreground"` | `className="text-center text-caption text-muted-foreground"` |
| `components/notifications-section.tsx:151` | `isError ? 'px-4 pb-3 text-sm text-destructive' : 'px-4 pb-3 text-xs text-muted-foreground'` | `isError ? 'px-4 pb-3 text-caption text-destructive' : 'px-4 pb-3 text-caption text-muted-foreground'` |
| `components/delete-account-section.tsx:75` | `className="text-base font-semibold text-destructive"` | `className="text-body font-semibold text-destructive"` |
| `components/delete-account-section.tsx:77` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |
| `components/delete-account-section.tsx:81` | `className="text-sm"` ("Type DELETE to confirm.") | `className="text-body"` |
| `components/delete-account-section.tsx:97` | `className="text-sm text-destructive"` | `className="text-caption text-destructive"` |
| `components/delete-account-section.tsx:104` | `className="text-sm text-muted-foreground"` | `className="text-caption text-muted-foreground"` |

`__tests__/conventions/typography.test.ts`:
- delete the `PENDING` entries for `screens/SettingsScreen.tsx`, `screens/SignInScreen.tsx`, `screens/SignUpScreen.tsx`, `screens/ForgotPasswordScreen.tsx`, `screens/ResetPasswordScreen.tsx`, `screens/SignInMethodsScreen.tsx`, `screens/DevicesScreen.tsx`, `screens/ConnectHealthScreen.tsx`, `components/notifications-section.tsx`, `components/delete-account-section.tsx`, `screens/dev/CharacterGalleryScreen.tsx`.
- add to `EXEMPT`, after the headerStyle entry:
  `{ file: 'screens/SignInScreen.tsx', count: 1, reason: 'the app name in the page-title face at 28, a one-off size (spec §4)' },`
- `PENDING` is now empty: leave it as `const PENDING: Exception[] = [];`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/screens/Settings* __tests__/screens/SignIn* __tests__/screens/SignUpScreen.test.tsx __tests__/screens/ForgotPasswordScreen.test.tsx __tests__/screens/ResetPasswordScreen.test.tsx __tests__/screens/DevicesScreen.test.tsx __tests__/screens/ConnectHealthScreen.test.tsx __tests__/screens/CharacterGalleryScreen.test.tsx __tests__/components/Notifications*.test.tsx __tests__/components/AccountSection.test.tsx __tests__/conventions`
Expected: PASS.

- [ ] **Step 5: Full suite, tsc, commit**

Run the full Jest command and the tsc command. Expected: all green; only the 12 baseline tsc errors.

```bash
git add mobile/src mobile/__tests__
git commit -m "refactor(mobile): Settings, sign-in and the dev gallery on the type scale"
```

---

### Task 11: Remove Instrument Serif and the old tokens

**Files:**
- Modify: `mobile/App.tsx` (serif import and key), `mobile/src/theme.ts` (`FONTS.display`), `mobile/tailwind.config.js` (`fontFamily.display`, old `fontSize` keys), `mobile/src/lib/utils.ts` (merge groups), `mobile/src/components/ui/text.tsx` (serif branch)
- Modify: `mobile/package.json`, `mobile/package-lock.json` (drop `@expo-google-fonts/instrument-serif`)
- Test: `__tests__/components/Text.test.tsx`, `__tests__/lib/utils.test.ts`, `__tests__/theme/tokens.test.ts`, `__tests__/conventions/typography.test.ts`

**Interfaces:**
- Consumes: every call site migrated (Tasks 3–10; `PENDING` is empty).
- Produces: `FONTS` = `{ sans, sansMedium, sansSemibold, sansBold, sansExtrabold, pixel }`; `tailwind.config.js` `fontSize` keys are exactly `TYPE_TOKENS`; `fontFamily` is `{ sans, pixel }`.

- [ ] **Step 1: Confirm nothing uses the old names**

Run (from `mobile/`): `grep -rnE "font-display|text-(eyebrow|numeral|display-sm|display-lg)|FONTS\.display|InstrumentSerif" src App.tsx`
Expected: only `src/components/ui/text.tsx` (its `SERIF` regex and comment) and `src/theme.ts` (`display:`), plus `App.tsx` (the import and the key). Anything else is a missed call site: migrate it by the Migration rules before going on.

- [ ] **Step 2: Write the failing tests**

`mobile/__tests__/components/Text.test.tsx`: in `'keeps the plain, weight and serif behaviour'` rename it to `'keeps the plain and weight behaviour, and has no serif'` and replace `expect(fontFamilyFor('font-display text-display-lg')).toBe(FONTS.display);` with `expect(fontFamilyFor('font-display')).toBe(FONTS.sans);`.

`mobile/__tests__/lib/utils.test.ts`: delete `'lets a later custom font size replace an earlier one'` (it used `text-numeral-xl`) and `'treats font-display as a family, so it survives a weight class'`.

`mobile/__tests__/theme/tokens.test.ts`, in `describe('type tokens', …)`: rename the first test to `'registers the sans and pixel families, and no serif'`, replace `expect(tailwind.theme.extend.fontFamily.display).toEqual([FONTS.display]);` with `expect(Object.keys(tailwind.theme.extend.fontFamily)).toEqual(['sans', 'pixel']);`, and add (importing `TYPE_TOKENS` from `../../src/theme`):

```ts
  it('has exactly the type scale as font sizes: no old keys left', () => {
    expect(Object.keys(tailwind.theme.extend.fontSize)).toEqual([...TYPE_TOKENS]);
  });
```

`mobile/__tests__/conventions/typography.test.ts`:
- the text.tsx entry becomes `{ file: 'components/ui/text.tsx', count: 1, reason: 'the Text primitive sets fontFamily from the class list' },`
- add inside `describe('typography convention', …)`:

```ts
  it('has nothing left to migrate: only the permanent exemptions remain', () => {
    expect(PENDING).toEqual([]);
    expect(EXEMPT.map((a) => a.file).sort()).toEqual(
      [
        'components/achievements/BadgeShareCard.tsx',
        'components/achievements/CelebrationModal.tsx',
        'components/recap/RecapCardView.tsx',
        'components/recap/RecapShelf.tsx',
        'components/recap/WeeklyStoryView.tsx',
        'components/recap/YearPixelsView.tsx',
        'components/social/CampBanner.tsx',
        'components/social/CampNoteCard.tsx',
        'components/social/CampScene.tsx',
        'components/ui/input-style.ts',
        'components/ui/text.tsx',
        'lib/recapShare.ts',
        'navigation/headerStyle.ts',
        'screens/CampfireScreen.tsx',
        'screens/SignInScreen.tsx',
      ].sort(),
    );
  });
```

- [ ] **Step 3: Run them to verify they fail**

Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/components/Text.test.tsx __tests__/theme __tests__/conventions/typography.test.ts`
Expected: FAIL (`font-display` still resolves to the serif; `fontFamily` still has `display`; old fontSize keys present; text.tsx count is 3, not 1).

- [ ] **Step 4: Implement**

`mobile/src/components/ui/text.tsx`:
- in the comment, delete the line `//   2. the serif opt-in, font-display, until its last call site moves;` and renumber the items after it (3 → 2, 4 → 3, 5 → 4)
- delete `const SERIF = /(^|\s)font-display(\s|$)/;`
- delete `if (SERIF.test(className)) return FONTS.display;`

`mobile/src/theme.ts`: delete the two lines `// The serif, until its last call site moves (type-system plan, Task 11).` and `display: 'InstrumentSerif_400Regular',` from `FONTS`.

`mobile/tailwind.config.js`:
- `fontFamily` becomes `{ sans: ['Geist_400Regular'], pixel: ['Silkscreen'] }` (delete the serif comment and `display`)
- in `fontSize`, delete the comment `// The old keys, …` and the seven keys under it (`eyebrow`, `numeral-sm`, `numeral`, `numeral-lg`, `numeral-xl`, `display-sm`, `display-lg`)

`mobile/src/lib/utils.ts`: `'font-size': [{ text: [...TYPE_TOKENS, 'eyebrow', …, 'display-lg'] }]` → `'font-size': [{ text: [...TYPE_TOKENS] }]`; `'font-family': [{ font: ['sans', 'pixel', 'display'] }]` → `'font-family': [{ font: ['sans', 'pixel'] }]`.

`mobile/App.tsx`: delete `import { InstrumentSerif_400Regular } from '@expo-google-fonts/instrument-serif/400Regular';` and the `InstrumentSerif_400Regular,` line in `useFonts`.

Remove the dependency:
`PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH npm uninstall @expo-google-fonts/instrument-serif --no-audit --no-fund`
Then `grep -c "instrument-serif" package.json package-lock.json` → both `0`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/components/Text.test.tsx __tests__/lib/utils.test.ts __tests__/theme __tests__/App.test.tsx __tests__/conventions`
Expected: PASS.

- [ ] **Step 6: Full suite, tsc, commit**

Run the full Jest command and the tsc command. Expected: all green; only the 12 baseline tsc errors.

```bash
git add mobile/App.tsx mobile/src/theme.ts mobile/tailwind.config.js mobile/src/lib/utils.ts mobile/src/components/ui/text.tsx mobile/package.json mobile/package-lock.json mobile/__tests__
git commit -m "chore(mobile): drop Instrument Serif and the old type tokens"
```

---

### Task 12: Final verification

**Files:** none changed unless a check fails (then fix it in the task that owns the file, and re-run this task).

**Interfaces:**
- Consumes: everything above.
- Produces: the evidence for the PR.

- [ ] **Step 1: The whole suite**

Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit`
Expected: all suites pass (241 baseline + the new `Text`, `PageTitle`, `typeTokens`, `typography`, `inputs`, `headerStyle` suites), 0 failures, snapshots all passing.

- [ ] **Step 2: The guard alone, and its proof**

Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/conventions`
Expected: PASS, including `'fails a deliberately re-added text-[13px] in a migrated file'` and `'has nothing left to migrate'`.
Then add `<Text className="text-[13px]">x</Text>` inside the JSX of `mobile/src/screens/SocialScreen.tsx`, run the guard: FAIL naming `src/screens/SocialScreen.tsx:<line> arbitrary size, text-[13px]`. Revert with `git checkout -- mobile/src/screens/SocialScreen.tsx` and re-run: PASS.

- [ ] **Step 3: tsc baseline**

Run the tsc command.
Expected: exactly the 12 errors listed in Global Constraints (same files and codes), no others.

- [ ] **Step 4: Greps outside the exemptions**

From `mobile/`:
- `grep -rnE "font-display|InstrumentSerif|instrument-serif|text-eyebrow|text-numeral|text-display-(sm|lg)" src App.tsx tailwind.config.js package.json` → no output.
- `grep -rn "MONO\|Menlo" src` → no output.
- `grep -rlE "text-\[[0-9]" src | sort` → exactly `src/components/social/CampBanner.tsx`, `src/components/social/CampNoteCard.tsx`, `src/screens/CampfireScreen.tsx`, `src/screens/SignInScreen.tsx` (Campfire exemptions and the app name).
- `grep -rnE "(^|[^A-Za-z-])text-(xs|sm|base|lg|xl|[2-9]xl)([^A-Za-z0-9-]|$)" src | grep -v "src/components/social/Camp\|src/screens/CampfireScreen.tsx"` → no output.
- `grep -rnE "(fontFamily|fontSize)[[:space:]]*:" src | cut -d: -f1 | sort -u` → only the `EXEMPT` files that carry inline sizes: `CampScene.tsx`, `CampBanner.tsx`, `CampfireScreen.tsx`, the five share cards, `RecapShelf.tsx`, `recapShare.ts`, `text.tsx`, `input-style.ts`, `headerStyle.ts`.
- Every `TextInput` takes the shared style: the guard's input rule (Step 2) covers it; `grep -rn "inputTextStyle\|inputNumberStyle" src | grep -v input-style.ts | cut -d: -f1 | sort -u` lists the ten input files: `ui/text-field.tsx`, `chats/ChatComposer.tsx`, `chats/NoteComposerSheet.tsx`, `social/CampNoteCard.tsx`, `coach/PromptBar.tsx`, `delete-account-section.tsx`, `memory-edit-form.tsx`, `habit-log-card.tsx`, `screens/ChatsScreen.tsx`, `screens/SettingsScreen.tsx`.

- [ ] **Step 5: The Campfire is untouched**

- `git diff 120e739 --stat -- mobile/src/components/social/CampScene.tsx mobile/src/components/social/CampBanner.tsx mobile/src/components/social/CampPanel.tsx mobile/src/components/social/campSceneGeometry.ts` → no output.
- `git diff 120e739 -- mobile/src/screens/CampfireScreen.tsx` → only the `SectionLabel` import and the TONIGHT'S FIRE and WHO'S HERE lines.
- `git diff 120e739 -- mobile/src/components/social/CampNoteCard.tsx` → only the `inputTextStyle` import and the `TextInput`'s `style` and `className`.
- `git diff 120e739 -- mobile/src/components/coach/thinking/shared.ts` → `pixelFont` keeps its name and path and still returns `'Silkscreen'` when it is loaded (the Campfire scene's only dependency that changed).
- `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/screens/CampfireScreen.test.tsx __tests__/screens/CampfireSceneMotion.test.tsx __tests__/components/CampBanner.test.tsx __tests__/components/CampSceneClock.test.tsx __tests__/components/campSceneGeometry.test.ts __tests__/components/CampPanel.test.ts __tests__/components/SceneButtons.test.tsx __tests__/screens/SocialScreenCampfire.test.tsx __tests__/screens/SocialStoryCampfire.test.tsx` → PASS with no test edited in this branch other than the two-label check added in Task 7: `git diff 120e739 --stat -- mobile/__tests__/screens/CampfireSceneMotion.test.tsx mobile/__tests__/components/CampBanner.test.tsx mobile/__tests__/components/CampSceneClock.test.tsx mobile/__tests__/components/campSceneGeometry.test.ts mobile/__tests__/components/CampPanel.test.ts mobile/__tests__/components/SceneButtons.test.tsx` → no output.

- [ ] **Step 6: Walkthrough on the simulator and the phone (spec §8)**

Build and run the app as usual for this project. Check, light and dark:
- every tab title (Activity, Coach, Social, Profile; the Home greeting is Geist `text-display`) and every pushed header (SCORE, FORECAST, BADGES, DEVICES, …) is pixel caps, with no frame of a stand-in face at launch;
- Chats: the `@HANDLE` header fits on one line (long handles truncate), rows show name and last line on one line each;
- Recovery hero and Score detail: the 72-pt score, the Geist verdict, the pixel SECTION LABELS; numbers line up (tabular) while they count up;
- the heatmap day and night sheets: the stat tiles fit without wrapping;
- inputs (Chats search, message composer, note composer, camp note, coach prompt): placeholder and typed text in Geist;
- the Campfire: the scene, banner and note bubbles look identical to `main` (compare with a screenshot from a `main` build); only the TONIGHT'S FIRE and WHO'S HERE labels in the panel are the 11-pt pixel label;
- with the system text size at its largest: page titles and labels grow with it and wrap rather than clip.

Record anything that does not read cleanly as a follow-up for the owner; do not change the scale in this branch.

- [ ] **Step 7: Hand off**

Use superpowers:finishing-a-development-branch. The PR (one, from `feature/type-system`) has no attribution and no mention of Claude or AI.
