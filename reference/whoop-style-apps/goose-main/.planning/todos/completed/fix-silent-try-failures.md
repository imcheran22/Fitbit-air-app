---
title: Fix 9 silent try? bridge failures in Swift
priority: high
created: "2026-06-15"
source: best-practices-audit-2026-06-15
---

9 chamadas `try?` em operações críticas de bridge descartam erros silenciosamente. A app continua como se a operação tivesse sucedido mesmo quando a Rust bridge falha.

## Localizações

| Ficheiro | Linha | Método Bridge |
|---------|------|--------------|
| CaptureFrameWriteQueue.swift | 338 | capture.import_frame_batch |
| GooseAppModel+Upload.swift | 226 | capture.import_frame_batch |
| GooseAppModel+Upload.swift | 251 | sync.backfill_streams |
| HealthDataStore+Sleep.swift | 234 | metrics.sleep_input_extraction |
| HealthDataStore+Sleep.swift | 247 | metrics.sleep_input_extraction |
| HealthDataStore+Sleep.swift | 295 | (sleep metric) |
| HealthDataStore+V24Biometrics.swift | 92 | (biometrics import) |
| GooseUploadService.swift | 406 | (pending rows check) |

## Fix Pattern

Para cada chamada: converter `try?` para `do { ... } catch { Logger.error(...) }` ou propagar o erro para o chamador. Não é necessário mostrar erro na UI em todos os casos, mas deve pelo menos ser logged com OSLog.

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

Para HealthDataStore, o resultado nil já é handled — o fix é apenas adicionar logging do erro antes do if-let.

## Critério de conclusão

`grep -rn "try?" GooseSwift/ | grep "bridge\|request("` deve retornar 0 resultados.
