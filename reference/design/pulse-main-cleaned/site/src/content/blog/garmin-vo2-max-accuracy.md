---
title: "Garmin VO2 max accuracy: watch vs lab"
description: "What peer-reviewed studies found when Garmin's VO2 max was compared with lab gas analysis: errors of roughly 3 to 10%, and worse for highly trained runners."
published: "2026-08-25"
checked: "2026-10-09"
tags: [garmin, fitness, hrv]
keywords: ["garmin vo2 max accuracy", "is garmin vo2 max accurate", "garmin vo2 max vs lab test", "garmin vo2 max too low", "watch vo2 max validation"]
---

Garmin's VO2 max is good enough to watch a trend and not good enough to treat as a lab result. In one 2025 study of the Forerunner 245, the watch read about 4 to 5 ml/kg/min below a lab test on average, with errors around 3 to 4% in moderately trained athletes and about 10% in highly trained ones.

## What the watch does

VO2 max is the most oxygen your body can use per minute for each kilogram of body weight. Garmin's manuals describe it as the maximum volume of oxygen (in millilitres) you can consume per minute per kilogram at maximum performance, and show your estimate as a number with a colour gauge from poor to superior.

The watch does not measure oxygen. It estimates VO2 max from your heart rate against your pace (or power on a bike), with the estimate supplied by Firstbeat Analytics. For a running estimate Garmin's fenix 7 manual says to run outdoors for at least 10 minutes; for cycling, at least 20 minutes of steady, hard riding with a power meter. Garmin recommends completing your user profile and setting your maximum heart rate, because the calculation uses it. The company also says the estimate may seem inaccurate at first and that the device needs a few activities to learn how you perform.

```sketch
{"kind": "flow", "alt": "The watch estimates VO2 max from heart rate against pace or power, using the maximum heart rate in your profile.", "inputs": ["Heart rate", "Pace (or power on a bike)", "Max heart rate in profile"], "output": "VO2 max estimate", "tone": "blue", "note": "Estimate supplied by Firstbeat", "caption": "As Garmin's manuals describe it."}
```

The manuals add that the estimate and Training Status are corrected for heat above 22°C (72°F) and altitude above 800 m (2,625 ft), and that VO2 max may fall temporarily at high altitude. That wording is from Edge cycling-computer manuals.

## What studies found

You will often see a claim that Garmin's estimate is accurate to within 5%. It traces back to a Firstbeat white paper that could not be reached, so the figure is left out. Here are the independent papers that could be checked.

**The Forerunner 245, in the lab.** Engel, Masur, Sperlich and Düking, *European Journal of Applied Physiology*, 2025 (DOI 10.1007/s00421-025-05923-x), compared the watch with a treadmill ramp test and gas analysis in 35 endurance athletes (24 men, 11 women), each doing two outdoor runs for the watch.

| Group | Watch minus lab (ml/kg/min) | Mean absolute % error |
|---|---|---|
| All 35 athletes | -4.73 and -4.05 (two runs) | about 7 to 8% |
| Moderately trained (18) | smaller | 4.1% to 2.8% |
| Highly trained (17) | -6.3 | 10.4% to 9.4% |

The authors split the groups at a lab VO2 max of 59.8 ml/kg/min. They concluded the estimates were valid in moderately trained athletes but less valid in highly trained ones, and that gas analysis remains the better choice when precision matters. Agreement across all athletes was only moderate (intraclass correlation 0.71 and 0.75). The paper itself has a few small inconsistencies between its abstract and tables, so the exact all-athlete error may be 6.7% rather than 7.2%.

