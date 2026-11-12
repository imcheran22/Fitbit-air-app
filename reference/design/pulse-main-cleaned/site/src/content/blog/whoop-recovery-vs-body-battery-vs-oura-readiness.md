---
title: "Why WHOOP, Garmin and Oura scores disagree"
description: "WHOOP Recovery, Garmin Body Battery and Oura Readiness can tell you different things on the same morning. Why, and how to read them side by side."
published: "2026-09-19"
updated: "2026-10-09"
checked: "2026-10-09"
tags: [whoop, garmin, oura]
keywords: ["whoop recovery vs body battery", "whoop recovery vs oura readiness", "garmin body battery vs whoop recovery", "why do my recovery scores disagree"]
---

They are three different questions. WHOOP Recovery and Oura Readiness each give one score a day, worked out when you wake. Garmin's Body Battery is a gauge that moves all day, filling in rest and draining with stress and activity. The inputs overlap (HRV, resting heart rate, sleep), but none of the three publishes a formula, so no one can say which is more accurate.

For every brand's published inputs in one table, Google Health, Samsung and Apple included, see [how each brand builds its recovery score](/compare/recovery-scores/).

That last point matters more than it sounds. The table below is a list of what each company says goes in, not a ranking. Where a company has not published something, this says so.

## The inputs, side by side

Everything here is from each vendor's own pages or manuals, read on 9 October 2026. WHOOP's site refused automated fetching, so for WHOOP the quotes are search excerpts of its pages and its support content, and the places where its wording varies are marked.

| | WHOOP Recovery | Garmin Body Battery | Oura Readiness |
|---|---|---|---|
| What it is | A daily percentage, calculated on waking | A running energy reserve through the day | A daily score, calculated from the previous night and recent days |
| Scale | 1% to 100%; WHOOP's page shows yellow 34-66%, red 1-33% | 5 to 100 in newer manuals (0 to 100 in older ones) | 0 to 100 |
| Bands | Green, yellow, red | Newer manuals: 5-25 very low, 26-50 low, 51-75 medium, 76-100 high | 85+ Optimal, 70-84 Good, then Fair and Pay Attention below that |
| HRV | Yes, the heaviest input per WHOOP | Yes | Yes (HRV Balance) |
| Resting heart rate | Yes | Not listed as a separate input in the manual | Yes |
| Sleep | Yes (Sleep Performance) | Yes (sleep quality) | Yes (Sleep, Sleep Balance, Sleep Regularity) |
| Respiratory rate | Listed in WHOOP's Locker pages | Not listed | Not a listed contributor |
| Skin temperature | Appears in WHOOP's Health Monitor; older wording listed it | Not listed | Yes (Body Temperature) |
| Stress | Not listed as an input | Yes (stress level) | Not listed |
| Activity | Not listed as an input | Yes | Yes (Previous Day Activity, Activity Balance) |
| Formula and weights | Not published | Not published | Not published |

### WHOOP Recovery

WHOOP's pages describe Recovery as based on heart rate variability, resting heart rate and sleep, with respiratory rate added in its Locker explainer. The wording varies between pages: one WHOOP community answer lists only HRV, resting heart rate and sleep performance. Skin temperature and blood oxygen are described as part of Health Monitor, and an older version of the same page counted them in Recovery, so treat the current page as the one to trust.

A WHOOP podcast employee said the algorithm's biggest input is HRV, and that resting heart rate and sleep add little beyond it most of the time. That is one person on a podcast, not a published weighting. The measurements are taken during sleep, and the score is relative to you: it is a comparison against your own baseline, not against other people. WHOOP has said the first few days are a calibration period, but the baseline length could not be confirmed from WHOOP's own page.

### Garmin Body Battery

Garmin's current manuals describe it as a fuel gauge. The device analyses heart rate variability, stress level, sleep quality and activity data to set the level. Charging happens in rest and sleep; stress and activity drain it. The newer manuals use a 5 to 100 scale with four labelled bands; older manuals use 0 to 100 and different band names, so the number on your wrist and the number in a forum post may follow different tables.

Body Battery uses an algorithm from Firstbeat Analytics, which Garmin acquired in 2020, and a Firstbeat representative has said it rests mainly on HRV analysis, the same analysis behind Garmin's all-day stress. Again, that's an interview, and the weights aren't published.

The nearest thing Garmin has to a morning score is a different feature: Training Readiness, 1 to 100, built from six inputs. Garmin's manual lists the previous night's sleep score, recovery time, HRV status, acute load, sleep history over three nights and stress history over three days. Its bands are Prime (95-100), High (75-94), Moderate (50-74), Low (25-49) and Poor (1-24). If your question is "why is my Garmin readiness always low?", see [Garmin Training Readiness always low](/blog/garmin-training-readiness-always-low/).

