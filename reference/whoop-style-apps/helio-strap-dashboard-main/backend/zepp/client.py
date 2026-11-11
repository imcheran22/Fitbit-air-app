"""
Cliente de la nube de Zepp / Huami (api-mifit).

Basado en el trabajo de ingeniería inversa documentado por la comunidad:
  - argrento/huami-token        (flujo de login + token)
  - bentasker/zepp_to_influxdb  (endpoint band_data + parsing del summary)
  - "Reverse engineering of the Mi Fit API"

NO es una API oficial. Puede romperse si Zepp cambia el backend. Úsala sólo
con tus propios datos.

El flujo del Helio Strap es:
    Strap → app Zepp (BLE) → nube Huami → ESTE cliente → JSON normalizado

Dos formas de autenticarse (configúralas por variables de entorno):
  1. Token pre-extraído  (RECOMENDADO):  ZEPP_APP_TOKEN + ZEPP_USER_ID
       - Evita el endpoint de login, que tiene rate-limit estricto.
       - Se extrae una sola vez con un proxy (HTTP Toolkit / Fiddler) o con
         el proyecto argrento/huami-token.
  2. Email + contraseña:  ZEPP_EMAIL + ZEPP_PASSWORD
       - Hace el login completo. Si lo llamas muy seguido, Huami te bloquea
         temporalmente con error 0103.
"""

from __future__ import annotations

import base64
import json
import time
import uuid
from dataclasses import dataclass
from typing import Any, Optional
from urllib.parse import parse_qs, urlencode, urlparse

import requests
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad

# ── Flujo de login MODERNO (servidores zepp.com) ──
# El flujo viejo (api-user.huami.com) está deprecado y responde 429. Las cuentas
# Zepp actuales usan estos endpoints. Cabeceras/payloads tomados de la app real
# (vía argrento/huami-token). El método Amazfit NO necesita cifrado RC4 (eso es
# solo para cuentas Xiaomi).
_TOKENS_URL = "https://api-user-us2.zepp.com/v2/registrations/tokens"
_LOGIN_URL = "https://api-mifit-us2.zepp.com/v2/client/login"
_DEFAULT_API_HOST = "api-mifit.zepp.com"
_DN = (
    "api-mifit.zepp.com,api-user.zepp.com,api-mifit.zepp.com,api-watch.zepp.com,"
    "app-analytics.zepp.com,auth.zepp.com,api-analytics.zepp.com"
)
# La app que declaramos al pedir datos (rutas /v2/.../events y /heartRate).
_CLIENT_APP = "com.huami.midong"

_TOKENS_HEADERS = {
    "app_name": _CLIENT_APP,
    "appname": _CLIENT_APP,
    "cv": "151689_9.12.5",
    "v": "2.0",
    "appplatform": "android_phone",
    "vb": "202509151347",
    "vn": "9.12.5",
    "user-agent": "Zepp/9.12.5 (Pixel 4; Android 12; Density/2.75)",
    "x-hm-ekv": "1",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    "accept-encoding": "gzip",
}
_LOGIN_HEADERS = {
    "app_name": "com.huami.webapp",
    "appname": "com.huami.webapp",
    "origin": "https://user.zepp.com",
    "referer": "https://user.zepp.com/",
    "user-agent": "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    "accept": "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.5",
}


# En el flujo nuevo, el cuerpo del POST de tokens va AES-CBC cifrado con esta
# clave/IV fijos de la app, y la cabecera x-hm-ekv:1 lo señala.
_ZEPP_KEY = b"xeNtBVqzDc6tuNTh"
_ZEPP_IV = b"MAAAYAAAAAAAAABg"


def _encrypt_payload(form: dict) -> bytes:
    """url-encode → AES-CBC(PKCS7) → bytes crudos (como hace la app Zepp)."""
    raw = urlencode(form, doseq=True).encode()
    cipher = AES.new(_ZEPP_KEY, AES.MODE_CBC, iv=_ZEPP_IV)
    return cipher.encrypt(pad(raw, AES.block_size))


def _device_id() -> str:
    """device_id que la app manda en el login (un UUID v4)."""
    return str(uuid.uuid4())


class ZeppError(RuntimeError):
    pass


@dataclass
class Session:
    app_token: str
    user_id: str
    api_host: str = _DEFAULT_API_HOST
    # los tokens caducan; guardamos cuándo se obtuvo para refrescar si hace falta
    obtained_at: float = 0.0


