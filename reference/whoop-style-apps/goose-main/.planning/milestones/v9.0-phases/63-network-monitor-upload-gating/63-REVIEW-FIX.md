---
phase: 63-network-monitor-upload-gating
fixed_at: 2026-06-11T00:00:00Z
review_path: .planning/phases/63-network-monitor-upload-gating/63-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 2
status: partial
---

# Phase 63: Code Review Fix Report

**Fixed at:** 2026-06-11
**Source review:** .planning/phases/63-network-monitor-upload-gating/63-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (CR-01, CR-02, CR-03, WR-01, WR-02)
- Fixed: 5
- Skipped: 2 (WR-03, WR-04 — per instructions, out of scope)

## Fixed Issues

### CR-01 + WR-01: Data race em GooseNetworkMonitor — NSLock adicionado + isStarted reposto em stop()

**Files modified:** `GooseSwift/GooseNetworkMonitor.swift`
**Commit:** `0413186`
**Applied fix:** Adicionado `stateLock = NSLock()` com backing vars `_isStarted` e `_isReachable`. A propriedade `isReachable` passou a computed property com get/set protegidos por lock. O `start()` agora lê e escreve `_isStarted` atomicamente dentro do lock (pattern read-then-set para evitar duplo `monitor.start()`). O `stop()` agora repõe `_isStarted = false` dentro do lock antes de cancelar o monitor — resolve WR-01 simultaneamente.

---

### CR-02: 4xx HTTP errors retentados com backoff — corrigido para abortar imediatamente

**Files modified:** `GooseSwift/GooseUploadService.swift`
**Commit:** `8da8d39`
**Applied fix:** Adicionado `case clientError(Int)` ao enum `UploadAttemptResult`. Em `performRequest`, respostas 400-499 retornam `.clientError` em vez de `.transientError`. No loop de retry, `.clientError` faz `break` imediato (via `clientErrorStatus != nil`). A mensagem de erro no `uploadErrorState` distingue agora erros de cliente de erros de servidor.

---

### CR-03: APNs token perdido se sharedModel for nil antes de .onAppear

**Files modified:** `GooseSwift/GooseAppDelegate.swift`, `GooseSwift/GooseSwiftApp.swift`
**Commit:** `9b7cfdc`
**Applied fix:** Adicionada propriedade estática `nonisolated(unsafe) static var pendingAPNSToken: String?` em `GooseAppDelegate`. Em `didRegisterForRemoteNotificationsWithDeviceToken`, se `sharedModel` for `nil`, o token hex é guardado em `pendingAPNSToken`. Em `GooseSwiftApp.onAppear`, após definir `sharedModel`, o token pendente é consumido e aplicado imediatamente via `setAPNSDeviceToken`.

---

### WR-02: CancellationError suprimido no backoff — propagado via do/catch

**Files modified:** `GooseSwift/GooseUploadService.swift`
**Commit:** `4e6dc4f`
**Applied fix:** Substituído `try? await Task.sleep(nanoseconds:)` por `try await` dentro de um bloco `do/catch`. Quando a `Task.detached` é cancelada durante o sleep do backoff, a `CancellationError` é apanhada, o `_pendingBatchCount` é decrementado correctamente, e a função retorna imediatamente em vez de continuar o loop de retry.

---

## Skipped Issues

### WR-03: rawFrames watermark avança com Date() em vez de max(frame.ts)

**File:** `GooseSwift/GooseUploadService.swift:296`
**Reason:** Skipped por instrução explícita — relacionado com scope da fase 62, deixar para correcção futura.
**Original issue:** O watermark `rawFrames` avança para `Date()` (timestamp de upload) em vez do timestamp máximo dos frames enviados, causando potencial gap em uploads históricos.

---

### WR-04: DispatchSemaphore em runHealthCheck bloqueia thread do pool

**File:** `GooseSwift/GooseAppModel+Upload.swift:383-393`
**Reason:** Skipped por instrução explícita — refactor demasiado extenso para esta iteração.
**Original issue:** `runHealthCheck` usa `DispatchSemaphore.wait()` bloqueando uma thread GCD durante até 5 segundos; deveria usar `async/await`.

---

_Fixed: 2026-06-11_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
