# fitdash versus the reference apps

Date: 2026-10-12. Sources: app listings and support pages for Ultrahuman (Emerald, July 2026), Oura 6, Whoop, Google Health (ex-Fitbit, May 2026), Garmin Connect, Samsung Health, Apple Health; Fitbit community board; Sleep as Android and Samsung forums; Android Police widget review.

Legend: ● has it · ◐ partial · — no. fitdash column: Done, Partial, #n = backlog issue in `docs/issues/`, Skip = deliberately not planned, N/A = data not available through Health Connect.

## Scores and insight

| Feature | Ultrahuman | Oura | Whoop | Google Health | Garmin | fitdash |
|---|---|---|---|---|---|---|
| Recovery / readiness score | ● | ● | ● | ● | ● | Done |
| Sleep score | ● | ● | ● | ● | ● | Done |
| Movement / activity score | ● | ● | ● (Strain) | ◐ | ◐ | Partial (steps % only), #3 |
| Named contributors per score | ● | ● | ● | ◐ | ◐ | #3 |
| Energy through the day (Body Battery) | — | — | — | — | ● | Not in backlog yet |
| Daily stress | ● | ● | ● | ● | ● | N/A (no daytime HRV from Fitbit) |
| Cumulative / weekly stress | — | ● | — | — | — | Skip |
| Sleep debt | ● | ◐ | ● (Planner) | — | ● (Coach) | #8 |
| Bedtime consistency / timing | ● | ● | ● | ● (Profile) | ● | #8 |
| Caffeine window / circadian timeline | ● | — | — | — | — | #9 |
| Action-first recommendations | ● (UltraSphere) | ● | ● (Coach) | ● | ◐ | Partial (rule-based suggestions) |
| Out-of-range alerts (Vitals, Symptom Radar) | ◐ | ● | — | ◐ | ◐ | #10 |
| Journal tags with correlations | — | ● | ● | — | — | #6 |
| Weekly review / plan | — | ● | ● | ◐ | ● | #7 |
| AI coach / chat | ● (Jade) | ● | ● | ● (Premium) | — | Partial ("Ask AI" share) |
| Longevity / biological age | ● | ● | ● | — | — | Skip |

## Data shown

| Feature | Ultrahuman | Oura | Whoop | Google Health | Garmin | fitdash |
|---|---|---|---|---|---|---|
| Sleep stages, hypnogram | ● | ● | ● | ● | ● | Done |
| Sleep efficiency, awakenings, latency | ● | ● | ● | ● | ● | Done |
| Naps | ● | ● | ● | ● | ● | Done |
| HRV with personal range | ● | ● | ● | ● | ● | Done |
| Resting HR with personal range | ● | ● | ● | ● | ● | Done (estimated when the watch does not write it) |
| Heart rate through the day | ● | ● | ● | ● | ● | Done |
| Heart-rate zones per workout | ● | ● | ● | ● (AZM) | ● | #11 |
| Workouts with distance, calories, pace, HR | ● | ● | ● | ● | ● | Done |
| Steps, hourly steps | ● | ● | ◐ | ● | ● | Done |
| Active minutes vs goal | ● | ● | ● | ● | ● | Done |
| SpO2, respiratory rate, skin temperature | ● | ● | ● | ● | ● | Done when the watch writes them |
| Blood pressure, glucose | ◐ | — | — | ● | ◐ | Done |
| Weight, body composition, BMI | ◐ | ◐ | ◐ | ● | ● | Done |
| Hydration logging | — | — | — | ● | ● | Done |
| Nutrition macros | ◐ | — | — | ● | — | Energy only |
| Cycle tracking | ● | ● | ● | ● | ● | #13 |
| History beyond 30 days | ● | ● | ● | ● | ● | Done (6 months with the history permission) |

## Product and platform

| Feature | Ultrahuman | Oura | Whoop | Google Health | Garmin | fitdash |
|---|---|---|---|---|---|---|
| Home screen widget | ● | ● | ● | ◐ ("bare-bones") | ● | #1 |
| Watch complication / tile | ● | ● | ● | ● | ● | Skip for now |
| Customisable home (hide / pin cards) | ● (PowerPlugs) | ◐ | ● | ● (focus metrics) | ◐ | Done (toggles), pinning order not done |
| Light and dark themes | ● | ● | ◐ | ● | ● | Soft (light and dark), Teal and Graphite; Material You #12 |
| Chart scrubbing / tap values | ● | ● | ● | ● | ● | — (next UX item) |
| CSV export | ◐ | ◐ | ◐ | ● | ● | #2 |
| Works offline, no account | ◐ (Emerald) | — | — | — | — | Done |
| No cloud, no internet permission | — | — | — | — | — | Done |
| Open source | — | — | — | — | — | Done |
| Instant open with cached data | ● | ● | ● | ● | ● | Done |
| Explains missing data per watch | ◐ | ◐ | ◐ | ◐ | — | #4 |
| Sync nudge / freshness indicator | ● | ● | ● | ● | ● | Done (sync row); reminder #5 |
| Background refresh | ● | ● | ● | ● | ● | #5 |
| In-app feedback to the developer | ● | ● | ● | ● | ● | Done (GitHub issue links) |
| Accessibility: large text, reduce motion | ◐ | ◐ | ◐ | ● | ◐ | Partial, #14 |

## What this says

fitdash matches the reference apps on the data it shows. The gaps are in three places: scores that explain themselves (#3, #8), the day as a timeline with actions (#9, #10, #6), and presence outside the app (#1, #5). The two things it has that none of them do are the privacy model and open source, which belong on the listing.
