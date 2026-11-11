---
plan: "02-PLAN"
status: complete
completed: "2026-06-03"
commit: "ced49d7"
---

# Plan 02 Summary — Docker Multi-Stage + Named Volumes

## What Was Built

Adaptado o `docker-compose.yml` para usar named volumes Docker (sem `DATA_ROOT`), renomeados serviços e containers para `goose-*`, e convertido o Dockerfile para multi-stage (builder + runtime slim).

## Tasks Completed

| Task | Status | Notes |
|------|--------|-------|
| 02-01: Adaptar docker-compose.yml — named volumes + serviços goose-* | ✓ Complete | Serviços, env vars, volumes, healthcheck actualizados |
| 02-02: Converter Dockerfile para multi-stage builder + runtime | ✓ Complete | 2 stages: python:3.11-slim AS builder + AS runtime |
| 02-03: Verificar docker compose config valida sem erros | ✓ Complete | exit 0; warnings esperados (env vars não definidas sem .env) |

## Key Files Modified

- `server/docker-compose.yml` — serviços goose-db/goose-ingest, GOOSE_* vars, named volumes goose-db-data/goose-raw-data, depends_on service_healthy mantido
- `server/ingest/Dockerfile` — multi-stage: builder instala wheels em /install; runtime copia e serve

## Acceptance Criteria Verified

- [x] server/docker-compose.yml tem serviços 'goose-db' e 'goose-ingest'
- [x] server/docker-compose.yml tem volumes nomeados 'goose-db-data' e 'goose-raw-data' na secção 'volumes:' de topo
- [x] server/docker-compose.yml não referencia DATA_ROOT em nenhuma linha
- [x] server/docker-compose.yml mantém 'depends_on: goose-db: condition: service_healthy'
- [x] server/ingest/Dockerfile tem exactamente 2 stages (grep -c '^FROM' retorna 2)
- [x] server/ingest/Dockerfile tem 'AS builder' e 'AS runtime'
- [x] docker compose -f server/docker-compose.yml config retorna YAML válido (exit 0)

## Self-Check: PASSED
