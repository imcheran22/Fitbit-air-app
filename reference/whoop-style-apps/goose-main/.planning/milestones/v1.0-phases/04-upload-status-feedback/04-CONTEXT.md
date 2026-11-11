# Phase 4: Upload Status Feedback - Context

**Gathered:** 2026-06-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Adicionar feedback visual ao ecrã "Remote Server" (tab More) mostrando: estado de acessibilidade do servidor (health check no arranque), timestamp do último upload bem sucedido, e contagem de batches pendentes. Nenhum novo ecrã — apenas extensão do detail screen da Phase 2.

</domain>

<decisions>
## Implementation Decisions

### Health Check Display
- **D-01:** O estado do servidor (acessível / inacessível) é mostrado inline no ecrã "Remote Server" (detail screen) — não como banner ou badge na More list. O utilizador vê o estado ao abrir o ecrã de settings.
- **D-02:** Formato visual: label com ícone — "Servidor acessível ✅" ou "Servidor inacessível ❌". Usar cores do sistema (`.green` / `.red`).

### Health Check Timing
- **D-03:** Health check (`GET /healthz`) executa uma vez ao arrancar a app quando `uploadEnabled == true` e servidor configurado. Sem re-checks periódicos — o utilizador reinicia a app para actualizar o estado.
- **D-04:** Health check não é bloqueante — corre em background queue e publica resultado via `@Published` property no `GooseAppModel` ou no `MoreDataStore`.

### Status Fields (FEED-02, FEED-03, FEED-04)
- **D-05:** Timestamp do último upload bem sucedido: mostrado como texto relativo (e.g. "Último upload: há 2 min") ou absoluto (e.g. "14:32:05"). Claude escolhe formato relativo para legibilidade.
- **D-06:** Contagem de batches pendentes: em v1, a fila de upload é in-memory (sem persistência). O contador mostra batches atualmente em retry (0 quando não há retries ativos). Valor inicial: 0.
- **D-07:** Todos os 3 campos (estado servidor, último upload, batches pendentes) aparecem numa subsecção "Status" dentro do ecrã Remote Server, abaixo dos campos URL + token + toggle.

### State Propagation
- **D-08:** O `GooseUploadService` (Phase 3) expõe `@Published` properties: `lastUploadAt: Date?`, `pendingBatchCount: Int`, `serverReachable: Bool?`. O ecrã Remote Server observa estas properties para mostrar o feedback.
- **D-09:** Seguir o padrão `@MainActor @Published` do `GooseAppModel` — o serviço de upload publica estado no `@MainActor` e a view observa directamente.

### Claude's Discretion
- Formato do timestamp: "Último upload: {tempo relativo}" usando `RelativeDateTimeFormatter` (disponível no Foundation).
- Estado inicial (antes do health check completar): "A verificar..." com `ProgressView` inline ou label em cinzento.
- Se upload desabilitado ou servidor não configurado: não mostrar a subsecção "Status" (ou mostrá-la desativada/cinzenta).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Ficheiros iOS a modificar
- `GooseSwift/MoreRemoteServerViews.swift` (criado na Phase 2) — adicionar subsecção "Status" ao detail screen
- `GooseSwift/GooseAppModel+Upload.swift` (criado na Phase 3) — expor `@Published` properties de estado
- `GooseSwift/Info.plist` §NSAllowsLocalNetworking — health check HTTP para servidor local já coberto

### Endpoint do servidor
- `/v1/healthz` — `GET /healthz` retorna `{"status":"ok"}` (my-whoop/server/ingest/app/main.py)

### Contexto de fases anteriores
- `.planning/phases/02-ios-server-settings/02-CONTEXT.md` — estrutura do ecrã Remote Server
- `.planning/phases/03-ios-upload-client/03-CONTEXT.md` — GooseUploadService, goose.remote.* keys, mDNS ATS

### Requisitos
- `.planning/REQUIREMENTS.md` §Upload Status Feedback (FEED-01 a FEED-04)
- `.planning/ROADMAP.md` §Phase 4 — success criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `RelativeDateTimeFormatter` (Foundation) — formato "há 2 min" sem dependências externas.
- `MoreStatusKind` enum com `.ready`, `.pending`, `.blocked` — pode ser reutilizado para o estado do servidor na More list se necessário no futuro.
- `@Published` properties em `@MainActor` classes — padrão estabelecido em `GooseAppModel`, `HealthDataStore`, `MoreDataStore`.

### Established Patterns
- `.onAppear { store.refresh... }` — padrão para disparar work ao abrir um ecrã (usado em `MoreView`).
- `ble.record(level: .debug, ...)` — logging para debug do health check.
- `Task { @MainActor in ... }` — dispatch de background para main actor.

### Integration Points
- `MoreRemoteServerViews.swift` — o ecrã detail recebe o `GooseUploadService` (ou `GooseAppModel`) via `@EnvironmentObject` para observar as `@Published` properties.
- Health check dispara em `GooseSwiftApp` no `scenePhase == .active` se upload habilitado.

</code_context>

<specifics>
## Specific Ideas

- Subsecção "Status" apenas visível quando `uploadEnabled == true` e URL configurada — sem estado de feedback quando upload está desabilitado.
- Estado inicial "A verificar..." resolve assim que o health check completar (~1-2s em rede local).

</specifics>

<deferred>
## Deferred Ideas

None — discussão manteve-se dentro do scope da Phase 4.

</deferred>

---

*Phase: 4-Upload Status Feedback*
*Context gathered: 2026-06-03*
