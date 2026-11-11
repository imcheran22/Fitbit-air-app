---
id: "01-PLAN"
wave: 1
depends_on: []
files_modified:
  - server/ (new directory — copied from /Users/francisco/Documents/my-whoop/server/)
  - server/ingest/app/config.py
  - server/ingest/app/main.py
  - .gitignore
autonomous: true
requirements_addressed:
  - SRVR-01
  - SRVR-05
  - SRVR-06
---

# Plan 01 — Copy Server and Rename Prefixes

## Objective

Copiar o servidor my-whoop completo para `server/` no repo Goose e renomear todos os prefixos `WHOOP_` para `GOOSE_` — env vars, nomes de containers, logger, e título FastAPI. Adicionar `server/.env` ao `.gitignore`. No final desta wave, o código está no lugar certo com os nomes correctos.

## must_haves

```yaml
truths:
  - "server/ingest/app/config.py contém GOOSE_API_KEY, GOOSE_DB_DSN, GOOSE_RAW_ROOT (sem WHOOP_)"
  - "server/ingest/app/main.py contém getLogger('goose.ingest') e FastAPI(title='Goose Ingest')"
  - "server/.env.example tem exactamente 5 variáveis: GOOSE_API_KEY, GOOSE_DB_NAME, GOOSE_DB_USER, GOOSE_DB_PASSWORD, GOOSE_INGEST_PORT"
  - "grep -r 'WHOOP_' server/ --include='*.py' --include='*.yml' --include='.env.example' retorna zero linhas"
  - "git check-ignore -v server/.env retorna match (.gitignore cobre server/.env)"
  - "git ls-files server/.env retorna vazio (ficheiro não rastreado)"
```

## Threat Model

```yaml
threats:
  - id: T-1-01
    category: Information Disclosure
    severity: high
    description: "Ficheiro server/.env com credenciais reais commitado acidentalmente no git"
    mitigation: "Adicionar server/.env ao .gitignore ANTES de qualquer git add. Verificar com git check-ignore."
  - id: T-1-02
    category: Information Disclosure
    severity: low
    description: "Referências WHOOP_ residuais no código expõem nomes do sistema de origem"
    mitigation: "Grep pós-rename para verificar zero ocorrências de WHOOP_ em ficheiros Python e YAML"
```

## Tasks

### Task 01-01: Copiar servidor my-whoop para server/

```xml
<task id="01-01" type="execute" wave="1">
  <title>Copiar servidor my-whoop para server/</title>

  <read_first>
    - /Users/francisco/Documents/my-whoop/server/ (directório fonte completo)
    - .planning/phases/01-server-infrastructure/01-CONTEXT.md (D-01: o que copiar)
    - .planning/phases/01-server-infrastructure/01-PATTERNS.md (lista de ficheiros)
  </read_first>

  <action>
    Copiar o directório completo /Users/francisco/Documents/my-whoop/server/ para server/ na raiz do repo Goose (/Users/francisco/Documents/goose/server/).
    
    Executar:
    cp -r /Users/francisco/Documents/my-whoop/server/ /Users/francisco/Documents/goose/server/
    
    Verificar que os seguintes subdirectórios existem em server/:
    - ingest/ (com app/, Dockerfile, requirements.txt)
    - db/ (com init.sql)
    - packages/ (com whoop-protocol/)
    - client/
    - dashboard/
    - docker-compose.yml
    - .env.example
    
    NÃO copiar .env real se existir — apenas .env.example.
  </action>

  <acceptance_criteria>
    - server/ingest/app/main.py existe
    - server/ingest/app/config.py existe
    - server/db/init.sql existe
    - server/docker-compose.yml existe
    - server/.env.example existe
    - server/packages/whoop-protocol/pyproject.toml existe
    - server/ NÃO contém server/.env (só .env.example)
  </acceptance_criteria>
</task>
```

### Task 01-02: Adicionar server/.env ao .gitignore

