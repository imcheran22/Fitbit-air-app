---
phase: 63-network-monitor-upload-gating
reviewed: 2026-06-11T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - GooseSwift/GooseNetworkMonitor.swift
  - GooseSwift/GooseAppModel+Upload.swift
  - GooseSwift/GooseUploadService.swift
  - GooseSwift/GooseAppDelegate.swift
  - GooseSwift/GooseAppModel.swift
findings:
  critical: 3
  warning: 4
  info: 1
  total: 8
status: issues_found
---

# Phase 63: Code Review Report

**Reviewed:** 2026-06-11
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Esta fase implementa o monitor de rede (`GooseNetworkMonitor`) baseado em `NWPathMonitor`, o gating de uploads por conectividade e token APNs, o backoff exponencial no `GooseUploadService`, e a captura do token APNs em `GooseAppDelegate`. O código está geralmente bem estruturado e os comentários explicam decisões de design importantes. No entanto, foram encontrados três blockers: (1) data race em `isReachable` entre a `monitorQueue` e qualquer thread que leia a propriedade diretamente; (2) 4xx errors (401, 403, 404, 413) são classificados como `transientError` e retentados até 6 vezes com backoff, em vez de serem abortados imediatamente, causando atraso de até ~2 minutos e potencial de dados sensíveis serem retransmitidos; (3) `sharedModel` é lido em `GooseAppDelegate` antes de `.onAppear` ser invocado em dispositivos lentos, criando uma janela onde o token APNs se perde silenciosamente. Adicionalmente há quatro warnings relevantes de qualidade e robustez.

## Critical Issues

### CR-01: Data race em `GooseNetworkMonitor.isReachable` — leitura sem sincronização cross-thread

**File:** `GooseSwift/GooseNetworkMonitor.swift:15,29-30`
**Issue:** `isReachable` é escrita na `monitorQueue` (dentro do `pathUpdateHandler`) mas é declarada como `private(set) var` sem qualquer mecanismo de sincronização. Qualquer código que leia `networkMonitor.isReachable` diretamente de outra thread (por exemplo, a `monitorQueue` a ler `self.isReachable` na linha 29 enquanto outra thread faz a leitura inicial) sofre um data race não protegido. O comentário do ficheiro diz que `start()/stop()` podem ser chamados de qualquer thread, e `isStarted` também não é protegido por nenhum lock — uma segunda chamada concorrente a `start()` entre o `guard !isStarted` (linha 24) e `isStarted = true` (linha 25) resulta em duplo `monitor.start(queue:)`, o que a Apple documenta como comportamento indefinido em `NWPathMonitor`.

Nota: na prática corrente `start()` é chamado apenas uma vez de `@MainActor`, mas o contrato declarado ("may be called from any thread") e a ausência de lock tornam isto um defecto estrutural.

**Fix:**
```swift
final class GooseNetworkMonitor {
  private let monitor = NWPathMonitor()
  private let monitorQueue = DispatchQueue(label: "com.goose.swift.network-monitor", qos: .utility)
  private let stateLock = NSLock()
  private var _isStarted = false
  private var _isReachable: Bool = true

  private(set) var isReachable: Bool {
    get { stateLock.withLock { _isReachable } }
    set { stateLock.withLock { _isReachable = newValue } }
  }

  func start() {
    stateLock.withLock {
      guard !_isStarted else { return }
      _isStarted = true
    }
    monitor.pathUpdateHandler = { [weak self] path in
      guard let self else { return }
      let reachable = path.status == .satisfied
      guard reachable != self.isReachable else { return }
      self.isReachable = reachable
      DispatchQueue.main.async { [weak self] in
        self?.onReachabilityChange?(reachable)
      }
    }
    monitor.start(queue: monitorQueue)
  }
  // ...
}
```

---

### CR-02: 4xx HTTP errors retentados até 6 vezes — wasted retries e risco de amplificação de dados

**File:** `GooseSwift/GooseUploadService.swift:315-317`
**Issue:** Em `performRequest`, qualquer resposta HTTP que não seja 2xx nem 5xx (incluindo 400, 401, 403, 404, 413, 429) é mapeada para `.transientError` e retentada até 6 vezes com backoff exponencial (delays: 1s, 2s, 4s, 8s, 16s, 32s → ~63 segundos de espera). Um 401 (token inválido) ou 403 (forbidden) nunca vai ser corrigido por retry — o upload falha sempre depois de 7 tentativas, mas durante ~63 segundos a app tenta repetidamente enviar o payload completo de dados biométricos para um servidor que os rejeita. Um 413 (payload demasiado grande) também nunca vai ser resolvido por retry. Esta classificação incorreta desperdiça largura de banda, atrasa o registo do erro em `uploadErrorState`, e em caso de 429 (rate limit) sem `Retry-After` pode agravar a situação.

