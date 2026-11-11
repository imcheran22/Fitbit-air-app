# App Redesign — Dark-First UI, Floating Tab Bar, Thinking Orbs, Activity Heat Map, Device Card, Coach Chat — Design

## Context

The pipe (OAuth → sync → `BiometricRecord` → scores), the habits/correlation
engine and the AI coach (backend and mobile UI) are built. The mobile UI on
top of them is a single native stack with a scrolling dashboard, a settings
screen and a plain chat screen, styled with a light-first teal palette and a
handful of small components.

This spec is a **full redesign of the mobile app's presentation and
navigation**, plus the small backend additions that redesign needs. It
changes no scoring, habit or coach logic.

Requested by the user, in their words: interactive and animated components
throughout; a user-activity heat map showing monthly, yearly and year-to-date;
an animated dashboard component showing the tracking device(s) with a picture
or animated component of the tracker; a floating bottom menu bar in the style
of the supplied reference (a black pill, line icons, one white active circle),
with the AI coach in the middle; and a chat-style coach screen with a prompt
bar and animated orbs that change animation at different points (thinking,
answering, and so on).

## Decisions taken during brainstorming

1. **Orbs, not dot matrices.** The original request named the shadcn
   `@dotmatrix` components. They are web-only (CSS/DOM), `dotm-square-3` is
   a square grid rather than a hexagon, and the user then chose the
   `thinking-orbs` library (MIT, `github.com/Jakubantalik/thinking-orbs`,
   documented at `libraries.dev/orbs`) instead. Every mention of an "orb"
   below means that library.
2. **Look: dark-first.** Near-black canvas, the black floating pill from the
   reference, per-metric neon accents on rings and the heat map. Light mode
   stays available and is styled like the reference (light canvas, black
   pill).
3. **The coach is real, not scripted.** The coach backend exists; this
   redesign restyles the client against the real coach API. An earlier
   "scripted replies" answer was given on a wrong premise (the coach looked
   unbuilt from a stale local `main`) and is void.
4. **Approved during design review:** the coach hub stays visible when the
   coach is disabled (§2.4); the heat map plots daily steps from a
   365-day steps-only history (§4); the device card is built from connection
   data with a generic tracker illustration (§5); the prompt bar is built
   natively from how the React Bits demo behaves (§6.3); the orb library is
   vendored and gated by a device spike (§3).

## Goals

- One coherent dark-first design system: tokens, a motion kit, and a small
  set of animated primitives every screen uses.
- A floating tab bar with the coach orb in the centre, on every tab root.
- A Home tab that leads with the device card and the two score cards.
- An Activity tab with a month / year / year-to-date steps heat map.
- A coach screen whose orb state follows what the conversation is doing.
- Backend support for the heat map (a year of steps) and the device card.

## Non-Goals

- No new scoring, habit, correlation or coach behaviour. No LLM provider work
  (none is wired; `COACH_ENABLED` stays as is).
- No new metrics. The heat map plots steps only; a metric switcher is a later
  extension.
- No web build, no Android-specific redesign beyond what works unchanged.
- No token streaming or typewriter effect in chat. The coach reply arrives
  whole and stays that way (see §6.4).
- No custom illustration for a specific tracker model (the model is not
  known; §5).

## Decomposition and build order

Four sub-projects, each with its own implementation plan. This document is
the single design; the plans are written per sub-project.

| | Sub-project | Depends on |
|---|---|---|
| **A** | Foundation: dark-first tokens, motion kit, orb port, tab shell + floating bar | — |
| **B** | Home redesign (device card), Activity tab (heat map), Metrics and Profile tabs (consumes D) | A |
| **C** | Coach screen: orb states, prompt bar, chat restyle | A |
| **D** | Backend: steps history job, `/me/activity`, connection/device data | — (needed by B) |

Order: **A → (D ∥ C) → B**. A opens with a spike (§3.2) that can block the
orb approach; nothing else in A starts until it passes.

## 1. Design system (sub-project A)

### 1.1 Tokens

`global.css` (CSS variables for NativeWind) and `theme.ts` (`COLORS`, used
for navigation, SVG and inline styles) remain the two sources and must stay
numerically in sync, as today. Changes:

- **Default theme becomes dark.** `restoreThemePreference` falls back to
  `'dark'` instead of `'system'` when nothing is stored (`preference.ts`);
  the light/dark/system toggle is unchanged. `ThemeContext`'s initial
  `'system'` value changes to match. Existing stored choices are respected.
