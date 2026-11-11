---
phase: 62-upload-watermark-per-sensor
reviewed: 2026-06-11T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - GooseSwift/GooseUploadWatermark.swift
  - GooseSwift/GooseUploadService.swift
  - GooseSwift/GooseAppModel+Upload.swift
findings:
  critical: 3
  warning: 3
  info: 2
  total: 8
status: issues_found
---

# Phase 62: Code Review Report

**Reviewed:** 2026-06-11T00:00:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Revisão adversarial dos três ficheiros que implementam o sistema de watermark por sensor para uploads incrementais. A implementação geral é sólida: atomicidade correcta (watermark escrito após HTTP 200, nunca em ramos de erro), watermarks rawFrames e decodedStreams com chaves UserDefaults independentes, e guarda de thread safety via `NSLock` com computed properties protegidas.

Foram encontrados três BLOCKERs:

1. O watermark usa `Date()` (tempo de upload) em vez do timestamp máximo dos dados enviados. Quando `triggerBackfill` insere linhas históricas e chama imediatamente `performUpload`, o `effectiveSince` = watermark recente exclui essas linhas históricas — o upload subsequente não as inclui e `markStreamsSynced` não as marca, ficando `synced=0` indefinidamente.
2. O watermark `decodedStreams` é partilhado entre o WHOOP e o HR monitor. Um upload bem-sucedido do HR monitor avança o watermark para `T_now`, fazendo com que o próximo upload WHOOP parta de `T_now` em vez do timestamp correcto para o WHOOP.
3. `captureAllPendingRowIDs` não passa `since_ts` à chamada Rust `sync.rows_pending_upload`. O Rust devolve as linhas mais antigas primeiro (todas com `synced=0`), e o filtro de timestamp é aplicado apenas no cliente. Se existirem ≥ 500 linhas antigas (ts < effectiveSince), o `limit=500` esgota-se completamente com linhas que o filtro do cliente vai rejeitar — linhas mais recentes nunca são capturadas nem marcadas como sincronizadas.

---

## Critical Issues

### CR-01: Watermark escrito com `Date()` causa gap silencioso para dados históricos/backfill

**File:** `GooseSwift/GooseUploadService.swift:163`

**Issue:** `GooseUploadWatermark.update(.decodedStreams, to: Date())` escreve o momento do upload, não o timestamp máximo das linhas enviadas. Quando `triggerBackfill` chama `sync.backfill_streams` (que insere linhas históricas com `ts < Date()`) e de seguida chama `performUpload`, acontece:

1. `effectiveSince = watermark(decodedStreams)` = timestamp de um upload anterior recente (e.g. `T_recente`)
2. `upload.get_recent_decoded_streams` filtra com `since_ts = T_recente` → exclui as linhas históricas com `ts < T_recente`
3. Upload não contém as linhas históricas → `markStreamsSynced` não as marca
4. Próximo ciclo: `effectiveSince = Date()` (novo watermark) → continua a excluir as linhas históricas
5. As linhas ficam `synced=0` para sempre até `clearAllWatermarks()` ser chamado

O mesmo aplica-se a qualquer importação de dados atrasados (e.g. `importHistoricalDataFromServer` seguida de upload).

**Fix:** Calcular o timestamp máximo das linhas efectivamente enviadas e usar esse valor como watermark, em vez de `Date()`:

```swift
// Após construir `streams` a partir de `streamsResult`:
var maxDataTs: Double = 0
for stream in [hr, rr, events, battery, spo2, skinTemp, resp, gravity] {
  for item in stream {
    if let row = item as? [String: Any],
       let ts = (row["ts"] as? NSNumber)?.doubleValue ?? (row["ts"] as? Double) {
      maxDataTs = max(maxDataTs, ts)
    }
  }
}
let watermarkDate = maxDataTs > 0 ? Date(timeIntervalSince1970: maxDataTs) : Date()
// Em vez de:
// GooseUploadWatermark.update(.decodedStreams, to: Date())
GooseUploadWatermark.update(.decodedStreams, to: watermarkDate)
```

