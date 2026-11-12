---
title: "Open-source WHOOP alternatives: what exists in 2026"
description: "A survey of open-source and source-available projects that stand in for a WHOOP subscription: licences, supported devices and activity, checked October 2026."
published: "2026-09-15"
updated: "2026-10-09"
checked: "2026-10-09"
tags: [whoop, self-hosting, data-export]
keywords: ["whoop open source", "whoop alternative github", "open source whoop alternative", "whoop no subscription github", "self hosted fitness tracker dashboard"]
---

There is no single open-source WHOOP replacement, but there are real projects in three groups: apps that talk to a WHOOP strap without WHOOP's cloud, dashboards for Fitbit or Google Health data, and general wearable tools such as Gadgetbridge. Licences differ a lot, and "open source" is used loosely. Each repository was checked on 9 October 2026.

```sketch
{"kind": "compare", "alt": "The three groups of projects: WHOOP strap apps, Fitbit and Google Health dashboards, and general wearable tools.", "columns": [{"title": "WHOOP strap apps", "items": ["noop", "OpenStrap edge", "Goose (not verified)"]}, {"title": "Fitbit and Google Health", "items": ["fitbit-grafana", "Hælan"], "tone": "blue"}, {"title": "General wearable tools", "items": ["Gadgetbridge"], "tone": "teal"}]}
```

## What "open source" means here

Strictly, open source means an OSI-approved licence such as MIT or AGPL. Some projects below use a source-available licence (you can read and run the code, but commercial use is restricted). Each project below is labelled. Stars and dates are from GitHub's repository data on the check date and will move.

```sketch
{"kind": "compare", "alt": "OSI-approved licences compared with the source-available PolyForm Noncommercial licence.", "columns": [{"title": "OSI-approved", "items": ["OpenStrap edge: MIT", "Hælan: AGPL-3.0-only", "Gadgetbridge: AGPLv3"], "tone": "green"}, {"title": "Source-available", "items": ["noop: PolyForm Noncommercial", "Pulse: PolyForm Noncommercial", "Read and run the code", "Commercial use restricted"], "tone": "orange"}], "caption": "Licences as stated in this post."}
```

## Group 1: apps for a WHOOP strap

These projects exist because people own a WHOOP band and do not want, or can no longer pay for, the membership. The catch is legal and practical: a netzwelt report says WHOOP's terms of use forbid reverse engineering, and these apps work by decoding the strap's Bluetooth protocol. European law allows some interoperability reverse engineering, but this is not legal advice, and you should read your own terms before you use any of them. Accuracy is also unproven; the projects say so themselves.

### noop (ryanbr/noop)

An offline companion for WHOOP straps for macOS, Android and iOS. It pairs over Bluetooth, keeps data in local SQLite and computes recovery, strain, HRV and sleep on the device.

- **Licence:** PolyForm Noncommercial 1.0.0, which the README calls source-available. GitHub shows its licence as unrecognised.
- **Devices:** WHOOP 4.0 is the tested path. On WHOOP 5.0 and MG, live heart rate works but deeper metrics were still being mapped. Oura Ring support is described as experimental.
- **Activity:** about 1,400 stars, 3,200-plus commits, last push 9 October 2026, 374 open issues. The README says it is a fork of another repository, and there are other repositories with the same name, including app-noop/noop (MIT, a handful of stars, for Windows and Mac). Check which one you are installing and its licence.

### OpenStrap edge

Described as an app that makes a WHOOP 4.0 useful without a membership, with processing on the phone and no cloud backend. Its analytics are written from published research, and the README warns not to expect numbers identical to WHOOP's.

- **Licence:** MIT.
- **Devices:** WHOOP 4.0 only.
- **Activity:** the OpenStrap/edge repository has about 680 stars and was last pushed on 6 October 2026.

### Goose

Android Authority reported in June 2026 on an open-source app called Goose that reads WHOOP data without a subscription, calling it more a proof of concept than a finished product. German coverage said it worked on iPhone with the WHOOP 5.0 and lacked WHOOP's algorithms. Its repository could not be found or verified, so there is no licence or activity to report.