- New semantic tokens (both themes, values chosen at build time and recorded
  in both files): `surface` (card), `surfaceRaised` (bar, sheets),
  `hairline` (1px borders that keep a black pill visible on a near-black
  canvas), `bar` (the pill's fill: near-black in dark with a hairline border
  and shadow; solid black in light, as in the reference), `barIcon`,
  `barIconActive`, and `heat0..heat4` (heat-map steps ramp, derived from the
  STEPS metric colour).
- Per-metric colours (`METRIC_CONFIG`) and score bands are unchanged.
- The orbs are strictly monochrome (§3) and take their ink from the theme,
  never from metric colours.

### 1.2 Motion kit

New motion tokens extend `MOTION` (`theme.ts`, still free of native imports):
`spring` presets (`press`, `settle`), `stagger` step, and a `reduced`
behaviour rule. New primitives in `components/ui/`:

- `PressableScale` — press-in scale/opacity spring; the base of every tappable
  card and button. Respects reduced motion (opacity only).
- `Reveal` — staggered entrance (`FadeInDown` family) driven by index; wraps
  what `DashboardScreen` currently does inline.
- `SegmentedControl` — sliding indicator between segments (used by the heat
  map's month/year/YTD switch and the Metrics range selector).
- `Sheet` — bottom detail sheet with drag-to-dismiss (heat-map day detail).
- Existing `Ring`, `CountUp`, `TrendLine`, `ScoreRing`, `Skeleton`, `Card`,
  `Button` are kept and restyled to the new tokens; they gain
  `PressableScale` where tappable.

Every animated component must render a correct static state when the OS
"reduce motion" setting is on.

## 2. Navigation (sub-project A)

### 2.1 Structure

`@react-navigation/bottom-tabs` with a custom `tabBar` renders the floating
bar. The existing native stack stays as the outer navigator so detail screens
push over the tabs and hide the bar:

```
Stack
├─ ConnectHealth            (unchanged; chosen as initial when not connected)
├─ Tabs                     (initial when CONNECTED)
│   ├─ Home
│   ├─ Activity
│   ├─ Coach                (centre)
│   ├─ Metrics
│   └─ Profile
├─ MetricDetail, ScoreDetail, Patterns   (pushed over tabs; no bar)
└─ CoachConsent, CoachMemory             (pushed; no bar)
```

`RootNavigator` keeps its current job of asking `/me/connection` which
top-level route to open. `RootStackParamList` gains `Tabs`; the current
`Dashboard` route is replaced by `Tabs` → `Home`. Screens that navigate to
`'Dashboard'` or `'Coach'` today are updated to navigate into the tab
(`navigate('Tabs', { screen: 'Coach', params })`), keeping the `prefill`
param for coach entry points (`ScoreDetail`, digest card).

### 2.2 Tab contents

- **Home** — greeting/date header; **device card** (§5); Recovery and Sleep
  `ScoreCard`s; the four metric rings (each opens `MetricDetail`); habit log
  card; coach digest card when the coach is enabled and consented; the
  existing deterministic headline insight. The current "Trends" list moves to
  Metrics.
- **Activity** — the heat map (§4).
- **Coach** — the chat (§6).
- **Metrics** — per-metric trend cards (`TrendLine`) with a range selector,
  and an entry card to Patterns (moved from Home).
- **Profile** — what `SettingsScreen` holds today (time zone, coach settings,
  memory entry) plus the theme toggle and sign-out, which currently live in
  the dashboard header.

### 2.3 Floating bar

- Black pill floating above the safe-area inset, horizontally inset from the
  screen edges, ≈80 dp tall so a 64 dp orb fits inside (the reference's
  slimmer pill cannot hold the 64 dp orb; §3.3).
- Four line icons (Ionicons outline set already installed) flank the orb:
  Home, Activity | orb | Metrics, Profile.
- The **active** icon sits in a white circle that slides between positions
  (shared-value animation), as in the reference. The centre orb has no white
  circle; while the Coach tab is active the orb plays its `listening`/state
  animation at full brightness. Inactive it plays `breathing` dimmed **and
  paused** — a deliberate narrowing found in implementation: the vendored
  orb drives its animation with a 60 fps React `setState`, and a
  barely-visible moving orb on every tab was not worth that cost for as
  long as the coach stays enabled (see §3.3 and the redesign-foundation
  plan's final review).
- Hides while the keyboard is open (the coach prompt bar takes its place)
  and on pushed detail screens.
- Every item has an accessibility label and role; the orb is labelled
  "AI coach".

### 2.4 The coach hub when the coach is disabled

The ai-coach spec (Implementation Status) says the mobile UI renders nothing
coach-related while the coach is disabled. **This design deliberately
deviates for the hub only:** the centre orb is always visible.

- `status.enabled === false` or status unknown (`useCoachStatus` returns
  `null`): orb is dim, `shaping` state, **paused**; tapping opens the Coach
  tab, which already renders its "unavailable" phase.
- enabled and not consented: normal orb; tapping opens the Coach tab, which
  redirects to `CoachConsent` exactly as `CoachScreen` does today.
- enabled and consented: normal orb; tapping opens the chat.

Other coach entry points (digest card, "Ask the coach" from score detail)
keep the existing rule: hidden unless `coachEntryRoute(status)` is non-null.
The ai-coach spec's Implementation Status is updated when this ships.

## 3. Thinking orbs (sub-project A)

### 3.1 What the library provides

`thinking-orbs` (npm, v0.3.1, MIT): nine animated states — `working`,
`searching`, `solving`, `listening`, `connecting`, `weaving`, `composing`,
`breathing`, `shaping` — at exactly two sizes, `64` and `20` (separate
designs, not a scale factor), strictly monochrome. Its geometry lives in the
React-free `thinking-orbs/engine` export.

The React Native port (`thinking-orbs-native`) is **not on npm**; it lives at
`packages/thinking-orbs/ports/react-native/thinking-orbs-native` in the
repo. It renders the engine's frames with `@shopify/react-native-skia`, and
its README states it has **not been runtime-verified on a device**.

### 3.2 Integration and the spike gate

- Add `thinking-orbs@0.3.1` (engine) and `@shopify/react-native-skia` (via
  `npx expo install`, so the Expo-compatible version is chosen). Skia's
  latest peer requirements (React ≥19, RN ≥0.78, Reanimated ≥4,
  worklets ≥0.7) are met by this app. It is a new native dependency: a dev
  client rebuild (`expo run:ios`) is required.
- Vendor the port's three source files (`ThinkingOrb.tsx`, `theme.ts`,
  `types.ts`, ≈8 KB; its `index.ts` only re-exports the engine and is not needed) into `mobile/src/components/orb/`, keep the
  MIT licence text alongside them, and pass `theme` explicitly from our
  `ThemeProvider` (the port's `auto` follows the OS scheme, but this app's
  theme is a manual toggle).
- **Spike (first task of A; blocks the rest of A):** run every one of the nine
  states at both sizes on an iOS simulator and confirm they render and
  animate, in dark and light, with the app's Expo 57 / RN 0.86 / React 19 /
  Reanimated 4.5 stack and the existing iOS scene-delegate config plugin.
  Fix what breaks in the vendored copy. **If Skia cannot be made to work**,
  fall back to re-drawing the orb from the engine's dot list with
  `react-native-svg` (the engine is renderer-agnostic), accepting lower frame
  rates; if that fails too, stop and revisit with the user.
- Jest: Skia needs its documented jest setup/mocks; orb rendering is mocked
  in component tests. Animation itself is verified manually (see Testing).

### 3.3 Sizes and where each is used

| Place | Size | State |
|---|---|---|
| Tab bar centre, tab inactive | 64 | `breathing` (dimmed, **paused** -- implementation deviation, see §2.3) |
| Coach header, idle | 64 | `breathing` |
| Coach, input focused / user typing | 64 | `listening` |
| Coach, message just sent | 64 | `searching`, then `solving` |
| Coach, reply just arrived | 64 | `composing` (brief) |
| Coach, loading status/history | 64 | `connecting` |
| Coach unavailable / disabled | 64 | `shaping`, paused, dim |
| Avatar beside each assistant message | 20 | `weaving` (paused for history, plays once for a fresh reply) |
| Inline "Thinking…" line | 20 | `working` |

A pure function `coachOrbState(input): OrbState` (§6.2) owns the mapping so it
can be unit-tested; components never pick states ad hoc.

## 4. Activity heat map (sub-projects B and D)

### 4.1 Views

One `ActivityHeatmap` component with an animated `SegmentedControl`:

- **Month** — the selected calendar month as a 7-column calendar grid (weeks
  as rows, Sunday first), with previous/next month buttons and a month title.
- **Year** — the trailing 12 months ending today as GitHub-style columns
  (one column per week, 7 rows, ≈53 columns) with month labels.
- **YTD** — January 1 of the current year through today, same layout as Year
  with fewer columns.

Below the grid: summary stats for the visible range (total steps, average per
day with data, active days, current streak, best day) and a five-swatch
legend.

### 4.2 Data and intensity

- Metric: daily `STEPS` (the only activity metric the app stores).
- A day with **no record** is drawn as an empty, dim cell (distinct from a
  recorded day with 0 steps, which is level 0). This keeps "we have no data
  for this day" honest, which matters while history is still backfilling.
- Levels are relative to the steps goal already in `METRIC_CONFIG`
  (10,000): level 0 = 0 steps, 1 = under 25 %, 2 = 25–50 %, 3 = 50–100 %,
  4 = at or above goal. Fixed thresholds (not per-view quantiles) so a day
  looks the same in every view.
- Colours from the `heat0..heat4` tokens (a ramp of the steps colour).

### 4.3 Interaction and motion

- Tapping a cell opens a `Sheet` with the date, steps, percent of goal and a
  one-line comparison to the visible range's average. In Month view the
  tapped cell scales up while the sheet is open.
- Switching view cross-fades the grid and re-reveals cells with a short
  column-wise stagger (capped so a year does not animate 371 individual
  cells: cells animate in groups of columns).
- Rendering: one `react-native-svg` `Svg` with memoised `Rect` cells and
  a single pan/tap hit-test by coordinates, not 371 pressables. Skia is
  already a dependency after §3 and may be used instead if SVG performance
  is inadequate on the year view; the component's props do not change.
- Accessibility: the grid is one element with a summary label; the stats and
  the day sheet are the accessible path. Individual cells are not focusable.

### 4.4 Backend (sub-project D)

The dashboard's `GET /me/biometrics` returns every record unbounded, which is
unsuitable for a year of history, so:

- **`GET /me/activity?from=YYYY-MM-DD&to=YYYY-MM-DD`** (authenticated) returns
  `{ days: [{ date: 'YYYY-MM-DD', steps: number }], earliestDate: string | null }`
  from the user's `STEPS` `BiometricRecord`s. Dates are civil dates (steps
  are already civil-date keyed by `dailyRollUp`). Validates ISO dates,
  `from <= to`, and a range cap of 400 days (400 error otherwise).
  `earliestDate` is the oldest STEPS record for the user, so the client can
  distinguish "history not synced yet" from "no activity".
