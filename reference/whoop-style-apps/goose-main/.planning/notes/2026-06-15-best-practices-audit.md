---
date: "2026-06-15 00:00"
promoted: false
---

Auditoria de best practices realizada com 3 agentes Explore paralelos sobre Swift/SwiftUI, Rust core, e FFI bridge. Principais achados:

**FFI Bridge — SÓLIDA.** Schema validation, catch_unwind(), defer free_string, null checks em ambos os lados, 7 instâncias bridge todas usando defaultDatabasePath(). Sem memory leaks. WAL + busy_timeout 5000ms gere lock contention entre bridges correctamente.

**Swift — padrões modernos correctos, mas 9 silent failures críticos.** @MainActor @Observable certo. 183 [weak self] consistentes. Problema principal: 9 chamadas `try?` que descartam silenciosamente erros de bridge em operações críticas: CaptureFrameWriteQueue.swift:338, GooseAppModel+Upload.swift:226/251, HealthDataStore+Sleep.swift:234/247/295, HealthDataStore+V24Biometrics.swift:92, GooseUploadService.swift:406. Quando capture.import_frame_batch ou sync.backfill_streams falham, a app continua como se tivesse tido sucesso. Secundário: nonisolated(unsafe) em frameReassemblyBuffers sem lock explícito (GooseAppModel.swift:175) — protegido por NSLock mas anotação contorna verificação do compilador.

**Rust — estrutura correcta, mas bridge.rs monolítica e sem connection pool.** thiserror/GooseResult usados correctamente. 100% queries parametrizadas. 797 testes. bridge.rs cresceu para 11.186 linhas (era 10.852 em revisão cross-AI de 2026-06-14). ~15-20 .expect() em produção no dispatcher (linhas 9849-9855) — estes causam panic não recuperável no FFI boundary mesmo com catch_unwind. Sem connection pool — cada chamada FFI abre nova conexão SQLite. SEED-004 cobre o plano de decomposição.

**P0 (quick wins):** 1) converter 9 try? → proper error logging + UI state; 2) .expect() no dispatcher Rust → GooseResult. Ver todo fix-silent-try-failures.md.
