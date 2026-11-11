# Companion characters — design

**Date:** 2026-09-29
**Branch:** `feature/companion-characters` (docs PR #40, based on `worktree-redesign-tokens-home`;
the redesign itself merged to `main` as PR #39)
**Status:** approved in conversation, awaiting written-spec review. Revised after a review
against the code (verbosity/proactivity values, mini variant, recovery band source, persona
types, a11y, picker order, sign-out cache).

## Goal

Replace the AI "orb" with a selectable animated character. Each character has its own
voice, coaching focus and on-screen moods that react to the user's data. The mockups on
the design canvas ("AI assistant — companions") are the visual source of truth.

### Decisions (from the brainstorm)

| Topic | Decision |
|---|---|
| Characters | Eight: Hoot, Pip, Mochi, Nimbus, Ember, Beep, Doze, Beat. (Luna and Twinkle are not included.) |
| Default | **Hoot** |
| Personality depth | Voice + coaching focus + visual mood reactions |
| Coach style setting | Replaced by the character (Direct / Encouraging / Clinical are retired) |
| Placement | Replaces the orb almost everywhere, including signed-out screens (they show Hoot) |
| Tab bar | Always animating in **idle**, on every tab, full brightness |
| Picker | "Meet your coach" gallery on first Coach-tab visit + "Your coach" row in Profile |
| Rendering | **Skia driven by Reanimated** (GPU; shared values drive Skia on the UI thread) |
| Weekly recap | Every character is `threshold-triggered`, so the choice of character never turns the weekly recap on or off. Users who had Direct or Clinical (`reactive-only`, no recap) start receiving recaps as Hoot / Beep; the owner accepted this. |

## Non-goals

- Characters that grow or evolve over time (explored on the canvas, not in this scope).
- Luna and Twinkle.
- Streaming replies or changing the LLM provider.
- Any change to what data the coach can see or to its safety rules.

## 1. Mobile structure

### `Character` component
`mobile/src/components/characters/Character.tsx`

```ts
type CharacterId = 'hoot' | 'pip' | 'mochi' | 'nimbus' | 'ember' | 'beep' | 'doze' | 'beat';
type CharacterMood = 'idle' | 'thinking' | 'answering' | 'resting';

interface CharacterProps {
  characterId?: CharacterId; // omitted → the user's current character (from CharacterProvider)
  mood: CharacterMood;
  size: number;              // px, square
  paused?: boolean;          // freeze on the mood's still pose
  dimmed?: boolean;          // 0.45 opacity, matching the old Orb
  mini?: boolean;            // head/face-only variant; default: size <= 40
  glow?: boolean;            // soft accent glow behind the character (existing ui/glow), default false
  theme?: 'dark' | 'light';  // override for surfaces that don't follow the app theme (tab bar pill)
  accessibilityLabel?: string; // set → announced as an image; unset → hidden from screen readers
  testID?: string;
}
```

- Replaces `Orb` and `StillOrb` at every call site. Mapping from old orb usage:
  `state="breathing" paused` → `mood="idle" paused`; `state="working"` → `mood="thinking"`;
  `state="shaping"` (coach unavailable) → `mood="idle" dimmed`.
- Renders a Skia `<Canvas>` sized `size×size` with a 100×100 drawing space (same coordinates as
  the mockups, so path data ports directly).
- `mini` renders the character's **mini** variant (head/face only, as in the mockups' tab-bar
  pill). It defaults to `size <= 40` (the 14/18/20/36/40 px call sites; a full body doesn't read
  that small). The tab bar draws at 64 px and passes `mini` explicitly, as the mockups show.
