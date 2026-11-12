---
title: "Fitbit Daily Readiness explained, and how Recovery differs"
description: "What Daily Readiness is built from, what its bands mean, what Google doesn't publish, and how a 0-100% Recovery with published weights differs."
published: "2026-06-24"
updated: "2026-10-09"
checked: "2026-10-09"
tags: [fitbit, google-health, recovery]
keywords: ["fitbit readiness meaning", "how is fitbit readiness calculated", "fitbit daily readiness explained", "what is a good readiness score on google health", "fitbit readiness score range"]
---

Daily Readiness is a once-a-day score in the Google Health app that estimates how recovered you are. Google says it combines heart rate variability, recent sleep and resting heart rate, each compared with your own baseline. It runs on a 100-point scale. The weights are not published. A Recovery score, as Pulse computes it, is a similar idea with documented weights.

If your score is low and you want to know why, there is a separate checklist: [Fitbit readiness always low](/blog/fitbit-readiness-always-low/). This post is about what the number is.

## Where it appears and who gets it

Google's help page lists Pixel Watch 1 to 5 and Fitbit Charge 5, Charge 6, Sense, Sense 2, Versa 2, 3 and 4, Inspire 2 and 3 and Luxe as supported. The Fitbit Air appears on the page too, though only under on-device support, and some Versa and Sense 2 models carry an asterisk in the app list that the text does not resolve. Check the in-app list for your own device.

The score is calculated once a day, shortly after you wake from a sleep of at least 3 hours. You need 7 nights of sleep wearing the device before the first score. Google recommends about a month of consistent wear for a good baseline.

## The three inputs

Google's page says Readiness "combines insights from your heart rate variability (HRV), recent sleep, and resting heart rate (RHR)". Each does something different.

**HRV** is the variation in time between heartbeats, calculated by Google using RMSSD. Higher than your norm generally points to a body that has recovered. A significant drop suggests stress.

**Resting heart rate** is the other autonomic signal. A rise that holds for a few days can mean your body is working harder to recover or fight something off.

**Recent sleep** is assessed over the past week, not only last night. That is why one bad night usually dents the score less than several uneven ones.

Compared with what? With you. Scores are measured against your personal baseline, which is why two people with HRV of 30 ms and 90 ms can both get a High.

```sketch
{"kind": "flow", "alt": "Heart rate variability, resting heart rate and recent sleep, each compared with your personal baseline, combine into Daily Readiness.", "inputs": [{"label": "HRV", "tone": "teal"}, {"label": "Resting heart rate", "tone": "orange"}, {"label": "Recent sleep (past week)", "tone": "sleep"}], "output": "Daily Readiness", "tone": "green", "note": "each input vs your own baseline", "caption": "The three inputs Google names. The weights are not published."}
```

## What changed in the update

Older Fitbit material, and some forum replies, describe Readiness as activity, sleep and HRV. The current help page says an update removed activity and added resting heart rate. The score "reflects how your body responds to activity, not the activity itself". If you read an article that lists activity as an input, check its date. Many pages online still describe the older version.

## The bands

| Band | Score |
|---|---|
| High | 65 and above |
| Moderate | 30 to 64 |
| Low | 29 or below |

Google's descriptions: High means you're well recovered and may be ready for peak performance; Moderate means your recovery is typical and you can handle a workout; Low means prioritise rest and active recovery.

One wrinkle: the same page says "0 to 100" in one section and "1 to 100" in another, and doesn't reconcile them. It doesn't change what the bands mean, but it is why you will see both in search results.

## What Premium adds

The score itself needs no subscription as far as the help page shows. What Premium adds is the coach: "For Premium users, your coach proactively advises adjustments to your training based on your readiness score." The page also says standalone workout recommendations based only on the score are no longer provided, and the coach keeps weekly targets aligned with your recovery instead. Premium prices change, so none are quoted here.

## What Google doesn't say

- The weights of the three inputs.
- The shape of the curve from inputs to a 0-100 number.
- How the baseline is built, and how quickly it adapts.
- What happens when one input is missing. If HRV is missing for a night, some other inputs presumably still count, but the page doesn't say. For why HRV goes missing, see [HRV 0 or "not tracked" on Fitbit Air](/blog/fitbit-air-hrv-zero/).

