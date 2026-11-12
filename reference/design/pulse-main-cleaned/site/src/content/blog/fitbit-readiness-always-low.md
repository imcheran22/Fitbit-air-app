---
title: "Fitbit readiness always low? Check these 6 things"
description: "A low or stuck Daily Readiness score usually traces back to sleep length, a raised resting heart rate, a short baseline or missing HRV. Six checks, in order."
published: "2026-06-01"
checked: "2026-10-09"
tags: [fitbit, google-health, recovery]
keywords: ["fitbit readiness always low", "fitbit readiness stuck at 15", "fitbit daily readiness not calibrating", "fitbit air readiness calibration", "why is my fitbit readiness score low"]
---

A Daily Readiness score that stays low is almost always one of six things: short or broken sleep, a resting heart rate that has crept up, HRV that is lower than your own norm, a baseline that is still being built, a missing input, or a score that is simply doing its job. Google doesn't publish the formula, so the checks below follow the three inputs it does name.

## What the score is made of

Google's help page says Daily Readiness "combines insights from your heart rate variability (HRV), recent sleep, and resting heart rate (RHR)". Older Fitbit material also listed activity. The current page says an update removed activity and added resting heart rate, so advice you find on older forum threads may describe a different version of the score.

```sketch
{"kind": "flow", "alt": "Heart rate variability, recent sleep and resting heart rate, each compared with your own baseline, feed Daily Readiness.", "inputs": [{"label": "HRV", "tone": "teal"}, {"label": "Recent sleep", "tone": "sleep"}, {"label": "Resting heart rate", "tone": "orange"}], "output": "Daily Readiness", "tone": "green", "note": "each input vs your own baseline", "caption": "The three inputs Google names. The weights are not published."}
```

The bands on the same page: High is 65 and above, Moderate is 30 to 64, Low is 29 or below. The page is not consistent about the bottom of the scale (it says 0 to 100 in one place and 1 to 100 in another), which matters if you are staring at a 1.

```sketch
{"kind": "bands", "alt": "Daily Readiness bands: Low 29 or below, Moderate 30 to 64, High 65 and above.", "min": 0, "max": 100, "bands": [{"to": 29, "label": "Low", "tone": "red"}, {"to": 64, "label": "Moderate", "tone": "yellow"}, {"to": 100, "label": "High", "tone": "green"}], "caption": "Bands from Google Health Help."}
```

Each input is compared with your own baseline, not with a population chart. That one fact explains most "always low" reports. If your HRV is naturally 25 ms, a 25 ms night is normal for you and should not drag the score down. If the baseline is wrong or incomplete, the comparison is wrong too.

The six checks below run in this order:

```sketch
{"kind": "steps", "alt": "Six checks for a low Daily Readiness score, in order.", "steps": [{"title": "Calibrating?", "text": "7 nights for a first score, about a month for a baseline"}, {"title": "Sleep length", "text": "Last night and the past week"}, {"title": "Resting heart rate", "text": "A rise that holds for several days"}, {"title": "HRV vs your norm", "text": "Your own range, not a table"}, {"title": "Missing input?", "text": "Sleep stages shown, band snug"}, {"title": "Maybe it's right", "text": "Hard training, late nights, stress"}]}
```

## 1. Is it still calibrating?

The help page asks for 7 nights of sleep wearing the device before you get a first score, and recommends wearing it consistently for about a month for a good baseline. A score in the first few weeks is built on a thin baseline. Early numbers can swing, and a run of low ones is not unusual.

If you have just bought a Fitbit Air, switched wrists, or restarted after a long break, give it the month before drawing conclusions. Wear it every night, including the nights you feel too tired to bother, because gaps are what keep a baseline thin.

## 2. How long are you actually sleeping?

The score is calculated once a day, shortly after you wake from a sleep of at least 3 hours, and Google says most metrics need at least 3 hours of quality sleep. Sleep is assessed over the past week, so one bad night counts for less than several uneven ones.

Open last night's sleep and look at the total. Then look at the week. Five nights of six hours followed by a decent Saturday will not fix a Monday score. This is the check that explains the most low scores, and it is also the least glamorous.

## 3. Has your resting heart rate crept up?

