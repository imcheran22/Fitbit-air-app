# Morning out-of-range alert for overnight vitals

Labels: good-to-have, alerts

Apple Vitals and Oura's Symptom Radar notify when overnight metrics leave the user's normal range. fitdash already computes the ranges.

**What to build**
- Opt-in notification after the night is synced when resting HR, respiratory rate or skin temperature is outside the 30-day range, in the unhealthy direction, with the values.
- A matching card at the top of Today.
- Needs background read; shares infrastructure with the sync reminder issue.
