---
title: "HRV 0 or \"not tracked\" on Fitbit Air? What to check"
description: "HRV showing 0 or blank on a Fitbit Air usually means too little sleep, unstaged sleep or a loose fit. What Google says, what forums report, what to do."
published: "2026-06-16"
checked: "2026-10-09"
tags: [fitbit, hrv, sleep]
keywords: ["fitbit air hrv not tracked", "fitbit air hrv 0", "fitbit hrv not working", "fitbit hrv not showing", "pixel watch hrv 0"]
---

A reading of 0, or "not tracked", is not a very low HRV. It means no HRV value was produced for that night. The usual causes are too little sleep, sleep the band could not split into stages, a loose fit or a sync that has not finished. Google's help page covers the first, third and fourth. The second comes from forum reports.

## Zero means missing, not low

Heart rate variability is the variation in time between heartbeats. Google says it calculates HRV from heart-rate data using the RMSSD formula, and that it needs enough clean data to do it. A real RMSSD of zero would mean your heart beat at a perfectly even interval to the millisecond, which does not happen. So when a chart shows 0, or a tile says nothing, treat it as a gap.

That distinction changes what you do next. A low value is a signal about your body. A gap is a signal about the data, and the fix is about the band, the night or the sync, not about your health.

```sketch
{"kind": "compare", "alt": "A missing HRV reading is a data problem, while a low HRV reading is a signal about your body.", "columns": [{"title": "HRV shows 0 or nothing", "tone": "grey", "items": ["No value was produced", "A signal about the data", "Check sleep length, stages, fit and sync"]}, {"title": "HRV shows a low number", "tone": "teal", "items": ["A real reading", "A signal about your body", "Compare with your own recent range"]}]}
```

## What Google's help page says

On the page covering health metrics and personal ranges, Google says:

- "Most metrics require at least 3 hours of quality sleep." If you move a lot, or the sleep session is too short, you may not get a reading.
- If data does not appear for a metric, "your device does not support it". The table of supported devices on that page is an image, and it did not come through as text when the page was fetched, so the page cannot confirm whether it lists the Fitbit Air for HRV. Kygo, an independent site, says Google's vitals table does include the Air for HRV; that is likely but not confirmed from Google's own page.
- Check the device has synced recently.
- Wear it for a full day, including overnight, with the back of the device snug against your skin.
- Get enough quality sleep with limited movement.

Your personal HRV range, the same page says, is based on up to 30 days of data, so a missing night does not break the range, but a long run of missing nights leaves it thin.

## The sleep-stages link (forum reports)

Replies on the Fitbit Community forum, mostly about the Inspire 3 and other models, describe HRV and breathing rate as not being returned when the sleep algorithm cannot determine your sleep stages. Fitbit support in those threads has said stages are estimated from movement and heart-rate patterns, and that when there is not enough information, the app falls back to a simpler sleep pattern that does not need heart rate.

Two things to hold on to. This is not on a Google help page, and none of the threads found was about the Fitbit Air. Treat it as a good working explanation, not a confirmed rule. Its use is that it gives you something to check in the app: open last night's sleep and see whether you got the full stage view (awake, light, deep, REM) or a simplified one. If it is simplified, a missing HRV is no surprise.

Some people also report a firmware update changing things, and some say the problem disappeared on its own. Those are anecdotes. They are worth a line here only so you don't spend a week suspecting your body when it may be a software wobble.

## Checks, in order of likelihood

The six checks below, in order of likelihood:

```sketch
{"kind": "steps", "alt": "Six checks for a missing HRV reading, in order of likelihood.", "steps": [{"title": "3 hours or more?", "text": "Sleep on the band under 3 hours gives no HRV"}, {"title": "Stages complete?", "text": "A simplified sleep pattern points to a gap"}, {"title": "Snug fit", "text": "Sensor flat against skin, no rotating"}, {"title": "Synced?", "text": "Pull to sync, check later in the morning"}, {"title": "Recent update?", "text": "Update, restart, sync, wait a couple of nights"}, {"title": "Same night every time?", "text": "After a week, contact Google Health support"}]}
```

### 1. Did you sleep with it on for 3 hours or more?

Naps, short nights and fragmented sleep can all fall short. Look at the sleep total. If last night was under 3 hours of sleep on the band, no HRV is the expected result.

### 2. Is the sleep stage view complete?

As above. A simplified sleep pattern points to a night the algorithm couldn't stage.

### 3. How snug is it?

The Air is a screenless band, and where and how tightly you wear it matters for an optical heart-rate sensor. One community reply suggests wearing a wrist device 2 to 3 finger widths above the wrist bone for sleep. For the Air, follow Google's fit guidance for the band you have, and keep the sensor flat against skin. A band that rotates during sleep gives noisy heart-rate data, and noisy data is what an HRV calculation rejects.

### 4. Has it synced?

Open the Google Health app and pull to sync. Google says Daily Readiness is calculated shortly after you wake, so a value that is missing first thing may simply not be processed yet. Check again later in the morning before assuming anything.

### 5. Did the app or band update recently?

Update the app, restart the band, and sync again. If a problem starts the day after an update, wait a couple of nights before concluding anything.

### 6. Is it the same night every time?

An occasional gap is not worth chasing. If it is every night for a week with full, snug wear and staged sleep, contact Google Health support. Give them the model, the app version and what the sleep screen shows in place of stages. No Google article describing a fix for this on the Air turned up.

## What it does to scores that use HRV

Anything built on nightly HRV has to decide what to do with a gap. Google does not say how Daily Readiness treats one. Pulse's Recovery is documented: a night Fitbit could not stage has no HRV, so that night gets no Recovery score at all rather than a guess, and after more than 14 nights without HRV the first night back is not scored. The first score needs 7 nights of HRV, and the score is marked Provisional until 14. Missing nights don't get filled in with an average. [How HRV is used](/metrics/hrv/) and [how Recovery works](/metrics/recovery/) explain what it does with the nightly value.

Pulse is a free app you host yourself, built and tested on the Fitbit Air only. Other devices that sync to Google Health send the same data types, but they have not been tested.

## When a real low reading is the issue

If you see a number, just a low one, that is a different problem. A single low night is normal. HRV swings with alcohol, late meals, hard training, heat and illness, and a drop of 10 ms or more the morning after a late dinner and a few drinks is common for some people. Google's page says a significant drop suggests your body may be under stress, and describes HRV as a well-being insight, not a diagnosis. Compare with your own recent range. If your HRV sits well below that range for a week or more and you feel unwell, or your resting heart rate is also climbing, speak to a doctor. For the related question of why a Fitbit readiness score stays low, see [Fitbit readiness always low](/blog/fitbit-readiness-always-low/).

## Pixel Watch

Searches for "pixel watch hrv 0" exist, and the same logic applies: a zero is a gap. No Pixel Watch account has been checked, and no Google page treats Pixel Watch HRV gaps separately, so nothing specific is claimed for it.

## Sources

1. [Health metrics, personal ranges and HRV (Google Health Help)](https://support.google.com/googlehealth/answer/14236917?hl=en)
2. [Fitbit Air stress and Resilience guide, which lists HRV as available on the Air (Kygo)](https://www.kygo.app/post/fitbit-air-stress-tracking)
3. [Fitbit Community, Inspire 3 and other threads on missing HRV and breathing rate](https://community.fitbit.com/t5/Inspire-3/Inspire-3-health-metrics/td-p/5711787) (forum reports; the community has since moved to Google's help forum)
