"""
Punto de entrada de la función serverless de Vercel.

Vercel detecta la variable ASGI `app` y la sirve. Reutilizamos exactamente la
misma app FastAPI que corre en local (backend/main.py) — una sola fuente de
verdad. El import estático `backend.main` permite a Vercel rastrear y empaquetar
todo el paquete `backend/`.

Todas las rutas (/api/snapshot, /api/health) llegan aquí vía el rewrite de
vercel.json.
"""

from backend.main import app  # noqa: F401  (Vercel usa la variable `app`)
