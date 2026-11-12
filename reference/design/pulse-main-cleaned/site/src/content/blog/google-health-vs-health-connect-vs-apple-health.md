---
title: "Google Health vs Health Connect vs Apple Health"
description: "What the Google Health app, Android's Health Connect, Apple Health and the Google Health API each do, how they sync, and what to check when data goes missing."
published: "2026-09-25"
checked: "2026-10-09"
tags: [google-health, fitbit, data-export]
keywords: [google health vs health connect, google health not syncing with apple health, health connect fitbit, fitbit apple health sync, google health api vs health connect]
---

They are four different things. The Google Health app is where your Fitbit or Pixel Watch data lives and is scored. Health Connect is a data-sharing hub on Android phones. Apple Health is the same idea on iPhone. The Google Health API is how other software reads your Google Health account.

Most "not syncing" problems come from mixing these up.

## Who holds what

| | Google Health app | Health Connect | Apple Health | Google Health API |
|---|---|---|---|---|
| What it is | The app for Fitbit and Pixel Watch (formerly the Fitbit app) | Android's health and fitness data platform | The health data app on iPhone | A web API for developers |
| Runs on | Android and iPhone | Android phones | iPhone | Google's servers, used by apps |
| Job | Show and score your data, sync from the watch | Let apps on the phone share data with your permission | Same, on iOS | Let an app you approve read (and for some types write) your Google Health data |
| Needs | An adult Google Account | Android 9 or higher; built into Android 14, a Play Store app on older versions | iOS 16.4 or later for Google's sync | OAuth consent from you |

Health Connect is built into Android 14 and later as part of the system. On Android 13 and below you install the Health Connect app from the Play Store, and nothing works below Android 9. Google's developer page also says that by default an app granted access can read data from up to 30 days before the permission was given, unless it asks for and is granted history access.

```sketch
{"kind": "flow", "alt": "Your watch, Health Connect apps on Android and Apple Health on iPhone all feed your Google Health account, which the Google Health API reads.", "inputs": ["Fitbit or Pixel Watch", "Health Connect (Android apps)", "Apple Health (iPhone)"], "output": "Google Health account", "tone": "blue", "note": "Scores are computed in the Google Health app; the API reads this account.", "caption": "How the four pieces connect."}
```

The Google Health API is, in Google's words, the next generation of the Fitbit Web API. If you want the developer side, the data types and what the old API's shutdown means, [how to export your Fitbit data](/blog/export-fitbit-data/) covers it.

## Google Health and Health Connect (Android)

Google's help page says the two sync in both directions, depending on permissions per data type.

- Read and write: steps, heart rate, sleep, weight, body fat, hydration, nutrition and medical records.
- Read only: examples include oxygen saturation, active calories burned and mental wellbeing session duration.
- Write only: examples include speed, step cadence, elevation gained and exercise route.

At setup the app asks whether to allow additional access for historic data and background syncing, and it syncs recent data first and then works backwards. Two details from the same page matter. Data from other connected apps is stored in your Google Account and may be used to calculate your Google Health metrics. And disconnecting does not remove permissions automatically, so you also need to remove access in Health Connect's own settings.

If something stopped updating, Google's first suggestion is to update the Google Health app. Badges reading "Update Health Connect" or "Review your permissions" mean you need to reconnect.

## Google Health and Apple Health (iPhone)

Until this year the iPhone route was one-way. Since an August 2026 update (version 5.05 of the iOS app, reported by Droid Life) Google Health can also write data to Apple Health. Google's help page now describes a two-way connection:

- Apple Health to Google Health: steps, VO2 max, floors, active calories, distance, exercise and routes, body temperature, sleep sessions and stages, heart rate, heart rate variability, skin temperature, oxygen saturation, respiratory rate, resting heart rate, blood glucose, weight, fat percentage, nutrition, water, mindfulness and cycle health.
- Google Health to Apple Health: the same categories, except skin temperature and heart rate variability, which only come in.

```sketch
{"kind": "compare", "alt": "Apple Health data that flows into Google Health compared with what flows back out, where skin temperature and HRV only come in.", "columns": [{"title": "Apple Health to Google Health", "tone": "blue", "items": ["Steps, sleep, heart rate", "Heart rate variability", "Skin temperature", "Weight, nutrition, cycle health"]}, {"title": "Google Health to Apple Health", "tone": "green", "items": ["Steps, sleep, heart rate", "Weight, nutrition, cycle health", "Not skin temperature", "Not heart rate variability"]}], "caption": "From Google's Apple Health help page."}
```

So if a Fitbit's HRV is missing from Apple Health, that is by design, not a fault. The limits are written on the page: Google Health currently reads three months of Apple Health history, with more promised later in the year, and new data types must be reviewed and permitted before they appear. Reinstalling the app means connecting and granting permissions again.

To connect, open the Connections menu in Google Health, choose Apps and services, select Apple Health under Add connections, accept the consent page and pick the categories. Check them afterwards in Apple Health under Sharing, Apps, Google Health.

## Which should you use

- **You have a Fitbit and an Android phone, and want your data in another Android app.** Turn on Health Connect in the Google Health app and allow only the data types the other app needs.
- **You have a Fitbit and an iPhone, and want it in Apple Health or an app that reads Apple Health.** Use the Apple Health connection above and remember HRV and skin temperature will not flow out.
- **You want a copy of everything, or to load it into a spreadsheet.** None of these is an export. Use Google Takeout, covered in the [export guide](/blog/export-fitbit-data/).
- **You want a self-hosted dashboard.** A hub on the phone is of little use to a server, which cannot reach it. A server needs the Google Health API, which reads from your Google account.

## Why a number differs between apps

Three reasons account for most differences.

1. **Different data is written.** The tables above show categories only. Individual metrics, such as Daily Readiness or Cardio Load, are not in either list. They are computed inside the Google Health app and Google's pages say nothing about them passing to Health Connect or Apple Health. The Google Health API's data-type list has no entry for them either.
2. **History windows.** Thirty days of third-party data from Health Connect, three months from Apple Health, versus whatever your account holds.
3. **Different calculations.** Droid Life reports Google and Apple calculate HRV with different formulas, which is why it does not transfer.

If a step count differs by a few hundred between phone and watch, that is usually two sources counted separately, not a sync failure.

## A note on Pulse

Pulse, a free app you host yourself, takes the Google Health API route. It reads your Google Health account (with its own Google Cloud OAuth client), so it sees data the Google Health app has already merged, including phone steps and workouts that came in from Health Connect. Heart rate from other sources is deliberately ignored, so a phone or another watch does not feed [Strain](/metrics/strain/). It does not read Apple Health or Health Connect directly. It was built and tested with the Fitbit Air only. Which devices send which metrics is in [Which Fitbit and Pixel devices track which metrics](/blog/fitbit-pixel-metrics-by-device/).

## Sources

1. [How do I use Apple Health with the Google Health app?, Google Health Help](https://support.google.com/googlehealth/answer/17037331)
2. [What is Health Connect?, Google Health Help](https://support.google.com/fitbit/answer/14506680)
3. [Get started with Health Connect, Android Developers](https://developer.android.com/health-and-fitness/health-connect/get-started)
4. [Google Health API overview, Google for Developers](https://developers.google.com/health)
5. [Google Health adds full Apple Health sync, Droid Life](https://www.droid-life.com/2026/08/03/google-health-adds-full-apple-health-sync/)
