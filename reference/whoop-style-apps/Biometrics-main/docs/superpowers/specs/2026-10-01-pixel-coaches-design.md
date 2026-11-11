# Pixel coaches: design

**Date:** 2026-10-01
**Branch:** `worktree-pixel-coaches` (from `origin/main` at `e94f944`)
**Status:** approved in conversation, awaiting written-spec review.
**Replaces:** the art, roster and picker from `2026-09-29-companion-characters-design.md`. That
spec's provider, cache, mood rule and persona-version rules still apply unless this one says
otherwise.

## Goal

Replace the eight vector companions with a new cast of **15 pixel-art coaches**. Mochi is the
only one carried over, redrawn. The coaches are chosen from collectible-style **coach cards** in
a grid picker. Two new user settings let people choose how a coach shows that it is thinking: a
pixel **thinking attachment** next to the coach, and a **thinking text** style in the chat.

The mockups in `docs/design/pixel-coaches/` are the visual source of truth. `cast.js` in that
folder holds the sprite grids and palettes that the app's art data is ported from.

### Decisions (from the brainstorm)

| Topic | Decision |
|---|---|
| Cast | 15: Mochi, Boba, Sprout, Avo, Peep, Bun, Kit, Axo, Boo, Cap, Jelly, Pengu, Luna, Gloop, Bao. Hoot, Pip, Nimbus, Ember, Beep, Doze and Beat are retired. |
| Art | Hand-drawn 24×24 pixel sprites. Only the left half is stored; the right half is its mirror image, so every coach is exactly symmetrical. |
| Width | Luna, Mochi, Boba and Jelly at original width. Sprout slimmest (−4 px). The other 10 slimmer (−2 px). |
| Finish | **Soft outline**: a 1-pixel outline in a darker shade of the coach's own colour, plus three-tone body shading (lit top edge, shaded base). |
| Moods | One shared system: idle, thinking, answering, resting, applied to each coach's eyes plus small pixel effects. |
| Mini variant | Dropped. One sprite at every size, snapped to crisp whole-pixel scales. |
| Picker | **Grid + card sheet**: 3-column grid of all 15, tapping one raises its coach card in a bottom sheet. |
| Default coach | **Mochi** (Skip, signed-out screens, before a coach is chosen). |
| Retired choices | Cleared, so those users get the new picker on their next Coach-tab visit. Mochi users keep Mochi. |
| Thinking attachment | User setting with 9 styles. **Lightbulb** is the default. |
| Thinking text | User setting with 10 styles (A to J). **F "What it's doing"** is the default, driven by real progress events from the backend. |

## Non-goals

- Characters that grow, unlock or are collected (the card numbers are decoration only).
- Changing what data the coach can see, its safety rules, or the LLM provider.
- Per-coach thinking settings. Both settings are one choice for the whole app.
- Light-mode-specific art. Sprites are the same in both themes (the soft outline keeps edges
  readable on light backgrounds, which the mockups check).

## 1. The cast

| # | Coach | What it is | Accent | Focus chip | Width |
|---|---|---|---|---|---|
| 01 | Mochi | Squishy rice cake | `#F9A8D4` | Rest | original |
| 02 | Boba | Bubble tea | `#E0B48A` | Daily habits | original |
| 03 | Sprout | Potted seedling | `#4ADE80` | Progress | slimmest |
| 04 | Avo | Avocado half | `#A3E635` | Energy | slimmer |
| 05 | Peep | Baby chick | `#FDE047` | Motivation | slimmer |
| 06 | Bun | Bunny | `#CBD5E1` | Rest days | slimmer |
| 07 | Kit | Ginger cat | `#FB923C` | Bedtime | slimmer |
| 08 | Axo | Axolotl | `#F472B6` | Recovery | slimmer |
| 09 | Boo | Friendly ghost | `#C7D2FE` | Wind-down | slimmer |
| 10 | Cap | Mushroom | `#EF4444` | Balance | slimmer |
| 11 | Jelly | Jellyfish | `#A78BFA` | Breathing | original |
| 12 | Pengu | Penguin | `#7C93B8` | Consistency | slimmer |
| 13 | Luna | Sleepy moon | `#FEF08A` | Sleep | original |
| 14 | Gloop | Slime drop | `#84CC16` | Workouts | slimmer |
| 15 | Bao | Panda | `#94A3B8` | Movement | slimmer |

