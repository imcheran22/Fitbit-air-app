---
title: "Cardio Load vs Strain: what the numbers mean"
description: "Fitbit's Cardio Load is an open-ended daily total with no published scale; Strain is a capped 0-21 score. What each measures and why they don't convert."
published: "2026-06-06"
checked: "2026-10-09"
tags: [fitbit, training-load, strain]
keywords: ["fitbit cardio load meaning", "cardio load vs whoop strain", "what is a good cardio load", "fitbit cardio load vs active zone minutes", "fitbit cardio load explained"]
---

Cardio Load and Strain both turn a day of heart rate into one number, but they are built differently. Cardio Load is an open-ended running total that resets at midnight and has no published unit. Strain, on WHOOP and in Pulse alike, sits on a capped 0 to 21 scale. You can compare the ideas, not the numbers.

## What Cardio Load is

Google's help page says Cardio Load is based on the TRIMP (TRaining IMPulse) model, "a well-established method to assess your training load". Inputs are your heart rate during activity, your age, resting heart rate and sex. Both duration and intensity count, so a hard 30 minutes and an easy 90 can land in a similar place.

Three details from that page are worth knowing:

- Daily accrual resets to zero at midnight, though each day still counts toward your weekly target.
- There is "no practical maximum" on a day.
- The page does not state a unit. Google's help material does not give one, and the numbers you see in the app are not described as minutes, points or percentages.

A Google research paper on adaptive targets (Phillips, Roggen, Speed and Harle, arXiv 2508.11613) describes it as "a measure of cardiovascular work (also known as training load) resulting from all the user's activities across the day". It says the metric is based on heart rate reserve and captures both intensity and duration, and that it builds up during workouts and during incidental daily movement. The same paper contrasts it with Active Zone Minutes: AZM for health guidelines, Cardio Load for performance measurement.

## What Strain is

Strain is a score for the same kind of thing, the cardiovascular work of a day, but squeezed onto a fixed scale. WHOOP's own material describes Strain as a 0 to 21 scale that is logarithmic, personalised, and does not publish the exact formula. Its bands are Light 0 to 9, Moderate 10 to 13, High 14 to 17 and All out 18 to 21.

Pulse's version is documented in full, so it makes a clean worked example. Pulse works from heart rate reserve, the gap between your resting and maximum heart rate. Each minute earns points by how far into that reserve you are:

| Share of heart-rate reserve | Points a minute |
|---|---|
| Below 50% | 0 |
| 50-59% | 1 |
| 60-69% | 2 |
| 70-79% | 3 |
| 80-89% | 4 |
| 90% and up | 5 |

The day's points then go on a log scale: Strain = 21 × ln(points + 1) ÷ ln(7,201), where 7,201 is a whole day at 5 points a minute, plus one. One hour at 70-79% with nothing else gives 180 points and a Strain of about 12.3. Doubling your points adds only about 1.6. That is the point of the log scale: the first hours are cheap, and the last few points are hard to earn.

```sketch
{"kind": "steps", "alt": "How Pulse turns a day of heart rate into a Strain score in four steps.", "steps": [{"title": "Find your reserve", "text": "Maximum minus resting heart rate"}, {"title": "Score each minute", "text": "0 to 5 points by share of reserve"}, {"title": "Add up the day", "text": "A running total until midnight"}, {"title": "Log-scale it", "text": "21 × ln(points + 1) ÷ ln(7,201)"}], "caption": "Pulse's published Strain method."}
```

Pulse's bands are Light under 10, Moderate 10 to 13.9, Strenuous 14 to 17.9, All out 18 and above.

```sketch
{"kind": "bands", "alt": "Pulse Strain bands on the 0 to 21 scale: Light, Moderate, Strenuous and All out.", "min": 0, "max": 21, "bands": [{"to": 10, "label": "Light", "tone": "teal"}, {"to": 14, "label": "Moderate", "tone": "yellow"}, {"to": 18, "label": "Strenuous", "tone": "orange"}, {"to": 21, "label": "All out", "tone": "red"}], "caption": "Pulse's Strain bands."}
```

[How Strain works](/metrics/strain/) has the rest, including the minimum data it needs.

