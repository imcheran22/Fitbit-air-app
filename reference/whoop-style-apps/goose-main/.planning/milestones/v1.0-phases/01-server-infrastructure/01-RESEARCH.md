# Phase 1: Server Infrastructure — Research

**Researched:** 2026-06-03
**Phase Goal:** Servidor FastAPI+TimescaleDB no repo Goose, a correr em Docker, com higiene de segredos

## ## RESEARCH COMPLETE

---

## 1. Inventário do Servidor de Origem

### Estrutura de directórios a copiar

```
/Users/francisco/Documents/my-whoop/server/
├── docker-compose.yml         # Stack completo (a adaptar)
├── dockge-stack.yml           # Alternativo (pode incluir, não é crítico)
├── .env.example               # Template de env vars (a renomear prefixos)
├── db/
│   └── init.sql               # Schema TimescaleDB (não toca prefixos, mantém igual)
├── ingest/
│   ├── Dockerfile             # Imagem (actualmente single-stage, converter para multi-stage)
│   ├── requirements.txt       # Dependências Python (não toca prefixos)
│   ├── requirements-dev.txt   # Dev deps
│   ├── tests/
│   └── app/
│       ├── __init__.py
│       ├── config.py          # Lê WHOOP_API_KEY, WHOOP_DB_DSN, WHOOP_RAW_ROOT → GOOSE_*
│       ├── main.py            # FastAPI — endpoints, logs "whoop.ingest" → "goose.ingest"
│       ├── db.py
│       ├── ingest.py
│       ├── read.py
│       ├── store.py
│       ├── archive.py
│       ├── static/
│       ├── whoop_api/
│       └── analysis/
│           ├── daily.py, hrv.py, sleep.py, strain.py, etc.
├── packages/
│   └── whoop-protocol/        # Pacote local Python (pyproject.toml)
├── client/                    # Cliente Python (não crítico para Phase 1)
└── dashboard/                 # SPA estática (não crítico para Phase 1)
```

**Decisão D-01 (locked):** Copiar tudo — `ingest/`, `db/`, `packages/`, `client/`, `dashboard/`.

---

## 2. Mapeamento Completo de Prefixos WHOOP_ → GOOSE_

### 2.1 Variáveis de ambiente

| Antes | Depois | Ficheiros afectados |
|-------|--------|---------------------|
| `WHOOP_API_KEY` | `GOOSE_API_KEY` | `config.py`, `docker-compose.yml`, `.env.example` |
| `WHOOP_DB_NAME` | `GOOSE_DB_NAME` | `docker-compose.yml`, `.env.example` |
| `WHOOP_DB_USER` | `GOOSE_DB_USER` | `docker-compose.yml`, `.env.example` |
| `WHOOP_DB_PASSWORD` | `GOOSE_DB_PASSWORD` | `docker-compose.yml`, `.env.example` |
| `WHOOP_DB_DSN` | `GOOSE_DB_DSN` | `config.py`, `docker-compose.yml` |
| `WHOOP_RAW_ROOT` | `GOOSE_RAW_ROOT` | `config.py`, `docker-compose.yml` |
| `WHOOP_INGEST_PORT` | `GOOSE_INGEST_PORT` | `docker-compose.yml`, `.env.example` |

**Nota:** `DATA_ROOT` é eliminado completamente (substituído por named volumes — D-03).

### 2.2 Nomes de containers e serviços Docker

| Antes | Depois |
|-------|--------|
| `goose-db` (service + container) | `goose-db` |
| `goose-ingest` (service + container) | `goose-ingest` |
| `pg_isready -U ${WHOOP_DB_USER}` | `pg_isready -U ${GOOSE_DB_USER}` |

### 2.3 Strings de logging Python

| Ficheiro | Antes | Depois |
|----------|-------|--------|
| `main.py` | `logging.getLogger("whoop.ingest")` | `logging.getLogger("goose.ingest")` |

### 2.4 Comentários e documentação inline

- Comentários no `docker-compose.yml` que referenciam "whoop" devem ser actualizados para "goose"
- Comentário no topo do `docker-compose.yml`: "Whoop stack" → "Goose stack"
- FastAPI title em `main.py`: `FastAPI(title="Whoop Ingest")` → `FastAPI(title="Goose Ingest")`

