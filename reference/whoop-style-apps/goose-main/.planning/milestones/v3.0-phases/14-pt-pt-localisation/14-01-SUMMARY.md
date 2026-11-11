---
phase: 14-pt-pt-localisation
plan: "01"
subsystem: ui
tags: [localisation, xcstrings, pt-PT, swiftui, i18n]

requires: []

provides:
  - Localizable.xcstrings String Catalog with 47 Wave 1 pt-PT translations
  - pt-PT locale registered in Xcode project knownRegions
  - GooseAppTab.title returns String(localized:) for all 4 tab labels
  - MoreRoute.title (15 cases) returns String(localized:)
  - MoreRoute.subtitle (15 cases) returns String(localized:)

affects:
  - 14-02 (all subsequent localisation waves depend on this catalog and locale)

tech-stack:
  added: [Localizable.xcstrings (Apple String Catalog format)]
  patterns:
    - "String(localized:) pattern for String-returning computed properties that bypass SwiftUI auto-localisation"
    - "xcstrings catalog as single source of truth for all app string translations"

key-files:
  created:
    - GooseSwift/Localizable.xcstrings
  modified:
    - GooseSwift.xcodeproj/project.pbxproj
    - GooseSwift/AppShellView.swift
    - GooseSwift/MoreRouteModels.swift

key-decisions:
  - "Use String(localized:) instead of LocalizedStringKey for String-returning properties to avoid breaking callers like CoachTips.swift and HealthScoreDateViews.swift"
  - "Seed xcstrings with subtitle strings from MoreRoute as full English keys (not shorthand) to match the literal strings used in code"
  - "pt-PT added to knownRegions without changing developmentRegion (stays en)"

patterns-established:
  - "Pattern: String-returning computed properties use String(localized:) — not LocalizedStringKey — to preserve compatibility with String consumers"
  - "Pattern: xcstrings keys match the English literal exactly as it appears in the source code"

requirements-completed: [L10N-01]

duration: 2min
completed: 2026-06-05
---

# Phase 14 Plan 01: Localisation Infrastructure Summary

**Localizable.xcstrings String Catalog with 47 pt-PT translations created, pt-PT locale registered in project.pbxproj, and tab bar + More-route title/subtitle properties migrated to String(localized:)**

## Performance

- **Duration:** 2 min
- **Started:** 2026-06-05T11:40:38Z
- **Completed:** 2026-06-05T11:42:48Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Created GooseSwift/Localizable.xcstrings with 47 Wave 1 string entries, each with pt-PT translation (62 `pt-PT` occurrences in JSON)
- Registered `pt-PT` in `PBXProject.knownRegions` and added Localizable.xcstrings as a PBXFileReference + PBXBuildFile into the PBXResourcesBuildPhase of the GooseSwift target
- Migrated `GooseAppTab.title` (4 cases) to `String(localized:)` — type stays `String`
- Migrated `MoreRoute.title` (15 cases) and `MoreRoute.subtitle` (15 cases) to `String(localized:)` — types unchanged, no String consumers broken

## Task Commits

1. **Task 1 + Task 2: Localizable.xcstrings + project.pbxproj + AppShellView + MoreRouteModels** — `871b295` (feat)

**Plan metadata:** _ver commit final abaixo_

## Files Created/Modified

- `GooseSwift/Localizable.xcstrings` — String Catalog com 47 chaves Wave 1 (navegação, estados BLE, subtítulos MoreRoute) traduzidas para pt-PT
- `GooseSwift.xcodeproj/project.pbxproj` — pt-PT em knownRegions; PBXFileReference D2000000000000000000005B, PBXBuildFile D1000000000000000000005B, entrada na PBXResourcesBuildPhase A60000000000000000000002, entrada no grupo GooseSwift
- `GooseSwift/AppShellView.swift` — GooseAppTab.title: 4 casos agora usam String(localized:)
- `GooseSwift/MoreRouteModels.swift` — MoreRoute.title (15 casos) e MoreRoute.subtitle (15 casos) agora usam String(localized:)

## Decisions Made

- `String(localized:)` em vez de `LocalizedStringKey` para manter o tipo de retorno `String` e não quebrar `CoachTips.swift` (`route.title.lowercased()`), `HealthScoreDateViews.swift` e `HomeDashboardView.swift` que consomem os títulos como `String` plain
- Chaves do xcstrings usam a string inglesa literal completa (e.g. `"Connect and view live heart rate from a Bluetooth HR monitor"`) para corresponder exactamente ao que está no código Swift — sem shorthand
- `developmentRegion = en` mantido; apenas `knownRegions` recebeu `pt-PT`

## Deviations from Plan

None — plano executado exactamente como escrito. As tarefas 1 e 2 foram combinadas num único commit atómico porque não há ponto de verificação intermédia entre elas.

## Issues Encountered

None.

## User Setup Required

None — não é necessária configuração externa. O locale pt-PT ficará activo automaticamente em dispositivos com linguagem definida para Português (Portugal).

## Next Phase Readiness

- Infraestrutura de localização pronta; o catálogo xcstrings está registado e o locale pt-PT compilará no bundle
- Wave 2 pode prosseguir: adicionar traduções para strings de saúde e de métricas ao catálogo existente
- `Text("...")` calls em SwiftUI resolverão automaticamente para pt-PT quando o dispositivo estiver configurado em Português; apenas as propriedades String-returning precisam de `String(localized:)` explícito

---
*Phase: 14-pt-pt-localisation*
*Completed: 2026-06-05*
