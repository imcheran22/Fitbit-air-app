---
title: "What is a good Body Battery? Garmin's bands explained"
description: "Garmin's four Body Battery bands, what counts as good in the morning and evening, why yours may sit low, and what the manual says does and doesn't move it."
published: "2026-06-28"
checked: "2026-10-09"
tags: [garmin, recovery, sleep]
keywords: ["what is a good body battery", "garmin body battery normal range", "garmin body battery always low", "garmin body battery low after sleep", "garmin body battery levels"]
---

Anything from 76 to 100 is "high" on Garmin's own scale, and that is what most people mean by good. 51 to 75 is medium, 26 to 50 is low and 5 to 25 is very low. What counts as good for you depends on the time of day: a high number on waking is the goal, and a low one at bedtime is normal.

## The bands, from the manual

Garmin's owner's manuals describe Body Battery as an estimate of your reserve energy, "like a gas gauge on a car". It runs from 5 to 100 and uses four bands:

| Level | Garmin's label |
|---|---|
| 76 to 100 | High reserve energy |
| 51 to 75 | Medium reserve energy |
| 26 to 50 | Low reserve energy |
| 5 to 25 | Very low reserve energy |

The floor is 5. Some websites say 0 or 1, and a few forum threads ask whether it can go below 5. The manual's wording starts at 5, and the same wording appears across manuals from 2024 to 2026.

That is the whole of what Garmin states about levels. It doesn't publish a typical wake-up value, a target for the evening, or a number that counts as "recovered". Anyone quoting you a precise normal range (say "you should wake at 80 or more") is giving their own rule of thumb.

## Reading it at different times

The gauge is meant to move. Garmin lists four inputs: heart rate variability, stress, sleep and activity. Sleep and rest charge it, and stress and exertion drain it. So the same number means different things depending on when you look.

```sketch
{"kind": "flow", "alt": "Garmin's four Body Battery inputs: heart rate variability, stress, sleep and activity, with sleep charging the gauge and stress and exertion draining it.", "inputs": ["Heart rate variability", {"label": "Sleep and rest", "note": "charges", "tone": "green"}, {"label": "Stress", "note": "drains", "tone": "red"}, {"label": "Activity", "note": "drains", "tone": "orange"}], "output": "Body Battery, 5 to 100", "caption": "Inputs from Garmin's owner's manual. Food and caffeine do not move it."}
```

- **On waking.** This is the reading that tells you most about the night. A high value says the night charged you. A medium value is common after a short or broken night, and a low one after several of them.
- **Mid-morning to afternoon.** It should be falling, because you're spending it. A steady slide is the gauge working as designed.
- **Evening.** Low is expected. If you finish the day at 20 after a hard session and a stressful week, that is the model saying you spent it all.
- **Overnight.** You want to see it climb. A flat line through the night is the interesting pattern, and check that you wore the watch.

```sketch
{"kind": "line", "alt": "A day of Body Battery: high on waking, sliding through the day, low in the evening, then climbing overnight.", "yLabel": "Body Battery", "series": [{"label": "Body Battery", "points": [85, 76, 66, 58, 46, 36, 26, 22, 38, 58, 76, 86], "tone": "blue"}], "xLabels": ["Wake", "Midday", "Evening", "Overnight", "Wake"], "notes": [{"at": 0, "text": "High on waking is the goal"}, {"at": 7, "text": "Low in the evening is normal"}], "min": 0, "max": 100, "caption": "Illustration, not real data."}
```

Compare like with like. Your own wake-up readings over a few weeks tell you more than anyone else's average.

## Why yours might always look low

If it never gets above medium, go through this list before assuming something is wrong with you.

**You didn't wear it to bed.** Garmin's tips page says outright that wearing the device while sleeping gives more accurate Body Battery data. Overnight heart rate variability is the key signal for the recharge, and without it the watch has less to go on.

**You haven't synced.** The manual says the level updates when the watch syncs with Garmin Connect. A stale reading on the phone doesn't mean the watch is wrong.

**Stress counted all day.** Stress is one of the four inputs, so a long tense day drains it even if you barely moved. Garmin doesn't publish the weighting.

**You're stacking hard days.** Exertion drains the gauge, and if sleep never refills it, you start each day lower than the last.

**Illness or alcohol.** Garmin's HRV blog lists "a cocktail or two" among the things that can pull HRV below baseline, and Body Battery leans on HRV. Garmin doesn't give figures for how much.

**It is a model.** Third-party write-ups say Body Battery comes from Firstbeat Analytics, the same engine as Garmin's stress score. No peer-reviewed study was found that tests it against an outside measure of energy, and Garmin gives no accuracy figure. With no published accuracy, read it as a trend over days more than as a single precise reading.

## A worked morning

Say you go to bed at 24 on a Tuesday after a hard session and a stressful day, sleep six broken hours, and wake at 48. That is low, and it fits the night. The same watch, after eight quiet hours following an easy day, might put you at 85 or more. The numbers are specific to you and your watch, which is the reason comparing yourself with a friend's 90 is a poor use of the gauge. What you can usefully compare is last Tuesday's wake-up value with this Tuesday's, with the circumstances noted.

## What the manual says does not move it

Garmin's tips page states that food and caffeine have no effect on Body Battery. If you expected a coffee to give you a boost on the gauge, it won't. Equally, a big lunch won't cost you points.

## What to do if you want it higher

1. Wear the watch to sleep, snug but comfortable, every night.
2. Sync before you judge the number.
3. Change one thing at a time for a couple of weeks: bedtime, evening alcohol, or the timing of hard sessions. Then compare wake-up values.
4. Watch the trend, not the day. Three low mornings in a row say more than one.

If it stays very low for weeks while you feel fine, that is more likely a wear or baseline issue than a health one. If it does so alongside persistent fatigue, a raised resting heart rate or other symptoms, that is a question for a doctor, not for the watch.

## If you use a Fitbit instead

Body Battery has no direct counterpart in Google Health, as explained in [Does Fitbit Air have Body Battery?](/blog/fitbit-air-body-battery/). For how Garmin's number compares with WHOOP's and Oura's scores, see [WHOOP recovery vs Garmin Body Battery vs Oura Readiness](/blog/whoop-recovery-vs-body-battery-vs-oura-readiness/).

Pulse, a free app you host yourself, computes its own 0 to 100% Energy Bank from Google Health data, with bands of 67 to 100% plenty, 34 to 66% pace yourself and 0 to 33% running low ([how Energy Bank works](/metrics/energy-bank/)). Those bands are Pulse's, not Garmin's, so a Pulse 70% and a Garmin 70 are different claims. Pulse has been tested on the Fitbit Air only.

## Sources

1. [Garmin owner's manual: Body Battery](https://www8.garmin.com/manuals/webhelp/GUID-607F08F6-33FC-40BF-9727-84E54043D82D/EN-US/GUID-87E1392B-2C55-40B7-A1FF-3AB9252DA0A0.html)
2. [Garmin owner's manual: Tips for Improved Body Battery Data](https://www8.garmin.com/manuals/webhelp/forerunner245/EN-US/GUID-77DAE539-D617-45E9-A471-F21C4432245D.html)
3. [Garmin: Body Battery energy monitoring](https://garmin.ae/garmin-technologies/body-battery-energy-monitoring)
4. [Garmin blog: Understanding the HRV Status on Your Garmin Smartwatch](https://www.garmin.com/en-PH/blog/understanding-the-hrv-status-on-your-garmin-smartwatch/)
5. [Garmin blog: What Is HRV? Heart Rate Variability, Normal Range and Garmin HRV Status](https://www.garmin.com/en-SG/blog/?p=1191)
