---
title: "What is Amazfit PAI? Points, target and daily strain"
description: "PAI is a weekly heart-rate score from Norwegian research: reach 100 over any rolling seven days. How it works and how it differs from a daily strain score."
published: "2026-06-19"
checked: "2026-10-09"
tags: [amazfit, strain, training-load]
keywords: ["amazfit pai meaning", "what is pai on amazfit", "how to get pai points", "pai score explained", "personal activity intelligence"]
---

PAI stands for Personal Activity Intelligence. It is a single number built from your heart rate over the last seven days, personalised by your age, sex, resting heart rate and maximum heart rate. The target is 100. Because it rolls, a hard workout today keeps counting for a week and then fades.

## Where PAI comes from

PAI is not an Amazfit invention. It was developed at the Norwegian University of Science and Technology (NTNU) by a group led by Ulrik Wisløff, using data from the HUNT Study, a long-running population health survey in Trøndelag, Norway.

The foundational paper is Nes BM, Gutvik CR, Lavie CJ, Nauman J and Wisløff U, "Personalized Activity Intelligence (PAI) for Prevention of Cardiovascular Disease and Promotion of Physical Activity", *American Journal of Medicine*, 2017 (vol. 130, issue 3, pages 328 to 336). The algorithm was derived in the HUNT Fitness Study (4,631 people) and checked in the wider HUNT population: 39,298 adults aged 20 to 74, followed for an average of 26.2 years, during which 10,062 died. In that group, a weekly PAI of 100 or more was linked to 17% lower cardiovascular mortality in men and 23% lower in women, compared with people who scored 0.

A second paper tested it in people who already had heart disease. Kieffer SK and colleagues, "Personal Activity Intelligence and Mortality in Patients with Cardiovascular Disease: The HUNT Study", *Mayo Clinic Proceedings*, 2018, followed 3,133 patients for about 12.5 years. Those reaching 100 PAI a week had 36% lower cardiovascular mortality and 24% lower all-cause mortality than inactive patients, whether or not they met standard exercise guidelines.

These are observational studies. They show an association between a heart-rate-based activity score and who survived, not proof that chasing the number extends your life. Amazfit's own help pages describe the 100 target as linked to lower cardiovascular risk, which is fair. Marketing lines that turn it into "years added to your life" go further than the papers do.

## How the score works

Amazfit's support pages say PAI is calculated from your age, gender, resting heart rate and other physiological data, combined with how your heart rate has changed over the past 7 days. It uses heart rate from everything you do, so a brisk commute counts the same as a logged run if it raises your heart rate by the same amount. Steps are not an input.

```sketch
{"kind": "flow", "alt": "Heart rate over seven days, with age, sex, resting and maximum heart rate, feeds the PAI score, whose target is 100.", "inputs": ["Heart rate, last 7 days", "Age and sex", "Resting heart rate", "Maximum heart rate"], "output": "PAI (target 100)", "tone": "teal", "caption": "Inputs as Amazfit's support pages and NTNU describe them."}
```

Amazfit does not publish its exact formula, so the rest of this section comes from NTNU's own description of PAI, which may not match every detail of Zepp's version:

- Heart rate is judged relative to you. NTNU says PAI considers age, gender, resting heart rate and maximum heart rate.
- Harder effort earns points faster: NTNU says the higher your heart rate, the faster you earn PAI.
- Early points come easier than later ones, and fitter people need more activity to reach 100.
- NTNU says you can earn at most 75 points in a single day, and that repeating the same session on consecutive days earns less the second time.
- Its worked example: about one hour in total at 80% of maximum heart rate or higher, split over two sessions, gets you to roughly 100. Two and a half hours of moderate activity gets you to about 45.

So the target is not "a lot of steps". It is a couple of properly hard sessions a week, or a lot of sustained effort.

## Why your PAI can fall without you doing anything wrong

PAI is a rolling window. Points you earned eight days ago no longer count, so the score drops every day you do less than you did a week earlier. That is by design: the research target is 100 over any seven-day stretch, not 100 once.

