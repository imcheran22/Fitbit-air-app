---
title: "Fitbit Resilience replaced the stress score. Now what?"
description: "Google Health swapped the 0-100 Stress Management Score for Resilience on 19 May 2026. What Google documents, what it doesn't, and how to read a Low day."
published: "2026-07-06"
updated: "2026-10-09"
checked: "2026-10-09"
tags: [fitbit, google-health, stress]
keywords: ["fitbit stress score gone", "fitbit resilience", "fitbit resilience always low", "fitbit resilience vs readiness", "google health stress management score"]
---

Your 0-100 Stress Management Score was retired when the Fitbit app became the Google Health app on 19 May 2026. In the Mental wellbeing section, Resilience replaced it, and it shows only three labels: Optimal, Balanced or Low. There is no number, and Google does not publish how the label is decided.

## What actually changed

Google's own page on the redesign puts it in two lines: "In the Mental Wellbeing section, Resilience replaces Stress score." And: "This will now be described as Optimal, Balanced, or Low, instead of a numerical value." The same page adds that graphs of your stress checks are no longer available in the mobile app, while the Scan Quick Reset feature stays on the Charge 5, Charge 6 and Sense.

So three things went at once: the number, the stress-check graphs and, for most people, the sense that the score had a scale you could improve by a point or two. What you get now is a daily category.

To find it, open the Google Health app, go to the Health tab, choose Mental wellbeing under Focus areas, then tap Resilience. You can switch between time periods to see how your days have been spread across the three labels.

## What Google says Resilience is

Google's stress help page describes the daily Resilience score as a measure of "your capacity for the day ahead", meaning how well your body absorbs and recovers from physical and mental strain. It says the score is built from "more than 10 factors" tracked by your device, in three groups:

| Group | What Google says it uses |
|---|---|
| Responsiveness | Heart rate, heart rate variability and EDA (if available), to gauge how hard your body worked the previous day |
| Exertion balance | Recent intense exercise compared with your movement over the past week |
| Sleep patterns | Quality and quantity of last night's sleep, and sleep over the past week |

```sketch
{"kind": "flow", "alt": "Three groups of inputs feed one daily Resilience label of Optimal, Balanced or Low.", "inputs": [{"label": "Responsiveness", "note": "HR, HRV, EDA if available"}, {"label": "Exertion balance", "note": "Hard exercise vs your week"}, {"label": "Sleep patterns", "note": "Last night and past week"}], "output": "Resilience: Optimal, Balanced or Low", "tone": "teal", "note": "Weights and thresholds are not published", "caption": "Groups as Google's stress help page names them."}
```

The device needs to send heart rate data to the app. The page lists the Charge 4, 5 and 6, Inspire 2 and 3, Luxe, the Sense series, Versa 2, 3 and 4, Pixel Watch 2 and later, and Fitbit Air.

EDA is electrodermal activity, tiny changes in skin sweat that the Charge 5, Charge 6 and Sense can measure when you do an EDA scan. Most other devices on that list have no such sensor, so for them the responsiveness part can only lean on heart rate and HRV. A third-party write-up (Kygo) reports that the Fitbit Air has no EDA sensor and so uses just those two. Google's page says only "if available", so treat the Air detail as reported, not confirmed.

## What Google does not document

This is the part people end up searching forums for, so it is worth being direct. As of 9 October 2026, no Google page could be found that says:

- **The thresholds.** What separates Optimal from Balanced from Low is not published.
- **The weights.** Whether responsiveness counts for more than sleep, or by how much, is not stated.
- **The "more than 10 factors".** Google names three groups, not the individual inputs.
- **Whether it is free.** The Resilience section does not list premium requirements, and the readiness page that mentions it does not either. Nothing found says it needs a subscription, but nothing says it doesn't.
- **Programmatic access.** The Google Health API lists 44 data types, including daily HRV, resting heart rate and sleep. Resilience is not one of them, so third-party apps cannot read it.

The 2020 launch announcement for the old Stress Management Score described a similar three-part design. The help page treats Resilience as a related but separate measure. Do not assume the maths carried over unchanged.