**Fix:**
```swift
private enum UploadAttemptResult {
  case success(Int)
  case serverError(Int)    // 500-599 — retry with backoff
  case clientError(Int)    // 400-499 — do NOT retry
  case transientError      // network/transport failure — retry
}

private func performRequest(_ request: URLRequest) async -> UploadAttemptResult {
  guard let (data, response) = try? await session.data(for: request) else {
    return .transientError
  }
  guard let http = response as? HTTPURLResponse else {
    return .transientError
  }
  if (500..<600).contains(http.statusCode) { return .serverError(http.statusCode) }
  if (200..<300).contains(http.statusCode) { /* parse success */ return .success(0) }
  // 4xx: non-retryable
  logger.warning("upload client error \(http.statusCode) — not retrying")
  return .clientError(http.statusCode)
}

// In the retry loop:
switch result {
case .clientError(let status):
  uploadErrorState = "Upload failed — client error (\(status))"
  // break out of loop immediately
  break
// ...
}
```

---

### CR-03: `sharedModel` pode ser `nil` quando `didRegisterForRemoteNotificationsWithDeviceToken` é chamado antes de `.onAppear`

**File:** `GooseSwift/GooseAppDelegate.swift:19-21` / `GooseSwift/GooseSwiftApp.swift:43`
**Issue:** `GooseSwiftApp.sharedModel` é atribuído em `.onAppear` do `WindowGroup` (linha 43 de `GooseSwiftApp.swift`). O iOS pode chamar `didRegisterForRemoteNotificationsWithDeviceToken` logo após o registo com `registerForRemoteNotifications()` (chamado em `didFinishLaunchingWithOptions`, linha 10 de `GooseAppDelegate.swift`) — antes do primeiro render de `RootView` completar. Quando isso acontece, `GooseSwiftApp.sharedModel` ainda é `nil`, `setAPNSDeviceToken` nunca é chamado, e o token APNs perde-se silenciosamente. O upload fica bloqueado em `skip.no_apns_token` para sempre nessa sessão.

Esta janela é estreita em dispositivos rápidos, mas documentada em devices lentos, cold launches, e quando o token APNs está cacheado pelo OS (pode ser entregue quase imediatamente após `registerForRemoteNotifications`).

**Fix:** Armazenar o token APNs pendente no `AppDelegate` e aplicá-lo quando o modelo ficar disponível, ou mover `sharedModel =` para `GooseSwiftApp.init()` (utilizando `@State` que é inicializado em `init`):

```swift
// GooseAppDelegate.swift — buffer token until model is available
private var pendingToken: String?

func application(_ application: UIApplication,
                 didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
  let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
  Task { @MainActor in
    if let model = GooseSwiftApp.sharedModel {
      model.setAPNSDeviceToken(hex)
    } else {
      GooseAppDelegate.pendingToken = hex  // stored as static, applied in onAppear
    }
  }
}

// GooseSwiftApp.swift — in .onAppear:
GooseSwiftApp.sharedModel = model
if let token = GooseAppDelegate.consumePendingToken() {
  model.setAPNSDeviceToken(token)
}
```

---

## Warnings

### WR-01: `stop()` não repõe `isStarted` — `GooseNetworkMonitor` não pode ser reiniciado

**File:** `GooseSwift/GooseNetworkMonitor.swift:40-42`
**Issue:** `stop()` chama `monitor.cancel()` mas não repõe `isStarted = false`. Se `stop()` for chamado e depois `start()` for chamado de novo (por exemplo, durante testes ou reinicialização de sessão), o `guard !isStarted` na linha 24 faz a chamada ser um no-op silencioso, mas o monitor já foi cancelado e não vai entregar mais atualizações. A app fica com `isNetworkReachable` congelado no último valor conhecido.

**Fix:**
```swift
func stop() {
  isStarted = false  // ou stateLock.withLock { _isStarted = false } após CR-01
  monitor.cancel()
}
```

---

### WR-02: `try? await Task.sleep` suprime `CancellationError` — backoff nunca termina antecipadamente quando a `Task` é cancelada

