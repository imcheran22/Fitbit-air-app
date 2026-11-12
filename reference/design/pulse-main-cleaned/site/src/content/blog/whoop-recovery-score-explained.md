---
title: "What a WHOOP Recovery score actually measures"
description: "WHOOP Recovery is a 0-100% morning score from overnight HRV, resting heart rate, respiratory rate and sleep. What it can tell you, what WHOOP does not publish."
published: "2026-06-26"
checked: "2026-10-09"
tags: [whoop, recovery, hrv]
keywords: ["whoop recovery score meaning", "how is whoop recovery calculated", "what does whoop recovery mean", "whoop recovery green yellow red", "whoop recovery hrv"]
---

A WHOOP Recovery score is a percentage, 0 to 100, worked out when you wake from last night's sleep. It compares your overnight heart rate variability, resting heart rate, respiratory rate and sleep against your own recent baseline. It is a guess at how ready your body is for load today. It is not a measure of how tired you feel.

## What goes in

WHOOP's own writing names four inputs. Its podcast post on the recovery algorithm update says respiratory rate was added as the fourth, after heart rate variability (HRV), resting heart rate (RHR) and sleep performance. According to search excerpts of WHOOP's current help article, it now also mentions skin temperature, blood oxygen and, for some members, menstrual cycle phase. That article could not be opened directly, so treat that longer list as reported rather than confirmed.

- **HRV.** Measured overnight, mostly in slow-wave sleep, and compared with your own averages over recent weeks. WHOOP's explainers describe a 30-day baseline. Higher than your baseline pushes the score up.
- **Resting heart rate.** Lower than your norm helps; higher counts against you.
- **Respiratory rate.** Usually very steady from night to night. A large change can be a sign that something, often illness, is going on.
- **Sleep.** Sleep performance, WHOOP's measure of how much sleep you got against how much it thinks you needed.

The key word is baseline. A Recovery of 70% does not mean your HRV was good in any absolute sense. It means your HRV, resting heart rate and the rest were better than your own recent pattern.

```sketch
{"kind": "flow", "alt": "Overnight HRV, resting heart rate, respiratory rate and sleep, each compared with your own baseline, feed one Recovery score.", "inputs": ["HRV", "Resting heart rate", "Respiratory rate", "Sleep performance"], "output": "Recovery, 0 to 100%", "note": "Each judged against your own baseline. Weights not published.", "caption": "The four inputs WHOOP names."}
```

## How much each input counts

WHOOP does not publish the weights. Its own material says HRV carries the most weight and that sleep contributes less than HRV does. That is all. Anyone claiming to know the exact split is working from reverse-engineering or guesswork, and WHOOP can change the algorithm without notice, as it did when respiratory rate was added.

## The colours

WHOOP shows Recovery as green, yellow or red. The ranges usually quoted are 67-100% green, 34-66% yellow and 1-33% red. WHOOP's page could not be re-read to confirm those exact cut-offs, so check the app's own legend if the exact line matters to you. What WHOOP says each colour is for is simpler: green, you are ready to perform; yellow, maintain; red, rest.

For a sense of scale, WHOOP's member-averages article puts the average Recovery at 58%, with average HRV of 64 ms and average resting heart rate of 56 bpm. These are averages across members, who skew towards people who already care about fitness, so they are not a target. HRV in particular varies a great deal between people ([what is a good HRV by age](/blog/good-hrv-by-age/) covers why).

```sketch
{"kind": "bands", "alt": "A 0 to 100 percent scale split into red, yellow and green Recovery bands, with the 58 percent member average marked.", "min": 0, "max": 100, "unit": "%", "bands": [{"to": 33, "label": "Red: rest", "tone": "red"}, {"to": 66, "label": "Yellow: maintain", "tone": "yellow"}, {"to": 100, "label": "Green: perform", "tone": "green"}], "markers": [{"at": 58, "label": "Member average 58%"}], "caption": "Cut-offs as usually quoted, not confirmed on WHOOP's page. Average from WHOOP's member-averages article."}
```

## When the score does not change during the day