## Resilience is not Readiness

They sit close together in the app and both lean on HRV and sleep, which is why people mix them up. Google's readiness help page frames them differently: readiness is a snapshot of recovery from HRV, recent sleep and resting heart rate, while a high Resilience score "means you can better handle stress and take on new challenges". Readiness has a 1-100 number and bands (Low 1-29, Moderate 30-64, High 65-100). Resilience has three words. For how the first works, see [Fitbit Daily Readiness explained](/blog/fitbit-daily-readiness-explained/).

```sketch
{"kind": "compare", "alt": "Resilience gives a three-word label that includes weekly load; readiness gives a 1-100 number that does not.", "columns": [{"title": "Resilience", "tone": "teal", "items": ["Optimal, Balanced or Low", "No number", "Includes the past week's load", "Sleep, heart rate, HRV, exercise"]}, {"title": "Readiness", "tone": "blue", "items": ["1-100 number", "Low 1-29, Moderate 30-64, High 65-100", "HRV, recent sleep, resting heart rate"]}], "caption": "From Google's stress and readiness help pages."}
```

You can have a Low Resilience day and a Moderate readiness, because they weigh different things. Resilience includes the load you put on your body in the last week. Readiness, on Google's description, does not.

## Why a Low day might not mean anything is wrong

With the thresholds hidden, you can only reason from the three inputs. Low is more likely after:

1. **A hard exertion week.** Exertion balance compares recent intense exercise with the past week. A big weekend followed by a normal Monday is a plausible Low.
2. **Short or broken sleep.** The sleep group uses last night and the past week.
3. **A raised heart rate or lowered HRV overnight.** Alcohol, illness, a late meal, heat and poor sleep all do this.
4. **A thin baseline.** If you only recently started wearing the device, or have been skipping nights, any score built from your own history has less to compare with. Google asks for 7 nights of wear for readiness and about a month for a stable baseline, and it is reasonable to expect the same here, though Resilience's own page does not say so.

If it is always Low, check that the band is snug on your wrist, that you wear it to sleep, and that Google Health has synced. Then look at the trend over a few weeks rather than at one morning.

Body Responses are a different feature. They are notifications that fire when your signals show a sudden rise in autonomic activity, on Pixel Watch 2 and later and the Sense series, about ten minutes after the event. Google says they do not track overall perceived stress. They are not part of the Resilience label.

## If you miss a number

Some people simply want a figure back. Pulse, a free app you host yourself, has its own Stress Monitor on a 0 to 3 scale. It is built only from heart rate: how far your still-minute heart rate sits above your own calm baseline, with workouts, sleep and minutes with steps left out ([how Stress Monitor works](/metrics/stress-monitor/)). It does not use EDA or HRV, it does not read Resilience, and it is not an equivalent: it can say your heart rate has been elevated while you were still, not that you feel stressed. Pulse is built and tested with the Fitbit Air only.

If you are persistently anxious, can't sleep, or have chest symptoms along with a high resting heart rate, a wearable label is no substitute for talking to a doctor.

## Sources

1. Google Health Help. [What is new with the redesigned Google Health app](https://support.google.com/googlehealth/answer/17068213?hl=en) (checked 2026-10-09).
2. Google Health Help. [Manage stress & mindfulness in Google Health](https://support.google.com/googlehealth/answer/14237928?hl=en) (checked 2026-10-09).
3. Google Health Help. [Understanding your readiness score](https://support.google.com/googlehealth/answer/14236710?hl=en) (checked 2026-10-09).
4. Google for Developers. [Google Health API data types](https://developers.google.com/health/data-types).
5. Business Wire. [Fitbit debuts Sense](https://www.businesswire.com/news/home/20200825005373/en/Fitbit-Debuts-Sense-Advanced-Health-Smartwatch-World%E2%80%99s) (2020 announcement of the original Stress Management Score).
6. Kygo. [Fitbit Air stress tracking: no score, just Resilience](https://www.kygo.app/post/fitbit-air-stress-tracking) (third party, used only for the Fitbit Air EDA detail).
