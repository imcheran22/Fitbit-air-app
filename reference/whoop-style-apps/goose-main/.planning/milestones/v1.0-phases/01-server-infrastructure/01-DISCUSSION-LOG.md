# Phase 1: Server Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-03
**Phase:** 1-Server Infrastructure
**Areas discussed:** Copy scope, Naming convention, Volume strategy

---

## Copy Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Ingest + db + packages (Recomendado) | Só o necessário: FastAPI, esquema SQL, e o pacote whoop-protocol que o Dockerfile usa. Client e dashboard ficam no my-whoop. | |
| Server completo | Copiar tudo (ingest + db + packages + client + dashboard). Mais componentes mas repo auto-suficiente. | ✓ |

**User's choice:** Server completo
**Notes:** O utilizador quer que o repo Goose seja auto-suficiente sem depender do my-whoop para qualquer componente.

---

## Naming Convention

| Option | Description | Selected |
|--------|-------------|----------|
| Manter WHOOP_ (Recomendado) | Os dados são WHOOP e o prefixo é semanticamente correto. Menos diff, mais fácil sincronizar com my-whoop no futuro. | |
| Renomear para GOOSE_ | GOOSE_API_KEY, goose-db, goose-ingest. Mais alinhado com o repo mas requer alterar código do servidor. | ✓ |

**User's choice:** Renomear para GOOSE_
**Notes:** Todos os prefixos — env vars, container names, rede Docker, e referências no código Python — mudam de WHOOP_ para GOOSE_.

---

## Volume Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Named volumes Docker (Recomendado) | goose-db-data e goose-raw-data geridos pelo Docker. `docker compose up` funciona sem configurar DATA_ROOT. | ✓ |
| Manter DATA_ROOT | Bind mount em ${DATA_ROOT}/goose/. Utilizador controla onde os dados ficam no disco. | |
| Bind mount simples ./data/ | Volumes em ./data/db e ./data/raw relativos ao server/. | |

**User's choice:** Named volumes Docker
**Notes:** Remove o requisito de definir DATA_ROOT antes de `docker compose up`. Mais simples para self-hosted.

---

## Claude's Discretion

- Porta default: 8770 (mesma que my-whoop, configurável via GOOSE_INGEST_PORT)
- Estrutura interna do `server/`: replicar my-whoop/server/ directamente
- Dockerfile multi-stage: stage builder (instala wheels) + stage runtime (imagem slim limpa)
- `.env.example` com 5 vars e placeholders claros

## Deferred Ideas

None — discussão manteve-se dentro do scope da Phase 1.
