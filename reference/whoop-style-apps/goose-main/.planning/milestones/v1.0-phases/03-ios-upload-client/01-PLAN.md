---
phase: 3
plan: 01
title: Rust bridge upload method + GooseUploadService
wave: 1
depends_on: []
files_modified:
  - Rust/core/src/bridge.rs
  - GooseSwift/GooseUploadService.swift
autonomous: true
requirements:
  - UPLD-01
  - UPLD-02
  - UPLD-03
  - UPLD-04
  - UPLD-05
  - UPLD-06
  - UPLD-07
---

<objective>
Criar `GooseUploadService.swift` — serviço de upload isolado com DispatchQueue dedicada, URLSession, retry com backoff — e adicionar ao Rust bridge o método `upload.get_recent_decoded_streams` que consulta as hypertable rows inseridas recentemente para um device_id e timestamp, compondo o payload `DecodedBatch` sem tocar na thread principal.
</objective>

<tasks>

<task id="1.1" type="execute">
<title>Adicionar método upload.get_recent_decoded_streams ao Rust bridge</title>
<read_first>
- Rust/core/src/bridge.rs — ler o padrão de dispatch de métodos (linhas ~2200–2300): estrutura `"method_name" => request_args::<ArgsStruct>(&request).and_then(fn_bridge)…`; ler como outros métodos de leitura recentes são implementados (ex: `capture.timeline`)
- Rust/core/src/capture_import.rs — confirmar campos disponíveis nas tabelas SQLite (hr_samples, rr_samples, events, battery, spo2, skin_temp, resp, gravity) e que as rows têm coluna `ts` como Unix timestamp (float/real)
</read_first>
<action>
Em `Rust/core/src/bridge.rs`:

1. Adicionar struct de args (junto aos outros structs de args de métodos semelhantes):
```
#[derive(Debug, Deserialize)]
struct UploadGetRecentDecodedStreamsArgs {
    database_path: String,
    device_id: String,
    since_ts: f64,   // Unix timestamp (seconds); fetch rows with ts >= since_ts
}
```

2. Adicionar struct de resultado:
```
#[derive(Debug, Serialize)]
struct RecentDecodedStreams {
    hr: Vec<serde_json::Value>,
    rr: Vec<serde_json::Value>,
    events: Vec<serde_json::Value>,
    battery: Vec<serde_json::Value>,
    spo2: Vec<serde_json::Value>,
    skin_temp: Vec<serde_json::Value>,
    resp: Vec<serde_json::Value>,
    gravity: Vec<serde_json::Value>,
}
```

3. Implementar função bridge:
```
fn upload_get_recent_decoded_streams_bridge(
    args: UploadGetRecentDecodedStreamsArgs,
) -> GooseResult<serde_json::Value> {
    let store = open_bridge_store(&args.database_path)?;
    // Query each decoded stream table for rows with ts >= since_ts and device_id = args.device_id
    // Use store.conn() or store.immediate_transaction() with raw SQL SELECT per stream table
    // Stream tables: hr_samples, rr_samples, events (vital_events), battery_samples,
    //                spo2_samples, skin_temp_samples, resp_samples, gravity_samples
    // Each row should be serialized as a JSON object with all its columns
    let streams = store.immediate_transaction(|store| {
        let conn = store.conn();
        let query_stream = |table: &str| -> GooseResult<Vec<serde_json::Value>> {
            let mut stmt = conn.prepare(&format!(
                "SELECT row_to_json(t) FROM (SELECT * FROM {} WHERE device_id = ? AND ts >= ?) t",
                table
            ))?;
            let rows = stmt.query_map([&args.device_id as &dyn rusqlite::ToSql, &args.since_ts], |row| {
                row.get::<_, String>(0)
            })?;
            rows.map(|r| r.map_err(|e| GooseError::message(e.to_string()))
                        .and_then(|s| serde_json::from_str(&s).map_err(|e| GooseError::message(e.to_string()))))
               .collect()
        };
        Ok(RecentDecodedStreams {
            hr: query_stream("hr_samples").unwrap_or_default(),
            rr: query_stream("rr_samples").unwrap_or_default(),
            events: query_stream("vital_events").unwrap_or_default(),
            battery: query_stream("battery_samples").unwrap_or_default(),
            spo2: query_stream("spo2_samples").unwrap_or_default(),
            skin_temp: query_stream("skin_temp_samples").unwrap_or_default(),
            resp: query_stream("resp_samples").unwrap_or_default(),
            gravity: query_stream("gravity_samples").unwrap_or_default(),
        })
    })?;
    serde_json::to_value(streams).map_err(|e| GooseError::message(format!("serialize failed: {e}")))
}
```