The order above is the picker order and the card number. The tagline and greeting for each are
in section 6 (personas), which is where the server copy lives.

## 2. Sprite engine (mobile)

### Data, not drawings

Each coach is data in `mobile/src/components/characters/sprites/<id>.ts`:

```ts
export const kit: SpriteDef = {
  half: ['............', /* 24 rows of 12 letters */],
  palette: { b: '#FB923C', h: '#FDBA74', s: '#EA580C', e: '#2A1205', /* … */ },
  eyes: 'ew',     // letters that are eyes (default 'ew')
  lid: 'b',       // what an eye cell becomes when closed (default 'b')
  shut: 'e',      // the closed-eye line colour (default 'e')
  slim: 1,        // 0 original, 1 slimmer, 2 slimmest
  shift: 3,       // optional rows to move down so it sits centred
};
```

Ported from `docs/design/pixel-coaches/cast.js`. Letters: `b` body (auto-shaded), `h`/`s` the
body's light and shadow shades, `e` ink/eyes, `w` eye glint, `c` cheek, `m` mouth, other letters
per coach. `x` (sparkles), `z` (ground shadow) and `t` (Jelly's tentacles, Boba's straw) are
never outlined.

A pure module, `sprites/compose.ts`, turns a `SpriteDef` plus a mood frame into a 24×24 grid of
colours:

1. **Narrow** the half by `slim` columns (drop the column most like its neighbour, pad the outside).
2. **Mood edits** on the eyes (section 3).
3. **Mirror** into the full 24×24 grid.
4. **Shade** `b` cells: no solid cell above → `h`; within two cells of the bottom edge → `s`.
5. **Soft outline**: every empty cell touching a solid cell (4-neighbour) gets the coach's
   shadow colour × 0.6.

`compose` is pure TypeScript with no Skia import, so all of it is unit-tested in Jest:
symmetry, width per coach, the outline, and each mood's eye edits. The results are memoised
per (coach, mood frame).

### Drawing

`CharacterCanvas` keeps its role as the only file that touches Skia. It draws the composed grid
as one Skia `Picture` of rects, recorded once per frame grid and cached:

- **Crisp scaling.** Sprite pixel size in device pixels = `max(1, floor(size × pixelRatio / 24))`.
  The sprite is centred in its `size × size` slot. Nothing is ever drawn at a fractional pixel
  size.
- **Motion** is whole-sprite-pixel translation only (the bob and hop), driven by Reanimated
  shared values on the UI thread as today, quantised to the sprite pixel size.
- **Frames** (blink, mood eyes, attachment frames) swap the cached `Picture`. There is no
  per-cell animation.
- The **resting** mood mixes every colour 32 % toward `#5B5F73`, done in `compose`.

### Component contract

`Character` keeps its props (`characterId`, `mood`, `size`, `paused`, `dimmed`, `glow`,
`accessibilityLabel`, `testID`) **except `mini`, which is removed**, along with `MINI_MAX_SIZE`
and every call site's `mini` prop. The `art/*Art.tsx` files, `engine/MoodLayers.tsx` and
`engine/useMoodLayer.ts` are deleted. `useLoop` and `keyframes.ts` stay if the bob uses them,
and are otherwise deleted.

The tab-bar hub keeps `HUB_CHARACTER_SIZE = 52`, which now snaps to the 48 pt crisp size on a
3× screen (6 device pixels per sprite pixel).

## 3. Moods

The rule in `characterMood.ts` (when each mood happens) does not change.

