"""
API del backend de Helio Strap.

Expone el snapshot de salud ya normalizado para el frontend:
    GET /api/snapshot   → HealthSnapshot (mismo shape que frontend/src/types.ts)
    GET /api/health     → estado del servicio y de la conexión con Zepp

Fuente de datos según configuración (.env):
  - Si hay ZEPP_APP_TOKEN+ZEPP_USER_ID  → datos reales de la nube de Zepp.
  - Si hay ZEPP_EMAIL+ZEPP_PASSWORD     → login y datos reales.
  - Si no hay nada                       → snapshot demo (para cablear la UI).

Incluye un caché en memoria (TTL) para no golpear la API de Huami en cada
request — su endpoint de login tiene rate-limit estricto.
"""

from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from backend.zepp.client import HuamiClient, ZeppError
from backend.zepp.demo import build_demo_snapshot
from backend.zepp.normalize import build_snapshot, extract_daily, workouts_by_date

# Carga backend/.env sin importar desde dónde se ejecute. En Vercel no existe
# .env y las variables vienen del dashboard (load_dotenv no falla si no hay).
load_dotenv(Path(__file__).resolve().parent / ".env")

CACHE_TTL = int(os.getenv("CACHE_TTL_SECONDS", "900"))  # 15 min por defecto
# Ventana de historial devuelta en `week`. 30 días alcanza para el toggle
# 7D/30D del frontend; band_data/events_* ya son 1 llamada por rango, así que
# ampliarla no multiplica peticiones a Zepp.
DAYS = 30
logger = logging.getLogger(__name__)

