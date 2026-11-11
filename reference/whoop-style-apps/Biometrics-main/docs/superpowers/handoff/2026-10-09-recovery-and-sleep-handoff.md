# Handoff: Biometrics, the Recovery page and the one-page Sleep (2026-10-09)

This file is for the next agent picking up this work. Read all of it before acting.

---

## 1. Repo and environment

| | |
|---|---|
| Repo | `github.com/tusharcora/Biometrics` (`gh` CLI is authenticated) |
| Main checkout | `/Users/tushar/Documents/PROJECTS/Biometrics` |
| Worktree used so far | `/Users/tushar/Documents/PROJECTS/Biometrics/.claude/worktrees/social-tab` |
| Working branch | `feature/recovery-page`, pushed, off main `736cc88`. It contains only docs so far (spec and this handoff) |
| App | Expo 57 React Native + NativeWind (`mobile/`). Express 5 + Prisma/Postgres + BullMQ/Redis (`backend/`) |
| Node | `/Users/tushar/.nvm/versions/node/v24.21.0/bin`. Put it first on PATH for node, npx and npm |
| Run folder | `~/dev/biometrics-run` holds the iOS build, a dev backend on :3000 and Metro on :8081. The repo lives in iCloud Documents, which breaks Xcode builds, so builds happen here. Sync JS into it rather than building from the repo |
| Simulator | Booted "iPhone 18 Pro". Bundle id `com.tusharcora.biometrics`. Relaunch with `xcrun simctl terminate booted com.tusharcora.biometrics; xcrun simctl launch booted com.tusharcora.biometrics` |
| Phone access | ngrok tunnel to the dev backend (see `~/dev/biometrics-run/mobile/.env`) |
| Demo accounts | `demo@example.com` / `buddy@example.com`, seeded with `backend/scripts/seedBuddies.ts`, then `seedSocial.ts`. The owner's real account is `tusharcs0112@gmail.com` (Google sign-in) |

### Commands

- **Mobile tests**, from `mobile/`:
  `PATH=/Users/tushar/.nvm/versions/node/v24.21.0/bin:$PATH node node_modules/.bin/jest --forceExit <paths>`
- **Mobile typecheck**, from `mobile/`:
  `PATH=…:$PATH node node_modules/.bin/tsc --noEmit --types jest,node --pretty false`
  - The baseline is exactly 12 errors: `__tests__/api/client.test.tsx`(2), `ActivityHeatmap.test.tsx`(2), `FactorBar.test.tsx`(1), `ScoreRing.test.tsx`(1), `MetricDetailScreen.test.tsx`(5) and `App.tsx`(1).
  - No change may add an error.
- **Backend tests** must only run through a helper that points at the test DB and Redis db 1. One exists, git-ignored, at `.superpowers/sdd/2026-10-08-social-s3-chats/backend-jest.sh` in the worktree; copy it into your plan's workspace.
  - Never point tests at the dev `biometrics` DB.
  - Never run two backend test runs at once.
  - Backend typecheck: `node node_modules/.bin/tsc --noEmit`, which must be clean.
- **Known flakes:** under full-suite load, a suite can fail or a jest worker can SIGSEGV. Rerun it alone before treating it as real.
- **Syncing mobile code to the run folder:**
  1. `git archive <branch> mobile | tar -x -C <tmp>`
  2. `rsync -a --delete --exclude node_modules --exclude ios --exclude .expo --exclude .env <tmp>/mobile/ ~/dev/biometrics-run/mobile/`
  3. Restart Metro: kill :8081, then from `~/dev/biometrics-run/mobile` run `npx expo start --dev-client --clear` detached.
  4. Relaunch the app.
- **Backend changes in the run folder:**
  1. Back up the dev DB first: `pg_dump -Fc` to `~/dev/biometrics-run/backups/<name>.dump`. Only do this if `DATABASE_URL` is local.
  2. `prisma migrate deploy`.
  3. Rsync `backend/` (excluding node_modules, dist, .env and service-account-key.json).
  4. `npm install`, `prisma generate` and `npm run build`.
  5. Restart `node --env-file=.env dist/server.js` on :3000.
- **Sandbox quirk:** compound or variable-laden git commands, and `git -C` into other worktrees, may be refused. Use plain single commands, or write a small script file and run it with `bash`.