- **History backfill, steps only.** The existing connect-time backfill
  (`BACKFILL_WINDOW_DAYS = 30`, all four metrics) is **unchanged**: widening
  it would change the inputs to baselines and scores, which is out of scope.
  Instead a new job `backfillStepsHistory` (on the existing `health-sync`
  queue, dispatched in `sync/worker.ts`) fetches `STEPS` for the last 365
  days, using the same chunked `fetchMetricRange`, 401/refresh handling and
  empty-window skipping as `handleBackfillJob`. It is enqueued (a) after a
  successful connect, next to the existing backfill, and (b) once at server
  start for every `CONNECTED` connection whose new nullable column
  `HealthConnection.stepsHistoryBackfilledAt` is null (a migration adds the
  column; the job sets it on success). Idempotent by the existing upsert key.
- **Unverified assumption:** that Google Health returns a year of daily
  steps for this account. A live check is the first task of D; the UI is
  built to render whatever arrives (§4.2) and to show a "History is still
  syncing / only N days available" note keyed on `earliestDate`.

### 4.5 Reference component: the visx heatmap (user directive)

After the design was approved the user asked that the heat map follow a
supplied integration brief for a `heatmaps.tsx` / `heatmap-chart-demo.tsx`
pair built on `@visx/group`, `@visx/scale`, `@visx/heatmap` and
`@visx/mock-data`, to be placed in `components/ui`. Its visual vocabulary
is a **circle-cell variant** (`HeatmapCircle`, hot palette `#77312f → #f33d15`)
and a **rect-cell variant** (`HeatmapRect`, cool palette `#122549 → #b4fbde`),
colour and opacity driven by linear scales, a rounded dark panel
(`#28272c`), 2 px gaps between cells, an `events` prop that makes cells
tappable, and `width`/`height`/`margin`/`separation` props.

