"""Shared look for every diagram: fonts, palette, cluster styles, icon helper."""

import pathlib

from diagrams import Cluster, Edge
from diagrams.custom import Custom

HERE = pathlib.Path(__file__).parent
ICONS = HERE / "icons"

FONT = "Helvetica Neue"
INK = "#0F172A"
MUTED = "#64748B"
LINE = "#94A3B8"

TEAL = "#0D9488"
INDIGO = "#4F46E5"
PURPLE = "#9333EA"
ORANGE = "#EA580C"
RED = "#DC2626"
SLATE = "#475569"
BLUE = "#2563EB"


def graph_attr(**overrides):
    attrs = {
        "fontname": f"{FONT} Medium",
        "fontsize": "30",
        "fontcolor": INK,
        "labelloc": "t",
        "pad": "0.7",
        "nodesep": "0.65",
        "ranksep": "1.0",
        "bgcolor": "white",
        "dpi": "144",
        "splines": "spline",
        "compound": "true",
    }
    attrs.update(overrides)
    return attrs


NODE_ATTR = {
    "fontname": FONT,
    "fontsize": "13",
    "fontcolor": INK,
}

EDGE_ATTR = {
    "color": LINE,
    "penwidth": "1.6",
    "arrowsize": "0.8",
    "fontname": FONT,
    "fontsize": "11",
    "fontcolor": SLATE,
}

# Soft tints for cluster fills, keyed by the accent they go with.
_TINTS = {
    TEAL: "#F0FDFA",
    INDIGO: "#EEF2FF",
    PURPLE: "#FAF5FF",
    ORANGE: "#FFF7ED",
    RED: "#FEF2F2",
    SLATE: "#F8FAFC",
    BLUE: "#EFF6FF",
}


def group(label, accent=SLATE, **overrides):
    """A rounded, tinted cluster titled in its accent colour."""
    attrs = {
        "style": "rounded,filled",
        "fillcolor": _TINTS[accent],
        "pencolor": accent,
        "penwidth": "1.4",
        "fontname": f"{FONT} Medium",
        "fontsize": "15",
        "fontcolor": accent,
        "labeljust": "l",
        "margin": "20",
    }
    attrs.update(overrides)
    return Cluster(label, graph_attr=attrs)


def icon(label, name, **attrs):
    return Custom(label, str(ICONS / f"{name}.png"), **attrs)


def flow(label="", color=LINE, style="solid", **attrs):
    return Edge(label=f" {label} " if label else "", color=color, style=style, **attrs)
