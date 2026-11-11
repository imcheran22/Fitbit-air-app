# Explain missing data per watch instead of showing an empty tile

Labels: must-have, sync

Users with Galaxy Watch report HRV and SpO2 "inaccessible due to Samsung limitations" and ask for "clarity on why data isn't syncing when all permissions are given" (Sleep as Android forum, Samsung community).

**What to build**
- A per-source knowledge table: which types Fitbit, Samsung Health, Google Health, Garmin, Zepp and Huawei actually write to Health Connect.
- In Data sources, a one-line reason next to a granted-but-empty type: "Samsung Health does not share HRV with Health Connect" with a link to the vendor note.
- On the Today page, when recovery is calibrating because HRV is absent, say so explicitly rather than "night 1 of 7".

Sources: https://forum.urbandroid.org/t/health-connect-sync-not-working-for-hrv-and-spo2/12000, https://us.community.samsung.com/t5/Galaxy-Watch/Health-Connect-issues-with-HRV/m-p/3683948
