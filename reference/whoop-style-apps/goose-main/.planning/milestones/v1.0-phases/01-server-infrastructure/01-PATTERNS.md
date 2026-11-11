# Phase 1 — Pattern Map

**Phase:** 1 - Server Infrastructure
**Generated:** 2026-06-03

## Files to Create/Modify

### Files to Create (copying from /Users/francisco/Documents/my-whoop/server/)

| File | Role | Closest Analog |
|------|------|----------------|
| `server/docker-compose.yml` | Stack orchestration | `/Users/francisco/Documents/my-whoop/server/docker-compose.yml` |
| `server/ingest/Dockerfile` | Multi-stage image build | `/Users/francisco/Documents/my-whoop/server/ingest/Dockerfile` (single-stage, to convert) |
| `server/.env.example` | Config template | `/Users/francisco/Documents/my-whoop/server/.env.example` |
| `server/ingest/app/config.py` | Env var loading | `/Users/francisco/Documents/my-whoop/server/ingest/app/config.py` |
| `server/ingest/app/main.py` | FastAPI app | `/Users/francisco/Documents/my-whoop/server/ingest/app/main.py` |
| `server/db/init.sql` | TimescaleDB schema | `/Users/francisco/Documents/my-whoop/server/db/init.sql` (copy verbatim) |
| `server/packages/whoop-protocol/` | Local Python package | `/Users/francisco/Documents/my-whoop/server/packages/whoop-protocol/` |
| `server/ingest/requirements.txt` | Python deps | `/Users/francisco/Documents/my-whoop/server/ingest/requirements.txt` |
| `server/ingest/app/db.py` | DB bootstrap | `/Users/francisco/Documents/my-whoop/server/ingest/app/db.py` |
| `server/ingest/app/store.py` | Upsert operations | `/Users/francisco/Documents/my-whoop/server/ingest/app/store.py` |
| `server/ingest/app/ingest.py` | Raw frame processing | `/Users/francisco/Documents/my-whoop/server/ingest/app/ingest.py` |
| `server/ingest/app/read.py` | Read queries | `/Users/francisco/Documents/my-whoop/server/ingest/app/read.py` |
| `server/ingest/app/analysis/` | Daily metrics pipeline | `/Users/francisco/Documents/my-whoop/server/ingest/app/analysis/` |
| `server/ingest/app/static/` | Dashboard SPA | `/Users/francisco/Documents/my-whoop/server/ingest/app/static/` |
| `server/ingest/app/whoop_api/` | WHOOP API client | `/Users/francisco/Documents/my-whoop/server/ingest/app/whoop_api/` |
| `server/client/` | Python CLI client | `/Users/francisco/Documents/my-whoop/server/client/` |
| `server/dashboard/` | Dashboard source | `/Users/francisco/Documents/my-whoop/server/dashboard/` |

### Files to Modify

| File | Role | Change |
|------|------|--------|
| `.gitignore` (repo root) | Secret hygiene | Add `server/.env` |

---

## Pattern Excerpts

### Pattern 1: Docker named volume (docker-compose.yml)

```yaml
# BEFORE (bind mount, requires DATA_ROOT):
volumes:
  - ${DATA_ROOT}/whoop/db:/var/lib/postgresql/data

# AFTER (named volume, no DATA_ROOT needed):
volumes:
  - goose-db-data:/var/lib/postgresql/data

# And at the top level:
volumes:
  goose-db-data:
  goose-raw-data:
```

**Source pattern:** Docker named volumes with no external path dependencies.
**Convention:** Named volumes defined at top-level `volumes:` key, referenced by name in service `volumes:`.

### Pattern 2: Multi-stage Dockerfile

```dockerfile
# Stage 1: builder
FROM python:3.11-slim AS builder
WORKDIR /build
COPY ingest/requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Stage 2: runtime
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

**Convention:** `context: .` (server/) is required so builder can COPY `packages/whoop-protocol`.

### Pattern 3: Config pattern (config.py)

```python
# Exact pattern — frozen dataclass + explicit env var reads:
@dataclass(frozen=True)
class Config:
    api_key: str
    db_dsn: str
    raw_root: str

def load_config() -> Config:
    api_key = os.environ.get("GOOSE_API_KEY")  # WHOOP_API_KEY → GOOSE_API_KEY
    db_dsn = os.environ.get("GOOSE_DB_DSN")    # WHOOP_DB_DSN → GOOSE_DB_DSN
    raw_root = os.environ.get("GOOSE_RAW_ROOT", "/data/raw")
    if not api_key:
        raise RuntimeError("GOOSE_API_KEY is required")
    if not db_dsn:
        raise RuntimeError("GOOSE_DB_DSN is required")
    return Config(api_key=api_key, db_dsn=db_dsn, raw_root=raw_root)
```

### Pattern 4: Bearer auth guard (main.py)

```python
# Exact pattern — timing-safe comparison:
def require_auth(authorization: str = Header(default="")) -> None:
    expected = f"Bearer {cfg.api_key}"
    if not secrets.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="unauthorized")
```

**Convention:** `secrets.compare_digest` prevents timing attacks. All write endpoints use `dependencies=[Depends(require_auth)]`.

### Pattern 5: service_healthy depends_on (docker-compose.yml)

```yaml
goose-ingest:
  depends_on:
    goose-db:
      condition: service_healthy
```

**Convention:** DB healthcheck uses `pg_isready`. Ingest only starts after DB is ready.

### Pattern 6: Idempotent upserts (store.py)

```python
# Pattern: ON CONFLICT DO NOTHING / DO UPDATE for all inserts
conn.execute(
    """INSERT INTO devices (device_id, mac, name) VALUES (%s, %s, %s)
       ON CONFLICT (device_id) DO UPDATE SET last_seen = now()""",
    (device_id, mac, name),
)
```

**Convention:** All stream inserts use `ON CONFLICT ... DO NOTHING` to handle retries safely.

---

## Data Flow

```
iPhone (Phase 3) → POST /v1/ingest-decoded (Bearer token)
  → require_auth() → DecodedBatch validation
  → store.ensure_device() → store.upsert_streams()
  → TimescaleDB hypertables (hr_samples, rr_samples, etc.)
  → daily.compute_day() [throttled, best-effort]
```

---

## Integration Points

- `server/` is a new top-level directory in the Goose repo — no conflict with iOS code
- `.gitignore` at repo root needs `server/.env` (SRVR-06)
- Docker build context is `server/` dir (not repo root) — Dockerfile's COPY paths are relative to `server/`
