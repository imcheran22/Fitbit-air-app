---
plan: "01-PLAN"
status: complete
completed: "2026-06-03"
commit: "5bb12ee"
---

# Plan 01 Summary — Copy Server and Rename Prefixes

## What Was Built

Copiado o servidor my-whoop completo para `server/` no repo Goose e renomeados todos os prefixos `WHOOP_` para `GOOSE_` nos ficheiros críticos do serviço.

## Tasks Completed

| Task | Status | Notes |
|------|--------|-------|
| 01-01: Copiar servidor my-whoop para server/ | ✓ Complete | cp -r /Users/francisco/Documents/my-whoop/server/ /Users/francisco/Documents/goose/server/ |
| 01-02: Adicionar server/.env ao .gitignore | ✓ Complete | + Python venv/cache patterns |
| 01-03: Rename WHOOP_ → GOOSE_ em config.py | ✓ Complete | GOOSE_API_KEY, GOOSE_DB_DSN, GOOSE_RAW_ROOT |
| 01-04: Rename logger e título FastAPI em main.py | ✓ Complete | goose.ingest, Goose Ingest |
| 01-05: Actualizar .env.example com prefixos GOOSE_ | ✓ Complete | 5 variáveis exactas |
| 01-06: Verificar zero referências WHOOP_ residuais | ✓ Complete | Tests também actualizados |

## Key Files Created/Modified

- `server/` (novo directório — cópia completa do servidor my-whoop)
- `server/ingest/app/config.py` — GOOSE_API_KEY, GOOSE_DB_DSN, GOOSE_RAW_ROOT
- `server/ingest/app/main.py` — goose.ingest logger, Goose Ingest FastAPI title
- `server/.env.example` — 5 variáveis GOOSE_* com valores placeholder
- `.gitignore` — server/.env + Python venv/cache patterns adicionados
- `server/ingest/tests/*.py` — 6 ficheiros de teste actualizados para GOOSE_* env vars

## Deviations

- Os testes (test_*.py) também foram actualizados para GOOSE_API_KEY/GOOSE_DB_DSN/GOOSE_RAW_ROOT — o plano não listava explicitamente os testes mas é necessário para consistência com config.py
- `server/ingest/app/whoop_api/` mantém "WHOOP_" nas variáveis OAuth (WHOOP_CLIENT_ID, etc.) — estas são variáveis da API pública WHOOP, não do nosso servidor, e NÃO devem ser renomeadas
- `server/packages/whoop-protocol/` mantém o nome "whoop" — é o nome do protocolo BLE proprietário, não renomear

## Acceptance Criteria Verified

- [x] server/ingest/app/config.py contém GOOSE_API_KEY, GOOSE_DB_DSN, GOOSE_RAW_ROOT (sem WHOOP_)
- [x] server/ingest/app/main.py contém getLogger("goose.ingest") e FastAPI(title="Goose Ingest")
- [x] server/.env.example tem exactamente 5 variáveis GOOSE_*
- [x] grep -r 'WHOOP_' server/ingest/app/config.py server/ingest/app/main.py server/.env.example retorna zero linhas
- [x] git check-ignore -v server/.env retorna match
- [x] git ls-files server/.env retorna vazio

## Self-Check: PASSED
