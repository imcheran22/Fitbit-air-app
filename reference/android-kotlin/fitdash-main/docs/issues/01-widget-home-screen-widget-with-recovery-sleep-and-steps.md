# Home screen widget with recovery, sleep and steps

Labels: must-have, widget

Google Health's own widget shows "six numbers" for today with "no trend line", and users replace it within a week with widgets that show a sparkline, a sleep-stage breakdown and let them pick "only the ones I care about" (Android Police, May 2026).

**What to build**
- Glance widget in 2x2 (orb score + one line) and 4x2 (orb, sleep, steps, resting HR with 7-day sparklines).
- Tap opens the matching page.
- Refresh on a WorkManager schedule; needs `READ_HEALTH_DATA_IN_BACKGROUND`, declared and explained in the privacy page.
- Theme follows the app theme; optional Material You tint (see the dynamic colour issue).

**Why**
Retention. A dashboard app that is only seen when opened loses to one that is on the home screen.

Source: https://www.androidpolice.com/google-healths-home-screen-widget-bare-bones-replaced-with-better-widgets/
