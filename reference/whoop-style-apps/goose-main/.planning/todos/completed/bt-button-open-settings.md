---
title: Botão "Request Bluetooth" deve abrir definições do sistema
type: improvement
priority: low
phase: backlog
created: 2026-06-04
resolves_phase:
---

## Descrição

O botão "Request Bluetooth" em ConnectionView actualmente chama `ensureCentral()` + `updateBluetoothState()` sem feedback visível ao utilizador.

**Comportamento esperado:** abrir as definições de Bluetooth do iOS via `UIApplication.shared.open(URL(string: UIApplication.openSettingsURLString)!)`.

## Localização

- `GooseSwift/GooseBLEClient+UserActions.swift` — `func requestBluetooth()`
- `GooseSwift/ConnectionView.swift` — botão "Request Bluetooth"

## Implementação sugerida

```swift
func requestBluetooth() {
  record(source: "ui", title: "request_bluetooth")
  if let url = URL(string: UIApplication.openSettingsURLString) {
    UIApplication.shared.open(url)
  }
}
```

## Contexto

Detectado durante o checkpoint de verificação humana do Plano 09-03 (BLE reconnect backoff). O toggle de Bluetooth era feito manualmente via Control Center porque o botão da app não abre as definições.
