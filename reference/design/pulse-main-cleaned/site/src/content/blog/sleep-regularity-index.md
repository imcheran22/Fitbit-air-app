---
title: "How to improve your sleep regularity"
description: "What moves your Sleep Regularity Index, with worked examples of late weekends and naps, and the research on why a regular schedule matters."
published: "2026-07-25"
tags: [sleep, recovery]
keywords: ["how to improve sleep consistency", "how to improve sleep regularity", "sleep regularity vs duration", "irregular sleep schedule effects"]
---

The Sleep Regularity Index (SRI) is the chance, from 0 to 100, that you are in the same state, asleep or awake, at a given clock time as you were at the same time 24 hours earlier. Score 100 and you sleep identical hours every day. Score near 0 and your schedule might as well be random. It rewards timing, not duration.

Here's a quick way to feel what it measures. Sleep 23:00 to 07:00 every night for a week and you score 100. Now sleep two hours later on two nights, 01:00 to 09:00. The number doesn't drop to something dramatic: it falls to about 89. Keep reading for the arithmetic.

## Where the index comes from

Andrew Phillips and colleagues introduced it in a 2017 paper in *Scientific Reports*, "Irregular sleep/wake patterns are associated with poorer academic performance and delayed circadian and sleep/wake timing" ([doi:10.1038/s41598-017-03171-4](https://doi.org/10.1038/s41598-017-03171-4)). They followed 61 undergraduates for 30 days with sleep diaries and measured circadian timing in the most and least regular sleepers.

Three findings stand out:

- Students with irregular sleep had a later circadian phase. Their dim-light melatonin onset averaged 00:08 against 21:32 for the regular group.
- Regularity correlated with grades (r = 0.37).
- Average sleep duration didn't differ much between the two groups. Two people can sleep the same eight hours and score very differently.

The authors' modelling suggested the timing gap came mostly from differences in light exposure. That's a model, not a trial, and the sample is small, one college, and correlational. It is the paper that defined the metric, not proof that changing it changes your health.

## The formula

Split the days into one-minute epochs and mark each one asleep or awake. For every minute, compare it with the same minute the next day. The index is:

**SRI = −100 + 200 × (the share of comparisons where the two states match)**

Match every time and you get −100 + 200 = 100. Match half the time, which is what random sleep does, and you get 0. It can go below zero if your schedule is anti-regular, such as sleeping 12 hours apart on alternate days.

### A worked example

Take seven days and six day-to-day pairs, each pair covering 24 hours, 144 hours of comparison in total.

Sleep 23:00 to 07:00 on every night except two, on which you sleep 01:00 to 09:00. Say the late nights are Friday and Saturday. Compare Thursday with Friday: you were asleep 23:00 to 01:00 on Thursday but not on Friday, and asleep 07:00 to 09:00 on Friday but not on Thursday. That is 4 hours of mismatch. Saturday to Sunday does the same: another 4 hours. Friday to Saturday matches perfectly.

Mismatch is 8 of 144 hours, so 94.4% of minutes match. SRI = −100 + 200 × 0.944 = **88.9**.

Make the late nights four hours late instead of two and the mismatch doubles to 16 hours: 88.9% match, an SRI of **77.8**. A one-hour nap on a single day adds 2 hours of mismatch (it appears once on each side), which costs about 2.8 points.

```sketch
{"kind": "flow", "alt": "How two late weekend nights give a Sleep Regularity Index of 88.9", "inputs": ["Six day-to-day pairs, 144 hours", {"label": "Thursday to Friday", "note": "4 h mismatch"}, {"label": "Saturday to Sunday", "note": "4 h mismatch"}], "output": "SRI 88.9", "note": "94.4% of minutes match", "caption": "The worked example above."}
```

Real devices add wrinkles. Wrist trackers don't record brief wakes inside a night, so they tend to read somewhat higher than the research accelerometers, which can see fragmented sleep. Don't compare a Fitbit SRI to a published one too literally.

## What counts as a good score

There's no universally agreed target. The best reference point is Windred and colleagues' 2024 paper in *Sleep*, "Sleep regularity is a stronger predictor of mortality risk than sleep duration" ([doi:10.1093/sleep/zsad253](https://doi.org/10.1093/sleep/zsad253)). They calculated SRI from a week of wrist accelerometer data in 60,977 UK Biobank adults (mean age 62.8) and followed them for a mean of 6.3 years, during which 1,859 died.

The median SRI was 81.0, and the middle half of people fell between 73.8 and 86.3. Compared with the least regular fifth, each of the top four fifths had 20% to 48% lower all-cause mortality risk after adjustment. In their models SRI predicted all-cause mortality better than sleep duration did, and adding duration didn't significantly improve the fit. For cardiometabolic deaths specifically, regularity lost significance once duration was included.

```sketch
{"kind": "bands", "alt": "Windred and colleagues' SRI spread: the middle half of people scored between 73.8 and 86.3", "min": 0, "max": 100, "bands": [{"to": 73.8, "label": "Lowest quarter", "tone": "orange"}, {"to": 86.3, "label": "Middle half", "tone": "green"}, {"to": 100, "label": "Top quarter", "tone": "teal"}], "markers": [{"at": 81, "label": "Median 81.0"}], "caption": "SRI in 60,977 UK Biobank adults, Windred et al. 2024."}
```

Read that with the authors' own caveats in mind: about one week of data per person, an older and mostly White sample, and an observational design. Irregular sleep may drive risk, or it may be a marker of something else, such as shift work or illness. The paper doesn't show that making your sleep more regular lowers your risk.

So a rough reading: around 80 is typical for that older UK group; the 70s is on the low side, high 80s on the regular side. For a Fitbit-style tracker, shade that up a little because of the point above.

## What actually moves it

Think of the index as the sum of every night where your schedule differs from yesterday's. A few observations follow from the arithmetic.

1. **Weekend shifts do most of the damage.** Two nights a few hours late can cost 11 to 22 points, as the examples showed. Moving your weekend bedtime by an hour costs far less.
2. **Wake time is the lever you control.** It's hard to fall asleep to order, but an alarm is easy. A fixed wake time pulls the whole pattern in, and tiredness at the right hour follows.
3. **Naps count.** The index treats a nap as sleep at an irregular time. One hour costs about 2.8 points over a week. That is small, but a daily 90-minute nap at varying hours adds up.
4. **Light timing.** Phillips's modelling pointed at light as the cause of the delayed rhythms, so morning daylight and dim evenings are the obvious things to try. Treat it as a reasonable experiment, not a proven fix.
5. **Travel and shift work shift the whole window.** Expect a dip for as long as the disrupted days sit inside the window.

One more honest point: a perfect 100 isn't the goal. A schedule that's identical because you are sleeping 5 hours every night is regular and bad. Duration and regularity are separate questions.

## Checking yours

You can compute an SRI by hand from a sleep diary using the formula above, or read it from an app. Some sleep trackers report a regularity or consistency figure; they aren't all the same maths, so find out what yours uses. Pulse, a free app you host yourself, computes a 7-day SRI from your Google Health sleep sessions using Phillips's definition, shows it from 0 to 100%, and counts it as 10% of its Sleep Performance score ([how Sleep consistency works](/metrics/sleep-consistency/)). It's built and tested with a Fitbit Air only.

If your number looks low, check the cause before the cure. Is it two late weekend nights, one long daily nap, or a night shift? The fix is different for each.

## Sources

1. Phillips AJK, Clerx WM, O'Brien CS, et al. [Irregular sleep/wake patterns are associated with poorer academic performance and delayed circadian and sleep/wake timing](https://doi.org/10.1038/s41598-017-03171-4). *Scientific Reports* 7, 3216 (2017).
2. Windred DP, Burns AC, Lane JM, et al. [Sleep regularity is a stronger predictor of mortality risk than sleep duration: a prospective cohort study](https://doi.org/10.1093/sleep/zsad253). *Sleep* 47(1), zsad253 (2024).
3. [Windred et al. 2024, full text at Oxford Academic](https://academic.oup.com/sleep/article/47/1/zsad253/7280269)
