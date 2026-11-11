#!/usr/bin/env bash
# Arranca backend (Zepp) + frontend con UN solo comando.
# Uso:  ./start.sh     (o:  bash start.sh)
set -e
cd "$(dirname "$0")"

echo "→ Backend  : http://localhost:8000  (datos de Zepp)"
echo "→ Dashboard: http://localhost:5173"
echo

# Backend en segundo plano (usa el Python del venv, sin activar nada)
backend/.venv/bin/python -m uvicorn backend.main:app --port 8000 &
BACKEND_PID=$!

# Al cerrar (Ctrl+C), apaga también el backend
trap "echo; echo 'Apagando…'; kill $BACKEND_PID 2>/dev/null" EXIT INT TERM

# Frontend en primer plano (abre el navegador en localhost:5173)
npm --prefix frontend run dev
