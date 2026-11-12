# Web Interface Guidelines review

- Date: 2026-10-03
- Rules: Vercel Web Interface Guidelines, https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
- Scope: every `.ts`/`.tsx` under `src/app/(app)/**` and `src/components/**` (117 files; tests and `src/components/__fixtures__` skipped), plus `src/app/layout.tsx`, `src/app/globals.css` and `src/app/manifest.ts` for the global checks
- Method: read-only review; every `path:line` was checked against the file on 2026-10-03, other agents were editing some UI files at the time, so lines can drift
- Deliberate deviation, not counted: headings, buttons and labels use sentence case (docs/design/spec.md §6), not the guideline's Title Case
- Not counted, already passing: `color-scheme: dark` (globals.css:119, layout.tsx viewport), `theme-color`, zoom never disabled, safe-area insets, skip link (AppShell.tsx:14), `-webkit-tap-highlight-color` (globals.css:270), pointer cursor on buttons (globals.css:277), `scroll-margin-top`, `overscroll-contain` on sheets and dialogs, `<img>` width/height/alt (HomeHeader.tsx), no `autoFocus`, no `onPaste` blocking, no `<div onClick>`, no user-facing “the reference app” text, every `outline-none` in app code paired with `focus-visible:ring-*` (except ChartFrame.tsx:32), destructive actions confirmed (Disconnect, Discard), lucide icons are `aria-hidden` by default in lucide-react 1.49 so bare `<Icon />` is fine

- Fixed in the same pass (spec §11 SYM11): top findings 1, 2 and 10 (iOS input zoom, Home heading levels, every `transition-all`), 7 rows marked "fixed" below
- Second pass, 2026-10-03 (spec §11 SYM12): the other 41 were checked against the current code (Settings and More as one 640 px column, the Journal laptop grid, the More hub, Trends, Behaviours, Your data, How Pulse works, My Dashboard, the Sleep card, login and onboarding, the sync popover). None was obsolete: files had moved (`(home)/page.tsx`) or lines drifted, but each issue was still there. 40 are fixed, 1 is declined with its reason; each fix was applied to the new screens where the same issue existed. Line numbers below are the review's, not the current code's

## Summary

| Category | Findings | Fixed | Obsolete | Declined | Open |
|---|---:|---:|---:|---:|---:|
| Accessibility | 3 | 3 | 0 | 0 | 0 |
| Focus States | 1 | 1 | 0 | 0 | 0 |
| Forms | 4 | 4 | 0 | 0 | 0 |
| Animation | 8 | 8 | 0 | 0 | 0 |
| Typography | 4 | 4 | 0 | 0 | 0 |
| Content Handling | 0 | 0 | 0 | 0 | 0 |
| Images | 0 | 0 | 0 | 0 | 0 |
| Performance | 1 | 1 | 0 | 0 | 0 |
| Navigation & State | 4 | 4 | 0 | 0 | 0 |
| Touch & Interaction | 1 | 1 | 0 | 0 | 0 |
| Safe Areas & Layout | 0 | 0 | 0 | 0 | 0 |
| Dark Mode & Theming | 1 | 1 | 0 | 0 | 0 |
| Locale & i18n | 17 | 16 | 0 | 1 | 0 |
| Hydration Safety | 0 | 0 | 0 | 0 | 0 |
| Hover & Interactive States | 3 | 3 | 0 | 0 | 0 |
| Content & Copy | 1 | 1 | 0 | 0 | 0 |
| Anti-patterns | 0 | 0 | 0 | 0 | 0 |
| **Total** | **48** | **47** | **0** | **1** | **0** |

Anti-patterns are counted under the rule they break (for example `transition-all` under Animation, hardcoded date formats under Locale & i18n).

## Top findings