app = FastAPI(title="Helio Strap API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

_cache: dict[str, object] = {"at": 0.0, "data": None}
_brief_cache: dict[str, object] = {"key": None, "data": None}


def _client() -> HuamiClient | None:
    token = os.getenv("ZEPP_APP_TOKEN")
    user_id = os.getenv("ZEPP_USER_ID")
    email = os.getenv("ZEPP_EMAIL")
    password = os.getenv("ZEPP_PASSWORD")
    api_host = os.getenv("ZEPP_API_HOST")
    if token and user_id:
        return HuamiClient(app_token=token, user_id=user_id, api_host=api_host)
    if email and password:
        return HuamiClient(email=email, password=password)
    return None


# Métricas propietarias → (endpoint, eventType, subType, kind)
# 'v2'   = /v2/users/me/events   ·   'user' = /users/{id}/events
# Códigos + parsing confirmados contra respuestas reales del Helio Strap.
_METRIC_EVENTS = [
    ("readiness", "v2", "readiness", "watch_score", "readiness"),
    ("bodyBattery", "v2", "Charge", "summary", "hybridCharge"),
    ("exertion", "v2", "Charge", "real_data", "exertion"),
    ("hrv", "v2", "hrv_sdnn", "real_data", "hrv"),
    ("stress", "user", "all_day_stress", None, "stress"),
    ("spo2", "user", "blood_oxygen", "click", "spo2"),
]


def _metrics_by_date(client: HuamiClient, from_ms: int, to_ms: int) -> dict[str, dict]:
    """Trae cada métrica propietaria en ventana de 7 días y la agrupa por día."""
    by_date: dict[str, dict] = {}
    for key, endpoint, et, st, kind in _METRIC_EVENTS:
        if endpoint == "v2":
            events = client.events_v2(et, st, from_ms, to_ms)
        else:
            events = client.events_user(et, from_ms, to_ms, sub_type=st)
        for day, val in extract_daily(events, kind).items():
            by_date.setdefault(day, {})[key] = val
    return by_date


def _apply_hourly_steps(days: list[dict], step_by_date: dict[str, list[int]]) -> None:
    """Reconstruye los pasos por hora desde el detalle minuto-a-minuto.

    `stp.stage` del resumen son tramos de ACTIVIDAD (ejercicio), no un desglose
    horario — usarlo concentra todo el día en 1-2 horas. El blob detail sí trae
    1 valor por minuto, así que de ahí derivamos las 24 horas reales. Los
    totales del resumen (ttl/dis/cal) se respetan y solo se rellenan si vienen
    en cero (días recientes que aún no agregan el summary).
    """
    for day in days:
        date = day.get("date") or day.get("date_time")
        steps = step_by_date.get(date) or []
        total = sum(steps)
        if not date or not total:
            continue

        parsed = day.setdefault("parsed", {})
        stp = parsed.setdefault("stp", {})

        # Pasos por hora REALES (minuto-a-minuto), no los tramos de ejercicio.
        hourly = [sum(steps[h * 60 : (h + 1) * 60]) for h in range(24)]
        stp["stage"] = [
            {"start": h * 60, "stop": (h + 1) * 60, "step": value}
            for h, value in enumerate(hourly)
            if value
        ]
        stp["runDist"] = sum(1 for v in steps if v) * 100

        # Totales: el resumen manda; solo rellena si llegó en cero.
        if not int(stp.get("ttl") or 0):
            stp["ttl"] = total
        if not int(stp.get("dis") or 0):
            stp["dis"] = int(total * 0.72)
        if not int(stp.get("cal") or 0):
            stp["cal"] = int(total * 0.04)


def _real_snapshot(client: HuamiClient) -> dict:
    now = datetime.now()
    to_date = now.strftime("%Y-%m-%d")
    from_date = (now - timedelta(days=DAYS - 1)).strftime("%Y-%m-%d")
    from_ms = int((now - timedelta(days=DAYS - 1)).timestamp() * 1000)
    to_ms = int(now.timestamp() * 1000)

    days = client.band_data(from_date, to_date)

    # HR intradía (curva del chart) para hoy y ayer; barato y suficiente.
    yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    hr_by_date = {
        to_date: client.heart_rate(to_date),
        yesterday: client.heart_rate(yesterday),
    }
    step_by_date = {
        to_date: client.activity_steps(to_date),
        yesterday: client.activity_steps(yesterday),
    }
    _apply_hourly_steps(days, step_by_date)

    metrics_by_date = _metrics_by_date(client, from_ms, to_ms)
    workouts = workouts_by_date(client.sport_history())

    # La nube de Zepp NO expone el nivel de batería del Helio Strap (ni el
    # endpoint de devices ni el de eventos lo traen). Si quieres mostrar un
    # valor, ponlo a mano en DEVICE_BATTERY; si no, va None y la UI lo oculta.
    batt_env = os.getenv("DEVICE_BATTERY", "").strip()
    battery = int(batt_env) if batt_env.isdigit() else None

    device = {
        "name": "Helio Strap",
        "model": "Amazfit Helio",
        "battery": battery,
        "lastSync": now.isoformat(),
    }
    return build_snapshot(
        days,
        hr_by_date,
        device,
        user_name=os.getenv("USER_NAME", "Atleta"),
        metrics_by_date=metrics_by_date,
        workouts_by_date=workouts,
    )


def _build_snapshot() -> dict:
    client = _client()
    if client is None:
        return build_demo_snapshot()
    try:
        return _real_snapshot(client)
    except (ZeppError, Exception) as e:  # noqa: BLE001 — degradar a demo, no caer
        logger.warning("Falling back to demo snapshot: %s: %s", type(e).__name__, e)
        snap = build_demo_snapshot()
        snap["device"]["model"] = f"Amazfit Helio (demo · {type(e).__name__})"
        return snap


def _compact_snapshot(snap: dict) -> dict:
    today = snap["today"]
    week = snap["week"]
    return {
        "date": today["date"],
        "source": snap.get("source"),
        "readiness": today["readiness"],
        "hybrid_charge": today["bodyBattery"],
        "exertion": today["exertion"],
        "stress": today["stress"],
        "spo2": today["spo2"],
        "sleep": {
            "score": today["sleep"]["score"],
            "minutes": today["sleep"]["totalMinutes"],
            "efficiency": today["sleep"]["efficiency"],
        },
        "heart": {
            "current": today["heart"]["current"],
            "resting": today["heart"]["resting"],
            "min": today["heart"]["min"],
            "max": today["heart"]["max"],
            "hrv": today["heart"]["hrv"],
        },
        "activity": {
            "steps": today["activity"]["steps"],
            "goal": today["activity"]["stepsGoal"],
            "distance_km": today["activity"]["distanceKm"],
            "calories": today["activity"]["calories"],
            "active_minutes": today["activity"]["activeMinutes"],
        },
        "week": [
            {
                "date": d["date"],
                "readiness": d["readiness"],
                "sleep": d["sleep"]["score"],
                "hrv": d["heart"]["hrv"],
                "rhr": d["heart"]["resting"],
                "stress": d["stress"],
                "hybrid_charge": d["bodyBattery"],
                "exertion": d["exertion"],
            }
            for d in week
        ],
    }


def _brief_language(lang: str) -> str:
    return "en" if lang == "en" else "es"


def _local_daily_brief(compact: dict, lang: str = "es") -> dict:
    lang = _brief_language(lang)
    readiness = int(compact["readiness"])
    sleep = int(compact["sleep"]["score"])
    hrv = int(compact["heart"]["hrv"])
    stress = int(compact["stress"])
    exertion = int(compact["exertion"])
    spo2 = int(compact["spo2"])
    hybrid = int(compact["hybrid_charge"])
    steps = int(compact["activity"]["steps"])

    if lang == "en":
        mode = "Push" if readiness >= 75 else "Build" if readiness >= 55 else "Protect"
        focus = "recovery" if readiness < 55 else "aerobic base" if exertion <= 10 else "moderate load"
    else:
        mode = "Empujar" if readiness >= 75 else "Construir" if readiness >= 55 else "Proteger"
        focus = "recuperación" if readiness < 55 else "base aeróbica" if exertion <= 10 else "carga moderada"

    warnings = []
    if spo2 and spo2 < 90:
        warnings.append(
            "Low SpO2: repeat the reading and check strap fit."
            if lang == "en"
            else "SpO2 baja: repite medición y revisa ajuste del strap."
        )
    if stress >= 60:
        warnings.append(
            "High stress: lower intensity if you feel fatigued."
            if lang == "en"
            else "Estrés alto: baja intensidad si notas fatiga."
        )

    if lang == "en":
        summary = (
            f"Sleep {sleep}, HRV {hrv} ms, Hybrid {hybrid}, and stress {stress}. "
            f"You have {steps:,} steps and exertion {exertion}%."
        )
        recommendation = (
            "Good day for zone 2, technique, or controlled strength."
            if mode == "Build"
            else "You can push if the plan calls for it."
            if mode == "Push"
            else "Prioritize recovery, mobility, and sleep."
        )
        bullets = [
            f"Readiness {readiness}: {mode.lower()}.",
            f"Sleep {sleep} with {compact['sleep']['minutes'] // 60}h {compact['sleep']['minutes'] % 60:02d}m.",
            f"HRV {hrv} ms and RHR {compact['heart']['resting']} bpm.",
            f"Exertion {exertion}% with {steps:,} steps.",
        ]
    else:
        summary = (
            f"Sueño {sleep}, HRV {hrv} ms, Hybrid {hybrid} y estrés {stress}. "
            f"Llevas {steps:,} pasos y exertion {exertion}%."
        )
        recommendation = (
            "Buen día para zona 2, técnica o fuerza controlada."
            if mode == "Construir"
            else "Puedes empujar si el plan lo pide."
            if mode == "Empujar"
            else "Prioriza recuperación, movilidad y sueño."
        )
        bullets = [
            f"Readiness {readiness}: {mode.lower()}.",
            f"Sueño {sleep} con {compact['sleep']['minutes'] // 60}h {compact['sleep']['minutes'] % 60:02d}m.",
            f"HRV {hrv} ms y RHR {compact['heart']['resting']} ppm.",
            f"Exertion {exertion}% con {steps:,} pasos.",
        ]

    return {
        "date": compact["date"],
        "generatedAt": datetime.now().isoformat(),
        "source": "local",
        "title": f"{mode}: readiness {readiness}",
        "summary": summary,
        "recommendation": recommendation,
        "focus": focus,
        "bullets": bullets,
        "warnings": warnings,
    }


def _parse_openai_text(payload: dict) -> str:
    if isinstance(payload.get("output_text"), str):
        return payload["output_text"]
    chunks: list[str] = []
    for item in payload.get("output", []) or []:
        for content in item.get("content", []) or []:
            text = content.get("text")
            if isinstance(text, str):
                chunks.append(text)
    return "\n".join(chunks).strip()


def _daily_brief_schema() -> dict:
    string_array = {
        "type": "array",
        "items": {"type": "string"},
    }
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "title": {"type": "string"},
            "summary": {"type": "string"},
            "recommendation": {"type": "string"},
            "focus": {"type": "string"},
            "bullets": string_array,
            "warnings": string_array,
        },
        "required": [
            "title",
            "summary",
            "recommendation",
            "focus",
            "bullets",
            "warnings",
        ],
    }


