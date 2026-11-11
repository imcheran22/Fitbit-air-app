# Zepp Alternative Dashboard

An **open-source, WHOOP-style dashboard for your Amazfit / Zepp data** — no monthly
subscription. It pulls your sleep, recovery, stress, heart rate and training data
from the Zepp cloud and turns it into a glanceable dashboard with **AI-powered daily
recommendations** on what to do next.

Built for the **Amazfit Helio Strap**, but works with any device that syncs to the
Zepp / Huami cloud.

- 🟢 **Recovery · Strain · Sleep** hero triad, WHOOP-style
- 🧠 **AI morning brief** — daily recommendation from your own metrics (OpenAI optional; falls back to a local summary)
- ❤️ Real heart-rate curve, sleep stages, hourly steps, workouts, 7-day trends
- 🔒 **Your data, your server** — self-hosted, optional password protection
- 🌗 Bilingual UI (ES / EN)

> **Try it with zero setup:** the frontend ships a **demo mode** with synthetic data —
> no device, token or backend required. See [Run it](#run-it).

```
┌──────────┐   BLE    ┌──────────┐  cloud   ┌──────────────┐  /api   ┌─────────────┐
│  Helio   │ ───────▶ │ Zepp app │ ───────▶ │ Huami cloud  │ ──────▶ │ Python      │
│  Strap   │          │ (mobile) │          │ (api-mifit)  │         │ backend     │
└──────────┘          └──────────┘          └──────────────┘         └──────┬──────┘
                                                                            │ JSON
                                                                            ▼
                                                                     ┌─────────────┐
                                                                     │ React UI    │
                                                                     │ (this repo) │
                                                                     └─────────────┘
```

> The Helio Strap **can't** be read over Bluetooth from the browser (its BLE is
> proprietary and encrypted). The realistic path is the **Zepp / Huami cloud**, via
> the unofficial API documented by the community. See `backend/`.

## Stack

| Folder | What it is |
|---|---|
| `frontend/` | Vite + React + TypeScript + Tailwind v4. The dashboard UI. |
| `backend/`  | Python (FastAPI) API that talks to the Zepp cloud and normalizes the data. |

The contract between them is a single model, `HealthSnapshot` (defined in
`frontend/src/types.ts` and produced by `backend/zepp/normalize.py`). The UI doesn't
know where the data comes from — it only consumes that model.

## Run it

### 1. Frontend (demo mode, no backend)

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Starts with synthetic data (`VITE_DATA_SOURCE=demo` in `frontend/.env`). Great for
trying the UI instantly.

### 2. Backend (real Zepp data)

Run it **from the repo root** (the app is the `backend.main` package, same as on
Vercel):

```bash
python3 -m venv backend/.venv && source backend/.venv/bin/activate
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env   # fill token/credentials (see backend/TOKEN.md)
uvicorn backend.main:app --port 8000
```

Then set `frontend/.env` to `VITE_DATA_SOURCE=zepp` and restart the frontend. Vite
already proxies `/api → localhost:8000`. Without credentials, the backend still
serves demo data.

### 3. AI daily brief (optional)

The **AI morning brief** generates automatically after 8:00 AM, or manually with the
panel's refresh button. Set `OPENAI_API_KEY` in `backend/.env` to use OpenAI; without
it, it falls back to a local summary. Output respects the ES/EN toggle and is forced
to a structured JSON schema.

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini
OPENAI_TIMEOUT_SECONDS=30
```

Never put the key in `frontend/.env` or in files that go to GitHub.

### 4. Password protection (optional)

Set `SITE_PASSWORD` (in `backend/.env` locally, or in Vercel env vars) and the data
endpoints require it — the UI shows a login screen. Leave it empty and the dashboard
is open (fine for demo/local). **These are your health metrics: don't leave a real
deployment public without it.**

### 5. Deploy to Vercel

Everything is wired (`vercel.json`, `api/index.py`, root `requirements.txt`). Steps
and environment variables in **[DEPLOY.md](DEPLOY.md)**.

## Notes

- **What works reliably:** steps, sleep, calories, heart rate. Proprietary Zepp
  metrics (readiness, hybrid charge, stress, SpO₂, HRV) come from separate cloud
  endpoints; some are derived transparently when missing.
- **Battery is not exposed** by the Zepp cloud API, so the UI shows "—" unless you set
  a fixed value via `DEVICE_BATTERY`.

## Disclaimer

The Zepp / Huami cloud API is **unofficial**: it can change without notice and its use
is a gray area under Zepp's terms. Intended for personal use with your own data. This
is not a medical device and gives no medical advice.
