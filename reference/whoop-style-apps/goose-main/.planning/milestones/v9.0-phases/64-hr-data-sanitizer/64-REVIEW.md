---
phase: 64-hr-data-sanitizer
reviewed: 2026-06-11T00:00:00Z
depth: quick
files_reviewed: 4
files_reviewed_list:
  - GooseSwift/GooseHRSanitizer.swift
  - GooseSwift/GooseBLEClient+VitalsAndLogging.swift
  - GooseSwift/GooseAppModel.swift
  - GooseSwift/MoreDebugViews.swift
findings:
  critical: 0
  warning: 3
  info: 1
  total: 4
status: issues_found
---

# Phase 64: Code Review Report

**Reviewed:** 2026-06-11
**Depth:** quick
**Files Reviewed:** 4
**Status:** issues_found

## Summary

A implementação do `GooseHRSanitizer` é correcta e o sanitizador está correctamente posicionado como chokepoint único em `recordLiveHeartRate`. As constantes de threshold são `static let` e bem utilizadas na UI de debug. O contador de spikes é seguro a nível de thread. Foram encontrados três warnings e um item informativo.

## Warnings

### WR-01: Três literais `(20...240)` duplicam os thresholds do sanitizador

**File:** `GooseSwift/HeartRateSeriesStores.swift:83`, `GooseSwift/HeartRateSeriesStores.swift:215`, `GooseSwift/GooseBLEClient+VitalsAndLogging.swift:61`

**Issue:** O `GooseHRSanitizer` define `minValidBPM = 25` e `maxValidBPM = 220` como fonte de verdade única. No entanto, existem três guardas que validam BPM com o literal `(20...240)` — limites diferentes (20 e 240, vs. 25 e 220). Este drift significa que:
- `HeartRateSeriesStores.append` aceita BPM entre 20–24 e 221–240, que o sanitizador teria rejeitado se o valor tivesse passado por ele (o que acontece na pipeline normal). Mas qualquer chamada futura que alimente `HeartRateSeriesStores` sem passar por `recordLiveHeartRate` contornará o sanitizador com thresholds mais permissivos.
- `processRestingHeartRateEstimate` (linha 61 de `VitalsAndLogging`) também usa `(20...240)` em vez de `GooseHRSanitizer.validRange`, o que é inconsistente na mesma extensão que já depende do sanitizador.

**Fix:**
```swift
// HeartRateSeriesStores.swift:83 — substituir o literal
guard (GooseHRSanitizer.minValidBPM...GooseHRSanitizer.maxValidBPM).contains(bpm) else {

// HeartRateSeriesStores.swift:215 — idem
guard estimate.isFinite,
      (GooseHRSanitizer.minValidBPM...GooseHRSanitizer.maxValidBPM).contains(Int(estimate.rounded())) else {

// GooseBLEClient+VitalsAndLogging.swift:61 — idem
guard estimate.isFinite,
      GooseHRSanitizer.validRange.contains(Int(estimate.rounded())) else {
```

---

### WR-02: Chokepoint não é realmente único — `HeartRateSamplePipeline` recebe BPM sem re-sanitizar

**File:** `GooseSwift/GooseAppModel.swift:307-308`

**Issue:** O callback `ble.onLiveHeartRate` alimenta `heartRateSamplePipeline.recordHeartRateSample(bpm:source:capturedAt:)` directamente. Este callback é invocado de `processLiveHeartRate` (ou seja, após o sanitizador), pelo que em condições normais o BPM já foi validado. Contudo, a `HeartRateSamplePipeline` (e o `HeartRateSampleStore.append`) aplica os seus próprios thresholds `(20...240)` (ver WR-01), sem invocar `GooseHRSanitizer`. Se alguém ligar `onLiveHeartRate` de outro sítio sem passar por `recordLiveHeartRate`, ou se a pipeline for usada de forma independente em testes, samples fora do range do sanitizador poderão entrar. O contrato do chokepoint não está documentado nem reforçado pela API — qualquer caller pode invocar `onLiveHeartRate` com BPM arbitrário.