def _coerce_openai_brief(parsed: dict, compact: dict) -> dict:
    if not isinstance(parsed, dict):
        raise ValueError("OpenAI brief payload is not an object")

    bullets = parsed.get("bullets")
    warnings = parsed.get("warnings")
    if not isinstance(bullets, list) or not isinstance(warnings, list):
        raise ValueError("OpenAI brief bullets/warnings are not arrays")

    return {
        "date": compact["date"],
        "generatedAt": datetime.now().isoformat(),
        "source": "openai",
        "title": str(parsed["title"]),
        "summary": str(parsed["summary"]),
        "recommendation": str(parsed["recommendation"]),
        "focus": str(parsed["focus"]),
        "bullets": [str(x) for x in bullets][:5],
        "warnings": [str(x) for x in warnings][:3],
    }


def _openai_daily_brief(compact: dict, lang: str = "es") -> dict:
    lang = _brief_language(lang)
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return _local_daily_brief(compact, lang)

    model = os.getenv("OPENAI_MODEL", "gpt-5.4-mini")
    timeout = int(os.getenv("OPENAI_TIMEOUT_SECONDS", "30"))
    language = "English" if lang == "en" else "Spanish"
    prompt = {
        "role": "user",
        "content": (
            f"Generate a morning wellness brief in {language} for a recreational athlete. "
            "Use only the supplied metrics. Do not diagnose disease and do not provide medical advice. "
            "Be concrete, conservative, and similar in tone to WHOOP. Keep summary plus recommendation under 90 words.\n\n"
            f"DATOS:\n{json.dumps(compact, ensure_ascii=False)}"
        ),
    }
    body = {
        "model": model,
        "input": [
            {
                "role": "system",
                "content": (
                    "You are a recovery coach. Be direct, practical, and conservative. "
                    f"Respond in {language}."
                ),
            },
            prompt,
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "daily_wellness_brief",
                "strict": True,
                "schema": _daily_brief_schema(),
            }
        },
    }
    try:
        r = requests.post(
            "https://api.openai.com/v1/responses",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=body,
            timeout=timeout,
        )
        r.raise_for_status()
        text = _parse_openai_text(r.json())
        parsed = json.loads(text)
        return _coerce_openai_brief(parsed, compact)
    except requests.exceptions.RequestException as e:
        logger.warning("OpenAI daily brief request failed: %s", e)
    except json.JSONDecodeError as e:
        logger.warning("OpenAI daily brief returned invalid JSON: %s", e)
    except (KeyError, TypeError, ValueError) as e:
        logger.warning("OpenAI daily brief returned invalid schema data: %s", e)

    brief = _local_daily_brief(compact, lang)
    brief["source"] = "local-fallback"
    return brief


