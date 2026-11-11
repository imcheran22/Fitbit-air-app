"""README §1: the whole system at a glance."""

from diagrams import Diagram
from diagrams.onprem.database import Postgresql
from diagrams.onprem.inmemory import Redis
from diagrams.programming.language import Nodejs

from style import (BLUE, EDGE_ATTR, HERE, INDIGO, NODE_ATTR, ORANGE, PURPLE, SLATE, TEAL,
                   flow, graph_attr, group, icon)

with Diagram(
    "Biometrics · system at a glance",
    filename=str(HERE / "system-overview"),
    show=False,
    direction="LR",
    graph_attr=graph_attr(),
    node_attr=NODE_ATTR,
    edge_attr=EDGE_ATTR,
):
    with group("iPhone · Expo / React Native", SLATE):
        app = icon("Biometrics app\nHome · Activity · Coach\nMetrics · Profile", "expo")

    with group("Sign-in", SLATE):
        apple = icon("Sign in with Apple", "apple")
        gsi = icon("Google Sign-In", "google")

    fitbit = icon("Fitbit", "fitbit")

    with group("Google Cloud", BLUE):
        oauth = icon("OAuth 2.0\nread-only Health scopes", "google")
        health = icon("Health API v4\nsteps · sleep · HRV · RHR", "googlecloud")
        hooks = icon("Health webhooks", "webhook")

    with group("Backend · Node 24 / Express 5", TEAL):
        with group("HTTP", TEAL):
            api = Nodejs("REST API\n/auth · /health · /me/*")
            auth = icon("Better Auth\n30-day DB sessions", "betterauth")
        with group("Background work · BullMQ", TEAL):
            rd = Redis("Redis\nqueues · OAuth state")
            sync = icon("health-sync worker\nsync · scores · habits · digest", "cog")
            summary = icon("coach-summary worker\nday summaries", "cog")
        with group("Analytics", PURPLE):
            stats = icon("Stat engine\nRecovery · Sleep scores", "heart")
            habits = icon("Habit correlation\nweekly, BH-FDR", "scatter")
        with group("AI coach", INDIGO):
            coach = icon("Answer pipeline\nfacts → one call → validator", "sparkles")

    pg = Postgresql("PostgreSQL 16\nPrisma 6")

    with group("Language models", INDIGO):
        ollama = icon("Ollama (local)\nqwen3.6:35b", "ollama")
        claude = icon("Anthropic API · opt-in\nclaude-opus-5-5", "claude")

    with group("Notifications", ORANGE):
        push = icon("Expo push\nweekly digest", "bell")
        mail = icon("Resend\nverify · reset email", "resend")

    app >> flow("REST + session cookie · SSE", TEAL, penwidth="2.2") >> api
    apple >> flow("ID token", style="dashed", dir="back") >> app
    gsi >> flow("ID token", style="dashed", dir="back") >> app
    app >> flow("consent in browser", BLUE) >> oauth
    oauth >> flow("callback + code", BLUE) >> api
    fitbit >> flow("device sync", BLUE) >> health
    health >> flow(color=BLUE) >> hooks
    hooks >> flow("POST /webhooks/health", BLUE) >> api

    api - flow() - auth
    api >> flow("enqueue", TEAL) >> rd
    rd >> flow(color=TEAL) >> sync
    rd >> flow(color=TEAL) >> summary
    health >> flow("fetch · backfill", BLUE, dir="back") >> sync
    sync >> flow(color=PURPLE) >> stats
    sync >> flow(color=PURPLE) >> habits
    stats >> flow(color=PURPLE) >> pg
    habits >> flow(color=PURPLE) >> pg
    api >> flow("all app reads", SLATE, style="dotted") >> pg

    api >> flow("POST /me/coach/message", INDIGO) >> coach
    summary >> flow(color=INDIGO) >> coach
    coach >> flow("reads facts", INDIGO, constraint="false") >> pg
    coach >> flow("/api/chat · loopback", INDIGO, penwidth="2.2") >> ollama
    coach >> flow("opt-in per user", INDIGO, style="dashed") >> claude

    sync >> flow("weekly digest", ORANGE) >> push
    api >> flow("verify · reset", ORANGE) >> mail