| Mood | Eyes | Motion | Extra |
|---|---|---|---|
| **idle** | normal; blink every 4.2 s (140 ms) | 1-pixel bob, 1.6 s loop | none |
| **thinking** | shifted up 1 pixel (glancing at the attachment) | 1-pixel bob | the user's **thinking attachment** (section 4) |
| **answering** | happy arcs (^ ^): eye cells cleared, a top line plus outward-down corners | 2-pixel hop, 0.5 s loop | the attachment's "answer's here" frame, 0.8 s |
| **resting** | closed (the blink pose, held) | 1-pixel bob, 3 s loop | dimmed colours; a 3×5 "z" drifts up from the top right, 2.4 s loop |

Luna's eyes are already closed, so for her only motion and extras change. Bao's eyes are glints
inside black patches (`eyes: 'w'`, `lid: 'k'`, `shut: 'k'`).

Moods switch instantly. The old 250 ms cross-fade is dropped because pixel art swaps frames.
Reduce Motion freezes the bob and the attachment on a still frame, and still shows mood eyes.

## 4. Thinking attachments (setting)

A small pixel object next to the coach while it is in the **thinking** mood. It is drawn on a
36×32 sprite-pixel stage: the coach at x 0–23, y 8–31, the attachment top-right. When the
attachment is on, the `Character` canvas grows to `size × 36/24` wide so the attachment never
overlaps neighbouring UI. Call sites at 36 pt and up reserve that width. Below 24 pt the
attachment is hidden.

Every style is a set of pixel frames in `mobile/src/components/characters/attachments/<id>.ts`,
plus a `done` frame for the answering moment:

| id | Name | Thinking | Answer's here |
|---|---|---|---|
| `bulb` **(default)** | Lightbulb | glass flickers grey / dim, filament glows | lit gold, white filament, rays |
| `cloud` | Thought cloud | 3 dots fill in, one every 400 ms; two trailing puffs | dots turn purple |
| `typing` | Typing bubble | the dots bounce in turn, every 170 ms | dots turn green |
| `hourglass` | Hourglass | sand moves grain by grain, every 340 ms | full bottom, sparkles |
| `gears` | Gears | two cogs alternate teeth frames, every 220 ms | fast spin, one turns gold |
| `question` | ? → ! | a lilac ? bobs | a gold ! |
| `sparkles` | Sparkles | 3 stars twinkle in sequence | all at full size |
| `clock` | Clock | the hand steps through 8 positions | gold face, ding marks |
| `spinner` | Spinner | 8-cell ring chase, every 110 ms | ring turns green |

Frames and colours are exactly as in `04-thinking-attachments.html`.

## 5. Thinking text (setting)

How the chat shows that a reply is on its way, in `CoachScreen`'s pending row. This replaces
today's 20 pt thinking glyph and status line. The coach in that row is drawn at 36 pt in the
thinking mood, with the user's attachment.

| id | Name | Behaviour |
|---|---|---|
| `lines` (A) | Personality lines | "**Name** is *line*…" in the coach accent; lines rotate every 2.4 s; dots tick in time |
| `placeholder` (B) | Reply placeholder | a reply bubble with the coach name and 3 shimmer lines in its accent; the answer streams into **the same bubble** |
| `tag` (C) | Pixel status tag | pixel-font "THINKING" tag with a blinking block cursor, personality line under it |
| `typewriter` (D) | Typewriter | the personality line types (45 ms/char), holds, erases (20 ms/char), next line |
| `nameplate` (E) | Nameplate | a pill under the coach: "Name · thinking…" |
| `steps` **(F, default)** | What it's doing | a checklist of the backend's real progress steps (below), the current one with a spinner, the finished ones ticked |
| `shimmer` (G) | Colour shimmer | "Name is thinking" with an accent sweep, plus a seconds counter |
| `bouncy` (H) | Bouncy letters | "Name is thinking", one letter hopping 2 px at a time |
| `dialog` (I) | Retro dialog box | RPG box with a pixel border and name tab, the lines type out inside it; the answer then types out inside the same box |
| `strip` (J) | Progress strip | a slim reply card with an indeterminate accent strip on top and the personality line |

**Pixel font.** C and I use **Silkscreen** (OFL), bundled with `expo-font`. It is only used in
those two styles.

**Personality lines.** Each coach has three, shipped in the app's registry (not the server):

