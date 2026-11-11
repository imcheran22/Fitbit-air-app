# Home F: the scene

Date: 2026-10-13 · Branch: `feature/home-f` (stacked on `feature/profile-activity`) · Status: design approved by the owner; revised after the spec review (§10); awaiting the owner's review

The second of two specs. It needs `2026-10-13-kip-colour-design.md`: your colour, buddies' colours and `PersonKip`.

The owner approved Home direction **F** on 2026-10-10 (handoff `2026-10-10-sleep-home-kip-handoff.md` §3). Boards in
`docs/design/home/project/`:

- `F.dc.html`: the layout;
- `FWeather.dc.html`: the scene engine and every weather state;
- `FMostly`, `FCloudy`, `FStormy`, `FShort` and `FNight`: the states as rendered.

## 1. The page, top to bottom

1. **The scene** (§2–§4), full width. It starts at the top of the screen, behind the status bar, with the header
   drawn over the sky.
2. **The "Today" row:** a `SectionLabel` "Today", and on the right the state's hint (§5).
3. **Three compact tiles** in a row (§5): Recovery, Sleep and Tomorrow.
4. **"Ask Coach about today"**, a full-width outline `Button` with the coach icon (§5). It replaces `CoachTile`.
5. **The rest of Home, unchanged and in its current order:** the habit log card, the Recaps shelf, the weekly coach
   digest, "Your metrics" and the insight card.

### Removed

These components are used only by Home today, and Home F replaces them:

| File | Replaced by |
| --- | --- |
| `components/home/recovery-hero.tsx` | the RECOVERY tag and the Recovery tile |
| `components/home/sleep-tile.tsx` | the SLEEP tag and the Sleep tile |
| `components/tomorrow-card.tsx` | the TMRW tag and the Tomorrow tile |
| `components/home/coach-tile.tsx` | the Ask Coach button |
| `components/home/BuddiesRow.tsx` | the scene's buddies and "ALL n →" |

- They are deleted, with their tests and their entries in `__tests__/conventions/buttons.test.ts`. A stale entry
  fails that test.
- `components/recovery/RecoveryHero.tsx` is the Recovery page's own hero and stays.
- Each destination is still reachable from its new place.

### Other Home screens

- The other Home states are unchanged: not connected, reconnect, and the fallback.
- The **loading** skeleton changes shape: a 300-point scene block, the Today row, and three tile blocks in a row.
- Home has **no pull to refresh** today, and this spec doesn't add one.

## 2. The scene

### Drawing

- **A pure module, `lib/home/scene.ts`,** ported from `FWeather.dc.html`'s script.
  - Given a state, it returns the rect lists for each layer on the board's 130 × 100 grid, with the ground line at
    row 82.
  - It copies the board's data as it is: the colours, the art (`ART`), the icons (`ICON`, including the 11 × 11
    moon), the flower spots, the cottage and mailbox rects, and each state's art list. For example, the short-night
    state has a haze, a small sun and a cloud.
