---
title: "WHOOP sleep need and sleep performance, explained"
description: "How WHOOP sets your nightly sleep need, what Sleep Performance scores, why 100% is hard to hit, and what is and isn't published about the weights."
published: "2026-07-15"
checked: "2026-10-09"
tags: [whoop, sleep]
keywords: ["whoop sleep need", "whoop sleep performance", "whoop sleep need too high", "whoop sleep planner", "whoop sleep debt"]
---

WHOOP's sleep need is the hours it thinks you should sleep tonight: a baseline for your body, plus extra for sleep debt and for a high-strain day, minus any naps. Sleep Performance then scores how last night went against that need, together with consistency, efficiency and sleep stress. WHOOP publishes the ingredients but not the weights.

## Where the "need" number comes from

WHOOP's help material describes sleep need as four moving parts:

- **Baseline.** The sleep your body needs before anything else is applied. WHOOP says it starts learning this when you first wear the strap. A baseline higher than you expected is the usual complaint behind "WHOOP sleep need too high".
- **Strain.** The more physiological load you accumulate in a day, from exercise, stress and ordinary activity, the more sleep WHOOP says you need that night.
- **Sleep debt.** Extra sleep your body requires tonight because of insufficient sleep on previous nights.
- **Naps.** A daytime nap reduces the night's target by its length.

WHOOP also says it looks at your bed and wake times, duration and efficiency over roughly the past 28 days, and smooths out weekend and weekday differences and travel. A WHOOP community post written by a member summarises the model as baseline plus strain plus debt minus naps. The same member reported naps showing as zero in their calculation, which is one user's unconfirmed report and not a documented fault.

```sketch
{"kind": "flow", "alt": "Sleep need is a baseline plus strain and sleep debt, minus naps.", "inputs": [{"label": "Baseline", "note": "+", "tone": "sleep"}, {"label": "Strain", "note": "+", "tone": "orange"}, {"label": "Sleep debt", "note": "+", "tone": "red"}, {"label": "Naps", "note": "-", "tone": "green"}], "output": "Tonight's sleep need", "tone": "sleep", "note": "Exact amounts not published", "caption": "As WHOOP's help material describes it."}
```

The exact amounts are not published. How many minutes a hard day adds, and how quickly debt is repaid, is not stated in the sources that could be checked. whoop.com blocks automated fetching, so this relies on WHOOP's published pages as surfaced by search, and the support article itself could not be opened.

## What Sleep Performance scores

Sleep Performance used to be mostly hours slept against hours needed. WHOOP revised it, and it now combines four components:

| Component | What it asks |
|---|---|
| Hours vs needed | How much of tonight's need did you sleep? |
| Consistency | How similar are your sleep and wake times to recent days? WHOOP describes this over a four-day period, on a 0-100% scale |
| Efficiency | What share of your time in bed were you asleep? |
| Sleep stress | How much high physiological stress did your body show during sleep? |

WHOOP does not publish how much each part counts, and describes sleep stress only briefly. Treat any "40/30/20/10" breakdown you read on a forum as a guess.

Two things follow. A night of eight hours in bed with a lot of waking can score below a shorter, solid night, because efficiency counts. And because consistency uses recent nights, a Friday that shifts your bedtime two hours later lowers Friday's score and the following nights' scores too.

## Why 100% is rare

Sleep need is set near what you would ideally sleep, not what is average. A score of 100% means you met the whole need, and that means getting the hours, keeping to your schedule and sleeping efficiently on the same night. Most nights lose points somewhere.

WHOOP's Sleep Planner, the feature that turns need into bedtimes, offers targets of 100% (peak), 85% (perform) and a lower "get by" level. In practice, a Sleep Performance in the 80s on a normal week is nothing to worry about, and the colour bands are guides rather than verdicts.

The other reason to be sceptical of a single night is the sensor. A wrist or strap measures movement, heart rate and HRV, and infers sleep stages from them. Consumer devices are generally better at telling sleep from wake than at splitting sleep into stages, so treat the stage-based parts of any score with more caution than the hours. Use weekly averages, and compare nights only against your own history.

A practical test of whether the need is realistic for you: on a holiday with no alarm, note how long you sleep after the first few nights of catching up. That figure, not the first night's, is closer to your real need, and you can compare it with what the app asks for.

## What actually moves your sleep need

Since the need is partly your own history, you can shift it:

1. **Reduce debt gradually.** An extra 30 to 45 minutes for several nights helps more than one 11-hour night, and does not wreck your timing.
2. **Fix wake time first.** Consistency is the part you control by habit, and WHOOP's own materials suggest prioritising it above all else when unsure where to begin.
3. **Expect hard days to raise the target.** A 90-minute run really does raise tonight's need in the model. Plan the earlier bedtime instead of trying to hit 100% at your usual time.
4. **Use naps sensibly.** A short early-afternoon nap offsets debt without pushing bedtime later.
5. **Compare against your own baseline.** If the app says nine hours and you feel fine on eight, trust that the model is a population-informed estimate, then test it for two weeks and see how you feel.

If you sleep nine or more hours routinely and still feel exhausted, or you snore heavily or wake gasping, mention it to a doctor. Persistent need for extra sleep can have medical causes.

## A published version of the same idea

If you'd like to see the arithmetic laid out, Pulse, a free app you host yourself, computes Sleep Performance and a Sleep Planner from Google Health sleep data. Its [Sleep Performance](/metrics/sleep-performance/) score is 50% hours against need, 20% efficiency, 20% restorative sleep (deep plus REM) and 10% consistency. Its need is the upper quartile of your last 28 nights, between 8 and 9.5 hours.

```sketch
{"kind": "bars", "alt": "Pulse's Sleep Performance weights: 50% hours, 20% efficiency, 20% restorative sleep, 10% consistency.", "unit": "%", "max": 100, "tones": ["sleep"], "bars": [{"label": "Hours vs need", "value": 50}, {"label": "Efficiency", "value": 20}, {"label": "Restorative sleep", "value": 20}, {"label": "Consistency", "value": 10}], "caption": "Pulse's published weights."}
```

The [Sleep Planner](/metrics/sleep-planner/) then adds 3 minutes for each Strain point above your 28-day average, plus 20% of your sleep debt, minus today's naps, and counts back from your usual wake time to give bedtimes for 100%, 85% and 70% of that need. These are Pulse's own numbers and differ from WHOOP's: for example, Pulse scores restorative sleep where WHOOP uses sleep stress. Pulse is tested with the Fitbit Air only, and its planner needs 7 main sleeps before it gives bedtimes.

## Sources

1. [WHOOP: how much sleep do I need](https://www.whoop.com/us/en/thelocker/how-much-sleep-do-i-need)
2. [WHOOP: understand everything that makes a great night's sleep with new sleep metrics](https://www.whoop.com/gb/en/thelocker/understand-everything-that-makes-a-great-nights-sleep-with-new-sleep-metrics)
3. [WHOOP: sleep debt optimal playbook](https://whoop.com/thelocker/sleep-debt-optimal-playbook)
4. [WHOOP community: how is "100% of my sleep need" calculated?](https://community.whoop.com/t/how-is-100-of-the-my-sleep-need-calculated/527)
5. [WHOOP community: WHOOP sleep consistency](https://www.community.whoop.com/t/whoop-sleep-consistency/800)