| Coach | Lines |
|---|---|
| Mochi | mulling it over · getting comfy with your numbers · taking a soft look |
| Boba | stirring the pearls · shaking things up · sipping through your data |
| Sprout | soaking it in · growing an answer · checking the roots |
| Avo | crunching the numbers · weighing up your fuel · pitting the facts |
| Peep | pecking through your data · flapping through your week · chirping up an answer |
| Bun | hopping through your week · nibbling on the numbers · thinking softly |
| Kit | pretending not to care · judging your bedtime · licking a paw, one sec |
| Axo | regenerating ideas · bouncing back with an answer · wiggling its gills |
| Boo | floating through your data · haunting your trends · peeking at last night |
| Cap | getting to the root of it · finding your balance · sprouting an idea |
| Jelly | drifting through the numbers · breathing it in · floating an idea |
| Pengu | waddling through your week · sliding through the data · huddling up an answer |
| Luna | counting stars · reading last night · tucking in the numbers |
| Gloop | bubbling up an answer · bouncing through your week · going gloopy for a sec |
| Bao | chewing it over · stretching for an answer · rolling through your data |

### Real progress steps (backend)

The answer stream already sends one `status` event (`pipeline.ts`, step 3, labels in
`STATUS_LABELS`). It gains two more `status` events, and all three carry a new `step` field:

| step | When |
|---|---|
| `route` | after routing (the existing event) |
| `facts` | the route's fact sheet has been built |
| `write` | just before the first model call |

**Labels depend on the route**, because each route loads different data (`facts.ts`) and a
general question is not about the user's day at all. Each label names what that route really
did:

