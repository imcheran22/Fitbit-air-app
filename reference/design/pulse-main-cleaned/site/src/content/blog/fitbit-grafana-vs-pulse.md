---
title: "Fitbit dashboard on your own server: Grafana or Pulse"
description: "fitbit-grafana draws your raw Fitbit data in Grafana. Pulse computes scores like Recovery and Strain. What each needs, does and leaves out."
published: "2026-09-02"
updated: "2026-10-09"
checked: "2026-10-09"
tags: [fitbit, self-hosting, google-health]
keywords: ["fitbit grafana", "fitbit dashboard self hosted", "fitbit grafana google health api", "fitbit data on your own server", "fitbit dashboard desktop"]
---

Pick fitbit-grafana if you want to query your raw heart rate, sleep and steps and draw whatever charts you like. Pick Pulse if you want ready-made daily scores (Recovery, Strain, Sleep Performance) and don't want to build panels. Both run on your own hardware, both are free, and they are not rivals so much as two answers to different questions.

Pulse is made by the people who write this blog, so weigh this comparison accordingly. fitbit-grafana is described only from its README and repository, read on 9 October 2026.

## What fitbit-grafana is

[fitbit-grafana](https://github.com/arpanghosh8453/fitbit-grafana), by Arpan Ghosh, is a Python tool that pulls data from the Fitbit API, stores it in InfluxDB and shows it in Grafana. It is the obvious answer to "fitbit grafana" searches, and for good reason: it has about 930 stars on GitHub, a prebuilt dashboard you can import, automatic daily fetching with token refresh, and a historical backfill that respects rate limits.

According to its README, the dashboard covers:

- heart rate, including intraday samples
- hourly steps as a heatmap, plus daily steps
- sleep data and patterns, and a sleep regularity heatmap
- SpO2, breathing rate and HRV
- activity minutes and device battery

You run it with Docker (or plain Python), and you need InfluxDB (1.11 recommended; 2.x has limited support and 3.x is experimental, per the README) and Grafana, plus a Grafana plugin for the heatmaps. The licence is BSD-4-Clause.

### What happened after the Fitbit Web API shutdown

This is the question most people have now. Google's migration page says the legacy Fitbit Web API was due to be turned off on 30 October 2026, with Google Health API as its replacement. A tool built on the old API had to change.

fitbit-grafana has. Its README says the project "now supports a Google provider mode and OAuth token flow for migration", and tells new installs to follow its Google migration guide and use Google credentials rather than creating a legacy Fitbit app. The switch is mostly an environment variable (`HEALTH_API_PROVIDER=google`) plus a Google Cloud client ID and secret. GitHub shows the repository as not archived, with 13 open issues, a last push on 30 July 2026 and a metadata update on 8 October 2026.

The Google mode has not been run here, and the README doesn't say which metrics it supports under Google or whether intraday data survives the move. Its migration guide is where that lives. Read it before you commit an evening.

## What Pulse is

[Pulse](/) is a free, open-source web app (PolyForm Noncommercial licence) that you host yourself, also in Docker, with a Postgres database. It reads your data through the Google Health API and computes its own scores. It doesn't draw your raw data in a query-it-yourself way; it shows finished screens.

Its scores include a 0-100% [Recovery](/metrics/recovery/), a 0-21 [Strain](/metrics/strain/), [Sleep Performance](/metrics/sleep-performance/) and a [Pulse Age](/metrics/pulse-age/), and the methods are documented rather than hidden. It is built and tested with a Fitbit Air only. Pixel Watch and other Fitbits send the same data types to Google Health, but they have not been tried.

```sketch
{"kind": "compare", "alt": "Data path of fitbit-grafana compared with the data path of Pulse", "columns": [{"title": "fitbit-grafana", "tone": "blue", "items": ["Fitbit or Google Health API", "Stored in InfluxDB", "Drawn in Grafana panels", "You build the scores"]}, {"title": "Pulse", "tone": "teal", "items": ["Google Health API", "Stored in Postgres", "Pulse's own app screens", "Scores are built in"]}], "caption": "From each project's README and docs."}
```

## Side by side

| | fitbit-grafana | Pulse |
|---|---|---|
| What you get | Your raw metrics in Grafana panels | Computed scores and finished screens |
| Storage | InfluxDB | Postgres |
| Display | Grafana (customisable, any panel you want) | Pulse's own app screens |
| Data source | Fitbit API, or Google Health API in Google mode | Google Health API |
| Needs | Docker, InfluxDB, Grafana, API credentials | Docker, a Google Cloud project and OAuth client |
| Tested on | No device list in the README | Fitbit Air only |
| Licence | BSD-4-Clause | PolyForm Noncommercial 1.0.0 |
| Scores like Recovery | You build them | Built in |

The last row is the real difference. Grafana is a charting layer: it will happily show your HRV every night, but "is today a good day to train hard?" is a question you would have to answer by writing queries and thresholds yourself. That is a feature if you enjoy it, and a chore if you don't.

## Where each one is better

fitbit-grafana is better when:

- you already run Grafana and InfluxDB for other things (a home lab, say) and want Fitbit in the same place
- you want intraday heart rate on a zoomable timeline, or any chart nobody has built yet
- you'd like to write your own alerts, such as a notification when resting heart rate is five beats above its average for three days
- you want to keep the Fitbit data next to other sources

Pulse is better when:

- you want a morning number and a strain target without designing them
- you want to open it on your phone and read it in ten seconds
- you'd rather read one documented method per score than assemble one from panels
- you don't already run a time-series database

If you like tinkering, nothing stops you running both against the same account, each with its own OAuth client.

## What building Recovery in Grafana would take

It's worth being concrete, because this is the gap people underestimate. A recovery-style score needs a personal baseline for each input (a running average of your recent nights), a way to measure how far last night sits from it in units of your own normal swing, and a weighting between HRV, resting heart rate and sleep. None of that is hard to write down. All of it is awkward to express as InfluxQL or Flux queries, and you then have to keep it right as the data changes.

```sketch
{"kind": "flow", "alt": "The three pieces you would have to write to build a recovery-style score in Grafana", "inputs": ["A personal baseline per input", "Distance from it in your own swing", "A weighting of HRV, resting HR, sleep"], "output": "A recovery-style score", "caption": "What you would write as queries and thresholds."}
```

Pulse's version is written out on the [Recovery page](/metrics/recovery/), so you could copy the idea into Grafana if you wanted to. Going the other way, Grafana's strength is that you can ask a question nobody has built a screen for.

## The Google Cloud part is the same for both

Whichever you pick, Google mode means the same prerequisite: a Google Cloud project with the Google Health API enabled and an OAuth client you own. Google caps an unverified app at 100 users, which is irrelevant for one person at home. The scopes, the seven-day refresh-token expiry in Testing mode and the other traps are covered in [Google Health API for self-hosters](/blog/google-health-api-for-self-hosters/). Pulse's own [setup guide](https://github.com/adityaongit/pulse/blob/main/docs/setup.md) walks through the whole click-through, and fitbit-grafana has its own in `extra/google-migration.md`.

If you only want the raw numbers and no server at all, [exporting your Fitbit data](/blog/export-fitbit-data/) gets you files you can open in a spreadsheet.

## Sources

1. [fitbit-grafana on GitHub (README and repository)](https://github.com/arpanghosh8453/fitbit-grafana)
2. [Google Health API migration guide](https://developers.google.com/health/migration)
3. [Google Health API setup](https://developers.google.com/health/setup)
4. [Pulse setup guide](https://github.com/adityaongit/pulse/blob/main/docs/setup.md)
