---
title: "Fitbit VO2 max and Cardio Fitness: how accurate?"
description: "What Fitbit's Cardio Fitness Score is built from, what the one lab validation found showed, and how to read the number you get."
published: "2026-08-19"
checked: "2026-10-09"
tags: [fitbit, google-health]
keywords: [fitbit vo2 max accurate, fitbit cardio fitness score, what is a good vo2 max, fitbit vo2 max overestimate, fitbit cardio fitness score no value]
---

Good enough to follow your trend, not good enough to treat as a lab result. The one lab comparison found, on an older Fitbit, had the watch reading about 2.6 ml/kg/min higher than a treadmill test on average. Google itself says lab testing is the most accurate measure and gives no error figure for its own.

That is a thin evidence base, so here is what is known and what is not.

## What the number is made from

Fitbit's Cardio Fitness Score is an estimate of VO2 max, the most oxygen your body can use per kilogram of body weight per minute. Google's help page describes the method in three steps. The app compares your running pace with your heart rate to judge how hard your heart is working. It then compares that efficiency with your resting heart rate to estimate VO2 max. Finally it checks the result against benchmarks for your age, sex and weight.

```sketch
{"kind": "flow", "alt": "Running pace, heart rate and resting heart rate feed a VO2 max estimate that is checked against age, sex and weight benchmarks.", "inputs": [{"label": "Running pace", "note": "outdoor GPS run"}, {"label": "Heart rate on the run"}, {"label": "Resting heart rate"}, {"label": "Age, sex and weight", "note": "benchmarks"}], "output": "Cardio Fitness Score", "tone": "teal", "caption": "The three steps in Google's help page."}
```

Three consequences follow.

- It only learns from outdoor runs with GPS. Walking, cycling and treadmill sessions do not produce a value. For a first reading Google says to track a 10-minute outdoor run, and if nothing shows you may need up to three runs within 30 days.
- Harder runs help. The page says higher-intensity runs give a more accurate estimate, and suggests long runs of at least 10 minutes on flat ground.
- The result leans on your heart-rate sensor, your resting heart rate and your pace. Any error in those flows straight into the estimate.

Google's reference documentation for the data it hands to developers adds a detail: the daily value carries a flag, `estimated`, that marks when confidence has dropped enough to call the number an estimate rather than a fresh measurement. There is also a cardio fitness level, from poor to excellent. The documentation does not say what triggers the flag.

## What validation exists

A search for studies found few. The clearest is Freeberg and colleagues (mHealth, 2019, DOI 10.21037/mhealth.2019.09.07), which tested the Fitbit Charge 2. Thirty healthy adults aged 18 to 35 wore the watch for a week, ran as instructed to get a score, then did a treadmill test to measure VO2 max directly.

| | Mean (ml/kg/min) |
|---|---|
| Treadmill-measured VO2 max | 49.91 |
| Fitbit Charge 2 score | 52.53 |

The watch read higher on average, and the difference was statistically significant (P = 0.03). The mean absolute percentage error was 10.2%, and the agreement between the two (an intraclass correlation) was 0.87, which is decent. The authors described the Charge 2 as giving consistent, unbiased measurement of the score while overestimating VO2 max in healthy men and women. They also found that a simple non-exercise prediction equation, with no run or watch needed, was slightly more accurate (7.8% mean absolute percentage error).

Caveats the authors listed matter. The sample was young and healthy. The runs were unsupervised. Heart rate during the runs was not measured with a chest strap. A person in their fifties with a different build, on a Fitbit Air or Pixel Watch, may land elsewhere, and no published validation was found of those devices, or of any newer Fitbit. Treat every accuracy claim you see online, including "within 10%", with that in mind. One blog states a figure of under 10% without naming the study behind it, so it is not used here.

## Reasons your number may be off

Some of these are reasoning from how the method works, not findings from a study.

- Runs on hills or in heat. Heart rate drifts up in heat, which makes a given pace look harder and can pull the estimate down.
- Wrist heart-rate error. A loose strap or a sensor that loses contact during fast arm swing biases the pace-to-heart-rate comparison.
- A stale resting heart rate. The estimate also uses resting heart rate, which swings with illness, alcohol or a short night.
- Not enough runs. With few or easy runs the score may sit still for weeks or show as a range.
- A recent change in fitness. Google says beginners can see improvement in weeks, but also recommends reviewing trends over at least three months, and that falls can show after a few weeks of less activity.

## Reading the level

Google sorts results into six levels, based on published data by age and sex: Poor, Fair, Average, Good, Very good and Excellent. For ages 20 to 30, its table puts the Good band at 48.6 to 54.6 for men and 40.8 to 45.6 for women. It gives full tables for ages 13 to 120. The cut-offs rise and fall with age, so the same number can mean different levels at 25 and 55.

Compare any figure with a published reference for your age and sex, not with the person next to you at the gym. Pulse, a free app you host yourself, does this against a lab-measured reference table and labels the result as approximate, since the watch figure is an estimate ([how Fitness level works](/metrics/fitness-level/)). It uses your latest run value from the last 90 days, falling back to Google's daily estimate marked as provisional. Pulse was built and tested with the Fitbit Air only.

## What to do with the number

Use it as a trend. A reading that climbs over a few months of training, or sags after a winter off, is more believable than any single value, because systematic bias mostly cancels when you compare you with you.

Do not use it to compare yourself with a friend's different watch, since each brand uses its own method and none of those methods is audited in public. Do not use it to decide whether you need a medical test. If you want a real VO2 max, an exercise lab or sports-science clinic can measure it directly with a mask on a treadmill or bike.

If your score is missing, work through the basics: outdoor GPS runs of at least 10 minutes, run at a reasonable effort, a few of them inside 30 days, and a recent Google Health app.

```sketch
{"kind": "steps", "alt": "Four checks when the Cardio Fitness Score is missing, from outdoor GPS runs to a recent app.", "steps": [{"title": "Run outdoors with GPS", "text": "Walks, rides and treadmill runs give no value."}, {"title": "At least 10 minutes", "text": "Long runs on flat ground help."}, {"title": "Reasonable effort", "text": "Harder runs give a better estimate."}, {"title": "A few runs in 30 days", "text": "Up to three may be needed."}], "caption": "From Google's Cardio Fitness Score help page."}
```

## Sources

1. [Cardio Fitness Score, Google Health Help](https://support.google.com/googlehealth/answer/14237924)
2. [Freeberg KA et al., Assessing the ability of the Fitbit Charge 2 to accurately predict VO2max, mHealth 2019](https://mhealth.amegroups.org/article/view/29481/html)
3. [Google Health API reference: data points (DailyVO2Max)](https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints)