| Route (question type) | `route` | `facts` | `write` |
|---|---|---|---|
| `today` ("how am I doing today?") | Looking at your day… | Comparing today with your usual… *(today's score and metrics vs. 30-day history)* | Writing it up… |
| `sleep` ("how did I sleep?") | Looking at your sleep… | Going through your recent nights… *(last 7 nights, 30-day sleep history, sleep goal)* | Writing it up… |
| `trends` ("am I improving?") | Looking at your trends… | Comparing your last 30 days… *(7- vs 30-day averages, trends, habit links)* | Writing it up… |
| `general` ("how much sleep do adults need?") | Thinking it over… | Checking your goals… *(only the sleep goal and typical sleep)* | Writing an answer… |

These replace `STATUS_LABELS` as `STEP_LABELS: Record<AnswerRoute, Record<Step, string>>` in
`pipeline.ts`. The `route` labels for today, sleep and trends keep today's wording. General
changes from "Thinking…" to "Thinking it over…" so it reads as a step. A test checks that every
route has all three labels and that no `general` label says "your day", "your sleep" or "your
numbers".

`step` is optional in the parser, so older clients ignore it and newer clients handle older
servers (with no `step`, F shows the label as a single line). The `steps` style ticks the
previous step when the next arrives and ticks the last one when the first `text` event arrives.
The steps happen quickly, so each ticked step stays visible for at least 300 ms.

Every other style ignores step labels; they show personality lines. Steps only ever name work the
pipeline really does, so none are invented to fill the list.

## 6. Personas (backend)

New persona set **`v4.ts`**, following the "add a file, never edit an old one" convention.
`LIVE_PERSONA_VERSION = 'v4'`, `defaultPersonaId: 'mochi'`. Every coach uses the shared
`DISALLOWED_TOPICS` list and `proactivity: 'threshold-triggered'`, so no safety rule or recap
behaviour changes.

| id | Tone (prompt) | Focus | Verbosity | Tagline | Greeting |
|---|---|---|---|---|---|
| mochi | (v3's Mochi, unchanged) | (v3) | (v3) | Soft and gentle. Rest is never something to feel bad about. | Hey you. No pressure today. How are you feeling? |
| boba | Bubbly and upbeat. Short, bright sentences; treat habits like little treats. | Daily habits and hydration. | terse | Bubbly and upbeat. Keeps your daily habits topped up. | Sip check! Want to see today's habits? |
| sprout | Warm and patient. Point to progress over weeks; small steady steps beat big jumps. | Long-term progress. | normal | Celebrates small, steady growth, week after week. | Look how far you've come. Want to see this month? |
| avo | Calm and practical, quietly nerdy about fuel and energy. | Energy through the day. | normal | Calm, and quietly obsessed with what fuels you. | Want to look at where your energy went today? |
| peep | A tiny, loud cheerleader. Very short; celebrate every win. | Motivation and showing up. | terse | Tiny, loud, and your biggest cheerleader. | You showed up! That's already a win. What's next? |
| bun | Gentle and unhurried. Rest days are part of training. | Rest days and pacing. | terse | Gentle. A big believer in taking it easy. | Shall we plan a softer day? |
| kit | Dry, affectionate wit, never mean. Teases about bedtime, then helps. | Bedtime and sleep schedule. | terse | Dry wit. Gently judges your bedtime. | Oh, you're up. Want to talk about last night? |
| axo | Endlessly cheerful and resilient. Frame dips as part of bouncing back. | Recovery. | normal | Endlessly cheerful, all about bouncing back. | Want to see how your recovery is doing? |
| boo | Quiet and kind, a late-night friend. Low-key, calming. | Wind-down and late nights. | terse | Quiet and kind. Shows up when it's late. | Still up? Let's wind down together. |
| cap | Grounded with a touch of whimsy. Looks for balance across the week. | Stress and balance. | normal | Grounded, with a little whimsy. | Want to find a calmer rhythm this week? |
| jelly | Floaty and chill. Slow pace; suggests a breath before advice. | Breathing and calm. | terse | Floaty and chill. Loves a breathing break. | Breathe in… and out. What's on your mind? |
| pengu | Steady and dependable. Consistency over intensity; streaks matter. | Consistency and streaks. | normal | Steady over flashy, one waddle at a time. | Want to see how your streak is going? |
| luna | Dreamy and soothing. Sleep first; explains nights clearly. | Sleep. | normal | Sleepy moon. Your sleep coach, obviously. | Mmm, hi. Want to talk about last night's sleep? |
| gloop | Bouncy and playful. Turns movement into a game; light energy. | Workouts and movement. | terse | Bouncy. Turns every workout into play. | Boing! Ready to move a little today? |
| bao | Big-hearted and relaxed. Gentle movement, stretching, no guilt about snacks. | Gentle movement and stretching. | normal | Big-hearted, into snacks and stretches. | Time for a stretch? I'll do it with you. |

Greetings must not contain numbers the app hasn't checked, so the mockups' example numbers
("1:12am", "7h 12m") are not shipped.

**Legacy ids.** `LEGACY_PERSONA_IDS` (encouraging/direct/clinical) is unused after the
migration below and stays only for reading old rows. `canonicalPersonaId` maps any retired
character id to `null`.

**Old digests.** `CoachDigest.personaId` keeps old ids, as before. A digest from a retired coach
renders with Mochi's sprite, which is the current default fallback.

**Evals.** `evals/coach/fixtures/voice.ts` gets a voice marker per new coach. The "omitted means
Hoot" note becomes Mochi.

## 7. Data migration

Migration `20261001130000_pixel_coaches` (data only):

```sql
UPDATE "User" SET "coachPersonaId" = NULL
WHERE "coachPersonaId" IN ('hoot','pip','nimbus','ember','beep','doze','beat');
```

`personaChosen` is `stored !== null`, so those users see the picker again on their next
Coach-tab visit. A test in `tests/db/` covers it, like `companionCharacters.test.ts`. Mochi rows
are untouched.

## 8. Settings storage (thinking attachment + thinking text)

Two new nullable columns on `User`: `coachThinkingAttachment String?` and
`coachThinkingText String?`, where null means the default. They are returned in the coach status
response as `thinkingAttachment` and `thinkingText` (the default is filled in on the server) and
set by `PUT /me/coach/thinking` with `{ attachment?, text? }`, validated against the id lists
above (400 `unknown_thinking_style`).

On the server so the choice follows the user across devices. On mobile, `CharacterProvider`
holds both, updates optimistically with rollback (like the coach choice), and caches them next
to the character id in `characterCache`. An unknown cached id falls back to the default.

## 9. Screens

### Picker: `MeetYourCoachScreen` → grid + card sheet

- Header as today ("Meet your coach", Skip in first-visit mode / Close in switch mode).
- A 3-column grid of tiles (sprite 56 pt, name). Only the selected tile animates; the rest are
  `paused` (performance). The selected tile has a 1 pt foreground ring.
- Tapping a tile opens a **bottom sheet** with the coach card: an art panel (dotted pattern and
  glow in the coach's accent, sprite 120 pt idle, card number "No.NN", focus chip), name,
  tagline, greeting bubble, and **Choose {Name}**.
- First-visit mode preselects Mochi; switch mode preselects the current coach. Skip saves Mochi.
- Accessibility: tiles are buttons labelled "{Name}, {focus}", with `selected` state. The sheet
  is a modal with focus on the name.
- The old pager and page dots are removed.

### Coach card component

`components/characters/CoachCard.tsx`, used by the sheet and by the dev gallery. Layout and
tokens are as in `02-coach-cards.html`.

### Settings

Under the "Your coach" row in Settings, there are two rows:
- **Thinking style** → a screen with a live preview (your coach, thinking, looping into the
  answering moment) and a 3×3 grid of the 9 attachments.
- **Thinking text** → a screen with a live chat preview and a list of the 10 text styles, each
  row previewing itself.

### Other call sites

- Every `characterId="hoot"` (onboarding hero, Sign Up, Forgot Password, Reset Password) →
  `"mochi"`. `MeetYourCoach` Skip → `'mochi'`. `DEFAULT_CHARACTER_ID = 'mochi'`.
- `mini` props removed everywhere.
- `CoachScreen` header (36 pt), states (56 pt), hero (64 pt), Home tile (40 pt), digest card
  (18 pt), Settings row (36 pt), tab hub (52 pt) keep their sizes, now crisp-snapped.
- `CharacterGalleryScreen` (dev): every coach × 4 moods, the 9 attachments, the 10 text styles,
  and a size ladder (18, 20, 36, 40, 52, 64, 120, 180).
- `README.md` character table and images, and `docs/media/character-*.jpg`, are updated to the
  new cast (new screenshots).

## 10. Testing

- **compose.ts:** each coach is mirror-symmetric; widths match the table; the outline exists
  only next to solid cells; `x/z/t` are never outlined; each mood's eye edit; the resting dim;
  the crisp scale maths for 18/20/36/40/52/64/120/180 pt at 2× and 3×.
- **Attachments and text styles:** frame selection by time; the `done` frame; the steps style
  ticking on `status` and `text` events; fallback with no `step`.
- **Registry:** 15 ids in picker order; Mochi default; lines are 3 per coach.
- **Provider/cache:** thinking settings optimistic update and rollback; unknown cached ids fall
  back to the defaults.
- **Screens:** the picker grid and sheet, Choose, Skip → Mochi; the Settings screens; the
  `CoachScreen` pending row for each text style.
- **Backend:** v4 personas (copy, default, shared disallowed topics); the migration; the new
  `status` steps in the pipeline; the `PUT /me/coach/thinking` validation; the status payload.
- Existing tests that hard-code old ids are updated, not skipped.
- **On a simulator** (iPhone 18 Pro): picker, every mood on the Coach screen, every attachment
  and text style, the tab hub, light mode, Reduce Motion.

## 11. Rollout and risk

- **One PR, two commits** (backend, mobile), the same shape as #44.
- The migration clears 7 ids. Expect most existing users to see the picker once, by design.
- Old app builds talking to the new server get `personaId: 'mochi'` (or a new id they don't
  know). Their `isCharacterId` check falls back to their default (Hoot) art. They don't crash,
  but they show the wrong character until they update.
- Performance: one `Picture` per frame per visible coach, rather than many animated vector
  paths, so it should be no worse than today. Check the Coach screen with 30+ messages.