**File:** `GooseSwift/GooseUploadService.swift:191`
**Issue:** O backoff usa `try? await Task.sleep(nanoseconds: delayNanos)`, que silencia a `CancellationError`. Se a `Task.detached` que executa `performUpload` for cancelada externamente (por exemplo, quando a app vai para background durante um retry de 32 segundos), o sleep completa normalmente, o loop continua, e a próxima chamada a `session.data(for:)` vai falhar ou correr em background sem garantia de conclusão. O comportamento correto seria propagar o cancelamento imediatamente.

**Fix:**
```swift
// Em vez de try?:
try await Task.sleep(nanoseconds: delayNanos)
// propaga CancellationError e aborta o loop
```
O caller (`Task.detached`) deve ser estruturado para tolerar o throw, ou o loop deve verificar `Task.isCancelled` explicitamente.

---

### WR-03: `rawFrames` watermark avança com `Date()` (wall-clock) em vez de `max(data.ts)` — inconsistência com `decodedStreams`

**File:** `GooseSwift/GooseUploadService.swift:296`
**Issue:** O watermark `decodedStreams` avança para `uploadedUntil = min(max(data.ts), Date())` (linha 164-165), garantindo que o watermark representa o timestamp máximo dos dados enviados. O watermark `rawFrames` avança para `Date()` (linha 296), o timestamp de upload. Se o servidor receber frames históricos num upload (ex: `triggerBackfill`), `rawFrames` avança para agora, excluindo frames históricos com timestamps entre `max(frame.ts)` e `Date()` de uploads futuros. O mesmo problema que o comentário CR-02 original no código evita para `decodedStreams` aplica-se aqui.

**Fix:**
```swift
// Em uploadRawFrames, calcular o max timestamp dos frames enviados:
var maxFrameTs: Double = 0
for frame in frames {
  if let row = frame as? [String: Any],
     let ts = (row["captured_at_unix"] as? NSNumber)?.doubleValue ?? (row["captured_at_unix"] as? Double) {
    maxFrameTs = max(maxFrameTs, ts)
  }
}
let rawWatermark = maxFrameTs > 0
  ? min(Date(timeIntervalSince1970: maxFrameTs), Date())
  : Date()
GooseUploadWatermark.update(.rawFrames, to: rawWatermark)
```

---

### WR-04: `runHealthCheck` usa `DispatchSemaphore.wait()` numa thread do pool global — bloqueia uma thread do thread pool

**File:** `GooseSwift/GooseAppModel+Upload.swift:383-393`
**Issue:** `runHealthCheck` despacha para `DispatchQueue.global(qos: .utility).async` e depois cria um `DispatchSemaphore`, espera por uma `URLSession.dataTask` com `semaphore.wait()` (linha 393). Isto bloqueia uma thread do pool de threads do sistema durante até 5 segundos (o timeout do request). O GCD não sabe que a thread está bloqueada e pode criar threads adicionais para satisfazer outros trabalhos, aumentando o uso de threads. O resto do código usa `async/await` correctamente — esta função deveria igualmente usar `async/await`.

**Fix:**
```swift
private func runHealthCheck(serverURLString: String) {
  Task.detached(priority: .utility) { [weak self] in
    guard let self, let url = URL(string: serverURLString + "/healthz") else {
      await MainActor.run { self?.serverReachable = false }
      return
    }
    var request = URLRequest(url: url)
    request.timeoutInterval = 5
    let isReachable: Bool
    do {
      let (_, response) = try await URLSession.shared.data(for: request)
      isReachable = (response as? HTTPURLResponse)?.statusCode == 200
    } catch {
      isReachable = false
    }
    await MainActor.run { self.serverReachable = isReachable }
  }
}
```

---

## Info

### IN-01: `isoFromUnix` aloca um novo `ISO8601DateFormatter` por cada frame no loop de importação histórica

**File:** `GooseSwift/GooseAppModel+Upload.swift:292-296`
**Issue:** `isoFromUnix` é chamada dentro de `compactMap` (linha 225) que itera por todos os frames de uma página (até 5 000 frames). Cada chamada cria uma nova instância de `ISO8601DateFormatter`, que é uma classe relativamente pesada de inicializar. Para uma importação com 200 páginas de 5 000 frames, isto resulta em 1 000 000 alocações desnecessárias.

**Fix:** Usar um formatter estático (já existe `GooseAppModel.captureTimestampFormatter` que configura as mesmas `formatOptions`) ou extrair o formatter para uma propriedade `let` local antes do loop externo (`for deviceID in deviceIDs`).

---

_Reviewed: 2026-06-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