## The differences that matter

| | Cardio Load | Strain (Pulse, 0-21) |
|---|---|---|
| Scale | Open-ended, no stated maximum | Capped at 21, logarithmic |
| Unit | Not stated by Google | Points per minute, then a 0-21 score |
| Method | TRIMP; heart rate reserve | Heart-rate-reserve zones, log-scaled |
| Resets | Midnight | Midnight to midnight, a running total until then |
| Weekly view | Yes, with a Target Load | A daily target, plus a 7-day against 28-day ratio |
| Published formula | Model named, constants not | Fully documented |

The log scale is the biggest practical gap. On a capped scale, a long easy day and a hard session can end up nearer than you'd expect, and two very hard days look similar. With an open-ended total, a day twice as hard really does show as roughly twice the number. That makes Cardio Load better for adding up a week, and Strain better for a quick "how big was today".

## Why you can't convert one to the other

Without a published unit or constants for Cardio Load, any conversion factor would be a guess. Even if the shape of both is "heart-rate reserve, intensity-weighted", the weights differ, and one is logarithmic while the other, as far as Google says, is not. A Cardio Load of 100 on one day and 100 on another tells you they were the same size for you. It says nothing about what that would be on a 0-21 scale.

The same goes for the comparison with WHOOP. WHOOP's Strain also depends on how WHOOP weights heart-rate zones, which it does not publish in full. If you move from one system to another, expect to relearn what a "big day" looks like.

## What is a good Cardio Load?

There is no universal good number. Google's own approach is relative: Target Load is a suggested weekly range, and the free version follows your average over the previous 4 weeks. If you do not have Google Health Premium, that is how the target is set. With Premium and the coach on, the coach sets a weekly target from a Training Focus of Recovery, Maintain or Build.

So the useful question is not "is 150 good" but "is today in line with my week". That is also the idea behind Pulse's [training balance](/metrics/training-balance/): your last 7 days of Strain divided by your last 28, where 1.00 means this week matches your usual, 0.80 to 1.29 is balanced and 1.30 and above is rising faster than you are used to. The 0.8 to 1.3 sweet spot is usually traced to team-sport injury research by Gabbett (2016). It is a rule of thumb, not a law, and those exact thresholds could not be confirmed in the 2016 paper itself.

## Cardio Load and Active Zone Minutes

People ask this a lot, so briefly. Google's Active Zone Minutes page says you earn 1 minute for each minute in the moderate zone and 2 for each minute in the vigorous or peak zones, with zones personalised by fitness level and age. That is a simple count tied to health guidelines. Cardio Load weights intensity continuously and also picks up everyday movement. A gentle walk can add Cardio Load without earning many Zone Minutes. The page on Active Zone Minutes does not itself compare the two, so the framing above leans on the research paper.

## What both of them miss

Both use heart rate, so both under-count effort that barely lifts it. Heavy lifting with long rests is the usual example. A cold morning, caffeine, dehydration and heat can all push heart rate up without extra work, which inflates the numbers. Neither is a measurement of how hard a day felt.

## Where Pulse fits

Google does not expose Cardio Load or Target Load through its API, so Pulse cannot show you Google's numbers. It reads heart rate and computes its own Strain and Strain Target from that, as described above. If you'd like a capped 0-21 figure to sit next to the app's Cardio Load, Pulse is a free app you host yourself, built and tested on the Fitbit Air only; other devices that sync to Google Health send the same data types but haven't been tested.

## Sources

1. [Cardio load and target load (Google Health Help)](https://support.google.com/googlehealth/answer/15402655?hl=en)
2. [Phillips, Roggen, Speed, Harle: Adaptive Cardio Load Targets for Improving Fitness and Performance, arXiv 2508.11613](https://arxiv.org/abs/2508.11613)
3. [Active Zone Minutes (Google Health Help)](https://support.google.com/googlehealth/answer/14236509)
4. [How does WHOOP Strain work (WHOOP)](https://www.whoop.com/thelocker/how-does-whoop-strain-work-101/)
5. [Gabbett TJ. The training-injury prevention paradox, Br J Sports Med 2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC4789704)
