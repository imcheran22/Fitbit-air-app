---
title: "Does Apple Watch have a recovery score?"
description: "Since September 2026, yes on two models: Readiness, 0-10. Older watches have Vitals, Training Load and Sleep Score but no single daily score."
published: "2026-10-09"
checked: "2026-10-09"
tags: [apple-watch, recovery, hrv]
keywords: ["apple watch recovery score", "apple watch readiness score", "apple watch recovery score like whoop", "apple watch training load", "apple watch vitals app"]
---

It depends on the model. The Apple Watch Series 12 and Ultra 4, announced in September 2026, have a Readiness score from 0 to 10. Every other Apple Watch has the ingredients (overnight Vitals, Training Load, a Sleep Score) but no single number that tells you whether to train. The score is not called "recovery", and it is not a percentage.

## What the new models have

Apple's September 2026 press release describes Readiness as one daily score from 0 to 10, with a plain recommendation attached: Recover, Pace Yourself, Ready or Go For It. It analyses recent activity, training load, vitals and sleep score, and it updates through the day, so a hard workout or a change in daytime vitals can move it. You can tap in to see which factors are driving it. Apple says the algorithm was developed with data from the Apple Heart and Movement Study, together with exercise scientists and physicians at Apple.

```sketch
{"kind": "flow", "alt": "Recent activity, training load, vitals and sleep score feed one Readiness score from 0 to 10.", "inputs": [{"label": "Recent activity", "tone": "orange"}, {"label": "Training load", "tone": "orange"}, {"label": "Vitals", "tone": "teal"}, {"label": "Sleep score", "tone": "sleep"}], "output": "Readiness, 0-10", "note": "Weighting not published", "caption": "Inputs as described in Apple's September 2026 press release."}
```

Apple's watchOS 27 page lists Readiness as Series 12 and Ultra 4 only. Reports around launch say it is not on the Series 11, Ultra 3 or SE 3, even with watchOS 27. Apple has not said whether that limit is about the new sensors or a product decision.

The hardware change matters here. The Series 12 measures heart rate every five seconds all day, and Apple says HRV is measured up to 24 times more often than before. The Heart Rate app now shows two kinds of HRV: Recovery HRV, which Apple says tracks daily stress and recovery signals, and an overall HRV for broader health. Daytime resting heart rate and HRV appear in Vitals on these two models only.

What Apple has not published, as far as could be found, is the weighting. We know the four inputs. We do not know whether sleep outweighs training load, or how long a baseline takes to form. Ranges and cut-offs for the four labels are not documented either.

## What every other Apple Watch has

If you wear an older model, you have three separate tools that cover the same ground between them.

**Vitals.** The Vitals app shows overnight heart rate, respiratory rate, wrist temperature and blood oxygen, plus sleep duration, and on the Series 12 and Ultra 4 it shows HRV overnight in place of sleep duration. It draws a typical range for each metric. By default it notifies you when at least two overnight metrics fall outside that range, and Apple's page says the notification lists possible factors such as medication, altitude changes or illness. Apple is clear that the watch is not a medical device. Blood oxygen is missing on some US models sold from 18 January 2024 onwards.

**Training Load.** Introduced in watchOS 11. It compares the intensity and duration of your last 7 days of workouts with the previous 28 days and places you on a scale from well below to well above. You can edit the effort rating for a workout after the fact. That 7-versus-28-day shape is the same idea sports scientists call an acute-to-chronic workload ratio, though Apple does not describe it in those terms and does not publish the exact formula.

**Sleep Score.** Added in watchOS 26 and, per reports, available on older models too. It runs 0 to 100 and, according to AppleInsider and others, is built from duration (up to 50 points), bedtime consistency (up to 30) and interruptions (up to 20). Apple has not published that split itself, so treat it as reported. In watchOS 26.2, reports say the labels moved so that 81 or higher now counts as High, and the calculation itself did not change.

None of these three gives a verdict. Vitals tells you something is unusual, Training Load tells you what you did, and Sleep Score tells you about last night. Joining them is left to you. On those watches, the honest answer to the question in the title is: not natively.