```xml
<task id="01-02" type="execute" wave="1" depends_on="01-01">
  <title>Adicionar server/.env ao .gitignore (SRVR-06)</title>

  <read_first>
    - .gitignore (estado actual na raiz do repo)
    - .planning/phases/01-server-infrastructure/01-CONTEXT.md (secção Segredos e gitignore)
  </read_first>

  <action>
    Adicionar as seguintes linhas ao .gitignore na raiz do repo Goose (após a última linha existente):
    
    # Server secrets
    server/.env
    .env
    
    IMPORTANTE: Adicionar ANTES de qualquer git add ou git commit dos ficheiros de server/.
    O .env.example NÃO deve ser adicionado ao .gitignore — deve estar commitado como template.
  </action>

  <acceptance_criteria>
    - .gitignore contém a linha "server/.env"
    - git check-ignore -v server/.env retorna um match (não vazio)
    - git ls-files server/.env retorna vazio (o ficheiro não está rastreado mesmo se existir)
    - server/.env.example NÃO está no .gitignore (deve ser commitado)
  </acceptance_criteria>
</task>
```

### Task 01-03: Rename WHOOP_ → GOOSE_ em env vars (config.py)

```xml
<task id="01-03" type="execute" wave="1" depends_on="01-01">
  <title>Rename WHOOP_ → GOOSE_ em config.py</title>

  <read_first>
    - server/ingest/app/config.py (ficheiro a modificar — ler estado actual após cópia)
    - .planning/phases/01-server-infrastructure/01-RESEARCH.md §4.1 (mudanças exactas)
    - .planning/phases/01-server-infrastructure/01-PATTERNS.md Pattern 3
  </read_first>

  <action>
    Editar server/ingest/app/config.py:
    - Substituir os.environ.get("WHOOP_API_KEY") → os.environ.get("GOOSE_API_KEY")
    - Substituir os.environ.get("WHOOP_DB_DSN") → os.environ.get("GOOSE_DB_DSN")
    - Substituir os.environ.get("WHOOP_RAW_ROOT", "/data/raw") → os.environ.get("GOOSE_RAW_ROOT", "/data/raw")
    - Substituir RuntimeError("WHOOP_API_KEY is required") → RuntimeError("GOOSE_API_KEY is required")
    - Substituir RuntimeError("WHOOP_DB_DSN is required") → RuntimeError("GOOSE_DB_DSN is required")
    
    Apenas estas 5 substituições — não alterar mais nada.
  </action>

  <acceptance_criteria>
    - server/ingest/app/config.py contém "GOOSE_API_KEY" (não "WHOOP_API_KEY")
    - server/ingest/app/config.py contém "GOOSE_DB_DSN" (não "WHOOP_DB_DSN")
    - server/ingest/app/config.py contém "GOOSE_RAW_ROOT" (não "WHOOP_RAW_ROOT")
    - grep "WHOOP_" server/ingest/app/config.py retorna vazio (zero ocorrências)
  </acceptance_criteria>
</task>
```

### Task 01-04: Rename logger e título FastAPI em main.py

```xml
<task id="01-04" type="execute" wave="1" depends_on="01-01">
  <title>Rename logger e título FastAPI em main.py</title>

  <read_first>
    - server/ingest/app/main.py (ficheiro a modificar — ler estado actual após cópia)
    - .planning/phases/01-server-infrastructure/01-RESEARCH.md §4.2 (mudanças exactas)
    - .planning/phases/01-server-infrastructure/01-PATTERNS.md Pattern 4
  </read_first>

  <action>
    Editar server/ingest/app/main.py:
    - Substituir logging.getLogger("whoop.ingest") → logging.getLogger("goose.ingest")
    - Substituir FastAPI(title="Whoop Ingest", ...) → FastAPI(title="Goose Ingest", ...)
    
    NÃO alterar endpoints (/healthz, /v1/ingest-decoded, etc.) — são contratos de API que o iOS vai usar.
    NÃO alterar nomes de tabelas, queries SQL, ou modelos Pydantic.
    Apenas estas 2 substituições.
  </action>

  <acceptance_criteria>
    - server/ingest/app/main.py contém getLogger("goose.ingest") (não "whoop.ingest")
    - server/ingest/app/main.py contém FastAPI(title="Goose Ingest") (não "Whoop Ingest")
    - server/ingest/app/main.py ainda contém @app.get("/healthz") (endpoint não alterado)
    - server/ingest/app/main.py ainda contém @app.post("/v1/ingest-decoded") (endpoint não alterado)
    - grep "whoop.ingest\|Whoop Ingest" server/ingest/app/main.py retorna vazio
  </acceptance_criteria>
</task>
```

### Task 01-05: Criar .env.example com prefixos GOOSE_

