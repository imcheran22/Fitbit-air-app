---
phase: 3
plan: 03
title: Verificação end-to-end — captura BLE → upload → TimescaleDB
wave: 3
depends_on:
  - "03-PLAN-01"
  - "03-PLAN-02"
files_modified: []
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
Verificar que o pipeline completo funciona: app iOS captura pacotes BLE do WHOOP, dados são persistidos no SQLite local pelo Rust bridge, `GooseUploadService` compõe o payload e faz POST `/v1/ingest-decoded` ao servidor Goose com Bearer token, e as rows aparecem nas hypertables TimescaleDB. Inclui verificação de retry com falha de rede simulada e verificação de que o toggle desativado não envia pedidos.
</objective>

<tasks>

<task id="3.1" type="execute">
<title>Verificar build completo e sem warnings críticos</title>
<read_first>
- GooseSwift/GooseUploadService.swift — ler ficheiro completo para confirmar que está correcto antes de tentar build
- GooseSwift/GooseAppModel+Upload.swift — ler ficheiro completo
- GooseSwift/GooseAppModel+NotificationPipeline.swift — confirmar que `triggerUpload` está presente em `handleCaptureFrameWriteResult`
</read_first>
<action>
Executar build completo do projecto iOS para o simulador e verificar resultado:

```bash
xcodebuild -project GooseSwift.xcodeproj \
  -scheme GooseSwift \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  build \
  2>&1 | grep -E "BUILD|error:|warning:.*GooseUpload" | tail -20
```

Se o build falhar:
1. Ler os erros completos: `… 2>&1 | grep "error:" | head -20`
2. Corrigir os erros nos ficheiros afectados (GooseUploadService.swift, GooseAppModel+Upload.swift, ou bridge.rs)
3. Repetir até BUILD SUCCEEDED

Verificar também que o Rust core compila:
```bash
cd Rust/core && cargo check 2>&1 | grep -E "^error" | head -10
```
</action>
<acceptance_criteria>
- `xcodebuild ... build 2>&1 | tail -3` termina com `BUILD SUCCEEDED`
- `cd Rust/core && cargo check 2>&1 | grep "^error"` — zero erros
- `grep -n "error:" /tmp/build-phase3.log 2>/dev/null | grep -v "//\|print\|NSError\|errorDescription"` — zero erros de compilação reais (excluindo strings/comentários com "error:")
</acceptance_criteria>
</task>

<task id="3.2" type="execute">
<title>Verificar pré-condições de upload (toggle, URL, token)</title>
<read_first>
- GooseSwift/GooseUploadService.swift — ler função `performUpload` para confirmar os guards de pré-condição (D-07)
</read_first>
<action>
Verificação por leitura de código (sem executar no simulador):

1. Confirmar que `GooseUploadService.performUpload` tem os 3 guards:
   - `guard UserDefaults.standard.bool(forKey: RemoteServerStorage.uploadEnabled) else { return }` — toggle
   - `guard !rawURL.isEmpty, let baseURL = URL(string: rawURL) else { return }` — URL configurada
   - `guard let token = ..., !token.isEmpty else { return }` — token presente

2. Confirmar que cada guard faz `return` silenciosamente (sem logar erro — D-13 apenas loga falha de rede após 3 tentativas, não falha de pré-condição)

3. Confirmar que `triggerUpload` em `GooseAppModel+NotificationPipeline.swift` tem guard:
   - `guard result.pass, result.errorDescription == nil else { return }` — só em batches válidos

4. Verificar que `pendingBatchCount` não incrementa se as pré-condições falham (para não acumular contagem incorrecta na Phase 4)
</action>
<acceptance_criteria>
- `grep -c "guard.*uploadEnabled\|uploadEnabled.*guard" GooseSwift/GooseUploadService.swift` — guard de toggle existe
- `grep -c "guard.*isEmpty\|isEmpty.*guard\|guard.*rawURL\|guard.*baseURL" GooseSwift/GooseUploadService.swift` — guard de URL existe
- `grep -c "guard.*token\|token.*guard" GooseSwift/GooseUploadService.swift` — guard de token existe
- `grep -n "result.pass\|errorDescription == nil" GooseSwift/GooseAppModel+NotificationPipeline.swift` — guard no hook (UPLD-07)
- Código verificado por leitura; não é necessário execução no simulador para esta tarefa
</acceptance_criteria>
</task>