---

## 2. Owner rules (hard, from memory and the owner)

1. **No attribution.** No `Co-Authored-By` trailers and no "Generated with Claude Code" footer in commits or PRs. This applies to subagents too.
2. **Subagents:** use model **opus** for every subagent.
3. **Mockup first.** For any UI change, show a canvas artifact mockup and iterate with the owner before building. The owner likes pixel-art scenes.
4. **Buttons:** every button is the shadcn Base Button port at `mobile/src/components/ui/button.tsx`.
   - Neutral primary, `rounded-lg` (8px).
   - Variants: default, outline, secondary, ghost, destructive, link.
   - Sizes: xs/sm/default/lg = 24/32/36/40, plus icon sizes.
   - **No pill shapes anywhere.** Chips, segmented controls and option pickers are rounded-lg too; selected uses the default look, unselected the outline look.
   - Enforced by `mobile/__tests__/conventions/buttons.test.ts`.
5. **Type system A4** (merged in PR #58):
   - **Geist** for everything you read. Tokens: `text-score` 72, `text-number` 40, `text-display` 28, `text-heading` 22, `text-headline` 17, `text-body` 15, `text-caption` 13, and `text-fine` 11 (axes, legends, xs buttons, tab bar, small grid cells only).
   - **Silkscreen pixel** for page titles (`PageTitle`, 20, drawn uppercase) and labels and tags (`SectionLabel` / `text-label`, 11).
   - Pushed native headers draw through `HeaderTitle` (`mobile/src/navigation/headerStyle.tsx`). Screen readers get the original case.
   - Numbers are tabular: `text-score` and `text-number` automatically, otherwise via `tabular-nums`.
   - Every `TextInput` spreads `inputTextStyle` / `inputNumberStyle` (`mobile/src/components/ui/input-style.ts`).
   - Enforced by `mobile/__tests__/conventions/typography.test.ts`. It bans arbitrary sizes, stock sizes, inline font styles and inputs without the shared style. It has 15 permanent exemptions, each with a reason.
   - Spec: `docs/superpowers/specs/2026-10-08-type-system-design.md`.
6. **Campfire scene text must never change.** `mobile/src/components/social/CampScene.tsx` and `CampBanner.tsx` are frozen.
7. **Privacy:**
   - Never log health values, names, handles, emails, mood, tokens, or message or note text. Log ids, event names and error classes only.
   - Buddy data never goes to the AI coach.
8. **Git:**
   - Never push to main or force-push.
   - Merge a PR only when the owner explicitly says "merge".
   - Open draft PRs; the owner reviews and merges.
   - Never use bare `git stash`.
9. **Walkthrough:** before handing over UI, sync the build to the simulator and phone so the owner can check it.

---

## 3. What is done (all merged to main)

| PR | What |
|---|---|
| #48 | A · Sleep depth: Sleep screen, night detail with stage lanes, cycles, moments, bedtime goal and wind-down reminder |
| #50 | B · Recap and sharing (recap stories, year in pixels) |
| #51 | Achievements and badges |
| #52 | Buddies: pairing, sharing, stickers, buddy pushes |
| #53 | Social S1: tab, stories, check-ins, timeline, highlights |
| #54 | Social S2: Campfire (full-screen pixel scene and pull-up panel) |
| #55 | shadcn Button standard |
| #56 | Social S3: Chats (1:1 conversations, reactions, unsend, seen, notes, requests, reports, `dm_message` push) |
| #57 | No pill-shaped buttons; guard added |
| #58 | Type system A4 (Geist + pixel page titles, one scale, guard). Merged without a device walkthrough, so do a quick visual check |

How these were built: the superpowers flow. Each had a spec, a plan, subagent-driven tasks with a review per task, a final whole-branch review, one fix wave and an owner walkthrough. The plans are in `docs/superpowers/plans/` and the specs in `docs/superpowers/specs/`.

---

## 4. What we are planning (next work, in order)

### 4A. Recovery page (approved direction; spec awaiting owner review)

- **Spec:** `docs/superpowers/specs/2026-10-09-recovery-page-design.md` on `feature/recovery-page`. Commits 1836c7c, fdac6a3 and f2702d4.
- **Status:** the spec is written and updated with the owner's decisions. The owner has not yet said "approved" to the written spec. Ask for spec approval, then write the plan.
- **Page, top to bottom** (canvas board "Recovery page · D + C calendar + bento"):
  1. Header: back button, then pixel `RECOVERY`, then info button.
  2. Hero: pixel weather icon by band, score (`text-score`), verdict, and the line "Good · +6 vs yesterday · High confidence".
  3. One-line summary.
  4. "Last 7 days" strip: weather icon and score per day, today highlighted.
  5. "Sleep and streak" bento:
     - a wide sleep-debt tile in 30-minute blocks;
     - a Last night tile;
     - a Clear streak tile (consecutive days Good or better, plus best run).
  6. Month calendar: band-coloured cells with the score, today ringed, previous/next month, month average. Tapping a day opens that day's Recovery.
  7. Tomorrow's forecast, shown on today only: a range, "right N of last 12", and 6/7/8/9h chips each with a predicted score. "More levers" opens the existing Forecast screen.
  8. Ask Axo bar.
- **Owner decisions** (spec §11):
  - **Removed:** the "What moved it" card.
  - **Strip label:** "Last 7 days".
  - **Fair band:** a plain grey "Cloudy" icon, no rain. Band words are Clear skies / Mostly clear / Cloudy / Stormy, and the band labels Excellent / Good / Fair / Low.
  - **Sleep-debt copy:** "Two nights at your 8h goal clear the fog". Debt is a 14-night rolling floored shortfall; long nights don't repay it.
  - **Past days:** the Tomorrow card is hidden.
  - **Battery widget:** skipped for now. Home keeps its current hero.
- **Data:**
  - A new bundle endpoint, `GET /me/recovery/:date`, accepting `today`, returns 200 `NO_DATA` instead of 404, plus `GET /me/recovery/calendar/:month`.
  - Export `flooredSpread` from `backend/src/scoring/baseline.ts`.
  - After decision 6, trim the per-factor DTO to what the summary and sleep-debt tile use.
- **Navigation:**
  - New route `Recovery { date? }` replaces ScoreDetail for RECOVERY: Home hero, Activity Recovery tile, coach cards.
  - ScoreDetail for RECOVERY redirects there.
  - The Last night tile goes through a single helper, `openNight()` in `navigation/sleepNavigation.ts`, so the Sleep work can repoint it.
- **Score engine facts:**
  - Inputs are HRV, RHR and SLEEP_DEBT only.
  - Bands: Excellent ≥75, Good ≥55, Fair ≥40, Low <40.
  - Baselines: EWMA over 30 days with a MAD spread; cold start lasts 14 days.
  - Code is in `backend/src/scoring/`. Endpoints are `GET /me/scores?days=` (max 120) and `/me/scores/:date`. The forecast is `GET /me/forecast`.

### 4B. One Sleep page (mockup draft 2 awaiting owner approval; no spec yet)

- **Canvas:** https://claude.ai/artifact/XZsyFUXr7QTZK7h8SR37Tq (board "Sleep · one page (draft 2)").
- **Goal:** merge all the sleep screens into one page. That covers SleepScreen, SleepNightScreen, ScoreDetail(SLEEP), the Activity night sheet and MetricDetail(SLEEP).
- **Page, top to bottom:**
  1. Header: back, then pixel `SLEEP`, then a bedtime-goal button.
  2. Hero: pixel moon, sleep score and verdict.
  3. A 7-night picker; tapping a night swaps the night content below.
  4. Night summary: duration, bed → wake, the difference from usual and from goal.
  5. **Sleep stages card** in the owner's screenshot style (the existing `StageLanes`): a left column of stage name and minutes, glowing lanes on tinted tracks, wake markers, links between stages, cycle markers and a time axis.
  6. **N sleep cycles card**: per cycle, the length, start time, stacked stage bar, "Deep · REM · Light" minutes, and a closing "Then N min … before you woke".
  7. Moments: stage-mix ring and rows.
  8. "The night": time in bed, awake, time to fall asleep, time after waking, naps.
  9. Bedtime-to-wake chart (Week / 2 weeks; tapping a bar selects that night).
  10. Regularity: the 7-night score and spreads.
  11. Month heatmap and stats.
  12. Bedtime goal row.
  13. Ask Axo.
- **Owner decisions:**
  - Night details are inline, with no "details" button.
  - **The "What moved it" card is removed.**
  - **The Recaps shelf moves to Home.** Today it is the only entry to Recaps and lives on SleepScreen.
- **Inventory of today's sleep surfaces:**

  | Surface | File | What it shows |
  |---|---|---|
  | `Sleep` | `screens/SleepScreen.tsx` | RecapShelf, score header, Week/2 weeks WindowChart, RegularityCard, Last night StageStrip, bedtime goal row |
  | `SleepNight {date}` | `screens/SleepNightScreen.tsx` | headline, StageLanes, SleepCyclesCard, MomentsCard, numbers, naps, Ask coach |
  | `ScoreDetail {type:'SLEEP'}` | | ring, factors, baselines |
  | Activity heatmap Sleep page and `NightDetail` sheet | `components/activity-heatmap.tsx`, `activity-sheets.tsx` | heatmap and the night sheet |
  | Home SleepTile | `components/home/sleep-tile.tsx` | sleep tile |
  | `MetricDetail {metricType:'SLEEP'}` | | metric detail |
  | `BedtimeGoal` | `screens/BedtimeGoalScreen.tsx` | goal and wind-down. The wind-down setting is device-only, in SecureStore key `windDown` |

  - **Endpoints:**
    - `/me/sleep?from&to`
    - `/me/sleep/night/:date`
    - `/me/sleep/regularity?days=7|30`
    - `/me/sleep/goal`
    - `/me/scores?type=SLEEP`
  - **Duplications to remove:**
    - The sleep score appears in 5 places.
    - Night duration appears in 4 places. The `/me/sleep` minutes include naps, but SleepNight shows main sleep only; settle on main sleep plus "with naps".
    - There are 3 different "usual" baselines.
  - **Navigation plan:** `Sleep: { date?: string } | undefined`.
    - Drop `SleepNight`, or keep it as an alias that redirects.
    - Repoint Activity's "Sleep details" and "Open full night", the coach `coachAnswers.ts:75`, the UsualTiles and Dashboard SLEEP metric tiles, and the notification handler.
- **Next steps:**
  1. Get owner approval of draft 2.
  2. Write the spec.
  3. Plan and build. This can run after Recovery or together with it.

### 4C. Roadmap after these

- **D:** Invites and outfits (needs buddies, which are done).
- **E:** Group challenges.
- **F:** Apple Health (needs a native HealthKit module and real Apple signing).
- **Later:** widgets, the morning briefing (default 09:00, user-set), coach growth.
- **Deferred:** the pixel battery widget for Home. It is designed; see §5.

---

## 5. Artifacts (canvases)

| Canvas | URL | Source (git-ignored, in the worktree) | Notes |
|---|---|---|---|
| Recovery page drafts | https://claude.ai/artifact/9v7waTGZ6abQfJQak2injD | `.superpowers/recovery-canvas/project/` | 12 explored directions (A–L). Row 2 holds the chosen design: `Combined.dc.html` (the page), `HomeBattery.dc.html` and `BatteryStates.dc.html` (deferred pixel battery: stepped band-coloured outline, navy well, slim cells with a light top, from the owner's reference sheet) |
| One Sleep page | https://claude.ai/artifact/XZsyFUXr7QTZK7h8SR37Tq | `.superpowers/sleep-canvas/project/` | Draft 2, a single board |
| Type system options | https://claude.ai/artifact/7ou763Rzm6Tbb9m8Pmrz8j | `.superpowers/type-canvas/project/` | The A4 pick, now built and merged |
| Chats mockups (S3) | https://claude.ai/artifact/EvQZFuH1NJmDs8tdkwpZNz | `.superpowers/chats-canvas/project/` | Built |
| Buttons standard | https://claude.ai/artifact/HigBcuphsKvfgXzmDSg18M | `.superpowers/buttons-canvas/project/` | Built |
| Growth roadmap picks | https://claude.ai/artifact/JHqksi4S4DpFXNiFJho97e (picker: https://claude.ai/artifact/3sPCoqZWwFCjF6muR9rCs1) | | Source of sub-projects A–F |

Canvases are Design-type artifacts. To edit one:
1. Read its `project/canvas.json`.
2. Edit the `.dc.html` files.
3. Publish with the Artifact tool, using `url` plus `root` (the canvas source folder).

The format rules come with the artifact type's instructions.

---

## 6. How to run the work (process)

1. **Brainstorm or mockup → spec → owner approves → plan → owner approves → subagent-driven build.**
   - Skills: `superpowers:brainstorming`, `superpowers:writing-plans` and `superpowers:subagent-driven-development`.
   - The skill scripts are in `~/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/subagent-driven-development/scripts/`. `sdd-workspace PLAN` creates the workspace, `task-brief PLAN N` extracts a task brief, and `review-package PLAN BASE HEAD` builds a review diff.
2. **Workspace and ledger:** each plan gets `.superpowers/sdd/<plan-name>/`, which is git-ignored. It holds:
   - `progress.md`, the ledger: first line `# SDD ledger — plan: <path>`, with rulings written as `Ruling: … — why — cost`;
   - `common-context.md`, `implementer-instructions.md` and `reviewer-instructions.md`;
   - briefs, reports and review diffs.

   The type-system workspace (`.superpowers/sdd/2026-10-08-type-system/`) is a complete recent example to copy from.
3. **Per task:**
   1. Implementer (opus).
   2. Reviewer (opus), given the brief, report and package.
   3. Fix rounds by resuming the same implementer.
   4. Scoped re-review.
   5. Record `Task N: complete` in the ledger.
4. **Before Task 1:** do a pre-flight conflict scan of the plan, then a final whole-branch review and one fix wave.
5. **Finish:**
   1. Sync to the run folder and walkthrough (backup and migrate first if the backend changed).
   2. Open a draft PR with no attribution.
   3. Merge only on the owner's "merge".
6. **Memory files** are at `~/.claude/projects/-Users-tushar-Documents-PROJECTS/memory/`. The relevant ones are:
   - `biometrics-recovery-page-drafts.md`
   - `biometrics-type-system.md`
   - `biometrics-shadcn-buttons.md`
   - `biometrics-growth-roadmap.md`
   - `feedback-mockup-before-ui-build.md`
   - `feedback_no_claude_attribution.md`

---

## 7. References

- **Specs:**
  - `docs/superpowers/specs/2026-10-09-recovery-page-design.md`: Recovery, current work.
  - `2026-10-03-sleep-depth-design.md`: the original Sleep screens.
  - `2026-09-20-stat-engine-design.md`: the score engine.
  - `2026-09-28-recovery-forecast-design.md`: forecast and what-if.
  - `2026-10-08-type-system-design.md`.
  - `2026-10-07-social-tab-design.md`.
- **Key mobile files:**
  - `screens/ScoreDetailScreen.tsx`, `components/home/recovery-hero.tsx`, `screens/DashboardScreen.tsx`
  - `api/scores.ts`, `api/sleep.ts`, `lib/scoreInsights.ts`
  - `components/sleep/*`: WindowChart, RegularityCard, StageStrip/StageLegend, StageLanes, SleepCyclesCard, MomentsCard, Section
  - `navigation/RootNavigator.tsx`, `components/ui/{text,page-title,section-label,button,input-style}.tsx`, `theme.ts`
- **Sleep colours** (`theme.ts`):
  - `metricSleep` #9333EA.
  - Stages, dark mode: Deep 99,102,241; REM 232,121,249; Light 165,180,252; Awake 251,146,60.
  - `sleepHeat1-4` ramp.
  - Score bands: `scoreExcellent`, `scoreGood`, `scoreFair`, `scorePoor`.
- **Coach character for recovery:** "Axo" (pink axolotl, accent #F472B6, ground #27101E) in `mobile/src/characters/registry.ts`.
- **Key backend files:**
  - `backend/src/scoring/{composite,baseline,features,routes,dto}.ts`, `configs/v3.ts` (the live version)
  - `backend/src/biometrics/routes.ts` (sleep endpoints) and `forecast/`.

---

## 8. Open items and known issues

- The owner has not yet given written-spec approval for Recovery, or approved Sleep mockup draft 2. Ask for both first.
- PR #58 (type system) merged without a device walkthrough. Do a quick check on the simulator: pixel titles and headers at large text sizes, Chats notes row, Coach Today bars, Campfire unchanged.
- **Parked ideas:**
  - The Activity loading state title order (the title changes word when data loads).
  - The RecapScreen month-badge captions wrap. This is accepted.
