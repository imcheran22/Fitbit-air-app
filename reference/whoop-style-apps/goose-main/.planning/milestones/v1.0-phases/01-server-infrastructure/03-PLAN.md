---
id: "03-PLAN"
wave: 3
depends_on:
  - "01-PLAN"
  - "02-PLAN"
files_modified:
  - server/.env (created locally, not committed)
autonomous: false
requirements_addressed:
  - SRVR-01
  - SRVR-02
  - SRVR-03
---

# Plan 03 — Verificação End-to-End (Stack Up + Endpoints)

## Objective

Verificar que a stack completa arranca corretamente com `docker compose up --build`, o endpoint `/healthz` retorna `{"status":"ok"}`, e `POST /v1/ingest-decoded` aceita dados com Bearer token e escreve nas hypertables TimescaleDB. Este plano é marcado `autonomous: false` porque requer intervenção manual para criar o `.env` local com credenciais reais.

## must_haves

```yaml
truths:
  - "docker compose up --build em server/ completa sem erros de build"
  - "GET http://localhost:8770/healthz retorna HTTP 200 com body {\"status\":\"ok\"}"
  - "POST /v1/ingest-decoded sem Authorization header retorna HTTP 401"
  - "POST /v1/ingest-decoded com Authorization: Bearer <GOOSE_API_KEY> retorna HTTP 200"
  - "docker compose ps mostra goose-db e goose-ingest em estado 'healthy'/'running'"
```

## Threat Model

```yaml
threats:
  - id: T-1-05
    category: Authentication Bypass
    severity: high
    description: "Endpoint /v1/ingest-decoded acessível sem Bearer token após deploy"
    mitigation: "Verificar que POST sem Authorization retorna 401 (require_auth dependency em FastAPI)"
  - id: T-1-06
    category: Availability
    severity: low
    description: "Containers não arrancam por ordem correcta (DB não pronto quando ingest inicia)"
    mitigation: "depends_on service_healthy já implementado — verificar que goose-db está healthy antes do goose-ingest"
```

## Tasks

### Task 03-01: Criar server/.env local (manual — não commitar)

```xml
<task id="03-01" type="execute" wave="3" autonomous="false">
  <title>Criar server/.env com credenciais locais de teste</title>

  <read_first>
    - server/.env.example (template com os 5 vars necessários)
    - .planning/phases/01-server-infrastructure/01-CONTEXT.md (D-03: named volumes)
    - .gitignore (confirmar que server/.env está coberto antes de criar o ficheiro)
  </read_first>

  <action>
    ACÇÃO MANUAL — O executor deve criar o ficheiro server/.env com credenciais reais de teste.
    
    Criar server/.env baseado em server/.env.example:
    
    GOOSE_API_KEY=<escolher_uma_chave_de_teste_forte>
    GOOSE_DB_NAME=goose
    GOOSE_DB_USER=goose
    GOOSE_DB_PASSWORD=<escolher_password_de_teste>
    GOOSE_INGEST_PORT=8770
    
    IMPORTANTE:
    - NÃO usar valores de produção — estas são credenciais de teste local
    - NÃO commitar server/.env (verificar com git status que aparece como ignored)
    - Usar um GOOSE_API_KEY simples mas não trivial (ex: "test-goose-key-local")
    
    Verificar antes de continuar:
    git check-ignore -v server/.env  → deve retornar match
    git status server/.env           → não deve aparecer como "to be committed"
  </action>

  <acceptance_criteria>
    - server/.env existe localmente
    - server/.env contém GOOSE_API_KEY com valor não vazio
    - server/.env contém GOOSE_DB_PASSWORD com valor não vazio
    - git status não mostra server/.env como staged ou untracked (está ignored)
    - cat server/.env | grep -q "GOOSE_API_KEY="
  </acceptance_criteria>
</task>
```

### Task 03-02: Build e arranque da stack Docker

```xml
<task id="03-02" type="execute" wave="3" depends_on="03-01">
  <title>Executar docker compose up --build e verificar arranque (SRVR-01)</title>

  <read_first>
    - server/docker-compose.yml (confirmar named volumes e serviços goose-*)
    - server/ingest/Dockerfile (confirmar multi-stage)
    - server/.env (confirmar credenciais presentes)
  </read_first>

  <action>
    Executar no directório server/ (ou com -f server/docker-compose.yml):
    
    cd server && docker compose up --build -d
    
    Aguardar 15-30 segundos para os containers arrancarem e o healthcheck do goose-db passar.
    
    Verificar estado:
    docker compose ps
    
    Resultado esperado: goose-db com status "healthy", goose-ingest com status "running".
    
    Se houver erros de build:
    - Verificar logs: docker compose logs goose-ingest
    - Verificar se requirements.txt tem todas as dependências
    - Verificar se whoop-protocol está acessível em packages/whoop-protocol/
    
    Se goose-ingest falha com "GOOSE_API_KEY is required" ou "GOOSE_DB_DSN is required":
    - Verificar que server/.env tem os valores correctos
    - Verificar que docker-compose.yml referencia GOOSE_* (não WHOOP_*)
  </action>

  <acceptance_criteria>
    - docker compose ps mostra "goose-db" com "(healthy)"
    - docker compose ps mostra "goose-ingest" com "running" ou "Up"
    - docker compose logs goose-ingest não contém "RuntimeError" ou "GOOSE_API_KEY is required"
    - docker compose logs goose-ingest contém "Application startup complete" (uvicorn ready)
  </acceptance_criteria>
</task>
```