That brief assumes a web shadcn + Tailwind project. This app is Expo /
React Native, so it is adapted rather than copied verbatim. Rulings:

- **Location.** `mobile/src/components/ui/` is already this repo's
  equivalent of shadcn's `components/ui`; the component lives there
  (`heatmap-chart.tsx`, plus a dev-gallery demo). No `components.json` /
  shadcn CLI setup is added — it does not apply to React Native.
- **Dependencies.** `@visx/scale` (pure math, works in React Native) is
  installed. `@visx/heatmap` and `@visx/group` render DOM `<g>` elements
  and cannot draw in React Native, so their **cell geometry is
  reimplemented** on `react-native-svg` (`Svg`, `G`, `Circle`, `Rect`) using
  the same scales and the same bin maths (x/y scale over the grid, bin
  width/height, radius = half the smaller bin dimension, `gap`). Only if a
  later spike shows `@visx/heatmap` can be aliased onto `react-native-svg`
  cheaply is it used directly. `@visx/mock-data` is a **devDependency**, used
  only by the gallery demo (its random `genBins` grid); real screens never
  use mock data.
- **Two components, one vocabulary.** `HeatmapChart` keeps the brief's API
  (`width`, `height`, `margin`, `separation`, `events`) and renders both
  variants side by side over generic binned data — it is the reusable
  primitive and the demo. `ActivityHeatmap` (§4.1–§4.3) is the product
  component: it feeds **real daily-steps cells** (the calendar layouts in
  §4.1, the goal-relative levels in §4.2) through the same colour/opacity
  scales and the same circle/rect cell drawing, with the `heat0..heat4`
  tokens as the colour ramp instead of the hot/cool demo colours. A cell
  shape option (`circle | rect`) lets the user's two variants both be
  available; Month uses circles, Year/YTD use rects.
