"""README §8: how one coach question is answered."""

from diagrams import Diagram
from diagrams.onprem.database import Postgresql

from style import (EDGE_ATTR, HERE, INDIGO, NODE_ATTR, ORANGE, RED, SLATE, TEAL,
                   flow, graph_attr, group, icon)

with Diagram(
    "AI coach · one question, one pass",
    filename=str(HERE / "coach-pipeline"),
    show=False,
    direction="LR",
    graph_attr=graph_attr(),
    node_attr=NODE_ATTR,
    edge_attr=EDGE_ATTR,
):
    app = icon("Coach tab\nPOST /me/coach/message", "expo")

    with group("Gate", RED):
        guard = icon("Turn guard\n1 in flight · 15 per 5 min", "gauge")
        crisis = icon("Crisis classifier", "shield-alert")
        safety = icon("Fixed safety reply\n988 · Crisis Text Line", "lifebuoy")

    with group("Prepare", INDIGO):
        route = icon("Route\ntoday · sleep · trends · general", "route")
        facts = icon("Fact sheet\nlabelled facts with ids", "clipboard")
        prompt = icon("One system prompt\ncoach voice · facts · rules", "prompt")

    pg = Postgresql("Scores · baselines · habits · memory\nsame readers as the screens")

    with group("One streamed model call", INDIGO):
        ollama = icon("Ollama (default)\nqwen3.6:35b · 45 s", "ollama")
        claude = icon("Claude (opt-in)\nclaude-opus-5-5 · 30 s", "claude")

    with group("Validate each sentence", INDIGO):
        validator = icon("Numbers on the fact sheet?\nno diagnosis · dosing · supplements", "shield-check")
        drop = icon("Drop the sentence", "scissors")

    with group("Stream to the app · SSE", TEAL):
        text = icon("text events", "radio")
        card = icon("Answer card\nvalues filled by the server", "card")
        memory = icon("Memory chip\nconfirm or dismiss", "memory")

    with group("Nothing valid", ORANGE):
        retry = icon("Retry once", "retry")
        error = icon("Error card", "alert")

    app >> flow(color=SLATE) >> guard >> flow(color=SLATE) >> crisis
    crisis >> flow("match", RED) >> safety
    crisis >> flow("no", INDIGO) >> route >> flow(color=INDIGO) >> facts
    pg >> flow(color=SLATE) >> facts
    facts >> flow(color=INDIGO) >> prompt

    prompt >> flow(color=INDIGO, penwidth="2.2") >> ollama
    prompt >> flow("hosted consent", INDIGO, style="dashed") >> claude
    claude >> flow("no text in 10 s → answer locally", ORANGE, style="dashed") >> ollama

    ollama >> flow(color=INDIGO, penwidth="2.2") >> validator
    claude >> flow(color=INDIGO) >> validator
    validator >> flow("pass", TEAL, penwidth="2.2") >> text
    validator >> flow("fail", ORANGE) >> drop
    text >> flow("```card", TEAL) >> card
    text >> flow("```memory", TEAL) >> memory
    drop >> flow("nothing left", ORANGE) >> retry >> flow("still nothing", ORANGE) >> error