1. `src/app/(app)/journal/CheckIn.tsx:245` - `text-[15px]` on the behaviour input makes iOS Safari zoom the page on focus (fixed, SYM11)
2. `src/app/(app)/page.tsx:366` - Home card headings skip a level (h3 under h1 before any h2); also :401, :413 (fixed, SYM11)
3. `src/app/(app)/_lib/skeletons.tsx:72` - loading skeletons are aria-hidden with no “Loading…” text, so route loads are silent to screen readers (fixed, SYM12)
4. `src/app/globals.css:295` - reduced-motion handling is partial: transitions, press-scale and spinners depend on per-component `motion-reduce:` (AppNav.tsx:49 Lens slide lacks it) (fixed, SYM12)
5. `src/components/charts/ChartFrame.tsx:32` - `outline-none` on the focusable chart plot, no visible focus ring until an arrow key moves the tooltip (fixed, SYM12)
6. `src/app/(app)/page.tsx:290` - hardcoded date-fns patterns in 11 files (page.tsx, journal, more, reports, settings, LoadChart, fitness, TrendChart, StrainRecoveryChart, DayStrip, CalendarPanel) → one `Intl.DateTimeFormat` helper (fixed, SYM12: `formatDay` in format.ts)
7. `src/app/(app)/journal/CheckIn.tsx:233` - behaviour input has no `name`, and (:251) the inline error does not take focus on submit (fixed, SYM12)
8. `src/app/(app)/health/healthspan/ContributorCard.tsx:46` - detail sheets (also VitalTiles.tsx:24, Impacts.tsx:50) are `useState`-only, so no deep link and Back does not close them (fixed, SYM12: `useSheetParam`)
9. `src/app/globals.css:267` - no global `touch-action: manipulation`; only 3 components opt in (fixed, SYM12)
10. `src/components/ui/progress.tsx:23` - `transition-all` on the import progress indicator (also ui/badge.tsx:7, used by every tag and chip) (fixed, SYM11)

## Global