### Oura Readiness

Oura is the most open of the three about its parts. Its Readiness contributors are nine: Sleep, Sleep Balance, Sleep Regularity, Previous Day Activity, Activity Balance, Resting Heart Rate, HRV Balance, Body Temperature and Recovery Index. The balance contributors compare a recent window (Oura's support page gives a 14-day weighted average for activity) with a longer baseline of about two months. Oura doesn't publish how the nine combine.

```sketch
{"kind": "flow", "alt": "The nine Oura Readiness contributors feed one score, with no published weights", "inputs": ["Sleep", "Sleep Balance", "Sleep Regularity", "Previous Day Activity", "Activity Balance", "Resting Heart Rate", "HRV Balance", "Body Temperature", "Recovery Index"], "output": "Readiness", "note": "0 to 100, weights not published", "caption": "Contributors from Oura's support page."}
```

Oura's own pages disagree slightly on the lower bands: its blog gives "Pay attention" as below 70, while its support page splits that into Fair (60-69) and Pay Attention (0-59).

## What the differences mean in practice

**Time of day.** Body Battery changes while you watch. WHOOP Recovery and Oura Readiness don't: they settle once and sit there. If a score of 80 at 7am and 35 at 6pm feels odd, that's Body Battery working as designed. A Body Battery at wake-up is the closest thing to a recovery reading, but it isn't the same thing. For more on that, see [does the Fitbit Air have Body Battery](/blog/fitbit-air-body-battery/).

```sketch
{"kind": "compare", "alt": "Recovery and Readiness settle once a day while Body Battery moves all day", "columns": [{"title": "WHOOP Recovery, Oura Readiness", "tone": "blue", "items": ["One score a day", "Settles once, when you wake", "Sits there until tomorrow"]}, {"title": "Garmin Body Battery", "tone": "green", "items": ["A gauge that moves all day", "Fills in rest and sleep", "Drains with stress and activity"]}], "caption": "From each vendor's pages and manuals."}
```

**What counts as "ready".** Oura includes yesterday's activity and your sleep regularity over two weeks. WHOOP's Recovery, per its pages, comes from what your body did overnight, plus sleep. Body Battery includes the stress and activity you have had since waking, because it runs continuously. Yesterday's workout is a named Oura input, but it isn't in the lists WHOOP publishes for Recovery.

**Scale shape.** WHOOP's yellow runs from 34 to 66, a wide middle. Oura puts 70 and up in "Good". A "good" number on one isn't a good number on another, and these scales are not interchangeable.

**What can't be compared.** Because none of the three publishes a formula, you can't say that 72% on one equals 72 on another. Each is best read against your own history. If you want the fuller picture for WHOOP alone, [what a WHOOP recovery score measures](/blog/whoop-recovery-score-explained/) goes deeper.

## If you use none of these

If you'd like a 0-100% morning figure and a separate energy gauge built from your Google Health data, Pulse, a free app you host yourself, computes [Recovery](/metrics/recovery/) and [Energy Bank](/metrics/energy-bank/) and publishes how. Its Recovery uses HRV (55% of the weight), resting heart rate (20%), Sleep Performance (15%), respiratory rate (5%) and skin temperature (5%), each against your own baseline. It is built and tested with a Fitbit Air only, and it needs Docker and your own Google Cloud project.

## Sources

1. [Garmin owner's manual: Body Battery (2026 revision)](https://www8.garmin.com/manuals/webhelp/GUID-D3BE589F-1A6C-4B6F-9ABC-07DB9AA6C739/EN-US/GUID-E944BD19-189D-4477-B72D-58A0B28BEE1E.html)
2. [Garmin owner's manual: Training Readiness](https://www8.garmin.com/manuals/webhelp/GUID-31D23DBB-57C2-4DF7-A0C9-8D1A00AB4BE7/EN-US/GUID-C21BE0C8-A08E-4DA1-B6C6-2E0E2DDDB372.html)
3. [Oura: Readiness Score](https://ouraring.com/blog/readiness-score/)
4. [Oura support: Readiness Contributors](https://support.ouraring.com/hc/en-us/articles/360025589793-Readiness-Contributors)
5. [WHOOP: How does WHOOP Recovery work](https://www.whoop.com/us/en/thelocker/how-does-whoop-recovery-work-101/)
6. [WHOOP community: What is the Recovery score](https://www.community.whoop.com/t/what-is-the-recovery-score-and-how-is-it-calculated/107)
7. [WHOOP: Health Monitor](https://www.whoop.com/us/en/thelocker/health-monitor-feature/)
8. [Pulse: how Recovery and Energy Bank are computed](/metrics/recovery/)
