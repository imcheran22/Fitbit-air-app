# Apex route map: 7 stages, no Fable

You choose the model for each stage yourself (`/model`). Each stage ends with `/handoff`, so you can switch model, `/clear`, and
start the next stage with `/stage N`. All state lives in `docs/PROGRESS.md`, never in the conversation.

| Stage | What gets built | Milestone | Main session | Agents (model) | Relative cost |
|---|---|---|---|---|---|
| **1** Lock the base | Green build, v1→v2 migration test, audit/decision/evidence docs | M0 | **Sonnet**, effort low (Haiku if the build is already green) | build-runner (Haiku), integration-coder (Sonnet) | $ |
| **2** Look and first APK | `:core:ui` kit, charts, shells, `:app` shell, Overview on Demo data | M2, M1 | **Sonnet** medium | screen-builder ×2 (Sonnet), integration-coder (Sonnet) | $$ |
| **3** Real data in | Health Connect, Takeout engine, tri-source de-dup, chronological replay | M3 (1) | **Sonnet** medium | takeout-engineer (**Sonnet high**), integration-coder; optional `/gate 3` on **Opus** | $$$ |
| **4** Cloud route | OAuth PKCE, Google Health client, sync orchestrator, workers, fault injection | M3 (2) | **Sonnet** medium (Haiku for DTO/fixture chores) | integration-coder (Sonnet), reference-finder (Haiku) | $$ |
| **5** Every screen | Recovery, Strain, Sleep, Health, Journal, More, onboarding, export/delete | M4 | **Sonnet** medium | screen-builder ×2 parallel (Sonnet) | $$ |
| **6** Insights and coach | Insight engine, alerts, optional Ask Apex, formula evidence grading | M5 | **Sonnet** medium | science-reviewer (**Sonnet high**) | $$ |
| **7** Harden and ship | Red team, R8 release build, CI, docs, final report; optional `/gate 7` on **Opus** | M6, M7 | **Sonnet** medium, **Haiku** for docs | build-runner (Haiku), integration-coder | $$ |

Relative cost is a ranking, not a measurement. Stage 3 is the heaviest because a data-integrity bug is silent.

## How the quality is protected without Fable or a permanent Opus
1. **Tests first for the hard code.** The spec's Takeout and fault-injection test lists (golden vectors, 250,000-row memory test, DST, truncated ZIP, idempotent re-import, replay ordering) are written before the implementation. A smaller model that must pass a strict test is safer than a bigger model that is trusted.
2. **A separate reviewer.** `diff-reviewer` (Sonnet, read-only) checks every stage diff against the invariants. The main session reads only what it flags, instead of whole diffs on an expensive model.
3. **Two short Opus gates, diff only** (`/gate 3` after the data engine, `/gate 7` before release): a checklist review of a bounded diff costs a fraction of building on Opus, and covers the two places a miss hurts most (data corruption, privacy).
4. **The stage gate is mechanical:** full Gradle green through `build-runner`, no open High/Critical, docs current, tag `apex-stage-N-done`.
5. **Escalation is a rule, not a mood:** same failure after two fix attempts, or a bug whose cause is unfound, moves that one task up a model, and the reason is logged in `docs/DECISIONS.md`. Move back down when the work is mechanical again.

## Where the tokens went before, and what changed
| Cost driver | Before | Now |
|---|---|---|
| Orchestrator model | Opus for the whole session, "plans, splits, reviews" | You pick per stage; Sonnet for almost all; Opus only at two gates |
| Spec loading | 47 KB prompt pasted whole (about 12k tokens), re-read after every context reset, read in part by every agent | `docs/brief/00-core.md` (about 2.5k tokens) + one stage card (about 1k) + line ranges into the frozen spec |
| Fable | Two agents (takeout, science) | Removed. Both run on Sonnet with high effort; tests-first and the Opus gates cover the risk |
| Reading diffs | Main session read every diff | `diff-reviewer` summarises; main reads flagged hunks |
| Build output | Risk of logs in context | Only `build-runner` (Haiku) touches Gradle; narrow tasks while working, full build at the gate |
| Long conversations | One long session | One session per stage; handoff note; `/clear` between stages |
| Screenshots | Critique loop twice per hero screen | One look per screen at 1x, at the gate |

## Commands
- `/stage N` loads the core brief, stage card N and `PROGRESS.md`, then executes the card.
- `/handoff N` runs the gate bookkeeping, updates `PROGRESS.md`, tags `apex-stage-N-done`, and tells you which model to use next.
- `/gate 3` or `/gate 7` is the optional Opus review: diff and checklist only.

## Moving the dial
Up: the same failure twice, a design still wrong after one critique, a corruption bug with no found cause. Down: as soon as the next task is mechanical
(DTOs, fixtures, docs, running builds). Haiku is the default for running builds and lookups, never for writing integrity-critical code.

## The detail
`docs/brief/00-core.md` · `docs/brief/stage-1.md` … `stage-7.md` · frozen full spec `docs/spec/APEX_MASTER_SPEC_V4.1.md` (by line range only).
