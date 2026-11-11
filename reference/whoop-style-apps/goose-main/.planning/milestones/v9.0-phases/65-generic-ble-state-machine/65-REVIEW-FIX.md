---
phase: 65-generic-ble-state-machine
fixed_at: 2026-06-11T00:00:00Z
review_path: .planning/phases/65-generic-ble-state-machine/65-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 3
skipped: 1
status: partial
---

# Phase 65: Code Review Fix Report

**Fixed at:** 2026-06-11
**Source review:** .planning/phases/65-generic-ble-state-machine/65-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4
- Fixed: 3
- Skipped: 1

## Fixed Issues

### CR-01 + CR-02: Thread safety via NSLock e verificação do resultado de transição

**Files modified:** `GooseSwift/GooseBLEBondingManager.swift`
**Commit:** 1136c99
**Applied fix:**
- Renomeado `machine` para `_machine` e adicionado `private let lock = NSLock()` ao tipo.
- `bondingState` computed property adquire o lock para leitura segura de `_machine.state`.
- `transition(to:)` executa o guard e o `_machine.handle(event)` dentro de `lock.withLock { }`.
- Se `machine.handle(event)` devolver `false` (transição inválida), `transition(to:)` retorna `false` imediatamente sem chamar `persistState()` nem disparar o callback.
- Tipo de retorno alterado para `@discardableResult Bool`.
- Comentário de "thread contract por convenção" removido; o NSLock impõe o contrato sem requerer `@MainActor` (o que quebraria `GooseBLEClient` não-`@MainActor`).

### WR-01: bleLogger convertido de computed var para static let

**Files modified:** `GooseSwift/GooseStateMachine.swift`
**Commit:** 037a15b
**Applied fix:**
- `private static var bleLogger: Logger { Logger(...) }` substituído por `private static let bleLogger = Logger(subsystem: "com.goose.swift", category: "ble")`.
- O Logger é agora criado uma única vez e reutilizado, consistente com o padrão `static let logger` do resto do codebase.

## Skipped Issues

### WR-02: Callback `onBondingStateChange` via `DispatchQueue.main.async`

**File:** `GooseSwift/GooseBLEBondingManager.swift:33-35`
**Reason:** Skipped por instrução explícita. O dispatch assíncrono é a opção mais segura — eliminar o async poderia introduzir re-entrância se o callback invocar `transition(to:)` de volta. O comportamento de "saltar estados intermédios em rajadas" é tolerável para logging e UI. Documentar o comportamento é a alternativa adequada, mas não foi solicitado neste passo.
**Original issue:** Callback pode entregar estado desactualizado em transições em rajada — o primeiro `async` pode correr depois do estado já ter avançado.

---

_Fixed: 2026-06-11_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
