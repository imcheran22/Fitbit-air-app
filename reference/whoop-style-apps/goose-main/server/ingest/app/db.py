"""Database connection + idempotent schema bootstrap."""
import os

import psycopg

_SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "db", "init.sql")
# In the container the file is at /app/../db? No — bundle the schema next to the app.
# We resolve relative to this file; in the image init.sql is copied to /app/db/init.sql
# (see Dockerfile change in this task's Step 5).
_SCHEMA_PATHS = [
    os.path.join(os.path.dirname(__file__), "db", "init.sql"),   # in-image: /app/app/db? no
    os.path.join(os.path.dirname(__file__), "..", "db", "init.sql"),  # /app/db/init.sql
    os.path.join(os.path.dirname(__file__), "..", "..", "db", "init.sql"),  # repo layout
]


def _schema_sql() -> str:
    for p in _SCHEMA_PATHS:
        if os.path.exists(p):
            with open(p) as fh:
                return fh.read()
    raise FileNotFoundError("init.sql not found in expected locations")


def connect(dsn: str) -> psycopg.Connection:
    return psycopg.connect(dsn)


_BOOTSTRAP_LOCK_KEY = 1_234_567_890  # arbitrary fixed key for pg_advisory_lock


def bootstrap_schema(dsn: str) -> None:
    """Apply init.sql idempotently (CREATE ... IF NOT EXISTS / create_hypertable if_not_exists).

    A session-level advisory lock serialises concurrent bootstraps (e.g. two replicas
    starting at the same time) so that concurrent CREATE EXTENSION / CREATE TABLE IF NOT
    EXISTS calls do not race into a deadlock or duplicate_object error.
    The lock is released automatically when the connection closes, but we release it
    explicitly after the apply to keep the window as short as possible.
    """
    with psycopg.connect(dsn, autocommit=True) as conn:
        conn.execute("SELECT pg_advisory_lock(%s)", (_BOOTSTRAP_LOCK_KEY,))
        try:
            conn.execute(_schema_sql())
        finally:
            conn.execute("SELECT pg_advisory_unlock(%s)", (_BOOTSTRAP_LOCK_KEY,))