```xml
<task id="01-05" type="execute" wave="1" depends_on="01-01">
  <title>Actualizar .env.example com prefixos GOOSE_ (SRVR-05)</title>

  <read_first>
    - server/.env.example (estado actual após cópia — tem prefixos WHOOP_)
    - .planning/phases/01-server-infrastructure/01-RESEARCH.md §3.3 (conteúdo exacto)
    - .planning/phases/01-server-infrastructure/01-CONTEXT.md (D-02, Claude's Discretion)
  </read_first>

  <action>
    Substituir o conteúdo de server/.env.example pelo seguinte (exactamente):
    
    # Goose datastore + ingest. Copy to .env and fill in. Do NOT commit .env.
    # Bearer token the uploader/phone must send (Authorization: Bearer <this>).
    GOOSE_API_KEY=change_me
    # TimescaleDB credentials (goose-db container).
    GOOSE_DB_NAME=goose
    GOOSE_DB_USER=goose
    GOOSE_DB_PASSWORD=change_me
    # Host port the ingest API is published on (container listens on 8000).
    GOOSE_INGEST_PORT=8770
    
    Os valores padrão para GOOSE_DB_NAME e GOOSE_DB_USER são "goose" (era "whoop").
    O GOOSE_API_KEY e GOOSE_DB_PASSWORD devem ter valor "change_me" (placeholder explícito).
  </action>

  <acceptance_criteria>
    - server/.env.example contém "GOOSE_API_KEY=change_me"
    - server/.env.example contém "GOOSE_DB_NAME=goose"
    - server/.env.example contém "GOOSE_DB_USER=goose"
    - server/.env.example contém "GOOSE_DB_PASSWORD=change_me"
    - server/.env.example contém "GOOSE_INGEST_PORT=8770"
    - grep "WHOOP_" server/.env.example retorna vazio
    - server/.env.example tem exactamente 5 variáveis de ambiente (5 linhas com KEY=value)
  </acceptance_criteria>
</task>
```

### Task 01-06: Verificar zero ocorrências de WHOOP_ residuais

```xml
<task id="01-06" type="execute" wave="1" depends_on="01-03 01-04 01-05">
  <title>Verificar zero referências WHOOP_ residuais em ficheiros críticos</title>

  <read_first>
    - .planning/phases/01-server-infrastructure/01-RESEARCH.md §2 (mapeamento completo)
    - .planning/phases/01-server-infrastructure/01-RESEARCH.md §8.2 (verificação pós-rename)
  </read_first>

  <action>
    Executar grep de verificação nos ficheiros Python e YAML do server/:
    
    grep -r "WHOOP_" server/ --include="*.py" --include="*.yml" --include="*.yaml" --include=".env*"
    
    Se o resultado não for vazio: corrigir cada ocorrência encontrada.
    
    Ficheiros que podem ainda ter "whoop" (minúscula, não WHOOP_) sem ser problema:
    - server/packages/whoop-protocol/ — nome do pacote Python (detalhe de implementação, não renomear)
    - Nomes de tabelas TimescaleDB (hr_samples, raw_batches, etc.) — não renomear
    
    Ficheiros onde WHOOP_ (maiúscula) NUNCA deve aparecer após este task:
    - server/ingest/app/config.py
    - server/ingest/app/main.py
    - server/docker-compose.yml (próximo plan)
    - server/.env.example
  </action>

  <acceptance_criteria>
    - grep -r "WHOOP_" server/ingest/app/config.py retorna vazio
    - grep -r "WHOOP_" server/ingest/app/main.py retorna vazio
    - grep -r "WHOOP_" server/.env.example retorna vazio
    - Qualquer ocorrência residual encontrada e corrigida antes de avançar
  </acceptance_criteria>
</task>
```

## Verification

```yaml
verification:
  commands:
    - "ls server/ingest/app/main.py server/db/init.sql server/docker-compose.yml server/.env.example"
    - "grep -c 'GOOSE_API_KEY' server/ingest/app/config.py"
    - "grep -r 'WHOOP_' server/ingest/app/config.py server/ingest/app/main.py server/.env.example | wc -l | grep -q '^0$'"
    - "git check-ignore -v server/.env"
  manual:
    - "Confirmar que server/.env não aparece em git status como untracked (ou está listado mas como ignored)"
```
