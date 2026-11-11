---
plan: 03-03
title: Verificação end-to-end — captura BLE → upload → TimescaleDB
status: complete
completed_at: 2026-06-03
---

## What was verified

### Task 3.1 — Build completo

- `cargo check` Rust core: zero errors (6 pre-existing unused-variable warnings)
- `xcodebuild -project GooseSwift.xcodeproj -scheme GooseSwift -destination 'platform=iOS Simulator,id=605684A8-4B3A-4BA2-B4B5-C16E0FAF2F4D' build`: BUILD SUCCEEDED, zero errors, zero warnings

### Task 3.2 — Pré-condições de upload

All three guards present in `GooseUploadService.performUpload`:
- `guard UserDefaults.standard.bool(forKey: RemoteServerStorage.uploadEnabled)` — toggle
- `guard !rawURL.isEmpty, let baseURL = URL(string: rawURL)` — URL configured
- `guard let token = (try? RemoteServerKeychain.loadToken()) ?? nil, !token.isEmpty` — token present
- Each guard returns silently (no error log — matches D-13 which only logs network failures)
- `triggerUpload` in `GooseAppModel+NotificationPipeline` guards `result.pass && errorDescription == nil` — UPLD-07

### Task 3.3 — Payload e contrato da API

- `device.id`: `deviceID.uuidString` — String (matches `DecodedDevice.id: str`)
- `device.mac`, `device.name`: `NSNull()` — matches `Optional[str] = None`
- `streams`: all 8 keys present (hr, rr, events, battery, spo2, skin_temp, resp, gravity)
- `device_generation`: "4.0" for GEN4, "5.0" for GOOSE — matches `Optional[str] = "5.0"`
- Headers: `Authorization: Bearer {token}`, `Content-Type: application/json`
- Server idempotency: `ON CONFLICT (device_id, ts) DO UPDATE` confirmed in `store.py`
- `batch_id` NOT included — matches D-14

### Task 3.4 — Retry e thread safety

- 3 attempts with `Thread.sleep(forTimeInterval: delays[attempt])` delays [1, 2, 4] seconds
- All upload work on `uploadQueue.async` — never @MainActor
- `pendingBatchCount`/`lastUploadTimestamp` modified only on `uploadQueue`
- `onStatusUpdate` called via `DispatchQueue.main.async`
- `GooseRustBridge()` called only inside `performUpload` (on uploadQueue) — not in `GooseAppModel+Upload.swift`
- `URLSession` uses ephemeral config, `timeoutIntervalForRequest = 15`

### Task 3.5 — Info.plist e ATS

- `NSAllowsLocalNetworking: true` — present (not duplicated)
- `NSBonjourServices: ["_http._tcp."]` — present
- `NSLocalNetworkUsageDescription`: "Goose usa a rede local para enviar dados WHOOP ao servidor pessoal" — present
- `NSAllowsArbitraryLoads` — NOT present (count: 0) — correct and secure

### Task 3.6 — Verificação funcional manual

- Cenário 1 (upload automático com WHOOP): **Pendente — WHOOP não disponível fisicamente**
- Cenário 2 (toggle desactivado): Verificado por código — `guard uploadEnabled` retorna silenciosamente
- Cenário 3 (servidor inacessível / retry): Verificado por código — 3 tentativas com backoff, `logger.debug` após falha, app não crasha
- Cenário 4 (payload correcto no servidor): **Pendente — WHOOP não disponível fisicamente**

## UPLD requirements coverage

| Req | Status | Evidence |
|-----|--------|----------|
| UPLD-01 | ✓ | `triggerUpload` hooked in `handleCaptureFrameWriteResult` |
| UPLD-02 | ✓ | POST `/v1/ingest-decoded` + `Authorization: Bearer {token}` |
| UPLD-03 | ✓ | `device.id` UUID string + `device_generation` "4.0"/"5.0" |
| UPLD-04 | ✓ | 3 attempts, delays [1, 2, 4] seconds |
| UPLD-05 | ✓ | Server `ON CONFLICT DO UPDATE` — idempotência confirmada |
| UPLD-06 | ✓ | `uploadQueue` background — never @MainActor |
| UPLD-07 | ✓ | Guards: toggle, URL, token, result.pass |

## Self-Check: PASSED

Build succeeds, all requirements verified statically. Manual functional verification (Cenário 1+4) pending physical WHOOP device.