- **Tap handling.** The brief's `alert(JSON.stringify(...))` on click is
  replaced by an `onCellPress` callback (the product opens the day
  `Sheet`).
- **Not applicable** from the brief: Unsplash stock images and `lucide-react`
  icons (no images/icons in this component; the app uses Ionicons).

## 5. Device card (sub-projects B and D)

`DeviceCard` at the top of Home: an animated tracker illustration with the
device's name and status.

- **What data exists.** Nothing about the physical tracker is stored, and no
  Google Health device endpoint is known to exist. The card is therefore
  built from the connection: provider ("Google Health"), status
  (`CONNECTED` / `DISCONNECTED`) and `lastSyncedAt`, all already returned by
  `GET /me/connection` (which gains `provider: 'GOOGLE_HEALTH'` and a
  `devices: []` array, empty for now). The project README describes the
  target device as a Fitbit synced through a Google account, so the default
  illustration and label are a generic **Fitbit-style band**; the exact model
  is not claimed.
- **Illustration.** Drawn in code with `react-native-svg` (band, case, screen).
  The screen shows the user's latest real resting heart rate and steps
  (already loaded on Home) with a slow heart-pulse glow and a subtle idle
  breathing of the whole band; when `DISCONNECTED` it is desaturated, static,
  and the card offers "Reconnect" (→ `ConnectHealth`). "Synced 4 min ago"
  animates with `CountUp`-style relative time.
- **Multiple devices.** The card is a horizontally paged carousel with
  pagination dots, fed by a `devices` list. Today the list has one entry
  derived from the connection. The first task of D also checks whether Google
  Health exposes device information; if it does, `devices` is filled from it
  (model-specific artwork is then a follow-up); if not, the single derived
  entry remains.
- Press: `PressableScale`; when connected, tapping flips the card to a
  details face (provider, last sync time, connection status).

## 6. Coach screen (sub-project C)

### 6.1 Layout

Header with the 64 dp orb and the persona name; message list; suggested-prompt
chips (from `lib/coachPrompts.ts`) shown above an empty conversation; the
prompt bar. All existing behaviour is retained: phases `loading` /
`unavailable` / `ready`, consent redirect, fetch of the latest conversation,
send with 20 s client timeout, retry with the original request on error,
crisis-safety card with resources and "false alarm" resend, memory-proposal
chips, `prefill` from entry points. Only presentation and the orb change.

### 6.2 Orb state machine

