# Handoff: next session (written 2026-10-10)

Read this first, then `docs/handoff.md` (sections 3, 4, 7) for rules, commands and the code map.

## State

- `main` (pushed) has today's work: UI parity fixes (kit, screens, sheets), narrow-phone layout and type scale, theme tokens
  (audit: `docs/audits/2026-10-10-theme-token-audit.md`), app icon, splash and opening animation, APK size work
  (preview APK 27.2 MB, `docs/learning.md` "Android app size"), and **Google connect** (Android: local Expo module
  `modules/google-auth`, Authorization API, Baro-style in-app consent; iOS: PKCE in the in-app auth sheet, not yet
  compiled or run). Client ids: `src/google/clients.ts`.
- The owner's phone (OnePlus CPH2691, Android, 361 dp) has the preview APK from `main` installed. Google connect works
  on it: every data type shows synced in Settings.
- EAS: project `@adityajindals-team/pulse`, Android keystore on EAS (SHA-1 `29:DA:72:C1:0A:27:25:F7:0F:D1:56:CB:64:15:FE:BB:E9:87:25:A7`,
  the Android OAuth client is bound to it). Build locally, never plain Gradle, so the signature matches:
  `ANDROID_HOME=~/Library/Android/sdk npx eas-cli@latest build -p android --profile <preview|development> --local --non-interactive --output ~/personal/pulse-mobile-builds/<name>.apk`
  then `adb install -r <apk>` (same key, updates in place, keeps data).

## Current follow-up

The original perf agent stopped without changes. Its branch `perf/transitions` and worktree were deleted.

- Whole-sync progress and isolated status polling are pushed to `main` at `0c8b932`. All 15 core jobs count from the
  start; progress uses one overall percentage. Typecheck, lint and tests pass (1,065 passed, one skipped).
- Android slide transitions, opaque screen fill, query deferral until native `transitionEnd`, and development timing
  logs are committed on `codex/sync-scoring`, pending phone verification. Checks pass. The release baseline for opening
  Sleep was 27 frames, six missed deadlines (22.2%). This is a single targeted sample, not a benchmark.
- A signed arm64 development APK is ready at `~/personal/pulse-mobile-builds/pulse-dev-3d91b45.apk`. Its SHA-1 matches
  the EAS keystore above. The initial builds failed; the successful retry used
  `ORG_GRADLE_PROJECT_reactNativeArchitectures=arm64-v8a GRADLE_OPTS='-Dorg.gradle.workers.max=2'` with the same EAS command.
- The phone is temporarily disconnected. Device-specific install and SQLite capture are queued in exec session 37908.
  Install with `adb install -r`, then copy `files/SQLite` with `run-as` before
  launching the app. Metro runs on port 8081. The release denies `run-as`; no SQLite snapshot has been captured yet.
- The release's Your data page reports zero scored days; its daily JSON export is empty. Export opens the share sheet.
  Sync/scoring diagnosis and the remaining R8 checks are still pending. Never load demo data into the owner's database.
- Gradle and Kotlin build daemons have stopped. Completed agent and temporary integration worktrees were removed.
- Local snapshot inspection helper: `/tmp/pulse-inspect.py <extracted-directory>` prints table counts, date spans and
  sync cursors, without raw health readings. Dev launcher scheme is `exp+pulse`; reverse USB port 8081 before launch.

## Open problems (owner-reported, most important first)

1. **Data synced but nothing scored.** After Google connect, Settings lists every type as synced, yet Home shows "No band
   data yet", Sleep/Recovery "Waiting for sleep", Healthspan "0 of 20 days". Find why on the phone with the dev build:
   the first sync's day range, whether sleep sessions and HR samples land in SQLite, whether the band-presence check and
   `recompute` run over the synced days (`src/google/sync*`, `syncNow`, `src/pipeline`). Compare with pulse's server
   sync (`~/personal/pulse/src/server`, read only).
2. **"Syncing x of 180 days" jumps up and down** and repeats per data type. Show one progress for the whole sync.
3. **Screens open slowly and glitch.** Verify the prepared changes on the phone with `adb shell dumpsys gfxinfo in.portlabs.pulse`.
4. On the phone, R8 is on: check charts, the Log date field (@expo/ui), animations, export, the dashboard editor.
5. iOS Google connect is untested; Android Google console: consent screen lists the 13 Google Health scopes, owner's
   account is a test user.

## How the owner wants to work (see also the memory files)

- Drive the phone yourself over USB: `adb exec-out screencap -p`, `adb shell input tap/swipe`, `adb logcat`,
  `adb shell screenrecord`. Quick targeted checks, never long sweeps. Never delete app data or uninstall without asking.
- Merge each finished fix to `main` and push right away (owner allowed direct pushes), checks green first.
- Fan out work to subagents in worktrees under `~/personal/worktrees/pulse-mobile/`; one owner per shared file.
- UI must look like the Pulse PWA; native behaviour only. Comments: present tense, no owner names or dates.
