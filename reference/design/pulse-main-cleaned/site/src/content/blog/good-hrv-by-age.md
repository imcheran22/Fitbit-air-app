---
title: "What is a good HRV by age? Your baseline matters more"
description: "Real RMSSD and SDNN averages by age decade from a study of 1,906 healthy adults, why wearable HRV differs from lab values, and how to judge your own."
published: "2026-06-05"
checked: "2026-10-09"
tags: [hrv, fitbit, google-health]
keywords: ["what is a good hrv", "hrv by age", "fitbit hrv normal range", "average rmssd by age", "what should my hrv be"]
---

There is no single good HRV. In healthy adults measured in a lab, average RMSSD falls from about 40 ms in the late twenties and thirties to about 19 ms by the mid-sixties, but the spread within each age is huge. A good number is one that sits inside your own normal range.

## Which HRV are we talking about?

Most charts online say "HRV" and leave it there. That hides the first problem, because heart rate variability is a family of calculations, and they are not interchangeable.

The two you will meet are:

- **RMSSD**, the root mean square of successive differences between heartbeats. It reflects beat-to-beat changes and is mostly a read on the parasympathetic (rest and digest) side of the nervous system. It is what Google says Fitbit and Pixel Watch use: "We use the RMSSD formula to determine heart rate variability from heart rate data."
- **SDNN**, the standard deviation of all the beat intervals in a recording. It captures slower swings as well, so it grows the longer you record. A 24-hour SDNN is a very different number from a five-minute one.

Apple Health, for one, stores HRV as SDNN, which is one reason a number copied from a forum post about another watch can mislead you. In the rest of this post, HRV means RMSSD in milliseconds unless stated otherwise, because that is what your Fitbit or Pixel Watch reports.

## HRV by age: a table from a real study

Most "HRV by age" charts found online carry no source. This one comes from Voss and colleagues (2015), who analysed five-minute resting ECG recordings from 1,906 healthy people aged 25 to 74 in the German KORA S4 population study. The subjects lay down and rested for 5 to 10 minutes before the recording. Values are mean plus or minus standard deviation, in milliseconds.

| Age | Women, RMSSD | Men, RMSSD | Women, SDNN | Men, SDNN |
|---|---|---|---|---|
| 25-34 | 42.9 ± 22.8 | 39.7 ± 19.9 | 48.7 ± 19.0 | 50.0 ± 20.9 |
| 35-44 | 35.4 ± 18.5 | 32.0 ± 16.5 | 45.4 ± 20.5 | 44.6 ± 16.8 |
| 45-54 | 26.3 ± 13.6 | 23.0 ± 10.9 | 36.9 ± 13.8 | 36.8 ± 14.6 |
| 55-64 | 21.4 ± 11.9 | 19.9 ± 11.1 | 30.6 ± 12.4 | 32.8 ± 14.7 |
| 65-74 | 19.1 ± 11.8 | 19.1 ± 10.7 | 27.8 ± 11.8 | 29.6 ± 13.2 |

Two things stand out. The decline is steady and large: RMSSD roughly halves between the late twenties and the sixties. And the standard deviations are almost as big as the averages. A healthy 30-year-old with an RMSSD of 22 ms and another with 65 ms are both inside the normal spread of that study. Neither number tells you who is fitter or healthier.

For a wider view, Nunan and colleagues (2010) pooled short-term HRV studies of healthy adults and found a mean RMSSD of 42 ms (SD 15), with study averages ranging from 19 to 75 ms. A 2025 systematic review of reference values by Brozat, Böckelmann and Sammito concluded that there are no generally accepted normal values yet, because studies record and calculate HRV in such different ways.

That is the honest summary of the research: age is the strongest predictor, the average trend is clear, and the individual range is wide.

## Why your Fitbit number will not match the table

The table above is a lab measurement: a short, supine, daytime recording on an ECG. Your Fitbit, Pixel Watch or Fitbit Air does something different. It estimates beat-to-beat intervals from a light sensor on the wrist (photoplethysmography, or PPG), mostly while you sleep, and Google says most metrics need "at least 3 hours of quality sleep" to produce a value.

Those differences matter in three ways:

1. **Time of day.** Autonomic activity changes between sleep and waking hours. A night-time average is not the same measurement as a five-minute rest in the afternoon.
2. **Sensor.** PPG and ECG agree well on some HRV measures and less well on others in the studies reviewed by Shaffer and Ginsberg (2017), and movement or a loose strap adds noise.
3. **Averaging.** A wearable may summarise a whole night, or a selection of it. Shaffer and Ginsberg are blunt that 24-hour, short-term and ultra-short recordings reflect different things, so they are not interchangeable, and that comparing across recording lengths is inappropriate.