---

## 3. Transformações Docker

### 3.1 docker-compose.yml — Mudanças necessárias

**Volumes (D-03):**
- `${DATA_ROOT}/whoop/db:/var/lib/postgresql/data` → named volume `goose-db-data:/var/lib/postgresql/data`
- `${DATA_ROOT}/whoop/raw:/data/raw` → named volume `goose-raw-data:/data/raw`
- Adicionar secção `volumes:` no final: `goose-db-data:` e `goose-raw-data:`
- Remover toda a dependência de `DATA_ROOT`

**Serviços:**
```yaml
services:
  goose-db:           # era goose-db
    container_name: goose-db
    environment:
      - POSTGRES_DB=${GOOSE_DB_NAME:-goose}
      - POSTGRES_USER=${GOOSE_DB_USER:-goose}
      - POSTGRES_PASSWORD=${GOOSE_DB_PASSWORD}
    volumes:
      - goose-db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${GOOSE_DB_USER:-goose} -d ${GOOSE_DB_NAME:-goose}"]

  goose-ingest:       # era goose-ingest
    container_name: goose-ingest
    depends_on:
      goose-db:
        condition: service_healthy
    environment:
      - GOOSE_API_KEY=${GOOSE_API_KEY}
      - GOOSE_DB_DSN=postgresql://${GOOSE_DB_USER:-goose}:${GOOSE_DB_PASSWORD}@goose-db:5432/${GOOSE_DB_NAME:-goose}
      - GOOSE_RAW_ROOT=/data/raw
    volumes:
      - goose-raw-data:/data/raw
    ports:
      - "${GOOSE_INGEST_PORT:-8770}:8000"

volumes:
  goose-db-data:
  goose-raw-data:
```

**Padrão mantido (locked em CONTEXT.md):** `depends_on: condition: service_healthy` — garante que o ingest só arranca após DB estar pronto.

### 3.2 Dockerfile — Multi-stage (D-04)

O Dockerfile actual é **single-stage** (`python:3.11-slim` com pip install inline). Converter para multi-stage:

```dockerfile
# Stage 1: builder — instala dependências e compila wheels
FROM python:3.11-slim AS builder
WORKDIR /build
COPY ingest/requirements.txt /build/requirements.txt
RUN pip install --no-cache-dir --user -r /build/requirements.txt

# Stage 2: runtime — imagem limpa sem cache pip nem ferramentas de build
FROM python:3.11-slim AS runtime
WORKDIR /app
# Copiar dependências instaladas do builder (site-packages do utilizador)
COPY --from=builder /root/.local /root/.local
# Instalar whoop-protocol (local package)
COPY packages/whoop-protocol /app/whoop-protocol
RUN pip install --no-cache-dir /app/whoop-protocol
# Copiar schema e aplicação
COPY db /app/db
COPY ingest/app /app/app
ENV PATH=/root/.local/bin:$PATH
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Alternativa com `pip install --prefix`:**
```dockerfile
FROM python:3.11-slim AS builder
WORKDIR /build
COPY ingest/requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.11-slim AS runtime
WORKDIR /app
COPY --from=builder /install /usr/local
COPY packages/whoop-protocol /app/whoop-protocol
RUN pip install --no-cache-dir /app/whoop-protocol
COPY db /app/db
COPY ingest/app /app/app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Recomendação:** Usar `--prefix=/install` + `COPY --from=builder /install /usr/local` — mais limpo e compatível com pip moderno sem necessidade de configurar PATH manual.

**Contexto de build:** `context: .` (server/) mantém-se — necessário para COPY `packages/whoop-protocol`.

### 3.3 .env.example — Conteúdo completo

```env
# Goose datastore + ingest. Copy to .env and fill in. Do NOT commit .env.
# Bearer token the uploader/phone must send (Authorization: Bearer <this>).
GOOSE_API_KEY=change_me
# TimescaleDB credentials (goose-db container).
GOOSE_DB_NAME=goose
GOOSE_DB_USER=goose
GOOSE_DB_PASSWORD=change_me
# Host port the ingest API is published on (container listens on 8000).
GOOSE_INGEST_PORT=8770
```

