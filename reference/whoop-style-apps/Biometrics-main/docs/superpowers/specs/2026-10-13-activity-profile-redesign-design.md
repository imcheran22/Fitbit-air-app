# Activity and Profile redesign

Date: 2026-10-13 · Branch: `feature/profile-activity` · Status: owner's questions answered (§5), checked against the boards

The owner picked these boards (in `docs/design/home/project/`):

- **Activity:** A-2 "day almanac" (`Act2.dc.html`), plus A-1's month calendar and month stats (`Act1.dc.html`). "2026 so far" stays, and the month stats sit next to it.
- **Profile:** the S2 category hub (`S2.dc.html`), with the ID-2 passport card (`ID2.dc.html`) in place of S2's header. The passport also shows a check-in streak and the number of buddies.

The owner skipped the mockup step for these screens. Activity ships first and Profile second, as two commits or two PRs from this branch. All PRs are drafts.

## 1. Activity

The page is one scroll, in this order.

0. **Header** (A-2):
   - A pixel sky strip, with KIP waving in coral, from the `Kip` component in PR #61. If #61 hasn't merged by then, this branch takes its two files.
   - Beside them, the page title and a summary line: "Last 7 days · {steps} steps · {n} nights".
1. **This week** (A-2).
   - The section label "This week" sits above a hint line: "Tap a day · moon opens Sleep".
   - Column headers: Day, Recovery, and Sleep · steps.
   - Seven rows, newest first: today, then back six days. Each row shows:
     - the day: the weekday abbreviation over the day number;
     - recovery, as a weather icon plus the number, in red when it is under 40;
     - a sleep bar with hours, scaled to 9 hours;
     - a steps bar with the count, scaled to 15,000 steps.
   - Today's row is highlighted.
   - A day with no data shows a dash for that value.
   - **Two tap targets** in each row:
     - The row opens that day: the Recovery page on that date. There isn't a separate day page yet.
     - A moon icon by the sleep bar opens Sleep's night page for that night. It has its own label, "Open {day}'s night in Sleep". It only shows when there is a night to open.
   - The sources are what the page already loads: `fetchActivity`, `fetchSleep` and `fetchScores(…, 'RECOVERY')`.
2. **Month calendar** (A-1): the current `ActivityHeatmap`, restyled to the board.
   - Full-width **Steps / Sleep / Recovery** tabs, each with a colour dot. They replace today's pager.
   - The month header with ‹ and › arrows, and the Month, Year and YTD switch.
   - The day cells:
     - A cell with data is coloured by level, and carries a weather icon when the day has a recovery score.
     - A day with no data is a dim outline.
     - Today has a bright outline.
     - Each cell's accessibility label reads like the board's: "Oct 4: 14,102 steps, recovery 81 clear".
   - Two legends: Less → More, and "Recovery" with the four weather icons (clear, mostly clear, cloudy, stormy).
   - **The Recovery tab** is new; the boards only draw Steps.
     - Its cells are coloured by recovery band, using the band edges from the existing recovery copy. The banding itself is not changed.
3. **Month stats beside "2026 so far"**: two cards, side by side. Each stat card here goes two columns wide, not A-1's three, so it fits half a phone width.
   - **Month stats** (A-1): six stats for the visible month and metric.
     - Steps and Sleep: Total, Daily avg, Active days, Goal streak, Best day and Best date, from today's `rangeStats`.
     - Recovery: Average, Best day, Best date, Days scored, Clear days and Stormy days. Clear and stormy are the top and bottom bands. These come from a new `recoveryStats` beside `rangeStats`.
   - **2026 so far** (A-2): Total, Daily avg and Goal days for the year, with its own Steps/Sleep toggle.
     - Sleep's Total is hours slept, and its Goal days are nights that met the sleep goal.
     - The board's year grid is restored (owner decision, revised): "2026 so far" is one full-width card under the month stats, its figures over its year grid. It has no toggle of its own; it follows the calendar's Steps / Sleep / Recovery tab, and Recovery shows this year's scores in the score colours. The month stats card is full width, three tiles to a row. `/me/scores` serves up to 400 days so Recovery covers the year.
4. **Against your usual · 30d** (patterns): the current `UsualTiles`, restyled as A-2's rows. Each row has a colour dot, the name, a short change ("2 below", "+14 min", "steady") and the value. The rows have no sparkline. The Patterns and All trends links stay.

States:
- Each section loads, fails and retries on its own, using the `useSection` pattern from Sleep.
- While a section loads, it shows a skeleton.
- A failed section shows an inline error with a Retry `Button`.
- A first-time user with no data sees each section's empty line from the copy module.

## 2. Profile (Settings becomes the S2 hub)

The screen is reached the same way it is today. Its title becomes "Profile", in the pixel face that `PageTitle` already uses.