### Task 03-03: Verificar GET /healthz retorna {"status":"ok"} (SRVR-02)

```xml
<task id="03-03" type="execute" wave="3" depends_on="03-02">
  <title>Verificar GET /healthz retorna {"status":"ok"} (SRVR-02)</title>

  <read_first>
    - server/ingest/app/main.py (confirmar implementação do endpoint /healthz)
    - server/.env (obter GOOSE_INGEST_PORT — default 8770)
  </read_first>

  <action>
    Executar:
    curl -s http://localhost:8770/healthz
    
    Resultado esperado: {"status":"ok"}
    
    Se retornar {"detail":"db unavailable: ..."}: 
    - O goose-db ainda não está pronto ou não está acessível
    - Verificar docker compose ps e docker compose logs goose-db
    
    Se retornar connection refused:
    - O goose-ingest não arrancou correctamente
    - Verificar docker compose logs goose-ingest
  </action>

  <acceptance_criteria>
    - curl -s http://localhost:8770/healthz | grep -q '"status":"ok"'
    - O comando retorna HTTP 200 (curl -s -o /dev/null -w "%{http_code}" http://localhost:8770/healthz retorna "200")
  </acceptance_criteria>
</task>
```

### Task 03-04: Verificar autenticação Bearer token em /v1/ingest-decoded (SRVR-03)

```xml
<task id="03-04" type="execute" wave="3" depends_on="03-03">
  <title>Verificar autenticação e ingest de dados (SRVR-03)</title>

  <read_first>
    - server/ingest/app/main.py (implementação de require_auth e /v1/ingest-decoded)
    - server/.env (obter GOOSE_API_KEY para o teste)
  </read_first>

  <action>
    Executar dois testes:
    
    1. Teste de rejeição (sem token — deve retornar 401):
    curl -s -o /dev/null -w "%{http_code}" -X POST \
      -H "Content-Type: application/json" \
      -d '{"device":{"id":"test"},"streams":{}}' \
      http://localhost:8770/v1/ingest-decoded
    Resultado esperado: "401"
    
    2. Teste de aceitação (com token válido — deve retornar 200):
    GOOSE_API_KEY=$(grep GOOSE_API_KEY server/.env | cut -d= -f2)
    curl -s -X POST \
      -H "Authorization: Bearer ${GOOSE_API_KEY}" \
      -H "Content-Type: application/json" \
      -d '{"device":{"id":"test-device","mac":null,"name":"test"},"streams":{"hr":[{"ts":1700000000,"bpm":70}],"rr":[],"events":[],"battery":[]}}' \
      http://localhost:8770/v1/ingest-decoded
    Resultado esperado: {"upserted":{"hr":1,"rr":0,...}} (JSON com contagens)
    
    Se o teste 2 retornar 500: verificar docker compose logs goose-ingest para o traceback.
  </action>

  <acceptance_criteria>
    - POST /v1/ingest-decoded sem Authorization retorna 401
    - POST /v1/ingest-decoded com Authorization: Bearer <GOOSE_API_KEY> retorna 200
    - Resposta do POST 200 contém "upserted" no JSON body
    - docker compose logs goose-ingest não contém traceback após o request
  </acceptance_criteria>
</task>
```

### Task 03-05: Verificar named volumes persistem após docker compose down

```xml
<task id="03-05" type="execute" wave="3" depends_on="03-04">
  <title>Verificar que named volumes persistem dados após reinício (SRVR-01)</title>

  <read_first>
    - server/docker-compose.yml (confirmar named volumes goose-db-data, goose-raw-data)
  </read_first>

  <action>
    Verificar que os named volumes existem após o compose up:
    
    docker volume ls | grep goose
    
    Resultado esperado: goose-db-data e goose-raw-data listados.
    
    Executar ciclo down (sem --volumes) e up:
    cd server && docker compose down
    docker compose up -d
    
    Aguardar 15 segundos e verificar que /healthz ainda retorna {"status":"ok"}:
    curl -s http://localhost:8770/healthz
    
    Os dados do teste anterior (hr_samples com device_id="test-device") devem persistir.
  </action>

  <acceptance_criteria>
    - docker volume ls | grep -q "goose-db-data"
    - docker volume ls | grep -q "goose-raw-data"
    - Após docker compose down + docker compose up: GET /healthz retorna {"status":"ok"}
    - Os volumes NÃO são destruídos por docker compose down (apenas por docker compose down --volumes)
  </acceptance_criteria>
</task>
```

## Verification

```yaml
verification:
  commands:
    - "curl -sf http://localhost:8770/healthz | grep -q '\"status\":\"ok\"'"
    - "curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{\"device\":{\"id\":\"test\"},\"streams\":{}}' http://localhost:8770/v1/ingest-decoded | grep -q 401"
    - "docker compose -f server/docker-compose.yml ps | grep -q 'healthy'"
    - "docker volume ls | grep -q goose-db-data"
    - "docker volume ls | grep -q goose-raw-data"
  manual:
    - "Verificar que server/.env não aparece em git status como rastreado"
    - "Verificar que POST /v1/ingest-decoded com token válido escreve hr_samples: docker exec goose-db psql -U goose -d goose -c 'SELECT COUNT(*) FROM hr_samples'"
```
