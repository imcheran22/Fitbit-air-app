# Architecture diagrams

The diagrams in the main README are code, drawn with [mingrammer/diagrams](https://github.com/mingrammer/diagrams) (Python on top of Graphviz).

| Source | Output | Used in |
|---|---|---|
| `system_overview.py` | `system-overview.png` | README §1 System at a glance |
| `sync_pipeline.py` | `sync-pipeline.png` | README §2 End-to-end data flow |
| `coach_pipeline.py` | `coach-pipeline.png` | README §8 AI coach |

`style.py` holds the shared look: fonts, the app palette from `mobile/src/theme.ts`, tinted clusters and the `icon()` / `flow()` helpers.

## Re-rendering

```sh
brew install graphviz
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
PYTHON=.venv/bin/python ./render.sh
```

Each script writes its PNG next to itself. Commit the PNGs with the source change.

## Icons

Built-in `diagrams` icons cover Node, PostgreSQL and Redis. Everything else lives in `icons/` as 256 px PNGs: brand marks from [Simple Icons](https://simpleicons.org) and concept icons from [Lucide](https://lucide.dev), recoloured to the app palette. To add or recolour one, edit `ICONS` in `fetch_icons.py` and run it (needs `brew install librsvg`).
