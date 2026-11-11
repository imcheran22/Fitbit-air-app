# CSV export of the daily table and of raw series

Labels: must-have, data

Users export health data by hand every week ("eliminate the step of manually exporting to a CSV every Sunday", HN) and the most-voted Fitbit community thread on HRV is literally "Export Heart Rate Variability (HRV) Data".

**What to build**
- Settings → Data → Export: a CSV of the 30 or 180-day daily table (date, recovery, sleep score, hours, efficiency, awakenings, HRV, resting HR, steps, distance, calories, active minutes, water, weight) shared through the Android share sheet.
- A second option for raw series (heart rate samples, sleep stages, workouts) as separate CSVs in a zip.
- No internet permission involved; the file goes through FileProvider like the share image.

Sources: https://news.ycombinator.com/item?id=44661673 and the Fitbit community thread "Export Heart Rate Variability (HRV) Data".
