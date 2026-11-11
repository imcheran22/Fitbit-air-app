---
phase: 65-generic-ble-state-machine
reviewed: 2026-06-11T00:00:00Z
depth: quick
files_reviewed: 3
files_reviewed_list:
  - GooseSwift/GooseStateMachine.swift
  - GooseSwift/GooseBLETypes.swift
  - GooseSwift/GooseBLEBondingManager.swift
findings:
  critical: 2
  warning: 2
  info: 0
  total: 4
status: issues_found
---

# Phase 65: Code Review Report

**Reviewed:** 2026-06-11
**Depth:** quick (+ manual trace — ficheiros são pequenos)
**Files Reviewed:** 3
**Status:** issues_found

## Summary

A implementação é enxuta e segue o padrão correcto de máquina de estados genérica com tabela de transições. A cobertura dos 5 casos de `GooseBLEBondingEvent` na tabela está completa e não há caso omitido. O `assertionFailure` em DEBUG e o `logger.error` em RELEASE funcionam como descrito.

Dois problemas bloqueantes foram encontrados: (1) o thread contract de `GooseBLEBondingManager` é documental — sem `@MainActor` no tipo, o compilador não impede chamadas de threads arbitrárias; (2) `transition(to:)` não expõe se a transição foi aceite ou rejeitada pela máquina de estados, tornando falhas silenciosas.

---

## Critical Issues

### CR-01: `GooseBLEBondingManager` sem `@MainActor` — thread contract não imposto pelo compilador

**File:** `GooseSwift/GooseBLEBondingManager.swift:9`

**Issue:** O comentário nas linhas 5–8 declara que todas as chamadas devem ocorrer na main thread. No entanto, `final class GooseBLEBondingManager` e o método `func transition(to:)` não têm `@MainActor`. Qualquer código Swift que não seja `@MainActor` pode invocar `transition(to:)` sem aviso de compilação. A máquina de estados é um `struct` mutável (`private var machine`) — acesso concorrente sem sincronização é undefined behaviour em Swift e pode corromper o estado.

O argumento "todos os call sites respeitam a convenção" é frágil: basta um `Task { manager.transition(...) }` adicionado no futuro para introduzir uma data race silenciosa.

**Fix:**
```swift
// Anotar o tipo inteiro com @MainActor — o compilador garante o contrato:
@MainActor
final class GooseBLEBondingManager {
  private var machine: StateMachine<GooseBLEBondingState, GooseBLEBondingEvent>
  // ...
}

// loadInitialState deve continuar a ser nonisolated para poder ser chamado no init:
private nonisolated static func loadInitialState() -> GooseBLEBondingState { ... }
```

Com `@MainActor` no tipo, qualquer chamada de contexto não-MainActor gera erro de compilação. O `init()` pode chamar `loadInitialState()` sem problema pois a função é `nonisolated static`.

---

### CR-02: `transition(to:)` não devolve o resultado da transição — falhas são silenciosas

**File:** `GooseSwift/GooseBLEBondingManager.swift:28–36`

**Issue:** `transition(to:)` tem tipo de retorno `Void`. Internamente chama `machine.handle(event)` que devolve `Bool` (linha 31 do manager) — esse resultado é descartado (`@discardableResult` está em `StateMachine.handle`, mas aqui é mesmo ignorado sem `_`). Se a transição for inválida (ex: `transition(to: .started)` quando o estado actual é `.subscribed`), a máquina rejeita silenciosamente: o estado interno não muda, mas `persistState()` é chamado na mesma (linha 32) e o callback `onBondingStateChange` é disparado (linhas 33–35) com o estado que já existia. O chamante não tem como saber que a transição falhou.

Exemplo de falha não detectável:
```
estado: .subscribed
chamada: transition(to: .started)
evento derivado: .start
machine.handle(.start): nil  ← rejeitado (só aceite de .notStarted)
machine.state: .subscribed  ← inalterado, mas chamante assume .started
```

**Fix:**
```swift
@discardableResult
func transition(to newState: GooseBLEBondingState) -> Bool {
  guard newState != bondingState else { return true }
  let event = GooseBLEBondingManager.event(for: newState)
  let accepted = machine.handle(event)
  guard accepted else { return false }  // não persistir nem notificar em caso de rejeição
  persistState()
  DispatchQueue.main.async { [weak self] in
    guard let self else { return }
    self.onBondingStateChange?(self.bondingState)
  }
  return true
}
```

Desta forma, `persistState()` e o callback só são invocados em transições aceites.

---

## Warnings

### WR-01: `bleLogger` é uma `computed property` estática — instancia `Logger` em cada falha

**File:** `GooseSwift/GooseStateMachine.swift:15–17`

**Issue:** `private static var bleLogger: Logger { Logger(...) }` é uma computed property. Em cada transição inválida é criada uma nova instância de `Logger`. `Logger` é uma struct leve, mas a criação desnecessária é contrária ao padrão do resto do codebase onde loggers são `static let`. A convenção do projecto (ver `GooseBLEClient.swift`, etc.) usa `static let logger = Logger(...)`.

**Fix:**
```swift
private static let bleLogger = Logger(subsystem: "com.goose.swift", category: "ble")
```

---

### WR-02: Callback `onBondingStateChange` disparado com `async` — pode entregar estado desactualizado em transições em rajada

**File:** `GooseSwift/GooseBLEBondingManager.swift:33–35`

**Issue:** O callback é enfileirado via `DispatchQueue.main.async`. Se dois eventos chegarem rapidamente (ex: `subscribe` imediatamente seguido de `cancel` numa falha de BLE), o primeiro `async` pode correr depois do estado já ter avançado para o segundo. O callback recebe `.cancelled` nas duas invocações, nunca vendo `.subscribed`. Para logging e UI simples isto é tolerável, mas para qualquer lógica que precise de observar cada estado intermédio (ex: emitir um log distinto por transição) o comportamento é incorrecto.

Dado que o thread contract já exige main thread para o caller, o callback pode ser invocado sincronamente (ou com `DispatchQueue.main.sync` se o contexto puder ser background, mas CR-01 trata isso):

**Fix:**
```swift
// Com @MainActor no tipo (CR-01 resolvido), invocar directamente:
onBondingStateChange?(bondingState)
```

Se o design intencional for manter assíncrono para evitar re-entrância, documentar explicitamente que o callback pode saltar estados intermédios.

---

_Reviewed: 2026-06-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: quick_
