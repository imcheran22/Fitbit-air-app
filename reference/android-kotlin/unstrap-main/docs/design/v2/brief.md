# Design v2: brief

Status: agreed 2026-10-23. Branch `design-v2`. Approved steps: pattern board, critique, mockups, then the design system (2026-10-24). The build follows [spec.md](spec.md), and the step documents it replaced are in git history. Follows [information-architecture.md](../information-architecture.md),
which set the five tabs and the glow design language (v1).

## Goal

Keep the look and feel. Rework where things are, how you find them, how they change through the day, and how the app
talks. OpenStrap is not a Zepp copy: it should be the best interface for the Helio Strap, and later for other straps.

Every screen, card, string, navigation path and animation gets questioned. Anything that stays has to earn its place.

## Fixed

- **Visual identity:** black theme with colourful, intense elements (glow). Evolve it, don't replace it.
- **Non-goals:** no new features, no algorithm changes, no strap protocol changes. Existing deep links keep working
  (the auto-detect notification opens its workout).
- **Design language:** neither Material nor iOS. Both are fair references.
- **References:** inspiration from strong products in any category, not only health. Mobbin is used for research
  only: no Mobbin screenshots in the repo or the app. Cite by link.

## The adaptive day

The app follows the user's day. Cards reorder and change tone by moment:

| Moment | What leads | Tone |
|---|---|---|
| Waking up | Last night and Recovery | Sentence first |
| Midday | Energy (energy left) | Sentence first |
| Usual workout time (learned from when they train, or feel like it) | Readiness for effort, start workout | Prompting, short |
| During a workout | Live numbers | Number first, no prose |
| After a workout | The effort and recovery, then calm down | Toned down |
| Evening and night | The day's total, then wind down | Quiet, dim |

## Voice

1. **Three depths.** Meaning now (one human sentence), then the number, then how it's worked out (one tap away). No
   formula, method name or caveat on a card, only on its detail page.
2. **Own the names.** Energy, Readiness, Load and Habit Age stay as names. Acronyms become words: SRI is "Sleep
   regularity", PAI gets a plain name, EPOC only on detail pages. HRV and VO2 max stay, with a one-line meaning on
   first sight.
3. **Tone:** a calm, sharp friend who knows physiology. Short, direct, specific. No cheering, no emoji, no exclamation
   marks, no invented empathy, no "you should". Say what happened and what it means. The user decides.
4. **Sentence or number first by moment:** sentence in the morning and evening, number during workouts and live
   readings.
5. **Caveats once:** one small marker per screen ("partial day", "early estimate") that explains itself on tap. The
   lowest rating is not alarming ("Below your normal", "Take it easy"), never "Pay attention".
6. **Time-aware words:** "so far today", "this morning", "since your run", "tonight".
7. **Punctuation:** no interpunct (·), no semicolon (;) and no em dash (—) in any user-facing text. Use a full
   stop, a comma, a new line, or layout (separate text elements) instead. En dashes in ranges like 22:10–06:40 are
   fine.

Example: "Energy is a running battery: sleep and calm rest fill it, movement, stress and simply being awake drain
it." becomes "**62, steady for midday.** Your run took 18. You'll have plenty left this evening." with the
explanation behind a tap.

## Motion: motion is signal

Something moves only when it tells you something:

- **Where it came from:** a card opens into its detail and shrinks back, so you never lose your place.
- **What changed:** a value animates to its new number after a sync, not from zero on every open.
- **That it's alive:** live heart rate pulses at the actual beat. Nothing else idles or loops.
- **Feel:** springs with no bounce. Fast in (about 200 ms), slower settle. Workout mode is snappiest, evening softest.

Haptics follow the same rule:

- a tick when a value crosses into a new zone or a set completes.
- a firm pulse on start and end of a workout.
- nothing for ordinary taps.

No other accessibility work is in scope for v2.

## States

Design every one: first run with no data, no strap paired, strap disconnected, strap charging, syncing, sync failed,
workout in progress, no sleep recorded last night, partial day (little wear), errors.

## How we judge it

- The morning question ("how am I?") is answered in under 3 seconds.
- Every screen's purpose fits in one sentence.
- No acronym without an explanation one tap away.
- Before and after screenshots from a real phone over adb.

## Steps and approvals

1. Inventory of every current screen, card, string, path, animation and state.
2. Pattern board from Mobbin, by problem, not by app. **Approval.**
3. Critique of each current screen against the patterns.
4. Mockups. **Approval.**
5. Spec.
6. Compose implementation, screen by screen.
