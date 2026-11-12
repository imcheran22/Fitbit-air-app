---
title: "Garmin Load Ratio and Acute Load: the ACWR link"
description: "How Garmin's Acute Load and Load Ratio work, how they relate to the acute:chronic workload ratio (ACWR) from sports science, and why that idea is contested."
published: "2026-07-20"
checked: "2026-10-09"
tags: [garmin, training-load]
keywords: ["garmin load ratio", "garmin acute load very high", "garmin optimal load ratio", "garmin acute load vs chronic load"]
---

Acute Load is Garmin's measure of how much training stress you've taken on in the last several days. Load Ratio divides that short-term load by your long-term load, and Garmin calls 0.8 to 1.4 optimal. This is the same idea as the acute:chronic workload ratio (ACWR) from sports science, which is popular and also heavily criticised.

## Acute Load: what Garmin says

Garmin's manuals define Acute Load as a weighted sum of your excess post-exercise oxygen consumption (EPOC) over the last several days. EPOC is the extra oxygen your body keeps using after exercise while it recovers, and the manual uses it as the input for both Acute Load and Training Effect, which it says is powered by Firstbeat Analytics.

The gauge reads low, optimal, high or very high. Unlike the ratio, the manuals give no fixed numbers for these four labels. They say the optimal range is based on your fitness level and training history, and that it moves as your training time and intensity change. So an Acute Load of 600 is high for one person and ordinary for another, and a number alone tells you little.

Garmin says "last several days", not a specific number of days, and no published weighting could be found.

## Load Ratio: the bands

Load Ratio compares your short-term (acute) load with your long-term (chronic) load. The manuals give the same bands across the models checked (Forerunner 965, tactix 8, fenix E and others):

| Load Ratio | Label | Garmin's wording |
|---|---|---|
| Below 0.8 | Low | Recent load is lower than your long-term load |
| 0.8 to 1.4 | Optimal | Recent and long-term loads are balanced |
| 1.5 to 1.9 | High | Recent load is higher than long-term |
| 2.0 or more | Very high | Recent load is much higher than long-term |

Two details in the manual are worth noting. The ratio only appears after 2 weeks of training. And if you pause Training Status (for example while injured or ill), the load ratio is among the features switched off, though activities still record. The manual also says the optimal range depends on your fitness level and training history, which is Garmin's way of saying the 0.8 to 1.4 band is a guide, not a personalised calculation you can see.

The manuals don't state how many days count as "short-term" or "long-term", so don't assume Garmin uses the 7-day and 28-day windows that most research does.

```sketch
{"kind": "flow", "alt": "Garmin's Load Ratio divides short-term acute load by long-term chronic load.", "inputs": [{"label": "Acute load, short term", "tone": "orange"}, {"label": "Chronic load, long term", "tone": "blue"}], "output": "Load Ratio = acute / chronic", "note": "Days in each window are not published", "caption": "From Garmin's owner's manuals."}
```

## Where the idea comes from

Dividing recent load by longer-term load comes from sports science. In the research version, acute load is usually the last 7 days and chronic load a rolling average of the last 28 days. A ratio near 1 means this week looks like your usual. A ratio well above 1 means you've done much more than your body is used to.

