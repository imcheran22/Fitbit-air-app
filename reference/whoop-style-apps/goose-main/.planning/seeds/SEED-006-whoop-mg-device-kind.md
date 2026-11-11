---
id: SEED-006
status: activated
planted: 2026-06-14
planted_during: v12.0 — Protocol Architecture Refactor
trigger_when: support for WHOOP MG is confirmed or when a user connects a WHOOP MG device
scope: small
implemented_in: Phase 109 (MG-03, v14.0)
---

# SEED-006: Add WHOOP MG as First-Class DeviceKind

## Context

A fase 83 adicionou `DeviceKind { Whoop4, Whoop5, HrMonitor }` como abstracção de capabilities.
O WHOOP MG (Motion & GPS tracker — ou "Movement & GPS" conforme modelo exacto) já é reconhecido
pela app via o caminho `HrMonitor`. O utilizador confirmou que a app já suporta o MG mas o sistema
não distingue um WHOOP MG de um HR Monitor genérico — ambos têm o mesmo `DeviceKind::HrMonitor`.

## Why Add It as a Separate DeviceKind

Um `DeviceKind::WhoopMg` separado permitiria:

1. **Capabilities distintas:** O MG pode ter features diferentes de um HR Monitor genérico
   (ex: GPS, movement tracking, bateria diferente, características BLE únicas)
2. **Logging mais preciso:** Logs e debug mostrariam "WHOOP MG" em vez de "HR_MONITOR"
3. **Feature flags por dispositivo:** Futuras features exclusivas do MG (GPS?, pace?) podem ser
   activadas de forma declarativa via `DeviceCapabilities::for_kind(DeviceKind::WhoopMg)`
4. **Sem ambiguidade:** Um utilizador com MG e com um HR Monitor genérico teriam behaviours
   potencialmente distintos no futuro

## What Needs to Happen

### Rust side (goose-core)
- Adicionar `WhoopMg` variant a `DeviceKind` enum em `capabilities.rs`
  (serde: `"WHOOP_MG"` via `SCREAMING_SNAKE_CASE`)
- Adicionar `DeviceCapabilities::for_kind(DeviceKind::WhoopMg)` — primeiro verificar
  specs do MG (wire protocol, historical sync type, battery characteristics)
- Se existir um `DeviceType` para o MG no enum (ex: `DeviceType::Mg`), adicionar
  `device_kind()` mapping; se não existir, investigar via BLE GATT advertisement
- Adicionar testes de unidade para as novas capabilities

### Swift side
- Adicionar `case whoopMg` a `DeviceKind` enum em `GooseBLETypes.swift`
  (raw value para deserialização: `"WHOOP_MG"`)
- `WireProtocol.bridgeString` mantém-se — MG usa Gen5 wire protocol
- Verificar se `processDiscoveredCharacteristics` consegue distinguir MG de HR Monitor
  via GATT service UUIDs ou advertisement data

### Key Question (needs research)
- Qual é o UUID de serviço BLE do WHOOP MG? É o mesmo que o HR Monitor genérico?
- O MG tem historical sync? Se sim, que tipo? (`pageSequence` ou `stream`?)
- Tem bateria via R22? Event 48? CMD26?
- Existe um `DeviceType::Mg` variant no Rust core ou é identificado via outro mecanismo?

## Impact Assessment

- **Scope:** Pequeno — 2-3 ficheiros Rust + 1 ficheiro Swift + testes
- **Risk:** Baixo — se as capabilities forem idênticas ao HrMonitor, é apenas um rename
  com zero mudança de behaviour; se forem diferentes, permite comportamentos correctos
- **Blocker:** Precisamos de confirmar as specs BLE do MG antes de commitar capabilities
- **No migration needed:** Novos rows já não serão gravados como MAVERICK/PUFFIN;
  não há rows existentes com "WHOOP_MG" que precisem de migração

## When to Surface

Surface esta seed quando:
- Um utilizador relata que o WHOOP MG não funciona correctamente (capabilities erradas)
- Vamos adicionar features específicas do MG (ex: GPS tracking, motion analysis)
- Confirmamos as specs BLE completas do WHOOP MG
- Próxima milestone focused on device support expansion

## Related

- [[SEED-003]] — Protocol Architecture Refactor (concluída em fase 83 — esta seed é o follow-up)
- Fase 83 — `DeviceKind::HrMonitor` é actualmente o placeholder para o MG