- **Layers, back to front:**
  1. the sky (four bands with a dither; stars at night);
  2. the sun or moon and the weather (clouds, haze, birds, the butterfly);
  3. the hills, ground and flowers;
  4. the cottage (the bed and the wall calendar inside) and the mailbox; the window is lit at night;
  5. the KIPs (yours and up to two buddies');
  6. the tags (§4);
  7. rain, over the KIPs, only when stormy.
- **`components/home/HomeScene.tsx`** draws layers 1–4 and 7 with `react-native-svg`, one `Path` per colour, as on
  the board.
- **All of the scene art is hidden from screen readers.** The tags carry the meaning.
- **No animation** in this version.

### Size and position (owner: crop, never shrink)

- **The unit is always 3 points per grid cell,** so the grid is 390 × 300 points on every phone. Edges stay crisp,
  because `react-native-svg` has no `shapeRendering`.
- **Horizontal position.** The grid is placed at `offsetX`, a whole number of points.
  - **Wider than 390 points:** the grid is centred. Each sky band and each ground band is also drawn full width
    behind it, so the sides continue the picture.
  - **Narrower than 390 points:** the sides are cropped. `offsetX` keeps grid columns 2–126 (the cottage roof to
    the mailbox flag) on screen when they fit. That needs 375 points, so on a 375-point phone `offsetX` is −6.
    When they can't fit (for example on a 360-point phone), the grid is centred instead (−15).
- **Height.** The scene is `300 + extra` points tall. `extra = max(0, headerBottom + 8 − 118)`, where `headerBottom`
  is the bottom of the header (§5) and 118 is the highest tag's top on the board (SLEEP).
  - The extra height is more sky above the grid, in the top sky band's colour (and stars at night).
  - Every grid element, KIP and tag moves down by `extra`, so no tag ever sits under the header.
- **Positions.** Everything sits at the board's positions in points (`F.dc.html`, unit 3), plus `offsetX` and
  `extra`:
  - your KIP: scale 5, centred at x 210;
  - the buddies: scale 3, centred at x 142 and x 290;
  - all three stand on the ground line (y 246, before `extra`).

## 3. Which state

`sceneState({ now, recovery, night })` in `scene.ts` is pure. The first rule that matches wins:

| # | When | State | Your KIP (pose, mood) |
| --- | --- | --- | --- |
| 1 | Local time 20:00–04:59 | **night** (F6): stars, the moon, the lit window, no flowers | rest, sleepy |
| 2 | Last night was short (below) | **short** (F5): haze, a small sun, a cloud, a few flowers | coffee, sleepy |
| 3 | Today's Recovery weather is `clear` | **clear** (F1): the big sun, a meadow, birds and a butterfly | cheer, proud |
| 4 | … `mostlyClear` | **mostly** (F2) | wave, idle |
| 5 | … `cloudy` | **cloudy** (F3): grey clouds, flowers in bud | rest, idle |
| 6 | … `stormy` | **stormy** (F4): storm clouds, rain, no flowers | rest, determined |
| 7 | Anything else: `building`, `none`, not loaded, or failed | **mostly** sky, without birds | rest, curious |

### Inputs

- **Today's Recovery weather.** Take the newest `RECOVERY` score in the 7-day scores read Home already makes.
  - If there isn't one, or it isn't dated today, the weather is `none`.
  - If its `score` is `null`, the weather is `building`.
  - Otherwise, the band from `scoreBand(score, bands)` maps to weather as on the Recovery page. To share that map,
    `recoveryCopy.ts` exports `weatherForScore(score, bands)`, and `weatherFor` uses it.
- **Last night was short** when the night dated today exists (nights are dated by the morning you woke up), its
  `mainIsNap` is not true, and its `mainMinutesAsleep` is under 360. This needs a **new read**:
  `fetchSleep(today, today)`. A failed read means "not short".
- **Night** uses the device's local time, the same clock as the greeting. It starts at 20:00, not the board's
  "after 9 pm" (owner decision, 2026-10-13).
- **When it updates.** The state is computed again when Home gains focus, when the app returns to the foreground,
  and by a timer set to the next 05:00 or 20:00 boundary. The timer is cleared on blur.

### This differs from the handoff's assumed mapping, on purpose

The handoff's mood mapping was an assumption from before direction F. It used recovery 80+ cheer, 50–79 wave and
under 50 determined, plus "first 7 days: curious". This spec follows the approved F boards instead:

- The **Recovery page's bands** set the weather and KIP's pose (75 / 55 / 40 by default; the user's bands when the
  server sends them). So the scene, the Recovery tile and the Recovery page always agree.
- **Cloudy** is rest and idle (the board's `calm`), not wave.
- **Curious** comes from the Recovery `building` / `none` states, not a day count.
- **Night beats a short night.**

A builder should not "fix" these back.

## 4. Tags

Tags are raw `Pressable`s with `accessibilityRole="button"`, so each kind gets one conventions entry.

### Hot tags

Hot tags are dark pills (`rgba(10,11,14,0.82)`, a 1-point light border, `rounded-lg`). Each holds:

- a 4-point colour square;
- a key in the pixel font, `text-label` (11 points; the board's 9 px has no token);
- a value in `text-caption`, semibold and tabular.

| Tag | Board position | Value | Opens | Spoken label |
| --- | --- | --- | --- | --- |
| **SLEEP** (lilac) | (8, 118), on the bed | today's sleep score | Sleep (`openSleep`) | "Bed: sleep 78, 7h 12m. Open Sleep" |
| **TMRW** (indigo) | (52, 158), on the wall calendar | the forecast range, e.g. "68–76" | Forecast | "Calendar: tomorrow likely 68 to 76. Open Tomorrow" |
| **RECOVERY** (band colour) | (214, 126), in the sky | today's score | Recovery (today) | "Sky: recovery 68, mostly clear, Good. Open Recovery" |
| **RECAPS** (coral) | (296, 148), on the mailbox | the count of unwatched recaps | Recaps | "Mailbox: recaps, 1 new. Open Recaps" |

- A missing value shows "—", and the spoken label says "no reading yet". When there's no score, the RECOVERY tag's
  key is in the muted colour.
- RECAPS with nothing unwatched shows no number, and its label says "no new recaps".
- **The recap count's source.** The shelf's fetch (`RecapShelf.tsx`) moves into a shared hook,
  `lib/recap/useRecapShelf.ts`. It returns the shelf items and the unwatched count, using `useWatchedRecaps`. The
  shelf and the RECAPS tag both read it, so there's one fetch.

### Buddy tags

- **Name tags** sit under each buddy KIP, 8 points below the ground line. Each shows the display name in upper case.
  - A name longer than 8 characters is cut to 7 plus "…".
  - It is in the pixel font, `text-label`.
  - It opens that buddy's week.
  - Its spoken label is "{full name}, {mood line}. Open their week".
- **"ALL n →"** sits at (332, 254) and opens the Social tab. `n` is the total number of buddies.
  - With incoming requests it reads "1 REQUEST →" or "{n} REQUESTS →" instead.
  - With no buddies and no requests, it is hidden.

### Which buddies (owner: ordered by the server, no timestamps sent)

- **A new route, `GET /me/buddies/scene`**, returns `{ buddies: BuddyRow[], total: number, incomingRequests: number }`.
  - `buddies` has at most 2 entries: your buddies ordered by their latest `CheckIn.createdAt`, newest first.
  - Editing a check-in doesn't move a buddy up.
  - Buddies who never checked in come after them, by the existing `lastActivityAt` order.
  - Muted buddies are left out of `buddies`, but still count in `total`.
  - No check-in time or date is sent. The order is the only signal, and the Social camp banner already shows who
    checked in today.
  - The route looks across **all** buddies, not the first page of the list.
  - It is a bare 404 on an older server, and then the scene shows only you.
- Each buddy KIP is a `PersonKip` in the buddy's `kipColour`. Its state is the buddy's `mood`, which gives the same
  pose they have on every other screen. During **night**, every buddy is `asleep`.
- Fewer than two buddies leave the spots empty.

## 5. The header, hint, tiles and Ask Coach

### Header (over the sky)

- **Position.** The header sits at the safe-area top plus 8 points. `headerBottom` (§2) is measured from its layout.
- **Left:**
  - the date line, formatted with `toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })`
    (e.g. "Tue, Oct 13"), as a `SectionLabel`;
  - the greeting, `text-display`, as today;
  - `SyncStatusLine`.
- **Right:**
  - `ThemeToggle`;
  - **the Profile button.** It is the existing round `StoryRing` (44 points) with today's recap-ring behaviour and
    the `settings-button` test ID.
    - Its inner circle is dark translucent (`rgba(10,11,14,0.45)`), with your KIP in your colour (`Kip` at scale 2).
    - Its `surface` is the current state's top sky colour, so the ring's gap matches the sky.
    - The board's square button is dropped, because `StoryRing` clips its child to a circle.
- **Colours.** All header text and icons are light on every sky, in both themes.
- **Status bar.** While Home is focused, it sets `<StatusBar style="light" />`. On blur, `ThemedStatusBar` takes over
  again.

### The hint (the "Today" row's right side)

| When | Hint |
| --- | --- |
| night | "Wind down · bed by {bedtime}", in lilac (or just "Wind down" without a bedtime goal) |
| short | "Short night overrides KIP's mood", in amber (the board's wording) |
| otherwise | "Tap the scene or a tile", muted |

### The three tiles

- Each tile is a `Card` pressable, with a raw `Pressable` and a conventions entry.
- The label is `text-label` (the board's 10 px has no token), and the value is `text-heading`, tabular.
- All strings go in a new `homeCopy.ts`.

**Recovery**
- The label; `WeatherIcon` with today's score.
- Under it, the verdict (e.g. "Mostly clear"), in the band colour from the palette, as the Recovery page's header does.
- It opens Recovery on today.

**Sleep**
- The label; the board's moon icon (`ICON.moon`) with today's sleep score.
- Under it, the duration from `mainMinutesAsleep` (e.g. "7h 12m").
  - After a short night, it reads "5h 10m · short" in amber.
- It opens Sleep.

**Tomorrow**
- The label; the forecast range (e.g. "68–76").
- Under it, "Bed by 23:00" from the sleep goal's `bedtimeGoal` (`fetchSleepGoal`). Without a bedtime goal, it reads
  "With 7.5h sleep" from the forecast's `defaults.sleepHours`.
- With not enough history, it shows the existing unlock line, as `TomorrowCard` does now.
- It opens Forecast.

**Loading and failure:** a tile still loading shows a `Skeleton`; a tile whose read failed shows "—".

### Ask Coach about today

- It shows only when there is a coach route, as `CoachTile` does today. With no route, it is hidden.
- With consent needed, it reads "Ask Coach · see what's shared first".
- It opens `navigateToCoachEntry(navigation, coachRoute)`.

## 6. Data

Each read fails on its own, and the scene never blocks the page.

| Read | Status | Gives |
| --- | --- | --- |
| `fetchScoresWithBands(7)` | existing | the Recovery and Sleep scores and the bands |
| `fetchSleep(today, today)` | **new** | last night's main sleep and whether it was a nap |
| `fetchSleepGoal()` | **new** | the bedtime goal |
| the forecast | existing | the range and the default sleep hours |
| `GET /me/buddies/scene` | **new** | the scene's buddies, the total and the requests |
| `useRecapShelf` | shared | the shelf and the unwatched count |
| `useMyKipColour` | from the KIP colour spec | your colour |

- **Backend:** the `/me/buddies/scene` route, in `backend/src/buddies/`.

## 7. Light mode

The scene is a picture: it keeps its own colours in both themes. The header over it is always light, and the status
bar is light while Home is focused. The page below the scene follows the theme as now.

## 8. Rules that apply

- Buttons are `ui/button.tsx` with `rounded-lg`. Raw pressables with a button role (the tags and the tiles) get
  conventions entries. The removed cards' entries are deleted.
- Only the A4 type tokens; the pixel labels use `text-label` with the pixel font.
- Strings live in copy modules.
- Never log health values, dates or names.
- Never `new Date('YYYY-MM-DD')`.
- `CampScene.tsx` and `CampBanner.tsx` are not touched here.
- TDD: run the touched tests and both typechecks before every commit.

## 9. Tests

- **`scene.ts`:**
  - `sceneState` covers every row of the table:
    - the night window edges (19:59, 20:00, 04:59 and 05:00);
    - a short night beating every band, and night beating a short night;
    - each band;
    - the fallback for `building`, `none`, an old score and a failed read;
  - flower counts per state: 18 for clear, 9 for mostly, 5 for short and cloudy (buds), 0 for stormy and night;
  - rain only when stormy;
  - the lit window and stars only at night.
- **Short night:** under 360 minutes is short; 360 is not; a nap-only day is not; a missing night is not.
- **Layout:**
  - `offsetX` at 360, 375, 390 and 430 points;
  - `extra` for a short and a tall header;
  - tags moving with `extra`.
- **`HomeScene`:**
  - The tags:
    - each shows its value and spoken label, and opens its destination;
    - "—" and "no reading yet";
    - the RECAPS count from the shared hook.
  - The buddies:
    - two, in their colours and mood poses;
    - asleep at night;
    - names cut to 7 plus "…";
    - "ALL n →" and the request wording;
    - hidden with none.
  - The art is hidden from screen readers.
  - Your KIP is in your colour.
- **Tiles:**
  - values, the verdict colour, "· short" in amber;
  - the bedtime and sleep-hours lines and the unlock line;
  - the loading and failed states.
- **Ask Coach:** hidden without a route, with consent wording.
- **`DashboardScreen`:**
  - the order: scene, Today, tiles, Ask Coach, habit log, Recaps, digest, metrics;
  - the removed cards are gone;
  - the header has the theme toggle, the sync line and the Profile ring;
  - the status bar is light while focused;
  - the state is recomputed on focus.
- **Backend `/me/buddies/scene`:**
  - the order by latest check-in, and that an edited check-in doesn't move a buddy;
  - never-checked-in buddies after;
  - muted buddies left out but counted;
  - at most 2;
  - no timestamps in the response;
  - it reaches beyond the first list page;
  - it requires auth.

## 10. Spec review (2026-10-13)

A reviewer checked this spec against the code and the boards. Fixed here:

- the new sleep read and the precise weather rule;
- the crop-not-shrink layout and the header clearance (owner: crop);
- the deliberate difference from the handoff's mood mapping;
- the server-ordered buddies with no timestamps (owner);
- the shared recap hook;
- the light status bar;
- type tokens for the small labels;
- Ask Coach's route and consent cases;
- the round Profile ring;
- deleting the removed cards and their conventions entries;
- the nits: no pull to refresh, the per-state hint, "· short", the board positions, the short state's cloud,
  updates at the time boundaries, the loading skeleton and the date format.
