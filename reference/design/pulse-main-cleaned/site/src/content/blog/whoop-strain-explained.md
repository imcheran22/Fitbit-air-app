---
title: "WHOOP Strain explained: scale, levels, what is good"
description: "WHOOP Strain is a 0-21 score of a whole day's cardiovascular load. What the bands mean, why it is logarithmic, and how to get a similar number from a Fitbit."
published: "2026-06-10"
checked: "2026-10-09"
tags: [whoop, strain, fitbit]
keywords: ["whoop strain explained", "what is a good whoop strain", "whoop strain scale", "whoop strain levels", "whoop strain vs fitbit cardio load"]
---

WHOOP Strain is a score from 0 to 21 that measures how hard your cardiovascular system worked over a day. It is built mostly from heart rate, and the scale is not linear: going from 10 to 11 takes much less effort than going from 20 to 21. A "good" Strain depends on how recovered you are, not on a fixed number.

## What the 0-21 scale means

WHOOP says the scale is inspired by the Borg Rating of Perceived Exertion, the old 6-20 effort scale used in exercise physiology. Its own articles split the range into four bands:

| Strain | WHOOP's label | What WHOOP says it means |
|---|---|---|
| 0-9 | Light | Minimal cardiovascular stress, suits active recovery |
| 10-13 | Moderate | Maintains fitness without needing much recovery |
| 14-17 | High | Significant stress that builds fitness if recovery keeps up |
| 18-21 | All out | Overreaching, one or more easier days afterwards |

WHOOP says reaching 21 takes an extraordinary amount of exertion, the sort of thing seen in an ultramarathon or an Ironman. WHOOP does not publish a typical daily figure here, so judge your own days against your own history.

## How it is calculated

WHOOP does not publish the formula. What it does say, in its Strain articles, is that the score combines two things:

- **Cardiovascular load.** Heart rate is tracked all day, not only during workouts. Time in your personal heart-rate zones counts, and higher zones are weighted more heavily. The zones are set from your own maximum and resting heart rate.
- **Muscular load.** For strength work and similar activities, WHOOP adds an estimate of muscular effort, from motion sensors or from sets and reps you log with its Strength Trainer feature. This is the part that lets a weights session register even when your heart rate barely moves.

```sketch
{"kind": "flow", "alt": "Cardiovascular load and muscular load combine into the day's Strain score from 0 to 21.", "inputs": [{"label": "Cardiovascular load", "note": "heart rate, all day"}, {"label": "Muscular load", "note": "strength work"}], "output": "Strain, 0 to 21", "note": "WHOOP does not publish the formula.", "caption": "What WHOOP says goes into Strain."}
```

Because the scale is logarithmic, the first hours of moderate effort move the number quickly and the later hours barely move it. That is deliberate. It stops one long day from running off the end of the scale, and it means a 16 and an 18 are further apart in effort than the two-point gap suggests.

```sketch
{"kind": "line", "alt": "A curve that rises steeply at first and then flattens, showing how later effort moves Strain less.", "series": [{"label": "Strain", "points": [0, 6, 10, 13, 15, 16.5, 17.5, 18.2, 18.7, 19], "tone": "orange"}], "yLabel": "Strain", "min": 0, "max": 21, "notes": [{"at": 2, "text": "early effort moves it fast"}, {"at": 8, "text": "later effort barely moves it"}], "caption": "Illustration, not real data."}
```

Strain also counts the whole day. Illness, a stressful commute and caffeine can all raise your heart rate, and all of it can show up as Strain. If a rest day shows 9 and you did nothing, that is usually why.

## What is a good Strain?

There is no good number in isolation. WHOOP's Strain Target pairs the day's suggested Strain with your Recovery that morning: a green Recovery supports a higher target, a red one a lower one. The sensible reading is the one the table above hints at. A 14 on a green day is training. A 14 on a red day is a debt you will probably feel tomorrow.

If you are comparing yourself with other people, don't. Your maximum heart rate, your resting heart rate and your fitness all change what a given session costs you, and the only fair reference is your own history.

## Where a heart-rate-only score falls short

Heart rate is an indirect measure of effort. It lags at the start of an interval, it drifts upward with heat and dehydration, and it misses efforts where the muscles work hard but the heart does not, such as heavy lifting with long rests. WHOOP's muscular-load estimate exists to patch exactly that gap, and nobody outside the company can check how well it does. If a score of yours looks off, remember that you are looking at a proprietary model.

## Getting a similar number from a Fitbit

Google's own score is called Cardio Load. It is not on the same scale and is not a 0-21 figure, so it does not translate directly; [Cardio Load vs Strain](/blog/cardio-load-vs-strain/) goes through the differences. The Google Health API also does not hand third-party apps Google's scores, only the underlying data such as heart rate.

That raw heart rate is enough to compute a day score of your own. Pulse, a free app you host yourself, does this for the Fitbit Air: it converts each minute into points by how far into your heart-rate reserve you are, then puts the day's total on a logarithmic 0-21 scale ([how Strain works](/metrics/strain/)). That is Pulse's formula, published in full, not WHOOP's. The two will not agree number for number, and Pulse has been built and tested with the Fitbit Air only; other devices that sync to Google Health send the same data types but have not been tested.

If you want a target to aim at rather than a number to look at, the same idea applies as with WHOOP: pair the day's load with how recovered you are ([how Strain Target works](/metrics/strain-target/)).

## A worked example of why the curve is lopsided

Take two people with the same resting heart rate and the same maximum. One runs easily for an hour and sits in the mid zones most of that time. The other does the same run and then adds a second hour of hard intervals. On a linear scale the second person would score roughly double. On WHOOP's curve the second person might gain only a few points, because each extra point of Strain costs more than the last. That is why it feels strange when a brutal second session barely moves the number, and why people who chase a high Strain end up doing a great deal more work for each point.

It also explains the common surprise that a long, easy day can score higher than a short hard one. Hours matter. A day on your feet at 50-60% of your heart-rate reserve adds up quietly, and the curve rewards that more than most people expect.

## Reading your own Strain in practice

Look at a week, not a day. If your Recovery is regularly yellow or red and your Strain regularly sits at 14 or above, the mismatch is the signal. If Strain is always under 10 and you want to improve fitness, that is the opposite signal. Whatever app you use, the trend matters more than any single score.

WHOOP is a trademark of WHOOP, Inc. Pulse is not affiliated with or endorsed by WHOOP.

## Sources

1. [WHOOP, How does WHOOP Strain work 101](https://www.whoop.com/us/en/thelocker/how-does-whoop-strain-work-101/)
2. [WHOOP, Strain Target (Strain Coach)](https://www.whoop.com/us/en/thelocker/strain-coach/)
3. [WHOOP support, WHOOP Strain](https://support.whoop.com/hc/en-us/articles/360019453214-WHOOP-Strain)
4. [WHOOP community, how WHOOP measures strain for different activities](https://www.community.whoop.com/t/how-does-whoop-measure-strain-for-different-activities-like-hiit-yoga-and-weightlifting/106)