Alternativamente, o watermark deve usar `min(Date(), max(data.ts))` para tolerar relógios adiantados.

---

### CR-02: Watermark `decodedStreams` partilhado entre WHOOP e HR monitor

**File:** `GooseSwift/GooseAppModel+Upload.swift:55-67`

**Issue:** `triggerManualUpload` chama `uploadService.upload()` para o WHOOP e depois para o HR monitor. Ambas as chamadas, em `performUpload`, usam `GooseUploadWatermark.watermark(for: .decodedStreams)` — uma única chave global. As duas corridas são concorrentes (dois `Task.detached`):

- Se o HR monitor upload terminar primeiro e escrever `watermark = T_HR`, o WHOOP upload já em progresso (mas ainda não chegou à linha 163) também escreverá `watermark = T_WHOOP` a seguir (last-writer-wins, benigno para este ciclo).
- Pior: no **próximo** ciclo, o WHOOP usa `effectiveSince = watermark = T_HR` que pode ser posterior ao último upload real do WHOOP, excluindo dados WHOOP do intervalo `[T_WHOOP, T_HR]`.
- Em cenário inverso: WHOOP avança o watermark, HR monitor do próximo ciclo começa de `T_WHOOP` e perde dados HR anteriores a esse ponto.

A independência declarada nos comentários (`rawFrames` vs `decodedStreams`) resolve a separação raw/decoded mas não a separação entre dispositivos que partilham `decodedStreams`.

**Fix:** Usar chaves de watermark com deviceID incorporado, ou watermarks separados por tipo de dispositivo:

```swift
// GooseUploadWatermark.swift — adicionar chaves por deviceID
static func watermark(for type: WatermarkType, deviceID: UUID) -> Date? {
  return UserDefaults.standard.object(forKey: key(for: type, deviceID: deviceID)) as? Date
}

static func update(_ type: WatermarkType, deviceID: UUID, to date: Date) {
  UserDefaults.standard.set(date, forKey: key(for: type, deviceID: deviceID))
}

private static func key(for type: WatermarkType, deviceID: UUID) -> String {
  let base: String
  switch type {
  case .rawFrames:     base = rawFramesKey
  case .decodedStreams: base = decodedStreamsKey
  }
  return "\(base).\(deviceID.uuidString)"
}
```

`clearAllWatermarks()` deve usar `UserDefaults.standard.dictionaryRepresentation()` para remover todas as chaves com o prefixo `goose.swift.upload.`.

---

### CR-03: `captureAllPendingRowIDs` não passa `since_ts` ao Rust — filtro de timestamp apenas no cliente esgota `limit=500`

**File:** `GooseSwift/GooseUploadService.swift:308-331`

**Issue:** A chamada `sync.rows_pending_upload` não recebe `since_ts`, devolvendo as linhas mais antigas com `synced=0` primeiro. O `limit=500` aplica-se antes do filtro de timestamp do lado Swift (`ts >= sinceTs`, linha 323). Se existirem ≥ 500 linhas antigas (abaixo de `sinceTs`, e.g. de backfills anteriores que nunca foram incluídas no upload), o Rust retorna 500 linhas que o cliente filtrará todas — as linhas mais recentes (índices 501+) nunca são capturadas nem marcadas como sincronizadas nesse ciclo.

```swift
// Problema: Rust devolve as 500 linhas mais antigas, todas com ts < sinceTs
// O cliente filtra todas → result[entry.table] = [] (vazio)
// Enquanto linhas mais recentes (ts >= sinceTs) ficam por capturar
guard let pendingReport = try? rust.request(
  method: "sync.rows_pending_upload",
  args: [
    "database_path": databasePath,
    "stream": entry.table,
    "limit": 500,          // ← sem since_ts, retorna as mais antigas
  ]
)
```

**Fix:** Passar `since_ts` ao Rust para que a filtragem seja aplicada na query SQLite, garantindo que o `limit=500` só conta linhas relevantes:

```swift
guard let pendingReport = try? rust.request(
  method: "sync.rows_pending_upload",
  args: [
    "database_path": databasePath,
    "stream": entry.table,
    "since_ts": sinceTs,   // ← novo argumento
    "limit": 500,
  ]
)
```

Se o Rust não suportar `since_ts` neste método ainda, o `limit` deve ser aumentado substancialmente (e.g. `10_000`) para reduzir o risco de esgotamento — mas a solução correcta é filtrar na query.

---

## Warnings

### WR-01: `markStreamsSynced` silencia falhas individuais de stream mas avança o watermark na mesma

**File:** `GooseSwift/GooseUploadService.swift:337-354`

**Issue:** `markStreamsSynced` itera 8 streams; se `sync.mark_synced` falhar para alguns (e.g. por contentão SQLite), o erro é apenas logado em `debug` e o ciclo continua. O watermark é depois escrito na linha 163 (chamada antes de `markStreamsSynced` retornar? Não — chamada após, em linha 163). A sequência é: `markStreamsSynced` (linha 160), depois watermark (linha 163). Portanto, se `markStreamsSynced` falha parcialmente, o watermark avança na mesma. Na próxima invocação, as linhas não marcadas ainda têm `synced=0` e seriam re-capturadas — mas o `effectiveSince` avançou, por isso só as linhas com `ts >= novo effectiveSince` são recapturadas. Linhas com `ts < novo effectiveSince` que não foram marcadas ficam esquecidas.

**Fix:** Registar falhas de `markStreamsSynced` com nível `.warning` (não `.debug`) para que sejam visíveis em produção. Considerar não avançar o watermark se pelo menos um stream falhou a marcação:

```swift
private func markStreamsSynced(rowIDsByStream: [String: [Int]]) -> Bool {
  var allSucceeded = true
  for (stream, rowIDs) in rowIDsByStream {
    guard !rowIDs.isEmpty else { continue }
    do {
      _ = try rust.request(method: "sync.mark_synced", args: [...])
    } catch {
      logger.warning("sync.mark_synced \(stream) failed: \(error)")
      allSucceeded = false
    }
  }
  return allSucceeded
}
// Em performUpload:
let markOK = markStreamsSynced(rowIDsByStream: pendingRowIDs)
if markOK {
  GooseUploadWatermark.update(.decodedStreams, to: Date())
}
```

---

### WR-02: `runHealthCheck` usa `DispatchSemaphore` + `URLSession.dataTask` em vez de `async/await`

**File:** `GooseSwift/GooseAppModel+Upload.swift:334-362`

**Issue:** `runHealthCheck` corre em `DispatchQueue.global(qos: .utility)`, bloqueia a thread com `semaphore.wait()` enquanto aguarda o callback do `URLSession.shared.dataTask`. Todas as outras funções de rede no mesmo ficheiro usam correctamente `async/await` com `URLSession.data(for:)`. A inconsistência aumenta o risco de regressão futura (e.g. mover para `Task{}` sem remover o semaphore causaria deadlock no Swift runtime). O padrão não é errado no contexto actual (a thread GCD é diferente da thread de callback), mas é frágil e desnecessário dado que o projecto já usa `async/await` consistentemente.

**Fix:** Converter `runHealthCheck` para `async` e chamar de `Task.detached`:

```swift
private func runHealthCheck(serverURLString: String) {
  Task.detached(priority: .utility) { [weak self] in
    guard let self else { return }
    guard let url = URL(string: serverURLString + "/healthz") else {
      await MainActor.run { self.serverReachable = false }
      return
    }
    var request = URLRequest(url: url)
    request.timeoutInterval = 5
    let isReachable: Bool
   , response) = try await URLSession.shared.data(for: request)
      isReachable = (response as? HTTPURLResponse)?.statusCode == 200
    } catch {
      isReachable = false
    }
    await MainActor.run { self.serverReachable = isReachable }
  }
}
```

---

### WR-03: `triggerBackfill` não faz `refreshPendingRowCount` nem `publishStatus` após o seu ciclo próprio

