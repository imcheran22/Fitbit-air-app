---
phase: 62-upload-watermark-per-sensor
fixed_at: 2026-06-11T00:00:00Z
review_path: .planning/phases/62-upload-watermark-per-sensor/62-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 4
skipped: 2
status: partial
---

# Phase 62: Code Review Fix Report

**Fixed at:** 2026-06-11T00:00:00Z
**Source review:** .planning/phases/62-upload-watermark-per-sensor/62-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (3 Critical + 3 Warning)
- Fixed: 4 (CR-01, CR-02, CR-03, WR-01)
- Skipped: 2 (WR-02, WR-03)

## Fixed Issues

### CR-01: Watermark usa max(data.ts) em vez de Date()

**Files modified:** `GooseSwift/GooseUploadService.swift`
**Commit:** ea52fc4
**Applied fix:** Após construir os 8 arrays de streams, calcula `maxDataTs` iterando todos os items de cada stream e extraindo o campo `"ts"`. Calcula `uploadedUntil = min(Date(timeIntervalSince1970: maxDataTs), Date())` com fallback para `effectiveSince` se nenhum ts válido for encontrado (protecção contra clock skew). Substitui `GooseUploadWatermark.update(.decodedStreams, to: Date())` por `GooseUploadWatermark.update(.decodedStreams, to: uploadedUntil)`.

---

### CR-02: Watermark decodedStreams restrito a dispositivos WHOOP

**Files modified:** `GooseSwift/GooseUploadService.swift`
**Commit:** 9affa3c
**Applied fix:** Adicionado `let isWhoopDevice = deviceType == "GEN4" || deviceType == "GOOSE"` e o `GooseUploadWatermark.update(.decodedStreams, ...)` só é chamado quando `isWhoopDevice` é true. O upload do HR monitor (deviceType != "GEN4" && != "GOOSE") conclui com sucesso mas não avança o watermark — o próximo ciclo WHOOP parte do watermark correcto em vez de T_HR. Comentário documenta o porquê explicitamente.

---

### CR-03: Passa since_ts ao Rust em captureAllPendingRowIDs

**Files modified:** `GooseSwift/GooseUploadService.swift`
**Commit:** 2cac53d
**Applied fix:** Adicionado `"since_ts": sinceTs` ao dict de args da chamada `sync.rows_pending_upload` dentro do loop `captureAllPendingRowIDs`. O Rust aplica agora o filtro de timestamp antes do `limit=500`, garantindo que as 500 linhas retornadas são todas relevantes (ts >= sinceTs). O filtro Swift existente na linha seguinte mantém-se como safety net para o caso do Rust não suportar ainda o parâmetro.

---

### WR-01: Falhas de sync.mark_synced elevadas para .warning

**Files modified:** `GooseSwift/GooseUploadService.swift`
**Commit:** 5ecfb55
**Applied fix:** Mudado `logger.debug` para `logger.warning` no bloco `catch` de `markStreamsSynced`. Adicionado comentário a explicar o impacto: linhas não marcadas com `synced=0` podem ficar orphaned quando o watermark avança. É uma mudança de 1 linha + comentário.

---

## Skipped Issues

### WR-02: runHealthCheck usa DispatchSemaphore + URLSession.dataTask

**File:** `GooseSwift/GooseAppModel+Upload.swift:334`
**Reason:** skipped — refactoring para async/await envolve mudança de assinatura da função e dois call sites (checkServerHealth, triggerHealthCheckIfNeeded). Fora do scope do watermark. Não há risco imediato de deadlock no contexto GCD actual.
**Original issue:** DispatchSemaphore inconsistente com o padrão async/await do resto do ficheiro.

---

### WR-03: triggerBackfill não incrementa _pendingBatchCount

**File:** `GooseSwift/GooseUploadService.swift:378`
**Reason:** skipped — requer refactoring do fluxo de chamada de triggerBackfill (chamar upload() em vez de performUpload() directamente, ou gerir o contador manualmente). Potencialmente disruptivo para o badge tracking. Fora do scope do watermark.
**Original issue:** Badge pode mostrar 0 durante backfill mesmo com rows pendentes.

---

_Fixed: 2026-06-11T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
