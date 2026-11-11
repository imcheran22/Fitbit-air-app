# Handoff: one-page Sleep (built), Home redesign (mockups), KIP mascot (2026-10-10)

This is for the next agent. Read it all before acting. The project-wide rules, commands and environment are in
`docs/superpowers/handoff/2026-10-09-recovery-and-sleep-handoff.md`, sections 1, 2, 5 and 6. They still apply.

## Where things stand

| Work | State | Where |
|---|---|---|
| Recovery page | **Merged** (PR #59, `a4db948`) | main |
| One-page Sleep | **Built and fully reviewed; PR NOT opened (held)** | branch `feature/sleep-page`, pushed, head `33ce555` |
| KIP mascot | **Design final; name confirmed "KIP"** | canvas https://claude.ai/artifact/LY3oVnk2j3UipUuvX6BfdC |
| Home redesign | **Brainstorming: mockups are up; the owner has not picked a direction yet** | canvas https://claude.ai/artifact/JtcyzBVmuyYgR6u3W7mVnb |

Worktree: `/Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/social-tab`, on branch `feature/sleep-page`.

## 1. One-page Sleep (`feature/sleep-page`)

- **Plan and spec:**
  - `docs/superpowers/plans/2026-10-09-one-sleep-page.md`
  - `docs/superpowers/specs/2026-10-09-one-sleep-page-design.md`
- **Ledger, with every ruling and review:** `.superpowers/sdd/2026-10-09-one-sleep-page/progress.md` (git-ignored).
- **Verified:**
  - backend 3028/3028 tests, mobile 3025/3025;
  - backend tsc clean; mobile tsc at the 12-error baseline;
  - every task review and the final whole-branch review are clean after one fix wave.
- **Synced** into `~/dev/biometrics-run`. The backend and Metro run there via nohup, logging to `backend.log` and `metro.log`.
- **Why the PR is held:** the Recaps shelf was going on the current Home. The owner then asked to remake Home, so the
  shelf's place comes from the Home redesign. Either merge Sleep now with the shelf where it is (the owner decides), or
  wait for the Home spec.
- **PR body must include:**
  - the `usualMinutesAsleep` change: the night's "usual" now uses main sleep only, so it changes for people who nap
    (spec §13, plan P19);
  - parked follow-ups: (1) a tap that crosses into another month on an old week briefly blanks the chart and month
    sections (fix: serve `lastWindow` in `useSleepPage` when its range covers the new anchor's span); (2) the hero
    skeleton flashes on refocus while the goal fetch is in error.
- **Open owner decision:** the Sleep page bands on the rounded score, while Recovery bands on the 1-dp score. A .5 edge
  differs between the two pages. This should be made uniform app-wide.
- **No attribution** in commits or PRs (owner rule). Merge only when the owner says "merge".

## 2. KIP (the owner's own mascot)

- **Final design** (board "Final · base + skins" on the KIP canvas):
  - the STUBS block with GROUNDED lighting (a shade side plus a ground shadow; the ramp comes from one body colour);
  - pose-only arms (they appear only in poses);
  - the round 7 B outfits, idle loop and moods;
  - 22 animal skins (for later).
- **Drawing engine:** `.superpowers/character-canvas/scratch/kip-engine.js` (16×16 grid, rect logic).
- **Version 1 scope (owner):** the default KIP only, no skins. The default colour is **coral #FB7185**. Users can change
  colour to one of these 10: coral #FB7185, cobalt #3B82F6, ink #2A2F3A, lemon #FDE047, lilac #C4B5FD, lime #A3E635,
  mint #6EE7B7, sky #7DD3FC, slate #64748B, snow #F1F5F9.
- **Not built yet.** Build it before the Home remake, as its own spec, plan and build:
  - a sprite engine in the app, using the same rect-list approach as `mobile/src/components/characters`;
  - the per-user colour stored on the account;
  - a Profile colour picker;
  - buddies see your colour.

## 3. Home redesign (brainstorming, architectural path)

- **The owner's intent:** match the Recovery and Sleep look, built around KIP: the user's KIP as hero, with buddies'
  KIPs in a small shared scene.
- **Assumptions the owner did not object to:**
  - KIP's mood follows recovery and sleep;
  - the colour picker lives in Profile;
  - the Campfire stays the big social scene;
  - everything on Home today stays reachable.
- **Canvas boards:** Before, A1–A3 (scene on top), B1–B3 (KIP header card), C1–C3 (full-screen scene), a KIP states
  strip, and the Profile colour picker. The designer recommends **A1**. The canvas source is in
  `.superpowers/home-canvas/project/`.
- **Mood mapping assumed in the mockups:**
  - recovery 80+: cheer;
  - 50–79: wave;
  - under 50: determined;
  - a night under 6h: sleepy with coffee (this overrides the recovery state);
  - the first 7 days: curious.
- **DECIDED (owner approved on 2026-10-10): direction F.**
  - **Layout:** A1's top-third scene with a tappable cottage: the bed opens Sleep, the wall calendar Tomorrow, the
    sky and sun Recovery, and the mailbox Recaps. Small tap tags. The user's KIP plus up to 2 buddy KIPs, with an
    "ALL 4" link. A1's compact Today tiles below, then the rest of Home.
  - **The scene reacts to the Recovery weather,** using the Recovery page bands. The canvas row "F · weather states"
    has:
    - F1 · Clear skies: bright, a big sun, a meadow of flowers, birds, a butterfly, KIP cheering;
    - F2 · Mostly clear: brightened at the owner's request, but below F1;
    - F3 · Cloudy, with flowers still in bud;
    - F4 · Stormy, with no flowers;
    - F5 · Short-night override: sleepy KIP with coffee;
    - F6 · Night, after 9 pm, with the window lit.
  - **The scene is built as 7 layers,** each state a swap; see the note on the canvas.
- **Next steps:**
  1. Write the specs (KIP system first, then Home F), with owner approval of each.
  4. Plan, then build. The owner has chosen subagent-driven builds with an opus reviewer each time.

## Process the owner expects

- Mockup first for any UI change (canvas artifacts), then spec, plan and build.
- shadcn buttons, no pills; the A4 type system; privacy rules.
- Previous handoff: `docs/superpowers/handoff/2026-10-09-recovery-and-sleep-handoff.md`.