Google's page says a sustained rise in resting heart rate over a few days can mean your body is working harder to recover or to fight something off. Resting heart rate is the input that was added in the update, so it now has real weight.

Look at the resting heart rate chart over the last two weeks. A rise of 3 to 5 bpm that holds for several days is worth noticing. Common causes are a hard training block, alcohol, a late heavy meal, heat, poor hydration, a bad cold coming on, and less sleep. If your resting heart rate is unusually high for you and you also feel unwell, or it stays high for weeks with no obvious cause, see a doctor.

## 4. Is your HRV lower than your normal?

Google defines HRV as the variation in time between heartbeats and says it is calculated from heart-rate data using the RMSSD formula. Its page says a significant drop suggests your body may be under stress, and that HRV varies from person to person. Your personal range, according to the same page, is built from up to 30 days of data.

HRV is noisy. Two beers and a late dinner can pull the next morning's reading well below your norm, and a hard session the previous afternoon can do the same. What matters is the trend against your own range, not a single night. If the score is low every day but your HRV looks normal for you, the cause is probably elsewhere in this list.

## 5. Is an input missing?

A score can be built on less than the full set. If sleep stages were not detected on a given night, the HRV reading can be missing as well. Replies on the Fitbit Community forum describe HRV and breathing rate as not being returned when the sleep algorithm cannot work out sleep stages. That comes from forum posts about other models, not from a Google help page, and it could not be confirmed for the Fitbit Air, so treat it as a likely explanation and not a fact.

Check the Sleep tile. If the app shows a simplified sleep pattern instead of stages (awake, light, deep, REM), HRV is probably missing for that night. A snug fit matters here: Google's help page says to wear the device for a full day including overnight, with the back snug against your skin. A loose band moves, and movement spoils the reading.

## 6. Maybe it's right

This is the awkward one. A Low score on a day after hard training, a late night, or a stretch of stress is the score working as designed. Google's own page says low readiness can come from a hard workout, poor sleep, stress, or a combination, and that even light activity can lower it if your resting heart rate is elevated or HRV is down.

If you feel fine and the score says Low every single day for weeks, that is the signal to look at the data, not at the number. Open the readiness breakdown in the app and see which input is out of line. If one input is persistently the odd one out, fix that one.

## What is not known

A few things are not published, and no amount of tinkering will reveal them.

- The weights. Google does not say how much HRV counts compared with sleep or resting heart rate.
- How the baseline is built and how quickly it moves.
- Why some people report a score sticking at one value, such as 15, for days. This turns up in search suggestions and forum threads. Google gives no explanation for it.

If a score looks plainly broken, with no value for weeks despite nightly wear, contact Google Health support with your device model and what the app shows.

## A cross-check

Google's Readiness is only available inside the Google Health app. Google's API doesn't expose it, so third-party tools cannot read it. They can read the raw inputs, though: nightly HRV, resting heart rate and sleep. If you'd like a second opinion built from those same inputs, Pulse, a free app you host yourself, computes its own 0-100% Recovery from your Google Health data, using your own running baseline and giving no score until it has 7 nights of HRV ([how Recovery works](/metrics/recovery/)). It is a different score with different weights, not a copy of Google's. Pulse is built and tested on the Fitbit Air only; other devices that sync to Google Health send the same data types, but they have not been tested.

## A short checklist

1. Count the nights since you started wearing it. Under 7, no score. Under about a month, expect noise.
2. Check last night's sleep total and the past week. Look for a pattern of short nights, not one bad one.
3. Chart resting heart rate for two weeks and look for a sustained climb.
4. Compare HRV with your own range, not with a table. See [what HRV is and how Pulse reads it](/metrics/hrv/) and [resting heart rate](/metrics/resting-heart-rate/) if you want the basics.
5. Confirm the sleep tile shows stages and the band fits snugly.
6. Be honest about the week you've had.

## Sources

1. [Daily Readiness in the Google Health app (Google Health Help)](https://support.google.com/googlehealth/answer/14236710?hl=en)
2. [Health metrics and personal ranges, including HRV (Google Health Help)](https://support.google.com/googlehealth/answer/14236917?hl=en)
