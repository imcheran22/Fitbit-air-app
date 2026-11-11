---
id: SEED-007
status: activated
planted: 2026-06-15
planted_during: v12.0 — best practices audit (gsd-explore)
trigger_when: próxima fase de code health, ou antes de qualquer fase que toque em CaptureFrameWriteQueue / HealthDataStore / GooseAppModel+Upload
scope: medium
implemented_in: Gap 1 (BP-01) Phase 96 v13.0; Gap 2 (BP-03) Phase 110 v14.0
---

# SEED-007: Best Practices Gaps — Swift Silent Failures + Rust Connection Pool

## Why This Matters

Auditoria de best practices 2026-06-15 com 3 agentes Explore independentes identificou dois gaps
que NÃO estão cobertos por SEED-004 (que foca na decomposição estrutural dos god files).

## Gap 1 — 9 Silent `try?` Failures em Swift (P0)

9 chamadas `try?` à Rust bridge descartam erros silenciosamente em operações críticas.
Quando `capture.import_frame_batch` ou `sync.backfill_streams` falham, a app regista
sucesso e o utilizador perde dados sem qualquer aviso.

**Localizações confirmadas:**

| Ficheiro | Linha | Método |
|---------|------|--------|
| CaptureFrameWriteQueue.swift | 338 | capture.import_frame_batch |
| GooseAppModel+Upload.swift | 226 | capture.import_frame_batch |
| GooseAppModel+Upload.swift | 251 | sync.backfill_streams |
| HealthDataStore+Sleep.swift | 234 | metrics.sleep_input_extraction |
| HealthDataStore+Sleep.swift | 247 | metrics.sleep_input_extraction |
| HealthDataStore+Sleep.swift | 295 | sleep metric |
| HealthDataStore+V24Biometrics.swift | 92 | biometrics import |
| GooseUploadService.swift | 406 | pending rows check |

**Fix pattern:**
```swift
// Antes:
_ = try? bridge.request(method: "capture.import_frame_batch", args: [...])

// Depois:
do {
    _ = try bridge.request(method: "capture.import_frame_batch", args: [...])
} catch {
    ble.record(level: .error, "import_frame_batch failed: \(error)")
}
```

Esforço: ~2-3h. Sem risco de regressão — apenas adiciona logging onde hoje há silêncio.

## Gap 2 — Sem Connection Pool no Rust (P1)

Cada chamada FFI do Swift abre uma nova `Connection::open()` para o mesmo ficheiro SQLite.
Com 7 instâncias de bridge em paralelo, há lock contention que WAL mitiga mas não elimina.

**Localização:** `Rust/core/src/store.rs:1057-1062`

**Fix recomendado:** `thread_local!` connection cache por thread, ou `r2d2` pool.
```rust
thread_local! {
    static CONN: RefCell<Option<Connection>> = RefCell::new(None);
}
```

Esforço: ~4-6h. Maior impacto em sessões com overnight guard (múltiplas writes simultâneas).

## Gap 3 — `nonisolated(unsafe)` sem locks explícitos (Swift, secundário)

`frameReassemblyBuffers` e `captureFrameRowBuildQueueDepth` em `GooseAppModel.swift:159-175`
usam `nonisolated(unsafe)` que contorna a verificação do compilador Swift.
Protegidos por `frameReassemblyLock` (NSLock) mas a anotação permite acesso acidental
sem lock em código futuro.

**Fix:** Encapsular num tipo thread-safe ou mover para queue-isolated state.

## Quando Activar

- **Imediato:** Gap 1 (try? silent failures) — pode ser feito como `/gsd-quick` antes da próxima fase
- **P1:** Gap 2 antes de qualquer optimização de throughput de dados
- **P2:** Gap 3 quando GooseAppModel for refactorizado (coberto em SEED-004, Sprint 3)

## Seeds Relacionadas

- `SEED-004` — cobre decomposição estrutural bridge.rs/store.rs (este seed é ortogonal — foca nos gaps não cobertos)
- Todo: `fix-silent-try-failures.md` em `.planning/todos/pending/`
