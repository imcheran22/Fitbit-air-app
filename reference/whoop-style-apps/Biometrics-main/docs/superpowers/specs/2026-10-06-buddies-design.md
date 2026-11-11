# Buddies (social foundation) — design

Growth sub-project C. Status: approved in brainstorming with the owner on 2026-10-06; revised the same day after a
code-grounded review, then a second revision (request states, mood notice, push wording).
Design source: the growth canvas https://claude.ai/artifact/JHqksi4S4DpFXNiFJho97e — screens 2 (Buddy list),
2a (A buddy's week), 2b (Pair up), 2c (Nudge settings); all liked by the owner. Screen 2d (Crew) moves to E.

## 1. Goal

Let people pair up one-to-one as **buddies**, see each other's mood (and, by choice, a few numbers), and cheer each
other on with stickers — a private, low-pressure social layer that D (invites/outfits) and E (group challenges)
build on.

Success: two people can pair in under a minute (code or @handle), see exactly what the other chose to share and
nothing more, send stickers, and get notified — with silent controls (mute, unpair, block). Whether a handle exists
is discoverable (normal for unique handles); everything else about a person stays private unless you are paired.

Owner decisions:
- **Scope:** one-to-one buddies. Crew (named groups + shared streak + feed) moves to E, which needs groups anyway.
- **Sharing:** once paired, buddies always see your **mood** and **coach**. Five numbers are separate switches, all
  **off** by default, one set for all buddies: **recovery score, sleep score, hours slept, steps, streaks & badges**.
  Turning the first one on asks for a one-time versioned consent.
- **Notifications:** push **with names** ("Sam sent you a Cheer"); data stays id-only; quiet hours + per-buddy mute.
- **Identity:** a unique **@handle** plus a **display name**; email never shown.
- **Pairing:** a **buddy code** (24 h, instant) or a **request to an exact @handle** (must be accepted). No search.
- **No buddy limit.** The buddy list pages; rate limits carry abuse protection.
- **Approach A:** the server builds each buddy's view on request from data it already has; nothing about a buddy is
  copied or stored for sharing.
- Defaults the owner accepted: silent unpair / mute / block; stickers only (no free text); buddy data never reaches
  the AI coach; Buddies lives on Home (row) and Profile (settings), no new tab.

## 2. Identity

- `User.handle` — unique, case-insensitive (stored lowercase), 3–20 chars `[a-z0-9_]`, and must pass the reserved
  check below. Input has one leading `@` stripped before validation (in setup, edit, availability and requests
  alike).
- **Reserved words** (handles and display names alike): a **contains** check, case-insensitive, ignoring `_` and
  spaces, against a short list — biometrics, admin, support, official, team, staff, moderator. So "Team_Lead",
  "biometrics fan" and "the admin" are all rejected.
- `User.displayName` — 1–30 chars after sanitising: NFC-normalised, Unicode `Cc` (control) and `Cf` (format —
  bidi overrides, zero-width characters) removed, no newlines, then trimmed, and must pass the reserved check above.
- Both are set the first time the user opens Buddies (a setup screen). The display name is prefilled with the first
  word of `User.name`, unless `User.name` equals the email's local part or is the `'Biometrics user'` fallback (both
  are what sign-in stores when the provider gave no name, `backend/src/auth/auth.ts:108`) — then the field starts
  empty. Editable in Profile.
- Handle endpoints: an availability check and the set/change call, both rate-limited to **30 per minute** per user
  (§4 limiter). Claiming a handle checks `User.handle` uniqueness and the `HandleHold` table **in one transaction**;
  a unique-constraint race on either is "taken".
- Handle change: the old handle is held for 30 days (`HandleHold` row) so nobody else can claim it — except its
  previous owner, who may reclaim their own held handle (the hold is deleted). A deleted account's handle is held
  for 30 days too. A hold stores only a **keyed hash** of the handle (HMAC-SHA-256 with a server secret), never the
  handle itself: exact lookups (claim, request) hash the input and still work, but released handles can't be listed
  or read back. Requests to a held or unknown handle get the generic `not_found`.
- Requesting your own handle → `{error: 'own_handle'}` (it reveals nothing).
- Until a handle is set, the user can't send/accept requests or create/redeem codes (they can still view settings).

## 3. Data

