# Social tab — design

Follow-on to Buddies (growth sub-project C, `docs/superpowers/specs/2026-10-06-buddies-design.md`, branch
`feature/buddies`). Status: design chosen by the owner on 2026-10-07 from the canvas
https://claude.ai/artifact/XQVY64c9o2r4u5dNeyDGf3 — combination **V5 · One scroll**, with the V5 prototype boards
(Social home, Campfire page with camp notes, Chats inbox, Chat thread). Items marked **(default — confirm)** are
choices made while writing; the owner reviews them with this spec.

## 1. Goal

Turn Biometrics into a social tracking app: a **Social tab** where your circle's day is visible at a glance, where you
check in each morning, gather "around the fire" at night, and talk in Instagram-style direct messages — while keeping
the Buddies privacy model (numbers only by switch, silent controls, nothing to the coach).

Success:
- Opening Social shows, in one scroll: the camp, today's stories, last week's highlights and today's timeline.
- A morning check-in takes one tap and unlocks your buddies' stories.
- At night, "Say goodnight" puts you to sleep at the camp; the fire grows as your circle gets to bed on time; a
  short camp note shows in a bubble over your coach.
- Chats work like Instagram DMs between buddies: text, stickers, reactions, shared check-ins, "Seen", notes.
- Metrics is gone as a tab; its trends live in Activity.

Owner decisions (2026-10-07):
- **Tabs:** Social replaces Metrics: **Home · Activity · AI coach · Social · Profile**. Buddies leaves Profile as an
  entry point (its settings stay in Profile).
- **Social home = V5 one scroll:** camp banner (J) → stories row with your check-in (E + F) → week highlights
  carousel (K) → today timeline (I) → floating Chats button (H).
- **Camp banner opens a Campfire page; Chats opens an Instagram-DM-style feature.**
- **Camp notes:** the camp has its own small note system — you type a note and your coach shows it in a speech
  bubble.

Defaults chosen while writing (confirm at review):
- **Activity layout = "one scroll"** (default — confirm): calendar on top, "Against your usual" tiles below, "All
  trends" opens the full trends screen.
- **Tab bar = option 2** (default — confirm): Social shows a teal dot when there is something unread.
- **Free-text DMs** (default — confirm): this **reverses** the Buddies decision "stickers only (no free text)",
  because Instagram-style chats need text. Media (photos, voice) stays out (§11).
- **Message pushes carry no preview** by default (default — confirm): "Sam sent you a message"; a setting turns
  previews on.
- **Unpair and block delete the conversation** for both people (default — confirm), matching how Buddies already
  deletes stickers and Activity on unpair.
- **Camp notes and Chats notes are separate** (default — confirm), as prototyped: a camp note is a night-time line
  over your coach; a Chats note is a status over your avatar in the inbox.
- **The morning check-in is always shared** with buddies, like mood (default — confirm): it is self-reported (Rested
  / Okay / Tired), carries no number, and is what unlocks stories.

## 2. Navigation

- `TabsNavigator` tabs: Home, Activity, Coach (hub), **Social**, Profile. `MetricsScreen` is no longer a tab; it
  becomes a pushed **Trends** screen (route `Trends`) opened from Activity's "All trends".
- `FloatingTabBar` (`mobile/src/navigation/FloatingTabBar.tsx`): the Metrics icon is replaced by a "people" icon
  for Social, same quiet-line style. **Unread dot** on Social (teal, like the Profile story ring's treatment) when
  any of: unread DM, incoming buddy request, unseen sticker. The dot clears when the cause is read, not on opening
  the tab.
- Home's Buddies row (`mobile/src/components/home/BuddiesRow.tsx`) opens the Social tab instead of the Buddies
  screen.
- Profile: the Buddies section keeps buddy name, sharing switches, notification settings and Blocked people; its
  "Buddies" entry row (added in the Buddies fix wave) is removed — Social is the entry point.
- Push tap routing (`mobile/src/notifications/handler.ts`): `buddy_request` → Chats › Requests; `dm_message` → that
  thread; `buddy_sticker` / `buddy_paired` / `buddy_badge` → that buddy's thread (the buddy's week is one tap from
  the thread header).
- The existing Buddies screen stays as **All buddies** (the paged list, unchanged), reached from the stories row's
  "See all". Its Requests and Activity tabs are removed: requests move to Chats › Requests (§8), Activity is
  replaced by the timeline (§5).

