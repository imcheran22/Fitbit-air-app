---
title: "Which Fitbit and Pixel devices track which metrics"
description: "Which Fitbit and Pixel Watch models track Readiness, Cardio Load, Active Zone Minutes, HRV, SpO2 and skin temperature, from Google's own help pages."
published: "2026-10-07"
updated: "2026-10-09"
checked: "2026-10-09"
tags: [fitbit, pixel-watch, google-health]
keywords: [fitbit charge 6 readiness, pixel watch skin temperature, which fitbit tracks hrv, fitbit spo2 which devices, pixel watch active zone minutes]
---

Most Fitbits from the Charge 4 and Inspire 2 onward, and every Pixel Watch, track heart rate variability, breathing rate, resting heart rate and Active Zone Minutes. Skin temperature and SpO2 are narrower. Daily Readiness and Cardio Load have their own, shorter device lists. The table below has every cell that could be read from Google's pages.

How this was built: Google's help pages show their per-device grids as checkmark images, which most tools see as nothing. The page source was read instead, where a supported cell holds a checkmark and an unsupported cell is empty, and the image was checked. Everything marked below came from Google's pages as they stood on 9 October 2026. Where a page gives no per-device list, the cell says "not confirmed" instead of guessing.

## The table

"Listed" means Google's page names the device for that metric. "Not listed" means the device is missing from that page's list or grid, which is what the page says about support. If a metric is missing from your app, Google's own advice is that your device does not support it.

| Device | Daily Readiness | Cardio Load | Active Zone Minutes | HRV | Breathing rate | Resting HR | Skin temp. | SpO2 |
|---|---|---|---|---|---|---|---|---|
| Fitbit Air | Listed | Listed | Listed | Listed | Listed | Listed | Listed | Listed |
| Charge 6 | Listed | Listed | Listed | Listed | Listed | Listed | Listed | Listed |
| Charge 5 | Listed | Listed | Listed | Listed | Listed | Listed | Listed | Listed |
| Charge 4 | Not listed | Not listed | Listed | Listed | Listed | Listed | Listed | Listed |
| Inspire 3 | Listed | Listed | Listed | Listed | Listed | Listed | Listed | Listed |
| Inspire 2 | Listed | Listed | Listed | Listed | Listed | Listed | Listed | Not listed |
| Luxe | Listed | Listed | Listed | Listed | Listed | Listed | Listed | Listed |
| Sense and Sense 2 | Listed | Listed | Listed | Listed | Listed | Listed | Listed | Listed |
| Versa 4 and Versa 3 | Listed | Listed | Listed | Listed | Listed | Listed | Listed | Listed |
| Versa 2 | Listed | Listed | Listed | Listed | Listed | Listed | Listed | Listed |
| Pixel Watch (first generation) | Listed | Listed | Listed | Listed | Listed | Listed | Not listed | Not listed |
| Pixel Watch 2 to 5 | Listed | Listed | Listed | Listed | Listed | Listed | Listed | Listed |

Notes on the cells:

- Sense and Versa are given in the vitals grid as "Sense series" and "Versa series", and the Active Zone Minutes page also says "Sense series" and "Versa series", so those models are grouped. Readiness and Cardio Load name Sense, Sense 2, Versa 2, Versa 3 and Versa 4 individually. The kids' devices and other older models are not in this table.
- Pixel Watch 2, 3, 4 and 5 are named on every list. Readiness and Cardio Load also name the first Pixel Watch.
- Daily Readiness: the page has a second, unlabelled list with asterisks beside Sense 2, Versa 3 and Versa 2 and does not say what the asterisks mean, and that list leaves out the Fitbit Air and Inspire 2. The page's main list is used here.
- Cardio Load: the page says it is calculated on the device itself on the Pixel Watch 3, 4 and 5. Apple Watch, Garmin and devices that write to Health Connect also count when synced to the Google Health app, and the app must be version 4.26 or newer.
- SpO2: on several older models it also needs an SpO2 clock face or app. The page's own lists for that differ slightly between its tip and its troubleshooting section.

## Older Fitbits