```
loading            → connecting
unavailable        → shaping (paused, dim)
ready, idle        → breathing
ready, input focus → listening
sending            → searching (0–1.5 s) → solving (thereafter, until reply/err)
reply arrives      → composing for ~1.2 s → breathing
error              → breathing (error text shown as today)
safety reply       → breathing (no celebratory animation)
```

`coachOrbState({ phase, focused, sending, sendingMs, justReplied })` is pure
and unit-tested. Reduced motion renders each orb as its static frame.

### 6.3 Prompt bar

A native rebuild of the React Bits "prompt bar" micro-interaction (the
original is a web component; its source could not be read in this session,
so it is built from how the demo behaves and the user can supply its code or
a screenshot for a closer match): a rounded floating input above the tab
area that grows with content up to a maximum, an animated send button that
appears/rotates in when there is text, focus glow, disabled while a message
is in flight, keyboard-aware (hides the tab bar, sits above the keyboard),
`accessibilityLabel`s, and submit on the send button. Uses `TextInput`,
Reanimated and `PressableScale`; no new dependency.

### 6.4 Chat presentation and honesty rules

- `ChatBubble` restyled to the new tokens; assistant messages get the 20 dp
  `weaving` orb avatar.
- **No typewriter/streaming effect.** The coach reply arrives whole; the
  existing `StreamingText` (single fade-in) is kept.
- The `searching → solving` sequence while a request is in flight is a
  **time-based cosmetic sequence**. No tool progress or partial content
  reaches the client, so the UI must not claim specific activity: the line
  beside it stays the generic "Thinking…" (this replaces the ai-coach spec's
  "static Thinking… line" only in that the line now has a small animated orb
  next to it).
- The `composing` orb plays for the ~1.2 s after a reply appears, matching the
  fade-in; it does not run during generation.
- The coach disclaimer, safety resources and memory chips are unchanged.

## 7. Testing

- **Pure logic, unit tested:** `coachOrbState`; heat-map layout (month grid
  for any month incl. leading/trailing blanks, year/YTD week columns, month
  labels), level bucketing, streak/best-day/average; relative-time text;
  device list derivation.
- **Components (jest-expo + Testing Library):** floating bar (active circle,
  hub states for enabled / disabled / unknown / unconsented, hides on
  keyboard); heat map view switching and day sheet; prompt bar (grow,
  send-button visibility, disabled in flight); device card states
  (connected, disconnected, none); coach screen phases and orb-state wiring
  with the orb mocked.
- **Existing tests to update:** `RootNavigator*`, `DashboardScreen*`,
  `DashboardCoachEntry`, `DashboardDigest`, `ScoreDetailCoachEntry`,
  `CoachScreen*`, `ThemeToggle`/preference default, and snapshot files under
  `__tests__/components/__snapshots__` (dark default and restyled tokens).
- **Backend:** `/me/activity` (range validation, cap, civil dates, empty,
  `earliestDate`, auth, other-user isolation) and the `backfillStepsHistory`
  job (chunking, 401-refresh path, empty-window skip, idempotent re-run,
  sets `stepsHistoryBackfilledAt`), using the existing real-Postgres test
  setup. `/me/connection` additions.
- **Manual, on a simulator/device (animation cannot be asserted in jest):** a
  checklist per screen — every orb state at both sizes in dark and light, bar
  slide animation, heat-map view transitions and 371-cell year performance,
  reduced-motion on, keyboard show/hide with the coach open, and a
  disconnected account.

## 8. Risks and open questions

1. **Orb port is unverified on device and Skia is a new native dependency.**
   Mitigated by the spike gate and the SVG fallback (§3.2); if both fail the
   orb choice returns to the user.
2. **A year of Google steps history is unverified**; the heat map is built to
   degrade to what exists (§4.2, §4.4).
3. **The tracker model is unknown**; the card uses a generic band (§5). The
   user can name the model to have artwork drawn for it.
4. **Prompt bar fidelity** depends on the user's reference for the demo (§6.3).
5. **Deviations from existing specs** — ai-coach Implementation Status
   (hub visible when disabled; animated "Thinking…") and the mobile UI's
   information architecture (Dashboard becomes tabs). Both docs are updated
   when the work lands.
6. **Year-view render cost** on low-end Android; the Skia option in §4.3 is
   the escape hatch.
7. **Light mode is secondary** but must remain correct; the bar in light mode
   is black as in the reference, and the orbs switch to dark ink.
8. **Accessibility:** heat-map cells are not individually focusable by
   design; if that proves inadequate, add a per-week accessible list.