Tim Gabbett's 2016 paper in the British Journal of Sports Medicine, "The training-injury prevention paradox: should athletes be training smarter and harder?" ([BJSM 50(5):273-280](https://doi.org/10.1136/bjsports-2015-095788)), popularised the idea that a moderate ratio and a stable chronic load go with lower injury risk, and that sharp spikes go with higher. Secondary sources attribute a "sweet spot" of roughly 0.8 to 1.3 to it and a higher-risk zone above 1.5 to Blanch and Gabbett's 2016 paper ([BJSM 50(8):471-475](https://doi.org/10.1136/bjsports-2015-095445)). The full texts could not be read, so those thresholds are relayed second-hand. The studies were in team sports such as rugby league and Australian football, not in recreational runners.

Garmin's bands (optimal to 1.4, high from 1.5) look much like these figures. Garmin doesn't cite a source for its bands in the manual, so it cannot be said they were taken from this literature.

## The criticism, which is substantial

The ACWR is not settled science, and anyone using it should know that.

- **Mathematical coupling.** In the usual calculation the 7 acute days are also inside the 28-day chronic window. Lolli and colleagues argued in BJSM in 2019 that this creates a spurious correlation between the two terms, and suggested uncoupled versions where the acute week is not part of the chronic average ([BJSM 53(15):921-922](https://bjsm.bmj.com/content/53/15/921)).
- **Conceptual problems.** Impellizzeri and colleagues (IJSPP, 2020, [doi 10.1123/ijspp.2019-0864](https://doi.org/10.1123/ijspp.2019-0864)) argue that the ratio has known issues as a prognostic measure and that telling people to manipulate it to reduce injury assumes a causal effect nobody has shown. They call that speculation and an overinterpretation of existing data.
- **Does the ratio add anything?** In a 2021 Sports Medicine paper titled "Time to dismiss ACWR and its underlying theory", the same group re-ran published data after swapping the real chronic loads for fixed and randomly generated ones, and got similar apparent effects. They concluded that the association came from statistical artefacts and that neither the ratio nor acute load alone beat a model with no predictors (Sports Medicine 51:581-592; [full text](https://iris.univr.it/retrieve/e34cfb98-e922-4c2f-aab5-18583ab7e31b/Impellizzeri_What%20Role%20Do%20Chronic%20Workloads%20Play_SportMed_2021.pdf)).

The IOC's 2016 consensus statement on load in sport had recommended the ratio, so this is a live disagreement among researchers, not a fringe complaint. No full rebuttal was found to read, so where the field has settled is unclear.

## What this means for your watch

Load Ratio is a useful description and a weak prediction. It will reliably tell you that this fortnight is much heavier than your last month. It cannot tell you that you'll be injured, and the research doesn't support using it as a dial to prevent injury.

Practical reading:

- **Low (under 0.8).** You're doing less than usual. Fine in a taper or after illness, and the reason fitness slips if it lasts.
- **Optimal.** Nothing to see. Don't read it as a safety guarantee.
- **High or very high.** A real jump in load. After a training camp that's the plan. If it came from nowhere, ease the next few days and watch how you feel, not the number.
- **Short history.** Fewer than two weeks of data means the gauge hasn't earned much trust. A new watch will also have a thin chronic figure, which inflates the ratio.
- **Different loads.** Garmin's EPOC-based load is not the same quantity as session-RPE load or Fitbit's Cardio Load, so a ratio from one isn't comparable with another. The [Cardio Load vs Strain post](/blog/cardio-load-vs-strain/) covers how Google counts load.

## A Fitbit and Pulse version

Google's own Target Load uses a version of this ratio too, as touched on in [Fitbit Target Load too high or low?](/blog/fitbit-target-load/). Pulse's Training balance divides your average Strain over the last 7 days with data by your average over the last 28, so 1.00 means this week matches your usual, and it labels below 0.80 as undertrained, 0.80 to 1.29 balanced, 1.30 to 1.49 overreaching (pushing) and 1.50 and over as high risk ([how Training balance works](/metrics/training-balance/)). Pulse's page says the bands are a rule of thumb from team-sport research and it compares you only with yourself. It is a free app you host yourself, tested on the Fitbit Air only, and it uses heart rate for load, not Garmin's EPOC.

```sketch
{"kind": "compare", "alt": "Garmin's Load Ratio bands set beside Pulse's Training balance bands, which differ at the upper cut-offs.", "columns": [{"title": "Garmin Load Ratio", "tone": "orange", "items": ["Low: below 0.8", "Optimal: 0.8 to 1.4", "High: 1.5 to 1.9", "Very high: 2.0 or more"]}, {"title": "Pulse Training balance", "tone": "teal", "items": ["Undertrained: below 0.80", "Balanced: 0.80 to 1.29", "Overreaching: 1.30 to 1.49", "High risk: 1.50 and over"]}], "caption": "Bands from Garmin's owner's manuals and Pulse's published thresholds."}
```

## Sources

1. [Garmin owner's manual: Load Ratio (Forerunner 965)](https://www8.garmin.com/manuals-apac/webhelp/forerunner965/EN-SG/GUID-4535C8CD-357C-4673-8EBB-F1BCBE878158-2712.html)
2. [Garmin owner's manual: Acute Load (tactix 8)](https://www8.garmin.com/manuals-apac/webhelp/tactix8series/EN-SG/GUID-7B29647B-615E-46D4-A331-4A3C2993E384-4326.html)
3. [Gabbett TJ, The training-injury prevention paradox, BJSM 2016](https://doi.org/10.1136/bjsports-2015-095788)
4. [Blanch P, Gabbett TJ, Has the athlete trained enough to return to play safely? BJSM 2016](https://doi.org/10.1136/bjsports-2015-095445)
5. [Lolli L et al., Mathematical coupling causes spurious correlation within the conventional acute-to-chronic workload ratio calculations, BJSM 2019](https://bjsm.bmj.com/content/53/15/921)
6. [Impellizzeri FM et al., Acute:chronic workload ratio: conceptual issues and fundamental pitfalls, IJSPP 2020](https://doi.org/10.1123/ijspp.2019-0864)
7. [Impellizzeri FM et al., What role do chronic workloads play in the acute to chronic workload ratio? Time to dismiss ACWR and its underlying theory, Sports Medicine 2021](https://iris.univr.it/retrieve/e34cfb98-e922-4c2f-aab5-18583ab7e31b/Impellizzeri_What%20Role%20Do%20Chronic%20Workloads%20Play_SportMed_2021.pdf)
