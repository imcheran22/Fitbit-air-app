# Roadmap: Goose — Servidor Remoto + Contribuições Upstream

## Overview

Milestone que adiciona três capacidades ao fork tigercraft4/goose: (1) servidor FastAPI+TimescaleDB self-hosted copiado do my-whoop para `server/` e empacotado em Docker, (2) cliente de upload iOS em SwiftUI+URLSession que envia dados WHOOP decodificados para o servidor, e (3) revisão e integração dos 9 PRs abertos do upstream `b-nnett/goose`. A sequência entrega primeiro o servidor funcional (sem risco iOS), depois a configuração iOS, depois o upload propriamente dito, depois o feedback de estado, e finalmente a integração dos PRs upstream em ordem de risco.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Server Infrastructure** - Copiar servidor my-whoop para `server/`, empacotar em Docker multi-stage, garantir higiene de segredos [3 plans]
- [ ] **Phase 2: iOS Server Settings** - Configuração de URL/token na tab More com persistência Keychain/UserDefaults
- [x] **Phase 3: iOS Upload Client** - Serviço de upload automático POST /v1/ingest-decoded com retry e idempotência (completed 2026-06-03)
- [ ] **Phase 4: Upload Status Feedback** - Health check ao arrancar e estado de upload visível na tab More
- [x] **Phase 5: Upstream PR Integration** - Integrar 9 PRs do upstream b-nnett/goose em ordem de risco (completed 2026-06-03)

## Phase Details

### Phase 1: Server Infrastructure
**Goal**: O servidor FastAPI+TimescaleDB está no repo Goose, corre em Docker, responde ao endpoint de ingest, e nenhum segredo real está no git
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: SRVR-01, SRVR-02, SRVR-03, SRVR-04, SRVR-05, SRVR-06
**Success Criteria** (what must be TRUE):
  1. Utilizador corre `docker compose up --build` em `server/` e obtém stack funcional sem erros
  2. `GET /healthz` retorna `{"status":"ok"}` após deploy
  3. `POST /v1/ingest-decoded` com Bearer token válido escreve rows nas hypertables TimescaleDB
  4. `.env` e ficheiros com segredos estão no `.gitignore`; apenas `.env.example` com placeholders está commitado
**Plans**:
- Wave 1: 01-PLAN (Copy server + rename WHOOP_ → GOOSE_ + .gitignore)
- Wave 2 *(blocked on Wave 1 completion)*: 02-PLAN (Dockerfile multi-stage + docker-compose named volumes)
- Wave 3 *(blocked on Wave 2 completion)*: 03-PLAN (Verification end-to-end — stack up + endpoints)

**Cross-cutting constraints:**
- server/.env nunca commitado (T-1-01 em todos os planos)
- docker build context é sempre server/ (não repo root)

### Phase 2: iOS Server Settings
**Goal**: Utilizador pode configurar URL do servidor e API key na tab More, com persistência segura entre sessões
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: SETT-01, SETT-02, SETT-03, SETT-04, SETT-05
**Success Criteria** (what must be TRUE):
  1. Utilizador abre tab More, navega para Remote Server e consegue inserir e guardar a URL do servidor
  2. API key (Bearer token) é guardada no Keychain (não em UserDefaults) e persiste entre arranques da app
  3. Toggle de upload ativa/desativa o envio de dados sem reiniciar a app
  4. URL inválida (IP nu sem hostname resolúvel) é rejeitada com mensagem de erro clara
**Plans**: TBD
**UI hint**: yes

### Phase 3: iOS Upload Client
**Goal**: App faz upload automático de dados biométricos decodificados após cada batch SQLite confirmado, com retry e sem bloquear a thread principal
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: UPLD-01, UPLD-02, UPLD-03, UPLD-04, UPLD-05, UPLD-06, UPLD-07
**Success Criteria** (what must be TRUE):
  1. Após captura BLE bem sucedida, dados aparecem nas hypertables TimescaleDB em segundos (upload automático)
  2. Payload inclui `device_id` correto (UUID BLE) e `device_generation` correto ("4.0" ou "5.0")
  3. Falha de rede aciona 3 tentativas com backoff 1s/2s/4s sem intervenção do utilizador
  4. Upload não bloqueia UI — captura BLE e navegação na app decorrem normalmente durante upload
  5. Com toggle desativado ou servidor não configurado, nenhum pedido de rede é feito
**Plans**: TBD

### Phase 4: Upload Status Feedback
**Goal**: Utilizador consegue confirmar na app que o servidor está acessível e que os dados estão a ser enviados
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: FEED-01, FEED-02, FEED-03, FEED-04
**Success Criteria** (what must be TRUE):
  1. Ao arrancar com upload habilitado, app verifica `/healthz` e mostra "Servidor acessível" ou "Servidor inacessível" na tab More
  2. Tab More mostra timestamp do último upload bem sucedido
  3. Tab More mostra contagem de batches pendentes por upload
**Plans**: TBD
**UI hint**: yes

### Phase 5: Upstream PR Integration
**Goal**: Os 9 PRs abertos do upstream b-nnett/goose estão integrados no fork em ordem de risco, sem conflitos com a infraestrutura fork-específica
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: FORK-01, FORK-02, FORK-03, FORK-04, FORK-05, FORK-06, FORK-07, FORK-08, FORK-09, FORK-10
**Success Criteria** (what must be TRUE):
  1. Remote `upstream` configurado e `git fetch upstream` traz branches dos 9 PRs
  2. Todos os 9 PRs integrados via `git merge --no-ff` (não cherry-pick) sem conflitos residuais
  3. Testes Rust (`cargo test`) passam após cada merge de PR que toca Rust core
  4. Infraestrutura fork-específica (`server/`, cliente upload iOS) não foi alterada ou corrompida pelos merges
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Server Infrastructure | 2/3 | In Progress|  |
| 2. iOS Server Settings | 0/TBD | Not started | - |
| 3. iOS Upload Client | 3/3 | Complete    | 2026-06-03 |
| 4. Upload Status Feedback | 0/TBD | Not started | - |
| 5. Upstream PR Integration | 4/4 | Complete    | 2026-06-03 |
