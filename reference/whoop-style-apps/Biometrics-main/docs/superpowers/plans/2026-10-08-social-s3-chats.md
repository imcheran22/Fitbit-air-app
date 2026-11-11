# Social S3 — Chats — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship build phase S3 of the Social tab: Instagram-DM-style 1:1 chats between buddies (text, stickers, quoted
cards, replies, reactions, unsend, "Seen", activity status), the Chats inbox with notes and the Requests that move
there from Buddies, reports for messages and notes, the `dm_message` push, and the unread count on the Social tab —
plus the one item S2 deferred to S3: a story ring re-lights when a later frame arrives after it was seen.

**Architecture:** One small migration for the story fix (`StorySeen.lastFrameAt`) and one additive migration for chats
(`Conversation`, `Message`, `MessageReaction`, `ConversationRead`, `StatusNote`, `Report`, five `User` columns). A new
backend module `src/chats/` holds the pure text rules (`text.ts`), the pair's conversation and the one message writer
(`conversations.ts`, also used by every sticker send), cards (`cards.ts`), messages and the thread (`messages.ts`),
presence and chat privacy settings (`presence.ts`), the inbox (`inbox.ts`), Chats notes (`notes.ts`), reports
(`reports.ts`), the `dm_message` job (`dmPush.ts`) and `routes.ts`. Unpair and block delete the conversation in their
own transaction. The app adds `api/chats.ts`, `lib/chatCopy.ts`, `lib/chatThread.ts` (the polled thread window),
components under `components/chats/`, and three pushed screens (`Chats`, `ChatRequests`, `ChatThread`); the S1/S2
stand-ins (Chats button, Message camp, a coach on the Campfire, buddy push taps) now open them.

**Tech Stack:** Express 5 + Prisma 6 (Postgres) + BullMQ/ioredis backend (TypeScript, Jest + supertest); Expo 57 /
React Native app (NativeWind, React Navigation 7, Jest + React Native Testing Library).

**Spec:** `docs/superpowers/specs/2026-10-07-social-tab-design.md` (§2 push routing and the Requests move, §4.2 story
replies and seen, §6.1 a coach opens the DM thread, §6.4 "Message camp", §8 Chats, §9 privacy and reports, §10
`dm_message`, §11 out of scope, §12 S3, §13 tests). Builds on the S1 and S2 plans
(`docs/superpowers/plans/2026-10-07-social-s1.md`, `docs/superpowers/plans/2026-10-07-social-s2-campfire.md`, both
merged) and the S2 ledger `.superpowers/sdd/2026-10-07-social-s2-campfire/progress.md` ("Deferred to S3": the story
seen flag).

## Global Constraints

- **Scope = S3 only** (spec §12: "conversations, messages, reactions, unsend, seen, activity status, notes, Requests
  move, reports, `dm_message` push"), plus the S2 deferral (story re-light). **Group chat is out of scope** (spec §6.4
  and §11: "Message camp" opens Chats; "Group chats and crew threads" are E). No photos, voice, GIFs, message editing,
  typing indicators, message search, sockets/SSE, admin moderation UI.
- **Branch and base:** `feature/social-chats`, created from `feature/shadcn-buttons` (PR #55, not merged yet; it holds
  main with S1 and S2 merged). Base commit: `1162193`. Never push. Never switch branches.
- **Workspace (Task 0):** backend tests run **only** through
  `.superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh <paths>` — a copy of the S2 helper (test DB from
  `~/dev/biometrics-run/backend/.env`, Redis db 1, `cd` into this worktree's `backend/`). **Never run two invocations
  at once.** Never point anything at the dev `biometrics` DB.
- Mobile tests, from `mobile/`: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit <paths>`.
- **Typecheck baselines:** backend `node node_modules/.bin/tsc --noEmit` is clean; mobile
  `node node_modules/.bin/tsc --noEmit --types jest,node --pretty false | grep -c "error TS"` is **12** (the file list
  Task 0 writes to `.superpowers/sdd/2026-10-08-social-s3-chats/tsc-baseline.txt`). No task may add an error.
- **Commits:** plain `git commit -m "…"`, no `Co-Authored-By` trailer, no mention of Claude or AI. Never push.
- **The button standard is binding for all new UI** (`mobile/src/components/ui/README.md`): every button and text link
  is `<Button>` from `components/ui/button`; `__tests__/conventions/buttons.test.ts` fails on a raw `Pressable` /
  `Text` with a button or link role. Rows (a conversation row, a buddy row in the new-message sheet, a note avatar)
  are not buttons: they stay `Pressable` and get an allowlist entry with a count and a reason in the task that adds
  them. Icon-only buttons need an `accessibilityLabel`. Teal is not a button colour.
- **Owner mockup sign-off (owner rule):** no chat UI task (Tasks 14, 15, 16, 17) starts until Task 0b's mockups are
  approved. If the owner changes the layout, the UI tasks follow the approved mockup; their behaviour, testIDs and
  tests stay as written unless the change removes the element.
- **Privacy (spec §9, carried from Buddies, S1, S2):** a buddy's numbers only through `effectiveSharing`; nothing about
  buddies reaches the AI coach; logs carry ids, event names and counts only (`JSON.stringify({ event, …ids })`, error
  class names, never messages). **Message, Chats-note and camp-note text is user free text:** never logged (not even
  its length), never sent to the coach, never in analytics, never in `/me/social`, the timeline, story frames or
  highlights, and never in a push unless the recipient turned previews on (`showMessagePreviews`, default off). A
  report's excerpt lives only in the `Report` row; no route reads reports.
- **Every chat route answers `{ error: 'not_buddies' }` (403) for a non-buddy**, a malformed id, oneself or across a
  block (the block deletes the pair, so the work is the same as for any unpaired person — Buddies equal-work rule),
  never a bare 404. Chat routes live on `chatsRouter` (`src/chats/routes.ts`); GETs set
  `Cache-Control: private, no-store`. Errors use `BuddyError` / `buddyRoute`; every new code goes into
  `BUDDY_ERROR_STATUS` **and** gets its words in `mobile/src/lib/buddyCopy.ts` in the same task
  (`mobile/__tests__/lib/buddyCopy.test.ts` reads the backend codes).
- **Rate limits** go through the Buddies limiter (`limitOrThrow`, fail closed: `rate_limited` 429 / `try_later` 503).
  A delete is never limited and never fails closed (unsend, clearing a reaction, clearing a note), nor are reads,
  marking read or presence.
- **New tables** have no `userId` column (the `USER_OWNED_MODELS` guard): owner columns are named for their role
  (`senderId`, `reactorId`, `readerId`, `authorId`, `reporterId`, `reportedUserId`, `userAId`/`userBId`); every FK to
  `User` is `onDelete: Cascade`; each model is registered in `backend/src/buddies/models.ts` and seeded in
  `backend/tests/buddies/deletion.test.ts`. Tests delete accounts through `deleteUserAccount`.
- **Migrations are additive only** (CREATE TYPE / TABLE / INDEX, ADD COLUMN, ADD CONSTRAINT), timestamps after
  `20261010120000`: `20261011120000_story_seen_last_frame` (Task 1) and `20261011130000_social_chats` (Task 2).
- **Older pieces keep working:** an S3 app on an S2 server sees no `unread.chats` (the Chats button keeps opening
  Buddies — or Chats › Requests when requests wait — the Campfire coach keeps opening the buddy's week, Message camp
  opens Buddies) and a bare 404 from `GET /me/chats`, `GET /me/chats/:id/messages`, `GET /me/notes`,
  `GET /me/chats/settings` (each hides its feature: "Chats aren't available yet"); an S2 app on an S3 server keeps
  working (its story seen call has no body and counts as "seen now"; stickers it sends also land in the thread).
- **Plan rulings (where the spec is silent or loose; the owner may revert):**
  - Plan ruling (S2 deferral): a story is seen up to the newest frame the viewer reached, not for the whole day.
    `StorySeen.lastFrameAt` stores that frame's time (`POST …/seen { through }`, clamped to now; never moves back); a
    ring is unseen while its newest frame is later than `lastFrameAt` (or `seenAt` on rows from before S3). An evening
    goodnight after a morning view lights the ring again.
  - Plan ruling: message text is 1–1000 code points after sanitising: NFC; `\r\n`, `\r`, U+2028 and U+2029 become
    `\n`; every other `Cc` and every `Cf` character is removed (so a ZWJ emoji sequence falls apart into its emoji, as
    for camp notes); three or more newlines in a row become two; trimmed; at least one visible character; a lone
    surrogate is refused before the limiter. Variation selectors stay. A card's optional text follows the same rule.
  - Plan ruling: retention — messages have no time-based expiry; they live until unsent, until unpair/block, or until
    either account is deleted. Unsend is a soft delete that clears `text`, `sticker` and `card` at once and deletes the
    message's reactions; reads skip unsent rows ("shown as nothing"). Chats notes live 24 h; reports 90 days. The hourly
    social sweep deletes expired notes and old reports.
  - Plan ruling: unpair and block delete the pair's `Conversation` (its messages, reactions and reads cascade) in the
    same transaction as the pair; block deletes it even without a pair. Notes, camp notes, stories, timeline and camp
    presence of an ex-buddy are hidden at read time (the circle is read live). Account deletion cascades every new
    table on both sides. Reports keep their excerpt and survive an unpair or block (so "Block too" leaves evidence),
    and are deleted with either account.
  - Plan ruling: unsending a STICKER message removes it from the thread only: the `Sticker` row stays (it still counts
    toward that day's 5 and stays in the timeline and Buddies history).
  - Plan ruling: read receipts — `ConversationRead.lastReadAt` moves forward when the reader opens or polls the thread
    (`POST /me/chats/:buddyId/read`) and when they send. The thread carries `seenAt` (the buddy's `lastReadAt`) only
    while both people have **Read receipts** on (reciprocal, default on); the app shows "Seen" under my newest message
    when it is the newest message in the thread and `seenAt` ≥ its time. Unread counts never depend on the setting.
    Reading a thread also marks that buddy's unseen stickers seen.
  - Plan ruling: paging — a thread page is 50 messages, newest first in the query, oldest first on the wire, keyset
    `(createdAt desc, id desc)` with `?before=<cursor>`; the inbox page is 30 conversations, keyset
    `(lastMessageAt desc, id desc)` with `?cursor=`; a conversation whose messages are all unsent is not listed.
  - Plan ruling: real time — no socket. An open thread re-reads its newest page every 5 s while focused and the app
    is active (this replaces the spec's `?after=` poll: a poll must also carry unsends, reactions and "Seen", which
    `after` alone cannot); the app keeps older pages and carries messages that slide out of the newest window. The inbox
    and notes refresh on focus and when a buddy push arrives in the foreground (S2's push-refresh pattern).
  - Plan ruling: rate limits — TEXT and CARD messages 30 a minute and 500 a day per sender (both buckets); a STICKER
    message is governed by the Buddies sticker limit only (5 per buddy per day); reactions 60 a minute; Chats notes 20
    an hour; reports 20 an hour.
  - Plan ruling: presence — `User.lastActiveAt` is touched at most once a minute, by `POST /me/presence` (sent on app
    start and each return to the foreground) and by any chat read or send. A thread and an inbox row carry `activeAt`
    only when it is within 24 h and both people have **Show activity status** on (reciprocal, default on); the app words
    it: ≤ 5 min "Active now", under an hour "Active {n}m ago", else "Active {n}h ago".
  - Plan ruling: cards are built by the server from what the sender can see now; the app names only the item:
    `{ type: 'my_checkin' }` (the "+" button), `{ type: 'story_frame', at }` (a frame of the recipient's story today),
    `{ type: 'note' }` and `{ type: 'camp_note' }` (the recipient's live notes). A locked check-in frame is quoted with no
    mood; a frame or note that is gone answers `card_unavailable`. A CARD may carry text (the reply); a whitespace-only
    text is refused, the app sends none.
  - Plan ruling: a reply to a message (`replyToMessageId`) must name a live message in the same conversation
    (`message_gone` otherwise); the thread shows a one-line quote, or "Message unsent" once the original is unsent.
  - Plan ruling: Chats notes are one per author, 1–60 code points after the camp-note sanitiser, live 24 h, replaced
    by sharing again (new time, new expiry), not cleared by a check-in, no push; visible to the author and their
    current buddies only (`GET /me/notes`).
  - Plan ruling: a report stores the reporter, the reported person, the target (type and id; a note's id is its
    author's id), the reason (spam / harassment / other), an excerpt of the reported text at report time and the time;
    one row per reporter and target (a second report updates it). No route reads reports; nothing is logged; the
    reported person is never told; the app then offers "Block too". Only a target the reporter can see now can be
    reported (`report_target_gone` otherwise).
  - Plan ruling: `dm_message` push — the job carries the message id, never its text; it drops an unsent message, a
    STICKER message (the sticker already sends `buddy_sticker`) and an ex-buddy; it reads the text only when the
    recipient has previews on. At most one push per conversation per 2 minutes (a Redis `SET NX EX 120` key; if Redis
    fails, no push). No app-icon badge count. Without previews: "{name} sent you a message" / "Open the app to read
    it."; with previews the title is the name and the body the text on one line, at most 80 code points plus "…" (a
    card without text says "Shared their check-in", "Replied to your story", "Replied to your note" or "Replied to your
    camp note"). Data `{ kind: 'dm_message', refId: <sender id> }`.
  - Plan ruling: unread — `unread.chats` on `/me/social` counts conversations with at least one unread message from a
    current buddy; the Chats button shows chats + requests; the tab dot is on while requests + stickers + chats > 0.
  - Plan ruling: Chats › Requests is its own pushed screen (`ChatRequests`), reached from "Requests (N)" in the inbox
    and from a `buddy_request` push; accepting opens the new buddy's thread. The Buddies screen becomes the plain
    "All buddies" list (its Requests and Activity tabs go).
  - Plan ruling: the inbox row's quick-sticker button sends a Cheer; "New message" picks from the buddies store's loaded
    list; the thread's "+" shares my check-in today (disabled until I have one).
  - Plan ruling: replies from elsewhere — the story viewer gains a "Message" button that opens the thread with the
    current frame staged as a quote (its sticker replies stay); tapping a buddy's Chats note opens the thread with the
    note staged; tapping a buddy's coach on the Campfire opens the thread, with their camp note staged when they have
    one. A staged quote is sent as a CARD with the next text message.
  - Plan ruling: report entry points — long-press a message (theirs), long-press a buddy's Chats note, and a "Report"
    link beside a buddy's camp note in "Who's here".
  - Plan ruling: Profile gets a "Chats" settings group (Read receipts, Show activity status) after Buddies, and the
    Notifications section gains "Messages" (`notifyDirectMessages`, default on) and "Message previews"
    (`showMessagePreviews`, default off).

## Review Focus

1. **Unpair or block in the middle of a conversation:** the thread, the inbox row, the unread count, notes and the
   camp-note quote vanish for both people on the next read; a message sent while the pair is being removed is either
   deleted with the conversation or refused with `not_buddies`, never left behind; an open thread's next poll shows
   "You're no longer buddies." Tests: Task 4 (send across a block), Task 8 (inbox), Task 11 (purge both ways and
   the send/unpair race), Task 14 (the thread's gone state on a poll).
2. **Hostile or odd text:** whitespace only, zero-width and bidi characters, 1001 code points, 1000 emoji, a lone
   surrogate, a wall of newlines, a non-string body — refused or sanitised as ruled, never stored when refused, never
   logged, and never in a push without opted-in previews. Tests: Task 3 (rules), Task 4 (route, nothing stored, no
   token spent on a lone surrogate, tripwire), Task 9 (notes), Task 12 (push preview).
3. **The polled thread window:** a new message pushes the oldest one out of the newest page; an unsend or a reaction
   inside the window; older pages loaded before and after a poll — no gap, no duplicate, no message reordered. Tests:
   Task 13 (`pollWindow` / `olderWindow` / `threadMessages`) and Task 14 (a screen test across two polls).
4. **Reciprocal settings and quiet pushes:** read receipts or activity status off on either side hides both ways;
   previews are off by default; mute, quiet hours and `notifyDirectMessages` apply; three messages in a row make one
   push; a sticker message never makes a second push. Tests: Task 6, Task 12.
5. **Old server / new app and the reverse:** no `unread.chats` → the Chats button, Message camp and the coach tap keep
   their S2 targets; bare 404s hide the inbox, thread, notes and settings; an S2 app's bodiless story seen call still
   clears the ring. Tests: Task 1, Task 13, Task 15, Task 16, Task 17.

---

## File Structure

Backend (`backend/`):
- Create `prisma/migrations/20261011120000_story_seen_last_frame/migration.sql` — `StorySeen.lastFrameAt`.
- Create `prisma/migrations/20261011130000_social_chats/migration.sql` — three enums, six tables, five `User` columns.
- Modify `prisma/schema.prisma` — the models, enums, `User` columns and back-relations, `StorySeen.lastFrameAt`.
- Modify `src/buddies/models.ts` (registry), `src/buddies/errors.ts` (seven codes), `src/buddies/cursor.ts`
  (`lastMessageAt` keyset), `src/buddies/stickers.ts` (every sticker also writes a STICKER message),
  `src/buddies/routes.ts` (sticker route answers `{ id }`), `src/buddies/relations.ts` (unpair/block delete the
  conversation), `src/buddies/notify.ts` (`dm_message` setting, `grouped`, the claim hook),
  `src/buddies/notifyQueue.ts` (the `dm_message` branch), `src/lib/rateLimit.ts` (five limits),
  `src/coach/push.ts` (`dm_message` kind and template), `src/users/notifications.ts` (two keys),
  `src/social/stories.ts` (seen through a frame), `src/social/routes.ts` (seen body), `src/social/home.ts`
  (`unread.chats`), `src/social/sweep.ts` (notes and reports), `src/app.ts` (`chatsRouter`).
- Create `src/chats/text.ts`, `types.ts`, `conversations.ts`, `cards.ts`, `messages.ts`, `presence.ts`, `inbox.ts`,
  `notes.ts`, `reports.ts`, `dmPush.ts`, `routes.ts`.
- Modify `scripts/seedSocial.ts` — a short demo conversation and a Chats note.
- Tests: create `tests/chats/{schema,text,send,cards,thread,reactions,inbox,notes,reports,purge,push}.test.ts`; modify
  `tests/social/stories.test.ts`, `tests/social/home.test.ts`, `tests/social/homeQueries.test.ts`,
  `tests/buddies/deletion.test.ts`, `tests/buddies/notify.test.ts`, `tests/lib/rateLimit.test.ts`,
  `tests/scripts/seedSocial.test.ts`.

Mobile (`mobile/`):
- Create `src/api/chats.ts`, `src/lib/chatCopy.ts`, `src/lib/chatThread.ts`.
- Create `src/components/chats/{ChatAvatar,ChatRow,NotesRow,NoteComposerSheet,NewChatSheet,RequestsList,MessageBubble,MessageActionsSheet,ReportSheet,ChatComposer,ChatSettingsSection}.tsx`.
- Create `src/screens/ChatsScreen.tsx`, `src/screens/ChatRequestsScreen.tsx`, `src/screens/ChatThreadScreen.tsx`.
- Modify `src/api/social.ts` (`markStorySeen` through), `src/api/notifications.ts` (two keys, per-key defaults),
  `src/lib/buddyCopy.ts` (seven messages), `src/lib/socialStore.ts` (chats in the counts, `useChatsAvailable`),
  `src/components/social/SocialStoreScope.tsx` (presence ping), `src/components/notifications-section.tsx` (two
  switches), `src/screens/SocialScreen.tsx`, `src/screens/SocialStoryScreen.tsx`, `src/screens/CampfireScreen.tsx`,
  `src/screens/BuddiesScreen.tsx`, `src/screens/SettingsScreen.tsx`, `src/navigation/RootNavigator.tsx`,
  `src/notifications/handler.ts`.
- Tests: create `__tests__/api/chats.test.ts`, `__tests__/lib/chatCopy.test.ts`, `__tests__/lib/chatThread.test.ts`,
  `__tests__/screens/ChatRequestsScreen.test.tsx`, `__tests__/screens/ChatsScreen.test.tsx`,
  `__tests__/screens/ChatThreadScreen.test.tsx`, `__tests__/screens/SocialStoryChats.test.tsx`,
  `__tests__/api/notifications.test.ts`, `__tests__/components/ChatSettingsSection.test.tsx`,
  `__tests__/components/NotificationsSectionChats.test.tsx`; modify `__tests__/api/social.test.ts`,
  `__tests__/screens/SocialStoryScreen.test.tsx`, `__tests__/screens/BuddiesScreen.test.tsx`,
  `__tests__/screens/SocialScreen.test.tsx`, `__tests__/screens/CampfireScreen.test.tsx`,
  `__tests__/notifications/handler.test.ts`, `__tests__/lib/socialStore.test.tsx`,
  `__tests__/components/SocialStoreScope.test.tsx`, `__tests__/conventions/buttons.test.ts`.

---

### Task 0: S3 workspace

**Files:** none in git (`.superpowers/` is ignored).

**Interfaces:**
- Produces: `.superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh` (every later backend step runs it) and
  `tsc-baseline.txt`.

- [ ] **Step 1: Copy the S2 test helper into the S3 workspace**

```bash
mkdir -p .superpowers/sdd/2026-10-08-social-s3-chats
cp .superpowers/sdd/2026-10-07-social-s2-campfire/backend-jest.sh .superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh
grep -n "^cd " .superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh
```

Expected: `cd /Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/social-tab/backend` (the same worktree, so
the copy needs no edit).

- [ ] **Step 2: Check dependencies and the branch**

Run: `git branch --show-current && git log --oneline -1 && ls backend/node_modules/.bin/prisma mobile/node_modules/.bin/jest`
Expected: `feature/social-chats`, `1162193 …`, both paths print. If a path is missing, run
`PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH npm ci` in that folder, and in `backend/` also
`DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder npx prisma generate`.

- [ ] **Step 3: Confirm the baselines**

Run: `bash .superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh tests/social tests/buddies` — Expected: PASS.
Run (from `mobile/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/tsc --noEmit --types jest,node --pretty false > ../.superpowers/sdd/2026-10-08-social-s3-chats/tsc-baseline.txt; grep -c "error TS" ../.superpowers/sdd/2026-10-08-social-s3-chats/tsc-baseline.txt`
— Expected: `12`.
Run (from `mobile/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/conventions/buttons.test.ts`
— Expected: PASS.

- [ ] **Step 4: Start the ledger**

Write `.superpowers/sdd/2026-10-08-social-s3-chats/progress.md` with the plan path, the branch
(`feature/social-chats`, base `1162193`) and the baselines. Nothing to commit.

### Task 0b: Owner mockup sign-off (controller; no code)

Owner rule: the owner sees an updated mockup before any UI is built. The **controller** (not an implementer) produces
canvas mockups of the **Chats inbox** (header with @handle and new message, search, the notes row, Messages with
"Requests (N)", conversation rows with story ring, active dot, unread weight and the quick-sticker button) and the
**thread** (header with active line and info, date chips, my teal and their grey bubbles, a sticker bubble, a
check-in card, a reply quote, a reaction, "Seen", the staged-quote bar, the quick-sticker row, "+", the input and
Send), drawn with the button standard (`<Button>` variants and sizes from `mobile/src/components/ui/README.md`; rows
are not buttons), starting from the V5 canvas boards `V5Chats.dc.html` and `V5Thread.dc.html`
(`/Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/buddies/.superpowers/social-canvas/project/`). The
owner approves them before Tasks 14–17 start. Record the approval (or the changes asked for) in the ledger; backend
Tasks 1–12 and the app's data layer (Task 13) may run before it.

---

### Task 1: A story ring re-lights when a later frame arrives (S2 deferral)

The S1 model wrote one `StorySeen` row per viewer, author and author-day, so a story seen in the morning stayed grey
when an evening goodnight frame arrived. Seen now means "up to the newest frame I reached".

**Files:**
- Modify: `backend/prisma/schema.prisma` (`StorySeen.lastFrameAt`)
- Create: `backend/prisma/migrations/20261011120000_story_seen_last_frame/migration.sql`
- Modify: `backend/src/social/stories.ts` (`storyRingsFor`, `markStorySeen`), `backend/src/social/routes.ts`
- Modify: `mobile/src/api/social.ts` (`markStorySeen`), `mobile/src/screens/SocialStoryScreen.tsx`
- Test: `backend/tests/social/stories.test.ts`; `mobile/__tests__/api/social.test.ts`,
  `mobile/__tests__/screens/SocialStoryScreen.test.tsx`

**Interfaces:**
- Consumes: `requireAuthor`, `loadFrames`, `authorTodays` (inside `stories.ts`); `buddyUser`, `pairUp`, `api`
  (`tests/buddies/helpers.ts`).
- Produces: `markStorySeen(viewerId: string, authorId: string, now: Date, rawThrough?: unknown): Promise<void>`;
  route `POST /me/social/stories/:authorId/seen` with optional body `{ through: string }` (204); mobile
  `markStorySeen(authorId: string, through?: string): Promise<void>`. `StoryRingDTO` is unchanged.

- [ ] **Step 1: Write the failing backend tests**

Append to `backend/tests/social/stories.test.ts`:

```ts
it('a later frame lights a seen ring again: seen means the newest frame reached, not the whole day (S2 deferral)', async () => {
  const me = await buddyUser();
  const sam = await buddyUser(); // UTC: NOW is 20:00 on 2026-10-07 for Sam
  await pairUp(me.id, sam.id);
  const checkInAt = new Date(NOW.getTime() - 4 * 3_600_000); // 16:00
  await saveCheckIn(sam.id, 'RESTED', checkInAt);
  await markStorySeen(me.id, sam.id, new Date(NOW.getTime() - 3 * 3_600_000), checkInAt.toISOString());
  const ring = async () => (await loadStoryRings(me.id, NOW)).rings.map((r) => [r.unseen, r.frameCount]);
  expect(await ring()).toEqual([[false, 1]]);
  // An evening goodnight after I watched: a new frame, so the ring lights again.
  const goodnightAt = new Date(NOW.getTime() - 3_600_000); // 19:00
  await prisma.goodnight.create({ data: { authorId: sam.id, localDate: day('2026-10-07'), at: goodnightAt, onTime: true } });
  expect(await ring()).toEqual([[true, 2]]);
  // Watching through the goodnight clears it; an older "through" (a second viewer racing) never moves it back.
  await markStorySeen(me.id, sam.id, NOW, goodnightAt.toISOString());
  await markStorySeen(me.id, sam.id, NOW, checkInAt.toISOString());
  expect(await ring()).toEqual([[false, 2]]);
  const row = await prisma.storySeen.findUniqueOrThrow({ where: { viewerId_authorId_localDate: { viewerId: me.id, authorId: sam.id, localDate: day('2026-10-07') } } });
  expect(row.lastFrameAt?.toISOString()).toBe(goodnightAt.toISOString());
});

it('an app that sends no "through" (S1/S2) is seen up to now; a future or unreadable one is clamped to now', async () => {
  const me = await buddyUser();
  const sam = await buddyUser();
  await pairUp(me.id, sam.id);
  await saveCheckIn(sam.id, 'RESTED', new Date(NOW.getTime() - 3_600_000));
  await markStorySeen(me.id, sam.id, NOW);
  expect((await loadStoryRings(me.id, NOW)).rings.map((r) => r.unseen)).toEqual([false]);
  for (const through of ['2099-01-01T00:00:00.000Z', 'not a date', 42, null]) {
    await prisma.storySeen.deleteMany({ where: { viewerId: me.id } });
    await markStorySeen(me.id, sam.id, NOW, through);
    const row = await prisma.storySeen.findFirstOrThrow({ where: { viewerId: me.id } });
    expect([through, row.lastFrameAt?.toISOString()]).toEqual([through, NOW.toISOString()]);
  }
});

it('a seen row from before S3 (no lastFrameAt) counts up to its seenAt, so a later frame still lights the ring', async () => {
  const me = await buddyUser();
  const sam = await buddyUser();
  await pairUp(me.id, sam.id);
  await saveCheckIn(sam.id, 'RESTED', new Date(NOW.getTime() - 4 * 3_600_000));
  await prisma.storySeen.create({ data: { viewerId: me.id, authorId: sam.id, localDate: day('2026-10-07'), seenAt: new Date(NOW.getTime() - 3 * 3_600_000) } });
  const unseen = async () => (await loadStoryRings(me.id, NOW)).rings.map((r) => r.unseen);
  expect(await unseen()).toEqual([false]);
  await prisma.goodnight.create({ data: { authorId: sam.id, localDate: day('2026-10-07'), at: new Date(NOW.getTime() - 3_600_000), onTime: false } });
  expect(await unseen()).toEqual([true]);
  await markStorySeen(me.id, sam.id, NOW); // an S2 app, no through
  expect(await unseen()).toEqual([false]);
});

it('the seen route takes { through } and answers 204', async () => {
  const me = await buddyUser();
  const sam = await buddyUser();
  await pairUp(me.id, sam.id);
  const at = new Date(Date.now() - 60_000);
  await saveCheckIn(sam.id, 'RESTED', at);
  const res = await (await api()).post(`/me/social/stories/${sam.id}/seen`).set(await authHeaderFor(me.id)).send({ through: at.toISOString() });
  expect(res.status).toBe(204);
  const row = await prisma.storySeen.findFirstOrThrow({ where: { viewerId: me.id, authorId: sam.id } });
  expect(row.lastFrameAt?.toISOString()).toBe(at.toISOString());
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bash .superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh tests/social/stories.test.ts`
Expected: FAIL — TypeScript: "Property 'lastFrameAt' does not exist" and `markStorySeen` "Expected 3 arguments, but got 4".

- [ ] **Step 3: Add the column**

In `backend/prisma/schema.prisma`, in `model StorySeen`, after `seenAt    DateTime @default(now())` add:

```prisma
  /// The newest frame the viewer reached (S3): a frame after it lights the ring again. Null on rows from before
  /// S3, which count up to seenAt.
  lastFrameAt DateTime?
```

Create `backend/prisma/migrations/20261011120000_story_seen_last_frame/migration.sql`:

```sql
-- Social S3 (the S2 deferral): a story is seen up to the newest frame reached, so a later frame lights the ring again.
-- Additive only.

-- AlterTable
ALTER TABLE "StorySeen" ADD COLUMN "lastFrameAt" TIMESTAMP(3);
```

Regenerate the client (from `backend/`):
`PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder npx prisma generate`

- [ ] **Step 4: Read and write seen through a frame**

In `backend/src/social/stories.ts`:

Replace the header's last line (`// A goodnight (S2) is a frame of the author's local date of the moment it was said, never locked.`) with:

```ts
// A goodnight (S2) is a frame of the author's local date of the moment it was said, never locked.
// Seen (S3, the S2 deferral) is "up to the newest frame the viewer reached" (StorySeen.lastFrameAt; seenAt on older
// rows), so a frame added later the same day — an evening goodnight after a morning view — lights the ring again.
```

In `storyRingsFor`, replace

```ts
    prisma.storySeen.findMany({
      where: { viewerId, authorId: { in: buddies.map((b) => b.person.id) }, localDate: { in: dates } },
      select: { authorId: true, localDate: true },
    }),
  ]);
  const seenToday = new Set(seen.filter((s) => isoDate(s.localDate) === todayOf.get(s.authorId)).map((s) => s.authorId));
```

with

```ts
    prisma.storySeen.findMany({
      where: { viewerId, authorId: { in: buddies.map((b) => b.person.id) }, localDate: { in: dates } },
      select: { authorId: true, localDate: true, seenAt: true, lastFrameAt: true },
    }),
  ]);
  // How far into each author's story today I have watched (ms). A row from before S3 has no lastFrameAt: its seenAt
  // stands in, which is what the per-day model meant.
  const seenThrough = new Map(
    seen.filter((s) => isoDate(s.localDate) === todayOf.get(s.authorId)).map((s) => [s.authorId, (s.lastFrameAt ?? s.seenAt).getTime()] as const),
  );
```

and replace the `rings.push(…)` line with

```ts
    const latestAt = list[list.length - 1]!.at;
    const through = seenThrough.get(b.person.id);
    rings.push({ author: b.person, unseen: through === undefined || Date.parse(latestAt) > through, locked: checkIn !== undefined && !viewerCheckedIn, frameCount: list.length, latestAt });
```

Replace the whole `markStorySeen` function with:

```ts
/**
 * Seen up to `rawThrough`, the time of the newest frame the viewer reached. A missing or unreadable value (an S1/S2
 * app) means now; a future one is clamped to now. One row per viewer, author and author-day; lastFrameAt never moves
 * back (two open viewers can race), and a pre-S3 row whose seenAt is already later is left alone.
 */
export async function markStorySeen(viewerId: string, authorId: string, now: Date, rawThrough?: unknown): Promise<void> {
  const { author } = await requireAuthor(viewerId, authorId);
  const localDate = civilDateToUtcMidnight(localCivilDateOrUtc(now, author.timezone));
  const parsed = typeof rawThrough === 'string' ? new Date(rawThrough) : null;
  const through = parsed && !Number.isNaN(parsed.getTime()) && parsed.getTime() <= now.getTime() ? parsed : now;
  const created = await prisma.storySeen.createMany({ data: [{ viewerId, authorId, localDate, seenAt: now, lastFrameAt: through }], skipDuplicates: true });
  if (created.count > 0) return;
  await prisma.storySeen.updateMany({
    where: { viewerId, authorId, localDate, OR: [{ lastFrameAt: { lt: through } }, { lastFrameAt: null, seenAt: { lt: through } }] },
    data: { seenAt: now, lastFrameAt: through },
  });
}
```

In `backend/src/social/routes.ts`, replace the seen route with:

```ts
// Body { through }: the newest frame's time the viewer reached (S3). An older app sends none.
socialRouter.post('/me/social/stories/:authorId/seen', requireAuth, buddyRoute(async (req, res) => {
  await markStorySeen(req.userId!, String(req.params.authorId), new Date(), (req.body as { through?: unknown } | undefined)?.through);
  res.status(204).end();
}));
```

- [ ] **Step 5: Run the backend tests**

Run: `bash .superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh tests/social/stories.test.ts tests/social/home.test.ts tests/social/homeQueries.test.ts tests/buddies/deletion.test.ts`
Expected: PASS (the existing "seen clears the ring" and "orders rings" tests still pass: no `through` means now).

- [ ] **Step 6: Write the failing app tests**

In `mobile/__tests__/api/social.test.ts`, after the line
`expect(api).toHaveBeenLastCalledWith('/me/social/stories/a%2F1/seen', expect.objectContaining({ method: 'POST' }));`
add:

```ts
  await markStorySeen('a/1', '2026-10-07T15:00:00.000Z');
  expect(api).toHaveBeenLastCalledWith('/me/social/stories/a%2F1/seen', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ through: '2026-10-07T15:00:00.000Z' }) });
```

In `mobile/__tests__/screens/SocialStoryScreen.test.tsx`, replace `expect(markStorySeen).toHaveBeenCalledWith('sam');` with:

```ts
  expect(markStorySeen).toHaveBeenCalledWith('sam', '2026-10-07T15:00:00.000Z');
```

Run (from `mobile/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/api/social.test.ts __tests__/screens/SocialStoryScreen.test.tsx`
Expected: FAIL — the call has no body / no second argument.

- [ ] **Step 7: Send the frame's time**

In `mobile/src/api/social.ts`, replace

```ts
// The seen routes answer 204.
export async function markStorySeen(authorId: string): Promise<void> {
  await apiFetch<void>(`/me/social/stories/${id(authorId)}/seen`, send('POST'));
}
```

with

```ts
// The seen routes answer 204. `through` is the time of the newest frame I reached (S3): a frame added after it lights
// the ring again.
export async function markStorySeen(authorId: string, through?: string): Promise<void> {
  await apiFetch<void>(`/me/social/stories/${id(authorId)}/seen`, send('POST', through === undefined ? undefined : { through }));
}
```

In `mobile/src/screens/SocialStoryScreen.tsx`, replace the seen effect

```ts
  useEffect(() => {
    if (viewer.index === last && !seen.current) {
      seen.current = true;
      void markStorySeen(story.author.id)
```

with

```ts
  useEffect(() => {
    if (viewer.index === last && !seen.current) {
      seen.current = true;
      void markStorySeen(story.author.id, story.frames[last]?.at)
```

and change that effect's dependency list from `[viewer.index, last, story.author.id]` to
`[viewer.index, last, story.author.id, story.frames]`.

- [ ] **Step 8: Run the app tests**

Run (from `mobile/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/api/social.test.ts __tests__/screens/SocialStoryScreen.test.tsx __tests__/screens/SocialStoryCampfire.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/prisma backend/src/social/stories.ts backend/src/social/routes.ts backend/tests/social/stories.test.ts mobile/src/api/social.ts mobile/src/screens/SocialStoryScreen.tsx mobile/__tests__/api/social.test.ts mobile/__tests__/screens/SocialStoryScreen.test.tsx
git commit -m "fix(social): a story ring lights again when a frame arrives after the one last seen"
```

---

### Task 2: Chat tables and migration

**Files:**
- Modify: `backend/prisma/schema.prisma` (three enums, six models, five `User` columns, eight back-relations)
- Create: `backend/prisma/migrations/20261011130000_social_chats/migration.sql`
- Modify: `backend/src/buddies/models.ts`
- Test: create `backend/tests/chats/schema.test.ts`; modify `backend/tests/buddies/deletion.test.ts`

**Interfaces:**
- Consumes: `orderedPair(a, b)` (`src/buddies/pairs.ts`); `deleteUserAccount(userId, deps)`; `buddyUser()`.
- Produces: Prisma enums `MessageKind { TEXT STICKER CARD }`, `ReportTarget { MESSAGE STATUS_NOTE CAMP_NOTE }`,
  `ReportReason { SPAM HARASSMENT OTHER }`; models
  `Conversation { id, userAId, userBId, createdAt, lastMessageAt }` (unique `userAId_userBId`, CHECK `userAId < userBId`),
  `Message { id, conversationId, senderId, kind, text?, sticker?, card? Json, replyToMessageId?, createdAt, deletedAt? }`,
  `MessageReaction { messageId, reactorId, kind, createdAt }` (id `messageId_reactorId`),
  `ConversationRead { conversationId, readerId, lastReadAt }` (id `conversationId_readerId`),
  `StatusNote { authorId @id, text, createdAt, expiresAt }`,
  `Report { id, reporterId, reportedUserId, targetType, targetId, reason, excerpt?, createdAt }` (unique
  `reporterId_targetType_targetId`); `User.lastActiveAt?`, `chatReadReceipts` (true), `chatActivityStatus` (true),
  `notifyDirectMessages` (true), `showMessagePreviews` (false).

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/chats/schema.test.ts`:

```ts
import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { orderedPair } from '../../src/buddies/pairs';
import { deleteUserAccount } from '../../src/users/deletion';
import { buddyUser } from '../buddies/helpers';

jest.mock('../../src/health/client');

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

// The same no-op Google deps as tests/buddies/deletion.test.ts.
const noop = { deleteSubscription: async () => {}, revokeToken: async () => {}, log: () => {} };
const LATER = new Date('2030-01-01T00:00:00Z');

async function chat() {
  const a = await buddyUser();
  const b = await buddyUser();
  const conversation = await prisma.conversation.create({ data: orderedPair(a.id, b.id) });
  const message = await prisma.message.create({ data: { conversationId: conversation.id, senderId: a.id, kind: 'TEXT', text: 'hi' } });
  return { a, b, conversation, message };
}

it('keeps one conversation per pair, stored in order', async () => {
  const { a, b } = await chat();
  await expect(prisma.conversation.create({ data: orderedPair(a.id, b.id) })).rejects.toMatchObject({ code: 'P2002' });
  const { userAId, userBId } = orderedPair(a.id, b.id);
  await expect(prisma.conversation.create({ data: { userAId: userBId, userBId: userAId } })).rejects.toThrow(/Conversation_ordered_check/);
});

it('gives new users read receipts and activity status on, message pushes on and previews off', async () => {
  const a = await buddyUser();
  const row = await prisma.user.findUniqueOrThrow({
    where: { id: a.id },
    select: { lastActiveAt: true, chatReadReceipts: true, chatActivityStatus: true, notifyDirectMessages: true, showMessagePreviews: true },
  });
  expect(row).toEqual({ lastActiveAt: null, chatReadReceipts: true, chatActivityStatus: true, notifyDirectMessages: true, showMessagePreviews: false });
});

it('allows one reaction per person per message, one read row per reader, one Chats note per author, one report per reporter and target', async () => {
  const { a, b, conversation, message } = await chat();
  await prisma.messageReaction.create({ data: { messageId: message.id, reactorId: b.id, kind: 'HEART' } });
  await expect(prisma.messageReaction.create({ data: { messageId: message.id, reactorId: b.id, kind: 'STAR' } })).rejects.toMatchObject({ code: 'P2002' });
  await prisma.conversationRead.create({ data: { conversationId: conversation.id, readerId: b.id, lastReadAt: new Date() } });
  await expect(prisma.conversationRead.create({ data: { conversationId: conversation.id, readerId: b.id, lastReadAt: new Date() } })).rejects.toMatchObject({ code: 'P2002' });
  await prisma.statusNote.create({ data: { authorId: a.id, text: 'early night', expiresAt: LATER } });
  await expect(prisma.statusNote.create({ data: { authorId: a.id, text: 'again', expiresAt: LATER } })).rejects.toMatchObject({ code: 'P2002' });
  const report = { reporterId: b.id, reportedUserId: a.id, targetType: 'MESSAGE' as const, targetId: message.id, reason: 'SPAM' as const };
  await prisma.report.create({ data: report });
  await expect(prisma.report.create({ data: { ...report, reason: 'OTHER' } })).rejects.toMatchObject({ code: 'P2002' });
});

it('a reply survives its original being deleted (SetNull); deleting the conversation removes its messages, reactions and reads', async () => {
  const { a, b, conversation, message } = await chat();
  const reply = await prisma.message.create({ data: { conversationId: conversation.id, senderId: b.id, kind: 'TEXT', text: 'yo', replyToMessageId: message.id } });
  await prisma.message.delete({ where: { id: message.id } });
  expect((await prisma.message.findUniqueOrThrow({ where: { id: reply.id } })).replyToMessageId).toBeNull();
  await prisma.messageReaction.create({ data: { messageId: reply.id, reactorId: a.id, kind: 'CHEER' } });
  await prisma.conversationRead.create({ data: { conversationId: conversation.id, readerId: a.id, lastReadAt: new Date() } });
  await prisma.conversation.delete({ where: { id: conversation.id } });
  expect(await prisma.message.count({ where: { conversationId: conversation.id } })).toBe(0);
  expect(await prisma.messageReaction.count({ where: { messageId: reply.id } })).toBe(0);
  expect(await prisma.conversationRead.count({ where: { conversationId: conversation.id } })).toBe(0);
});

it("deleting an account removes the pair's conversation and everything chat about them, on both sides", async () => {
  const { a, b, conversation, message } = await chat();
  await prisma.message.create({ data: { conversationId: conversation.id, senderId: b.id, kind: 'STICKER', sticker: 'CHEER' } });
  await prisma.messageReaction.create({ data: { messageId: message.id, reactorId: b.id, kind: 'HEART' } });
  await prisma.statusNote.create({ data: { authorId: a.id, text: 'early night', expiresAt: LATER } });
  await prisma.statusNote.create({ data: { authorId: b.id, text: 'still here', expiresAt: LATER } });
  await prisma.report.create({ data: { reporterId: b.id, reportedUserId: a.id, targetType: 'MESSAGE', targetId: message.id, reason: 'SPAM' } });
  await prisma.report.create({ data: { reporterId: a.id, reportedUserId: b.id, targetType: 'STATUS_NOTE', targetId: b.id, reason: 'OTHER' } });
  await deleteUserAccount(a.id, noop);
  expect(await prisma.conversation.count({ where: { id: conversation.id } })).toBe(0);
  expect(await prisma.message.count({ where: { conversationId: conversation.id } })).toBe(0);
  expect(await prisma.report.count({ where: { OR: [{ reporterId: a.id }, { reportedUserId: a.id }] } })).toBe(0);
  expect(await prisma.statusNote.count({ where: { authorId: b.id } })).toBe(1);
});
```

In `backend/tests/buddies/deletion.test.ts`, in `seedSocial(a, b)`, after the closing `}` of the existing
`for (const [me, other] of [[a, b], [b, a]] as const) { … }` loop and before `return { aCode: aCode.code, bCode: bCode.code };`, add:

```ts
  // Social S3 tables (Chats).
  const conversation = await prisma.conversation.create({ data: { userAId: lo, userBId: hi } });
  for (const [me, other] of [[a, b], [b, a]] as const) {
    const message = await prisma.message.create({ data: { conversationId: conversation.id, senderId: me, kind: 'TEXT', text: 'hi' } });
    await prisma.messageReaction.create({ data: { messageId: message.id, reactorId: other, kind: 'HEART' } });
    await prisma.conversationRead.create({ data: { conversationId: conversation.id, readerId: me, lastReadAt: new Date() } });
    await prisma.statusNote.create({ data: { authorId: me, text: 'early night', expiresAt: later } });
    await prisma.report.create({ data: { reporterId: me, reportedUserId: other, targetType: 'MESSAGE', targetId: message.id, reason: 'SPAM' } });
  }
```

- [ ] **Step 2: Run them to see them fail**

Run: `bash .superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh tests/chats/schema.test.ts tests/buddies/deletion.test.ts`
Expected: FAIL — TypeScript: "Property 'conversation' does not exist on type 'PrismaClient'".

- [ ] **Step 3: Add the models**

In `backend/prisma/schema.prisma`, in `model User`, after `campNote              CampNote?           @relation("CampNoteAuthor")` add:

```prisma
  conversationsA        Conversation[]      @relation("ConversationA")
  conversationsB        Conversation[]      @relation("ConversationB")
  messagesSent          Message[]           @relation("MessageSender")
  messageReactions      MessageReaction[]   @relation("MessageReactor")
  conversationReads     ConversationRead[]  @relation("ConversationReader")
  statusNote            StatusNote?         @relation("StatusNoteAuthor")
  reportsMade           Report[]            @relation("ReportReporter")
  reportsAgainst        Report[]            @relation("ReportReported")
```

and after `notifyBuddyBadges          Boolean   @default(true)` add:

```prisma
  /// Chats (spec 2026-10-07 social §8.4): touched at most once a minute (presence). Shown to a buddy only while both
  /// have chatActivityStatus on.
  lastActiveAt               DateTime?
  /// Reciprocal (spec §8.2, §8.4): off → you neither send nor see "Seen" / activity status.
  chatReadReceipts           Boolean   @default(true)
  chatActivityStatus         Boolean   @default(true)
  /// dm_message pushes (spec §10); previews (the message text in the push) are off by default.
  notifyDirectMessages       Boolean   @default(true)
  showMessagePreviews        Boolean   @default(false)
```

Append at the end of the file:

```prisma
// ---- Social tab S3: Chats (spec docs/superpowers/specs/2026-10-07-social-tab-design.md §8, §9) ----

enum MessageKind {
  TEXT
  STICKER
  CARD
}

enum ReportTarget {
  MESSAGE
  STATUS_NOTE
  CAMP_NOTE
}

enum ReportReason {
  SPAM
  HARASSMENT
  OTHER
}

/// One per buddy pair, stored once with userAId < userBId (like BuddyPair), made by the first message. Unpair and block
/// delete it (messages, reactions and reads cascade).
model Conversation {
  id            String             @id @default(uuid())
  userAId       String
  userA         User               @relation("ConversationA", fields: [userAId], references: [id], onDelete: Cascade)
  userBId       String
  userB         User               @relation("ConversationB", fields: [userBId], references: [id], onDelete: Cascade)
  createdAt     DateTime           @default(now())
  lastMessageAt DateTime           @default(now())
  messages      Message[]
  reads         ConversationRead[]

  @@unique([userAId, userBId])
  @@index([userAId, lastMessageAt])
  @@index([userBId, lastMessageAt])
}

/// A DM. text is user free text (TEXT, or a CARD's reply): never logged, never to the coach. card is the server's
/// snapshot of a quoted item (src/chats/cards.ts). Unsend sets deletedAt and clears text, sticker and card.
model Message {
  id               String            @id @default(uuid())
  conversationId   String
  conversation     Conversation      @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  senderId         String
  sender           User              @relation("MessageSender", fields: [senderId], references: [id], onDelete: Cascade)
  kind             MessageKind
  text             String?
  sticker          StickerKind?
  card             Json?
  replyToMessageId String?
  replyTo          Message?          @relation("MessageReply", fields: [replyToMessageId], references: [id], onDelete: SetNull)
  replies          Message[]         @relation("MessageReply")
  createdAt        DateTime          @default(now())
  deletedAt        DateTime?
  reactions        MessageReaction[]

  @@index([conversationId, createdAt, id])
}

/// One reaction per person per message: one of the four sticker kinds.
model MessageReaction {
  messageId String
  message   Message     @relation(fields: [messageId], references: [id], onDelete: Cascade)
  reactorId String
  reactor   User        @relation("MessageReactor", fields: [reactorId], references: [id], onDelete: Cascade)
  kind      StickerKind
  createdAt DateTime    @default(now())

  @@id([messageId, reactorId])
}

/// How far each person has read a conversation ("Seen", unread counts).
model ConversationRead {
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  readerId       String
  reader         User         @relation("ConversationReader", fields: [readerId], references: [id], onDelete: Cascade)
  lastReadAt     DateTime

  @@id([conversationId, readerId])
}

/// A Chats note (spec §8.1): one per author, 1-60 code points of user free text, live 24 h. Never logged.
model StatusNote {
  authorId  String   @id
  author    User     @relation("StatusNoteAuthor", fields: [authorId], references: [id], onDelete: Cascade)
  text      String
  createdAt DateTime @default(now())
  expiresAt DateTime

  @@index([expiresAt])
}

/// A report (spec §9). excerpt: the reported text at report time, so the report outlives an unpair or block. No route
/// reads reports; kept 90 days (social sweep). The reported person is never told.
model Report {
  id             String       @id @default(uuid())
  reporterId     String
  reporter       User         @relation("ReportReporter", fields: [reporterId], references: [id], onDelete: Cascade)
  reportedUserId String
  reportedUser   User         @relation("ReportReported", fields: [reportedUserId], references: [id], onDelete: Cascade)
  targetType     ReportTarget
  /// A message id, or for a note its author's id.
  targetId       String
  reason         ReportReason
  excerpt        String?
  createdAt      DateTime     @default(now())

  @@unique([reporterId, targetType, targetId])
  @@index([createdAt])
}
```

Create `backend/prisma/migrations/20261011130000_social_chats/migration.sql`:

```sql
-- Social tab S3 Chats (spec docs/superpowers/specs/2026-10-07-social-tab-design.md §8, §9, §10). Additive only.

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('TEXT', 'STICKER', 'CARD');
CREATE TYPE "ReportTarget" AS ENUM ('MESSAGE', 'STATUS_NOTE', 'CAMP_NOTE');
CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'HARASSMENT', 'OTHER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "lastActiveAt" TIMESTAMP(3),
ADD COLUMN "chatReadReceipts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "chatActivityStatus" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "notifyDirectMessages" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "showMessagePreviews" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Conversation_ordered_check" CHECK ("userAId" < "userBId")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "kind" "MessageKind" NOT NULL,
    "text" TEXT,
    "sticker" "StickerKind",
    "card" JSONB,
    "replyToMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageReaction" (
    "messageId" TEXT NOT NULL,
    "reactorId" TEXT NOT NULL,
    "kind" "StickerKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("messageId","reactorId")
);

-- CreateTable
CREATE TABLE "ConversationRead" (
    "conversationId" TEXT NOT NULL,
    "readerId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConversationRead_pkey" PRIMARY KEY ("conversationId","readerId")
);

-- CreateTable
CREATE TABLE "StatusNote" (
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StatusNote_pkey" PRIMARY KEY ("authorId")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reportedUserId" TEXT NOT NULL,
    "targetType" "ReportTarget" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "excerpt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_userAId_userBId_key" ON "Conversation"("userAId", "userBId");
CREATE INDEX "Conversation_userAId_lastMessageAt_idx" ON "Conversation"("userAId", "lastMessageAt");
CREATE INDEX "Conversation_userBId_lastMessageAt_idx" ON "Conversation"("userBId", "lastMessageAt");
CREATE INDEX "Message_conversationId_createdAt_id_idx" ON "Message"("conversationId", "createdAt", "id");
CREATE INDEX "StatusNote_expiresAt_idx" ON "StatusNote"("expiresAt");
CREATE UNIQUE INDEX "Report_reporterId_targetType_targetId_key" ON "Report"("reporterId", "targetType", "targetId");
CREATE INDEX "Report_createdAt_idx" ON "Report"("createdAt");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_replyToMessageId_fkey" FOREIGN KEY ("replyToMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_reactorId_fkey" FOREIGN KEY ("reactorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationRead" ADD CONSTRAINT "ConversationRead_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationRead" ADD CONSTRAINT "ConversationRead_readerId_fkey" FOREIGN KEY ("readerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StatusNote" ADD CONSTRAINT "StatusNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Regenerate the client (from `backend/`):
`PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH DATABASE_URL=postgresql://placeholder@localhost:5432/placeholder npx prisma generate`

- [ ] **Step 4: Register the tables**

In `backend/src/buddies/models.ts`, change the header's first line to
`// The social tables (Buddies spec §3, Social tab S1, S2 and S3). None has a \`userId\`, so the`, add after `'CampNote',`
in `SOCIAL_MODELS`:

```ts
  'Conversation',
  'Message',
  'MessageReaction',
  'ConversationRead',
  'StatusNote',
  'Report',
```

and after `CampNote: ['authorId'],` in `SOCIAL_USER_COLUMNS`:

```ts
  Conversation: ['userAId', 'userBId'],
  Message: ['senderId'],
  MessageReaction: ['reactorId'],
  ConversationRead: ['readerId'],
  StatusNote: ['authorId'],
  Report: ['reporterId', 'reportedUserId'],
```

- [ ] **Step 5: Run the tests**

Run: `bash .superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh tests/chats/schema.test.ts tests/buddies/deletion.test.ts tests/users/deletion.test.ts tests/social/campfireSchema.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma backend/src/buddies/models.ts backend/tests/chats/schema.test.ts backend/tests/buddies/deletion.test.ts
git commit -m "feat(chats): conversation, message, reaction, read, note and report tables"
```

---

### Task 3: Chat text rules, error codes and rate limits

**Files:**
- Create: `backend/src/chats/text.ts`
- Modify: `backend/src/buddies/errors.ts`, `backend/src/lib/rateLimit.ts`, `mobile/src/lib/buddyCopy.ts`
- Test: create `backend/tests/chats/text.test.ts`; modify `backend/tests/lib/rateLimit.test.ts`; run
  `mobile/__tests__/lib/buddyCopy.test.ts`

**Interfaces:**
- Consumes: `sanitiseDisplayName`, `hasVisibleCharacter`, `isWellFormed` (`src/buddies/identity.ts`).
- Produces: `MESSAGE_TEXT_MAX = 1000`, `STATUS_NOTE_MAX = 60`, `PREVIEW_MAX = 80`,
  `sanitiseMessageText(raw: string): string`, `checkMessageText(raw: unknown): string | null`,
  `checkStatusNote(raw: unknown): string | null`, `previewText(text: string, max?: number): string`; error codes
  `invalid_message` (400), `message_gone` (404), `invalid_reaction` (400), `card_unavailable` (409),
  `invalid_status_note` (400), `invalid_report` (400), `report_target_gone` (404); `RATE_LIMITS.message`
  (30/60 s), `messageDay` (500/86400 s), `statusNote` (20/3600 s), `reaction` (60/60 s), `report` (20/3600 s).

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/chats/text.test.ts`:

```ts
import { MESSAGE_TEXT_MAX, STATUS_NOTE_MAX, checkMessageText, checkStatusNote, previewText, sanitiseMessageText } from '../../src/chats/text';
import { BUDDY_ERROR_STATUS } from '../../src/buddies/errors';

// Built at run time so no editor or tool can turn the lone surrogate into other bytes.
const LONE_SURROGATE = String.fromCharCode(0xd800);

it('keeps newlines, turns CR/CRLF and the Unicode separators into \\n, strips every other control and format character', () => {
  expect(sanitiseMessageText('a\r\nb\rc d e')).toBe('a\nb\nc\nd\ne');
  expect(sanitiseMessageText('a\tb\u0000c​d‮e')).toBe('abcde');
  expect(sanitiseMessageText('one\n\n\n\n\ntwo')).toBe('one\n\ntwo');
  expect(sanitiseMessageText('  \n hi \n  ')).toBe('hi');
  expect(sanitiseMessageText('é')).toBe('é');
  // A variation selector stays: the heart keeps its emoji form.
  expect(sanitiseMessageText('❤️')).toBe('❤️');
});

it('accepts 1-1000 code points with something visible, and refuses everything else', () => {
  expect(checkMessageText(' rough night lol ')).toBe('rough night lol');
  expect(checkMessageText('x'.repeat(MESSAGE_TEXT_MAX))).toHaveLength(1000);
  expect(checkMessageText('x'.repeat(MESSAGE_TEXT_MAX + 1))).toBeNull();
  expect(checkMessageText('🔥'.repeat(1000))).toBe('🔥'.repeat(1000)); // code points, not UTF-16 units
  expect(checkMessageText('🔥'.repeat(1001))).toBeNull();
  for (const bad of ['', '   ', '\n\n', '​‍', '⠀', 42, null, undefined, ['hi'], { text: 'hi' }, `hi${LONE_SURROGATE}`]) {
    expect([bad, checkMessageText(bad)]).toEqual([bad, null]);
  }
});

it('sanitises a Chats note like a camp note (no newlines) and allows 1-60 code points', () => {
  expect(checkStatusNote(' early\nnight ')).toBe('earlynight');
  expect(checkStatusNote('x'.repeat(STATUS_NOTE_MAX))).toHaveLength(60);
  expect(checkStatusNote('x'.repeat(61))).toBeNull();
  expect(checkStatusNote('admin says hi')).toBe('admin says hi');
  for (const bad of ['', '  ', '​', 7, `${LONE_SURROGATE}hi`]) expect(checkStatusNote(bad)).toBeNull();
});

it('previews a text on one line of at most 80 code points, ending with an ellipsis when cut', () => {
  expect(previewText('rough night\nlol')).toBe('rough night lol');
  expect(previewText('x'.repeat(80))).toBe('x'.repeat(80));
  expect(previewText(`${'x'.repeat(79)} yz`)).toBe(`${'x'.repeat(79)}…`);
  expect(previewText('🔥'.repeat(81))).toBe(`${'🔥'.repeat(80)}…`);
  expect(previewText('abcdef', 3)).toBe('abc…');
});

it('has the S3 error codes', () => {
  expect(BUDDY_ERROR_STATUS).toMatchObject({
    invalid_message: 400, message_gone: 404, invalid_reaction: 400, card_unavailable: 409,
    invalid_status_note: 400, invalid_report: 400, report_target_gone: 404,
  });
});
```

In `backend/tests/lib/rateLimit.test.ts`, replace the `expect(RATE_LIMITS).toEqual({ … });` block of
`it('has the spec limits', …)` with:

```ts
  expect(RATE_LIMITS).toEqual({
    codeRedeem: { name: 'code_redeem', limit: 10, windowSeconds: 3600 },
    buddyRequest: { name: 'buddy_request', limit: 50, windowSeconds: 86400 },
    handle: { name: 'handle', limit: 30, windowSeconds: 60 },
    campNote: { name: 'camp_note', limit: 20, windowSeconds: 3600 },
    message: { name: 'message', limit: 30, windowSeconds: 60 },
    messageDay: { name: 'message_day', limit: 500, windowSeconds: 86400 },
    statusNote: { name: 'status_note', limit: 20, windowSeconds: 3600 },
    reaction: { name: 'reaction', limit: 60, windowSeconds: 60 },
    report: { name: 'report', limit: 20, windowSeconds: 3600 },
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `bash .superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh tests/chats/text.test.ts tests/lib/rateLimit.test.ts`
Expected: FAIL — "Cannot find module '../../src/chats/text'"; the limits table lacks the five new entries.

- [ ] **Step 3: Write the rules**

Create `backend/src/chats/text.ts`:

```ts
// Chat free text (spec 2026-10-07 social §8.1, §8.2, §9). Pure. A message's text: NFC; \r\n, \r, U+2028 and U+2029
// become \n; every other control (Cc) and every format character (Cf) is removed — bidi overrides and zero-widths
// go, and a ZWJ emoji sequence falls apart into its emoji (as for camp notes); three or more newlines in a row become
// two; trimmed; 1-1000 code points with something visible. Variation selectors stay, so an emoji keeps its form.
// A Chats note uses the camp-note sanitiser (no newlines at all), 1-60 code points. A lone surrogate is refused
// before sanitising (Postgres cannot store it).
// The text is user free text: never logged (not even its length), never sent to the coach, never in analytics.

import { hasVisibleCharacter, isWellFormed, sanitiseDisplayName } from '../buddies/identity';

export const MESSAGE_TEXT_MAX = 1000;
export const STATUS_NOTE_MAX = 60;
/** An inbox line, a reply quote and a push preview: one line of at most this many code points. */
export const PREVIEW_MAX = 80;

export function sanitiseMessageText(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/\r\n?|[  ]/g, '\n')
    .replace(/[\p{Cc}\p{Cf}]/gu, (c) => (c === '\n' ? c : ''))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The text to store, or null when it is not a valid message text. */
export function checkMessageText(raw: unknown): string | null {
  if (typeof raw !== 'string' || !isWellFormed(raw)) return null;
  const text = sanitiseMessageText(raw);
  const length = [...text].length;
  return length >= 1 && length <= MESSAGE_TEXT_MAX && hasVisibleCharacter(text) ? text : null;
}

/** A Chats note to store, or null. */
export function checkStatusNote(raw: unknown): string | null {
  if (typeof raw !== 'string' || !isWellFormed(raw)) return null;
  const text = sanitiseDisplayName(raw);
  const length = [...text].length;
  return length >= 1 && length <= STATUS_NOTE_MAX && hasVisibleCharacter(text) ? text : null;
}

/** One line: whitespace runs (newlines too) become one space; longer than `max` code points is cut and ends in "…". */
export function previewText(text: string, max: number = PREVIEW_MAX): string {
  const flat = text.replace(/\s+/gu, ' ').trim();
  const points = [...flat];
  return points.length <= max ? flat : `${points.slice(0, max).join('').trimEnd()}…`;
}
```

In `backend/src/buddies/errors.ts`, after `invalid_note: 400,` add:

```ts
  invalid_message: 400,
  message_gone: 404,
  invalid_reaction: 400,
  card_unavailable: 409,
  invalid_status_note: 400,
  invalid_report: 400,
  report_target_gone: 404,
```

In `backend/src/lib/rateLimit.ts`, after `campNote: { name: 'camp_note', limit: 20, windowSeconds: 60 * 60 },` add:

```ts
  // Chats (spec 2026-10-07 social §9). Text and card messages spend both message buckets; stickers keep their own limit.
  message: { name: 'message', limit: 30, windowSeconds: 60 },
  messageDay: { name: 'message_day', limit: 500, windowSeconds: 24 * 60 * 60 },
  statusNote: { name: 'status_note', limit: 20, windowSeconds: 60 * 60 },
  reaction: { name: 'reaction', limit: 60, windowSeconds: 60 },
  report: { name: 'report', limit: 20, windowSeconds: 60 * 60 },
```

In `mobile/src/lib/buddyCopy.ts`, in `ERRORS`, after `invalid_note: 'Notes are 1 to 40 characters.',` add:

```ts
  invalid_message: 'Messages are 1 to 1,000 characters.',
  message_gone: 'That message is no longer there.',
  invalid_reaction: "That reaction isn't available.",
  card_unavailable: "That can't be shared anymore.",
  invalid_status_note: 'Notes are 1 to 60 characters.',
  invalid_report: 'Pick a reason to report.',
  report_target_gone: "That's no longer there to report.",
```

- [ ] **Step 4: Run the tests**

Run: `bash .superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh tests/chats/text.test.ts tests/lib/rateLimit.test.ts`
Expected: PASS.
Run (from `mobile/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/lib/buddyCopy.test.ts`
Expected: PASS (every server code has its own words).

- [ ] **Step 5: Commit**

```bash
git add backend/src/chats/text.ts backend/src/buddies/errors.ts backend/src/lib/rateLimit.ts backend/tests/chats/text.test.ts backend/tests/lib/rateLimit.test.ts mobile/src/lib/buddyCopy.ts
git commit -m "feat(chats): message and note text rules, error codes and rate limits"
```

---

### Task 4: Sending text and stickers — the conversation and the one message writer

**Files:**
- Create: `backend/src/chats/types.ts`, `backend/src/chats/conversations.ts`, `backend/src/chats/messages.ts`,
  `backend/src/chats/routes.ts`
- Modify: `backend/src/app.ts`, `backend/src/buddies/stickers.ts`, `backend/src/buddies/routes.ts`
- Test: create `backend/tests/chats/send.test.ts`

**Interfaces:**
- Consumes: `checkMessageText`, `previewText` (Task 3); `RATE_LIMITS.message`, `.messageDay`; `limitOrThrow`,
  `BuddyError`, `UUID_RE`; `findPair`, `isBlockedEitherWay`, `orderedPair`, `PairDeps` (`buddies/pairs.ts`);
  `PERSON_SELECT`, `PersonDTO`; `requireBuddyId` (`buddies/relations.ts`); `sendSticker` (changed here).
- Produces:
  - `types.ts`: `CardDTO`, `CardType`, `CARD_TYPES`, `ReplyPreviewDTO`, `ReactionDTO`, `MessageDTO`, `ThreadDTO`,
    `cardTypeOf(card: unknown): CardType | null`.
  - `conversations.ts`: `CHAT_PERSON_SELECT`, `type ChatPerson`, `requireChatPeople(viewerId, buddyId):
    Promise<{ viewer: ChatPerson; buddy: ChatPerson }>`, `requireLivePairTx(tx, senderId, recipientId, now)`,
    `findConversationId(a, b, db?): Promise<string | null>`, `moveRead(db, conversationId, readerId, at)`,
    `interface NewMessage`, `writeMessageTx(tx, m: NewMessage): Promise<string>`.
  - `messages.ts`: `MESSAGE_SELECT`, `toMessageDTO(row, viewerId): MessageDTO`,
    `loadMessageDTO(id, viewerId): Promise<MessageDTO>`, `sendMessage(senderId, buddyId, body: unknown, now, deps?):
    Promise<MessageDTO>`.
  - `routes.ts`: `chatsRouter` with `POST /me/chats/:buddyId/messages` → 201 `{ message: MessageDTO }`.
  - `sendSticker(fromId, toId, kind, now, deps?, opts?: { replyToMessageId?: string | null }):
    Promise<{ id: string; messageId: string }>` — every sticker send also writes a STICKER message; the Buddies
    sticker route still answers `{ id }`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/chats/send.test.ts`:

```ts
import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import * as rateLimit from '../../src/lib/rateLimit';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { orderedPair } from '../../src/buddies/pairs';
import { setBuddyNotifyQueue } from '../../src/buddies/notifyQueue';
import { blockBuddy } from '../../src/buddies/relations';
import { sendMessage } from '../../src/chats/messages';
import { RecordingQueue, api, buddyUser, pairUp } from '../buddies/helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});
let queue: RecordingQueue;
beforeEach(() => {
  queue = new RecordingQueue();
  setBuddyNotifyQueue(queue);
});
afterEach(() => {
  setBuddyNotifyQueue(null);
  jest.restoreAllMocks();
});

const NOW = new Date('2026-10-08T18:00:00Z');
// Built at run time so no editor or tool can turn the lone surrogate into other bytes.
const LONE_SURROGATE = String.fromCharCode(0xd800);

async function buddies() {
  const me = await buddyUser({ displayName: 'Ana' });
  const sam = await buddyUser({ displayName: 'Sam' });
  await pairUp(me.id, sam.id, new Date('2026-10-01T00:00:00Z'));
  return { me, sam };
}
const post = async (from: string, to: string, body: object) => (await api()).post(`/me/chats/${to}/messages`).set(await authHeaderFor(from)).send(body);

it("sends a text: one ordered conversation made on first use, the message, the bumped pair and the sender's read", async () => {
  const { me, sam } = await buddies();
  const first = await sendMessage(me.id, sam.id, { kind: 'TEXT', text: '  early night tonight?  ' }, NOW);
  expect(first).toEqual({ id: expect.any(String), mine: true, kind: 'TEXT', text: 'early night tonight?', sticker: null, card: null, replyTo: null, reactions: [], createdAt: NOW.toISOString() });
  const later = new Date(NOW.getTime() + 60_000);
  await sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'rough night lol' }, later);
  const conversations = await prisma.conversation.findMany({ where: orderedPair(me.id, sam.id) });
  expect(conversations).toHaveLength(1);
  expect(conversations[0]!.lastMessageAt.toISOString()).toBe(later.toISOString());
  expect(await prisma.message.count({ where: { conversationId: conversations[0]!.id } })).toBe(2);
  const pair = await prisma.buddyPair.findUniqueOrThrow({ where: { userAId_userBId: orderedPair(me.id, sam.id) } });
  expect(pair.lastActivityAt.toISOString()).toBe(later.toISOString());
  const reads = await prisma.conversationRead.findMany({ where: { conversationId: conversations[0]!.id }, orderBy: { lastReadAt: 'asc' }, select: { readerId: true, lastReadAt: true } });
  expect(reads).toEqual([{ readerId: me.id, lastReadAt: NOW }, { readerId: sam.id, lastReadAt: later }]);
});

it('two first messages at once make one conversation', async () => {
  const { me, sam } = await buddies();
  await Promise.all([sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'a' }, NOW), sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'b' }, NOW)]);
  expect(await prisma.conversation.count({ where: orderedPair(me.id, sam.id) })).toBe(1);
  expect(await prisma.message.count({ where: { conversation: orderedPair(me.id, sam.id) } })).toBe(2);
});

it('refuses an invalid text before the limiter, and stores nothing', async () => {
  const { me, sam } = await buddies();
  const spy = jest.spyOn(rateLimit, 'consumeRateLimit');
  const bodies = [
    { kind: 'TEXT', text: '   ' }, { kind: 'TEXT', text: 'x'.repeat(1001) }, { kind: 'TEXT' }, { kind: 'TEXT', text: 42 },
    { kind: 'TEXT', text: `hi${LONE_SURROGATE}` }, { kind: 'VOICE', text: 'hi' }, {}, ['TEXT'],
  ];
  for (const body of bodies) {
    const res = await post(me.id, sam.id, body);
    expect([body, res.status, res.body]).toEqual([body, 400, { error: 'invalid_message' }]);
  }
  expect(spy).not.toHaveBeenCalled();
  expect(await prisma.message.count({ where: { senderId: me.id } })).toBe(0);
});

it('answers not_buddies (403) for a stranger, oneself, a malformed id and across a block, storing nothing', async () => {
  const { me, sam } = await buddies();
  const stranger = await buddyUser();
  for (const to of [stranger.id, me.id, 'not-a-uuid']) {
    const res = await post(me.id, to, { kind: 'TEXT', text: 'hi' });
    expect([to, res.status, res.body]).toEqual([to, 403, { error: 'not_buddies' }]);
  }
  await blockBuddy(sam.id, me.id, NOW);
  expect((await post(me.id, sam.id, { kind: 'TEXT', text: 'hi' })).body).toEqual({ error: 'not_buddies' });
  expect(await prisma.message.count({ where: { senderId: me.id } })).toBe(0);
  expect(await prisma.conversation.count({ where: orderedPair(me.id, sam.id) })).toBe(0);
});

it('spends the 30-a-minute and 500-a-day buckets on a text, failing closed', async () => {
  const { me, sam } = await buddies();
  const spy = jest.spyOn(rateLimit, 'consumeRateLimit')
    .mockResolvedValueOnce('limited')
    .mockResolvedValueOnce('unavailable')
    .mockResolvedValueOnce('ok')
    .mockResolvedValueOnce('limited');
  await expect(sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'a' }, NOW)).rejects.toMatchObject({ code: 'rate_limited' });
  await expect(sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'b' }, NOW)).rejects.toMatchObject({ code: 'try_later' });
  await expect(sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'c' }, NOW)).rejects.toMatchObject({ code: 'rate_limited' });
  expect(spy.mock.calls.map(([limit]) => limit.name)).toEqual(['message', 'message', 'message', 'message_day']);
  expect(await prisma.message.count({ where: { senderId: me.id } })).toBe(0);
});

it('the 31st text in a minute is rate_limited', async () => {
  const { me, sam } = await buddies();
  // One fixed clock for every call: all 31 land in the same window.
  jest.spyOn(Date, 'now').mockReturnValue(Date.now());
  for (let i = 0; i < 30; i++) await sendMessage(me.id, sam.id, { kind: 'TEXT', text: `m${i}` }, NOW);
  await expect(sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'one more' }, NOW)).rejects.toMatchObject({ code: 'rate_limited' });
});

it('a sticker through the chat writes the Buddies sticker, its Activity row and a STICKER message, with one buddy_sticker job', async () => {
  const { me, sam } = await buddies();
  const message = await sendMessage(me.id, sam.id, { kind: 'STICKER', sticker: 'HEART' }, NOW);
  expect(message).toMatchObject({ mine: true, kind: 'STICKER', sticker: 'HEART', text: null, card: null });
  const sticker = await prisma.sticker.findFirstOrThrow({ where: { fromUserId: me.id, toUserId: sam.id } });
  expect(sticker.kind).toBe('HEART');
  expect(await prisma.buddyActivity.count({ where: { recipientId: sam.id, actorId: me.id, kind: 'STICKER', refId: sticker.id } })).toBe(1);
  expect(queue.jobs.map((j) => j.data.kind)).toEqual(['buddy_sticker']);
  expect((await post(me.id, sam.id, { kind: 'STICKER', sticker: 'KISS' })).body).toEqual({ error: 'invalid_sticker' });
});

it("every sticker send lands in the thread, the Buddies route's too; the sixth of the day is sticker_limit", async () => {
  const { me, sam } = await buddies();
  const res = await (await api()).post(`/me/buddies/${sam.id}/stickers`).set(await authHeaderFor(me.id)).send({ kind: 'STAR' });
  expect([res.status, Object.keys(res.body)]).toEqual([201, ['id']]);
  for (let i = 0; i < 4; i++) await sendMessage(me.id, sam.id, { kind: 'STICKER', sticker: 'CHEER' }, new Date());
  await expect(sendMessage(me.id, sam.id, { kind: 'STICKER', sticker: 'CHEER' }, new Date())).rejects.toMatchObject({ code: 'sticker_limit' });
  expect(await prisma.message.count({ where: { senderId: me.id, kind: 'STICKER' } })).toBe(5);
});

it('a reply names a live message of the same conversation; anything else is message_gone and stores nothing', async () => {
  const { me, sam } = await buddies();
  const ben = await buddyUser();
  await pairUp(me.id, ben.id);
  const original = await sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'rough night lol' }, NOW);
  const elsewhere = await sendMessage(ben.id, me.id, { kind: 'TEXT', text: 'hey' }, NOW);
  const reply = await sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'oh no', replyToMessageId: original.id }, NOW);
  expect(reply.replyTo).toEqual({ id: original.id, gone: false, mine: false, kind: 'TEXT', text: 'rough night lol', sticker: null, cardType: null });
  const sticker = await sendMessage(me.id, sam.id, { kind: 'STICKER', sticker: 'REST_UP', replyToMessageId: original.id }, NOW);
  expect(sticker.replyTo).toMatchObject({ id: original.id, gone: false });
  const before = await prisma.message.count({ where: { senderId: me.id } });
  for (const replyToMessageId of [elsewhere.id, '00000000-0000-4000-8000-000000000000', 'nope', 7]) {
    await expect(sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'x', replyToMessageId }, NOW)).rejects.toMatchObject({ code: 'message_gone' });
  }
  await expect(sendMessage(me.id, sam.id, { kind: 'STICKER', sticker: 'STAR', replyToMessageId: elsewhere.id }, NOW)).rejects.toMatchObject({ code: 'message_gone' });
  expect(await prisma.message.count({ where: { senderId: me.id } })).toBe(before);
  expect(await prisma.sticker.count({ where: { fromUserId: me.id, kind: 'STAR' } })).toBe(0);
});

it('route: 201 { message }, and auth is required', async () => {
  const { me, sam } = await buddies();
  const res = await post(me.id, sam.id, { kind: 'TEXT', text: 'hi' });
  expect([res.status, res.body.message.text, res.body.message.mine]).toEqual([201, 'hi', true]);
  expect((await (await api()).post(`/me/chats/${sam.id}/messages`).send({ kind: 'TEXT', text: 'hi' })).status).toBe(401);
});

// Tripwire only: it sees console calls on this path in this process. The real check is the backend-wide grep (Task 19).
it('never logs the text (tripwire)', async () => {
  const { me, sam } = await buddies();
  const spies = (['log', 'info', 'warn', 'error'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
  await sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'secret chat words' }, NOW);
  await expect(sendMessage(me.id, sam.id, { kind: 'TEXT', text: `secret chat words ${'x'.repeat(1000)}` }, NOW)).rejects.toMatchObject({ code: 'invalid_message' });
  for (const spy of spies) for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain('secret chat');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bash .superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh tests/chats/send.test.ts`
Expected: FAIL — "Cannot find module '../../src/chats/messages'".

- [ ] **Step 3: Write the DTO types**

Create `backend/src/chats/types.ts`:

```ts
// Chat DTOs (spec 2026-10-07 social §8). Mirrored exactly by mobile/src/api/chats.ts.

import type { AchievementFamily, CheckInMood, MessageKind, StickerKind } from '@prisma/client';
import type { PersonDTO } from '../buddies/people';

/** A quoted item's snapshot, built by the server (cards.ts) and stored as Message.card. */
export type CardDTO =
  // `about`: whose check-in — mine shared with "+" (sender), or theirs replied to from their story (recipient; no mood
  // when it was locked for me).
  | { type: 'checkin'; about: 'sender' | 'recipient'; localDate: string; mood: CheckInMood | null }
  | { type: 'badge'; family: AchievementFamily; level: number }
  | { type: 'recap'; recapKind: 'WEEK' | 'MONTH'; periodStart: string; periodEnd: string; line: string }
  | { type: 'goodnight'; onTime: boolean }
  | { type: 'note'; text: string }
  | { type: 'camp_note'; text: string };

export type CardType = CardDTO['type'];
export const CARD_TYPES: readonly CardType[] = ['checkin', 'badge', 'recap', 'goodnight', 'note', 'camp_note'];

/** The message a reply quotes: one line of it, or `gone` once it was unsent. */
export type ReplyPreviewDTO =
  | { id: string; gone: true }
  | { id: string; gone: false; mine: boolean; kind: MessageKind; text: string | null; sticker: StickerKind | null; cardType: CardType | null };

export interface ReactionDTO { kind: StickerKind; mine: boolean }

export interface MessageDTO {
  id: string;
  mine: boolean;
  kind: MessageKind;
  /** TEXT's text, or a CARD's reply. User free text. */
  text: string | null;
  sticker: StickerKind | null;
  card: CardDTO | null;
  replyTo: ReplyPreviewDTO | null;
  reactions: ReactionDTO[];
  createdAt: string;
}

export interface ThreadDTO {
  buddy: PersonDTO;
  /** Oldest first: one page. */
  messages: MessageDTO[];
  /** The cursor for the page before this one, or null at the start of the conversation. */
  nextBefore: string | null;
  /** When the buddy last read this conversation; only while both have read receipts on. */
  seenAt: string | null;
  /** When the buddy was last active (within 24 h); only while both show activity status. */
  activeAt: string | null;
}

/** A stored card's type, or null for anything this server never writes. */
export function cardTypeOf(card: unknown): CardType | null {
  const type = (card as { type?: unknown } | null)?.type;
  return (CARD_TYPES as readonly unknown[]).includes(type) ? (type as CardType) : null;
}
```

- [ ] **Step 4: Write the conversation and the message writer**

Create `backend/src/chats/conversations.ts`:

```ts
// The pair's conversation (spec 2026-10-07 social §8.2): stored once with userAId < userBId (like BuddyPair), made by
// the first message. writeMessageTx is the ONLY writer of messages — chat sends and every sticker send
// (buddies/stickers.ts) — and runs inside the caller's transaction after its pair check: that check updates the pair
// row (locking it), so an unpair or block waits for the send and then deletes the conversation, new message included
// (relations.ts). Message text is user free text: nothing here logs.

import type { MessageKind, Prisma, PrismaClient, StickerKind } from '@prisma/client';
import { prisma } from '../db/client';
import { BuddyError } from '../buddies/errors';
import { findPair, isBlockedEitherWay, orderedPair } from '../buddies/pairs';
import { PERSON_SELECT } from '../buddies/people';
import type { CardDTO } from './types';

type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaClient;

/** A chat route's view of a person: who they are, and the settings the reciprocal rules read. */
export const CHAT_PERSON_SELECT = { ...PERSON_SELECT, chatReadReceipts: true, chatActivityStatus: true, lastActiveAt: true } as const;
export type ChatPerson = Prisma.UserGetPayload<{ select: typeof CHAT_PERSON_SELECT }>;

/**
 * Both people of a chat route, or not_buddies: no pair, a block either way, or a missing account. The same three reads
 * run every time, so a block costs no extra work.
 */
export async function requireChatPeople(viewerId: string, buddyId: string): Promise<{ viewer: ChatPerson; buddy: ChatPerson }> {
  const [pair, blocked, users] = await Promise.all([
    findPair(viewerId, buddyId),
    isBlockedEitherWay(viewerId, buddyId),
    prisma.user.findMany({ where: { id: { in: [viewerId, buddyId] } }, select: CHAT_PERSON_SELECT }),
  ]);
  const viewer = users.find((u) => u.id === viewerId);
  const buddy = users.find((u) => u.id === buddyId);
  if (!pair || blocked || !viewer || !buddy) throw new BuddyError('not_buddies');
  return { viewer, buddy };
}

/** Inside a send's transaction: no pair, or a block either way, is not_buddies. Bumps (and locks) the pair row. */
export async function requireLivePairTx(tx: Tx, senderId: string, recipientId: string, now: Date): Promise<void> {
  const blocked = await isBlockedEitherWay(senderId, recipientId, tx);
  const bumped = await tx.buddyPair.updateMany({ where: orderedPair(senderId, recipientId), data: { lastActivityAt: now } });
  if (bumped.count === 0 || blocked) throw new BuddyError('not_buddies');
}

export async function findConversationId(a: string, b: string, db: Db = prisma): Promise<string | null> {
  const row = await db.conversation.findUnique({ where: { userAId_userBId: orderedPair(a, b) }, select: { id: true } });
  return row?.id ?? null;
}

/** Moves a reader's lastReadAt forward, never back; safe when two calls race. */
export async function moveRead(db: Db, conversationId: string, readerId: string, at: Date): Promise<void> {
  const created = await db.conversationRead.createMany({ data: [{ conversationId, readerId, lastReadAt: at }], skipDuplicates: true });
  if (created.count > 0) return;
  await db.conversationRead.updateMany({ where: { conversationId, readerId, lastReadAt: { lt: at } }, data: { lastReadAt: at } });
}

export interface NewMessage {
  senderId: string;
  recipientId: string;
  kind: MessageKind;
  text?: string | null;
  sticker?: StickerKind | null;
  card?: CardDTO | null;
  replyToMessageId?: string | null;
  now: Date;
}

/**
 * Inside the caller's transaction, after its pair check: the pair's conversation (made on first use; a concurrent
 * first message waits on the insert), its lastMessageAt bumped, the reply target checked (a live message of this
 * conversation, else message_gone), the message stored, and the sender's own read moved to it. Returns the id.
 */
export async function writeMessageTx(tx: Tx, m: NewMessage): Promise<string> {
  const pair = orderedPair(m.senderId, m.recipientId);
  await tx.conversation.createMany({ data: [{ ...pair, createdAt: m.now, lastMessageAt: m.now }], skipDuplicates: true });
  const conversation = await tx.conversation.update({ where: { userAId_userBId: pair }, data: { lastMessageAt: m.now }, select: { id: true } });
  if (m.replyToMessageId) {
    const target = await tx.message.findFirst({ where: { id: m.replyToMessageId, conversationId: conversation.id, deletedAt: null }, select: { id: true } });
    if (!target) throw new BuddyError('message_gone');
  }
  const message = await tx.message.create({
    data: {
      conversationId: conversation.id,
      senderId: m.senderId,
      kind: m.kind,
      text: m.text ?? null,
      sticker: m.sticker ?? null,
      ...(m.card ? { card: m.card as unknown as Prisma.InputJsonValue } : {}),
      replyToMessageId: m.replyToMessageId ?? null,
      createdAt: m.now,
    },
    select: { id: true },
  });
  await moveRead(tx, conversation.id, m.senderId, m.now);
  return message.id;
}
```

- [ ] **Step 5: Every sticker send writes a STICKER message**

In `backend/src/buddies/stickers.ts`:

Replace the header's last two lines
(`// nothing about the other person. The pair update, the sticker insert and the STICKER Activity row` and
`// share a transaction: a sticker sent while the pair is being removed is dropped (not_buddies).`) with:

```ts
// nothing about the other person. The pair update, the sticker insert, the STICKER Activity row and (S3) the STICKER
// message in the pair's conversation share a transaction: a sticker sent while the pair is being removed is dropped
// (not_buddies). Every sticker send — the thread, the timeline, a buddy's week, a story reply, the inbox's quick
// sticker — lands in the thread this way (spec 2026-10-07 social §8.2); its push stays buddy_sticker, never also a
// dm_message.
```

Add `import { writeMessageTx } from '../chats/conversations';` after the `../biometrics/civilDate` import, and replace
the whole `sendSticker` function with:

```ts
export async function sendSticker(
  fromId: string,
  toId: string,
  kind: unknown,
  now: Date,
  deps: PairDeps = {},
  opts: { replyToMessageId?: string | null } = {},
): Promise<{ id: string; messageId: string }> {
  if (!(STICKER_KINDS as readonly unknown[]).includes(kind)) throw new BuddyError('invalid_sticker');
  const me = await prisma.user.findUnique({ where: { id: fromId }, select: { timezone: true, displayName: true, handle: true } });
  if (!me) throw new BuddyError('not_buddies');
  const today = localCivilDateOrUtc(now, me.timezone);
  const recent = await prisma.sticker.findMany({
    where: { fromUserId: fromId, toUserId: toId, sentAt: { gt: new Date(now.getTime() - TWO_DAYS_MS) } },
    select: { sentAt: true },
  });
  if (recent.filter((s) => localCivilDateOrUtc(s.sentAt, me.timezone) === today).length >= STICKERS_PER_BUDDY_PER_DAY) {
    throw new BuddyError('sticker_limit');
  }
  const ids = await prisma.$transaction(async (tx) => {
    // A block either way refuses like no pair (block removes the pair anyway; this covers a pair left
    // beside a block). Read every time, so a block costs no extra work.
    const blocked = await isBlockedEitherWay(fromId, toId, tx);
    const bumped = await tx.buddyPair.updateMany({ where: orderedPair(fromId, toId), data: { lastActivityAt: now } });
    if (bumped.count === 0 || blocked) throw new BuddyError('not_buddies');
    const sticker = await tx.sticker.create({ data: { fromUserId: fromId, toUserId: toId, kind: kind as StickerKind, sentAt: now }, select: { id: true } });
    await tx.buddyActivity.create({ data: { recipientId: toId, actorId: fromId, kind: 'STICKER', refId: sticker.id, createdAt: now } });
    const messageId = await writeMessageTx(tx, { senderId: fromId, recipientId: toId, kind: 'STICKER', sticker: kind as StickerKind, replyToMessageId: opts.replyToMessageId ?? null, now });
    return { id: sticker.id, messageId };
  });
  // Enqueued whether or not the buddy muted me: the job decides (Global Constraints).
  await enqueueBuddyNotice(
    { kind: 'buddy_sticker', recipientId: toId, actorId: fromId, refId: fromId, slots: { name: pushName(me), sticker: kind as StickerKind } },
    deps.notifyQueue ? { queue: deps.notifyQueue } : {},
  );
  return ids;
}
```

In `backend/src/buddies/routes.ts`, replace the sticker route's last line
`res.status(201).json(await sendSticker(req.userId!, buddyId, (req.body as { kind?: unknown } | undefined)?.kind, new Date()));`
with:

```ts
  const { id } = await sendSticker(req.userId!, buddyId, (req.body as { kind?: unknown } | undefined)?.kind, new Date());
  res.status(201).json({ id });
```

- [ ] **Step 6: Write sending**

Create `backend/src/chats/messages.ts`:

```ts
// Messages (spec 2026-10-07 social §8.2): TEXT, STICKER (through the Buddies sticker, so its 5-a-day limit, unseen
// flag and buddy_sticker push stay in one place) and CARD. Only buddies; every refusal for a non-buddy is not_buddies.
// The order is: the body's shape (invalid_* before the limiter, so a malformed body spends nothing), the limiter
// (before the pair, like stickers: it counts only the sender's own sends and reveals nothing), then one transaction
// that checks the pair and writes. Text is user free text: never logged, never sent to the coach.

import type { MessageKind, Prisma } from '@prisma/client';
import { prisma } from '../db/client';
import { BuddyError, UUID_RE, limitOrThrow } from '../buddies/errors';
import type { PairDeps } from '../buddies/pairs';
import { sendSticker } from '../buddies/stickers';
import { RATE_LIMITS } from '../lib/rateLimit';
import { requireLivePairTx, writeMessageTx } from './conversations';
import { checkMessageText, previewText } from './text';
import { cardTypeOf, type CardDTO, type MessageDTO } from './types';

export const MESSAGE_SELECT = {
  id: true,
  senderId: true,
  kind: true,
  text: true,
  sticker: true,
  card: true,
  createdAt: true,
  replyTo: { select: { id: true, senderId: true, kind: true, text: true, sticker: true, card: true, deletedAt: true } },
  reactions: { select: { reactorId: true, kind: true }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.MessageSelect;

export type MessageRow = Prisma.MessageGetPayload<{ select: typeof MESSAGE_SELECT }>;

export function toMessageDTO(row: MessageRow, viewerId: string): MessageDTO {
  const r = row.replyTo;
  return {
    id: row.id,
    mine: row.senderId === viewerId,
    kind: row.kind,
    text: row.text,
    sticker: row.sticker,
    card: (row.card as unknown as CardDTO | null) ?? null,
    replyTo: r === null
      ? null
      : r.deletedAt !== null
        ? { id: r.id, gone: true }
        : { id: r.id, gone: false, mine: r.senderId === viewerId, kind: r.kind, text: r.text === null ? null : previewText(r.text), sticker: r.sticker, cardType: cardTypeOf(r.card) },
    reactions: row.reactions.map((x) => ({ kind: x.kind, mine: x.reactorId === viewerId })),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function loadMessageDTO(id: string, viewerId: string): Promise<MessageDTO> {
  return toMessageDTO(await prisma.message.findUniqueOrThrow({ where: { id }, select: MESSAGE_SELECT }), viewerId);
}

/** Absent → null; anything but a uuid → message_gone (it can't name a message). */
function parseReplyTo(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string' || !UUID_RE.test(raw)) throw new BuddyError('message_gone');
  return raw;
}

/**
 * Body: { kind: 'TEXT', text } | { kind: 'STICKER', sticker } | { kind: 'CARD', card, text? }, each with an optional
 * replyToMessageId. Returns the stored message as the sender sees it.
 */
export async function sendMessage(senderId: string, buddyId: string, body: unknown, now: Date, deps: PairDeps = {}): Promise<MessageDTO> {
  const b = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const replyToMessageId = parseReplyTo(b.replyToMessageId);
  if (b.kind === 'STICKER') {
    const { messageId } = await sendSticker(senderId, buddyId, b.sticker, now, deps, { replyToMessageId });
    return loadMessageDTO(messageId, senderId);
  }
  if (b.kind !== 'TEXT') throw new BuddyError('invalid_message');
  const text = checkMessageText(b.text);
  if (text === null) throw new BuddyError('invalid_message');
  const card: CardDTO | null = null;
  await limitOrThrow(RATE_LIMITS.message, senderId);
  await limitOrThrow(RATE_LIMITS.messageDay, senderId);
  const messageId = await prisma.$transaction(async (tx) => {
    await requireLivePairTx(tx, senderId, buddyId, now);
    return writeMessageTx(tx, { senderId, recipientId: buddyId, kind: b.kind as MessageKind, text, card, replyToMessageId, now });
  });
  return loadMessageDTO(messageId, senderId);
}
```

- [ ] **Step 7: The route**

Create `backend/src/chats/routes.ts`:

```ts
// Chats routes (spec 2026-10-07 social §8.5). Every /me/chats/:buddyId… route answers not_buddies (403) for a
// non-buddy, a malformed id, oneself or across a block — never a bare 404 (a bare 404 means an older server). GETs are
// never cached. Logs carry ids and event names only; no body is ever logged.

import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { buddyRoute } from '../buddies/errors';
import { requireBuddyId } from '../buddies/relations';
import { sendMessage } from './messages';

export const chatsRouter = Router();

chatsRouter.post('/me/chats/:buddyId/messages', requireAuth, buddyRoute(async (req, res) => {
  const buddyId = requireBuddyId(String(req.params.buddyId), req.userId!);
  res.status(201).json({ message: await sendMessage(req.userId!, buddyId, req.body, new Date()) });
}));
```

In `backend/src/app.ts`, add `import { chatsRouter } from './chats/routes';` after the `socialRouter` import, and
`app.use(chatsRouter);` after `app.use(socialRouter);`.

- [ ] **Step 8: Run the tests**

Run: `bash .superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh tests/chats tests/buddies/stickers.test.ts tests/scripts/seedBuddies.test.ts`
Expected: PASS (`seedBuddies` reads only `.id` from `sendSticker`).

- [ ] **Step 9: Commit**

```bash
git add backend/src/chats backend/src/app.ts backend/src/buddies/stickers.ts backend/src/buddies/routes.ts backend/tests/chats/send.test.ts
git commit -m "feat(chats): send text and sticker messages; every sticker lands in the thread"
```

---

### Task 5: Cards — quoting a check-in, a story frame or a note

**Files:**
- Create: `backend/src/chats/cards.ts`
- Modify: `backend/src/chats/messages.ts` (the CARD kind)
- Test: create `backend/tests/chats/cards.test.ts`

**Interfaces:**
- Consumes: `getTodayCheckIn(userId, now)` (`social/checkins.ts`), `getStory(viewerId, authorId, now)`
  (`social/stories.ts`), `loadCircle`, `noteIsLive(note, circle, now)` (`social/campNotes.ts`), `findPair`;
  `CardDTO` (Task 4); `sendMessage` (Task 4).
- Produces: `type CardRequest = { type: 'my_checkin' } | { type: 'story_frame'; at: string } | { type: 'note' } |
  { type: 'camp_note' }`, `parseCardRequest(raw: unknown): CardRequest | null`,
  `buildCard(senderId, recipientId, req: CardRequest, now): Promise<CardDTO>`; `sendMessage` accepts
  `{ kind: 'CARD', card: CardRequest, text?: string, replyToMessageId? }`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/chats/cards.test.ts`:

```ts
import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { BUDDY_SHARING_CONSENT_VERSION } from '../../src/buddies/sharing';
import { setBuddyNotifyQueue } from '../../src/buddies/notifyQueue';
import { buildCard, parseCardRequest } from '../../src/chats/cards';
import { sendMessage } from '../../src/chats/messages';
import { shareCampNote } from '../../src/social/campNotes';
import { saveCheckIn } from '../../src/social/checkins';
import { RecordingQueue, buddyUser, pairUp } from '../buddies/helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});
beforeEach(() => setBuddyNotifyQueue(new RecordingQueue()));
afterEach(() => setBuddyNotifyQueue(null));

const NOW = new Date('2026-10-07T20:00:00Z'); // 20:00 for these UTC users
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const day = (d: string) => civilDateToUtcMidnight(d);
const sharesStreaks = { shareStreaks: true, buddySharingConsentVersion: BUDDY_SHARING_CONSENT_VERSION };

async function buddies() {
  const me = await buddyUser({ displayName: 'Ana' });
  const sam = await buddyUser({ displayName: 'Sam' });
  await pairUp(me.id, sam.id);
  return { me, sam };
}

it('reads only the four request shapes', () => {
  expect(parseCardRequest({ type: 'my_checkin' })).toEqual({ type: 'my_checkin' });
  expect(parseCardRequest({ type: 'note', extra: 1 })).toEqual({ type: 'note' });
  expect(parseCardRequest({ type: 'camp_note' })).toEqual({ type: 'camp_note' });
  expect(parseCardRequest({ type: 'story_frame', at: '2026-10-07T16:00:00.000Z' })).toEqual({ type: 'story_frame', at: '2026-10-07T16:00:00.000Z' });
  for (const bad of [null, 'note', ['note'], { type: 'story_frame' }, { type: 'story_frame', at: 5 }, { type: 'checkin', mood: 'RESTED' }, {}]) {
    expect(parseCardRequest(bad)).toBeNull();
  }
});

it('my check-in card holds my mood today; without a check-in it is card_unavailable', async () => {
  const { me, sam } = await buddies();
  await expect(buildCard(me.id, sam.id, { type: 'my_checkin' }, NOW)).rejects.toMatchObject({ code: 'card_unavailable' });
  await saveCheckIn(me.id, 'TIRED', hoursAgo(12));
  expect(await buildCard(me.id, sam.id, { type: 'my_checkin' }, NOW)).toEqual({ type: 'checkin', about: 'sender', localDate: '2026-10-07', mood: 'TIRED' });
});

it("a reply to their check-in frame keeps no mood while it is locked for me, and the mood once I've checked in", async () => {
  const { me, sam } = await buddies();
  await saveCheckIn(sam.id, 'RESTED', hoursAgo(4));
  const at = hoursAgo(4).toISOString();
  expect(await buildCard(me.id, sam.id, { type: 'story_frame', at }, NOW)).toEqual({ type: 'checkin', about: 'recipient', localDate: '2026-10-07', mood: null });
  await saveCheckIn(me.id, 'OKAY', hoursAgo(3));
  expect(await buildCard(me.id, sam.id, { type: 'story_frame', at }, NOW)).toEqual({ type: 'checkin', about: 'recipient', localDate: '2026-10-07', mood: 'RESTED' });
  await expect(buildCard(me.id, sam.id, { type: 'story_frame', at: hoursAgo(1).toISOString() }, NOW)).rejects.toMatchObject({ code: 'card_unavailable' });
});

it('a badge frame is quoted only while its author shares streaks; a goodnight frame keeps its on-time flag', async () => {
  const { me, sam } = await buddies();
  await prisma.user.update({ where: { id: sam.id }, data: sharesStreaks });
  const badgeAt = hoursAgo(2);
  await prisma.achievement.create({
    data: { userId: sam.id, family: 'SLEEP_GOAL', level: 2, value: 7, earnedOn: day('2026-10-07'), weekStart: day('2026-10-05'), monthStart: day('2026-10-01'), createdAt: badgeAt },
  });
  expect(await buildCard(me.id, sam.id, { type: 'story_frame', at: badgeAt.toISOString() }, NOW)).toEqual({ type: 'badge', family: 'SLEEP_GOAL', level: 2 });
  await prisma.user.update({ where: { id: sam.id }, data: { shareStreaks: false } });
  await expect(buildCard(me.id, sam.id, { type: 'story_frame', at: badgeAt.toISOString() }, NOW)).rejects.toMatchObject({ code: 'card_unavailable' });
  const goodnightAt = hoursAgo(1);
  await prisma.goodnight.create({ data: { authorId: sam.id, localDate: day('2026-10-07'), at: goodnightAt, onTime: true } });
  expect(await buildCard(me.id, sam.id, { type: 'story_frame', at: goodnightAt.toISOString() }, NOW)).toEqual({ type: 'goodnight', onTime: true });
});

it("quotes their live Chats note and their live camp note; an expired or cleared one is card_unavailable", async () => {
  const { me, sam } = await buddies();
  await expect(buildCard(me.id, sam.id, { type: 'note' }, NOW)).rejects.toMatchObject({ code: 'card_unavailable' });
  await prisma.statusNote.create({ data: { authorId: sam.id, text: 'early night tonight', createdAt: hoursAgo(1), expiresAt: new Date(NOW.getTime() + 3_600_000) } });
  expect(await buildCard(me.id, sam.id, { type: 'note' }, NOW)).toEqual({ type: 'note', text: 'early night tonight' });
  await expect(buildCard(me.id, sam.id, { type: 'note' }, new Date(NOW.getTime() + 2 * 3_600_000))).rejects.toMatchObject({ code: 'card_unavailable' });
  await shareCampNote(sam.id, 'bed soon', hoursAgo(1));
  expect(await buildCard(me.id, sam.id, { type: 'camp_note' }, NOW)).toEqual({ type: 'camp_note', text: 'bed soon' });
  await saveCheckIn(sam.id, 'RESTED', NOW); // a check-in after the note clears it
  await expect(buildCard(me.id, sam.id, { type: 'camp_note' }, NOW)).rejects.toMatchObject({ code: 'card_unavailable' });
});

it("never quotes a stranger's anything: not_buddies", async () => {
  const me = await buddyUser();
  const stranger = await buddyUser();
  await prisma.statusNote.create({ data: { authorId: stranger.id, text: 'hello world', expiresAt: new Date(NOW.getTime() + 3_600_000) } });
  await shareCampNote(stranger.id, 'bed soon', hoursAgo(1));
  await saveCheckIn(stranger.id, 'RESTED', hoursAgo(4));
  for (const req of [{ type: 'note' as const }, { type: 'camp_note' as const }, { type: 'story_frame' as const, at: hoursAgo(4).toISOString() }]) {
    await expect(buildCard(me.id, stranger.id, req, NOW)).rejects.toMatchObject({ code: 'not_buddies' });
  }
});

it('sends a CARD, with or without a reply text; a bad card or a blank text is invalid_message', async () => {
  const { me, sam } = await buddies();
  await saveCheckIn(me.id, 'RESTED', hoursAgo(12));
  const plain = await sendMessage(me.id, sam.id, { kind: 'CARD', card: { type: 'my_checkin' } }, NOW);
  expect(plain).toMatchObject({ kind: 'CARD', text: null, card: { type: 'checkin', about: 'sender', mood: 'RESTED' } });
  await prisma.statusNote.create({ data: { authorId: sam.id, text: 'early night tonight', expiresAt: new Date(NOW.getTime() + 3_600_000) } });
  const reply = await sendMessage(me.id, sam.id, { kind: 'CARD', card: { type: 'note' }, text: ' same here ' }, NOW);
  expect(reply).toMatchObject({ kind: 'CARD', text: 'same here', card: { type: 'note', text: 'early night tonight' } });
  for (const body of [{ kind: 'CARD' }, { kind: 'CARD', card: { type: 'checkin', mood: 'TIRED' } }, { kind: 'CARD', card: { type: 'note' }, text: '   ' }]) {
    await expect(sendMessage(me.id, sam.id, body, NOW)).rejects.toMatchObject({ code: 'invalid_message' });
  }
  const stored = await prisma.message.findUniqueOrThrow({ where: { id: plain.id } });
  expect(stored.card).toEqual({ type: 'checkin', about: 'sender', localDate: '2026-10-07', mood: 'RESTED' });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bash .superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh tests/chats/cards.test.ts`
Expected: FAIL — "Cannot find module '../../src/chats/cards'".

- [ ] **Step 3: Write the card builder**

Create `backend/src/chats/cards.ts`:

```ts
// CARD messages (spec 2026-10-07 social §8.2, §8.3): a quoted item. The app only names it; the SERVER builds the
// snapshot from what the sender can see right now, so a card never holds more than the recipient could already see:
// my own check-in today (the thread's "+"), a frame of the recipient's story today exactly as getStory shows it to me
// (a check-in still locked for me has no mood; a badge frame exists only while its author shares streaks; a recap
// frame carries the line they shared), or the recipient's live Chats note or camp note. Anything gone is
// card_unavailable; a stranger is not_buddies. Note text in a card is user free text: never logged.

import { prisma } from '../db/client';
import { BuddyError } from '../buddies/errors';
import { findPair } from '../buddies/pairs';
import { noteIsLive } from '../social/campNotes';
import { getTodayCheckIn } from '../social/checkins';
import { loadCircle } from '../social/circle';
import { getStory } from '../social/stories';
import type { CardDTO } from './types';

export type CardRequest = { type: 'my_checkin' } | { type: 'story_frame'; at: string } | { type: 'note' } | { type: 'camp_note' };

/** The request's shape, or null (the caller answers invalid_message). Extra fields are ignored. */
export function parseCardRequest(raw: unknown): CardRequest | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.type === 'my_checkin') return { type: 'my_checkin' };
  if (r.type === 'note') return { type: 'note' };
  if (r.type === 'camp_note') return { type: 'camp_note' };
  if (r.type === 'story_frame' && typeof r.at === 'string' && r.at.length <= 40) return { type: 'story_frame', at: r.at };
  return null;
}

export async function buildCard(senderId: string, recipientId: string, req: CardRequest, now: Date): Promise<CardDTO> {
  switch (req.type) {
    case 'my_checkin': {
      const mine = await getTodayCheckIn(senderId, now);
      if (!mine) throw new BuddyError('card_unavailable');
      return { type: 'checkin', about: 'sender', localDate: mine.localDate, mood: mine.mood };
    }
    case 'story_frame': {
      // getStory answers not_buddies for anyone but a current buddy, and applies every gate a viewer gets.
      const story = await getStory(senderId, recipientId, now);
      const frame = story.frames.find((f) => f.at === req.at);
      if (!frame) throw new BuddyError('card_unavailable');
      switch (frame.kind) {
        case 'checkin':
          return { type: 'checkin', about: 'recipient', localDate: story.localDate, mood: frame.locked ? null : frame.mood };
        case 'badge':
          return { type: 'badge', family: frame.family, level: frame.level };
        case 'recap':
          return { type: 'recap', recapKind: frame.recapKind, periodStart: frame.periodStart, periodEnd: frame.periodEnd, line: frame.line };
        case 'goodnight':
          return { type: 'goodnight', onTime: frame.onTime };
      }
      throw new BuddyError('card_unavailable');
    }
    case 'note': {
      if (!(await findPair(senderId, recipientId))) throw new BuddyError('not_buddies');
      const note = await prisma.statusNote.findFirst({ where: { authorId: recipientId, expiresAt: { gt: now } }, select: { text: true } });
      if (!note) throw new BuddyError('card_unavailable');
      return { type: 'note', text: note.text };
    }
    case 'camp_note': {
      const circle = await loadCircle(senderId, now);
      if (recipientId === senderId || !circle.members.has(recipientId)) throw new BuddyError('not_buddies');
      const note = await prisma.campNote.findUnique({ where: { authorId: recipientId }, select: { authorId: true, text: true, createdAt: true, expiresAt: true } });
      if (!note || !noteIsLive(note, circle, now)) throw new BuddyError('card_unavailable');
      return { type: 'camp_note', text: note.text };
    }
  }
}
```

- [ ] **Step 4: Accept the CARD kind**

In `backend/src/chats/messages.ts`, add `import { buildCard, parseCardRequest, type CardRequest } from './cards';`
after the `./conversations` import, and replace

```ts
  if (b.kind !== 'TEXT') throw new BuddyError('invalid_message');
  const text = checkMessageText(b.text);
  if (text === null) throw new BuddyError('invalid_message');
  const card: CardDTO | null = null;
  await limitOrThrow(RATE_LIMITS.message, senderId);
  await limitOrThrow(RATE_LIMITS.messageDay, senderId);
  const messageId = await prisma.$transaction(async (tx) => {
    await requireLivePairTx(tx, senderId, buddyId, now);
    return writeMessageTx(tx, { senderId, recipientId: buddyId, kind: b.kind as MessageKind, text, card, replyToMessageId, now });
  });
```

with

```ts
  let kind: MessageKind;
  let text: string | null;
  let cardRequest: CardRequest | null = null;
  if (b.kind === 'TEXT') {
    kind = 'TEXT';
    text = checkMessageText(b.text);
    if (text === null) throw new BuddyError('invalid_message');
  } else if (b.kind === 'CARD') {
    kind = 'CARD';
    cardRequest = parseCardRequest(b.card);
    // A card's reply text is optional; when sent it must be valid (whitespace only is refused: the app sends none).
    const hasText = b.text !== undefined && b.text !== null;
    text = hasText ? checkMessageText(b.text) : null;
    if (cardRequest === null || (hasText && text === null)) throw new BuddyError('invalid_message');
  } else {
    throw new BuddyError('invalid_message');
  }
  await limitOrThrow(RATE_LIMITS.message, senderId);
  await limitOrThrow(RATE_LIMITS.messageDay, senderId);
  // After the limiter (probing spends a token) and before the transaction (it only reads; the tx re-checks the pair).
  const card: CardDTO | null = cardRequest ? await buildCard(senderId, buddyId, cardRequest, now) : null;
  const messageId = await prisma.$transaction(async (tx) => {
    await requireLivePairTx(tx, senderId, buddyId, now);
    return writeMessageTx(tx, { senderId, recipientId: buddyId, kind, text, card, replyToMessageId, now });
  });
```

- [ ] **Step 5: Run the tests**

Run: `bash .superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh tests/chats`
Expected: PASS (`send.test.ts`'s `{ kind: 'VOICE' }` and `{}` bodies are still `invalid_message`).

- [ ] **Step 6: Commit**

```bash
git add backend/src/chats/cards.ts backend/src/chats/messages.ts backend/tests/chats/cards.test.ts
git commit -m "feat(chats): card messages quote a check-in, a story frame or a note, built by the server"
```

---

### Task 6: Reading a thread — paging, "Seen", activity status and the chat privacy settings

**Files:**
- Create: `backend/src/chats/presence.ts`
- Modify: `backend/src/chats/messages.ts` (`listThread`, `markRead`; `sendMessage` touches presence),
  `backend/src/chats/routes.ts`, `backend/src/buddies/cursor.ts`
- Test: create `backend/tests/chats/thread.test.ts`

**Interfaces:**
- Consumes: `requireChatPeople`, `findConversationId`, `moveRead`, `ChatPerson` (Task 4); `MESSAGE_SELECT`,
  `toMessageDTO` (Task 4); `parseCursor`, `encodeCursor`, `keysetBefore` (`buddies/cursor.ts`); `toPerson`.
- Produces:
  - `presence.ts`: `PRESENCE_TOUCH_MS = 60_000`, `ACTIVE_WINDOW_MS = 86_400_000`,
    `touchPresence(userId, now): Promise<void>`,
    `activeAtFor(viewer: { chatActivityStatus: boolean }, other: { chatActivityStatus: boolean; lastActiveAt: Date | null }, now): string | null`,
    `interface ChatSettingsDTO { readReceipts: boolean; activityStatus: boolean }`,
    `parseChatSettingsPatch(body): Partial<ChatSettingsDTO> | null`, `getChatSettings(userId)`,
    `updateChatSettings(userId, patch)`.
  - `messages.ts`: `THREAD_PAGE_SIZE = 50`, `listThread(viewerId, buddyId, beforeRaw: unknown, now, pageSize?):
    Promise<ThreadDTO>`, `markRead(viewerId, buddyId, now): Promise<void>`.
  - Routes: `GET /me/chats/:buddyId/messages?before=` → `ThreadDTO`; `POST /me/chats/:buddyId/read` → 204;
    `GET|PUT /me/chats/settings` → `ChatSettingsDTO`; `POST /me/presence` → 204.
  - `keysetBefore(field: 'lastActivityAt' | 'createdAt' | 'lastMessageAt', c)`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/chats/thread.test.ts`:

```ts
import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { orderedPair } from '../../src/buddies/pairs';
import { setBuddyNotifyQueue } from '../../src/buddies/notifyQueue';
import { listThread, markRead, sendMessage } from '../../src/chats/messages';
import { activeAtFor, touchPresence } from '../../src/chats/presence';
import { RecordingQueue, api, buddyUser, pairUp } from '../buddies/helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});
beforeEach(() => setBuddyNotifyQueue(new RecordingQueue()));
afterEach(() => setBuddyNotifyQueue(null));

const NOW = new Date('2026-10-08T18:00:00Z');
const at = (min: number) => new Date(NOW.getTime() + min * 60_000);

async function buddies() {
  const me = await buddyUser({ displayName: 'Ana' });
  const sam = await buddyUser({ displayName: 'Sam' });
  await pairUp(me.id, sam.id);
  return { me, sam };
}
/** Messages written straight to the table (the limiter is not under test here), one a minute from `from`. */
async function seed(me: string, sam: string, count: number, from = 0) {
  const conversation = await prisma.conversation.upsert({ where: { userAId_userBId: orderedPair(me, sam) }, create: orderedPair(me, sam), update: {} });
  await prisma.message.createMany({
    data: Array.from({ length: count }, (_, i) => ({ conversationId: conversation.id, senderId: i % 2 === 0 ? sam : me, kind: 'TEXT' as const, text: `m${from + i}`, createdAt: at(from + i) })),
  });
  return conversation.id;
}

it('pages 50 at a time, oldest first on the wire, with a cursor for the page before; unsent messages never show', async () => {
  const { me, sam } = await buddies();
  const conversationId = await seed(me.id, sam.id, 53);
  await prisma.message.updateMany({ where: { conversationId, text: 'm52' }, data: { deletedAt: at(60), text: null } });
  // 52 visible (m0..m51): the newest 50 are m2..m51, the page before holds m0 and m1.
  const newest = await listThread(me.id, sam.id, undefined, at(100));
  expect(newest.messages.map((m) => m.text)).toEqual(Array.from({ length: 50 }, (_, i) => `m${i + 2}`));
  expect(newest.nextBefore).toEqual(expect.any(String));
  const older = await listThread(me.id, sam.id, newest.nextBefore, at(100));
  expect([older.messages.map((m) => m.text), older.nextBefore]).toEqual([['m0', 'm1'], null]);
  expect(newest.buddy).toEqual({ id: sam.id, handle: sam.handle, displayName: 'Sam', coachId: expect.any(String) });
  expect(newest.messages.find((m) => m.text === 'm2')!.mine).toBe(false);
  expect(newest.messages.find((m) => m.text === 'm3')!.mine).toBe(true);
});

it('a pair with no messages yet reads as an empty thread; a bad cursor is invalid_cursor', async () => {
  const { me, sam } = await buddies();
  expect(await listThread(me.id, sam.id, undefined, NOW)).toEqual({
    buddy: expect.objectContaining({ id: sam.id }), messages: [], nextBefore: null, seenAt: null, activeAt: null,
  });
  await expect(listThread(me.id, sam.id, 'not-a-cursor', NOW)).rejects.toMatchObject({ code: 'invalid_cursor' });
});

it('"Seen" is the buddy\'s last read, sent only while both have read receipts on', async () => {
  const { me, sam } = await buddies();
  await sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'early night?' }, NOW);
  expect((await listThread(me.id, sam.id, undefined, at(1))).seenAt).toBeNull();
  await markRead(sam.id, me.id, at(2));
  expect((await listThread(me.id, sam.id, undefined, at(3))).seenAt).toBe(at(2).toISOString());
  // Never backwards: an older read lands late.
  await markRead(sam.id, me.id, at(1));
  expect((await listThread(me.id, sam.id, undefined, at(3))).seenAt).toBe(at(2).toISOString());
  // Either person off hides it both ways (reciprocal).
  for (const who of [sam.id, me.id]) {
    await prisma.user.update({ where: { id: who }, data: { chatReadReceipts: false } });
    expect([who, (await listThread(me.id, sam.id, undefined, at(3))).seenAt]).toEqual([who, null]);
    await prisma.user.update({ where: { id: who }, data: { chatReadReceipts: true } });
  }
  expect((await listThread(me.id, sam.id, undefined, at(3))).seenAt).toBe(at(2).toISOString());
});

it('reading moves my read and marks their stickers seen, even before any message', async () => {
  const { me, sam } = await buddies();
  await prisma.sticker.create({ data: { fromUserId: sam.id, toUserId: me.id, kind: 'CHEER', sentAt: NOW } });
  await markRead(me.id, sam.id, at(1));
  expect(await prisma.sticker.count({ where: { toUserId: me.id, seenAt: null } })).toBe(0);
  await sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'hi' }, at(2));
  await markRead(me.id, sam.id, at(3));
  const read = await prisma.conversationRead.findFirstOrThrow({ where: { readerId: me.id } });
  expect(read.lastReadAt.toISOString()).toBe(at(3).toISOString());
});

it('activity status: touched at most once a minute, shown within 24 h only while both share it', async () => {
  const { me, sam } = await buddies();
  await touchPresence(sam.id, NOW);
  await touchPresence(sam.id, at(0.5)); // within the minute: unchanged
  expect((await prisma.user.findUniqueOrThrow({ where: { id: sam.id } })).lastActiveAt?.toISOString()).toBe(NOW.toISOString());
  await touchPresence(sam.id, at(1));
  expect((await prisma.user.findUniqueOrThrow({ where: { id: sam.id } })).lastActiveAt?.toISOString()).toBe(at(1).toISOString());
  expect((await listThread(me.id, sam.id, undefined, at(5))).activeAt).toBe(at(1).toISOString());
  expect((await listThread(me.id, sam.id, undefined, at(1 + 24 * 60 + 1))).activeAt).toBeNull();
  await prisma.user.update({ where: { id: me.id }, data: { chatActivityStatus: false } });
  expect((await listThread(me.id, sam.id, undefined, at(5))).activeAt).toBeNull();
  // Pure rule, both ways.
  const seenAt = { chatActivityStatus: true, lastActiveAt: NOW };
  expect(activeAtFor({ chatActivityStatus: true }, seenAt, at(10))).toBe(NOW.toISOString());
  expect(activeAtFor({ chatActivityStatus: true }, { ...seenAt, chatActivityStatus: false }, at(10))).toBeNull();
  expect(activeAtFor({ chatActivityStatus: false }, seenAt, at(10))).toBeNull();
  expect(activeAtFor({ chatActivityStatus: true }, { chatActivityStatus: true, lastActiveAt: null }, at(10))).toBeNull();
});

it('reading a thread and sending touch my presence', async () => {
  const { me, sam } = await buddies();
  await listThread(me.id, sam.id, undefined, NOW);
  expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).lastActiveAt?.toISOString()).toBe(NOW.toISOString());
  await sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'hi' }, at(2));
  expect((await prisma.user.findUniqueOrThrow({ where: { id: sam.id } })).lastActiveAt?.toISOString()).toBe(at(2).toISOString());
});

it('routes: GET messages and POST read answer not_buddies for a stranger; settings read and save; presence is 204', async () => {
  const { me, sam } = await buddies();
  const stranger = await buddyUser();
  const agent = await api();
  const headers = await authHeaderFor(me.id);
  const thread = await agent.get(`/me/chats/${sam.id}/messages`).set(headers);
  expect([thread.status, thread.headers['cache-control'], Object.keys(thread.body).sort()]).toEqual([200, 'private, no-store', ['activeAt', 'buddy', 'messages', 'nextBefore', 'seenAt']]);
  for (const path of [`/me/chats/${stranger.id}/messages`, '/me/chats/nope/messages', `/me/chats/${me.id}/messages`]) {
    const res = await agent.get(path).set(headers);
    expect([path, res.status, res.body]).toEqual([path, 403, { error: 'not_buddies' }]);
  }
  expect((await agent.post(`/me/chats/${sam.id}/read`).set(headers)).status).toBe(204);
  expect((await agent.post(`/me/chats/${stranger.id}/read`).set(headers)).body).toEqual({ error: 'not_buddies' });
  expect((await agent.get(`/me/chats/${sam.id}/messages?before=junk`).set(headers)).body).toEqual({ error: 'invalid_cursor' });
  expect((await agent.get('/me/chats/settings').set(headers)).body).toEqual({ readReceipts: true, activityStatus: true });
  expect((await agent.put('/me/chats/settings').set(headers).send({ readReceipts: false })).body).toEqual({ readReceipts: false, activityStatus: true });
  for (const bad of [{}, { readReceipts: 'no' }, { typing: true }]) {
    expect((await agent.put('/me/chats/settings').set(headers).send(bad)).body).toEqual({ error: 'invalid_settings' });
  }
  expect((await agent.post('/me/presence').set(headers)).status).toBe(204);
  expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).lastActiveAt).not.toBeNull();
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bash .superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh tests/chats/thread.test.ts`
Expected: FAIL — "Cannot find module '../../src/chats/presence'"; `listThread` / `markRead` are not exported.

- [ ] **Step 3: Presence and chat privacy**

Create `backend/src/chats/presence.ts`:

```ts
// Activity status and the chat privacy switches (spec 2026-10-07 social §8.2, §8.4). lastActiveAt is touched at most
// once a minute: by POST /me/presence (the app sends it on start and each return to the foreground) and by any chat
// read or send. Read receipts and activity status are reciprocal: either person off → neither sees the other's.

import { prisma } from '../db/client';
import { BuddyError } from '../buddies/errors';

export const PRESENCE_TOUCH_MS = 60_000;
/** Beyond this, nothing is shown ("Active {n}h ago" stops at 24 h). */
export const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function touchPresence(userId: string, now: Date): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId, OR: [{ lastActiveAt: null }, { lastActiveAt: { lte: new Date(now.getTime() - PRESENCE_TOUCH_MS) } }] },
    data: { lastActiveAt: now },
  });
}

/** The other person's last activity, as the viewer may see it: both share it, and it is within 24 h. */
export function activeAtFor(
  viewer: { chatActivityStatus: boolean },
  other: { chatActivityStatus: boolean; lastActiveAt: Date | null },
  now: Date,
): string | null {
  if (!viewer.chatActivityStatus || !other.chatActivityStatus || !other.lastActiveAt) return null;
  return now.getTime() - other.lastActiveAt.getTime() <= ACTIVE_WINDOW_MS ? other.lastActiveAt.toISOString() : null;
}

export interface ChatSettingsDTO { readReceipts: boolean; activityStatus: boolean }

const COLUMNS = { readReceipts: 'chatReadReceipts', activityStatus: 'chatActivityStatus' } as const;
const SELECT = { chatReadReceipts: true, chatActivityStatus: true } as const;
const toDTO = (u: { chatReadReceipts: boolean; chatActivityStatus: boolean }): ChatSettingsDTO => ({ readReceipts: u.chatReadReceipts, activityStatus: u.chatActivityStatus });

/** A non-empty patch of the two keys with boolean values, else null (→ invalid_settings). */
export function parseChatSettingsPatch(body: unknown): Partial<ChatSettingsDTO> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const entries = Object.entries(body as Record<string, unknown>);
  if (entries.length === 0) return null;
  const out: Partial<ChatSettingsDTO> = {};
  for (const [key, value] of entries) {
    if (!Object.prototype.hasOwnProperty.call(COLUMNS, key) || typeof value !== 'boolean') return null;
    out[key as keyof ChatSettingsDTO] = value;
  }
  return out;
}

export async function getChatSettings(userId: string): Promise<ChatSettingsDTO> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: SELECT });
  if (!user) throw new BuddyError('not_found');
  return toDTO(user);
}

export async function updateChatSettings(userId: string, patch: Partial<ChatSettingsDTO>): Promise<ChatSettingsDTO> {
  const data = Object.fromEntries(Object.entries(patch).map(([key, value]) => [COLUMNS[key as keyof ChatSettingsDTO], value]));
  const user = await prisma.user.update({ where: { id: userId }, data, select: SELECT });
  return toDTO(user);
}
```

In `backend/src/buddies/cursor.ts`, change the `keysetBefore` signature to
`export function keysetBefore(field: 'lastActivityAt' | 'createdAt' | 'lastMessageAt', c: Cursor) {`.

- [ ] **Step 4: The thread and reading it**

In `backend/src/chats/messages.ts`:

Add these imports after the existing ones:

```ts
import { encodeCursor, keysetBefore, parseCursor } from '../buddies/cursor';
import { toPerson } from '../buddies/people';
import { findConversationId, moveRead, requireChatPeople } from './conversations';
import { activeAtFor, touchPresence } from './presence';
import type { ThreadDTO } from './types';
```

(merge `findConversationId, moveRead, requireChatPeople` into the existing `./conversations` import line rather than
importing the module twice, and `ThreadDTO` into the existing `./types` import).

In `sendMessage`, before each of its two `return loadMessageDTO(messageId, senderId);` lines add
`await touchPresence(senderId, now);`.

Append:

```ts
export const THREAD_PAGE_SIZE = 50;

/**
 * One page of the thread, oldest first: the newest page without `before` (what the app polls every 5 s), else the page
 * before that cursor. Unsent messages are never returned. A pair with no conversation yet is an empty thread. "Seen"
 * and activity status follow the reciprocal settings. Reading touches the reader's presence.
 */
export async function listThread(viewerId: string, buddyId: string, beforeRaw: unknown, now: Date, pageSize = THREAD_PAGE_SIZE): Promise<ThreadDTO> {
  const before = parseCursor(beforeRaw);
  const { viewer, buddy } = await requireChatPeople(viewerId, buddyId);
  await touchPresence(viewerId, now);
  const activeAt = activeAtFor(viewer, buddy, now);
  const conversationId = await findConversationId(viewerId, buddyId);
  if (!conversationId) return { buddy: toPerson(buddy), messages: [], nextBefore: null, seenAt: null, activeAt };
  const [rows, read] = await Promise.all([
    prisma.message.findMany({
      where: { AND: [{ conversationId, deletedAt: null }, ...(before ? [keysetBefore('createdAt', before)] : [])] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pageSize + 1,
      select: MESSAGE_SELECT,
    }),
    viewer.chatReadReceipts && buddy.chatReadReceipts
      ? prisma.conversationRead.findUnique({ where: { conversationId_readerId: { conversationId, readerId: buddyId } }, select: { lastReadAt: true } })
      : Promise.resolve(null),
  ]);
  const page = rows.slice(0, pageSize);
  const oldest = page[page.length - 1];
  return {
    buddy: toPerson(buddy),
    messages: page.reverse().map((row) => toMessageDTO(row, viewerId)),
    nextBefore: rows.length > pageSize && oldest ? encodeCursor({ at: oldest.createdAt, id: oldest.id }) : null,
    seenAt: read ? read.lastReadAt.toISOString() : null,
    activeAt,
  };
}

/** The thread is open: my read moves to now (never back), and that buddy's unseen stickers to me are seen. */
export async function markRead(viewerId: string, buddyId: string, now: Date): Promise<void> {
  await requireChatPeople(viewerId, buddyId);
  const conversationId = await findConversationId(viewerId, buddyId);
  if (conversationId) await moveRead(prisma, conversationId, viewerId, now);
  await prisma.sticker.updateMany({ where: { fromUserId: buddyId, toUserId: viewerId, seenAt: null }, data: { seenAt: now } });
}
```

- [ ] **Step 5: The routes**

In `backend/src/chats/routes.ts`, add imports

```ts
import { BuddyError } from '../buddies/errors';
import { listThread, markRead } from './messages';
import { getChatSettings, parseChatSettingsPatch, touchPresence, updateChatSettings } from './presence';
```

(merge `listThread, markRead` into the existing `./messages` import and `BuddyError` into the `../buddies/errors`
import), and append:

```ts
chatsRouter.get('/me/chats/settings', requireAuth, buddyRoute(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json(await getChatSettings(req.userId!));
}));

chatsRouter.put('/me/chats/settings', requireAuth, buddyRoute(async (req, res) => {
  const patch = parseChatSettingsPatch(req.body);
  if (!patch) throw new BuddyError('invalid_settings');
  res.json(await updateChatSettings(req.userId!, patch));
}));

// Never rate-limited: at most one write a minute per user (touchPresence).
chatsRouter.post('/me/presence', requireAuth, buddyRoute(async (req, res) => {
  await touchPresence(req.userId!, new Date());
  res.status(204).end();
}));

chatsRouter.get('/me/chats/:buddyId/messages', requireAuth, buddyRoute(async (req, res) => {
  const buddyId = requireBuddyId(String(req.params.buddyId), req.userId!);
  res.set('Cache-Control', 'private, no-store');
  res.json(await listThread(req.userId!, buddyId, req.query.before, new Date()));
}));

chatsRouter.post('/me/chats/:buddyId/read', requireAuth, buddyRoute(async (req, res) => {
  await markRead(req.userId!, requireBuddyId(String(req.params.buddyId), req.userId!), new Date());
  res.status(204).end();
}));
```

- [ ] **Step 6: Run the tests**

Run: `bash .superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh tests/chats tests/buddies/list.test.ts tests/buddies/activity.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/chats backend/src/buddies/cursor.ts backend/tests/chats/thread.test.ts
git commit -m "feat(chats): read a thread in pages, with reciprocal Seen and activity status"
```

---

### Task 7: Reactions and unsend

**Files:**
- Modify: `backend/src/chats/messages.ts`, `backend/src/chats/routes.ts`
- Test: create `backend/tests/chats/reactions.test.ts`

**Interfaces:**
- Consumes: `requireChatPeople`, `findConversationId` (Task 4); `STICKER_KINDS` (`buddies/stickers.ts`);
  `RATE_LIMITS.reaction` (Task 3); `listThread`, `sendMessage` (Tasks 4–6).
- Produces: `setReaction(viewerId, buddyId, messageId: string, kind: unknown, now): Promise<{ reactions: ReactionDTO[] }>`,
  `clearReaction(viewerId, buddyId, messageId: string): Promise<void>`,
  `unsendMessage(viewerId, buddyId, messageId: string, now): Promise<void>`; routes
  `PUT /me/chats/:buddyId/messages/:messageId/reaction { kind }` → 200 `{ reactions }`,
  `DELETE …/reaction` → 204, `DELETE /me/chats/:buddyId/messages/:messageId` → 204.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/chats/reactions.test.ts`:

```ts
import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import * as rateLimit from '../../src/lib/rateLimit';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { setBuddyNotifyQueue } from '../../src/buddies/notifyQueue';
import { clearReaction, listThread, sendMessage, setReaction, unsendMessage } from '../../src/chats/messages';
import { RecordingQueue, api, buddyUser, pairUp } from '../buddies/helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});
beforeEach(() => setBuddyNotifyQueue(new RecordingQueue()));
afterEach(() => {
  setBuddyNotifyQueue(null);
  jest.restoreAllMocks();
});

const NOW = new Date('2026-10-08T18:00:00Z');
const at = (min: number) => new Date(NOW.getTime() + min * 60_000);

async function chat() {
  const me = await buddyUser({ displayName: 'Ana' });
  const sam = await buddyUser({ displayName: 'Sam' });
  await pairUp(me.id, sam.id);
  const theirs = await sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'rough night lol' }, NOW);
  const mine = await sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'early night tonight?', replyToMessageId: theirs.id }, at(1));
  return { me, sam, theirs, mine };
}

it('one reaction per person per message: react, change it, both people react', async () => {
  const { me, sam, theirs } = await chat();
  expect(await setReaction(me.id, sam.id, theirs.id, 'HEART', at(2))).toEqual({ reactions: [{ kind: 'HEART', mine: true }] });
  expect(await setReaction(me.id, sam.id, theirs.id, 'STAR', at(3))).toEqual({ reactions: [{ kind: 'STAR', mine: true }] });
  await setReaction(sam.id, me.id, theirs.id, 'CHEER', at(4));
  const seenBySam = (await listThread(sam.id, me.id, undefined, at(5))).messages.find((m) => m.id === theirs.id)!;
  expect(seenBySam.reactions).toEqual([{ kind: 'STAR', mine: false }, { kind: 'CHEER', mine: true }]);
  expect(await prisma.messageReaction.count({ where: { messageId: theirs.id } })).toBe(2);
});

it('refuses an unknown kind before the limiter, and a missing, unsent or other conversation\'s message as message_gone', async () => {
  const { me, sam, theirs } = await chat();
  const spy = jest.spyOn(rateLimit, 'consumeRateLimit');
  for (const kind of ['KISS', undefined, 3]) await expect(setReaction(me.id, sam.id, theirs.id, kind, at(2))).rejects.toMatchObject({ code: 'invalid_reaction' });
  expect(spy).not.toHaveBeenCalled();
  const ben = await buddyUser();
  await pairUp(me.id, ben.id);
  const elsewhere = await sendMessage(ben.id, me.id, { kind: 'TEXT', text: 'hey' }, NOW);
  await unsendMessage(sam.id, me.id, theirs.id, at(2));
  for (const id of [theirs.id, elsewhere.id, '00000000-0000-4000-8000-000000000000', 'nope']) {
    await expect(setReaction(me.id, sam.id, id, 'HEART', at(3))).rejects.toMatchObject({ code: 'message_gone' });
  }
  const stranger = await buddyUser();
  await expect(setReaction(stranger.id, sam.id, elsewhere.id, 'HEART', at(3))).rejects.toMatchObject({ code: 'not_buddies' });
});

it('reactions spend the 60-a-minute bucket, failing closed; clearing never touches it', async () => {
  const { me, sam, theirs } = await chat();
  const spy = jest.spyOn(rateLimit, 'consumeRateLimit').mockResolvedValueOnce('limited').mockResolvedValueOnce('unavailable');
  await expect(setReaction(me.id, sam.id, theirs.id, 'HEART', at(2))).rejects.toMatchObject({ code: 'rate_limited' });
  await expect(setReaction(me.id, sam.id, theirs.id, 'HEART', at(2))).rejects.toMatchObject({ code: 'try_later' });
  expect(spy).toHaveBeenCalledWith(rateLimit.RATE_LIMITS.reaction, me.id);
  spy.mockReset();
  spy.mockRejectedValue(new Error('redis down'));
  await prisma.messageReaction.create({ data: { messageId: theirs.id, reactorId: me.id, kind: 'HEART' } });
  await clearReaction(me.id, sam.id, theirs.id);
  await clearReaction(me.id, sam.id, theirs.id); // nothing left: still fine
  expect(spy).not.toHaveBeenCalled();
  expect(await prisma.messageReaction.count({ where: { messageId: theirs.id } })).toBe(0);
});

it('unsend hides my message from both of us, clears what it said and its reactions, and a reply to it reads as gone', async () => {
  const { me, sam, theirs, mine } = await chat();
  const reply = await sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'maybe', replyToMessageId: mine.id }, at(2));
  await setReaction(sam.id, me.id, mine.id, 'HEART', at(3));
  const spy = jest.spyOn(rateLimit, 'consumeRateLimit');
  await unsendMessage(me.id, sam.id, mine.id, at(4));
  await unsendMessage(me.id, sam.id, mine.id, at(5)); // twice: fine
  expect(spy).not.toHaveBeenCalled();
  for (const [viewer, other] of [[me.id, sam.id], [sam.id, me.id]]) {
    const thread = await listThread(viewer, other, undefined, at(6));
    expect(thread.messages.map((m) => m.id)).toEqual([theirs.id, reply.id]);
    expect(thread.messages[1]!.replyTo).toEqual({ id: mine.id, gone: true });
  }
  const row = await prisma.message.findUniqueOrThrow({ where: { id: mine.id } });
  expect([row.text, row.sticker, row.card, row.deletedAt?.toISOString()]).toEqual([null, null, null, at(4).toISOString()]);
  expect(await prisma.messageReaction.count({ where: { messageId: mine.id } })).toBe(0);
});

it("only the sender can unsend: someone else's message, or a missing one, is message_gone", async () => {
  const { me, sam, theirs } = await chat();
  await expect(unsendMessage(me.id, sam.id, theirs.id, at(2))).rejects.toMatchObject({ code: 'message_gone' });
  await expect(unsendMessage(me.id, sam.id, 'nope', at(2))).rejects.toMatchObject({ code: 'message_gone' });
  expect((await prisma.message.findUniqueOrThrow({ where: { id: theirs.id } })).deletedAt).toBeNull();
});

it('unsending a sticker message leaves the Buddies sticker (it still counts toward the day)', async () => {
  const { me, sam } = await chat();
  const sticker = await sendMessage(me.id, sam.id, { kind: 'STICKER', sticker: 'CHEER' }, at(2));
  await unsendMessage(me.id, sam.id, sticker.id, at(3));
  expect(await prisma.sticker.count({ where: { fromUserId: me.id, toUserId: sam.id } })).toBe(1);
});

it('routes: PUT reaction 200 { reactions }, DELETE reaction 204, DELETE message 204, a stranger is not_buddies', async () => {
  const { me, sam, theirs, mine } = await chat();
  const stranger = await buddyUser();
  const agent = await api();
  const headers = await authHeaderFor(me.id);
  const put = await agent.put(`/me/chats/${sam.id}/messages/${theirs.id}/reaction`).set(headers).send({ kind: 'STAR' });
  expect([put.status, put.body]).toEqual([200, { reactions: [{ kind: 'STAR', mine: true }] }]);
  expect((await agent.put(`/me/chats/${sam.id}/messages/${theirs.id}/reaction`).set(headers).send({ kind: 'KISS' })).body).toEqual({ error: 'invalid_reaction' });
  expect((await agent.delete(`/me/chats/${sam.id}/messages/${theirs.id}/reaction`).set(headers)).status).toBe(204);
  expect((await agent.delete(`/me/chats/${sam.id}/messages/${mine.id}`).set(headers)).status).toBe(204);
  expect((await agent.delete(`/me/chats/${stranger.id}/messages/${mine.id}`).set(headers)).body).toEqual({ error: 'not_buddies' });
  expect((await agent.delete(`/me/chats/${sam.id}/messages/${theirs.id}`).set(headers)).body).toEqual({ error: 'message_gone' });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bash .superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh tests/chats/reactions.test.ts`
Expected: FAIL — `setReaction`, `clearReaction`, `unsendMessage` are not exported.

- [ ] **Step 3: Write reactions and unsend**

In `backend/src/chats/messages.ts`:

Change the Prisma import line `import type { MessageKind, Prisma } from '@prisma/client';` to
`import { Prisma, type MessageKind, type StickerKind } from '@prisma/client';`, change the stickers import to
`import { STICKER_KINDS, sendSticker } from '../buddies/stickers';`, and add `type ReactionDTO` to the `./types` import.

Append:

```ts
/** message_gone unless `messageId` is a live (not unsent) message of the pair's conversation. */
async function requireLiveMessage(viewerId: string, buddyId: string, messageId: string): Promise<void> {
  const conversationId = await findConversationId(viewerId, buddyId);
  const message = conversationId
    ? await prisma.message.findFirst({ where: { id: messageId, conversationId, deletedAt: null }, select: { id: true } })
    : null;
  if (!message) throw new BuddyError('message_gone');
}

async function reactionsOf(messageId: string, viewerId: string): Promise<ReactionDTO[]> {
  const rows = await prisma.messageReaction.findMany({ where: { messageId }, orderBy: { createdAt: 'asc' }, select: { reactorId: true, kind: true } });
  return rows.map((r) => ({ kind: r.kind, mine: r.reactorId === viewerId }));
}

/** One reaction per person per message (spec §8.2): setting another replaces mine. Either person may react to any live message. */
export async function setReaction(viewerId: string, buddyId: string, messageId: string, kind: unknown, now: Date): Promise<{ reactions: ReactionDTO[] }> {
  if (!(STICKER_KINDS as readonly unknown[]).includes(kind)) throw new BuddyError('invalid_reaction');
  if (!UUID_RE.test(messageId)) throw new BuddyError('message_gone');
  await limitOrThrow(RATE_LIMITS.reaction, viewerId);
  await requireChatPeople(viewerId, buddyId);
  await requireLiveMessage(viewerId, buddyId, messageId);
  const created = await prisma.messageReaction.createMany({ data: [{ messageId, reactorId: viewerId, kind: kind as StickerKind, createdAt: now }], skipDuplicates: true });
  if (created.count === 0) await prisma.messageReaction.updateMany({ where: { messageId, reactorId: viewerId }, data: { kind: kind as StickerKind, createdAt: now } });
  return { reactions: await reactionsOf(messageId, viewerId) };
}

/** Removing my reaction always works for a buddy: no limiter, and nothing to remove is fine. */
export async function clearReaction(viewerId: string, buddyId: string, messageId: string): Promise<void> {
  await requireChatPeople(viewerId, buddyId);
  if (!UUID_RE.test(messageId)) return;
  await prisma.messageReaction.deleteMany({ where: { messageId, reactorId: viewerId } });
}

/**
 * The sender takes a message back (spec §8.2, "shown as nothing"): deletedAt is set and its text, sticker and card are
 * cleared at once; its reactions go. A sticker's Buddies row stays (plan ruling). Never limited; a repeat is fine.
 */
export async function unsendMessage(viewerId: string, buddyId: string, messageId: string, now: Date): Promise<void> {
  await requireChatPeople(viewerId, buddyId);
  if (!UUID_RE.test(messageId)) throw new BuddyError('message_gone');
  const conversationId = await findConversationId(viewerId, buddyId);
  const row = conversationId
    ? await prisma.message.findFirst({ where: { id: messageId, conversationId, senderId: viewerId }, select: { deletedAt: true } })
    : null;
  if (!row) throw new BuddyError('message_gone');
  if (row.deletedAt) return;
  await prisma.$transaction([
    prisma.message.updateMany({ where: { id: messageId, deletedAt: null }, data: { deletedAt: now, text: null, sticker: null, card: Prisma.DbNull } }),
    prisma.messageReaction.deleteMany({ where: { messageId } }),
  ]);
}
```

- [ ] **Step 4: The routes**

In `backend/src/chats/routes.ts`, add `clearReaction, setReaction, unsendMessage` to the `./messages` import, and
append:

```ts
chatsRouter.delete('/me/chats/:buddyId/messages/:messageId', requireAuth, buddyRoute(async (req, res) => {
  await unsendMessage(req.userId!, requireBuddyId(String(req.params.buddyId), req.userId!), String(req.params.messageId), new Date());
  res.status(204).end();
}));

chatsRouter.put('/me/chats/:buddyId/messages/:messageId/reaction', requireAuth, buddyRoute(async (req, res) => {
  const buddyId = requireBuddyId(String(req.params.buddyId), req.userId!);
  res.json(await setReaction(req.userId!, buddyId, String(req.params.messageId), (req.body as { kind?: unknown } | undefined)?.kind, new Date()));
}));

chatsRouter.delete('/me/chats/:buddyId/messages/:messageId/reaction', requireAuth, buddyRoute(async (req, res) => {
  await clearReaction(req.userId!, requireBuddyId(String(req.params.buddyId), req.userId!), String(req.params.messageId));
  res.status(204).end();
}));
```

- [ ] **Step 5: Run the tests**

Run: `bash .superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh tests/chats`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/chats/messages.ts backend/src/chats/routes.ts backend/tests/chats/reactions.test.ts
git commit -m "feat(chats): sticker reactions and unsend"
```

---

### Task 8: The inbox, and unread chats on the Social home

**Files:**
- Create: `backend/src/chats/inbox.ts`
- Modify: `backend/src/chats/routes.ts`, `backend/src/social/home.ts`
- Test: create `backend/tests/chats/inbox.test.ts`; modify `backend/tests/social/home.test.ts`,
  `backend/tests/social/homeQueries.test.ts`

**Interfaces:**
- Consumes: `CHAT_PERSON_SELECT` (Task 4); `activeAtFor`, `touchPresence` (Task 6); `previewText` (Task 3);
  `cardTypeOf`, `CardType` (Task 4); `countRequests(userId, now)` (`buddies/requests.ts`); `parseCursor`,
  `encodeCursor`, `keysetBefore('lastMessageAt', …)` (Task 6).
- Produces: `CHATS_PAGE_SIZE = 30`; `LastMessageDTO { mine, kind, text, sticker, cardType, at }`,
  `ChatRowDTO { buddy, lastMessage, unread, activeAt }`, `ChatsPageDTO { chats, nextCursor, requests }`;
  `listChats(viewerId, cursorRaw: unknown, now, pageSize?): Promise<ChatsPageDTO>`;
  `unreadChatsCount(viewerId): Promise<number>`; route `GET /me/chats?cursor=` → `ChatsPageDTO`;
  `SocialHomeDTO.unread.chats: number`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/chats/inbox.test.ts`:

```ts
import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { orderedPair } from '../../src/buddies/pairs';
import { setBuddyNotifyQueue } from '../../src/buddies/notifyQueue';
import { listChats, unreadChatsCount } from '../../src/chats/inbox';
import { markRead, sendMessage, unsendMessage } from '../../src/chats/messages';
import { saveCheckIn } from '../../src/social/checkins';
import { getSocialHome } from '../../src/social/home';
import { RecordingQueue, api, buddyUser, pairUp } from '../buddies/helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});
beforeEach(() => setBuddyNotifyQueue(new RecordingQueue()));
afterEach(() => setBuddyNotifyQueue(null));

const NOW = new Date('2026-10-08T18:00:00Z');
const at = (min: number) => new Date(NOW.getTime() + min * 60_000);

async function circleOf(n: number) {
  const me = await buddyUser({ displayName: 'Ana' });
  const buddies = [];
  for (let i = 0; i < n; i++) {
    const b = await buddyUser({ displayName: `B${i}` });
    await pairUp(me.id, b.id);
    buddies.push(b);
  }
  return { me, buddies };
}

it('lists conversations newest first, 30 a page by default, each with its last message, unread count and buddy', async () => {
  const { me, buddies: [sam, ben, cy] } = await circleOf(3);
  await sendMessage(sam!.id, me.id, { kind: 'TEXT', text: `rough night lol\n${'x'.repeat(100)}` }, at(1));
  await sendMessage(me.id, ben!.id, { kind: 'TEXT', text: 'you up?' }, at(2));
  await sendMessage(cy!.id, me.id, { kind: 'STICKER', sticker: 'CHEER' }, at(3));
  const first = await listChats(me.id, undefined, at(10), 2);
  expect(first.chats.map((c) => c.buddy.id)).toEqual([cy!.id, ben!.id]);
  expect(first.chats[0]).toEqual({
    buddy: expect.objectContaining({ id: cy!.id, displayName: 'B2' }),
    lastMessage: { mine: false, kind: 'STICKER', text: null, sticker: 'CHEER', cardType: null, at: at(3).toISOString() },
    unread: 1,
    activeAt: expect.any(String), // Cy sent a message at(3): active, and both share activity status
  });
  expect(first.chats[1]).toMatchObject({ lastMessage: { mine: true, kind: 'TEXT', text: 'you up?' }, unread: 0 });
  expect(first.nextCursor).toEqual(expect.any(String));
  const second = await listChats(me.id, first.nextCursor, at(10), 2);
  expect([second.chats.map((c) => c.buddy.id), second.nextCursor]).toEqual([[sam!.id], null]);
  // A text is one line of at most 80 code points.
  expect(second.chats[0]!.lastMessage.text).toBe(`rough night lol ${'x'.repeat(64)}…`); // 16 + 64 = 80
  expect(first.requests).toBe(0);
});

it('counts only their unread messages; reading clears it; an all-unsent conversation is not listed', async () => {
  const { me, buddies: [sam, ben] } = await circleOf(2);
  await sendMessage(sam!.id, me.id, { kind: 'TEXT', text: 'one' }, at(1));
  await sendMessage(sam!.id, me.id, { kind: 'TEXT', text: 'two' }, at(2));
  const gone = await sendMessage(ben!.id, me.id, { kind: 'TEXT', text: 'oops' }, at(3));
  expect((await listChats(me.id, undefined, at(4))).chats.map((c) => [c.buddy.id, c.unread])).toEqual([[ben!.id, 1], [sam!.id, 2]]);
  expect(await unreadChatsCount(me.id)).toBe(2);
  await unsendMessage(ben!.id, me.id, gone.id, at(5));
  await markRead(me.id, sam!.id, at(6));
  expect((await listChats(me.id, undefined, at(7))).chats.map((c) => [c.buddy.id, c.unread])).toEqual([[sam!.id, 0]]);
  expect(await unreadChatsCount(me.id)).toBe(0);
});

it("the last line skips unsent messages and names a card's type; activity status is reciprocal", async () => {
  const { me, buddies: [sam] } = await circleOf(1);
  await saveCheckIn(me.id, 'RESTED', at(0));
  await sendMessage(me.id, sam!.id, { kind: 'CARD', card: { type: 'my_checkin' } }, at(1));
  const later = await sendMessage(me.id, sam!.id, { kind: 'TEXT', text: 'never mind' }, at(2));
  await unsendMessage(me.id, sam!.id, later.id, at(3));
  const row = (await listChats(sam!.id, undefined, at(4))).chats[0]!;
  expect(row.lastMessage).toEqual({ mine: false, kind: 'CARD', text: null, sticker: null, cardType: 'checkin', at: at(1).toISOString() });
  expect(row.activeAt).toBe(at(2).toISOString()); // my last send touched my presence
  await prisma.user.update({ where: { id: me.id }, data: { chatActivityStatus: false } });
  expect((await listChats(sam!.id, undefined, at(4))).chats[0]!.activeAt).toBeNull();
});

it('counts conversations with unread messages from current buddies only, and carries incoming requests', async () => {
  const { me, buddies: [sam] } = await circleOf(1);
  await sendMessage(sam!.id, me.id, { kind: 'TEXT', text: 'hi' }, at(1));
  const stranger = await buddyUser();
  await prisma.buddyRequest.create({ data: { fromUserId: stranger.id, toUserId: me.id, createdAt: NOW } });
  expect((await listChats(me.id, undefined, at(2))).requests).toBe(1);
  expect(await unreadChatsCount(me.id)).toBe(1);
  // A pair row gone (unpair deletes the conversation too, Task 11; here only the pair): never counted.
  await prisma.buddyPair.deleteMany({ where: orderedPair(me.id, sam!.id) });
  expect(await unreadChatsCount(me.id)).toBe(0);
});

it('the Social home carries unread.chats; GET /me/chats answers the page, never cached', async () => {
  const { me, buddies: [sam] } = await circleOf(1);
  await sendMessage(sam!.id, me.id, { kind: 'TEXT', text: 'hi' }, new Date(Date.now() - 60_000));
  expect((await getSocialHome(me.id, new Date())).unread).toEqual({ requests: 0, stickers: 0, chats: 1 });
  const res = await (await api()).get('/me/chats').set(await authHeaderFor(me.id));
  expect([res.status, res.headers['cache-control'], res.body.chats.length, res.body.nextCursor, res.body.requests]).toEqual([200, 'private, no-store', 1, null, 0]);
  expect((await (await api()).get('/me/chats?cursor=junk').set(await authHeaderFor(me.id))).body).toEqual({ error: 'invalid_cursor' });
});
```

In `backend/tests/social/home.test.ts`, replace the three exact `unread` expectations:
- `expect(res.body.unread).toEqual({ requests: 0, stickers: 1 });` →
  `expect(res.body.unread).toEqual({ requests: 0, stickers: 1, chats: 0 });`
- `expect((await agent.get('/me/social').set(headers)).body.unread).toEqual({ requests: 0, stickers: 1 });` →
  `expect((await agent.get('/me/social').set(headers)).body.unread).toEqual({ requests: 0, stickers: 1, chats: 0 });`
- `expect((await agent.get('/me/social').set(headers)).body.unread).toEqual({ requests: 0, stickers: 0 });` →
  `expect((await agent.get('/me/social').set(headers)).body.unread).toEqual({ requests: 0, stickers: 0, chats: 0 });`

In `backend/tests/social/homeQueries.test.ts`, change the test title's `in at most 17 queries` to
`in at most 18 queries`, and replace

```ts
  // S1 measured 27. Now: loadCircle 4 + rings 3 + timeline 6 (camp notes since S2) + cached highlights 1 + requests 2 + stickers 1 = 17.
  expect(mockQueries.count).toBeLessThanOrEqual(17);
```

with

```ts
  // S1 measured 27. Now: loadCircle 4 + rings 3 + timeline 6 (camp notes since S2) + cached highlights 1 + requests 2
  // + stickers 1 + unread chats 1 (S3: one grouped count) = 18.
  expect(mockQueries.count).toBeLessThanOrEqual(18);
```

- [ ] **Step 2: Run them to see them fail**

Run: `bash .superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh tests/chats/inbox.test.ts tests/social/home.test.ts`
Expected: FAIL — "Cannot find module '../../src/chats/inbox'"; `unread` has no `chats`.

- [ ] **Step 3: Write the inbox**

Create `backend/src/chats/inbox.ts`:

```ts
// The Chats inbox (spec 2026-10-07 social §8.1): one row per conversation with a visible message, newest first, 30 a
// page by (lastMessageAt desc, id desc). A row: the buddy, the last visible message (a text as one line of at most 80
// code points — it is the viewer's own conversation; the app words stickers and cards), how many of their messages
// I haven't read, and their activity status (reciprocal). The teal story ring is read by the app from the Social home it
// already has, so the inbox does no story work. `requests` counts incoming buddy requests for "Requests (N)".
// unreadChatsCount feeds /me/social unread.chats: conversations with at least one unread message from a CURRENT buddy.
// Message text is user free text: nothing here logs.

import { Prisma, type MessageKind, type StickerKind } from '@prisma/client';
import { prisma } from '../db/client';
import { BuddyError } from '../buddies/errors';
import { encodeCursor, keysetBefore, parseCursor } from '../buddies/cursor';
import { toPerson, type PersonDTO } from '../buddies/people';
import { countRequests } from '../buddies/requests';
import { CHAT_PERSON_SELECT } from './conversations';
import { activeAtFor, touchPresence } from './presence';
import { previewText } from './text';
import { cardTypeOf, type CardType } from './types';

export const CHATS_PAGE_SIZE = 30;

export interface LastMessageDTO { mine: boolean; kind: MessageKind; text: string | null; sticker: StickerKind | null; cardType: CardType | null; at: string }
export interface ChatRowDTO { buddy: PersonDTO; lastMessage: LastMessageDTO; unread: number; activeAt: string | null }
export interface ChatsPageDTO { chats: ChatRowDTO[]; nextCursor: string | null; requests: number }

interface LatestRow { conversationId: string; senderId: string; kind: MessageKind; text: string | null; sticker: StickerKind | null; card: unknown; createdAt: Date }

/** Each conversation's newest visible message: one query for the page. */
async function latestMessages(ids: string[]): Promise<Map<string, LatestRow>> {
  const rows = await prisma.$queryRaw<LatestRow[]>`
    SELECT DISTINCT ON (m."conversationId") m."conversationId", m."senderId", m."kind", m."text", m."sticker", m."card", m."createdAt"
    FROM "Message" m
    WHERE m."conversationId" IN (${Prisma.join(ids)}) AND m."deletedAt" IS NULL
    ORDER BY m."conversationId", m."createdAt" DESC, m."id" DESC`;
  return new Map(rows.map((r) => [r.conversationId, r]));
}

/** Their visible messages after my last read, per conversation: one query for the page. */
async function unreadByConversation(ids: string[], viewerId: string): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<Array<{ conversationId: string; unread: number }>>`
    SELECT m."conversationId", COUNT(*)::int AS "unread"
    FROM "Message" m
    LEFT JOIN "ConversationRead" r ON r."conversationId" = m."conversationId" AND r."readerId" = ${viewerId}
    WHERE m."conversationId" IN (${Prisma.join(ids)}) AND m."senderId" <> ${viewerId} AND m."deletedAt" IS NULL
      AND (r."lastReadAt" IS NULL OR m."createdAt" > r."lastReadAt")
    GROUP BY m."conversationId"`;
  return new Map(rows.map((r) => [r.conversationId, r.unread]));
}

export async function listChats(viewerId: string, cursorRaw: unknown, now: Date, pageSize = CHATS_PAGE_SIZE): Promise<ChatsPageDTO> {
  const cursor = parseCursor(cursorRaw);
  const viewer = await prisma.user.findUnique({ where: { id: viewerId }, select: { chatActivityStatus: true } });
  if (!viewer) throw new BuddyError('not_buddies');
  await touchPresence(viewerId, now);
  const [conversations, requests] = await Promise.all([
    prisma.conversation.findMany({
      where: {
        AND: [
          { OR: [{ userAId: viewerId }, { userBId: viewerId }] },
          { messages: { some: { deletedAt: null } } },
          ...(cursor ? [keysetBefore('lastMessageAt', cursor)] : []),
        ],
      },
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: pageSize + 1,
      select: { id: true, userAId: true, userBId: true, lastMessageAt: true },
    }),
    countRequests(viewerId, now),
  ]);
  const page = conversations.slice(0, pageSize);
  if (page.length === 0) return { chats: [], nextCursor: null, requests: requests.incoming };
  const ids = page.map((c) => c.id);
  const otherOf = (c: { userAId: string; userBId: string }) => (c.userAId === viewerId ? c.userBId : c.userAId);
  const [latest, unread, people] = await Promise.all([
    latestMessages(ids),
    unreadByConversation(ids, viewerId),
    prisma.user.findMany({ where: { id: { in: page.map(otherOf) } }, select: CHAT_PERSON_SELECT }),
  ]);
  const personOf = new Map(people.map((p) => [p.id, p]));
  const chats = page.flatMap((c): ChatRowDTO[] => {
    const other = personOf.get(otherOf(c));
    const last = latest.get(c.id);
    if (!other || !last) return [];
    return [{
      buddy: toPerson(other),
      lastMessage: {
        mine: last.senderId === viewerId,
        kind: last.kind,
        text: last.text === null ? null : previewText(last.text),
        sticker: last.sticker,
        cardType: cardTypeOf(last.card),
        at: last.createdAt.toISOString(),
      },
      unread: unread.get(c.id) ?? 0,
      activeAt: activeAtFor(viewer, other, now),
    }];
  });
  const lastRow = page[page.length - 1]!;
  return {
    chats,
    nextCursor: conversations.length > pageSize ? encodeCursor({ at: lastRow.lastMessageAt, id: lastRow.id }) : null,
    requests: requests.incoming,
  };
}

/** Conversations with at least one unread message from a current buddy (the pair row must still exist). One query. */
export async function unreadChatsCount(viewerId: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(DISTINCT m."conversationId")::int AS "count"
    FROM "Message" m
    JOIN "Conversation" c ON c."id" = m."conversationId"
    JOIN "BuddyPair" p ON p."userAId" = c."userAId" AND p."userBId" = c."userBId"
    LEFT JOIN "ConversationRead" r ON r."conversationId" = m."conversationId" AND r."readerId" = ${viewerId}
    WHERE (c."userAId" = ${viewerId} OR c."userBId" = ${viewerId})
      AND m."senderId" <> ${viewerId} AND m."deletedAt" IS NULL
      AND (r."lastReadAt" IS NULL OR m."createdAt" > r."lastReadAt")`;
  return rows[0]?.count ?? 0;
}
```

In `backend/src/chats/routes.ts`, add `import { listChats } from './inbox';` and append:

```ts
chatsRouter.get('/me/chats', requireAuth, buddyRoute(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json(await listChats(req.userId!, req.query.cursor, new Date()));
}));
```

- [ ] **Step 4: Unread chats on the Social home**

In `backend/src/social/home.ts`:

In the header, replace `// requests and unseen stickers from current buddies sent in the viewer's local today (chats join in S3) — the same`
with `// requests, unseen stickers from current buddies sent in the viewer's local today, and (S3) conversations with an unread message — the same`.

Add `import { unreadChatsCount } from '../chats/inbox';` after the `../buddies/requests` import.

Change the `unread` field of `SocialHomeDTO` to `unread: { requests: number; stickers: number; chats: number };`.

In `getSocialHome`, replace

```ts
  const [rings, timeline, highlights, requests, stickers] = await Promise.all([
    storyRingsFor(circle, now),
    timelineFor(circle, now),
    weeklyHighlightsFor(circle, now),
    countRequests(viewerId, now),
    unseenTodayStickerIds(circle, now),
  ]);
```

with

```ts
  const [rings, timeline, highlights, requests, stickers, chats] = await Promise.all([
    storyRingsFor(circle, now),
    timelineFor(circle, now),
    weeklyHighlightsFor(circle, now),
    countRequests(viewerId, now),
    unseenTodayStickerIds(circle, now),
    unreadChatsCount(viewerId),
  ]);
```

and `unread: { requests: requests.incoming, stickers: stickers.length },` with
`unread: { requests: requests.incoming, stickers: stickers.length, chats },`.

- [ ] **Step 5: Run the tests**

Run: `bash .superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh tests/chats tests/social`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/chats/inbox.ts backend/src/chats/routes.ts backend/src/social/home.ts backend/tests/chats/inbox.test.ts backend/tests/social/home.test.ts backend/tests/social/homeQueries.test.ts
git commit -m "feat(chats): the inbox, and unread chats on the Social home"
```

---

### Task 9: Chats notes

**Files:**
- Create: `backend/src/chats/notes.ts`
- Modify: `backend/src/chats/routes.ts`
- Test: create `backend/tests/chats/notes.test.ts`

**Interfaces:**
- Consumes: `checkStatusNote` (Task 3); `RATE_LIMITS.statusNote`; `buddyIdsOf(userId)` (`social/circle.ts`);
  `PERSON_SELECT`, `toPerson`.
- Produces: `STATUS_NOTE_TTL_MS = 86_400_000`; `StatusNoteDTO { text, createdAt, expiresAt }`,
  `BuddyNoteDTO extends StatusNoteDTO { person }`, `NotesDTO { mine, buddies }`;
  `getNotes(viewerId, now): Promise<NotesDTO>`, `shareStatusNote(userId, raw: unknown, now): Promise<StatusNoteDTO>`,
  `clearStatusNote(userId): Promise<void>`; routes `GET /me/notes` → `NotesDTO`, `PUT /me/notes { text }` →
  `{ note: StatusNoteDTO }`, `DELETE /me/notes` → 204.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/chats/notes.test.ts`:

```ts
import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import * as rateLimit from '../../src/lib/rateLimit';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { unpair } from '../../src/buddies/relations';
import { clearStatusNote, getNotes, shareStatusNote } from '../../src/chats/notes';
import { api, buddyUser, pairUp } from '../buddies/helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});
afterEach(() => jest.restoreAllMocks());

const NOW = new Date('2026-10-08T18:00:00Z');
const hours = (h: number) => new Date(NOW.getTime() + h * 3_600_000);
// Built at run time so no editor or tool can turn the lone surrogate into other bytes.
const LONE_SURROGATE = String.fromCharCode(0xd800);

it('keeps one note per author for 24 hours; sharing again replaces it; clearing removes it', async () => {
  const me = await buddyUser();
  expect(await shareStatusNote(me.id, ' early\nnight tonight ', NOW)).toEqual({ text: 'earlynight tonight', createdAt: NOW.toISOString(), expiresAt: hours(24).toISOString() });
  expect(await shareStatusNote(me.id, '10k or bust', hours(1))).toEqual({ text: '10k or bust', createdAt: hours(1).toISOString(), expiresAt: hours(25).toISOString() });
  expect((await getNotes(me.id, hours(2))).mine).toMatchObject({ text: '10k or bust' });
  expect((await getNotes(me.id, hours(25))).mine).toBeNull(); // expired: hidden before the sweep
  await clearStatusNote(me.id);
  await clearStatusNote(me.id); // nothing left: fine
  expect(await prisma.statusNote.count({ where: { authorId: me.id } })).toBe(0);
});

it("shows me my buddies' live notes, newest first, and never a stranger's or an ex-buddy's", async () => {
  const me = await buddyUser();
  const sam = await buddyUser({ displayName: 'Sam' });
  const ben = await buddyUser({ displayName: 'Ben' });
  const stranger = await buddyUser();
  await pairUp(me.id, sam.id);
  await pairUp(me.id, ben.id);
  await shareStatusNote(sam.id, 'day 6 streak!', NOW);
  await shareStatusNote(ben.id, 'early night tonight', hours(1));
  await shareStatusNote(stranger.id, 'hello', hours(1));
  const notes = await getNotes(me.id, hours(2));
  expect(notes.buddies.map((n) => [n.person.displayName, n.text])).toEqual([['Ben', 'early night tonight'], ['Sam', 'day 6 streak!']]);
  expect(notes.mine).toBeNull();
  await unpair(me.id, ben.id, hours(2));
  expect((await getNotes(me.id, hours(2))).buddies.map((n) => n.person.displayName)).toEqual(['Sam']);
  expect((await getNotes(ben.id, hours(2))).buddies).toEqual([]);
});

it('refuses a bad note before the limiter, and stores nothing', async () => {
  const me = await buddyUser();
  const spy = jest.spyOn(rateLimit, 'consumeRateLimit');
  for (const bad of ['', '   ', 'x'.repeat(61), '​', 9, undefined, `hi${LONE_SURROGATE}`]) {
    await expect(shareStatusNote(me.id, bad, NOW)).rejects.toMatchObject({ code: 'invalid_status_note' });
  }
  expect(spy).not.toHaveBeenCalled();
  expect(await shareStatusNote(me.id, '🔥'.repeat(60), NOW)).toMatchObject({ text: '🔥'.repeat(60) });
});

it('spends the 20-an-hour bucket on sharing, failing closed; clearing never touches it', async () => {
  const me = await buddyUser();
  const spy = jest.spyOn(rateLimit, 'consumeRateLimit').mockResolvedValueOnce('limited').mockResolvedValueOnce('unavailable');
  await expect(shareStatusNote(me.id, 'hi', NOW)).rejects.toMatchObject({ code: 'rate_limited' });
  await expect(shareStatusNote(me.id, 'hi', NOW)).rejects.toMatchObject({ code: 'try_later' });
  expect(spy).toHaveBeenCalledWith(rateLimit.RATE_LIMITS.statusNote, me.id);
  spy.mockReset();
  spy.mockRejectedValue(new Error('redis down'));
  await prisma.statusNote.create({ data: { authorId: me.id, text: 'mine', expiresAt: hours(24) } });
  const res = await (await api()).delete('/me/notes').set(await authHeaderFor(me.id));
  expect(res.status).toBe(204);
  expect(spy).not.toHaveBeenCalled();
  expect(await prisma.statusNote.count({ where: { authorId: me.id } })).toBe(0);
});

it('routes: GET is no-store, PUT answers { note }, a bad one is 400 invalid_status_note, auth is required', async () => {
  const me = await buddyUser();
  const agent = await api();
  const headers = await authHeaderFor(me.id);
  const put = await agent.put('/me/notes').set(headers).send({ text: 'early night tonight' });
  expect([put.status, Object.keys(put.body.note).sort()]).toEqual([200, ['createdAt', 'expiresAt', 'text']]);
  const get = await agent.get('/me/notes').set(headers);
  expect([get.headers['cache-control'], get.body.mine.text, get.body.buddies]).toEqual(['private, no-store', 'early night tonight', []]);
  expect((await agent.put('/me/notes').set(headers).send({ text: ['x'] })).body).toEqual({ error: 'invalid_status_note' });
  expect((await agent.get('/me/notes')).status).toBe(401);
});

// Tripwire only; the backend-wide grep (Task 19) is the real check.
it('never logs the note text (tripwire)', async () => {
  const me = await buddyUser();
  const spies = (['log', 'info', 'warn', 'error'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
  await shareStatusNote(me.id, 'secret note words', NOW);
  await expect(shareStatusNote(me.id, `secret note words ${'x'.repeat(60)}`, NOW)).rejects.toMatchObject({ code: 'invalid_status_note' });
  for (const spy of spies) for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain('secret note');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bash .superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh tests/chats/notes.test.ts`
Expected: FAIL — "Cannot find module '../../src/chats/notes'".

- [ ] **Step 3: Write the notes**

Create `backend/src/chats/notes.ts`:

```ts
// Chats notes (spec 2026-10-07 social §8.1): a short status over its author's avatar in the inbox, for 24 hours. One per
// author; sharing replaces it (new time, new expiry); clearing deletes it and is never limited or failed closed.
// Sanitised like a camp note (no newlines), 1-60 code points with something visible. Seen only by the author and
// their CURRENT buddies (pairs are read live: an unpair or block hides it at once); expired notes are hidden at read
// time and deleted by the social sweep. Not cleared by a check-in (that rule is the camp note's). No push.
// The text is user free text: never logged (not even its length), never sent to the coach.

import { prisma } from '../db/client';
import { BuddyError, limitOrThrow } from '../buddies/errors';
import { PERSON_SELECT, toPerson, type PersonDTO } from '../buddies/people';
import { RATE_LIMITS } from '../lib/rateLimit';
import { buddyIdsOf } from '../social/circle';
import { checkStatusNote } from './text';

export const STATUS_NOTE_TTL_MS = 24 * 60 * 60 * 1000;

export interface StatusNoteDTO { text: string; createdAt: string; expiresAt: string }
export interface BuddyNoteDTO extends StatusNoteDTO { person: PersonDTO }
export interface NotesDTO { mine: StatusNoteDTO | null; buddies: BuddyNoteDTO[] }

const toDTO = (n: { text: string; createdAt: Date; expiresAt: Date }): StatusNoteDTO => ({
  text: n.text,
  createdAt: n.createdAt.toISOString(),
  expiresAt: n.expiresAt.toISOString(),
});

/** My live note and my current buddies' live notes, newest first. */
export async function getNotes(viewerId: string, now: Date): Promise<NotesDTO> {
  const buddyIds = await buddyIdsOf(viewerId);
  const rows = await prisma.statusNote.findMany({
    where: { authorId: { in: [viewerId, ...buddyIds] }, expiresAt: { gt: now } },
    orderBy: [{ createdAt: 'desc' }, { authorId: 'asc' }],
    select: { authorId: true, text: true, createdAt: true, expiresAt: true, author: { select: PERSON_SELECT } },
  });
  const mine = rows.find((r) => r.authorId === viewerId);
  return {
    mine: mine ? toDTO(mine) : null,
    buddies: rows.filter((r) => r.authorId !== viewerId).map((r) => ({ person: toPerson(r.author), ...toDTO(r) })),
  };
}

export async function shareStatusNote(userId: string, raw: unknown, now: Date): Promise<StatusNoteDTO> {
  const text = checkStatusNote(raw);
  if (text === null) throw new BuddyError('invalid_status_note');
  await limitOrThrow(RATE_LIMITS.statusNote, userId);
  const expiresAt = new Date(now.getTime() + STATUS_NOTE_TTL_MS);
  const row = await prisma.statusNote.upsert({
    where: { authorId: userId },
    create: { authorId: userId, text, createdAt: now, expiresAt },
    update: { text, createdAt: now, expiresAt },
    select: { text: true, createdAt: true, expiresAt: true },
  });
  return toDTO(row);
}

/** Removing your own note always works: no limiter, so an outage never keeps words up. */
export async function clearStatusNote(userId: string): Promise<void> {
  await prisma.statusNote.deleteMany({ where: { authorId: userId } });
}
```

In `backend/src/chats/routes.ts`, add `import { clearStatusNote, getNotes, shareStatusNote } from './notes';` and append:

```ts
chatsRouter.get('/me/notes', requireAuth, buddyRoute(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json(await getNotes(req.userId!, new Date()));
}));

chatsRouter.put('/me/notes', requireAuth, buddyRoute(async (req, res) => {
  res.json({ note: await shareStatusNote(req.userId!, (req.body as { text?: unknown } | undefined)?.text, new Date()) });
}));

// Never rate-limited: removing your own note must work even while the limiter is down.
chatsRouter.delete('/me/notes', requireAuth, buddyRoute(async (req, res) => {
  await clearStatusNote(req.userId!);
  res.status(204).end();
}));
```

- [ ] **Step 4: Run the tests**

Run: `bash .superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh tests/chats/notes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/chats/notes.ts backend/src/chats/routes.ts backend/tests/chats/notes.test.ts
git commit -m "feat(chats): Chats notes for 24 hours, seen by current buddies only"
```

---

### Task 10: Reports

**Files:**
- Create: `backend/src/chats/reports.ts`
- Modify: `backend/src/chats/routes.ts`
- Test: create `backend/tests/chats/reports.test.ts`

**Interfaces:**
- Consumes: `RATE_LIMITS.report` (Task 3); `findPair`; `loadCircle`, `noteIsLive` (S2); `cardTypeOf` (Task 4).
- Produces: `REPORT_RETENTION_DAYS = 90`; `fileReport(reporterId, body: unknown, now): Promise<void>`; route
  `POST /me/reports { targetType: 'message' | 'status_note' | 'camp_note', targetId, reason: 'spam' | 'harassment' |
  'other' }` → 204.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/chats/reports.test.ts`:

```ts
import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import * as rateLimit from '../../src/lib/rateLimit';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { setBuddyNotifyQueue } from '../../src/buddies/notifyQueue';
import { blockBuddy } from '../../src/buddies/relations';
import { sendMessage, unsendMessage } from '../../src/chats/messages';
import { shareStatusNote } from '../../src/chats/notes';
import { fileReport } from '../../src/chats/reports';
import { shareCampNote } from '../../src/social/campNotes';
import { RecordingQueue, api, buddyUser, pairUp } from '../buddies/helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});
let queue: RecordingQueue;
beforeEach(() => {
  queue = new RecordingQueue();
  setBuddyNotifyQueue(queue);
});
afterEach(() => {
  setBuddyNotifyQueue(null);
  jest.restoreAllMocks();
});

const NOW = new Date('2026-10-08T05:00:00Z'); // 05:00 for these UTC users: night, so camp notes are live

async function buddies() {
  const me = await buddyUser();
  const sam = await buddyUser();
  await pairUp(me.id, sam.id);
  return { me, sam };
}

it("stores a message report with the reporter, the reported person, the reason and the text as it was; a second report updates it", async () => {
  const { me, sam } = await buddies();
  const message = await sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'buy cheap pills here' }, NOW);
  queue.jobs = [];
  await fileReport(me.id, { targetType: 'message', targetId: message.id, reason: 'spam' }, NOW);
  await fileReport(me.id, { targetType: 'message', targetId: message.id, reason: 'harassment' }, NOW);
  const rows = await prisma.report.findMany({ where: { reporterId: me.id } });
  expect(rows.map((r) => [r.reportedUserId, r.targetType, r.targetId, r.reason, r.excerpt])).toEqual([[sam.id, 'MESSAGE', message.id, 'HARASSMENT', 'buy cheap pills here']]);
  // The reported person is never told: no job, nothing to read.
  expect(queue.jobs).toEqual([]);
  expect((await (await api()).get('/me/reports').set(await authHeaderFor(sam.id))).status).toBe(404);
});

it("snapshots a buddy's Chats note and camp note, by their author's id", async () => {
  const { me, sam } = await buddies();
  await shareStatusNote(sam.id, 'mean words here', NOW);
  await shareCampNote(sam.id, 'more mean words', NOW);
  await fileReport(me.id, { targetType: 'status_note', targetId: sam.id, reason: 'harassment' }, NOW);
  await fileReport(me.id, { targetType: 'camp_note', targetId: sam.id, reason: 'other' }, NOW);
  const rows = await prisma.report.findMany({ where: { reporterId: me.id } });
  expect(rows.map((r) => [r.targetType, r.targetId, r.reportedUserId, r.excerpt]).sort()).toEqual([
    ['CAMP_NOTE', sam.id, sam.id, 'more mean words'],
    ['STATUS_NOTE', sam.id, sam.id, 'mean words here'],
  ]);
});

it('only what I can see now: my own message, an unsent one, a stranger and a missing note are report_target_gone', async () => {
  const { me, sam } = await buddies();
  const stranger = await buddyUser();
  const mine = await sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'hi' }, NOW);
  const theirs = await sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'bye' }, NOW);
  await unsendMessage(sam.id, me.id, theirs.id, NOW);
  await shareStatusNote(stranger.id, 'stranger note', NOW);
  const cases = [
    { targetType: 'message', targetId: mine.id },
    { targetType: 'message', targetId: theirs.id },
    { targetType: 'message', targetId: '00000000-0000-4000-8000-000000000000' },
    { targetType: 'status_note', targetId: stranger.id },
    { targetType: 'status_note', targetId: sam.id },
    { targetType: 'camp_note', targetId: sam.id },
    { targetType: 'message', targetId: 'nope' },
  ];
  for (const c of cases) await expect(fileReport(me.id, { ...c, reason: 'spam' }, NOW)).rejects.toMatchObject({ code: 'report_target_gone' });
  expect(await prisma.report.count({ where: { reporterId: me.id } })).toBe(0);
});

it('an unknown target type or reason is invalid_report, before the limiter', async () => {
  const { me, sam } = await buddies();
  const spy = jest.spyOn(rateLimit, 'consumeRateLimit');
  for (const body of [{ targetType: 'user', targetId: sam.id, reason: 'spam' }, { targetType: 'message', targetId: sam.id, reason: 'rude' }, {}, null, ['message']]) {
    await expect(fileReport(me.id, body, NOW)).rejects.toMatchObject({ code: 'invalid_report' });
  }
  expect(spy).not.toHaveBeenCalled();
});

it('reports spend the 20-an-hour bucket, failing closed', async () => {
  const { me, sam } = await buddies();
  const message = await sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'x' }, NOW);
  const spy = jest.spyOn(rateLimit, 'consumeRateLimit').mockResolvedValueOnce('limited').mockResolvedValueOnce('unavailable');
  const body = { targetType: 'message', targetId: message.id, reason: 'spam' };
  await expect(fileReport(me.id, body, NOW)).rejects.toMatchObject({ code: 'rate_limited' });
  await expect(fileReport(me.id, body, NOW)).rejects.toMatchObject({ code: 'try_later' });
  expect(spy).toHaveBeenCalledWith(rateLimit.RATE_LIMITS.report, me.id);
});

it('"Block too": the report and its excerpt outlive the block that deletes the conversation', async () => {
  const { me, sam } = await buddies();
  const message = await sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'threatening words' }, NOW);
  const res = await (await api()).post('/me/reports').set(await authHeaderFor(me.id)).send({ targetType: 'message', targetId: message.id, reason: 'harassment' });
  expect(res.status).toBe(204);
  await blockBuddy(me.id, sam.id, NOW);
  expect(await prisma.report.findFirstOrThrow({ where: { reporterId: me.id } })).toMatchObject({ excerpt: 'threatening words', reportedUserId: sam.id });
});

// Tripwire only; the backend-wide grep (Task 19) is the real check.
it('never logs the reported text (tripwire)', async () => {
  const { me, sam } = await buddies();
  const message = await sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'secret report words' }, NOW);
  const spies = (['log', 'info', 'warn', 'error'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
  await fileReport(me.id, { targetType: 'message', targetId: message.id, reason: 'spam' }, NOW);
  for (const spy of spies) for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain('secret report');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bash .superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh tests/chats/reports.test.ts`
Expected: FAIL — "Cannot find module '../../src/chats/reports'".

- [ ] **Step 3: Write reports**

Create `backend/src/chats/reports.ts`:

```ts
// Reports (spec 2026-10-07 social §9): a message, a Chats note or a camp note the reporter can see right now. The row
// keeps the reporter, the reported person, the target (a message id, or for a note its author's id), the reason and
// an excerpt of the text at report time — so a report outlives the unpair or block ("Block too") that deletes the
// conversation — and is kept 90 days (social sweep). One row per reporter and target: a second report updates it.
// Nothing reads reports through the API (no admin UI in this spec); the reported person is never told; nothing is
// logged, not even the reason. Anything the reporter cannot see is report_target_gone.

import type { ReportReason, ReportTarget } from '@prisma/client';
import { prisma } from '../db/client';
import { BuddyError, UUID_RE, limitOrThrow } from '../buddies/errors';
import { findPair } from '../buddies/pairs';
import { RATE_LIMITS } from '../lib/rateLimit';
import { noteIsLive } from '../social/campNotes';
import { loadCircle } from '../social/circle';

export const REPORT_RETENTION_DAYS = 90;

const TARGETS: Readonly<Record<string, ReportTarget>> = { message: 'MESSAGE', status_note: 'STATUS_NOTE', camp_note: 'CAMP_NOTE' };
const REASONS: Readonly<Record<string, ReportReason>> = { spam: 'SPAM', harassment: 'HARASSMENT', other: 'OTHER' };
const own = <T>(table: Readonly<Record<string, T>>, key: unknown): T | undefined =>
  typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;

interface Target { reportedUserId: string; excerpt: string | null }

async function resolveTarget(reporterId: string, type: ReportTarget, targetId: string, now: Date): Promise<Target> {
  if (type === 'MESSAGE') {
    // Their live message in a conversation of mine.
    const m = await prisma.message.findFirst({
      where: { id: targetId, deletedAt: null, senderId: { not: reporterId }, conversation: { OR: [{ userAId: reporterId }, { userBId: reporterId }] } },
      select: { senderId: true, text: true, card: true },
    });
    if (!m) throw new BuddyError('report_target_gone');
    const quoted = (m.card as unknown as { text?: unknown } | null)?.text;
    return { reportedUserId: m.senderId, excerpt: m.text ?? (typeof quoted === 'string' ? quoted : null) };
  }
  if (type === 'STATUS_NOTE') {
    const note = await prisma.statusNote.findFirst({ where: { authorId: targetId, expiresAt: { gt: now } }, select: { text: true } });
    if (targetId === reporterId || !note || !(await findPair(reporterId, targetId))) throw new BuddyError('report_target_gone');
    return { reportedUserId: targetId, excerpt: note.text };
  }
  const circle = await loadCircle(reporterId, now);
  const note = await prisma.campNote.findUnique({ where: { authorId: targetId }, select: { authorId: true, text: true, createdAt: true, expiresAt: true } });
  if (targetId === reporterId || !circle.members.has(targetId) || !note || !noteIsLive(note, circle, now)) throw new BuddyError('report_target_gone');
  return { reportedUserId: targetId, excerpt: note.text };
}

export async function fileReport(reporterId: string, body: unknown, now: Date): Promise<void> {
  const b = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const targetType = own(TARGETS, b.targetType);
  const reason = own(REASONS, b.reason);
  if (!targetType || !reason) throw new BuddyError('invalid_report');
  if (typeof b.targetId !== 'string' || !UUID_RE.test(b.targetId)) throw new BuddyError('report_target_gone');
  const targetId = b.targetId;
  await limitOrThrow(RATE_LIMITS.report, reporterId);
  const { reportedUserId, excerpt } = await resolveTarget(reporterId, targetType, targetId, now);
  await prisma.report.upsert({
    where: { reporterId_targetType_targetId: { reporterId, targetType, targetId } },
    create: { reporterId, reportedUserId, targetType, targetId, reason, excerpt, createdAt: now },
    update: { reportedUserId, reason, excerpt, createdAt: now },
  });
}
```

In `backend/src/chats/routes.ts`, add `import { fileReport } from './reports';` and append:

```ts
chatsRouter.post('/me/reports', requireAuth, buddyRoute(async (req, res) => {
  await fileReport(req.userId!, req.body, new Date());
  res.status(204).end();
}));
```

- [ ] **Step 4: Run the tests**

Run: `bash .superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh tests/chats/reports.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/chats/reports.ts backend/src/chats/routes.ts backend/tests/chats/reports.test.ts
git commit -m "feat(chats): report a message, a Chats note or a camp note, with its text kept for review"
```

---

### Task 11: Unpair and block delete the conversation; the sweep removes old notes and reports

**Files:**
- Modify: `backend/src/buddies/relations.ts`, `backend/src/social/sweep.ts`
- Test: create `backend/tests/chats/purge.test.ts`

**Interfaces:**
- Consumes: `unpair`, `block`, `blockBuddy` (`buddies/relations.ts`); `orderedPair`; `REPORT_RETENTION_DAYS` (Task 10);
  `sendMessage`, `listThread`, `setReaction`, `markRead` (Tasks 4–7); `listChats`, `unreadChatsCount` (Task 8).
- Produces: `unpair` and `block` also delete the pair's `Conversation` in their transaction; `runSocialSweep(now)`
  resolves `{ notes, highlights, statusNotes, reports }`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/chats/purge.test.ts`:

```ts
import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { orderedPair } from '../../src/buddies/pairs';
import { setBuddyNotifyQueue } from '../../src/buddies/notifyQueue';
import { block, blockBuddy, unpair } from '../../src/buddies/relations';
import { listChats, unreadChatsCount } from '../../src/chats/inbox';
import { listThread, markRead, sendMessage, setReaction } from '../../src/chats/messages';
import { runSocialSweep } from '../../src/social/sweep';
import { RecordingQueue, buddyUser, pairUp } from '../buddies/helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});
beforeEach(() => setBuddyNotifyQueue(new RecordingQueue()));
afterEach(() => setBuddyNotifyQueue(null));

const NOW = new Date('2026-10-08T18:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

async function talking() {
  const me = await buddyUser();
  const sam = await buddyUser();
  await pairUp(me.id, sam.id);
  const hi = await sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'hi' }, NOW);
  await sendMessage(sam.id, me.id, { kind: 'STICKER', sticker: 'CHEER' }, NOW);
  await setReaction(sam.id, me.id, hi.id, 'HEART', NOW);
  await markRead(sam.id, me.id, NOW);
  const conversation = await prisma.conversation.findUniqueOrThrow({ where: { userAId_userBId: orderedPair(me.id, sam.id) } });
  return { me, sam, conversationId: conversation.id };
}

async function chatRows(conversationId: string) {
  const [conversations, messages, reads] = await Promise.all([
    prisma.conversation.count({ where: { id: conversationId } }),
    prisma.message.count({ where: { conversationId } }),
    prisma.conversationRead.count({ where: { conversationId } }),
  ]);
  return { conversations, messages, reads };
}

it('unpair deletes the conversation for both people, with its messages, reactions and reads; a re-pair starts empty', async () => {
  const { me, sam, conversationId } = await talking();
  const ben = await buddyUser();
  await pairUp(me.id, ben.id);
  await sendMessage(ben.id, me.id, { kind: 'TEXT', text: 'still here' }, NOW);
  await unpair(sam.id, me.id, NOW);
  expect(await chatRows(conversationId)).toEqual({ conversations: 0, messages: 0, reads: 0 });
  expect(await prisma.messageReaction.count({ where: { reactorId: sam.id } })).toBe(0);
  expect((await listChats(me.id, undefined, NOW)).chats.map((c) => c.buddy.id)).toEqual([ben.id]);
  expect(await unreadChatsCount(me.id)).toBe(1);
  await expect(listThread(me.id, sam.id, undefined, NOW)).rejects.toMatchObject({ code: 'not_buddies' });
  await pairUp(me.id, sam.id);
  expect((await listThread(me.id, sam.id, undefined, NOW)).messages).toEqual([]);
});

it('a block, from either side, deletes it too', async () => {
  for (const blockerIsMe of [true, false]) {
    const { me, sam, conversationId } = await talking();
    if (blockerIsMe) await blockBuddy(me.id, sam.id, NOW);
    else await blockBuddy(sam.id, me.id, NOW);
    expect([blockerIsMe, await chatRows(conversationId)]).toEqual([blockerIsMe, { conversations: 0, messages: 0, reads: 0 }]);
    await expect(sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'hello?' }, NOW)).rejects.toMatchObject({ code: 'not_buddies' });
  }
});

it('a block between people with no pair still clears a conversation left behind', async () => {
  const me = await buddyUser();
  const sam = await buddyUser();
  const conversation = await prisma.conversation.create({ data: orderedPair(me.id, sam.id) });
  await prisma.message.create({ data: { conversationId: conversation.id, senderId: sam.id, kind: 'TEXT', text: 'left behind' } });
  await block(me.id, sam.id, NOW);
  expect(await chatRows(conversation.id)).toEqual({ conversations: 0, messages: 0, reads: 0 });
});

it('unpair leaves reports in place', async () => {
  const { me, sam } = await talking();
  const message = await prisma.message.findFirstOrThrow({ where: { senderId: sam.id } });
  await prisma.report.create({ data: { reporterId: me.id, reportedUserId: sam.id, targetType: 'MESSAGE', targetId: message.id, reason: 'SPAM' } });
  await unpair(me.id, sam.id, NOW);
  expect(await prisma.report.count({ where: { reporterId: me.id } })).toBe(1);
});

it('a message racing an unpair is either deleted with the conversation or refused, never left behind', async () => {
  for (let i = 0; i < 3; i++) {
    const { me, sam, conversationId } = await talking();
    const [send] = await Promise.allSettled([
      sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'racing' }, NOW),
      unpair(sam.id, me.id, NOW),
    ]);
    if (send.status === 'rejected') expect(send.reason).toMatchObject({ code: 'not_buddies' });
    expect(await chatRows(conversationId)).toEqual({ conversations: 0, messages: 0, reads: 0 });
    expect(await prisma.conversation.count({ where: orderedPair(me.id, sam.id) })).toBe(0);
  }
});

it('the sweep deletes expired Chats notes and reports older than 90 days, and keeps the rest', async () => {
  const a = await buddyUser();
  const b = await buddyUser();
  await prisma.statusNote.create({ data: { authorId: a.id, text: 'old', createdAt: new Date(NOW.getTime() - 2 * DAY), expiresAt: new Date(NOW.getTime() - DAY) } });
  await prisma.statusNote.create({ data: { authorId: b.id, text: 'live', expiresAt: new Date(NOW.getTime() + DAY) } });
  const old = await prisma.report.create({ data: { reporterId: a.id, reportedUserId: b.id, targetType: 'STATUS_NOTE', targetId: b.id, reason: 'SPAM', createdAt: new Date(NOW.getTime() - 91 * DAY) } });
  const recent = await prisma.report.create({ data: { reporterId: b.id, reportedUserId: a.id, targetType: 'STATUS_NOTE', targetId: a.id, reason: 'OTHER', createdAt: new Date(NOW.getTime() - 89 * DAY) } });
  const result = await runSocialSweep(NOW);
  expect(result.statusNotes).toBeGreaterThanOrEqual(1);
  expect(result.reports).toBeGreaterThanOrEqual(1);
  expect(await prisma.statusNote.findMany({ where: { authorId: { in: [a.id, b.id] } }, select: { text: true } })).toEqual([{ text: 'live' }]);
  expect((await prisma.report.findMany({ where: { id: { in: [old.id, recent.id] } }, select: { id: true } })).map((r) => r.id)).toEqual([recent.id]);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bash .superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh tests/chats/purge.test.ts`
Expected: FAIL — the conversation survives unpair and block; `result.statusNotes` is undefined.

- [ ] **Step 3: Delete the conversation with the pair**

In `backend/src/buddies/relations.ts`:

Append to the header (after line 2) the line:

```ts
// S3 (spec 2026-10-07 social §9): unpair and block also delete the pair's conversation for both people (its messages,
// reactions and reads cascade); reports keep their own excerpt and stay.
```

In `unpair`, after `await tx.buddyMute.deleteMany({ where: mutesEitherWay(userId, buddyId) });` add:

```ts
    // The conversation goes with the pair, for both people (a send in flight committed first: it is in here too).
    await tx.conversation.deleteMany({ where: orderedPair(userId, buddyId) });
```

In `block`, after the `if (removed.count > 0) { … }` block add:

```ts
    // Chats: the conversation goes, pair or not — nothing is left to read back.
    await tx.conversation.deleteMany({ where: orderedPair(blockerId, blockedId) });
```

- [ ] **Step 4: Sweep the notes and old reports**

Replace `backend/src/social/sweep.ts` with:

```ts
// The social sweep (S2, S3), on the existing hourly recap-sweep tick (sync/worker.ts): deletes camp notes and Chats
// notes past their expiry (reads already hide them; this removes the free text itself), week-highlight caches more than
// HIGHLIGHTS_RETENTION_WEEKS old (only the latest final week is ever served), and reports older than
// REPORT_RETENTION_DAYS. Returns counts only.

import { civilDateToUtcMidnight } from '../biometrics/civilDate';
import { REPORT_RETENTION_DAYS } from '../chats/reports';
import { prisma } from '../db/client';
import { shiftDate } from '../scoring/dates';

export const HIGHLIGHTS_RETENTION_WEEKS = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function runSocialSweep(now: Date): Promise<{ notes: number; highlights: number; statusNotes: number; reports: number }> {
  const notes = await prisma.campNote.deleteMany({ where: { expiresAt: { lte: now } } });
  const statusNotes = await prisma.statusNote.deleteMany({ where: { expiresAt: { lte: now } } });
  const reports = await prisma.report.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - REPORT_RETENTION_DAYS * DAY_MS) } } });
  const cutoff = civilDateToUtcMidnight(shiftDate(now.toISOString().slice(0, 10), -7 * HIGHLIGHTS_RETENTION_WEEKS));
  const highlights = await prisma.weeklyHighlights.deleteMany({ where: { weekStart: { lt: cutoff } } });
  return { notes: notes.count, highlights: highlights.count, statusNotes: statusNotes.count, reports: reports.count };
}
```

- [ ] **Step 5: Run the tests**

Run: `bash .superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh tests/chats tests/buddies/relations.test.ts tests/social/retention.test.ts tests/recap/worker.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/buddies/relations.ts backend/src/social/sweep.ts backend/tests/chats/purge.test.ts
git commit -m "feat(chats): unpair and block delete the conversation; the sweep removes old notes and reports"
```

---

### Task 12: The `dm_message` push

**Files:**
- Create: `backend/src/chats/dmPush.ts`
- Modify: `backend/src/coach/push.ts`, `backend/src/buddies/notify.ts`, `backend/src/buddies/notifyQueue.ts`,
  `backend/src/chats/messages.ts`, `backend/src/users/notifications.ts`
- Test: create `backend/tests/chats/push.test.ts`; modify `backend/tests/buddies/notify.test.ts`

**Interfaces:**
- Consumes: `previewText` (Task 3); `cardTypeOf` (Task 4); `sendBuddyNotice`, `pushName`, `BuddyNotice`,
  `NoticeOutcome` (`buddies/notify.ts`); `enqueueBuddyNotice` (`buddies/notifyQueue.ts`); `withTimeout`;
  `connection` (`sync/queue.ts`).
- Produces:
  - `push.ts`: `BuddyPushKind` gains `'dm_message'` (and `BUDDY_PUSH_KINDS`); `BuddyPushSlots.dm_message =
    { name: string; preview?: string }`; `isPushPreview(text: unknown): text is string`.
  - `notify.ts`: `NoticeOutcome` gains `'grouped'`; `sendBuddyNotice(sender, notice, now?, opts?: { claim?: () =>
    Promise<boolean> })`; setting `dm_message → notifyDirectMessages`.
  - `dmPush.ts`: `DM_PUSH_GROUP_SECONDS = 120`, `claimDmPushSlot(recipientId, actorId, redis?): Promise<boolean>`,
    `pushPreviewOf(m: { text: string | null; card: unknown }): string`,
    `runDmNotice(data: BuddyNotice, deps: { pushSender; now; claim? }): Promise<NoticeOutcome | 'dropped'>`.
  - `sendMessage` enqueues one `dm_message` job (refId = the message id, slots `{ name }`) per TEXT or CARD message.
  - `NotificationSettings` gains `notifyDirectMessages` and `showMessagePreviews` (GET/PUT `/me/notifications`).

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/chats/push.test.ts`:

```ts
import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { buddyPushPayload, isPushPreview, renderBuddyPush } from '../../src/coach/push';
import { setBuddyNotifyQueue } from '../../src/buddies/notifyQueue';
import { unpair } from '../../src/buddies/relations';
import { claimDmPushSlot, pushPreviewOf, runDmNotice } from '../../src/chats/dmPush';
import { sendMessage, unsendMessage } from '../../src/chats/messages';
import { RecordingQueue, RecordingSender, addToken, buddyUser, pairUp } from '../buddies/helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});
let queue: RecordingQueue;
let sender: RecordingSender;
beforeEach(() => {
  queue = new RecordingQueue();
  sender = new RecordingSender();
  setBuddyNotifyQueue(queue);
});
afterEach(() => setBuddyNotifyQueue(null));

const NOW = new Date('2026-10-07T12:00:00Z'); // noon UTC: outside the default quiet hours (22:00-07:00)

async function chat() {
  const ana = await buddyUser({ displayName: 'Ana' });
  const sam = await buddyUser({ displayName: 'Sam' });
  await pairUp(ana.id, sam.id);
  await addToken(sam.id);
  return { ana, sam };
}

it('renders dm_message from typed slots: no preview by default, the one-line preview when sent', () => {
  expect(renderBuddyPush('dm_message', { name: 'Ana' })).toEqual({ title: 'Ana sent you a message', body: 'Open the app to read it.' });
  expect(renderBuddyPush('dm_message', { name: 'Ana', preview: 'rough night lol' })).toEqual({ title: 'Ana', body: 'rough night lol' });
  for (const preview of ['', 'two\nlines', ' padded ', 'x'.repeat(81), `${'x'.repeat(81)}…`, 7, '‮evil']) {
    expect(() => renderBuddyPush('dm_message', { name: 'Ana', preview } as never)).toThrow();
  }
  expect(() => renderBuddyPush('dm_message', { name: 'Ana', preview: 'hi', extra: 1 } as never)).toThrow();
  expect(isPushPreview(`${'x'.repeat(80)}…`)).toBe(true);
  expect(buddyPushPayload('dm_message', { name: 'Ana' }, '00000000-0000-4000-8000-000000000000').data).toEqual({ kind: 'dm_message', refId: '00000000-0000-4000-8000-000000000000' });
});

it('previews a text on one line and a card without text with a fixed phrase', () => {
  expect(pushPreviewOf({ text: 'rough\nnight', card: null })).toBe('rough night');
  expect(pushPreviewOf({ text: 'x'.repeat(90), card: null })).toBe(`${'x'.repeat(80)}…`);
  expect(pushPreviewOf({ text: 'same here', card: { type: 'note', text: 'early night' } })).toBe('same here');
  expect(pushPreviewOf({ text: null, card: { type: 'checkin', about: 'sender', localDate: '2026-10-07', mood: 'RESTED' } })).toBe('Shared their check-in');
  expect(pushPreviewOf({ text: null, card: { type: 'checkin', about: 'recipient', localDate: '2026-10-07', mood: null } })).toBe('Replied to your story');
  expect(pushPreviewOf({ text: null, card: { type: 'badge', family: 'SLEEP_GOAL', level: 2 } })).toBe('Replied to your story');
  expect(pushPreviewOf({ text: null, card: { type: 'note', text: 'x' } })).toBe('Replied to your note');
  expect(pushPreviewOf({ text: null, card: { type: 'camp_note', text: 'x' } })).toBe('Replied to your camp note');
});

it('a text enqueues one dm_message job carrying the message id and the name, never the text', async () => {
  const { ana, sam } = await chat();
  const message = await sendMessage(ana.id, sam.id, { kind: 'TEXT', text: 'secret chat words' }, NOW);
  expect(queue.jobs.map((j) => j.data)).toEqual([{ kind: 'dm_message', recipientId: sam.id, actorId: ana.id, refId: message.id, slots: { name: 'Ana' } }]);
  expect(JSON.stringify(queue.jobs)).not.toContain('secret chat');
});

it('sends "{name} sent you a message" with id-only data; with previews on, the name and the text', async () => {
  const { ana, sam } = await chat();
  await sendMessage(ana.id, sam.id, { kind: 'TEXT', text: 'rough night lol' }, NOW);
  await queue.drain(sender, NOW);
  expect(sender.calls.map((c) => [c.payload.title, c.payload.body, c.payload.data])).toEqual([['Ana sent you a message', 'Open the app to read it.', { kind: 'dm_message', refId: ana.id }]]);
  // A second conversation, previews on.
  const ben = await buddyUser({ displayName: 'Ben' });
  await pairUp(ben.id, sam.id);
  await prisma.user.update({ where: { id: sam.id }, data: { showMessagePreviews: true } });
  await sendMessage(ben.id, sam.id, { kind: 'TEXT', text: 'early night\ntonight?' }, NOW);
  await queue.drain(sender, NOW);
  expect([sender.calls[1]!.payload.title, sender.calls[1]!.payload.body]).toEqual(['Ben', 'early night tonight?']);
});

it('groups: at most one push per conversation per 2 minutes', async () => {
  const { ana, sam } = await chat();
  for (const text of ['one', 'two', 'three']) await sendMessage(ana.id, sam.id, { kind: 'TEXT', text }, NOW);
  await queue.drain(sender, NOW);
  expect(sender.calls).toHaveLength(1);
});

it('sends nothing for a message unsent before the job ran, for an ex-buddy, a mute, the setting off, or quiet hours', async () => {
  const cases: Array<[string, (ana: string, sam: string, messageId: string) => Promise<unknown>, Date]> = [
    ['unsent', (ana, sam, id) => unsendMessage(ana, sam, id, NOW), NOW],
    ['unpaired', (ana, sam) => unpair(sam, ana, NOW), NOW],
    ['muted', (ana, sam) => prisma.buddyMute.create({ data: { muterId: sam, mutedId: ana } }), NOW],
    ['setting off', (_ana, sam) => prisma.user.update({ where: { id: sam }, data: { notifyDirectMessages: false } }), NOW],
    ['quiet hours', async () => undefined, new Date('2026-10-07T23:00:00Z')],
  ];
  for (const [name, setUp, at] of cases) {
    const { ana, sam } = await chat();
    const message = await sendMessage(ana.id, sam.id, { kind: 'TEXT', text: 'hi' }, NOW);
    await setUp(ana.id, sam.id, message.id);
    await queue.drain(sender, at);
    expect([name, sender.calls.length]).toEqual([name, 0]);
  }
});

it('a sticker message sends only its buddy_sticker push, never a second dm_message', async () => {
  const { ana, sam } = await chat();
  await sendMessage(ana.id, sam.id, { kind: 'STICKER', sticker: 'CHEER' }, NOW);
  expect(queue.jobs.map((j) => j.data.kind)).toEqual(['buddy_sticker']);
});

it('a slot that cannot be claimed sends nothing: grouped, and a Redis failure fails closed', async () => {
  const { ana, sam } = await chat();
  const message = await sendMessage(ana.id, sam.id, { kind: 'TEXT', text: 'hi' }, NOW);
  const data = queue.jobs[0]!.data;
  expect(await runDmNotice(data, { pushSender: sender, now: NOW, claim: async () => false })).toBe('grouped');
  expect(sender.calls).toHaveLength(0);
  const failing = { set: async () => { throw new Error('redis down'); } };
  const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
  expect(await claimDmPushSlot(sam.id, ana.id, failing)).toBe(false);
  expect(errors.mock.calls.map((c) => JSON.parse(String(c[0])).event)).toEqual(['chats.push_slot_unavailable']);
  errors.mockRestore();
  expect(message.id).toBe(data.refId);
});
```

In `backend/tests/buddies/notify.test.ts`, in `it('reads and saves the buddy switches', …)`, replace

```ts
    expect((await agent.get('/me/notifications').set(headers)).body).toEqual({
      recapPushEnabled: true, notifyBuddyStickers: true, notifyBuddyRequests: true, notifyBuddyBadges: true,
    });
    const res = await agent.put('/me/notifications').set(headers).send({ notifyBuddyRequests: false });
    expect(res.body).toEqual({ recapPushEnabled: true, notifyBuddyStickers: true, notifyBuddyRequests: false, notifyBuddyBadges: true });
```

with

```ts
    expect((await agent.get('/me/notifications').set(headers)).body).toEqual({
      recapPushEnabled: true, notifyBuddyStickers: true, notifyBuddyRequests: true, notifyBuddyBadges: true,
      notifyDirectMessages: true, showMessagePreviews: false,
    });
    const res = await agent.put('/me/notifications').set(headers).send({ notifyBuddyRequests: false, showMessagePreviews: true });
    expect(res.body).toEqual({
      recapPushEnabled: true, notifyBuddyStickers: true, notifyBuddyRequests: false, notifyBuddyBadges: true,
      notifyDirectMessages: true, showMessagePreviews: true,
    });
```

- [ ] **Step 2: Run them to see them fail**

Run: `bash .superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh tests/chats/push.test.ts tests/buddies/notify.test.ts`
Expected: FAIL — "Cannot find module '../../src/chats/dmPush'"; `isPushPreview` is not exported; the settings lack the two keys.

- [ ] **Step 3: The push kind and its template**

In `backend/src/coach/push.ts`:

After the header paragraph that ends `// unless the payload matches exactly, so the closed-table guarantee still holds.` add:

```ts
//
// DM_MESSAGE (spec 2026-10-07 social §10) amends the rule above for one kind: with the RECIPIENT's previews on, its body
// is the sender's own message on one line (at most 80 code points plus "…", checked by isPushPreview), the only free
// text a push may ever carry; never a health value, never model output. Without previews it is a fixed template.
```

Replace the kind declarations

```ts
export type BuddyPushKind = 'buddy_sticker' | 'buddy_request' | 'buddy_paired' | 'buddy_badge';
export const BUDDY_PUSH_KINDS: readonly BuddyPushKind[] = ['buddy_sticker', 'buddy_request', 'buddy_paired', 'buddy_badge'];
```

with

```ts
export type BuddyPushKind = 'buddy_sticker' | 'buddy_request' | 'buddy_paired' | 'buddy_badge' | 'dm_message';
export const BUDDY_PUSH_KINDS: readonly BuddyPushKind[] = ['buddy_sticker', 'buddy_request', 'buddy_paired', 'buddy_badge', 'dm_message'];
```

Change the `BuddyPushData` comment to
`/** refId: the actor's user id (sticker, paired, badge, dm_message) or the request id (request). */`.

In `interface BuddyPushSlots`, after `buddy_badge: { name: string; family: AchievementFamily; level: number };` add
`dm_message: { name: string; preview?: string };`.

After `isPushName` add:

```ts
/** A dm_message preview: one trimmed line, no control or format characters, 1-80 code points, or 81 ending in "…". */
export function isPushPreview(text: unknown): text is string {
  if (typeof text !== 'string' || text.length === 0 || text !== text.trim()) return false;
  if (/[\p{Cc}\p{Cf}\p{Cs}  ]/u.test(text)) return false;
  const length = [...text].length;
  return length <= 80 || (length === 81 && text.endsWith('…'));
}
```

In `BUDDY_BODIES` add `dm_message: 'Open the app to read it.',`, and in `renderBuddyPush`'s switch, before
`default:`, add:

```ts
    case 'dm_message':
      if (keys === 'name') return { title: `${name()} sent you a message`, body };
      if (keys === 'name,preview' && isPushPreview(s.preview)) return { title: name(), body: s.preview };
      return slotInvalid();
```

- [ ] **Step 4: The setting, the outcome and the claim hook**

In `backend/src/buddies/notify.ts`:

Change `NoticeOutcome` to
`export type NoticeOutcome = 'sent' | 'setting_off' | 'muted' | 'quiet_hours' | 'no_devices' | 'no_recipient' | 'grouped' | 'failed';`,
add `dm_message: 'notifyDirectMessages',` to `SETTING`, add `notifyDirectMessages: true` to the user `select` in
`sendBuddyNotice`, change its signature to

```ts
export async function sendBuddyNotice<K extends BuddyPushKind>(
  sender: PushSender,
  notice: BuddyNotice<K>,
  now: Date = new Date(),
  opts: { claim?: () => Promise<boolean> } = {},
): Promise<NoticeOutcome> {
```

and after `if (rows.length === 0) return 'no_devices';` add:

```ts
    // The last gate (dm_message grouping): claimed only when a push would really go, so a skipped one never uses the slot.
    if (opts.claim && !(await opts.claim())) return 'grouped';
```

Append to the header comment: `// A caller may pass a claim (dm_message's 2-minute grouping): checked last, right before sending.`

- [ ] **Step 5: The job**

Create `backend/src/chats/dmPush.ts`:

```ts
// The dm_message push (spec 2026-10-07 social §10). The job carries the message id, never its text: the text is read
// here, at send time, and only when the recipient has turned previews on. A message unsent meanwhile, or a STICKER
// message (its sticker already sends buddy_sticker), sends nothing; an ex-buddy is dropped by runBuddyNotifyJob before
// this runs. At most one push per conversation per 2 minutes: a Redis SET NX EX key claimed right before sending (after
// the setting, mute, quiet hours and devices), so a skipped push never uses the slot; if Redis fails, no push (fail
// closed). No app-icon badge count. Logs ids and event names only.

import { prisma } from '../db/client';
import type { PushSender } from '../coach/push';
import { sendBuddyNotice, type BuddyNotice, type NoticeOutcome } from '../buddies/notify';
import { withTimeout } from '../lib/withTimeout';
import { connection } from '../sync/queue';
import { previewText } from './text';
import { cardTypeOf } from './types';

export const DM_PUSH_GROUP_SECONDS = 120;
const SLOT_TIMEOUT_MS = 300;

interface SlotRedis { set(key: string, value: string, ex: 'EX', seconds: number, nx: 'NX'): Promise<unknown> }

/** True when this conversation has had no push in the last 2 minutes (and now has one). Any failure: false. */
export async function claimDmPushSlot(recipientId: string, actorId: string, redis: SlotRedis = connection as unknown as SlotRedis): Promise<boolean> {
  try {
    const result = await withTimeout(redis.set(`dmpush:${recipientId}:${actorId}`, '1', 'EX', DM_PUSH_GROUP_SECONDS, 'NX'), SLOT_TIMEOUT_MS, 'dm push slot timeout');
    return result === 'OK';
  } catch (err) {
    console.error(JSON.stringify({ event: 'chats.push_slot_unavailable', recipientId, actorId, error: err instanceof Error ? err.name : 'unknown' }));
    return false;
  }
}

/** The preview body: the text on one line (≤ 80 code points + "…"), or a fixed phrase for a card without text. */
export function pushPreviewOf(m: { text: string | null; card: unknown }): string {
  if (m.text) return previewText(m.text);
  const type = cardTypeOf(m.card);
  if (type === 'checkin') return (m.card as { about?: unknown }).about === 'sender' ? 'Shared their check-in' : 'Replied to your story';
  if (type === 'note') return 'Replied to your note';
  if (type === 'camp_note') return 'Replied to your camp note';
  if (type === 'badge' || type === 'recap' || type === 'goodnight') return 'Replied to your story';
  return 'Sent a message';
}

export async function runDmNotice(
  data: BuddyNotice,
  deps: { pushSender: PushSender; now: Date; claim?: (recipientId: string, actorId: string) => Promise<boolean> },
): Promise<NoticeOutcome | 'dropped'> {
  const message = await prisma.message.findFirst({
    where: { id: data.refId, senderId: data.actorId, deletedAt: null, conversation: { OR: [{ userAId: data.recipientId }, { userBId: data.recipientId }] } },
    select: { kind: true, text: true, card: true },
  });
  if (!message || message.kind === 'STICKER') return 'dropped';
  const recipient = await prisma.user.findUnique({ where: { id: data.recipientId }, select: { showMessagePreviews: true } });
  if (!recipient) return 'no_recipient';
  const { name } = data.slots as { name: string };
  const slots = recipient.showMessagePreviews ? { name, preview: pushPreviewOf(message) } : { name };
  const claim = deps.claim ?? claimDmPushSlot;
  // On the wire the push names the sender (refId = their id), which opens their thread; the message id stays here.
  return sendBuddyNotice(
    deps.pushSender,
    { kind: 'dm_message', recipientId: data.recipientId, actorId: data.actorId, refId: data.actorId, slots },
    deps.now,
    { claim: () => claim(data.recipientId, data.actorId) },
  );
}
```

In `backend/src/buddies/notifyQueue.ts`, add `import { runDmNotice } from '../chats/dmPush';` after the `./notify`
import, and in `runBuddyNotifyJob`, replace the final `return sendBuddyNotice(deps.pushSender, data, deps.now);` with:

```ts
  // dm_message (S3): its refId is the message id; the job reads the message (and, with previews on, its text) now.
  if (data.kind === 'dm_message') return runDmNotice(data, deps);
  return sendBuddyNotice(deps.pushSender, data, deps.now);
```

- [ ] **Step 6: Enqueue on send**

In `backend/src/chats/messages.ts`, add the imports `import { pushName } from '../buddies/notify';` and
`import { enqueueBuddyNotice } from '../buddies/notifyQueue';`, add before `sendMessage`:

```ts
/** After commit, one dm_message job per TEXT or CARD message, whatever the recipient's settings (the job decides). It carries the message id and the sender's name, never the text. */
async function enqueueDmNotice(senderId: string, recipientId: string, messageId: string, deps: PairDeps): Promise<void> {
  const me = await prisma.user.findUnique({ where: { id: senderId }, select: { displayName: true, handle: true } });
  if (!me) return;
  await enqueueBuddyNotice(
    { kind: 'dm_message', recipientId, actorId: senderId, refId: messageId, slots: { name: pushName(me) } },
    deps.notifyQueue ? { queue: deps.notifyQueue } : {},
  );
}
```

and in `sendMessage`, between the TEXT/CARD transaction and its `await touchPresence(senderId, now);`, add
`await enqueueDmNotice(senderId, buddyId, messageId, deps);` (the STICKER branch keeps its own buddy_sticker push).

- [ ] **Step 7: The two settings**

Replace `backend/src/users/notifications.ts` with:

```ts
/** App-level notification settings (spec 2026-10-04 §2; buddy keys: spec 2026-10-06 buddies §6; DM keys: spec 2026-10-07 social §10). */
export interface NotificationSettings {
  recapPushEnabled: boolean;
  notifyBuddyStickers: boolean;
  notifyBuddyRequests: boolean;
  notifyBuddyBadges: boolean;
  /** dm_message pushes (default on). */
  notifyDirectMessages: boolean;
  /** The message text in a dm_message push (default off). */
  showMessagePreviews: boolean;
}

export const NOTIFICATION_KEYS = [
  'recapPushEnabled', 'notifyBuddyStickers', 'notifyBuddyRequests', 'notifyBuddyBadges', 'notifyDirectMessages', 'showMessagePreviews',
] as const;

export const NOTIFICATION_SELECT = {
  recapPushEnabled: true,
  notifyBuddyStickers: true,
  notifyBuddyRequests: true,
  notifyBuddyBadges: true,
  notifyDirectMessages: true,
  showMessagePreviews: true,
} as const;

/** A non-empty patch of known keys with boolean values, else null (→ 400 invalid_settings). */
export function parseNotificationSettingsPatch(body: unknown): Partial<NotificationSettings> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const entries = Object.entries(body as Record<string, unknown>);
  if (entries.length === 0) return null;
  const out: Partial<NotificationSettings> = {};
  for (const [key, value] of entries) {
    if (!(NOTIFICATION_KEYS as readonly string[]).includes(key) || typeof value !== 'boolean') return null;
    out[key as keyof NotificationSettings] = value;
  }
  return out;
}
```

- [ ] **Step 8: Run the tests**

Run: `bash .superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh tests/chats tests/buddies tests/coach/expoPush.test.ts tests/sync`
Expected: PASS (`tests/buddies/pushTemplates.test.ts` keeps passing: the four buddy kinds render as before).

- [ ] **Step 9: Commit**

```bash
git add backend/src/coach/push.ts backend/src/buddies/notify.ts backend/src/buddies/notifyQueue.ts backend/src/chats/dmPush.ts backend/src/chats/messages.ts backend/src/users/notifications.ts backend/tests/chats/push.test.ts backend/tests/buddies/notify.test.ts
git commit -m "feat(chats): dm_message push without previews by default, one per conversation per 2 minutes"
```

---

### Task 13: The app's chat data layer — API, copy, the thread window, unread counts and presence

**Files:**
- Create: `mobile/src/api/chats.ts`, `mobile/src/lib/chatCopy.ts`, `mobile/src/lib/chatThread.ts`
- Modify: `mobile/src/api/notifications.ts`, `mobile/src/api/social.ts` (a comment), `mobile/src/lib/socialStore.ts`,
  `mobile/src/components/social/SocialStoreScope.tsx`
- Test: create `mobile/__tests__/api/chats.test.ts`, `mobile/__tests__/api/notifications.test.ts`,
  `mobile/__tests__/lib/chatCopy.test.ts`, `mobile/__tests__/lib/chatThread.test.ts`; modify
  `mobile/__tests__/lib/socialStore.test.tsx`, `mobile/__tests__/components/SocialStoreScope.test.tsx`

**Interfaces:**
- Consumes: `apiFetch` (`api/client.ts`); `buddyErrorCode`, `Person`, `StickerKind` (`api/buddies.ts`);
  `CheckInMood`, `StoryFrame` (`api/social.ts`); `STICKER_LABEL` (`lib/buddyCopy.ts`); `FAMILY_NAMES`, `numeral`
  (`lib/badges.ts`); `CHECKIN_OPTIONS` (`lib/socialCopy.ts`). Backend DTOs of Tasks 4–10.
- Produces:
  - `api/chats.ts`: types `MessageKind`, `Card`, `CardType`, `ReplyPreview`, `Reaction`, `Message`, `Thread`,
    `LastMessage`, `ChatRow`, `ChatsPage`, `StatusNote`, `BuddyNote`, `Notes`, `CardRequest`, `ChatQuote
    { request: CardRequest; label: string }`, `ChatSettings`, `ReportTargetType`, `ReportReason`; functions
    `fetchChats(cursor?)`, `fetchThread(buddyId, before?)`, `fetchNotes()`, `fetchChatSettings()` (each `… | null`
    on a bare 404), `sendText(buddyId, text, replyToMessageId?)`, `sendStickerMessage(buddyId, sticker,
    replyToMessageId?)`, `sendCard(buddyId, card, text?, replyToMessageId?)` (each `Promise<{ message: Message }>`),
    `unsendMessage(buddyId, messageId)`, `setReaction(buddyId, messageId, kind): Promise<{ reactions: Reaction[] }>`,
    `clearReaction(buddyId, messageId)`, `markChatRead(buddyId)`, `saveStatusNote(text): Promise<{ note: StatusNote }>`,
    `clearStatusNote()`, `fileReport(targetType, targetId, reason)`, `saveChatSettings(patch): Promise<ChatSettings>`,
    `pingPresence()` (never throws).
  - `lib/chatCopy.ts`: `STATUS_NOTE_MAX = 60`, `MESSAGE_MAX = 1000`, `POLL_MS = 5000`, `REPORT_REASONS`,
    `isKnownMessage(m)`, `knownMessages(list)`, `shortAgo(iso, now: number)`, `cardSummary(type)`,
    `lastMessageText(last)`, `chatRowLine(row, now: number)`, `activeLine(activeAt, now: number)`,
    `cardKicker(card)`, `cardLine(card)`, `cardCaption(card, mine, name)`, `moodColor(mood)`,
    `replyLine(reply, name)`, `stickerLine(kind)`, `dayChip(iso, now: Date)`, `sameLocalDay(a, b)`,
    `frameQuoteLabel(kind, name)`, `noteQuoteLabel(name)`, `campNoteQuoteLabel(name)`, `noteLength(draft)`.
  - `lib/chatThread.ts`: `ThreadWindow { older, newest, cursor }`, `firstWindow(page)`, `pollWindow(w, page)`,
    `olderWindow(w, page)`, `threadMessages(w)`, `withSent(w, message)`, `withReactions(w, id, reactions)`,
    `withoutMessage(w, id)`, `ThreadItem`, `threadItems(messages, seenAt, now: Date)`.
  - `api/notifications.ts`: `NotificationSettings` gains `notifyDirectMessages` (default true) and
    `showMessagePreviews` (default false).
  - `lib/socialStore.ts`: `useSocialUnreadCount()` adds `unread.chats`; `useChatsAvailable(): boolean | null`;
    `chatsBadgeCount(unread): number` (chats + requests).
  - `SocialStoreScope` sends `pingPresence()` on mount and on each return to the foreground.

- [ ] **Step 1: Write the failing tests**

Create `mobile/__tests__/api/chats.test.ts`:

```ts
import { apiFetch } from '../../src/api/client';
import {
  clearReaction, clearStatusNote, fetchChatSettings, fetchChats, fetchNotes, fetchThread, fileReport, markChatRead, pingPresence,
  saveChatSettings, saveStatusNote, sendCard, sendStickerMessage, sendText, setReaction, unsendMessage,
} from '../../src/api/chats';

jest.mock('../../src/api/client');
const api = apiFetch as jest.Mock;
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const bare404 = () => Object.assign(new Error('nope'), { status: 404 });

beforeEach(() => api.mockReset());

it('reads the inbox, a thread, notes and settings; a bare 404 (an older server) is null, anything else throws', async () => {
  for (const [call, path] of [
    [() => fetchChats(), '/me/chats'],
    [() => fetchChats('c/1'), '/me/chats?cursor=c%2F1'],
    [() => fetchThread('b/1'), '/me/chats/b%2F1/messages'],
    [() => fetchThread('b1', 'x y'), '/me/chats/b1/messages?before=x%20y'],
    [() => fetchNotes(), '/me/notes'],
    [() => fetchChatSettings(), '/me/chats/settings'],
  ] as const) {
    api.mockResolvedValueOnce({ ok: 1 });
    expect(await call()).toEqual({ ok: 1 });
    expect(api).toHaveBeenLastCalledWith(path);
    api.mockRejectedValueOnce(bare404());
    expect(await call()).toBeNull();
    api.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { status: 403, code: 'not_buddies' }));
    await expect(call()).rejects.toThrow('forbidden');
  }
});

it('sends text, stickers and cards with JSON bodies, a reply id only when there is one', async () => {
  api.mockResolvedValue({ message: {} });
  await sendText('b1', 'hi');
  expect(api).toHaveBeenLastCalledWith('/me/chats/b1/messages', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ kind: 'TEXT', text: 'hi' }) });
  await sendText('b1', 'oh no', 'm1');
  expect(api).toHaveBeenLastCalledWith('/me/chats/b1/messages', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ kind: 'TEXT', text: 'oh no', replyToMessageId: 'm1' }) });
  await sendStickerMessage('b1', 'CHEER');
  expect(api).toHaveBeenLastCalledWith('/me/chats/b1/messages', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ kind: 'STICKER', sticker: 'CHEER' }) });
  await sendCard('b1', { type: 'story_frame', at: '2026-10-07T16:00:00.000Z' }, 'same');
  expect(api).toHaveBeenLastCalledWith('/me/chats/b1/messages', {
    method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ kind: 'CARD', card: { type: 'story_frame', at: '2026-10-07T16:00:00.000Z' }, text: 'same' }),
  });
  await sendCard('b1', { type: 'my_checkin' });
  expect(api).toHaveBeenLastCalledWith('/me/chats/b1/messages', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ kind: 'CARD', card: { type: 'my_checkin' } }) });
});

it('unsends, reacts, reads, shares notes, reports and saves settings on the right paths', async () => {
  api.mockResolvedValue(undefined);
  await unsendMessage('b1', 'm/1');
  expect(api).toHaveBeenLastCalledWith('/me/chats/b1/messages/m%2F1', expect.objectContaining({ method: 'DELETE' }));
  await setReaction('b1', 'm1', 'HEART');
  expect(api).toHaveBeenLastCalledWith('/me/chats/b1/messages/m1/reaction', { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ kind: 'HEART' }) });
  await clearReaction('b1', 'm1');
  expect(api).toHaveBeenLastCalledWith('/me/chats/b1/messages/m1/reaction', expect.objectContaining({ method: 'DELETE' }));
  await markChatRead('b1');
  expect(api).toHaveBeenLastCalledWith('/me/chats/b1/read', expect.objectContaining({ method: 'POST' }));
  await saveStatusNote('early night');
  expect(api).toHaveBeenLastCalledWith('/me/notes', { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ text: 'early night' }) });
  await clearStatusNote();
  expect(api).toHaveBeenLastCalledWith('/me/notes', expect.objectContaining({ method: 'DELETE' }));
  await fileReport('message', 'm1', 'spam');
  expect(api).toHaveBeenLastCalledWith('/me/reports', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ targetType: 'message', targetId: 'm1', reason: 'spam' }) });
  await saveChatSettings({ readReceipts: false });
  expect(api).toHaveBeenLastCalledWith('/me/chats/settings', { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ readReceipts: false }) });
});

it('pings presence and never throws', async () => {
  api.mockResolvedValueOnce(undefined);
  await pingPresence();
  expect(api).toHaveBeenLastCalledWith('/me/presence', expect.objectContaining({ method: 'POST' }));
  api.mockRejectedValueOnce(new Error('offline'));
  await expect(pingPresence()).resolves.toBeUndefined();
});
```

Create `mobile/__tests__/api/notifications.test.ts`:

```ts
import { apiFetch } from '../../src/api/client';
import { fetchNotificationSettings } from '../../src/api/notifications';

jest.mock('../../src/api/client');
const api = apiFetch as jest.Mock;

it('defaults a missing key to the server default: message pushes on, previews off', async () => {
  api.mockResolvedValueOnce({ recapPushEnabled: false });
  expect(await fetchNotificationSettings()).toEqual({
    recapPushEnabled: false, notifyBuddyStickers: true, notifyBuddyRequests: true, notifyBuddyBadges: true,
    notifyDirectMessages: true, showMessagePreviews: false,
  });
  api.mockResolvedValueOnce({ showMessagePreviews: true, notifyDirectMessages: false });
  expect(await fetchNotificationSettings()).toMatchObject({ notifyDirectMessages: false, showMessagePreviews: true });
});
```

Create `mobile/__tests__/lib/chatCopy.test.ts`:

```ts
import type { Card, LastMessage, Message } from '../../src/api/chats';
import {
  activeLine, campNoteQuoteLabel, cardCaption, cardKicker, cardLine, chatRowLine, dayChip, frameQuoteLabel, isKnownMessage,
  lastMessageText, noteLength, noteQuoteLabel, replyLine, sameLocalDay, shortAgo, stickerLine,
} from '../../src/lib/chatCopy';

const NOW = new Date(2026, 9, 8, 18, 0).getTime(); // built on the phone's own clock
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
const last = (over: Partial<LastMessage>): LastMessage => ({ mine: false, kind: 'TEXT', text: 'hi', sticker: null, cardType: null, at: ago(2), ...over });
const msg = (over: Partial<Message>): Message => ({ id: 'm', mine: false, kind: 'TEXT', text: 'hi', sticker: null, card: null, replyTo: null, reactions: [], createdAt: ago(1), ...over });

it('words an inbox row: the last message and how long ago', () => {
  expect(chatRowLine({ buddy: { id: 'b', handle: 'ben', displayName: 'Ben', coachId: 'mochi' }, lastMessage: last({ text: 'rough night lol' }), unread: 1, activeAt: null }, NOW)).toBe('rough night lol · 2m');
  expect(lastMessageText(last({ mine: true, text: 'proud of that streak!' }))).toBe('You: proud of that streak!');
  expect(lastMessageText(last({ kind: 'STICKER', text: null, sticker: 'CHEER' }))).toBe('Sent a Cheer sticker');
  expect(lastMessageText(last({ mine: true, kind: 'STICKER', text: null, sticker: 'REST_UP' }))).toBe('You sent a Rest up sticker');
  expect(lastMessageText(last({ kind: 'CARD', text: null, cardType: 'checkin' }))).toBe('Shared a check-in');
  expect(lastMessageText(last({ mine: true, kind: 'CARD', text: null, cardType: 'note' }))).toBe('You: Replied to a note');
  expect([shortAgo(ago(0), NOW), shortAgo(ago(59), NOW), shortAgo(ago(5 * 60), NOW), shortAgo(ago(26 * 60), NOW), shortAgo(ago(15 * 24 * 60), NOW)])
    .toEqual(['now', '59m', '5h', '1d', '2w']);
});

it('words activity status: now up to 5 minutes, then minutes, then hours; nothing without a time', () => {
  expect(activeLine(null, NOW)).toBeNull();
  expect(activeLine(ago(5), NOW)).toBe('Active now');
  expect(activeLine(ago(6), NOW)).toBe('Active 6m ago');
  expect(activeLine(ago(3 * 60 + 10), NOW)).toBe('Active 3h ago');
});

it('words cards: a kicker, a line and who shared or replied', () => {
  const checkin: Card = { type: 'checkin', about: 'recipient', localDate: '2026-10-08', mood: 'TIRED' };
  expect([cardKicker(checkin), cardLine(checkin)]).toEqual(['MORNING CHECK-IN', 'Woke up tired']);
  expect(cardLine({ ...checkin, mood: null })).toBe('Checked in');
  expect(cardCaption(checkin, true, 'Ben')).toBe('You replied to their check-in');
  expect(cardCaption({ ...checkin, about: 'sender' }, false, 'Ben')).toBe('Ben shared their check-in');
  expect(cardCaption({ type: 'note', text: 'x' }, false, 'Ben')).toBe('Ben replied to your note');
  expect([cardKicker({ type: 'badge', family: 'SLEEP_GOAL', level: 2 }), cardLine({ type: 'badge', family: 'SLEEP_GOAL', level: 2 })]).toEqual(['BADGE', 'Sleep goal streak II']);
  expect(cardKicker({ type: 'recap', recapKind: 'MONTH', periodStart: '2026-09-01', periodEnd: '2026-09-30', line: 'A steadier month' })).toBe('MONTHLY RECAP');
  expect(cardLine({ type: 'goodnight', onTime: true })).toBe('Said goodnight, on time');
  expect([cardKicker({ type: 'camp_note', text: 'bed soon' }), cardLine({ type: 'camp_note', text: 'bed soon' })]).toEqual(['CAMP NOTE', 'bed soon']);
});

it('words a reply quote and a sticker', () => {
  expect(replyLine({ id: 'm', gone: true }, 'Ben')).toBe('Message unsent');
  expect(replyLine({ id: 'm', gone: false, mine: false, kind: 'TEXT', text: 'rough night', sticker: null, cardType: null }, 'Ben')).toBe('Ben: rough night');
  expect(replyLine({ id: 'm', gone: false, mine: true, kind: 'STICKER', text: null, sticker: 'STAR', cardType: null }, 'Ben')).toBe('You: Star sticker');
  expect(stickerLine('REST_UP')).toBe('Rest up');
});

it('labels a staged quote', () => {
  expect(frameQuoteLabel('checkin', 'Ben')).toBe("Ben's check-in");
  expect(frameQuoteLabel('goodnight', 'Ben')).toBe("Ben's goodnight");
  expect(noteQuoteLabel('Ben')).toBe("Ben's note");
  expect(campNoteQuoteLabel('Ben')).toBe("Ben's camp note");
});

it('labels the day a message falls on, on the phone clock', () => {
  const now = new Date(2026, 9, 8, 18, 0); // Thursday
  expect(dayChip(new Date(2026, 9, 8, 7, 31).toISOString(), now)).toBe('Today 7:31 AM');
  expect(dayChip(new Date(2026, 9, 7, 21, 2).toISOString(), now)).toBe('Yesterday 9:02 PM');
  expect(dayChip(new Date(2026, 9, 5, 12, 0).toISOString(), now)).toBe('Mon 12:00 PM');
  expect(dayChip(new Date(2026, 8, 30, 0, 5).toISOString(), now)).toBe('Sep 30 12:05 AM');
  expect(sameLocalDay(new Date(2026, 9, 8, 0, 1).toISOString(), new Date(2026, 9, 8, 23, 59).toISOString())).toBe(true);
  expect(sameLocalDay(new Date(2026, 9, 7, 23, 59).toISOString(), new Date(2026, 9, 8, 0, 1).toISOString())).toBe(false);
});

it('skips a message kind, sticker or card this app does not know', () => {
  expect(isKnownMessage(msg({}))).toBe(true);
  expect(isKnownMessage(msg({ kind: 'VOICE' as never }))).toBe(false);
  expect(isKnownMessage(msg({ kind: 'STICKER', text: null, sticker: 'KISS' as never }))).toBe(false);
  expect(isKnownMessage(msg({ kind: 'CARD', text: null, card: { type: 'poll' } as never }))).toBe(false);
  expect(isKnownMessage(msg({ kind: 'CARD', text: null, card: { type: 'goodnight', onTime: false } }))).toBe(true);
});

it('counts a note draft like the server (code points, trimmed)', () => {
  expect(noteLength('  🔥🔥 ')).toBe(2);
});
```

Create `mobile/__tests__/lib/chatThread.test.ts`:

```ts
import type { Message, Thread } from '../../src/api/chats';
import { firstWindow, olderWindow, pollWindow, threadItems, threadMessages, withReactions, withSent, withoutMessage } from '../../src/lib/chatThread';

const T0 = new Date(2026, 9, 8, 9, 0).getTime();
const m = (n: number, over: Partial<Message> = {}): Message => ({
  id: `m${n}`, mine: n % 2 === 0, kind: 'TEXT', text: `t${n}`, sticker: null, card: null, replyTo: null, reactions: [],
  createdAt: new Date(T0 + n * 60_000).toISOString(), ...over,
});
const page = (ns: number[], nextBefore: string | null, over: Partial<Thread> = {}): Thread => ({
  buddy: { id: 'b', handle: 'b', displayName: 'Ben', coachId: 'mochi' }, messages: ns.map((n) => m(n)), nextBefore, seenAt: null, activeAt: null, ...over,
});
const ids = (list: Message[]) => list.map((x) => x.id);

it('a poll replaces the newest window and carries what slid out of it: no gap, no duplicate', () => {
  let w = firstWindow(page([3, 4, 5], 'c3'));
  w = pollWindow(w, page([4, 5, 6], 'c4'));
  expect(ids(threadMessages(w))).toEqual(['m3', 'm4', 'm5', 'm6']);
  expect(w.cursor).toBe('c3'); // older pages still start before m3
  w = olderWindow(w, page([1, 2], null));
  expect(ids(threadMessages(w))).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6']);
  w = pollWindow(w, page([6, 7, 8], 'c6'));
  expect(ids(threadMessages(w))).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8']);
  expect(w.cursor).toBeNull();
});

it('an unsend or a reaction inside the window shows on the next poll', () => {
  let w = firstWindow(page([1, 2, 3], null));
  const next = page([1, 3], null);
  next.messages[0] = m(1, { reactions: [{ kind: 'HEART', mine: false }] });
  w = pollWindow(w, next);
  expect(ids(threadMessages(w))).toEqual(['m1', 'm3']);
  expect(threadMessages(w)[0]!.reactions).toEqual([{ kind: 'HEART', mine: false }]);
});

it('without older pages, the cursor follows the newest page; an empty page empties the thread', () => {
  let w = firstWindow(page([1, 2], null));
  w = pollWindow(w, page([1, 2, 3], null));
  expect(w.cursor).toBeNull();
  w = pollWindow(w, page([], null));
  expect(threadMessages(w)).toEqual([]);
});

it('adds a sent message, swaps reactions and drops an unsent one in place', () => {
  let w = firstWindow(page([1, 2], null));
  w = withSent(w, m(3));
  w = withSent(w, m(3));
  expect(ids(threadMessages(w))).toEqual(['m1', 'm2', 'm3']);
  w = withReactions(w, 'm1', [{ kind: 'STAR', mine: true }]);
  expect(threadMessages(w)[0]!.reactions).toEqual([{ kind: 'STAR', mine: true }]);
  w = withoutMessage(w, 'm2');
  expect(ids(threadMessages(w))).toEqual(['m1', 'm3']);
});

it('lays out day chips and "Seen" under my newest message once read past it', () => {
  const now = new Date(2026, 9, 8, 18, 0);
  const yesterday = m(0, { createdAt: new Date(2026, 9, 7, 21, 0).toISOString() });
  const list = [yesterday, m(1), m(2)];
  expect(threadItems(list, null, now).map((i) => i.type)).toEqual(['chip', 'message', 'chip', 'message', 'message']);
  expect(threadItems(list, list[2]!.createdAt, now).map((i) => i.type).slice(-1)).toEqual(['seen']);
  expect(threadItems(list, list[1]!.createdAt, now).some((i) => i.type === 'seen')).toBe(false);
  // Their message last: no "Seen".
  expect(threadItems([m(1)], m(1).createdAt, now).some((i) => i.type === 'seen')).toBe(false);
});
```

In `mobile/__tests__/lib/socialStore.test.tsx`, change the import to also take `chatsBadgeCount, useChatsAvailable`, change
`const home = (requests: number, stickers: number) => ({ …, unread: { requests, stickers } });` to

```ts
const home = (requests: number, stickers: number, chats?: number) => ({ me: {}, camp: { checkedIn: 0, members: 1, faces: [] }, stories: [], highlights: null, timeline: [], unread: chats === undefined ? { requests, stickers } : { requests, stickers, chats } });
```

and append:

```ts
it('counts unread chats in the dot, and knows whether the server has Chats', async () => {
  function Probe() { return <Text testID="dot">{`${useSocialUnreadCount()}:${String(useChatsAvailable())}`}</Text>; }
  render(<Probe />);
  expect(screen.getByTestId('dot')).toHaveTextContent('0:null');
  fetchHome.mockResolvedValueOnce(home(1, 0, 2));
  await act(() => refreshSocial());
  expect(screen.getByTestId('dot')).toHaveTextContent('3:true');
  fetchHome.mockResolvedValueOnce(home(1, 0)); // an S2 server: no chats
  await act(() => refreshSocial());
  expect(screen.getByTestId('dot')).toHaveTextContent('1:false');
  fetchHome.mockResolvedValueOnce(null);
  await act(() => refreshSocial());
  expect(screen.getByTestId('dot')).toHaveTextContent('0:false');
  expect(chatsBadgeCount({ requests: 2, stickers: 5, chats: 3 })).toBe(5);
  expect(chatsBadgeCount(undefined)).toBe(0);
});
```

In `mobile/__tests__/components/SocialStoreScope.test.tsx`, add after the `socialStore` mock:

```ts
jest.mock('../../src/api/chats', () => ({ pingPresence: jest.fn(() => Promise.resolve()) }));
```

add `import { pingPresence } from '../../src/api/chats';`, and append:

```ts
it('tells the server I am active on start and on each return to the foreground', () => {
  render(<SocialStoreScope />);
  expect(pingPresence).toHaveBeenCalledTimes(1);
  onAppState!('background');
  onAppState!('active');
  expect(pingPresence).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run them to see them fail**

Run (from `mobile/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/api/chats.test.ts __tests__/api/notifications.test.ts __tests__/lib/chatCopy.test.ts __tests__/lib/chatThread.test.ts __tests__/lib/socialStore.test.tsx __tests__/components/SocialStoreScope.test.tsx`
Expected: FAIL — "Cannot find module '../../src/api/chats'" (and the others).

- [ ] **Step 3: The API**

Create `mobile/src/api/chats.ts`:

```ts
import { apiFetch } from './client';
import { buddyErrorCode, type Person, type StickerKind } from './buddies';
import type { AchievementFamily } from './achievements';
import type { CheckInMood } from './social';

// Chats client (spec 2026-10-07 social §8). Types mirror backend/src/chats/{types,inbox,notes,presence}.ts exactly. Only
// a BARE 404 (no error code) means the backend predates chats (S1/S2): those reads answer null and the app hides the
// feature. Every chat error carries { error: code } (not_buddies is a 403). Message and note text is a buddy's free
// text: shown in Chats only, never logged.

export type MessageKind = 'TEXT' | 'STICKER' | 'CARD';
export type Card =
  // `about`: whose check-in — the sender's (shared with "+") or the recipient's (a story reply; no mood when it was locked).
  | { type: 'checkin'; about: 'sender' | 'recipient'; localDate: string; mood: CheckInMood | null }
  | { type: 'badge'; family: AchievementFamily; level: number }
  | { type: 'recap'; recapKind: 'WEEK' | 'MONTH'; periodStart: string; periodEnd: string; line: string }
  | { type: 'goodnight'; onTime: boolean }
  | { type: 'note'; text: string }
  | { type: 'camp_note'; text: string };
export type CardType = Card['type'];
export type ReplyPreview =
  | { id: string; gone: true }
  | { id: string; gone: false; mine: boolean; kind: MessageKind; text: string | null; sticker: StickerKind | null; cardType: CardType | null };
export interface Reaction { kind: StickerKind; mine: boolean }
export interface Message {
  id: string;
  mine: boolean;
  kind: MessageKind;
  text: string | null;
  sticker: StickerKind | null;
  card: Card | null;
  replyTo: ReplyPreview | null;
  reactions: Reaction[];
  createdAt: string;
}
export interface Thread {
  buddy: Person;
  /** Oldest first: one page. */
  messages: Message[];
  nextBefore: string | null;
  /** Their last read; only while both have read receipts on. */
  seenAt: string | null;
  /** Their last activity within 24 h; only while both show activity status. */
  activeAt: string | null;
}
export interface LastMessage { mine: boolean; kind: MessageKind; text: string | null; sticker: StickerKind | null; cardType: CardType | null; at: string }
export interface ChatRow { buddy: Person; lastMessage: LastMessage; unread: number; activeAt: string | null }
export interface ChatsPage { chats: ChatRow[]; nextCursor: string | null; requests: number }
export interface StatusNote { text: string; createdAt: string; expiresAt: string }
export interface BuddyNote extends StatusNote { person: Person }
export interface Notes { mine: StatusNote | null; buddies: BuddyNote[] }
/** What a card quotes; the server builds the snapshot. */
export type CardRequest = { type: 'my_checkin' } | { type: 'story_frame'; at: string } | { type: 'note' } | { type: 'camp_note' };
/** A quote staged in the thread's composer (a route param): sent as a CARD with the next text. */
export interface ChatQuote { request: CardRequest; label: string }
export interface ChatSettings { readReceipts: boolean; activityStatus: boolean }
export type ReportTargetType = 'message' | 'status_note' | 'camp_note';
export type ReportReason = 'spam' | 'harassment' | 'other';

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const isBare404 = (error: unknown) => (error as { status?: number } | null)?.status === 404 && buddyErrorCode(error) === null;
const id = (s: string) => encodeURIComponent(s);
const messagesPath = (buddyId: string) => `/me/chats/${id(buddyId)}/messages`;

/** null only for a bare 404: a backend older than chats. */
async function orNull<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request;
  } catch (error) {
    if (isBare404(error)) return null;
    throw error;
  }
}

export const fetchChats = (cursor?: string | null) => orNull(apiFetch<ChatsPage>(cursor ? `/me/chats?cursor=${id(cursor)}` : '/me/chats'));
export const fetchThread = (buddyId: string, before?: string | null) =>
  orNull(apiFetch<Thread>(before ? `${messagesPath(buddyId)}?before=${id(before)}` : messagesPath(buddyId)));
export const fetchNotes = () => orNull(apiFetch<Notes>('/me/notes'));
export const fetchChatSettings = () => orNull(apiFetch<ChatSettings>('/me/chats/settings'));

const reply = (replyToMessageId?: string | null) => (replyToMessageId ? { replyToMessageId } : {});
export const sendText = (buddyId: string, text: string, replyToMessageId?: string | null) =>
  apiFetch<{ message: Message }>(messagesPath(buddyId), send('POST', { kind: 'TEXT', text, ...reply(replyToMessageId) }));
export const sendStickerMessage = (buddyId: string, sticker: StickerKind, replyToMessageId?: string | null) =>
  apiFetch<{ message: Message }>(messagesPath(buddyId), send('POST', { kind: 'STICKER', sticker, ...reply(replyToMessageId) }));
export const sendCard = (buddyId: string, card: CardRequest, text?: string, replyToMessageId?: string | null) =>
  apiFetch<{ message: Message }>(messagesPath(buddyId), send('POST', { kind: 'CARD', card, ...(text ? { text } : {}), ...reply(replyToMessageId) }));

// The writes below answer 204.
export async function unsendMessage(buddyId: string, messageId: string): Promise<void> {
  await apiFetch<void>(`${messagesPath(buddyId)}/${id(messageId)}`, send('DELETE'));
}
export const setReaction = (buddyId: string, messageId: string, kind: StickerKind) =>
  apiFetch<{ reactions: Reaction[] }>(`${messagesPath(buddyId)}/${id(messageId)}/reaction`, send('PUT', { kind }));
export async function clearReaction(buddyId: string, messageId: string): Promise<void> {
  await apiFetch<void>(`${messagesPath(buddyId)}/${id(messageId)}/reaction`, send('DELETE'));
}
export async function markChatRead(buddyId: string): Promise<void> {
  await apiFetch<void>(`/me/chats/${id(buddyId)}/read`, send('POST'));
}
export const saveStatusNote = (text: string) => apiFetch<{ note: StatusNote }>('/me/notes', send('PUT', { text }));
export async function clearStatusNote(): Promise<void> {
  await apiFetch<void>('/me/notes', send('DELETE'));
}
export async function fileReport(targetType: ReportTargetType, targetId: string, reason: ReportReason): Promise<void> {
  await apiFetch<void>('/me/reports', send('POST', { targetType, targetId, reason }));
}
export const saveChatSettings = (patch: Partial<ChatSettings>) => apiFetch<ChatSettings>('/me/chats/settings', send('PUT', patch));

/** "I'm here" for activity status, on start and each return to the foreground. Best effort: never throws. */
export async function pingPresence(): Promise<void> {
  try {
    await apiFetch<void>('/me/presence', send('POST'));
  } catch {
    // An older server (404) or offline: nothing to show anyway.
  }
}
```

In `mobile/src/api/social.ts`, change the `unread` comment line `/** \`chats\` arrives with S3 (DMs); the tab dot reads requests + stickers until then. */`
to `/** \`chats\` (S3): conversations with an unread message; an S2 server sends none, which is how the app knows Chats is missing. */`.

Replace `mobile/src/api/notifications.ts` with:

```ts
import { apiFetch } from './client';

// App-level notification settings (spec 2026-10-04 §2; buddy keys: spec 2026-10-06 buddies §6; message keys: spec
// 2026-10-07 social §10), independent of the coach.
export interface NotificationSettings {
  recapPushEnabled: boolean;
  notifyBuddyStickers: boolean;
  notifyBuddyRequests: boolean;
  notifyBuddyBadges: boolean;
  notifyDirectMessages: boolean;
  showMessagePreviews: boolean;
}

export type NotificationKey = keyof NotificationSettings;

// The server's defaults, used for any key without a boolean (an older server knows fewer keys). Previews are off.
const DEFAULTS: NotificationSettings = {
  recapPushEnabled: true,
  notifyBuddyStickers: true,
  notifyBuddyRequests: true,
  notifyBuddyBadges: true,
  notifyDirectMessages: true,
  showMessagePreviews: false,
};
const KEYS = Object.keys(DEFAULTS) as NotificationKey[];

type RawSettings = Partial<Record<NotificationKey, unknown>> | undefined;

function withDefaults(res: RawSettings): NotificationSettings {
  return Object.fromEntries(KEYS.map((key) => [key, typeof res?.[key] === 'boolean' ? res[key] : DEFAULTS[key]])) as unknown as NotificationSettings;
}

// A 404 from a server older than this endpoint reads as every default. Any other failure throws.
export async function fetchNotificationSettings(): Promise<NotificationSettings> {
  let res: RawSettings;
  try {
    res = await apiFetch<RawSettings>('/me/notifications');
  } catch (error) {
    if ((error as { status?: number } | null)?.status !== 404) throw error;
  }
  return withDefaults(res);
}

export async function saveNotificationSettings(patch: Partial<NotificationSettings>): Promise<NotificationSettings> {
  const res = await apiFetch<RawSettings>('/me/notifications', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return withDefaults(res);
}
```

- [ ] **Step 4: The copy**

Create `mobile/src/lib/chatCopy.ts`:

```ts
import type { StickerKind } from '../api/buddies';
import type { Card, CardType, ChatRow, LastMessage, Message, ReplyPreview, ReportReason } from '../api/chats';
import type { CheckInMood, StoryFrame } from '../api/social';
import { FAMILY_NAMES, numeral } from './badges';
import { STICKER_LABEL } from './buddyCopy';
import { CHECKIN_OPTIONS } from './socialCopy';

// Chats copy (spec 2026-10-07 social §8). Fixed templates over typed fields; the only free text is a buddy's own message
// or note, shown as it is. Every clock time is 12-hour, on the phone's clock.

export const STATUS_NOTE_MAX = 60;
export const MESSAGE_MAX = 1000;
/** An open thread re-reads its newest page this often (plan ruling). */
export const POLL_MS = 5000;
export const REPORT_REASONS: ReadonlyArray<{ reason: ReportReason; label: string }> = [
  { reason: 'spam', label: 'Spam' },
  { reason: 'harassment', label: 'Harassment or bullying' },
  { reason: 'other', label: 'Something else' },
];

// What this app can draw. A newer server may add kinds, stickers or card types: such a message is skipped, never drawn
// blank or mislabelled.
const MESSAGE_KINDS: ReadonlySet<string> = new Set(['TEXT', 'STICKER', 'CARD']);
const CARD_TYPES: ReadonlySet<string> = new Set<CardType>(['checkin', 'badge', 'recap', 'goodnight', 'note', 'camp_note']);
const knownSticker = (s: unknown): s is StickerKind => typeof s === 'string' && Object.prototype.hasOwnProperty.call(STICKER_LABEL, s);

export function isKnownMessage(m: Message): boolean {
  if (!MESSAGE_KINDS.has(m.kind)) return false;
  if (m.kind === 'STICKER') return knownSticker(m.sticker);
  if (m.kind === 'CARD') return m.card !== null && CARD_TYPES.has(m.card.type);
  return typeof m.text === 'string';
}
export const knownMessages = (list: readonly Message[]) => list.filter(isKnownMessage);

/** "now", "5m", "3h", "2d", "1w": how long ago, for an inbox line. */
export function shortAgo(iso: string, now: number): string {
  const min = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d` : `${Math.floor(d / 7)}w`;
}

export const stickerLine = (kind: StickerKind) => STICKER_LABEL[kind];

/** A card in one line, for the inbox and reply quotes. */
export function cardSummary(type: CardType | null): string {
  switch (type) {
    case 'checkin': return 'Shared a check-in';
    case 'badge':
    case 'recap':
    case 'goodnight': return 'Replied to a story';
    case 'note': return 'Replied to a note';
    case 'camp_note': return 'Replied to a camp note';
    default: return 'Sent a message';
  }
}

/** "You: proud of that streak!", "Sent a Cheer sticker", "Shared a check-in". */
export function lastMessageText(last: LastMessage): string {
  if (last.kind === 'STICKER') {
    const what = knownSticker(last.sticker) ? `a ${STICKER_LABEL[last.sticker]} sticker` : 'a sticker';
    return last.mine ? `You sent ${what}` : `Sent ${what}`;
  }
  return `${last.mine ? 'You: ' : ''}${last.text ?? cardSummary(last.cardType)}`;
}

export const chatRowLine = (row: ChatRow, now: number) => `${lastMessageText(row.lastMessage)} · ${shortAgo(row.lastMessage.at, now)}`;

/** "Active now" (≤ 5 min), "Active 12m ago", "Active 3h ago"; null when the server sent no time. */
export function activeLine(activeAt: string | null, now: number): string | null {
  if (!activeAt) return null;
  const min = Math.max(0, Math.floor((now - Date.parse(activeAt)) / 60_000));
  if (min <= 5) return 'Active now';
  if (min < 60) return `Active ${min}m ago`;
  return `Active ${Math.floor(min / 60)}h ago`;
}

const MOOD_WORDS: Record<CheckInMood, string> = { RESTED: 'rested', OKAY: 'okay', TIRED: 'tired' };
export const moodColor = (mood: CheckInMood) => CHECKIN_OPTIONS.find((o) => o.mood === mood)?.color ?? '#9CA3AF';

export function cardKicker(card: Card): string {
  switch (card.type) {
    case 'checkin': return 'MORNING CHECK-IN';
    case 'badge': return 'BADGE';
    case 'recap': return card.recapKind === 'MONTH' ? 'MONTHLY RECAP' : 'WEEKLY RECAP';
    case 'goodnight': return 'GOODNIGHT';
    case 'note': return 'NOTE';
    case 'camp_note': return 'CAMP NOTE';
  }
}

export function cardLine(card: Card): string {
  switch (card.type) {
    case 'checkin': return card.mood ? `Woke up ${MOOD_WORDS[card.mood]}` : 'Checked in';
    case 'badge': return `${FAMILY_NAMES[card.family]} ${numeral(card.level)}`;
    case 'recap': return card.line;
    case 'goodnight': return card.onTime ? 'Said goodnight, on time' : 'Said goodnight';
    case 'note':
    case 'camp_note': return card.text;
  }
}

/** The small line over a card: "You replied to their check-in", "Ben shared their check-in". */
export function cardCaption(card: Card, mine: boolean, name: string): string {
  const who = mine ? 'You' : name;
  if (card.type === 'checkin' && card.about === 'sender') return `${who} shared ${mine ? 'your' : 'their'} check-in`;
  const what = card.type === 'checkin' ? 'check-in' : card.type === 'note' ? 'note' : card.type === 'camp_note' ? 'camp note' : 'story';
  return `${who} replied to ${mine ? 'their' : 'your'} ${what}`;
}

/** The quote over a reply: "Ben: rough night", "You: Star sticker", or "Message unsent". */
export function replyLine(reply: ReplyPreview, name: string): string {
  if (reply.gone) return 'Message unsent';
  const what = reply.text ?? (knownSticker(reply.sticker) ? `${STICKER_LABEL[reply.sticker]} sticker` : cardSummary(reply.cardType));
  return `${reply.mine ? 'You' : name}: ${what}`;
}

const FRAME_WORDS: Record<StoryFrame['kind'], string> = { checkin: 'check-in', badge: 'badge', recap: 'recap', goodnight: 'goodnight' };
export const frameQuoteLabel = (kind: StoryFrame['kind'], name: string) => `${name}'s ${FRAME_WORDS[kind]}`;
export const noteQuoteLabel = (name: string) => `${name}'s note`;
export const campNoteQuoteLabel = (name: string) => `${name}'s camp note`;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const time12 = (d: Date) => `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export const sameLocalDay = (a: string, b: string) => dayStart(new Date(a)) === dayStart(new Date(b));

/** A thread's day chip: "Today 7:31 AM", "Yesterday 9:02 PM", "Mon 12:00 PM" within the week, else "Sep 30 12:05 AM". */
export function dayChip(iso: string, now: Date): string {
  const d = new Date(iso);
  const days = Math.round((dayStart(now) - dayStart(d)) / 86_400_000);
  if (days === 0) return `Today ${time12(d)}`;
  if (days === 1) return `Yesterday ${time12(d)}`;
  if (days > 1 && days < 7) return `${WEEKDAYS[d.getDay()]} ${time12(d)}`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()} ${time12(d)}`;
}

/** A note draft's length as the server counts it (code points of the NFC, trimmed draft); may over-count, never under. */
export function noteLength(draft: string): number {
  const text = typeof draft.normalize === 'function' ? draft.normalize('NFC') : draft;
  return [...text.trim()].length;
}
```

- [ ] **Step 5: The thread window**

Create `mobile/src/lib/chatThread.ts`:

```ts
import type { Message, Reaction, Thread } from '../api/chats';
import { dayChip, sameLocalDay } from './chatCopy';

// The polled thread window (plan ruling). An open thread re-reads its newest page every 5 s and keeps the older pages it
// loaded. A poll REPLACES the newest window, so new messages, unsends, reactions and "Seen" inside it show within 5 s;
// a message that slides out of the window is carried into `older` (never dropped, never shown twice), and older pages
// keep their cursor. A message outside the newest window keeps how it last looked until the thread is opened again.

export interface ThreadWindow { older: Message[]; newest: Message[]; cursor: string | null }

const byTime = (a: Message, b: Message) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
function uniqueSorted(list: readonly Message[]): Message[] {
  const seen = new Set<string>();
  return list.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true))).sort(byTime);
}

export const firstWindow = (page: Thread): ThreadWindow => ({ older: [], newest: page.messages, cursor: page.nextBefore });

export function pollWindow(w: ThreadWindow, page: Thread): ThreadWindow {
  const start = page.messages[0];
  // Nothing visible any more (all unsent): nothing older is either.
  if (!start) return { older: [], newest: [], cursor: null };
  const carried = w.newest.filter((m) => byTime(m, start) < 0);
  const older = uniqueSorted([...w.older, ...carried]);
  // Once older messages are held, older pages continue from where they stopped; until then, from the newest page.
  return { older, newest: page.messages, cursor: w.older.length > 0 || carried.length > 0 ? w.cursor : page.nextBefore };
}

export const olderWindow = (w: ThreadWindow, page: Thread): ThreadWindow => ({
  older: uniqueSorted([...page.messages, ...w.older]),
  newest: w.newest,
  cursor: page.nextBefore,
});

/** Everything to show, oldest first. */
export function threadMessages(w: ThreadWindow): Message[] {
  const start = w.newest[0];
  const inWindow = new Set(w.newest.map((m) => m.id));
  return [...w.older.filter((m) => !inWindow.has(m.id) && (!start || byTime(m, start) < 0)), ...w.newest];
}

export const withSent = (w: ThreadWindow, message: Message): ThreadWindow => ({ ...w, newest: uniqueSorted([...w.newest, message]) });

export function withReactions(w: ThreadWindow, id: string, reactions: Reaction[]): ThreadWindow {
  const swap = (list: Message[]) => list.map((m) => (m.id === id ? { ...m, reactions } : m));
  return { ...w, older: swap(w.older), newest: swap(w.newest) };
}

export const withoutMessage = (w: ThreadWindow, id: string): ThreadWindow => ({
  ...w,
  older: w.older.filter((m) => m.id !== id),
  newest: w.newest.filter((m) => m.id !== id),
});

export type ThreadItem =
  | { key: string; type: 'chip'; label: string }
  | { key: string; type: 'message'; message: Message }
  | { key: 'seen'; type: 'seen' };

/** Day chips before each new local day, the messages, and "Seen" when my message is the newest and they read past it. */
export function threadItems(messages: readonly Message[], seenAt: string | null, now: Date): ThreadItem[] {
  const items: ThreadItem[] = [];
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    if (!prev || !sameLocalDay(prev.createdAt, m.createdAt)) items.push({ key: `chip-${m.id}`, type: 'chip', label: dayChip(m.createdAt, now) });
    items.push({ key: m.id, type: 'message', message: m });
  });
  const last = messages[messages.length - 1];
  if (last?.mine && seenAt !== null && seenAt >= last.createdAt) items.push({ key: 'seen', type: 'seen' });
  return items;
}
```

- [ ] **Step 6: Unread chats, the server check and presence**

In `mobile/src/lib/socialStore.ts`, replace the doc comment and body of `useSocialUnreadCount` with:

```ts
/**
 * What the tab dot counts: incoming requests + unseen stickers + conversations with an unread message (S3). 0 unless
 * ready. A missing `unread` or field counts as 0: the tab bar is the app shell and must never throw on a server's shape.
 */
export function useSocialUnreadCount(): number {
  const s = useSocial();
  if (s.status !== 'ready') return 0;
  const u = s.home.unread;
  return (u?.requests ?? 0) + (u?.stickers ?? 0) + (u?.chats ?? 0);
}
```

and append:

```ts
/** Whether the server has Chats (S3): it sends `unread.chats`. null until the home has loaded; false on an older server. */
export function useChatsAvailable(): boolean | null {
  const s = useSocial();
  if (s.status === 'unavailable') return false;
  if (s.status !== 'ready') return null;
  return typeof s.home.unread?.chats === 'number';
}

/** The Chats button's number: conversations with unread messages plus waiting requests (stickers are in the thread). */
export function chatsBadgeCount(unread: { requests?: number; stickers?: number; chats?: number } | undefined): number {
  return (unread?.chats ?? 0) + (unread?.requests ?? 0);
}
```

Replace `mobile/src/components/social/SocialStoreScope.tsx` with:

```tsx
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { pingPresence } from '../../api/chats';
import { refreshSocial, resetSocial } from '../../lib/socialStore';

// Mounted once inside the signed-in navigator: loads the Social home on start and on every return to the
// foreground (keeps the tab dot current), and tells the server I'm active then (Chats activity status, at most a write
// a minute server-side); signing out unmounts it and forgets it.
export function SocialStoreScope() {
  useEffect(() => {
    void refreshSocial();
    void pingPresence();
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      void refreshSocial();
      void pingPresence();
    });
    return () => {
      sub.remove();
      resetSocial();
    };
  }, []);
  return null;
}
```

- [ ] **Step 7: Run the tests**

Run (from `mobile/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/api __tests__/lib __tests__/components/SocialStoreScope.test.tsx __tests__/components/NotificationsSection.test.tsx __tests__/components/NotificationsSectionBuddies.test.tsx __tests__/navigation/FloatingTabBar.test.tsx`
Expected: PASS.
Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/tsc --noEmit --types jest,node --pretty false | grep -c "error TS"` — Expected: `12`.

- [ ] **Step 8: Commit**

```bash
git add mobile/src/api/chats.ts mobile/src/api/notifications.ts mobile/src/api/social.ts mobile/src/lib/chatCopy.ts mobile/src/lib/chatThread.ts mobile/src/lib/socialStore.ts mobile/src/components/social/SocialStoreScope.tsx mobile/__tests__/api/chats.test.ts mobile/__tests__/api/notifications.test.ts mobile/__tests__/lib/chatCopy.test.ts mobile/__tests__/lib/chatThread.test.ts mobile/__tests__/lib/socialStore.test.tsx mobile/__tests__/components/SocialStoreScope.test.tsx
git commit -m "feat(mobile): chats API, copy, the polled thread window, unread chats and presence"
```

---

### Task 14: The thread screen, and buddy pushes open it

Starts only after Task 0b's mockups are approved.

**Files:**
- Create: `mobile/src/components/chats/ChatAvatar.tsx`, `MessageBubble.tsx`, `MessageActionsSheet.tsx`,
  `ReportSheet.tsx`, `ChatComposer.tsx`; `mobile/src/screens/ChatThreadScreen.tsx`
- Modify: `mobile/src/navigation/RootNavigator.tsx`, `mobile/src/notifications/handler.ts`
- Test: create `mobile/__tests__/screens/ChatThreadScreen.test.tsx`; modify
  `mobile/__tests__/notifications/handler.test.ts`

**Interfaces:**
- Consumes: everything in `api/chats.ts`, `lib/chatCopy.ts`, `lib/chatThread.ts` (Task 13); `blockBuddy`,
  `buddyErrorCode`, `Person`, `StickerKind` (`api/buddies.ts`); `STICKERS`, `buddyErrorMessage` (`lib/buddyCopy.ts`);
  `personName` (`lib/socialCopy.ts`); `refreshSocial`, `useSocial` (`lib/socialStore.ts`); `refreshBuddies`
  (`lib/buddiesStore.ts`); `Sheet`, `Button`, `buttonIconSize`, `Text`.
- Produces:
  - `ChatAvatar({ person, size, ring?, active?, testID? })` (testID `${testID}-active` on the active dot).
  - `MessageBubble({ message, buddyName, onLongPress })` — testIDs `message-${id}`, `-reply`, `-card`, `-sticker`,
    `-text`, `-reactions`.
  - `MessageActionsSheet({ message, onClose, onReact(m, kind | null), onReply, onUnsend, onReport })` — testIDs
    `react-${KIND}`, `message-reply`, `message-unsend`, `message-report`.
  - `ReportSheet({ target: { type: ReportTargetType; id: string } | null, name, onClose, onBlock })` — testIDs
    `report-${reason}`, `report-done`, `report-block`, `report-close`, `report-error`.
  - `ChatComposer(props: ComposerProps)` — testIDs `composer-quote`, `composer-reply` (each with `-clear`),
    `composer-sticker-${KIND}`, `composer-checkin`, `composer-input`, `composer-send`, `composer-count`.
  - Route `ChatThread: { buddyId: string; quote?: ChatQuote }` (one screen per buddy, `getId` = buddyId, no header).
  - `dm_message`, `buddy_sticker`, `buddy_paired` and `buddy_badge` taps open `ChatThread` for the push's refId.

- [ ] **Step 1: Write the failing tests**

Create `mobile/__tests__/screens/ChatThreadScreen.test.tsx`:

```tsx
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError } from '../../src/api/client';
import { blockBuddy } from '../../src/api/buddies';
import {
  fetchThread, fileReport, markChatRead, sendCard, sendStickerMessage, sendText, setReaction, unsendMessage, type Message, type Thread,
} from '../../src/api/chats';
import { refreshSocial } from '../../src/lib/socialStore';
import { ChatThreadScreen } from '../../src/screens/ChatThreadScreen';

jest.mock('../../src/api/chats', () => ({
  ...jest.requireActual('../../src/api/chats'),
  fetchThread: jest.fn(),
  markChatRead: jest.fn(() => Promise.resolve()),
  sendText: jest.fn(),
  sendStickerMessage: jest.fn(),
  sendCard: jest.fn(),
  unsendMessage: jest.fn(() => Promise.resolve()),
  setReaction: jest.fn(),
  clearReaction: jest.fn(() => Promise.resolve()),
  fileReport: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/api/buddies', () => ({ ...jest.requireActual('../../src/api/buddies'), blockBuddy: jest.fn(() => Promise.resolve()) }));
jest.mock('../../src/lib/buddiesStore', () => ({ refreshBuddies: jest.fn() }));
const CHECKED_IN = { me: { person: { id: 'me' }, checkIn: { mood: 'RESTED', localDate: '2026-10-08', updatedAt: '' } }, stories: [{ author: { id: 'ben' }, unseen: true }], unread: { requests: 0, stickers: 0, chats: 0 } };
let mockHome: object = CHECKED_IN;
jest.mock('../../src/lib/socialStore', () => ({ refreshSocial: jest.fn(() => Promise.resolve()), useSocial: () => ({ status: 'ready', home: mockHome }) }));
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockReplace = jest.fn();
let mockParams: { buddyId: string; quote?: unknown } = { buddyId: 'ben' };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack, replace: mockReplace }),
  useRoute: () => ({ params: mockParams }),
  // Runs on mount like a first focus (and its cleanup on unmount).
  useFocusEffect: (cb: () => (() => void) | void) => { const React = require('react'); React.useEffect(cb, []); },
}));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const renderScreen = () => render(<SafeAreaProvider initialMetrics={metrics}><ChatThreadScreen /></SafeAreaProvider>);
const ben = { id: 'ben', handle: 'ben.walks', displayName: 'Ben', coachId: 'mochi' };
const T = (h: number, m = 0) => new Date(2026, 9, 8, h, m).toISOString();
const msg = (id: string, over: Partial<Message> = {}): Message => ({ id, mine: false, kind: 'TEXT', text: id, sticker: null, card: null, replyTo: null, reactions: [], createdAt: T(9), ...over });
const thread = (messages: Message[], over: Partial<Thread> = {}): Thread => ({ buddy: ben, messages, nextBefore: null, seenAt: null, activeAt: null, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { buddyId: 'ben' };
  mockHome = CHECKED_IN;
});

it('shows the header, a card, a sticker, a text with its reaction, the day chip and Seen, and marks the thread read once', async () => {
  (fetchThread as jest.Mock).mockResolvedValue(thread([
    msg('c1', { kind: 'CARD', text: null, card: { type: 'checkin', about: 'sender', localDate: '2026-10-08', mood: 'TIRED' }, createdAt: T(7, 31) }),
    msg('s1', { mine: true, kind: 'STICKER', text: null, sticker: 'REST_UP', createdAt: T(7, 40) }),
    msg('t1', { text: 'rough night lol', createdAt: T(8), reactions: [{ kind: 'HEART', mine: true }] }),
    msg('t2', { mine: true, text: 'early night tonight?', createdAt: T(8, 5) }),
  ], { seenAt: T(8, 6), activeAt: new Date(Date.now() - 60_000).toISOString() }));
  renderScreen();
  expect(await screen.findByTestId('thread-name')).toHaveTextContent('Ben');
  expect(screen.getByTestId('thread-sub')).toHaveTextContent('Active now · @ben.walks');
  expect(screen.getByTestId('thread-avatar-active')).toBeTruthy();
  expect(screen.getByTestId('message-c1-card')).toHaveTextContent(/Ben shared their check-in.*MORNING CHECK-IN.*Woke up tired/);
  expect(screen.getByTestId('message-s1-sticker')).toHaveTextContent('Rest up');
  expect(screen.getByTestId('message-t1-text')).toHaveTextContent('rough night lol');
  expect(screen.getByTestId('message-t1-reactions')).toHaveTextContent('Heart');
  expect(screen.getByTestId('chip-c1')).toHaveTextContent(/^\w{3,9} \d/);
  expect(screen.getByTestId('thread-seen')).toHaveTextContent('Seen');
  expect(markChatRead).toHaveBeenCalledTimes(1);
  expect(markChatRead).toHaveBeenCalledWith('ben');
  expect(refreshSocial).toHaveBeenCalled();
  fireEvent.press(screen.getByTestId('thread-info'));
  expect(mockNavigate).toHaveBeenCalledWith('BuddyWeek', { buddyId: 'ben' });
});

it('sends a text: the draft clears and the message lands; a refused send keeps the draft and says why', async () => {
  (fetchThread as jest.Mock).mockResolvedValue(thread([msg('t1')]));
  (sendText as jest.Mock)
    .mockResolvedValueOnce({ message: msg('n1', { mine: true, text: 'hi Ben', createdAt: T(10) }) })
    .mockRejectedValueOnce(new ApiError(400, 'x', 'invalid_message'));
  renderScreen();
  fireEvent.changeText(await screen.findByTestId('composer-input'), '  hi Ben ');
  await act(async () => fireEvent.press(screen.getByTestId('composer-send')));
  expect(sendText).toHaveBeenCalledWith('ben', 'hi Ben', undefined);
  expect(screen.getByTestId('message-n1-text')).toHaveTextContent('hi Ben');
  expect(screen.getByTestId('composer-input').props.value).toBe('');
  fireEvent.changeText(screen.getByTestId('composer-input'), 'again');
  await act(async () => fireEvent.press(screen.getByTestId('composer-send')));
  expect(screen.getByTestId('thread-error')).toHaveTextContent('Messages are 1 to 1,000 characters.');
  expect(screen.getByTestId('composer-input').props.value).toBe('again');
});

it('a staged quote goes out as a card with the next text; a removed one does not', async () => {
  mockParams = { buddyId: 'ben', quote: { request: { type: 'story_frame', at: T(7) }, label: "Ben's check-in" } };
  (fetchThread as jest.Mock).mockResolvedValue(thread([]));
  (sendCard as jest.Mock).mockResolvedValue({
    message: msg('q1', { mine: true, kind: 'CARD', text: 'same', card: { type: 'checkin', about: 'recipient', localDate: '2026-10-08', mood: null }, createdAt: T(10) }),
  });
  renderScreen();
  expect(await screen.findByTestId('composer-quote')).toHaveTextContent("Replying to Ben's check-in");
  expect(screen.getByTestId('thread-empty')).toHaveTextContent('Say hi to Ben.');
  fireEvent.changeText(screen.getByTestId('composer-input'), 'same');
  await act(async () => fireEvent.press(screen.getByTestId('composer-send')));
  expect(sendCard).toHaveBeenCalledWith('ben', { type: 'story_frame', at: T(7) }, 'same', undefined);
  expect(screen.queryByTestId('composer-quote')).toBeNull();
  expect(screen.getByTestId('message-q1-card')).toHaveTextContent('You replied to their check-in');
});

it('removing a staged quote sends a plain text', async () => {
  mockParams = { buddyId: 'ben', quote: { request: { type: 'note' }, label: "Ben's note" } };
  (fetchThread as jest.Mock).mockResolvedValue(thread([]));
  (sendText as jest.Mock).mockResolvedValue({ message: msg('n1', { mine: true, text: 'hey', createdAt: T(10) }) });
  renderScreen();
  fireEvent.press(await screen.findByTestId('composer-quote-clear'));
  fireEvent.changeText(screen.getByTestId('composer-input'), 'hey');
  await act(async () => fireEvent.press(screen.getByTestId('composer-send')));
  expect(sendText).toHaveBeenCalledWith('ben', 'hey', undefined);
  expect(sendCard).not.toHaveBeenCalled();
});

it('quick stickers send a sticker message; "+" shares my check-in', async () => {
  (fetchThread as jest.Mock).mockResolvedValue(thread([msg('t1')]));
  (sendStickerMessage as jest.Mock).mockResolvedValue({ message: msg('k1', { mine: true, kind: 'STICKER', text: null, sticker: 'CHEER', createdAt: T(10) }) });
  (sendCard as jest.Mock).mockResolvedValue({
    message: msg('k2', { mine: true, kind: 'CARD', text: null, card: { type: 'checkin', about: 'sender', localDate: '2026-10-08', mood: 'RESTED' }, createdAt: T(10, 1) }),
  });
  renderScreen();
  await act(async () => fireEvent.press(await screen.findByTestId('composer-sticker-CHEER')));
  expect(sendStickerMessage).toHaveBeenCalledWith('ben', 'CHEER', undefined);
  expect(screen.getByTestId('message-k1-sticker')).toHaveTextContent('Cheer');
  await act(async () => fireEvent.press(screen.getByTestId('composer-checkin')));
  expect(sendCard).toHaveBeenCalledWith('ben', { type: 'my_checkin' }, undefined, undefined);
  expect(screen.getByTestId('message-k2-card')).toHaveTextContent('You shared your check-in');
});

it('"+" is off until I have checked in today', async () => {
  mockHome = { ...CHECKED_IN, me: { person: { id: 'me' }, checkIn: null } };
  (fetchThread as jest.Mock).mockResolvedValue(thread([msg('t1')]));
  renderScreen();
  expect(await screen.findByTestId('composer-checkin')).toBeDisabled();
});

it('a long press opens the actions: react, reply, unsend mine, report theirs, then block too', async () => {
  (fetchThread as jest.Mock).mockResolvedValue(thread([msg('t1', { text: 'rough night lol' }), msg('m1', { mine: true, text: 'oops', createdAt: T(9, 1) })]));
  (setReaction as jest.Mock).mockResolvedValue({ reactions: [{ kind: 'HEART', mine: true }] });
  (sendText as jest.Mock).mockResolvedValue({
    message: msg('r1', { mine: true, text: 'same', replyTo: { id: 't1', gone: false, mine: false, kind: 'TEXT', text: 'rough night lol', sticker: null, cardType: null }, createdAt: T(10) }),
  });
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === 'destructive')?.onPress?.());
  renderScreen();
  fireEvent(await screen.findByTestId('message-t1'), 'longPress');
  await act(async () => fireEvent.press(screen.getByTestId('react-HEART')));
  expect(setReaction).toHaveBeenCalledWith('ben', 't1', 'HEART');
  expect(screen.getByTestId('message-t1-reactions')).toHaveTextContent('Heart');
  fireEvent(screen.getByTestId('message-t1'), 'longPress');
  fireEvent.press(screen.getByTestId('message-reply'));
  expect(screen.getByTestId('composer-reply')).toHaveTextContent("Replying to Ben's message");
  fireEvent.changeText(screen.getByTestId('composer-input'), 'same');
  await act(async () => fireEvent.press(screen.getByTestId('composer-send')));
  expect(sendText).toHaveBeenCalledWith('ben', 'same', 't1');
  expect(screen.getByTestId('message-r1-reply')).toHaveTextContent('Ben: rough night lol');
  expect(screen.queryByTestId('composer-reply')).toBeNull();
  fireEvent(screen.getByTestId('message-m1'), 'longPress');
  expect(screen.queryByTestId('message-report')).toBeNull();
  await act(async () => fireEvent.press(screen.getByTestId('message-unsend')));
  expect(unsendMessage).toHaveBeenCalledWith('ben', 'm1');
  expect(screen.queryByTestId('message-m1')).toBeNull();
  fireEvent(screen.getByTestId('message-t1'), 'longPress');
  fireEvent.press(screen.getByTestId('message-report'));
  await act(async () => fireEvent.press(screen.getByTestId('report-spam')));
  expect(fileReport).toHaveBeenCalledWith('message', 't1', 'spam');
  expect(screen.getByTestId('report-done')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByTestId('report-block')));
  expect(alert).toHaveBeenCalled();
  expect(blockBuddy).toHaveBeenCalledWith('ben');
  expect(mockGoBack).toHaveBeenCalled();
  alert.mockRestore();
});

it('re-reads the newest page every 5 seconds: a new message shows and is marked read; then "no longer buddies"', async () => {
  jest.useFakeTimers();
  (fetchThread as jest.Mock)
    .mockResolvedValueOnce(thread([msg('t1')]))
    .mockResolvedValueOnce(thread([msg('t1'), msg('t2', { text: 'you up?', createdAt: T(9, 5) })]))
    .mockRejectedValueOnce(new ApiError(403, 'x', 'not_buddies'));
  renderScreen();
  expect(await screen.findByTestId('message-t1')).toBeTruthy();
  expect(markChatRead).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(await screen.findByTestId('message-t2-text')).toHaveTextContent('you up?');
  expect(markChatRead).toHaveBeenCalledTimes(2);
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(await screen.findByTestId('thread-gone')).toHaveTextContent("You're no longer buddies.");
  jest.useRealTimers();
});

it('an older server says chats are not here yet and offers their week', async () => {
  (fetchThread as jest.Mock).mockResolvedValueOnce(null);
  renderScreen();
  expect(await screen.findByTestId('thread-unavailable')).toHaveTextContent("Chats aren't available yet.");
  fireEvent.press(screen.getByTestId('thread-open-week'));
  expect(mockReplace).toHaveBeenCalledWith('BuddyWeek', { buddyId: 'ben' });
});

it('a failed first load offers a retry; a message this app cannot draw is skipped', async () => {
  (fetchThread as jest.Mock)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(thread([msg('t1'), msg('v1', { kind: 'VOICE' as never, text: null })]));
  renderScreen();
  await act(async () => fireEvent.press(await screen.findByTestId('thread-retry')));
  expect(await screen.findByTestId('message-t1')).toBeTruthy();
  expect(screen.queryByTestId('message-v1')).toBeNull();
});
```

In `mobile/__tests__/notifications/handler.test.ts`:
- replace every `'BuddyWeek', { buddyId: ID }` with `'ChatThread', { buddyId: ID }`:
  `sed -i '' "s/'BuddyWeek', { buddyId: ID }/'ChatThread', { buddyId: ID }/g" mobile/__tests__/notifications/handler.test.ts`;
- change the title `"a tap opens the requests tab for a request, and the actor's week for anything else"` to
  `"a tap opens the requests for a request, and the actor's thread for anything else"`, and its loop
  `for (const kind of ['buddy_sticker', 'buddy_paired', 'buddy_badge'])` to
  `for (const kind of ['buddy_sticker', 'buddy_paired', 'buddy_badge', 'dm_message'])`;
- in `it('show as a banner while the app is open; …')`, change the loop to
  `for (const kind of ['buddy_sticker', 'buddy_request', 'buddy_paired', 'buddy_badge', 'dm_message'])`.

- [ ] **Step 2: Run them to see them fail**

Run (from `mobile/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/screens/ChatThreadScreen.test.tsx __tests__/notifications/handler.test.ts`
Expected: FAIL — "Cannot find module '../../src/screens/ChatThreadScreen'"; the handler still opens BuddyWeek and ignores `dm_message`.

- [ ] **Step 3: The avatar and the bubble**

Create `mobile/src/components/chats/ChatAvatar.tsx`:

```tsx
import React from 'react';
import { View } from 'react-native';
import type { Person } from '../../api/buddies';
import { Character } from '../characters/Character';
import { DEFAULT_CHARACTER_ID, isCharacterId } from '../characters/types';

const STORY_RING = '#2DD4BF';
const ACTIVE_DOT = '#22C55E';

/** A buddy's coach in a circle (V5 boards): a teal ring while they have an unseen story, a green dot while active now. */
export function ChatAvatar({ person, size, ring = false, active = false, testID }: { person: Person; size: number; ring?: boolean; active?: boolean; testID?: string }) {
  const inner = size - 4;
  const dot = Math.round(size * 0.26);
  return (
    <View testID={testID} style={{ width: size, height: size, borderRadius: size / 2, padding: 2, backgroundColor: ring ? STORY_RING : 'transparent' }}>
      <View className="items-center justify-center border-2 border-background bg-card" style={{ width: inner, height: inner, borderRadius: inner / 2 }}>
        <Character characterId={isCharacterId(person.coachId) ? person.coachId : DEFAULT_CHARACTER_ID} mood="idle" size={Math.round(inner * 0.62)} paused />
      </View>
      {active ? (
        <View
          testID={testID ? `${testID}-active` : undefined}
          className="border-2 border-background"
          style={{ position: 'absolute', right: 0, bottom: 0, width: dot, height: dot, borderRadius: dot / 2, backgroundColor: ACTIVE_DOT }}
        />
      ) : null}
    </View>
  );
}
```

Create `mobile/src/components/chats/MessageBubble.tsx`:

```tsx
import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import type { Card, Message } from '../../api/chats';
import { STICKERS } from '../../lib/buddyCopy';
import { cardCaption, cardKicker, cardLine, moodColor, replyLine, stickerLine } from '../../lib/chatCopy';
import { COLORS } from '../../theme';
import { Text } from '../ui/text';

// One message (spec 2026-10-07 social §8.2; V5 thread board): mine on the right in teal, theirs on the left in grey; a
// sticker as a pill, a card as a small framed quote under its caption, a reply's one-line quote above, reactions below.
// Not a button: a long press (or the screen reader's "Message options" action) opens the message's actions.

function CardView({ card, mine, buddyName, testID }: { card: Card; mine: boolean; buddyName: string; testID: string }) {
  return (
    <View testID={testID} className="w-[230px] gap-2 rounded-[18px] border border-border bg-card p-3">
      <Text className="text-[11px] text-muted-foreground">{cardCaption(card, mine, buddyName)}</Text>
      <Text className="text-[10px] font-semibold tracking-[1.2px] text-muted-foreground">{cardKicker(card)}</Text>
      <View className="flex-row items-center gap-2">
        {card.type === 'checkin' && card.mood ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: moodColor(card.mood) }} /> : null}
        <Text className="flex-1 text-[15px] font-semibold">{cardLine(card)}</Text>
      </View>
    </View>
  );
}

export function MessageBubble({ message: m, buddyName, onLongPress }: { message: Message; buddyName: string; onLongPress: (m: Message) => void }) {
  const { colorScheme } = useColorScheme();
  const colors = COLORS[colorScheme === 'light' ? 'light' : 'dark'];
  const icon = STICKERS.find((s) => s.kind === m.sticker)?.icon ?? 'happy-outline';
  return (
    <Pressable
      testID={`message-${m.id}`}
      onLongPress={() => onLongPress(m)}
      delayLongPress={300}
      accessibilityHint="Double tap and hold for options"
      accessibilityActions={[{ name: 'longpress', label: 'Message options' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'longpress') onLongPress(m);
      }}
      className={m.mine ? 'max-w-[80%] items-end gap-1 self-end' : 'max-w-[80%] items-start gap-1 self-start'}
    >
      {m.replyTo ? <Text testID={`message-${m.id}-reply`} numberOfLines={1} className="text-[11px] text-muted-foreground">{replyLine(m.replyTo, buddyName)}</Text> : null}
      {m.kind === 'CARD' && m.card ? <CardView card={m.card} mine={m.mine} buddyName={buddyName} testID={`message-${m.id}-card`} /> : null}
      {m.kind === 'STICKER' && m.sticker ? (
        <View testID={`message-${m.id}-sticker`} className="h-14 flex-row items-center gap-2.5 rounded-[22px] bg-secondary px-4">
          <Ionicons name={icon} size={16} color={colors.foreground} />
          <Text className="text-[15px] font-semibold">{stickerLine(m.sticker)}</Text>
        </View>
      ) : null}
      {m.text ? (
        <View className={m.mine ? 'rounded-[20px] bg-accent px-3.5 py-2.5' : 'rounded-[20px] bg-secondary px-3.5 py-2.5'}>
          <Text testID={`message-${m.id}-text`} className={m.mine ? 'text-[14px] leading-5 text-background' : 'text-[14px] leading-5 text-foreground'}>{m.text}</Text>
        </View>
      ) : null}
      {m.reactions.length > 0 ? (
        <View testID={`message-${m.id}-reactions`} className="flex-row gap-1">
          {m.reactions.map((r, i) => (
            <Text key={`${r.kind}-${i}`} className={r.mine ? 'rounded-full border border-accent px-2 text-[11px]' : 'rounded-full border border-border px-2 text-[11px]'}>
              {stickerLine(r.kind)}
            </Text>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}
```

- [ ] **Step 4: The two sheets and the composer**

Create `mobile/src/components/chats/MessageActionsSheet.tsx`:

```tsx
import React from 'react';
import { View } from 'react-native';
import type { StickerKind } from '../../api/buddies';
import type { Message } from '../../api/chats';
import { STICKERS } from '../../lib/buddyCopy';
import { Button } from '../ui/button';
import { Sheet } from '../ui/sheet';

// A message's actions (spec §8.2): react with one of the four stickers (my current one is filled; tapping it again
// removes it), reply, unsend mine, or report theirs.
export function MessageActionsSheet({ message, onClose, onReact, onReply, onUnsend, onReport }: {
  message: Message | null;
  onClose: () => void;
  onReact: (m: Message, kind: StickerKind | null) => void;
  onReply: (m: Message) => void;
  onUnsend: (m: Message) => void;
  onReport: (m: Message) => void;
}) {
  const current = message?.reactions.find((r) => r.mine)?.kind ?? null;
  return (
    <Sheet visible={message !== null} onClose={onClose} testID="message-actions">
      {message ? (
        <View className="gap-3 pb-2">
          <View className="flex-row gap-2">
            {STICKERS.map((s) => (
              <Button
                key={s.kind}
                testID={`react-${s.kind}`}
                variant={current === s.kind ? 'default' : 'outline'}
                size="sm"
                className="flex-1 rounded-full"
                accessibilityState={{ selected: current === s.kind }}
                onPress={() => onReact(message, current === s.kind ? null : s.kind)}
              >
                {s.label}
              </Button>
            ))}
          </View>
          <Button testID="message-reply" variant="secondary" onPress={() => onReply(message)}>Reply</Button>
          {message.mine ? (
            <Button testID="message-unsend" variant="destructive" onPress={() => onUnsend(message)}>Unsend</Button>
          ) : (
            <Button testID="message-report" variant="outline" onPress={() => onReport(message)}>Report</Button>
          )}
        </View>
      ) : null}
    </Sheet>
  );
}
```

Create `mobile/src/components/chats/ReportSheet.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { buddyErrorCode } from '../../api/buddies';
import { fileReport, type ReportReason, type ReportTargetType } from '../../api/chats';
import { buddyErrorMessage } from '../../lib/buddyCopy';
import { REPORT_REASONS } from '../../lib/chatCopy';
import { Button } from '../ui/button';
import { Sheet } from '../ui/sheet';
import { Text } from '../ui/text';

// Report a message, a Chats note or a camp note (spec §9): pick a reason; the other person is never told; then "Block
// {name} too" is offered. Used by the thread, the inbox's notes row and the Campfire's "Who's here".
export function ReportSheet({ target, name, onClose, onBlock }: {
  target: { type: ReportTargetType; id: string } | null;
  name: string;
  onClose: () => void;
  onBlock: () => void;
}) {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const key = target ? `${target.type}:${target.id}` : null;
  useEffect(() => {
    setDone(false);
    setError(null);
  }, [key]);

  const report = async (reason: ReportReason) => {
    if (!target || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await fileReport(target.type, target.id, reason);
      setDone(true);
    } catch (e) {
      setError(buddyErrorMessage(buddyErrorCode(e)));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <Sheet visible={target !== null} onClose={onClose} testID="report-sheet">
      {done ? (
        <View className="gap-3 pb-2">
          <Text testID="report-done" className="text-base font-semibold">Thanks for telling us.</Text>
          <Text className="text-sm text-muted-foreground">{`${name} won't be told you reported this.`}</Text>
          <Button testID="report-block" variant="destructive" onPress={onBlock}>{`Block ${name} too`}</Button>
          <Button testID="report-close" variant="secondary" onPress={onClose}>Done</Button>
        </View>
      ) : (
        <View className="gap-3 pb-2">
          <Text className="text-base font-semibold">Why are you reporting this?</Text>
          {REPORT_REASONS.map((r) => (
            <Button key={r.reason} testID={`report-${r.reason}`} variant="outline" disabled={busy} onPress={() => void report(r.reason)}>{r.label}</Button>
          ))}
          {error ? <Text testID="report-error" className="text-sm text-destructive">{error}</Text> : null}
        </View>
      )}
    </Sheet>
  );
}
```

Create `mobile/src/components/chats/ChatComposer.tsx`:

```tsx
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import type { StickerKind } from '../../api/buddies';
import { STICKERS } from '../../lib/buddyCopy';
import { MESSAGE_MAX } from '../../lib/chatCopy';
import { COLORS } from '../../theme';
import { Button, buttonIconSize } from '../ui/button';
import { Text } from '../ui/text';

// The thread's composer (V5 thread board): a staged quote or reply (each removable), the quick-sticker row, "+" to share
// my check-in today, the "Message…" input and Send. The draft empties as it is sent and comes back if the send fails
// (unless I've typed again since). The count shows from 900 code points; past 1000 Send is off (the server's limit).

const COUNT_FROM = 900;

export interface ComposerProps {
  disabled: boolean;
  quote: { label: string } | null;
  onClearQuote: () => void;
  replyTo: { label: string } | null;
  onClearReply: () => void;
  canShareCheckIn: boolean;
  onShareCheckIn: () => void;
  onSticker: (kind: StickerKind) => void;
  /** Resolves true once sent. */
  onSend: (text: string) => Promise<boolean>;
}

function Staged({ testID, label, clearLabel, onClear, color }: { testID: string; label: string; clearLabel: string; onClear: () => void; color: string }) {
  return (
    <View testID={testID} className="flex-row items-center gap-2 rounded-xl bg-secondary px-3 py-1.5">
      <Text numberOfLines={1} className="flex-1 text-xs text-muted-foreground">{`Replying to ${label}`}</Text>
      <Button testID={`${testID}-clear`} variant="ghost" size="icon-xs" accessibilityLabel={clearLabel} onPress={onClear}>
        <Ionicons name="close" size={buttonIconSize('icon-xs')} color={color} />
      </Button>
    </View>
  );
}

export function ChatComposer(p: ComposerProps) {
  const { colorScheme } = useColorScheme();
  const colors = COLORS[colorScheme === 'light' ? 'light' : 'dark'];
  const [draft, setDraft] = useState('');
  const length = [...draft.trim()].length;
  const canSend = !p.disabled && length > 0 && length <= MESSAGE_MAX;
  const send = async () => {
    if (!canSend) return;
    const sent = draft.trim();
    setDraft('');
    if (!(await p.onSend(sent))) setDraft((d) => (d === '' ? sent : d));
  };
  return (
    <View className="gap-2 px-3 pb-2 pt-2">
      {p.quote ? <Staged testID="composer-quote" label={p.quote.label} clearLabel="Remove the quote" onClear={p.onClearQuote} color={colors.foreground} /> : null}
      {p.replyTo ? <Staged testID="composer-reply" label={p.replyTo.label} clearLabel="Stop replying" onClear={p.onClearReply} color={colors.foreground} /> : null}
      <View className="flex-row gap-2">
        {STICKERS.map((s) => (
          <Button key={s.kind} testID={`composer-sticker-${s.kind}`} variant="outline" size="sm" className="flex-1 rounded-full" disabled={p.disabled} onPress={() => p.onSticker(s.kind)}>
            {s.label}
          </Button>
        ))}
      </View>
      <View className="flex-row items-end gap-2">
        <Button testID="composer-checkin" variant="outline" size="icon" accessibilityLabel="Share your check-in" disabled={p.disabled || !p.canShareCheckIn} onPress={p.onShareCheckIn}>
          <Ionicons name="add" size={buttonIconSize('icon')} color={colors.foreground} />
        </Button>
        <TextInput
          testID="composer-input"
          accessibilityLabel="Message"
          placeholder="Message…"
          placeholderTextColor={colors.muted}
          multiline
          value={draft}
          onChangeText={setDraft}
          className="max-h-28 min-h-[36px] flex-1 rounded-[18px] bg-secondary px-3.5 py-2 text-[14px] text-foreground"
        />
        <Button testID="composer-send" size="icon" accessibilityLabel="Send" disabled={!canSend} onPress={() => void send()}>
          <Ionicons name="arrow-up" size={buttonIconSize('icon')} color={colors.background} />
        </Button>
      </View>
      {length >= COUNT_FROM ? (
        <Text testID="composer-count" className={length > MESSAGE_MAX ? 'self-end text-xs text-destructive' : 'self-end text-xs text-muted-foreground'}>{`${length}/${MESSAGE_MAX}`}</Text>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 5: The screen**

Create `mobile/src/screens/ChatThreadScreen.tsx`:

```tsx
// A chat thread (spec 2026-10-07 social §8.2; V5 thread board): the header (their coach with a story ring and the
// active dot, name, "Active now" / "Active 3h ago" and @handle, info → their week), day chips, bubbles, cards,
// reactions, "Seen" and the composer (a staged quote or reply, quick stickers, "+" to share my check-in, "Message…").
// No socket: while focused and the app is active it re-reads the newest page every 5 s (lib/chatThread keeps older pages
// and carries what slides out of the window); their newest message changing marks the thread read and refreshes the tab
// dot. A long press on a message opens its actions. No longer buddies → "You're no longer buddies."; an older server
// (bare 404) → "Chats aren't available yet" with their week instead. Message text is a buddy's free text: never logged.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, KeyboardAvoidingView, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useColorScheme } from 'nativewind';
import { blockBuddy, buddyErrorCode, type Person, type StickerKind } from '../api/buddies';
import {
  clearReaction, fetchThread, markChatRead, sendCard, sendStickerMessage, sendText, setReaction, unsendMessage,
  type ChatQuote, type Message, type Thread,
} from '../api/chats';
import { ChatAvatar } from '../components/chats/ChatAvatar';
import { ChatComposer } from '../components/chats/ChatComposer';
import { MessageActionsSheet } from '../components/chats/MessageActionsSheet';
import { MessageBubble } from '../components/chats/MessageBubble';
import { ReportSheet } from '../components/chats/ReportSheet';
import { Button, buttonIconSize } from '../components/ui/button';
import { Text } from '../components/ui/text';
import { buddyErrorMessage } from '../lib/buddyCopy';
import { refreshBuddies } from '../lib/buddiesStore';
import { activeLine, knownMessages, POLL_MS } from '../lib/chatCopy';
import {
  firstWindow, olderWindow, pollWindow, threadItems, threadMessages, withReactions, withSent, withoutMessage, type ThreadWindow,
} from '../lib/chatThread';
import { personName } from '../lib/socialCopy';
import { refreshSocial, useSocial } from '../lib/socialStore';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { COLORS } from '../theme';

type Phase = 'loading' | 'ready' | 'gone' | 'unavailable' | 'error';

export function ChatThreadScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'ChatThread'>>();
  const { buddyId } = route.params;
  const { colorScheme } = useColorScheme();
  const colors = COLORS[colorScheme === 'light' ? 'light' : 'dark'];
  const social = useSocial();
  const myCheckIn = social.status === 'ready' ? social.home.me.checkIn : null;
  const ringUnseen = social.status === 'ready' && social.home.stories.some((r) => r.author.id === buddyId && r.unseen);

  const [phase, setPhase] = useState<Phase>('loading');
  const [buddy, setBuddy] = useState<Person | null>(null);
  const [win, setWin] = useState<ThreadWindow | null>(null);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [activeAt, setActiveAt] = useState<string | null>(null);
  const [quote, setQuote] = useState<ChatQuote | null>(route.params.quote ?? null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [selected, setSelected] = useState<Message | null>(null);
  const [reporting, setReporting] = useState<Message | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // A double tap before the next render sends once; a late answer after leaving sets nothing; a slower read never lands
  // over a newer one.
  const sendingRef = useRef(false);
  const mounted = useRef(true);
  const seq = useRef(0);
  const loaded = useRef(false);
  const lastTheirs = useRef<string | null | undefined>(undefined);
  const loadingOlder = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // Opened again from a story, a note or the camp: the new quote replaces the staged one.
  useEffect(() => setQuote(route.params.quote ?? null), [route.params.quote]);

  const apply = useCallback((page: Thread) => {
    setBuddy(page.buddy);
    setSeenAt(page.seenAt);
    setActiveAt(page.activeAt);
    setWin((w) => (w === null ? firstWindow(page) : pollWindow(w, page)));
    setPhase('ready');
    loaded.current = true;
    // Opening reads the thread; after that, only a new message from them does.
    const theirs = [...page.messages].reverse().find((m) => !m.mine)?.id ?? null;
    if (theirs !== lastTheirs.current) {
      lastTheirs.current = theirs;
      void markChatRead(buddyId).then(() => refreshSocial(), () => undefined);
    }
  }, [buddyId]);

  const load = useCallback(async () => {
    const at = ++seq.current;
    try {
      const page = await fetchThread(buddyId);
      if (!mounted.current || at !== seq.current) return;
      if (page === null) setPhase('unavailable');
      else apply(page);
    } catch (e) {
      if (!mounted.current || at !== seq.current) return;
      if (buddyErrorCode(e) === 'not_buddies') setPhase('gone');
      // A failed poll keeps what is shown; only a first load shows the error.
      else if (!loaded.current) setPhase('error');
    }
  }, [buddyId, apply]);

  // Poll while focused and the app is active.
  useFocusEffect(useCallback(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer === null) timer = setInterval(() => void load(), POLL_MS);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    void load();
    start();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        void load();
        start();
      } else {
        stop();
      }
    });
    return () => {
      stop();
      sub.remove();
    };
  }, [load]));

  const loadOlder = async () => {
    const cursor = win?.cursor;
    if (!cursor || loadingOlder.current) return;
    loadingOlder.current = true;
    try {
      const page = await fetchThread(buddyId, cursor);
      if (page && mounted.current) setWin((w) => (w ? olderWindow(w, page) : w));
    } catch {
      // The next scroll to the top tries again.
    } finally {
      loadingOlder.current = false;
    }
  };

  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    if (sendingRef.current) return null;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      const code = buddyErrorCode(e);
      if (mounted.current) {
        if (code === 'not_buddies') setPhase('gone');
        else setError(buddyErrorMessage(code));
      }
      return null;
    } finally {
      sendingRef.current = false;
      if (mounted.current) setSending(false);
    }
  }

  const landed = (m: Message) => {
    setWin((w) => (w ? withSent(w, m) : w));
    setReplyTo(null);
    void refreshSocial();
  };
  const sendMessageText = async (text: string): Promise<boolean> => {
    const staged = quote;
    const result = await run(() => (staged ? sendCard(buddyId, staged.request, text, replyTo?.id) : sendText(buddyId, text, replyTo?.id)));
    if (!result) return false;
    if (staged) setQuote(null);
    landed(result.message);
    return true;
  };
  const sendSticker = (kind: StickerKind) => {
    void run(() => sendStickerMessage(buddyId, kind, replyTo?.id)).then((r) => {
      if (r) landed(r.message);
    });
  };
  const shareCheckIn = () => {
    void run(() => sendCard(buddyId, { type: 'my_checkin' }, undefined, replyTo?.id)).then((r) => {
      if (r) landed(r.message);
    });
  };
  const react = (m: Message, kind: StickerKind | null) => {
    setSelected(null);
    void run(async () => {
      if (kind === null) {
        await clearReaction(buddyId, m.id);
        return m.reactions.filter((r) => !r.mine);
      }
      return (await setReaction(buddyId, m.id, kind)).reactions;
    }).then((reactions) => {
      if (reactions) setWin((w) => (w ? withReactions(w, m.id, reactions) : w));
    });
  };
  const unsend = (m: Message) => {
    setSelected(null);
    void run(async () => {
      await unsendMessage(buddyId, m.id);
      return true;
    }).then((ok) => {
      if (ok) setWin((w) => (w ? withoutMessage(w, m.id) : w));
    });
  };
  const name = buddy ? personName(buddy, false) : '';
  const blockToo = () => {
    setReporting(null);
    Alert.alert(`Block ${name}?`, "They won't be told. You can unblock them in Profile.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: () => {
          void blockBuddy(buddyId).then(
            () => {
              void refreshSocial();
              void refreshBuddies();
              navigation.goBack();
            },
            (e: unknown) => setError(buddyErrorMessage(buddyErrorCode(e))),
          );
        },
      },
    ]);
  };

  const back = (
    <Button testID="thread-back" variant="ghost" size="icon-lg" accessibilityLabel="Back to chats" onPress={() => navigation.goBack()}>
      <Ionicons name="chevron-back" size={buttonIconSize('icon-lg')} color={colors.foreground} />
    </Button>
  );

  if (phase !== 'ready' || !buddy || !win) {
    return (
      <SafeAreaView testID={`thread-${phase}`} className="flex-1 bg-background">
        <View className="flex-row px-3 pt-1">{back}</View>
        <View className="flex-1 items-center justify-center gap-4 px-8">
          {phase === 'loading' ? <ActivityIndicator /> : null}
          {phase === 'gone' ? <Text className="text-center text-muted-foreground">You're no longer buddies.</Text> : null}
          {phase === 'unavailable' ? (
            <>
              <Text className="text-center text-muted-foreground">Chats aren't available yet.</Text>
              <Button testID="thread-open-week" variant="secondary" onPress={() => navigation.replace('BuddyWeek', { buddyId })}>Open their week</Button>
            </>
          ) : null}
          {phase === 'error' ? (
            <>
              <Text className="text-center text-muted-foreground">Couldn't load this chat.</Text>
              <Button testID="thread-retry" variant="secondary" onPress={() => void load()}>Try again</Button>
            </>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  const now = new Date();
  const messages = knownMessages(threadMessages(win));
  // Inverted: the newest at the bottom, older pages load at the top.
  const items = threadItems(messages, seenAt, now).reverse();
  const active = activeLine(activeAt, now.getTime());
  return (
    <SafeAreaView testID="thread" edges={['top', 'bottom']} className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View className="flex-row items-center gap-2 border-b border-border px-3 pb-2.5 pt-1">
          {back}
          <ChatAvatar person={buddy} size={40} ring={ringUnseen} active={active === 'Active now'} testID="thread-avatar" />
          <View className="flex-1 gap-px">
            <Text testID="thread-name" numberOfLines={1} className="text-[15px] font-bold">{name}</Text>
            <Text testID="thread-sub" numberOfLines={1} className="text-xs text-muted-foreground">{active ? `${active} · @${buddy.handle}` : `@${buddy.handle}`}</Text>
          </View>
          <Button testID="thread-info" variant="ghost" size="icon-lg" accessibilityLabel={`${name}'s week`} onPress={() => navigation.navigate('BuddyWeek', { buddyId })}>
            <Ionicons name="information-circle-outline" size={buttonIconSize('icon-lg')} color={colors.foreground} />
          </Button>
        </View>
        {messages.length === 0 ? (
          <View className="flex-1 items-center justify-center px-8">
            <Text testID="thread-empty" className="text-center text-muted-foreground">{`Say hi to ${name}.`}</Text>
          </View>
        ) : (
          <FlatList
            testID="thread-list"
            inverted
            data={items}
            keyExtractor={(i) => i.key}
            onEndReached={() => void loadOlder()}
            onEndReachedThreshold={0.3}
            contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 12, gap: 8 }}
            renderItem={({ item }) =>
              item.type === 'chip' ? (
                <Text testID={item.key} className="self-center py-1 text-[11px] text-muted-foreground">{item.label}</Text>
              ) : item.type === 'seen' ? (
                <Text testID="thread-seen" className="self-end text-[11px] text-muted-foreground">Seen</Text>
              ) : (
                <MessageBubble message={item.message} buddyName={name} onLongPress={setSelected} />
              )
            }
          />
        )}
        {error ? <Text testID="thread-error" className="px-4 pb-1 text-sm text-destructive">{error}</Text> : null}
        <ChatComposer
          disabled={sending}
          quote={quote ? { label: quote.label } : null}
          onClearQuote={() => setQuote(null)}
          replyTo={replyTo ? { label: replyTo.mine ? 'your message' : `${name}'s message` } : null}
          onClearReply={() => setReplyTo(null)}
          canShareCheckIn={myCheckIn !== null}
          onShareCheckIn={shareCheckIn}
          onSticker={sendSticker}
          onSend={sendMessageText}
        />
      </KeyboardAvoidingView>
      <MessageActionsSheet
        message={selected}
        onClose={() => setSelected(null)}
        onReact={react}
        onReply={(m) => {
          setSelected(null);
          setReplyTo(m);
        }}
        onUnsend={unsend}
        onReport={(m) => {
          setSelected(null);
          setReporting(m);
        }}
      />
      <ReportSheet target={reporting ? { type: 'message', id: reporting.id } : null} name={name} onClose={() => setReporting(null)} onBlock={blockToo} />
    </SafeAreaView>
  );
}
```

- [ ] **Step 6: The route and the push taps**

In `mobile/src/navigation/RootNavigator.tsx`:
- add `import type { ChatQuote } from '../api/chats';` after the `ScoreType` import, and
  `import { ChatThreadScreen } from '../screens/ChatThreadScreen';` after the `CampfireScreen` import;
- in `RootStackParamList`, after the `Campfire: undefined;` line add:

```ts
  // Chats (S3): one buddy's thread. `quote` stages a story frame, a note or a camp note to send with the next text.
  ChatThread: { buddyId: string; quote?: ChatQuote };
```

- after the `Campfire` `<Stack.Screen … />` add:

```tsx
              {/* Chats (S3): its own header (coach, active line, info); one screen per buddy, like BuddyWeek. */}
              <Stack.Screen name="ChatThread" component={ChatThreadScreen} getId={({ params }) => params?.buddyId} options={{ headerShown: false }} />
```

In `mobile/src/notifications/handler.ts`:
- in the header comment, replace the line `// pushes in the foreground, and opens the Sleep screen, a recap, the buddy requests or a buddy's`
  with `// pushes in the foreground, and opens the Sleep screen, a recap, the buddy requests or a buddy's chat thread`
  and the line `// week when one is tapped (a recap opens the story viewer, which plays a week and hands a month`
  with `// when one is tapped (a recap opens the story viewer, which plays a week and hands a month`;
- replace `export const BUDDY_PUSH_KINDS = ['buddy_sticker', 'buddy_request', 'buddy_paired', 'buddy_badge'] as const;` with
  `export const BUDDY_PUSH_KINDS = ['buddy_sticker', 'buddy_request', 'buddy_paired', 'buddy_badge', 'dm_message'] as const;`;
- in `routeFor`, replace

```ts
    // refId is the request id for a request (opens the requests), else the actor's user id (their
    // week); nothing else in the data is used. `open` is new on every tap: Buddies re-selects its
    // tab when it changes, so a Buddies screen already on Requests but switched away goes back.
    return buddy.kind === 'buddy_request'
      ? () => navigationRef.navigate('Buddies', { tab: 'requests', open: Date.now() }, { pop: true })
      : () => navigationRef.navigate('BuddyWeek', { buddyId: buddy.refId }, { pop: true });
```

with

```ts
    // refId is the request id for a request (opens the requests), else the actor's user id: a message, sticker, pairing
    // or badge opens their thread (spec 2026-10-07 social §2; their week is one tap from its header; on a server without
    // chats the thread offers the week). Nothing else in the data is used. `open` is new on every request tap: Buddies
    // re-selects its tab when it changes.
    return buddy.kind === 'buddy_request'
      ? () => navigationRef.navigate('Buddies', { tab: 'requests', open: Date.now() }, { pop: true })
      : () => navigationRef.navigate('ChatThread', { buddyId: buddy.refId }, { pop: true });
```

- [ ] **Step 7: Run the tests**

Run (from `mobile/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/screens/ChatThreadScreen.test.tsx __tests__/notifications __tests__/navigation __tests__/conventions/buttons.test.ts`
Expected: PASS (the bubble is a `Pressable` with no role, so the button guard needs no new entry).
Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/tsc --noEmit --types jest,node --pretty false | grep -c "error TS"` — Expected: `12`.

- [ ] **Step 8: Commit**

```bash
git add mobile/src/components/chats mobile/src/screens/ChatThreadScreen.tsx mobile/src/navigation/RootNavigator.tsx mobile/src/notifications/handler.ts mobile/__tests__/screens/ChatThreadScreen.test.tsx mobile/__tests__/notifications/handler.test.ts
git commit -m "feat(mobile): the chat thread, polled every 5 seconds, and buddy pushes open it"
```

---

### Task 15: The Chats inbox, notes and Requests, and the Chats button opens it

Starts only after Task 0b's mockups are approved.

**Files:**
- Create: `mobile/src/components/chats/ChatRow.tsx`, `NotesRow.tsx`, `NoteComposerSheet.tsx`, `NewChatSheet.tsx`,
  `RequestsList.tsx`; `mobile/src/screens/ChatsScreen.tsx`, `mobile/src/screens/ChatRequestsScreen.tsx`
- Modify: `mobile/src/screens/BuddiesScreen.tsx` (its Requests tab renders `RequestsList`),
  `mobile/src/screens/SocialScreen.tsx` (the Chats button), `mobile/src/navigation/RootNavigator.tsx`,
  `mobile/__tests__/conventions/buttons.test.ts` (allowlist)
- Test: create `mobile/__tests__/screens/ChatsScreen.test.tsx`, `mobile/__tests__/screens/ChatRequestsScreen.test.tsx`;
  modify `mobile/__tests__/screens/SocialScreen.test.tsx`

**Interfaces:**
- Consumes: `fetchChats`, `fetchNotes`, `sendStickerMessage`, `saveStatusNote`, `clearStatusNote`, `ChatRow`,
  `ChatsPage`, `Notes`, `BuddyNote`, `StatusNote` (Task 13); `chatRowLine`, `activeLine`, `noteQuoteLabel`,
  `noteLength`, `STATUS_NOTE_MAX` (Task 13); `chatsBadgeCount`, `useChatsAvailable`, `useSocial`, `refreshSocial`
  (Task 13); `ChatAvatar`, `ReportSheet` (Task 14); `useBuddies`, `refreshBuddies`; `IdentityGate`,
  `useMoodNoticeGate`, `MoodNoticeSheet`; the Buddies request API.
- Produces:
  - `ChatRow({ row, ring, now, busy, onOpen, onCheer })` — testIDs `chat-row-${id}` (`-avatar`, `-line`, `-unread`,
    `-cheer`).
  - `NotesRow({ me, mine, buddies, onMine, onOpen, onReport })` — testIDs `note-mine`, `note-${id}`.
  - `NoteComposerSheet({ visible, current, onClose, onSaved })` — `note-input`, `note-count`, `note-share`,
    `note-clear`, `note-error`.
  - `NewChatSheet({ visible, onClose, onPick, onAdd })` — `new-chat-${id}`, `new-chat-add`.
  - `RequestsList({ gate, onAccepted })` (the Buddies Requests tab, moved; testIDs unchanged: `request-in-${id}`,
    `request-accept-${id}`, …, `requests-list`, `requests-message`, `requests-empty`).
  - Screens `ChatsScreen` (route `Chats`, no header) and `ChatRequestsScreen` (route `ChatRequests`, title "Requests").
  - The Social Chats button opens `Chats` on a server with chats (count = chats + requests), else its S2 targets.

- [ ] **Step 1: Write the failing tests**

Create `mobile/__tests__/screens/ChatsScreen.test.tsx`:

```tsx
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError } from '../../src/api/client';
import { clearStatusNote, fetchChats, fetchNotes, fileReport, saveStatusNote, sendStickerMessage, type ChatRow, type ChatsPage } from '../../src/api/chats';
import { ChatsScreen } from '../../src/screens/ChatsScreen';

jest.mock('../../src/api/chats', () => ({
  ...jest.requireActual('../../src/api/chats'),
  fetchChats: jest.fn(),
  fetchNotes: jest.fn(),
  saveStatusNote: jest.fn(() => Promise.resolve({ note: {} })),
  clearStatusNote: jest.fn(() => Promise.resolve()),
  sendStickerMessage: jest.fn(() => Promise.resolve({ message: {} })),
  fileReport: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/api/buddies', () => ({ ...jest.requireActual('../../src/api/buddies'), blockBuddy: jest.fn(() => Promise.resolve()) }));
const person = (id: string, name = id.toUpperCase()) => ({ id, handle: id, displayName: name, coachId: 'mochi' });
const mockHome = { me: { person: person('tushar'), checkIn: null }, stories: [{ author: person('ben'), unseen: true }], unread: { requests: 2, stickers: 0, chats: 1 } };
jest.mock('../../src/lib/socialStore', () => ({ refreshSocial: jest.fn(), useSocial: () => ({ status: 'ready', home: mockHome }) }));
const mockBuddies = { status: 'ready', page: { buddies: [{ ...person('ana', 'Ana'), mood: 'good', moodLine: '', unseenSticker: false }], nextCursor: null, incomingRequests: 0, outgoingRequests: 0 } };
jest.mock('../../src/lib/buddiesStore', () => ({ useBuddies: () => mockBuddies, refreshBuddies: jest.fn() }));
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useFocusEffect: (cb: () => void) => { const React = require('react'); React.useEffect(cb, []); },
}));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const renderScreen = () => render(<SafeAreaProvider initialMetrics={metrics}><ChatsScreen /></SafeAreaProvider>);
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const row = (id: string, name: string, over: Partial<ChatRow> = {}): ChatRow => ({
  buddy: person(id, name), lastMessage: { mine: false, kind: 'TEXT', text: 'rough night lol', sticker: null, cardType: null, at: ago(2) }, unread: 0, activeAt: null, ...over,
});
const PAGE: ChatsPage = {
  chats: [
    row('ben', 'Ben', { unread: 2, activeAt: ago(1) }),
    row('sam', 'Sam', { lastMessage: { mine: false, kind: 'STICKER', text: null, sticker: 'CHEER', cardType: null, at: ago(14) } }),
  ],
  nextCursor: null,
  requests: 2,
};

beforeEach(() => {
  jest.clearAllMocks();
  (fetchChats as jest.Mock).mockResolvedValue(PAGE);
  (fetchNotes as jest.Mock).mockResolvedValue({ mine: null, buddies: [{ person: person('ana', 'Ana'), text: 'day 6 streak!', createdAt: ago(60), expiresAt: ago(-60) }] });
});

it('lists conversations with their line, unread weight, story ring and active dot; rows, Requests and Cheer work', async () => {
  renderScreen();
  expect(await screen.findByTestId('chats-handle')).toHaveTextContent('@tushar');
  expect(screen.getByTestId('chat-row-ben-line')).toHaveTextContent('rough night lol · 2m');
  expect(screen.getByTestId('chat-row-ben-unread')).toBeTruthy();
  expect(screen.getByTestId('chat-row-ben-avatar-active')).toBeTruthy();
  expect(screen.getByTestId('chat-row-sam-line')).toHaveTextContent('Sent a Cheer sticker · 14m');
  expect(screen.queryByTestId('chat-row-sam-unread')).toBeNull();
  expect(screen.getByTestId('chats-requests')).toHaveTextContent('Requests (2)');
  fireEvent.press(screen.getByTestId('chats-requests'));
  expect(mockNavigate).toHaveBeenLastCalledWith('ChatRequests');
  fireEvent.press(screen.getByTestId('chat-row-sam'));
  expect(mockNavigate).toHaveBeenLastCalledWith('ChatThread', { buddyId: 'sam' });
  await act(async () => fireEvent.press(screen.getByTestId('chat-row-sam-cheer')));
  expect(sendStickerMessage).toHaveBeenCalledWith('sam', 'CHEER');
  expect(screen.getByTestId('chats-message')).toHaveTextContent('Sent a Cheer');
  expect(fetchChats).toHaveBeenCalledTimes(2); // re-read after the sticker
});

it('a refused Cheer says why', async () => {
  (sendStickerMessage as jest.Mock).mockRejectedValueOnce(new ApiError(429, 'x', 'sticker_limit'));
  renderScreen();
  await act(async () => fireEvent.press(await screen.findByTestId('chat-row-ben-cheer')));
  expect(screen.getByTestId('chats-message')).toHaveTextContent(/5 stickers/);
});

it('search filters conversations by name or handle', async () => {
  renderScreen();
  fireEvent.changeText(await screen.findByTestId('chats-search'), 'SA');
  expect(screen.queryByTestId('chat-row-ben')).toBeNull();
  expect(screen.getByTestId('chat-row-sam')).toBeTruthy();
  fireEvent.changeText(screen.getByTestId('chats-search'), 'nobody');
  expect(screen.getByTestId('chats-empty')).toHaveTextContent('No chats match.');
});

it('notes: share mine with a count, open a buddy\'s note as a quote, report one', async () => {
  renderScreen();
  expect(await screen.findByTestId('note-mine')).toHaveTextContent('Share a note');
  expect(screen.getByTestId('note-ana')).toHaveTextContent('day 6 streak!');
  fireEvent.press(screen.getByTestId('note-mine'));
  fireEvent.changeText(screen.getByTestId('note-input'), 'early night tonight');
  expect(screen.getByTestId('note-count')).toHaveTextContent('19/60');
  await act(async () => fireEvent.press(screen.getByTestId('note-share')));
  expect(saveStatusNote).toHaveBeenCalledWith('early night tonight');
  fireEvent.press(screen.getByTestId('note-ana'));
  expect(mockNavigate).toHaveBeenLastCalledWith('ChatThread', { buddyId: 'ana', quote: { request: { type: 'note' }, label: "Ana's note" } });
  fireEvent(screen.getByTestId('note-ana'), 'longPress');
  await act(async () => fireEvent.press(screen.getByTestId('report-harassment')));
  expect(fileReport).toHaveBeenCalledWith('status_note', 'ana', 'harassment');
});

it('a note over 60 can not be shared; my live note can be cleared', async () => {
  (fetchNotes as jest.Mock).mockResolvedValue({ mine: { text: 'gym at 6', createdAt: ago(5), expiresAt: ago(-60) }, buddies: [] });
  renderScreen();
  expect(await screen.findByTestId('note-mine')).toHaveTextContent('gym at 6');
  fireEvent.press(screen.getByTestId('note-mine'));
  expect(screen.getByTestId('note-input').props.value).toBe('gym at 6');
  fireEvent.changeText(screen.getByTestId('note-input'), 'x'.repeat(61));
  expect(screen.getByTestId('note-share')).toBeDisabled();
  await act(async () => fireEvent.press(screen.getByTestId('note-clear')));
  expect(clearStatusNote).toHaveBeenCalled();
});

it('New message picks a buddy and opens the thread', async () => {
  renderScreen();
  fireEvent.press(await screen.findByTestId('chats-new'));
  fireEvent.press(screen.getByTestId('new-chat-ana'));
  expect(mockNavigate).toHaveBeenLastCalledWith('ChatThread', { buddyId: 'ana' });
});

it('loads the next page at the end of the list', async () => {
  (fetchChats as jest.Mock).mockImplementation(async (cursor?: string) => (cursor === 'c2' ? { chats: [row('cy', 'Cy')], nextCursor: null, requests: 2 } : { ...PAGE, nextCursor: 'c2' }));
  renderScreen();
  await screen.findByTestId('chat-row-ben');
  await act(async () => fireEvent(screen.getByTestId('chats-list'), 'onEndReached'));
  expect(await screen.findByTestId('chat-row-cy')).toBeTruthy();
});

it('an older server says Chats is not here yet and offers Buddies; a failure offers a retry', async () => {
  (fetchChats as jest.Mock).mockResolvedValueOnce(null);
  const { unmount } = renderScreen();
  fireEvent.press(await screen.findByTestId('chats-open-buddies'));
  expect(mockNavigate).toHaveBeenLastCalledWith('Buddies');
  unmount();
  (fetchChats as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  renderScreen();
  await act(async () => fireEvent.press(await screen.findByTestId('chats-retry')));
  expect(await screen.findByTestId('chat-row-ben')).toBeTruthy();
});
```

Create `mobile/__tests__/screens/ChatRequestsScreen.test.tsx`:

```tsx
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { acceptRequest, blockFromRequest, cancelRequest, declineRequest, fetchIdentity, fetchRequests } from '../../src/api/buddies';
import { offerPushAfterPairing } from '../../src/lib/buddyPushOffer';
import { refreshSocial } from '../../src/lib/socialStore';
import { ChatRequestsScreen } from '../../src/screens/ChatRequestsScreen';

let mockChats: boolean | null = true;
jest.mock('../../src/lib/socialStore', () => ({ refreshSocial: jest.fn(), useChatsAvailable: () => mockChats }));
jest.mock('../../src/lib/buddiesStore', () => ({ refreshBuddies: jest.fn() }));
jest.mock('../../src/lib/buddyPushOffer', () => ({ offerPushAfterPairing: jest.fn(() => new Promise(() => undefined)) }));
jest.mock('../../src/api/buddies', () => ({
  ...jest.requireActual('../../src/api/buddies'),
  fetchIdentity: jest.fn(),
  fetchRequests: jest.fn(),
  acceptRequest: jest.fn(),
  declineRequest: jest.fn(),
  blockFromRequest: jest.fn(),
  cancelRequest: jest.fn(),
}));
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: mockNavigate }) }));
const person = (id: string, name: string) => ({ id, handle: id, displayName: name, coachId: 'pengu' });

beforeEach(() => {
  jest.clearAllMocks();
  mockChats = true;
  (fetchIdentity as jest.Mock).mockResolvedValue({ handle: 'me', displayName: 'Me', displayNamePrefill: '', moodNoticeSeen: true });
  (fetchRequests as jest.Mock).mockResolvedValue({
    incoming: [{ id: 'r1', createdAt: '', from: person('u1', 'Ana') }, { id: 'r2', createdAt: '', from: person('u2', 'Ben') }],
    outgoing: [{ id: 'r3', createdAt: '', toHandle: 'cy' }],
  });
  (acceptRequest as jest.Mock).mockResolvedValue({ ok: true, buddyId: 'u1' });
});

it("answers requests in Chats: accept opens the new buddy's thread, decline is quiet, block asks first; mine read Pending", async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === 'destructive')?.onPress?.());
  render(<ChatRequestsScreen />);
  expect(await screen.findByTestId('request-in-r1')).toBeTruthy();
  expect(screen.getByTestId('request-out-r3')).toHaveTextContent(/Pending/);
  await act(async () => fireEvent.press(screen.getByTestId('request-accept-r1')));
  expect(mockNavigate).toHaveBeenCalledWith('ChatThread', { buddyId: 'u1' });
  expect(offerPushAfterPairing).toHaveBeenCalledTimes(1);
  await act(async () => fireEvent.press(screen.getByTestId('request-decline-r2')));
  expect(declineRequest).toHaveBeenCalledWith('r2');
  await act(async () => fireEvent.press(screen.getByTestId('request-block-r2')));
  await waitFor(() => expect(blockFromRequest).toHaveBeenCalledWith('r2'));
  await act(async () => fireEvent.press(screen.getByTestId('request-cancel-r3')));
  expect(cancelRequest).toHaveBeenCalledWith('r3');
  expect(refreshSocial).toHaveBeenCalled();
  alert.mockRestore();
});

it('on a server without chats, accepting opens the buddy\'s week', async () => {
  mockChats = false;
  render(<ChatRequestsScreen />);
  await act(async () => fireEvent.press(await screen.findByTestId('request-accept-r1')));
  expect(mockNavigate).toHaveBeenCalledWith('BuddyWeek', { buddyId: 'u1' });
});
```

In `mobile/__tests__/screens/SocialScreen.test.tsx`, append:

```tsx
it('on a server with chats, the Chats button opens Chats and counts unread chats plus requests', async () => {
  (fetchSocialHome as jest.Mock).mockResolvedValue({ ...home, unread: { requests: 2, stickers: 1, chats: 3 } });
  renderScreen();
  expect(await screen.findByTestId('social-chats-count')).toHaveTextContent('5');
  fireEvent.press(screen.getByTestId('social-chats'));
  expect(mockNavigate).toHaveBeenLastCalledWith('Chats');
});
```

In `mobile/__tests__/conventions/buttons.test.ts`, in `ALLOWED`, after the `BuddyListRow` entry add:

```ts
  { file: 'components/chats/ChatRow.tsx', key: 'chat-row-${row.buddy.id}', count: 1, reason: 'a conversation row that opens the thread' },
  { file: 'components/chats/NewChatSheet.tsx', key: 'new-chat-${row.id}', count: 1, reason: 'a buddy row in the new-message picker' },
```

and after the `story-${r.author.id}` entry add:

```ts
  { file: 'components/chats/NotesRow.tsx', key: 'note-mine', count: 1, reason: 'my avatar with my note bubble in the Chats notes row' },
  { file: 'components/chats/NotesRow.tsx', key: 'note-${n.person.id}', count: 1, reason: "a buddy's avatar with their note bubble" },
```

- [ ] **Step 2: Run them to see them fail**

Run (from `mobile/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/screens/ChatsScreen.test.tsx __tests__/screens/ChatRequestsScreen.test.tsx __tests__/screens/SocialScreen.test.tsx __tests__/conventions/buttons.test.ts`
Expected: FAIL — the screens do not exist; the Chats button opens Buddies; the guard reports four stale entries.

- [ ] **Step 3: Move the Requests list out of Buddies**

Create `mobile/src/components/chats/RequestsList.tsx` (the Buddies Requests tab, moved; accepting calls `onAccepted`):

```tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, View } from 'react-native';
import {
  acceptRequest, blockFromRequest, buddyErrorCode, cancelRequest, declineRequest, fetchRequests, type IncomingRequest, type OutgoingRequest,
} from '../../api/buddies';
import type { useMoodNoticeGate } from '../buddies/useMoodNoticeGate';
import { Character } from '../characters/Character';
import { DEFAULT_CHARACTER_ID, isCharacterId } from '../characters/types';
import { Button } from '../ui/button';
import { Text } from '../ui/text';
import { buddyErrorMessage } from '../../lib/buddyCopy';
import { refreshBuddies } from '../../lib/buddiesStore';
import { offerPushAfterPairing } from '../../lib/buddyPushOffer';
import { refreshSocial } from '../../lib/socialStore';

type Gate = ReturnType<typeof useMoodNoticeGate>;
type RequestItem = { kind: 'in'; request: IncomingRequest } | { kind: 'out'; request: OutgoingRequest };

// Buddy requests (spec 2026-10-06 buddies §4; spec 2026-10-07 social §8.1: they live in Chats › Requests): incoming ones
// to accept, decline or block, and mine still pending. Moved unchanged from the Buddies screen; accepting hands the new
// buddy's id to `onAccepted` (Chats opens their thread).
export function RequestsList({ gate, onAccepted }: { gate: Gate; onAccepted: (buddyId: string) => void }) {
  const [lists, setLists] = useState<{ incoming: IncomingRequest[]; outgoing: OutgoingRequest[] } | null | 'error'>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // `busy` disables the buttons only after a re-render; a double tap in one frame calls the API once.
  const inFlight = useRef(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const load = useCallback(async () => {
    try {
      const next = await fetchRequests();
      if (live.current) setLists(next);
    } catch {
      if (live.current) setLists('error');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // One answer at a time. The lists are re-read either way (a refused answer may mean the request
  // is gone); the shared buddies refresh after an answer that went through.
  function perform(fn: () => Promise<unknown>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    void (async () => {
      try {
        try {
          await fn();
          void refreshBuddies();
          void refreshSocial();
        } catch (e) {
          if (live.current) setMessage(buddyErrorMessage(buddyErrorCode(e)));
        }
        await load();
      } finally {
        inFlight.current = false;
        if (live.current) setBusy(false);
      }
    })();
  }
  // Accepting pairs, so it waits for the one-time mood notice; the guard sits inside the held
  // action, so "Not now" leaves nothing taken.
  const accept = (id: string) =>
    gate.run(() =>
      perform(async () => {
        const { buddyId } = await acceptRequest(id);
        onAccepted(buddyId);
        // After the navigation, never awaited: the first pairing on this device offers notifications once.
        void offerPushAfterPairing();
      }),
    );
  const block = (r: IncomingRequest) => {
    if (inFlight.current) return;
    Alert.alert(`Block ${r.from.displayName}?`, "They won't be told. You can unblock them in Profile.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: () => perform(() => blockFromRequest(r.id)) },
    ]);
  };

  if (lists === null) return <ActivityIndicator testID="requests-loading" />;
  if (lists === 'error') return <Text testID="requests-error" className="py-8 text-center text-muted-foreground">Couldn't load requests.</Text>;
  const items: RequestItem[] = [
    ...lists.incoming.map((request) => ({ kind: 'in' as const, request })),
    ...lists.outgoing.map((request) => ({ kind: 'out' as const, request })),
  ];
  return (
    <FlatList
      testID="requests-list"
      data={items}
      keyExtractor={(i) => `${i.kind}-${i.request.id}`}
      contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
      ListHeaderComponent={message ? <Text testID="requests-message" className="text-sm text-destructive">{message}</Text> : null}
      ListEmptyComponent={<Text testID="requests-empty" className="py-8 text-center text-muted-foreground">No requests right now.</Text>}
      renderItem={({ item }) =>
        item.kind === 'in' ? (
          <View testID={`request-in-${item.request.id}`} className="gap-2 rounded-card border border-border bg-card p-3">
            <View className="flex-row items-center gap-3">
              <Character characterId={isCharacterId(item.request.from.coachId) ? item.request.from.coachId : DEFAULT_CHARACTER_ID} mood="idle" size={40} paused />
              <View className="flex-1">
                <Text className="font-semibold">{item.request.from.displayName}</Text>
                <Text className="text-sm text-muted-foreground">@{item.request.from.handle} wants to be your buddy</Text>
              </View>
            </View>
            <View className="flex-row gap-2">
              <Button testID={`request-accept-${item.request.id}`} size="sm" disabled={busy} onPress={() => accept(item.request.id)}>Accept</Button>
              <Button testID={`request-decline-${item.request.id}`} size="sm" variant="outline" disabled={busy} onPress={() => perform(() => declineRequest(item.request.id))}>Decline</Button>
              <Button testID={`request-block-${item.request.id}`} size="sm" variant="destructive" disabled={busy} onPress={() => block(item.request)}>Block</Button>
            </View>
          </View>
        ) : (
          <View testID={`request-out-${item.request.id}`} className="flex-row items-center justify-between rounded-card border border-border bg-card p-3">
            {/* The handle as typed when sent; an older request has none, so it reads neutrally. */}
            <Text className="flex-1">{item.request.toHandle ? `@${item.request.toHandle} · Pending` : 'Pending request'}</Text>
            <Button testID={`request-cancel-${item.request.id}`} size="sm" variant="ghost" disabled={busy} onPress={() => perform(() => cancelRequest(item.request.id))}>Cancel</Button>
          </View>
        )
      }
    />
  );
}
```

In `mobile/src/screens/BuddiesScreen.tsx`: delete the whole `function RequestsTab(…) { … }` and the `type RequestItem` and
`type Gate` lines; replace `{tab === 'requests' ? <RequestsTab gate={gate} navigation={navigation} /> : null}` with
`{tab === 'requests' ? <RequestsList gate={gate} onAccepted={(buddyId) => navigation.navigate('BuddyWeek', { buddyId })} /> : null}`;
and replace the import block at the top (lines 1–22) with:

```tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { fetchActivity, fetchBuddyPage, markActivitySeen, type ActivityItem, type BuddyIdentity, type BuddyRow } from '../api/buddies';
import { BuddyListRow } from '../components/buddies/BuddyListRow';
import { IdentityGate } from '../components/buddies/IdentityGate';
import { MoodNoticeSheet } from '../components/buddies/MoodNoticeSheet';
import { useMoodNoticeGate } from '../components/buddies/useMoodNoticeGate';
import { RequestsList } from '../components/chats/RequestsList';
import { Character } from '../components/characters/Character';
import { DEFAULT_CHARACTER_ID, isCharacterId } from '../components/characters/types';
import { Button } from '../components/ui/button';
import { SegmentedControl } from '../components/ui/segmented-control';
import { Text } from '../components/ui/text';
import { activityLine } from '../lib/buddyCopy';
import { refreshBuddies, useBuddies } from '../lib/buddiesStore';
import { useRefreshBuddiesOnFocus } from '../lib/useRefreshBuddiesOnFocus';
```

(`__tests__/screens/BuddiesScreen.test.tsx` keeps passing unchanged in this task: the Requests tab renders the same list.)

- [ ] **Step 4: The inbox pieces**

Create `mobile/src/components/chats/ChatRow.tsx`:

```tsx
import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import type { ChatRow as ChatRowData } from '../../api/chats';
import { activeLine, chatRowLine } from '../../lib/chatCopy';
import { personName } from '../../lib/socialCopy';
import { COLORS } from '../../theme';
import { Button, buttonIconSize } from '../ui/button';
import { Text } from '../ui/text';
import { ChatAvatar } from './ChatAvatar';

// One conversation in the inbox (spec §8.1; V5 Chats board): their coach (teal ring while their story is unseen, the
// green dot while active now), name, the last message and how long ago — bold with a dot while unread — and a quick
// Cheer. The row is not a button (it opens the thread; allowlisted); Cheer is a standard ghost icon Button.
export function ChatRow({ row, ring, now, busy, onOpen, onCheer }: {
  row: ChatRowData;
  ring: boolean;
  now: number;
  busy: boolean;
  onOpen: () => void;
  onCheer: () => void;
}) {
  const { colorScheme } = useColorScheme();
  const colors = COLORS[colorScheme === 'light' ? 'light' : 'dark'];
  const name = personName(row.buddy, false);
  const line = chatRowLine(row, now);
  const unread = row.unread > 0;
  return (
    <View className="flex-row items-center gap-2 py-2">
      <Pressable
        testID={`chat-row-${row.buddy.id}`}
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${line}${unread ? ', unread' : ''}`}
        className="flex-1 flex-row items-center gap-3 active:opacity-70"
      >
        <ChatAvatar person={row.buddy} size={56} ring={ring} active={activeLine(row.activeAt, now) === 'Active now'} testID={`chat-row-${row.buddy.id}-avatar`} />
        <View className="flex-1 gap-0.5">
          <Text numberOfLines={1} className={unread ? 'text-[15px] font-bold' : 'text-[15px]'}>{name}</Text>
          <Text testID={`chat-row-${row.buddy.id}-line`} numberOfLines={1} className={unread ? 'text-[13px] font-semibold text-foreground' : 'text-[13px] text-muted-foreground'}>{line}</Text>
        </View>
        {unread ? <View testID={`chat-row-${row.buddy.id}-unread`} className="h-2.5 w-2.5 rounded-full bg-accent" /> : null}
      </Pressable>
      <Button testID={`chat-row-${row.buddy.id}-cheer`} variant="ghost" size="icon-sm" accessibilityLabel={`Send ${name} a Cheer`} disabled={busy} onPress={onCheer}>
        <Ionicons name="megaphone-outline" size={buttonIconSize('icon-sm')} color={colors.foreground} />
      </Button>
    </View>
  );
}
```

Create `mobile/src/components/chats/NotesRow.tsx`:

```tsx
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import type { Person } from '../../api/buddies';
import type { BuddyNote, StatusNote } from '../../api/chats';
import { personName } from '../../lib/socialCopy';
import { Text } from '../ui/text';
import { ChatAvatar } from './ChatAvatar';

// The Chats notes row (spec §8.1): my avatar first ("Share a note", or my note), then each buddy's live note in a bubble
// over their avatar. Tapping a buddy's note opens their thread with it quoted; a long press reports it. The avatars are
// not buttons (allowlisted).
function Bubble({ text }: { text: string }) {
  return (
    <View className="absolute -top-6 max-w-[86px] rounded-[10px] bg-secondary px-2 py-1">
      <Text numberOfLines={1} className="text-center text-[10px] leading-3">{text}</Text>
    </View>
  );
}

export function NotesRow({ me, mine, buddies, onMine, onOpen, onReport }: {
  me: Person;
  mine: StatusNote | null;
  buddies: BuddyNote[];
  onMine: () => void;
  onOpen: (note: BuddyNote) => void;
  onReport: (note: BuddyNote) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingTop: 24 }}>
      <Pressable
        testID="note-mine"
        onPress={onMine}
        accessibilityRole="button"
        accessibilityLabel={mine ? `Your note: ${mine.text}. Change it` : 'Share a note'}
        className="w-[72px] items-center gap-1.5"
      >
        <Bubble text={mine?.text ?? 'Share a note'} />
        <ChatAvatar person={me} size={64} />
        <Text className="text-[11px] text-muted-foreground">Your note</Text>
      </Pressable>
      {buddies.map((n) => (
        <Pressable
          key={n.person.id}
          testID={`note-${n.person.id}`}
          onPress={() => onOpen(n)}
          onLongPress={() => onReport(n)}
          accessibilityRole="button"
          accessibilityLabel={`${personName(n.person, false)}'s note: ${n.text}. Reply`}
          accessibilityActions={[{ name: 'longpress', label: 'Report note' }]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'longpress') onReport(n);
          }}
          className="w-[72px] items-center gap-1.5"
        >
          <Bubble text={n.text} />
          <ChatAvatar person={n.person} size={64} />
          <Text numberOfLines={1} className="text-[11px] text-muted-foreground">{personName(n.person, false)}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
```

Create `mobile/src/components/chats/NoteComposerSheet.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { buddyErrorCode } from '../../api/buddies';
import { clearStatusNote, saveStatusNote, type StatusNote } from '../../api/chats';
import { buddyErrorMessage } from '../../lib/buddyCopy';
import { STATUS_NOTE_MAX, noteLength } from '../../lib/chatCopy';
import { COLORS } from '../../theme';
import { Button } from '../ui/button';
import { Sheet } from '../ui/sheet';
import { Text } from '../ui/text';

// My Chats note (spec §8.1): up to 60 characters over my avatar for 24 hours. Share replaces it; Clear removes it.
export function NoteComposerSheet({ visible, current, onClose, onSaved }: { visible: boolean; current: StatusNote | null; onClose: () => void; onSaved: () => void }) {
  const { colorScheme } = useColorScheme();
  const colors = COLORS[colorScheme === 'light' ? 'light' : 'dark'];
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    if (!visible) return;
    setDraft(current?.text ?? '');
    setError(null);
  }, [visible, current]);
  const length = noteLength(draft);
  const run = async (fn: () => Promise<unknown>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await fn();
      onSaved();
    } catch (e) {
      setError(buddyErrorMessage(buddyErrorCode(e)));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} testID="note-composer">
      <View className="gap-3 pb-2">
        <Text className="text-base font-semibold">Share a note</Text>
        <Text className="text-sm text-muted-foreground">Your buddies see it over your avatar in Chats for 24 hours.</Text>
        <TextInput
          testID="note-input"
          accessibilityLabel="Your note"
          value={draft}
          onChangeText={setDraft}
          placeholder="early night tonight"
          placeholderTextColor={colors.muted}
          className="h-11 rounded-xl bg-secondary px-3 text-[15px] text-foreground"
        />
        <Text testID="note-count" className={length > STATUS_NOTE_MAX ? 'self-end text-xs text-destructive' : 'self-end text-xs text-muted-foreground'}>{`${length}/${STATUS_NOTE_MAX}`}</Text>
        <Button testID="note-share" disabled={busy || length === 0 || length > STATUS_NOTE_MAX} onPress={() => void run(() => saveStatusNote(draft))}>Share</Button>
        {current ? <Button testID="note-clear" variant="destructive" disabled={busy} onPress={() => void run(clearStatusNote)}>Clear note</Button> : null}
        {error ? <Text testID="note-error" className="text-sm text-destructive">{error}</Text> : null}
      </View>
    </Sheet>
  );
}
```

Create `mobile/src/components/chats/NewChatSheet.tsx`:

```tsx
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useBuddies } from '../../lib/buddiesStore';
import { Button } from '../ui/button';
import { Sheet } from '../ui/sheet';
import { Text } from '../ui/text';
import { ChatAvatar } from './ChatAvatar';

// "New message" (spec §8.1): pick one of my buddies (the buddies store's loaded list); no buddies yet → Add a buddy.
export function NewChatSheet({ visible, onClose, onPick, onAdd }: { visible: boolean; onClose: () => void; onPick: (buddyId: string) => void; onAdd: () => void }) {
  const store = useBuddies();
  const rows = store.status === 'ready' ? store.page.buddies : [];
  return (
    <Sheet visible={visible} onClose={onClose} testID="new-chat">
      <View className="gap-2 pb-2">
        <Text className="text-base font-semibold">New message</Text>
        {rows.length === 0 ? (
          <>
            <Text className="text-sm text-muted-foreground">No buddies yet.</Text>
            <Button testID="new-chat-add" variant="secondary" onPress={onAdd}>Add a buddy</Button>
          </>
        ) : (
          <ScrollView style={{ maxHeight: 420 }}>
            {rows.map((row) => (
              <Pressable
                key={row.id}
                testID={`new-chat-${row.id}`}
                onPress={() => onPick(row.id)}
                accessibilityRole="button"
                accessibilityLabel={`Message ${row.displayName}`}
                className="flex-row items-center gap-3 py-2 active:opacity-70"
              >
                <ChatAvatar person={row} size={40} />
                <View className="flex-1">
                  <Text className="font-semibold">{row.displayName}</Text>
                  <Text className="text-sm text-muted-foreground">@{row.handle}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </Sheet>
  );
}
```

- [ ] **Step 5: The two screens and their routes**

Create `mobile/src/screens/ChatsScreen.tsx`:

```tsx
// The Chats inbox (spec 2026-10-07 social §8.1; V5 Chats board), pushed from Social's Chats button: back, my @handle,
// New message; search (filters conversations by name or handle on the phone — never message text); the notes row; then
// "Messages" with "Requests (N)" and one row per conversation, newest first, paging at the end. Re-read on focus and
// whenever the Social home changes (a buddy push in the foreground refreshes it). An older server (bare 404) shows
// "Chats aren't available yet" and Buddies instead. Message and note text is a buddy's free text: never logged.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useColorScheme } from 'nativewind';
import { blockBuddy, buddyErrorCode } from '../api/buddies';
import { fetchChats, fetchNotes, sendStickerMessage, type BuddyNote, type ChatRow as ChatRowData, type ChatsPage, type Notes } from '../api/chats';
import { ChatRow } from '../components/chats/ChatRow';
import { NewChatSheet } from '../components/chats/NewChatSheet';
import { NoteComposerSheet } from '../components/chats/NoteComposerSheet';
import { NotesRow } from '../components/chats/NotesRow';
import { ReportSheet } from '../components/chats/ReportSheet';
import { Button, buttonIconSize } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Text } from '../components/ui/text';
import { buddyErrorMessage } from '../lib/buddyCopy';
import { refreshBuddies } from '../lib/buddiesStore';
import { noteQuoteLabel } from '../lib/chatCopy';
import { personName } from '../lib/socialCopy';
import { refreshSocial, useSocial } from '../lib/socialStore';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { COLORS } from '../theme';

type Phase = 'loading' | 'ready' | 'unavailable' | 'error';

/** Rows in order, each buddy once (a page boundary can repeat a row). */
function uniqueRows(rows: ChatRowData[]): ChatRowData[] {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.buddy.id) ? false : (seen.add(r.buddy.id), true)));
}

export function ChatsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colorScheme } = useColorScheme();
  const colors = COLORS[colorScheme === 'light' ? 'light' : 'dark'];
  const social = useSocial();
  const home = social.status === 'ready' ? social.home : null;
  const [phase, setPhase] = useState<Phase>('loading');
  const [page, setPage] = useState<ChatsPage | null>(null);
  const [more, setMore] = useState<ChatRowData[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [notes, setNotes] = useState<Notes | null>(null);
  const [query, setQuery] = useState('');
  const [composing, setComposing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [reportNote, setReportNote] = useState<BuddyNote | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const loadingMore = useRef(false);
  // A slower read never lands over a newer one.
  const seq = useRef(0);

  const load = useCallback(async () => {
    const at = ++seq.current;
    try {
      const [chats, nextNotes] = await Promise.all([fetchChats(), fetchNotes().catch(() => null)]);
      if (at !== seq.current) return;
      if (chats === null) {
        setPhase('unavailable');
        return;
      }
      setPage(chats);
      setMore([]);
      setCursor(chats.nextCursor);
      setNotes(nextNotes);
      setPhase('ready');
    } catch {
      if (at === seq.current) setPhase((p) => (p === 'ready' ? p : 'error'));
    }
  }, []);
  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));
  // The Social home changes when something happened (a buddy push in the foreground, a read): read again.
  const lastHome = useRef(home);
  useEffect(() => {
    if (lastHome.current === home) return;
    lastHome.current = home;
    void load();
  }, [home, load]);

  const loadMore = async () => {
    if (!cursor || loadingMore.current) return;
    loadingMore.current = true;
    const at = seq.current;
    try {
      const next = await fetchChats(cursor);
      if (next && at === seq.current) {
        setMore((prev) => [...prev, ...next.chats]);
        setCursor(next.nextCursor);
      }
    } catch {
      // Keep what is shown; the next scroll to the end tries again.
    } finally {
      loadingMore.current = false;
    }
  };

  const cheer = (buddyId: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    void sendStickerMessage(buddyId, 'CHEER')
      .then(
        () => {
          setMessage('Sent a Cheer');
          void load();
          void refreshSocial();
        },
        (e: unknown) => setMessage(buddyErrorMessage(buddyErrorCode(e))),
      )
      .finally(() => {
        busyRef.current = false;
        setBusy(false);
      });
  };

  const blockNoteAuthor = () => {
    const note = reportNote;
    setReportNote(null);
    if (!note) return;
    const name = personName(note.person, false);
    Alert.alert(`Block ${name}?`, "They won't be told. You can unblock them in Profile.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: () => {
          void blockBuddy(note.person.id).then(
            () => {
              void load();
              void refreshSocial();
              void refreshBuddies();
            },
            (e: unknown) => setMessage(buddyErrorMessage(buddyErrorCode(e))),
          );
        },
      },
    ]);
  };

  const ready = phase === 'ready' && page !== null;
  const header = (
    <View className="flex-row items-center gap-2 px-2 pt-1">
      <Button testID="chats-back" variant="ghost" size="icon-lg" accessibilityLabel="Back to Social" onPress={() => navigation.goBack()}>
        <Ionicons name="chevron-back" size={buttonIconSize('icon-lg')} color={colors.foreground} />
      </Button>
      <Text testID="chats-handle" numberOfLines={1} className="flex-1 text-xl font-bold">{home ? `@${home.me.person.handle}` : 'Chats'}</Text>
      {ready ? (
        <Button testID="chats-new" variant="ghost" size="icon-lg" accessibilityLabel="New message" onPress={() => setPicking(true)}>
          <Ionicons name="create-outline" size={buttonIconSize('icon-lg')} color={colors.foreground} />
        </Button>
      ) : null}
    </View>
  );

  if (!ready) {
    return (
      <SafeAreaView testID={`chats-${phase}`} edges={['top']} className="flex-1 bg-background">
        {header}
        {phase === 'loading' ? <ActivityIndicator className="mt-8" /> : null}
        {phase === 'unavailable' ? (
          <Card className="m-4 gap-3">
            <Text className="font-semibold">Chats aren't available yet</Text>
            <Text className="text-sm text-muted-foreground">Your buddies are still here.</Text>
            <Button testID="chats-open-buddies" onPress={() => navigation.navigate('Buddies')}>Open Buddies</Button>
          </Card>
        ) : null}
        {phase === 'error' ? (
          <View className="flex-1 items-center justify-center gap-4 px-8">
            <Text className="text-center text-muted-foreground">Couldn't load your chats.</Text>
            <Button testID="chats-retry" variant="secondary" onPress={() => void load()}>Try again</Button>
          </View>
        ) : null}
      </SafeAreaView>
    );
  }

  const q = query.trim().toLowerCase();
  const rows = uniqueRows([...page.chats, ...more]).filter((r) => !q || r.buddy.displayName.toLowerCase().includes(q) || r.buddy.handle.toLowerCase().includes(q));
  const now = Date.now();
  const unseenStory = new Set((home?.stories ?? []).filter((s) => s.unseen).map((s) => s.author.id));
  return (
    <SafeAreaView testID="chats" edges={['top']} className="flex-1 bg-background">
      {header}
      <FlatList
        testID="chats-list"
        data={rows}
        keyExtractor={(r) => r.buddy.id}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.5}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        ListHeaderComponent={
          <View className="gap-3.5 pb-1 pt-2">
            <View className="h-[38px] flex-row items-center gap-2 rounded-xl bg-secondary px-3">
              <Ionicons name="search" size={16} color={colors.muted} />
              <TextInput
                testID="chats-search"
                accessibilityLabel="Search chats"
                placeholder="Search"
                placeholderTextColor={colors.muted}
                value={query}
                onChangeText={setQuery}
                className="flex-1 text-[14px] text-foreground"
              />
            </View>
            {home ? (
              <NotesRow
                me={home.me.person}
                mine={notes?.mine ?? null}
                buddies={notes?.buddies ?? []}
                onMine={() => setComposing(true)}
                onOpen={(n) => navigation.navigate('ChatThread', { buddyId: n.person.id, quote: { request: { type: 'note' }, label: noteQuoteLabel(personName(n.person, false)) } })}
                onReport={setReportNote}
              />
            ) : null}
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-bold">Messages</Text>
              <Button testID="chats-requests" variant="link" onPress={() => navigation.navigate('ChatRequests')}>
                {page.requests > 0 ? `Requests (${page.requests})` : 'Requests'}
              </Button>
            </View>
            {message ? <Text testID="chats-message" className="text-sm text-muted-foreground">{message}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          <Text testID="chats-empty" className="py-8 text-center text-muted-foreground">{q ? 'No chats match.' : 'No messages yet. Say hi to a buddy.'}</Text>
        }
        renderItem={({ item }) => (
          <ChatRow
            row={item}
            ring={unseenStory.has(item.buddy.id)}
            now={now}
            busy={busy}
            onOpen={() => navigation.navigate('ChatThread', { buddyId: item.buddy.id })}
            onCheer={() => cheer(item.buddy.id)}
          />
        )}
      />
      <NoteComposerSheet
        visible={composing}
        current={notes?.mine ?? null}
        onClose={() => setComposing(false)}
        onSaved={() => {
          setComposing(false);
          void load();
        }}
      />
      <NewChatSheet
        visible={picking}
        onClose={() => setPicking(false)}
        onPick={(buddyId) => {
          setPicking(false);
          navigation.navigate('ChatThread', { buddyId });
        }}
        onAdd={() => {
          setPicking(false);
          navigation.navigate('PairUp');
        }}
      />
      <ReportSheet
        target={reportNote ? { type: 'status_note', id: reportNote.person.id } : null}
        name={reportNote ? personName(reportNote.person, false) : ''}
        onClose={() => setReportNote(null)}
        onBlock={blockNoteAuthor}
      />
    </SafeAreaView>
  );
}
```

Create `mobile/src/screens/ChatRequestsScreen.tsx`:

```tsx
// Chats › Requests (spec 2026-10-07 social §2, §8.1): incoming buddy requests to accept, decline or block, and mine
// still pending — the list that used to be the Buddies screen's Requests tab. Accepting opens the new buddy's thread
// (their week on a server without chats).

import React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BuddyIdentity } from '../api/buddies';
import { IdentityGate } from '../components/buddies/IdentityGate';
import { MoodNoticeSheet } from '../components/buddies/MoodNoticeSheet';
import { useMoodNoticeGate } from '../components/buddies/useMoodNoticeGate';
import { RequestsList } from '../components/chats/RequestsList';
import { useChatsAvailable } from '../lib/socialStore';
import type { RootStackParamList } from '../navigation/RootNavigator';

function Body({ identity, onAccepted }: { identity: BuddyIdentity; onAccepted: (buddyId: string) => void }) {
  const gate = useMoodNoticeGate(identity.moodNoticeSeen);
  return (
    <View className="flex-1 px-4 pt-3">
      <RequestsList gate={gate} onAccepted={onAccepted} />
      <MoodNoticeSheet {...gate.sheet} />
    </View>
  );
}

export function ChatRequestsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const chats = useChatsAvailable();
  const onAccepted = (buddyId: string) => (chats === false ? navigation.navigate('BuddyWeek', { buddyId }) : navigation.navigate('ChatThread', { buddyId }));
  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-background">
      <IdentityGate>{(identity) => <Body identity={identity} onAccepted={onAccepted} />}</IdentityGate>
    </SafeAreaView>
  );
}
```

In `mobile/src/navigation/RootNavigator.tsx`, import `ChatsScreen` and `ChatRequestsScreen` (after the
`ChatThreadScreen` import), add to `RootStackParamList` before `ChatThread`:

```ts
  // Chats (S3): the inbox (Social's Chats button) and Chats › Requests (buddy requests moved from Buddies).
  Chats: undefined;
  ChatRequests: undefined;
```

and before the `ChatThread` `<Stack.Screen … />` add:

```tsx
              <Stack.Screen name="Chats" component={ChatsScreen} options={{ headerShown: false }} />
              <Stack.Screen name="ChatRequests" component={ChatRequestsScreen} options={{ title: 'Requests' }} />
```

- [ ] **Step 6: The Chats button**

In `mobile/src/screens/SocialScreen.tsx`:
- in the header comment, replace `// highlights → today timeline, and a floating Chats button (opens Buddies until S3).` with
  `// highlights → today timeline, and a floating Chats button (Chats on a server with chats, S3; else Buddies).`;
- change the store import to `import { chatsBadgeCount, refreshSocial, useSocial } from '../lib/socialStore';`;
- replace `const chats = (home.unread?.requests ?? 0) + (home.unread?.stickers ?? 0);` with

```tsx
  // S3: an S3 server sends unread.chats; then the button opens Chats and counts unread chats + requests. An older server
  // keeps the S2 button (requests + stickers, opening Buddies).
  const chatsOn = typeof home.unread?.chats === 'number';
  const chats = chatsOn ? chatsBadgeCount(home.unread) : (home.unread?.requests ?? 0) + (home.unread?.stickers ?? 0);
  const openChats = () => {
    if (chatsOn) navigation.navigate('Chats');
    else if ((home.unread?.requests ?? 0) > 0) navigation.navigate('Buddies', { tab: 'requests', open: Date.now() });
    else navigation.navigate('Buddies');
  };
```

- and in the Chats `<Button>` replace its `onPress={…}` prop with `onPress={openChats}`.

- [ ] **Step 7: Run the tests**

Run (from `mobile/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/screens/ChatsScreen.test.tsx __tests__/screens/ChatRequestsScreen.test.tsx __tests__/screens/BuddiesScreen.test.tsx __tests__/screens/SocialScreen.test.tsx __tests__/screens/SocialScreenCampfire.test.tsx __tests__/navigation __tests__/conventions/buttons.test.ts`
Expected: PASS.
Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/tsc --noEmit --types jest,node --pretty false | grep -c "error TS"` — Expected: `12`.

- [ ] **Step 8: Commit**

```bash
git add mobile/src/components/chats mobile/src/screens/ChatsScreen.tsx mobile/src/screens/ChatRequestsScreen.tsx mobile/src/screens/BuddiesScreen.tsx mobile/src/screens/SocialScreen.tsx mobile/src/navigation/RootNavigator.tsx mobile/__tests__/screens/ChatsScreen.test.tsx mobile/__tests__/screens/ChatRequestsScreen.test.tsx mobile/__tests__/screens/SocialScreen.test.tsx mobile/__tests__/conventions/buttons.test.ts
git commit -m "feat(mobile): the Chats inbox with notes and Requests; the Chats button opens it"
```

---

### Task 16: Buddies becomes "All buddies"; request pushes open Chats › Requests

**Files:**
- Modify: `mobile/src/screens/BuddiesScreen.tsx` (replace), `mobile/src/screens/SocialScreen.tsx`,
  `mobile/src/navigation/RootNavigator.tsx`, `mobile/src/notifications/handler.ts`,
  `mobile/__tests__/conventions/buttons.test.ts`
- Test: replace `mobile/__tests__/screens/BuddiesScreen.test.tsx`; modify
  `mobile/__tests__/screens/ChatRequestsScreen.test.tsx`, `mobile/__tests__/screens/SocialScreen.test.tsx`,
  `mobile/__tests__/notifications/handler.test.ts`

**Interfaces:**
- Consumes: `RequestsList`, `ChatRequestsScreen` (Task 15); `useBuddies`, `refreshBuddies`; `BuddyListRow`;
  `IdentityGate`.
- Produces: route `Buddies: undefined` (no `tab` / `open`); a `buddy_request` tap opens `ChatRequests`
  (`navigate('ChatRequests', undefined, { pop: true })`); on a server without chats, Social's Chats button opens
  `ChatRequests` while requests wait, else `Buddies`.

- [ ] **Step 1: Write the failing tests**

Replace `mobile/__tests__/screens/BuddiesScreen.test.tsx` with:

```tsx
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { fetchBuddyPage, fetchIdentity } from '../../src/api/buddies';
import { resetBuddies } from '../../src/lib/buddiesStore';
import { BuddiesScreen } from '../../src/screens/BuddiesScreen';

jest.mock('../../src/api/buddies', () => ({
  ...jest.requireActual('../../src/api/buddies'),
  fetchIdentity: jest.fn(),
  fetchBuddyPage: jest.fn(),
}));
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, addListener: () => () => undefined }),
  useIsFocused: () => true,
  useFocusEffect: () => undefined,
  NavigationContext: require('react').createContext(undefined),
}));

const person = (id: string, name: string) => ({ id, handle: id, displayName: name, coachId: 'pengu' });
const row = (id: string, name: string, over: object = {}) => ({ ...person(id, name), mood: 'good', moodLine: 'Well rested', unseenSticker: false, ...over });
const EMPTY_PAGE = { buddies: [], nextCursor: null, incomingRequests: 0, outgoingRequests: 0 };

beforeEach(() => {
  jest.clearAllMocks();
  resetBuddies();
  (fetchIdentity as jest.Mock).mockResolvedValue({ handle: 'me', displayName: 'Me', displayNamePrefill: '', moodNoticeSeen: true });
});

it('is the plain buddy list: mood lines, the unseen sticker dot, paging, and a row opens the week', async () => {
  (fetchBuddyPage as jest.Mock).mockImplementation(async (cursor?: string) =>
    cursor === 'c2'
      ? { buddies: [row('b3', 'Cy')], nextCursor: null, incomingRequests: 0, outgoingRequests: 0 }
      : { buddies: [row('b1', 'Ana', { unseenSticker: true }), row('b2', 'Ben', { mood: 'low', moodLine: 'Running low today' })], nextCursor: 'c2', incomingRequests: 0, outgoingRequests: 0 },
  );
  render(<BuddiesScreen />);
  expect(await screen.findByTestId('buddy-row-b1')).toBeTruthy();
  expect(screen.queryByTestId('buddies-tabs')).toBeNull(); // Requests moved to Chats, Activity to the Social timeline
  expect(screen.getByTestId('buddy-row-b2-mood')).toHaveTextContent('Running low today');
  expect(screen.getByTestId('buddy-row-b1-unseen')).toBeTruthy();
  await act(async () => fireEvent(screen.getByTestId('buddies-list'), 'onEndReached'));
  expect(await screen.findByTestId('buddy-row-b3')).toBeTruthy();
  fireEvent.press(screen.getByTestId('buddy-row-b2'));
  expect(mockNavigate).toHaveBeenCalledWith('BuddyWeek', { buddyId: 'b2' });
});

it('drops a buddy repeated across pages and stops at the last page', async () => {
  (fetchBuddyPage as jest.Mock).mockImplementation(async (cursor?: string) =>
    cursor === 'c2'
      ? { buddies: [row('b2', 'Ben'), row('b3', 'Cy'), row('b3', 'Cy')], nextCursor: null, incomingRequests: 0, outgoingRequests: 0 }
      : { buddies: [row('b1', 'Ana'), row('b2', 'Ben')], nextCursor: 'c2', incomingRequests: 0, outgoingRequests: 0 },
  );
  render(<BuddiesScreen />);
  expect(await screen.findByTestId('buddy-row-b1')).toBeTruthy();
  await act(async () => fireEvent(screen.getByTestId('buddies-list'), 'onEndReached'));
  expect(await screen.findByTestId('buddy-row-b3')).toBeTruthy();
  expect(screen.getAllByTestId('buddy-row-b2')).toHaveLength(1);
  expect(screen.getAllByTestId('buddy-row-b3')).toHaveLength(1);
  await act(async () => fireEvent(screen.getByTestId('buddies-list'), 'onEndReached'));
  expect((fetchBuddyPage as jest.Mock).mock.calls.filter(([c]) => c === 'c2')).toHaveLength(1);
});

it('an empty list still offers "Add a buddy", which opens Pair up', async () => {
  (fetchBuddyPage as jest.Mock).mockResolvedValue(EMPTY_PAGE);
  render(<BuddiesScreen />);
  expect(await screen.findByTestId('buddies-empty')).toBeTruthy();
  fireEvent.press(screen.getByTestId('buddies-add'));
  expect(mockNavigate).toHaveBeenCalledWith('PairUp');
});
```

In `mobile/__tests__/screens/ChatRequestsScreen.test.tsx` (the request tests that lived in the Buddies tests move here):
add `confirmMoodNotice` to the `../../src/api/buddies` import and `confirmMoodNotice: jest.fn(),` to its mock; add
`import { refreshBuddies } from '../../src/lib/buddiesStore';`; and append:

```tsx
const ONE_INCOMING = { incoming: [{ id: 'r1', createdAt: '', from: person('u1', 'Ana') }], outgoing: [] };

it('accepts once on a double tap and refreshes the shared lists after it', async () => {
  (fetchRequests as jest.Mock).mockResolvedValue(ONE_INCOMING);
  let release: (v: unknown) => void = () => undefined;
  (acceptRequest as jest.Mock).mockReturnValue(new Promise((r) => (release = r)));
  render(<ChatRequestsScreen />);
  const accept = await screen.findByTestId('request-accept-r1');
  act(() => {
    fireEvent.press(accept);
    fireEvent.press(accept);
  });
  expect(acceptRequest).toHaveBeenCalledTimes(1);
  await act(async () => release({ ok: true, buddyId: 'u1' }));
  expect(refreshBuddies).toHaveBeenCalled();
  expect(mockNavigate).toHaveBeenCalledWith('ChatThread', { buddyId: 'u1' });
});

it('holds accept behind the mood notice, and Not now leaves it free to try again', async () => {
  (fetchIdentity as jest.Mock).mockResolvedValue({ handle: 'me', displayName: 'Me', displayNamePrefill: '', moodNoticeSeen: false });
  (fetchRequests as jest.Mock).mockResolvedValue(ONE_INCOMING);
  (confirmMoodNotice as jest.Mock).mockResolvedValue(undefined);
  render(<ChatRequestsScreen />);
  fireEvent.press(await screen.findByTestId('request-accept-r1'));
  expect(await screen.findByTestId('mood-notice')).toBeTruthy();
  expect(acceptRequest).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(screen.getByTestId('mood-notice-cancel')));
  fireEvent.press(screen.getByTestId('request-accept-r1'));
  await act(async () => fireEvent.press(await screen.findByTestId('mood-notice-confirm')));
  await waitFor(() => expect(acceptRequest).toHaveBeenCalledTimes(1));
});

it('offers buddy notifications only after an accept that went through', async () => {
  (fetchRequests as jest.Mock).mockResolvedValue(ONE_INCOMING);
  (acceptRequest as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('x'), { status: 404, code: 'request_gone' }));
  render(<ChatRequestsScreen />);
  await act(async () => fireEvent.press(await screen.findByTestId('request-accept-r1')));
  expect(await screen.findByTestId('requests-message')).toBeTruthy();
  expect(offerPushAfterPairing).not.toHaveBeenCalled();
});

it('shows a neutral label for an outgoing request sent before handles were kept', async () => {
  (fetchRequests as jest.Mock).mockResolvedValue({ incoming: [], outgoing: [{ id: 'r9', createdAt: '', toHandle: '' }] });
  render(<ChatRequestsScreen />);
  expect(await screen.findByTestId('request-out-r9')).toHaveTextContent(/^Pending request/);
});

it('leaves Block usable after the confirm is cancelled', async () => {
  (fetchRequests as jest.Mock).mockResolvedValue(ONE_INCOMING);
  let choose: 'cancel' | 'destructive' = 'cancel';
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === choose)?.onPress?.());
  render(<ChatRequestsScreen />);
  await act(async () => fireEvent.press(await screen.findByTestId('request-block-r1')));
  expect(blockFromRequest).not.toHaveBeenCalled();
  choose = 'destructive';
  await act(async () => fireEvent.press(screen.getByTestId('request-block-r1')));
  await waitFor(() => expect(blockFromRequest).toHaveBeenCalledWith('r1'));
  alert.mockRestore();
});

it('shows the error for a failed answer and re-reads the requests', async () => {
  (fetchRequests as jest.Mock).mockResolvedValue({ incoming: [], outgoing: [{ id: 'r3', createdAt: '', toHandle: 'cy' }] });
  (cancelRequest as jest.Mock).mockRejectedValue(Object.assign(new Error('x'), { code: 'not_found_or_answered' }));
  render(<ChatRequestsScreen />);
  await screen.findByTestId('request-out-r3');
  expect(fetchRequests).toHaveBeenCalledTimes(1);
  await act(async () => fireEvent.press(screen.getByTestId('request-cancel-r3')));
  expect(await screen.findByTestId('requests-message')).toBeTruthy();
  expect(fetchRequests).toHaveBeenCalledTimes(2);
});
```

In `mobile/__tests__/screens/SocialScreen.test.tsx`, in `it('renders every section in V5 order and routes each action', …)`, replace
`expect(mockNavigate).toHaveBeenLastCalledWith('Buddies', { tab: 'requests', open: expect.any(Number) });` with
`expect(mockNavigate).toHaveBeenLastCalledWith('ChatRequests'); // an S2 server: no chats, but requests wait`.

In `mobile/__tests__/notifications/handler.test.ts`:
- delete the comment lines above `const REQUESTS = …` and the `const REQUESTS = { tab: 'requests', open: expect.any(Number) };` line;
- run `sed -i '' "s/'Buddies', REQUESTS, { pop: true }/'ChatRequests', undefined, { pop: true }/g" mobile/__tests__/notifications/handler.test.ts`;
- replace the whole `it('sends a fresh open value on every request tap, so a repeat still lands on Requests', …)` test with:

```ts
  it('a repeat request tap lands on Chats › Requests again', async () => {
    N.getLastNotificationResponseAsync.mockResolvedValue(response({ kind: 'buddy_request', refId: ID }));
    await routeInitialNotification();
    await routeInitialNotification();
    expect(ref.navigate.mock.calls).toEqual([['ChatRequests', undefined, { pop: true }], ['ChatRequests', undefined, { pop: true }]]);
  });
```

In `mobile/__tests__/conventions/buttons.test.ts`, delete the allowlist line
`{ file: 'screens/BuddiesScreen.tsx', key: 'activity-${item.id}', count: 1, reason: 'an activity feed row that opens the item' },`.

- [ ] **Step 2: Run them to see them fail**

Run (from `mobile/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/screens/BuddiesScreen.test.tsx __tests__/screens/SocialScreen.test.tsx __tests__/notifications/handler.test.ts __tests__/conventions/buttons.test.ts`
Expected: FAIL — the Buddies screen still has its tabs; request taps and the S2 Chats button still open Buddies.

- [ ] **Step 3: All buddies**

Replace `mobile/src/screens/BuddiesScreen.tsx` with:

```tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { fetchBuddyPage, type BuddyRow } from '../api/buddies';
import { BuddyListRow } from '../components/buddies/BuddyListRow';
import { IdentityGate } from '../components/buddies/IdentityGate';
import { Button } from '../components/ui/button';
import { Text } from '../components/ui/text';
import { refreshBuddies, useBuddies } from '../lib/buddiesStore';
import { useRefreshBuddiesOnFocus } from '../lib/useRefreshBuddiesOnFocus';

type Nav = { navigate: (name: string, params?: object) => void };

/** Rows in order, each id once (a page boundary can repeat a row). */
function uniqueById<T extends { id: string }>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

// All buddies (spec 2026-10-07 social §2): the paged buddy list, reached from the stories row's "See all". Its Requests
// tab moved to Chats › Requests and its Activity tab gave way to the Social timeline (S3). The header line is fixed text.
export function BuddiesScreen() {
  const navigation = useNavigation() as unknown as Nav;
  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-background">
      <IdentityGate>{() => <BuddiesBody navigation={navigation} />}</IdentityGate>
    </SafeAreaView>
  );
}

function BuddiesBody({ navigation }: { navigation: Nav }) {
  useRefreshBuddiesOnFocus();
  return (
    <View className="flex-1 gap-3 px-4 pt-3">
      <Text className="text-sm text-muted-foreground">You see their coach's mood, never their numbers unless they share them.</Text>
      <BuddyList navigation={navigation} />
    </View>
  );
}

function BuddyList({ navigation }: { navigation: Nav }) {
  const store = useBuddies();
  const first = store.status === 'ready' ? store.page : null;
  const [more, setMore] = useState<BuddyRow[]>([]);
  // undefined: follow the store's first page; null: no more pages.
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  // `loading` shows only after a re-render; two end-reached events in one frame load a page once.
  const loadingRef = useRef(false);
  // A fresh first page (focus, after a request is answered) starts paging over; a page that was
  // loading for the old list is dropped.
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setMore([]);
    setCursor(undefined);
  }, [first]);
  const rows = useMemo(() => uniqueById([...(first?.buddies ?? []), ...more]), [first, more]);

  if (store.status === 'idle') return <ActivityIndicator testID="buddies-loading" />;
  if (!first) {
    return (
      <View testID="buddies-error" className="items-center gap-3 py-8">
        <Text className="text-muted-foreground">Couldn't load your buddies.</Text>
        <Button variant="secondary" onPress={() => void refreshBuddies()}>Try again</Button>
      </View>
    );
  }
  const next = cursor === undefined ? first.nextCursor : cursor;

  async function loadMore() {
    if (!next || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    const at = generation.current;
    try {
      const page = await fetchBuddyPage(next);
      if (page && at === generation.current) {
        setMore((prev) => [...prev, ...page.buddies]);
        setCursor(page.nextCursor);
      }
    } catch {
      // Keep what is shown; the next scroll to the end tries again.
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  return (
    <FlatList
      testID="buddies-list"
      data={rows}
      keyExtractor={(r) => r.id}
      renderItem={({ item }) => <BuddyListRow row={item} onPress={() => navigation.navigate('BuddyWeek', { buddyId: item.id })} />}
      onEndReached={() => void loadMore()}
      onEndReachedThreshold={0.5}
      ListEmptyComponent={<Text testID="buddies-empty" className="py-8 text-center text-muted-foreground">No buddies yet. Pair up with a friend to see each other's mood.</Text>}
      ListFooterComponent={
        <View className="gap-3 py-4">
          {loading ? <ActivityIndicator /> : null}
          <Button testID="buddies-add" size="lg" onPress={() => navigation.navigate('PairUp')}>Add a buddy</Button>
        </View>
      }
    />
  );
}
```

In `mobile/src/navigation/RootNavigator.tsx`, replace the `Buddies` param lines

```ts
  // Buddies (spec 2026-10-06 buddies §7). `tab` lets a request push open the requests tab; a new
  // `open` (a push sends Date.now()) re-selects it when the route already has that tab.
  Buddies: { tab?: 'buddies' | 'requests' | 'activity'; open?: number } | undefined;
```

with

```ts
  // All buddies (spec 2026-10-07 social §2): the paged list, from the stories row's "See all". Requests live in Chats.
  Buddies: undefined;
```

and change the Buddies screen's options to `options={{ title: 'All buddies' }}`.

In `mobile/src/screens/SocialScreen.tsx`, in `openChats`, replace
`else if ((home.unread?.requests ?? 0) > 0) navigation.navigate('Buddies', { tab: 'requests', open: Date.now() });` with
`else if ((home.unread?.requests ?? 0) > 0) navigation.navigate('ChatRequests');`.

In `mobile/src/notifications/handler.ts`, replace the `routeFor` buddy branch (from the comment that begins `// refId is the request id`) with:

```ts
    // refId is the request id for a request (Chats › Requests), else the actor's user id: a message, sticker, pairing or
    // badge opens their thread (spec 2026-10-07 social §2; their week is one tap from its header; on a server without
    // chats the thread offers the week). Nothing else in the data is used.
    return buddy.kind === 'buddy_request'
      ? () => navigationRef.navigate('ChatRequests', undefined, { pop: true })
      : () => navigationRef.navigate('ChatThread', { buddyId: buddy.refId }, { pop: true });
```

- [ ] **Step 4: Run the tests**

Run (from `mobile/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/screens/BuddiesScreen.test.tsx __tests__/screens/ChatRequestsScreen.test.tsx __tests__/screens/SocialScreen.test.tsx __tests__/notifications __tests__/navigation __tests__/conventions/buttons.test.ts`
Expected: PASS.
Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/tsc --noEmit --types jest,node --pretty false | grep -c "error TS"` — Expected: `12`.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/screens/BuddiesScreen.tsx mobile/src/screens/SocialScreen.tsx mobile/src/navigation/RootNavigator.tsx mobile/src/notifications/handler.ts mobile/__tests__/screens/BuddiesScreen.test.tsx mobile/__tests__/screens/ChatRequestsScreen.test.tsx mobile/__tests__/screens/SocialScreen.test.tsx mobile/__tests__/notifications/handler.test.ts mobile/__tests__/conventions/buttons.test.ts
git commit -m "feat(mobile): Buddies is the plain list; requests and request pushes live in Chats"
```

---

### Task 17: Replies and reports from elsewhere, Message camp, and the Profile switches

Starts only after Task 0b's mockups are approved.

**Files:**
- Create: `mobile/src/components/chats/ChatSettingsSection.tsx`
- Modify: `mobile/src/screens/CampfireScreen.tsx`, `mobile/src/screens/SocialStoryScreen.tsx`,
  `mobile/src/screens/SettingsScreen.tsx`, `mobile/src/components/notifications-section.tsx`
- Test: create `mobile/__tests__/screens/SocialStoryChats.test.tsx`, `mobile/__tests__/components/ChatSettingsSection.test.tsx`,
  `mobile/__tests__/components/NotificationsSectionChats.test.tsx`; modify `mobile/__tests__/screens/CampfireScreen.test.tsx`

**Interfaces:**
- Consumes: `useChatsAvailable`, `useSocial` (Task 13); `campNoteQuoteLabel`, `frameQuoteLabel` (Task 13); `ReportSheet`
  (Task 14); `fetchChatSettings`, `saveChatSettings`, `ChatSettings` (Task 13); `blockBuddy`; `SettingsGroup`,
  `SettingsRow`.
- Produces:
  - Campfire: a buddy's coach opens `ChatThread` (their camp note staged when they have one) on a server with chats,
    else `BuddyWeek`; "Message camp" opens `Chats`, else `Buddies`; a "Report" link (`camp-report-${id}`) beside a
    buddy's note in "Who's here" opens the report sheet (`camp_note`), then "Block too".
  - Story viewer: a "Message {name}" button (`story-message-button`) on a buddy's story on a server with chats closes the
    viewer and opens `ChatThread` with the current frame staged.
  - `ChatSettingsSection()` — testIDs `chat-settings`, `chat-read-receipts-toggle`, `chat-activity-toggle`,
    `chat-settings-message`; rendered in Profile after the Buddies section.
  - Notifications: `chat-messages-toggle` (`notifyDirectMessages`) and `chat-previews-toggle` (`showMessagePreviews`)
    on a server with chats.

- [ ] **Step 1: Write the failing tests**

Create `mobile/__tests__/screens/SocialStoryChats.test.tsx`:

```tsx
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fetchStory } from '../../src/api/social';
import { SocialStoryScreen } from '../../src/screens/SocialStoryScreen';

jest.mock('../../src/api/social', () => ({ ...jest.requireActual('../../src/api/social'), fetchStory: jest.fn(), markStorySeen: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/api/buddies', () => ({ ...jest.requireActual('../../src/api/buddies'), sendSticker: jest.fn().mockResolvedValue({ id: 's' }) }));
let mockUnread: object = { requests: 0, stickers: 0, chats: 0 };
jest.mock('../../src/lib/socialStore', () => ({
  refreshSocial: jest.fn(),
  useSocial: () => ({ status: 'ready', home: { me: { person: { id: 'me' }, checkIn: null }, unread: mockUnread } }),
}));
const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
let mockAuthorId = 'sam';
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ goBack: mockGoBack, navigate: mockNavigate }),
  useRoute: () => ({ params: { authorId: mockAuthorId } }),
}));
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const renderScreen = () => render(<SafeAreaProvider initialMetrics={metrics}><SocialStoryScreen /></SafeAreaProvider>);
const story = (authorId: string) => ({
  author: { id: authorId, handle: authorId, displayName: authorId === 'me' ? 'Me' : 'Sam', coachId: 'mochi' },
  localDate: '2026-10-07',
  frames: [{ kind: 'checkin', at: '2026-10-07T14:00:00.000Z', locked: false, mood: 'TIRED' }],
});

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthorId = 'sam';
  mockUnread = { requests: 0, stickers: 0, chats: 0 };
});

it("Message closes the story and opens Sam's thread with the frame staged", async () => {
  (fetchStory as jest.Mock).mockResolvedValue(story('sam'));
  renderScreen();
  await act(async () => fireEvent.press(await screen.findByTestId('story-message-button')));
  expect(mockGoBack).toHaveBeenCalled();
  expect(mockNavigate).toHaveBeenCalledWith('ChatThread', {
    buddyId: 'sam',
    quote: { request: { type: 'story_frame', at: '2026-10-07T14:00:00.000Z' }, label: "Sam's check-in" },
  });
  expect(screen.getByTestId('story-reply-CHEER')).toBeTruthy(); // the sticker replies stay
});

it('no Message button on my own story, or on a server without chats', async () => {
  (fetchStory as jest.Mock).mockResolvedValue(story('me'));
  mockAuthorId = 'me';
  const { unmount } = renderScreen();
  await screen.findByTestId('story-frame-0');
  expect(screen.queryByTestId('story-message-button')).toBeNull();
  unmount();
  mockAuthorId = 'sam';
  mockUnread = { requests: 0, stickers: 0 };
  (fetchStory as jest.Mock).mockResolvedValue(story('sam'));
  renderScreen();
  await screen.findByTestId('story-frame-0');
  expect(screen.queryByTestId('story-message-button')).toBeNull();
});
```

Create `mobile/__tests__/components/ChatSettingsSection.test.tsx`:

```tsx
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { fetchChatSettings, saveChatSettings } from '../../src/api/chats';
import { fetchBuddyPage } from '../../src/api/buddies';
import { refreshBuddies, resetBuddies } from '../../src/lib/buddiesStore';
import { ChatSettingsSection } from '../../src/components/chats/ChatSettingsSection';

jest.mock('../../src/api/chats', () => ({ fetchChatSettings: jest.fn(), saveChatSettings: jest.fn() }));
jest.mock('../../src/api/buddies', () => ({ fetchBuddyPage: jest.fn() }));
const PAGE = { buddies: [], nextCursor: null, incomingRequests: 0, outgoingRequests: 0 };

beforeEach(async () => {
  jest.clearAllMocks();
  resetBuddies();
  (fetchBuddyPage as jest.Mock).mockResolvedValue(PAGE);
  await refreshBuddies();
});

it('shows both switches as the server has them and saves each on its own; a failure keeps the saved value', async () => {
  (fetchChatSettings as jest.Mock).mockResolvedValue({ readReceipts: true, activityStatus: true });
  (saveChatSettings as jest.Mock).mockResolvedValueOnce({ readReceipts: false, activityStatus: true }).mockRejectedValueOnce(new Error('offline'));
  render(<ChatSettingsSection />);
  const receipts = await screen.findByTestId('chat-read-receipts-toggle');
  expect(receipts.props.value).toBe(true);
  await act(async () => fireEvent(receipts, 'valueChange', false));
  expect(saveChatSettings).toHaveBeenCalledWith({ readReceipts: false });
  expect(screen.getByTestId('chat-read-receipts-toggle').props.value).toBe(false);
  await act(async () => fireEvent(screen.getByTestId('chat-activity-toggle'), 'valueChange', false));
  expect(screen.getByTestId('chat-activity-toggle').props.value).toBe(true);
  expect(screen.getByTestId('chat-settings-message')).toHaveTextContent('Your chat setting could not be saved. Please try again.');
});

it('is hidden on a server without chats', async () => {
  (fetchChatSettings as jest.Mock).mockResolvedValue(null);
  render(<ChatSettingsSection />);
  await act(async () => undefined);
  expect(screen.queryByTestId('chat-settings')).toBeNull();
});
```

Create `mobile/__tests__/components/NotificationsSectionChats.test.tsx`:

```tsx
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { NotificationsSection } from '../../src/components/notifications-section';
import { enablePush, getPushState } from '../../src/lib/pushRegistration';
import { fetchNotificationSettings, saveNotificationSettings } from '../../src/api/notifications';
import { fetchBuddyPage } from '../../src/api/buddies';
import { refreshBuddies, resetBuddies } from '../../src/lib/buddiesStore';

jest.mock('../../src/lib/pushRegistration');
jest.mock('../../src/api/notifications');
jest.mock('../../src/api/buddies', () => ({ fetchBuddyPage: jest.fn() }));
let mockChats: boolean | null = true;
jest.mock('../../src/lib/socialStore', () => ({ useChatsAvailable: () => mockChats }));

const SETTINGS = {
  recapPushEnabled: true, notifyBuddyStickers: true, notifyBuddyRequests: true, notifyBuddyBadges: true, notifyDirectMessages: true, showMessagePreviews: false,
};

beforeEach(async () => {
  jest.clearAllMocks();
  resetBuddies();
  mockChats = true;
  (getPushState as jest.Mock).mockResolvedValue({ status: 'on' });
  (enablePush as jest.Mock).mockResolvedValue({ status: 'on' });
  (fetchNotificationSettings as jest.Mock).mockResolvedValue(SETTINGS);
  (saveNotificationSettings as jest.Mock).mockImplementation(async (patch: object) => ({ ...SETTINGS, ...patch }));
  (fetchBuddyPage as jest.Mock).mockResolvedValue({ buddies: [], nextCursor: null, incomingRequests: 0, outgoingRequests: 0 });
  await refreshBuddies();
});

it('adds Messages (on) and Message previews (off) on a server with chats', async () => {
  render(<NotificationsSection />);
  expect((await screen.findByTestId('chat-messages-toggle')).props.value).toBe(true);
  expect(screen.getByTestId('chat-previews-toggle').props.value).toBe(false);
  await act(async () => fireEvent(screen.getByTestId('chat-previews-toggle'), 'valueChange', true));
  expect(saveNotificationSettings).toHaveBeenCalledWith({ showMessagePreviews: true });
});

it('leaves them out on a server without chats', async () => {
  mockChats = false;
  render(<NotificationsSection />);
  expect(await screen.findByTestId('buddy-stickers-toggle')).toBeTruthy();
  expect(screen.queryByTestId('chat-messages-toggle')).toBeNull();
});
```

In `mobile/__tests__/screens/CampfireScreen.test.tsx`:
- replace `jest.mock('../../src/lib/socialStore', () => ({ refreshSocial: jest.fn() }));` with

```tsx
let mockChats: boolean | null = true;
jest.mock('../../src/lib/socialStore', () => ({ refreshSocial: jest.fn(), useChatsAvailable: () => mockChats }));
jest.mock('../../src/api/chats', () => ({ ...jest.requireActual('../../src/api/chats'), fileReport: jest.fn(() => Promise.resolve()) }));
jest.mock('../../src/api/buddies', () => ({ ...jest.requireActual('../../src/api/buddies'), blockBuddy: jest.fn(() => Promise.resolve()) }));
```

- change `beforeEach(() => jest.clearAllMocks());` to `beforeEach(() => { jest.clearAllMocks(); mockChats = true; });`;
- in `it("a buddy's coach opens their week and mine does not navigate; +N past eight; Message camp opens Buddies; back goes back", …)`:
  rename it to `"a buddy's coach opens their thread and mine does not navigate; +N past eight; Message camp opens Chats; back goes back"`,
  replace `expect(mockNavigate).toHaveBeenLastCalledWith('BuddyWeek', { buddyId: 'a' });` with
  `expect(mockNavigate).toHaveBeenLastCalledWith('ChatThread', { buddyId: 'a' });` and
  `expect(mockNavigate).toHaveBeenLastCalledWith('Buddies');` with `expect(mockNavigate).toHaveBeenLastCalledWith('Chats');`;
- add `import { Alert } from 'react-native';` to the `react-native` import (it already imports `AccessibilityInfo, Keyboard, ScrollView, TextInput`), add
  `import { fileReport } from '../../src/api/chats';` and `import { blockBuddy } from '../../src/api/buddies';`, and append:

```tsx
it("a buddy's coach with a camp note opens their thread with the note staged", async () => {
  (fetchCamp as jest.Mock).mockResolvedValue(camp());
  renderScreen();
  fireEvent.press(await screen.findByTestId('camp-coach-ben'));
  expect(mockNavigate).toHaveBeenLastCalledWith('ChatThread', { buddyId: 'ben', quote: { request: { type: 'camp_note' }, label: "BEN's camp note" } });
});

it('on a server without chats, a coach opens their week and Message camp opens Buddies; no Report link', async () => {
  mockChats = false;
  (fetchCamp as jest.Mock).mockResolvedValue(camp());
  renderScreen();
  fireEvent.press(await screen.findByTestId('camp-coach-ben'));
  expect(mockNavigate).toHaveBeenLastCalledWith('BuddyWeek', { buddyId: 'ben' });
  fireEvent.press(screen.getByTestId('camp-message-camp'));
  expect(mockNavigate).toHaveBeenLastCalledWith('Buddies');
  expect(screen.queryByTestId('camp-report-ben')).toBeNull();
});

it("reports a buddy's camp note from Who's here, then offers to block them too", async () => {
  (fetchCamp as jest.Mock).mockResolvedValue(camp());
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === 'destructive')?.onPress?.());
  renderScreen();
  expect(await screen.findByTestId('camp-report-ben')).toBeTruthy();
  expect(screen.queryByTestId('camp-report-me')).toBeNull();
  fireEvent.press(screen.getByTestId('camp-report-ben'));
  await act(async () => fireEvent.press(screen.getByTestId('report-other')));
  expect(fileReport).toHaveBeenCalledWith('camp_note', 'ben', 'other');
  await act(async () => fireEvent.press(screen.getByTestId('report-block')));
  expect(blockBuddy).toHaveBeenCalledWith('ben');
  expect(refreshSocial).toHaveBeenCalled();
  alert.mockRestore();
});
```

- [ ] **Step 2: Run them to see them fail**

Run (from `mobile/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/screens/SocialStoryChats.test.tsx __tests__/components/ChatSettingsSection.test.tsx __tests__/components/NotificationsSectionChats.test.tsx __tests__/screens/CampfireScreen.test.tsx`
Expected: FAIL — no Message button, no settings section, no message switches; the coach and Message camp keep their S2 targets.

- [ ] **Step 3: The Campfire**

In `mobile/src/screens/CampfireScreen.tsx`:
- in the header comment, replace the two lines
  `// each whole note, and Message camp. Every time here is 12-hour. A buddy's coach opens their week; mine opens Half at` and
  `// the note. "Message camp" opens Buddies until chats arrive in S3. An older server (bare 404) says the camp isn't open`
  with these three:

```tsx
// each whole note (a buddy's with "Report note"), and Message camp. Every time here is 12-hour. A buddy's coach opens
// their chat (their camp note staged), mine opens Half at the note; "Message camp" opens Chats — on a server without
// chats (S2), the week and Buddies instead. An older server (bare 404) says the camp isn't open
```

- add `Alert` to the `react-native` import; change `import { buddyErrorCode } from '../api/buddies';` to
  `import { blockBuddy, buddyErrorCode } from '../api/buddies';`; add `import { ReportSheet } from '../components/chats/ReportSheet';`
  after the `CampScene` import and `import { campNoteQuoteLabel } from '../lib/chatCopy';` after the `buddyCopy` import;
  change `import { refreshSocial } from '../lib/socialStore';` to `import { refreshSocial, useChatsAvailable } from '../lib/socialStore';`;
- in `CampfireScreen`, after `const [focused, setFocused] = useState(true);` add:

```tsx
  const chats = useChatsAvailable();
  // The buddy whose camp note is being reported.
  const [reportMember, setReportMember] = useState<CampMember | null>(null);
```

- replace the `onCoachPress` callback with:

```tsx
  const onCoachPress = useCallback((m: CampMember) => {
    if (!m.mine) {
      // Their chat, with their camp note staged (spec §6.1, §8.3); their week on a server without chats.
      if (chats === true) {
        navigation.navigate('ChatThread', m.note
          ? { buddyId: m.person.id, quote: { request: { type: 'camp_note' }, label: campNoteQuoteLabel(personName(m.person, false)) } }
          : { buddyId: m.person.id });
      } else {
        navigation.navigate('BuddyWeek', { buddyId: m.person.id });
      }
      return;
    }
    // Mine: up to Half, at the note.
    moveTo('half');
    if (drafting.current) input.current?.focus();
  }, [navigation, moveTo, chats]);
```

- after the `clear` handler, add:

```tsx
  const blockReported = () => {
    const m = reportMember;
    setReportMember(null);
    if (!m) return;
    const name = personName(m.person, false);
    Alert.alert(`Block ${name}?`, "They won't be told. You can unblock them in Profile.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: () => {
          void blockBuddy(m.person.id).then(
            () => {
              void load();
              void refreshSocial();
            },
            (e: unknown) => setMessage(buddyErrorMessage(buddyErrorCode(e))),
          );
        },
      },
    ]);
  };
```

- in "Who's here", replace the row's `<Text className="flex-1 text-[15px] leading-5">…</Text>` element with:

```tsx
            <View className="flex-1 gap-1">
              {/* No line limit: "Who's here" is where a whole note is read (the bubble is one truncated line). */}
              <Text className="text-[15px] leading-5">
                <Text className="font-semibold">{personName(m.person, m.mine)}</Text>
                {' '}
                <Text testID={`camp-who-status-${m.person.id}`} className="text-[13px] text-muted-foreground">{campStatus(m)}</Text>
              </Text>
              {chats === true && !m.mine && m.note ? (
                <Button testID={`camp-report-${m.person.id}`} variant="link" accessibilityRole="button" className="self-start"
                  textClassName="text-xs text-muted-foreground" onPress={() => setReportMember(m)}>Report note</Button>
              ) : null}
            </View>
```

  (and delete the now-duplicated `{/* No line limit: … */}` comment line that sat above the old `<Text>`);
- replace `<Button testID="camp-message-camp" variant="secondary" size="lg" onPress={() => navigation.navigate('Buddies')}>Message camp</Button>` with:

```tsx
        {/* Group chat is out of scope (spec §11): Message camp opens Chats; Buddies on a server without chats. */}
        <Button testID="camp-message-camp" variant="secondary" size="lg" onPress={() => (chats === true ? navigation.navigate('Chats') : navigation.navigate('Buddies'))}>Message camp</Button>
```

- after the closing `</CampPanel>` (inside the outer `<View testID="campfire">`), add:

```tsx
      <ReportSheet
        target={reportMember ? { type: 'camp_note', id: reportMember.person.id } : null}
        name={reportMember ? personName(reportMember.person, false) : ''}
        onClose={() => setReportMember(null)}
        onBlock={blockReported}
      />
```

- [ ] **Step 4: The story viewer's Message button**

In `mobile/src/screens/SocialStoryScreen.tsx`:
- in the header comment, replace `// the end closes. Replies are stickers until chats arrive in S3; my own story has none.` with:

```tsx
// the end closes. Replies are stickers, and (S3, on a server with chats) "Message" opens the thread with the frame
// staged; my own story has neither.
```

- add imports `import { Ionicons } from '@expo/vector-icons';`, `import type { NativeStackNavigationProp } from '@react-navigation/native-stack';`,
  `import type { StoryFrame } from '../api/social';` (merge into the existing `../api/social` import as `type StoryFrame`),
  `import { buttonIconSize } from '../components/ui/button';` (merge into the existing `Button` import),
  `import { frameQuoteLabel } from '../lib/chatCopy';` and `import type { RootStackParamList } from '../navigation/RootNavigator';`;
- change `const navigation = useNavigation();` to `const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();`;
- after `const leave = useCallback(() => navigation.goBack(), [navigation]);` add:

```tsx
  // Close the viewer, then open their thread with this frame staged as the quote (spec §4.2, §8.3).
  const openThread = useCallback((story: Story, frame: StoryFrame) => {
    navigation.goBack();
    navigation.navigate('ChatThread', {
      buddyId: story.author.id,
      quote: { request: { type: 'story_frame', at: frame.at }, label: frameQuoteLabel(frame.kind, personName(story.author, false)) },
    });
  }, [navigation]);
```

- change `if (loaded.phase === 'ready') return <Viewer story={loaded.story} mineHint={mineParam === true} onClose={leave} />;` to
  `if (loaded.phase === 'ready') return <Viewer story={loaded.story} mineHint={mineParam === true} onClose={leave} onMessage={openThread} />;`;
- change the `Viewer` signature to
  `function Viewer({ story, mineHint, onClose, onMessage }: { story: Story; mineHint: boolean; onClose: () => void; onMessage: (story: Story, frame: StoryFrame) => void }) {`
  and after `const myMood = …;` add:

```tsx
  // A server with chats sends unread.chats (S3); without it there is no thread to open.
  const chatsOn = social.status === 'ready' && typeof social.home.unread?.chats === 'number';
```

- in the replies block, after the `{message ? <Text testID="story-message" …>{message}</Text> : null}` line, add:

```tsx
          {chatsOn ? (
            <Button testID="story-message-button" variant="outline" size="sm" onPress={() => onMessage(story, frame)} className={`rounded-full ${ON_STORY_OUTLINE}`}
              textClassName="text-white" iconStart={<Ionicons name="chatbubble-outline" size={buttonIconSize('sm')} color="#FFFFFF" />}>
              {`Message ${personName(story.author, false)}`}
            </Button>
          ) : null}
```

- [ ] **Step 5: The Profile switches**

Create `mobile/src/components/chats/ChatSettingsSection.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { Switch } from 'react-native';
import { useColorScheme } from 'nativewind';
import { fetchChatSettings, saveChatSettings, type ChatSettings } from '../../api/chats';
import { useBuddies } from '../../lib/buddiesStore';
import { COLORS } from '../../theme';
import { SettingsGroup, SettingsRow } from '../ui/settings-list';
import { Text } from '../ui/text';

const FAILED = 'Your chat setting could not be saved. Please try again.';

// Profile → Chats (spec 2026-10-07 social §8.2, §8.4): Read receipts and Show activity status, on by default and
// reciprocal (off: you neither send nor see them). A switch shows what the server last confirmed. Hidden without
// buddies and on a server without chats (bare 404).
export function ChatSettingsSection() {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  const buddies = useBuddies();
  const [settings, setSettings] = useState<ChatSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const available = buddies.status === 'ready';

  useEffect(() => {
    if (!available) return;
    let live = true;
    fetchChatSettings().then(
      (s) => {
        if (live) setSettings(s);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [available]);

  if (!available || !settings) return null;

  async function toggle(key: keyof ChatSettings, next: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailed(false);
    try {
      setSettings(await saveChatSettings({ [key]: next }));
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const row = (key: keyof ChatSettings, id: string, title: string, subtitle: string, icon: 'checkmark-done-outline' | 'radio-button-on-outline') => (
    <SettingsRow
      testID={`${id}-row`}
      icon={icon}
      tint={colors.accent}
      title={title}
      subtitle={subtitle}
      trailing={
        <Switch testID={`${id}-toggle`} accessibilityLabel={title} value={settings[key]} disabled={busy}
          onValueChange={(next) => void toggle(key, next)} trackColor={{ true: colors.accent }} />
      }
    />
  );

  return (
    <SettingsGroup testID="chat-settings" label="Chats">
      {row('readReceipts', 'chat-read-receipts', 'Read receipts', "Show \"Seen\" when you've read a chat. Off, you won't see theirs either.", 'checkmark-done-outline')}
      {row('activityStatus', 'chat-activity', 'Show activity status', "Let buddies see when you were last active. Off, you won't see theirs either.", 'radio-button-on-outline')}
      {failed ? <Text testID="chat-settings-message" className="px-4 pb-3 text-sm text-destructive">{FAILED}</Text> : null}
    </SettingsGroup>
  );
}
```

In `mobile/src/screens/SettingsScreen.tsx`, add `import { ChatSettingsSection } from '../components/chats/ChatSettingsSection';`
after the `BuddiesProfileSection` import, and after
`<BuddiesProfileSection onNavigate={(route) => navigation?.navigate(route as never)} />` add `<ChatSettingsSection />`.

In `mobile/src/components/notifications-section.tsx`:
- add `import { useChatsAvailable } from '../lib/socialStore';` after the `buddiesStore` import;
- after the `BUDDY_ROWS` constant add:

```tsx
// Chats (spec 2026-10-07 social §10), on a server with chats: message pushes (on) and their previews (off by default).
const CHAT_ROWS = [
  ['notifyDirectMessages', 'chat-messages', 'Messages', 'When a buddy sends you a message'],
  ['showMessagePreviews', 'chat-previews', 'Message previews', 'Show the message text in the notification'],
] as const;
```

- after `const buddies = useBuddies();` add `const chats = useChatsAvailable();`;
- replace the `{buddies.status === 'ready' ? BUDDY_ROWS.map(([key, id, title, subtitle]) => ( … )) : null}` block with:

```tsx
      {buddies.status === 'ready'
        ? [...BUDDY_ROWS, ...(chats === true ? CHAT_ROWS : [])].map(([key, id, title, subtitle]) => (
            <SettingsRow
              key={key}
              testID={`${id}-row`}
              icon="people-outline"
              tint={colors.accent}
              title={title}
              subtitle={subtitle}
              trailing={
                <Switch
                  testID={`${id}-toggle`}
                  accessibilityLabel={`${title} notifications`}
                  value={isOn(key)}
                  disabled={busy}
                  onValueChange={(next) => void toggle(key, next)}
                  trackColor={{ true: colors.accent }}
                />
              }
            />
          ))
        : null}
```

- [ ] **Step 6: Run the tests**

Run (from `mobile/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/screens/SocialStoryChats.test.tsx __tests__/screens/SocialStoryScreen.test.tsx __tests__/screens/SocialStoryCampfire.test.tsx __tests__/components/ChatSettingsSection.test.tsx __tests__/components/NotificationsSectionChats.test.tsx __tests__/components/NotificationsSection.test.tsx __tests__/components/NotificationsSectionBuddies.test.tsx __tests__/screens/CampfireScreen.test.tsx __tests__/screens/CampfireSceneMotion.test.tsx __tests__/screens/SettingsScreen.test.tsx __tests__/screens/SettingsPush.test.tsx __tests__/conventions/buttons.test.ts`
Expected: PASS.
Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/tsc --noEmit --types jest,node --pretty false | grep -c "error TS"` — Expected: `12`.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/components/chats/ChatSettingsSection.tsx mobile/src/screens/CampfireScreen.tsx mobile/src/screens/SocialStoryScreen.tsx mobile/src/screens/SettingsScreen.tsx mobile/src/components/notifications-section.tsx mobile/__tests__/screens/SocialStoryChats.test.tsx mobile/__tests__/components/ChatSettingsSection.test.tsx mobile/__tests__/components/NotificationsSectionChats.test.tsx mobile/__tests__/screens/CampfireScreen.test.tsx
git commit -m "feat(mobile): message from a story, a note or the camp; report camp notes; chat privacy and message push switches"
```

---

### Task 18: Dev seed — a short demo conversation and a Chats note

**Files:**
- Modify: `backend/scripts/seedSocial.ts`, `backend/tests/scripts/seedSocial.test.ts`

**Interfaces:**
- Consumes: `writeMessageTx`, `findConversationId` (Task 4); `checkMessageText` (Task 3); `listThread` (Task 6),
  `unreadChatsCount` (Task 8), `getNotes`, `STATUS_NOTE_TTL_MS` (Task 9) in the test.
- Produces: `SEED_CHAT = { mine: 'early night tonight? the camp is lighting the fire at 10:30', theirs: 'rough night lol,
  the neighbours had a party' }`, `SEED_STATUS_NOTE = 'early night tonight'`; `seedSocial(…)` resolves
  `{ buddyCheckedIn, stepGoal, recapShared, campNote, goodnight, chat: boolean, statusNote: true }` — `chat` is true when
  this run wrote the conversation (once per pair: a re-run finds the buddy's line and writes nothing).

- [ ] **Step 1: Write the failing test**

In `backend/tests/scripts/seedSocial.test.ts`:

Change the import line to `import { SEED_CAMP_NOTE, SEED_CHAT, SEED_STATUS_NOTE, seedSocial } from '../../scripts/seedSocial';`
and add:

```ts
import { unreadChatsCount } from '../../src/chats/inbox';
import { listThread } from '../../src/chats/messages';
import { getNotes } from '../../src/chats/notes';
import { checkMessageText } from '../../src/chats/text';
```

Add `chat: true, statusNote: true` to the four first-run expectations:
`sed -i '' 's/campNote: true, goodnight: true })/campNote: true, goodnight: true, chat: true, statusNote: true })/' backend/tests/scripts/seedSocial.test.ts`

Append:

```ts
it("seeds a short demo chat once — the buddy's reply unread for the demo account — and the buddy's Chats note", async () => {
  const a = await prisma.user.create({ data: { email: `seed-a-${randomUUID()}@example.com`, name: 'A' } });
  const b = await prisma.user.create({ data: { email: `seed-b-${randomUUID()}@example.com`, name: 'B' } });
  await pairUp(a.id, b.id);
  expect((await seedSocial({ email: a.email, buddyEmail: b.email, now: NOW, env: LOCAL })).chat).toBe(true);
  expect((await seedSocial({ email: a.email, buddyEmail: b.email, now: NOW, env: LOCAL })).chat).toBe(false);
  const thread = await listThread(a.id, b.id, undefined, NOW);
  expect(thread.messages.map((m) => [m.mine, m.text])).toEqual([[true, SEED_CHAT.mine], [false, SEED_CHAT.theirs]]);
  expect(thread.messages[0]!.reactions).toEqual([{ kind: 'HEART', mine: false }]);
  expect(await unreadChatsCount(a.id)).toBe(1);
  expect((await getNotes(a.id, NOW)).buddies.map((n) => n.text)).toEqual([SEED_STATUS_NOTE]);
  // The seeded lines are valid messages as the app would send them.
  expect([checkMessageText(SEED_CHAT.mine), checkMessageText(SEED_CHAT.theirs)]).toEqual([SEED_CHAT.mine, SEED_CHAT.theirs]);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bash .superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh tests/scripts/seedSocial.test.ts`
Expected: FAIL — `SEED_CHAT` is not exported; the results lack `chat` / `statusNote`.

- [ ] **Step 3: Extend the seed**

In `backend/scripts/seedSocial.ts`:

In the header, after the line `// walkthrough shows the lock lifting. Run seedBuddies first: the two accounts must already be buddies.` add these two
comment lines:

```ts
// For Chats (S3) the two accounts get a short conversation (mine, then the buddy's unread reply with a Heart on mine),
// written once per pair, and the buddy a Chats note (upserted).
```

Add the imports `import { findConversationId, writeMessageTx } from '../src/chats/conversations';` and
`import { STATUS_NOTE_TTL_MS } from '../src/chats/notes';` after the `../src/buddies/pairs` import, and after
`SEED_CAMP_NOTE` add:

```ts
/** The demo conversation (the V5 thread board's lines). */
export const SEED_CHAT = {
  mine: 'early night tonight? the camp is lighting the fire at 10:30',
  theirs: 'rough night lol, the neighbours had a party',
} as const;
/** The buddy's Chats note (the V5 Chats board's line). */
export const SEED_STATUS_NOTE = 'early night tonight';
```

Change the `seedSocial` return type to
`Promise<{ buddyCheckedIn: boolean; stepGoal: boolean; recapShared: boolean; campNote: boolean; goodnight: boolean; chat: boolean; statusNote: boolean }>`
and replace its last line `return { buddyCheckedIn: true, stepGoal: true, recapShared: recap !== null, campNote: true, goodnight: true };` with:

```ts
  // The demo chat, written directly (no limiter, no push): mine 30 minutes ago, the buddy's reply 20 minutes ago with a
  // Heart on mine, so the demo account has one unread conversation. Once per pair: a re-run finds the reply and stops.
  const chat = await prisma.$transaction(async (tx) => {
    const existing = await findConversationId(userId, buddyId, tx);
    if (existing && (await tx.message.count({ where: { conversationId: existing, text: SEED_CHAT.theirs } })) > 0) return false;
    const mine = await writeMessageTx(tx, { senderId: userId, recipientId: buddyId, kind: 'TEXT', text: SEED_CHAT.mine, now: new Date(now.getTime() - 30 * 60_000) });
    const theirsAt = new Date(now.getTime() - 20 * 60_000);
    await writeMessageTx(tx, { senderId: buddyId, recipientId: userId, kind: 'TEXT', text: SEED_CHAT.theirs, now: theirsAt });
    await tx.messageReaction.createMany({ data: [{ messageId: mine, reactorId: buddyId, kind: 'HEART', createdAt: theirsAt }], skipDuplicates: true });
    return true;
  });
  const statusNote = { text: SEED_STATUS_NOTE, createdAt: now, expiresAt: new Date(now.getTime() + STATUS_NOTE_TTL_MS) };
  await prisma.statusNote.upsert({ where: { authorId: buddyId }, create: { authorId: buddyId, ...statusNote }, update: statusNote });
  return { buddyCheckedIn: true, stepGoal: true, recapShared: recap !== null, campNote: true, goodnight: true, chat, statusNote: true };
```

(`main` logs the result object: booleans only, never a message or note text.)

- [ ] **Step 4: Run the test**

Run: `bash .superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh tests/scripts/seedSocial.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/seedSocial.ts backend/tests/scripts/seedSocial.test.ts
git commit -m "chore(seed): the Social seed adds a short demo chat and the buddy's Chats note"
```

---

### Task 19: Whole-phase verification

**Files:** none new; fix-ups only where a check fails (each its own commit).

- [ ] **Step 1: Whole backend suite**

Run: `bash .superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh` — Expected: PASS (rerun a single failing suite
alone before treating it as real; record flakes in the ledger).

- [ ] **Step 2: Backend typecheck**

Run (from `backend/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/tsc --noEmit` — Expected: no output.

- [ ] **Step 3: Whole mobile suite and typecheck**

Run (from `mobile/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit` — Expected: PASS.
Run: `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/tsc --noEmit --types jest,node --pretty false | grep -c "error TS"`
— Expected: `12`, the same file list as `.superpowers/sdd/2026-10-08-social-s3-chats/tsc-baseline.txt` (none in a file this phase touched).

- [ ] **Step 4: Privacy audit**

- `grep -rn "console\.\|log(" backend/src backend/scripts` — read every hit in or reaching `src/chats`, `src/buddies`,
  `src/social`, `src/coach/push.ts`, `src/sync/worker.ts`, `src/users/deletion.ts` and `scripts/seedSocial.ts`: each is
  `JSON.stringify({ event, …ids|counts, error: err.name })` or an id-only message; none passes a message, note, camp-note
  or report `text` / `excerpt`, a `preview` or a request body (the whole backend, not only `src/chats`).
- `grep -rn "excerpt" backend/src` — only `src/chats/reports.ts` (written, never read back).
- `grep -rn "showMessagePreviews\|pushPreviewOf" backend/src` — only `chats/dmPush.ts`, `users/notifications.ts`; the
  preview is built only after the recipient's setting is read.
- `grep -rln "chats/" backend/src/coach backend/src/recap` — no output (nothing from chats reaches the coach).
- `grep -rn "console\." mobile/src/api/chats.ts mobile/src/lib/chatCopy.ts mobile/src/lib/chatThread.ts mobile/src/components/chats mobile/src/screens/Chat*.tsx` — no output.

- [ ] **Step 5: Migrations are additive**

Run: `grep -niE "drop|alter column|rename" backend/prisma/migrations/20261011120000_story_seen_last_frame/migration.sql backend/prisma/migrations/20261011130000_social_chats/migration.sql` — Expected: no output.

- [ ] **Step 6: The button standard**

Run (from `mobile/`): `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit __tests__/conventions/buttons.test.ts` — Expected: PASS
(new raw pressables are only the allowlisted conversation row, new-chat row and note avatars).

- [ ] **Step 7: Clean tree**

Run: `git status --short` — Expected: no output.

**Not in this task:** the owner walkthrough (controller, after the final whole-branch review): back up the dev DB,
`prisma migrate deploy`, run the dev backend and Metro from the synced run folder, `seedBuddies` then `seedSocial` for
the demo pair, and walk: Social → the Chats button (count = unread chats + requests) → the inbox (@handle, search, the
buddy's "early night tonight" note, the bold unread row with "rough night lol…", the Cheer button, "Requests (N)") →
the thread (Active line, the Heart on my message, the date chip, send a text, a sticker, "+" after checking in, reply to
a message, react, unsend, report → "Block too" cancelled) → a second device or the seed buddy replying shows within 5 s
→ my Chats note (count, 60 limit, clear) → a buddy's note → its thread with the note staged → the story viewer's
"Message Sam" → the Campfire (a coach opens the thread with the camp note staged; "Report note"; Message camp opens
Chats) → Profile (Chats: Read receipts and Activity status off and on; Notifications: Messages, Message previews) → a
`dm_message` push from the seed buddy (dev push sender) opening the thread; a request push opening Chats › Requests.

---

## Self-review notes

- Spec coverage (S3, §12: "conversations, messages, reactions, unsend, seen, activity status, notes, Requests move,
  reports, `dm_message` push"):
  - Conversations and messages §8.2 (TEXT 1–1000 sanitised, STICKER through the Buddies sticker, CARD snapshots) →
    Tasks 2, 3, 4, 5; replies to a message (the model's `replyToMessageId`) → Tasks 4, 14.
  - Reactions and unsend §8.2 → Task 7 (backend), Task 14 (app).
  - Seen, read receipts, reciprocal setting §8.2 → Task 6 (server), Tasks 13–14 (window and "Seen"), Task 17 (switch).
  - Activity status §8.4 (≤ 5 min "Active now", then minutes, hours, nothing past 24 h; reciprocal; once a minute on
    foreground) → Task 6, Task 13 (presence ping, words), Tasks 14–15 (header, rows), Task 17 (switch).
  - Inbox §8.1 (header, search, notes row, rows with story ring, active dot, preview, unread weight, quick sticker,
    Requests) → Task 8, Task 15; notes §8.1 (≤ 60, 24 h, sanitiser, quote on tap) → Tasks 9, 15.
  - Delivery §8.2 (5-s poll, inbox refresh on focus and on a `dm_message` push) → Tasks 13, 14, 15 (the S2 foreground
    push refresh already re-reads Social; `dm_message` joins the buddy kinds in Task 14).
  - Replies from elsewhere §8.3, §4.2, §6.1 → Task 17 (story, camp) and Task 15 (Chats note).
  - API §8.5 (`GET /me/chats`, messages before/after, POST, DELETE, reaction PUT/DELETE, read, notes, reports; every
    chat route `not_buddies`) → Tasks 4–10 (with `after` replaced by the newest-page poll, plan ruling).
  - Privacy §9 (no text in logs, coach, analytics or pushes without previews; mute silences DM pushes; unpair/block
    delete the conversation and hide notes; block equal-work; reports + "Block too"; rate limits fail closed; deletion
    cascades) → Global Constraints, Tasks 2, 4, 9, 10, 11, 12, 19.
  - `dm_message` §10 (setting, previews off, 2-minute grouping, quiet hours, mute, id-only data, push.ts header) → Task 12;
    routing §2 (`dm_message` → thread, sticker/paired/badge → thread, request → Chats › Requests) → Tasks 14, 16.
  - Requests move and "All buddies" §2 → Tasks 15, 16; unread on the tab dot and Chats button §2, §4 → Tasks 8, 13, 15.
  - S1/S2 stand-ins replaced: the Chats button (Task 15), "Message camp" and a coach on the Campfire (Task 17), buddy
    push taps (Tasks 14, 16).
  - S2 deferral (the only "Deferred to S3" line): the story ring re-light → Task 1, first.
  - Out of scope, unchanged (§11): group chat ("Message camp" opens Chats), media, editing, typing, search in text,
    sockets, admin UI.
- Testing §13: message sanitising and limits (Tasks 3, 4), reaction uniqueness (Tasks 2, 7), reciprocal settings
  (Task 6), `dm_message` template and preview rule, push grouping (Task 12); chats CRUD, paging, unsend, reactions,
  read, `not_buddies` everywhere (Tasks 4–8), sticker-via-chat writes the `Sticker` row and respects the daily limit
  (Task 4), unpair/block delete conversations both ways (Task 11), notes (Task 9), reports (Task 10), rate limits fail
  closed (Tasks 4, 7, 9, 10), deletion cascades (Task 2); app: inbox (search, notes, requests, unread) (Task 15), thread
  (send text/sticker/card, reactions, unsend, seen, polling, not_buddies state) (Task 14), push routing for every kind
  (Tasks 14, 16).
- Type consistency: backend `CardDTO`, `MessageDTO`, `ReplyPreviewDTO`, `ThreadDTO` (Task 4), `ChatRowDTO` /
  `LastMessageDTO` / `ChatsPageDTO` (Task 8), `NotesDTO` (Task 9), `ChatSettingsDTO` (Task 6) are mirrored field for field
  by `Card`, `Message`, `ReplyPreview`, `Thread`, `ChatRow`, `LastMessage`, `ChatsPage`, `Notes`, `ChatSettings` (Task 13);
  `CardRequest` is the same four shapes on both sides (Tasks 5, 13); `sendSticker` returns `{ id, messageId }` (Task 4) and
  every caller reads `.id` or `.messageId`; `writeMessageTx(tx, NewMessage)` is used by messages, stickers and the seed;
  `sendBuddyNotice(…, opts)` keeps its first three parameters; `ChatQuote { request, label }` is built by Tasks 15 and 17
  and read by Task 14; testIDs used by Tasks 14–17 tests are the ones their components render.
- Review Focus lines each have a test: unpair/block mid-conversation (Tasks 4, 8, 11, 14); hostile text (Tasks 3, 4, 9,
  12); the polled window (Tasks 13, 14); reciprocal settings and quiet pushes (Tasks 6, 12); old/new server pairs
  (Tasks 1, 13, 14, 15, 17).
- Known costs, accepted: a message outside the newest 50 keeps how it looked (an unsend or reaction there shows on the
  next open); unsending a sticker leaves its timeline row and its place in the day's 5; a report on a since-deleted
  account is deleted with it; a 5-s poll re-reads up to 50 messages per open thread; the inbox re-reads on every Social
  home change; the Campfire "Report note" is a link under the note (the canvas has no report affordance there); a ZWJ
  emoji sequence in a message falls apart (spec's `Cf` rule), as in camp notes; `/me/social` costs one more query (18).
