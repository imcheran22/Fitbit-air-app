---
id: "02-PLAN"
wave: 2
depends_on:
  - "01-PLAN"
files_modified:
  - server/docker-compose.yml
  - server/ingest/Dockerfile
autonomous: true
requirements_addressed:
  - SRVR-01
  - SRVR-02
  - SRVR-03
  - SRVR-04
---

# Plan 02 — Docker Multi-Stage + Named Volumes

## Objective

Adaptar o `docker-compose.yml` para usar named volumes (sem `DATA_ROOT`), renomear serviços e containers para `goose-*`, e converter o Dockerfile para multi-stage (builder + runtime slim). No final, `docker compose up --build` na directoria `server/` deve funcionar sem configuração adicional além do `.env`.

## must_haves

```yaml
truths:
  - "server/docker-compose.yml tem serviços 'goose-db' e 'goose-ingest' (sem 'goose-db' nem 'goose-ingest')"
  - "server/docker-compose.yml tem volumes nomeados 'goose-db-data' e 'goose-raw-data' na secção 'volumes:' de topo"
  - "server/docker-compose.yml não referencia DATA_ROOT em nenhuma linha"
  - "server/docker-compose.yml mantém 'depends_on: goose-db: condition: service_healthy'"
  - "server/ingest/Dockerfile tem exactamente 2 stages (grep -c '^FROM' retorna 2)"
  - "server/ingest/Dockerfile tem 'AS builder' e 'AS runtime' (ou nomes equivalentes)"
  - "docker compose -f server/docker-compose.yml config retorna YAML válido (exit 0)"
```

## Threat Model

```yaml
threats:
  - id: T-1-03
    category: Availability
    severity: medium
    description: "Ingest arranca antes do DB estar pronto — falha na ligação psycopg"
    mitigation: "depends_on com condition: service_healthy garante que o ingest só arranca após pg_isready passar"
  - id: T-1-04
    category: Information Disclosure
    severity: low
    description: "Credenciais de DB em POSTGRES_PASSWORD passadas como env var em texto claro no docker-compose.yml"
    mitigation: "Valor lido de ${GOOSE_DB_PASSWORD} do .env — nunca hardcoded. .env está no .gitignore (T-1-01)."
```

## Tasks

### Task 02-01: Adaptar docker-compose.yml para named volumes e nomes GOOSE_

```xml
<task id="02-01" type="execute" wave="2">
  <title>Adaptar docker-compose.yml — named volumes + serviços goose-* (SRVR-01)</title>

  <read_first>
    - server/docker-compose.yml (estado actual após cópia — tem prefixos WHOOP_ e bind mounts)
    - .planning/phases/01-server-infrastructure/01-RESEARCH.md §3.1 (estrutura exacta do novo docker-compose.yml)
    - .planning/phases/01-server-infrastructure/01-PATTERNS.md Pattern 1 e Pattern 5
    - .planning/phases/01-server-infrastructure/01-CONTEXT.md (D-02, D-03)
  </read_first>

  <action>
    Reescrever server/docker-compose.yml com as seguintes mudanças (ler o ficheiro actual primeiro para preservar qualquer campo não listado aqui):
    
    1. Serviço DB:
       - Renomear serviço de "goose-db" para "goose-db"
       - container_name: "goose-db" (era "goose-db")
       - POSTGRES_DB: ${GOOSE_DB_NAME:-goose}
       - POSTGRES_USER: ${GOOSE_DB_USER:-goose}
       - POSTGRES_PASSWORD: ${GOOSE_DB_PASSWORD}
       - Volume: "goose-db-data:/var/lib/postgresql/data" (era "${DATA_ROOT}/whoop/db:/var/lib/postgresql/data")
       - Healthcheck: pg_isready -U ${GOOSE_DB_USER:-goose} -d ${GOOSE_DB_NAME:-goose}
    
    2. Serviço ingest:
       - Renomear serviço de "goose-ingest" para "goose-ingest"
       - container_name: "goose-ingest" (era "goose-ingest")
       - depends_on: goose-db: condition: service_healthy (era goose-db)
       - GOOSE_API_KEY: ${GOOSE_API_KEY}
       - GOOSE_DB_DSN: postgresql://${GOOSE_DB_USER:-goose}:${GOOSE_DB_PASSWORD}@goose-db:5432/${GOOSE_DB_NAME:-goose}
       - GOOSE_RAW_ROOT: /data/raw
       - Volume: "goose-raw-data:/data/raw" (era "${DATA_ROOT}/whoop/raw:/data/raw")
       - Port: "${GOOSE_INGEST_PORT:-8770}:8000" (era "${WHOOP_INGEST_PORT:-8770}:8000")
    
    3. Adicionar secção de volumes de topo (após services:):
       volumes:
         goose-db-data:
         goose-raw-data:
    
    4. Actualizar comentário de topo: "Goose stack: TimescaleDB datastore + FastAPI ingest service."
       Remover qualquer referência a DATA_ROOT nos comentários.
    
    Manter: restart: unless-stopped, TZ env var, healthcheck interval/timeout/retries, build context: . (server/).
  </action>

  <acceptance_criteria>
    - server/docker-compose.yml contém "goose-db:" como nome de serviço
    - server/docker-compose.yml contém "goose-ingest:" como nome de serviço
    - server/docker-compose.yml contém "goose-db-data:/var/lib/postgresql/data"
    - server/docker-compose.yml contém "goose-raw-data:/data/raw"
    - server/docker-compose.yml contém secção "volumes:" de topo com "goose-db-data:" e "goose-raw-data:"
    - grep "DATA_ROOT" server/docker-compose.yml retorna vazio
    - grep "WHOOP_\|goose-db\|goose-ingest" server/docker-compose.yml retorna vazio
    - grep "service_healthy" server/docker-compose.yml retorna match (healthcheck mantido)
    - docker compose -f server/docker-compose.yml config retorna exit 0 (YAML válido)
  </acceptance_criteria>
</task>
```

