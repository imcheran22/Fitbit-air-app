"""
Snapshot demo en Python (mismo shape que normalize.build_snapshot).

Sirve para probar el cableado frontend↔backend en modo 'zepp' SIN credenciales
reales de Zepp. En cuanto configures el token, main.py usa datos reales.
"""

from __future__ import annotations

import math
import random
from datetime import datetime, timedelta


def _day(seed: int, date: str) -> dict:
    r = random.Random(seed)
    resting = 52 + r.randint(0, 8)
    total = 380 + r.randint(0, 110)
    segments = []
    for _ in range(5):
        segments.append({"stage": "light", "minutes": 18 + r.randint(0, 12)})
        segments.append({"stage": "deep", "minutes": 22 + r.randint(0, 18)})
        segments.append({"stage": "rem", "minutes": 16 + r.randint(0, 18)})
        if r.random() > 0.6:
            segments.append({"stage": "awake", "minutes": 2 + r.randint(0, 6)})
    total_min = sum(s["minutes"] for s in segments)
    awake = sum(s["minutes"] for s in segments if s["stage"] == "awake")
    eff = round((total_min - awake) / total_min * 100)
    sleep_score = max(40, min(98, round(eff * 0.6 + r.randint(0, 25) + 18)))
    steps = 5200 + r.randint(0, 8000)
    readiness = max(35, min(99, round(sleep_score * 0.5 + (100 - resting) * 0.3 + r.randint(0, 22))))

    series = []
    for m in range(0, 1440, 5):
        hour = m / 60
        base = resting + 8 + math.sin((hour - 6) / 24 * math.pi * 2) * 12
        if 7 < hour < 8:
            base += 35
        if hour < 6:
            base = resting + r.random() * 4
        series.append({"t": m, "v": max(42, min(178, round(base + (r.random() - 0.5) * 10)))})
    hr_vals = [p["v"] for p in series]

    return {
        "date": date,
        "readiness": readiness,
        "bodyBattery": max(20, min(100, round(readiness * 0.7 + r.randint(0, 30)))),
        "stress": max(8, min(92, 28 + r.randint(0, 45))),
        "exertion": max(0, min(100, 4 + r.randint(0, 24))),
        "spo2": 95 + r.randint(0, 3),
        "sleep": {
            "totalMinutes": total_min,
            "score": sleep_score,
            "bedtime": f"{date}T23:10:00+00:00",
            "wakeTime": f"{date}T07:05:00+00:00",
            "segments": segments,
            "efficiency": eff,
        },
        "heart": {
            "resting": resting,
            "current": hr_vals[-1],
            "min": min(hr_vals),
            "max": max(hr_vals),
            "hrv": 38 + r.randint(0, 45),
            "series": series,
        },
        "activity": {
            "steps": steps,
            "stepsGoal": 10000,
            "distanceKm": round(steps / 1350, 1),
            "calories": 1800 + r.randint(0, 900),
            "activeMinutes": 35 + r.randint(0, 70),
            "hourly": [max(0, round(steps / 24 * (0.4 + r.random() * 1.6))) for _ in range(24)],
        },
        "workouts": [],
    }


HISTORY_DAYS = 30


def build_demo_snapshot() -> dict:
    today = datetime(2026, 6, 25)
    week = []
    for i in range(HISTORY_DAYS - 1, -1, -1):
        d = today - timedelta(days=i)
        week.append(_day(1000 + (HISTORY_DAYS - 1 - i) * 7, d.strftime("%Y-%m-%d")))
    return {
        "device": {
            "name": "Helio Strap",
            "model": "Amazfit Helio (demo backend)",
            "battery": 78,
            "lastSync": datetime.now().isoformat(),
        },
        "user": {"name": "Atleta"},
        "today": week[-1],
        "week": week,
        "source": "demo",
    }
