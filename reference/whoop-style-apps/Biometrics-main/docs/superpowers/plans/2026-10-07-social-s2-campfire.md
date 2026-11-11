# Social S2 — Campfire — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship build phase S2 of the Social tab: the camp banner opens a Campfire page (the scene of you and your
buddies around the fire, day/night, asleep/awake, fire strength, "Who's here"), "Say goodnight" (with a 10-minute
undo), camp notes (a short note in a speech bubble over its author's coach), and the camp's timeline kinds, story
frames and week-highlight items — plus the four items S1 deferred to S2 (one preloaded circle per Social read,
highlight retention and deleted-id purge, a Social refresh on a foreground buddy push, and two story-viewer fixes).

**Architecture:** Two new tables (`Goodnight`, `CampNote`) and one additive migration. The backend `social/` module
gains a pure clock module (`night.ts`), `goodnight.ts`, `campNotes.ts`, `camp.ts` (the `GET /me/camp` view and the
banner summary) and `sweep.ts`; every Social read now loads the viewer's circle ONCE (`loadCircle` in `circle.ts`:
buddies, members with their sharing switches, each member's check-in for their own today, and the last 48 h of
goodnights) and passes it to stories, timeline, highlights, the camp and `me`, so they all agree. Mobile adds the
camp API, a `GoodnightButton`, a `CampfireScreen` (pushed, no tab bar), new copy, and wires the banner, the evening
timeline, story frames and highlights.

**Tech Stack:** Express 5 + Prisma 6 (Postgres) + BullMQ backend (TypeScript, Jest + supertest); Expo 57 / React
Native app (NativeWind, React Navigation 7, Jest + React Native Testing Library).

