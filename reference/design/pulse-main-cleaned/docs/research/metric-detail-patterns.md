# How health apps present one metric, and what Pulse takes from it

Researched 2026-10-03 for the metric detail screens (`/metric/[key]`, spec §11 MD1). Ideas only: no text, layouts, images or brand assets are copied, and app names stay in this file. Several vendor help pages refused automated reads or rendered empty; claims from those come from search-engine summaries of them and are marked *[snippet]*.

## 1. What the apps do

| App | Date | What a single metric's screen shows | Source |
|---|---|---|---|
| Google Health app (the Fitbit app's successor) | Launched 2026-05-19 | Four tabs (Today, Fitness, Sleep, Health). Tapping a metric that supports days shows **hourly activity**, then Week, Month or Year *[snippet]*. Focus stats became a customisable grid | [Google blog](https://blog.google/products-and-platforms/products/google-health/google-health-app/), [Help: what's new](https://support.google.com/googlehealth/answer/17068213?hl=en), [9to5Google, 2026-05-15](https://9to5google.com/2026/05/15/fitbit-4-69/) |
| Fitbit app (2025 redesign) | 2025 | Steps and Sleep toggle Day, Week, Month, 3 Months, Year; **hourly activity** came back as its own chart (a per-hour step goal); arrows either side of a chart step through periods; charts redrawn for readability | [Fitbit Help: redesigned app](https://support.google.com/fitbit/answer/16959617), [BGR](https://www.bgr.com/tech/fitbit-app-update-redesigns-charts-to-make-them-easier-to-read/), [9to5Google, 2025-11-09](https://9to5google.com/2025/11/09/fitbit-material-3-expressive/) |
| A recovery-wearable app | 2025 | Tap any My Dashboard tile to open its trend; switch Weekly, Monthly, 6-Month. Steps has a personal **step goal** and progress; a logged walk or run shows its own steps | [Home screen](#) *[snippet]*, [Trend views](#) *[snippet]* |
| Oura | Redesign 2025-10-20 | Three levels: glanceable (rings, bars, colour), focused (short-term patterns), exploratory (interactive weeks, months, years). Day, week, month, year switches; a **trend view for active minutes** (daily, weekly, monthly active time) | [TechCrunch, 2025-10-20](https://techcrunch.com/2025/10/20/oura-launches-redesigned-app-and-cumulative-stress-feature/), [Instrument case study](https://www.instrument.com/work/oura-app), [Oura press, 2025-05-21](https://www.businesswire.com/news/home/20250521864148/en/All-Movement-Counts-URA-Introduces-Enhanced-Activity-Features-and-Expands-Partner-Ecosystem) |
| Garmin Connect | 2024-02-13 (post) | Intensity minutes against the **150 minutes a week** guideline (or 75 vigorous); day, week, month and year views; "your own average weekly number for the past year" | [Garmin blog](https://www.garmin.com/en-US/blog/fitness/intensity-minute-data-sheds-light-on-fitness-habits/) |
| Apple Health | iOS 26 (2025) | Day, Week, Month, 6 Months, Year tabs on each data type; Highlights and Trends call out how much a metric changed and for how long; weight is a reading series with body fat and BMI beside it | [Apple: view your data](https://support.apple.com/guide/iphone/view-your-health-data-iphe3d379c32/ios), [How-To Geek](https://www.howtogeek.com/736676/how-to-track-your-weight-with-apples-health-app-on-iphone/) |
| A recovery-tracking app | Reviewed 2026-01-07 | Strain, Recovery and Sleep open into detail with trends; steps sit under Strain's trends; hydration is logged | [Australian Apple News review](#), [TechCrunch, 2025-10-30](#) |
| Baro | Site, undated | A Fitbit companion over Google Health: every score compared "to your last thirty nights"; sub-scores you can open; **zone minutes with a goal per zone**; workouts summed for the month; a month of logging at a glance | [baro.health](https://baro.health/) |

Evidence for the references Pulse draws on screen:

- **7,000 steps a day.** Ding et al., *Daily steps and health outcomes in adults*, The Lancet Public Health, 2025 (57 studies): against 2,000 steps, 7,000 a day went with a 47% lower all-cause mortality, and the authors suggest 7,000 as a realistic target. [University of Sydney, 2025-07-24](https://www.sydney.edu.au/news-opinion/news/2025/07/24/rethink-the-10000-a-day-step-goal-study-suggests.html), DOI 10.1016/S2468-2667(25)00164-1.
- **150 minutes a week.** WHO 2020 guidelines: 150-300 minutes of moderate activity a week, or 75-150 vigorous. Google's Active Zone Minutes count vigorous minutes double toward the same 150.
- **Protein 0.8 g per kg of body weight**: the long-standing adult RDA.

## 2. The patterns

1. **The day first, then history.** Every app opens on the selected day's number and, where per-minute data exists, *when* in the day it happened (hourly bars). History follows with W / M / 6M / 1Y.
2. **Compare with yourself.** Thirty-day baselines (Baro, the recovery-wearable app) and range averages against the previous range (Apple, Garmin).
3. **A target only where one is meaningful.** Steps and active minutes carry targets; heart rate and temperature carry a normal range instead.
4. **The unit of time follows the metric.** Active minutes are a *weekly* goal (Garmin, Oura's weekly active time); steps are daily; weight is a run of readings, not a daily total.
5. **Three depths** (Oura's framing): glance on Home, a focused screen, then exploration. Pulse's dashboard row, detail hero and history card map onto these.

## 3. What Pulse builds

One shell (hero for the day vs. the 30-day average, a history card with W / M / 6M / 1Y and the range's stats, an About card), plus sections chosen per metric from what Pulse actually stores:

| Metric | Sections | Data |
|---|---|---|
| Steps | Hourly bars; 7,000-step days (streak, longest streak, days this month); weekday pattern; 7,000 line on history | `steps_minutes`, `daily_metrics.steps` |
| Distance | Workout vs. everyday split on history; weekday pattern | `daily_values.distance`, `exercises.distance_m` |
| Floors, elevation | Weekday pattern | `daily_values` |
| Active minutes, Active Zone Minutes | This week against 150 min, the last 12 weeks, weeks met; minutes by intensity for the day | `daily_values`, `daily_metrics` zone minutes |
| Light activity | Minutes by intensity | `daily_values` |
| Sedentary time | Movement by hour and the longest stretch without steps; minutes by intensity | `steps_minutes`, `daily_values` |
| Calories, active calories | Active over resting split (calories); the day's workouts and their share of active burn | `daily_metrics.calories`, `daily_values.active_calories`, `exercises.calories` |
| Water | The day's entries | `logged_entries` |
| Calories eaten, protein, carbs, fat | Eaten vs. burned; the macro split; protein against 0.8 g/kg; the day's entries | `daily_values`, `daily_metrics.weight_kg`, `logged_entries` |
| Weight, body fat | Latest reading as the hero; 7-day average line on history; change over 30 and 90 days; recent readings | `daily_metrics` |
| Average heart rate, glucose, core temperature | Normal range shaded on history; days outside it | `daily_values` |
| Swim strokes | The shell only | `daily_values` |

Not built, for lack of data or a goal: a personal step goal (Pulse has no goals yet, so 7,000 is a reference, not the user's goal), sedentary time by hour (Google sends one daily total; the steps-per-hour view stands in), and hourly charts for anything but steps.