## 3. Activity with Metrics folded in

One scroll, top to bottom (`mobile/src/screens/ActivityScreen.tsx`):
1. Header and the existing steps/sleep month pager and calendar heatmap, unchanged (Month / Year / YTD).
2. **"Against your usual · 30d"**: a 2×2 grid of compact tiles — Resting HR, Sleep, HRV, Recovery — each with the
   latest value, a sparkline over the usual-range band, and the "vs your usual" sentence the Metrics cards already
   compute. Steps is not repeated (the calendar is steps). Tap a tile → `MetricDetail` (existing).
3. **"All trends"** → the Trends screen (today's `MetricsScreen` as a pushed screen, with its range picker and the
   Patterns card).

No backend change: tiles reuse the Metrics data hooks.

## 4. Social home (V5 one scroll)

`SocialScreen` (new tab). Sections in order:

1. **Camp banner** — a slim pixel strip ("THE CAMP · 3 awake · 2 asleep", a small fire, two coach faces). Tap →
   Campfire page (§6). At daytime it reads "THE CAMP · 4 checked in".
2. **Stories row** — first item is **your check-in** (dashed ring, "+"); then one ring per buddy who has a story
   today, newest first: teal ring = unseen, grey = seen. "See all" at the end → All buddies. Tapping your ring before
   checking in opens the check-in sheet; after, it opens your own story.
3. **Week highlights** — a horizontal carousel (top story card + smaller cards) and "All" → Highlights screen (§7).
4. **Today** — the timeline (§5), with one-tap actions.
5. **Chats button** — floating above the tab bar, "Chats" + unread count; → Chats inbox (§8).

Data: one call, `GET /me/social` → `{ camp: CampSummary, me: { checkIn: CheckIn | null }, stories: StoryRing[],
highlights: HighlightsPreview | null, timeline: TimelinePage, unread: { chats: number, requests: number } }`.
Old backend (404) → the tab shows the Buddies fallback (current BuddiesScreen); the tab never crashes.

### 4.1 Morning check-in (F)

- Options **Rested / Okay / Tired**. One per user per **local day** (`localCivilDate(now, user.timezone)`),
  editable until local midnight. Model `CheckIn { userId, localDate (date), mood: CheckInMood, createdAt,
  updatedAt }`, unique `(userId, localDate)`.
- **Always shared** with buddies, like mood (Buddies §1) — it is self-reported, no number. Shown to the user before
  their first check-in with a one-line notice in the sheet ("Your buddies will see this").
- **Lock:** until you check in today, buddies' **check-in frames** in stories are blurred and the rings show a lock;
  the rest of Social works. The server enforces it: story frames of kind `checkin` are returned only after the
  viewer's own check-in for their local today exists (`checkin_locked` otherwise, with the count of buddies who
  checked in).

### 4.2 Stories (E)

- A buddy's story = today's (the **author's** local day) frames, in time order, from a closed set:
  `checkin` (always), `badge` (only while the author shares streaks, Buddies §5 gating via `effectiveSharing`),
  `recap` (only when the author explicitly shared a recap to buddies — a new "Share with buddies" action on the recap
  screen from sub-project B; the frame shows the recap card as the author saw it), `goodnight` (§6).
- Viewer = the existing story viewer from B (`mobile/src/components/recap/…` story viewer), extended to accept
  social frames. Replies from a story open the DM thread with the frame quoted (§8.3).
- Seen state: `StorySeen { viewerId, authorId, localDate }` unique; written when the viewer reaches the last frame.

## 5. Today timeline (I)

- Today's events (viewer's local day) in time order, newest last, from the viewer's buddies and the viewer:
  check-ins, goodnights, badges (streak switch), **step goal passed** (steps switch; emitted when a sync makes today's
  steps ≥ `STEPS_GOAL` for the first time that day — the event carries no number), stickers sent to you, shared
  recaps, camp notes posted (night only).
- Each row: time, coloured dot, "{name} {fixed template}", optional one-tap action: **Cheer** (sticker), **Send Rest
  up** (sticker, offered on a Tired check-in), **Remind me** (crew items, later E).
- Templates are fixed strings with typed slots (name, sticker, badge label) — never free text, never a number. Camp
  note text appears only on the Campfire page, not in the timeline ("Ben left a camp note").
