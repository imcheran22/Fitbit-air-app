---
title: "Active Zone Minutes: what your Fitbit really counts"
description: "How Fitbit's Active Zone Minutes are earned, how they differ from Cardio Load and active minutes, and why a number can look off after a workout."
published: "2026-08-07"
checked: "2026-10-09"
tags: [fitbit, google-health, training-load]
keywords: [fitbit active zone minutes, active zone minutes meaning, cardio load vs active zone minutes, fitbit air active zone minutes, pixel watch active zone minutes]
---

Active Zone Minutes (AZM) count time with your heart rate raised enough to be in a heart-rate zone. A minute in the moderate (fat burn) zone earns 1. A minute in the vigorous (cardio) or peak zone earns 2. The default target is 150 a week, which works out at about 22 a day.

That is the whole mechanism, and it is simpler than the other Google Health numbers. The confusion usually comes from what AZM is not.

## How the points are earned

Google's help page gives the rule in two lines: one AZM per minute in the moderate zone, two per minute in the vigorous or peak zones. Its worked example is a 20-minute workout with five minutes of warm-up in the moderate zone, ten minutes of running in the vigorous or peak zones and five minutes of cool-down in the moderate zone. That adds up to 5 + 20 + 5 = 30 AZM.

```sketch
{"kind": "bars", "alt": "Active Zone Minutes earned in Google's 20-minute example: 5 for warm-up, 20 for running, 5 for cool-down.", "unit": "AZM", "tones": ["teal"], "bars": [{"label": "Warm-up, 5 min moderate", "value": 5}, {"label": "Run, 10 min vigorous/peak", "value": 20}, {"label": "Cool-down, 5 min moderate", "value": 5}], "caption": "Google's worked example: 30 AZM in total."}
```

Swimming is the exception. The watch does not track heart rate in a swim workout, so each minute in the water earns 1 AZM whatever the effort.

The goal of 150 a week is, according to Google, in line with American Heart Association guidance of 150 minutes of moderate activity, 75 of vigorous, or a mix. Because vigorous minutes count double, 75 hard minutes and 150 easy ones both reach the target. You can change the goal in the Google Health app.

The doubling mirrors those 2:1 guidelines. The difference is that the minutes are decided for you, minute by minute, from a wrist heart-rate sensor.

## Where the zone boundaries come from

This is the part people want and Google does not spell out. The AZM help page says zones are personalised "based on your fitness level and age" and does not list beats-per-minute thresholds.

The developer documentation gives more. The Google Health API stores a set of heart-rate zones for each day, with a lower and upper bound in beats per minute for each of four zones (light, moderate, vigorous, peak), and describes them as based on the Karvonen algorithm. Karvonen zones are percentages of heart-rate reserve, the gap between your resting and maximum heart rate. The documentation does not give the percentages or say how your maximum is estimated, so the exact cut-offs cannot be given here, and a table of numbers from a third-party site that claims to should not be trusted.

What follows from using reserve is practical: your zone bounds can move when your resting heart rate moves, so the same bpm may not land in the same zone it did a few months ago. The bounds the app shows for today are the ones that count.

## Why your count looks wrong

Heart rate lags effort. When you start a run, your heart rate takes a minute or two to climb, so the first minutes of a workout often earn little, and it stays up for a while after a hard interval. A loose strap, cold hands or arm-heavy movement can make a wrist reading noisier. Lifting weights, where the effort is brief and heart rate rises only slowly, tends to earn fewer minutes than it feels like it should.

Heat, caffeine, poor sleep and stress raise heart rate for the same effort. On those days you earn more AZM for the same walk, and on a day after hard training you may earn fewer. AZM measures your heart rate's response, not the work done.

Two checks if a workout looks short on points: open the session's heart-rate graph and see which zone you were actually in, then compare the zone bounds with what you expected. Google gives no accuracy figure for AZM.

## AZM, active minutes and Cardio Load are different things

Active Zone Minutes is the metric on devices that track heart rate throughout the day. Google's page lists the Fitbit Air, Charge 6, Inspire 3, Charge 5, Luxe, Inspire 2, Charge 4, the Sense and Versa series and the Pixel Watch series. Everything else tracks plain active minutes: at least 10 continuous minutes of moderate to intense activity, judged from movement (about 3 METs or above), with a default daily goal of 30 minutes.

Cardio Load is a separate number. Google says it is based on the TRIMP (training impulse) model: heart rate during activity, together with age, resting heart rate and sex, with time in higher zones earning more load per minute. It resets to zero each midnight and has no practical daily maximum. AZM is capped in effect by minutes: a 60-minute workout cannot give you more than 120. Cardio Load can keep rising, which is why a long easy day and a short brutal one can score very differently on the two. Google's page on Cardio Load does not compare it with AZM.

```sketch
{"kind": "compare", "alt": "Active Zone Minutes compared with Cardio Load: minutes in zone with an effective cap versus a TRIMP-based load that resets at midnight.", "columns": [{"title": "Active Zone Minutes", "tone": "teal", "items": ["1 per moderate minute, 2 per vigorous or peak", "60-minute workout gives at most 120", "Target of 150 a week by default"]}, {"title": "Cardio Load", "tone": "orange", "items": ["Based on the TRIMP model", "Uses age, resting HR and sex", "Resets to zero each midnight", "No practical daily maximum"]}], "caption": "From Google's help pages."}
```

For a fuller look at the load side, see [Cardio Load vs Strain](/blog/cardio-load-vs-strain/).

## What the Google Health API returns

For developers, AZM is one of the data types in the Google Health API: a one-minute record with a zone (fat burn, cardio or peak) and the number of minutes earned in that interval. Pixel Watch and Fitbit models both feed it. The daily zone bounds come back separately.

Pulse, a free app you host yourself, reads this data and shows Google's AZM next to its own zone minutes, which it counts from heart rate on five zones of heart-rate reserve and uses in [Strain](/metrics/strain/). The two will not always match, since the zone definitions differ. Pulse was built and tested with the Fitbit Air only; other devices send the same data types but have not been tested.

## How much to chase

The 150-minute target comes from population guidance, not from a trial on Fitbit data, and Google presents it as a default you can change. For most people the useful reading is the weekly trend: are you regularly meeting the number, and does it fall in weeks you are ill or sleeping badly? A single low day says very little.

If you are training for something specific, AZM is a blunt tool. It treats any two sessions with the same minutes in zone as equal, however they were spread. Use the heart-rate graph and your own sense of effort for that.

## Sources

1. [Which Fitbit devices track Active Zone Minutes, Google Health Help](https://support.google.com/googlehealth/answer/14236509)
2. [What are cardio load and target load?, Google Health Help](https://support.google.com/googlehealth/answer/15402655)
3. [Google Health API data types](https://developers.google.com/health/data-types)
4. [Google Health API reference: data points](https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints)
