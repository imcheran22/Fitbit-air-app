---
title: "Fitbit sleep score: the six parts and what is good"
description: "Google lists six parts of the sleep score and four bands. What each part rewards, what counts as good, and what the help page leaves unsaid."
published: "2026-07-02"
checked: "2026-10-09"
tags: [fitbit, google-health, sleep]
keywords: ["what is a good sleep score on fitbit", "is 80 a good sleep score", "fitbit sleep score calculation", "fitbit sleep score not showing", "google health sleep score"]
---

A Fitbit sleep score of 80 to 89 is "Good" and 90 or more is "Excellent", according to Google. Most people average somewhere between 72 and 83. The score combines six measures: how long you slept, how fast you settled, how much was sound sleep, restlessness, full awakenings and interruptions.

## The bands

These are Google's own labels, from its current sleep score help page:

| Score | Label |
|---|---|
| 90-100 | Excellent |
| 80-89 | Good |
| 60-79 | Fair |
| Under 60 | Poor |

Google also says most users see an average between 72 and 83. That is a useful reality check. If your usual nights land at 75, you are not doing badly: you are in the middle of where people land. Reaching 90 regularly is uncommon, and a one-off 91 after a perfect night says little about the nights around it.

```sketch
{"kind": "bands", "alt": "The sleep score from 0 to 100 in four bands, with most users averaging 72 to 83.", "min": 0, "max": 100, "bands": [{"to": 60, "label": "Poor", "tone": "red"}, {"to": 80, "label": "Fair", "tone": "yellow"}, {"to": 90, "label": "Good", "tone": "green"}, {"to": 100, "label": "Excellent", "tone": "teal"}], "markers": [{"at": 72, "label": "72"}, {"at": 83, "label": "83"}], "caption": "Bands and the 72 to 83 average as Google's sleep score page gives them."}
```

## The six parts

The help page gives each part a plain-language definition. It does not publish weights or formulas, which matters later. Here is what it does say.

| Part | What Google says it measures | What helps |
|---|---|---|
| Sleep duration | Total estimated time asleep in your main sleep window. "The longer you sleep, the higher your score." | More time asleep |
| Time to sound sleep | How long it took from first trying to sleep until you reached sound sleep. Expected times vary by age and gender | Falling into stable sleep sooner |
| Sound sleep | Steady, undisturbed sleep: deep, REM and light sleep with a low, steady heart rate | More of the night spent soundly |
| Restlessness | Very brief movements, stirring or wake-like transitions. Expected amounts vary by age, gender and total sleep | Fewer micro-movements |
| Full awakenings | Waking periods long enough to disrupt sleep and likely be remembered. Only those over five minutes count. Zero is ideal and fewer than two is considered good for most people | Fewer long wake-ups |
| Interruptions | Total time fully awake between falling asleep and final waking, counting only periods over five minutes, plus time awake between separate sleep sessions | Less time awake in the night |

```sketch
{"kind": "flow", "alt": "Six sleep measures feed one sleep score from 0 to 100.", "inputs": ["Sleep duration", "Time to sound sleep", "Sound sleep", "Restlessness", "Full awakenings", "Interruptions"], "output": "Sleep score, 0-100", "tone": "sleep", "note": "Google does not publish the weights", "caption": "The six parts on Google's sleep score help page."}
```

Three points in that table are easy to miss.

**Several parts are judged against targets for people like you.** Google says time to sound sleep and restlessness are adjusted for age and gender (and restlessness for total sleep). Two people with identical nights can score differently.

**Short wake-ups under five minutes do not count** as full awakenings or interruptions. A bathroom trip that takes three minutes will not show up there, though it may still add to restlessness.

**Duration is only one of six.** You can sleep nine hours and score modestly if it was fragmented, and score well on 6.5 hours if it was unbroken. Google does not say how much each part is worth, so this post does not guess at percentages.

## The version you may have read elsewhere

If you remember a sleep score built from "time asleep, deep and REM, and restoration", that was how older descriptions put it. The current Google page lists the six parts above. When the Fitbit app became the Google Health app on 19 May 2026, Google's redesign page said "the sleep score has been improved, but it keeps its name". No Google page says what was changed, so it is not possible to say which of the old and new descriptions applies to the number on your screen. The six-part page is the one Google currently publishes.

## Why you might not get a score at all

Google lists the reasons itself:

- The device did not record **sleep stages**. Without them no score is produced.
- It was not worn, or the battery ran out during the night.
- It has not synced yet. The score can take a minute to appear after a sync.
- You edited or extended your sleep log. Edited times can give a less accurate score or none.

The same page notes that wrist-based Fitbits and Pixel Watches detect sleep automatically when worn to bed, that the score cannot be switched off, and that Premium adds sleep insights and the sleep coach, not a different calculation. It also says you can download your raw sleep data at any time.

## What to do about a low score

Take the six parts in order and look at what your own night did, not the number alone.

1. **Open the breakdown** in the Sleep tab and see which parts were weak. A Fair score from short sleep needs a different fix from a Fair score from restlessness.
2. **Check the stages and the wake-ups.** One 30-minute awakening counts as a full awakening. Ten two-minute ones do not, because only periods over five minutes count.
3. **Look at the first hour.** A long time to sound sleep often traces back to caffeine, a late workout or a bright screen.
4. **Compare across a fortnight**, not a night. The targets are personalised and the stages are estimates, so one night tells you little.
5. **Check the data, not just the sleep.** A loose band, an empty battery, or an edited log can all produce a poor score that was not a poor night.

Sleep stages from a wrist sensor are an estimate, and Google does not publish how accurate they are, so read the stage-based parts as a guide.

## How this compares with Pulse's Sleep Performance

Pulse can't show your Google sleep score, because the Google Health API has no sleep score field. It does receive the underlying sleep and stage data, and computes its own Sleep Performance on a 0-100% scale from four published parts: hours asleep against your personal sleep need (50%), sleep efficiency (20%), restorative sleep, meaning deep plus REM (20%), and your sleep consistency over seven days (10%). 85% and above is its Optimal band. The weights are public, the parts are different from Google's six, and the two numbers are not interchangeable ([how Sleep Performance works](/metrics/sleep-performance/)). Pulse is built and tested with the Fitbit Air only.

For the other score that leans on sleep, see [why Fitbit readiness is often low](/blog/fitbit-readiness-always-low/).

Garmin's watches give a 0-100 sleep score too, built differently: [Garmin's sleep score explained](/blog/garmin-sleep-score-explained/).

## Sources

1. Google Fitbit Help. [Sleep Score](https://support.google.com/fitbit/answer/14236513?hl=en) (checked 2026-10-09).
2. Google Health Help. [What is new with the redesigned Google Health app](https://support.google.com/googlehealth/answer/17068213?hl=en) (checked 2026-10-09).
3. Google for Developers. [Google Health API data types](https://developers.google.com/health/data-types).
