---
description: Start or resume an Apex build stage (usage: /stage 3)
argument-hint: <stage number 1-7>
---

Execute Apex stage **$ARGUMENTS**.

Read, in this order, and nothing else yet: `docs/brief/00-core.md`, `docs/brief/stage-$ARGUMENTS.md`, `docs/PROGRESS.md`.
Do not read the full spec, `reference/` or `design-reference/` in this session; use `reference-finder` or the line ranges the card names.

Then:
1. Check `git status` and `git log --oneline -5`. If the previous stage has no `apex-stage-<N-1>-done` tag, say so and stop for the owner's decision.
2. State the plan in at most ten lines: the card's steps that remain, which agent does each, which run in parallel. Do not wait for approval.
3. Execute the card's steps in order, following the model routing in `CLAUDE.md`. Delegate bulk code; do not write it in this session.
4. When the card's "Done means" holds, run the stage gate from `docs/brief/00-core.md`, then `/handoff $ARGUMENTS`.