- Built at read time from existing rows (CheckIn, Goodnight, Achievement, Sticker, StepGoalEvent, RecapShare) —
  **Approach A from Buddies**: nothing about a buddy is copied for sharing. `StepGoalEvent { userId, localDate,
  at }` is the one new derived row (written by the sync worker, owner-side, no number).
- `BuddyActivity` (Buddies) stays as the source for stickers / requests / pairing / badges history; the Buddies
  "Activity" list UI is retired in favour of this timeline and Chats › Requests.
- Paging: today only on Social; "Earlier" is not shown (yesterday lives in highlights; stories and the timeline
  show only today, though the underlying rows are kept for highlights).

## 6. Campfire page (J)

`CampfireScreen` (pushed, no tab bar), opened from the camp banner.

### 6.1 Scene

- Your camp = **you + your buddies** (each user sees their own circle). The scene shows you and up to **7** buddies
  around the fire (most recent activity first), plus "+N" for the rest; tap a coach → that buddy's DM thread (yours →
  your note composer).
- Each coach is **awake** or **asleep**: asleep = said goodnight tonight and not yet checked in today (asleep coaches
  close their eyes and show "z z"). Day vs night look: night 19:00–05:59 local (stars, lit fire), day otherwise
  (sky, unlit logs). Live sleep detection is out of scope — health data syncs after waking, so "asleep" is the
  goodnight action, not a sensor reading.
- **Goodnight:** "Say goodnight" (Campfire page and evening timeline) writes `Goodnight { userId, localDate (the
  evening's date — a goodnight between 00:00 and 05:59 local belongs to the previous date), at, onTime }`, unique
  `(userId, localDate)`, undoable for 10 minutes. `onTime` = `at` ≤ the
  user's bedtime goal + 15 min (Sleep depth A's goal), or ≤ 23:00 local when no goal is set.

### 6.2 Fire strength

- Tonight's fire = buddies (including you) with an on-time goodnight ÷ camp size, shown as 5 segments (0–20% → 1,
  …, 81–100% → 5; 0 goodnights → unlit). Text: "3 of 5 in bed on time".
- "Nights lit this week": nights with fire ≥ 3 segments, Mon–Sun. A camp badge (new Achievements family) is a
  follow-up, not this spec (§11); the copy says "Keep it lit" without promising a badge.

### 6.3 Camp notes

- One note per user, **1–40 characters** after the display-name sanitiser (NFC, `Cc`/`Cf` removed, no newlines,
  trimmed; the reserved-word check does not apply). `CampNote { userId (unique), text, createdAt, expiresAt }`.
- Shows in a **speech bubble over that user's coach** on every buddy's Campfire page (and on yours); asleep coaches
  keep their bubble. Your coach shows a dashed "+ Add a note" bubble when you have none.
- Composer on the Campfire page: input with a live count, **Share**, **Clear note**. Sharing replaces your note.
- **Expiry:** at the next **06:00 in the author's zone** after posting, or when the author checks in, whichever is
  first ("clears at sunrise"). Expired notes are deleted by a sweep and hidden at read time.
- Rate limit: 20 note changes per hour. No push. Report and block apply (§9).

### 6.4 Rest of the page

"Say goodnight" / "Message camp" (opens Chats — group chat is out of scope, §11), fire strength card, "Who's here"
list (name + "awake · {note or nothing}" / "asleep since 22:15 · on time").

API: `GET /me/camp` → `{ night: boolean, members: CampMember[], fire: { lit: number, of: number, segments: 0-5 },
nightsLitThisWeek: number }` with `CampMember { id, displayName, coachId, asleep, onTime | null, note | null }`;
`POST /me/camp/goodnight`, `DELETE /me/camp/goodnight` (within 10 min); `PUT /me/camp/note { text }`,
`DELETE /me/camp/note`.

## 7. Week highlights (K)

- Built once a week per user with the weekly recap job (sub-project B prepares weekly recaps ahead); covers the
  circle's Mon–Sun; cached as `WeeklyHighlights { userId, weekStart, items Json, createdAt }` and rebuilt if a
  member's sharing changes (switch off → that member's gated items drop at read time).