---

## 4. Transformações Python

### 4.1 config.py — Mudanças exactas

```python
# Antes:
api_key = os.environ.get("WHOOP_API_KEY")
db_dsn = os.environ.get("WHOOP_DB_DSN")
raw_root = os.environ.get("WHOOP_RAW_ROOT", "/data/raw")
if not api_key:
    raise RuntimeError("WHOOP_API_KEY is required")
if not db_dsn:
    raise RuntimeError("WHOOP_DB_DSN is required")

# Depois:
api_key = os.environ.get("GOOSE_API_KEY")
db_dsn = os.environ.get("GOOSE_DB_DSN")
raw_root = os.environ.get("GOOSE_RAW_ROOT", "/data/raw")
if not api_key:
    raise RuntimeError("GOOSE_API_KEY is required")
if not db_dsn:
    raise RuntimeError("GOOSE_DB_DSN is required")
```

### 4.2 main.py — Mudanças exactas

```python
# Logger:
_log = logging.getLogger("goose.ingest")  # era "whoop.ingest"

# FastAPI title:
app = FastAPI(title="Goose Ingest", ...)  # era "Whoop Ingest"
```

**Nota importante:** Os endpoints (`/healthz`, `/v1/ingest-decoded`, etc.) **não mudam** — são contratos de API mantidos para compatibilidade com o cliente iOS. Apenas o logger e o título mudam.

---

## 5. Higiene de Segredos (.gitignore)

### Situação actual do .gitignore

O `.gitignore` na raiz do Goose cobre: `.DS_Store`, `xcuserdata/`, `*.xcuserstate`, `DerivedData/`, `build/`, etc. **Não cobre `.env` nem `server/.env`**.

### O que adicionar

```gitignore
# Server secrets
server/.env
.env
```

**Nota:** `server/.env.example` (com placeholders) DEVE estar commitado — é o template de configuração. Apenas o `.env` real com credenciais deve ser ignorado.

**SRVR-06 (locked):** `.env` e ficheiros com segredos reais devem estar no `.gitignore` antes do primeiro commit.

---

## 6. Validation Architecture

### Critérios de verificação por requirement

| Req | Verificação | Como confirmar |
|-----|-------------|----------------|
| SRVR-01 | `docker compose up --build` sem erros | `docker compose -f server/docker-compose.yml up --build -d` retorna 0 |
| SRVR-02 | `/healthz` retorna `{"status":"ok"}` | `curl http://localhost:8770/healthz` retorna JSON correcto |
| SRVR-03 | POST `/v1/ingest-decoded` escreve nas hypertables | `curl -X POST -H "Authorization: Bearer <key>" -d '...'` retorna 200 + rows no DB |
| SRVR-04 | Dockerfile tem dois stages | `grep -c "^FROM" server/ingest/Dockerfile` retorna 2 |
| SRVR-05 | `.env.example` tem os 5 vars com placeholders | `cat server/.env.example` mostra GOOSE_* vars com valores `change_me` |
| SRVR-06 | `.env` está no `.gitignore` | `git check-ignore -v server/.env` retorna match; `git status` não mostra `server/.env` |

### Validation tests (Nyquist)

**Dim 1 (Smoke):** `docker compose up --build` completa sem erros de build
**Dim 2 (Integration):** `GET /healthz` retorna 200 + `{"status":"ok"}` após containers up
**Dim 3 (Security):** `git ls-files server/.env` retorna vazio (ficheiro não está rastreado)
**Dim 4 (Contract):** `POST /v1/ingest-decoded` sem token retorna 401; com token válido retorna 200
**Dim 5 (Multi-stage):** Dockerfile tem exactamente 2 stages (builder + runtime)
**Dim 6 (Named volumes):** `docker compose config` mostra `goose-db-data` e `goose-raw-data` na secção `volumes`

---

## 7. Riscos e Dependências