<task id="3.3" type="execute">
<title>Verificar payload e contrato da API</title>
<read_first>
- GooseSwift/GooseUploadService.swift — ler a secção de construção do payload (task 1.2 da PLAN-01)
- /Users/francisco/Documents/my-whoop/server/ingest/app/main.py — confirmar modelo `DecodedBatch`: campos `device.id`, `device.mac`, `device.name`, `streams`, `device_generation`
</read_first>
<action>
Verificar por leitura de código que o payload construído em `GooseUploadService` corresponde ao contrato `DecodedBatch` do servidor:

1. `device.id` é `deviceID.uuidString` (String, não UUID) — compatível com `DecodedDevice.id: str`
2. `device.mac` e `device.name` são `NSNull()` — compatível com `Optional[str] = None`
3. `streams` contém as chaves: `hr`, `rr`, `events`, `battery`, `spo2`, `skin_temp`, `resp`, `gravity` — compatível com `DecodedStreams` do servidor
4. `device_generation` é `"4.0"` ou `"5.0"` — compatível com `Optional[str] = "5.0"`
5. Header `Authorization: Bearer {token}` — compatível com `require_auth` do servidor
6. `Content-Type: application/json` — necessário para FastAPI parsear o body

Verificar idempotência (UPLD-05): o servidor usa `ON CONFLICT (device_id, ts) DO UPDATE` — os mesmo dados podem ser reenviados em retry sem duplicar rows. Confirmar por leitura de `store.upsert_streams` em `/Users/francisco/Documents/my-whoop/server/ingest/app/store.py`.
</action>
<acceptance_criteria>
- `grep -n "uuidString\|device.*id.*UUID" GooseSwift/GooseUploadService.swift` — device ID como String
- `grep -n "NSNull\|mac.*null\|name.*null" GooseSwift/GooseUploadService.swift` — mac e name são null
- `grep -n "device_generation\|4.0\|5.0" GooseSwift/GooseUploadService.swift` — generation presente
- `grep -n "Authorization.*Bearer\|Content-Type.*application/json" GooseSwift/GooseUploadService.swift` — headers corretos
- `grep -n "ON CONFLICT\|upsert" /Users/francisco/Documents/my-whoop/server/ingest/app/store.py` — idempotência confirmada no servidor
</acceptance_criteria>
</task>

<task id="3.4" type="execute">
<title>Verificar retry logic e thread safety</title>
<read_first>
- GooseSwift/GooseUploadService.swift — ler a implementação completa do retry loop e `performRequest`
- GooseSwift/CaptureFrameWriteQueue.swift — ver padrão de `NSLock` e `@unchecked Sendable` para comparação
</read_first>
<action>
Verificar por leitura de código:

1. **Retry (D-12):** Confirmar que há exatamente 3 tentativas com delays 1s, 2s, 4s entre tentativas (ou após a primeira falha). Os delays devem ser `[1, 2, 4]` (delay antes da tentativa 2, 3 e — após a terceira falha — nenhum mais).

2. **Thread safety (UPLD-06):**
   - `performUpload` corre exclusivamente dentro de `uploadQueue.async` — nunca invocado directamente do `@MainActor`
   - `pendingBatchCount` e `lastUploadTimestamp` são modificados apenas dentro da `uploadQueue` — sem race condition
   - `onStatusUpdate` é chamado via `DispatchQueue.main.async` — chega ao `@MainActor` correctamente

3. **Rust bridge (arquitectura anti-pattern):**
   - `rust.request(...)` é chamado dentro de `performUpload` que corre na `uploadQueue` (background) — NUNCA em `@MainActor`
   - Confirmar que `GooseAppModel+Upload.swift` não chama `rust.request` directamente

4. **URLSession:**
   - Usa `session.dataTask` com semáforo ou sync wrapper — não `URLSession.shared` (que pode ter conflitos)
   - Timeout de 15 segundos por tentativa (D-specifics)