class HuamiClient:
    """Login + descarga de datos crudos desde la nube de Huami/Zepp."""

    def __init__(
        self,
        email: Optional[str] = None,
        password: Optional[str] = None,
        app_token: Optional[str] = None,
        user_id: Optional[str] = None,
        api_host: Optional[str] = None,
        timeout: int = 20,
    ) -> None:
        self.email = email
        self.password = password
        self.timeout = timeout
        self._session: Optional[Session] = None
        if app_token and user_id:
            # Camino recomendado: token ya extraído, sin tocar el login.
            self._session = Session(
                app_token=app_token,
                user_id=user_id,
                api_host=(api_host or _DEFAULT_API_HOST).replace("https://", ""),
                obtained_at=time.time(),
            )

    # ── Autenticación (flujo moderno zepp.com) ──────────────────────────
    def _get_access_code(self) -> tuple[str, str]:
        """Paso 1: cambia email+password por un 'access code' de un solo uso."""
        if not self.email or not self.password:
            raise ZeppError("Faltan credenciales (email/contraseña) o token.")
        data = {
            "emailOrPhone": self.email,
            "state": "REDIRECTION",
            "client_id": "HuaMi",
            "password": self.password,
            "redirect_uri": "https://s3-us-west-2.amazonaws.com/hm-registration/successsignin.html",
            "region": "us-west-2",
            "token": ["access", "refresh"],
            "country_code": "US",
        }
        r = requests.post(
            _TOKENS_URL,
            data=_encrypt_payload(data),  # cuerpo AES-cifrado
            headers=_TOKENS_HEADERS,
            allow_redirects=False,
            timeout=self.timeout,
        )
        location = r.headers.get("Location")
        if not location:
            raise ZeppError(
                f"Login Zepp sin redirección (HTTP {r.status_code}). "
                "Revisa email/contraseña; si entras con Google/Apple no hay "
                "contraseña directa (usa el método proxy de TOKEN.md)."
            )
        qs = parse_qs(urlparse(location).query)
        if "access" not in qs:
            code = qs.get("error", ["desconocido"])[0]
            raise ZeppError(f"Login Zepp rechazado: {code}")
        return qs["access"][0], qs.get("country_code", ["US"])[0]

    def _login_with_code(self, access_code: str, country_code: str) -> Session:
        """Paso 2: cambia el access code por app_token + user_id."""
        data = {
            "code": access_code,
            "device_id": _device_id(),
            "device_model": "android_phone",
            "app_version": "9.12.5",
            "dn": _DN,
            "third_name": "huami",
            "source": "com.huami.watch.hmwatchmanager:9.12.5:151689",
            "app_name": _CLIENT_APP,
            "country_code": country_code or "US",
            "grant_type": "access_token",
            "allow_registration": "false",
            "lang": "en",
            "countryState": "US-NY",
        }
        r = requests.post(
            _LOGIN_URL,
            data=data,
            headers=_LOGIN_HEADERS,
            allow_redirects=False,
            timeout=self.timeout,
        )
        try:
            payload = r.json()
        except ValueError:
            raise ZeppError(f"Login Zepp: respuesta no-JSON (HTTP {r.status_code}).")
        token_info = payload.get("token_info")
        if not token_info:
            raise ZeppError(f"Respuesta de login inesperada: {payload}")
        host = str(token_info.get("api_host") or _DEFAULT_API_HOST).replace(
            "https://", ""
        )
        return Session(
            app_token=token_info["app_token"],
            user_id=token_info["user_id"],
            api_host=host,
            obtained_at=time.time(),
        )

    def session(self) -> Session:
        """Devuelve una sesión válida, logueando si hace falta."""
        if self._session is None:
            code, country = self._get_access_code()
            self._session = self._login_with_code(code, country)
        return self._session

    # ── Descarga de datos ───────────────────────────────────────────────
    def band_data(self, from_date: str, to_date: str) -> list[dict[str, Any]]:
        """
        Resumen diario (pasos, sueño, calorías) entre dos fechas YYYY-MM-DD.

        Devuelve la lista cruda de días; cada item trae 'summary' ya decodificado
        en la clave 'parsed'.
        """
        s = self.session()
        url = f"https://{s.api_host}/v1/data/band_data.json"
        headers = {"apptoken": s.app_token, "appname": _CLIENT_APP}
        params = {
            "query_type": "summary",
            "device_type": "android_phone",
            "userid": s.user_id,
            "from_date": from_date,
            "to_date": to_date,
        }
        r = requests.get(
            url, headers=headers, params=params, timeout=self.timeout
        )
        if r.status_code == 401:
            raise ZeppError("Token expirado o inválido (HTTP 401).")
        r.raise_for_status()
        days = r.json().get("data", [])
        for d in days:
            d["parsed"] = _decode_summary(d.get("summary"))
        return days

    def _get(self, path: str, params: dict[str, Any]) -> Any:
        """GET autenticado contra el host de la sesión."""
        s = self.session()
        url = f"https://{s.api_host}{path}"
        headers = {"apptoken": s.app_token, "appname": _CLIENT_APP}
        r = requests.get(
            url, headers=headers, params=params, timeout=self.timeout
        )
        if r.status_code == 401:
            raise ZeppError("Token expirado o inválido (HTTP 401).")
        r.raise_for_status()
        return r.json()

    def heart_rate(self, date_str: str) -> list[int]:
        """
        Serie intradía de FC (1 valor/minuto, 1440) para un día YYYY-MM-DD.

        Viene en el blob `data_hr` del band_data 'detail': 1 byte por minuto.
        0 = sin lectura; 254/255 = marcadores → se descartan.
        """
        s = self.session()
        try:
            payload = self._get(
                "/v1/data/band_data.json",
                {
                    "query_type": "detail",
                    "device_type": "android_phone",
                    "userid": s.user_id,
                    "from_date": date_str,
                    "to_date": date_str,
                },
            )
        except (requests.RequestException, ValueError, ZeppError):
            return []
        data = payload.get("data") or []
        if not data:
            return []
        return _decode_hr(data[-1].get("data_hr"))

    def activity_steps(self, date_str: str) -> list[int]:
        """
        Pasos intradía (1 valor/minuto, 1440) desde el blob `data` del detail.

        El blob trae 3 bytes por minuto: byte0 = marcador (0x7E), byte1 =
        intensidad/actividad, byte2 = pasos del minuto. La suma diaria de byte2
        coincide EXACTAMENTE con `stp.ttl` del resumen (verificado contra datos
        reales del Helio Strap), por eso byte2 es la fuente correcta.
        """
        s = self.session()
        try:
            payload = self._get(
                "/v1/data/band_data.json",
                {
                    "query_type": "detail",
                    "device_type": "android_phone",
                    "userid": s.user_id,
                    "from_date": date_str,
                    "to_date": date_str,
                },
            )
        except (requests.RequestException, ValueError, ZeppError):
            return []
        data = payload.get("data") or []
        if not data:
            return []
        return _decode_activity_steps(data[-1].get("data"))

    def sport_history(self) -> list[dict[str, Any]]:
        """
        Historial de entrenos vía /v1/sport/run/history.json.

        Cada item es el resumen de una sesión (trackid, type, dis, calorie,
        avg_heart_rate, run_time, end_time, …). El campo `data.summary` es una
        lista (a veces JSON-string). Devuelve la lista cruda; la agrupación por
        día y el mapeo al modelo de la UI viven en normalize.py.
        """
        s = self.session()
        try:
            payload = self._get(
                "/v1/sport/run/history.json",
                {"source": "run.mifit.huami.com", "userid": s.user_id},
            )
        except (requests.RequestException, ValueError, ZeppError):
            return []
        data = payload.get("data") or {}
        summary = data.get("summary")
        if isinstance(summary, str):
            try:
                summary = json.loads(summary)
            except (ValueError, json.JSONDecodeError):
                return []
        return summary if isinstance(summary, list) else []

    def events_v2(
        self, event_type: str, sub_type: str, from_ms: int, to_ms: int, limit: int = 500
    ) -> list[dict[str, Any]]:
        """
        Stream propietario via /v2/users/me/events (readiness, estrés, batería
        corporal, HRV, …). Códigos confirmados por captura de proxy:
            readiness     → readiness    / watch_score
            body-battery  → Charge       / real_data
            stress        → Charge       / stress_data
            hrv           → hrv_sdnn     / real_data
        """
        try:
            payload = self._get(
                "/v2/users/me/events",
                {
                    "eventType": event_type,
                    "subType": sub_type,
                    "from": from_ms,
                    "to": to_ms,
                    "limit": limit,
                    "reverse": 1,
                },
            )
        except (requests.RequestException, ValueError, ZeppError):
            return []
        return payload.get("items") or payload.get("data") or []

    def events_user(
        self,
        event_type: str,
        from_ms: int,
        to_ms: int,
        sub_type: Optional[str] = None,
        limit: int = 2000,
    ) -> list[dict[str, Any]]:
        """
        Stream centrado en el reloj via /users/{id}/events:
            spo2 → blood_oxygen / click     ·     pai → PaiHealthInfo
        """
        s = self.session()
        params: dict[str, Any] = {
            "eventType": event_type,
            "from": from_ms,
            "to": to_ms,
            "limit": limit,
            "reverse": 0,
            "userId": s.user_id,
        }
        if sub_type:
            params["subType"] = sub_type
        try:
            payload = self._get(f"/users/{s.user_id}/events", params)
        except (requests.RequestException, ValueError, ZeppError):
            return []
        return payload.get("items") or payload.get("data") or []


