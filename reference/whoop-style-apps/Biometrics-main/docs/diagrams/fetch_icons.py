"""Download the icons the diagrams use and rasterise them into icons/.

Brand marks come from Simple Icons, concept icons from Lucide. Each SVG is
recoloured and turned into a 256 px PNG with `rsvg-convert` (Homebrew:
`brew install librsvg`). The PNGs are committed, so this only needs to run
when an icon is added or recoloured.
"""

import pathlib
import re
import subprocess
import urllib.request

HERE = pathlib.Path(__file__).parent
OUT = HERE / "icons"

SIMPLE = "https://cdn.jsdelivr.net/npm/simple-icons@16.34.0/icons/{}.svg"
LUCIDE = "https://cdn.jsdelivr.net/npm/lucide-static@1.52.0/icons/{}.svg"

# App palette (mobile/src/theme.ts, light mode).
TEAL = "#0D9488"     # accent
INDIGO = "#4F46E5"   # coach
PURPLE = "#9333EA"   # sleep
ORANGE = "#EA580C"   # warnings
SLATE = "#334155"    # neutral
RED = "#DC2626"

# file name -> (source, slug, colour)
ICONS = {
    # Brands
    "ollama": (SIMPLE, "ollama", "#000000"),
    "claude": (SIMPLE, "claude", "#D97757"),
    "expo": (SIMPLE, "expo", "#000020"),
    "apple": (SIMPLE, "apple", "#000000"),
    "google": (SIMPLE, "google", "#4285F4"),
    "googlecloud": (SIMPLE, "googlecloud", "#4285F4"),
    "fitbit": (SIMPLE, "fitbit", "#00B0B9"),
    "prisma": (SIMPLE, "prisma", "#2D3748"),
    "resend": (SIMPLE, "resend", "#000000"),
    "betterauth": (SIMPLE, "betterauth", "#000000"),
    # Concepts
    "webhook": (LUCIDE, "webhook", TEAL),
    "key": (LUCIDE, "key-round", TEAL),
    "lock": (LUCIDE, "lock-keyhole", SLATE),
    "clock": (LUCIDE, "calendar-clock", SLATE),
    "cog": (LUCIDE, "cog", SLATE),
    "download": (LUCIDE, "cloud-download", TEAL),
    "history": (LUCIDE, "history", TEAL),
    "heart": (LUCIDE, "heart-pulse", TEAL),
    "filter": (LUCIDE, "filter", TEAL),
    "layers": (LUCIDE, "layers", TEAL),
    "baseline": (LUCIDE, "chart-spline", TEAL),
    "sigma": (LUCIDE, "sigma", TEAL),
    "list": (LUCIDE, "list-checks", TEAL),
    "scatter": (LUCIDE, "chart-scatter", PURPLE),
    "sparkles": (LUCIDE, "sparkles", INDIGO),
    "gauge": (LUCIDE, "gauge", INDIGO),
    "shield-alert": (LUCIDE, "shield-alert", RED),
    "lifebuoy": (LUCIDE, "life-buoy", RED),
    "route": (LUCIDE, "split", INDIGO),
    "clipboard": (LUCIDE, "clipboard-list", INDIGO),
    "prompt": (LUCIDE, "file-text", INDIGO),
    "shield-check": (LUCIDE, "shield-check", INDIGO),
    "radio": (LUCIDE, "radio", INDIGO),
    "card": (LUCIDE, "panels-top-left", INDIGO),
    "memory": (LUCIDE, "brain", INDIGO),
    "retry": (LUCIDE, "rotate-ccw", ORANGE),
    "alert": (LUCIDE, "circle-alert", ORANGE),
    "scissors": (LUCIDE, "scissors", ORANGE),
    "summary": (LUCIDE, "text-quote", INDIGO),
    "digest": (LUCIDE, "newspaper", INDIGO),
    "trash": (LUCIDE, "trash-2", SLATE),
    "bell": (LUCIDE, "bell", SLATE),
    "mail": (LUCIDE, "mail", SLATE),
    "user": (LUCIDE, "circle-user-round", SLATE),
    "habit": (LUCIDE, "calendar-check", PURPLE),
}


def fetch(source: str, slug: str, colour: str) -> str:
    with urllib.request.urlopen(source.format(slug)) as response:
        svg = response.read().decode()
    if source is LUCIDE:
        return svg.replace("currentColor", colour)
    # Simple Icons paths have no fill, so give the root one.
    return re.sub(r"<svg ", f'<svg fill="{colour}" ', svg, count=1)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for name, (source, slug, colour) in ICONS.items():
        svg = fetch(source, slug, colour)
        subprocess.run(
            ["rsvg-convert", "-w", "256", "-h", "256", "-o", str(OUT / f"{name}.png")],
            input=svg.encode(),
            check=True,
        )
        print(f"icons/{name}.png")


if __name__ == "__main__":
    main()