- `glow` and `theme` carry over from `StillOrb`/`Orb` so call sites keep their current look
  (glow uses the character's accent colour from the registry).
- Reduce Motion (`useReducedMotion()` from Reanimated) → behaves as `paused`.
- Accessibility: hidden from screen readers by default, like `StillOrb` today, because most call
  sites are decorative. With `accessibilityLabel` set it becomes `accessibilityRole="image"`;
  the picker pages and the Profile "Your coach" row pass `"<Name>, your coach"`.

### Character art
`mobile/src/components/characters/art/<Name>.tsx`, one per character.

Each exports a component with the same contract:

```ts
interface CharacterArtProps {
  mood: CharacterMood;
  mini: boolean;
  paused: boolean;
}
```

- Draws with Skia primitives (`Path` with SVG path strings, `Circle`, `Oval`, `Group` with
  transforms, `LinearGradient`/`RadialGradient`, `BlurMask` for glows).
- Animation: Reanimated shared values (`withRepeat`/`withTiming`/`withSequence`, eased), read by
  Skia through `useDerivedValue` — no React re-render per frame.
- Mood changes cross-fade over ~250 ms (per-mood layer opacity driven by a shared value) instead
  of snapping.
- Paused → each moving value is held at its rest value.

Per-character animation, from the approved mockups:

| Character | idle | thinking | answering | resting |
|---|---|---|---|---|
| Hoot | perched on branch, breathing, glances, blinks | 180° head swivel right then left (front → profile → back cross-fades, eased) | wings flap out, happy squint, hop | fluffed up, eyes closed, z's |
| Pip | breathes, blinks, Kirby-style arm waves | scratches head with one arm, eyes look around | both arms up cheering, hop | arms tucked, sleepy |
| Mochi | squishy breathe, blink | squash-and-stretch wobble | bouncy stretch, happy face | under a blanket |
| Nimbus | drifting float | drizzle | sun peeks out | grey, soft |
| Ember | 3-layer flame morph (outer/mid/core on separate rhythms), glow flicker, drifting sparks | fast dance, more sparks | flares taller/brighter, spark bursts | low flame over glowing coals |
| Beep | antenna light glows | visor scan, fast amber light | green light, smiling eyes, bob | low-power, dim light |
| Doze (sheep) | eyelids droop, nods off, snaps awake, ear flick | jumps a fence, "+1" | bounces, bell swings, ears perk | curled up asleep, moon, z's |
| Beat | calm heartbeat | eyes wander | happy flutter (fast beat) | slow soft beat |

Ember's flame outlines morph by interpolating matching path control points in a worklet
(`Skia.Path.MakeFromSVGString` of interpolated numbers, or `usePathInterpolation`).

### Registry
`mobile/src/components/characters/registry.ts` — for each id: name, accent colours, art
component, and a local fallback for the one-liner and greeting (the server's copy wins when
present; see §3). Exports `CHARACTER_IDS` and `DEFAULT_CHARACTER_ID = 'hoot'`.

### `CharacterProvider`
`mobile/src/characters/CharacterProvider.tsx`, mounted above the navigators in `App.tsx`.

- Holds `characterId`, `personaChosen`, the coach status and today's `recoveryBand`.
- **Owns coach status.** Source of truth is `GET /me/coach/status` (`personaId`, `personaChosen`).
  `useCoachStatus()` keeps its current signature but reads from this provider (with `refresh`),
  so its callers don't change and status isn't fetched once per screen.
- **Recovery band.** Fetches `fetchScoresWithBands(1, 'RECOVERY')` once and again when the app
  returns to the foreground, and exposes `scoreBand()` of today's score (or `null`). The
  Dashboard keeps its own fetch unchanged.
- Caches the last known id in SecureStore (`characterId`) so a signed-in cold start shows the
  right character instantly; with nothing cached → Hoot. The cache is **cleared on sign-out**,
  so signed-out screens always show Hoot and the next account never sees the previous one's
  character.
- `chooseCharacter(id)`: optimistic update + cache write → `PUT /me/coach/persona`; on failure
  reverts and surfaces an error (same pattern as today's `coach-settings-section.tsx`).
- An id the app doesn't know → Hoot.

### Performance
- The tab-bar character always animates idle (never paused or dimmed by tab focus).
  If the coach is disabled/unavailable it still idles but at `dimmed` opacity.
- Characters elsewhere pause when their screen isn't focused (`useIsFocused`).
- The picker animates only the visible page.

### Clean-up
- Remove `thinking-orbs`, `components/orb/*`, `components/ui/still-orb.tsx`, `lib/hubOrb.ts`
  (its pause-off-tab rule existed only because the old orb re-rendered at 60 fps), the ThinkingOrb
  jest mock and orb tests once no references remain.
- `OrbGalleryScreen` becomes `CharacterGalleryScreen` (dev only, same env flag renamed to
  `EXPO_PUBLIC_CHARACTER_GALLERY`): all 8 characters × 4 moods, plus mini variants.

## 2. Personalities

All characters share the same data access, facts and safety rules (including
`REQUIRED_DISALLOWED_TOPICS`). Personality changes only how things are said and what is
emphasised first. It never changes numbers, invents data or gives medical advice.

| id | Voice | Focus | Verbosity (`Verbosity` type) | Greeting |
|---|---|---|---|---|
| hoot | Calm, wise, curious; explains the "why", asks one thoughtful question | Patterns and trends across weeks | normal | "I've been watching your numbers overnight. Want to see what stood out?" |
| pip | Upbeat cheerleader, simple words, celebrates small wins | Habits, streaks, one small next step | terse | "Hi! You showed up, and that's already a win. What should we look at?" |
| mochi | Soft, gentle, never pushy; rest without guilt | Stress, recovery, self-kindness | terse | "Hey you. No pressure today. How are you feeling?" |
| nimbus | Breezy; weather and forecast framing | What kind of day to plan given today's readiness | normal | "Today's forecast: mostly clear, good day to push a little. Want the details?" |
| ember | Energetic, motivating, pushes to act | Training load, strain, performance | terse | "Your body's got fuel today. Want to put it to work?" |
| beep | Precise, terse, numbers first, minimal fluff | Raw metrics against the user's usual range | terse | "Data synced. Three metrics moved since yesterday. Want the list?" |
| doze | Slow, cosy, sleepy-calm | Sleep, wind-down, consistent bedtimes | normal | "*yawn* Oh, hi. Shall we talk about how you slept?" |
| beat | Warm, caring, heart-centred | Resting heart rate, HRV, cardio health | normal | "Your heart's been busy. Want to hear how it's doing?" |

Verbosity uses the existing `Verbosity` values (`terse | normal | detailed`); no character is
`detailed`. Every character's `proactivity` is **`threshold-triggered`** (today's default), since
`digest.ts` skips the weekly recap for `reactive-only` personas and a character should not decide
whether someone gets a recap. Each also gets `disallowedTopics` including the required set, and a
one-line tagline for the picker:

| id | Tagline |
|---|---|
| hoot | Calm and curious. Spots the patterns in your weeks. |
| pip | Your tiny cheerleader. Celebrates every small win. |
| mochi | Soft and gentle. Rest is never something to feel bad about. |
| nimbus | Reads your body like a forecast and plans your day around it. |
| ember | All energy. Helps you train smart and push when it counts. |
| beep | Just the numbers, clearly. No fluff. |
| doze | Your sleep expert. Cosy, slow and all about good nights. |
| beat | Listens to your heart, literally. |

## 3. Backend

### Personas v2
- New file `backend/src/coach/personas/v2.ts`. `CoachPersona` is defined in `v1.ts`, and v1 must
  not be edited, so a new `personas/types.ts` extends it instead:
  `export type CoachPersona = V1CoachPersona & { focus?: string; tagline?: string; greeting?: string }`
  (re-exporting `Verbosity`, `Proactivity`, `PersonaSet`, `REQUIRED_DISALLOWED_TOPICS` from v1).
  `index.ts` and `prompt.ts` import from `types.ts`. v2 declares its entries as
  `CharacterPersona = CoachPersona & Required<Pick<CoachPersona, 'focus' | 'tagline' | 'greeting'>>`,
  so every character must provide all three. Prompt code prints the focus line only when present.
  v1 stays untouched and still type-checks, since the new fields are optional.
- `PERSONA_SETS` registers v2; `LIVE_PERSONA_VERSION = 'v2'`; `defaultPersonaId = 'hoot'`.
- `resolvePersona(id)` translates legacy ids before lookup:
  `encouraging → pip`, `direct → hoot`, `clinical → beep`; `null`/unknown → hoot.
- `findPersona` (used by the PUT route) accepts legacy ids through the same translation.

### Prompt
- `buildSystemPrompt` adds a `Coaching focus: …` line next to tone, passed through
  `escapeField()` like every other persona field. `buildDigestSystemPrompt` includes it too.

### Routes (`backend/src/coach/routes.ts`)
- `GET /me/coach/status` adds `personaChosen: boolean` (`coachPersonaId !== null`) and, per
  persona, `tagline` and `greeting`.
- `PUT /me/coach/persona` drops `requireEnabled`, so a character can be chosen while the coach is
  switched off (it's also the app's look). Auth is still required. Stores the canonical (new) id.

### Migration
Prisma migration `…_companion_characters`: data-only SQL.
```sql
UPDATE "User" SET "coachPersonaId" = 'pip'  WHERE "coachPersonaId" = 'encouraging';
UPDATE "User" SET "coachPersonaId" = 'hoot' WHERE "coachPersonaId" = 'direct';
UPDATE "User" SET "coachPersonaId" = 'beep' WHERE "coachPersonaId" = 'clinical';
```
`NULL` stays `NULL` (resolves to Hoot, and `personaChosen` stays false so these users see the
picker once). Names verified against `schema.prisma`: `model User` has no `@@map`, so the table
is `"User"`; the column is `coachPersonaId`.

`CoachDigest.personaId` (and telemetry `personaId`) keep their legacy values on purpose: they
record which persona wrote a past recap, nothing reads them for behaviour, and any lookup goes
through `resolvePersona`, which translates legacy ids anyway.

## 4. Moods

Pure function `mobile/src/characters/characterMood.ts`:

```ts
characterMood({ sending, answeredAt, now, recoveryBand }): CharacterMood
```

| Condition (first match wins) | Mood |
|---|---|
| a message is sending | thinking |
| a reply arrived < 2.5 s ago | answering |
| today's recovery band is `poor` | resting |
| otherwise | idle |

- Used on the Coach screen, the Home coach tile and the digest card.
- The tab bar ignores it and always shows idle.
- Signed-out screens show Hoot, idle.
- Recovery band is `recoveryBand` from `CharacterProvider` (§1), i.e. `scoreBand()` over today's
  recovery score. The Dashboard keeps its scores in local state, so there is nothing to share
  from it; the provider does its own one-day fetch.

## 5. "Meet your coach"

`mobile/src/screens/MeetYourCoachScreen.tsx`, a stack screen.

- Horizontal pager of the 8 characters, Hoot first; page indicator dots.
- Each page: large animated character (only the visible page animates), name, tagline, greeting in
  a speech bubble, and a primary button "Choose <Name>".
- Opens automatically on first visit to the Coach tab when the coach is **enabled** and
  `personaChosen` is false. It comes **before** consent: choosing a character needs no consent,
  so the picker shows first and the Coach screen's existing consent redirect happens afterwards
  as today. When the coach is disabled it never auto-opens (the Profile row still works).
  A "Skip" link chooses Hoot, so it never reappears (server-side flag, survives reinstall). If
  that save fails, the picker closes anyway and shows again on the next Coach-tab visit.
- Profile: the "Coach style" section is replaced by a "Your coach" row (small animated character +
  name) that opens this screen in switch mode (starts on the current character; no Skip link).

## 6. Errors

| Case | Behaviour |
|---|---|
| Save fails | Optimistic choice reverts; short error message |
| Unknown id from server or cache | Hoot |
| Coach disabled | Character still shown everywhere (tab bar dimmed idle); choosing still works |
| Status fetch fails | Use cached id (or Hoot); picker not auto-shown |

## 7. Testing

**Backend (jest + test Postgres)**
- v2 personas: each has tone, focus, tagline, greeting, required disallowed topics; fields survive
  `escapeField` checks.
- `buildSystemPrompt` / digest prompt include the focus line.
- `resolvePersona` / `findPersona`: legacy ids, null, unknown.
- Routes: status returns `personaChosen`, tagline, greeting; PUT accepts new and legacy ids, works
  with the coach disabled, stores the canonical id.
- Digest: a user on any v2 character gets a weekly recap (none is `reactive-only`).
- Existing tests that use the legacy ids or expect `encouraging` as the default (7 backend and
  9 mobile files) are updated in phases 1 and 4.
- Migration: seed legacy rows, run it, assert mapping.

**Mobile (jest-expo + RNTL)**
- `characterMood`: every row of the table and precedence.
- Registry ids equal the backend v2 ids (shared fixture list).
- Skia mocked like the orb today: the mock `Character` renders a view with
  `accessibilityLabel="character:<id>:<mood>:<size>:<paused>"`, so screens can assert which
  character and mood show.
- `CharacterProvider`: cache read, Hoot fallback, optimistic revert, cache cleared on sign-out,
  recovery band, `useCoachStatus()` reading from the provider.
- `Character`: `mini` default by size, hidden from screen readers unless labelled.
- `MeetYourCoachScreen`: paging, choose, skip = Hoot, switch mode.
- Settings "Your coach" row; tab bar always idle; updated call-site tests; orb tests removed with
  the orb.

**Manual/visual**
- Dev character gallery on the simulator; screenshot each character's moods; check 60 fps in the
  perf monitor on the gallery and the Coach screen; short demo clip.

## 8. Delivery

PR #40 carries the docs only and is merged once the owner signs off the written spec. The code
goes in **one new draft PR**, one commit per phase, each with tests green. Base it on whatever
holds the redesign at that point: `main` once the two redesign follow-up commits (README/demo,
app icon) are merged, otherwise `worktree-redesign-tokens-home`. Phases:

1. Backend: personas v2, focus in prompts, legacy id translation, status fields, PUT without
   `requireEnabled`, migration.
2. Character engine (`Character`, art contract, mood cross-fade, mini variant, reduce motion) +
   **Hoot** + dev gallery — proves smoothness early.
3. The other seven characters.
4. `CharacterProvider`, orb replaced everywhere, tab bar always idle, mood wiring.
5. "Meet your coach" + Profile "Your coach" row.
6. Remove `thinking-orbs` and orb code; README and demo media updated.