### 7.1 Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Dependências pesadas na imagem de runtime (neurokit2, scipy, numpy) | Alta — já existem em requirements.txt | Multi-stage com builder stage gere esta complexidade; a imagem runtime continua slim mas inclui as deps necessárias |
| Ficheiro `.env` commitado acidentalmente | Baixa se .gitignore correcto | Adicionar ao .gitignore ANTES de qualquer `git add` |
| Referências WHOOP_ omitidas no rename | Média — há muitos ficheiros | Verificar com `grep -r "WHOOP_" server/` após rename |
| `packages/whoop-protocol` — nome do pacote Python ainda diz "whoop" | Baixa | O CONTEXT.md limita o rename a env vars e containers; nomes de tabelas e pacotes internos são detalhe de implementação. Manter `whoop-protocol` como nome do pacote Python por enquanto. |

### 7.2 Dependências

- Phase 1 não depende de nada (é a primeira fase)
- Phase 2 (iOS Settings) depende de Phase 1 estar completa e funcional
- O servidor precisa de estar acessível via hostname para Phase 3 (iOS Upload)

### 7.3 Ordem de execução dentro da fase

1. Copiar `server/` do my-whoop para o repo Goose
2. Rename WHOOP_ → GOOSE_ em todos os ficheiros
3. Converter Dockerfile para multi-stage
4. Adaptar `docker-compose.yml` para named volumes
5. Actualizar `.env.example`
6. Actualizar `.gitignore`
7. Verificar com `docker compose up --build`
8. Testar endpoints (`/healthz`, `/v1/ingest-decoded`)

---

## 8. Considerações de Implementação

### 8.1 Estratégia de cópia

**Recomendação:** Usar `cp -r` para copiar todo o servidor, depois fazer os renames. Isto preserva a estrutura exacta e facilita a verificação de diff.

```bash
cp -r /Users/francisco/Documents/my-whoop/server/ /Users/francisco/Documents/goose/server/
```

### 8.2 Rename sistemático

Após a cópia, fazer rename com `find` + `sed`:
```bash
cd /Users/francisco/Documents/goose/server
grep -rl "WHOOP_" . | xargs sed -i '' 's/WHOOP_/GOOSE_/g'
grep -rl "goose-db\|goose-ingest\|whoop.ingest\|Whoop Ingest\|Whoop stack" . | xargs sed -i '' \
  -e 's/goose-db/goose-db/g' \
  -e 's/goose-ingest/goose-ingest/g' \
  -e 's/whoop\.ingest/goose.ingest/g' \
  -e 's/Whoop Ingest/Goose Ingest/g' \
  -e 's/Whoop stack/Goose stack/g'
```

**Verificação pós-rename:**
```bash
grep -r "WHOOP_\|goose-db\|goose-ingest" server/ --include="*.yml" --include="*.py" --include="*.env*"
```

### 8.3 Ficheiros que NÃO precisam de rename

- `server/db/init.sql` — schema SQL sem referências a WHOOP_
- `server/packages/whoop-protocol/` — nome do pacote local (detalhe de implementação, D-02 nota)
- `server/ingest/requirements.txt` — dependências Python sem referências a WHOOP_
- Nomes de tabelas TimescaleDB (`hr_samples`, `raw_batches`, etc.) — schema interno

### 8.4 .gitignore — Localização

Adicionar no `.gitignore` da raiz do repo Goose (não criar um `.gitignore` separado em `server/`):

```
# Server secrets
server/.env
```

O `.env` genérico já pode ser adicionado também por boa prática, mas `server/.env` é o específico.

---

## 9. Sumário Executivo

**O que fazer:**
1. Copiar `server/` do my-whoop
2. Fazer rename WHOOP_ → GOOSE_ sistematicamente em ~6 ficheiros
3. Converter Dockerfile de single-stage para multi-stage (2 stages: builder + runtime)
4. Substituir bind mounts por named volumes no docker-compose.yml
5. Actualizar .env.example com prefixos GOOSE_
6. Adicionar server/.env ao .gitignore

**Complexidade:** Baixa — é uma operação de cópia + rename + reescrita de 3 ficheiros de configuração (docker-compose.yml, Dockerfile, .env.example) + 2 ficheiros Python (config.py, main.py).

**Sem surpresas:** A stack my-whoop já está testada e funcional. O risco principal é omitir alguma referência WHOOP_ no rename.