src/app/globals.css:295 - [Animation] reduced-motion block only zeroes tw-animate vars and `scroll-behavior`; CSS `transition`s, `active:scale-[0.96]` presses and `animate-*` rely on per-component `motion-reduce:` (missing at AppNav.tsx:49, sonner.tsx:28, progress.tsx:23) — fixed (SYM12): the base layer drops every press's scale under reduced motion; the Lens, the Sonner spinner and the Settings chevron got `motion-reduce:` (progress.tsx had it from SYM11)
src/app/globals.css:267 - [Touch & Interaction] no global `touch-action: manipulation`; only AppNav.tsx:230, CalendarPanel.tsx:192/233, DayStrip.tsx:56 set it → add to `a, button, [role=button]` — fixed (SYM12): `touch-action: manipulation` on `a, button, label, summary, [role=button]` in the base layer
src/app/manifest.ts:13 - [Dark Mode & Theming] `theme_color` #0f1113 differs from `viewport.themeColor` #262e33 (layout.tsx:39) and the page's top ground colour — fixed (SYM12): manifest `theme_color` is `#262e33`, the same as `viewport.themeColor` and the top of the ground; `background_color` stays `#0f1113`
src/lib/format.ts:12 - [Locale & i18n] Intl locales are fixed (`en-US` here, `en-GB` at :74) and `<html lang="en">` (layout.tsx:46) is static; no `Accept-Language`/`navigator.languages` detection — declined: the copy is English only, so `<html lang="en">` is right and a per-visitor locale would only reorder dates and risk server/client hydration mismatches; every Intl formatter now reads one `LOCALE` constant in format.ts (the en-GB clock is folded in), the place to change it
src/app/layout.tsx:53 - [Locale & i18n] no `translate="no"` anywhere for brand/code tokens (“Pulse” in Wordmark/Mark, “noop”, “Hælan” in SettingsView.tsx:135, unit tokens) — fixed (SYM12): `translate="no"` on noop and Pulse (About, the not-owner headline), TZ (Settings) and docs/setup.md (login); the Wordmark and Mark are SVGs with no translatable text
src/app/(app)/settings/SettingsView.tsx:113 - [Typography] no non-breaking spaces in the app: number + unit strings use a plain space and can wrap (also ContributorRow.tsx:105, TrendChart.tsx:131, ZoneBars.tsx, info.tsx copy) — fixed (SYM12): `NBSP` in format.ts joins number and unit in durationWords, ago, Settings, ContributorRow, ContributorCard, VitalTiles, KeyStatRow, TrendChart, ZoneBars, DriverList, Behaviours, Your data, info.tsx and How Pulse works
src/app/(app)/journal/CheckIn.tsx:180 - [Typography] user-facing copy uses straight apostrophes (`&apos;` / `'`: “Couldn't”, “isn't”, “Tonight's”) instead of ’; no straight double quotes found — fixed (SYM12): 115 straight apostrophes in UI and server copy are ’ (e2e and unit assertions updated)

## src/app/(app)/_lib/HashScroll.tsx

✓ pass

## src/app/(app)/_lib/HomeInsight.tsx

✓ pass

## src/app/(app)/_lib/TonightPlan.tsx

✓ pass

## src/app/(app)/_lib/day.ts

✓ pass

## src/app/(app)/_lib/info.tsx

✓ pass

## src/app/(app)/_lib/skeletons.tsx

src/app/(app)/_lib/skeletons.tsx:72 - [Accessibility] loading skeletons are aria-hidden and `aria-busy` alone announces nothing; add an sr-only “Loading…” (same for every loading.tsx) — fixed (SYM12): PageShell and DetailShell take `loading`: an sr-only `role="status"` "Loading {title}…" and `aria-busy`, passed by every loading.tsx (How Pulse works' index renders the static page itself)

## src/app/(app)/_lib/view.tsx

✓ pass

## src/app/(app)/activity/[id]/loading.tsx

✓ pass

## src/app/(app)/activity/[id]/page.tsx

✓ pass

## src/app/(app)/error.tsx

✓ pass

## src/app/(app)/health/fitness/LoadChart.tsx

src/app/(app)/health/fitness/LoadChart.tsx:29 - [Locale & i18n] date-fns `format` fixed patterns (also :38) → Intl.DateTimeFormat — fixed (SYM12): `formatDay` (Intl.DateTimeFormat) for the ticks and tooltip

## src/app/(app)/health/fitness/loading.tsx

✓ pass

## src/app/(app)/health/fitness/page.tsx

src/app/(app)/health/fitness/page.tsx:52 - [Locale & i18n] date-fns `format(…, "MMM d")` hardcoded → Intl.DateTimeFormat — fixed (SYM12): `formatDay(…, DAY.monthDay)`

## src/app/(app)/health/format.ts

src/app/(app)/health/format.ts:4 - [Locale & i18n] ordinal suffixes hardcoded English → Intl.PluralRules({ type: "ordinal" }) — fixed (SYM12): Intl.PluralRules({ type: "ordinal" }) picks the suffix; format.test.ts covers 1st to 111th

## src/app/(app)/health/healthspan/ContributorCard.tsx

src/app/(app)/health/healthspan/ContributorCard.tsx:46 - [Navigation & State] contributor sheet open state in useState, not URL; no deep link, Back does not close it — fixed (SYM12): `?contributor=` via `useSheetParam` (pushState, so Back closes it and the URL deep-links)

## src/app/(app)/health/healthspan/loading.tsx

✓ pass

## src/app/(app)/health/healthspan/page.tsx

✓ pass

## src/app/(app)/health/loading.tsx

✓ pass

## src/app/(app)/health/monitor/VitalTiles.tsx

src/app/(app)/health/monitor/VitalTiles.tsx:24 - [Navigation & State] vital sheet open state in useState, not URL — fixed (SYM12): `?vital=` via `useSheetParam`

## src/app/(app)/health/monitor/loading.tsx

✓ pass

## src/app/(app)/health/monitor/page.tsx

src/app/(app)/health/monitor/page.tsx:43 - [Accessibility] `aria-label` on a plain `<p>` (generic role, ignored by many AT) → sr-only text sibling — fixed (SYM12): an sr-only sentence; the big count is aria-hidden

## src/app/(app)/health/page.tsx

src/app/(app)/health/page.tsx:178 - [Locale & i18n] weekday abbreviated with `slice(0, 3)` → Intl.DateTimeFormat weekday: "short" — fixed (SYM12): the query sends `formatDay(today, { weekday: "short" })`; Stress Monitor's weekday is Intl too (the English WEEKDAY array is gone)

## src/app/(app)/health/stress/loading.tsx

✓ pass

## src/app/(app)/health/stress/page.tsx

✓ pass

## src/app/(app)/journal/CheckIn.tsx

src/app/(app)/journal/CheckIn.tsx:90 - [Forms] unsaved check-in is guarded on sheet close only; no `beforeunload`/router guard for reload or Back — fixed (SYM12): a `beforeunload` guard while the sheet is open with unsaved answers
src/app/(app)/journal/CheckIn.tsx:184 - [Content & Copy] generic button labels “Save” (also “Add” at :248) → “Save check-in”, “Add behaviour” — fixed (SYM12): "Save check-in"; Add keeps its short face beside the field with the name "Add behaviour" (label in name); the same on Behaviours, plus "Save dashboard", "Save profile" and onboarding's "Save and continue"
src/app/(app)/journal/CheckIn.tsx:233 - [Forms] Input has no `name` (and no `spellCheck={false}`/`enterKeyHint`); add `name="behaviour"` — fixed (SYM12): `name="behaviour"`, `enterKeyHint="done"` (also on Behaviours); spellcheck stays on, the field is free text
src/app/(app)/journal/CheckIn.tsx:245 - [Forms] `text-[15px]` overrides the base 16 px, so iOS Safari zooms the page on focus → keep `text-base` on mobile — fixed (spec §11 SYM11)
src/app/(app)/journal/CheckIn.tsx:251 - [Forms] validation error is inline but focus is not moved to the invalid input on submit — fixed (SYM12): an invalid name moves focus back to the field (also on Behaviours)

## src/app/(app)/journal/insights/Impacts.tsx

src/app/(app)/journal/insights/Impacts.tsx:50 - [Navigation & State] behaviour sheet open state in useState, not URL — fixed (SYM12): `?behaviour=` via `useSheetParam`

## src/app/(app)/journal/insights/loading.tsx

✓ pass

## src/app/(app)/journal/insights/page.tsx

✓ pass

## src/app/(app)/journal/loading.tsx

✓ pass

## src/app/(app)/journal/page.tsx

src/app/(app)/journal/page.tsx:27 - [Locale & i18n] date-fns `format(…, "EEE, MMM d")` hardcoded → Intl.DateTimeFormat — fixed (SYM12): `formatDay(d, DAY.short)`

## src/app/(app)/layout.tsx

✓ pass

## src/app/(app)/loading.tsx

✓ pass

## src/app/(app)/more/loading.tsx

✓ pass

## src/app/(app)/more/page.tsx

src/app/(app)/more/page.tsx:49 - [Locale & i18n] date-fns `format(…, "MMMM")` hardcoded → Intl.DateTimeFormat — fixed (SYM12): `formatDay(…, { month: "long" })`

## src/app/(app)/page.tsx

src/app/(app)/page.tsx:290 - [Locale & i18n] date-fns `format` hardcoded patterns (“EEEE d MMMM”, also :295 “EEE”) → Intl.DateTimeFormat — fixed (SYM12): now `(home)/page.tsx`; the journal week reads `formatDay` (no date-fns display format is left: the rest are machine `yyyy-MM-dd`)
src/app/(app)/page.tsx:366 - [Accessibility] heading level skips: Health/Stress Monitor cards (also :401, :413) render `h3` under the h1 before any `h2`; pass `level={2}` — fixed (spec §11 SYM11)

## src/app/(app)/recovery/loading.tsx

✓ pass

## src/app/(app)/recovery/page.tsx

✓ pass

## src/app/(app)/reports/[period]/loading.tsx

✓ pass

## src/app/(app)/reports/[period]/page.tsx

src/app/(app)/reports/[period]/page.tsx:50 - [Locale & i18n] date-fns `format` hardcoded patterns (also :229 “EEEE d MMMM”, :234 “EEE, MMM d”) → Intl.DateTimeFormat — fixed (SYM12): `formatDay` for the title, bars and labels; the reports archive too

## src/app/(app)/settings/SettingsClient.tsx

✓ pass

## src/app/(app)/settings/SettingsView.tsx

src/app/(app)/settings/SettingsView.tsx:81 - [Typography] in-progress status “Importing history: …” does not end with “…” — fixed (SYM12): "Importing history… 42 of 180 days"
src/app/(app)/settings/SettingsView.tsx:110 - [Locale & i18n] date-fns `format(…, "d MMM yyyy")` hardcoded → Intl.DateTimeFormat — fixed (SYM12): `formatDay(…, DAY.full)` ("Jan 1, 1990"; Your data's "since" too)

## src/app/(app)/settings/actions.ts

✓ pass

## src/app/(app)/settings/loading.tsx

✓ pass

## src/app/(app)/settings/page.tsx

✓ pass

## src/app/(app)/sleep/loading.tsx

✓ pass

## src/app/(app)/sleep/page.tsx

✓ pass

## src/app/(app)/strain/loading.tsx

✓ pass

## src/app/(app)/strain/page.tsx

✓ pass

## src/components/brand/Mark.tsx

✓ pass

## src/components/brand/Wordmark.tsx

✓ pass

## src/components/charts/ChartFrame.tsx

src/components/charts/ChartFrame.tsx:32 - [Focus States] `outline-none` on the focusable Recharts surface/wrapper with no focus-visible replacement (deliberate per comment; keyboard focus only shows once an arrow key moves the tooltip) — fixed (SYM12): a 3 px `outline-ring/50` on the plot's `:focus-visible` only; checked in Chromium: Tab shows it, a click or a tap does not

## src/components/charts/EnergyBankChart.tsx

✓ pass

## src/components/charts/Hypnogram.tsx

✓ pass

## src/components/charts/IntradayHrChart.tsx

✓ pass

## src/components/charts/StrainRecoveryChart.tsx

src/components/charts/StrainRecoveryChart.tsx:84 - [Locale & i18n] date-fns `format` hardcoded patterns (:85 too) → Intl.DateTimeFormat — fixed (SYM12): weekday and day of month are separate Intl parts of the two-line tick

## src/components/charts/StressChart.tsx

src/components/charts/StressChart.tsx:65 - [Locale & i18n] `v.toFixed(1)` hardcoded number format → formatValue / Intl.NumberFormat — fixed (SYM12): `formatValue("decimal1")`; CalendarPanel's Strain value too

## src/components/charts/TrendChart.tsx

src/components/charts/TrendChart.tsx:99 - [Locale & i18n] date-fns `format` hardcoded patterns (“EEEEE”, “MMM d”, “MMM”) → Intl.DateTimeFormat — fixed (SYM12): `formatDay` with narrow weekday, month-day or month

## src/components/charts/ZoneBars.tsx

✓ pass

## src/components/metrics/ActivityCard.tsx

✓ pass

## src/components/metrics/ConnectionBanner.tsx

src/components/metrics/ConnectionBanner.tsx:43 - [Typography] in-progress title “Importing history” does not end with “…” — fixed (SYM12): "Importing history…"; the sync popover's "Syncing…" too

## src/components/metrics/ContributorRow.tsx

✓ pass

## src/components/metrics/DayStrip.tsx

src/components/metrics/DayStrip.tsx:74 - [Locale & i18n] date-fns `format` hardcoded patterns (:75, :88 “EEEEE”, :91) → Intl.DateTimeFormat — fixed (SYM12): `formatDay` for the label, narrow weekday and day

## src/components/metrics/DriverList.tsx

✓ pass

## src/components/metrics/InsightCard.tsx

✓ pass

## src/components/metrics/KeyStatRow.tsx

✓ pass

## src/components/metrics/MiniRing.tsx

✓ pass

## src/components/metrics/ReasonPlaceholder.tsx

✓ pass

## src/components/metrics/ScoreDial.tsx

✓ pass

## src/components/metrics/SleepCard.tsx

✓ pass

## src/components/metrics/SleepStages.tsx

✓ pass

## src/components/metrics/TickScale.tsx

✓ pass

## src/components/metrics/AgeOrb.tsx

✓ pass

## src/components/metrics/primitives.tsx

✓ pass

## src/components/shells/AppNav.tsx

src/components/shells/AppNav.tsx:49 - [Animation] Lens slide `transition-[translate,opacity]` has no `motion-reduce:transition-none`; the translate is movement — fixed (SYM12): `motion-reduce:transition-none` on the Lens
src/components/shells/AppNav.tsx:85 - [Hover & Interactive States] rail “Pulse home” link has no `hover:` state (PRESS only) — fixed (SYM12): `hover:bg-white/8` on the rail's home link

## src/components/shells/AppShell.tsx

✓ pass

## src/components/shells/CalendarPanel.tsx

src/components/shells/CalendarPanel.tsx:192 - [Hover & Interactive States] month chevron buttons have no `hover:` state — fixed (SYM12): `enabled:hover:bg-white/8` on the month chevrons
src/components/shells/CalendarPanel.tsx:231 - [Locale & i18n] date-fns `format(date, "EEEE, MMMM d")` hardcoded → Intl.DateTimeFormat — fixed (SYM12): `formatDay(day, DAY.long)`; the month title and weekday headers (lib/calendar.ts) and the birth-date picker's months are Intl too

## src/components/shells/CollapsingHeader.tsx

✓ pass

## src/components/shells/DateSwitcher.tsx

✓ pass

## src/components/shells/DetailHeader.tsx

src/components/shells/DetailHeader.tsx:67 - [Navigation & State] Back is a `<button>` that falls back to `router.push` (:59, :63); no Cmd/Ctrl-click or middle-click when it is a plain navigation — fixed (SYM12): Back and Close are `<Link href={parent}>`; a plain click still goes back in history, a modified or middle click opens the parent

## src/components/shells/DetailShell.tsx

✓ pass

## src/components/shells/EmptyState.tsx

✓ pass

## src/components/shells/HomeHeader.tsx

src/components/shells/HomeHeader.tsx:176 - [Performance] style write (`transformOrigin`) interleaved with `getBoundingClientRect` reads inside the per-dial loop → batch reads, then writes — fixed (SYM12): the label origins are written after every layout read

## src/components/shells/InfoButton.tsx

✓ pass

## src/components/shells/InfoDialog.tsx

✓ pass

## src/components/shells/MetricState.tsx

✓ pass

## src/components/shells/PageShell.tsx

✓ pass

## src/components/shells/ResponsiveSheet.tsx

✓ pass

## src/components/shells/SectionShell.tsx

✓ pass

## src/components/shells/ShellStatus.tsx

✓ pass

## src/components/shells/TopBar.tsx

src/components/shells/TopBar.tsx:110 - [Hover & Interactive States] focusable “Demo data” tooltip Badge has no hover/active state — fixed (SYM12): `hover:bg-white/8 hover:text-foreground` on the Demo data chip

## src/components/shells/column.ts

✓ pass

## src/components/ui/accordion.tsx

src/components/ui/accordion.tsx:44 - [Animation] `transition-all` → list properties (component unused in app) — fixed (spec §11 SYM11)

## src/components/ui/alert.tsx

✓ pass

## src/components/ui/badge.tsx

src/components/ui/badge.tsx:7 - [Animation] `transition-all` → list properties (used by tags/chips) — fixed (spec §11 SYM11)

## src/components/ui/button.tsx

✓ pass

## src/components/ui/calendar.tsx

✓ pass

## src/components/ui/card.tsx

✓ pass

## src/components/ui/chart.tsx

src/components/ui/chart.tsx:257 - [Locale & i18n] `item.value.toLocaleString()` with no explicit locale → Intl.NumberFormat — fixed (SYM12): `toLocaleString(LOCALE)`

## src/components/ui/checkbox.tsx

✓ pass

## src/components/ui/collapsible.tsx

✓ pass

## src/components/ui/dialog.tsx

✓ pass

## src/components/ui/drawer.tsx

✓ pass

## src/components/ui/dropdown-menu.tsx

✓ pass

## src/components/ui/input.tsx

✓ pass

## src/components/ui/label.tsx

✓ pass

## src/components/ui/popover.tsx

✓ pass

## src/components/ui/progress.tsx

src/components/ui/progress.tsx:23 - [Animation] `transition-all` on an indicator that animates `transform` → `transition-transform`; also no reduced-motion variant — fixed (spec §11 SYM11)

## src/components/ui/scroll-area.tsx

✓ pass

## src/components/ui/separator.tsx

✓ pass

## src/components/ui/sheet.tsx

✓ pass

## src/components/ui/skeleton.tsx

✓ pass

## src/components/ui/sonner.tsx

src/components/ui/sonner.tsx:28 - [Animation] `animate-spin` loading icon without `motion-reduce:animate-none` — fixed (SYM12): `motion-reduce:animate-none`

## src/components/ui/switch.tsx

src/components/ui/switch.tsx:19 - [Animation] `transition-all` → list properties (component unused in app) — fixed (spec §11 SYM11)

## src/components/ui/tabs.tsx

src/components/ui/tabs.tsx:65 - [Animation] `transition-all` → list properties (component unused in app) — fixed (spec §11 SYM11)

## src/components/ui/toggle-group.tsx

✓ pass

## src/components/ui/toggle.tsx

✓ pass

## src/components/ui/tooltip.tsx

✓ pass
