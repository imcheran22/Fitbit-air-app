---
title: "WHOOP Journal: which behaviours move your recovery"
description: "How WHOOP Journal turns yes/no entries into Behavior Insights, how many entries it needs, which behaviours to log first, and why the results are correlations."
published: "2026-08-11"
checked: "2026-10-09"
tags: [whoop, recovery, sleep]
keywords: ["whoop journal list", "whoop journal what to track", "whoop journal insights", "whoop behavior insights", "whoop journal tips"]
---

WHOOP Journal is a daily yes/no questionnaire. Once a behaviour has at least 5 "yes" and 5 "no" answers inside 90 days, WHOOP compares how your recovery and sleep looked after each kind of day and shows the difference. It describes patterns in your own data. It does not prove that the behaviour caused anything.

## How the insight is produced

WHOOP's Journal help page says a member needs to record five "yes" and five "no" answers for one behaviour in a 90-day window before analysis unlocks. The Insights button shows progress towards that threshold. Early coverage of the feature at launch described a looser rule of five entries in total, so older articles and forum posts you find may quote a different number. The current figure is the one on WHOOP's own page.

WHOOP does not publish the statistics it runs on top of that, such as whether it reports a margin of error. What it shows you is the effect of a behaviour on next-day recovery and sleep. The feature was previously called Recovery Insights, and some pages still refer to an "Impacts" tab, which is why searches turn up three names for one thing.

So the mechanism is a comparison between two piles of days. Take your 12 days with alcohol and your 40 without. Look at the average Recovery the following morning in each pile. If the first is lower by some distance, that behaviour is flagged.

```sketch
{"kind": "flow", "alt": "Days with a yes and days with a no for one behaviour are compared on next-day recovery and sleep.", "inputs": [{"label": "Days answered yes", "note": "at least 5", "tone": "orange"}, {"label": "Days answered no", "note": "at least 5", "tone": "blue"}], "output": "Compare next-day Recovery and sleep", "note": "Within a 90-day window", "caption": "Threshold from WHOOP's Journal help page."}
```

## Which behaviours to log first

The questions on offer are many and you choose which ones to answer. The sensible way to use it is to pick a small number and keep them for months, because the five-and-five rule is a floor, not a comfortable sample.

Start with behaviours that vary in your life and have a plausible mechanism:

- **Alcohol.** Usually the strongest effect people see on next-morning HRV and resting heart rate, and the clearest "yes" and "no" split.
- **Late caffeine.** Defined by you: after 2 pm, say. Decide the rule once so the answer means the same thing in January and in March.
- **Late or large meals.** Eating close to bedtime raises resting heart rate overnight for some people.
- **Screens in bed, a late workout, stress, travel.** Each has a mechanism for sleep, though the answers are subjective.
- **Something you do rarely.** If a behaviour happens twice a month you'll wait half a year to reach five "yes" days, so don't expect an answer soon.

Avoid logging dozens at once. With many behaviours and a few months of data, some will look significant by chance alone. Ten tests at a loose threshold will usually hand you one false lead.

## Why correlation misleads here

Everything in this feature rests on days being comparable apart from the one behaviour. Real days are not.

Behaviours cluster. If you drink on Saturdays, you also stay up late and skip your morning routine on Saturdays. The alcohol "yes" pile is also the late-bedtime pile, and the insight can't separate them. Training load matters too: a hard session the day before lowers recovery on its own, and if you tend to log "stretching" on hard days, stretching can look harmful.

```sketch
{"kind": "flow", "alt": "Alcohol, a late bedtime and a skipped routine all land on the same days, so the insight cannot separate them.", "inputs": [{"label": "Drink on Saturday", "tone": "orange"}, {"label": "Stay up late", "tone": "orange"}, {"label": "Skip morning routine", "tone": "orange"}, {"label": "Hard session the day before", "tone": "orange"}], "output": "Lower recovery next morning", "tone": "red", "note": "Which one caused it?", "caption": "Illustration of how behaviours cluster."}
```

Illness is another confounder. A cold lowers HRV for several days and may coincide with a stretch of no alcohol, which makes abstinence look worse than it is.

Direction can also run backwards. People who sleep badly may drink more coffee the next day, so a behaviour logged after a bad night can look like the cause of the next one.

None of this makes the tool useless. It makes it a source of hypotheses. A good test is to run a deliberate experiment: two weeks without the behaviour, then two weeks with it at a fixed time, holding everything else steady, and see whether the pattern survives.

## Making the data cleaner

- **Log at the same time each day** and use the same definition. A journal entry made from memory three days later is weak.
- **Decide a threshold** for fuzzy behaviours. "Stress" is easier to answer consistently as "had a deadline" than as a feeling.
- **Give each behaviour at least 90 days** before drawing a conclusion. Three weeks shows you a coincidence.
- **Look at size, not only direction.** A behaviour that lowers recovery by two points is not worth giving up. One that lowers it by 15 might be.
- **Keep an eye on sleep, not just recovery.** Some behaviours leave Recovery alone but cost you sleep efficiency.

## Doing the same on your own data

If you'd rather run this kind of comparison on Google Health data you already have, Pulse, a free app you host yourself, has a journal with the same yes/no idea ([how behaviour insights work](/metrics/behaviour-insights/)). For each behaviour it compares the next day's Recovery, HRV and Sleep Performance on "yes" days against "no" days, needing at least 5 of each in 90 days. It then resamples your days 1,000 times and shows whether the middle 90% of the possible differences sits clearly above or below zero, or crosses zero (no clear effect).

Pulse is plain about the limits: it does not adjust for other behaviours or training load, and about 1 in 10 behaviours with no real effect will still show a clear one by chance. It is built and tested with the Fitbit Air only. The point of mentioning it here is the resampling: an average difference alone can't say whether you are looking at an effect or at noise, and a confidence range is one way to tell.

## What to expect after six months

Expect two or three behaviours to stand out, most to show nothing, and some to contradict what you assumed. That is the realistic outcome. A 15-point drop after alcohol is plausible for some people and invisible for others. If the tool tells you that late caffeine doesn't change your sleep, believe it for now and re-check next season.

If a pattern leaves you sleeping badly for weeks, or your resting heart rate stays well above your normal with no cause you can find, that is a reason to talk to a doctor rather than to adjust your journal.

## Sources

1. [WHOOP: a new way to see insights on which behaviors affect your recovery](https://www.whoop.com/ca/en/thelocker/a-new-way-to-see-insights-on-which-behaviors-affect-your-recovery/)
2. [WHOOP: a guide to self-experimentation, optimizing your habits for performance](https://www.whoop.com/us/en/thelocker/a-guide-to-self-experimentation-optimizing-your-habits-for-performance/)
3. [Wareable: WHOOP launches new Insights feature](https://www.wareable.com/fitness-trackers/whoop-launches-new-insights-featur)
