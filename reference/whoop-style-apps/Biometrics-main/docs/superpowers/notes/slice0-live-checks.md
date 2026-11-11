# Slice 0 live checks

Slice 0 of the Stat Engine (`docs/superpowers/specs/2026-09-20-stat-engine-design.md`) ships
with three things that can only be settled against a real, connected Google Health account.
The backend code is written to hold either way (sessions are stored whole; the rollup key is
one function of `User.timezone`), but these must be run and recorded before Slice 1 builds
scores on top, and before the exit criteria are declared met.

## How to run the probe

Read-only: no DB writes, no Google state changes. It uses the stored access token as-is and
does not refresh it.

1. Make sure the test account is connected and has at least ~2 weeks of sleep, including
   ideally a nap or a split night.
2. Make sure `User.timezone` is the account's real zone (have the mobile client call
   `PUT /me/timezone`, or check the row). With the `UTC` default the "local" columns just
   repeat the UTC ones and check 1 cannot be answered.
3. If the stored token may be stale, let the token-refresh sweep run or open the app first
   (the probe prints a clear message on a 401).
4. From `backend/`, with `DATABASE_URL` and `TOKEN_ENCRYPTION_KEY` set for the environment
   that holds the account:

   ```
   npx ts-node scripts/probeSleepShape.ts <userId> --days 30
   ```

Output has three sections: every session (start, end, minutesAsleep, in-bed minutes, ratio,
local vs UTC end date, flags), sessions per local day, and civil-date basis hints (how often
Google's HRV / RESTING_HR / STEPS dates coincide with the session end date under each
candidate basis).

Save the raw output alongside this note (or paste it into the section below) so the result is
reproducible.

## Check 1: Google civil-date timezone basis

Question: are the civil dates in `dailyRollUp` (`civilStartTime`, STEPS/RESTING_HR) and
`daily-heart-rate-variability` (`.date`) computed in the user's local calendar, the device's,
or UTC?

Read from probe section 3. If "end date, user tz" has the highest HRV fit and HRV/RHR/STEPS
sit on the wake-up day, the local-end-date key is correct. If "end date, UTC" fits best, the
civil dates are UTC-based and SLEEP must be keyed with UTC, not `User.timezone` (a one-line
change in `civilDate.localCivilDate` callers; sessions and rollups are re-derivable).

Record:
- account timezone, window, number of nights
- fit counts for each of the four candidate bases
- verdict: local / UTC / other, and the evidence
- exit criterion (a): for a sample of days D, do HRV, RHR and the SLEEP rollup refer to the
  same night? (list 3 to 5 example days)

## Check 2: Sleep interval semantics

Question: is `endTime - startTime` time-in-bed (so `minutesAsleep / in-bed` is a sleep
efficiency), or something else?

Read from probe section 1 (`inBed`, `asleep/inBed`, `ASLEEP>INBED` flag). If `minutesAsleep`
is never above the interval and the ratio clusters around 0.85 to 0.95, the interval is
time-in-bed and `sleepEfficiency` (Slice 1.5) is meaningful. If `minutesAsleep` exceeds the
interval, or the ratio is near 1.0 for everything, the interval is not usable as time-in-bed.

Record:
- min / median / max of `asleep/inBed`
- any session where `minutesAsleep > inBed`
- verdict: interval is / is not time-in-bed

## Check 3: Multi-session nights

Question: how is a night with more than one `Sleep` object (nap, device-reported split
session) represented?

Read from probe section 2 (sessions per local day and the per-session layout of multi-session
days). Look for: naps as separate short objects on the same local day; one night split into
adjacent objects around a brief waking; or a single object regardless.

Record:
- histogram of sessions per local day
- for each multi-session day: start/end/minutesAsleep of each and whether they are a nap, a
  split night, or something else
- exit criterion (c): does the rollup for such a day equal the sum, and does it match what
  the Fitbit / Google Health app shows for that day?
- verdict: whether summing all sessions is the right daily total (the current design), or
  whether some sessions should be excluded

## Related open items from Slice 0

- Confirm how far back the existing backfill (30 days, `BACKFILL_WINDOW_DAYS`) reaches for
  this account, i.e. whether it covers 14 nights (bounds the circadian-consistency cold
  start).
- Whether Google exposes a dedicated resting-heart-rate data type (unchanged from the spec;
  not covered by the probe).