1. **Passport card** (ID-2), headed "Biometrics · passport":
   - **Band and frame:** both are coral.
   - **Photo:** KIP on the board's sky backdrop.
     - When there is an unseen recap, the photo carries today's **recap ring** (`StoryRing`), and tapping the photo opens the recap. This replaces today's avatar and ring.
     - Otherwise the photo does nothing. There is no colour picker yet.
   - **Number line:** "NO. KIP-XXXX". The four characters come from a hash of the user id, so they are stable but don't reveal the id.
   - **Fields,** in a two-column grid:
     - NAME: the display name.
     - HANDLE: @handle, from `fetchIdentity`.
     - HOME: the IANA time zone as the board shows it ("Europe/London"), from the existing time zone state.
     - JOINED: day, month and year in capitals ("14 MAR 2026").
     - CHECK-IN STREAK: for example "12 days". This one isn't on the board; the owner asked for it.
     - BUDDIES: for example "3". This one isn't on the board; the owner asked for it.
   - **Stamps:** "Stamps · badges earned". It shows up to five of the best earned badges, one per family at its top level, each with its short name (SLEEP, BEDTIME, STEPS, CHECK-IN, RECOVERY). Tapping a stamp opens that badge in Badges. With no badges, it shows the empty line from the copy module.
   - **Edit:** an Edit `Button` opens the existing handle and name editor.
   - **MRZ lines:** two lines, built as the board builds them, from the name, member code, join date (YYMMDD) and home. For example `P<KIP<<TUSHAR<<<…` and `KIP7Q4M<<260314<<EUROPE<LONDON<<`. They are hidden from screen readers and drawn only on the device.
   - Email isn't on the passport. It moves to the Sign-in screen.
2. **Badges row** (S2): "Badges", then "4 of 7 ›", then the seven badge icons, earned ones lit. It opens Badges.
3. **Eight category cards** in a two-column grid. Each has a pixel icon, a title and a one-line status built from data the app already reads:

   | Card | Icon | Status line (board example) |
   |---|---|---|
   | Health data | heart | "Google Health · synced 12 min ago" |
   | Time zone | globe | "Device · Europe/London" |
   | Notifications | bell | "Recaps, stickers, requests, messages · 4 of 6" |
   | Buddies & sharing | people | "@tushar · sharing 3 of 5 · 0 blocked" |
   | Chats | chat | "Read receipts on · status on" |
   | Your coach | coach | "Sage · pixel dots · short" |
   | AI Coach | memory | "Coach Memory · turn off" |
   | Sign-in | lock | "Apple, Google · 2 devices" (from `listAccounts` and `listSessions`, which the sign-in methods and devices screens already call) |

   Each card opens a new stack screen that holds the section the page has today, unchanged. This moves the sections; it doesn't rewrite them. If a status can't load, the card shows only its title.
4. **Account** (S2): Sign out and Delete account side by side, then the line "Deleting removes your account and all the data stored for it." Delete keeps today's confirm flow.

There is no KIP colour picker yet. The colour is fixed at coral, and the picker will be a later change with its own field on `User`.

### Data

`GET /me/buddies/me` gains three fields. Each is tested first (TDD) in `backend/tests`.
- `checkInStreak`: the run of the Social tab's **morning mood check-ins** (`CheckIn` rows).
  - It is counted on consecutive local days in the user's time zone, ending today.
  - If today has no check-in yet, the run ends yesterday, so the streak stays alive until the day is over.
  - A missed day resets it to 0.
  - The calculation is a new function, `checkInStreak(userId, now)`, in `backend/src/social/checkins.ts`.
- `buddyCount`: a count of the user's `BuddyPair` rows.
- `joinedOn`: the date of `User.createdAt` in the user's time zone, as YYYY-MM-DD.

Older backends don't send these fields, so the app treats a missing field as "—".

## 3. Rules that apply

- Every button is `components/ui/button.tsx` with `rounded-lg`; the category cards, the This week rows, the moon, the stamps and the KIP photo use `PressableScale` with entries in the button conventions test.
- Text uses only the A4 type tokens, plus `PageTitle` and `SectionLabel`.
- All strings live in the copy modules: `lib/activityCopy.ts` (new) and `lib/profileCopy.ts` (new).
- Nothing logs health values, dates, names or handles.
- Dates are parsed with the existing local-date helpers, never `new Date('YYYY-MM-DD')`.

## 4. Tests

- **Activity:**
  - The header summary line.
  - This week rows:
    - empty days;
    - red recovery under 40;
    - the row tap opening Recovery on that date;
    - the moon opening the right night;
    - no moon when there is no night.
  - Calendar tab switching, including the Recovery tab's colours and its stats.
  - The cell accessibility labels.
  - Month stats following the visible month.
  - The "2026 so far" totals for Steps and for Sleep.
  - Each section's error and retry, kept separate from the other sections.
- **Profile:**
  - The passport fields, including fallbacks when the streak, buddies or joined date is missing.
  - The MRZ lines.
  - The stamps opening their badge.
  - The recap ring on the photo.
  - Each category card's status line and the screen it opens.
  - The existing Settings tests, still passing against the moved sections.
- **Backend:**
  - The check-in streak in these cases:
    - with today checked in;
    - with today not yet checked in;
    - after a gap;
    - across a time zone date boundary;
    - when another user's check-ins don't count.
  - `buddyCount`.
  - `joinedOn` across a time zone date boundary.
- **Before each commit:** run the touched suites, the mobile typecheck (still at the baseline of 12) and the backend `tsc`.

## 5. Owner decisions (2026-10-13)

1. **Check-in streak:** counts the Social morning mood check-in, so it needs a new backend calculation.
2. **Recovery tab:** yes, the calendar has Steps, Sleep and Recovery.
3. **"2026 so far":** revised: one full-width card (figures over the year grid) that follows the calendar's tab, Recovery included.
4. **This week taps** (spec review): the row opens the day, and a moon icon opens Sleep.
5. **Recap entry:** the recap ring sits around KIP's photo on the passport.
6. **Streak and buddies:** two more passport fields.
7. **Recovery month stats:** Average, Best day, Best date, Days scored, Clear days and Stormy days.
