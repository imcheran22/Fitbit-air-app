---
phase: 1
slug: server-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-03
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | curl + bash (smoke tests); docker compose (integration) |
| **Config file** | `server/docker-compose.yml` |
| **Quick run command** | `curl -s http://localhost:8770/healthz` |
| **Full suite command** | `cd server && docker compose up --build -d && sleep 5 && curl -sf http://localhost:8770/healthz` |
| **Estimated runtime** | ~120 seconds (docker build) |

---

## Sampling Rate

- **After every task commit:** Verificar que ficheiros alvo existem e têm conteúdo correcto (grep)
- **After every plan wave:** `docker compose up --build` sem erros + `GET /healthz` retorna `{"status":"ok"}`
- **Before `/gsd-verify-work`:** Full suite deve estar verde (stack up + endpoint tests)
- **Max feedback latency:** 180 seconds (build + startup)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | SRVR-01 | — | N/A | smoke | `ls server/ingest/app/main.py server/db/init.sql server/docker-compose.yml` | ✅ | ⬜ pending |
| 1-01-02 | 01 | 1 | SRVR-06 | T-1-01 | .env não commitado | security | `git check-ignore -v server/.env && git ls-files server/.env \| wc -l \| grep -q 0` | ✅ | ⬜ pending |
| 1-01-03 | 01 | 1 | SRVR-05 | — | N/A | contract | `grep -q "GOOSE_API_KEY=change_me" server/.env.example && grep -q "GOOSE_DB_PASSWORD=change_me" server/.env.example` | ✅ | ⬜ pending |
| 1-02-01 | 02 | 1 | SRVR-04 | — | N/A | contract | `grep -c "^FROM" server/ingest/Dockerfile \| grep -q 2` | ✅ | ⬜ pending |
| 1-02-02 | 02 | 2 | SRVR-01 | — | N/A | integration | `cd server && docker compose up --build -d; sleep 10; docker compose ps \| grep -q "healthy"` | ✅ | ⬜ pending |
| 1-02-03 | 02 | 2 | SRVR-02 | — | N/A | integration | `curl -sf http://localhost:8770/healthz \| grep -q '"status":"ok"'` | ✅ | ⬜ pending |
| 1-02-04 | 02 | 2 | SRVR-03 | T-1-02 | 401 sem token válido | security | `curl -s -o /dev/null -w "%{http_code}" http://localhost:8770/v1/ingest-decoded \| grep -q 401` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/.env` com credenciais reais criado localmente (não commitado) — necessário para `docker compose up`
- [ ] Docker e Docker Compose instalados na máquina do utilizador

*Não há framework de testes a instalar — a stack usa curl/bash para verificação.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `POST /v1/ingest-decoded` escreve rows nas hypertables | SRVR-03 | Requer dados biométricos reais ou payload de teste + acesso ao DB | `curl -X POST -H "Authorization: Bearer $GOOSE_API_KEY" -H "Content-Type: application/json" -d '{"device":{"id":"test-device"},"streams":{"hr":[{"ts":1700000000,"bpm":70}]}}' http://localhost:8770/v1/ingest-decoded` → 200; depois `docker exec goose-db psql -U goose -d goose -c "SELECT COUNT(*) FROM hr_samples"` mostra > 0 |
| Named volumes persistem após `docker compose down` | SRVR-01 (implícito) | Requer ciclo down/up manual | `docker compose down; docker compose up -d; curl -sf http://localhost:8770/healthz` — dados anteriores devem persistir |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