## Group 2: dashboards for Fitbit and Google Health data

These do not need a WHOOP at all. They take data from the Fitbit or Google ecosystem and show it on your own server.

### fitbit-grafana (arpanghosh8453/fitbit-grafana)

A script that pulls Fitbit's API data into a local InfluxDB database and visualises it in Grafana. It gives you charts, not scores.

- **Licence:** GitHub lists BSD-4-Clause.
- **Devices:** anything that reports to the Fitbit account API.
- **Activity:** about 930 stars, last push 30 July 2026, not archived. Check the project's notes on which Fitbit API it uses before relying on it.

There is a longer comparison in [a Fitbit dashboard on your own server: Grafana vs Pulse](/blog/fitbit-grafana-vs-pulse/).

### Hælan (bardesss/haelan)

A self-hosted dashboard and local mirror for a household's Google Health data: one SQLite file, one container, no telemetry. It is read-only in version 1. An Android companion app reads Health Connect and needs no Google Cloud project. The README says it was written by a coding agent, which you may or may not care about.

- **Licence:** AGPL-3.0-only.
- **Devices:** the page has no formal list; it follows what Google Health and Health Connect expose.
- **Activity:** 40 stars, about 450 commits, last push 9 October 2026. It is young.

## Group 3: general wearable tools

### Gadgetbridge

A long-running Android app that replaces the vendor's cloud app for many wearables, keeping data on the phone.

- **Licence:** AGPLv3, with some bundled files under other licences.
- **Devices:** the repository tags include Amazfit, Garmin, Mi Band, Pebble, Huawei, Fossil, Casio and Bangle.js. Fitbit is not named on the page that was read; the full device list is on its site.
- **Activity:** the latest commit seen was 9 October 2026.

It stores and shows data; it is not designed to compute a WHOOP-like Recovery score.

## Pulse

Pulse is a self-hosted web app for Google Health data that computes its own Recovery, Strain, Sleep Performance, Pulse Age and a dozen more scores, with every formula published in the app and repository ([how Recovery works](/metrics/recovery/)). It runs in Docker and needs your own Google Cloud OAuth client.

Its licence is PolyForm Noncommercial 1.0.0. That is source-available, not OSI open source: you can read, run and modify it for noncommercial use, but you cannot use it commercially. It has been built and tested with the Fitbit Air only; other devices that sync to Google Health send the same data types but have not been tested. It does not touch WHOOP hardware or WHOOP's service.

Related: [Pulse against subscription wearables](/compare/pulse-vs-subscription-wearables/).

## Which to pick

| You have | Look at |
|---|---|
| A WHOOP 4.0 and no membership | noop or OpenStrap edge, accepting the terms-of-use question and unproven accuracy |
| A Fitbit and want charts | fitbit-grafana |
| A Fitbit Air or other Google Health data and want scores | Pulse, or Hælan for a plain dashboard |
| An Amazfit, Garmin or Mi Band | Gadgetbridge |

All of these are maintained by individuals, so expect rough edges. Look at the issue tracker before you commit.

WHOOP is a trademark of WHOOP, Inc. Pulse is not affiliated with or endorsed by WHOOP.

## Sources

1. [ryanbr/noop on GitHub](https://github.com/ryanbr/noop)
2. [app-noop/noop on GitHub](https://github.com/app-noop/noop)
3. [OpenStrap/edge on GitHub](https://github.com/OpenStrap/edge)
4. [Android Authority, open source WHOOP app Goose](https://www.androidauthority.com/open-source-whoop-app-3673542/)
5. [netzwelt, WHOOP band free use](https://www.netzwelt.de/news/254710-whoop-band-kostenlos-nutzen-vorsicht-spar-trick-umstritten.html)
6. [arpanghosh8453/fitbit-grafana on GitHub](https://github.com/arpanghosh8453/fitbit-grafana)
7. [bardesss/haelan on GitHub](https://github.com/bardesss/haelan)
8. [Gadgetbridge on Codeberg](https://codeberg.org/Freeyourgadget/Gadgetbridge)
9. [PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/)