- Closed item types (templates, typed slots, no free text, no numbers beyond counts of the circle's own actions):
  `top_story` (one of: checked in every day · on-time goodnight every night · reached a badge level — gated by
  streaks), `most_cheered` (most stickers received), `comeback` (Rested after ≥ 2 Tired check-ins in a row),
  `campfire` ("the fire was lit 5 nights"), `also` (joined, first badge, most stickers sent).
- Social carousel shows last week's items all week; the Highlights screen lists all with Cheer actions. No push of
  its own (the Monday recap push stays the weekly touchpoint).

## 8. Chats (H — Instagram DM style)

### 8.1 Inbox

`ChatsScreen` (pushed from the Chats button, no tab bar):
- Header: back, your **@handle**, new message (pick a buddy).
- **Search** (filters conversations by buddy name/handle locally; no message-content search).
- **Notes row:** your note ("Share a note") then buddies' notes — a ≤ 60-character status shown as a bubble over
  each avatar for **24 hours**. `StatusNote { userId (unique), text, createdAt, expiresAt }`, same sanitiser as camp
  notes. Tapping a buddy's note opens the thread with the note quoted.
- **Messages** list: one row per conversation, newest first — avatar with a teal story ring when that buddy has an
  unseen story, green **active** dot (§8.4), name, last message preview ("Sent a Cheer sticker · 14m",
  "You: proud of that streak! · 5h"), bold + dot when unread, and a quick-sticker button on the right.
- **Requests (N):** incoming buddy requests (moved from the Buddies screen; accept / decline / block exactly as
  Buddies §4). Only buddies can message each other — there are no message requests from strangers.

### 8.2 Conversation

- One `Conversation` per buddy pair: `{ id, userAId, userBId (ordered, unique), createdAt, lastMessageAt }`, created
  on first message.
- `Message { id, conversationId, senderId, kind: TEXT | STICKER | CARD, text?, sticker?, card?: { type: checkin |
  badge | recap | note | camp_note, refId?, snapshot Json }, replyToMessageId?, createdAt, deletedAt? }`.
  - **TEXT:** 1–1000 characters after sanitising (NFC, `Cc`/`Cf` removed except `\n`, trimmed).
  - **STICKER:** the four kinds. Every sticker send — from the thread, the timeline, a buddy's week or the inbox's
    quick-sticker button — writes the Buddies `Sticker` row (so the 5-per-buddy-per-day limit, unseen flags and
    `buddy_sticker` behaviour stay in one place) **and** a STICKER message in the conversation, so the thread is the
    full history.
  - **CARD:** a quoted item — your check-in, a story frame you replied to, a note you replied to. The snapshot holds
    only what the recipient could already see (never an unshared number).
- **Reactions:** one per user per message, the four sticker kinds; `MessageReaction { messageId, userId, kind }`
  unique `(messageId, userId)`.
- **Unsend:** the sender can delete their message (soft delete, shown as nothing — Instagram behaviour).
- **Seen:** `ConversationRead { conversationId, userId, lastReadAt }`; "Seen" under your last message when the other
  read past it. A Profile setting **Read receipts** (default on) is reciprocal: off → you neither send nor see them.
- Thread UI: header (avatar, name, "Active now" / "Active 3h ago", info → that buddy's week), date chips, bubbles
  (yours teal, theirs grey), cards, reactions, "Seen", a quick-sticker row above the composer, "+" to share your
  check-in, input "Message…".
- **Delivery:** no realtime socket in v1. An open thread polls `GET …/messages?after=` every 5 s while foregrounded;
  the inbox refreshes on focus and when a `dm_message` push arrives. A server-sent-events channel is a later step.

### 8.3 Replies from elsewhere

Replying to a story frame, a Chats note or a camp note opens the thread with that item as a CARD message.

### 8.4 Activity status

`User.lastActiveAt`, updated at most once a minute on app foreground. "Active now" ≤ 5 min, else "Active {n}m/h ago"
(≤ 24 h), else nothing. Profile setting **Show activity status** (default on), reciprocal like read receipts.

### 8.5 API

`GET /me/chats?cursor` · `GET /me/chats/:buddyId/messages?before|after` · `POST /me/chats/:buddyId/messages
{ kind, text | sticker | card }` · `DELETE /me/chats/:buddyId/messages/:id` · `PUT|DELETE
/me/chats/:buddyId/messages/:id/reaction` · `POST /me/chats/:buddyId/read` · `GET|PUT|DELETE /me/notes` ·
`POST /me/reports`. Every chat route answers `{error: 'not_buddies'}` for a non-buddy (Buddies §7), never a bare 404.

## 9. Privacy and safety

Carried from Buddies unchanged: numbers only by switch with current consent (`effectiveSharing`), mood always shared,
id-only push data, silent mute/unpair/block, nothing about buddies reaches the AI coach, logs carry ids and event
names only. New rules:
- **Message, note and camp-note text** is never logged, never sent to the coach, never included in any analytics,
  and never in push text unless the recipient turned previews on.
- **Mute** (per buddy) also silences that buddy's DM pushes; their messages still arrive.
- **Unpair / block** delete the conversation, its messages and reactions for both people (default — confirm), and
  hide each other's notes, camp notes, stories, timeline events and camp presence immediately.
- **Block** keeps the Buddies equal-work rule: nothing a sender sees (status, error, timing) reveals a block — with a
  block the pair is gone, so every chat route answers `not_buddies`, as for any unpaired person.
- **Report** a message, note or camp note: `Report { reporterId, targetType, targetId, reason: spam | harassment |
  other, createdAt }`. No admin UI in this spec; reports are stored for later review. Reporting does not notify the
  other person; the reporter is offered "Block too".
- **Rate limits** (fail closed, Buddies limiter): messages 30/min and 500/day per sender; notes 20/h; camp notes
  20/h; reactions 60/min.
- **Account deletion** cascades every new table on both sides. Coach-data deletion leaves social data.

## 10. Notifications

New push kinds (Buddies §6 template rules: typed slots, rebuilt and checked by the sender):

| Kind | Text | Setting |
|---|---|---|
| `dm_message` | "{name} sent you a message" — or, with previews on, "{name}: {text, ≤ 80 chars}" | `notifyDirectMessages` (default on), `showMessagePreviews` (default off) |

- `dm_message` data: `{kind: 'dm_message', refId: senderId}` → opens the thread. Grouped: at most one push per
  conversation per 2 minutes (later messages update the badge count only).
- Quiet hours and per-buddy mute apply, as for buddy kinds.
- **No push** for check-ins, stories, goodnights, notes, camp notes or highlights.
- The preview body is the only free text ever allowed in a push; it is the sender's own message, never a health
  value produced by the app. `push.ts`'s header rule is amended for this one kind.

## 11. Out of scope

Group chats and crew threads (E — "Message camp" opens Chats for now), photos/voice/video/GIFs in chats, message
editing, typing indicators, message-content search, realtime sockets/SSE, admin moderation UI, live sleep detection,
the camp badge (later Achievements family), stories older than today, discovery of non-buddies, web.

## 12. Build phases

The spec is built in three sub-projects, each with its own plan, in this order:
1. **S1 Navigation, Activity, Social home** — tab swap, Activity one-scroll + Trends screen, `SocialScreen` with
   check-in, stories (incl. "Share with buddies" on recaps), timeline, highlights; Chats button opens the existing
   Buddies screens and push taps keep their Buddies routing until S3; Campfire banner shows a static camp until S2.
2. **S2 Campfire** — goodnight, scene, fire strength, camp notes, "Who's here".
3. **S3 Chats** — conversations, messages, reactions, unsend, seen, activity status, notes, Requests move, reports,
   `dm_message` push.

## 13. Testing

- Backend unit: check-in local-day rules and edit window; story frame gating per switch and consent; check-in lock;
  timeline templates (no numbers, no free text) and gating; goodnight `onTime` (with/without bedtime goal, grace,
  wrapping midnight); fire segments; camp-note and note sanitising, length and expiry (06:00 author zone, check-in
  clears); highlights item selection and gating; message sanitising and limits; reaction uniqueness; reciprocal
  read-receipt and activity-status settings; `dm_message` template and preview rule; push grouping.
- Backend integration: `/me/social` bundle shape and 404-safe fallback; check-in create/edit/lock; story seen;
  goodnight + undo; camp members and fire; camp note share/clear/expiry/hidden after unpair/block; chats CRUD, paging,
  unsend, reactions, read, `not_buddies` everywhere, sticker-via-chat writes the `Sticker` row and respects the daily
  limit; unpair/block delete conversations both ways; notes; reports; rate limits fail closed; account deletion
  cascades every new table.
- Mobile: tab bar (Social replaces Metrics, unread dot rules), Activity one-scroll + All trends, Social home
  sections and fallback, check-in sheet + lock, story viewer with social frames, timeline actions, highlights,
  Campfire (day/night, asleep/awake, bubbles, composer with count/share/clear, goodnight undo), Chats inbox (search,
  notes, requests, unread), thread (send text/sticker/card, reactions, unsend, seen, polling, not_buddies state),
  push routing for every kind.