The vitals grid also lists the Alta HR, Blaze, Charge 2, Charge 3 and Inspire HR. Each has breathing rate, HRV and resting heart rate ticked, with skin temperature and SpO2 blank. None of them is named on the Readiness or Cardio Load pages. The Charge 3 is not named on the Active Zone Minutes page either; that page says devices not listed track plain active minutes instead.

## What the table does not cover

- **Sleep Score.** Google's sleep page says wrist-based Fitbit devices and the Pixel Watch series detect sleep automatically, and names no model list. a per-device answer cannot be given, so it is not a column.
- **ECG and irregular rhythm alerts.** The Google pages that could be read give no current device list. A 2023 report from 9to5Google said the Pixel Watch has an on-demand ECG app but not background irregular-rhythm notifications, which are a Fitbit tracker feature. That is a report, not Google's current list, so it is not in the table.
- **Region and software.** Some health features depend on country approval or on app and firmware versions. The grids do not say, so a tick is not a promise that the feature is switched on for you.
- **Whether the data is any good.** A tick means the device reports the metric. It does not mean the sensor is equally accurate across models.

```sketch
{"kind": "compare", "alt": "What a tick in the device table means and what it does not promise.", "columns": [{"title": "A tick means", "tone": "green", "items": ["Google's page names the device", "The device supports the metric"]}, {"title": "A tick does not mean", "tone": "red", "items": ["A value was produced last night", "The feature is on in your region", "The sensor is equally accurate"]}], "caption": "From the notes under the table."}
```

## Common questions

**Does the Fitbit Charge 6 have Daily Readiness?** Yes. The Charge 6 is on Google's Readiness list. You need a first week of sleep wear (seven nights) and sleep of at least three hours for it to calculate.

**Does the Pixel Watch measure skin temperature?** On the vitals grid, the Pixel Watch 2, 3, 4 and 5 are ticked and the first Pixel Watch is not. Google describes skin temperature as a variation from your own baseline during sleep, so expect a deviation, not an absolute reading.

**Why is HRV missing even though my device is ticked?** A tick means the device supports the metric, not that it produced a value last night. The page notes that most of these metrics need at least three hours of sleep, and on a Fitbit Air see [what to check when HRV shows 0](/blog/fitbit-air-hrv-zero/).

```sketch
{"kind": "steps", "alt": "Three checks when a metric is missing from your app: find your device, check sleep length, allow seven nights for Readiness.", "steps": [{"title": "Find your device", "text": "If it is not listed, Google says it does not support the metric."}, {"title": "Sleep at least 3 hours", "text": "Most of these metrics need it."}, {"title": "Readiness: wear for 7 nights", "text": "The first week of sleep wear comes first."}], "caption": "From Google's help pages."}
```

**Why is my Readiness score missing or stuck?** See [Fitbit readiness always low](/blog/fitbit-readiness-always-low/) for the usual causes.

## Where Pulse fits

Pulse, a free app you host yourself, reads what the Google Health API sends: HRV, resting heart rate, sleep, skin temperature, Active Zone Minutes and the rest. It does not receive Readiness or Cardio Load, because the API has no such data types. It calculates its own scores from the raw data. It was built and tested with the Fitbit Air only, so a device that appears in the table above sends the same data types but has not been tried with Pulse. Where the device ticks for HRV and resting heart rate, [Recovery](/metrics/recovery/) has its main inputs, but how it behaves on a Pixel Watch or a Charge is not known.

## Sources

1. [Health metrics on your Fitbit device or Pixel Watch, Google Health Help](https://support.google.com/googlehealth/answer/14236917)
2. [Daily Readiness, Google Health Help](https://support.google.com/googlehealth/answer/14236710)
3. [What are cardio load and target load?, Google Health Help](https://support.google.com/googlehealth/answer/15402655)
4. [Active Zone Minutes or active minutes, Google Health Help](https://support.google.com/googlehealth/answer/14236509)
5. [Sleep Score, Google Health Help](https://support.google.com/fitbit/answer/14236513)
6. [Google Health API data types](https://developers.google.com/health/data-types)
7. [Pixel Watch irregular heart rhythm notifications, 9to5Google](https://9to5google.com/2023/01/23/pixel-watch-irregular-heart-rhythm-notifications/)
