# Phase 2: iOS Server Settings - Context

**Gathered:** 2026-06-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Adicionar ecrã "Remote Server" na tab More (SwiftUI) onde o utilizador configura a URL do servidor e o Bearer token (API key), com um toggle para ativar/desativar upload. URL persiste em UserDefaults; token persiste no Keychain iOS. URL é validada (hostname obrigatório — ATS rejeita IPs nus) ao tocar Save.

</domain>

<decisions>
## Implementation Decisions

### Navigation Placement
- **D-01:** Adicionar `.remoteServer` à secção "Settings" existente em `MoreView`, junto de Privacy. Sem nova secção separada.
- **D-02:** Seguir o padrão `MoreRoute` — adicionar case `.remoteServer` ao enum, definir `title`, `subtitle`, `systemImage`, e `statusKeyPath` correspondentes.

### Upload Toggle
- **D-03:** O toggle de ativar/desativar upload está apenas dentro do ecrã detail "Remote Server" (não como quick toggle na More list). O utilizador acede às configurações completas numa só página: URL + Bearer token + toggle de upload.

### URL Validation
- **D-04:** Validação da URL ocorre ao tocar Save (não real-time). Se a URL for inválida (IP nu, esquema em falta, ou formato incorreto), mostrar mensagem de erro inline no ecrã. Sem salvar estado inválido.
- **D-05:** Uma URL válida deve ter scheme `http://` ou `https://` e um hostname resolúvel (não apenas dígitos e pontos). A validação usa `URL(string:)` + verificação do `host` do URLComponents.

### Persistence
- **D-06:** URL do servidor → `UserDefaults` com chave `goose.remote.serverURL` (padrão dot-namespaced do projeto).
- **D-07:** Bearer token (API key) → iOS Keychain com `kSecAttrService = "goose.remote"` e `kSecAttrAccount = "apiKey"`. Separado das entradas de auth do Codex/OpenAI.
- **D-08:** Toggle de upload habilitado → `UserDefaults` com chave `goose.remote.uploadEnabled`.

### Code Structure
- **D-09:** Seguir o padrão extension do projeto: criar `MoreRemoteServerViews.swift` para a SwiftUI view do detail screen. Adicionar `remoteServer` case ao `MoreRoute` enum em `MoreRouteModels.swift`. O estado (URL lida/escrita, token Keychain, toggle) vai num `@StateObject` local ou no `MoreDataStore` se necessário partilhá-lo.

### Claude's Discretion
- SF Symbol para o route: `"server.rack"` ou `"network"` — Claude escolhe o mais adequado.
- Label do ecrã: "Remote Server" (título consistente com a terminologia do ROADMAP).
- Keychain wrapper: reutilizar o padrão de Security framework já em `CodexEmbeddedAuth.swift` (sem nova dependência).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Ficheiros iOS a modificar/criar
- `GooseSwift/MoreRouteModels.swift` — adicionar `.remoteServer` case e incluir nos `settingsRoutes`
- `GooseSwift/MoreView.swift` — verificar que `destination(for:)` inclui o novo route
- `GooseSwift/CodexEmbeddedAuth.swift` — padrão Keychain a reutilizar (Security framework, `SecItemAdd`, `SecItemCopyMatching`, `SecItemUpdate`, `SecItemDelete`)
- `GooseSwift/OnboardingPersistence.swift` — padrão de chaves UserDefaults dot-namespaced

### Requisitos (critérios de aceitação)
- `.planning/REQUIREMENTS.md` §iOS Server Settings (SETT-01 a SETT-05)
- `.planning/ROADMAP.md` §Phase 2 — success criteria

### Contexto de fases anteriores
- `.planning/phases/01-server-infrastructure/01-CONTEXT.md` — a URL do servidor usa hostname (ATS); GOOSE_API_KEY é o Bearer token

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CodexEmbeddedAuth.swift` — Security framework Keychain pattern: `SecItemAdd`, `SecItemCopyMatching`, `SecItemUpdate`, `SecItemDelete`. Reutilizar o mesmo padrão para o Bearer token do servidor.
- `OnboardingPersistence.swift` — UserDefaults dot-namespaced static keys (`static let` em enum ou struct). Seguir para `goose.remote.*` keys.
- `@AppStorage` com chaves específicas — padrão estabelecido para UserDefaults em views SwiftUI.

### Established Patterns
- `MoreRoute` enum com `title`, `subtitle`, `systemImage`, `statusKeyPath` — a estrutura do novo route deve seguir este pattern.
- `MoreDataStore` com `@MainActor` e extensão `MoreDataStore+Validation.swift` — se o estado do servidor precisar de ser partilhado com outras fases, seguir o padrão de extensão.
- Navegação via `NavigationLink(value:)` + `navigationDestination(for:)` — já implementado em `MoreView.swift`.
- Ficheiros de views por secção: `MoreProfileViews.swift`, `MoreCaptureViews.swift` — criar `MoreRemoteServerViews.swift`.

### Integration Points
- `MoreView.body` → secção "Settings" → adicionar row `.remoteServer` ao `settingsRoutes`.
- `MoreRouteStatus` struct pode precisar de campo `.remoteServer: MoreStatusKind` para mostrar estado (e.g., `.ready` quando configurado, `.pending` quando não configurado).
- Fase 3 (upload client) vai ler `goose.remote.serverURL`, `goose.remote.uploadEnabled`, e o Bearer token do Keychain — estas chaves ficam definidas nesta fase.

</code_context>

<specifics>
## Specific Ideas

- O ecrã detail tem 3 elementos: TextField para URL (`https://meu-servidor.local`), SecureField para o Bearer token, Toggle para "Enable Upload". Botão Save valida e persiste.
- Mensagem de erro de URL inválida inline sob o TextField (não modal/alert).
- A URL deve aceitar `https://` (recomendado para produção) e `http://` apenas para servidores locais com `NSAllowsLocalNetworking: true` — verificar que o `Info.plist` já tem esta flag (goose já tem para WebSocket debug).

</specifics>

<deferred>
## Deferred Ideas

None — discussão manteve-se dentro do scope da Phase 2.

</deferred>

---

*Phase: 2-iOS Server Settings*
*Context gathered: 2026-06-03*