**IMPORTANTE — verificar nomes reais das tabelas SQLite antes de implementar:**
Ler `Rust/core/src/` para confirmar os nomes exactos das tabelas (podem ser `hr_samples`, `rr_intervals`, `vital_events`, etc.) — usar `grep -rn "CREATE TABLE\|INSERT INTO" Rust/core/src/` para confirmar. Adaptar a implementação aos nomes reais encontrados.

4. Adicionar dispatch no match de métodos (na secção de métodos `capture.*` ou numa nova secção `upload.*`):
```
"upload.get_recent_decoded_streams" => request_args::<UploadGetRecentDecodedStreamsArgs>(&request)
    .and_then(upload_get_recent_decoded_streams_bridge)
    .map(|value| bridge_ok(&request.request_id, value))
    .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
```
</action>
<acceptance_criteria>
- `grep -n "upload.get_recent_decoded_streams" Rust/core/src/bridge.rs` — método registado no match
- `grep -n "UploadGetRecentDecodedStreamsArgs" Rust/core/src/bridge.rs` — struct de args presente
- `grep -n "RecentDecodedStreams" Rust/core/src/bridge.rs` — struct de resultado presente
- `cargo build --target aarch64-apple-ios-sim 2>&1 | tail -5` — compila sem erros (ou `cargo check` se cross-compile não disponível no contexto)
- Método retorna JSON com chaves `hr`, `rr`, `events`, `battery`, `spo2`, `skin_temp`, `resp`, `gravity` (verificável por leitura do código)
</acceptance_criteria>
</task>

<task id="1.2" type="execute">
<title>Criar GooseUploadService.swift com queue dedicada, URLSession e retry</title>
<read_first>
- GooseSwift/CaptureFrameWriteQueue.swift — padrão exacto a replicar: `final class ... @unchecked Sendable`, `private let writeQueue = DispatchQueue(label: ..., qos: .utility)`, `private let stateLock = NSLock()`, `private let rust = GooseRustBridge()`. Ler ficheiro completo.
- GooseSwift/RemoteServerPersistence.swift — API de leitura de configuração: `RemoteServerStorage.serverURL`, `RemoteServerStorage.uploadEnabled`, `RemoteServerKeychain.loadToken()`. Ler ficheiro completo.
- GooseSwift/GooseBLETypes.swift — struct `GooseNotificationEvent` com campo `rustDeviceType: String` (retorna "GEN4" ou "GOOSE") e `deviceID: UUID`. Ler linhas 27–36.
- .planning/phases/03-ios-upload-client/03-CONTEXT.md — confirmar decisões D-05 a D-13 antes de implementar.
</read_first>
<action>
Criar `GooseSwift/GooseUploadService.swift` com:

**Imports:** `Foundation`

**Enum GooseUploadServiceError: Error** (para logging interno):
- `case disabled`
- `case notConfigured`
- `case networkError(Error)`
- `case serverError(Int)`

**Final class GooseUploadService: @unchecked Sendable** — padrão idêntico ao `CaptureFrameWriteQueue`:

Propriedades privadas:
- `private let uploadQueue = DispatchQueue(label: "com.goose.swift.upload", qos: .utility)`
- `private let rust = GooseRustBridge()`
- `private let databasePath: String`
- `private let session: URLSession` — inicializar com `URLSessionConfiguration.ephemeral` com `timeoutIntervalForRequest = 15`

Propriedades de estado (acedidas sob `uploadQueue`):
- `private var lastUploadTimestamp: Date?`
- `private var pendingBatchCount: Int = 0`

Propriedades publicáveis (lidas via closures no `@MainActor`):
- `var onStatusUpdate: (@MainActor (GooseUploadStatus) -> Void)?`

**Struct GooseUploadStatus** (valor imutável publicado ao `@MainActor`):
- `let lastUploadTimestamp: Date?`
- `let pendingBatchCount: Int`

**init(databasePath: String)**

