---
description: Close an Apex stage - gate, progress note, tag, next-model advice (usage: /handoff 3)
argument-hint: <stage number just finished>
---

Close stage **$ARGUMENTS** so a fresh session on any model can continue cold.

1. Confirm the stage gate in `docs/brief/00-core.md` actually ran: full build green via `build-runner` (exact command and totals), `diff-reviewer` has no open High/Critical.
   If either did not run, run it now. If something fails, do not hand off; report the failure.
2. Update `docs/PROGRESS.md` (keep it under 60 lines): date, stage finished, what is done and verified (with commands), what is not, failures still open, and the next three actions.
   Update `docs/DECISIONS.md`, `docs/EVIDENCE.md`, `docs/OPEN_POINTS.md` for anything this stage changed.
3. Check for secrets, `local.properties`, keystores, Takeout archives or personal data in `git status`. Commit small and green.
   Tag `apex-stage-$ARGUMENTS-done`. Do not push unless the owner asked (in a cloud session, push to the session's designated branch).
4. Finish with exactly this, nothing longer:
   - "Stage $ARGUMENTS done." plus the tag and the build result in one line.
   - "Next: /stage <N+1> on <model> at <effort>" using `docs/ROUTE_MAP.md`, and whether to run `/gate` first.
   - "Run /clear before starting it."