```sketch
{"kind": "line", "alt": "A rolling score jumps after one hard session, holds for seven days, then falls when the session leaves the window.", "series": [{"label": "PAI", "points": [0, 0, 70, 70, 70, 70, 70, 70, 70, 0, 0], "tone": "teal"}], "yLabel": "PAI", "notes": [{"at": 2, "text": "Hard session"}, {"at": 9, "text": "Leaves the 7-day window"}], "caption": "Illustration, not real data."}
```

Three practical causes of a score that looks too low:

1. All-day heart rate monitoring is off. Amazfit's instructions say to turn it on in the Zepp app under Health Monitoring for your watch, and to wear the watch daily. Activity Detection helps it catch more changes.
2. Your resting heart rate or max heart rate in your profile is out of date. Both shift the zones.
3. Your activity is real but gentle. A long easy walk raises heart rate only a little, and low-intensity minutes earn little.

Not every Amazfit model supports PAI, so check your model's page. NTNU also notes that its own Mia Health app moved from PAI to a newer measure called AQ (Activity Quotient) in September 2024, with the same 100 target. Amazfit's support pages still describe PAI.

## PAI versus a daily strain score

PAI answers: "Have I done enough over the week to count as active?" A daily strain score answers a different question: "How hard was today on my cardiovascular system?"

| | PAI | Daily strain score |
|---|---|---|
| Window | Rolling 7 days | One day |
| Direction | More is better, up to a cap | Neither good nor bad; depends on recovery |
| Target | 100 | A range that changes with your readiness |
| Job | Keep a weekly activity habit | Decide how hard to push today |

A person with a PAI of 120 can still have a recovery problem today, if they stacked three hard days in a row. A person with a PAI of 40 might be in fine shape and just coming off a rest week. Neither number tells you what to do this morning.

For the daily side, Pulse, a free app you host yourself, computes a 0 to 21 Strain from your heart rate across the day, using your heart-rate reserve and a log scale ([how Strain works](/metrics/strain/)). It reads data from Google Health, is tested with the Fitbit Air only, and does not compute PAI. If you are comparing a weekly total with a daily load on a Fitbit, [Cardio Load vs Strain](/blog/cardio-load-vs-strain/) covers that pair.

## What to do with the number

- If you are under 100 and healthy, add one or two sessions where you can talk only in short sentences. That moves PAI far more than extra easy hours.
- If you are already above 100, more does not keep helping in the research. The papers grouped people as 0, 1 to 50, 51 to 99 and 100 or more, so they say little about whether 300 is better than 100.
- Do not use PAI to decide whether to train today. Use how you feel, your sleep and your resting heart rate.
- If you have a heart condition, ask your doctor before aiming for a high-intensity target. The Kieffer study included patients with heart disease, but it measured what they already did; it did not test telling them to do more.

## What is not known

Zepp has not published the exact points-per-minute table, how it treats days with missing heart rate, or whether its version has changed since the HUNT algorithm. The 75-points-a-day cap and the two-session example above are NTNU's description of PAI, not a Zepp specification.

## Sources

1. [Nes et al., Personalized Activity Intelligence (PAI) for Prevention of Cardiovascular Disease and Promotion of Physical Activity, Am J Med 2017](https://doi.org/10.1016/j.amjmed.2016.09.031)
2. [Kieffer et al., Personal Activity Intelligence and Mortality in Patients with Cardiovascular Disease: The HUNT Study, Mayo Clin Proc 2018](https://doi.org/10.1016/j.mayocp.2018.03.029)
3. [NTNU Cardiac Exercise Research Group: Personal Activity Intelligence](https://www.ntnu.edu/cerg/pai)
4. [Amazfit: What does the PAI score mean on my Amazfit watch?](https://in.amazfit.com/pages/faq/what-does-the-pai-score-mean-on-my-amazfit-watch)
5. [Amazfit Support: How do I use PAI?](https://support.amazfit.com/en/faq/10743)