- Exit criterion (b) (re-running any fetch job in any window shape leaves totals unchanged)
  is covered by automated tests against mocked Google responses; re-confirm once against the
  real account by running the wipe-and-resync twice (`scripts/resyncSleep.ts --apply --user
  <id>`, dry run first) and diffing the SLEEP rows.

## Results

Run 2026-09-21 against one connected account (Fitbit-linked, "Google Fitbit Air", stored
timezone `America/New_York`, all records at UTC-4). Aggregates only: the raw probe output holds
real sleep times and is deliberately not committed.

### A bug the probe exposed: list responses are paginated

`dataPoints.list` returns one page per call and signals more with `nextPageToken`
(`pageToken` is the confirmed query parameter). A 30-day sleep window holds **25 sessions**
in two pages (12 + 13). The client ignored the token, so only the first page (12 sessions)
was ever stored and 13 nights were silently missing. Fixed in `health/client.ts`
(`listAllPages`, capped at 50 pages, tests added). The account was re-backfilled and now holds
26 sessions back to 2026-08-22 (the sleep window is widened by one day each side). Daily HRV
was a single page (25 of 25). `dailyRollUp` responses were not observed to paginate and are
unchanged.

### Check 1: Google civil-date timezone basis. Verdict: local, with one limit on the evidence

- Steps samples carry `civilStartTime` as the local wall clock beside `startUtcOffset`
  (an instant at 00:39Z is `20:39` on the previous civil date, offset `-14400s`). Google's civil
  times follow the record's own UTC offset, not UTC.
- For the one day with a complete comparison (09-18) the `dailyRollUp` total equals the
  local-day sum of the samples (594) and not the UTC-day sum (760). Other days' sample sums
  exceed the rollup (multiple sources overlap), so they cannot be compared exactly.
- HRV, resting HR and steps exist on the sleep END date for every night, and HRV exists only
  on nights that have a session: all three describe the wake-up day.
- **Limit:** this account sleeps roughly 01:00-10:00 local and wakes 09:00-13:00 local, so
  the UTC end date equals the local end date on every night. The probe's fit statistic
  (12/25 under both bases) therefore cannot separate "user timezone" from "UTC" using sleep
  alone. The steps evidence above is what separates them.
- Exit criterion (a): for every night, HRV, resting HR and the SLEEP rollup fall on the same
  civil date.
- **Refinement worth considering:** every sleep record carries `startUtcOffset` and
  `endUtcOffset`. Keying by the record's own `endUtcOffset` gives Google's exact local end date
  and would stay correct when the user travels, unlike `User.timezone`. Not implemented.

### Check 2: sleep interval semantics. Verdict: the interval IS time in bed

- `interval.endTime - interval.startTime` equals `summary.minutesInSleepPeriod` on 12 of 12
  sessions, and `minutesAsleep + minutesAwake` equals it on 12 of 12.
- `summary.minutesInSleepPeriod` and `summary.minutesAwake` exist (this corrects the earlier
  statement that only `minutesAsleep` was confirmed).
- `asleep / inBed` ranged 0.90 to 0.99 (median about 0.96); no session had `minutesAsleep`
  above the interval. The range is narrow, so efficiency z-scores are sensitive to small
  differences: worth remembering when weighting the Sleep Score.

### Check 3: multi-session nights. Verdict: not observed on this account

- 25 sessions in the window, one per local day, every one `metadata.mainSleep: true` and
  `type: STAGES`. No nap or split night exists here, so the multi-session representation is
  still unobserved.
- `metadata.mainSleep` exists and is the likely way a nap is marked; using it to pick the
  main session for onset time (instead of the longest by `minutesAsleep`) is an option.
- Sleep records are revised after creation (`updateTime` hours later than `createTime`),
  which supports the overwrite-on-match design.

### Related items

- Backfill reach: a 30-day window yields 25 nights for this account (data begins 2026-08-22).
  Several nights have no session, so missing nights are normal.
- **A dedicated resting heart rate type exists**: `daily-resting-heart-rate` (HTTP 200,
  `dailyRestingHeartRate.beatsPerMinute`, with `calculationMethod` `WITH_SLEEP` or
  `ONLY_WITH_AWAKE_DATA`). Over 30 overlapping days the dedicated value ran a median 12 bpm
  above the stored daily-minimum proxy (proxy day-to-day spread 3.99 bpm, dedicated 2.78), and
  the proxy showed single-reading artifacts (for example 39-41 bpm against a steady 51).
  Switching is a scoring decision and is not done; see the stat-engine spec.
- Exit criterion (b) on the real account (run the wipe-and-resync twice and diff) was not run.
