---
description: Optional Opus gate review of a stage diff against a fixed checklist (usage: /gate 3 or /gate 7)
argument-hint: <3 or 7>
---

Run the stage **$ARGUMENTS** gate review. This session is meant to be short and run on Opus. Do not explore the repository broadly and do not rewrite anything.

1. Read the "Gate review" checklist in `docs/brief/stage-$ARGUMENTS.md` and the invariants in `docs/brief/00-core.md`.
2. Get the bounded diff: `git diff apex-stage-<previous>-done..HEAD --stat`, then read only the files the checklist concerns (for stage 3: the Takeout, ingest, reconcile, pipeline replay and Health Connect sources and their tests; for stage 7: manifest, proguard, network, token/key storage, logging, export, notification code).
   If a previous tag is missing, use the stage's first commit.
3. For each checklist item answer PASS, FAIL or UNPROVEN with the file:line that proves it. UNPROVEN means "no test or code shows it".
4. Fix only High and Critical failures, each with a regression test, via the agents named in `CLAUDE.md`. Everything else goes to `docs/OPEN_POINTS.md`.
5. Report in at most 20 lines: the checklist with results, what you fixed, what remains. Then tell the owner to switch back to Sonnet.
