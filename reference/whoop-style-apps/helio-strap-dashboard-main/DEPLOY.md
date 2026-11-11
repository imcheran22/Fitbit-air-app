# Deploy a Vercel

El repo ya está preparado para Vercel:

```
api/index.py        → función serverless (reexporta la app FastAPI de backend/)
vercel.json         → build del frontend + rewrite /api/* → la función
requirements.txt    → deps Python de la función (en la raíz, Vercel las instala)
frontend/           → se compila a estático y se sirve como la web
```

Petición → respuesta:

```
navegador → Vercel (estático: frontend/dist)
          → /api/*  ──rewrite──▶  api/index.py  →  backend/main.py (FastAPI)
                                                     → nube de Zepp/Huami
```

## 1. Subir el repo a GitHub

```bash
git init && git add . && git commit -m "Helio Strap dashboard"
# crea el repo y haz push (gh repo create … o desde github.com)
```

## 2. Importar en Vercel

1. vercel.com → **Add New → Project** → importa el repo.
2. Framework preset: **Other** (Vercel ya lee `vercel.json`; no cambies build/output).
3. Antes de desplegar, añade las variables de entorno (siguiente paso).

## 3. Variables de entorno (Settings → Environment Variables)

| Variable | Valor | Para qué |
|---|---|---|
| `VITE_DATA_SOURCE` | `zepp` | **Build** — que el frontend use el backend, no demo |
| `ZEPP_APP_TOKEN` | tu token | Runtime — auth con Zepp (ver `backend/TOKEN.md`) |
| `ZEPP_USER_ID` | tu user id | Runtime |
| `ZEPP_API_HOST` | p. ej. `api-mifit.zepp.com` | Runtime — host regional (lo guarda `get_token`) |
| `TZ` | `America/Guatemala` | Runtime — para que las fechas locales cuadren en el servidor |
| `OPENAI_API_KEY` | tu clave | Opcional — activa el brief con IA; sin ella usa el resumen local |
| `OPENAI_MODEL` | tu modelo | Opcional — modelo del brief (default en el código) |
| `OPENAI_TIMEOUT_SECONDS` | `30` | Opcional — timeout de la llamada a OpenAI |
| `USER_NAME` | `Atleta` | Opcional — nombre en el saludo |
| `DEVICE_BATTERY` | _(vacío)_ | Opcional — Zepp NO expone la batería por API. Déjala sin definir y la UI muestra "—"; ponle un número solo si quieres forzar un valor fijo |
| `CACHE_TTL_SECONDS` | `900` | Opcional — caché (respeta rate-limit de Zepp) |

> Usa **token** (`ZEPP_APP_TOKEN`), no email/password: en serverless cada cold
> start logueándose dispara el rate-limit de Huami. El token + caché lo evita.
> Recuerda: el token caduca; si los datos dejan de actualizar, recáptluralo
> (proxy, ver `backend/TOKEN.md`).

> **Timeout de función:** `vercel.json` fija `maxDuration: 60` para la función
> porque `/api/snapshot` hace varias llamadas a Zepp y `/api/daily-brief` llama
> a OpenAI. En el plan Hobby el máximo es 60s (con Fluid Compute, activo por
> defecto). Si ves errores 504, sube el `CACHE_TTL` o revisa el timeout de OpenAI.

## 4. Proteger el acceso — Vercel Authentication

Son tus datos de salud: **no lo dejes público.**

Settings → **Deployment Protection** → **Vercel Authentication** → *Standard
Protection* (On). En el plan Hobby esto restringe el acceso a los miembros de tu
equipo de Vercel — o sea, solo tú, logueado en Vercel. Sin código extra.

## 5. Desplegar

**Deploy**. Cuando termine, abre la URL: te pedirá login de Vercel y luego verás
el dashboard con tus datos reales.

## Notas

- **Token caducado:** si tras un tiempo ves datos demo o errores, el `apptoken`
  expiró. Vuelve a capturarlo (`backend/TOKEN.md`) y actualiza la env var.
- **Host regional:** si las llamadas dan 401/404, tu cuenta puede estar en otra
  región. Ajusta `Session.api_host` en `backend/zepp/client.py` (p. ej.
  `api-mifit-us3.zepp.com`).
- **Métricas propietarias:** readiness/estrés/SpO₂/HRV/batería ya están cableadas;
  si alguna sale en 0, afinamos `event_value` en `backend/zepp/normalize.py` con
  una respuesta real (un ajuste de minutos).
