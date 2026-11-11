#!/usr/bin/env bash
# Re-render every diagram PNG next to its script.
# Needs Graphviz (`brew install graphviz`) and `pip install -r requirements.txt`.
set -euo pipefail
cd "$(dirname "$0")"
PYTHON="${PYTHON:-python3}"
"$PYTHON" system_overview.py
"$PYTHON" sync_pipeline.py
"$PYTHON" coach_pipeline.py
