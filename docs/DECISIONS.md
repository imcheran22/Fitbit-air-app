# Decisions

Decisions that are not obvious from the code, newest last. Each has a reason and, where relevant,
what would change it. Master prompt §3 decisions are not repeated here.

| # | Date | Decision | Reason | Revisit when |
|---|---|---|---|---|
| D1 | 2026-11-11 | The legacy Fitbit Web API (`api.fitbit.com`, `/1/user/-/…`) is **not implemented**. Master prompt §7.1 items for Fitbit OAuth, rate-limit tracking and `FitbitWebApiService` are delivered as their Google Health API equivalents (`GoogleHealthAuthConfig`, provider-neutral `RateLimitTracker`, `GoogleHealthApiClient`). | `api.fitbit.com` answers with a Google-style 401 and the Fitbit Web API was retired at the end of October 2026 (PROGRESS.md, first session). Building a client for a retired API would be a fake integration (§0.1 rule 3). | Google re-opens the Fitbit Web API for Personal apps. |
| D2 | 2026-11-11 | Build verification for Android modules runs on **GitHub Actions CI** (`.github/workflows/android.yml`); pure-Kotlin code is additionally compiled and tested in the cloud session with a JVM-only Gradle harness against Maven Central. | The cloud session's network policy denies `dl.google.com`, which hosts Google Maven (AGP, AndroidX, Compose) and the Android SDK. CI has normal network access and the same JDK 21. | The session environment allows `dl.google.com`. |
| D3 | 2026-11-11 | CI runs one `./gradlew --continue …` invocation including `:app:lintDebug` and `:app:assembleRelease`, and prints a test-failure summary. | One CI round reports every failing module, which matters when CI is the only Android compiler. | - |
| D4 | 2026-11-11 | Each screen area keeps its copy in its own `res/values/strings_<area>.xml`. | Lets screens be built in parallel without merge conflicts on one `strings.xml`; Android merges all `values/*.xml`. | - |
| D5 | 2026-11-12 | Owner instruction: from this point no Fable agents. The Takeout engine and the formula review run as their usual agents with an **Opus (high effort)** model override; UI and integration work stays on Sonnet. | Fable usage was consuming too many tokens. The agent definitions in `.claude/agents/` are unchanged; the override is per call. | The owner re-enables Fable. |
