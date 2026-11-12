---
title: "Fitness Age vs Pulse Age vs WHOOP Age"
description: "Garmin Fitness Age, WHOOP Age and Pulse Age all put a number of years on your body, but they measure different things. How each works and how far to trust it."
published: "2026-09-17"
checked: "2026-10-09"
tags: [garmin, whoop, recovery]
keywords: ["garmin fitness age", "garmin fitness age vs whoop age", "whoop age vs fitness age", "biological age wearable", "fitness age accuracy"]
---

Three products, three different questions. Garmin's Fitness Age asks how your cardiovascular fitness compares with people your age. WHOOP Age asks how your habits and vitals add up in mortality-risk terms. Pulse Age, a free self-hosted app's version, asks something close to WHOOP's, with its method published. None is a measurement of biological age.

## The short comparison

| | Garmin Fitness Age | WHOOP Age | Pulse Age |
|---|---|---|---|
| Built on | VO2 max, plus on newer watches activity intensity, resting heart rate, body fat or BMI | Nine habits and vitals over six months | Fitness, vitals, sleep and activity from Google Health, averaged over six months |
| Reference | Typical values for your sex at different ages | WHOOP's recommendations for long-term health | A fit person of your age and sex |
| Method published? | Inputs yes, weights no | Inputs yes, full weights no | Yes, in the project's documentation |
| Needs | A compatible Garmin watch, and a scale for body fat | WHOOP Peak or Life membership | A Google Health account and your own server |
| Speed of change | Follows VO2 max updates | Weekly, slow | Weekly, slow |

Garmin's page covers Fitness Age only. The other two columns come from WHOOP's Healthspan pages and Pulse's own documentation. WHOOP does not publish a full table of weights, so any claim that two products "agree" is guesswork.

## Garmin Fitness Age: a VO2 max in disguise

Garmin describes Fitness Age as an interpretation of your VO2 max estimate, the maximum oxygen your body can take in and use per minute in hard effort. The watch compares your value with typical values for people of your sex at different ages and returns the age at which your VO2 max would be typical.

How it is calculated depends on the watch. Garmin says newer devices also factor in activity intensity, resting heart rate, and body fat percentage or BMI. Body fat comes from a compatible smart scale. Garmin's weights are not published in the pages that could be read.

Its advice for lowering it mirrors the inputs: some vigorous-intensity minutes in a 30-minute workout (Garmin suggests at least five), plus whatever lowers resting heart rate: regular exercise, a healthy weight, no tobacco, less stress.

What this tells you: your fitness against a population. What it doesn't: sleep, steps, strength or anything outside the cardio-fitness family. On the basic method, two people with the same VO2 max get the same value whether one sleeps five hours a night or not. If you take only one lesson from the design, it is that a Fitness Age moves when VO2 max moves, and wrist VO2 max estimates are themselves models.

## WHOOP Age: nine habits turned into years

WHOOP Age uses the last six months of data from nine inputs: sleep duration and consistency, weekly time in heart-rate zones 1-3 and 4-5, weekly strength time, daily steps, VO2 max, resting heart rate and lean body mass. WHOOP says it ties each to published all-cause mortality evidence and corrects for overlap. Pace of Aging then compares the last 30 days with that six-month baseline. [WHOOP Healthspan and Pace of Aging, explained](/blog/whoop-healthspan-pace-of-aging/) goes through it in detail.

The important difference from Garmin: lifestyle counts, not only fitness. The cost is a bigger set of inputs that must all be present, and WHOOP says Healthspan needs 21 Recoveries in every 31 days to keep updating. WHOOP also says internal research found WHOOP Age correlates with perceived health and chronic conditions. That is company research, not an independent validation.

## Pulse Age: the same family, with the arithmetic open

Pulse, a free app you host yourself, computes Pulse Age from Google Health data ([how Pulse Age works](/metrics/pulse-age/)). It uses nine inputs: VO2 max, resting heart rate, steps, sleep hours, sleep consistency, time in heart-rate zones 1-3 and 4-5, strength activity and lean body mass. Each is averaged over six months and compared with a fit person of your age and sex, mapped to a change in mortality risk from a published study, and converted to years on the rule that mortality risk doubles about every eight years. Pace of Aging repeats it for the last 30 days.

```sketch
{"kind": "steps", "alt": "How Pulse Age turns each input into years.", "steps": [{"title": "Average six months", "text": "Each of the nine inputs."}, {"title": "Compare", "text": "Against a fit person of your age and sex."}, {"title": "Map to risk", "text": "A change in mortality risk from a published study."}, {"title": "Convert to years", "text": "Risk doubles about every eight years."}], "caption": "From Pulse's documentation."}
```

The limits are written down. It needs at least 5 of the 9 inputs, is labelled provisional until 20 days have data, never moves more than 15 years from your real age, and updates weekly. Because the reference is a fit person, many people start out "older than their age", which says more about the reference than about you. It is an estimate from population studies, not a clinical test. And it is built and tested with the Fitbit Air only. Other Google Health devices send similar data but have not been tested.

## What each can and can't tell you

All three share one weakness: the numbers come from group statistics applied to one person. A study can show that, on average, higher VO2 max goes with lower mortality. It cannot show that raising yours by 3 points will give you a specific number of extra years.

Where they differ is what they leave out.

- **Garmin** leaves out sleep, steps and strength, so it is the narrowest and also the easiest to explain.
- **WHOOP and Pulse** include sleep and activity, so a bad month shows up. They also stack nine uncertain estimates, and the combined number looks more exact than it is.
- **Inputs measured at the wrist** (VO2 max, resting heart rate, lean mass from entered body fat) carry device error that no age formula can remove.

```sketch
{"kind": "compare", "alt": "What each age figure leaves out or depends on.", "columns": [{"title": "Garmin Fitness Age", "tone": "blue", "items": ["Fitness only", "Leaves out sleep, steps, strength", "Moves when VO2 max moves", "Wrist VO2 max is a model"]}, {"title": "WHOOP Age", "tone": "orange", "items": ["Sleep and activity included", "Stacks nine uncertain estimates", "Needs 21 Recoveries in 31 days", "Company research, not independent"]}, {"title": "Pulse Age", "tone": "green", "items": ["Sleep and activity included", "Stacks nine uncertain estimates", "Needs at least 5 of 9 inputs", "Never more than 15 years off"]}], "caption": "From the post's sources and Pulse's documentation."}
```

## Which should you pay attention to

If you only care about aerobic fitness and run or ride regularly, Fitness Age is a fine summary and needs no extra work. If you want a broader habits view, a six-month figure plus a 30-day pace is better than a daily number. Pick one and watch its trend over months; don't compare a Garmin value with a WHOOP value, because they answer different questions and will not match.

Don't treat any of them as a health result. A resting heart rate that has crept up, breathlessness on stairs or unexplained fatigue is a reason to see a doctor, whatever the age figure says.

## Sources

1. [Garmin: what is your Garmin fitness age? How can you lower it?](https://www.garmin.com/en-GB/blog/?p=11062)
2. [WHOOP: Healthspan Data Meets Longevity](https://www.whoop.com/thelocker/Healthspan-Data-Meets-Longevity)
3. [WHOOP: how Healthspan on WHOOP helps you optimize longevity](https://www.whoop.com/thelocker/how-healthspan-on-whoop-helps-you-optimize-longevity)
4. [Pulse: how Pulse Age works](https://pulse.portlabs.in/metrics/pulse-age/)
