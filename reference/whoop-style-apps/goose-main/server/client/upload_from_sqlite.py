#!/usr/bin/env python3
"""Upload hr_samples (synced=0) from the iOS simulator SQLite to the ingest server.

Usage:
    python3 upload_from_sqlite.py \
        --db <path/to/goose.sqlite> \
        --url http://192.168.50.154:8770 \
        --token <api_token> \
        [--batch-size 500] \
        [--dry-run]
"""
import argparse
import json
import sqlite3
import sys
import urllib.request
import uuid
from collections import defaultdict


def fetch_pending(db_path: str, batch_size: int):
    """Yield batches of (rowid, device_id, ts, bpm) for synced=0 hr_samples."""
    con = sqlite3.connect(db_path)
    try:
        cur = con.execute(
            "SELECT rowid, device_id, ts, bpm FROM hr_samples "
            "WHERE synced=0 ORDER BY device_id, ts LIMIT ?",
            (batch_size,),
        )
        while True:
            rows = cur.fetchmany(batch_size)
            if not rows:
                break
            yield rows
    finally:
        con.close()


def count_pending(db_path: str) -> dict[str, int]:
    con = sqlite3.connect(db_path)
    try:
        rows = con.execute(
            "SELECT device_id, count(*) FROM hr_samples WHERE synced=0 GROUP BY device_id"
        ).fetchall()
        return dict(rows)
    finally:
        con.close()


def mark_synced(db_path: str, rowids: list[int]):
    con = sqlite3.connect(db_path)
    try:
        con.executemany(
            "UPDATE hr_samples SET synced=1 WHERE rowid=?",
            [(r,) for r in rowids],
        )
        con.commit()
    finally:
        con.close()


def post_batch(url: str, token: str, device_id: str, hr_rows: list) -> int:
    payload = {
        "device": {"id": device_id},
        "device_generation": "5.0",
        "streams": {
            "hr": [{"ts": ts, "bpm": bpm} for _, _, ts, bpm in hr_rows],
            "rr": [], "events": [], "battery": [],
            "spo2": [], "skin_temp": [], "resp": [], "gravity": [],
        },
    }
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        url.rstrip("/") + "/v1/ingest-decoded",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read())
    upserted = result.get("upserted")
    if not isinstance(upserted, dict) or "hr" not in upserted:
        raise ValueError(
            f"Resposta inesperada do servidor (upserted.hr ausente): {result!r}"
        )
    return upserted["hr"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True, help="Path to goose.sqlite")
    ap.add_argument("--url", default="http://192.168.50.154:8770")
    ap.add_argument("--token", required=True)
    ap.add_argument("--batch-size", type=int, default=500)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    pending = count_pending(args.db)
    if not pending:
        print("Nenhum hr_sample pendente (synced=0).")
        return

    for dev, n in pending.items():
        print(f"  device {dev}: {n:,} rows pendentes")
    total_pending = sum(pending.values())
    print(f"Total: {total_pending:,} rows\n")

    if args.dry_run:
        print("[dry-run] Nada enviado.")
        return

    total_sent = 0
    total_marked = 0

    con = sqlite3.connect(args.db)
    try:
        while True:
            rows = con.execute(
                "SELECT rowid, device_id, ts, bpm FROM hr_samples "
                "WHERE synced=0 ORDER BY device_id, ts LIMIT ?",
                (args.batch_size,),
            ).fetchall()
            if not rows:
                break

            # Agrupar por device_id
            by_device: dict[str, list] = defaultdict(list)
            for row in rows:
                by_device[row[1]].append(row)

            rowids_to_mark = []
            for device_id, device_rows in by_device.items():
                try:
                    upserted = post_batch(args.url, args.token, device_id, device_rows)
                    rowids_to_mark.extend(r[0] for r in device_rows)
                    total_sent += len(device_rows)
                    print(f"  ✓ device={device_id[:8]}… sent={len(device_rows)} upserted={upserted} total={total_sent:,}")
                except Exception as e:
                    print(f"  ✗ device={device_id[:8]}… ERRO: {e}", file=sys.stderr)

            if rowids_to_mark:
                con.executemany(
                    "UPDATE hr_samples SET synced=1 WHERE rowid=?",
                    [(r,) for r in rowids_to_mark],
                )
                con.commit()
                total_marked += len(rowids_to_mark)

    finally:
        con.close()

    print(f"\nConcluído. Enviados: {total_sent:,}  Marcados synced: {total_marked:,}")

    # Verificar servidor
    print("\nA verificar servidor...")
    req = urllib.request.Request(
        args.url.rstrip("/") + "/v1/devices",
        headers={"Authorization": f"Bearer {args.token}"},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        devices = json.loads(resp.read())
    for d in devices:
        print(f"  {d['device_id']}  last_seen={d['last_seen']}")


if __name__ == "__main__":
    main()