**File:** `GooseSwift/GooseUploadService.swift:378-401`

**Issue:** `triggerBackfill` chama `sync.backfill_streams` e depois chama `performUpload`. `performUpload` chama `refreshPendingRowCount()` e `publishStatus()` no final. No entanto, se `backfill_streams` inserir linhas e `performUpload` terminar antes de elas serem visíveis (e.g. timing SQLite), o badge de pendentes mostrado ao utilizador pode ficar desactualizado. Mais importante: se `performUpload` retornar cedo (upload disabled, sem URL, sem token — linhas 71-83), `refreshPendingRowCount` e `publishStatus` são chamados mas `_pendingBatchCount` tinha sido incrementado em `upload()` (linha 61) e decrementado dentro de `performUpload`. A `triggerBackfill` não usa `upload()` — chama `performUpload` directamente sem incrementar `_pendingBatchCount`. O badge fica a 0 durante o backfill mesmo que haja rows pendentes.

**Fix:** Incrementar e decrementar `_pendingBatchCount` também em `triggerBackfill`, ou chamar `upload()` em vez de `performUpload` directamente:

```swift
func triggerBackfill(deviceID: UUID, deviceType: String, sinceTimestamp: Date) {
  // Reutilizar upload() que já gere o pendingBatchCount
  // (backfill_streams corre antes, depois o upload normal)
  Task.detached(priority: .utility) { [weak self] in
    guard let self else { return }
    // backfill_streams...
    // ...
    // Usar upload() em vez de performUpload() para incrementar o contador
    upload(deviceID: deviceID, deviceType: deviceType, sinceTimestamp: sinceTimestamp)
  }
}
```

---

## Info

### IN-01: `(try? RemoteServerKeychain.loadToken()) ?? nil` é redundante

**File:** `GooseSwift/GooseUploadService.swift:80`, `GooseSwift/GooseUploadService.swift:187`, `GooseSwift/GooseAppModel+Upload.swift:108`, `GooseSwift/GooseAppModel+Upload.swift:268`

**Issue:** `loadToken()` é declarado como `throws -> String?`. `try?` converte isso em `String??` (Optional of Optional). O `?? nil` colapsa o Optional duplo para `String?`. O padrão funciona mas é verboso e enganador — sugere que `try?` poderia retornar um `String` não-opcional, quando na realidade `?? nil` é necessário exactamente porque `loadToken` devolve `String?`.

**Fix:** Usar `flatMap` ou simplificar com opcional chaining:

```swift
// Antes:
guard let token = (try? RemoteServerKeychain.loadToken()) ?? nil, !token.isEmpty else { ... }
// Depois:
guard let token = try? RemoteServerKeychain.loadToken(), !token.isEmpty else { ... }
// (funciona porque try? de throws->Optional<T> produz Optional<Optional<T>>,
//  mas a atribuição a `let token` via guard let faz double-unwrap automático)
```

---

### IN-02: `isoFromUnix` aloca um novo `ISO8601DateFormatter` por frame dentro do loop de importação

**File:** `GooseSwift/GooseAppModel+Upload.swift:252-257`

**Issue:** `isoFromUnix` é chamada dentro de `.compactMap` (linha 185) que itera até 5 000 frames por página e até 200 páginas por dispositivo. Cada chamada cria um novo `ISO8601DateFormatter`. Embora `ISO8601DateFormatter` seja thread-safe após configuração, a alocação repetida é dispendiosa. (Nota: questão de performance — indicado como Info dado o scope v1.)

**Fix:** Usar um formatter estático partilhado (thread-safe após init):

```swift
private static let isoFormatter: ISO8601DateFormatter = {
  let f = ISO8601DateFormatter()
  f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  return f
}()

nonisolated private func isoFromUnix(_ ts: Double) -> String {
  GooseAppModel.isoFormatter.string(from: Date(timeIntervalSince1970: ts))
}
```

---

_Reviewed: 2026-06-11T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
