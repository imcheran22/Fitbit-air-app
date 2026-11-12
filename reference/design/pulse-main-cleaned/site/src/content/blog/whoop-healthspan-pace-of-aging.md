---
title: "WHOOP Healthspan and Pace of Aging, explained"
description: "WHOOP Age is a six-month estimate from nine habits and vitals. Pace of Aging is the 30-day speedometer. What goes in, what it means, and what it can't tell you."
published: "2026-07-29"
checked: "2026-10-09"
tags: [whoop, recovery, sleep]
keywords: ["whoop healthspan", "whoop pace of aging", "whoop age meaning", "whoop age calculator", "pace of aging 2x"]
---

WHOOP Age is an estimate of how old your body is behaving, built from your last six months of data. Pace of Aging is how fast that estimate is moving, based on the last 30 days: 1x or higher means you are ageing faster than your baseline, below 1x means slower. Both update weekly.

That is the whole idea. The detail is in what goes in and how far you should trust the number that comes out.

## What WHOOP says it measures

WHOOP's support pages describe WHOOP Age as an estimate of your physiological age from the last six months of your data. If it matches your actual age, WHOOP says you are meeting its recommendations for good long-term health. Pace of Aging runs from -1x to 3x and compares your recent 30-day averages with that six-month picture.

Two details people trip over. Pace of Aging is a speed, not an age: you can have a WHOOP Age four years above your real age and a Pace of Aging below 1x, because the last month was better than the previous five. And because the six-month figure moves slowly, one bad week barely shifts WHOOP Age, though it can shift Pace of Aging.

```sketch
{"kind": "compare", "alt": "WHOOP Age is a slow six-month estimate of body age, while Pace of Aging is a faster 30-day speed.", "columns": [{"title": "WHOOP Age", "tone": "blue", "items": ["An age: how old your body behaves", "Built from the last six months", "Moves slowly", "Updates weekly"]}, {"title": "Pace of Aging", "tone": "orange", "items": ["A speed, not an age", "Based on the last 30 days", "Runs from -1x to 3x", "Updates weekly"]}], "caption": "From WHOOP's support pages."}
```

Healthspan is part of the Peak and Life memberships. WHOOP's page also says it unlocks after 21 Recoveries in a 31-day period, and you need 21 in every 31 days for it to keep updating. That explains the common "Healthspan not updating" complaint: a strap worn on fewer nights than that stops feeding it.

## The nine inputs

WHOOP lists nine contributors:

| Group | Inputs |
|---|---|
| Sleep | Total sleep, sleep consistency |
| Activity | Weekly time in heart-rate zones 1-3, weekly time in zones 4-5, weekly strength training time, daily steps |
| Fitness | VO2 max, resting heart rate, lean body mass |

WHOOP says these were picked because research links them to longevity, and that the method corrects for overlap so one habit isn't counted twice. A third-party write-up of WHOOP's white paper explains the mechanism: each input is tied to a published all-cause mortality hazard ratio, and the hazard ratios are converted to years using Gompertz's law, the observation that human mortality risk roughly doubles every eight years or so. The white paper itself could not be read (whoop.com blocks automated fetching), so treat the specific conversions in that write-up as secondhand. WHOOP does not publish the full set of curves and weights in the pages that could be checked.

The logic is still easy to follow. Say a study finds that people with a resting heart rate 10 bpm higher have about 9% higher mortality risk. Convert that to years, add it to a running total, do the same for the other eight inputs, shrink the total a little for overlap, and you have "years older or younger than your reference". Doing it this way means nothing is measured directly. It is population statistics applied to one person's habits.

```sketch
{"kind": "steps", "alt": "Four steps that turn nine habits into years older or younger than your reference.", "steps": [{"title": "Take a study result", "text": "For example, 10 bpm higher resting heart rate, about 9% higher risk."}, {"title": "Convert to years", "text": "Mortality risk roughly doubles every eight years or so."}, {"title": "Repeat for all nine inputs", "text": "Add each result to a running total."}, {"title": "Shrink for overlap", "text": "The total is reduced a little so no habit counts twice."}], "caption": "The logic as described in this post. WHOOP does not publish its full curves and weights."}
```

## Reading your numbers

A few patterns come up in forums, and they follow from the design.

**Most people start older than their age.** WHOOP says a WHOOP Age equal to your age means you are meeting its recommendations. Those targets are set for health optimisation rather than for the average adult, so an average adult will often land above their real age.

**A Pace of Aging near 1x is normal.** WHOOP describes 1x as the line between improving and worsening, so a reading close to it just says your last month looked much like the previous five. A reading of 0.6x or 1.4x says your last month differed, nothing more. A holiday, an illness or a marathon block can all do it.

**2x or 3x is a short-term swing, not a diagnosis.** Four weeks of poor sleep and no exercise can push it high. That is information about your month. It does not say your organs have aged.

**Several inputs change slowly or are estimated.** VO2 max on a wrist device is a model output. Lean body mass needs you to enter body measurements. Steps and zone minutes are measured but sensitive to wearing the strap consistently.

## What it cannot tell you

It is not a clinical test. WHOOP states Healthspan is for wellness purposes, not medical use, and it is not available under 18. WHOOP also says its internal research found WHOOP Age correlates with perceived health and chronic conditions, which is company research, not independent validation.

The deeper limit is the method. Hazard ratios from large studies describe groups. A study can show that, on average, people who walk more live longer, without proving that adding 3,000 steps will extend your life by a given number of years. Add nine such estimates together and the result looks precise while carrying a lot of uncertainty. Use the direction and the contributor breakdown, not the decimal.

If something worries you about your health, such as a resting heart rate that has crept up for weeks without explanation, see a doctor. No age figure replaces that.

## A different way to use the same idea

If you'd rather see an estimate of this kind from data you already own, Pulse, a free app you host yourself, computes its own Pulse Age and Pace of Aging from your Google Health data ([how Pulse Age works](/metrics/pulse-age/)). It combines fitness, resting heart rate, sleep and activity, each mapped to a published mortality study, averaged over six months, with Pace of Aging from the last 30 days. It needs 5 of the 9 inputs, shows as provisional early on, and stays within 15 years of your real age. It is an estimate, it is not WHOOP's number, and it is built and tested with the Fitbit Air only. Other Google Health devices send similar data but are untested.

The two will not agree to the year. They use different curves and different reference profiles, and neither company's figure is a measurement of your biological age.

## Practical use

- Look at the contributor view, not the headline. It shows which input is costing you years. Sleep consistency and weekly zone minutes are usually the cheapest to change.
- Judge Pace of Aging over four or more weeks. One reading is noise.
- Don't chase VO2 max by gaming the estimate. Real improvement comes from a few hard sessions a week over months.
- If WHOOP Age looks wrong, check the inputs first: body measurements entered, strap worn enough nights, correct age and sex on your profile.

## Sources

1. [WHOOP: Healthspan Data Meets Longevity](https://www.whoop.com/thelocker/Healthspan-Data-Meets-Longevity)
2. [WHOOP: how Healthspan on WHOOP helps you optimize longevity](https://www.whoop.com/thelocker/how-healthspan-on-whoop-helps-you-optimize-longevity)
3. [Gadgets & Wearables: WHOOP Age and Pace of Ageing](https://gadgetsandwearables.com/2025/05/09/whoop-age-pace-of-ageing/)
4. [Gadgets & Wearables: the science behind WHOOP Healthspan](https://gadgetsandwearables.com/2025/08/07/science-behind-whoop-health-span/)