**Spec:** `docs/superpowers/specs/2026-10-07-social-tab-design.md` (§4 item 1, §4.2 `goodnight` frames, §5 goodnight
and camp-note timeline items, §6 Campfire page, §7 `campfire` / `top_story` on-time goodnights / `also` joined + first
badge, §9 privacy, §12 S2, §13 tests). Builds on the S1 plan `docs/superpowers/plans/2026-10-07-social-s1.md` (merged,
PR #53) and its ledger `.superpowers/sdd/2026-10-07-social-s1/progress.md`.

## Global Constraints

- **Scope = S2 only** (spec §12): goodnight, the Campfire scene, fire strength, camp notes, "Who's here", the camp's
  timeline kinds / story frame / highlight items, the banner opening the Campfire, and the S1 deferrals (a)–(d). No
  conversations, messages, reactions, Chats notes, reports, presence, Requests move or `dm_message` (S3). Until S3,
  "Message camp" opens the existing `Buddies` screen (as S1's Chats button does) and tapping a buddy's coach opens
  their week (`BuddyWeek`).
- **Workspace (Task 0):** backend tests run **only** through `.superpowers/sdd/2026-10-07-social-s2-campfire/backend-jest.sh <paths>`
  — a copy of the S1 helper (test DB from `~/dev/biometrics-run/backend/.env`, Redis db 1, `cd` into this worktree's
  `backend/`). **Never run two invocations at once.** Never point anything at the dev `biometrics` DB.
- Mobile tests, from `mobile/`: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit <paths>`.
- **Typecheck baselines:** backend `node node_modules/.bin/tsc --noEmit` is clean; mobile
  `node node_modules/.bin/tsc --noEmit --types jest,node --pretty false | grep -c "error TS"` is **12** (the file list in
  `.superpowers/sdd/2026-10-07-social-s1/tsc-baseline.txt`). No task may add an error.
- **Commits:** plain `git commit -m "…"`, no `Co-Authored-By` trailer, no mention of Claude or AI. Never push.
- **Privacy (carried from S1 and spec §9):** a buddy's numbers only through `effectiveSharing` (switch on **and**
  current consent); badges only while the author effectively shares streaks; timeline, story frames and highlights
  carry no health numbers (counts of the circle's own actions — stickers, lit nights — are allowed); nothing about
  buddies reaches the AI coach; logs carry ids, event names and counts only (`JSON.stringify({ event, …ids })`).
  A goodnight and its on-time flag are self-reported and always shared with buddies, like the check-in (spec §6.4
  shows "asleep since 22:15 · on time" to the camp).
- **Camp notes are user free text (spec §9):** never logged — not even their length — never sent to the coach,
  never in a push, never in `/me/social`, the timeline, story frames or highlights. Only `GET /me/camp` returns note
  text, to the author and the author's **current** buddies. Unpair and block hide it at once (the circle is read
  live); account deletion removes it (FK cascade).
- **One circle per read (S1 ledger deferral a):** every Social read goes through `loadCircle(viewerId, now)` once and
  hands the `Circle` to every helper; no helper re-derives buddies, members, the viewer's day or the check-in lock.
- **Days and clocks:** a check-in and a story belong to the **author's** local day; the timeline is the **viewer's**
  local day; a goodnight belongs to its **evening** (`eveningDate`: one said 00:00–05:59 local belongs to the previous
  date); the scene's night/day follows the **viewer's** zone (night = 19:00–05:59: `isNight`, the stars, the banner's
  night line); the "Say goodnight" **button** has its own window in the **author's** zone, from
  `min(20:00, bedtime goal − 60 min)` (20:00 with no goal) to 05:59 (`isGoodnightOpen`); each member's "tonight"
  follows their **own** zone; a camp note clears at the next **06:00 in its author's zone**; a week is Monday–Sunday;
  a past night's fire is **frozen** — it counts the viewer and only the buddies paired with the viewer by that
  evening's 19:00 in the viewer's zone (`campOnEvening`, from `BuddyPair.createdAt` loaded with the circle).
- **Routes:** the Campfire routes are the spec's paths (§6.4): `GET /me/camp`, `POST|DELETE /me/camp/goodnight`,
  `PUT|DELETE /me/camp/note`, on `socialRouter`. GETs set `Cache-Control: private, no-store`. Errors use `BuddyError`
  / `buddyRoute`; every new code goes into `BUDDY_ERROR_STATUS` **and** gets its words in `mobile/src/lib/buddyCopy.ts`
  in the same task (`mobile/__tests__/lib/buddyCopy.test.ts` reads the backend codes and fails otherwise).
- **New tables** have no `userId` column: the owner column is `authorId`, the FK to `User` is `onDelete: Cascade`, and
  each model is registered in `backend/src/buddies/models.ts` (`SOCIAL_MODELS`, `SOCIAL_USER_COLUMNS`) and seeded in
  `backend/tests/buddies/deletion.test.ts`. Tests delete accounts through `deleteUserAccount`, never `prisma.user.delete`.
- **Migration:** one additive migration, `backend/prisma/migrations/20261010120000_social_campfire` (after
  `20261009130000`): CREATE TABLE / INDEX / FK only.
- **Older pieces keep working:** an S1 app on an S2 server already skips unknown timeline kinds, frame kinds,
  highlight types and top-story reasons (S1 `socialCopy` allow-lists); an S2 app on an S1 server sees no
  `camp.night` / `me.goodnight` (banner stays the static strip, no goodnight row) and a bare 404 from `GET /me/camp`
  ("The camp isn't open yet").
- **Plan rulings (where the spec is silent or loose; the owner may revert):**
  - Plan ruling: camp-note length is 1–40 Unicode code points after the display-name sanitiser (NFC; `Cc`, `Cf`,
    default-ignorable code points and line/paragraph separators removed — so no newlines; trimmed), with at least one
    visible character; no reserved-word check (spec §6.3). The app's counter counts code points of the trimmed draft.
  - Plan ruling: a camp note lives until the next 06:00 in its author's zone, or until its author's first check-in of
    a day at or after it — `saveCheckIn` deletes notes written at or before that day's first check-in, and reads hide
    them too — whichever is first. Expired rows are hidden at read time and deleted by the hourly social sweep.
  - Plan ruling: one note per author; Share replaces it (new text, new `createdAt`, new expiry); Clear deletes it.
    The share upsert sets `createdAt` to `now` on update too, on purpose: the clear-on-check-in rule compares the
    note's `createdAt` with the day's first check-in, so a replaced note must carry its own time.
  - Plan ruling (owner, Q3): a note keeps the rule above — it lasts until the next 06:00 or its author's first
    check-in, whichever is first.
  - Plan ruling: a note is visible to its author and the author's current buddies only, only on the Campfire page.
    Unpair or block hides it from that person at once (the row is the author's and still shows to their other
    buddies); account deletion deletes it.
  - Plan ruling: moderation in S2 = sanitise, trim, reject empty or invisible-only, cap at 40, and 20 shares per hour
    per author through the Buddies limiter, failing closed (`rate_limited` / `try_later`). Clearing your own note
    (`clearCampNote`, `DELETE /me/camp/note`) is never rate-limited and never fails closed: removing it always works.
    URLs and @handles are allowed in a note in S2 (no link or mention filter). Reporting a camp note is S3
    (`POST /me/reports`, spec §8.5/§9).
  - Plan ruling (owner, Q1): "Say goodnight" opens at `min(20:00, bedtime goal − 60 min)` in the author's zone (20:00
    with no goal; a goal before 12:00 counts as after midnight, so it opens at 20:00) and closes at 05:59;
    `goodnight_closed` (409) outside that window. The night scene (`isNight`, stars, the banner's night line) stays
    19:00–05:59; only the button's window moves. A second goodnight the same evening returns the first one unchanged;
    `DELETE` undoes only the goodnight of the current evening (`localDate = eveningDate(now)`, never yesterday's)
    within 10 minutes of its `at` (`undo_expired`, 409, after that; nothing to undo → 204). `onTime` is judged at
    minute resolution: at or before the bedtime goal + 15 min, or 23:00 with no goal; a goal before 12:00 counts as
    after midnight.
  - Plan ruling: goodnight copy — the button reads "Say goodnight"; once said, "Goodnight said" (", on time" when it
    was) with "Undo" for its 10 minutes; outside the window the Campfire shows "You can say goodnight from {h:mm a}"
    with the viewer's own opening time (e.g. "8:00 PM", "5:00 PM"), and a refused tap says "It's too early to say
    goodnight."; the evening timeline shows the same button under Today while the viewer's goodnight window is open
    (`camp.goodnightOpen` on `/me/social`). Every time on the Campfire is 12-hour ("asleep since 10:15 PM", the kicker
    "TUESDAY · 10:42 PM").
  - Final-review ruling (I-1): "Who's here" carries the whole note for asleep members too ("asleep since 10:15 PM ·
    on time · {note}"): their bubble is one truncated line, and this row is where a note is read in full (Q4).
  - Plan ruling: asleep = a goodnight for the member's current evening, or for last evening between 06:00 and 11:59
    local until they check in (spec: "said goodnight tonight and not yet checked in today").
  - Plan ruling: the camp banner reads "THE CAMP" + "{awake} awake · {asleep} asleep" at night (spec §4 item 1) and
    "{n} checked in" by day (S1); it opens the Campfire only when the server sends `camp.night` (an S2 server).
  - Plan ruling: `GET /me/camp` members carry `person` (the S1 DTO idiom) plus `mine`, `asleep`, `asleepSince`,
    `onTime`, `note` — instead of the spec's flat `id / displayName / coachId` — and the body adds `goodnight` (mine
    tonight, for Undo) and `goodnightOpen` / `goodnightOpensAt` (my own window, "HH:MM" local). Members are me first,
    then buddies by latest activity (check-in, goodnight or note); the app seats the first 8 around the fire (a fixed,
    tested layout with no overlap in the 340-px scene) and shows "+N" for the rest; "Who's here" lists everyone.
  - Plan ruling (owner, Q4): the bubble over a coach is one truncated line; the "Who's here" row shows the full note
    (no line limit).
  - Plan ruling: the fire card copy is "The fire grows as your circle gets to bed by their goal. Keep it lit." (the
    canvas' camp-badge promise is dropped, spec §6.2) plus "Nights lit this week: N".
  - Plan ruling (owner, Q2): tonight's fire is live (the current camp). "Nights lit this week" and the `campfire`
    highlight count each night with that night's camp: the viewer, plus the buddies whose `BuddyPair.createdAt` is at
    or before that evening's 19:00 in the viewer's zone; only their on-time goodnights count. Pairing today never
    unlights Monday.
  - Plan ruling: timeline `goodnight` items ("Sam said goodnight, on time") for everyone, no one-tap action;
    `camp_note` items ("Ben left a camp note", never the text) only for a live note written during its author's night
    (19:00–05:59 author-local) — the spec's "(night only)".
  - Plan ruling: a story's `goodnight` frame belongs to the author's local date of its `at` (a 00:30 goodnight opens
    the new day's story); it is never locked.
  - Plan ruling: highlights — `top_story` reason `on_time_every_night` (7 on-time goodnights, no streak gate),
    `campfire` (lit nights ≥ 2; "The fire was lit N nights"), `joined` (a buddy who paired with the viewer that week),
    `first_badge` (a member's first-ever badge earned that week; gated by streaks like every badge; not repeated when
    that person's badge is the top story); `joined` and `first_badge` capped at 3 each. Weeks cached before S2 keep
    their S1 items.
  - Plan ruling (amends S1's "never persist an empty week"): a week with no candidates is rebuilt on every read only
    until 24 h after it turned final (`highlightsReadyAt + 24 h`); from then on it is cached empty, so a quiet circle
    stops paying the ~6 build queries on every read.
  - Plan ruling: retention — `runSocialSweep` deletes week-highlight caches whose `weekStart` is more than 4 weeks old
    and expired camp notes; it runs on the existing hourly recap-sweep tick (no new scheduler), whose job may pin the
    sweep's clock with `data.now` (tests only; no test runs the sweep on the real clock). Account deletion
    deletes every highlight cache whose JSON names the user (`purgeSocialJsonMentions`, registered with the social
    tables in `buddies/models.ts`); reads keep gating every cached actor against the live circle.
  - Plan ruling: a buddy push that arrives while the app is open refreshes the Social store, only once the store has
    loaded (idle = signed out or not started).
  - Plan ruling: my own story opens with a `mine: true` route param, so it never shows reply stickers while the
    Social home is still loading; a story with no frames says "Nothing in this story yet." (not "anymore"), and the
    gone view keeps "This story isn't available anymore." for `not_buddies` / bare 404.

## Review Focus

1. **Midnight, sunrise and zones:** a goodnight at 00:30 belongs to the evening before; a coach is asleep by its
   owner's clock (an Auckland buddy's 18:30 is not night while it is 22:30 in Los Angeles); Ana (Auckland) says
   goodnight at her 22:00 NZDT (2026-10-08T09:00Z): at my Los Angeles 02:30 (night) she is asleep with `onTime`
   judged by her own goal, at my 13:00 (her 09:00) she is still asleep, and at my 16:00 (her noon) she is awake; at my
   05:30 the camp is still `night: true` while her tonight is already the next evening; a note posted at 22:30 in
   Los Angeles clears at 06:00 Los Angeles time, on a DST change too. Tests: Task 2 (clock), Task 4 (goodnight),
   Task 6 (camp), Task 7 (story frame).
2. **Unpair, block or account deletion during the evening:** the ex-buddy's coach, bubble, goodnight and camp-note
   timeline item vanish on the next read both ways; deletion removes their `Goodnight`/`CampNote` rows and every
   highlight cache naming them; a buddy paired today never changes a past night's fire. Tests: Task 6, Task 7,
   Task 9, Task 10.
3. **Hostile or odd note text:** whitespace only, zero-width characters, newlines, 41 code points, 40 emoji, a
   reserved word — trimmed/sanitised/refused as the sanitiser says, and the text never reaches a log line, `/me/social`
   or the timeline. Tests: Task 5, Task 7, Task 8.
4. **Goodnight edges:** with no goal 19:30 is closed (though the scene is night) and 20:00 open; an 18:00 goal opens
   at 17:00 and 18:05 is on time; a 23:00 goal opens at 20:00; 05:59 is open and 06:00 closed; a second tap keeps the
   first; undo at exactly 10 minutes works and one millisecond later is `undo_expired`; undo after 06:00 never
   removes last night's goodnight; a check-in in the morning wakes the coach, noon does too. Tests: Task 2, Task 4,
   Task 6.
5. **Old server / new app and the reverse:** no `camp.night` → static banner and no goodnight row; `GET /me/camp` bare
   404 → "not open yet"; a goodnight frame without `onTime` and an unknown highlight value are skipped. Tests: Task 11,
   Task 12, Task 13.

---

## File Structure

Backend (`backend/`):
- Create `prisma/migrations/20261010120000_social_campfire/migration.sql` — `Goodnight`, `CampNote`, a
  `WeeklyHighlights(weekStart)` index.
- Modify `prisma/schema.prisma` — the two models, `User` back-relations, the index.
- Modify `src/buddies/models.ts` — registry entries; `purgeSocialJsonMentions` (JSON-held ids).
- Modify `src/buddies/errors.ts` — `goodnight_closed`, `undo_expired`, `invalid_note`.
- Modify `src/buddies/identity.ts` — export `hasVisibleCharacter`.
- Modify `src/lib/rateLimit.ts` — `RATE_LIMITS.campNote`.
- Create `src/social/night.ts` — pure clock: night scene, goodnight window, evening date, on-time, next sunrise, fire
  segments, each evening's camp, lit nights.
- Modify `src/social/circle.ts` — `Circle` (with `pairedAt` and `viewerBedtimeGoal`), `loadCircle`, `buddyPairsOf`,
  `todayCheckInsOf`, `recentGoodnightsOf`, `GoodnightRow`.
- Modify `src/social/checkins.ts` — export `toCheckInDTO`; a check-in clears older camp notes.
- Modify `src/social/stories.ts`, `src/social/timeline.ts`, `src/social/highlights.ts`, `src/social/home.ts` — take the
  circle; goodnight frames; goodnight / camp-note items; S2 highlight items; banner summary and `me.goodnight`.
- Create `src/social/goodnight.ts` — say / undo goodnight.
- Create `src/social/campNotes.ts` — validate, share, clear, `noteIsLive`.
- Create `src/social/camp.ts` — `sleepStates`, `campSummaryFor`, `getCamp`.
- Create `src/social/sweep.ts` — `runSocialSweep`.
- Modify `src/social/routes.ts` — the five camp routes.
- Modify `src/sync/worker.ts` — the social sweep on the recap-sweep tick.
- Modify `src/users/deletion.ts` — call `purgeSocialJsonMentions`.
- Modify `scripts/seedSocial.ts` — the buddy's camp note and goodnight.
- Tests: create `tests/social/{helpers,campfireSchema,night,homeQueries,goodnight,campNotes,camp,campTimeline,homeCamp,highlightsCamp,retention}.test.ts`
  (`helpers.ts` is not a test); modify `tests/buddies/deletion.test.ts`, `tests/social/home.test.ts`,
  `tests/social/highlights.test.ts` (one S1 test's clock, Task 3), `tests/recap/worker.test.ts` (mocks the social
  sweep, Task 10), `tests/scripts/seedSocial.test.ts`.

Mobile (`mobile/`):
- Modify `src/api/social.ts` — S2 types; `fetchCamp`, `sayGoodnight`, `undoGoodnight`, `saveCampNote`, `clearCampNote`.
- Modify `src/lib/socialCopy.ts` — S2 kinds and wording; camp helpers.
- Modify `src/lib/buddyCopy.ts` — the three new error messages.
- Modify `src/components/social/TimelineList.tsx` (dot colours), `CampBanner.tsx` (night line, opens the camp),
  `SocialStoryFrame.tsx` (goodnight frame).
- Create `src/components/social/GoodnightButton.tsx`, `src/screens/CampfireScreen.tsx`.
- Modify `src/screens/SocialScreen.tsx`, `src/screens/SocialStoryScreen.tsx`, `src/navigation/RootNavigator.tsx`,
  `src/notifications/handler.ts`.
- Tests: create `__tests__/api/camp.test.ts`, `__tests__/lib/campCopy.test.ts`, `__tests__/components/CampBanner.test.tsx`,
  `__tests__/components/GoodnightButton.test.tsx`, `__tests__/screens/SocialScreenCampfire.test.tsx`,
  `__tests__/screens/CampfireScreen.test.tsx`, `__tests__/screens/SocialStoryCampfire.test.tsx`,
  `__tests__/notifications/handlerForeground.test.ts`; modify `__tests__/screens/SocialStoryScreen.test.tsx`.

---

### Task 0: S2 workspace

**Files:** none in git (`.superpowers/` is ignored).

**Interfaces:**
- Produces: `.superpowers/sdd/2026-10-07-social-s2-campfire/backend-jest.sh` — every later backend step runs it.

- [ ] **Step 1: Copy the S1 test helper into the S2 workspace**

```bash
mkdir -p .superpowers/sdd/2026-10-07-social-s2-campfire
cp .superpowers/sdd/2026-10-07-social-s1/backend-jest.sh .superpowers/sdd/2026-10-07-social-s2-campfire/backend-jest.sh
grep -n "^cd " .superpowers/sdd/2026-10-07-social-s2-campfire/backend-jest.sh
```

Expected: `cd /Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/social-tab/backend` (the same worktree, so
the copy needs no edit).

- [ ] **Step 2: Check dependencies**

Run: `ls backend/node_modules/.bin/prisma mobile/node_modules/.bin/jest`
Expected: both paths print. If either is missing, run `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH npm ci`
in that folder, and in `backend/` also `DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder npx prisma generate`.

- [ ] **Step 3: Confirm the baselines**

Run: `bash .superpowers/sdd/2026-10-07-social-s2-campfire/backend-jest.sh tests/social` — Expected: PASS.
Run (from `mobile/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/tsc --noEmit --types jest,node --pretty false | grep -c "error TS"`
— Expected: `12`.

- [ ] **Step 4: Start the ledger**

Write `.superpowers/sdd/2026-10-07-social-s2-campfire/progress.md` with the plan path, the branch
(`feature/social-campfire`, base `b3cd4cf`) and the two baselines. Nothing to commit.

---

### Task 1: Campfire tables and migration

**Files:**
- Modify: `backend/prisma/schema.prisma` (two models; `User` back-relations; `WeeklyHighlights` index)
- Create: `backend/prisma/migrations/20261010120000_social_campfire/migration.sql`
- Modify: `backend/src/buddies/models.ts`
- Test: create `backend/tests/social/campfireSchema.test.ts`; modify `backend/tests/buddies/deletion.test.ts`

**Interfaces:**
- Consumes: `deleteUserAccount(userId, deps)` (`src/users/deletion.ts`); `buddyUser()` (`tests/buddies/helpers.ts`).
- Produces: Prisma models `Goodnight { id, authorId, localDate @db.Date, at, onTime }` (unique `authorId_localDate`)
  and `CampNote { authorId @id, text, createdAt, expiresAt }`; registry entries `Goodnight: ['authorId']`,
  `CampNote: ['authorId']`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/social/campfireSchema.test.ts`:

```ts
import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { deleteUserAccount } from '../../src/users/deletion';
import { buddyUser } from '../buddies/helpers';

jest.mock('../../src/health/client');

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

const day = (d: string) => civilDateToUtcMidnight(d);
// The same no-op Google deps as tests/buddies/deletion.test.ts.
const noop = { deleteSubscription: async () => {}, revokeToken: async () => {}, log: () => {} };

it('stores one goodnight per author per evening', async () => {
  const a = await buddyUser();
  const at = new Date('2026-10-08T05:30:00Z');
  await prisma.goodnight.create({ data: { authorId: a.id, localDate: day('2026-10-07'), at, onTime: true } });
  await expect(prisma.goodnight.create({ data: { authorId: a.id, localDate: day('2026-10-07'), at, onTime: false } })).rejects.toMatchObject({ code: 'P2002' });
  await prisma.goodnight.create({ data: { authorId: a.id, localDate: day('2026-10-08'), at: new Date('2026-10-09T05:30:00Z'), onTime: true } });
  expect(await prisma.goodnight.count({ where: { authorId: a.id } })).toBe(2);
});

it('keeps one camp note per author', async () => {
  const a = await buddyUser();
  const expiresAt = new Date('2026-10-08T13:00:00Z');
  await prisma.campNote.create({ data: { authorId: a.id, text: 'bed soon', expiresAt } });
  await expect(prisma.campNote.create({ data: { authorId: a.id, text: 'again', expiresAt } })).rejects.toMatchObject({ code: 'P2002' });
});

it("deleting the account removes the author's goodnights and camp note", async () => {
  const a = await buddyUser();
  const b = await buddyUser();
  await prisma.goodnight.create({ data: { authorId: a.id, localDate: day('2026-10-07'), at: new Date('2026-10-08T05:30:00Z'), onTime: true } });
  await prisma.campNote.create({ data: { authorId: a.id, text: 'night all', expiresAt: new Date('2026-10-08T13:00:00Z') } });
  await prisma.campNote.create({ data: { authorId: b.id, text: 'still here', expiresAt: new Date('2026-10-08T13:00:00Z') } });
  await deleteUserAccount(a.id, noop);
  expect(await prisma.goodnight.count({ where: { authorId: a.id } })).toBe(0);
  expect(await prisma.campNote.count({ where: { authorId: a.id } })).toBe(0);
  expect(await prisma.campNote.count({ where: { authorId: b.id } })).toBe(1);
});
```

`backend/tests/buddies/deletion.test.ts` — its registry test introspects the schema, so it fails until the two models
are registered. In `seedSocial(a, b)`, inside the existing `for (const [me, other] of [[a, b], [b, a]] as const)`
loop, append after the `weeklyHighlights.create` line:

```ts
    // Social S2 tables (Campfire).
    await prisma.goodnight.create({ data: { authorId: me, localDate: today, at: new Date('2026-10-07T22:00:00Z'), onTime: true } });
    await prisma.campNote.create({ data: { authorId: me, text: 'bed soon', expiresAt: new Date('2026-10-08T06:00:00Z') } });
```

- [ ] **Step 2: Run them to see them fail**

Run: `bash .superpowers/sdd/2026-10-07-social-s2-campfire/backend-jest.sh tests/social/campfireSchema.test.ts tests/buddies/deletion.test.ts`
Expected: FAIL — `prisma.goodnight` / `prisma.campNote` are undefined (TypeScript: "Property 'goodnight' does not exist").

- [ ] **Step 3: Add the models**

In `backend/prisma/schema.prisma`, add to `model User` after `weeklyHighlights WeeklyHighlights[] @relation("WeeklyHighlightsViewer")`:

```prisma
  goodnights            Goodnight[]         @relation("GoodnightAuthor")
  campNote              CampNote?           @relation("CampNoteAuthor")
```

In `model WeeklyHighlights`, after `@@id([viewerId, weekStart])`, add:

```prisma
  @@index([weekStart])
```

Append at the end of the file:

```prisma
// ---- Social tab S2: Campfire (spec docs/superpowers/specs/2026-10-07-social-tab-design.md §6) ----

/// "Say goodnight": one per author per evening. `localDate` is the evening's date — a goodnight said between 00:00 and
/// 05:59 local belongs to the previous date (spec §6.1). Self-reported and always shared with buddies, like CheckIn.
model Goodnight {
  id        String   @id @default(uuid())
  authorId  String
  author    User     @relation("GoodnightAuthor", fields: [authorId], references: [id], onDelete: Cascade)
  localDate DateTime @db.Date
  at        DateTime
  /// at <= bedtime goal + 15 min, or <= 23:00 local with no goal (spec §6.1), judged when it was said.
  onTime    Boolean

  @@unique([authorId, localDate])
  @@index([at])
}

/// A camp note (spec §6.3): one per author, 1-40 code points of user free text. Never logged, never to the coach;
/// only GET /me/camp returns it, to the author and their current buddies. Clears at expiresAt (the next 06:00 in the
/// author's zone) or at the author's next check-in.
model CampNote {
  authorId  String   @id
  author    User     @relation("CampNoteAuthor", fields: [authorId], references: [id], onDelete: Cascade)
  text      String
  createdAt DateTime @default(now())
  expiresAt DateTime

  @@index([expiresAt])
}
```

`backend/prisma/migrations/20261010120000_social_campfire/migration.sql`:

```sql
-- Social tab S2 Campfire (spec docs/superpowers/specs/2026-10-07-social-tab-design.md §6). Additive only.

-- CreateTable
CREATE TABLE "Goodnight" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "localDate" DATE NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "onTime" BOOLEAN NOT NULL,
    CONSTRAINT "Goodnight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampNote" (
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CampNote_pkey" PRIMARY KEY ("authorId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Goodnight_authorId_localDate_key" ON "Goodnight"("authorId", "localDate");
CREATE INDEX "Goodnight_at_idx" ON "Goodnight"("at");
CREATE INDEX "CampNote_expiresAt_idx" ON "CampNote"("expiresAt");
CREATE INDEX "WeeklyHighlights_weekStart_idx" ON "WeeklyHighlights"("weekStart");

-- AddForeignKey
ALTER TABLE "Goodnight" ADD CONSTRAINT "Goodnight_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampNote" ADD CONSTRAINT "CampNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Regenerate the client (from `backend/`):
`PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder npx prisma generate`

- [ ] **Step 4: Register the tables**

In `backend/src/buddies/models.ts`, add `'Goodnight',` and `'CampNote',` after `'WeeklyHighlights',` in
`SOCIAL_MODELS`, and after `WeeklyHighlights: ['viewerId'],` in `SOCIAL_USER_COLUMNS`:

```ts
  Goodnight: ['authorId'],
  CampNote: ['authorId'],
```

Change the header's first line to `// The social tables (Buddies spec §3, Social tab S1 and S2). None has a \`userId\`, so the`.

- [ ] **Step 5: Run the tests**

Run: `bash .superpowers/sdd/2026-10-07-social-s2-campfire/backend-jest.sh tests/social/campfireSchema.test.ts tests/buddies/deletion.test.ts tests/users/deletion.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma backend/src/buddies/models.ts backend/tests/social/campfireSchema.test.ts backend/tests/buddies/deletion.test.ts
git commit -m "feat(social): goodnight and camp note tables"
```

---

### Task 2: The camp's clock (pure)

**Files:**
- Create: `backend/src/social/night.ts`
- Test: `backend/tests/social/night.test.ts`

**Interfaces:**
- Consumes: `isValidTimeZone`, `localCivilDateOrUtc`, `localClockTime` (`src/biometrics/civilDate.ts`);
  `localHourOrUtc` (`src/recap/periods.ts`); `shiftDate` (`src/scoring/dates.ts`).
- Produces (`night.ts`): `NIGHT_START_HOUR = 19`, `SUNRISE_HOUR = 6`, `NOON_HOUR = 12`,
  `GOODNIGHT_OPEN_MINUTES = 1200` (20:00), `GOODNIGHT_LEAD_MINUTES = 60`, `FIRE_SEGMENTS = 5`, `LIT_NIGHT_SEGMENTS = 3`,
  `zoneOrUtc(tz): string`, `isNight(at: Date, tz): boolean` (the scene, 19:00–05:59),
  `goodnightOpensAt(bedtimeGoal: string | null): string` ("HH:MM", `min(20:00, goal − 60 min)`),
  `isGoodnightOpen(at: Date, tz, bedtimeGoal: string | null): boolean` (the button, opening time–05:59),
  `eveningDate(at: Date, tz): string` (YYYY-MM-DD), `isOnTime(at: Date, tz, bedtimeGoal: string | null): boolean`,
  `localInstant(date: string, hhmm: string, tz): Date`, `nextSunrise(now: Date, tz): Date`,
  `fireSegments(lit: number, of: number): number`,
  `campOnEvening(date: string, viewerId: string, pairedAt: ReadonlyMap<string, Date>, tz): Set<string>`,
  `interface OnTimeNight { authorId: string; date: string }`,
  `countLitNights(onTime: readonly OnTimeNight[], campOn: (date: string) => ReadonlySet<string>): number`.

- [ ] **Step 1: Write the failing test**

`backend/tests/social/night.test.ts`:

```ts
import {
  campOnEvening, countLitNights, eveningDate, fireSegments, goodnightOpensAt, isGoodnightOpen, isNight, isOnTime,
  localInstant, nextSunrise, zoneOrUtc,
} from '../../src/social/night';

// Pure functions, but run through the backend helper like every backend suite (its globalSetup needs the test DB).
const LA = 'America/Los_Angeles'; // PDT = UTC−7 in October
const at = (iso: string) => new Date(iso);

it('night is 19:00–05:59 in the given zone; an unknown zone reads as UTC', () => {
  expect(isNight(at('2026-10-08T01:59:00Z'), LA)).toBe(false); // 18:59
  expect(isNight(at('2026-10-08T02:00:00Z'), LA)).toBe(true); // 19:00
  expect(isNight(at('2026-10-08T12:59:00Z'), LA)).toBe(true); // 05:59
  expect(isNight(at('2026-10-08T13:00:00Z'), LA)).toBe(false); // 06:00
  expect(isNight(at('2026-10-07T12:00:00Z'), 'Not/AZone')).toBe(false);
  expect(isNight(at('2026-10-07T20:00:00Z'), 'Not/AZone')).toBe(true);
  expect([zoneOrUtc(LA), zoneOrUtc('Not/AZone')]).toEqual([LA, 'UTC']);
});

it('"Say goodnight" opens at min(20:00, goal − 60 min) and closes at 05:59; the scene keeps 19:00', () => {
  expect(goodnightOpensAt(null)).toBe('20:00');
  expect(goodnightOpensAt('18:00')).toBe('17:00');
  expect(goodnightOpensAt('20:30')).toBe('19:30');
  expect(goodnightOpensAt('23:00')).toBe('20:00');
  expect(goodnightOpensAt('00:30')).toBe('20:00'); // a goal before noon is after midnight
  expect(goodnightOpensAt('12:00')).toBe('11:00'); // the earliest possible opening
  expect(goodnightOpensAt('nonsense')).toBe('20:00'); // a bad goal reads as none
  // An 18:00 goal opens at 17:00 (LA, PDT).
  expect(isGoodnightOpen(at('2026-10-07T23:59:00Z'), LA, '18:00')).toBe(false); // 16:59
  expect(isGoodnightOpen(at('2026-10-08T00:00:00Z'), LA, '18:00')).toBe(true); // 17:00
  // No goal: 19:30 is night for the scene, but goodnight waits for 20:00.
  expect(isNight(at('2026-10-08T02:30:00Z'), LA)).toBe(true); // 19:30
  expect(isGoodnightOpen(at('2026-10-08T02:30:00Z'), LA, null)).toBe(false); // 19:30
  expect(isGoodnightOpen(at('2026-10-08T03:00:00Z'), LA, null)).toBe(true); // 20:00
  // A 23:00 goal opens at 20:00 like no goal; every window closes at 06:00.
  expect(isGoodnightOpen(at('2026-10-08T02:59:00Z'), LA, '23:00')).toBe(false); // 19:59
  expect(isGoodnightOpen(at('2026-10-08T12:59:00Z'), LA, '23:00')).toBe(true); // 05:59
  expect(isGoodnightOpen(at('2026-10-08T13:00:00Z'), LA, '18:00')).toBe(false); // 06:00
});

it('a goodnight between 00:00 and 05:59 belongs to the evening before', () => {
  expect(eveningDate(at('2026-10-08T05:30:00Z'), LA)).toBe('2026-10-07'); // 22:30 Oct 7
  expect(eveningDate(at('2026-10-08T07:30:00Z'), LA)).toBe('2026-10-07'); // 00:30 Oct 8
  expect(eveningDate(at('2026-10-08T12:59:00Z'), LA)).toBe('2026-10-07'); // 05:59 Oct 8
  expect(eveningDate(at('2026-10-08T13:00:00Z'), LA)).toBe('2026-10-08'); // 06:00 Oct 8
});

it('on time = at or before the bedtime goal + 15 min, or 23:00 with no goal, across midnight', () => {
  expect(isOnTime(at('2026-10-08T05:45:00Z'), LA, '22:30')).toBe(true); // 22:45
  expect(isOnTime(at('2026-10-08T05:46:00Z'), LA, '22:30')).toBe(false); // 22:46
  expect(isOnTime(at('2026-10-08T06:00:00Z'), LA, null)).toBe(true); // 23:00
  expect(isOnTime(at('2026-10-08T06:01:00Z'), LA, null)).toBe(false); // 23:01
  expect(isOnTime(at('2026-10-08T07:30:00Z'), LA, null)).toBe(false); // 00:30 is after 23:00
  expect(isOnTime(at('2026-10-08T07:40:00Z'), LA, '00:30')).toBe(true); // 00:40 <= 00:45: the goal wraps midnight
  expect(isOnTime(at('2026-10-08T05:00:00Z'), LA, '00:30')).toBe(true); // 22:00, before a past-midnight goal
  expect(isOnTime(at('2026-10-08T07:30:00Z'), LA, '23:45')).toBe(false); // 00:30 > 24:00
  expect(isOnTime(at('2026-10-08T05:45:00Z'), LA, 'nonsense')).toBe(true); // a bad goal reads as none: 22:45 <= 23:00
});

it('a camp note clears at the next 06:00 in its zone, DST included', () => {
  expect(nextSunrise(at('2026-10-08T05:30:00Z'), LA).toISOString()).toBe('2026-10-08T13:00:00.000Z'); // 22:30 → 06:00 PDT
  expect(nextSunrise(at('2026-10-08T10:00:00Z'), LA).toISOString()).toBe('2026-10-08T13:00:00.000Z'); // 03:00 → that morning
  expect(nextSunrise(at('2026-10-08T13:00:00Z'), LA).toISOString()).toBe('2026-10-09T13:00:00.000Z'); // 06:00 sharp → tomorrow
  expect(nextSunrise(at('2026-11-01T05:00:00Z'), LA).toISOString()).toBe('2026-11-01T14:00:00.000Z'); // 22:00 PDT Oct 31 → 06:00 PST
  expect(nextSunrise(at('2026-10-07T20:00:00Z'), 'Pacific/Auckland').toISOString()).toBe('2026-10-08T17:00:00.000Z'); // 09:00 NZDT → 06:00 next day
  expect(localInstant('2026-10-08', '06:00', 'Not/AZone').toISOString()).toBe('2026-10-08T06:00:00.000Z');
});

it('the fire has five segments by the share of the camp in bed on time', () => {
  expect([0, 1, 2, 3, 4, 5].map((lit) => fireSegments(lit, 5))).toEqual([0, 1, 2, 3, 4, 5]);
  // 10% and 20% → 1, 30% → 2, 80% → 4, 90% → 5.
  expect([fireSegments(1, 10), fireSegments(2, 10), fireSegments(3, 10), fireSegments(8, 10), fireSegments(9, 10)]).toEqual([1, 1, 2, 4, 5]);
  expect(fireSegments(3, 0)).toBe(0);
});

it("an evening's camp is the viewer and the buddies paired by its 19:00 in the viewer's zone", () => {
  // LA Mon Oct 5, 19:00 PDT = 2026-10-06T02:00Z.
  const pairedAt = new Map([['a', at('2026-10-06T01:59:00Z')], ['b', at('2026-10-06T02:00:00Z')], ['c', at('2026-10-06T02:01:00Z')]]);
  expect([...campOnEvening('2026-10-05', 'me', pairedAt, LA)].sort()).toEqual(['a', 'b', 'me']);
  expect([...campOnEvening('2026-10-06', 'me', pairedAt, LA)].sort()).toEqual(['a', 'b', 'c', 'me']);
  expect([...campOnEvening('2026-10-04', 'me', pairedAt, LA)]).toEqual(['me']); // the viewer always counts
});

it("counts the nights whose fire reached 3 segments, each with that night's camp", () => {
  const four = () => new Set(['me', 'a', 'b', 'c']);
  const gn = (date: string, ...ids: string[]) => ids.map((authorId) => ({ authorId, date }));
  // A camp of 4: Mon 3 on time (4 segments), Tue 1 (2), Wed 2 (3).
  const week = [...gn('2026-10-05', 'me', 'a', 'b'), ...gn('2026-10-06', 'a'), ...gn('2026-10-07', 'a', 'c')];
  expect(countLitNights(week, four)).toBe(2);
  expect(countLitNights([], four)).toBe(0);
  // Monday and Tuesday's camp was me + a (b and c paired on Wednesday): Monday is 2 of 2 (b's goodnight that night is
  // ignored) and Tuesday is a alone, 1 of 2 (3 segments, lit). Counted against all four, Tuesday would be 1 of 4
  // (2 segments, unlit).
  const campOn = (date: string) => (date === '2026-10-05' || date === '2026-10-06' ? new Set(['me', 'a']) : four());
  expect(countLitNights([...gn('2026-10-05', 'me', 'a', 'b'), ...gn('2026-10-06', 'a')], campOn)).toBe(2);
  expect(countLitNights([...gn('2026-10-05', 'me', 'a', 'b'), ...gn('2026-10-06', 'a')], four)).toBe(1);
  // A night's on-time count is per person: a duplicate row never counts twice.
  expect(countLitNights(gn('2026-10-05', 'a', 'a', 'a'), four)).toBe(0);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bash .superpowers/sdd/2026-10-07-social-s2-campfire/backend-jest.sh tests/social/night.test.ts`
Expected: FAIL — "Cannot find module '../../src/social/night'".

- [ ] **Step 3: Write `night.ts`**

`backend/src/social/night.ts`:

```ts
// The camp's clock (spec 2026-10-07 social §6). The night SCENE is 19:00–05:59 local (stars, the banner's night
// line). The "Say goodnight" BUTTON has its own window (owner ruling Q1): from min(20:00, bedtime goal − 60 min) —
// 20:00 with no goal — to 05:59 in the author's zone. A goodnight said between 00:00 and 05:59 belongs to the previous
// evening. On time = at or before the bedtime goal + 15 min, or 23:00 local with no goal; a goal before noon is after
// midnight. A camp note clears at the next 06:00 in its author's zone. The fire has five segments by the share of the
// camp in bed on time; a night is "lit" at three, and a past night is frozen: its camp is the viewer plus the buddies
// paired by that evening's 19:00 (owner ruling Q2). Pure functions, no I/O. An unknown zone reads as UTC everywhere,
// as localCivilDateOrUtc does.

import { isValidTimeZone, localCivilDateOrUtc, localClockTime } from '../biometrics/civilDate';
import { localHourOrUtc } from '../recap/periods';
import { shiftDate } from '../scoring/dates';

export const NIGHT_START_HOUR = 19;
export const SUNRISE_HOUR = 6;
/** A bedtime goal before noon is after midnight; a coach asleep last night wakes by noon. */
export const NOON_HOUR = 12;
/** "Say goodnight" opens at 20:00 at the latest… */
export const GOODNIGHT_OPEN_MINUTES = 20 * 60;
/** …or this long before an earlier bedtime goal. */
export const GOODNIGHT_LEAD_MINUTES = 60;
export const ON_TIME_GRACE_MINUTES = 15;
/** 23:00, the on-time line when no bedtime goal is set (spec §6.1). */
export const DEFAULT_ON_TIME_MINUTES = 23 * 60;
export const FIRE_SEGMENTS = 5;
/** "Nights lit this week" counts nights whose fire reached this many segments (spec §6.2). */
export const LIT_NIGHT_SEGMENTS = 3;

const MINUTES_PER_DAY = 24 * 60;
const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const zoneOrUtc = (timeZone: string): string => (isValidTimeZone(timeZone) ? timeZone : 'UTC');

export function isNight(at: Date, timeZone: string): boolean {
  const hour = localHourOrUtc(at, timeZone);
  return hour >= NIGHT_START_HOUR || hour < SUNRISE_HOUR;
}

/** The evening a moment belongs to: its local date, or the day before between 00:00 and 05:59. */
export function eveningDate(at: Date, timeZone: string): string {
  const date = localCivilDateOrUtc(at, timeZone);
  return localHourOrUtc(at, timeZone) < SUNRISE_HOUR ? shiftDate(date, -1) : date;
}

/** Minutes after the evening's midnight; a clock before `nextDayBefore` o'clock counts as the next day (00:30 → 24:30). */
function eveningMinutes(hour: number, minute: number, nextDayBefore: number): number {
  return hour * 60 + minute + (hour < nextDayBefore ? MINUTES_PER_DAY : 0);
}

/** The local wall clock at an instant, as [hour, minute]. */
function clockOf(at: Date, timeZone: string): [number, number] {
  return localClockTime(at, null, zoneOrUtc(timeZone)).split(':').map(Number) as [number, number];
}

/** A bedtime goal ("HH:MM") in evening minutes — a goal before noon is after midnight (00:30 → 24:30) — or null for none or a bad one. */
function goalMinutes(bedtimeGoal: string | null): number | null {
  const goal = bedtimeGoal ? HHMM_RE.exec(bedtimeGoal) : null;
  return goal ? eveningMinutes(Number(goal[1]), Number(goal[2]), NOON_HOUR) : null;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** When "Say goodnight" opens, "HH:MM" local: min(20:00, goal − 60 min); 20:00 with no goal. Never before 11:00 (a 12:00 goal). */
export function goodnightOpensAt(bedtimeGoal: string | null): string {
  const goal = goalMinutes(bedtimeGoal);
  const opens = goal === null ? GOODNIGHT_OPEN_MINUTES : Math.min(GOODNIGHT_OPEN_MINUTES, goal - GOODNIGHT_LEAD_MINUTES);
  return `${pad2(Math.floor(opens / 60))}:${pad2(opens % 60)}`;
}

/** Whether "Say goodnight" is open in the author's zone: from goodnightOpensAt until 05:59. */
export function isGoodnightOpen(at: Date, timeZone: string, bedtimeGoal: string | null): boolean {
  const [hour, minute] = clockOf(at, timeZone);
  if (hour < SUNRISE_HOUR) return true;
  const [openHour, openMinute] = goodnightOpensAt(bedtimeGoal).split(':').map(Number) as [number, number];
  return hour * 60 + minute >= openHour * 60 + openMinute;
}

export function isOnTime(at: Date, timeZone: string, bedtimeGoal: string | null): boolean {
  const [hour, minute] = clockOf(at, timeZone);
  const atMinutes = eveningMinutes(hour, minute, SUNRISE_HOUR);
  const goal = goalMinutes(bedtimeGoal);
  if (goal === null) return atMinutes <= DEFAULT_ON_TIME_MINUTES;
  return atMinutes <= goal + ON_TIME_GRACE_MINUTES;
}

/** The zone's offset from UTC at an instant, in ms (whole minutes). */
function offsetMs(instant: number, zone: string): number {
  const minute = new Date(Math.floor(instant / 60_000) * 60_000);
  return Date.parse(`${localCivilDateOrUtc(minute, zone)}T${localClockTime(minute, null, zone)}:00Z`) - minute.getTime();
}

/** The instant of a wall-clock time on a civil date in a zone. The offset is read again at the first guess, so a DST change in between is honoured. */
export function localInstant(date: string, hhmm: string, timeZone: string): Date {
  const zone = zoneOrUtc(timeZone);
  const wall = Date.parse(`${date}T${hhmm}:00Z`);
  const guess = wall - offsetMs(wall, zone);
  return new Date(wall - offsetMs(guess, zone));
}

/** The next 06:00 in the zone after `now` (today's when it is still before 06:00). */
export function nextSunrise(now: Date, timeZone: string): Date {
  const zone = zoneOrUtc(timeZone);
  const today = localCivilDateOrUtc(now, zone);
  return localInstant(localHourOrUtc(now, zone) < SUNRISE_HOUR ? today : shiftDate(today, 1), '06:00', zone);
}

/** 0 with nobody in bed on time; otherwise 0–20% → 1 … 81–100% → 5 (spec §6.2). Integer maths, so 3 of 5 is exactly 3. */
export function fireSegments(lit: number, of: number): number {
  if (lit <= 0 || of <= 0) return 0;
  return Math.min(FIRE_SEGMENTS, Math.ceil((lit * FIRE_SEGMENTS) / of));
}

/**
 * Who counts toward an evening's fire (owner ruling Q2): the viewer always, and each buddy whose pair with the viewer
 * was made at or before that evening's 19:00 in the viewer's zone. So a past night is frozen: pairing today never
 * changes Monday.
 */
export function campOnEvening(date: string, viewerId: string, pairedAt: ReadonlyMap<string, Date>, timeZone: string): Set<string> {
  const evening = localInstant(date, `${pad2(NIGHT_START_HOUR)}:00`, timeZone).getTime();
  const camp = new Set([viewerId]);
  for (const [id, at] of pairedAt) if (at.getTime() <= evening) camp.add(id);
  return camp;
}

/** One on-time goodnight: its author and its evening date. */
export interface OnTimeNight { authorId: string; date: string }

/** Nights whose fire reached LIT_NIGHT_SEGMENTS, each judged against that night's camp (`campOn`); others' goodnights are ignored. */
export function countLitNights(onTime: readonly OnTimeNight[], campOn: (date: string) => ReadonlySet<string>): number {
  const perNight = new Map<string, Set<string>>();
  for (const g of onTime) perNight.set(g.date, (perNight.get(g.date) ?? new Set<string>()).add(g.authorId));
  let lit = 0;
  for (const [date, authors] of perNight) {
    const camp = campOn(date);
    const inBed = [...authors].filter((id) => camp.has(id)).length;
    if (fireSegments(inBed, camp.size) >= LIT_NIGHT_SEGMENTS) lit += 1;
  }
  return lit;
}
```

- [ ] **Step 4: Run the test**

Run: `bash .superpowers/sdd/2026-10-07-social-s2-campfire/backend-jest.sh tests/social/night.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/social/night.ts backend/tests/social/night.test.ts
git commit -m "feat(social): the camp's clock: night, goodnight window, evening date, on time, sunrise and fire"
```

---
### Task 3: One preloaded circle per Social read (S1 deferral a)

**Files:**
- Modify: `backend/src/social/circle.ts`, `backend/src/social/stories.ts`, `backend/src/social/timeline.ts`,
  `backend/src/social/highlights.ts`, `backend/src/social/home.ts`, `backend/src/social/checkins.ts`
- Test: create `backend/tests/social/homeQueries.test.ts`; modify one S1 test in `backend/tests/social/highlights.test.ts`
  (its clock only, for the owner's empty-week ruling); every other S1 suite `tests/social/{stories,timeline,highlights,home,checkins}.test.ts`
  must stay green unchanged, and no S1 DTO changes shape

**Interfaces:**
- Consumes: the `Goodnight` model (Task 1); S1 `buddyIdsOf`, `membersById`, `Member`, `MEMBER_SELECT`, `toPerson`,
  `effectiveSharing`; S1 `highlightsReadyAt`, `buildHighlightCandidates(viewerId, memberIds, weekStart)` (unchanged here).
- Produces (`circle.ts`):
  - `interface TodayCheckIn { authorId: string; mood: CheckInMood; localDate: Date; createdAt: Date; updatedAt: Date }`
  - `interface GoodnightRow { id: string; authorId: string; localDate: Date; at: Date; onTime: boolean }`,
    `GOODNIGHT_SELECT`, `RECENT_GOODNIGHT_MS = 48 h`
  - `interface Circle { viewer: Member; viewerBedtimeGoal: string | null; buddies: Member[]; members: Map<string, Member>; pairedAt: Map<string, Date>; today: string; checkIns: Map<string, TodayCheckIn>; goodnights: GoodnightRow[] }`
    (`members` = viewer + buddies; `pairedAt` = each current buddy's `BuddyPair.createdAt` (owner ruling Q2: Tasks 6
    and 9 freeze past nights with it); `viewerBedtimeGoal` = the viewer's own goal, for the goodnight window (Tasks 6
    and 8) — buddies' goals are never kept; `checkIns` = each member's check-in for their OWN local today;
    `goodnights` = the members' goodnights with `at` in the last 48 h)
  - `buddyPairsOf(userId): Promise<Map<string, Date>>` (buddy id → pair `createdAt`; `buddyIdsOf` = its keys),
    `loadCircle(viewerId, now): Promise<Circle>` (4 queries; a missing viewer → `BuddyError('not_buddies')`),
    `todayCheckInsOf(members: Member[], now): Promise<Map<string, TodayCheckIn>>`, `recentGoodnightsOf(ids: string[], now): Promise<GoodnightRow[]>`.
- Produces (helpers that take the circle; the S1 names stay as thin wrappers so S1 tests and routes keep working):
  - `stories.ts`: `interface StoryRings { rings; checkedInBuddies; viewerCheckedIn; checkedInCoachIds }`,
    `storyRingsFor(circle, now): Promise<StoryRings>`; `loadStoryRings(viewerId, now)` = `storyRingsFor(await loadCircle(…))`;
    `getStory` reads the circle.
  - `timeline.ts`: `timelineFor(circle, now, limit = 100)`; `buildTimeline(viewerId, now, limit)` wraps it.
  - `highlights.ts`: `highlightsWeekFor(timeZone, now): string`, `weeklyHighlightsFor(circle, now)`;
    `getWeeklyHighlights(viewerId, now)` wraps it. `highlightsWeek(viewerId, now)` is removed: its only caller was
    `getWeeklyHighlights` (`highlights.ts:137`), which now uses `highlightsWeekFor`. `EMPTY_WEEK_SETTLE_MS = 24 h`: a
    week with no candidates is cached empty once `now ≥ highlightsReadyAt(week) + 24 h` (owner ruling, amending S1's
    "never persist an empty week"); before that it is rebuilt on every read.
  - `checkins.ts`: `toCheckInDTO(row: { mood; localDate; updatedAt }): CheckInDTO` (exported; was the private `toDTO`).
  - `home.ts`: `getSocialHome` and `markStickersSeen` load the circle once.

- [ ] **Step 1: Write the failing test**

`backend/tests/social/homeQueries.test.ts`:

```ts
// Counts every Prisma model operation through a query extension on the shared client. The factory only touches
// `mockQueries` when a query runs, after this file's top level has set it.
const mockQueries = { count: 0 };
jest.mock('../../src/db/client', () => {
  const { PrismaClient } = jest.requireActual('@prisma/client');
  const base = new PrismaClient();
  return {
    prisma: base.$extends({
      query: {
        $allModels: {
          async $allOperations({ args, query }: { args: unknown; query: (a: unknown) => Promise<unknown> }) {
            mockQueries.count += 1;
            return query(args);
          },
        },
      },
    }),
  };
});

import { randomUUID } from 'crypto';
import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { shiftDate } from '../../src/scoring/dates';
import * as circle from '../../src/social/circle';
import * as checkins from '../../src/social/checkins';
import { getWeeklyHighlights } from '../../src/social/highlights';
import { getSocialHome } from '../../src/social/home';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  jest.restoreAllMocks();
  await prisma.$disconnect();
  await connection.quit();
});

const NOW = new Date('2026-10-07T20:00:00Z'); // Wednesday; last week Mon 2026-09-28 is final
const WEEK = '2026-09-28';
// Not tests/buddies/helpers: it loads the app and Better Auth, which should not run on the counting client.
const person = (name: string) =>
  prisma.user.create({
    data: { email: `q-${randomUUID()}@example.com`, name, handle: `q${randomUUID().replace(/-/g, '').slice(0, 12)}`, displayName: name, buddyMoodNoticeAt: new Date() },
  });
const pair = (a: string, b: string, createdAt = new Date()) =>
  prisma.buddyPair.create({ data: { ...(a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a }), createdAt } });

it('builds the whole home from one preloaded circle, in at most 16 queries, with one lock decision', async () => {
  const me = await person('Me');
  const sam = await person('Sam');
  const ana = await person('Ana');
  await pair(me.id, sam.id);
  await pair(me.id, ana.id);
  for (let i = 0; i < 7; i++) {
    await prisma.checkIn.create({ data: { authorId: ana.id, localDate: civilDateToUtcMidnight(shiftDate(WEEK, i)), mood: 'RESTED' } });
  }
  await prisma.checkIn.create({ data: { authorId: sam.id, localDate: civilDateToUtcMidnight('2026-10-07'), mood: 'TIRED', createdAt: new Date('2026-10-07T15:00:00Z') } });
  await getSocialHome(me.id, NOW); // the first read builds and caches last week's highlights

  const loads = jest.spyOn(circle, 'loadCircle');
  const rederived = [
    jest.spyOn(circle, 'buddyIdsOf'),
    jest.spyOn(circle, 'membersById'),
    jest.spyOn(checkins, 'todayFor'),
    jest.spyOn(checkins, 'getTodayCheckIn'),
  ];
  mockQueries.count = 0;
  const home = await getSocialHome(me.id, NOW);

  // S1 read ~26: loadCircle 4 + rings 3 + timeline 5 + cached highlights 1 + requests 2 + stickers 1.
  expect(mockQueries.count).toBeLessThanOrEqual(16);
  expect(loads).toHaveBeenCalledTimes(1);
  for (const spy of rederived) expect(spy).not.toHaveBeenCalled();
  // One lock decision everywhere: I haven't checked in, so Sam's ring and Sam's timeline check-in are both locked.
  expect(home.me.checkIn).toBeNull();
  expect(home.stories.map((r) => r.locked)).toEqual([true]);
  expect(home.timeline.map((i) => ('locked' in i ? i.locked : null))).toEqual([true]);
  expect(home.highlights).not.toBeNull();
});

it('the circle carries when each buddy paired with me, and my own bedtime goal only', async () => {
  const me = await person('Me');
  const sam = await person('Sam');
  await prisma.user.update({ where: { id: me.id }, data: { bedtimeGoal: '22:30' } });
  await prisma.user.update({ where: { id: sam.id }, data: { bedtimeGoal: '21:00' } });
  const pairedAt = new Date('2026-10-05T12:00:00Z');
  await pair(me.id, sam.id, pairedAt);
  const c = await circle.loadCircle(me.id, NOW);
  expect([...c.pairedAt]).toEqual([[sam.id, pairedAt]]);
  expect(c.viewerBedtimeGoal).toBe('22:30');
  expect(JSON.stringify(c.buddies)).not.toContain('21:00'); // a buddy's goal is never kept
});

it('a quiet week is rebuilt for a day after it turns final, then cached empty, so later reads cost one query', async () => {
  // Week 2026-09-28 turns final Mon 2026-10-05 14:00 UTC; the empty build is cached from Tue 2026-10-06 14:00 UTC.
  const early = await person('Early');
  expect(await getWeeklyHighlights(early.id, new Date('2026-10-06T13:59:00Z'))).toBeNull();
  expect(await prisma.weeklyHighlights.count({ where: { viewerId: early.id } })).toBe(0);

  const quiet = await person('Quiet');
  expect(await getWeeklyHighlights(quiet.id, NOW)).toBeNull();
  const cached = await prisma.weeklyHighlights.findMany({ where: { viewerId: quiet.id }, select: { weekStart: true, items: true } });
  expect(cached.map((r) => [r.weekStart.toISOString().slice(0, 10), r.items])).toEqual([[WEEK, []]]);
  mockQueries.count = 0;
  expect(await getWeeklyHighlights(quiet.id, NOW)).toBeNull();
  // loadCircle 4 + the cached row 1: no rebuild.
  expect(mockQueries.count).toBe(5);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bash .superpowers/sdd/2026-10-07-social-s2-campfire/backend-jest.sh tests/social/homeQueries.test.ts`
Expected: FAIL — `loadCircle` does not exist on the circle module (and the read costs about 26 queries).

- [ ] **Step 3: Write the circle loader**

Replace `backend/src/social/circle.ts` with:

```ts
// Your circle = you + your current buddies (live BuddyPair rows; a block deletes the pair, so blocked people drop
// out on their own). Sharing switches are read only through effectiveSharing (switch on AND current consent).
// A Social read loads the circle ONCE (loadCircle) and hands it to every helper, so the rings, the timeline, the
// highlights, the camp and `me` all see the same buddies, switches, check-ins (the lock) and goodnights. It also
// carries when each buddy paired with the viewer (a past night's fire counts only buddies paired by that evening) and
// the viewer's own bedtime goal (the goodnight window); buddies' bedtime goals are never kept.

import type { CheckInMood } from '@prisma/client';
import { civilDateToUtcMidnight, localCivilDateOrUtc } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import { BuddyError } from '../buddies/errors';
import { PERSON_SELECT, toPerson, type PersonDTO } from '../buddies/people';
import { SHARING_SELECT, effectiveSharing } from '../buddies/sharing';

export const MEMBER_SELECT = { ...PERSON_SELECT, ...SHARING_SELECT, timezone: true } as const;

export interface Member {
  person: PersonDTO;
  timezone: string;
  shares: { steps: boolean; streaks: boolean };
}

export interface TodayCheckIn { authorId: string; mood: CheckInMood; localDate: Date; createdAt: Date; updatedAt: Date }
export interface GoodnightRow { id: string; authorId: string; localDate: Date; at: Date; onTime: boolean }
export const GOODNIGHT_SELECT = { id: true, authorId: true, localDate: true, at: true, onTime: true } as const;
/** Goodnights are read back this far: a story's day, the timeline's day, and a coach still asleep at 11:59. */
export const RECENT_GOODNIGHT_MS = 48 * 60 * 60 * 1000;

export interface Circle {
  viewer: Member;
  /** The viewer's own bedtime goal ("HH:MM"), for the goodnight window. Only the viewer's is ever kept. */
  viewerBedtimeGoal: string | null;
  /** Current buddies that still exist. */
  buddies: Member[];
  /** The viewer and the buddies, by id. */
  members: Map<string, Member>;
  /** Each current buddy's BuddyPair.createdAt: when they joined the viewer's camp. */
  pairedAt: Map<string, Date>;
  /** The viewer's local today. */
  today: string;
  /** Each member's check-in for their OWN local today; the viewer's decides the check-in lock. */
  checkIns: Map<string, TodayCheckIn>;
  /** The members' goodnights said in the last 48 h. */
  goodnights: GoodnightRow[];
}

/**
 * Every current buddy's id, with when the pair was made. Unbounded on purpose: Buddies has no buddy cap, and
 * circles are small, so every Social read loads the whole circle (a cap or paging would come with growth).
 */
export async function buddyPairsOf(userId: string): Promise<Map<string, Date>> {
  const pairs = await prisma.buddyPair.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    select: { userAId: true, userBId: true, createdAt: true },
  });
  return new Map(pairs.map((p) => [p.userAId === userId ? p.userBId : p.userAId, p.createdAt]));
}

/** Every current buddy's id (see buddyPairsOf). */
export async function buddyIdsOf(userId: string): Promise<string[]> {
  return [...(await buddyPairsOf(userId)).keys()];
}

type MemberRow = Parameters<typeof toPerson>[0] & Parameters<typeof effectiveSharing>[0] & { id: string; timezone: string };

function toMember(u: MemberRow): Member {
  const s = effectiveSharing(u);
  return { person: toPerson(u), timezone: u.timezone, shares: { steps: s.steps, streaks: s.streaks } };
}

export async function membersById(ids: string[]): Promise<Map<string, Member>> {
  if (ids.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: MEMBER_SELECT });
  return new Map(users.map((u) => [u.id, toMember(u)]));
}

/** Each member's check-in for their own local today (one query for the circle). */
export async function todayCheckInsOf(members: Member[], now: Date): Promise<Map<string, TodayCheckIn>> {
  const todayOf = new Map(members.map((m) => [m.person.id, localCivilDateOrUtc(now, m.timezone)]));
  const rows = await prisma.checkIn.findMany({
    where: { authorId: { in: [...todayOf.keys()] }, localDate: { in: [...new Set(todayOf.values())].map(civilDateToUtcMidnight) } },
    select: { authorId: true, mood: true, localDate: true, createdAt: true, updatedAt: true },
  });
  return new Map(rows.filter((r) => r.localDate.toISOString().slice(0, 10) === todayOf.get(r.authorId)).map((r) => [r.authorId, r]));
}

export async function recentGoodnightsOf(ids: string[], now: Date): Promise<GoodnightRow[]> {
  return prisma.goodnight.findMany({
    where: { authorId: { in: ids }, at: { gte: new Date(now.getTime() - RECENT_GOODNIGHT_MS), lte: now } },
    select: GOODNIGHT_SELECT,
  });
}

/** The viewer's circle for one read. A viewer row that is gone answers not_buddies (never a 500). */
export async function loadCircle(viewerId: string, now: Date): Promise<Circle> {
  const paired = await buddyPairsOf(viewerId);
  // One users query; bedtimeGoal rides along for the viewer's goodnight window and is dropped for everyone else.
  const users = await prisma.user.findMany({
    where: { id: { in: [viewerId, ...paired.keys()] } },
    select: { ...MEMBER_SELECT, bedtimeGoal: true },
  });
  const members = new Map(users.map((u) => [u.id, toMember(u)]));
  const viewer = members.get(viewerId);
  if (!viewer) throw new BuddyError('not_buddies');
  const viewerBedtimeGoal = users.find((u) => u.id === viewerId)?.bedtimeGoal ?? null;
  const buddies = [...paired.keys()].map((id) => members.get(id)).filter((m): m is Member => m !== undefined);
  // Only buddies that still exist.
  const pairedAt = new Map([...paired].filter(([id]) => members.has(id)));
  const everyone = [viewer, ...buddies];
  const [checkIns, goodnights] = await Promise.all([
    todayCheckInsOf(everyone, now),
    recentGoodnightsOf(everyone.map((m) => m.person.id), now),
  ]);
  return {
    viewer, viewerBedtimeGoal, buddies, members, pairedAt,
    today: localCivilDateOrUtc(now, viewer.timezone), checkIns, goodnights,
  };
}
```

- [ ] **Step 4: Export the check-in DTO mapper**

In `backend/src/social/checkins.ts`, replace

```ts
const toDTO = (row: { mood: CheckInMood; localDate: Date; updatedAt: Date }): CheckInDTO => ({
```

with

```ts
export const toCheckInDTO = (row: { mood: CheckInMood; localDate: Date; updatedAt: Date }): CheckInDTO => ({
```

and change the two call sites `return row ? toDTO(row) : null;` and `return toDTO(row);` to use `toCheckInDTO`.

- [ ] **Step 5: Stories read the circle**

Replace `backend/src/social/stories.ts` with:

```ts
// Stories (spec 2026-10-07 social §4.2). A story is the AUTHOR's local today: their check-in (locked for a viewer
// who hasn't checked in today), badges earned today (only while they share streaks; the top new level per family)
// and recaps they shared today (the headline line snapshotted when they shared it, period and coach — never the
// stats JSON, never the live Recap.line). Built at read time from the preloaded circle (whose check-ins also decide
// the lock) plus one query per remaining source. Rings: unseen first, then newest (plan ruling).

import type { AchievementFamily, CheckInMood } from '@prisma/client';
import { civilDateToUtcMidnight, localCivilDateOrUtc } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import { BuddyError, UUID_RE } from '../buddies/errors';
import type { PersonDTO } from '../buddies/people';
import { todaysTopBadges } from './badges';
import { buddyIdsOf, loadCircle, membersById, type Circle, type Member } from './circle';

export type StoryFrameDTO =
  | { kind: 'checkin'; at: string; locked: true }
  | { kind: 'checkin'; at: string; locked: false; mood: CheckInMood }
  | { kind: 'badge'; at: string; family: AchievementFamily; level: number }
  | { kind: 'recap'; at: string; recapId: string; recapKind: 'WEEK' | 'MONTH'; periodStart: string; periodEnd: string; line: string; coachId: string };

export interface StoryDTO { author: PersonDTO; localDate: string; frames: StoryFrameDTO[] }
export interface StoryRingDTO { author: PersonDTO; unseen: boolean; locked: boolean; frameCount: number; latestAt: string }
export interface StoryRings { rings: StoryRingDTO[]; checkedInBuddies: number; viewerCheckedIn: boolean; checkedInCoachIds: string[] }

const LOOKBACK_MS = 48 * 60 * 60 * 1000;
const iso = (d: Date) => d.toISOString();
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** Each author's local today, and the distinct dates among them (for `localDate in` filters). */
function authorTodays(authors: Member[], now: Date): { todayOf: Map<string, string>; dates: Date[] } {
  const todayOf = new Map(authors.map((a) => [a.person.id, localCivilDateOrUtc(now, a.timezone)]));
  return { todayOf, dates: [...new Set(todayOf.values())].map(civilDateToUtcMidnight) };
}

/** Each author's frames for their own local today. `unlocked` = the viewer may see check-in moods. */
async function loadFrames(authors: Member[], circle: Circle, now: Date, unlocked: boolean): Promise<Map<string, StoryFrameDTO[]>> {
  const ids = authors.map((a) => a.person.id);
  const { todayOf } = authorTodays(authors, now);
  const since = new Date(now.getTime() - LOOKBACK_MS);
  const streakIds = authors.filter((a) => a.shares.streaks).map((a) => a.person.id);
  const [badges, shares] = await Promise.all([
    prisma.achievement.findMany({
      where: { userId: { in: streakIds }, createdAt: { gte: since } },
      select: { userId: true, family: true, level: true, earnedOn: true, createdAt: true },
    }),
    prisma.recapShare.findMany({
      where: { sharerId: { in: ids }, createdAt: { gte: since } },
      select: { sharerId: true, localDate: true, line: true, createdAt: true, recap: { select: { id: true, kind: true, periodStart: true, periodEnd: true } } },
    }),
  ]);
  const byAuthor = new Map<string, Array<StoryFrameDTO>>(ids.map((id) => [id, []]));
  const coachOf = new Map(authors.map((a) => [a.person.id, a.person.coachId]));
  const tzOf = new Map(authors.map((a) => [a.person.id, a.timezone]));
  for (const id of ids) {
    // The circle already holds each member's check-in for their own today.
    const c = circle.checkIns.get(id);
    if (!c) continue;
    byAuthor.get(id)!.push(unlocked
      ? { kind: 'checkin', at: iso(c.createdAt), locked: false, mood: c.mood }
      : { kind: 'checkin', at: iso(c.createdAt), locked: true });
  }
  const authorOf = (id: string) => (todayOf.has(id) ? { today: todayOf.get(id)!, timezone: tzOf.get(id)! } : undefined);
  for (const b of todaysTopBadges(badges, authorOf)) {
    byAuthor.get(b.userId)!.push({ kind: 'badge', at: iso(b.createdAt), family: b.family, level: b.level });
  }
  for (const s of shares) {
    // The line snapshotted at share time, never the live Recap.line (deletion or a rebuild may rewrite that).
    // shareRecap refuses an empty line; skip one anyway (rows from before the snapshot column default to '').
    if (isoDate(s.localDate) !== todayOf.get(s.sharerId) || !s.line) continue;
    byAuthor.get(s.sharerId)!.push({
      kind: 'recap', at: iso(s.createdAt), recapId: s.recap.id, recapKind: s.recap.kind,
      periodStart: isoDate(s.recap.periodStart), periodEnd: isoDate(s.recap.periodEnd), line: s.line, coachId: coachOf.get(s.sharerId)!,
    });
  }
  for (const frames of byAuthor.values()) frames.sort((a, b) => a.at.localeCompare(b.at));
  return byAuthor;
}

const MAX_CAMP_FACES = 2;

export async function storyRingsFor(circle: Circle, now: Date): Promise<StoryRings> {
  const viewerId = circle.viewer.person.id;
  const viewerCheckedIn = circle.checkIns.has(viewerId);
  const { buddies } = circle;
  const { todayOf, dates } = authorTodays(buddies, now);
  const [frames, seen] = await Promise.all([
    loadFrames(buddies, circle, now, viewerCheckedIn),
    prisma.storySeen.findMany({
      where: { viewerId, authorId: { in: buddies.map((b) => b.person.id) }, localDate: { in: dates } },
      select: { authorId: true, localDate: true },
    }),
  ]);
  const seenToday = new Set(seen.filter((s) => isoDate(s.localDate) === todayOf.get(s.authorId)).map((s) => s.authorId));
  const rings: StoryRingDTO[] = [];
  const checkIns: Array<{ coachId: string; at: string }> = [];
  for (const b of buddies) {
    const list = frames.get(b.person.id) ?? [];
    if (list.length === 0) continue;
    const checkIn = list.find((f) => f.kind === 'checkin');
    if (checkIn) checkIns.push({ coachId: b.person.coachId, at: checkIn.at });
    rings.push({ author: b.person, unseen: !seenToday.has(b.person.id), locked: checkIn !== undefined && !viewerCheckedIn, frameCount: list.length, latestAt: list[list.length - 1]!.at });
  }
  rings.sort((a, b) => Number(b.unseen) - Number(a.unseen) || b.latestAt.localeCompare(a.latestAt));
  checkIns.sort((a, b) => b.at.localeCompare(a.at));
  return { rings, checkedInBuddies: checkIns.length, viewerCheckedIn, checkedInCoachIds: checkIns.slice(0, MAX_CAMP_FACES).map((c) => c.coachId) };
}

export async function loadStoryRings(viewerId: string, now: Date): Promise<StoryRings> {
  return storyRingsFor(await loadCircle(viewerId, now), now);
}

async function requireAuthor(viewerId: string, authorId: string): Promise<{ viewer: Member; author: Member }> {
  if (!UUID_RE.test(authorId)) throw new BuddyError('not_buddies');
  if (authorId !== viewerId && !(await buddyIdsOf(viewerId)).includes(authorId)) throw new BuddyError('not_buddies');
  const members = await membersById([viewerId, authorId]);
  const viewer = members.get(viewerId);
  const author = members.get(authorId);
  if (!viewer || !author) throw new BuddyError('not_buddies');
  return { viewer, author };
}

export async function getStory(viewerId: string, authorId: string, now: Date): Promise<StoryDTO> {
  if (!UUID_RE.test(authorId)) throw new BuddyError('not_buddies');
  const circle = await loadCircle(viewerId, now);
  const author = circle.members.get(authorId);
  if (!author) throw new BuddyError('not_buddies');
  const unlocked = authorId === viewerId || circle.checkIns.has(viewerId);
  const frames = await loadFrames([author], circle, now, unlocked);
  return { author: author.person, localDate: localCivilDateOrUtc(now, author.timezone), frames: frames.get(authorId) ?? [] };
}

export async function markStorySeen(viewerId: string, authorId: string, now: Date): Promise<void> {
  const { author } = await requireAuthor(viewerId, authorId);
  const localDate = civilDateToUtcMidnight(localCivilDateOrUtc(now, author.timezone));
  await prisma.storySeen.createMany({ data: [{ viewerId, authorId, localDate, seenAt: now }], skipDuplicates: true });
}
```

- [ ] **Step 6: The timeline reads the circle**

Replace `backend/src/social/timeline.ts` with:

```ts
// Today timeline (spec 2026-10-07 social §5): your circle's events whose moment falls in the VIEWER's local today,
// oldest first. Closed kinds with typed fields (the app renders the copy) — never free text, never a health number.
// Step goals only while the author shares steps; badges only while they share streaks (both via effectiveSharing).
// A buddy's check-in is LOCKED (no mood) until the viewer has checked in for their own local today — the same lock
// as story frames (spec §4.1), read from the same preloaded circle; the viewer's own check-in is never locked.
// Badges follow the story frames' rule (todaysTopBadges): no backfilled old runs, one item per multi-level jump.

import type { AchievementFamily, CheckInMood, StickerKind } from '@prisma/client';
import { civilDateToUtcMidnight, localCivilDateOrUtc } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import type { PersonDTO } from '../buddies/people';
import { shiftDate } from '../scoring/dates';
import { todaysTopBadges } from './badges';
import { loadCircle, type Circle, type Member } from './circle';

type Base = { id: string; at: string; actor: PersonDTO; mine: boolean };
export type TimelineItemDTO =
  | (Base & { kind: 'checkin'; locked: true })
  | (Base & { kind: 'checkin'; locked: false; mood: CheckInMood })
  | (Base & { kind: 'step_goal' })
  | (Base & { kind: 'badge'; badge: { family: AchievementFamily; level: number } })
  | (Base & { kind: 'sticker'; sticker: StickerKind; to: PersonDTO })
  | (Base & { kind: 'recap_share'; recapKind: 'WEEK' | 'MONTH' });

/** An item before `at`, `actor` and `mine` are filled in (Omit applied to each variant of the union). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type Rest = DistributiveOmit<TimelineItemDTO, 'at' | 'actor' | 'mine'>;

/** How far back any moment in the viewer's local today can lie (a local day is at most 25 h, with slack). */
export const TODAY_WINDOW_MS = 30 * 60 * 60 * 1000;

export async function timelineFor(circle: Circle, now: Date, limit = 100): Promise<TimelineItemDTO[]> {
  if (limit <= 0) return [];
  const { viewer, members, today } = circle;
  const viewerId = viewer.person.id;
  const buddyIds = circle.buddies.map((b) => b.person.id);
  const ids = [viewerId, ...buddyIds];
  // Any author's local date at a moment in the viewer's today is within a day of it (UTC offsets span 26 h).
  const nearDates = [shiftDate(today, -1), today, shiftDate(today, 1)].map(civilDateToUtcMidnight);
  const since = new Date(now.getTime() - TODAY_WINDOW_MS);
  const visible = (m: Member | undefined, key: 'steps' | 'streaks') => m !== undefined && (m.person.id === viewerId || m.shares[key]);
  const stepIds = ids.filter((id) => visible(members.get(id), 'steps'));
  const streakIds = ids.filter((id) => visible(members.get(id), 'streaks'));

  const [checkIns, steps, badges, stickers, shares] = await Promise.all([
    prisma.checkIn.findMany({ where: { authorId: { in: ids }, localDate: { in: nearDates }, createdAt: { gte: since } }, select: { id: true, authorId: true, mood: true, createdAt: true } }),
    prisma.stepGoalEvent.findMany({ where: { authorId: { in: stepIds }, at: { gte: since } }, select: { authorId: true, at: true } }),
    prisma.achievement.findMany({ where: { userId: { in: streakIds }, createdAt: { gte: since } }, select: { id: true, userId: true, family: true, level: true, earnedOn: true, createdAt: true } }),
    prisma.sticker.findMany({
      where: { sentAt: { gte: since }, OR: [{ toUserId: viewerId, fromUserId: { in: buddyIds } }, { fromUserId: viewerId, toUserId: { in: buddyIds } }] },
      select: { id: true, fromUserId: true, toUserId: true, kind: true, sentAt: true },
    }),
    prisma.recapShare.findMany({ where: { sharerId: { in: ids }, createdAt: { gte: since } }, select: { id: true, sharerId: true, createdAt: true, recap: { select: { kind: true } } } }),
  ]);

  const viewerCheckedIn = circle.checkIns.has(viewerId);
  const items: TimelineItemDTO[] = [];
  const push = (actorId: string, at: Date, rest: Rest) => {
    const actor = members.get(actorId);
    if (!actor || localCivilDateOrUtc(at, viewer.timezone) !== today) return;
    items.push({ ...rest, at: at.toISOString(), actor: actor.person, mine: actorId === viewerId } as TimelineItemDTO);
  };
  for (const c of checkIns) {
    const id = `checkin:${c.id}`;
    // The mood is left out entirely (not nulled) while locked, so it never reaches the wire.
    push(c.authorId, c.createdAt, c.authorId === viewerId || viewerCheckedIn
      ? { id, kind: 'checkin', locked: false, mood: c.mood }
      : { id, kind: 'checkin', locked: true });
  }
  // Opaque step-goal id: the author's local date next to `at` would reveal their UTC offset.
  for (const s of steps) push(s.authorId, s.at, { id: `step_goal:${s.authorId}:${s.at.getTime()}`, kind: 'step_goal' });
  const authorOf = (id: string) => {
    const m = members.get(id);
    return m && { today: localCivilDateOrUtc(now, m.timezone), timezone: m.timezone };
  };
  for (const b of todaysTopBadges(badges, authorOf)) push(b.userId, b.createdAt, { id: `badge:${b.id}`, kind: 'badge', badge: { family: b.family, level: b.level } });
  for (const s of stickers) {
    const to = members.get(s.toUserId);
    if (to) push(s.fromUserId, s.sentAt, { id: `sticker:${s.id}`, kind: 'sticker', sticker: s.kind, to: to.person });
  }
  for (const r of shares) push(r.sharerId, r.createdAt, { id: `recap_share:${r.id}`, kind: 'recap_share', recapKind: r.recap.kind });
  items.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  return items.slice(-limit);
}

export async function buildTimeline(viewerId: string, now: Date, limit = 100): Promise<TimelineItemDTO[]> {
  if (limit <= 0) return [];
  return timelineFor(await loadCircle(viewerId, now), now, limit);
}
```

- [ ] **Step 7: Highlights read the circle**

In `backend/src/social/highlights.ts`, replace the header comment's lines 5–6

```ts
// drops out, and a badge item needs its actor to share streaks now (the viewer is exempt). A build with no
// candidates is never stored, so a quiet week is rebuilt on the next read. Closed item types, no health numbers:
```

with

```ts
// drops out, and a badge item needs its actor to share streaks now (the viewer is exempt). A build with no
// candidates is rebuilt on every read for the first 24 h after the week turns final (late check-ins still land),
// then cached empty, so a quiet circle stops paying the build queries on every read (S2 owner ruling; S1 never
// stored an empty week). Closed item types, no health numbers:
```

Replace the import block (from
`import type { AchievementFamily …` through `import { buddyIdsOf, membersById, type Member } from './circle';`) with:

```ts
import type { AchievementFamily, CheckInMood, Prisma } from '@prisma/client';
import { civilDateToUtcMidnight, localCivilDateOrUtc } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import type { PersonDTO } from '../buddies/people';
import { lastCompletedPeriodStart } from '../recap/periods';
import { shiftDate } from '../scoring/dates';
import { loadCircle, type Circle, type Member } from './circle';
```

Replace the whole `highlightsWeek` function (its doc comment included; its only caller was `getWeeklyHighlights`,
`highlights.ts:137`, which is replaced below) with:

```ts
/** A quiet week is rebuilt on each read for this long after it turns final, then cached empty. */
export const EMPTY_WEEK_SETTLE_MS = 24 * 60 * 60 * 1000;

/** The newest week that is final for a viewer in `timeZone`: their last completed week, or the one before it until Monday 14:00 UTC. */
export function highlightsWeekFor(timeZone: string, now: Date): string {
  const latest = lastCompletedPeriodStart('WEEK', localCivilDateOrUtc(now, timeZone));
  return now.getTime() >= highlightsReadyAt(latest).getTime() ? latest : shiftDate(latest, -7);
}
```

Replace the whole `getWeeklyHighlights` function with:

```ts
export async function weeklyHighlightsFor(circle: Circle, now: Date): Promise<HighlightsDTO | null> {
  const viewerId = circle.viewer.person.id;
  const weekStart = highlightsWeekFor(circle.viewer.timezone, now);
  const memberIds = [viewerId, ...circle.buddies.map((b) => b.person.id)];
  const key = { viewerId_weekStart: { viewerId, weekStart: civilDateToUtcMidnight(weekStart) } };
  let row = await prisma.weeklyHighlights.findUnique({ where: key, select: { items: true } });
  if (!row) {
    const candidates = await buildHighlightCandidates(viewerId, memberIds, weekStart);
    // A quiet week is rebuilt on each read for its first 24 h as final (late rows still land), then cached empty so
    // later reads cost one query instead of the whole build.
    const settled = now.getTime() >= highlightsReadyAt(weekStart).getTime() + EMPTY_WEEK_SETTLE_MS;
    if (candidates.length === 0 && !settled) return null;
    await prisma.weeklyHighlights.createMany({
      data: [{ viewerId, weekStart: civilDateToUtcMidnight(weekStart), items: candidates as unknown as Prisma.InputJsonValue }],
      skipDuplicates: true,
    });
    row = await prisma.weeklyHighlights.findUniqueOrThrow({ where: key, select: { items: true } });
  }
  const items = visibleItems(row.items as unknown as HighlightItem[], viewerId, circle.members);
  return items.length > 0 ? { weekStart, weekEnd: shiftDate(weekStart, 6), items } : null;
}

export async function getWeeklyHighlights(viewerId: string, now: Date): Promise<HighlightsDTO | null> {
  return weeklyHighlightsFor(await loadCircle(viewerId, now), now);
}
```

(`visibleItems` keeps its `members: Map<string, Member>` parameter; `buildHighlightCandidates` is unchanged here —
Task 9 changes it to take the circle.)

In `backend/tests/social/highlights.test.ts` (S1), the comeback test read at `NOW`, which is now more than 24 h after
week 2026-09-28 turned final, so its quiet first read would be cached. Move that test's two reads into the first day
(this is the only S1 test edit in S2). Replace the whole test
`it('a comeback needs consecutive days, and a week with nothing is never stored', …)` with:

```ts
it('a comeback needs consecutive days, and a week with nothing is not stored in its first day as final', async () => {
  const me = await buddyUser();
  const zed = await buddyUser({ displayName: 'Zed' });
  await pairUp(me.id, zed.id);
  // Tue 2026-10-06 10:00 UTC: the week turned final at Mon 14:00 UTC, and an empty build is cached only from Tue 14:00.
  const firstDay = new Date('2026-10-06T10:00:00Z');
  // Tired Mon, Tired Tue, nothing Wed, Rested Thu: not a comeback.
  await prisma.checkIn.create({ data: { authorId: zed.id, localDate: day(0), mood: 'TIRED' } });
  await prisma.checkIn.create({ data: { authorId: zed.id, localDate: day(1), mood: 'TIRED' } });
  await prisma.checkIn.create({ data: { authorId: zed.id, localDate: day(3), mood: 'RESTED' } });
  expect(await getWeeklyHighlights(me.id, firstDay)).toBeNull();
  expect(await prisma.weeklyHighlights.count({ where: { viewerId: me.id } })).toBe(0);
  // Rebuilt on the next read: a late check-in that completes the run now counts.
  await prisma.checkIn.create({ data: { authorId: zed.id, localDate: day(2), mood: 'TIRED' } });
  expect((await getWeeklyHighlights(me.id, firstDay))!.items.map((i) => i.type)).toEqual(['comeback']);
});
```

- [ ] **Step 8: The home loads the circle once**

Replace `backend/src/social/home.ts` with:

```ts
// The Social home in one call (spec 2026-10-07 social §4). One preloaded circle feeds every part (rings, timeline,
// highlights, `me`), so they agree on buddies, switches and the check-in lock. The camp banner: who in your circle
// checked in today, plus up to two of their coach faces. Unread counts feed the Social tab's dot: incoming buddy
// requests and unseen stickers from current buddies sent in the viewer's local today (chats join in S3) — the same
// window as the today timeline, so it counts only stickers Social shows. Those are marked seen by the Social screen
// once it has shown them (POST /me/social/stickers/seen), so the dot clears where the cause is read. Older unseen
// stickers stay unseen and keep their Buddies-side "new" marker until that buddy's week is opened.

import { localCivilDateOrUtc } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import { countRequests } from '../buddies/requests';
import type { PersonDTO } from '../buddies/people';
import { toCheckInDTO, type CheckInDTO } from './checkins';
import { loadCircle, type Circle } from './circle';
import { weeklyHighlightsFor, type HighlightsDTO } from './highlights';
import { storyRingsFor, type StoryRingDTO } from './stories';
import { timelineFor, TODAY_WINDOW_MS, type TimelineItemDTO } from './timeline';

export interface SocialHomeDTO {
  me: { person: PersonDTO; checkIn: CheckInDTO | null };
  camp: { checkedIn: number; members: number; faces: string[] };
  stories: StoryRingDTO[];
  highlights: HighlightsDTO | null;
  timeline: TimelineItemDTO[];
  unread: { requests: number; stickers: number };
}

/** Ids of the unseen stickers to the viewer from current buddies whose moment falls in the viewer's local today. */
async function unseenTodayStickerIds(circle: Circle, now: Date): Promise<string[]> {
  const buddyIds = circle.buddies.map((b) => b.person.id);
  if (buddyIds.length === 0) return [];
  const rows = await prisma.sticker.findMany({
    where: { toUserId: circle.viewer.person.id, seenAt: null, fromUserId: { in: buddyIds }, sentAt: { gte: new Date(now.getTime() - TODAY_WINDOW_MS) } },
    select: { id: true, sentAt: true },
  });
  return rows.filter((s) => localCivilDateOrUtc(s.sentAt, circle.viewer.timezone) === circle.today).map((s) => s.id);
}

export async function getSocialHome(viewerId: string, now: Date): Promise<SocialHomeDTO> {
  const circle = await loadCircle(viewerId, now);
  const [rings, timeline, highlights, requests, stickers] = await Promise.all([
    storyRingsFor(circle, now),
    timelineFor(circle, now),
    weeklyHighlightsFor(circle, now),
    countRequests(viewerId, now),
    unseenTodayStickerIds(circle, now),
  ]);
  const mine = circle.checkIns.get(viewerId);
  return {
    me: { person: circle.viewer.person, checkIn: mine ? toCheckInDTO(mine) : null },
    camp: {
      checkedIn: rings.checkedInBuddies + (rings.viewerCheckedIn ? 1 : 0),
      members: circle.members.size,
      faces: rings.checkedInCoachIds,
    },
    stories: rings.rings,
    highlights,
    timeline,
    unread: { requests: requests.incoming, stickers: stickers.length },
  };
}

/** The Social screen showed them: today's unseen stickers to the viewer from current buddies are now seen. */
export async function markStickersSeen(viewerId: string, now: Date): Promise<number> {
  const ids = await unseenTodayStickerIds(await loadCircle(viewerId, now), now);
  if (ids.length === 0) return 0;
  const result = await prisma.sticker.updateMany({ where: { id: { in: ids }, seenAt: null }, data: { seenAt: now } });
  return result.count;
}
```

- [ ] **Step 9: Run the new test and every S1 social suite**

Run: `bash .superpowers/sdd/2026-10-07-social-s2-campfire/backend-jest.sh tests/social`
Expected: PASS (including `homeQueries.test.ts`; the S1 suites unchanged apart from the comeback test's clock above).
Run: `git diff --stat b3cd4cf -- backend/tests/social` — Expected: only `highlights.test.ts` among the S1 files.
Run (from `backend/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/tsc --noEmit` — Expected: no output.

- [ ] **Step 10: Commit**

```bash
git add backend/src/social backend/tests/social/homeQueries.test.ts backend/tests/social/highlights.test.ts
git commit -m "refactor(social): load the circle once per read and share it across rings, timeline, highlights and me"
```

---

### Task 4: Say goodnight, with undo

**Files:**
- Create: `backend/src/social/goodnight.ts`, `backend/tests/social/helpers.ts`
- Modify: `backend/src/buddies/errors.ts`, `backend/src/social/routes.ts`, `mobile/src/lib/buddyCopy.ts`
- Test: `backend/tests/social/goodnight.test.ts`; rerun `mobile/__tests__/lib/buddyCopy.test.ts`

**Interfaces:**
- Consumes: `eveningDate`, `isGoodnightOpen`, `isOnTime`, `zoneOrUtc` (Task 2); `GOODNIGHT_SELECT`, `GoodnightRow`
  (Task 3).
- Produces:
  - `goodnight.ts`: `GOODNIGHT_UNDO_MS = 600_000`, `interface GoodnightDTO { localDate: string; at: string; onTime: boolean; undoUntil: string }`,
    `toGoodnightDTO(row: Pick<GoodnightRow, 'localDate' | 'at' | 'onTime'>): GoodnightDTO`,
    `sayGoodnight(userId, now): Promise<GoodnightDTO>` (open from `min(20:00, goal − 60 min)` to 05:59 in the
    author's zone), `undoGoodnight(userId, now): Promise<void>` (only the goodnight whose `localDate` is
    `eveningDate(now)`; never yesterday's).
  - Error codes `goodnight_closed: 409`, `undo_expired: 409` (and their mobile words: "It's too early to say
    goodnight." / "It's too late to undo that goodnight.").
  - Routes `POST /me/camp/goodnight` → `{ goodnight: GoodnightDTO }`; `DELETE /me/camp/goodnight` → 204.
  - `tests/social/helpers.ts`: `zoneAtLocalHour(hour: number, now?: Date): string`.

- [ ] **Step 1: Write the test helper and the failing test**

`backend/tests/social/helpers.ts`:

```ts
/**
 * An IANA zone where it is `hour`:xx right now, for route tests that read the real clock. Etc/GMT zones have
 * inverted signs: Etc/GMT-3 is UTC+3. Pick a middle-of-the-window hour (22 for night, 12 for day), so a test that
 * crosses an hour boundary still lands in the same window.
 */
export function zoneAtLocalHour(hour: number, now: Date = new Date()): string {
  const ahead = (((hour - now.getUTCHours()) % 24) + 24) % 24; // hours ahead of UTC, 0..23
  if (ahead === 0) return 'UTC';
  return ahead <= 14 ? `Etc/GMT-${ahead}` : `Etc/GMT+${24 - ahead}`;
}
```

`backend/tests/social/goodnight.test.ts`:

```ts
import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { sayGoodnight, undoGoodnight } from '../../src/social/goodnight';
import { api, buddyUser } from '../buddies/helpers';
import { zoneAtLocalHour } from './helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

const LA = 'America/Los_Angeles'; // PDT, UTC−7
const at = (iso: string) => new Date(iso);
const withGoal = async (goal: string | null) => {
  const u = await buddyUser({ timezone: LA });
  if (goal) await prisma.user.update({ where: { id: u.id }, data: { bedtimeGoal: goal } });
  return u;
};

it('says goodnight once per evening, on time by the bedtime goal + 15 min; a second tap keeps the first', async () => {
  const me = await withGoal('22:30');
  const first = at('2026-10-08T05:44:00Z'); // 22:44
  expect(await sayGoodnight(me.id, first)).toEqual({ localDate: '2026-10-07', at: first.toISOString(), onTime: true, undoUntil: '2026-10-08T05:54:00.000Z' });
  expect((await sayGoodnight(me.id, at('2026-10-08T06:30:00Z'))).at).toBe(first.toISOString()); // 23:30, same evening
  expect(await prisma.goodnight.count({ where: { authorId: me.id } })).toBe(1);
});

it('is late after goal + 15 min, uses 23:00 without a goal, and a goodnight after midnight belongs to the evening before', async () => {
  expect((await sayGoodnight((await withGoal('22:30')).id, at('2026-10-08T05:46:00Z'))).onTime).toBe(false); // 22:46
  expect((await sayGoodnight((await withGoal(null)).id, at('2026-10-08T06:00:00Z'))).onTime).toBe(true); // 23:00
  expect((await sayGoodnight((await withGoal(null)).id, at('2026-10-08T06:01:00Z'))).onTime).toBe(false); // 23:01
  const late = await sayGoodnight((await withGoal(null)).id, at('2026-10-08T07:30:00Z')); // 00:30 Oct 8
  expect([late.localDate, late.onTime]).toEqual(['2026-10-07', false]);
  expect((await sayGoodnight((await withGoal('00:30')).id, at('2026-10-08T07:40:00Z'))).onTime).toBe(true); // 00:40
});

it('with no goal it opens at 20:00 (19:30 is closed though the scene is night) and closes at 06:00', async () => {
  await expect(sayGoodnight((await withGoal(null)).id, at('2026-10-08T02:30:00Z'))).rejects.toMatchObject({ code: 'goodnight_closed' }); // 19:30
  await expect(sayGoodnight((await withGoal(null)).id, at('2026-10-08T03:00:00Z'))).resolves.toMatchObject({ localDate: '2026-10-07' }); // 20:00
  await expect(sayGoodnight((await withGoal(null)).id, at('2026-10-08T12:59:00Z'))).resolves.toMatchObject({ localDate: '2026-10-07' }); // 05:59
  const closed = await withGoal(null);
  await expect(sayGoodnight(closed.id, at('2026-10-08T13:00:00Z'))).rejects.toMatchObject({ code: 'goodnight_closed' }); // 06:00
  expect(await prisma.goodnight.count({ where: { authorId: closed.id } })).toBe(0);
});

it('opens an hour before an earlier goal: an 18:00 goal opens at 17:00 and 18:05 is on time; a 23:00 goal opens at 20:00', async () => {
  await expect(sayGoodnight((await withGoal('18:00')).id, at('2026-10-07T23:59:00Z'))).rejects.toMatchObject({ code: 'goodnight_closed' }); // 16:59
  await expect(sayGoodnight((await withGoal('18:00')).id, at('2026-10-08T00:00:00Z'))).resolves.toMatchObject({ localDate: '2026-10-07', onTime: true }); // 17:00
  expect(await sayGoodnight((await withGoal('18:00')).id, at('2026-10-08T01:05:00Z'))).toMatchObject({ localDate: '2026-10-07', onTime: true }); // 18:05
  await expect(sayGoodnight((await withGoal('23:00')).id, at('2026-10-08T02:59:00Z'))).rejects.toMatchObject({ code: 'goodnight_closed' }); // 19:59
  await expect(sayGoodnight((await withGoal('23:00')).id, at('2026-10-08T03:00:00Z'))).resolves.toMatchObject({ onTime: true }); // 20:00
});

it('undo within 10 minutes deletes it; a millisecond later is undo_expired; nothing to undo is fine', async () => {
  const me = await withGoal(null);
  const said = at('2026-10-08T05:44:00Z');
  await sayGoodnight(me.id, said);
  await undoGoodnight(me.id, new Date(said.getTime() + 10 * 60_000));
  expect(await prisma.goodnight.count({ where: { authorId: me.id } })).toBe(0);
  await sayGoodnight(me.id, said);
  await expect(undoGoodnight(me.id, new Date(said.getTime() + 10 * 60_000 + 1))).rejects.toMatchObject({ code: 'undo_expired' });
  expect(await prisma.goodnight.count({ where: { authorId: me.id } })).toBe(1);
  await expect(undoGoodnight((await withGoal(null)).id, said)).resolves.toBeUndefined();
});

it("undo after 06:00 never removes last night's goodnight, even inside its 10 minutes", async () => {
  const me = await withGoal(null);
  await sayGoodnight(me.id, at('2026-10-08T12:55:00Z')); // 05:55 Oct 8: the evening of Oct 7
  // 06:01 Oct 8: the current evening is Oct 8, which has no goodnight, so there is nothing to undo.
  await expect(undoGoodnight(me.id, at('2026-10-08T13:01:00Z'))).resolves.toBeUndefined();
  expect(await prisma.goodnight.count({ where: { authorId: me.id } })).toBe(1);
});

it('routes: POST answers the goodnight (the same one twice), DELETE undoes with 204; by day it is 409 goodnight_closed', async () => {
  const agent = await api();
  const night = await buddyUser({ timezone: zoneAtLocalHour(22) });
  const headers = await authHeaderFor(night.id);
  const said = await agent.post('/me/camp/goodnight').set(headers);
  expect(said.status).toBe(200);
  expect(Object.keys(said.body.goodnight).sort()).toEqual(['at', 'localDate', 'onTime', 'undoUntil']);
  expect((await agent.post('/me/camp/goodnight').set(headers)).body.goodnight.at).toBe(said.body.goodnight.at);
  expect((await agent.delete('/me/camp/goodnight').set(headers)).status).toBe(204);
  expect(await prisma.goodnight.count({ where: { authorId: night.id } })).toBe(0);
  const day = await buddyUser({ timezone: zoneAtLocalHour(12) });
  const closed = await agent.post('/me/camp/goodnight').set(await authHeaderFor(day.id));
  expect([closed.status, closed.body]).toEqual([409, { error: 'goodnight_closed' }]);
  expect((await agent.post('/me/camp/goodnight')).status).toBe(401);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bash .superpowers/sdd/2026-10-07-social-s2-campfire/backend-jest.sh tests/social/goodnight.test.ts`
Expected: FAIL — "Cannot find module '../../src/social/goodnight'".

- [ ] **Step 3: Add the error codes and their words**

In `backend/src/buddies/errors.ts`, after `recap_not_found: 404,` add:

```ts
  goodnight_closed: 409,
  undo_expired: 409,
```

In `mobile/src/lib/buddyCopy.ts`, in the `ERRORS` table after `recap_not_found: "That recap can't be shared.",` add:

```ts
  goodnight_closed: "It's too early to say goodnight.",
  undo_expired: "It's too late to undo that goodnight.",
```

(The Campfire itself names the viewer's own opening time — "You can say goodnight from 8:00 PM" — from
`GET /me/camp`, Task 13; this table has no time to show.)

- [ ] **Step 4: Write `goodnight.ts`**

`backend/src/social/goodnight.ts`:

```ts
// "Say goodnight" (spec 2026-10-07 social §6.1): one Goodnight per author per evening (one said between 00:00 and
// 05:59 local belongs to the previous date), open from min(20:00, bedtime goal − 60 min) to 05:59 in the author's
// zone (owner ruling Q1; the night scene keeps 19:00), on time when it is at or before the bedtime goal + 15 min
// (23:00 with no goal), undoable for 10 minutes — only tonight's, never last night's. Always shared with buddies,
// like the check-in: self-reported, no number. No push (spec §10).

import { civilDateToUtcMidnight } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import { BuddyError } from '../buddies/errors';
import { GOODNIGHT_SELECT, type GoodnightRow } from './circle';
import { eveningDate, isGoodnightOpen, isOnTime, zoneOrUtc } from './night';

export const GOODNIGHT_UNDO_MS = 10 * 60 * 1000;

export interface GoodnightDTO { localDate: string; at: string; onTime: boolean; undoUntil: string }

export function toGoodnightDTO(row: Pick<GoodnightRow, 'localDate' | 'at' | 'onTime'>): GoodnightDTO {
  return {
    localDate: row.localDate.toISOString().slice(0, 10),
    at: row.at.toISOString(),
    onTime: row.onTime,
    undoUntil: new Date(row.at.getTime() + GOODNIGHT_UNDO_MS).toISOString(),
  };
}

export async function sayGoodnight(userId: string, now: Date): Promise<GoodnightDTO> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true, bedtimeGoal: true } });
  if (!user) throw new BuddyError('not_buddies');
  const zone = zoneOrUtc(user.timezone);
  if (!isGoodnightOpen(now, zone, user.bedtimeGoal)) throw new BuddyError('goodnight_closed');
  const localDate = civilDateToUtcMidnight(eveningDate(now, zone));
  // A second tap the same evening keeps the first goodnight: its time and its on-time verdict.
  await prisma.goodnight.createMany({
    data: [{ authorId: userId, localDate, at: now, onTime: isOnTime(now, zone, user.bedtimeGoal) }],
    skipDuplicates: true,
  });
  const row = await prisma.goodnight.findUniqueOrThrow({ where: { authorId_localDate: { authorId: userId, localDate } }, select: GOODNIGHT_SELECT });
  return toGoodnightDTO(row);
}

/**
 * Undoes my goodnight for the current evening (localDate = eveningDate(now)) within 10 minutes of it; later →
 * undo_expired. Never yesterday's: after 06:00 the evening has moved on, so last night's goodnight is not undone
 * even inside its 10 minutes. None for this evening → nothing to do.
 */
export async function undoGoodnight(userId: string, now: Date): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  if (!user) return;
  const localDate = civilDateToUtcMidnight(eveningDate(now, zoneOrUtc(user.timezone)));
  const tonight = await prisma.goodnight.findUnique({
    where: { authorId_localDate: { authorId: userId, localDate } },
    select: { id: true, at: true },
  });
  if (!tonight) return;
  if (now.getTime() - tonight.at.getTime() > GOODNIGHT_UNDO_MS) throw new BuddyError('undo_expired');
  await prisma.goodnight.deleteMany({ where: { id: tonight.id } });
}
```

- [ ] **Step 5: Add the routes**

In `backend/src/social/routes.ts`, replace the header's two comment lines with:

```ts
// Social tab routes (spec 2026-10-07 social). Every path is /me/social… or the Campfire's /me/camp… (spec §6.4), so
// nothing collides with the Buddies `/me/buddies/:buddyId` routes. GETs are never cached.
```

add `import { sayGoodnight, undoGoodnight } from './goodnight';` to the imports, and append:

```ts
socialRouter.post('/me/camp/goodnight', requireAuth, buddyRoute(async (req, res) => {
  res.json({ goodnight: await sayGoodnight(req.userId!, new Date()) });
}));

socialRouter.delete('/me/camp/goodnight', requireAuth, buddyRoute(async (req, res) => {
  await undoGoodnight(req.userId!, new Date());
  res.status(204).end();
}));
```

- [ ] **Step 6: Run the tests**

Run: `bash .superpowers/sdd/2026-10-07-social-s2-campfire/backend-jest.sh tests/social/goodnight.test.ts`
Expected: PASS.
Run (from `mobile/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/lib/buddyCopy.test.ts`
Expected: PASS (every server code has words).

- [ ] **Step 7: Commit**

```bash
git add backend/src/social/goodnight.ts backend/src/social/routes.ts backend/src/buddies/errors.ts backend/tests/social/helpers.ts backend/tests/social/goodnight.test.ts mobile/src/lib/buddyCopy.ts
git commit -m "feat(social): say goodnight from 20:00 or an hour before the goal, judged on time, with a 10-minute undo"
```

---

### Task 5: Camp notes — share, clear, expire, cleared by a check-in

**Files:**
- Create: `backend/src/social/campNotes.ts`
- Modify: `backend/src/buddies/identity.ts` (export `hasVisibleCharacter`), `backend/src/lib/rateLimit.ts`,
  `backend/src/buddies/errors.ts`, `backend/src/social/checkins.ts`, `backend/src/social/routes.ts`,
  `mobile/src/lib/buddyCopy.ts`
- Test: `backend/tests/social/campNotes.test.ts`; rerun `backend/tests/social/checkins.test.ts`, `backend/tests/buddies/identity.test.ts`, `mobile/__tests__/lib/buddyCopy.test.ts`

**Interfaces:**
- Consumes: `sanitiseDisplayName` (`src/buddies/identity.ts`); `limitOrThrow`, `BuddyError` (`src/buddies/errors.ts`);
  `nextSunrise` (Task 2); `Circle` (Task 3).
- Produces:
  - `campNotes.ts`: `CAMP_NOTE_MAX = 40`, `interface CampNoteDTO { text: string; createdAt: string; expiresAt: string }`,
    `checkCampNote(raw: unknown): string | null`, `noteIsLive(note: { authorId: string; createdAt: Date; expiresAt: Date }, circle: Circle, now: Date): boolean`,
    `shareCampNote(userId, raw: unknown, now): Promise<CampNoteDTO>` (rate-limited, fails closed; the upsert sets
    `createdAt = now` on replace too, on purpose), `clearCampNote(userId): Promise<void>` (never rate-limited, never
    fails closed: removing your own note always works).
  - `RATE_LIMITS.campNote = { name: 'camp_note', limit: 20, windowSeconds: 3600 }` — spent by shares only.
  - Error code `invalid_note: 400` (mobile words: "Notes are 1 to 40 characters.").
  - `saveCheckIn` also deletes the author's camp notes written at or before that day's first check-in.
  - Routes `PUT /me/camp/note { text }` → `{ note: CampNoteDTO }`; `DELETE /me/camp/note` → 204.

- [ ] **Step 1: Write the failing test**

`backend/tests/social/campNotes.test.ts`:

```ts
import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import * as rateLimit from '../../src/lib/rateLimit';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { CAMP_NOTE_MAX, checkCampNote, clearCampNote, shareCampNote } from '../../src/social/campNotes';
import { saveCheckIn } from '../../src/social/checkins';
import { api, buddyUser } from '../buddies/helpers';

beforeAll(() => migrateTestDb());
afterEach(() => jest.restoreAllMocks());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

const LA = 'America/Los_Angeles';
const NIGHT = new Date('2026-10-08T05:30:00Z'); // Oct 7, 22:30 in Los Angeles

it('sanitises like a display name: NFC, controls and zero-widths out, trimmed, 1–40 code points, no reserved-word check', () => {
  expect(checkCampNote('  bed soon  ')).toBe('bed soon');
  expect(checkCampNote('night\nall')).toBe('nightall');
  expect(checkCampNote('é')).toBe('é');
  expect(checkCampNote('​ ‍')).toBeNull();
  expect(checkCampNote('')).toBeNull();
  expect(checkCampNote(42)).toBeNull();
  expect(checkCampNote('x'.repeat(CAMP_NOTE_MAX))).toBe('x'.repeat(40));
  expect(checkCampNote('x'.repeat(41))).toBeNull();
  expect(checkCampNote('🔥'.repeat(40))).toBe('🔥'.repeat(40)); // code points, not UTF-16 units
  expect(checkCampNote('🔥'.repeat(41))).toBeNull();
  expect(checkCampNote('admin says night')).toBe('admin says night');
  // No link or mention filter in S2 (reports arrive in S3).
  expect(checkCampNote('see example.com @sam')).toBe('see example.com @sam');
});

it('keeps one note per author that clears at the next 06:00 in their zone; sharing again replaces it; clear removes it', async () => {
  const me = await buddyUser({ timezone: LA });
  expect(await shareCampNote(me.id, ' bed soon ', NIGHT)).toEqual({ text: 'bed soon', createdAt: NIGHT.toISOString(), expiresAt: '2026-10-08T13:00:00.000Z' });
  const morning = new Date('2026-10-08T14:00:00Z'); // Oct 8, 07:00
  expect(await shareCampNote(me.id, 'up early', morning)).toEqual({ text: 'up early', createdAt: morning.toISOString(), expiresAt: '2026-10-09T13:00:00.000Z' });
  expect(await prisma.campNote.findMany({ where: { authorId: me.id }, select: { text: true } })).toEqual([{ text: 'up early' }]);
  await clearCampNote(me.id);
  expect(await prisma.campNote.count({ where: { authorId: me.id } })).toBe(0);
  await expect(clearCampNote(me.id)).resolves.toBeUndefined(); // nothing to clear: fine
});

it('refuses an invalid note and stores nothing', async () => {
  const me = await buddyUser();
  await expect(shareCampNote(me.id, '   ', NIGHT)).rejects.toMatchObject({ code: 'invalid_note' });
  await expect(shareCampNote(me.id, 'x'.repeat(41), NIGHT)).rejects.toMatchObject({ code: 'invalid_note' });
  await expect(shareCampNote(me.id, undefined, NIGHT)).rejects.toMatchObject({ code: 'invalid_note' });
  expect(await prisma.campNote.count({ where: { authorId: me.id } })).toBe(0);
});

it("the author's first check-in of the day clears a note written before it; a note written after survives an edit", async () => {
  const me = await buddyUser({ timezone: LA });
  await shareCampNote(me.id, 'night all', NIGHT);
  await saveCheckIn(me.id, 'RESTED', new Date('2026-10-08T14:00:00Z')); // Oct 8, 07:00: the day's first check-in
  expect(await prisma.campNote.count({ where: { authorId: me.id } })).toBe(0);
  await shareCampNote(me.id, 'coffee first', new Date('2026-10-08T14:30:00Z'));
  await saveCheckIn(me.id, 'OKAY', new Date('2026-10-08T15:00:00Z')); // an edit of that day's check-in
  expect(await prisma.campNote.findMany({ where: { authorId: me.id }, select: { text: true } })).toEqual([{ text: 'coffee first' }]);
});

it('spends the 20-an-hour bucket on sharing only, failing closed', async () => {
  const me = await buddyUser();
  const spy = jest.spyOn(rateLimit, 'consumeRateLimit').mockResolvedValueOnce('limited').mockResolvedValueOnce('unavailable');
  await expect(shareCampNote(me.id, 'hi', NIGHT)).rejects.toMatchObject({ code: 'rate_limited' });
  await expect(shareCampNote(me.id, 'hi', NIGHT)).rejects.toMatchObject({ code: 'try_later' });
  expect(spy).toHaveBeenCalledTimes(2);
  expect(spy).toHaveBeenCalledWith(rateLimit.RATE_LIMITS.campNote, me.id);
  expect(rateLimit.RATE_LIMITS.campNote).toEqual({ name: 'camp_note', limit: 20, windowSeconds: 3600 });
  expect(await prisma.campNote.count({ where: { authorId: me.id } })).toBe(0);
});

it('clearing my own note never touches the bucket, and works while the limiter is down or spent', async () => {
  const me = await buddyUser();
  await prisma.campNote.create({ data: { authorId: me.id, text: 'mine', expiresAt: new Date('2026-10-08T13:00:00Z') } });
  const spy = jest.spyOn(rateLimit, 'consumeRateLimit').mockRejectedValue(new Error('redis down'));
  await expect(clearCampNote(me.id)).resolves.toBeUndefined();
  expect(spy).not.toHaveBeenCalled();
  expect(await prisma.campNote.count({ where: { authorId: me.id } })).toBe(0);
  // Through the route too, with the bucket spent.
  spy.mockResolvedValue('limited');
  await prisma.campNote.create({ data: { authorId: me.id, text: 'again', expiresAt: new Date('2026-10-08T13:00:00Z') } });
  const res = await (await api()).delete('/me/camp/note').set(await authHeaderFor(me.id));
  expect(res.status).toBe(204);
  expect(spy).not.toHaveBeenCalled();
  expect(await prisma.campNote.count({ where: { authorId: me.id } })).toBe(0);
});

it('the 21st share in an hour is rate_limited, and clearing still works', async () => {
  const me = await buddyUser();
  // One fixed clock for every call: all 21 land in the same hourly window.
  jest.spyOn(Date, 'now').mockReturnValue(Date.now());
  for (let i = 0; i < 20; i++) await shareCampNote(me.id, `note ${i}`, NIGHT);
  await expect(shareCampNote(me.id, 'one more', NIGHT)).rejects.toMatchObject({ code: 'rate_limited' });
  await clearCampNote(me.id);
  expect(await prisma.campNote.count({ where: { authorId: me.id } })).toBe(0);
});

it('never logs the note text', async () => {
  const me = await buddyUser();
  const spies = (['log', 'info', 'warn', 'error'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
  await shareCampNote(me.id, 'secret campfire words', NIGHT);
  await expect(shareCampNote(me.id, 'secret campfire words but far too long to fit', NIGHT)).rejects.toMatchObject({ code: 'invalid_note' });
  for (const spy of spies) for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain('secret campfire');
});

it('routes: PUT shares (200 { note }), an invalid one is 400 invalid_note, DELETE is 204, and auth is required', async () => {
  const me = await buddyUser();
  const agent = await api();
  const headers = await authHeaderFor(me.id);
  const put = await agent.put('/me/camp/note').set(headers).send({ text: ' night all ' });
  expect([put.status, put.body.note.text]).toEqual([200, 'night all']);
  expect(Object.keys(put.body.note).sort()).toEqual(['createdAt', 'expiresAt', 'text']);
  const bad = await agent.put('/me/camp/note').set(headers).send({ text: '' });
  expect([bad.status, bad.body]).toEqual([400, { error: 'invalid_note' }]);
  expect((await agent.put('/me/camp/note').set(headers).send({})).body).toEqual({ error: 'invalid_note' });
  expect((await agent.delete('/me/camp/note').set(headers)).status).toBe(204);
  expect(await prisma.campNote.count({ where: { authorId: me.id } })).toBe(0);
  expect((await agent.put('/me/camp/note').send({ text: 'hi' })).status).toBe(401);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bash .superpowers/sdd/2026-10-07-social-s2-campfire/backend-jest.sh tests/social/campNotes.test.ts`
Expected: FAIL — "Cannot find module '../../src/social/campNotes'".

- [ ] **Step 3: The shared pieces**

`backend/src/buddies/identity.ts` — export the visible-character check (no other change):

```ts
/** At least one letter, number, symbol or punctuation mark; the braille blank (U+2800, a symbol) does not count. */
export function hasVisibleCharacter(text: string): boolean {
```

`backend/src/lib/rateLimit.ts` — add to `RATE_LIMITS` after `handle: …,`:

```ts
  campNote: { name: 'camp_note', limit: 20, windowSeconds: 60 * 60 },
```

`backend/src/buddies/errors.ts` — after `undo_expired: 409,` add:

```ts
  invalid_note: 400,
```

`mobile/src/lib/buddyCopy.ts` — in `ERRORS`, after `undo_expired: …,` add:

```ts
  invalid_note: 'Notes are 1 to 40 characters.',
```

- [ ] **Step 4: Write `campNotes.ts`**

`backend/src/social/campNotes.ts`:

```ts
// Camp notes (spec 2026-10-07 social §6.3): one short note per author, shown in a speech bubble over their coach on
// the Campfire page. Sanitised like a display name (NFC; controls and format characters removed, so no newlines;
// trimmed; no reserved-word check), 1–40 code points with something visible. Sharing replaces the note. It clears
// at the next 06:00 in the author's zone or at their first check-in of a day at or after it, whichever is first
// (saveCheckIn deletes it; reads hide it too); expired rows are hidden at read time and deleted by the social sweep.
// 20 shares an hour per author, failing closed; clearing your own note is never limited and never fails closed.
// URLs and @handles are allowed in S2; reporting a note arrives in S3. No push.
// The text is user free text: never logged (not even its length), never sent to the coach, and never part of
// /me/social, the timeline, story frames or highlights. Only GET /me/camp returns it (camp.ts).

import { prisma } from '../db/client';
import { BuddyError, limitOrThrow } from '../buddies/errors';
import { hasVisibleCharacter, sanitiseDisplayName } from '../buddies/identity';
import { RATE_LIMITS } from '../lib/rateLimit';
import type { Circle } from './circle';
import { nextSunrise } from './night';

export const CAMP_NOTE_MAX = 40;

export interface CampNoteDTO { text: string; createdAt: string; expiresAt: string }

/** The text to store, or null when it is not a valid note. */
export function checkCampNote(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = sanitiseDisplayName(raw);
  const length = [...text].length;
  return length >= 1 && length <= CAMP_NOTE_MAX && hasVisibleCharacter(text) ? text : null;
}

/** Live = not expired, and not cleared by its author's check-in at or after it. */
export function noteIsLive(note: { authorId: string; createdAt: Date; expiresAt: Date }, circle: Circle, now: Date): boolean {
  if (note.expiresAt.getTime() <= now.getTime()) return false;
  const checkIn = circle.checkIns.get(note.authorId);
  return !checkIn || checkIn.createdAt.getTime() < note.createdAt.getTime();
}

export async function shareCampNote(userId: string, raw: unknown, now: Date): Promise<CampNoteDTO> {
  const text = checkCampNote(raw);
  if (text === null) throw new BuddyError('invalid_note');
  await limitOrThrow(RATE_LIMITS.campNote, userId);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  if (!user) throw new BuddyError('not_buddies');
  const expiresAt = nextSunrise(now, user.timezone);
  const row = await prisma.campNote.upsert({
    where: { authorId: userId },
    create: { authorId: userId, text, createdAt: now, expiresAt },
    // createdAt is overwritten with `now` on purpose: a replaced note is a new note, and the clear-on-check-in rule
    // (saveCheckIn, noteIsLive) compares createdAt with the day's first check-in.
    update: { text, createdAt: now, expiresAt },
    select: { text: true, createdAt: true, expiresAt: true },
  });
  return { text: row.text, createdAt: row.createdAt.toISOString(), expiresAt: row.expiresAt.toISOString() };
}

/** Removing your own note always works: no rate limit, so a limiter outage never keeps words up. */
export async function clearCampNote(userId: string): Promise<void> {
  await prisma.campNote.deleteMany({ where: { authorId: userId } });
}
```

- [ ] **Step 5: A check-in clears older notes**

In `backend/src/social/checkins.ts`, replace the body of `saveCheckIn` from `const row = await prisma.checkIn.upsert({`
to the end of the function with:

```ts
  const row = await prisma.checkIn.upsert({
    where: { authorId_localDate: { authorId: userId, localDate } },
    create: { authorId: userId, localDate, mood: mood as CheckInMood, createdAt: now },
    update: { mood: mood as CheckInMood },
    select: { mood: true, localDate: true, createdAt: true, updatedAt: true },
  });
  // A camp note clears when its author checks in (spec §6.3): notes written at or before the day's first check-in
  // go; one written after it survives later edits of that check-in.
  await prisma.campNote.deleteMany({ where: { authorId: userId, createdAt: { lte: row.createdAt } } });
  return toCheckInDTO(row);
}
```

and add to the file header comment: `// Checking in also clears the author's older camp note (spec §6.3).`

- [ ] **Step 6: Add the routes**

In `backend/src/social/routes.ts` add `import { clearCampNote, shareCampNote } from './campNotes';` and append:

```ts
socialRouter.put('/me/camp/note', requireAuth, buddyRoute(async (req, res) => {
  res.json({ note: await shareCampNote(req.userId!, (req.body as { text?: unknown } | undefined)?.text, new Date()) });
}));

socialRouter.delete('/me/camp/note', requireAuth, buddyRoute(async (req, res) => {
  await clearCampNote(req.userId!);
  res.status(204).end();
}));
```

- [ ] **Step 7: Run the tests**

Run: `bash .superpowers/sdd/2026-10-07-social-s2-campfire/backend-jest.sh tests/social/campNotes.test.ts tests/social/checkins.test.ts tests/buddies/identity.test.ts`
Expected: PASS.
Run: `grep -rn "console\.\|log(" backend/src backend/scripts | grep -in "note\|text\|body"` — Expected: no hit logs a
camp note, a `text` field or a request body anywhere in the backend (not only `src/social`); read any hit to confirm.
Run (from `mobile/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/lib/buddyCopy.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/social/campNotes.ts backend/src/social/checkins.ts backend/src/social/routes.ts backend/src/buddies/identity.ts backend/src/buddies/errors.ts backend/src/lib/rateLimit.ts backend/tests/social/campNotes.test.ts mobile/src/lib/buddyCopy.ts
git commit -m "feat(social): camp notes: sanitised, 40 characters, until sunrise or the next check-in, shares rate limited"
```

---

### Task 6: The camp view — `GET /me/camp`

**Files:**
- Create: `backend/src/social/camp.ts`
- Modify: `backend/src/social/routes.ts`
- Test: `backend/tests/social/camp.test.ts`

**Interfaces:**
- Consumes: `loadCircle`, `Circle` (incl. `pairedAt`, `viewerBedtimeGoal`), `GoodnightRow` (Task 3); `toGoodnightDTO`,
  `GoodnightDTO`, `sayGoodnight` (Task 4); `noteIsLive` (Task 5); `campOnEvening`, `countLitNights`, `eveningDate`,
  `fireSegments`, `goodnightOpensAt`, `isGoodnightOpen`, `isNight`, `NOON_HOUR`, `SUNRISE_HOUR` (Task 2); `mondayOf`,
  `localHourOrUtc` (`src/recap/periods.ts`); `unpair`, `block` (`src/buddies/relations.ts`).
- Produces (`camp.ts`):
  - `interface CampMemberDTO { person: PersonDTO; mine: boolean; asleep: boolean; asleepSince: string | null; onTime: boolean | null; note: string | null }`
  - `interface CampDTO { night: boolean; members: CampMemberDTO[]; fire: { lit: number; of: number; segments: number }; nightsLitThisWeek: number; goodnight: GoodnightDTO | null; goodnightOpen: boolean; goodnightOpensAt: string }`
    (`night` = the scene, 19:00–05:59 in my zone; `goodnightOpen` / `goodnightOpensAt` = my own goodnight window,
    "HH:MM" local; `fire` = tonight's live camp; `nightsLitThisWeek` = each night against that night's camp,
    `campOnEvening`)
  - `interface SleepState { asleep: boolean; since: GoodnightRow | null; tonight: GoodnightRow | null }`,
    `sleepStates(circle, now): Map<string, SleepState>` (pure)
  - `interface CampSummary { night: boolean; awake: number; asleep: number; goodnight: GoodnightDTO | null; goodnightOpen: boolean; goodnightOpensAt: string }`,
    `campSummaryFor(circle, now): CampSummary` (pure; Task 8 puts it on `/me/social`)
  - `getCamp(viewerId, now): Promise<CampDTO>`; route `GET /me/camp` (no-store).

- [ ] **Step 1: Write the failing test**

`backend/tests/social/camp.test.ts`:

```ts
import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { block, unpair } from '../../src/buddies/relations';
import { deleteUserAccount } from '../../src/users/deletion';
import { campSummaryFor, getCamp } from '../../src/social/camp';
import { loadCircle } from '../../src/social/circle';
import { sayGoodnight } from '../../src/social/goodnight';
import { api, buddyUser, pairUp } from '../buddies/helpers';

jest.mock('../../src/health/client');

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

const LA = 'America/Los_Angeles'; // PDT, UTC−7
const NIGHT = new Date('2026-10-08T05:30:00Z'); // Wed Oct 7, 22:30 in Los Angeles (Thu 18:30 in Auckland)
const SUNRISE = new Date('2026-10-08T13:00:00Z');
/** Pairs made long before this week: they count on every night of it. */
const BEFORE = new Date('2026-09-01T00:00:00Z');
const noop = { deleteSubscription: async () => {}, revokeToken: async () => {}, log: () => {} };
const gn = (authorId: string, localDate: string, at: Date, onTime = true) =>
  prisma.goodnight.create({ data: { authorId, localDate: civilDateToUtcMidnight(localDate), at, onTime } });
const note = (authorId: string, text: string, createdAt: Date, expiresAt = SUNRISE) =>
  prisma.campNote.create({ data: { authorId, text, createdAt, expiresAt } });

it("shows me first, then buddies by latest activity, asleep or awake, with their live notes — never a stranger's", async () => {
  const me = await buddyUser({ timezone: LA, displayName: 'Me' });
  const sam = await buddyUser({ timezone: LA, displayName: 'Sam' });
  const ana = await buddyUser({ timezone: 'Pacific/Auckland', displayName: 'Ana' });
  const ben = await buddyUser({ timezone: LA, displayName: 'Ben' });
  const stranger = await buddyUser({ timezone: LA });
  for (const b of [sam, ana, ben]) await pairUp(me.id, b.id);
  await gn(sam.id, '2026-10-07', new Date('2026-10-08T05:00:00Z')); // 22:00, on time
  await note(sam.id, 'on time tonight', new Date('2026-10-08T04:50:00Z'));
  await note(ana.id, 'day 6 of 7', new Date('2026-10-08T05:10:00Z'), new Date('2026-10-08T17:00:00Z'));
  await note(stranger.id, 'not for you', new Date('2026-10-08T05:20:00Z'));
  await note(ben.id, 'old news', new Date('2026-10-07T04:00:00Z'), new Date('2026-10-07T13:00:00Z')); // expired

  const camp = await getCamp(me.id, NIGHT);
  expect(camp.night).toBe(true);
  expect(camp.members.map((m) => [m.person.id, m.mine, m.asleep, m.onTime, m.note])).toEqual([
    [me.id, true, false, null, null],
    [ana.id, false, false, null, 'day 6 of 7'], // her note at 05:10 is the latest activity
    [sam.id, false, true, true, 'on time tonight'], // asleep keeps the bubble
    [ben.id, false, false, null, null],
  ]);
  expect(camp.members[2]!.asleepSince).toBe('2026-10-08T05:00:00.000Z');
  expect(camp.fire).toEqual({ lit: 1, of: 4, segments: 2 });
  expect(camp.goodnight).toBeNull();
  const json = JSON.stringify(camp);
  expect(json).not.toContain('not for you');
  expect(json).not.toContain('old news');
  expect(camp.goodnightOpen).toBe(true);
  expect(camp.goodnightOpensAt).toBe('20:00');
  expect(campSummaryFor(await loadCircle(me.id, NIGHT), NIGHT)).toEqual({
    night: true, awake: 3, asleep: 1, goodnight: null, goodnightOpen: true, goodnightOpensAt: '20:00',
  });
});

it('my goodnight window follows my own goal: open at 17:30 with an 18:00 goal while the scene is still day', async () => {
  const me = await buddyUser({ timezone: LA });
  await prisma.user.update({ where: { id: me.id }, data: { bedtimeGoal: '18:00' } });
  const other = await buddyUser({ timezone: LA });
  const halfFive = new Date('2026-10-08T00:30:00Z'); // Oct 7, 17:30
  expect(await getCamp(me.id, halfFive)).toMatchObject({ night: false, goodnightOpen: true, goodnightOpensAt: '17:00' });
  expect(await getCamp(other.id, halfFive)).toMatchObject({ night: false, goodnightOpen: false, goodnightOpensAt: '20:00' });
  // No goal at 19:30: the scene is night, the window is not open yet.
  expect(await getCamp(other.id, new Date('2026-10-08T02:30:00Z'))).toMatchObject({ night: true, goodnightOpen: false });
});

it('an Auckland buddy sleeps by her own clock and is judged by her own goal while I am in Los Angeles', async () => {
  const me = await buddyUser({ timezone: LA });
  const ana = await buddyUser({ timezone: 'Pacific/Auckland' });
  await prisma.user.update({ where: { id: ana.id }, data: { bedtimeGoal: '21:30' } });
  await pairUp(me.id, ana.id, BEFORE);
  // Her 22:00 NZDT on Thu Oct 8 (2026-10-08T09:00Z; my Thu 02:00): late by her 21:30 goal, though on time by 23:00.
  const said = await sayGoodnight(ana.id, new Date('2026-10-08T09:00:00Z'));
  expect([said.localDate, said.onTime]).toEqual(['2026-10-08', false]);
  const anaAt = async (now: Date) => (await getCamp(me.id, now)).members.find((m) => m.person.id === ana.id)!;
  // My 02:30, night: she is asleep, and her flag is the one her goal gave.
  const myNight = new Date('2026-10-08T09:30:00Z');
  expect((await getCamp(me.id, myNight)).night).toBe(true);
  expect(await anaAt(myNight)).toMatchObject({ asleep: true, asleepSince: '2026-10-08T09:00:00.000Z', onTime: false });
  // My 13:00 is her Fri 09:00: still her morning, not checked in, so still asleep.
  expect(await anaAt(new Date('2026-10-08T20:00:00Z'))).toMatchObject({ asleep: true });
  // My 16:00 is her noon: awake.
  expect(await anaAt(new Date('2026-10-08T23:00:00Z'))).toMatchObject({ asleep: false, asleepSince: null, onTime: null });
});

it("at my 05:30 it is still my night, while an Auckland buddy's tonight is already the next evening", async () => {
  const me = await buddyUser({ timezone: LA });
  const ana = await buddyUser({ timezone: 'Pacific/Auckland' });
  await pairUp(me.id, ana.id, BEFORE);
  await gn(ana.id, '2026-10-08', new Date('2026-10-08T09:00:00Z')); // her Thu 22:00, on time
  const dawn = new Date('2026-10-08T12:30:00Z'); // my Thu 05:30 (the evening of Oct 7); her Fri 01:30 (the evening of Oct 8)
  const camp = await getCamp(me.id, dawn);
  expect(camp.night).toBe(true);
  expect(camp.members.find((m) => m.person.id === ana.id)).toMatchObject({ asleep: true, onTime: true });
  // Her own tonight (Oct 8) lights tonight's fire, though my evening is still Oct 7.
  expect(camp.fire).toEqual({ lit: 1, of: 2, segments: 3 });
});

it('my own goodnight comes back for Undo and puts my coach to sleep', async () => {
  const me = await buddyUser({ timezone: LA });
  const said = await sayGoodnight(me.id, NIGHT); // no goal: 22:30 is on time
  const camp = await getCamp(me.id, NIGHT);
  expect(camp.goodnight).toEqual(said);
  expect(camp.members[0]).toMatchObject({ mine: true, asleep: true, onTime: true });
  expect(camp.fire).toEqual({ lit: 1, of: 1, segments: 5 });
});

it('a coach stays asleep into the morning until its owner checks in or it is noon; a check-in hides an older note', async () => {
  const me = await buddyUser({ timezone: LA });
  const sam = await buddyUser({ timezone: LA });
  await pairUp(me.id, sam.id);
  await gn(sam.id, '2026-10-07', new Date('2026-10-08T05:00:00Z'));
  await note(sam.id, 'night all', new Date('2026-10-08T05:01:00Z'), new Date('2026-10-09T13:00:00Z'));
  const samAt = async (now: Date) => (await getCamp(me.id, now)).members.find((m) => m.person.id === sam.id)!;
  const morning = new Date('2026-10-08T15:00:00Z'); // Oct 8, 08:00
  expect(await samAt(morning)).toMatchObject({ asleep: true, onTime: true, asleepSince: '2026-10-08T05:00:00.000Z', note: 'night all' });
  expect((await getCamp(me.id, morning)).night).toBe(false);
  expect(await samAt(new Date('2026-10-08T19:00:00Z'))).toMatchObject({ asleep: false, asleepSince: null, onTime: null }); // 12:00
  // Written straight to the table (no saveCheckIn), so only the read-time rule hides the note.
  await prisma.checkIn.create({ data: { authorId: sam.id, localDate: civilDateToUtcMidnight('2026-10-08'), mood: 'RESTED', createdAt: new Date('2026-10-08T14:30:00Z') } });
  expect(await samAt(morning)).toMatchObject({ asleep: false, note: null });
});

it("counts this week's nights whose fire reached 3 segments (Mon–Sun of my evening); pairing today never unlights Monday", async () => {
  const me = await buddyUser({ timezone: LA });
  const a = await buddyUser({ timezone: LA });
  const b = await buddyUser({ timezone: LA });
  const c = await buddyUser({ timezone: LA });
  for (const u of [a, b, c]) await pairUp(me.id, u.id, BEFORE);
  // A camp of 4. Mon Oct 5: 2 on time (3 segments, lit). Tue: 1 on time, 1 late (2). Wed, tonight: 3 (4, lit).
  // Sun Oct 4: another week.
  for (const u of [me, a]) await gn(u.id, '2026-10-05', new Date('2026-10-06T05:00:00Z'));
  await gn(a.id, '2026-10-06', new Date('2026-10-07T05:00:00Z'));
  await gn(b.id, '2026-10-06', new Date('2026-10-07T05:10:00Z'), false);
  for (const u of [a, b, c]) await gn(u.id, '2026-10-07', new Date('2026-10-08T05:00:00Z'));
  for (const u of [me, a, b, c]) await gn(u.id, '2026-10-04', new Date('2026-10-05T05:00:00Z'));
  const before = await getCamp(me.id, NIGHT);
  expect(before.nightsLitThisWeek).toBe(2);
  expect(before.fire).toEqual({ lit: 3, of: 4, segments: 4 });

  // Two buddies pair with me tonight at 22:30, after this evening's 19:00. Tonight's fire is live and grows its camp
  // to 6; past nights are frozen: Monday stays 2 of 4 (counted against 6 it would be 2 segments, unlit) and tonight's
  // lit night is judged against its 19:00 camp of 4.
  for (let i = 0; i < 2; i++) await pairUp(me.id, (await buddyUser({ timezone: LA })).id, NIGHT);
  const after = await getCamp(me.id, NIGHT);
  expect(after.fire).toEqual({ lit: 3, of: 6, segments: 3 });
  expect(after.nightsLitThisWeek).toBe(2);
});

it("an unpaired or blocked buddy leaves my camp at once, and I leave theirs; a deleted account takes its note", async () => {
  const me = await buddyUser({ timezone: LA });
  const sam = await buddyUser({ timezone: LA });
  const ana = await buddyUser({ timezone: LA });
  const kai = await buddyUser({ timezone: LA });
  for (const u of [sam, ana, kai]) await pairUp(me.id, u.id);
  await note(me.id, 'my note', new Date('2026-10-08T05:00:00Z'));
  await note(sam.id, 'sam note', new Date('2026-10-08T05:00:00Z'));
  await note(ana.id, 'ana note', new Date('2026-10-08T05:00:00Z'));
  await note(kai.id, 'kai note', new Date('2026-10-08T05:00:00Z'));
  await unpair(me.id, sam.id, NIGHT);
  await block(me.id, ana.id, NIGHT);
  const mine = await getCamp(me.id, NIGHT);
  expect(mine.members.map((m) => m.person.id)).toEqual([me.id, kai.id]);
  expect(JSON.stringify(mine)).not.toMatch(/sam note|ana note/);
  for (const ex of [sam, ana]) {
    const theirs = await getCamp(ex.id, NIGHT);
    expect(theirs.members.map((m) => m.person.id)).toEqual([ex.id]);
    expect(JSON.stringify(theirs)).not.toContain('my note');
  }
  await deleteUserAccount(kai.id, noop);
  expect(await prisma.campNote.count({ where: { authorId: kai.id } })).toBe(0);
  expect((await getCamp(me.id, NIGHT)).members.map((m) => m.person.id)).toEqual([me.id]);
});

it('GET /me/camp is never cached, has the documented shape, and needs a session', async () => {
  const me = await buddyUser();
  const agent = await api();
  const res = await agent.get('/me/camp').set(await authHeaderFor(me.id));
  expect([res.status, res.headers['cache-control']]).toEqual([200, 'private, no-store']);
  expect(Object.keys(res.body).sort()).toEqual(['fire', 'goodnight', 'goodnightOpen', 'goodnightOpensAt', 'members', 'night', 'nightsLitThisWeek']);
  expect(Object.keys(res.body.members[0]).sort()).toEqual(['asleep', 'asleepSince', 'mine', 'note', 'onTime', 'person']);
  expect((await agent.get('/me/camp')).status).toBe(401);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bash .superpowers/sdd/2026-10-07-social-s2-campfire/backend-jest.sh tests/social/camp.test.ts`
Expected: FAIL — "Cannot find module '../../src/social/camp'".

- [ ] **Step 3: Write `camp.ts`**

`backend/src/social/camp.ts`:

```ts
// The Campfire page (spec 2026-10-07 social §6). Your camp = you + your current buddies (the preloaded circle; a
// block deletes the pair, so an unpaired or blocked person — their coach, goodnight and camp note — is gone from
// your camp on the next read, and you from theirs). Asleep = a goodnight for the member's current evening, or for
// last evening between 06:00 and 11:59 local until they check in (plan ruling). Night or day (the scene, 19:00–05:59)
// follows the VIEWER's zone; my goodnight window (from min(20:00, my goal − 60 min) to 05:59) follows my zone and my
// goal; each member's "tonight" follows their own zone. Tonight's fire = members in bed on time ÷ the live camp.
// "Nights lit this week" judges each night against that night's camp — me plus the buddies paired by its 19:00 in my
// zone — so a past night is frozen (owner ruling Q2). Camp note text is user free text: returned only here, to the
// author and the author's current buddies, and never logged.

import { civilDateToUtcMidnight, localCivilDateOrUtc } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import type { PersonDTO } from '../buddies/people';
import { localHourOrUtc, mondayOf } from '../recap/periods';
import { shiftDate } from '../scoring/dates';
import { noteIsLive } from './campNotes';
import { loadCircle, type Circle, type GoodnightRow } from './circle';
import { toGoodnightDTO, type GoodnightDTO } from './goodnight';
import {
  campOnEvening, countLitNights, eveningDate, fireSegments, goodnightOpensAt, isGoodnightOpen, isNight, NOON_HOUR, SUNRISE_HOUR,
} from './night';

export interface CampMemberDTO {
  person: PersonDTO;
  mine: boolean;
  asleep: boolean;
  /** When the goodnight that keeps them asleep was said. */
  asleepSince: string | null;
  /** That goodnight's on-time flag; null while awake. */
  onTime: boolean | null;
  /** Their live camp note's text. */
  note: string | null;
}

export interface CampDTO {
  night: boolean;
  /** Me first, then buddies by latest activity (check-in, goodnight or note). */
  members: CampMemberDTO[];
  fire: { lit: number; of: number; segments: number };
  nightsLitThisWeek: number;
  /** My goodnight for tonight (the app offers Undo while it is fresh). */
  goodnight: GoodnightDTO | null;
  /** Whether my "Say goodnight" window is open now (my zone, my goal). */
  goodnightOpen: boolean;
  /** When my window opens, "HH:MM" local: min(20:00, my goal − 60 min). */
  goodnightOpensAt: string;
}

export interface SleepState {
  asleep: boolean;
  /** The goodnight that keeps them asleep. */
  since: GoodnightRow | null;
  /** Their goodnight for their current evening (tonight's fire). */
  tonight: GoodnightRow | null;
}

export interface CampSummary {
  night: boolean;
  awake: number;
  asleep: number;
  goodnight: GoodnightDTO | null;
  goodnightOpen: boolean;
  goodnightOpensAt: string;
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** Each member's sleep, from the circle's goodnights and check-ins. Pure. */
export function sleepStates(circle: Circle, now: Date): Map<string, SleepState> {
  const byEvening = new Map(circle.goodnights.map((g) => [`${g.authorId}:${isoDate(g.localDate)}`, g]));
  const states = new Map<string, SleepState>();
  for (const [id, m] of circle.members) {
    const tonight = byEvening.get(`${id}:${eveningDate(now, m.timezone)}`) ?? null;
    const hour = localHourOrUtc(now, m.timezone);
    const morning = hour >= SUNRISE_HOUR && hour < NOON_HOUR && !circle.checkIns.has(id);
    const lastNight = morning ? byEvening.get(`${id}:${shiftDate(localCivilDateOrUtc(now, m.timezone), -1)}`) ?? null : null;
    const since = tonight ?? lastNight;
    states.set(id, { asleep: since !== null, since, tonight });
  }
  return states;
}

/** What the camp banner and the evening timeline need, from the circle alone (no query). */
export function campSummaryFor(circle: Circle, now: Date): CampSummary {
  const states = sleepStates(circle, now);
  const asleep = [...states.values()].filter((s) => s.asleep).length;
  const mine = states.get(circle.viewer.person.id)?.tonight ?? null;
  const { timezone } = circle.viewer;
  return {
    night: isNight(now, timezone),
    awake: states.size - asleep,
    asleep,
    goodnight: mine ? toGoodnightDTO(mine) : null,
    goodnightOpen: isGoodnightOpen(now, timezone, circle.viewerBedtimeGoal),
    goodnightOpensAt: goodnightOpensAt(circle.viewerBedtimeGoal),
  };
}

export async function getCamp(viewerId: string, now: Date): Promise<CampDTO> {
  const circle = await loadCircle(viewerId, now);
  const ids = [...circle.members.keys()];
  const tonightDate = eveningDate(now, circle.viewer.timezone);
  const weekStart = mondayOf(tonightDate);
  const [notes, week] = await Promise.all([
    prisma.campNote.findMany({ where: { authorId: { in: ids }, expiresAt: { gt: now } }, select: { authorId: true, text: true, createdAt: true, expiresAt: true } }),
    prisma.goodnight.findMany({
      where: { authorId: { in: ids }, onTime: true, localDate: { gte: civilDateToUtcMidnight(weekStart), lte: civilDateToUtcMidnight(shiftDate(weekStart, 6)) } },
      select: { authorId: true, localDate: true },
    }),
  ]);
  const states = sleepStates(circle, now);
  const noteOf = new Map(notes.filter((n) => noteIsLive(n, circle, now)).map((n) => [n.authorId, n]));
  const lastActive = (id: string) => Math.max(
    circle.checkIns.get(id)?.createdAt.getTime() ?? 0,
    states.get(id)?.since?.at.getTime() ?? 0,
    noteOf.get(id)?.createdAt.getTime() ?? 0,
  );
  const buddies = [...circle.buddies].sort((a, b) => lastActive(b.person.id) - lastActive(a.person.id) || a.person.id.localeCompare(b.person.id));
  const members = [circle.viewer, ...buddies].map((m): CampMemberDTO => {
    const s = states.get(m.person.id)!;
    return {
      person: m.person,
      mine: m.person.id === viewerId,
      asleep: s.asleep,
      asleepSince: s.since ? s.since.at.toISOString() : null,
      onTime: s.since ? s.since.onTime : null,
      note: noteOf.get(m.person.id)?.text ?? null,
    };
  });
  // Tonight's fire is the live camp: everyone here now.
  const lit = [...states.values()].filter((s) => s.tonight?.onTime === true).length;
  const of = circle.members.size;
  // Each night of the week against that night's camp: me plus the buddies paired by its 19:00 (frozen past nights).
  const campOn = (date: string) => campOnEvening(date, viewerId, circle.pairedAt, circle.viewer.timezone);
  const onTimeThisWeek = week
    .map((g) => ({ authorId: g.authorId, date: isoDate(g.localDate) }))
    .filter((g) => g.date <= tonightDate);
  const summary = campSummaryFor(circle, now);
  return {
    night: summary.night,
    members,
    fire: { lit, of, segments: fireSegments(lit, of) },
    nightsLitThisWeek: countLitNights(onTimeThisWeek, campOn),
    goodnight: summary.goodnight,
    goodnightOpen: summary.goodnightOpen,
    goodnightOpensAt: summary.goodnightOpensAt,
  };
}
```

- [ ] **Step 4: Add the route**

In `backend/src/social/routes.ts` add `import { getCamp } from './camp';` and append:

```ts
socialRouter.get('/me/camp', requireAuth, buddyRoute(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json(await getCamp(req.userId!, new Date()));
}));
```

- [ ] **Step 5: Run the test**

Run: `bash .superpowers/sdd/2026-10-07-social-s2-campfire/backend-jest.sh tests/social/camp.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/social/camp.ts backend/src/social/routes.ts backend/tests/social/camp.test.ts
git commit -m "feat(social): the camp view: who's here, asleep or awake, notes, tonight's fire, nights lit and my goodnight window"
```

---

### Task 7: Goodnight story frames and the camp's timeline items

**Files:**
- Modify: `backend/src/social/stories.ts`, `backend/src/social/timeline.ts`, `backend/tests/social/homeQueries.test.ts`
- Test: `backend/tests/social/campTimeline.test.ts`

**Interfaces:**
- Consumes: `Circle.goodnights`, `Circle.checkIns` (Task 3); `noteIsLive` (Task 5); `isNight` (Task 2).
- Produces:
  - `StoryFrameDTO` gains `{ kind: 'goodnight'; at: string; onTime: boolean }` (by the author's local date of `at`; never locked).
  - `TimelineItemDTO` gains `(Base & { kind: 'goodnight'; onTime: boolean })` (id `goodnight:<row id>`) and
    `(Base & { kind: 'camp_note' })` (id `camp_note:<authorId>:<createdAt ms>`; never the text; only a live note
    written in its author's night).
  - The home read costs one more query (camp notes in the timeline): the ceiling in `homeQueries.test.ts` becomes 17.

- [ ] **Step 1: Write the failing test**

`backend/tests/social/campTimeline.test.ts`:

```ts
import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { getStory, loadStoryRings } from '../../src/social/stories';
import { buildTimeline } from '../../src/social/timeline';
import { buddyUser, pairUp } from '../buddies/helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

const LA = 'America/Los_Angeles';
const NIGHT = new Date('2026-10-08T05:30:00Z'); // Oct 7, 22:30 in Los Angeles
const day = (d: string) => civilDateToUtcMidnight(d);

async function camp(n: number) {
  const me = await buddyUser({ timezone: LA });
  const others = [];
  for (let i = 0; i < n; i++) {
    const u = await buddyUser({ timezone: LA });
    await pairUp(me.id, u.id);
    others.push(u);
  }
  return { me, others };
}

it("a goodnight is a story frame in the author's day — never locked — and a timeline item with its on-time flag", async () => {
  const { me, others: [sam] } = await camp(1);
  const at = new Date('2026-10-08T05:00:00Z'); // 22:00
  await prisma.goodnight.create({ data: { authorId: sam!.id, localDate: day('2026-10-07'), at, onTime: true } });
  expect((await getStory(me.id, sam!.id, NIGHT)).frames).toEqual([{ kind: 'goodnight', at: at.toISOString(), onTime: true }]);
  // I haven't checked in, yet the goodnight-only ring is not locked.
  expect((await loadStoryRings(me.id, NIGHT)).rings.map((r) => [r.author.id, r.locked, r.frameCount])).toEqual([[sam!.id, false, 1]]);
  const items = await buildTimeline(me.id, NIGHT);
  expect(items).toEqual([{ id: expect.stringMatching(/^goodnight:/), kind: 'goodnight', at: at.toISOString(), actor: expect.objectContaining({ id: sam!.id }), mine: false, onTime: true }]);
});

it("a goodnight after midnight opens the new day's story, and leaves the old one", async () => {
  const { me, others: [sam, ana] } = await camp(2);
  await prisma.goodnight.create({ data: { authorId: sam!.id, localDate: day('2026-10-07'), at: new Date('2026-10-08T07:30:00Z'), onTime: false } }); // 00:30 Oct 8
  await prisma.goodnight.create({ data: { authorId: ana!.id, localDate: day('2026-10-07'), at: new Date('2026-10-08T05:00:00Z'), onTime: true } }); // 22:00 Oct 7
  const oneAm = new Date('2026-10-08T08:00:00Z'); // Oct 8, 01:00
  expect((await getStory(me.id, sam!.id, oneAm)).frames.map((f) => f.kind)).toEqual(['goodnight']);
  expect((await getStory(me.id, ana!.id, oneAm)).frames).toEqual([]);
});

it('lists a camp note written at night as "left a camp note" — never its text — and skips day, expired and cleared notes', async () => {
  const { me, others: [sam, ana, ben, kai] } = await camp(4);
  const sunrise = new Date('2026-10-08T13:00:00Z');
  await prisma.campNote.create({ data: { authorId: sam!.id, text: 'secret words', createdAt: new Date('2026-10-08T05:10:00Z'), expiresAt: sunrise } }); // 22:10
  await prisma.campNote.create({ data: { authorId: ana!.id, text: 'lunch thoughts', createdAt: new Date('2026-10-07T19:00:00Z'), expiresAt: sunrise } }); // 12:00
  await prisma.campNote.create({ data: { authorId: ben!.id, text: 'gone already', createdAt: new Date('2026-10-08T03:00:00Z'), expiresAt: new Date('2026-10-08T04:00:00Z') } });
  await prisma.campNote.create({ data: { authorId: kai!.id, text: 'cleared', createdAt: new Date('2026-10-08T02:30:00Z'), expiresAt: sunrise } }); // 19:30
  await prisma.checkIn.create({ data: { authorId: kai!.id, localDate: day('2026-10-07'), mood: 'OKAY', createdAt: new Date('2026-10-08T03:00:00Z') } }); // after the note
  const items = await buildTimeline(me.id, NIGHT);
  const notes = items.filter((i) => i.kind === 'camp_note');
  expect(notes.map((i) => i.actor.id)).toEqual([sam!.id]);
  expect(Object.keys(notes[0]!).sort()).toEqual(['actor', 'at', 'id', 'kind', 'mine']);
  const json = JSON.stringify(items);
  for (const text of ['secret words', 'lunch thoughts', 'gone already', 'cleared']) expect(json).not.toContain(text);
});

it("an unpaired buddy's goodnight and note leave my timeline", async () => {
  const { me, others: [sam] } = await camp(1);
  await prisma.goodnight.create({ data: { authorId: sam!.id, localDate: day('2026-10-07'), at: new Date('2026-10-08T05:00:00Z'), onTime: true } });
  await prisma.campNote.create({ data: { authorId: sam!.id, text: 'night all', createdAt: new Date('2026-10-08T05:05:00Z'), expiresAt: new Date('2026-10-08T13:00:00Z') } });
  expect((await buildTimeline(me.id, NIGHT)).map((i) => i.kind)).toEqual(['goodnight', 'camp_note']);
  await prisma.buddyPair.deleteMany({ where: { OR: [{ userAId: sam!.id }, { userBId: sam!.id }] } });
  expect(await buildTimeline(me.id, NIGHT)).toEqual([]);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bash .superpowers/sdd/2026-10-07-social-s2-campfire/backend-jest.sh tests/social/campTimeline.test.ts`
Expected: FAIL — no goodnight frame (frames `[]`) and no goodnight / camp_note timeline items.

- [ ] **Step 3: Goodnight frames**

In `backend/src/social/stories.ts`:

Replace the `StoryFrameDTO` type with:

```ts
export type StoryFrameDTO =
  | { kind: 'checkin'; at: string; locked: true }
  | { kind: 'checkin'; at: string; locked: false; mood: CheckInMood }
  | { kind: 'badge'; at: string; family: AchievementFamily; level: number }
  | { kind: 'recap'; at: string; recapId: string; recapKind: 'WEEK' | 'MONTH'; periodStart: string; periodEnd: string; line: string; coachId: string }
  | { kind: 'goodnight'; at: string; onTime: boolean };
```

add to the header comment
`// A goodnight (S2) is a frame of the author's local date of the moment it was said, never locked.`, and in
`loadFrames`, just before `for (const frames of byAuthor.values()) frames.sort(…)`, add:

```ts
  for (const g of circle.goodnights) {
    // By the local date of the moment it was said: a 00:30 goodnight opens the new day's story.
    const today = todayOf.get(g.authorId);
    if (today === undefined || localCivilDateOrUtc(g.at, tzOf.get(g.authorId)!) !== today) continue;
    byAuthor.get(g.authorId)!.push({ kind: 'goodnight', at: iso(g.at), onTime: g.onTime });
  }
```

- [ ] **Step 4: Goodnight and camp-note timeline items**

In `backend/src/social/timeline.ts`:

Add to the header comment:

```ts
// S2: goodnights (with their on-time flag) and camp notes — "left a camp note", never the text — for a live note
// written during its author's night (19:00–05:59 author-local; the spec's "night only").
```

Add the imports:

```ts
import { noteIsLive } from './campNotes';
import { isNight } from './night';
```

Replace the `TimelineItemDTO` type with:

```ts
export type TimelineItemDTO =
  | (Base & { kind: 'checkin'; locked: true })
  | (Base & { kind: 'checkin'; locked: false; mood: CheckInMood })
  | (Base & { kind: 'step_goal' })
  | (Base & { kind: 'badge'; badge: { family: AchievementFamily; level: number } })
  | (Base & { kind: 'sticker'; sticker: StickerKind; to: PersonDTO })
  | (Base & { kind: 'recap_share'; recapKind: 'WEEK' | 'MONTH' })
  | (Base & { kind: 'goodnight'; onTime: boolean })
  | (Base & { kind: 'camp_note' });
```

Replace the `Promise.all` destructuring line `const [checkIns, steps, badges, stickers, shares] = await Promise.all([`
with `const [checkIns, steps, badges, stickers, shares, notes] = await Promise.all([`, and add a sixth query after the
`recapShare.findMany(…)` entry:

```ts
    // Never the text: the timeline only says that a note exists.
    prisma.campNote.findMany({ where: { authorId: { in: ids }, createdAt: { gte: since }, expiresAt: { gt: now } }, select: { authorId: true, createdAt: true, expiresAt: true } }),
```

Before `items.sort(…)`, add:

```ts
  for (const g of circle.goodnights) push(g.authorId, g.at, { id: `goodnight:${g.id}`, kind: 'goodnight', onTime: g.onTime });
  for (const n of notes) {
    const author = members.get(n.authorId);
    if (!author || !isNight(n.createdAt, author.timezone) || !noteIsLive(n, circle, now)) continue;
    push(n.authorId, n.createdAt, { id: `camp_note:${n.authorId}:${n.createdAt.getTime()}`, kind: 'camp_note' });
  }
```

- [ ] **Step 5: The home's query ceiling moves to 17**

In `backend/tests/social/homeQueries.test.ts`, change the test name's `in at most 16 queries` to `in at most 17 queries`,
the comment to `// S1 read ~26: loadCircle 4 + rings 3 + timeline 6 (camp notes since S2) + cached highlights 1 + requests 2 + stickers 1.`
and `toBeLessThanOrEqual(16)` to `toBeLessThanOrEqual(17)`.

- [ ] **Step 6: Run the tests**

Run: `bash .superpowers/sdd/2026-10-07-social-s2-campfire/backend-jest.sh tests/social`
Expected: PASS (the S1 `timeline.test.ts` `ALLOWED` shapes are untouched: its fixtures have no goodnights or notes).

- [ ] **Step 7: Commit**

```bash
git add backend/src/social/stories.ts backend/src/social/timeline.ts backend/tests/social/campTimeline.test.ts backend/tests/social/homeQueries.test.ts
git commit -m "feat(social): goodnight story frames and goodnight and camp-note timeline items, never the note text"
```

---

### Task 8: The Social home carries the camp

**Files:**
- Modify: `backend/src/social/home.ts`, `backend/tests/social/home.test.ts`
- Test: `backend/tests/social/homeCamp.test.ts`

**Interfaces:**
- Consumes: `campSummaryFor` (Task 6); `GoodnightDTO`, `sayGoodnight` (Task 4).
- Produces: `SocialHomeDTO.me = { person; checkIn; goodnight: GoodnightDTO | null }` and
  `SocialHomeDTO.camp = { checkedIn; members; faces; night: boolean; awake: number; asleep: number; goodnightOpen: boolean }`
  (no extra query; `night` = the scene in my zone, 19:00–05:59, for the banner; `goodnightOpen` = my own goodnight
  window, for the evening timeline's button, Task 12).

- [ ] **Step 1: Write the failing test**

`backend/tests/social/homeCamp.test.ts`:

```ts
import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { saveCheckIn } from '../../src/social/checkins';
import { sayGoodnight } from '../../src/social/goodnight';
import { getSocialHome } from '../../src/social/home';
import { buddyUser, pairUp } from '../buddies/helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

const LA = 'America/Los_Angeles';
const NIGHT = new Date('2026-10-08T05:30:00Z'); // Oct 7, 22:30 in Los Angeles

it('at night the camp counts awake and asleep, me.goodnight is mine for Undo, and no note text is in the bundle', async () => {
  const me = await buddyUser({ timezone: LA });
  const sam = await buddyUser({ timezone: LA });
  const ana = await buddyUser({ timezone: LA });
  await pairUp(me.id, sam.id);
  await pairUp(me.id, ana.id);
  await saveCheckIn(sam.id, 'RESTED', new Date('2026-10-07T15:00:00Z')); // 08:00
  await prisma.goodnight.create({ data: { authorId: sam.id, localDate: civilDateToUtcMidnight('2026-10-07'), at: new Date('2026-10-08T05:00:00Z'), onTime: true } });
  await prisma.campNote.create({ data: { authorId: sam.id, text: 'secret words', createdAt: new Date('2026-10-08T05:05:00Z'), expiresAt: new Date('2026-10-08T13:00:00Z') } });

  const before = await getSocialHome(me.id, NIGHT);
  expect(before.camp).toEqual({ checkedIn: 1, members: 3, faces: [expect.any(String)], night: true, awake: 2, asleep: 1, goodnightOpen: true });
  expect(before.me.goodnight).toBeNull();
  const said = await sayGoodnight(me.id, NIGHT);
  const after = await getSocialHome(me.id, NIGHT);
  expect(after.me.goodnight).toEqual(said);
  expect(after.camp).toMatchObject({ awake: 1, asleep: 2 });
  expect(JSON.stringify(after)).not.toContain('secret words');
});

it('by day the camp is not night and everyone is awake', async () => {
  const me = await buddyUser({ timezone: LA });
  const day = new Date('2026-10-07T20:00:00Z'); // 13:00
  expect((await getSocialHome(me.id, day)).camp).toEqual({ checkedIn: 0, members: 1, faces: [], night: false, awake: 1, asleep: 0, goodnightOpen: false });
});

it('the goodnight window is mine: open at 17:30 with an 18:00 goal though not night, closed at 19:30 with no goal though night', async () => {
  const early = await buddyUser({ timezone: LA });
  await prisma.user.update({ where: { id: early.id }, data: { bedtimeGoal: '18:00' } });
  expect((await getSocialHome(early.id, new Date('2026-10-08T00:30:00Z'))).camp).toMatchObject({ night: false, goodnightOpen: true }); // 17:30
  const late = await buddyUser({ timezone: LA });
  expect((await getSocialHome(late.id, new Date('2026-10-08T02:30:00Z'))).camp).toMatchObject({ night: true, goodnightOpen: false }); // 19:30
});
```

`backend/tests/social/home.test.ts` — the S1 shape assertions gain the new fields (the route reads the real clock, so
`night` may be either):

```ts
  expect(res.body.me).toEqual({ person: expect.objectContaining({ id: me.id, displayName: 'Me' }), checkIn: null, goodnight: null });
  expect(res.body.camp).toEqual({
    checkedIn: 1, members: 3, faces: [res.body.stories[0].author.coachId],
    night: expect.any(Boolean), awake: 3, asleep: 0, goodnightOpen: expect.any(Boolean),
  });
```

(these replace the two lines `expect(res.body.me).toEqual({ person: …, checkIn: null });` and
`expect(res.body.camp).toEqual({ checkedIn: 1, members: 3, faces: [res.body.stories[0].author.coachId] });` in the first test).

- [ ] **Step 2: Run them to see them fail**

Run: `bash .superpowers/sdd/2026-10-07-social-s2-campfire/backend-jest.sh tests/social/homeCamp.test.ts tests/social/home.test.ts`
Expected: FAIL — `camp` has no `night` / `awake` / `asleep` / `goodnightOpen`, `me` has no `goodnight`.

- [ ] **Step 3: Put the summary on the home**

In `backend/src/social/home.ts`:

Add to the header comment: `// S2: the camp banner also says whether it is night in the viewer's zone and who is awake or asleep; \`me\`
// carries my goodnight for tonight (the evening timeline's Undo) and \`camp.goodnightOpen\` says whether my own
// goodnight window is open (min(20:00, my goal − 60 min) to 05:59) — all from the circle, no extra query.`

Add the imports:

```ts
import { campSummaryFor } from './camp';
import type { GoodnightDTO } from './goodnight';
```

Change the interface's two lines to:

```ts
  me: { person: PersonDTO; checkIn: CheckInDTO | null; goodnight: GoodnightDTO | null };
  camp: { checkedIn: number; members: number; faces: string[]; night: boolean; awake: number; asleep: number; goodnightOpen: boolean };
```

In `getSocialHome`, after `const mine = circle.checkIns.get(viewerId);` add `const camp = campSummaryFor(circle, now);`
and change the returned `me` and `camp` to:

```ts
    me: { person: circle.viewer.person, checkIn: mine ? toCheckInDTO(mine) : null, goodnight: camp.goodnight },
    camp: {
      checkedIn: rings.checkedInBuddies + (rings.viewerCheckedIn ? 1 : 0),
      members: circle.members.size,
      faces: rings.checkedInCoachIds,
      night: camp.night,
      awake: camp.awake,
      asleep: camp.asleep,
      goodnightOpen: camp.goodnightOpen,
    },
```

- [ ] **Step 4: Run the tests**

Run: `bash .superpowers/sdd/2026-10-07-social-s2-campfire/backend-jest.sh tests/social`
Expected: PASS (the query ceiling of 17 holds: the summary reads only the circle).

- [ ] **Step 5: Commit**

```bash
git add backend/src/social/home.ts backend/tests/social/homeCamp.test.ts backend/tests/social/home.test.ts
git commit -m "feat(social): the Social home says night or day, who is awake or asleep, my goodnight and its window"
```

---

### Task 9: The camp's week highlights (incl. the deferred "joined" and "first badge")

**Files:**
- Modify: `backend/src/social/highlights.ts`
- Test: `backend/tests/social/highlightsCamp.test.ts`; the S1 `tests/social/highlights.test.ts` must stay green unchanged

**Interfaces:**
- Consumes: `campOnEvening`, `countLitNights` (Task 2); `Circle` (incl. `pairedAt`), `loadCircle` (Task 3); the
  `Goodnight` table; `EMPTY_WEEK_SETTLE_MS`, `weeklyHighlightsFor` (Task 3).
- Produces: `HighlightItem` gains `{ type: 'top_story'; reason: 'on_time_every_night'; actorId }`,
  `{ type: 'campfire'; actorId; nights: number }` (actor = the viewer), `{ type: 'joined'; actorId }`,
  `{ type: 'first_badge'; actorId }`; `HighlightItemDTO` follows (`actor`, `mine` instead of `actorId`).
  `buildHighlightCandidates(circle: Circle, weekStart: string)` (was `(viewerId, memberIds, weekStart)`; its only
  caller is `weeklyHighlightsFor`): `joined` comes from `circle.pairedAt` (no query), and `campfire` counts each night
  against that night's camp (`campOnEvening`: the viewer plus the buddies paired by its 19:00 in the viewer's zone).
  Candidate order: badge top stories, on-time top story, every-day top story, most cheered, comeback, campfire,
  every-day (≤ 3 shown), joined (≤ 3), first badge (≤ 3), most stickers sent.
- Known cost, accepted: a `first_badge` evaluated late (a badge backfilled after the week was cached) misses that
  already-cached week, the same as the S1 top story — the cache is built once.

- [ ] **Step 1: Write the failing test**

`backend/tests/social/highlightsCamp.test.ts`:

```ts
import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { shiftDate } from '../../src/scoring/dates';
import { BUDDY_SHARING_CONSENT_VERSION } from '../../src/buddies/sharing';
import { getWeeklyHighlights } from '../../src/social/highlights';
import { buddyUser, pairUp } from '../buddies/helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

const NOW = new Date('2026-10-07T20:00:00Z'); // last final week: Mon 2026-09-28 .. Sun 2026-10-04
const WEEK = '2026-09-28';
const BEFORE = new Date('2026-09-01T00:00:00Z');
const day = (offset: number) => civilDateToUtcMidnight(shiftDate(WEEK, offset));
const noon = (offset: number) => new Date(day(offset).getTime() + 12 * 3_600_000);
const sharesStreaks = { shareStreaks: true, buddySharingConsentVersion: BUDDY_SHARING_CONSENT_VERSION };
const goodnight = (authorId: string, offset: number, onTime = true) =>
  prisma.goodnight.create({ data: { authorId, localDate: day(offset), at: new Date(day(offset).getTime() + 22 * 3_600_000), onTime } });
const badge = (userId: string, family: 'STEP_GOAL' | 'SLEEP_GOAL', level: number, offset: number) =>
  prisma.achievement.create({ data: { userId, family, level, value: 7, earnedOn: day(offset), weekStart: day(0), monthStart: civilDateToUtcMidnight('2026-09-01') } });
const pairs = (items: Array<{ type: string; actor: { id: string } }>) => items.map((i) => [i.type, i.actor.id]);

it('an on-time goodnight every night is a top story, and two or more lit nights make a campfire item', async () => {
  const me = await buddyUser();
  const ana = await buddyUser({ displayName: 'Ana' });
  await pairUp(me.id, ana.id, BEFORE);
  for (let i = 0; i < 7; i++) await goodnight(ana.id, i);
  for (const i of [0, 1, 2]) await goodnight(me.id, i);
  await goodnight(me.id, 3, false); // late: not in bed on time
  const h = await getWeeklyHighlights(me.id, NOW);
  // A camp of 2: Mon–Wed 2 of 2 (5 segments), Thu–Sun 1 of 2 (3): all seven nights lit.
  expect(pairs(h!.items)).toEqual([['top_story', ana.id], ['campfire', me.id]]);
  expect(h!.items[0]).toMatchObject({ reason: 'on_time_every_night', mine: false });
  expect(h!.items[1]).toMatchObject({ nights: 7, mine: true });
});

it('one lit night is no campfire; the quiet week waits a day as final, then is cached empty', async () => {
  const me = await buddyUser();
  const ana = await buddyUser();
  const ben = await buddyUser();
  await pairUp(me.id, ana.id, BEFORE);
  await pairUp(me.id, ben.id, BEFORE);
  // A camp of 3: Mon 2 of 3 (4 segments, lit), Tue 1 of 3 (2, not lit).
  await goodnight(ana.id, 0);
  await goodnight(ben.id, 0);
  await goodnight(ana.id, 1);
  expect(await getWeeklyHighlights(me.id, new Date('2026-10-06T10:00:00Z'))).toBeNull(); // its first day as final
  expect(await prisma.weeklyHighlights.count({ where: { viewerId: me.id } })).toBe(0);
  expect(await getWeeklyHighlights(me.id, NOW)).toBeNull();
  expect(await prisma.weeklyHighlights.count({ where: { viewerId: me.id } })).toBe(1);
});

it('a buddy who paired midweek counts toward the fire only from that evening on', async () => {
  const me = await buddyUser();
  const ana = await buddyUser({ displayName: 'Ana' });
  const ben = await buddyUser({ displayName: 'Ben' });
  await pairUp(me.id, ana.id, BEFORE);
  await pairUp(me.id, ben.id, noon(3)); // Thursday noon, before Thursday's 19:00
  // Mon–Wed: Ana alone of {me, Ana} (1 of 2: 3 segments, lit). Thu–Sun: Ana and Ben of three (2 of 3: 4, lit).
  // Counted against all three, Mon–Wed would be 1 of 3 (2 segments, unlit): 4 nights, not 7.
  for (let i = 0; i < 7; i++) await goodnight(ana.id, i);
  for (let i = 3; i < 7; i++) await goodnight(ben.id, i);
  const h = await getWeeklyHighlights(me.id, NOW);
  expect(pairs(h!.items)).toEqual([['top_story', ana.id], ['campfire', me.id], ['joined', ben.id]]);
  expect(h!.items[1]).toMatchObject({ nights: 7 });
});

it('a buddy who paired with me that week "joined the camp"; one from before does not, and one unpaired since drops out', async () => {
  const me = await buddyUser();
  const sam = await buddyUser();
  const ana = await buddyUser();
  const ben = await buddyUser();
  await pairUp(me.id, sam.id, noon(2));
  await pairUp(me.id, ana.id, BEFORE);
  await pairUp(me.id, ben.id, noon(3));
  const first = await getWeeklyHighlights(me.id, NOW);
  expect(pairs(first!.items).sort()).toEqual([['joined', ben.id], ['joined', sam.id]].sort());
  await prisma.buddyPair.deleteMany({ where: { OR: [{ userAId: ben.id }, { userBId: ben.id }] } });
  expect(pairs((await getWeeklyHighlights(me.id, NOW))!.items)).toEqual([['joined', sam.id]]);
});

it("a member's first-ever badge that week shows while they share streaks, but not twice when it is the top story", async () => {
  const me = await buddyUser();
  const sam = await buddyUser({ displayName: 'Sam' });
  const ben = await buddyUser({ displayName: 'Ben' });
  const zoe = await buddyUser({ displayName: 'Zoe' });
  for (const u of [sam, ben, zoe]) {
    await pairUp(me.id, u.id, BEFORE);
    await prisma.user.update({ where: { id: u.id }, data: sharesStreaks });
  }
  await badge(sam.id, 'STEP_GOAL', 3, 2); // Sam's first badge, and the week's top story
  await badge(ben.id, 'SLEEP_GOAL', 1, 4); // Ben's first badge
  await badge(zoe.id, 'SLEEP_GOAL', 1, -10); // Zoe had one before the week...
  await badge(zoe.id, 'SLEEP_GOAL', 2, 5); // ...so this one is not a first
  expect(pairs((await getWeeklyHighlights(me.id, NOW))!.items)).toEqual([['top_story', sam.id], ['first_badge', ben.id]]);
  await prisma.user.update({ where: { id: ben.id }, data: { shareStreaks: false } });
  expect(pairs((await getWeeklyHighlights(me.id, NOW))!.items)).toEqual([['top_story', sam.id]]);
});

it('my own first badge shows without the streaks switch', async () => {
  const me = await buddyUser();
  const sam = await buddyUser();
  await pairUp(me.id, sam.id, BEFORE);
  await prisma.user.update({ where: { id: sam.id }, data: sharesStreaks });
  await badge(sam.id, 'SLEEP_GOAL', 3, 2); // the week's top story (Sam's first badge: not repeated)
  await badge(me.id, 'SLEEP_GOAL', 1, 3); // my first badge; I don't share streaks
  const h = await getWeeklyHighlights(me.id, NOW);
  expect(pairs(h!.items)).toEqual([['top_story', sam.id], ['first_badge', me.id]]);
  expect(h!.items[1]).toMatchObject({ mine: true });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bash .superpowers/sdd/2026-10-07-social-s2-campfire/backend-jest.sh tests/social/highlightsCamp.test.ts`
Expected: FAIL — none of the new item types are built (the first test gets `null`).

- [ ] **Step 3: Build and gate the new items**

In `backend/src/social/highlights.ts`:

Replace the header comment's last line (`// "Joined" and "first badge" items (spec §7 \`also\`) are deferred to S2.`) with:

```ts
// S2 adds the camp's items: an on-time goodnight every night (a top story, no streak gate), the campfire ("the fire
// was lit N nights", N >= 2 — a count of the circle's own goodnights, each night judged against that night's camp:
// the viewer plus the buddies paired by its 19:00 in the viewer's zone), "joined the camp" (a buddy who paired with
// the viewer that week, from the circle's pairing times) and "first badge" (a member's first-ever badge earned that
// week, gated by streaks like every badge item, and not repeated when that person's badge is the top story). Weeks
// cached before S2 keep their items; a badge backfilled after a week was cached misses it, as the S1 top story does.
```

Add `import { campOnEvening, countLitNights } from './night';` to the imports.

In `weeklyHighlightsFor` (Task 3), replace
`const candidates = await buildHighlightCandidates(viewerId, memberIds, weekStart);` with
`const candidates = await buildHighlightCandidates(circle, weekStart);`, and delete the now-unused line
`const memberIds = [viewerId, ...circle.buddies.map((b) => b.person.id)];`.

Replace `export type HighlightItem = …;` with:

```ts
export type HighlightItem =
  | { type: 'top_story'; reason: 'badge'; actorId: string; family: AchievementFamily; level: number }
  | { type: 'top_story'; reason: 'on_time_every_night'; actorId: string }
  | { type: 'top_story'; reason: 'checked_in_every_day'; actorId: string }
  | { type: 'most_cheered_you'; actorId: string; count: number }
  | { type: 'comeback'; actorId: string }
  | { type: 'campfire'; actorId: string; nights: number }
  | { type: 'checked_in_every_day'; actorId: string }
  | { type: 'joined'; actorId: string }
  | { type: 'first_badge'; actorId: string }
  | { type: 'most_stickers_sent'; actorId: string; count: number };
```

Replace the constants block `const MAX_EVERY_DAY = 3; … const MIN_STICKERS_SENT = 3;` with:

```ts
const MAX_EVERY_DAY = 3;
/** "Joined" and "first badge" items shown per week, each. */
const MAX_ALSO = 3;
const MIN_CHEERED_YOU = 2;
const MIN_STICKERS_SENT = 3;
const MIN_LIT_NIGHTS = 2;
```

Replace the whole `buildHighlightCandidates` function with:

```ts
/** Ungated candidates in display order: every top-story candidate first (best first), then the other items. */
export async function buildHighlightCandidates(circle: Circle, weekStart: string): Promise<HighlightItem[]> {
  const viewerId = circle.viewer.person.id;
  const buddyIds = circle.buddies.map((b) => b.person.id);
  const memberIds = [viewerId, ...buddyIds];
  const from = civilDateToUtcMidnight(weekStart);
  const to = civilDateToUtcMidnight(shiftDate(weekStart, 6));
  const end = civilDateToUtcMidnight(shiftDate(weekStart, 7));
  const [checkIns, badges, stickers, goodnights, firstEarned] = await Promise.all([
    prisma.checkIn.findMany({ where: { authorId: { in: memberIds }, localDate: { gte: from, lte: to } }, select: { authorId: true, localDate: true, mood: true } }),
    prisma.achievement.findMany({
      where: { userId: { in: memberIds }, earnedOn: { gte: from, lte: to } },
      orderBy: [{ level: 'desc' }, { earnedOn: 'asc' }, { userId: 'asc' }],
      select: { userId: true, family: true, level: true },
    }),
    // Only stickers the viewer sent to, or received from, a current buddy.
    prisma.sticker.findMany({
      where: { sentAt: { gte: from, lt: end }, OR: [{ toUserId: viewerId, fromUserId: { in: buddyIds } }, { fromUserId: viewerId, toUserId: { in: buddyIds } }] },
      select: { fromUserId: true, toUserId: true },
    }),
    prisma.goodnight.findMany({ where: { authorId: { in: memberIds }, onTime: true, localDate: { gte: from, lte: to } }, select: { authorId: true, localDate: true } }),
    // Each member's first-ever badge date.
    prisma.achievement.groupBy({ by: ['userId'], where: { userId: { in: memberIds } }, _min: { earnedOn: true } }),
  ]);

  const moods = new Map<string, Map<string, CheckInMood>>();
  for (const c of checkIns) {
    const byDate = moods.get(c.authorId) ?? new Map<string, CheckInMood>();
    byDate.set(isoDate(c.localDate), c.mood);
    moods.set(c.authorId, byDate);
  }
  const everyDay = [...moods.entries()].filter(([, byDate]) => byDate.size === 7).map(([id]) => id).sort();
  const comeback = [...moods.entries()].filter(([, byDate]) => bouncedBack(byDate)).map(([id]) => id).sort()[0];
  const cheeredMe = new Map<string, number>();
  let sentByMe = 0;
  for (const s of stickers) {
    if (s.toUserId === viewerId) cheeredMe.set(s.fromUserId, (cheeredMe.get(s.fromUserId) ?? 0) + 1);
    else sentByMe += 1;
  }
  const onTimeNights = new Map<string, Set<string>>();
  for (const g of goodnights) {
    const nights = onTimeNights.get(g.authorId) ?? new Set<string>();
    nights.add(isoDate(g.localDate));
    onTimeNights.set(g.authorId, nights);
  }
  const onTimeEveryNight = [...onTimeNights.entries()].filter(([, nights]) => nights.size === 7).map(([id]) => id).sort();
  // Each night against that night's camp: a buddy who paired midweek counts from that evening on, and pairing after
  // the week never changes it (owner ruling Q2).
  const litNights = countLitNights(
    goodnights.map((g) => ({ authorId: g.authorId, date: isoDate(g.localDate) })),
    (date) => campOnEvening(date, viewerId, circle.pairedAt, circle.viewer.timezone),
  );
  // Buddies whose pair with the viewer was made that week "joined the camp" (the circle carries the pairing times).
  const joined = [...circle.pairedAt]
    .filter(([, at]) => at.getTime() >= from.getTime() && at.getTime() < end.getTime())
    .map(([id]) => id)
    .sort();
  const firstBadges = firstEarned
    .filter((f) => f._min.earnedOn !== null && f._min.earnedOn >= from && f._min.earnedOn <= to)
    .map((f) => f.userId)
    .sort();

  const items: HighlightItem[] = [];
  const withBadge = new Set<string>();
  for (const b of badges) {
    if (withBadge.has(b.userId)) continue; // each member's best badge only
    withBadge.add(b.userId);
    items.push({ type: 'top_story', reason: 'badge', actorId: b.userId, family: b.family, level: b.level });
  }
  if (onTimeEveryNight[0]) items.push({ type: 'top_story', reason: 'on_time_every_night', actorId: onTimeEveryNight[0] });
  if (everyDay[0]) items.push({ type: 'top_story', reason: 'checked_in_every_day', actorId: everyDay[0] });
  const cheered = topBy(cheeredMe, MIN_CHEERED_YOU);
  if (cheered) items.push({ type: 'most_cheered_you', actorId: cheered[0], count: cheered[1] });
  if (comeback) items.push({ type: 'comeback', actorId: comeback });
  if (litNights >= MIN_LIT_NIGHTS) items.push({ type: 'campfire', actorId: viewerId, nights: litNights });
  for (const id of everyDay) items.push({ type: 'checked_in_every_day', actorId: id });
  for (const id of joined) items.push({ type: 'joined', actorId: id });
  for (const id of firstBadges) items.push({ type: 'first_badge', actorId: id });
  if (sentByMe >= MIN_STICKERS_SENT) items.push({ type: 'most_stickers_sent', actorId: viewerId, count: sentByMe });
  return items;
}
```

Replace the whole `visibleItems` function with:

```ts
/**
 * Gate the stored candidates for this read: actors must still be in the circle; one top story (the first visible
 * candidate); badge items need their actor to share streaks now (the viewer is exempt); the top story's person is
 * not repeated as "every day" or "first badge"; at most 3 every-day, 3 joined and 3 first-badge items.
 */
function visibleItems(stored: HighlightItem[], viewerId: string, members: Map<string, Member>): HighlightItemDTO[] {
  const visible: HighlightItemDTO[] = [];
  const caps: Partial<Record<HighlightItem['type'], number>> = { checked_in_every_day: MAX_EVERY_DAY, joined: MAX_ALSO, first_badge: MAX_ALSO };
  const shown = new Map<HighlightItem['type'], number>();
  let top: HighlightItem | null = null;
  for (const item of stored) {
    const actor = members.get(item.actorId);
    if (!actor) continue;
    const mine = item.actorId === viewerId;
    if (item.type === 'top_story') {
      if (top) continue;
      if (item.reason === 'badge' && !mine && !actor.shares.streaks) continue;
      top = item;
    }
    if (item.type === 'checked_in_every_day' && top?.type === 'top_story' && top.reason === 'checked_in_every_day' && top.actorId === item.actorId) continue;
    if (item.type === 'first_badge') {
      if (!mine && !actor.shares.streaks) continue;
      if (top?.type === 'top_story' && top.reason === 'badge' && top.actorId === item.actorId) continue;
    }
    const cap = caps[item.type];
    if (cap !== undefined) {
      const n = shown.get(item.type) ?? 0;
      if (n >= cap) continue;
      shown.set(item.type, n + 1);
    }
    const { actorId, ...rest } = item;
    visible.push({ ...rest, actor: actor.person, mine } as HighlightItemDTO);
  }
  return visible;
}
```

- [ ] **Step 4: Run the tests**

Run: `bash .superpowers/sdd/2026-10-07-social-s2-campfire/backend-jest.sh tests/social/highlightsCamp.test.ts tests/social/highlights.test.ts tests/social/homeQueries.test.ts`
Expected: PASS (in the S1 suite, Sam's badge is both the top story and his first badge, so no `first_badge` item
appears, and its pairs were made at the real clock, outside the fixed week, so no `joined` item either).

- [ ] **Step 5: Commit**

```bash
git add backend/src/social/highlights.ts backend/tests/social/highlightsCamp.test.ts
git commit -m "feat(social): camp highlights: on time every night, campfire, joined the camp and first badge"
```

---

### Task 10: Retention and deleted ids (S1 deferral b)

**Files:**
- Create: `backend/src/social/sweep.ts`
- Modify: `backend/src/sync/worker.ts`, `backend/src/buddies/models.ts`, `backend/src/users/deletion.ts`,
  `backend/tests/recap/worker.test.ts` (mock the social sweep)
- Test: `backend/tests/social/retention.test.ts`; rerun `tests/recap/worker.test.ts`, `tests/coach/retention.test.ts`, `tests/users/deletion.test.ts`, `tests/buddies/deletion.test.ts`

**Interfaces:**
- Consumes: `RECAP_SWEEP_JOB` (`src/recap/queue.ts`), `runRecapSweep` (`src/recap/sweep.ts`), `processSyncJob`
  (`src/sync/worker.ts`); `getWeeklyHighlights` (Task 3).
- Produces:
  - `sweep.ts`: `HIGHLIGHTS_RETENTION_WEEKS = 4`, `runSocialSweep(now): Promise<{ notes: number; highlights: number }>`.
  - The `RECAP_SWEEP_JOB` branch of `processSyncJob` runs `runSocialSweep(sweepClock(job))` first (never throws;
    logs counts or the error's name), then `runRecapSweep()`. `sweepClock(job)` = `job.data.now` when it is a valid
    ISO instant (tests pin the clock this way; the scheduler sends `{}`), else the real clock. `processSyncJob` keeps
    its one-argument signature (BullMQ passes a token as the second).
- Test isolation (the backend suites share one database): no test runs the sweep on the real clock. The retention
  tests use a far-past clock (`2025-02-10T12:00Z`) and far-past fixtures (weeks `2025-01-06` and `2025-01-13`, notes
  expiring in February 2025), which no other suite writes, and assert only on their own rows; the S1
  `tests/recap/worker.test.ts`, which runs the same tick, mocks `runSocialSweep`.
  - `buddies/models.ts`: `purgeSocialJsonMentions(db: Pick<PrismaClient, '$executeRaw'>, userId: string): Promise<number>`;
    `deleteUserAccount` calls it (best effort) before deleting the rows.

- [ ] **Step 1: Write the failing test**

`backend/tests/social/retention.test.ts`:

```ts
import { randomUUID } from 'crypto';
import type { Job } from 'bullmq';
import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { RECAP_SWEEP_JOB } from '../../src/recap/queue';
import { runRecapSweep } from '../../src/recap/sweep';
import { processSyncJob } from '../../src/sync/worker';
import { deleteUserAccount } from '../../src/users/deletion';
import { getWeeklyHighlights } from '../../src/social/highlights';
import { HIGHLIGHTS_RETENTION_WEEKS, runSocialSweep } from '../../src/social/sweep';
import { buddyUser, pairUp } from '../buddies/helpers';

jest.mock('../../src/health/client');
// The recap sweep itself is not under test here: it would queue recap builds for every test user.
jest.mock('../../src/recap/sweep', () => ({ ...jest.requireActual('../../src/recap/sweep'), runRecapSweep: jest.fn().mockResolvedValue({}) }));

beforeAll(() => migrateTestDb());
afterEach(() => jest.restoreAllMocks());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

// The suites share one database, so the sweep never runs on the real clock here: a far-past clock with far-past
// fixtures reaches only this file's rows (other suites' notes expire, and their weeks start, in 2026).
const SWEEP_NOW = new Date('2025-02-10T12:00:00Z'); // cutoff = 2025-02-10 − 28 days = 2025-01-13
const OLD_WEEK = '2025-01-06'; // before the cutoff: deleted
const KEPT_WEEK = '2025-01-13'; // the cutoff itself: kept
// For the read-time gate below (not a sweep): the week 2026-09-28 is final at this moment.
const READ_NOW = new Date('2026-10-07T20:00:00Z');
const day = (d: string) => civilDateToUtcMidnight(d);
const noop = { deleteSubscription: async () => {}, revokeToken: async () => {}, log: () => {} };
const weeksOf = async (viewerId: string) =>
  (await prisma.weeklyHighlights.findMany({ where: { viewerId }, select: { weekStart: true } })).map((r) => r.weekStart.toISOString().slice(0, 10)).sort();

it('deletes expired camp notes and highlight caches older than 4 weeks, and keeps the rest', async () => {
  expect(HIGHLIGHTS_RETENTION_WEEKS).toBe(4);
  const a = await buddyUser();
  const b = await buddyUser();
  await prisma.campNote.create({ data: { authorId: a.id, text: 'gone', expiresAt: new Date('2025-02-10T06:00:00Z') } });
  await prisma.campNote.create({ data: { authorId: b.id, text: 'live', expiresAt: new Date('2025-02-11T06:00:00Z') } });
  await prisma.weeklyHighlights.create({ data: { viewerId: a.id, weekStart: day(OLD_WEEK), items: [] } });
  await prisma.weeklyHighlights.create({ data: { viewerId: a.id, weekStart: day(KEPT_WEEK), items: [] } });
  const result = await runSocialSweep(SWEEP_NOW);
  // Assert on this file's own rows; the counts include at least them.
  expect(result.notes).toBeGreaterThanOrEqual(1);
  expect(result.highlights).toBeGreaterThanOrEqual(1);
  expect(await prisma.campNote.findMany({ where: { authorId: { in: [a.id, b.id] } }, select: { text: true } })).toEqual([{ text: 'live' }]);
  expect(await weeksOf(a.id)).toEqual([KEPT_WEEK]);
});

it('the hourly recap-sweep tick runs the social sweep too, on the clock the job pins, logging counts only', async () => {
  const a = await buddyUser();
  await prisma.campNote.create({ data: { authorId: a.id, text: 'private words', expiresAt: new Date('2025-02-10T06:00:00Z') } });
  await prisma.weeklyHighlights.create({ data: { viewerId: a.id, weekStart: day(OLD_WEEK), items: [] } });
  const info = jest.spyOn(console, 'info').mockImplementation(() => {});
  await processSyncJob({ name: RECAP_SWEEP_JOB, data: { now: SWEEP_NOW.toISOString() } } as unknown as Job);
  expect(runRecapSweep).toHaveBeenCalled();
  expect(await prisma.campNote.count({ where: { authorId: a.id } })).toBe(0);
  expect(await weeksOf(a.id)).toEqual([]);
  const lines = info.mock.calls.map((c) => String(c[0]));
  expect(lines.some((l) => l.includes('"event":"social.sweep"'))).toBe(true);
  expect(lines.join('\n')).not.toContain('private words');
});

it("deleting an account deletes the highlight caches that name it; a cached id that isn't a buddy never surfaces", async () => {
  const a = await buddyUser();
  const b = await buddyUser();
  const c = await buddyUser();
  await pairUp(a.id, b.id);
  await pairUp(b.id, c.id);
  await prisma.weeklyHighlights.create({ data: { viewerId: b.id, weekStart: day('2026-09-28'), items: [{ type: 'comeback', actorId: a.id }] } });
  await prisma.weeklyHighlights.create({ data: { viewerId: c.id, weekStart: day('2026-09-28'), items: [{ type: 'comeback', actorId: b.id }] } });
  await deleteUserAccount(a.id, noop);
  expect(await prisma.weeklyHighlights.count({ where: { viewerId: b.id } })).toBe(0);
  expect(await prisma.weeklyHighlights.count({ where: { viewerId: c.id } })).toBe(1);
  // A cache written before the purge existed, naming someone who is nobody's buddy now.
  await prisma.weeklyHighlights.create({
    data: { viewerId: b.id, weekStart: day('2026-09-28'), items: [{ type: 'comeback', actorId: randomUUID() }, { type: 'checked_in_every_day', actorId: c.id }] },
  });
  expect((await getWeeklyHighlights(b.id, READ_NOW))!.items.map((i) => i.actor.id)).toEqual([c.id]);
});
```

`backend/tests/recap/worker.test.ts` (S1) runs the same tick, which would now sweep the shared database on the real
clock. After its two existing `jest.mock(…)` lines add:

```ts
// The social sweep (S2) shares this tick; it is tested in tests/social/retention.test.ts on a pinned clock.
jest.mock('../../src/social/sweep', () => ({ runSocialSweep: jest.fn(async () => ({ notes: 0, highlights: 0 })) }));
```

add `import { runSocialSweep } from '../../src/social/sweep';` to its imports, and after
`expect(runRecapSweep).toHaveBeenCalledTimes(1);` add `expect(runSocialSweep).toHaveBeenCalledTimes(1);`.

- [ ] **Step 2: Run it to see it fail**

Run: `bash .superpowers/sdd/2026-10-07-social-s2-campfire/backend-jest.sh tests/social/retention.test.ts`
Expected: FAIL — "Cannot find module '../../src/social/sweep'".

- [ ] **Step 3: Write the sweep and wire it to the hourly tick**

`backend/src/social/sweep.ts`:

```ts
// The social sweep (S2), on the existing hourly recap-sweep tick (sync/worker.ts): deletes camp notes past their
// expiry (reads already hide them; this removes the free text itself) and week-highlight caches more than
// HIGHLIGHTS_RETENTION_WEEKS old (only the latest final week is ever served). Returns counts only.

import { civilDateToUtcMidnight } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import { shiftDate } from '../scoring/dates';

export const HIGHLIGHTS_RETENTION_WEEKS = 4;

export async function runSocialSweep(now: Date): Promise<{ notes: number; highlights: number }> {
  const notes = await prisma.campNote.deleteMany({ where: { expiresAt: { lte: now } } });
  const cutoff = civilDateToUtcMidnight(shiftDate(now.toISOString().slice(0, 10), -7 * HIGHLIGHTS_RETENTION_WEEKS));
  const highlights = await prisma.weeklyHighlights.deleteMany({ where: { weekStart: { lt: cutoff } } });
  return { notes: notes.count, highlights: highlights.count };
}
```

In `backend/src/sync/worker.ts`, add `import { runSocialSweep } from '../social/sweep';` after the `recordStepGoal`
import; just above `export async function processSyncJob(job: Job): Promise<void> {` add:

```ts
/**
 * The social sweep's clock: `job.data.now` when a test pins it (a valid ISO instant), else the real clock. The
 * scheduler sends `{}`. Not a second processSyncJob parameter: BullMQ passes the worker token there.
 */
function sweepClock(job: Job): Date {
  const pinned = (job.data as { now?: unknown } | undefined)?.now;
  const at = typeof pinned === 'string' ? new Date(pinned) : null;
  return at && !Number.isNaN(at.getTime()) ? at : new Date();
}
```

and replace

```ts
  } else if (job.name === RECAP_SWEEP_JOB) {
    await runRecapSweep();
```

with

```ts
  } else if (job.name === RECAP_SWEEP_JOB) {
    // The hourly tick also runs the social sweep (expired camp notes, old highlight caches). It goes first and never
    // throws, so a social failure cannot stop recaps. Counts and the error's name only.
    await runSocialSweep(sweepClock(job)).then(
      (r) => console.info(JSON.stringify({ event: 'social.sweep', ...r })),
      (err: unknown) => console.error(JSON.stringify({ event: 'social.sweep_failed', error: err instanceof Error ? err.name : 'unknown' })),
    );
    await runRecapSweep();
```

- [ ] **Step 4: Purge JSON-held ids on account deletion**

Append to `backend/src/buddies/models.ts`:

```ts
/**
 * Week-highlight caches (WeeklyHighlights.items) name people by id inside JSON, which no foreign key can cascade.
 * On account deletion every cache naming the user is deleted; the next read rebuilds it from rows that no longer
 * include them. Reads also gate every cached actor against the live circle, so a deleted id never surfaces even if
 * this purge fails. Returns the number of caches deleted.
 */
export async function purgeSocialJsonMentions(db: Pick<PrismaClient, '$executeRaw'>, userId: string): Promise<number> {
  return db.$executeRaw`DELETE FROM "WeeklyHighlights" WHERE "items" @> ${JSON.stringify([{ actorId: userId }])}::jsonb`;
}
```

with `import type { PrismaClient } from '@prisma/client';` at the top of the file (after the header comment).

In `backend/src/users/deletion.ts`, add `import { purgeSocialJsonMentions } from '../buddies/models';` and, just
before `const counts = await deleteOwnedRows(prisma, { userId }, { id: userId });`, add:

```ts
  // Week-highlight caches name people inside JSON, beyond any cascade (buddies/models.ts). Best effort: reads gate
  // every cached actor against the live circle anyway. Only the error class is logged.
  try {
    await purgeSocialJsonMentions(prisma, userId);
  } catch (err) {
    log(`Account deletion: could not purge social mentions for user ${userId}: ${err instanceof Error ? err.name : 'unknown error'}`);
  }
```

- [ ] **Step 5: Run the tests**

Run: `bash .superpowers/sdd/2026-10-07-social-s2-campfire/backend-jest.sh tests/social/retention.test.ts tests/recap/worker.test.ts tests/coach/retention.test.ts tests/users/deletion.test.ts tests/buddies/deletion.test.ts`
Expected: PASS.
Run: `grep -rn "runSocialSweep(\|RECAP_SWEEP_JOB, data" backend/tests` — Expected: every call passes `SWEEP_NOW` or a
`data.now`, or sits in a file that mocks `../../src/social/sweep` (no sweep on the real clock).

- [ ] **Step 6: Commit**

```bash
git add backend/src/social/sweep.ts backend/src/sync/worker.ts backend/src/buddies/models.ts backend/src/users/deletion.ts backend/tests/social/retention.test.ts backend/tests/recap/worker.test.ts
git commit -m "feat(social): sweep expired camp notes and old highlight caches hourly; purge deleted ids from caches"
```

---

### Task 11: Mobile camp API and copy

**Files:**
- Modify: `mobile/src/api/social.ts`, `mobile/src/lib/socialCopy.ts`, `mobile/src/components/social/TimelineList.tsx`
- Test: create `mobile/__tests__/api/camp.test.ts`, `mobile/__tests__/lib/campCopy.test.ts`; rerun the S1
  `__tests__/api/social.test.ts`, `__tests__/lib/socialCopy.test.ts`, `__tests__/components/TimelineList.test.tsx`,
  `__tests__/components/HighlightsCarousel.test.tsx`, `__tests__/screens/HighlightsScreen.test.tsx`

**Interfaces:**
- Consumes: the backend DTOs of Tasks 4–9 (`GoodnightDTO`, `CampDTO`, `CampMemberDTO`, `CampNoteDTO`, the new
  timeline / frame / highlight variants, `SocialHomeDTO.me.goodnight`, `camp.night|awake|asleep|goodnightOpen`,
  `CampDTO.goodnightOpen|goodnightOpensAt`).
- Produces:
  - `api/social.ts`: types `Goodnight`, `CampMember`, `Camp` (with `goodnightOpen: boolean; goodnightOpensAt: string`),
    `CampNote`; `StoryFrame`, `TimelineItem`, `HighlightItem` gain the S2 variants; `SocialHome.me.goodnight?: Goodnight | null`,
    `SocialHome.camp.night?: boolean`, `awake?: number`, `asleep?: number`, `goodnightOpen?: boolean` (optional: an S1
    server sends none); `fetchCamp(): Promise<Camp | null>` (null = bare 404), `sayGoodnight(): Promise<{ goodnight: Goodnight }>`,
    `undoGoodnight(): Promise<void>`, `saveCampNote(text: string): Promise<{ note: CampNote }>`, `clearCampNote(): Promise<void>`.
  - `socialCopy.ts`: `CAMP_NOTE_MAX = 40`, `noteLength(draft): number`, `campBannerLine(camp: SocialHome['camp']): string`,
    `fireLine(fire: Camp['fire']): string`, `campClock(iso: string): string` ("10:15 PM", the phone's clock),
    `campStatus(m: CampMember): string` ("asleep since 10:15 PM · on time"), `goodnightSaidLine(g: Goodnight): string`,
    `goodnightOpensLine(opensAt: string): string` ("You can say goodnight from 8:00 PM"), `campKicker(now: Date): string`
    ("TUESDAY · 10:42 PM"): every time on the Campfire is 12-hour. The known-kind lists, `timelineParts`,
    `timelineAction`, `highlightKicker`, `highlightKickerColor`, `highlightLine` cover the S2 kinds. (`clockTime`,
    the S1 timeline's time, is unchanged.)

- [ ] **Step 1: Write the failing tests**

`mobile/__tests__/api/camp.test.ts`:

```ts
import { apiFetch } from '../../src/api/client';
import { clearCampNote, fetchCamp, saveCampNote, sayGoodnight, undoGoodnight } from '../../src/api/social';

jest.mock('../../src/api/client');
const api = apiFetch as jest.Mock;
const JSON_HEADERS = { 'Content-Type': 'application/json' };

beforeEach(() => api.mockReset());

it('reads the camp; only a bare 404 means a server without the Campfire', async () => {
  api.mockResolvedValueOnce({ night: true, members: [] });
  expect(await fetchCamp()).toEqual({ night: true, members: [] });
  expect(api).toHaveBeenLastCalledWith('/me/camp');
  api.mockRejectedValueOnce(Object.assign(new Error('nope'), { status: 404 }));
  expect(await fetchCamp()).toBeNull();
  api.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { status: 403, code: 'not_buddies' }));
  await expect(fetchCamp()).rejects.toThrow('forbidden');
});

it('says and undoes goodnight, and shares and clears a note', async () => {
  api.mockResolvedValue({});
  await sayGoodnight();
  expect(api).toHaveBeenLastCalledWith('/me/camp/goodnight', { method: 'POST', headers: JSON_HEADERS });
  await undoGoodnight();
  expect(api).toHaveBeenLastCalledWith('/me/camp/goodnight', { method: 'DELETE', headers: JSON_HEADERS });
  await saveCampNote('night all');
  expect(api).toHaveBeenLastCalledWith('/me/camp/note', { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ text: 'night all' }) });
  await clearCampNote();
  expect(api).toHaveBeenLastCalledWith('/me/camp/note', { method: 'DELETE', headers: JSON_HEADERS });
});
```

`mobile/__tests__/lib/campCopy.test.ts`:

```ts
import {
  campBannerLine, campClock, campKicker, campStatus, fireLine, goodnightOpensLine, goodnightSaidLine, highlightKicker,
  highlightKickerColor, highlightLine, knownHighlights, knownStoryFrames, knownTimelineItems, noteLength, timelineAction,
  timelineLine,
} from '../../src/lib/socialCopy';
import type { CampMember, HighlightItem, StoryFrame, TimelineItem } from '../../src/api/social';

const sam = { id: 's', handle: 'sam', displayName: 'Sam', coachId: 'mochi' };
const me = { id: 'm', handle: 'me', displayName: 'Me', coachId: 'mochi' };
const base = { id: 'x', at: '2026-10-07T22:00:00.000Z', actor: sam, mine: false };
const odd = <T,>(v: unknown) => v as T;

it('words the goodnight and camp-note rows, with no one-tap action', () => {
  const items: TimelineItem[] = [
    { ...base, kind: 'goodnight', onTime: true },
    { ...base, kind: 'goodnight', onTime: false },
    { ...base, kind: 'camp_note' },
    { ...base, actor: me, mine: true, kind: 'goodnight', onTime: true },
  ];
  expect(knownTimelineItems(items)).toHaveLength(4);
  expect(items.map(timelineLine)).toEqual(['Sam said goodnight, on time', 'Sam said goodnight', 'Sam left a camp note', 'You said goodnight, on time']);
  expect(items.map(timelineAction)).toEqual([null, null, null, null]);
  // A goodnight without its on-time flag is not worded as either.
  expect(knownTimelineItems([odd<TimelineItem>({ ...base, kind: 'goodnight' })])).toEqual([]);
});

it('knows a goodnight frame only with its on-time flag', () => {
  const frames: StoryFrame[] = [{ kind: 'goodnight', at: base.at, onTime: true }, odd<StoryFrame>({ kind: 'goodnight', at: base.at })];
  expect(knownStoryFrames(frames)).toEqual([{ kind: 'goodnight', at: base.at, onTime: true }]);
});

it('words the camp highlights, and skips a campfire without a real count', () => {
  const h = (item: Partial<HighlightItem>) => ({ actor: sam, mine: false, ...item }) as HighlightItem;
  const items = [
    h({ type: 'top_story', reason: 'on_time_every_night' }),
    { type: 'top_story', reason: 'on_time_every_night', actor: me, mine: true } as HighlightItem,
    { type: 'campfire', nights: 5, actor: me, mine: true } as HighlightItem,
    h({ type: 'joined' }),
    h({ type: 'first_badge' }),
    { type: 'first_badge', actor: me, mine: true } as HighlightItem,
  ];
  expect(knownHighlights(items)).toHaveLength(6);
  expect(items.map(highlightLine)).toEqual([
    'Sam was in bed on time every night',
    'You were in bed on time every night',
    'The fire was lit 5 nights',
    'Sam joined the camp',
    'Sam earned their first badge',
    'You earned your first badge',
  ]);
  expect(items.map(highlightKicker)).toEqual(['Top story', 'Top story', 'Campfire', 'New at camp', 'First badge', 'First badge']);
  expect(items.map(highlightKickerColor)).toEqual(['#A5B4FC', '#A5B4FC', '#FB923C', null, null, null]);
  expect(knownHighlights([
    odd<HighlightItem>({ type: 'campfire', nights: 0, actor: me, mine: true }),
    odd<HighlightItem>({ type: 'campfire', actor: me, mine: true }),
  ])).toEqual([]);
});

it('words the camp banner by night and by day, and for an older server', () => {
  expect(campBannerLine({ checkedIn: 4, members: 5, faces: [] })).toBe('4 checked in');
  expect(campBannerLine({ checkedIn: 4, members: 5, faces: [], night: false, awake: 5, asleep: 0 })).toBe('4 checked in');
  expect(campBannerLine({ checkedIn: 1, members: 5, faces: [], night: true, awake: 3, asleep: 2 })).toBe('3 awake · 2 asleep');
});

it("words the fire, who's here, the header kicker, a said goodnight and a note's length — every time in 12-hour", () => {
  expect(fireLine({ lit: 3, of: 5, segments: 3 })).toBe('3 of 5 in bed on time');
  const m = (over: Partial<CampMember>): CampMember => ({ person: sam, mine: false, asleep: false, asleepSince: null, onTime: null, note: null, ...over });
  // Built on the phone's own clock, so the words don't depend on the test machine's zone.
  const since = new Date(2026, 9, 7, 22, 15).toISOString();
  expect(campClock(since)).toBe('10:15 PM');
  expect(campClock(new Date(2026, 9, 8, 0, 5).toISOString())).toBe('12:05 AM');
  expect(campClock(new Date(2026, 9, 8, 12, 0).toISOString())).toBe('12:00 PM');
  expect(campStatus(m({ asleep: true, asleepSince: since, onTime: true }))).toBe('asleep since 10:15 PM · on time');
  expect(campStatus(m({ asleep: true, asleepSince: since, onTime: false }))).toBe('asleep since 10:15 PM');
  expect(campStatus(m({ note: 'bed soon' }))).toBe('awake · bed soon');
  expect(campStatus(m({}))).toBe('awake');
  expect(campKicker(new Date(2026, 9, 6, 22, 42))).toBe('TUESDAY · 10:42 PM');
  expect(campKicker(new Date(2026, 9, 7, 0, 5))).toBe('WEDNESDAY · 12:05 AM');
  expect(goodnightOpensLine('20:00')).toBe('You can say goodnight from 8:00 PM');
  expect(goodnightOpensLine('17:00')).toBe('You can say goodnight from 5:00 PM');
  expect(goodnightOpensLine('11:30')).toBe('You can say goodnight from 11:30 AM');
  expect(goodnightSaidLine({ localDate: '2026-10-07', at: since, onTime: true, undoUntil: since })).toBe('Goodnight said, on time');
  expect(goodnightSaidLine({ localDate: '2026-10-07', at: since, onTime: false, undoUntil: since })).toBe('Goodnight said');
  expect(noteLength('  🔥hi ')).toBe(3);
});
```

- [ ] **Step 2: Run them to see them fail**

Run (from `mobile/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/api/camp.test.ts __tests__/lib/campCopy.test.ts`
Expected: FAIL — `fetchCamp` / `campBannerLine` / `campClock` / `goodnightOpensLine` are not exported.

- [ ] **Step 3: The API client**

Replace `mobile/src/api/social.ts` with:

```ts
import { apiFetch } from './client';
import { buddyErrorCode, type Person, type StickerKind } from './buddies';
import type { AchievementFamily } from './achievements';

// Social tab client (spec 2026-10-07 social). Types mirror the backend/src/social/*.ts DTOs exactly. Only a BARE
// 404 (no error code) means the backend predates Social — or, for /me/camp, predates the Campfire (S2); every other
// social error carries { error: code }.

export type CheckInMood = 'RESTED' | 'OKAY' | 'TIRED';
export interface CheckIn { mood: CheckInMood; localDate: string; updatedAt: string }

export type StoryFrame =
  // Locked = a buddy's check-in before I checked in today: no mood is sent.
  | { kind: 'checkin'; at: string; locked: true }
  | { kind: 'checkin'; at: string; locked: false; mood: CheckInMood }
  | { kind: 'badge'; at: string; family: AchievementFamily; level: number }
  // `line` is the headline snapshotted when the recap was shared (never empty), not the live recap line.
  | { kind: 'recap'; at: string; recapId: string; recapKind: 'WEEK' | 'MONTH'; periodStart: string; periodEnd: string; line: string; coachId: string }
  // S2: a goodnight said in the author's day; never locked.
  | { kind: 'goodnight'; at: string; onTime: boolean };
export interface Story { author: Person; localDate: string; frames: StoryFrame[] }
export interface StoryRing { author: Person; unseen: boolean; locked: boolean; frameCount: number; latestAt: string }

/** `id` is opaque: a key for lists, never parsed. */
type Base = { id: string; at: string; actor: Person; mine: boolean };
export type TimelineItem =
  // Locked = a buddy's check-in before I checked in today: no mood is sent. My own check-in is never locked.
  | (Base & { kind: 'checkin'; locked: true })
  | (Base & { kind: 'checkin'; locked: false; mood: CheckInMood })
  | (Base & { kind: 'step_goal' })
  | (Base & { kind: 'badge'; badge: { family: AchievementFamily; level: number } })
  | (Base & { kind: 'sticker'; sticker: StickerKind; to: Person })
  | (Base & { kind: 'recap_share'; recapKind: 'WEEK' | 'MONTH' })
  | (Base & { kind: 'goodnight'; onTime: boolean })
  // A camp note exists: its text is only ever on the Campfire page.
  | (Base & { kind: 'camp_note' });

type Actor = { actor: Person; mine: boolean };
export type HighlightItem =
  | (Actor & { type: 'top_story'; reason: 'badge'; family: AchievementFamily; level: number })
  | (Actor & { type: 'top_story'; reason: 'on_time_every_night' })
  | (Actor & { type: 'top_story'; reason: 'checked_in_every_day' })
  | (Actor & { type: 'most_cheered_you'; count: number })
  | (Actor & { type: 'comeback' })
  // The actor is me (the camp's item); `nights` counts the circle's own goodnights, never a health number.
  | (Actor & { type: 'campfire'; nights: number })
  | (Actor & { type: 'checked_in_every_day' })
  | (Actor & { type: 'joined' })
  | (Actor & { type: 'first_badge' })
  | (Actor & { type: 'most_stickers_sent'; count: number });
export interface Highlights { weekStart: string; weekEnd: string; items: HighlightItem[] }

/** My goodnight (S2). Undo is offered until `undoUntil` (at + 10 min). */
export interface Goodnight { localDate: string; at: string; onTime: boolean; undoUntil: string }

export interface SocialHome {
  /** `goodnight` arrives with S2: my goodnight tonight, or null; undefined from an S1 server. */
  me: { person: Person; checkIn: CheckIn | null; goodnight?: Goodnight | null };
  /**
   * `faces`: coach ids of up to two buddies who checked in today, newest first. `night` (the scene, 19:00–05:59 in my
   * zone), `awake`, `asleep` and `goodnightOpen` (my own goodnight window: from min(20:00, my goal − 60 min) to 05:59)
   * arrive with S2; an S1 server sends none, and the banner then stays a static strip with no goodnight row.
   */
  camp: { checkedIn: number; members: number; faces: string[]; night?: boolean; awake?: number; asleep?: number; goodnightOpen?: boolean };
  stories: StoryRing[];
  highlights: Highlights | null;
  timeline: TimelineItem[];
  /** `chats` arrives with S3 (DMs); the tab dot reads requests + stickers until then. */
  unread: { requests: number; stickers: number; chats?: number };
}

/** One person at the camp. `note` is their camp note: a buddy's free text, shown on the Campfire page only. */
export interface CampMember { person: Person; mine: boolean; asleep: boolean; asleepSince: string | null; onTime: boolean | null; note: string | null }
export interface Camp {
  /** The scene: night 19:00–05:59 in my zone. */
  night: boolean;
  /** Me first, then buddies by latest activity. */
  members: CampMember[];
  fire: { lit: number; of: number; segments: number };
  nightsLitThisWeek: number;
  /** My goodnight tonight, or null. */
  goodnight: Goodnight | null;
  /** Whether my "Say goodnight" window is open now. */
  goodnightOpen: boolean;
  /** When it opens, "HH:MM" on my clock: min(20:00, my goal − 60 min). */
  goodnightOpensAt: string;
}
export interface CampNote { text: string; createdAt: string; expiresAt: string }

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const isBare404 = (error: unknown) => (error as { status?: number } | null)?.status === 404 && buddyErrorCode(error) === null;
const id = (s: string) => encodeURIComponent(s);

/** null only for a bare 404: a backend older than Social. */
export async function fetchSocialHome(): Promise<SocialHome | null> {
  try {
    return await apiFetch<SocialHome>('/me/social');
  } catch (error) {
    if (isBare404(error)) return null;
    throw error;
  }
}

export const saveCheckIn = (mood: CheckInMood) => apiFetch<{ checkIn: CheckIn }>('/me/social/checkin', send('PUT', { mood }));
export const fetchStory = (authorId: string) => apiFetch<Story>(`/me/social/stories/${id(authorId)}`);
// The seen routes answer 204.
export async function markStorySeen(authorId: string): Promise<void> {
  await apiFetch<void>(`/me/social/stories/${id(authorId)}/seen`, send('POST'));
}
export async function markStickersSeen(): Promise<void> {
  await apiFetch<void>('/me/social/stickers/seen', send('POST'));
}
// `line` is the text the user previewed; the server refuses the share if the recap's line has changed since.
export const shareRecap = (recapId: string, line: string) =>
  apiFetch<{ shared: true }>('/me/social/recap-shares', send('POST', { recapId, line }));
export async function unshareRecap(recapId: string): Promise<void> {
  await apiFetch<void>(`/me/social/recap-shares/${id(recapId)}`, send('DELETE'));
}

/** Whether I already share this recap; null on an older server (bare 404), where sharing doesn't exist. */
export async function fetchRecapShared(recapId: string): Promise<boolean | null> {
  try {
    return (await apiFetch<{ shared: boolean }>(`/me/social/recap-shares/${id(recapId)}`)).shared;
  } catch (error) {
    if (isBare404(error)) return null;
    throw error;
  }
}

export async function fetchHighlights(): Promise<Highlights | null> {
  return (await apiFetch<{ highlights: Highlights | null }>('/me/social/highlights')).highlights;
}

/** The Campfire page; null only for a bare 404: a backend without the Campfire (S1). */
export async function fetchCamp(): Promise<Camp | null> {
  try {
    return await apiFetch<Camp>('/me/camp');
  } catch (error) {
    if (isBare404(error)) return null;
    throw error;
  }
}

export const sayGoodnight = () => apiFetch<{ goodnight: Goodnight }>('/me/camp/goodnight', send('POST'));
// Undo and clear answer 204.
export async function undoGoodnight(): Promise<void> {
  await apiFetch<void>('/me/camp/goodnight', send('DELETE'));
}
export const saveCampNote = (text: string) => apiFetch<{ note: CampNote }>('/me/camp/note', send('PUT', { text }));
export async function clearCampNote(): Promise<void> {
  await apiFetch<void>('/me/camp/note', send('DELETE'));
}
```

- [ ] **Step 4: The copy**

Replace `mobile/src/lib/socialCopy.ts` with:

```ts
import type { Person } from '../api/buddies';
import type { Camp, CampMember, CheckInMood, Goodnight, HighlightItem, SocialHome, StoryFrame, TimelineItem } from '../api/social';
import { FAMILY_NAMES, levelTitle, MAX_LEVEL } from './badges';
import { STICKER_LABEL } from './buddyCopy';

// Social copy (spec 2026-10-07 social §5, §6, §7). Fixed templates over typed fields: no free text, no health numbers
// (the only counts are the circle's own actions, like stickers sent or nights the fire was lit). The one exception is
// a camp note's own text, which only the Campfire page shows (campStatus and the coach bubbles).

export const CHECKIN_OPTIONS: ReadonlyArray<{ mood: CheckInMood; label: string; color: string }> = [
  { mood: 'RESTED', label: 'Rested', color: '#86EFAC' },
  { mood: 'OKAY', label: 'Okay', color: '#93C5FD' },
  { mood: 'TIRED', label: 'Tired', color: '#FDBA74' },
];
const MOOD_WORD: Record<CheckInMood, string> = { RESTED: 'rested', OKAY: 'okay', TIRED: 'tired' };

/** "You" for me; otherwise the display name, or "@handle" when it is unset (''). */
export const personName = (p: Person, mine: boolean) => (mine ? 'You' : p.displayName || `@${p.handle}`);

// The kinds and types this app knows. A newer server may add more (S3 adds chats); lists skip what they don't know
// instead of crashing on it. The same goes for an unknown value inside a known kind (a new top-story reason, sticker,
// badge family or recap kind, a goodnight without its on-time flag, a campfire without a count): skipped, never
// worded as something it isn't ("checked in every day", "a undefined", "undefined II", "monthly").
const TIMELINE_KINDS: ReadonlySet<string> = new Set<TimelineItem['kind']>([
  'checkin', 'step_goal', 'badge', 'sticker', 'recap_share', 'goodnight', 'camp_note',
]);
const HIGHLIGHT_TYPES: ReadonlySet<string> = new Set<HighlightItem['type']>([
  'top_story', 'most_cheered_you', 'comeback', 'checked_in_every_day', 'most_stickers_sent', 'campfire', 'joined', 'first_badge',
]);
const TOP_STORY_REASONS: ReadonlySet<string> = new Set(['badge', 'checked_in_every_day', 'on_time_every_night']);
const STORY_FRAME_KINDS: ReadonlySet<string> = new Set<StoryFrame['kind']>(['checkin', 'badge', 'recap', 'goodnight']);
const RECAP_KINDS: ReadonlySet<string> = new Set(['WEEK', 'MONTH']);
const has = (table: object, key: unknown) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key);
const knownMood = (mood: unknown) => has(MOOD_WORD, mood);
const knownBadge = (family: unknown, level: unknown) =>
  has(FAMILY_NAMES, family) && Number.isInteger(level) && (level as number) >= 1 && (level as number) <= MAX_LEVEL;

function isKnownTimelineItem(i: TimelineItem): boolean {
  if (!TIMELINE_KINDS.has(i.kind)) return false;
  switch (i.kind) {
    case 'checkin': return i.locked || knownMood(i.mood);
    case 'badge': return knownBadge(i.badge?.family, i.badge?.level);
    case 'sticker': return has(STICKER_LABEL, i.sticker);
    case 'recap_share': return RECAP_KINDS.has(i.recapKind);
    case 'goodnight': return typeof i.onTime === 'boolean';
    default: return true;
  }
}

function isKnownHighlight(i: HighlightItem): boolean {
  if (!HIGHLIGHT_TYPES.has(i.type)) return false;
  if (i.type === 'campfire') return Number.isInteger(i.nights) && i.nights > 0;
  if (i.type !== 'top_story') return true;
  if (!TOP_STORY_REASONS.has(i.reason)) return false;
  return i.reason !== 'badge' || knownBadge(i.family, i.level);
}

function isKnownStoryFrame(f: StoryFrame): boolean {
  if (!STORY_FRAME_KINDS.has(f.kind)) return false;
  switch (f.kind) {
    case 'checkin': return f.locked || knownMood(f.mood);
    case 'badge': return knownBadge(f.family, f.level);
    case 'recap': return RECAP_KINDS.has(f.recapKind);
    case 'goodnight': return typeof f.onTime === 'boolean';
    default: return true;
  }
}

export const knownTimelineItems = (items: readonly TimelineItem[]) => items.filter(isKnownTimelineItem);
export const knownHighlights = (items: readonly HighlightItem[]) => items.filter(isKnownHighlight);
export const knownStoryFrames = (frames: readonly StoryFrame[]) => frames.filter(isKnownStoryFrame);

/** A timeline line as the bold name and the muted rest; every line starts with its actor. */
export function timelineParts(item: TimelineItem): { name: string; rest: string } {
  const name = personName(item.actor, item.mine);
  switch (item.kind) {
    case 'checkin':
      if (item.locked) return { name, rest: 'checked in' };
      return { name, rest: item.mine ? `checked in: ${MOOD_WORD[item.mood]}` : `woke up ${MOOD_WORD[item.mood]}` };
    case 'step_goal':
      return { name, rest: item.mine ? 'passed your step goal' : 'passed their step goal' };
    case 'badge':
      return { name, rest: `reached ${levelTitle(item.badge.family, item.badge.level)}` };
    case 'sticker':
      return {
        name,
        rest: item.mine ? `sent ${personName(item.to, false)} a ${STICKER_LABEL[item.sticker]}` : `sent you a ${STICKER_LABEL[item.sticker]}`,
      };
    case 'recap_share':
      return { name, rest: `shared ${item.mine ? 'your' : 'their'} ${item.recapKind === 'WEEK' ? 'weekly' : 'monthly'} recap` };
    case 'goodnight':
      return { name, rest: item.onTime ? 'said goodnight, on time' : 'said goodnight' };
    case 'camp_note':
      return { name, rest: 'left a camp note' };
  }
}

export function timelineLine(item: TimelineItem): string {
  const { name, rest } = timelineParts(item);
  return `${name} ${rest}`;
}

/**
 * The sticker a row offers: none on my own rows, on stickers, on goodnights (they're off to bed) and camp notes (the
 * note is read on the Campfire), or on a locked check-in (no mood to react to).
 */
export function timelineAction(item: TimelineItem): 'cheer' | 'rest_up' | null {
  if (item.mine || item.kind === 'sticker' || item.kind === 'goodnight' || item.kind === 'camp_note') return null;
  if (item.kind === 'checkin') {
    if (item.locked) return null;
    return item.mood === 'TIRED' ? 'rest_up' : 'cheer';
  }
  return 'cheer';
}

export function highlightKicker(item: HighlightItem): string {
  switch (item.type) {
    case 'top_story': return 'Top story';
    case 'most_cheered_you': return 'Most cheered';
    case 'comeback': return 'Comeback';
    case 'checked_in_every_day': return 'Every day';
    case 'most_stickers_sent': return 'Most generous';
    case 'campfire': return 'Campfire';
    case 'joined': return 'New at camp';
    case 'first_badge': return 'First badge';
  }
}

/** The kicker's colour (design V5); null = the muted foreground. */
export function highlightKickerColor(item: HighlightItem): string | null {
  switch (item.type) {
    case 'top_story': return '#A5B4FC';
    case 'most_cheered_you': return '#FCD34D';
    case 'comeback': return '#86EFAC';
    case 'campfire': return '#FB923C';
    default: return null;
  }
}

export function highlightLine(item: HighlightItem): string {
  const who = personName(item.actor, item.mine);
  switch (item.type) {
    case 'top_story':
      if (item.reason === 'badge') return `${who} reached ${levelTitle(item.family, item.level)}`;
      if (item.reason === 'on_time_every_night') return `${who} ${item.mine ? 'were' : 'was'} in bed on time every night`;
      return `${who} checked in every day`;
    case 'most_cheered_you': return `${who} cheered you most`;
    case 'comeback': return `${who} bounced back to rested`;
    case 'checked_in_every_day': return `${who} checked in every day`;
    case 'most_stickers_sent': return `${who} sent ${item.count} stickers`;
    case 'campfire': return `The fire was lit ${item.nights} nights`;
    case 'joined': return `${who} joined the camp`;
    case 'first_badge': return item.mine ? 'You earned your first badge' : `${who} earned their first badge`;
  }
}

/** ISO-8601 week number of the week starting on `monday` (YYYY-MM-DD): the week its Thursday falls in. */
export function isoWeekNumber(monday: string): number {
  const thursday = new Date(`${monday}T00:00:00Z`);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.floor((thursday.getTime() - yearStart) / 86_400_000 / 7) + 1;
}

/** "Week 40 highlights". */
export const highlightsTitle = (weekStart: string) => `Week ${isoWeekNumber(weekStart)} highlights`;

/** "8:05": the local time of a timeline row. */
export function clockTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ---- The camp (spec §6) ----

/** A camp note's limit, and its length as the server counts it: code points after trimming. */
export const CAMP_NOTE_MAX = 40;
export const noteLength = (draft: string) => [...draft.trim()].length;

/** The banner's second line: who's awake and asleep at night; who checked in by day, or from an S1 server. */
export function campBannerLine(camp: SocialHome['camp']): string {
  if (camp.night === true && typeof camp.awake === 'number' && typeof camp.asleep === 'number') return `${camp.awake} awake · ${camp.asleep} asleep`;
  return `${camp.checkedIn} checked in`;
}

export const fireLine = (fire: Camp['fire']) => `${fire.lit} of ${fire.of} in bed on time`;

// Every time on the Campfire is 12-hour (owner ruling): "10:15 PM".
const twelveHour = (hour: number, minute: number) => `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;

/** "10:15 PM": a moment on the phone's clock, for the Campfire. */
export function campClock(iso: string): string {
  const d = new Date(iso);
  return twelveHour(d.getHours(), d.getMinutes());
}

/** "Who's here": "awake · {their whole note}" or "awake", or "asleep since 10:15 PM · on time". */
export function campStatus(m: CampMember): string {
  if (m.asleep) return `asleep${m.asleepSince ? ` since ${campClock(m.asleepSince)}` : ''}${m.onTime ? ' · on time' : ''}`;
  return m.note ? `awake · ${m.note}` : 'awake';
}

export const goodnightSaidLine = (g: Goodnight) => (g.onTime ? 'Goodnight said, on time' : 'Goodnight said');

/** "You can say goodnight from 8:00 PM", from my window's opening ("HH:MM", my clock). */
export function goodnightOpensLine(opensAt: string): string {
  const [hour, minute] = opensAt.split(':').map(Number) as [number, number];
  return `You can say goodnight from ${twelveHour(hour, minute)}`;
}

const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;

/** "TUESDAY · 10:42 PM": the Campfire header's kicker, on the phone's clock. */
export function campKicker(now: Date): string {
  return `${WEEKDAYS[now.getDay()]} · ${twelveHour(now.getHours(), now.getMinutes())}`;
}
```

- [ ] **Step 5: Timeline dot colours for the new kinds**

In `mobile/src/components/social/TimelineList.tsx`, replace the `DOT` line with:

```ts
const DOT: Record<TimelineItem['kind'], string> = {
  checkin: '#93C5FD', step_goal: '#FB923C', badge: '#FCD34D', sticker: '#F9A8D4', recap_share: '#A5B4FC', goodnight: '#A78BFA', camp_note: '#C7D2FE',
};
```

- [ ] **Step 6: Run the tests and the typecheck**

Run (from `mobile/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/api/camp.test.ts __tests__/lib/campCopy.test.ts __tests__/api/social.test.ts __tests__/lib/socialCopy.test.ts __tests__/components/TimelineList.test.tsx __tests__/components/HighlightsCarousel.test.tsx __tests__/screens/HighlightsScreen.test.tsx`
Expected: PASS.
Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/tsc --noEmit --types jest,node --pretty false | grep -c "error TS"` — Expected: `12`.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/api/social.ts mobile/src/lib/socialCopy.ts mobile/src/components/social/TimelineList.tsx mobile/__tests__/api/camp.test.ts mobile/__tests__/lib/campCopy.test.ts
git commit -m "feat(social-app): camp API and copy: goodnight, camp notes, camp timeline items and highlights"
```

---

### Task 12: The banner opens the camp; goodnight in the evening timeline

**Files:**
- Create: `mobile/src/components/social/GoodnightButton.tsx`
- Modify: `mobile/src/components/social/CampBanner.tsx`, `mobile/src/screens/SocialScreen.tsx`,
  `mobile/src/navigation/RootNavigator.tsx` (route type only)
- Test: create `mobile/__tests__/components/CampBanner.test.tsx`, `mobile/__tests__/components/GoodnightButton.test.tsx`,
  `mobile/__tests__/screens/SocialScreenCampfire.test.tsx`; rerun `mobile/__tests__/screens/SocialScreen.test.tsx`

**Interfaces:**
- Consumes: `sayGoodnight`, `undoGoodnight`, `Goodnight`, `SocialHome` (Task 11); `campBannerLine`, `goodnightSaidLine`
  (Task 11); `buddyErrorMessage` with the Task 4 codes.
- Produces:
  - `CampBanner({ camp: SocialHome['camp']; onOpen?: () => void })` — testIDs `camp-banner`, `camp-banner-line`,
    `camp-face-<i>`; pressable only with `onOpen`.
  - `GoodnightButton({ goodnight: Goodnight | null; onChanged: () => void; testID?: string })` — testIDs
    `<testID>-say`, `<testID>-said`, `<testID>-undo`, `<testID>-message` (default testID `goodnight`).
  - `RootStackParamList.Campfire: undefined` (the screen is registered in Task 13).
  - SocialScreen: the banner opens `Campfire` when `home.camp.night !== undefined`; under Today, while my goodnight
    window is open (`home.camp.goodnightOpen === true`, owner ruling Q1 — not the scene's `night`) and
    `home.me.goodnight !== undefined`, a `GoodnightButton` with testID `timeline-goodnight`.

- [ ] **Step 1: Write the failing tests**

`mobile/__tests__/components/CampBanner.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { CampBanner } from '../../src/components/social/CampBanner';

it('from an S1 server: a static strip with the check-in count and up to two faces', () => {
  render(<CampBanner camp={{ checkedIn: 4, members: 5, faces: ['mochi', 'boba', 'kit'] }} />);
  expect(screen.getByTestId('camp-banner')).toHaveTextContent(/THE CAMP.*4 checked in/);
  expect(screen.getByTestId('camp-banner').props.accessibilityRole).toBe('summary');
  expect(screen.getByTestId('camp-face-1')).toBeTruthy();
  expect(screen.queryByTestId('camp-face-2')).toBeNull();
});

it('at night: who is awake and asleep, and a tap opens the camp', () => {
  const onOpen = jest.fn();
  render(<CampBanner camp={{ checkedIn: 1, members: 5, faces: [], night: true, awake: 3, asleep: 2 }} onOpen={onOpen} />);
  expect(screen.getByTestId('camp-banner-line')).toHaveTextContent('3 awake · 2 asleep');
  expect(screen.getByLabelText('Open the camp, 3 awake · 2 asleep')).toBeTruthy();
  fireEvent.press(screen.getByTestId('camp-banner'));
  expect(onOpen).toHaveBeenCalledTimes(1);
});

it('by day on an S2 server: the check-in count, still opening the camp', () => {
  const onOpen = jest.fn();
  render(<CampBanner camp={{ checkedIn: 2, members: 5, faces: [], night: false, awake: 5, asleep: 0 }} onOpen={onOpen} />);
  expect(screen.getByTestId('camp-banner-line')).toHaveTextContent('2 checked in');
  fireEvent.press(screen.getByTestId('camp-banner'));
  expect(onOpen).toHaveBeenCalledTimes(1);
});
```

`mobile/__tests__/components/GoodnightButton.test.tsx`:

```tsx
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ApiError } from '../../src/api/client';
import { sayGoodnight, undoGoodnight } from '../../src/api/social';
import { GoodnightButton } from '../../src/components/social/GoodnightButton';

jest.mock('../../src/api/social', () => ({ ...jest.requireActual('../../src/api/social'), sayGoodnight: jest.fn(), undoGoodnight: jest.fn() }));
const said = (undoInMs: number, onTime = false) => ({ localDate: '2026-10-07', at: new Date().toISOString(), onTime, undoUntil: new Date(Date.now() + undoInMs).toISOString() });

beforeEach(() => jest.clearAllMocks());

it('says goodnight once on a double tap, then tells the parent', async () => {
  let resolve!: (v: unknown) => void;
  (sayGoodnight as jest.Mock).mockReturnValue(new Promise((r) => { resolve = r; }));
  const onChanged = jest.fn();
  render(<GoodnightButton goodnight={null} onChanged={onChanged} />);
  act(() => {
    fireEvent.press(screen.getByTestId('goodnight-say'));
    fireEvent.press(screen.getByTestId('goodnight-say'));
  });
  await act(async () => resolve({ goodnight: said(600_000) }));
  expect(sayGoodnight).toHaveBeenCalledTimes(1);
  expect(onChanged).toHaveBeenCalledTimes(1);
});

it('shows "Goodnight said" with Undo only inside its window, and hides Undo when the window closes', () => {
  jest.useFakeTimers();
  try {
    render(<GoodnightButton goodnight={said(5_000, true)} onChanged={jest.fn()} />);
    expect(screen.getByTestId('goodnight-said')).toHaveTextContent('Goodnight said, on time');
    expect(screen.getByTestId('goodnight-undo')).toBeTruthy();
    act(() => jest.advanceTimersByTime(5_001));
    expect(screen.queryByTestId('goodnight-undo')).toBeNull();
    expect(screen.queryByTestId('goodnight-say')).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

it('undoes, and says why when the server refuses', async () => {
  (undoGoodnight as jest.Mock).mockRejectedValueOnce(new ApiError(409, 'x', 'undo_expired'));
  const onChanged = jest.fn();
  render(<GoodnightButton goodnight={said(600_000)} onChanged={onChanged} />);
  await act(async () => fireEvent.press(screen.getByTestId('goodnight-undo')));
  expect(undoGoodnight).toHaveBeenCalledTimes(1);
  expect(onChanged).not.toHaveBeenCalled();
  expect(screen.getByTestId('goodnight-message')).toHaveTextContent("It's too late to undo that goodnight.");
});

it('a tap the server refuses as too early says so', async () => {
  (sayGoodnight as jest.Mock).mockRejectedValueOnce(new ApiError(409, 'x', 'goodnight_closed'));
  render(<GoodnightButton goodnight={null} onChanged={jest.fn()} testID="timeline-goodnight" />);
  await act(async () => fireEvent.press(screen.getByTestId('timeline-goodnight-say')));
  expect(screen.getByTestId('timeline-goodnight-message')).toHaveTextContent("It's too early to say goodnight.");
});
```

`mobile/__tests__/screens/SocialScreenCampfire.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fetchSocialHome, type SocialHome } from '../../src/api/social';
import { resetSocial } from '../../src/lib/socialStore';
import { SocialScreen } from '../../src/screens/SocialScreen';

jest.mock('../../src/api/social', () => ({
  ...jest.requireActual('../../src/api/social'),
  fetchSocialHome: jest.fn(),
  markStickersSeen: jest.fn().mockResolvedValue(undefined),
  sayGoodnight: jest.fn(),
}));
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
  useIsFocused: () => true,
  useFocusEffect: (cb: () => void) => { const React = require('react'); React.useEffect(cb, []); },
}));
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const renderScreen = () => render(<SafeAreaProvider initialMetrics={metrics}><SocialScreen /></SafeAreaProvider>);
const person = (id: string) => ({ id, handle: id, displayName: id.toUpperCase(), coachId: 'mochi' });
const home = (over: Partial<SocialHome> = {}): SocialHome => ({
  me: { person: person('me'), checkIn: null, goodnight: null },
  camp: { checkedIn: 1, members: 3, faces: [], night: true, awake: 3, asleep: 0, goodnightOpen: true },
  stories: [],
  highlights: null,
  timeline: [],
  unread: { requests: 0, stickers: 0 },
  ...over,
});

beforeEach(() => {
  mockNavigate.mockReset();
  (fetchSocialHome as jest.Mock).mockReset();
  resetSocial();
});

it('an S2 server at night: the banner opens the Campfire, and the evening timeline offers goodnight', async () => {
  (fetchSocialHome as jest.Mock).mockResolvedValue(home());
  renderScreen();
  expect(await screen.findByTestId('camp-banner-line')).toHaveTextContent('3 awake · 0 asleep');
  fireEvent.press(screen.getByTestId('camp-banner'));
  expect(mockNavigate).toHaveBeenLastCalledWith('Campfire');
  expect(screen.getByTestId('timeline-goodnight-say')).toBeTruthy();
});

it('by day: no goodnight in the timeline, and the banner still opens the camp', async () => {
  (fetchSocialHome as jest.Mock).mockResolvedValue(home({ camp: { checkedIn: 2, members: 3, faces: [], night: false, awake: 3, asleep: 0, goodnightOpen: false } }));
  renderScreen();
  expect(await screen.findByTestId('camp-banner-line')).toHaveTextContent('2 checked in');
  expect(screen.queryByTestId('timeline-goodnight-say')).toBeNull();
  fireEvent.press(screen.getByTestId('camp-banner'));
  expect(mockNavigate).toHaveBeenLastCalledWith('Campfire');
});

it('the goodnight row follows my window, not the scene: 17:30 with an 18:00 goal is still day, yet open', async () => {
  (fetchSocialHome as jest.Mock).mockResolvedValue(home({ camp: { checkedIn: 2, members: 3, faces: [], night: false, awake: 3, asleep: 0, goodnightOpen: true } }));
  renderScreen();
  expect(await screen.findByTestId('camp-banner-line')).toHaveTextContent('2 checked in');
  expect(screen.getByTestId('timeline-goodnight-say')).toBeTruthy();
});

it('the goodnight row follows my window, not the scene: 19:30 with no goal is night, yet closed until 20:00', async () => {
  (fetchSocialHome as jest.Mock).mockResolvedValue(home({ camp: { checkedIn: 2, members: 3, faces: [], night: true, awake: 3, asleep: 0, goodnightOpen: false } }));
  renderScreen();
  expect(await screen.findByTestId('camp-banner-line')).toHaveTextContent('3 awake · 0 asleep');
  expect(screen.queryByTestId('timeline-goodnight-say')).toBeNull();
});

it('an S1 server (no camp.night, no me.goodnight): the static banner, and nothing offers goodnight', async () => {
  (fetchSocialHome as jest.Mock).mockResolvedValue(home({ me: { person: person('me'), checkIn: null }, camp: { checkedIn: 2, members: 3, faces: [] } }));
  renderScreen();
  expect(await screen.findByTestId('camp-banner-line')).toHaveTextContent('2 checked in');
  fireEvent.press(screen.getByTestId('camp-banner'));
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(screen.queryByTestId('timeline-goodnight-say')).toBeNull();
});
```

- [ ] **Step 2: Run them to see them fail**

Run (from `mobile/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/components/CampBanner.test.tsx __tests__/components/GoodnightButton.test.tsx __tests__/screens/SocialScreenCampfire.test.tsx`
Expected: FAIL — `GoodnightButton` doesn't exist; `CampBanner` has no `camp` prop or `camp-banner-line`.

- [ ] **Step 3: The banner**

Replace `mobile/src/components/social/CampBanner.tsx` with:

```tsx
// The camp banner (spec 2026-10-07 social §4, item 1): "THE CAMP" over "{awake} awake · {asleep} asleep" at night
// (19:00–05:59 in my zone) or "{n} checked in" by day, a small fire, and up to two coach faces of buddies who checked
// in today. Tapping it opens the Campfire page (S2) — given `onOpen`, which the Social screen passes only when the
// server has a Campfire (it sends `camp.night`); an S1 server keeps the static strip.

import React from 'react';
import { View } from 'react-native';
import type { SocialHome } from '../../api/social';
import { campBannerLine } from '../../lib/socialCopy';
import { Character } from '../characters/Character';
import { DEFAULT_CHARACTER_ID, isCharacterId } from '../characters/types';
import { pixelFont } from '../coach/thinking/shared';
import { PressableScale } from '../ui/pressable-scale';
import { Text } from '../ui/text';

const STRIP = 'h-[74px] flex-row items-center gap-3 overflow-hidden rounded-tile bg-[#0F1230] px-4';

export function CampBanner({ camp, onOpen }: { camp: SocialHome['camp']; onOpen?: () => void }) {
  const line = campBannerLine(camp);
  const body = (
    <>
      <View className="h-8 w-8 items-center justify-center">
        <View style={{ width: 8, height: 8, backgroundColor: '#FDE68A' }} />
        <View style={{ width: 16, height: 8, backgroundColor: '#FB923C' }} />
        <View style={{ width: 24, height: 6, backgroundColor: '#78350F' }} />
      </View>
      <View className="flex-1">
        <Text className="text-[10px] text-[#A5B4FC]" style={{ fontFamily: pixelFont() }}>THE CAMP</Text>
        <Text testID="camp-banner-line" className="text-sm font-semibold text-white">{line}</Text>
      </View>
      <View className="flex-row">
        {camp.faces.slice(0, 2).map((coachId, index) => (
          // The second face tucks under the first.
          <View key={index} testID={`camp-face-${index}`} style={index > 0 ? { marginLeft: -6 } : undefined}
            className="h-9 w-9 items-center justify-center rounded-full bg-[#1B2048]">
            <Character characterId={isCharacterId(coachId) ? coachId : DEFAULT_CHARACTER_ID} mood="idle" size={26} paused />
          </View>
        ))}
      </View>
    </>
  );
  if (!onOpen) {
    return <View testID="camp-banner" accessibilityRole="summary" accessibilityLabel={`The camp, ${line}`} className={STRIP}>{body}</View>;
  }
  return (
    <PressableScale testID="camp-banner" accessibilityRole="button" accessibilityLabel={`Open the camp, ${line}`} onPress={onOpen} className={STRIP}>
      {body}
    </PressableScale>
  );
}
```

- [ ] **Step 4: The goodnight button**

`mobile/src/components/social/GoodnightButton.tsx`:

```tsx
// "Say goodnight" (spec 2026-10-07 social §6.1), on the Campfire page and under the evening timeline. Once said:
// "Goodnight said" (", on time" when it was), with Undo for its 10 minutes — the button disappears by itself when
// they are up. `onChanged` re-reads whatever shows the goodnight. A refusal shows the server's reason in words.

import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { buddyErrorCode } from '../../api/buddies';
import { sayGoodnight, undoGoodnight, type Goodnight } from '../../api/social';
import { buddyErrorMessage } from '../../lib/buddyCopy';
import { goodnightSaidLine } from '../../lib/socialCopy';
import { Button } from '../ui/button';
import { Text } from '../ui/text';

export function GoodnightButton({ goodnight, onChanged, testID = 'goodnight' }: { goodnight: Goodnight | null; onChanged: () => void; testID?: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // `busy` disables the button only after a re-render; a double tap in one frame sends once.
  const sending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const undoUntil = goodnight ? Date.parse(goodnight.undoUntil) : 0;
  // Re-render when the undo window closes, so Undo goes away by itself.
  useEffect(() => {
    const left = undoUntil - Date.now();
    if (left <= 0) return undefined;
    const timer = setTimeout(() => setNow(Date.now()), left + 1);
    return () => clearTimeout(timer);
  }, [undoUntil]);

  async function run(action: () => Promise<unknown>) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await action();
      onChanged();
    } catch (e) {
      if (mounted.current) setMessage(buddyErrorMessage(buddyErrorCode(e)));
    } finally {
      sending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <View className="gap-2">
      {goodnight ? (
        <View className="flex-row items-center justify-between gap-2">
          <Text testID={`${testID}-said`} className="text-sm font-semibold">{goodnightSaidLine(goodnight)}</Text>
          {undoUntil > now ? (
            <Button testID={`${testID}-undo`} variant="secondary" size="sm" disabled={busy} onPress={() => void run(undoGoodnight)}>Undo</Button>
          ) : null}
        </View>
      ) : (
        <Button testID={`${testID}-say`} disabled={busy} onPress={() => void run(sayGoodnight)}>Say goodnight</Button>
      )}
      {message ? <Text testID={`${testID}-message`} className="text-sm text-destructive">{message}</Text> : null}
    </View>
  );
}
```

(In the fake-timer test, `advanceTimersByTime(5_001)` reaches the `left + 1` timer: `left` is 5 000 at mount.)

- [ ] **Step 5: The route type and the Social screen**

In `mobile/src/navigation/RootNavigator.tsx`, in `RootStackParamList` after `SocialStory: { authorId: string };`, add:

```ts
  // Social → the camp banner: the Campfire page (S2), pushed with no tab bar.
  Campfire: undefined;
```

In `mobile/src/screens/SocialScreen.tsx`:

Change the header comment to:

```tsx
// Social tab home — V5 one scroll (spec 2026-10-07 social §4): camp banner → stories with my check-in → week
// highlights → today timeline, and a floating Chats button (opens Buddies until S3). Unseen stickers are marked
// seen once the screen has shown them, so the tab dot clears where they are read. S2: the banner opens the Campfire
// (only on a server that has one: it sends camp.night), and while my goodnight window is open (camp.goodnightOpen:
// from min(20:00, my goal − 60 min) to 05:59) "Say goodnight" follows the timeline.
```

Add `import { GoodnightButton } from '../components/social/GoodnightButton';` after the `CampBanner` import.

Replace `<CampBanner checkedIn={home.camp.checkedIn} faces={home.camp.faces} />` with:

```tsx
        <CampBanner camp={home.camp} onOpen={home.camp.night === undefined ? undefined : () => navigation.navigate('Campfire')} />
```

Replace the Today block

```tsx
        <View className="gap-3">
          <SectionLabel>Today</SectionLabel>
          <TimelineList items={home.timeline} />
        </View>
```

with

```tsx
        <View className="gap-3">
          <SectionLabel>Today</SectionLabel>
          <TimelineList items={home.timeline} />
          {/* The evening timeline offers goodnight while my window is open (spec §6.1, owner ruling Q1); an S1 server
              sends neither field. */}
          {home.camp.goodnightOpen === true && home.me.goodnight !== undefined ? (
            <GoodnightButton testID="timeline-goodnight" goodnight={home.me.goodnight} onChanged={() => void refreshSocial()} />
          ) : null}
        </View>
```

- [ ] **Step 6: Run the tests and the typecheck**

Run (from `mobile/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/components/CampBanner.test.tsx __tests__/components/GoodnightButton.test.tsx __tests__/screens/SocialScreenCampfire.test.tsx __tests__/screens/SocialScreen.test.tsx`
Expected: PASS (the S1 SocialScreen test's home has no `camp.night`, so its banner stays static and still reads "2 checked in").
Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/tsc --noEmit --types jest,node --pretty false | grep -c "error TS"` — Expected: `12`.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/components/social/CampBanner.tsx mobile/src/components/social/GoodnightButton.tsx mobile/src/screens/SocialScreen.tsx mobile/src/navigation/RootNavigator.tsx mobile/__tests__/components/CampBanner.test.tsx mobile/__tests__/components/GoodnightButton.test.tsx mobile/__tests__/screens/SocialScreenCampfire.test.tsx
git commit -m "feat(social-app): the camp banner opens the Campfire and the timeline offers goodnight while my window is open"
```

---

### Task 13: The Campfire page

**Files:**
- Create: `mobile/src/screens/CampfireScreen.tsx`
- Modify: `mobile/src/navigation/RootNavigator.tsx` (register the screen)
- Test: `mobile/__tests__/screens/CampfireScreen.test.tsx`

**Interfaces:**
- Consumes: `fetchCamp`, `saveCampNote`, `clearCampNote`, `Camp` (incl. `goodnightOpen`, `goodnightOpensAt`),
  `CampMember` (Task 11); `CAMP_NOTE_MAX`, `noteLength`, `campKicker`, `campStatus`, `fireLine`, `goodnightOpensLine`,
  `personName` (Task 11); `GoodnightButton` (Task 12); `refreshSocial`; routes `BuddyWeek`, `Buddies`.
- Produces: `CampfireScreen` registered as the `Campfire` route (`headerShown: false`). Exported layout constants
  and helpers (pure, tested): `SCENE_HEIGHT = 340`, `SCENE_HEADER_HEIGHT = 60`, `COACH_W = 76`, `COACH_H = 104`,
  `FIRE_W = 50`, `FIRE_H = 48`, `interface Box { left: number; top: number; width: number; height: number }`,
  `seatBoxes(width: number): Box[]` (8 seats), `fireBox(width: number): Box`. testIDs: `campfire`,
  `camp-loading|camp-unavailable|camp-error`, `camp-retry`, `camp-back`, `camp-scene-night|camp-scene-day`, `camp-moon`
  (night only), `camp-fire-lit|camp-fire-unlit`, `camp-coach-<id>`, `camp-bubble-<id>` (one truncated line),
  `camp-bubble-add`, `camp-zz-<id>`, `camp-more`, `camp-note-input`, `camp-note-count`, `camp-note-share`,
  `camp-note-clear`, `camp-message`, `camp-fire-line`, `camp-fire-segment-<0..4>`, `camp-nights-lit`,
  `camp-goodnight-*` (GoodnightButton, while `camp.goodnightOpen`), `camp-goodnight-later` (otherwise:
  "You can say goodnight from {h:mm a}" with my own opening time), `camp-message-camp`, `camp-who-<id>`,
  `camp-who-status-<id>` (the full status and note, no line limit).

- [ ] **Step 1: Write the failing test**

`mobile/__tests__/screens/CampfireScreen.test.tsx`:

```tsx
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError } from '../../src/api/client';
import { clearCampNote, fetchCamp, saveCampNote, sayGoodnight, undoGoodnight, type Camp, type CampMember } from '../../src/api/social';
import { refreshSocial } from '../../src/lib/socialStore';
import { CampfireScreen, fireBox, SCENE_HEADER_HEIGHT, SCENE_HEIGHT, seatBoxes, type Box } from '../../src/screens/CampfireScreen';

jest.mock('../../src/api/social', () => ({
  ...jest.requireActual('../../src/api/social'),
  fetchCamp: jest.fn(),
  saveCampNote: jest.fn(),
  clearCampNote: jest.fn(),
  sayGoodnight: jest.fn(),
  undoGoodnight: jest.fn(),
}));
jest.mock('../../src/lib/socialStore', () => ({ refreshSocial: jest.fn() }));
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useFocusEffect: (cb: () => void) => { const React = require('react'); React.useEffect(cb, []); },
}));
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const renderScreen = () => render(<SafeAreaProvider initialMetrics={metrics}><CampfireScreen /></SafeAreaProvider>);
const person = (id: string) => ({ id, handle: id, displayName: id.toUpperCase(), coachId: 'mochi' });
const member = (id: string, over: Partial<CampMember> = {}): CampMember => ({ person: person(id), mine: false, asleep: false, asleepSince: null, onTime: null, note: null, ...over });
const camp = (over: Partial<Camp> = {}): Camp => ({
  night: true,
  members: [
    member('me', { mine: true }),
    member('sam', { asleep: true, asleepSince: '2026-10-08T05:15:00.000Z', onTime: true, note: 'on time tonight' }),
    member('ben', { note: 'bed soon' }),
  ],
  fire: { lit: 3, of: 5, segments: 3 },
  nightsLitThisWeek: 2,
  goodnight: null,
  goodnightOpen: true,
  goodnightOpensAt: '20:00',
  ...over,
});

beforeEach(() => jest.clearAllMocks());

it('draws the night camp: moon, bubbles over coaches, my dashed add-note bubble, asleep coaches with z z, the lit fire and the card', async () => {
  (fetchCamp as jest.Mock).mockResolvedValue(camp());
  renderScreen();
  expect(await screen.findByTestId('camp-scene-night')).toBeTruthy();
  expect(screen.getByTestId('camp-moon')).toBeTruthy();
  expect(screen.getByTestId('camp-fire-lit')).toBeTruthy();
  expect(screen.getByTestId('camp-bubble-sam')).toHaveTextContent('on time tonight');
  expect(screen.getByTestId('camp-bubble-add')).toHaveTextContent('+ Add a note');
  expect(screen.getByTestId('camp-zz-sam')).toHaveTextContent('z z');
  expect(screen.getByTestId('camp-zz-ben')).not.toHaveTextContent('z z');
  expect(screen.getByTestId('camp-fire-line')).toHaveTextContent('3 of 5 in bed on time');
  expect(screen.getByTestId('camp-fire-segment-2')).toHaveStyle({ backgroundColor: '#F97316' });
  expect(screen.getByTestId('camp-fire-segment-3')).toHaveStyle({ backgroundColor: '#2E323B' });
  expect(screen.getByTestId('camp-nights-lit')).toHaveTextContent('Nights lit this week: 2');
  // 12-hour times on the Campfire.
  expect(screen.getByTestId('camp-who-sam')).toHaveTextContent(/SAM asleep since \d{1,2}:\d{2} (AM|PM) · on time/);
  expect(screen.getByTestId('camp-who-ben')).toHaveTextContent('BEN awake · bed soon');
  expect(screen.getByTestId('camp-who-me')).toHaveTextContent('You awake');
  expect(screen.getByTestId('camp-goodnight-say')).toBeTruthy();
  expect(screen.queryByTestId('camp-more')).toBeNull();
});

it("a long note is one truncated line in the bubble and the whole note in Who's here", async () => {
  const long = 'heading to bed early, big race at dawn!!'; // 40 code points
  (fetchCamp as jest.Mock).mockResolvedValue(camp({ members: [member('me', { mine: true }), member('ben', { note: long })] }));
  renderScreen();
  expect(await screen.findByTestId('camp-bubble-ben')).toHaveProp('numberOfLines', 1);
  expect(screen.getByTestId('camp-who-status-ben')).toHaveTextContent(`awake · ${long}`);
  expect(screen.getByTestId('camp-who-status-ben').props.numberOfLines).toBeUndefined();
});

it('by day: sky, no moon, unlit logs, and goodnight waits for my own opening time', async () => {
  (fetchCamp as jest.Mock).mockResolvedValue(camp({ night: false, goodnightOpen: false, goodnightOpensAt: '20:00' }));
  renderScreen();
  expect(await screen.findByTestId('camp-scene-day')).toBeTruthy();
  expect(screen.queryByTestId('camp-moon')).toBeNull();
  expect(screen.getByTestId('camp-fire-unlit')).toBeTruthy();
  expect(screen.getByTestId('camp-goodnight-later')).toHaveTextContent('You can say goodnight from 8:00 PM');
  expect(screen.queryByTestId('camp-goodnight-say')).toBeNull();
});

it('an early goal opens goodnight before the night scene: 17:30 is still day, yet I can say it', async () => {
  (fetchCamp as jest.Mock).mockResolvedValue(camp({ night: false, goodnightOpen: true, goodnightOpensAt: '17:00' }));
  renderScreen();
  expect(await screen.findByTestId('camp-scene-day')).toBeTruthy();
  expect(screen.getByTestId('camp-goodnight-say')).toBeTruthy();
  expect(screen.queryByTestId('camp-goodnight-later')).toBeNull();
});

it('at 19:30 with no goal the scene is night but goodnight waits for 8:00 PM', async () => {
  (fetchCamp as jest.Mock).mockResolvedValue(camp({ night: true, goodnightOpen: false, goodnightOpensAt: '20:00' }));
  renderScreen();
  expect(await screen.findByTestId('camp-scene-night')).toBeTruthy();
  expect(screen.getByTestId('camp-goodnight-later')).toHaveTextContent('You can say goodnight from 8:00 PM');
  expect(screen.queryByTestId('camp-goodnight-say')).toBeNull();
});

it('seats eight coaches around the fire with no overlap inside the 340-px scene, on every phone width', () => {
  const overlaps = (a: Box, b: Box) =>
    a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
  expect(SCENE_HEIGHT).toBe(340);
  for (const width of [375, 390, 393, 430]) {
    const seats = seatBoxes(width);
    const fire = fireBox(width);
    expect(seats).toHaveLength(8);
    seats.forEach((a, i) => {
      expect(a.left).toBeGreaterThanOrEqual(0);
      expect(a.left + a.width).toBeLessThanOrEqual(width);
      expect(a.top).toBeGreaterThanOrEqual(SCENE_HEADER_HEIGHT); // below the back button and title
      expect(a.top + a.height).toBeLessThanOrEqual(SCENE_HEIGHT);
      expect(overlaps(a, fire)).toBe(false);
      for (const b of seats.slice(i + 1)) expect(overlaps(a, b)).toBe(false);
    });
  }
});

it('shares a note with a live count, refuses one over 40, and clears mine', async () => {
  (fetchCamp as jest.Mock).mockResolvedValueOnce(camp()).mockResolvedValue(camp({ members: [member('me', { mine: true, note: 'night all' })] }));
  (saveCampNote as jest.Mock).mockResolvedValue({ note: { text: 'night all', createdAt: '', expiresAt: '' } });
  (clearCampNote as jest.Mock).mockResolvedValue(undefined);
  renderScreen();
  await screen.findByTestId('camp-note-input');
  expect(screen.getByTestId('camp-note-share')).toBeDisabled();
  fireEvent.changeText(screen.getByTestId('camp-note-input'), 'x'.repeat(41));
  expect(screen.getByTestId('camp-note-count')).toHaveTextContent('41/40');
  expect(screen.getByTestId('camp-note-share')).toBeDisabled();
  fireEvent.changeText(screen.getByTestId('camp-note-input'), ' night all ');
  expect(screen.getByTestId('camp-note-count')).toHaveTextContent('9/40');
  await act(async () => fireEvent.press(screen.getByTestId('camp-note-share')));
  expect(saveCampNote).toHaveBeenCalledWith(' night all ');
  expect(screen.getByTestId('camp-note-input')).toHaveProp('value', '');
  expect(refreshSocial).toHaveBeenCalled();
  expect(await screen.findByTestId('camp-bubble-me')).toHaveTextContent('night all');
  await act(async () => fireEvent.press(screen.getByTestId('camp-note-clear')));
  expect(clearCampNote).toHaveBeenCalledTimes(1);
});

it("shows the server's reason when a note is refused, keeping the draft", async () => {
  (fetchCamp as jest.Mock).mockResolvedValue(camp());
  (saveCampNote as jest.Mock).mockRejectedValue(new ApiError(429, 'x', 'rate_limited'));
  renderScreen();
  fireEvent.changeText(await screen.findByTestId('camp-note-input'), 'hello');
  await act(async () => fireEvent.press(screen.getByTestId('camp-note-share')));
  expect(screen.getByTestId('camp-message')).toHaveTextContent('Too many tries. Please try again later.');
  expect(screen.getByTestId('camp-note-input')).toHaveProp('value', 'hello');
});

it('says goodnight, then offers Undo while it is fresh', async () => {
  const goodnight = { localDate: '2026-10-07', at: '2026-10-08T05:30:00.000Z', onTime: true, undoUntil: new Date(Date.now() + 600_000).toISOString() };
  (fetchCamp as jest.Mock).mockResolvedValueOnce(camp()).mockResolvedValue(camp({ goodnight }));
  (sayGoodnight as jest.Mock).mockResolvedValue({ goodnight });
  (undoGoodnight as jest.Mock).mockResolvedValue(undefined);
  renderScreen();
  await act(async () => fireEvent.press(await screen.findByTestId('camp-goodnight-say')));
  expect(sayGoodnight).toHaveBeenCalledTimes(1);
  expect(await screen.findByTestId('camp-goodnight-said')).toHaveTextContent('Goodnight said, on time');
  await act(async () => fireEvent.press(screen.getByTestId('camp-goodnight-undo')));
  expect(undoGoodnight).toHaveBeenCalledTimes(1);
  expect(refreshSocial).toHaveBeenCalled();
});

it("a buddy's coach opens their week and mine does not navigate; +N past eight; Message camp opens Buddies; back goes back", async () => {
  const many = [member('me', { mine: true }), ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((id) => member(id))];
  (fetchCamp as jest.Mock).mockResolvedValue(camp({ members: many }));
  renderScreen();
  fireEvent.press(await screen.findByTestId('camp-coach-a'));
  expect(mockNavigate).toHaveBeenLastCalledWith('BuddyWeek', { buddyId: 'a' });
  mockNavigate.mockClear();
  fireEvent.press(screen.getByTestId('camp-coach-me'));
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(screen.getByTestId('camp-more')).toHaveTextContent('+2');
  expect(screen.queryByTestId('camp-coach-h')).toBeNull();
  expect(screen.getByTestId('camp-who-i')).toBeTruthy();
  fireEvent.press(screen.getByTestId('camp-message-camp'));
  expect(mockNavigate).toHaveBeenLastCalledWith('Buddies');
  fireEvent.press(screen.getByTestId('camp-back'));
  expect(mockGoBack).toHaveBeenCalled();
});

it('an older server says the camp is not open yet; a failure offers a retry', async () => {
  (fetchCamp as jest.Mock).mockResolvedValueOnce(null);
  const { unmount } = renderScreen();
  expect(await screen.findByTestId('camp-unavailable')).toHaveTextContent(/isn't open yet/);
  unmount();
  (fetchCamp as jest.Mock).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(camp());
  renderScreen();
  expect(await screen.findByTestId('camp-error')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByTestId('camp-retry')));
  expect(await screen.findByTestId('campfire')).toBeTruthy();
});
```

- [ ] **Step 2: Run it to see it fail**

Run (from `mobile/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/screens/CampfireScreen.test.tsx`
Expected: FAIL — "Cannot find module '../../src/screens/CampfireScreen'".

- [ ] **Step 3: Write the screen**

`mobile/src/screens/CampfireScreen.tsx`:

```tsx
// The Campfire page (spec 2026-10-07 social §6, design V5Campfire), pushed from the camp banner. The scene: me and up
// to 7 buddies around the fire (the server's order: me, then latest activity) and "+N" for the rest; night (stars, a
// moon, a lit fire once anyone is in bed on time) or day (sky, unlit logs) by my clock; asleep coaches rest with
// "z z"; a camp note shows in a one-line bubble over its coach (mine: a dashed "+ Add a note" when I have none).
// Below: my note composer (live count, Share, Clear note), the fire strength card, Say goodnight (while my own window
// is open: from min(20:00, my goal − 60 min) to 05:59; otherwise "You can say goodnight from 8:00 PM") / Message
// camp, and "Who's here" with each whole note. Every time here is 12-hour. A buddy's coach opens their week and
// "Message camp" opens Buddies until chats arrive in S3. An older server (bare 404) says the camp isn't open yet.
// Camp notes are buddies' free text: shown here only, never logged.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { buddyErrorCode } from '../api/buddies';
import { clearCampNote, fetchCamp, saveCampNote, type Camp, type CampMember } from '../api/social';
import { Character } from '../components/characters/Character';
import { DEFAULT_CHARACTER_ID, isCharacterId } from '../components/characters/types';
import { pixelFont } from '../components/coach/thinking/shared';
import { GoodnightButton } from '../components/social/GoodnightButton';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { PressableScale } from '../components/ui/pressable-scale';
import { SectionLabel } from '../components/ui/section-label';
import { Skeleton } from '../components/ui/skeleton';
import { Text } from '../components/ui/text';
import { buddyErrorMessage } from '../lib/buddyCopy';
import {
  CAMP_NOTE_MAX, campKicker, campStatus, fireLine, goodnightOpensLine, noteLength, personName,
} from '../lib/socialCopy';
import { refreshSocial } from '../lib/socialStore';
import type { RootStackParamList } from '../navigation/RootNavigator';

type State = { status: 'loading' } | { status: 'ready'; camp: Camp } | { status: 'unavailable' } | { status: 'error' };

export const SCENE_HEIGHT = 340;
/** The back button and the kicker + title (10 px + a 32-px display line) sit in this band at the scene's top. */
export const SCENE_HEADER_HEIGHT = 60;
/** One coach's slot: bubble (≤ 24) + "z z" (12) + coach (44) + name (16) + three 2-px gaps = 102, rounded up. */
export const COACH_W = 76;
export const COACH_H = 104;
/** The fire: four 10-px flame rows over 8-px logs, as wide as the logs. */
export const FIRE_W = 50;
export const FIRE_H = 48;
const NIGHT_SKY = '#0F1230';
const NIGHT_GROUND = '#161B3D';
const DAY_SKY = '#8EC5EE';
const DAY_GROUND = '#5B7F3A';
const MOON = '#FDE68A';
const SEGMENT_ON = '#F97316';
const SEGMENT_OFF = '#2E323B';

export interface Box { left: number; top: number; width: number; height: number }

/**
 * Seats around the fire: [0] is mine, then up to 7 buddies. `dx` = the slot's centre from the scene's centre (px),
 * `top` = px from the scene's top. Three bands, centred so the layout is the same on every phone:
 *   back  (top 64–168):  dx ±50        → x spans c−88…c−12 and c+12…c+88
 *   sides (top 128–232): dx ±130       → x spans c−168…c−92 and c+92…c+168 (clear of the back pair by 4 px)
 *   front (top 236–340): dx ±50, ±130  → the same four columns, 4 px below the side seats
 * The fire sits at c−25…c+25, top 182–230: below the back pair (168), above the front row (236), and 67 px inside
 * the side seats. Width needed: 2 × 168 = 336 ≤ 375, the narrowest supported phone. The test checks every pair.
 */
const SEATS = [
  { dx: -50, top: 236 }, { dx: 50, top: 236 }, { dx: -130, top: 128 }, { dx: 130, top: 128 },
  { dx: -50, top: 64 }, { dx: 50, top: 64 }, { dx: -130, top: 236 }, { dx: 130, top: 236 },
] as const;
const FIRE_TOP = 182;

export function seatBoxes(width: number): Box[] {
  return SEATS.map((s) => ({ left: width / 2 + s.dx - COACH_W / 2, top: s.top, width: COACH_W, height: COACH_H }));
}

export function fireBox(width: number): Box {
  return { left: width / 2 - FIRE_W / 2, top: FIRE_TOP, width: FIRE_W, height: FIRE_H };
}

const STARS = [[0.08, 30], [0.28, 18], [0.5, 40], [0.69, 14], [0.9, 70], [0.16, 80], [0.6, 76], [0.36, 100], [0.06, 130], [0.84, 124]] as const;

/** A pixel crescent: a pale disc with a sky-coloured disc over its upper right (per the canvas). */
function Moon() {
  return (
    <View testID="camp-moon" style={{ position: 'absolute', top: 14, right: 20, width: 22, height: 22 }}>
      <View style={{ position: 'absolute', width: 22, height: 22, borderRadius: 11, backgroundColor: MOON }} />
      <View style={{ position: 'absolute', left: 7, top: -3, width: 20, height: 20, borderRadius: 10, backgroundColor: NIGHT_SKY }} />
    </View>
  );
}

function Fire({ lit }: { lit: boolean }) {
  return (
    <View testID={lit ? 'camp-fire-lit' : 'camp-fire-unlit'} style={{ width: FIRE_W, height: FIRE_H, alignItems: 'center', justifyContent: 'flex-end' }}>
      {lit ? (
        <>
          <View style={{ width: 10, height: 10, backgroundColor: '#FEF3C7' }} />
          <View style={{ width: 20, height: 10, backgroundColor: '#FDE68A' }} />
          <View style={{ width: 30, height: 10, backgroundColor: '#FB923C' }} />
          <View style={{ width: 40, height: 10, backgroundColor: '#F97316' }} />
        </>
      ) : null}
      <View style={{ width: 50, height: 8, backgroundColor: '#78350F' }} />
    </View>
  );
}

function Coach({ member, onPress }: { member: CampMember; onPress: () => void }) {
  const id = member.person.id;
  const name = personName(member.person, member.mine);
  return (
    <PressableScale testID={`camp-coach-${id}`} accessibilityRole="button" accessibilityLabel={member.mine ? 'Your camp note' : `${name}'s week`}
      onPress={onPress} style={{ width: COACH_W, height: COACH_H, alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
      {member.note ? (
        // One truncated line, no wider than the seat, so bubbles never cross; "Who's here" shows the whole note.
        <Text testID={`camp-bubble-${id}`} numberOfLines={1} style={{ maxWidth: COACH_W }}
          className="rounded-[10px] bg-white px-2 py-1 text-[11px] font-semibold text-black">
          {member.note}
        </Text>
      ) : member.mine ? (
        <Text testID="camp-bubble-add" numberOfLines={1} style={{ maxWidth: COACH_W }}
          className="rounded-[10px] border border-dashed border-[#6366F1] px-2 py-1 text-[11px] font-semibold text-[#C7D2FE]">
          + Add a note
        </Text>
      ) : null}
      <Text testID={`camp-zz-${id}`} className="min-h-[12px] text-[10px] text-[#C7D2FE]" style={{ fontFamily: pixelFont() }}>{member.asleep ? 'z z' : ''}</Text>
      <Character characterId={isCharacterId(member.person.coachId) ? member.person.coachId : DEFAULT_CHARACTER_ID} mood={member.asleep ? 'resting' : 'idle'} size={44} paused />
      <Text numberOfLines={1} className="text-xs font-semibold text-white">{name}</Text>
    </PressableScale>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <PressableScale testID="camp-back" accessibilityRole="button" accessibilityLabel="Back to Social" onPress={onPress}
      className="h-10 w-10 items-center justify-center rounded-full bg-black/40">
      <Ionicons name="chevron-back" size={18} color="#F5F5F4" />
    </PressableScale>
  );
}

export function CampfireScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width } = useWindowDimensions();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const input = useRef<TextInput>(null);
  // `busy` disables the buttons only after a re-render; a double tap in one frame sends once.
  const sending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const camp = await fetchCamp();
      if (mounted.current) setState(camp ? { status: 'ready', camp } : { status: 'unavailable' });
    } catch {
      // A failed re-read keeps the camp already on screen.
      if (mounted.current) setState((s) => (s.status === 'ready' ? s : { status: 'error' }));
    }
  }, []);
  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  // Any change re-reads this page and the Social home (the banner's counts, the timeline).
  const changed = useCallback(() => {
    void load();
    void refreshSocial();
  }, [load]);

  async function run(action: () => Promise<unknown>, after?: () => void) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await action();
      if (mounted.current) after?.();
      changed();
    } catch (e) {
      if (mounted.current) setMessage(buddyErrorMessage(buddyErrorCode(e)));
    } finally {
      sending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  if (state.status !== 'ready') {
    return (
      <SafeAreaView testID={`camp-${state.status}`} className="flex-1 bg-background px-5 pt-4">
        <BackButton onPress={() => navigation.goBack()} />
        {state.status === 'loading' ? <Skeleton className="mt-4 h-64 w-full rounded-card" /> : null}
        {state.status === 'unavailable' ? (
          <Card className="mt-4 gap-2">
            <Text className="font-semibold">The camp isn't open yet</Text>
            <Text className="text-sm text-muted-foreground">Your buddies are still on Social.</Text>
          </Card>
        ) : null}
        {state.status === 'error' ? (
          <Card className="mt-4 gap-3">
            <Text className="text-sm">Couldn't load the camp.</Text>
            <Button testID="camp-retry" variant="secondary" onPress={() => void load()}>Try again</Button>
          </Card>
        ) : null}
      </SafeAreaView>
    );
  }

  const { camp } = state;
  const mine = camp.members.find((m) => m.mine) ?? null;
  const seats = seatBoxes(width);
  const fire = fireBox(width);
  const seated = camp.members.slice(0, seats.length);
  const more = camp.members.length - seated.length;
  const length = noteLength(draft);
  const canShare = !busy && length > 0 && length <= CAMP_NOTE_MAX;

  return (
    <SafeAreaView edges={['top']} testID="campfire" className="flex-1 bg-background">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32 }}>
        <View testID={camp.night ? 'camp-scene-night' : 'camp-scene-day'}
          style={{ height: SCENE_HEIGHT, overflow: 'hidden', backgroundColor: camp.night ? NIGHT_SKY : DAY_SKY }}>
          {camp.night
            ? STARS.map(([x, y], i) => <View key={i} style={{ position: 'absolute', left: x * width, top: y, width: 3, height: 3, backgroundColor: '#C7D2FE' }} />)
            : null}
          {camp.night ? <Moon /> : null}
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 110, backgroundColor: camp.night ? NIGHT_GROUND : DAY_GROUND }} />
          <View className="flex-row items-center gap-3 px-4" style={{ height: SCENE_HEADER_HEIGHT }}>
            <BackButton onPress={() => navigation.goBack()} />
            <View>
              <Text className="text-[10px] text-[#A5B4FC]" style={{ fontFamily: pixelFont() }}>{campKicker(new Date())}</Text>
              <Text className="font-display text-display text-white">The camp</Text>
            </View>
          </View>
          <View style={{ position: 'absolute', left: fire.left, top: fire.top }}>
            <Fire lit={camp.night && camp.fire.segments > 0} />
          </View>
          {seated.map((m, i) => (
            <View key={m.person.id} style={{ position: 'absolute', left: seats[i]!.left, top: seats[i]!.top }}>
              <Coach member={m} onPress={() => (m.mine ? input.current?.focus() : navigation.navigate('BuddyWeek', { buddyId: m.person.id }))} />
            </View>
          ))}
          {more > 0 ? (
            // Under the moon, right of the back-right seat and above the side seat: clear of every coach.
            <Text testID="camp-more" style={{ position: 'absolute', right: 16, top: 42 }} className="rounded-full bg-black/40 px-3 py-1 text-xs font-semibold text-white">
              {`+${more}`}
            </Text>
          ) : null}
        </View>

        <View className="gap-4 px-5 pt-4">
          <Card className="gap-3">
            <View className="flex-row justify-between">
              <Text className="text-sm font-semibold">Your camp note</Text>
              <Text testID="camp-note-count" className={`text-sm ${length > CAMP_NOTE_MAX ? 'text-destructive' : 'text-muted-foreground'}`}>
                {`${length}/${CAMP_NOTE_MAX}`}
              </Text>
            </View>
            <View className="flex-row gap-2">
              <TextInput ref={input} testID="camp-note-input" accessibilityLabel="Your camp note" value={draft} onChangeText={setDraft}
                placeholder="Say something to the camp..." placeholderTextColor="#9B9DA6" autoCorrect={false}
                className="h-10 flex-1 rounded-tile border border-border bg-card px-3 text-base text-foreground" />
              <Button testID="camp-note-share" size="sm" disabled={!canShare} onPress={() => void run(() => saveCampNote(draft), () => setDraft(''))}>Share</Button>
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="text-xs text-muted-foreground">Shows above your coach until sunrise</Text>
              {mine?.note ? (
                <Button testID="camp-note-clear" variant="secondary" size="sm" disabled={busy} onPress={() => void run(clearCampNote)}>Clear note</Button>
              ) : null}
            </View>
            {message ? <Text testID="camp-message" className="text-sm text-destructive">{message}</Text> : null}
          </Card>

          <Card className="gap-2">
            <View className="flex-row justify-between">
              <Text className="text-sm font-semibold">Fire strength</Text>
              <Text testID="camp-fire-line" className="text-sm text-[#FDBA74]">{fireLine(camp.fire)}</Text>
            </View>
            <View className="flex-row gap-1" accessibilityLabel={`Fire strength ${camp.fire.segments} of 5`}>
              {[0, 1, 2, 3, 4].map((i) => (
                <View key={i} testID={`camp-fire-segment-${i}`} style={{ flex: 1, height: 8, borderRadius: 2, backgroundColor: i < camp.fire.segments ? SEGMENT_ON : SEGMENT_OFF }} />
              ))}
            </View>
            <Text className="text-xs text-muted-foreground">The fire grows as your circle gets to bed by their goal. Keep it lit.</Text>
            <Text testID="camp-nights-lit" className="text-xs text-muted-foreground">{`Nights lit this week: ${camp.nightsLitThisWeek}`}</Text>
          </Card>

          <View className="flex-row items-start gap-2">
            <View className="flex-1">
              {/* My own window (owner ruling Q1), not the scene's night: an 18:00 goal opens it at 17:00. */}
              {camp.goodnightOpen ? (
                <GoodnightButton testID="camp-goodnight" goodnight={camp.goodnight} onChanged={changed} />
              ) : (
                <Text testID="camp-goodnight-later" className="text-sm text-muted-foreground">{goodnightOpensLine(camp.goodnightOpensAt)}</Text>
              )}
            </View>
            <Button testID="camp-message-camp" variant="secondary" onPress={() => navigation.navigate('Buddies')}>Message camp</Button>
          </View>

          <SectionLabel>Who's here</SectionLabel>
          {camp.members.map((m) => (
            <View key={m.person.id} testID={`camp-who-${m.person.id}`} className="flex-row items-center gap-3">
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: m.asleep ? '#A78BFA' : '#86EFAC' }} />
              {/* No line limit: "Who's here" is where a whole note is read (the bubble is one truncated line). */}
              <Text className="flex-1 text-sm">
                <Text className="font-semibold">{personName(m.person, m.mine)}</Text>
                {' '}
                <Text testID={`camp-who-status-${m.person.id}`} className="text-muted-foreground">{campStatus(m)}</Text>
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Register the route**

In `mobile/src/navigation/RootNavigator.tsx`, add `import { CampfireScreen } from '../screens/CampfireScreen';` next to
the `HighlightsScreen` import, and after the `Highlights` `<Stack.Screen …/>` line add:

```tsx
              {/* The Campfire (S2): its own header over the scene, no tab bar. */}
              <Stack.Screen name="Campfire" component={CampfireScreen} options={{ headerShown: false }} />
```

- [ ] **Step 5: Run the test and the typecheck**

Run (from `mobile/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/screens/CampfireScreen.test.tsx __tests__/navigation`
Expected: PASS.
Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/tsc --noEmit --types jest,node --pretty false | grep -c "error TS"` — Expected: `12`.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/screens/CampfireScreen.tsx mobile/src/navigation/RootNavigator.tsx mobile/__tests__/screens/CampfireScreen.test.tsx
git commit -m "feat(social-app): the Campfire page: scene with moon and fixed seats, note bubbles and composer, fire strength, goodnight, who's here"
```

---

### Task 14: Goodnight frames in the story viewer, and the two S1 viewer fixes (S1 deferral d)

**Files:**
- Modify: `mobile/src/components/social/SocialStoryFrame.tsx`, `mobile/src/screens/SocialStoryScreen.tsx`,
  `mobile/src/screens/SocialScreen.tsx`, `mobile/src/navigation/RootNavigator.tsx` (param type),
  `mobile/__tests__/screens/SocialStoryScreen.test.tsx`, `mobile/__tests__/screens/SocialScreenCampfire.test.tsx`
- Test: create `mobile/__tests__/screens/SocialStoryCampfire.test.tsx`

**Interfaces:**
- Consumes: `StoryFrame` goodnight variant and `knownStoryFrames` (Task 11).
- Produces: `RootStackParamList.SocialStory: { authorId: string; mine?: boolean }`; the Social screen opens my own
  story with `{ authorId, mine: true }` (a buddy's stays `{ authorId }`); the viewer treats `mine: true` as mine even
  while the Social store is not ready; a story with no frames shows `social-story-empty` ("Nothing in this story
  yet."); `SocialStoryFrame` draws a goodnight frame (`story-goodnight`, the coach resting).

- [ ] **Step 1: Write the failing tests**

`mobile/__tests__/screens/SocialStoryCampfire.test.tsx`:

```tsx
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fetchStory } from '../../src/api/social';
import { SocialStoryScreen } from '../../src/screens/SocialStoryScreen';

jest.mock('../../src/api/social', () => ({ ...jest.requireActual('../../src/api/social'), fetchStory: jest.fn(), markStorySeen: jest.fn().mockResolvedValue(undefined) }));
// The Social home has not loaded yet: the viewer cannot tell from the store whose story this is.
jest.mock('../../src/lib/socialStore', () => ({ refreshSocial: jest.fn(), useSocial: () => ({ status: 'idle' }) }));
const mockGoBack = jest.fn();
let mockParams: { authorId: string; mine?: boolean } = { authorId: 'me', mine: true };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ goBack: mockGoBack }),
  useRoute: () => ({ params: mockParams }),
}));
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const renderScreen = () => render(<SafeAreaProvider initialMetrics={metrics}><SocialStoryScreen /></SafeAreaProvider>);
const sam = { id: 'sam', handle: 'sam', displayName: 'Sam', coachId: 'mochi' };
const at = '2026-10-08T05:00:00.000Z';

beforeEach(() => {
  jest.clearAllMocks();
  (fetchStory as jest.Mock).mockReset();
  mockParams = { authorId: 'me', mine: true };
});

it('plays my goodnight frame as mine, with no replies, even before the Social home has loaded', async () => {
  (fetchStory as jest.Mock).mockResolvedValueOnce({ author: { ...sam, id: 'me' }, localDate: '2026-10-07', frames: [{ kind: 'goodnight', at, onTime: true }] });
  renderScreen();
  expect(await screen.findByTestId('story-goodnight')).toHaveTextContent(/You said goodnight.*On time/);
  expect(screen.getByTestId('social-story-name')).toHaveTextContent('You');
  expect(screen.queryByTestId('story-reply-CHEER')).toBeNull();
});

it("a buddy's late goodnight reads Off to bed, with replies", async () => {
  mockParams = { authorId: 'sam' };
  (fetchStory as jest.Mock).mockResolvedValueOnce({ author: sam, localDate: '2026-10-07', frames: [{ kind: 'goodnight', at, onTime: false }] });
  renderScreen();
  expect(await screen.findByTestId('story-goodnight')).toHaveTextContent(/Sam said goodnight.*Off to bed/);
  expect(screen.getByTestId('story-reply-CHEER')).toBeTruthy();
});

it('an empty story says there is nothing in it yet — not that it is gone', async () => {
  mockParams = { authorId: 'sam' };
  (fetchStory as jest.Mock).mockResolvedValueOnce({ author: sam, localDate: '2026-10-07', frames: [] });
  renderScreen();
  expect(await screen.findByTestId('social-story-empty')).toHaveTextContent('Nothing in this story yet.');
  expect(screen.queryByText(/anymore/)).toBeNull();
});
```

`mobile/__tests__/screens/SocialStoryScreen.test.tsx` — the S1 empty-story test changes with the copy. Replace the
whole test `it('a story with no frames is not available, never an endless loader', …)` with:

```tsx
it('a story with no frames says there is nothing in it yet, never an endless loader', async () => {
  (fetchStory as jest.Mock).mockResolvedValueOnce({ author: sam, localDate: '2026-10-07', frames: [] });
  renderScreen();
  expect(await screen.findByTestId('social-story-empty')).toHaveTextContent(/Nothing in this story yet/);
  expect(screen.queryByTestId('social-story-loading')).toBeNull();
  expect(markStorySeen).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId('social-story-close'));
  expect(mockGoBack).toHaveBeenCalled();
});
```

`mobile/__tests__/screens/SocialScreenCampfire.test.tsx` — append:

```tsx
it('my own ring opens my story marked as mine', async () => {
  (fetchSocialHome as jest.Mock).mockResolvedValue(home({
    me: { person: person('me'), checkIn: { mood: 'RESTED', localDate: '2026-10-07', updatedAt: '2026-10-07T08:00:00.000Z' }, goodnight: null },
  }));
  renderScreen();
  fireEvent.press(await screen.findByTestId('story-me'));
  expect(mockNavigate).toHaveBeenLastCalledWith('SocialStory', { authorId: 'me', mine: true });
});
```

- [ ] **Step 2: Run them to see them fail**

Run (from `mobile/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/screens/SocialStoryCampfire.test.tsx __tests__/screens/SocialStoryScreen.test.tsx __tests__/screens/SocialScreenCampfire.test.tsx`
Expected: FAIL — no `story-goodnight`, no `social-story-empty`, my story opened without `mine`, replies shown on my own story.

- [ ] **Step 3: The goodnight frame**

In `mobile/src/components/social/SocialStoryFrame.tsx`:

Change the header comment to:

```tsx
// One frame of a social story (spec 2026-10-07 social §4.2): a check-in (locked until I check in), a badge, a
// shared recap's headline line exactly as its owner previewed and shared it — never the recap's stats JSON — or a
// goodnight (S2: "{name} said goodnight", on time or off to bed, the coach resting).
```

Replace `<Character characterId={coach} mood="idle" size={96} />` with
`<Character characterId={coach} mood={frame.kind === 'goodnight' ? 'resting' : 'idle'} size={96} />`, and after the
`frame.kind === 'recap'` block add:

```tsx
      {frame.kind === 'goodnight' ? (
        <View testID="story-goodnight" pointerEvents="none" className="items-center gap-2">
          <Text className="text-xs font-semibold uppercase tracking-widest text-white/70">{`${who} said goodnight`}</Text>
          <Text className="font-display text-display text-white">{frame.onTime ? 'On time' : 'Off to bed'}</Text>
        </View>
      ) : null}
```

- [ ] **Step 4: The viewer: `mine` from the route, and the empty story's words**

In `mobile/src/navigation/RootNavigator.tsx`, replace

```ts
  // Social → one buddy's story today (or my own once I've checked in), opened from the stories row.
  SocialStory: { authorId: string };
```

with

```ts
  // Social → one buddy's story today (or my own once I've checked in), opened from the stories row. `mine` is set for
  // my own story, so the viewer knows it before the Social home has loaded.
  SocialStory: { authorId: string; mine?: boolean };
```

In `mobile/src/screens/SocialStoryScreen.tsx`:

Add to the header comment: `// A story with no frames left says so ("Nothing in this story yet."); "isn't available anymore" is for one that is gone.`

Replace `type Loaded = …;` with:

```tsx
type Loaded = { phase: 'loading' } | { phase: 'ready'; story: Story } | { phase: 'empty' } | { phase: 'gone' } | { phase: 'error' };
```

Replace `const { authorId } = (useRoute().params ?? {}) as { authorId: string };` with:

```tsx
  const { authorId, mine: mineParam } = (useRoute().params ?? {}) as { authorId: string; mine?: boolean };
```

In `load`, replace
`if (live()) setLoaded(frames.length > 0 ? { phase: 'ready', story: { ...story, frames } } : { phase: 'gone' });` with:

```tsx
      if (live()) setLoaded(frames.length > 0 ? { phase: 'ready', story: { ...story, frames } } : { phase: 'empty' });
```

and change the comment above it to `// Nothing left to play (it emptied since the ring was drawn): say so, never an endless loader.`

Replace `if (loaded.phase === 'ready') return <Viewer story={loaded.story} onClose={leave} />;` with:

```tsx
  if (loaded.phase === 'ready') return <Viewer story={loaded.story} mineHint={mineParam === true} onClose={leave} />;
```

After the `loaded.phase === 'gone'` line in the fallback view, add:

```tsx
        {loaded.phase === 'empty' ? <Text className="text-center text-white">Nothing in this story yet.</Text> : null}
```

Change the `Viewer` signature and its `mine` line to:

```tsx
function Viewer({ story, mineHint, onClose }: { story: Story; mineHint: boolean; onClose: () => void }) {
  const social = useSocial();
  // The route says so for my own story; the store agrees once it has loaded.
  const mine = mineHint || (social.status === 'ready' && social.home.me.person.id === story.author.id);
```

- [ ] **Step 5: The Social screen opens my story as mine**

In `mobile/src/screens/SocialScreen.tsx`, replace
`onOpenStory={(authorId) => navigation.navigate('SocialStory', { authorId })}` with:

```tsx
onOpenStory={(authorId) => navigation.navigate('SocialStory', authorId === home.me.person.id ? { authorId, mine: true } : { authorId })}
```

- [ ] **Step 6: Run the tests and the typecheck**

Run (from `mobile/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/screens/SocialStoryCampfire.test.tsx __tests__/screens/SocialStoryScreen.test.tsx __tests__/screens/SocialScreenCampfire.test.tsx __tests__/screens/SocialScreen.test.tsx __tests__/components/StoriesRow.test.tsx`
Expected: PASS.
Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/tsc --noEmit --types jest,node --pretty false | grep -c "error TS"` — Expected: `12`.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/components/social/SocialStoryFrame.tsx mobile/src/screens/SocialStoryScreen.tsx mobile/src/screens/SocialScreen.tsx mobile/src/navigation/RootNavigator.tsx mobile/__tests__/screens/SocialStoryCampfire.test.tsx mobile/__tests__/screens/SocialStoryScreen.test.tsx mobile/__tests__/screens/SocialScreenCampfire.test.tsx
git commit -m "feat(social-app): goodnight story frames; my story is mine before Social loads; an empty story says so"
```

---

### Task 15: Refresh Social when a buddy push arrives in the foreground (S1 deferral c)

**Files:**
- Modify: `mobile/src/notifications/handler.ts`
- Test: create `mobile/__tests__/notifications/handlerForeground.test.ts`; rerun `mobile/__tests__/notifications/handler.test.ts`

**Interfaces:**
- Consumes: `getSocialState`, `refreshSocial` (`src/lib/socialStore.ts`).
- Produces: `installNotificationHandler`'s `handleNotification` calls `refreshSocial()` for a well-formed buddy push
  (`buddy_sticker`, `buddy_request`, `buddy_paired`, `buddy_badge`) while the Social store is not `idle`; what it shows
  is unchanged.

- [ ] **Step 1: Write the failing test**

`mobile/__tests__/notifications/handlerForeground.test.ts`:

```ts
import * as Notifications from 'expo-notifications';
import { WIND_DOWN_KIND, installNotificationHandler } from '../../src/notifications/handler';
import { getSocialState, refreshSocial } from '../../src/lib/socialStore';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
}));
jest.mock('../../src/navigation/navigationRef', () => ({ navigationRef: { isReady: jest.fn(), navigate: jest.fn() } }));
jest.mock('../../src/lib/socialStore', () => ({ refreshSocial: jest.fn(() => Promise.resolve()), getSocialState: jest.fn() }));

const N = Notifications as jest.Mocked<typeof Notifications>;
const notification = (data: Record<string, unknown>) => ({ request: { content: { data } } }) as never;
const UUID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const handle = () => {
  installNotificationHandler();
  return N.setNotificationHandler.mock.calls[0]![0]!.handleNotification;
};

beforeEach(() => {
  jest.clearAllMocks();
  (getSocialState as jest.Mock).mockReturnValue({ status: 'ready' });
});

it('a buddy push in the foreground refreshes Social, and is still shown', async () => {
  const handler = handle();
  for (const kind of ['buddy_sticker', 'buddy_request', 'buddy_paired', 'buddy_badge']) {
    expect(await handler(notification({ kind, refId: UUID }))).toMatchObject({ shouldShowBanner: true });
  }
  expect(refreshSocial).toHaveBeenCalledTimes(4);
});

it('other pushes, a malformed buddy push, and a store that has not loaded (signed out) refresh nothing', async () => {
  const handler = handle();
  await handler(notification({ kind: WIND_DOWN_KIND }));
  await handler(notification({ kind: 'recap', recapId: UUID }));
  await handler(notification({ kind: 'buddy_sticker', refId: 'not-a-uuid' }));
  (getSocialState as jest.Mock).mockReturnValue({ status: 'idle' });
  expect(await handler(notification({ kind: 'buddy_sticker', refId: UUID }))).toMatchObject({ shouldShowBanner: true });
  expect(refreshSocial).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run it to see it fail**

Run (from `mobile/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/notifications/handlerForeground.test.ts`
Expected: FAIL — `refreshSocial` is never called.

- [ ] **Step 3: Refresh on a foreground buddy push**

In `mobile/src/notifications/handler.ts`:

Add `import { getSocialState, refreshSocial } from '../lib/socialStore';` after the `windDown` import, and add to the
header comment: `// A buddy push that arrives while the app is open also re-reads Social (the tab dot and the home), once loaded.`

Replace the `handleNotification` line in `installNotificationHandler` with:

```ts
      handleNotification: async (notification) => {
        const buddy = buddyPushOf(notification);
        // A buddy push while the app is open means Social changed (a sticker, a request, a pairing, a badge): re-read
        // it so the tab dot and the home are current. Only once the store has loaded: idle = signed out or not started.
        if (buddy && getSocialState().status !== 'idle') void refreshSocial();
        return isWindDown(notification) || buddy ? SHOW : HIDE;
      },
```

- [ ] **Step 4: Run the tests**

Run (from `mobile/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/notifications`
Expected: PASS (the S1 handler test runs with the real store, which is idle there, so it refreshes nothing).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/notifications/handler.ts mobile/__tests__/notifications/handlerForeground.test.ts
git commit -m "feat(social-app): a buddy push in the foreground refreshes Social"
```

---

### Task 16: Dev seed — a camp note and a goodnight for the walkthrough

**Files:**
- Modify: `backend/scripts/seedSocial.ts`, `backend/tests/scripts/seedSocial.test.ts`

**Interfaces:**
- Consumes: `eveningDate`, `isOnTime`, `nextSunrise` (Task 2); `getCamp` (Task 6) in the test.
- Produces: `SEED_CAMP_NOTE = 'bed soon, night all'`; `seedSocial(…)` resolves
  `{ buddyCheckedIn: true; stepGoal: true; recapShared: boolean; campNote: true; goodnight: true }` and writes, for the
  buddy, a camp note stamped one second after `now` (so the seed's own check-in does not clear it) and a goodnight
  for the buddy's current evening (written directly: the route only opens at night). Idempotent.

- [ ] **Step 1: Write the failing test**

In `backend/tests/scripts/seedSocial.test.ts`:

Change the import line to `import { SEED_CAMP_NOTE, seedSocial } from '../../scripts/seedSocial';` and add
`import { getCamp } from '../../src/social/camp';`.

In the four existing `toEqual({ buddyCheckedIn: true, stepGoal: true, recapShared: … })` expectations, add
`campNote: true, goodnight: true` — they become:

```ts
  expect(await seedSocial({ email: a.email, buddyEmail: b.email, now: NOW, env: LOCAL })).toEqual({ buddyCheckedIn: true, stepGoal: true, recapShared: false, campNote: true, goodnight: true });
```

(first test),

```ts
  expect(await seedSocial({ email: a.email, buddyEmail: b.email, now: NOW, env: LOCAL })).toEqual({ buddyCheckedIn: true, stepGoal: true, recapShared: true, campNote: true, goodnight: true });
```

(second and third tests), and

```ts
  expect(await seedSocial({ email: a.email, buddyEmail: b.email, now: NOW, env: LOCAL })).toEqual({ buddyCheckedIn: true, stepGoal: true, recapShared: false, campNote: true, goodnight: true });
```

(fourth test). Append:

```ts
it("seeds the buddy's camp: a note over an asleep coach, idempotently", async () => {
  const a = await prisma.user.create({ data: { email: `seed-a-${randomUUID()}@example.com`, name: 'A' } });
  const b = await prisma.user.create({ data: { email: `seed-b-${randomUUID()}@example.com`, name: 'B' } });
  await pairUp(a.id, b.id);
  await seedSocial({ email: a.email, buddyEmail: b.email, now: NOW, env: LOCAL });
  await seedSocial({ email: a.email, buddyEmail: b.email, now: NOW, env: LOCAL });
  expect(await prisma.campNote.findMany({ where: { authorId: b.id }, select: { text: true } })).toEqual([{ text: SEED_CAMP_NOTE }]);
  expect(await prisma.goodnight.count({ where: { authorId: b.id } })).toBe(1);
  // The demo account sees it: NOW is 20:00 in the buddy's zone (UTC), so the camp is at night and the buddy asleep.
  const camp = await getCamp(a.id, NOW);
  expect(camp.night).toBe(true);
  expect(camp.members.find((m) => m.person.id === b.id)).toMatchObject({ asleep: true, note: SEED_CAMP_NOTE });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bash .superpowers/sdd/2026-10-07-social-s2-campfire/backend-jest.sh tests/scripts/seedSocial.test.ts`
Expected: FAIL — `SEED_CAMP_NOTE` is not exported; the results lack `campNote` / `goodnight`.

- [ ] **Step 3: Extend the seed**

In `backend/scripts/seedSocial.ts`:

Replace the header's first paragraph (lines 2–6, up to `Run seedBuddies first: the two accounts must already be buddies.`) with:

```ts
// Dev only: gives the demo account something to see on Social (spec 2026-10-07 social S1 + S2). The buddy
// checks in TIRED and passes their step goal today; if the buddy already checked in today, that mood is
// OVERWRITTEN with TIRED. Their newest built recap with a non-blank line (if any) is shared, with that
// line as the previewed one. For the Campfire (S2) the buddy gets a camp note and a goodnight for their current
// evening, so the camp shows an asleep coach with a bubble. The demo account itself is left unchecked-in so the
// walkthrough shows the lock lifting. Run seedBuddies first: the two accounts must already be buddies.
```

and in the paragraph after the usage line, replace `Idempotent: the\n// check-in is upserted, the step goal and the share are created once.` with
`Idempotent: the\n// check-in, the camp note and the goodnight are upserted, the step goal and the share are created once.`

Add the import `import { eveningDate, isOnTime, nextSunrise } from '../src/social/night';` after the `recordStepGoal`
import, and after the `assertDevDatabase` import add:

```ts
/** The buddy's camp note in the walkthrough (the canvas' line). */
export const SEED_CAMP_NOTE = 'bed soon, night all';
```

Change the `seedSocial` return type to
`Promise<{ buddyCheckedIn: boolean; stepGoal: boolean; recapShared: boolean; campNote: boolean; goodnight: boolean }>`,
and replace its last line `return { buddyCheckedIn: true, stepGoal: true, recapShared: recap !== null };` with:

```ts
  // The buddy's camp, written directly: the goodnight route only opens at night and the walkthrough runs whenever.
  // The note is stamped a second after `now`, so the check-in above (stamped at or before `now`) does not clear it.
  const buddy = await prisma.user.findUniqueOrThrow({ where: { id: buddyId }, select: { timezone: true, bedtimeGoal: true } });
  const noteAt = new Date(now.getTime() + 1000);
  const note = { text: SEED_CAMP_NOTE, createdAt: noteAt, expiresAt: nextSunrise(noteAt, buddy.timezone) };
  await prisma.campNote.upsert({ where: { authorId: buddyId }, create: { authorId: buddyId, ...note }, update: note });
  const evening = civilDateToUtcMidnight(eveningDate(now, buddy.timezone));
  await prisma.goodnight.upsert({
    where: { authorId_localDate: { authorId: buddyId, localDate: evening } },
    create: { authorId: buddyId, localDate: evening, at: now, onTime: isOnTime(now, buddy.timezone, buddy.bedtimeGoal) },
    update: {},
  });
  return { buddyCheckedIn: true, stepGoal: true, recapShared: recap !== null, campNote: true, goodnight: true };
```

(`main` logs the result object: booleans only, never the note text.)

- [ ] **Step 4: Run the test**

Run: `bash .superpowers/sdd/2026-10-07-social-s2-campfire/backend-jest.sh tests/scripts/seedSocial.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/seedSocial.ts backend/tests/scripts/seedSocial.test.ts
git commit -m "chore(seed): the Social seed adds the buddy's camp note and goodnight for the Campfire walkthrough"
```

---

### Task 17: Whole-phase verification

**Files:** none new; fix-ups only where a check fails (each its own commit).

- [ ] **Step 1: Whole backend suite**

Run: `bash .superpowers/sdd/2026-10-07-social-s2-campfire/backend-jest.sh` — Expected: PASS (rerun a single failing
suite alone before treating it as real; record flakes in the ledger).

- [ ] **Step 2: Backend typecheck**

Run (from `backend/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/tsc --noEmit` — Expected: no output.

- [ ] **Step 3: Whole mobile suite and typecheck**

Run (from `mobile/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit` — Expected: PASS.
Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/tsc --noEmit --types jest,node --pretty false | grep -c "error TS"`
— Expected: `12`, with the same file list as `.superpowers/sdd/2026-10-07-social-s1/tsc-baseline.txt` (none in files this phase touched).

- [ ] **Step 4: Privacy audit**

- `grep -rn "console\.\|log(" backend/src backend/scripts` — read every hit in or
  reaching `src/social`, `src/buddies`, `src/sync/worker.ts`, `src/users/deletion.ts` and `scripts/seedSocial.ts`:
  each is `JSON.stringify({ event, …ids|counts, error: err.name })` or an id-only message; none passes a note, a
  `text` field or a request body (the whole backend, not only `src/social`).
- `grep -n "social.sweep" backend/src/sync/worker.ts` — the two lines log `{ event, notes, highlights }` or `{ event, error }` only.
- `grep -n "text: true" backend/src/social/*.ts` — only `camp.ts` (the Campfire view) selects note text.
- `grep -rln "social/" backend/src/coach backend/src/recap` — no output (nothing social reaches the coach; the recap
  module does not import social).
- `grep -n "stats" backend/src/social/stories.ts` — no output (a recap frame never reads stats).

- [ ] **Step 5: Migration is additive**

Run: `grep -niE "drop|alter column|rename" backend/prisma/migrations/20261010120000_social_campfire/migration.sql` — Expected: no output.

- [ ] **Step 6: Clean tree**

Run: `git status --short` — Expected: no output.

**Not in this task:** the owner walkthrough (controller, after the final whole-branch review): back up the dev DB,
`prisma migrate deploy`, run the dev backend and Metro from the synced run folder, `seedBuddies` then `seedSocial`
for the demo pair, and walk: Social tab → camp banner ("N awake · N asleep" at night) → Campfire (the buddy asleep
with "z z" and the "bed soon, night all" bubble, my dashed "+ Add a note") → share a note (count, 40 limit) → clear it →
Say goodnight → Undo → Say goodnight again → back to Social (banner counts, the timeline's "said goodnight" row and
the Today goodnight button) → my story ring (goodnight frame, no replies) → Highlights (camp items appear only once a
week with goodnights is final). By day: the sky, unlit logs and "You can say goodnight from 8:00 PM" (or an hour
before the demo account's bedtime goal when that is earlier than 21:00). At night: the moon, and eight seats with no
overlap when the circle is that big.

---

## Self-review notes

- Spec coverage (S2, §12 "goodnight, scene, fire strength, camp notes, Who's here"): goodnight §6.1 → Tasks 2, 4, 12,
  13; scene + day/night + asleep/awake §6.1 → Tasks 6, 13; fire strength + nights lit §6.2 → Tasks 2, 6, 13; camp
  notes §6.3 (sanitiser, 1–40, one per user, bubble, composer with count/Share/Clear, expiry at 06:00 author-zone or
  check-in, sweep, 20 shares/h, no push) → Tasks 1, 5, 6, 10, 13; "Who's here" + Say goodnight / Message camp §6.4 →
  Tasks 6, 13; API §6.4 → Tasks 4, 5, 6; banner night copy §4 item 1 → Tasks 8, 12; `goodnight` story frames §4.2 →
  Tasks 7, 14; timeline goodnights + camp notes "(night only)", no text §5 → Tasks 7, 11; highlights `campfire`,
  `top_story` on-time goodnights, `also` joined + first badge §7 → Tasks 9, 11; privacy §9 (note text never logged,
  never to the coach, unpair/block hide, deletion cascades) → Global Constraints, Tasks 1, 5, 6, 7, 8, 10, 17; testing
  §13 (goodnight onTime with/without goal, grace, midnight; fire segments; camp-note sanitising, length, expiry,
  check-in clears; camp members and fire; share/clear/expiry/hidden after unpair/block; share rate limit fails closed,
  clear never limited; deletion cascades; mobile Campfire day/night, asleep/awake, bubbles, composer, goodnight undo)
  → Tasks 2, 4, 5, 6, 10, 12, 13.
- Owner decisions of plan review 1 (binding), where they landed:
  - Q1 goodnight window `min(20:00, goal − 60 min)`–05:59, scene still 19:00, copy "You can say goodnight from
    {h:mm a}", the timeline button on the window, `goodnight_closed` outside it → Global Constraints, Review Focus 4,
    Task 2 (`goodnightOpensAt`, `isGoodnightOpen`), Task 3 (`Circle.viewerBedtimeGoal`), Task 4 (route + tests:
    18:00 goal opens 17:00 and 18:05 is on time; no goal 19:30 closed, 20:00 open; 23:00 goal opens 20:00), Task 6
    (`goodnightOpen` / `goodnightOpensAt` on `GET /me/camp`), Task 8 (`camp.goodnightOpen` on `/me/social`), Tasks 11–13.
  - Q2 frozen fire nights → Task 2 (`campOnEvening`, `countLitNights` per night), Task 3 (`Circle.pairedAt`), Task 6
    (nights lit; pairing tonight never unlights Monday), Task 9 (campfire highlight; a buddy paired midweek counts from
    that evening).
  - Q3 notes unchanged; Q4 the whole note in "Who's here" → Task 13.
- S1 deferrals: (a) one preloaded circle, ~26 → ≤ 17 queries with a counting test (S1's parts are 15 of them; the
  goodnight read is shared and the camp-note read is the timeline's) → Tasks 3, 7; (b) highlight retention on the
  hourly recap-sweep tick, deleted ids purged on account deletion and filtered at read time → Task 10; (c) foreground
  buddy push → Task 15; (d) my story while the store isn't ready, and the empty-story copy → Task 14 (both cheap).
- S1 rulings S2 amends, each by the owner: an empty highlights week is cached once it has been final for 24 h (Task 3,
  which edits one S1 test's clock — the only S1 test edit besides the shape lines of `home.test.ts`, Task 8, and the
  sweep mock in `tests/recap/worker.test.ts`, Task 10).
- Not in S2 (spec §11/§12): group chat ("Message camp" opens Buddies), DMs (a coach opens the buddy's week), camp-note
  reports (S3 `POST /me/reports`; URLs and @handles are allowed in S2 notes), the camp badge, live sleep detection.
- Type consistency checked across tasks: `Circle` (with `pairedAt`, `viewerBedtimeGoal`) / `GoodnightRow` /
  `TodayCheckIn` (Task 3) are what Tasks 4–9 use; `countLitNights(onTime, campOn)` (Task 2) is called the same way in
  Tasks 6 and 9; `buildHighlightCandidates(circle, weekStart)` (Task 9) is called by `weeklyHighlightsFor` (Task 3, its
  call line changed in Task 9); `GoodnightDTO` (Task 4) = mobile `Goodnight` (Task 11); `CampDTO` / `CampMemberDTO`
  (Task 6, with `goodnightOpen` / `goodnightOpensAt`) = mobile `Camp` / `CampMember`; `CampNoteDTO` = `CampNote`; the
  backend timeline / frame / highlight unions (Tasks 7, 9) = the mobile unions (Task 11);
  `SocialHomeDTO.me.goodnight` and `camp.night|awake|asleep|goodnightOpen` (Task 8) are optional on mobile for S1
  servers; testIDs used by the Task 12–14 tests are the ones the components render.
- Review Focus lines each have a test: zones and midnight, incl. Auckland's goodnight seen from Los Angeles (Tasks 2,
  4, 6, 7), unpair/block/deletion and frozen nights (Tasks 6, 7, 9, 10), odd note text and no-logging (Tasks 5, 7, 8),
  goodnight edges incl. the goal-based window and undo after 06:00 (Tasks 2, 4, 6), old/new pairs (Tasks 11, 12, 13).
- Known costs, accepted: `/me/social` reads the circle's last 48 h of goodnights on every load (small rows, indexed
  by `at`); weeks cached before S2 keep S1 items until the next week; a `first_badge` (or a badge top story, as in S1)
  for a badge backfilled after its week was cached misses that week; a quiet week is rebuilt on every read for its
  first 24 h as final; the scene's seats are a fixed layout (tested free of overlap from 375 to 430 px wide; it needs
  336 px, so a narrower screen would clip the outer seats) whose bubbles are one line as wide as a seat; tonight's fire counts the live
  camp, so a buddy paired after 19:00 grows tonight's fire but not tonight's "lit night".
