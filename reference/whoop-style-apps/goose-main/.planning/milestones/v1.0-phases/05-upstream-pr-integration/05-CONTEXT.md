# Phase 5: Upstream PR Integration - Context

**Gathered:** 2026-06-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Integrar os 9 PRs abertos do upstream `b-nnett/goose` no fork `tigercraft4/goose` via `git merge --no-ff`, em ordem crescente de risco, verificando que os testes Rust passam após cada PR que toca o Rust core, e garantindo que a infraestrutura fork-específica (`server/`, upload client iOS) não é corrompida.

PR #12 (FFI threading, alto risco) integrado por último — após todas as fases iOS (2, 3, 4) estarem executadas para evitar conflitos com o upload client.

</domain>

<decisions>
## Implementation Decisions

### Merge Order (crescente de risco)
- **D-01:** Ordem de integração:
  1. `#3` — Document FFI safety contracts (docs apenas, risco mínimo)
  2. `#6` — Add Rust core CI GitHub Actions (CI config, risco mínimo)
  3. `#1` — Fix stale timeout + deduplicate duration parsing (bug fix Rust, baixo risco)
  4. `#13` — Fix Rust core integration tests + Windows compat (Rust tests, baixo-médio risco)
  5. `#10` — Add Rust CI workflow + fix bugs (CI + bug fixes, médio risco)
  6. `#7` — feat(bridge): add core.list_methods RPC (nova funcionalidade bridge, médio risco)
  7. `#4` — Reduce scroll frame drops (SwiftUI changes, médio risco)
  8. `#5` — Apple Health fallback (HealthKit integration, médio-alto risco)
  9. `#12` — Optimize FFI bridge serialization + background threading (ÚLTIMO, alto risco — integrar após Phases 2+3+4 executadas)

### Merge Strategy
- **D-02:** `git merge --no-ff` para cada PR (FORK-02 — não cherry-pick). Manter historial completo do PR.
- **D-03:** Remote `upstream` (b-nnett/goose) configurado antes de qualquer merge (FORK-01).
- **D-04:** `git fetch upstream` + `git merge upstream/pr-branch --no-ff` ou via `gh pr checkout` + merge.

### Testing Gate
- **D-05:** Após cada PR que toca Rust core (qualquer ficheiro em `Rust/`): correr `cargo test` (FORK-02). Se os testes falharem, resolver conflitos antes de avançar para o próximo PR.
- **D-06:** Após cada merge: verificar que `server/` e os ficheiros iOS fork-específicos (`GooseAppModel+Upload.swift`, `MoreRemoteServerViews.swift`, etc.) não foram alterados nem corrompidos.

### PR #12 Special Handling
- **D-07:** PR #12 integrado por último, após as Phases 2+3+4 serem executadas. O planner deve marcar este passo como `autonomous: false` (requer verificação manual do impacto no upload client antes de avançar).
- **D-08:** Antes de mergir #12: ler o diff completo e verificar conflitos com `GooseAppModel+Upload.swift` e qualquer novo código FFI bridge adicionado pelas fases iOS.

### Conflict Resolution
- **D-09:** Conflitos são resolvidos inline (não abortando o merge). Prioridade: manter funcionalidade fork-específica, integrar mudanças upstream sem perder nenhuma.

### Claude's Discretion
- Estratégia de fetch: `gh pr checkout <N> -b upstream-pr-<N>` + merge, ou `git fetch upstream` + `git merge` directo da branch. Claude escolhe conforme disponibilidade do `gh` e estado dos remotes.
- Commits de merge: mensagem no formato `merge: upstream PR #N — <título do PR>`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Upstream PRs (ler diffs antes de mergir)
- Upstream repo: `https://github.com/b-nnett/goose`
- PRs: #1, #3, #4, #5, #6, #7, #10, #12, #13

### Ficheiros fork-específicos a proteger
- `server/` — infraestrutura servidor (Phase 1)
- `GooseSwift/GooseAppModel+Upload.swift` — upload client (Phase 3)
- `GooseSwift/MoreRemoteServerViews.swift` — settings UI (Phase 2)
- `.planning/` — planning docs

### Requisitos
- `.planning/REQUIREMENTS.md` §Upstream Fork Integration (FORK-01 a FORK-10)
- `.planning/ROADMAP.md` §Phase 5 — success criteria

### Testes Rust
- `Rust/core/` — `cargo test` após cada PR que toque Rust

</canonical_refs>

<code_context>
## Existing Code Insights

### Integration Points
- `git remote add upstream https://github.com/b-nnett/goose` — remote a configurar (FORK-01)
- `cargo test` em `Rust/core/` — gate de qualidade após PRs Rust
- `gh` CLI disponível para `gh pr checkout` (verificar se autenticado com upstream repo)

### Fork-Specific Files (proteger em conflitos)
- `server/` (novo — Phase 1)
- `GooseSwift/GooseAppModel+Upload.swift` (novo — Phase 3)
- `GooseSwift/MoreRemoteServerViews.swift` (novo — Phase 2)
- `GooseSwift/MoreRouteModels.swift` (modificado — Phase 2, adição de .remoteServer)

</code_context>

<specifics>
## Specific Ideas

- PR #12 marcado como `autonomous: false` no plano — requer revisão manual do diff antes de mergir, dada a sobreposição com o upload client FFI.
- O utilizador pediu explicação dos PRs antes de integrar — o planner deve incluir um passo de revisão de cada PR antes do merge, não só o merge cego.

</specifics>

<deferred>
## Deferred Ideas

- PRs de volta ao upstream b-nnett/goose (UPSTREAM-V2-01) — deferred para v2
- Issues upstream respondidas (#2, #8, #9, #11) — fora do scope desta fase

</deferred>

---

*Phase: 5-Upstream PR Integration*
*Context gathered: 2026-06-03*
