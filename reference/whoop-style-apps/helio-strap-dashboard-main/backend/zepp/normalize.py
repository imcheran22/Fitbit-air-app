"""
Normaliza la respuesta cruda de la nube de Zepp/Huami al modelo que consume
la UI (idéntico a frontend/src/types.ts → HealthSnapshot).

Así, la UI nunca sabe que detrás hay Huami: sólo ve el modelo limpio.

Nota de honestidad: band_data entrega pasos, sueño y calorías de forma fiable.
Métricas propietarias de Zepp (readiness, batería corporal, estrés, SpO₂, HRV)
NO están en este endpoint — viven en APIs aparte. Aquí se DERIVAN de forma
transparente a partir de lo disponible y se marcan como tales. Cuando conectes
esos endpoints, sólo hay que rellenar estas funciones.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

# Modos de etapa de sueño tal como los reporta el firmware Huami.
_SLEEP_MODE = {
    4: "light",
    5: "deep",
    7: "rem",
    8: "awake",
}

# Códigos de tipo de deporte de Huami → etiqueta que la UI ya conoce
# (ver TYPE_ICON / workoutLabel en frontend Workouts.tsx). Lo no mapeado
# cae en "Entreno" (genérico, traducido a "Workout" en la UI).
_SPORT_TYPE = {
    1: "Correr",  # carrera al aire libre
    8: "Correr",  # cinta / indoor run
    6: "Caminata",  # caminata
    9: "Ciclismo",  # ciclismo exterior
    10: "Ciclismo",  # ciclismo indoor
    16: "Fuerza",  # actividad libre / fuerza
    17: "Fuerza",  # sesión de gym (sin distancia)
    52: "Fuerza",  # entrenamiento de fuerza
    60: "Yoga",
    223: "Fuerza",  # gym / fuerza (tipo más frecuente del Helio Strap)
}


def _clamp(v: float, lo: float, hi: float) -> int:
    return int(max(lo, min(hi, v)))


def _sleep_segments(slp: dict[str, Any]) -> list[dict[str, Any]]:
    # Zepp ya entrega totales agregados por etapa; son los que usa la app.
    if any(slp.get(k) for k in ("dp", "lt", "dt", "wk")):
        segments = []
        if slp.get("dp"):
            segments.append({"stage": "deep", "minutes": int(slp["dp"])})
        if slp.get("lt"):
            segments.append({"stage": "light", "minutes": int(slp["lt"])})
        if slp.get("dt"):
            segments.append({"stage": "rem", "minutes": int(slp["dt"])})
        if slp.get("wk"):
            segments.append({"stage": "awake", "minutes": int(slp["wk"])})
        return segments

    stages = slp.get("stage") or []
    segments: list[dict[str, Any]] = []
    for st in stages:
        mode = _SLEEP_MODE.get(st.get("mode"), "light")
        # start/stop vienen en minutos; la duración es la diferencia
        minutes = max(0, int(st.get("stop", 0)) - int(st.get("start", 0)))
        if minutes > 0:
            segments.append({"stage": mode, "minutes": minutes})
    if not segments:
        # Fallback: sólo tenemos totales agregados (dp = deep, lt = light)
        if slp.get("dp"):
            segments.append({"stage": "deep", "minutes": int(slp["dp"])})
        if slp.get("lt"):
            segments.append({"stage": "light", "minutes": int(slp["lt"])})
    return segments


def _ts_iso(unix: Optional[int]) -> Optional[str]:
    """
    Convierte un epoch (seg) a ISO, tolerando datos corruptos de Zepp.

    Zepp a veces devuelve timestamps basura (p. ej. enteros negativos enormes)
    para un día sin sueño registrado. Sin este guard, un solo día así tumbaba
    el snapshot completo (7 días) y todo caía a demo.
    """
    if not unix:
        return None
    try:
        ts = int(unix)
        # Rango razonable: año 2000 – 2100. Fuera de ahí, es basura.
        if not (946684800 <= ts <= 4102444800):
            return None
        return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
    except (ValueError, OSError, OverflowError, TypeError):
        return None


def _hr_series(hr: list[int]) -> list[dict[str, int]]:
    """De [bpm/min] a Point[] en ventanas de 5 min usando el MÁXIMO del bucket.

    Tomar el máximo (en vez del valor del minuto i) evita perder los picos
    cuando caen en minutos no múltiplos de 5 — así el pico del gráfico coincide
    con `heart.max`. Omite ventanas sin lectura.
    """
    if not hr:
        return []
    out = []
    for i in range(0, len(hr), 5):
        bucket = [v for v in hr[i : i + 5] if v > 0]
        if bucket:
            out.append({"t": i, "v": int(max(bucket))})
    return out


def _as_obj(x: Any) -> Any:
    """Si es un JSON-string lo parsea; si no, lo devuelve tal cual."""
    if isinstance(x, str):
        try:
            return json.loads(x)
        except (ValueError, json.JSONDecodeError):
            return x
    return x


def _mean(nums: list[float]) -> Optional[float]:
    nums = [n for n in nums if isinstance(n, (int, float))]
    return sum(nums) / len(nums) if nums else None


# Extractores por métrica — confirmados contra respuestas reales del Helio Strap.
def extract_metric(item: dict[str, Any], kind: str) -> Optional[float]:
    if not isinstance(item, dict):
        return None
    if kind == "readiness":
        # value.phyScore = readiness física (0-100); 255 = sin dato
        v = _as_obj(item.get("value")) or {}
        for f in ("readinessScore", "score", "phyScore"):
            x = v.get(f) if isinstance(v, dict) else None
            if isinstance(x, (int, float)) and 0 < x < 255:
                return float(x)
        return None
    if kind == "hrv":
        # media de value.samples[].sdnn
        v = _as_obj(item.get("value")) or {}
        samples = v.get("samples") if isinstance(v, dict) else None
        if isinstance(samples, list):
            return _mean([s.get("sdnn") for s in samples if isinstance(s, dict)])
        return None
    if kind == "hybridCharge":
        v = _as_obj(item.get("value")) or {}
        samples = v.get("samples") if isinstance(v, dict) else None
        if isinstance(samples, list):
            vals = [
                s.get("maxCharge")
                for s in samples
                if isinstance(s, dict) and isinstance(s.get("maxCharge"), (int, float))
            ]
            return float(vals[-1]) if vals else None
        return None
    if kind == "exertion":
        v = _as_obj(item.get("value")) or {}
        samples = v.get("samples") if isinstance(v, dict) else None
        if isinstance(samples, list):
            vals = [
                s.get("exertionScore")
                for s in samples
                if isinstance(s, dict)
                and isinstance(s.get("exertionScore"), (int, float))
                and 0 <= s.get("exertionScore") < 255
            ]
            return float(vals[-1]) if vals else None
        return None
    if kind == "stress":
        # La app Zepp muestra el estado actual; usamos el último punto del día.
        data = _as_obj(item.get("data"))
        if isinstance(data, list) and data:
            vals = [
                d.get("value")
                for d in data
                if isinstance(d, dict) and isinstance(d.get("value"), (int, float))
            ]
            if vals:
                return float(vals[-1])
        lo, hi = item.get("minStress"), item.get("maxStress")
        nums = [float(x) for x in (lo, hi) if str(x).replace(".", "").isdigit()]
        return _mean(nums)
    if kind == "spo2":
        # La app muestra la lectura puntual; cada evento trae `extra.spo2`.
        extra = _as_obj(item.get("extra")) or {}
        value = extra.get("spo2") if isinstance(extra, dict) else None
        if isinstance(value, (int, float)) and value:
            return float(value)
        hist = extra.get("spo2History") if isinstance(extra, dict) else None
        if isinstance(hist, list):
            nz = [x for x in hist if isinstance(x, (int, float)) and x]
            return float(nz[-1]) if nz else None
        return None
    return None


def _normalize_workout(item: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Un item de /v1/sport/run/history.json → modelo Workout de la UI."""
    if not isinstance(item, dict):
        return None
    try:
        trackid = str(item.get("trackid") or "")
        end = int(float(item.get("end_time") or 0))
        dur = int(float(item.get("run_time") or 0))  # segundos
    except (ValueError, TypeError):
        return None
    if not trackid or not end:
        return None

    def _num(key: str) -> float:
        try:
            return float(item.get(key) or 0)
        except (ValueError, TypeError):
            return 0.0

    workout: dict[str, Any] = {
        "id": trackid,
        "type": _SPORT_TYPE.get(int(item.get("type") or 0), "Entreno"),
        "start": _ts_iso(end - dur) or "",
        "durationMin": max(1, round(dur / 60)),
        "calories": round(_num("calorie")),
        "avgHr": int(_num("avg_heart_rate")),
    }
    dist_m = _num("dis")
    if dist_m > 0:
        workout["distanceKm"] = round(dist_m / 1000, 2)
    return workout


