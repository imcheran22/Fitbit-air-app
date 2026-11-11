# Type system (A4): Geist + pixel page titles

**Status:** design approved on the canvas (option A4); this spec is awaiting the owner's review.
**Canvas:** https://claude.ai/artifact/7ou763Rzm6Tbb9m8Pmrz8j (boards "A4 · A + pixel page titles" and "Today").
**Scope:** the mobile app (`mobile/`) only. No backend changes.

## 1. Goal

The app now uses 4 font families and about 75 size/weight combinations. These include 5 page-title styles, 5 section-label
styles and 95 one-off `text-[..px]` sizes. This spec moves the app to one consistent voice that still fits its pixel
identity:

- **Geist** is used for everything you read: headings, numbers, body text, captions and buttons.
- **Silkscreen** (the pixel font) is used only for page titles and small labels and tags.
- **Instrument Serif** and the stray Menlo use are removed.
- **One scale** of named sizes is used, and a convention test keeps it that way.

**Not touched (owner rule):** the Campfire scene text stays exactly as it is now. See §6.

## 2. The scale

NativeWind's native rem is 14px, so stock classes such as `text-sm` do not match their web sizes. Every token is
therefore defined in px in `tailwind.config.js`, and these tokens replace the old `eyebrow`, `numeral*` and `display*`
keys.

| Token | Family / weight | Size / line / tracking | Role |
|---|---|---|---|
| `text-score` | Geist 600, tabular | 72 / 72 / −3 | The hero score (Recovery, Home, Forecast) |
| `text-number` | Geist 600, tabular | 40 / 44 / −1.5 | Large metric numbers |
| `text-display` | Geist 700 | 28 / 32 / −0.4 | Big in-page headings (Home greeting, empty states) |
| `text-heading` | Geist 600 | 22 / 27 / −0.2 | Verdicts, sheet titles, card headings; tabular when it is a number |
| `text-headline` | Geist 600 | 17 / 22 | Row titles, list names, emphasised lines |
| `text-body` | Geist 400 | 15 / 21 | Body copy, chat bubbles, inputs |
| `text-caption` | Geist 400 | 13 / 18 | Secondary lines, "Usual 49–55 ms", timestamps |
| `text-fine` | Geist 500 | 11 / 14 | Chart axes, legends, `xs` buttons only |
| `text-page-title` | Silkscreen | 20 / 26 / 1, uppercase | Every screen's title |
| `text-label` | Silkscreen | 11 / 14 / 1, uppercase | Section labels (`SectionLabel`), small tags ("AXO", "2H") |

`text-fine` is the one addition beyond the canvas scale. Chart axes and the 24px `xs` button need text smaller than the
13px caption, and the 11px pixel label is not readable for numbers on an axis.

**Numbers:** every number token is tabular. The token sets `fontVariant: ['tabular-nums']` through `Text` (§3), so callers
stop adding `tabular-nums` or inline `fontVariant` by hand.

## 3. Components

- **`ui/text.tsx`:**
  - `fontFamilyFor` gains `font-pixel` → Silkscreen.
  - `text-page-title` and `text-label` imply `font-pixel`.
  - `font-display` is removed.
  - The number tokens (`text-score`, `text-number`) imply semibold and tabular.
- **`tailwind.config.js`:** `fontFamily` becomes `sans: Geist_400Regular` and `pixel: Silkscreen`. `display` (the serif)
  is removed.
- **`theme.ts` `FONTS`:** adds `pixel: 'Silkscreen'` and drops `display`.
- **`PageTitle`** (new, `ui/page-title.tsx`): a `Text` with `text-page-title` and `accessibilityRole="header"`. It
  uppercases its string. Every top-level screen title uses it.
- **`SectionLabel`:** switches to `text-label` (pixel).
- **Native stack headers** (`RootNavigator`): `headerTitleStyle` uses Silkscreen 15, and each screen's `title` is
  uppercase, so pushed screens ("BADGES", "FORECAST", "DEVICES") match the pixel page titles.
  `TabsNavigator`'s stray `fontWeight: '600'` is removed.
- **`ui/button.tsx`:** sizes map to tokens: `lg` and `default` → `text-body` (15), `sm` → `text-caption` (13),
  `xs` → `text-fine` (11), all Geist 500. This replaces its `text-[14px]`/`[13px]`/`[12px]`.
- **Text inputs:** a shared input style sets Geist `text-body`. It fixes the 4 inputs that fall back to the system font:
  - Chats search
  - ChatComposer
  - CampNoteCard
  - NoteComposerSheet
- **Font loading (`App.tsx`):** Silkscreen is awaited with Geist before the splash screen hides. With that, `pixelFont()`
  no longer needs to fall back to Menlo. The `CoachCard` name stops using MONO and uses `text-label`.

