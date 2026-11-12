---
title: "Oura Readiness explained, and how Recovery differs"
description: "The nine contributors behind Oura's Readiness score, what each one measures, why it dips, and how it differs from a morning Recovery percentage."
published: "2026-09-11"
checked: "2026-10-09"
tags: [oura, recovery, hrv]
keywords: ["oura readiness score explained", "oura readiness score meaning", "oura readiness score always low", "oura readiness contributors", "oura hrv balance"]
---

Oura's Readiness score is a 0-100 number built from nine contributors: three about sleep, two about activity and four about body signals. Overnight resting heart rate, HRV and temperature are compared with your own recent averages. 85 or above is Optimal, 70-84 Good, 60-69 Fair, and below 60 means Pay Attention. No published weighting was found.

If you are weighing an Oura Ring against a Fitbit Air, the [Fitbit Air vs Oura Ring comparison](/compare/fitbit-air-vs-oura-ring/) puts both sets of scores and costs side by side.

## The nine contributors

Oura's support pages list nine contributors, each scored 0-100 on the same bands as the headline. Oura's marketing page says seven, so the support article is the one to trust for detail. The app needs up to two weeks to learn your averages before it can judge any of them.

```sketch
{"kind": "flow", "alt": "Nine Oura contributors, grouped as body signals, sleep and activity, feed one Readiness score from 0 to 100.", "inputs": [{"label": "Resting heart rate", "tone": "teal"}, {"label": "HRV Balance", "tone": "teal"}, {"label": "Body temperature", "tone": "teal"}, {"label": "Recovery Index", "tone": "teal"}, {"label": "Sleep", "tone": "sleep"}, {"label": "Sleep Balance", "tone": "sleep"}, {"label": "Sleep Regularity", "tone": "sleep"}, {"label": "Previous Day Activity", "tone": "orange"}, {"label": "Activity Balance", "tone": "orange"}], "output": "Readiness, 0-100", "note": "Weighting not published", "caption": "Contributors as listed on Oura's support pages."}
```

