---
name: coach-vow-messages
description: Contextual coaching nudges (VOW — Voice of WHOOP) shown in Coach tab — local bridge-computed, not server-delivered
metadata:
  type: seed
  trigger_condition: when planning v10.0 milestone scope
  planted_date: 2026-06-11
---

## Idea

Add contextual coaching messages to the Coach tab that adapt to the user's current recovery, strain, and sleep data — a local equivalent of WHOOP's VOW ("Voice of WHOOP") system.

## What WHOOP has

Discovered via Ghidra (2026-06-11):
- `WhoopVow` framework — `VoWMessage`, `VoWService`, `VoWMessageCache`
- `WhoopCoachEverywhere` — `CoachEverywhereManager`, `CoachEverywhereSpacePublisher` (floats over screens)
- `StrainCoachVOWGenerator` + `CycleOverviewStrainCoachVOWGenerator` — contextual message generators
- Message variants found in binary: `VOW.ReachedOptimalStrain`, `VOW.BuildStrainToReachOptimalStrain`, `VOW.SetStrainGoal`, `VOW.ImpossibleStrainGoal`, `VOW.MaintainLevel`, `VOW.RestorativeStrainGoal`, `VOW.AlreadyOverreaching`, `VOW.SelectedStrainResultsInOverreaching`

WHOOP's VOW messages are server-delivered and cached. They are contextual ("you've reached optimal strain today", "yesterday's recovery was low — consider a recovery day").

## Goose approach — local, no server

WHOOP's messages come from a server. Goose can generate equivalent messages locally from bridge data:
- Current recovery score → message category (green/yellow/red)
- Day strain vs. optimal range → strain coaching message
- Last sleep score → sleep coaching message
- Behaviour tags (if journal-behaviour-tracking seed is implemented) → contextual modifiers

This is a rule-based message selector, not ML. The `StrainCoachVOWGenerator` variants already reveal WHOOP's decision tree (reachedOptimal, buildToOptimal, restorative, overreaching, etc.) — this can be replicated in Rust.

## What to build

1. Rust bridge method `coach.vow_message(database_path)` — returns a `{ category, title, body }` struct based on latest metrics
2. Decision tree in Rust: recovery × strain × sleep → message key
3. Message string table in Swift (localizable)
4. `GooseCoachVOWView` — banner/card shown at top of Coach tab, updated on each bridge refresh

**Not now:**
- Floating overlay across screens (CoachEverywhere) — intrusive, not needed for v1
- Server-delivered messages — no server infrastructure for this

## Relation to other seeds

- Enhanced by `[[journal-behaviour-tracking]]` — behaviour tags can influence message context
- Replaces static text in current Coach tab strain/sleep coach views

## Files to touch

- Modify: `Rust/core/src/bridge.rs` — add `coach.vow_message` method
- New: `GooseSwift/GooseCoachVOWView.swift`
- Modify: `GooseSwift/CoachViews.swift` (or equivalent) — insert VOW card