**Fix:** Documentar explicitamente que `onLiveHeartRate` só deve ser invocado após `sanitize`, e/ou colocar um `assert(GooseHRSanitizer.sanitize(bpm) != nil)` em `recordHeartRateSample` em modo DEBUG:
```swift
func recordHeartRateSample(bpm: Int, source: String, capturedAt: Date) {
  assert(GooseHRSanitizer.sanitize(bpm) != nil,
         "recordHeartRateSample called with out-of-range BPM \(bpm) — must pass through recordLiveHeartRate")
  // ...
}
```

---

### WR-03: `onHRSpike` chamado antes de despachar para `realtimeVitalsQueue` — potencial chamada no thread errado

**File:** `GooseSwift/GooseBLEClient+VitalsAndLogging.swift:10-11`

**Issue:** Quando o sanitizador rejeita um sample, `onHRSpike?(bpm, source)` é invocado directamente na thread que chamou `recordLiveHeartRate` (tipicamente a `realtimeVitalsQueue` ou a thread BLE, dependendo do caller). O `GooseAppModel.init` regista `ble.onHRSpike` com um closure que executa `Task { @MainActor in self?.hrSpikeCount += 1 }`, o que é seguro porque usa `@MainActor`. No entanto, o `onHRSpike` é um closure público (`var onHRSpike: ((Int, String) -> Void)?`) — qualquer outro setter futuro que mute estado não-actor-isolated directamente (sem o `Task { @MainActor in ... }` wrapping) causará uma data race. O `onLiveHeartRate` e `onHRVSample` são despachados via `realtimeVitalsQueue.async`, criando consistência de threading esperada pelos callers; `onHRSpike` quebra esse padrão ao ser síncrono na thread chamante.

**Fix:** Despachar `onHRSpike` da mesma forma que os outros callbacks, ou documentar claramente que este closure é chamado na thread do caller e deve ser thread-safe:
```swift
// Opção A: despachar para a mesma queue dos outros callbacks
realtimeVitalsQueue.async { [weak self] in
  self?.onHRSpike?(bpm, source)
}

// Opção B (mínima): adicionar comentário de contrato junto à declaração em GooseBLEClient.swift
/// Called on the calling thread (not dispatched). Must be thread-safe.
var onHRSpike: ((Int, String) -> Void)?
```

---

## Info

### IN-01: `static var validRange` em vez de `static let` — recalculado a cada acesso

**File:** `GooseSwift/GooseHRSanitizer.swift:19`

**Issue:** `validRange` é declarado como `static var` com um computed getter. Em Swift, uma `static var` com body é um computed property e é reavaliada a cada acesso (embora aqui seja O(1) e trivial). A intenção do código é claramente uma constante derivada. Isto não causa bugs, mas é inconsistente com os outros membros `static let`.

**Fix:**
```swift
// Antes:
static var validRange: ClosedRange<Int> { minValidBPM...maxValidBPM }

// Depois:
static let validRange: ClosedRange<Int> = minValidBPM...maxValidBPM
```

---

## Análise das Questões Específicas

**Chokepoint único:** Confirmado que `recordLiveHeartRate` é o único ponto de entrada para BPM live na pipeline BLE. Os dois callers identificados são `GooseBLEClient+Parsing.swift:16` (BLE standard) e `GooseAppModel+NotificationPipeline.swift:638` (via Rust K10). Ambos passam obrigatoriamente pelo sanitizador. Ver WR-01/WR-02 para riscos de bypass em camadas downstream.

**`static let` thresholds:** Usados correctamente em `GooseHRSanitizer.swift` e referenciados pela UI em `MoreDebugViews.swift:183`. O problema são os literais `(20...240)` em ficheiros externos (WR-01).

**Thread-safety do contador de spikes:** Seguro. `hrSpikeCount` é uma propriedade `@MainActor` em `GooseAppModel` e o incremento é sempre feito dentro de `Task { @MainActor in ... }`. Não há escrita directa fora do main actor.

**Debug display:** Correcto. `MoreDebugViews.swift:183` lê `model.hrSpikeCount` (main actor) e usa `GooseHRSanitizer.minValidBPM`/`maxValidBPM` — sem hardcoding, sem magic numbers.

---

_Reviewed: 2026-06-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: quick_