**func upload(deviceID: UUID, deviceType: String, sinceTimestamp: Date)**:
- Chama `uploadQueue.async { [weak self] in self?.performUpload(...) }` sem bloquear o caller
- Incrementa `pendingBatchCount` antes do dispatch

**private func performUpload(deviceID: UUID, deviceType: String, sinceTimestamp: Date)**:
1. Verificar pré-condições (D-07):
   ```
   guard UserDefaults.standard.bool(forKey: RemoteServerStorage.uploadEnabled) else { return }
   let rawURL = UserDefaults.standard.string(forKey: RemoteServerStorage.serverURL) ?? ""
   guard !rawURL.isEmpty, let baseURL = URL(string: rawURL) else { return }
   guard let token = try? RemoteServerKeychain.loadToken(), let token, !token.isEmpty else { return }
   ```
2. Chamar Rust bridge para obter streams recentes (D-10):
   ```
   let streams = try rust.request(method: "upload.get_recent_decoded_streams", args: [
       "database_path": databasePath,
       "device_id": deviceID.uuidString,
       "since_ts": sinceTimestamp.timeIntervalSince1970,
   ])
   ```
   Se throw, decrementar `pendingBatchCount` e logar; return.
3. Verificar se há dados (evitar POST vazio):
   ```
   let hasData = (streams["hr"] as? [Any])?.isEmpty == false
       || (streams["rr"] as? [Any])?.isEmpty == false
       // … verificar todas as streams
   guard hasData else { pendingBatchCount -= 1; return }
   ```
4. Construir payload JSON (D-08, D-09, D-11):
   ```
   let deviceGeneration = deviceType == "GEN4" ? "4.0" : "5.0"
   let payload: [String: Any] = [
       "device": ["id": deviceID.uuidString, "mac": NSNull(), "name": NSNull()],
       "streams": streams,
       "device_generation": deviceGeneration,
   ]
   ```
5. Construir URLRequest:
   - `POST \(baseURL)/v1/ingest-decoded`
   - Headers: `Authorization: Bearer \(token)`, `Content-Type: application/json`
   - Body: `JSONSerialization.data(withJSONObject: payload)`
6. Retry loop (D-12) — 3 tentativas com backoff 1s/2s/4s:
   ```
   let delays: [TimeInterval] = [0, 1, 2, 4]  // delays[0] = 0 (primeira tentativa imediata)
   for attempt in 0..<3 {
       if attempt > 0 {
           Thread.sleep(forTimeInterval: delays[attempt])
       }
       // performRequest(request) — retorna Bool (sucesso)
       if success { break }
   }
   ```
7. Após sucesso: `lastUploadTimestamp = Date(); pendingBatchCount = max(0, pendingBatchCount - 1)`; publicar status ao `@MainActor`.
8. Após falha final (D-13): logar via OSLog ou via closure de logging; `pendingBatchCount = max(0, pendingBatchCount - 1)`.

**private func performRequest(_ request: URLRequest) -> Bool**:
- Usa `session.dataTask` com semáforo ou `DispatchSemaphore` para aguardar resultado (corremos numa `uploadQueue` background, não em `@MainActor` — bloquear é aceitável)
- Retorna `true` se `HTTPURLResponse.statusCode` está em `200..<300`, `false` caso contrário

**private func publishStatus()**:
- Cria `GooseUploadStatus(lastUploadTimestamp: lastUploadTimestamp, pendingBatchCount: pendingBatchCount)`
- `DispatchQueue.main.async { self.onStatusUpdate?(status) }`