def _check_auth(password: Optional[str]) -> None:
    """Protege los datos con una contraseña simple (SITE_PASSWORD).

    Si SITE_PASSWORD no está definida, los endpoints quedan abiertos (útil en
    local/demo). En Vercel, defínela para exigir contraseña. La compara con la
    cabecera X-Site-Password que envía el frontend.
    """
    required = os.getenv("SITE_PASSWORD", "").strip()
    if not required:
        return
    if password != required:
        raise HTTPException(status_code=401, detail="Contraseña requerida")


def _snapshot_cached(refresh: bool = False) -> dict:
    now = time.time()
    stale = _cache["data"] is None or now - float(_cache["at"]) > CACHE_TTL
    # refresh=1 (botón de la UI) ignora el caché y baja datos frescos de Zepp.
    if refresh or stale:
        _cache["data"] = _build_snapshot()
        _cache["at"] = now
    return _cache["data"]  # type: ignore[return-value]


@app.get("/api/snapshot")
def snapshot(
    refresh: bool = False,
    x_site_password: Optional[str] = Header(default=None),
) -> dict:
    _check_auth(x_site_password)
    return _snapshot_cached(refresh)


@app.get("/api/daily-brief")
def daily_brief(
    refresh: bool = False,
    lang: str = "es",
    x_site_password: Optional[str] = Header(default=None),
) -> dict:
    _check_auth(x_site_password)
    lang = _brief_language(lang)
    snap = _snapshot_cached(refresh)
    compact = _compact_snapshot(snap)
    cache_key = f"{compact['date']}:{lang}"
    if (
        not refresh
        and _brief_cache["key"] == cache_key
        and _brief_cache["data"] is not None
    ):
        return _brief_cache["data"]  # type: ignore[return-value]

    brief = _openai_daily_brief(compact, lang)
    _brief_cache["key"] = cache_key
    _brief_cache["data"] = brief
    return brief


@app.get("/api/health")
def health() -> dict:
    configured = _client() is not None
    return {
        "status": "ok",
        "zepp_configured": configured,
        "mode": "zepp" if configured else "demo",
        "cache_ttl": CACHE_TTL,
        "ai_brief_configured": bool(os.getenv("OPENAI_API_KEY")),
    }
