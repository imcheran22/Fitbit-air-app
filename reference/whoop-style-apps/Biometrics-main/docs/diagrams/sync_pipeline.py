"""README §2/§4: how wearable data becomes scores and habit patterns."""

from diagrams import Diagram
from diagrams.onprem.database import Postgresql
from diagrams.onprem.inmemory import Redis

from style import (BLUE, EDGE_ATTR, HERE, INDIGO, NODE_ATTR, PURPLE, SLATE, TEAL,
                   flow, graph_attr, group, icon)

with Diagram(
    "Health data sync & scoring",
    filename=str(HERE / "sync-pipeline"),
    show=False,
    direction="LR",
    graph_attr=graph_attr(),
    node_attr=NODE_ATTR,
    edge_attr=EDGE_ATTR,
):
    fitbit = icon("Fitbit", "fitbit")

    with group("Google Health API v4", BLUE):
        health = icon("health.googleapis.com\nsteps · sleep · HRV · RHR", "googlecloud")
        hooks = icon("Change notifications", "webhook")

    with group("Ingest", TEAL):
        callback = icon("GET /health/callback\ntokens AES-256-GCM", "lock")
        webhook = icon("POST /webhooks/health\nconstant-time secret", "webhook")

    queue = Redis("health-sync queue\nBullMQ · concurrency 5")

    with group("Sync jobs", TEAL):
        fetch = icon("fetch\none day · one metric", "download")
        backfill = icon("backfill · 30 days\nsteps history · 365 days", "history")
        refresh = icon("tokenRefreshSweep\nevery 10 min", "key")

    with group("Scheduled", SLATE):
        score_sweep = icon("scoreSweep\ndaily 03:30", "clock")
        habit_sweep = icon("habitCorrelationSweep\nMondays 05:00", "clock")
        digest = icon("coachWeeklyDigest\nMondays 08:00", "digest")
        retention = icon("coachRetentionSweep\ndaily 04:15", "trash")

    compute = icon("computeDailyScore\ndebounced 5 min", "heart")

    with group("Stat engine · scoreDay (config v3)", TEAL):
        clean = icon("Clean\n5-MAD outliers · EWMA impute", "filter")
        features = icon("Features\nsleep debt · efficiency", "layers")
        baseline = icon("Baseline\nEWMA N=30 · z-scores", "baseline")
        composite = icon("Composite\nlogistic, 50 = usual", "sigma")
        explain = icon("Explain\nwhat moved it · confidence", "list")

    with group("Habit engine", PURPLE):
        correlate = icon("Pearson r · effective n\nBH-FDR q < 0.10, |r| > 0.30", "scatter")
        lifecycle = icon("2 passes → CONFIRMED\n2 misses → RETIRED", "habit")

    summary_q = Redis("coach-summary queue")
    day_summary = icon("Day summary\n≤ 45 words, validated", "summary")

    with group("PostgreSQL · Prisma", SLATE):
        records = Postgresql("BiometricRecord\nSleepSession")
        intermediates = Postgresql("BaselineSnapshot\nUserDailyFeatures")
        scores = Postgresql("DailyScore")
        patterns = Postgresql("HabitCorrelation")
        summaries = Postgresql("CoachDaySummary · CoachDigest\nCoachConversation")

    fitbit >> flow("device sync", BLUE) >> health >> flow(color=BLUE) >> hooks
    hooks >> flow("per-user subscription", BLUE) >> webhook
    callback >> flow("on connect", TEAL) >> queue
    webhook >> flow("one job per interval", TEAL) >> queue

    queue >> flow(color=TEAL) >> [fetch, backfill, refresh]
    health >> flow("GET", BLUE, dir="back", style="dashed") >> fetch
    health >> flow(color=BLUE, dir="back", style="dashed") >> backfill

    fetch >> flow(color=SLATE) >> records
    backfill >> flow(color=SLATE) >> records
    fetch >> flow("new HRV / RHR / sleep", TEAL) >> compute
    score_sweep >> flow("missing or stale", TEAL) >> compute

    compute >> flow(color=TEAL) >> clean >> flow(color=TEAL) >> features
    features >> flow(color=TEAL) >> baseline >> flow(color=TEAL) >> composite
    composite >> flow(color=TEAL) >> explain
    baseline >> flow(color=SLATE) >> intermediates
    explain >> flow("Recovery · Sleep", TEAL, penwidth="2.2") >> scores

    habit_sweep >> flow(color=PURPLE) >> correlate >> flow(color=PURPLE) >> lifecycle
    lifecycle >> flow(color=PURPLE) >> patterns

    compute >> flow("today scored", INDIGO) >> summary_q >> flow(color=INDIGO) >> day_summary
    day_summary >> flow(color=INDIGO) >> summaries
    digest >> flow(color=INDIGO) >> summaries
    retention >> flow("delete after 90 days", SLATE, style="dashed") >> summaries