Every new table is removed with either user. **No new model has a `userId` column**: each two-sided table names its
user columns for their role, and every foreign key to `User` has `onDelete: Cascade` (`BuddyCode.usedById` is
`SetNull`). Why: the existing deletion guard (`backend/tests/users/deletion.test.ts:30-43`) requires every model with
a `userId` column to have exactly one `user` relation and be listed in the purge; a two-sided table can't meet that,
so these tables stay outside the guard and rely on database cascades. A dedicated test proves deleting **either**
side removes the rows of every new table (and that `usedById` is nulled, not cascaded).

Models (relation names in brackets; every two-FK model names both relations):
- `BuddyPair` — `id`, `userAId`, `userBId` (stored with `userAId < userBId`), `createdAt`, `lastActivityAt`
  (set at pairing, bumped on every sticker between the two); `@@unique([userAId, userBId])`,
  `@@index([userAId, lastActivityAt, id])`, `@@index([userBId, lastActivityAt, id])`.
  Relations `"BuddyPairA"` (userA), `"BuddyPairB"` (userB).
- `BuddyRequest` — `id`, `fromUserId`, `toUserId`, `status` (PENDING | ACCEPTED | DECLINED | CANCELLED | EXPIRED),
  `hidden` (default false: true for a request the recipient never sees — swallowed after a decline, or sent to /
  left with someone who blocked the sender, §4), `createdAt`, `respondedAt`, `withdrawnAt` (the sender cancelled a
  request the target had already declined: it leaves the sender's view but stays DECLINED for the 30-day rule),
  `toHandleAtSend` (nullable: the target's handle when sent; the sender's outgoing list shows this, never the
  target's current handle); at
  most one PENDING per ordered pair; PENDING requests expire 14 days after `createdAt` (treated as EXPIRED on read
  and swept lazily). Relations `"BuddyRequestFrom"`, `"BuddyRequestTo"`.
- `BuddyCode` — `code` (8 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, unique), `ownerId`, `createdAt`, `expiresAt`
  (+24 h), `usedAt`, `usedById` (nullable, `SetNull`); one active code per owner. Relations `"BuddyCodeOwner"`,
  `"BuddyCodeUsedBy"`.
- `BuddyBlock` — `blockerId`, `blockedId`, `createdAt`; unique pair. Relations `"BuddyBlocker"`, `"BuddyBlocked"`.
- `BuddyMute` — `muterId`, `mutedId`, `createdAt`; unique pair; never visible to the muted person. Relations
  `"BuddyMuter"`, `"BuddyMuted"`.
- `Sticker` — `id`, `fromUserId`, `toUserId`, `kind` (CHEER | HEART | REST_UP | STAR), `sentAt`, `seenAt`.
  Relations `"StickerFrom"`, `"StickerTo"`.
- `BuddyActivity` — the in-app Activity list: `id`, `recipientId`, `actorId`, `kind` (STICKER | REQUEST | PAIRED |
  BUDDY_BADGE), `refId` (sticker id / request id / `BuddyPair` id for
  PAIRED / achievement id), `createdAt`, `seenAt`;
  `@@unique([recipientId, kind, refId])` (the dedupe for fan-out and retries). Relations `"BuddyActivityRecipient"`,
  `"BuddyActivityActor"`. Rows hold ids only: the Activity DTOs (names, sticker label, badge label) are built at
  read time. Kept **90 days** (older rows swept lazily on read), paged **30** per page.
- `HandleHold` — `handleHash` (unique; keyed hash, §2), `previousOwnerId` (nullable, `SetNull`; lets the owner reclaim), `releasedAt`
  (held until `releasedAt + 30 days`). Relation `"HandleHoldOwner"`.
- `User` gains: `handle` (unique), `displayName`, `shareRecovery`, `shareSleepScore`, `shareHoursSlept`, `shareSteps`,
  `shareStreaks` (all false), `buddySharingConsentVersion` + `buddySharingConsentAt` (nullable),
  `buddyMoodNoticeAt` (nullable, §4), `notifyBuddyStickers`, `notifyBuddyRequests`, `notifyBuddyBadges` (all true), and the back-relation fields `buddyPairsA`,
  `buddyPairsB`, `buddyRequestsSent`, `buddyRequestsReceived`, `buddyCodesOwned`, `buddyCodesUsed`, `blocksMade`,
  `blocksReceived`, `mutesMade`, `mutesReceived`, `stickersSent`, `stickersReceived`, `buddyActivityReceived`,
  `buddyActivityCaused`, `handleHolds`.

## 4. Rules

- **Pairing by code:** creating a code, in one transaction, expires the owner's older active codes and inserts the
  new one (retrying on a code collision). Redeeming normalises the input (upper-case, spaces and dashes removed);
  a valid, unexpired, unused code that isn't your own pairs you at once (marks the code used). Invalid, expired,
  used, own, blocked-either-way → the same generic `code_invalid`. Codes older than 7 days are swept.
- **Mood notice:** the first pairing action (creating/sharing a code, redeeming one, sending or accepting a
  request) shows a one-time notice: your mood comes from your recovery score and is always shared with every buddy
  (today and the last 7 days). The user confirms once (`buddyMoodNoticeAt` is set); the server rejects every pairing
  action without it (`{error: 'mood_notice_required'}`).
- **Pairing by request:** `POST` to an exact handle. Only an unknown or held handle → `not_found`. A handle you
  blocked → `{error: 'blocked_by_you'}` (unblock in Profile first; it tells you only what you did). Already buddies,
  or you already have a request to them that you see as pending → success no-op. Every other request to an existing
  handle returns the **same success**, including when the target has blocked you. **Mutual ask (crossed
  requests):** if the target has a request to you that they still see as pending (PENDING or DECLINED, hidden or
  not, not withdrawn, sent less than 14 days ago), the two are paired in one step, in one transaction that
  re-checks there is no block either way; across a block the send behaves as any other (a hidden row). Pairing by
  any route withdraws every DECLINED request between the two (`withdrawnAt` set and status CANCELLED, so a
  pairing-withdrawn row is told apart from the sender's own cancel), so none still reads "Pending".
- A unique-constraint error (P2002) on `BuddyPair` from a redeem or crossed-request race means the pair exists:
  **success**, not an error.
- **Accept / decline / cancel:** only the recipient accepts/declines; only the sender cancels; double-tap is a no-op.
- **After a decline:** for 30 days from the decline, a new request from that sender to that target is
  **swallowed**: stored as a `hidden` row, same success, no push, no Activity, never shown to the target.
- **What the sender sees** — every state the sender can't be told about looks exactly like an unanswered request
  that later expired:

  | Real state | Stored as | Sender sees | Recipient sees |
  |---|---|---|---|
  | Pending | PENDING | "Pending" until 14 days after sending, then gone | Request (push + Activity) |
  | Accepted | ACCEPTED | Request gone; the buddy appears (`buddy_paired`) | The buddy |
  | Declined | DECLINED | "Pending" until 14 days after sending, then gone | Nothing more |
  | Blocked by target (after sending) | PENDING, `hidden` | "Pending" until 14 days after sending, then gone | Nothing (removed from requests) |
  | Expired | EXPIRED | Gone | Gone |
  | Swallowed after a decline | PENDING, `hidden` | "Pending" until 14 days after sending, then gone | Nothing |
  | Sent to someone who blocked you | PENDING, `hidden` | "Pending" until 14 days after sending, then gone | Nothing |
  | Cancelled by the sender | CANCELLED (or DECLINED + `withdrawnAt`) | Gone | Gone |

  "Pending" to the sender means: PENDING or DECLINED, not withdrawn, sent less than 14 days ago. Hidden rows
  expire on the same 14-day clock as any other.
- **Unpair:** either side, silent. Deletes the pair, stickers between the two, and both users' Activity items about
  each other; closes any pending requests between them.
- **Block:** available on a buddy's week and on incoming request rows. Unpairs (as above), cancels the blocker's
  outgoing request, marks an incoming request from the blocked person `hidden` (it stays "pending" to them, table
  above), and makes their later requests hidden too and their codes `code_invalid`; the blocked person is told
  nothing. Unblock is available in Profile (rows already hidden stay hidden).
- **Mute:** stops pushes from that buddy; Activity still records; the buddy can't tell.
- **Stickers:** only between buddies; at most **5 per buddy per day** (counted in the database, sender's local day;
  a concurrent race may let a sixth through, accepted); a sticker sent while the pair is removed is dropped.
- **Rate limits:** a new Redis fixed-window limiter, per user, every Redis call timeout-bounded by a `withTimeout`
  helper extracted from `backend/src/achievements/marker.ts:40` and shared. Code redemption **10 per hour**; new
  requests **50 per day**; handle availability/set **30 per minute**; outgoing requests the sender sees as pending
  **≤ 20** (database count, hidden and declined rows included, so the cap reveals nothing). If Redis fails, these **fail closed** (`try_later`); the sticker limit doesn't need Redis. Commands ioredis
  queued during an outage may count against the quota once Redis returns; accepted.
- **Sharing consent:** the consent text lists what each switch shares and that, with streaks & badges on, buddies
  may be notified with your name when you reach a badge level (§6). The server rejects enabling any share switch unless the user holds consent for the current
  consent version. When the version is bumped, every switch reads as off (in responses and in buddy views) until
  the user re-consents; the stored values return after re-consent.
- **No limit** on the number of buddies.
- **Privacy:** every buddy response is built from (viewer, buddy) and the buddy's current switches at request time.
  A number whose switch is off never appears in any response, mood line, notification or log. Buddy data is never
  sent to the AI coach; any coach bubble on buddy screens is fixed template text.

## 5. What a buddy sees

- **Mood:** from the buddy's RECOVERY `DailyScore` with a non-null `score` for their own local today
  (`localCivilDate(now, buddy.timezone)`, `backend/src/biometrics/civilDate.ts:36`), else yesterday; banded with
  `getLiveConfig().scoreBands` (`backend/src/scoring/configs/index.ts:27`, the bands the scoring routes already return, `backend/src/scoring/routes.ts:58`):
  excellent/good → `good`, fair → `ok`, poor → `low`. No such score in those 2 local days → `none` ("No data yet").
- **Mood line** — fixed templates, only from shared items: `good` "Well rested", `ok` "Doing okay", `low` "Running low
  today", `none` "No data yet"; plus, only when the steps switch is on, " · moved a lot yesterday" (yesterday's steps
  ≥ `STEPS_GOAL`, `backend/src/coach/tools/metrics.ts:18`). The list and the week use this line.
- **Streak (buddy's week only):** with the streaks switch on, the week adds " · on a N-night streak" when the
  buddy's current Sleep goal streak is ≥ 3. It is computed by a **write-free** function: the achievement inputs,
  `sleepGoalDays` (`backend/src/achievements/families.ts:45`) and `summariseRuns`
  (`backend/src/achievements/runs.ts:22`) — never `evaluateAchievements`, which inserts awards. A buddy whose
  `achievementsSince` is null has **no** streak (nothing shown, not 0).
- **Buddy list** (`GET /me/buddies?cursor=`): 30 per page, ordered by `BuddyPair.lastActivityAt` desc then `id`, with
  the cursor `(lastActivityAt, id)`; each row: display name, handle, coach id, mood, mood line, unseen-sticker flag.
  Moods and yesterday's steps are fetched in one batch query each per page; no streaks on the list.
- **A buddy's week** (`GET /me/buddies/:buddyId`): today's mood + mood line (with streak), 7 daily mood tiles — each
  tile is that day's own score alone, no fallback to the day before — then one row per shared number with the daily
  values for those 7 days (recovery score, sleep score, hours slept, steps), the buddy's badge levels
  (Achievements) if streaks are shared, "Sam shares mood and sleep" summary, sticker buttons, and a menu (mute,
  unpair, block). Not buddies → `{error: 'not_buddies'}` (§7).

## 6. Notifications

New push kinds in `backend/src/coach/push.ts`. Today the push table is a closed map of fixed strings
(`GENERIC_PUSH_PAYLOADS`) checked by `assertGenericPayload` (`push.ts:137`), and the file's header rule
(`push.ts:3-8`) says push text is a fixed string that never contains a score, factor, habit name or any number. **This spec amends
that rule for buddy kinds only:** their text may contain a buddy's sanitised display name and a closed sticker or
badge label — never a number, score or other health value, never model output. Existing kinds keep the fixed-string
rule, and the header comment is updated to say so. Buddy kinds become **templates with typed slots**:

| Kind | Title / body template | Slots | Setting |
|---|---|---|---|
| `buddy_sticker` | "{name} sent you a {sticker}" | `name`, `sticker` | `notifyBuddyStickers` |
| `buddy_request` | "Someone wants to be your buddy" (fixed) | — | `notifyBuddyRequests` |
| `buddy_paired` | "You and {name} are now buddies" | `name` | always |
| `buddy_badge` | "{name} reached {badge}" | `name`, `badge` | `notifyBuddyBadges`, only while the earner shares streaks |

- The request push names nobody; the sender's handle and name are shown only in the app.
- Slot types: `name` — the sanitised display name (§2), length-capped; `sticker` — the
  closed label of a `Sticker.kind` ("Cheer", "Heart", "Rest up", "Star"), with its article in the template ("a
  Cheer", "a Rest up"); `badge` — a closed family+level label map with its grammar (e.g. "Sleep goal streak II"),
  covering all 7 achievement families. The sender rebuilds the expected title and body from the template and the
  slots and throws unless the payload matches exactly, so the closed-table guarantee still holds: no free text and
  no health number can reach a push. Badge labels are levels ("II"), not
  values ("21 nights").
- Data stays id-only: the allowlist widens from `{kind: 'recap', recapId}` to also accept exactly
  `{kind ∈ buddy kinds, refId: uuid}`. `refId` is the **actor's user id** for `buddy_sticker`, `buddy_paired` and
  `buddy_badge` (tap opens that buddy's week) and the **request id** for `buddy_request` (tap opens requests).
- `buddy_paired` goes to **both** people.
- Muted buddy → no push. **Quiet hours** in the recipient's zone: from the recipient's bedtime goal to their wake
  goal when **both** are set, else 22:00–07:00; windows that wrap midnight and windows that don't are both handled;
  equal start and end means no quiet hours. A push in quiet hours is skipped, not delayed.
- **Foreground:** buddy pushes show as a banner while the app is open (the handler in
  `mobile/src/notifications/handler.ts:53` gains buddy kinds alongside wind-down); recap pushes keep their current
  behaviour.
- Every event also writes a `BuddyActivity` row (none for hidden requests, §4); the Buddies screen shows an
  Activity list with an unseen dot.
- **`buddy_badge`:** hooked in `backend/src/achievements/evaluate.ts`, whose insert becomes
  `createManyAndReturn({ skipDuplicates: true })` so only truly new rows come back (a concurrent evaluation gets
  none). Of those rows, only the **highest new level per family** in that evaluation is announced (earning I, II
  and III at once announces III only). If the earner shares streaks, the announcement is enqueued as a BullMQ job;
  the job fans out to the earner's buddies — it writes one `BuddyActivity` row each (the
  `@@unique([recipientId, kind, refId])` key dedupes retries) and sends a push where the row was new. Nothing is
  sent from the GET request path itself. If the enqueue fails after the insert, that announcement — Activity rows
  and pushes — is lost (logged, not retried); the badge itself is kept. Accepted. The push fires when the earner's
  badges are next evaluated (today, when they open Achievements), which may be later than the badge's `earnedOn`.
- `BUDDY_BADGE` rows are only written while the earner shares streaks, and are hidden at read time if they no
  longer do.
- Tapping a push opens the relevant screen (buddy's week or requests).
- Notification settings extend `/me/notifications` (`backend/src/users/routes.ts:51`) and its patch parser
  (`backend/src/users/notifications.ts:7`) with `notifyBuddyStickers`, `notifyBuddyRequests` and
  `notifyBuddyBadges`.

## 7. App

- **Home:** a Buddies row (up to 5 coach sprites with mood dots + "See all"); hidden until the user has a buddy or a
  pending request; tap → Buddies screen.
- **Buddies screen:** the paged list, pending requests (accept / decline / block), Activity, "Add a buddy" → Pair up.
- **Pair up:** the one-time mood notice before the first pairing action (§4); your code (create / share via the system share sheet / expiry countdown), enter a code, or request by
  @handle; first-time setup of handle + display name if missing.
- **Buddy's week:** as §5, stickers, menu.
- **Profile:** handle + display name (edit), "Shared with buddies" switches (with the consent sheet on first enable
  and after a consent-version bump), notification settings (stickers, requests, streaks & badges), blocked people (unblock).
- **Old backend:** detected only by the `GET /me/buddies` probe — a 404 there hides all buddy UI. Everywhere else
  "not buddies" is `{error: 'not_buddies'}`, never a bare 404 (e.g. a sticker to someone who just unpaired shows
  "You're no longer buddies").

## 8. Edge cases

- Buddy's local day for mood and tiles; the recipient's zone for quiet hours.
- Buddy with no data → `none`, shared number rows empty.
- Concurrent code redemption: one wins (conditional update on `usedAt IS NULL`), the other gets `code_invalid`.
- Crossed requests resolved in one transaction; repeated accept is a no-op; a P2002 on the pair is success.
- Switch turned off → next request excludes it everywhere (including old `BUDDY_BADGE` Activity); no cached copies
  exist.
- Handle change → buddies see the new handle; old handle held 30 days as a keyed hash (reclaimable by its owner).
- Account deletion → all social rows on both sides (cascades), its handle held 30 days; coach-data deletion → social
  data untouched.
- Logs: ids and event names only.

## 9. Testing

- Backend unit: handle validation (leading `@`) and display-name sanitising (`Cc`/`Cf`, NFC, newlines); the
  reserved contains-check for both (case, `_` and spaces ignored); HandleHold keyed hash (exact lookup matches, no
  plaintext stored); sender-visible request state for every row of the §4 table; display-name prefill (email local part and `'Biometrics user'` give
  empty); mood bands from `scoreBands` incl. null scores and `none`; mood-line templates never include an unshared
  item; write-free streak (no `Achievement` writes; null `achievementsSince` → no streak); buddy-view builder per
  switch and with a stale consent version; push templates: every slot combination rebuilds and any other text or
  data is rejected, `buddy_request` text is fixed and nameless, badge labels for all 7 families contain no digits;
  highest-new-level-per-family selection; quiet hours (wrapping, non-wrapping, equal times, one goal
  missing → default); rate limiter + Redis failure/timeout (fail closed); code alphabet, normalisation, expiry.
- Backend integration: code pairing (older codes expired on create, collision retry, 7-day sweep), request pairing,
  crossed requests and P2002-as-success (a mutual ask pairs even over a declined or hidden request, never across a block), decline/cancel/expiry and cancel of a
  declined request (`withdrawnAt`, swallow still applies), the sender's view identical across every §4 table state,
  swallowed requests (hidden row, success, no push, no Activity), requests to someone who blocked you (same success
  as a real one, hidden), `not_found` only for unknown/held handles, `blocked_by_you`, the 20-pending cap counting
  hidden and declined rows, mood notice required for every pairing action, unpair, block from a request row,
  block/unblock, mute, `own_handle`, handle claim race vs
  `HandleHold`, owner reclaim, deleted account's handle held, handle endpoint rate limit, consent required to enable
  and re-consent after a bump, concurrency (double redeem, double accept), sticker daily limit, buddy list paging by
  `(lastActivityAt, id)` and bumped by stickers, buddy's week shape (tiles without fallback, streak only here),
  `not_buddies` errors, push kinds sent / muted / quiet-hours skipped / per-switch off (incl.
  `notifyBuddyRequests`), `buddy_paired` to both, PAIRED Activity `refId` is the pair id, one badge announcement per
  family for a multi-level jump, enqueue failure loses the announcement but keeps the badge, `buddy_badge` only
  for new rows (concurrent evaluations fan out once), fan-out job dedupe, no badge rows when not sharing and hidden
  after sharing stops, Activity 90-day sweep and paging, `/me/notifications` new keys, **deletion of either side
  removes every new table's rows and nulls `usedById` (dedicated test)**, coach-data deletion leaves social data.
- Mobile: handle setup (prefill), mood notice shown once before the first pairing action, Pair up (code create/share/enter, request), Buddies screen (list paging, requests
  with block, Activity unseen dot), buddy's week (only shared rows, streak), stickers, `not_buddies` message, Profile
  switches + consent + re-consent, notification settings, blocked list, Home row, push tap routing by `refId`,
  buddy push banner in foreground (recap unchanged), 404 probe fallback.
- Dev-only seed script pairing the demo account with a second dev account and sending a sticker (refuses production
  and non-local databases, like the badge seed).

## 10. Out of scope

Crews and group challenges (E), invite links / QR / deep links / outfits (D), handle search or discovery, free-text
messages, per-buddy sharing settings, comments or reactions beyond the four stickers.
