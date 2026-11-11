---
plan: "02-PLAN-01"
status: complete
completed: "2026-06-03"
commit: "feat(02-01)"
requirements:
  - SETT-01
  - SETT-02
  - SETT-03
  - SETT-04
  - SETT-05
one_liner: "MoreRoute.remoteServer adicionado à secção Settings + RemoteServerPersistence.swift com UserDefaults, Keychain, e validação de URL"
---

# Plan 02-01 Summary — MoreRoute + Persistence

## What Was Built

- `MoreRoute.remoteServer` case adicionado a `MoreRouteModels.swift` com title "Remote Server", subtitle, systemImage "network", e statusKeyPath
- `settingsRoutes` atualizado: `[.privacy, .remoteServer]`
- `MoreRouteStatus.remoteServer: MoreStatusKind` adicionado
- `RemoteServerPersistence.swift` criado com:
  - `RemoteServerStorage` — UserDefaults keys `goose.remote.serverURL` e `goose.remote.uploadEnabled`
  - `RemoteServerURLValidator.validate(_:)` — rejeita IPs numéricos, exige scheme http/https
  - `RemoteServerKeychain` — service `goose.remote`, account `apiKey`, delete-then-add pattern

## Acceptance Criteria

- [x] MoreRoute.remoteServer presente e em settingsRoutes
- [x] RemoteServerStorage UserDefaults keys definidas
- [x] RemoteServerKeychain com Security framework
- [x] URL validator rejeita IPs numéricos