Recovery is fixed once it is calculated in the morning. A great workout at noon or a bad afternoon does not change it; tomorrow's score will reflect it instead. The only exception is editing your sleep, for example if the app counted a nap or missed a stretch of sleep. That is worth knowing if you check it at 6 p.m. and wonder why it has not moved.

## What the score can and cannot tell you

It is useful for patterns. Many people find a few things reliably drag HRV down and resting heart rate up: alcohol, a late meal, a hard evening session, a bad night, early illness. For some people a late dinner and two beers can cost 10 ms of HRV or more. A Recovery that stays low for several days after a change in routine is information you can act on.

It is less useful as a verdict on a single morning. A wrist sensor reads HRV during one night, and one night is noisy. WHOOP has not published a validation of the Recovery score against an outside standard, as far as could be found, so the number is best read as a personal trend rather than as a diagnosis. If your resting heart rate has jumped by 10 beats or more for several days, or your respiratory rate has changed a lot and you feel unwell, speak to a doctor rather than to the app.

Two other limits are worth stating. The score is the same output for the athlete who needs a hard block and for the person with a stressful job and a toddler; it cannot tell why the vitals moved. And a low Recovery is not a command: WHOOP's own framing is guidance about how much load to take on, not a ban on training.

## Getting a similar kind of score from a Fitbit

Google's Daily Readiness is its own score, and the Google Health API does not pass it to other apps. What it does pass is HRV, resting heart rate, respiratory rate, skin temperature and sleep, which are the same families of input.

Pulse, a free app you host yourself, builds a 0-100% Recovery from those inputs for the Fitbit Air. Unlike WHOOP, it publishes its weights: HRV 55%, resting heart rate 20%, sleep performance 15%, respiratory rate 5% and skin temperature 5%, each judged against your own baseline, with green from 67% ([how Recovery works](/metrics/recovery/)). It is Pulse's formula, not WHOOP's, and the numbers will not match WHOOP's. Pulse needs seven nights of HRV before it gives a first score, and it has been tested with the Fitbit Air only.

```sketch
{"kind": "flow", "alt": "Pulse's Recovery weights: HRV 55%, resting heart rate 20%, sleep performance 15%, respiratory rate 5% and skin temperature 5%.", "inputs": [{"label": "HRV", "note": "55%"}, {"label": "Resting heart rate", "note": "20%"}, {"label": "Sleep performance", "note": "15%"}, {"label": "Respiratory rate", "note": "5%"}, {"label": "Skin temperature", "note": "5%"}], "output": "Pulse Recovery, 0 to 100%", "note": "Green from 67%", "caption": "Pulse's published weights."}
```

## Why HRV does the heavy lifting

HRV is the variation in time between heartbeats, and it reflects the balance of the autonomic nervous system. Measured during deep sleep it is less disturbed by movement, posture and digestion than a daytime reading, which is why WHOOP and most other wearables anchor on the overnight figure. The catch is that a single night's number is influenced by many things unrelated to training, so a score leaning heavily on it will swing. This is the reason a rolling baseline, rather than a fixed norm, is used by every vendor that publishes how it works. [How HRV is measured and what moves it](/metrics/hrv/) goes into the detail.

## Checks if your Recovery looks wrong

1. Look at the sleep first. A short night or a badly detected one drags the score down on its own.
2. Check for a shifted baseline: a recent illness, a new training block or a change in medication can all move HRV for weeks.
3. Compare against a week, not yesterday.
4. Remember alcohol, late meals and late exercise before blaming the algorithm.

WHOOP is a trademark of WHOOP, Inc. Pulse is not affiliated with or endorsed by WHOOP.

## Sources

1. [WHOOP, Recovery algorithm update (podcast 84)](https://www.whoop.com/us/en/thelocker/podcast-84-recovery-update/)
2. [WHOOP, How does WHOOP Recovery work 101](https://www.whoop.com/us/en/thelocker/how-does-whoop-recovery-work-101/)
3. [WHOOP support, WHOOP Recovery](https://support.whoop.com/s/article/WHOOP-Recovery?language=en_US)
4. [WHOOP, member averages for recovery, strain, sleep and HRV](https://www.whoop.com/thelocker/member-averages-recovery-strain-sleep-hrv/)