Se qualquer problema for encontrado, corrigi-lo nos ficheiros afectados antes de prosseguir.
</action>
<acceptance_criteria>
- `grep -n "Thread.sleep\|DispatchSemaphore\|1.*2.*4\|delays\[1\]\|delays\[2\]" GooseSwift/GooseUploadService.swift` — backoff implementado
- `grep -n "uploadQueue.async\|uploadQueue.sync" GooseSwift/GooseUploadService.swift` — tudo corre na upload queue
- `grep -n "DispatchQueue.main.async\|@MainActor" GooseSwift/GooseUploadService.swift` — status update usa main queue
- `grep -n "rust.request\|GooseRustBridge" GooseSwift/GooseAppModel+Upload.swift` — NÃO deve existir (rust bridge só em GooseUploadService)
- `grep "timeoutIntervalForRequest.*15\|15.*timeoutInterval" GooseSwift/GooseUploadService.swift` — timeout correcto
</acceptance_criteria>
</task>

<task id="3.5" type="execute">
<title>Verificar Info.plist e ATS</title>
<read_first>
- GooseSwift/Info.plist — ler entradas de rede local: NSAllowsLocalNetworking, NSBonjourServices, NSLocalNetworkUsageDescription
</read_first>
<action>
Verificar por leitura que o Info.plist está correcto para comunicação HTTP com servidor mDNS:

1. `NSAllowsLocalNetworking: true` — deve existir (D-02: ATS permite HTTP para redes locais com esta chave)
2. `NSBonjourServices: [_http._tcp.]` — deve existir (D-01: descoberta mDNS)
3. `NSLocalNetworkUsageDescription: "Goose usa a rede local para enviar dados WHOOP ao servidor pessoal"` — deve existir (D-01: permissão de rede local)

Confirmar que NÃO existe `NSAppTransportSecurity > NSAllowsArbitraryLoads: true` — não é necessário e é inseguro.

Se alguma entrada estiver em falta, adicioná-la agora.
</action>
<acceptance_criteria>
- `grep -n "NSAllowsLocalNetworking" GooseSwift/Info.plist` — presente com valor `<true/>`
- `grep -n "NSBonjourServices" GooseSwift/Info.plist` — presente com `_http._tcp.`
- `grep -n "NSLocalNetworkUsageDescription" GooseSwift/Info.plist` — presente com texto em português
- `grep -c "NSAllowsArbitraryLoads" GooseSwift/Info.plist` — deve ser 0 (não deve existir)
</acceptance_criteria>
</task>

<task id="3.6" type="execute">
<title>Verificação funcional manual — upload ao servidor local</title>
<read_first>
- Nenhum ficheiro de código a ler — verificação funcional no simulador/device
</read_first>
<action>
**Pré-requisitos:**
1. Servidor Goose (Phase 1) deve estar a correr: `docker compose up -d` em `server/`
2. `GET http://goose.local:8770/healthz` deve retornar `{"status": "ok"}`
3. Tab More → Remote Server: configurar URL (`http://goose.local:8770`), Bearer token, e activar toggle

**Cenário 1 — Upload automático com WHOOP conectado:**
1. Abrir app → tab Home → conectar ao WHOOP
2. Aguardar 5–10 segundos de captura BLE activa
3. Verificar logs BLE (tab More → Logs): deve aparecer linha `capture.import.ok` seguida de actividade da upload queue
4. Verificar servidor: `curl -H "Authorization: Bearer $TOKEN" http://goose.local:8770/v1/summary?device=<uuid>` — deve retornar contagens > 0
5. Verificar TimescaleDB: `psql $GOOSE_DB_DSN -c "SELECT count(*) FROM hr_samples WHERE device_id = '<uuid>'"` — deve ser > 0

**Cenário 2 — Toggle desactivado:**
1. Tab More → Remote Server → desactivar toggle
2. Aguardar captura BLE → verificar que NÃO aparecem pedidos nos logs do servidor (`docker logs goose-ingest --tail 20`)

**Cenário 3 — Servidor inacessível (retry):**
1. Parar servidor: `docker compose stop goose-ingest`
2. Capturar alguns segundos de dados BLE
3. Verificar logs: deve aparecer tentativa de upload falhada (máximo 3 vezes) e depois descarte silencioso — app não crasha, BLE continua a capturar

**Cenário 4 — Payload correcto:**
1. Com servidor a correr, capturar dados e verificar um POST no log do servidor:
   `docker logs goose-ingest --tail 5` — deve mostrar `POST /v1/ingest-decoded 200`