```sketch
{"kind": "compare", "alt": "Vitals, Training Load and Sleep Score each answer a separate question, and none gives a single verdict.", "columns": [{"title": "Vitals", "tone": "teal", "items": ["Overnight heart rate", "Respiratory rate", "Wrist temperature", "Flags 2+ metrics out of range"]}, {"title": "Training Load", "tone": "orange", "items": ["Last 7 days of workouts", "Against the previous 28 days", "Well below to well above"]}, {"title": "Sleep Score", "tone": "sleep", "items": ["Duration, up to 50 points", "Bedtime consistency, up to 30", "Interruptions, up to 20"]}], "caption": "Apple's guides. Sleep Score split as reported, not published by Apple."}
```

## What third-party apps add

Because Apple Health stores HRV, resting heart rate and sleep, apps can build a recovery percentage on top.

- **Athlytic** says it uses HRV and resting heart rate, compared with your own history, to give a daily recovery figure and an exertion target. A third-party review mentions a 60-day baseline. The weighting is not published. Its App Store listing shows the app as free with in-app purchases, and a current Pro price could not be confirmed.
- **Bevel** includes recovery, sleep, strain and stress scores, with a free tier and a paid Pro tier. No published explanation of how its recovery score is calculated turned up.

These scores are the app developer's own model, not Apple's. Two apps given the same night of data can disagree, and so can an app and the new Readiness score. That isn't a defect: each is weighting a short list of overnight signals in its own way. If you want one you can reason about, pick an app that publishes its method, and compare it only against your own trend.

## Which should you trust

Whichever you pick, three checks keep the number honest.

1. **Wear it asleep.** Every one of these scores leans on overnight HRV and resting heart rate. A watch left on the charger overnight has nothing to work with.
2. **Give it two weeks.** Baselines need time. Apple's Vitals page does not say how many nights it needs.
3. **Look at the raw trend.** HRV and resting heart rate are the signals under almost every recovery score. If resting heart rate has sat 5 to 10 beats above your usual for a week and you feel flat, that is the real finding. If it's persistently high with symptoms such as chest pain or dizziness, see a doctor and ignore the app.

For background on what HRV can and can't tell you, see [what a good HRV looks like](/blog/good-hrv-by-age/).

## Where Pulse fits

Pulse does not read Apple Watch data at all. It is a free, self-hosted app that reads from the Google Health API, which means a Fitbit or another device that syncs to Google Health, and it has only been tested with the Fitbit Air. If you do wear one of those, it computes a 0-100% morning [Recovery](/metrics/recovery/) from HRV, resting heart rate, sleep and two other overnight signals, with the weights listed on that page. It does not use anything from Apple, and it does not read Apple Health. For how the data stores differ, see [Google Health vs Health Connect vs Apple Health](/blog/google-health-vs-health-connect-vs-apple-health/).

## Sources

1. [Apple Newsroom: Introducing Apple Watch Series 12 (September 2026)](https://apple.com/newsroom/2026/09/introducing-apple-watch-series-12-with-the-all-new-health-sensing-system/)
2. [Apple Watch User Guide: What's new in watchOS 27](https://support.apple.com/en-ie/guide/watch/-apdb93ea3872/watchos)
3. [Apple Watch User Guide: Vitals](https://support.apple.com/guide/watch/apd15aa7ed96)
4. [Apple Watch User Guide: Track your training load](https://support.apple.com/guide/watch/apde4c07a6cf)
5. [AppleInsider: How Sleep Score works on Apple Watch with watchOS 26](https://appleinsider.com/articles/25/09/12/how-sleep-score-works-on-apple-watch-with-watchos-26)
6. [TechRepublic: watchOS 26.2 adds sleep update](https://www.techrepublic.com/article/news-watchos-26-2-update/)
7. [Android Authority: Apple Watch Readiness feature](https://androidauthority.com/apple-watch-readiness-feature-3709621)
8. [Athlytic on the App Store](https://apps.apple.com/ca/app/id1543571755)
9. [Kiledjian: Bevel turns Apple Watch data into useful health guidance](https://kiledjian.com/2026/07/07/bevel-turns-apple-watch-data.html)