## 4. Migration map

| Today | Becomes |
|---|---|
| Serif `display-lg` / `display` used as a screen title (Activity, Metrics, Recap, Settings, Dashboard, Sleep, Social, Coach, Highlights, PairUp, BuddyWeek, auth screens) | `PageTitle` (pixel 20) |
| Serif `display-sm` / `display` used as a verdict, greeting or sheet title (recovery hero, ScoreDetail, Forecast hero, coach digest, CoachToday, MomentsCard, CheckIn, MoodNotice, SharingConsent, story frames) | `text-heading` (Geist 600 22). The Home greeting uses `text-display` |
| SignIn `text-[56px]` | The app name in `PageTitle` style at 28 (`text-page-title` with a one-off size is allowlisted) |
| Chats `text-[17px] font-bold` header | `PageTitle` |
| `text-lg font-bold` / `text-xl font-bold` sheet titles (activity sheets, ReportSheet) | `text-heading` |
| `numeral-xl` (80) | `text-score` (72) |
| `numeral-lg` (48) | `text-number` (40) |
| `numeral` (30) | `text-display` with tabular (28), via the number-aware `Text` |
| `numeral-sm` (22) | `text-heading` with tabular (22) |
| `text-base` (14) and `text-[15px]` | `text-body` (15) |
| `text-sm` (12.25) and `text-[13px]` / `[13.5px]` / `[12.5px]` | `text-caption` (13) or `text-body`, by role (the plan lists each file) |
| `text-xs` (10.5) and `text-[11px]` / `[11.5px]` / `[10.5px]` / `[10px]` / `[9px]` | `text-caption`, or `text-fine` on charts and axes |
| `text-eyebrow` and the 4 other label variants (xs widest, 10px widest, recap 12/.72, …) | `SectionLabel` / `text-label` (pixel 11) |
| Inline `fontFamily` / `fontSize` outside the exempt files | Tokens |

**Body copy gets slightly larger.** Most body text is `text-sm` at 12.25px today and moves to 13 (caption) or 15 (body),
which reads better on a phone. The plan will check that crowded layouts still fit: chat rows, tiles and the heatmap
sheets.

## 5. Guard

A new convention test, `mobile/__tests__/conventions/typography.test.ts`, is modelled on the buttons guard. It fails on
any of these in `mobile/src`:

- an arbitrary size (`text-[`), a stock size (`text-xs|sm|base|lg|xl|2xl|3xl`) or an old token (`eyebrow`, `numeral*`,
  `display-sm|lg`)
- `font-display`
- an inline `fontFamily` or `fontSize` in a style object
- a `TextInput` without the shared input style

Exceptions live in an `ALLOWED` list keyed by file, with a reason. The exempt files are:

- the Campfire scene files (§6);
- the recap and badge share cards: `WeeklyStoryView`, `RecapCardView`, `YearPixelsView`, `RecapShelf`, `BadgeShareCard`
  and `CelebrationModal`. These are images scaled by `u()`, so they keep inline sizes, but they drop the serif and use
  only Geist and pixel;
- SVG `<Text>` inside charts, which are sized in chart units.

## 6. Campfire exemption

`CampScene.tsx`, `CampfireScreen.tsx`'s scene and panel labels, `CampBanner.tsx` and the camp note bubbles keep their
current Silkscreen sizes (8–14), letter-spacing and Geist text. Their render output doesn't change, which their existing
snapshot and text tests confirm. Shared components they use, such as `Button` and `SectionLabel`, still change globally.
The only Campfire text that moves is the panel's `SectionLabel`s. If the owner wants those frozen too, they stay on a
local style.

## 7. Out of scope

- Colours, spacing, radii, icons and the button shapes (already done in PR #57).
- The Recovery page redesign (drafts only). When it is built, it uses these tokens.
- A dynamic type / accessibility font-scaling policy. That is unchanged: RN `allowFontScaling` keeps working as it does
  now.

## 8. Testing

- Unit tests:
  - `fontFamilyFor` resolves `font-pixel`, `text-page-title` and `text-label` to Silkscreen;
  - the number tokens imply tabular;
  - `PageTitle` uppercases its text and sets `role="header"`.
- The guard test (§5) is proven by a deliberately re-added `text-[13px]` failing it.
- Existing screen tests are updated where they assert old classes or serif copy, and no behavioural assertion is
  weakened.
- The full mobile suite passes, and mobile tsc stays at the 12-error baseline.
- Walkthrough on the simulator and phone. Every tab title is pixel. The page titles, Chats, Recovery and ScoreDetail
  read cleanly, and the Campfire looks identical to before.

## 9. Rollout

This ships as one branch, `feature/type-system`, off main (120e739), built subagent-driven from a plan. There is one PR,
with no attribution.