def _decode_summary(summary: Optional[str]) -> dict[str, Any]:
    """El campo 'summary' es JSON en base64 (a veces ya es JSON plano)."""
    if not summary:
        return {}
    try:
        return json.loads(base64.b64decode(summary))
    except (ValueError, json.JSONDecodeError):
        try:
            return json.loads(summary)
        except (ValueError, json.JSONDecodeError):
            return {}


def _decode_hr(raw: Optional[str]) -> list[int]:
    """data_hr: base64, 1 byte/min (1440). 0/254/255 = sin lectura → 0."""
    if not raw:
        return []
    try:
        b = base64.b64decode(raw)
    except (ValueError, TypeError):
        return []
    return [0 if (v == 0 or v >= 254) else v for v in b]


def _decode_activity_steps(raw: Optional[str]) -> list[int]:
    """data: base64, 3 bytes/min; byte 2 (índice 2) = pasos del minuto.

    (byte0 = marcador 0x7E, byte1 = intensidad; solo byte2 suma stp.ttl.)
    """
    if not raw:
        return []
    try:
        b = base64.b64decode(raw)
    except (ValueError, TypeError):
        return []
    if len(b) < 3 or len(b) % 3 != 0:
        return []
    return [int(b[i + 2]) for i in range(0, len(b), 3)]
