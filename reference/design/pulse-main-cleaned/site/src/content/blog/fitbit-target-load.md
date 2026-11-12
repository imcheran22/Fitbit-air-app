---
title: "Fitbit Target Load too high or low? How it is set"
description: "How Google sets Target Load on free and Premium plans, why it can feel wrong, and what to do. Plus how a daily Strain Target built from Recovery works."
published: "2026-07-11"
updated: "2026-10-09"
checked: "2026-10-09"
tags: [fitbit, google-health, training-load]
keywords: ["fitbit target load too high", "fitbit target load is low", "fitbit no target load", "fitbit cardio load target", "fitbit target load meaning"]
---

How Target Load is set depends on your plan. Without Google Health Premium, the weekly target follows your average Cardio Load over the previous four weeks, so it chases what you have been doing. With Premium and the coach on, the coach sets it from a Training Focus of Recovery, Maintain or Build. In both cases a target that looks wrong usually reflects recent history, not a fault.

## What Target Load is

Google describes Target Load as "a suggested weekly range for cardio load that you can use to guide training". Cardio Load is the daily total of cardiovascular effort, based on the TRIMP model, and it resets at midnight. Target Load is the weekly side of the same idea: a range to aim for across seven days. If Cardio Load is new to you, [Cardio Load vs Strain](/blog/cardio-load-vs-strain/) covers what the number is.

## The three things that set it

From Google's help page:

1. **Your fitness goal.** The target is "tailored to the fitness target you have set in the Google Health app to maintain or improve fitness". Google doesn't give numbers, but Maintain should keep the range near what you already do and Improve should push it higher.
2. **Recent activity, as a ratio.** Google Health "compares the last week of cardio load with the last month (often called Acute to Chronic Workload Ratio or ACWR)". If the last week is running well above the last month, the target should ease off. If it is well below, there is room to move up.
3. **Your plan.** On the free plan, "the weekly target continues to be determined by your average cardio load over the previous 4-week period". On Premium with the coach, the coach sets and adjusts the target based on a weekly Training Focus of Recovery, Maintain or Build.

Notice what is not in that list. The page does not describe daily readiness as an input. It comes up only in troubleshooting advice, where Google tells you to look at readiness when judging whether a target is reasonable. So readiness sits next to the target, not inside it.

```sketch
{"kind": "flow", "alt": "Your fitness goal, last week against last month, and your plan together set the weekly Target Load.", "inputs": [{"label": "Fitness goal", "note": "maintain or improve", "tone": "green"}, {"label": "Last week vs last month", "note": "ACWR", "tone": "orange"}, {"label": "Your plan", "note": "free or Premium", "tone": "blue"}], "output": "Weekly Target Load", "tone": "teal", "caption": "The three things Google's help page names."}
```

## Why it feels too low

A target that looks easy usually has one of these causes.

- **A quiet recent month.** On the free plan, four weeks of low activity produce a low target. Illness, travel, a holiday or an injury all do this, and the target follows you down.
- **The Maintain goal.** It asks you to stay level, not to climb.
- **A Recovery focus on Premium.** The name suggests a gentler target, though Google doesn't give figures.
- **A short history.** Google's page says your first target appears "after 7 consecutive days and nights of wearing the watch", while the setup section says a personalised target appears after two weeks, based on the previous two weeks' average. The page doesn't reconcile those figures, so in the first two weeks, expect an early and rough target.

Google's own advice for a low target is to check your recovery levels, because "a lower level may require a target load adjustment".

## Why it feels too high

- **A big recent month.** The same four-week average that made the low target now makes a high one. If you've had a hard block, the target keeps asking for the same.
- **The Improve goal, or a Build focus on Premium.** Both ask for more.
- **Heart-rate inflation.** Cardio Load counts heart rate. Heat, caffeine, a poor night or illness raise heart rate without more work, so you can carry a higher recent load than the effort suggests, and the target rises to meet it.