2. Verificar que `device_id` no servidor corresponde ao UUID BLE do dispositivo WHOOP

**Nota:** Se WHOOP não estiver disponível fisicamente, os Cenários 1 e 4 podem ser substituídos pela verificação de que o código tem todos os guards corretos (Cenários 2 e 3 são verificáveis sem dispositivo).
</action>
<acceptance_criteria>
- Cenário 1: Servidor retorna contagens > 0 para o device_id após captura BLE activa (`curl /v1/summary` mostra rows)
- Cenário 1: `POST /v1/ingest-decoded 200` aparece nos logs do servidor
- Cenário 2: Logs do servidor não mostram pedidos quando toggle está desactivado
- Cenário 3: App não crasha com servidor inacessível; BLE continua funcional durante e após tentativas falhadas
- Cenário 4: `device_id` no servidor corresponde ao UUID BLE do WHOOP (verificável em `/v1/devices`)
- Se dispositivo físico não disponível: Cenário 1 e 4 marcados como "Verificação manual pendente — WHOOP não disponível" e os outros cenários (2, 3) verificados
</acceptance_criteria>
</task>

</tasks>

<verification>
1. Build final: `xcodebuild -project GooseSwift.xcodeproj -scheme GooseSwift -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | tail -3` — BUILD SUCCEEDED
2. Rust core: `cd Rust/core && cargo check 2>&1 | grep "^error"` — zero erros
3. Cobertura de requisitos:
   - UPLD-01: `grep -rn "triggerUpload\|performUpload" GooseSwift/` — upload automático ligado ao pipeline BLE
   - UPLD-02: `grep -n "Authorization.*Bearer\|/v1/ingest-decoded" GooseSwift/GooseUploadService.swift` — POST correcto com Bearer
   - UPLD-03: `grep -n "device_generation\|GEN4.*4.0\|uuidString" GooseSwift/GooseUploadService.swift` — payload correcto
   - UPLD-04: `grep -n "delays\|retry\|1.*2.*4" GooseSwift/GooseUploadService.swift` — retry presente
   - UPLD-05: Idempotência garantida pelo servidor (`ON CONFLICT ... DO UPDATE`) — verificado em task 3.3
- D-14: `batch_id` NÃO é enviado no payload — servidor usa `ON CONFLICT (device_id, ts) DO UPDATE` por stream; idempotência implícita sem `batch_id` explícito
   - UPLD-06: `grep -n "uploadQueue.async" GooseSwift/GooseUploadService.swift` — queue dedicada
   - UPLD-07: `grep -n "uploadEnabled\|guard.*pass\|guard.*token" GooseSwift/` — todas as guards presentes
4. Info.plist: `grep -c "NSBonjourServices\|NSLocalNetworkUsageDescription\|NSAllowsLocalNetworking" GooseSwift/Info.plist` — deve ser 3
5. Anti-pattern check: `grep -rn "rust.request\|GooseRustBridge()" GooseSwift/GooseAppModel+Upload.swift` — zero resultados (Rust bridge não chamado de @MainActor)
</verification>

<must_haves>
<truths>
- UPLD-01: Dados biométricos são enviados automaticamente após cada batch SQLite confirmado (hook em `handleCaptureFrameWriteResult`)
- UPLD-02: Upload usa `POST /v1/ingest-decoded` com header `Authorization: Bearer {token}`
- UPLD-03: Payload inclui `device.id` (UUID BLE como String) e `device_generation` ("4.0" para GEN4, "5.0" para GOOSE)
- UPLD-04: Retry: 3 tentativas com backoff 1s/2s/4s — não mais, não menos
- UPLD-05: Idempotência garantida pelo servidor via `ON CONFLICT (device_id, ts) DO UPDATE` — sem `batch_id` necessário no cliente iOS
- UPLD-06: Upload corre na `uploadQueue` dedicada — UI e BLE não são bloqueados
- UPLD-07: Upload não ocorre se: toggle desactivado, URL não configurada, ou token ausente
- Servidor Goose (Phase 1) deve estar acessível via `http://goose.local:8770` para verificação funcional completa
- Success Criteria do ROADMAP Phase 3 verificados: dados nas hypertables, payload correcto, retry funcional, UI não bloqueada, toggle respeitado
</truths>
</must_haves>
