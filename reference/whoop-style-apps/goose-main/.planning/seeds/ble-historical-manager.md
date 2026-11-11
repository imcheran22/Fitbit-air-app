---
name: ble-historical-manager
description: Extract historical BLE sync into a dedicated GooseBLEHistoricalManager — decouple from GooseBLEClient and make sync lifecycle explicit
metadata:
  type: seed
  trigger_condition: when planning v10.0 milestone scope
  planted_date: 2026-06-11
---

## Idea

Extract historical BLE sync into a `GooseBLEHistoricalManager`, separate from `GooseBLEClient`, equivalent to `WHPBLEHistoricalDataManager` in WHOOP v5.37.0.

## Problem — mais detalhado

Actualmente o Goose tem o sync histórico espalhado por `GooseBLEClient+HistoricalCommands.swift` e `GooseBLEClient+HistoricalHandlers.swift`, dentro do mesmo objecto que gere a ligação BLE activa.

Isto cria acoplamento: o sync histórico só pode ser chamado quando `GooseBLEClient` está num estado específico, e qualquer bug no sync pode interferir com o estado de ligação. No WHOOP, `WHPBLEHistoricalDataManager` é chamado independentemente em `applicationWillEnterForeground` — não depende do estado interno do manager de ligação.

**Quando isto importa na prática:**
- Um erro no sync histórico (timeout, parse failure) não deve desligar a ligação BLE activa
- O sync pode ser iniciado, cancelado ou reiniciado sem tocar no estado de connection
- É possível testar o sync histórico com um `GooseBLEManaging` mock (ver seed service-layer-di)

## O que construir

- `GooseBLEHistoricalManager` — responsável por: iniciar sync, monitorizar progresso, reportar resultado
- `GooseBLEClient` passa a expor apenas os comandos BLE necessários (já os tem), sem orquestrar o fluxo
- `GooseAppModel+BandFirstSync.swift` liga ao novo manager em vez de chamar `ble.syncHistoricalPackets()` directamente

## Relação com outras seeds

- Depende de `[[service-layer-di]]` para ser testável com mocks
- Complementa `[[ble-data-validator]]` — validação de frames pode ser responsabilidade do manager histórico

## Files to touch

- New: `GooseSwift/GooseBLEHistoricalManager.swift`
- Modify: `GooseSwift/GooseBLEClient+HistoricalCommands.swift` (reduzir a comandos BLE puros)
- Modify: `GooseSwift/GooseBLEClient+HistoricalHandlers.swift` (mover orquestração para o manager)
- Modify: `GooseSwift/GooseAppModel+BandFirstSync.swift` (usar novo manager)