For a high target, Google suggests judging by how you feel. If readiness is high but you feel fatigued, listen to your body and take a break. It also recommends reducing workout intensity and prioritising rest, because fatigue may signal early illness. Hold that up against [what your readiness score is actually made of](/blog/fitbit-daily-readiness-explained/) before trusting it too far in either direction, because a High score only tells you about HRV, resting heart rate and sleep.

## "No target load" and other gaps

If you see no target, check three things.

1. Have you worn the watch for 7 consecutive days and nights? That's the page's own condition.
2. Is your app up to date? The feature needs a recent version of the Google Health app.
3. Does your device support it? Cardio Load and Target Load are listed for Inspire 2 and 3, Luxe, Sense and Sense 2, Versa 2 to 4, Charge 5 and 6, Fitbit Air and Pixel Watch 1 to 5, per Google. The per-device grid could not be read for every model, so check the app.

Google's help page is also inconsistent about whether Cardio Load is a daily or weekly view, and some coverage says it moved to weekly. If your app looks different from a screenshot online, that may be why.

## What to do about a target that seems off

- **Treat it as a suggestion.** It is a guide to a weekly range, not a prescription. A target you hit with two nights of poor sleep is not a good target.
- **Look at the shape of your last month.** Is it a smooth ramp, or one hard week and three quiet ones? The target follows the average, not your intentions.
- **Change the goal.** The Maintain and Improve setting is the one lever you control on the free plan.
- **Pair it with how you feel.** Resting heart rate rising over several days and HRV dropping below your usual range both suggest backing off, whatever the target says. If you feel unwell, or your resting heart rate stays high for weeks, see a doctor.

## How a daily Strain Target differs

Google doesn't expose Cardio Load or Target Load through its API, so Pulse cannot show them. Pulse has its own target: a Strain Target, a range for today on the 0 to 21 Strain scale, set by your Recovery and recent load. It is a different design. Google's target is weekly and follows your four-week average. Pulse's is daily and starts from your Recovery band:

| Today's Recovery | Range |
|---|---|
| Green | Base × 1.0 to base × 1.25 |
| Yellow | Base × 0.8 to base × 1.0 |
| Red | Base × 0.5 to base × 0.75 |

The base is your average Strain over the last 28 days, today excluded. If your training load (last 7 days against last 28) is above 1.3, the top of the range is capped at your base. Below 0.8, both ends rise by 10%. The range stays between 4 and 19 and at least 2 wide. A base of 12 on a green day gives 12.0 to 15.0. With fewer than 14 days of Strain in the last 28, Pulse uses a starting range marked as an estimate: green 14.0 to 18.0, yellow 10.0 to 14.0, red 6.0 to 10.0.

```sketch
{"kind": "compare", "alt": "Google's Target Load is a weekly range, while Pulse's Strain Target is a daily range set from Recovery.", "columns": [{"title": "Google Target Load", "tone": "blue", "items": ["A weekly range", "Free: your 4-week average", "Premium: coach sets a Training Focus", "Not available to third-party apps"]}, {"title": "Pulse Strain Target", "tone": "teal", "items": ["A range for today, 0 to 21", "Starts from your Recovery band", "Base: 28-day average Strain", "Training balance caps or lifts it"]}]}
```

That is the same idea Google uses, a recent ratio against a longer average, applied to a daily range. It does not know your training plan, races or injuries. The details are in [how Strain Target works](/metrics/strain-target/) and [training balance](/metrics/training-balance/).

Pulse is a free app you host yourself, built and tested on the Fitbit Air only. Other devices that sync to Google Health send the same data types, but they have not been tested.

## Sources

1. [Cardio load and target load (Google Health Help)](https://support.google.com/googlehealth/answer/15402655?hl=en)
2. [Daily Readiness in the Google Health app (Google Health Help)](https://support.google.com/googlehealth/answer/14236710?hl=en)
