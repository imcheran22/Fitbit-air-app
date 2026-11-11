"""
Obtiene tu app_token + user_id de Zepp SIN proxy ni interceptación.

Hace el login con tu email/contraseña de Zepp (la misma API que usa la app) y
te imprime los valores para pegar en .env (local) o en Vercel.

Uso (desde la raíz del repo):

    # opción 1: te pregunta email y contraseña (no quedan en el historial)
    python -m backend.get_token

    # opción 2: lee ZEPP_EMAIL / ZEPP_PASSWORD de backend/.env
    python -m backend.get_token --from-env

Si tu cuenta Zepp es por Google/Apple (login social) no hay contraseña directa:
en ese caso usa la captura con proxy (ver TOKEN.md).
"""

from __future__ import annotations

import argparse
import sys
from getpass import getpass
from pathlib import Path

from dotenv import load_dotenv

from backend.zepp.client import HuamiClient, ZeppError


def main() -> int:
    parser = argparse.ArgumentParser(description="Obtener token de Zepp")
    parser.add_argument(
        "--from-env",
        action="store_true",
        help="Leer ZEPP_EMAIL/ZEPP_PASSWORD de backend/.env",
    )
    parser.add_argument(
        "--no-save",
        action="store_true",
        help="Solo imprimir el token, no escribirlo en .env",
    )
    args = parser.parse_args()

    import os

    if args.from_env:
        load_dotenv(Path(__file__).resolve().parent / ".env")
        email = os.getenv("ZEPP_EMAIL")
        password = os.getenv("ZEPP_PASSWORD")
        if not email or not password:
            print("Faltan ZEPP_EMAIL/ZEPP_PASSWORD en backend/.env", file=sys.stderr)
            return 1
    else:
        email = input("Email de Zepp: ").strip()
        password = getpass("Contraseña de Zepp: ")

    print("\nIniciando sesión en la nube de Zepp…\n")
    try:
        client = HuamiClient(email=email, password=password)
        s = client.session()
    except ZeppError as e:
        print(f"✗ No se pudo iniciar sesión: {e}", file=sys.stderr)
        print(
            "  (si usas login de Google/Apple, no hay contraseña → usa el proxy, ver TOKEN.md)",
            file=sys.stderr,
        )
        return 1
    except Exception as e:  # noqa: BLE001
        print(f"✗ Error inesperado: {type(e).__name__}: {e}", file=sys.stderr)
        return 1

    print("✓ ¡Login correcto!\n")

    if args.no_save:
        print("Pega esto en backend/.env (y en Vercel):\n")
        print(f"ZEPP_APP_TOKEN={s.app_token}")
        print(f"ZEPP_USER_ID={s.user_id}")
        if s.api_host != "api-mifit.huami.com":
            print(f"\n# host regional detectado: {s.api_host}")
        return 0

    env_path = Path(__file__).resolve().parent / ".env"
    _save_to_env(env_path, s.app_token, s.user_id, s.api_host)
    print(f"✓ Guardado automáticamente en {env_path}")
    print("\nYa puedes arrancar el backend — usará tus datos reales de Zepp.")
    return 0


def _save_to_env(path: Path, app_token: str, user_id: str, host: str) -> None:
    """Crea o actualiza backend/.env con el token, sin borrar lo demás."""
    updates = {
        "ZEPP_APP_TOKEN": app_token,
        "ZEPP_USER_ID": user_id,
        "ZEPP_API_HOST": host.replace("https://", ""),
    }
    lines: list[str] = []
    if path.exists():
        lines = path.read_text().splitlines()
    seen = set()
    for i, line in enumerate(lines):
        key = line.split("=", 1)[0].strip().lstrip("#").strip()
        if key in updates:
            lines[i] = f"{key}={updates[key]}"
            seen.add(key)
    for key, val in updates.items():
        if key not in seen:
            lines.append(f"{key}={val}")
    path.write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    raise SystemExit(main())