**Adicionar ao Xcode target:** O ficheiro deve ser adicionado ao target `GooseSwift` no `GooseSwift.xcodeproj`. Verificar que está na lista de `sources` (project.pbxproj).
</action>
<acceptance_criteria>
- `ls GooseSwift/GooseUploadService.swift` — ficheiro existe
- `grep -n "com.goose.swift.upload" GooseSwift/GooseUploadService.swift` — label da queue correcto
- `grep -n "upload.get_recent_decoded_streams" GooseSwift/GooseUploadService.swift` — método Rust bridge invocado
- `grep -n "RemoteServerStorage.uploadEnabled\|RemoteServerStorage.serverURL\|RemoteServerKeychain" GooseSwift/GooseUploadService.swift` — pré-condições lidas da Phase 2
- `grep -n "Authorization.*Bearer\|Bearer.*token" GooseSwift/GooseUploadService.swift` — header de autenticação presente (UPLD-02)
- `grep -n "device_generation\|deviceGeneration" GooseSwift/GooseUploadService.swift` — device_generation incluído no payload (UPLD-03)
- `grep -n "GEN4.*4.0\|4.0.*GEN4" GooseSwift/GooseUploadService.swift` — mapeamento GEN4→"4.0" correcto (UPLD-03)
- `grep -n "Thread.sleep\|DispatchSemaphore\|1.*2.*4\|delays" GooseSwift/GooseUploadService.swift` — retry com backoff presente (UPLD-04)
- `grep -n "uploadQueue\|com.goose.swift.upload" GooseSwift/GooseUploadService.swift` — não bloqueia thread principal (UPLD-06)
- Projecto compila: `xcodebuild -project GooseSwift.xcodeproj -scheme GooseSwift -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | tail -3` — termina com `BUILD SUCCEEDED`
</acceptance_criteria>
</task>

</tasks>

<verification>
1. Rust bridge compila: `cd Rust/core && cargo check 2>&1 | grep -E "error|warning.*unused" | head -10` — zero erros
2. Método registado: `grep -c "upload.get_recent_decoded_streams" Rust/core/src/bridge.rs` — deve ser >= 2 (dispatch + implementação ou struct)
3. `ls GooseSwift/GooseUploadService.swift` — ficheiro existe
4. Checklist de requisitos:
   - UPLD-01: `grep "performUpload\|upload(deviceID" GooseSwift/GooseUploadService.swift` — função de upload existe
   - UPLD-02: `grep "Authorization.*Bearer" GooseSwift/GooseUploadService.swift` — header correcto
   - UPLD-03: `grep "device_generation\|GEN4" GooseSwift/GooseUploadService.swift` — geração incluída
   - UPLD-04: `grep "1.*2.*4\|delays\|retry" GooseSwift/GooseUploadService.swift` — retry com backoff
   - UPLD-06: `grep "uploadQueue.async\|com.goose.swift.upload" GooseSwift/GooseUploadService.swift` — queue dedicada
   - UPLD-07: `grep "uploadEnabled\|isEmpty.*return\|guard.*token" GooseSwift/GooseUploadService.swift` — guard de condições
5. Build iOS: `xcodebuild -project GooseSwift.xcodeproj -scheme GooseSwift -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | grep -E "BUILD|error:" | tail -5` — BUILD SUCCEEDED sem erros
</verification>

<must_haves>
<truths>
- D-05: `GooseUploadService` usa `DispatchQueue(label: "com.goose.swift.upload", qos: .utility)` — padrão idêntico ao `CaptureFrameWriteQueue`
- D-06: Lê `RemoteServerStorage.serverURL` (UserDefaults), `RemoteServerStorage.uploadEnabled` (UserDefaults), e `RemoteServerKeychain.loadToken()` (Keychain) — chaves definidas na Phase 2
- D-07: Upload não ocorre se `uploadEnabled == false`, URL vazia, ou token ausente — guard no início de `performUpload`
- D-08: Payload inclui `device`, `streams`, `device_generation` — contrato `DecodedBatch` do servidor
- D-09: `device.id` é `deviceID.uuidString` (UUID BLE como String)
- D-11: `device_generation` é `"4.0"` se `rustDeviceType == "GEN4"`, caso contrário `"5.0"`
- D-12: Retry: 3 tentativas com backoff 1s/2s/4s (delays[1]=1, delays[2]=2, delays[3]=4)
- D-13: Falha após 3 tentativas: logar e descartar silenciosamente — sem queue persistente em v1
- D-14: `batch_id` NÃO incluído no payload de `/v1/ingest-decoded` — idempotência é garantida pelo servidor via `ON CONFLICT (device_id, ts) DO UPDATE` por stream; não é responsabilidade do cliente iOS
- UPLD-06: Upload corre exclusivamente na `uploadQueue` (background) — nunca bloqueia `@MainActor`
- URLSession usa `ephemeralSession()` com `timeoutIntervalForRequest = 15` — D-specifics
- `GooseUploadStatus` tem campos `lastUploadTimestamp` e `pendingBatchCount` — para Phase 4 (FEED-03, FEED-04)
</truths>
</must_haves>