**The wider evidence.** Molina-Garcia and colleagues, "Validity of Estimating the Maximal Oxygen Consumption by Consumer Wearables", *Sports Medicine*, 2022 (DOI 10.1007/s40279-021-01639-y), pooled 14 validation studies. Wearables that estimated VO2 max from exercise (the approach a running estimate from heart rate and pace takes) had almost no average bias, -0.09 ml/kg/min, but the limits of agreement ran from about -9.9 to +9.7. Devices that estimated from resting data overestimated by about 2.2 ml/kg/min on average, with limits from -13.1 to +17.4. The authors concluded that individual-level error is large and that these methods need improvement for sport or clinical use.

Read that second result carefully. A near-zero average bias does not mean your watch is right. It means errors in both directions cancel across a group. Your own error could easily be 5 ml/kg/min either way.

## Why your number may be off

- **Highly trained runners may be underestimated.** The 2025 study found its largest errors, and an underestimate, in its fitter group. One study of one watch model is not a rule, but it fits the common complaint that Garmin reads low for fit people.
- **Maximum heart rate.** An estimate that leans on a heart-rate-to-pace relationship is sensitive to the maximum heart rate in your profile. Garmin tells you to set it.
- **Heat, altitude and terrain.** Garmin applies corrections, but a hot day can still move a single reading, and Garmin's own advice for cyclists is steady effort without rolling terrain or heavy drafting.
- **Too few qualifying runs.** The watch needs steady outdoor efforts to update.

## How to use the number

Use it as a trend. Change over eight to twelve weeks, on similar routes and in similar weather, carries more information than any one reading. Do not use it to set training zones when you could use a lab test, a field test or your own heart rate zones. Prediction tools that start from VO2 max, such as race-time estimates, inherit whatever error the number carries. If you want a true figure, a laboratory test with a mask is the reference method.

```sketch
{"kind": "compare", "alt": "A watch estimates VO2 max from heart rate and pace, while a lab test measures oxygen directly with a mask.", "columns": [{"title": "Watch estimate", "tone": "orange", "items": ["Heart rate against pace", "Steady outdoor efforts", "Errors of roughly 3 to 10% in one study", "Good for trends"]}, {"title": "Lab test", "tone": "green", "items": ["Measures oxygen with a mask", "Treadmill ramp test", "The reference method", "Better when precision matters"]}], "caption": "From the 2025 Forerunner 245 study and Garmin's manuals."}
```

If your estimate has been dropping and Garmin has labelled your training Unproductive, [that post](/blog/garmin-training-status-unproductive/) covers what to check first. Fitbit's own VO2 estimate has the same limits: [Fitbit VO2 max and Cardio Fitness: how accurate?](/blog/fitbit-vo2-max-accuracy/)

## Where Pulse comes in

Pulse, a free app you host yourself, takes a VO2 max (a run value from the last 90 days, otherwise Fitbit's daily estimate, marked provisional) and places it against the FRIEND reference table from lab treadmill tests of 7,783 adults, by sex and age decade ([how Fitness level works](/metrics/fitness-level/)). That gives a percentile such as "Good". It is tested with the Fitbit Air only and does not read Garmin data. Because the table is lab-measured and your number is a wrist estimate, the percentile is approximate.

## What is not known

No independent validation could be found of Garmin's current watches beyond the Forerunner 245, so newer models may do better or worse. Garmin's own validation data was not available to check.

## Sources

1. [Engel et al., Validity of VO2max estimates from the Forerunner 245 smartwatch in highly vs. moderately trained endurance athletes, Eur J Appl Physiol 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12881131/)
2. [Molina-Garcia et al., Validity of Estimating the Maximal Oxygen Consumption by Consumer Wearables, Sports Med 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9213394)
3. [Garmin fenix 7 manual: Performance measurements](https://www8.garmin.com/manuals-apac/webhelp/fenix7series/EN-SG/GUID-0ECA590D-69D1-4223-96D9-4E222C58784D-8498.html)
4. [Garmin Edge 840 manual: About VO2 max estimates](https://www8.garmin.com/manuals-apac/webhelp/edge840/EN-SG/GUID-CD817AFD-CF9A-4EA1-A01F-DBCAD53082F0-6207.html)