### Task 02-02: Converter Dockerfile para multi-stage (SRVR-04)

```xml
<task id="02-02" type="execute" wave="2">
  <title>Converter Dockerfile para multi-stage builder + runtime (SRVR-04)</title>

  <read_first>
    - server/ingest/Dockerfile (estado actual após cópia — single-stage)
    - .planning/phases/01-server-infrastructure/01-RESEARCH.md §3.2 (estrutura exacta do Dockerfile multi-stage)
    - .planning/phases/01-server-infrastructure/01-PATTERNS.md Pattern 2
    - .planning/phases/01-server-infrastructure/01-CONTEXT.md (D-04)
  </read_first>

  <action>
    Substituir o conteúdo de server/ingest/Dockerfile pelo seguinte Dockerfile multi-stage:
    
    # Build context MUST be the server/ dir (set in docker-compose.yml) so we can
    # install the local whoop-protocol package.
    
    # Stage 1: builder — install Python deps into /install prefix
    FROM python:3.11-slim AS builder
    WORKDIR /build
    COPY ingest/requirements.txt /build/requirements.txt
    RUN pip install --no-cache-dir --prefix=/install -r /build/requirements.txt
    
    # Stage 2: runtime — lean image with pre-built wheels from builder
    FROM python:3.11-slim AS runtime
    WORKDIR /app
    # Copy installed packages from builder stage
    COPY --from=builder /install /usr/local
    # Install local whoop-protocol package
    COPY packages/whoop-protocol /app/whoop-protocol
    RUN pip install --no-cache-dir /app/whoop-protocol
    # Copy schema and application
    COPY db /app/db
    COPY ingest/app /app/app
    EXPOSE 8000
    CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
    
    Nota: O contexto de build é server/ (definido no docker-compose.yml), portanto os paths COPY
    são relativos a server/. Este comportamento é mantido do Dockerfile original.
  </action>

  <acceptance_criteria>
    - grep -c "^FROM" server/ingest/Dockerfile retorna 2
    - server/ingest/Dockerfile contém "AS builder"
    - server/ingest/Dockerfile contém "AS runtime"
    - server/ingest/Dockerfile contém "COPY --from=builder"
    - server/ingest/Dockerfile contém "pip install --no-cache-dir --prefix=/install"
    - server/ingest/Dockerfile contém "COPY packages/whoop-protocol /app/whoop-protocol"
    - server/ingest/Dockerfile contém "EXPOSE 8000"
    - server/ingest/Dockerfile contém CMD com "uvicorn"
  </acceptance_criteria>
</task>
```

### Task 02-03: Verificar docker compose config (YAML válido)

```xml
<task id="02-03" type="execute" wave="2" depends_on="02-01 02-02">
  <title>Verificar docker compose config valida sem erros</title>

  <read_first>
    - server/docker-compose.yml (após edições da Task 02-01)
    - server/ingest/Dockerfile (após edições da Task 02-02)
  </read_first>

  <action>
    Executar validação de sintaxe do docker-compose.yml:
    
    cd server && docker compose config --quiet
    
    Se retornar erro: corrigir o problema no docker-compose.yml (YAML inválido, referências a serviços inexistentes, etc.).
    
    Adicionalmente, verificar:
    - docker compose config --services retorna "goose-db" e "goose-ingest" (e não whoop-*)
    - docker compose config mostra volumes "goose-db-data" e "goose-raw-data" na secção volumes
  </action>

  <acceptance_criteria>
    - docker compose -f server/docker-compose.yml config retorna exit 0
    - docker compose -f server/docker-compose.yml config --services contém "goose-db" e "goose-ingest"
    - docker compose -f server/docker-compose.yml config | grep -q "goose-db-data"
    - docker compose -f server/docker-compose.yml config | grep -q "goose-raw-data"
    - docker compose -f server/docker-compose.yml config | grep -q "DATA_ROOT" retorna vazio (sem bind mounts de DATA_ROOT)
  </acceptance_criteria>
</task>
```

## Verification

```yaml
verification:
  commands:
    - "grep -c '^FROM' server/ingest/Dockerfile | grep -q 2"
    - "grep -q 'AS builder' server/ingest/Dockerfile && grep -q 'AS runtime' server/ingest/Dockerfile"
    - "docker compose -f server/docker-compose.yml config --quiet"
    - "docker compose -f server/docker-compose.yml config --services"
    - "grep -q 'goose-db-data' server/docker-compose.yml && grep -q 'goose-raw-data' server/docker-compose.yml"
    - "grep 'DATA_ROOT\\|WHOOP_\\|goose-db\\|goose-ingest' server/docker-compose.yml | wc -l | grep -q '^0$'"
  manual: []
```
