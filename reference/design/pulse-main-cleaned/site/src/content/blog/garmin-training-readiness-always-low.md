---
title: "Garmin Training Readiness always low: causes"
description: "Why Garmin Training Readiness sits at Low or Poor: the six inputs Garmin lists, which ones usually hold it down, and what to check first."
published: "2026-06-14"
checked: "2026-10-09"
tags: [garmin, recovery, hrv]
keywords: ["garmin training readiness always low", "garmin training readiness stuck at 1", "why is my garmin training readiness so low", "garmin training readiness poor"]
---

Training Readiness is built from six things, and a single bad one can hold the whole score down: last night's sleep score, recovery time, HRV status, acute load, the last three nights of sleep, and the last three days of stress. In practice, a long recovery time or a high acute load is the usual reason it never climbs. A brand-new watch is the other common one.

## What Garmin says goes into it

Garmin's owner's manuals describe Training Readiness as a score plus a short message, recalculated through the day. The six inputs above are the complete list in the manual. Garmin does not publish how they are weighted or combined, and the manual page says nothing about what to do when the score is low.

```sketch
{"kind": "flow", "alt": "Six inputs feed Garmin's Training Readiness score: last night's sleep score, recovery time, HRV status, acute load, three nights of sleep and three days of stress.", "inputs": ["Last night's sleep score", "Recovery time", "HRV status", "Acute load", "Sleep history, 3 nights", "Stress history, 3 days"], "output": "Training Readiness", "note": "Body Battery is not an input", "caption": "Inputs from Garmin's owner's manual. Garmin does not publish the weights."}
```

The tiers, as the manual gives them:

| Score | Label | Garmin's wording |
|---|---|---|
| 95 to 100 | Prime | Best possible |
| 75 to 94 | High | Ready for challenges |
| 50 to 74 | Moderate | Good to go |
| 25 to 49 | Low | Time to slow down |
| 1 to 24 | Poor | Let your body recover |

Be careful with tier numbers you find elsewhere. Several blogs quote different cut-offs, and at least one still gives Prime as starting at 80. The manual is the reference, and bands can differ between watch models and software versions, so check the manual for your own device.

One more thing the list tells you: Body Battery is not an input. If your Body Battery is high and Training Readiness is low, that is not a contradiction. They are fed by different things.

## Check these, in order

Go through the causes in this order because the first few are the most common and the cheapest to rule out. Garmin doesn't document which input dominates, so the ranking comes from how the inputs behave and from forum reports, not from a Garmin statement.

```sketch
{"kind": "steps", "alt": "Seven checks, in order, for a Training Readiness score that stays low.", "steps": [{"title": "New or reset watch?", "text": "HRV status needs about three weeks of data"}, {"title": "Recovery time", "text": "60 or 90 hours feeds the score"}, {"title": "Acute load", "text": "Hard days most days keep it up"}, {"title": "HRV status", "text": "Outside Balanced for weeks"}, {"title": "Three nights of sleep", "text": "One good night will not fix it"}, {"title": "Three days of stress", "text": "Travel, work or illness count"}, {"title": "Missing or extra workouts", "text": "Check your activity list"}], "caption": "Order is the author's judgement, not a Garmin ranking."}
```

### 1. Is the watch new, or was it recently reset?

HRV status needs about three weeks of consistent overnight data before it shows anything, according to the Garmin manual. Until then one of the six inputs has nothing to work from. Several third-party guides say early scores, including a stuck 1, are a data problem and not a body problem. Wear the watch to bed every night for those three weeks before judging the score.

### 2. Look at your recovery time

Open the recovery time on the watch or in Garmin Connect. If it says 60 or 90 hours after a hard week, that number is feeding the score. One forum user with a Forerunner 955 described recovery time as the input that dragged the score down, and thought it was too long after an hour of exercise. That is a single report, not a finding, but it matches where to look.

### 3. Check acute load

Acute load, per Garmin, is a weighted sum of your excess post-exercise oxygen consumption (EPOC) over the last several days. The gauge reads low, optimal, high or very high, and Garmin says the optimal range is based on your fitness level and training history. If you train hard most days, the load never drains and the score stays down. A blog claims a ten-day tail, but that number does not appear in Garmin's manuals.

### 4. Look at HRV status

Garmin's HRV status compares your seven-day average with a personal baseline range, and labels it Balanced, Unbalanced, Low or Poor. Garmin's manual says an Unbalanced or Poor status may point to fatigue, greater recovery needs or increased stress. Whether it pulls the score down by a little or a lot isn't published, but a status that sits outside Balanced for weeks is worth chasing first.

### 5. Three nights of sleep, not one

Because the score also uses sleep history over three nights, one good night after a short week won't fix it. Likewise one bad night rarely sinks a score that was otherwise fine.

### 6. Three days of stress

Garmin counts stress history for the last three days. Travel, a bad week at work or illness can hold the score down even if training was light.

### 7. Missing or extra workouts

If you did a hard session and forgot to start the watch, it isn't in acute load, so the score may look better than it should. Check your activity list for anything that looks wrong, since a mis-recorded workout counts too.

## When low is just right

Sometimes the score is accurate. If recovery time is long, load is high, you slept five hours twice and the week was stressful, Low is a fair description. The more useful question is whether it stays low on a lighter week. If it clears after two or three easy days, the system is behaving. If you have eased off properly, slept well, the watch has had its three weeks and the score still sits at Poor, look at the HRV and resting heart rate trends in Garmin Connect to see which one is out of line.

If your resting heart rate has stayed well above your usual for several days, or you have symptoms such as a fever, chest discomfort, dizziness or unusual breathlessness, see a doctor. Don't rely on a wearable score for that decision.

## Using it sensibly

Treat the score as a prompt, not a rule. Several training blogs say a low readiness means "don't train hard", not "don't train", and that fits Garmin's own wording ("time to slow down"). No validation study has been found for Training Readiness, and Garmin doesn't say how accurate it is.

If you'd like a morning figure without training load in it, Pulse, a free app you host yourself, computes a Recovery score from your Google Health data using HRV, resting heart rate, sleep performance, respiratory rate and skin temperature, each against your own baseline ([how Recovery works](/metrics/recovery/)). It has no equivalent of recovery time or acute load in it, and it has been tested on the Fitbit Air only, so it isn't a stand-in for a Garmin.

Readers on a Fitbit with the same problem will want [Fitbit readiness always low? Check these 6 things](/blog/fitbit-readiness-always-low/).

## Sources

1. [Garmin owner's manual: Training Readiness](https://www8.garmin.com/manuals/webhelp/GUID-31D23DBB-57C2-4DF7-A0C9-8D1A00AB4BE7/EN-GB/GUID-C21BE0C8-A08E-4DA1-B6C6-2E0E2DDDB372.html)
2. [Garmin owner's manual: Heart Rate Variability Status](https://www8.garmin.com/manuals/webhelp/GUID-F41EAFB3-6CC9-42DE-9C6C-9E358DBB0671/EN-US/GUID-9282196F-D969-404D-B678-F48A13D8D0CB.html)
3. [Garmin owner's manual: Acute Load](https://www8.garmin.com/manuals-apac/webhelp/tactix8series/EN-SG/GUID-7B29647B-615E-46D4-A331-4A3C2993E384-4326.html)
4. [Garmin forum: Training readiness incorrect](https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-web/401806/training-readiness-incorrect)
5. [TrainerRoad forum: Garmin low training readiness](https://www.trainerroad.com/forum/t/garmin-low-training-readiness-move-workout-or-skip/79182)