```sketch
{"kind": "compare", "alt": "A lab ECG recording and a wearable's night-time estimate measure HRV in different ways.", "columns": [{"title": "Lab study table", "tone": "blue", "items": ["Five-minute resting ECG", "Lying down, in the daytime", "Healthy adults aged 25 to 74"]}, {"title": "Fitbit or Pixel Watch", "tone": "teal", "items": ["Wrist light sensor (PPG)", "Mostly while you sleep", "Needs 3+ hours of quality sleep", "Nightly method not published"]}], "caption": "Not interchangeable, so do not chase the table's numbers."}
```

No published conversion has been found between wearable night-time RMSSD and lab values, and neither Google nor Fitbit publishes the exact way the nightly figure is picked. So treat the table as context for the shape (younger tends to be higher, with a big spread), not as a target your watch should hit.

## What to compare yourself against

Your own history, over weeks. Google does the same: "We calculate your personal range for each health metric based on up to 30 days of data." The Google Health app shows where last night sat against that range, and that is the number worth acting on.

Night-to-night swings are ordinary, and how large they are differs a lot between people. What carries information is a shift that outlasts the noise. A few things that reliably move overnight HRV:

- **Alcohol.** In a Finnish study of wearable heart-rate recordings (Pietilä et al., 2018), even low alcohol intake lowered an HRV-based recovery measure during the first hours of sleep, and the effect grew with dose.
- **A hard day, or a hard day that is still unfinished.** Late training pushes the following night's HRV down for many people.
- **Illness.** A sustained drop, often with a raised resting heart rate, is a common early sign of being unwell.
- **Short or broken sleep, a late heavy meal, heat, travel.**

Google says the same in plainer terms: higher HRV is linked with better health, and a large drop may point to stress, strain or possible illness.

### A simple way to read your own number

Wait until you have around two to four weeks of data. Note your usual band, say 38 to 55 ms. A single night below it means very little. Three or four nights below it, with a higher resting heart rate and a bad week behind you, is worth a lighter few days. A slow upward drift over months of consistent training is the pattern people hope for.

```sketch
{"kind": "line", "alt": "Nightly HRV bouncing inside a personal band, then staying below it for several nights.", "series": [{"label": "Nightly HRV", "points": [46, 48, 44, 50, 47, 52, 45, 49, 41, 36, 34, 35, 37, 44], "tone": "teal"}], "band": {"from": 38, "to": 55, "label": "Your usual band"}, "yLabel": "RMSSD (ms)", "notes": [{"at": 8, "text": "One low night means little"}, {"at": 11, "text": "Several nights below the band"}], "min": 25, "max": 60, "caption": "Illustration, not real data."}
```

If you have just bought the device, give it the time. Google's own readiness page asks for 7 nights to set a baseline and about a month for it to settle.

## Is a low HRV bad?

Not by itself. A low reading relative to your age group is not a diagnosis, and a high one is not a prize. If you are well, sleeping, and feeling fine, a number under the chart average is not a reason to worry. If you have palpitations, fainting, chest symptoms or a sudden unexplained change that persists, see a doctor and mention the trend. Do not rely on a wearable to settle it.

## Where Pulse fits

Pulse, a free app you host yourself, reads your nightly HRV from Google Health and compares it with your own recent nights rather than with an age table. It uses Google's personal range when Google sends one and its own baseline otherwise, and flags a night that falls outside it ([how the HRV page works](/metrics/hrv/), [how Health Monitor builds those ranges](/metrics/health-monitor/)). Pulse is built and tested with the Fitbit Air only. If your HRV reads zero or not at all, [that has its own checklist](/blog/fitbit-air-hrv-zero/).

## Sources

1. Voss A, Schroeder R, Heitmann A, Peters A, Perz S. [Short-term heart rate variability: influence of gender and age in healthy subjects](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0118308). PLoS ONE 2015, Tables 5 and 7.
2. Nunan D, Sandercock GRH, Brodie DA. [A quantitative systematic review of normal values for short-term heart rate variability in healthy adults](https://doi.org/10.1111/j.1540-8159.2010.02841.x). Pacing Clin Electrophysiol 2010.
3. Shaffer F, Ginsberg JP. [An overview of heart rate variability metrics and norms](https://doi.org/10.3389/fpubh.2017.00258). Frontiers in Public Health 2017.
4. Brozat, Böckelmann, Sammito. [Systematic review on HRV reference values](https://doi.org/10.3390/jcdd12060214). J Cardiovasc Dev Dis 2025.
5. Pietilä J et al. [Acute effect of alcohol intake on cardiovascular autonomic regulation during the first hours of sleep](https://mental.jmir.org/2018/1/e23). JMIR Mental Health 2018.
6. Google Health Help. [Health metrics in Google Health](https://support.google.com/googlehealth/answer/14236917?hl=en) (checked 2026-10-09).
7. Google Health Help. [Understanding your readiness score](https://support.google.com/googlehealth/answer/14236710?hl=en) (checked 2026-10-09).