def workouts_by_date(items: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Agrupa los entrenos por día local (a partir de end_time) y los ordena."""
    out: dict[str, list[dict[str, Any]]] = {}
    for it in items or []:
        workout = _normalize_workout(it)
        if not workout or not workout["start"]:
            continue
        try:
            day = _ms_to_local_date(int(float(it.get("end_time") or 0)))
        except (ValueError, TypeError):
            day = None
        if not day:
            continue
        out.setdefault(day, []).append(workout)
    for day in out:
        out[day].sort(key=lambda w: w["start"])
    return out


def build_day(
    raw: dict[str, Any],
    hr: Optional[list[int]] = None,
    metrics: Optional[dict[str, Any]] = None,
    workouts: Optional[list[dict[str, Any]]] = None,
) -> dict[str, Any]:
    parsed = raw.get("parsed") or {}
    stp = parsed.get("stp") or {}
    slp = parsed.get("slp") or {}
    hr = hr or []
    metrics = metrics or {}

    date = raw.get("date") or raw.get("date_time") or datetime.now().strftime("%Y-%m-%d")
    steps = int(stp.get("ttl", 0))
    distance_km = round(int(stp.get("dis", 0)) / 1000, 1)
    calories = int(stp.get("cal", 0))

    segments = _sleep_segments(slp)
    awake = sum(s["minutes"] for s in segments if s["stage"] == "awake")
    asleep_min = sum(s["minutes"] for s in segments if s["stage"] != "awake")
    total_min = asleep_min or sum(s["minutes"] for s in segments)
    efficiency = _clamp(
        total_min / (total_min + awake) * 100 if total_min else 0, 0, 100
    )

    hr_clean = [v for v in hr if v]
    resting = int(slp.get("rhr") or (min(hr_clean) if hr_clean else 0)) or 0
    hr_max = max(hr_clean) if hr_clean else 0
    hr_min = min(hr_clean) if hr_clean else 0
    current = hr_clean[-1] if hr_clean else resting

    # ── Métricas: reales si la nube las dio; si no, derivadas ──
    sleep_score = int(slp.get("ss") or 0) or _clamp(
        efficiency * 0.7 + (total_min / 480) * 30, 0, 100
    )

    def pick(key: str, derived: int) -> int:
        v = metrics.get(key)
        return _clamp(v, 0, 100) if isinstance(v, (int, float)) and v else derived

    readiness = pick(
        "readiness", _clamp(sleep_score * 0.6 + (100 - resting) * 0.4, 0, 100)
    )
    hrv_real = metrics.get("hrv")

    return {
        "date": date,
        "readiness": readiness,
        "bodyBattery": pick("bodyBattery", _clamp(readiness * 0.8, 0, 100)),
        "stress": pick("stress", _clamp(100 - efficiency, 0, 100)),
        "exertion": pick("exertion", 0),
        "spo2": pick("spo2", 0),
        "sleep": {
            "totalMinutes": total_min,
            "score": sleep_score,
            "bedtime": _ts_iso(slp.get("st")) or f"{date}T23:00:00+00:00",
            "wakeTime": _ts_iso(slp.get("ed")) or f"{date}T07:00:00+00:00",
            "segments": segments,
            "efficiency": efficiency,
        },
        "heart": {
            "resting": resting,
            "current": current,
            "min": hr_min,
            "max": hr_max,
            "hrv": int(hrv_real) if isinstance(hrv_real, (int, float)) and hrv_real else 0,
            "series": _hr_series(hr),
        },
        "activity": {
            "steps": steps,
            "stepsGoal": int(parsed.get("goal", 8000)),
            "distanceKm": distance_km,
            "calories": calories,
            "activeMinutes": int(stp.get("runDist", 0) // 100) if stp else 0,
            "hourly": _hourly_from_stages(stp),
        },
        "workouts": workouts or [],  # de /v1/sport/run/history.json
    }


def _hourly_from_stages(stp: dict[str, Any]) -> list[int]:
    """Reparte los pasos por hora usando 'stage' si existe; si no, ceros."""
    hourly = [0] * 24
    for s in stp.get("stage", []) or []:
        start_min = int(s.get("start", 0))
        hour = min(23, start_min // 60)
        hourly[hour] += int(s.get("step", 0))
    return hourly


def _day_date(d: dict[str, Any]) -> str:
    return d.get("date") or d.get("date_time") or ""


def _ms_to_local_date(ts: int) -> Optional[str]:
    """ms/s epoch → 'YYYY-MM-DD' en hora LOCAL (alinea con date_time del band_data).

    En Vercel define la env var TZ (p. ej. America/Guatemala) para que el día
    calendario coincida; en local usa la zona del sistema.
    """
    try:
        ts = int(ts)
        secs = ts / 1000 if ts > 1e12 else ts
        return datetime.fromtimestamp(secs).strftime("%Y-%m-%d")
    except (ValueError, OSError, TypeError):
        return None


def extract_daily(events: list[dict[str, Any]], kind: str) -> dict[str, float]:
    """{YYYY-MM-DD: valor} para una métrica, a partir de sus eventos."""
    out: dict[str, float] = {}
    for ev in sorted(events or [], key=lambda e: e.get("timestamp") or e.get("time") or 0):
        ts = ev.get("timestamp") or ev.get("time")
        if kind == "hrv":
            v = _as_obj(ev.get("value")) or {}
            if isinstance(v, dict) and v.get("startTime"):
                ts = v.get("startTime")
        if kind == "hybridCharge":
            v = _as_obj(ev.get("value")) or {}
            if isinstance(v, dict) and v.get("startTime"):
                ts = v.get("startTime")
        if kind == "exertion":
            v = _as_obj(ev.get("value")) or {}
            samples = v.get("samples") if isinstance(v, dict) else None
            if isinstance(samples, list) and v.get("startTime"):
                valid = [
                    s
                    for s in samples
                    if isinstance(s, dict)
                    and isinstance(s.get("exertionScore"), (int, float))
                    and isinstance(s.get("s"), (int, float))
                ]
                if valid:
                    ts = int(v["startTime"]) + int(valid[-1]["s"])
        day = _ms_to_local_date(ts) if ts is not None else None
        if not day:
            continue
        val = extract_metric(ev, kind)
        if val is not None:
            out[day] = round(val, 1)  # 1 evento/día (o el último gana)
    return out


def build_snapshot(
    days: list[dict[str, Any]],
    hr_by_date: dict[str, list[int]],
    device: dict[str, Any],
    user_name: str = "Atleta",
    metrics_by_date: Optional[dict[str, dict[str, Any]]] = None,
    workouts_by_date: Optional[dict[str, list[dict[str, Any]]]] = None,
) -> dict[str, Any]:
    metrics_by_date = metrics_by_date or {}
    workouts_by_date = workouts_by_date or {}
    days_sorted = sorted(days, key=_day_date)
    week = [
        build_day(
            d,
            hr_by_date.get(_day_date(d)),
            metrics_by_date.get(_day_date(d)),
            workouts_by_date.get(_day_date(d)),
        )
        for d in days_sorted
    ]
    if not week:
        raise ValueError("La nube de Zepp no devolvió datos para el rango pedido.")

    # Forward-fill de HRV: el dato de hoy a veces sincroniza tarde → usa el
    # último día conocido para no mostrar 0.
    last_hrv = 0
    for day in week:
        if day["heart"]["hrv"]:
            last_hrv = day["heart"]["hrv"]
        elif last_hrv:
            day["heart"]["hrv"] = last_hrv

    return {
        "device": device,
        "user": {"name": user_name},
        "today": week[-1],
        "week": week,
        "source": "zepp",
    }