| Contributor | What it looks at | Time window |
|---|---|---|
| Resting heart rate | Your lowest heart rate last night against your long-term average | One night |
| HRV Balance | Recent HRV against your longer-term HRV | 14 days against about three months |
| Body temperature | Last night's temperature against your long-term nighttime average | One night |
| Recovery Index | How much sleep came after your heart rate bottomed out | One night |
| Sleep | Total sleep in the last 24 hours, naps included, against your baseline | 24 hours |
| Sleep Balance | Sleep against your baseline and general recommendations, a measure of sleep debt | Two weeks |
| Sleep Regularity | How consistent bedtime and wake-up were (naps don't count) | Two weeks |
| Previous Day Activity | Movement and sedentary time yesterday | One day |
| Activity Balance | Recent activity against your usual levels | 14 days against about two months |

The three "balance" contributors use 14-day weighted averages, with the last two to five days counting slightly more, compared with a longer baseline. That detail explains a lot of confusing mornings. A single bad night rarely wrecks Readiness by itself, but a fortnight of slightly short sleep can.

### The ones people misread

**Resting heart rate.** Oura says the contributor can fall if your resting rate is 3 to 5 bpm above your usual average, or 10 to 15 bpm below it. The second half surprises people. An unusually low reading is flagged too, because it can accompany stress or illness. Late meals, caffeine, alcohol and exercise before bed all raise nighttime heart rate.

**Recovery Index.** This is about timing, not depth. Oura says at least six hours of sleep after your heart rate reaches its lowest point is optimal. If the low keeps landing in the second half of the night, the usual suspects are a late dinner, alcohol or evening training. A person who sleeps 7 hours and has their lowest heart rate at hour four will score worse here than someone who sleeps 7 hours and bottoms out at hour one.

**HRV Balance.** It is not a nightly HRV reading. It compares your 14-day weighted average with your longer-term average. Oura's pages disagree on the long window (two months in one article, three months in the glossary and the contributors page), so neither figure should be leaned on.

**Body temperature.** Judged as a change from your own baseline, not an absolute value. Oura lists illness, the luteal phase of the menstrual cycle and pregnancy among the reasons it can shift. It also offers Rest Mode if your temperature is elevated.

**Previous Day Activity.** It can cost you points in both directions: prolonged inactivity, and heavy activity that strains your body. Oura's page suggests that 5 to 8 hours or less of inactivity a day helps.

## Why it can sit low for weeks

Work through these in order of likelihood.

1. **The new-ring or new-baseline period.** Up to two weeks before contributors are trustworthy.
2. **Short or irregular sleep.** Sleep Balance and Sleep Regularity both look back two weeks, so a shifted routine keeps dragging for a while. See [sleep regularity](/blog/sleep-regularity-index/).
3. **A hard training block.** Activity Balance is explicitly built to show overload. If your recent fortnight is far above your two-month norm, a low number is the model working as intended.
4. **Alcohol, late meals and caffeine.** They affect resting heart rate, HRV and Recovery Index at once, which is why one evening can drop three contributors together.
5. **Illness coming on.** Elevated temperature plus raised resting heart rate and lowered HRV is the classic pattern. If the combination is unusually strong, or you feel unwell, rest first and read the score later.
6. **A genuinely lower baseline.** Age, a change in medication or a new fitness level shifts your averages, and the contributors follow.

Tap the contributor that is red. The headline hides which of the nine is doing the damage, and the fix for Recovery Index is not the fix for Sleep Balance. If your resting heart rate stays well above your normal range for a week with no obvious reason, or you have chest pain, fainting or breathlessness, that's a reason to see a doctor, not to adjust your routine.

## How Recovery differs

Oura's Readiness is a broad "state of the day" score. It blends overnight biology (four contributors) with sleep history (three) and activity (two). Yesterday's activity and a two-week activity balance are inside the number.

A recovery score in the narrower sense measures only how your body responded overnight, then leaves training decisions to a separate load figure. Pulse's [Recovery](/metrics/recovery/) is built that way: a 0-100% score from five overnight inputs, with HRV carrying the most weight, set against your own baseline. There is no activity-balance contributor inside it, because Pulse keeps that in a separate 0-21 [Strain](/metrics/strain/) scale. Pulse is free and self-hosted, needs Docker and a Google Cloud project, and has been tested only with the Fitbit Air. It does not read Oura data.

```sketch
{"kind": "compare", "alt": "Oura Readiness blends overnight body signals, sleep history and activity, while Pulse Recovery uses only overnight inputs.", "columns": [{"title": "Oura Readiness", "tone": "blue", "items": ["Four body-signal contributors", "Three sleep-history contributors", "Two activity contributors", "Yesterday's activity is inside"]}, {"title": "Pulse Recovery", "tone": "green", "items": ["Five overnight inputs", "HRV carries the most weight", "Set against your own baseline", "Activity kept in separate Strain"]}], "caption": "Oura's support pages and Pulse's Recovery page."}
```

Neither design is correct. If you want one number that says "take it easy" because you trained hard, a Readiness-style blend gets there. If you want to know whether you slept your way back from yesterday's training, the separation is easier to read. Fitbit's own version of the blend is covered in [Fitbit Daily Readiness explained](/blog/fitbit-daily-readiness-explained/), and the cross-brand comparison is in [WHOOP recovery vs Body Battery vs Oura Readiness](/blog/whoop-recovery-vs-body-battery-vs-oura-readiness/).

## Sources

1. [Oura support: Readiness Contributors](https://support.ouraring.com/hc/en-us/articles/360057791533)
2. [Oura support: Readiness Score](https://support.ouraring.com/hc/en-us/articles/360025589793)
3. [Oura blog: Readiness score](https://ouraring.com/blog/readiness-score/)
4. [Oura support: Glossary](https://support.ouraring.com/hc/lv/articles/5949130374547-Glossary)
