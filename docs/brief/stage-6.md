# Stage 6 — Insights, alerts, coach (milestone M5)

**Main session:** Sonnet, effort medium. `science-reviewer` runs on **Sonnet, effort high**. **Relative cost:** $$
**Goal:** the app explains itself and nudges the user without ever diagnosing, and the optional AI coach is honest about what it sends.

## Agents
`science-reviewer` (Sonnet high) for evidence and wording · `integration-coder` (Sonnet) for alerts and the AI client · `screen-builder` (Sonnet) for the UI · `build-runner` · `diff-reviewer`.

## Do, in order
1. **Insight engine (offline, deterministic):** insights built from `RecoveryEngine`, `FatigueSignals`, `StrainTarget`, `SleepNeed`, `MetricIntelligence` with every sentence traceable to an on-screen number.
   Wording reviewed by `science-reviewer`: "may indicate", never "you are ill".
2. **Alerts** (spec 297): notification channels, quiet hours, per-type toggles, de-duplication, Android 13+ permission flow, never diagnostic, no notification spam (red-team case).
3. **Optional "Ask Apex" (off by default):** user's own key in encrypted storage, a "what gets sent" preview before every request, answers labelled `AI_INTERPRETED`, degrades with no key/network.
   **Look up the current model ID in the Anthropic docs (use the `claude-api` skill) rather than assuming one.** The only network call outside Google is this one, and only after opt-in.
4. **Formula evidence pass** (`science-reviewer`): grade every constant in `docs/FORMULAS.md` as peer-reviewed (citation, population, known error) or labelled calibration choice; confirm the code matches the doc to the constant.
   A change bumps `ANALYTICS_ALGORITHM_VERSION` and updates a golden vector. Report findings by severity; fix only what is proven wrong.
5. Update `EVIDENCE.md` rows and the "how this is calculated" sheets.

## Spec lines
171 · 262-264 · 297 · 135-146 · and `docs/FORMULAS.md` (read through the agent).

## Done means
Full gate command green · test that every numeral in generated coach text appears in the input state · alert de-dup and quiet-hour tests · no-key and no-network behaviour tested ·
FORMULAS.md evidence graded · diff reviewed.

## Next
Stage 7 on **Sonnet**; Haiku for the document-writing half.
