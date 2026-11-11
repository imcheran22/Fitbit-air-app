# Phase 1: Server Infrastructure - Context

**Gathered:** 2026-06-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Copiar o servidor my-whoop completo para `server/` no repo Goose, renomear prefixos para `GOOSE_`, empacotar em Docker com named volumes e multi-stage Dockerfile, e garantir que nenhum segredo real entra no git.

Entregável: utilizador executa `docker compose up --build` em `server/` e obtém stack funcional (TimescaleDB + FastAPI ingest) que responde a `/healthz` e aceita `POST /v1/ingest-decoded` com Bearer token.

</domain>

<decisions>
## Implementation Decisions

### Copy Scope
- **D-01:** Copiar o server completo do my-whoop — `ingest/`, `db/`, `packages/`, `client/`, `dashboard/`. O repo Goose fica auto-suficiente sem depender do my-whoop para qualquer componente.

### Naming Convention
- **D-02:** Renomear todos os prefixos de `WHOOP_` para `GOOSE_` — env vars (`GOOSE_API_KEY`, `GOOSE_DB_NAME`, `GOOSE_DB_USER`, `GOOSE_DB_PASSWORD`, `GOOSE_INGEST_PORT`), nomes de containers (`goose-db`, `goose-ingest`), nomes de rede Docker, e todas as referências no código Python (e.g., `os.environ.get("GOOSE_API_KEY")`). Os nomes das tabelas no TimescaleDB são detalhe de implementação e podem permanecer como estão.

### Volume Strategy
- **D-03:** Usar named volumes Docker (`goose-db-data` para dados PostgreSQL, `goose-raw-data` para frames raw). Sem `DATA_ROOT` — `docker compose up` funciona out-of-the-box.

### Dockerfile (Multi-stage)
- **D-04:** Escrever Dockerfile multi-stage: stage `builder` instala dependências Python e constrói wheels; stage `runtime` copia os wheels do builder para uma imagem `python:3.11-slim` limpa. Cumpre SRVR-04.

### Claude's Discretion
- Porta default do servidor: manter 8770 (mesma que my-whoop, configurável via GOOSE_INGEST_PORT).
- Estrutura interna do `server/` no Goose: replicar a estrutura de `my-whoop/server/` directamente.
- `.env.example` deve ter todos os 5 vars (`GOOSE_API_KEY`, `GOOSE_DB_NAME`, `GOOSE_DB_USER`, `GOOSE_DB_PASSWORD`, `GOOSE_INGEST_PORT`) com placeholders claros.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Servidor de origem (a copiar)
- `/Users/francisco/Documents/my-whoop/server/` — directório completo a copiar para `server/` no Goose
- `/Users/francisco/Documents/my-whoop/server/docker-compose.yml` — base para o novo docker-compose com named volumes e prefixos GOOSE_
- `/Users/francisco/Documents/my-whoop/server/ingest/Dockerfile` — base para o novo Dockerfile multi-stage
- `/Users/francisco/Documents/my-whoop/server/.env.example` — base para o novo .env.example com prefixos GOOSE_
- `/Users/francisco/Documents/my-whoop/server/ingest/app/config.py` — lê env vars WHOOP_* → mudar para GOOSE_*
- `/Users/francisco/Documents/my-whoop/server/ingest/app/main.py` — endpoints FastAPI incluindo `/healthz` e `/v1/ingest-decoded`

### Repo Goose (destino)
- `REQUIREMENTS.md` §Server Infrastructure (SRVR-01 a SRVR-06) — critérios de aceitação obrigatórios
- `.planning/ROADMAP.md` §Phase 1 — success criteria

### Segredos e gitignore
- `.gitignore` na raiz do repo — verificar se `.env` já está coberto; adicionar `server/.env` se necessário

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Nenhum: Phase 1 é puramente server-side (Python/Docker). O iOS (Swift/Rust) não é tocado nesta fase.

### Established Patterns
- O my-whoop usa `docker compose` com `depends_on: condition: service_healthy` para garantir que o ingest só arranca após o DB estar pronto — manter este padrão.
- O ingest usa `Depends(require_auth)` em todos os endpoints — Bearer token via `GOOSE_API_KEY`.
- O Dockerfile usa `context: .` (dir `server/`) para poder copiar `packages/whoop-protocol` — manter esta convenção.

### Integration Points
- `server/` vai ser adicionado ao repo Goose como novo directório de topo — sem conflito com código iOS existente.
- `.gitignore` na raiz do Goose precisa de cobrir `server/.env`.

</code_context>

<specifics>
## Specific Ideas

- Renomear prefixos WHOOP_ → GOOSE_ em todas as ocorrências no código Python copiado (config.py, main.py, docker-compose.yml, .env.example, e quaisquer outros ficheiros que referenciem WHOOP_).
- Named volumes em vez de bind mounts: remove o requisito de definir DATA_ROOT antes de `docker compose up`.

</specifics>

<deferred>
## Deferred Ideas

None — discussão manteve-se dentro do scope da Phase 1.

</deferred>

---

*Phase: 1-Server Infrastructure*
*Context gathered: 2026-06-03*