## Readiness and Cardio Load are different things

People often put the two side by side, because Google's app shows both. Readiness is how recovered you are this morning. Cardio Load is how much cardiovascular work you've done. One is a state, the other is a workload. There's a separate post comparing [Cardio Load with Strain](/blog/cardio-load-vs-strain/). Google's Target Load does use readiness as one input: low readiness lowers the weekly target.

```sketch
{"kind": "compare", "alt": "Readiness is a state of recovery this morning, while Cardio Load is the workload of the day.", "columns": [{"title": "Daily Readiness", "tone": "green", "items": ["How recovered you are", "A state, once a day", "From HRV, resting heart rate, sleep"]}, {"title": "Cardio Load", "tone": "orange", "items": ["How much cardio work you did", "A workload, resets at midnight", "From heart rate during activity"]}]}
```

## How a Recovery score differs

Google's API has no Readiness data type, so third-party apps can't read the score. They can read the inputs. Pulse, a free app you host yourself, uses them to compute its own Recovery, a 0 to 100% figure. The two scores are not interchangeable, and a few differences are structural:

| | Daily Readiness | Pulse Recovery |
|---|---|---|
| Inputs | HRV, resting heart rate, recent sleep | HRV, resting heart rate, Sleep Performance, respiratory rate, skin temperature |
| Weights | Not published | 55% HRV, 20% resting heart rate, 15% sleep, 5% respiratory rate, 5% skin temperature |
| Baseline | Personal; built over 7+ nights, about a month recommended | Running average of recent nights that leans on the last two weeks, clipping extreme nights |
| First score | After 7 nights of sleep | After 7 nights of HRV, Provisional until 14 |
| Bands | Low 1-29, Moderate 30-64, High 65-100 | Red 0-33%, Yellow 34-66%, Green 67-100% |
| Missing HRV | Not stated | No score that night |

Pulse's pipeline measures each input in units of your own usual night-to-night swing, takes the weighted average, and passes it through an S-shaped curve. With everything at baseline it lands at about 58%, in the yellow band, and a clearly good night pushes into green. The full method is in [how Recovery works](/metrics/recovery/).

```sketch
{"kind": "flow", "alt": "Pulse Recovery is a weighted blend of HRV, resting heart rate, sleep, respiratory rate and skin temperature.", "inputs": [{"label": "HRV", "note": "55%", "tone": "teal"}, {"label": "Resting heart rate", "note": "20%", "tone": "orange"}, {"label": "Sleep Performance", "note": "15%", "tone": "sleep"}, {"label": "Respiratory rate", "note": "5%", "tone": "blue"}, {"label": "Skin temperature", "note": "5%", "tone": "red"}], "output": "Recovery 0-100%", "tone": "green", "caption": "Pulse's published weights."}
```

Don't expect the numbers to line up. A Readiness of 70 and a Recovery of 70% can happen on the same morning, or not. The weights differ, the baselines differ and Pulse adds two inputs. Pulse does not try to reproduce Google's score. Both are an estimate from a wrist sensor, and they read your body, not your plans or how you feel.

Pulse is built and tested on the Fitbit Air only. Other devices that sync to Google Health send the same data types, but they have not been tested.

## How to use either score

Use the trend, not a single day. A reading that is Low for one morning after a bad night is expected. A reading that sits Low for two weeks while you feel fine is a prompt to look at the inputs, and a reading that sits Low while you also feel ill, or with a resting heart rate that keeps rising, is a reason to see a doctor.

## Sources

1. [Daily Readiness in the Google Health app (Google Health Help)](https://support.google.com/googlehealth/answer/14236710?hl=en)
2. [Health metrics and personal ranges (Google Health Help)](https://support.google.com/googlehealth/answer/14236917?hl=en)
3. [Cardio load and target load (Google Health Help)](https://support.google.com/googlehealth/answer/15402655?hl=en)
4. [Google Health API data types (Google for Developers)](https://developers.google.com/health/data-types)
