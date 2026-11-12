# Heart rhythm UI: how the reference app and Google Health present ECG and AFib alerts

Scope: ECG result labels, disclaimers, history views and irregular rhythm notifications in the reference app (Heart Screener on the reference app MG) and Google Health (the Fitbit app, renamed Google Health on 2026-05-19 [GH-NEW]). Also where the reference app puts vitals, weight, glucose and temperature. What Pulse built from it: `docs/design/spec.md` §11 HM1. Accessed 2026-10-03. Source keys in [brackets]; full list at the end.

Caveat: support.the reference app's site and the reference app's site block automated fetches (Cloudflare / Salesforce shell). The reference app wording below comes from the FDA 510(k) summary, search-indexed excerpts of the reference app support pages, and reviews. Treat the reference app in-app strings as approximate.

## 1. ECG result labels

### Google Health API enum (authoritative, page updated 2026-10-01) [GH-API]

`Electrocardiogram.ResultClassification`, "The classification of the ECG reading rhythm":

| Enum | Description (verbatim) |
|---|---|
| `RESULT_CLASSIFICATION_UNSPECIFIED` | Unspecified result classification. |
| `NORMAL_SINUS_RHYTHM` | Heart rhythm appears normal. Corresponds to result "Normal Sinus Rhythm". |
| `ATRIAL_FIBRILLATION` | Signs of Atrial Fibrillation detected. Corresponds to result "Atrial Fibrillation". |
| `INCONCLUSIVE` | The reading is inconclusive as it could not be classified. Corresponds to result "Inconclusive". |
| `INCONCLUSIVE_HIGH_HEART_RATE` | The reading is inconclusive as it could not be classified because heart rate is high (>120bpm). Corresponds to result "Inconclusive: High heart rate". |
| `INCONCLUSIVE_LOW_HEART_RATE` | The reading is inconclusive as it could not be classified because heart rate is low (<50bpm). Corresponds to result "Inconclusive: Low heart rate". |
| `UNREADABLE` | The reading is unreadable. |
| `NOT_ANALYZED` | The reading was not analyzed. |

Other `Electrocardiogram` fields [GH-API]: `interval` (start = end = reading time; historical ECGs lack UTC offsets, so use physical time, not civil time), `resultClassification` (optional), `waveformSamples[]` (lead I, integers), `samplingFrequencyHertz`, `millivoltsScalingFactor` (mV = sample / factor), `beatsPerMinuteAvg` (int64 as string), `leadNumber`, `medicalDeviceInfo` (firmwareVersion, featureVersion, deviceModel).

### Fitbit / Google ECG app (in-app strings)

- Result screen [FB-ECG-IFU]: "Normal sinus rhythm: Your heart rhythm appears normal." / "Atrial fibrillation: Your heart rhythm shows signs of AFib. You should contact your doctor." / "Inconclusive: Your heart rate was too low, too high, or the Fitbit ECG app couldn't get a good reading." Buttons: Learn more, Done, Retake (inconclusive only).
- Longer copy [FB-ECG-IFU]: Normal Sinus Rhythm, "It doesn't show signs of AFib, an irregular heart rhythm." Atrial Fibrillation, "AFib can have serious health effects. You should contact your doctor."
- Three inconclusive subtypes [FB-ECG-IFU]: "Inconclusive: High heart rate" (over 120 bpm; causes listed: recent exercise, stress, nervousness, alcohol, dehydration, infection, AFib or other arrhythmia), "Inconclusive: Low heart rate" (under 50 bpm; beta-blockers, calcium channel blockers, excellent aerobic fitness, other arrhythmia), "Inconclusive: Didn't get a good reading" (movement, hands not on a table, loose fit, uneven breathing, wrong wrist, nearby electronics).
- Retake guidance ends with: "If you get an inconclusive result repeatedly, or you're not feeling well, talk to your healthcare provider." [FB-ECG-IFU]
- 2026 help page (Google ECG app) keeps the same three headline results [GH-ECG].

### The reference app Heart Screener (ECG on the reference app MG)

- FDA-cleared outputs (K243236, 2025-04-04): Normal Sinus Rhythm; AFib; Low Heart Rate; High Heart Rate; Inconclusive; Unsuccessful Reading [WH-FDA]. Detailed classes: Low Heart Rate (<= 50 bpm), Normal Sinus Rhythm (51-99), High Heart Rate - No Atrial Fibrillation Detected (100-150), Atrial Fibrillation (51-99), Atrial Fibrillation - High Heart Rate (100-150), High Heart Rate (>150 and <=200), Inconclusive, "ECG Reading Unsuccessful" [WH-FDA].
- Support copy (search excerpt) [WH-ECG]: Normal Sinus Rhythm, "your heart is beating in a steady, regular pattern"; Inconclusive, "the signal couldn't be classified. This may be due to movement, signal quality, or an unrecognized rhythm."
- Unlike Fitbit, the reference app treats high and low heart rate as their own results, not as "Inconclusive" variants [WH-FDA].

### Apple (comparison) [AP-ECG]

Sinus Rhythm ("uniform pattern between 50 and 100 BPM"), Atrial Fibrillation, Low or High Heart Rate, Inconclusive ("the recording can't be classified"), Poor Recording (ECG v2). FDA treats the reference app "Unreadable" as analogous to Apple "Poor Recording" [WH-FDA].

## 2. Disclaimers

- Fitbit ECG [FB-ECG-IFU]: "This product CANNOT detect heart attack, blood clots, stroke, or other heart conditions." "The assessment carried out by this product is NOT a diagnosis." "DO NOT use for continuous, real-time or self-monitoring of heart rhythm." "DO NOT change your medication without first speaking to your doctor." Not intended for people under 22.
- Google ECG help [GH-ECG]: "Only a doctor can diagnose AFib, but the results of the assessment can let you know if your heart rhythm has signs of the condition." It "can't detect all heart conditions".
- The reference app [WH-FDA]: "intended for informational use only"; "not intended to replace traditional methods of diagnosis or treatment"; adults 22+; not recommended with other known arrhythmias or pacemakers/ICDs [WH-ECG].
- Apple (the only one with explicit emergency wording) [AP-ECG][AP-IRN]: "cannot detect a heart attack. If you ever experience chest pain, pressure, tightness, or what you think is a heart attack, call emergency services immediately."

## 3. ECG history

- Fitbit [FB-ECG-IFU]: You tab > Health assessments > ECG tile > "View history" lists all past results. Tap one: date and time, result, average heart rate (dashes when HR could not be measured), "Export a PDF for your doctor", "Delete result" at the bottom.
- Google Health 2026 [GH-ECG]: Health tab > "Health checks" > ECG; readings shown with timestamps; "Export PDF for your provider".
- The reference app [WH-FDA][REV-T3]: waveform is shown as a PDF report in the app; report can be downloaded or shared by email or messaging.

## 4. Irregular rhythm notifications (IRN)

- How alerts reach the user [FB-IRN-IFU]: phone push (if allowed), then a card at the top of the Today tab with "View result". At most one notification per day. "If you receive a notification, it means we saw signs of an irregular rhythm that may be AFib in multiple readings." Exact push text is only shown as an image in the IFU.
- History [FB-IRN-IFU]: Health assessments > "Irregular rhythm notifications" tile > View history: list of notifications and when they occurred. Tap one: list of irregular readings with time and min/max heart rate; summary with first reading, last reading, and when the data was recorded. Tap a reading: beat-to-beat list (bpm + timestamp), min/max bpm at the top.
- Screening framing [FB-IRN-IFU]: "intended to opportunistically surface a notification"; "the absence of a notification is not intended to indicate no disease process is present"; "If you don't get a notification, it's possible to still have AFib. Fitbit is not always looking for AFib." Not for people under 22 or with diagnosed AFib.
- No public empty-state string for "no notifications" found for Fitbit/Google [GH-IRN] or the reference app.
- The reference app [WH-ECG][WH-REG]: "Irregular Heart Rhythm Notifications (IHRN)" inside Heart Screener, "help members monitor potential signs of atrial fibrillation (AFib)". The reference app Life + MG only, 22+, not for known AFib, region-gated.
- Apple [AP-IRN]: "identified an irregular rhythm suggestive of AFib and confirmed it with multiple readings"; "If you're not feeling well, you should talk to your doctor even if you don't get a notification."

### Google Health API shape [GH-API][GH-IRNP]

- `IrregularRhythmNotification`: `interval`, `alertWindows[]`, `medicalDeviceInfo` (algorithmVersion, serviceVersion, deviceModel).
- `AlertWindow`: `startTime`, `endTime`, UTC offsets, civil times, `positive` (always true from the API: "the current version of the algorithm will only produce alerts if all windows are positive"), `heartBeats[]`.
- `HeartBeat`: `physicalTime`, `utcOffset`, `civilTime`, `beatsPerMinute`.
- `users.getIrnProfile`: `onboardingStatus`, `enrollmentStatus`, `updateTime` ("the last piece of analyzable data synced by the user"). This is what separates "not set up" from "set up, nothing found".

## 5. The reference app Health tab layout (2025-26)

- Health tab features [WH-BASICS][CS-REV]: Health Monitor, Heart Screener (ECG + IHRN, Life/MG), Blood Pressure Insights (Life/MG), Healthspan (Pulse Age, Pace of Aging), Stress Monitor, Hormonal Insights. Exact on-screen order not verified.
- Health Monitor [WH-HM]: Live Heart Rate on top, then the nightly vitals RHR, HRV, Respiratory Rate, Blood Oxygen (SpO2, 90-100%), Skin Temperature, each flagged as in or out of the member's typical range [WH-HMF]. "Export Health Report" at the bottom (30- and 180-day PDF). Also shown lower on the Home screen.
- Blood Pressure Insights [WH-BP]: daily systolic/diastolic range estimated overnight; one-time calibration with 3 cuff readings; "not a medical device".
- Weight and body composition [WH-BODY]: a separate "Body Composition & Weight Trends" feature (weight, lean body mass, body fat %), from Withings, Apple Health, Health Connect or manual entry. Not part of the Health Monitor vitals grid.
- Glucose: no CGM integration in the reference app as of 2026-10. Glucose appears only as a blood biomarker in Advanced Labs [WH-LABS]. CGM is "planned" [FITT-GLU]; a non-invasive glucose patent was published 2026-07-16 [GW-GLU]. Google Health added Abbott Lingo CGM import in 2026 [AA-LINGO].
- Temperature: the reference app shows skin temperature only, as a nightly vital in Health Monitor [WH-HM]. No core temperature.
- Google Health 2026 Health tab groups heart rate, weight, breathing rate and SpO2 under "Vitals", plus "Health checks" for ECG [GH-NEW][GH-ECG].

## Implications for Pulse

**Labels and explanations (one per enum value):**

| Enum | Label | Explanation |
|---|---|---|
| `NORMAL_SINUS_RHYTHM` | Normal sinus rhythm | Your heart rhythm appears normal and doesn't show signs of AFib. |
| `ATRIAL_FIBRILLATION` | Atrial fibrillation | This reading shows signs of AFib, an irregular heart rhythm, so contact your doctor. |
| `INCONCLUSIVE` | Inconclusive | This reading couldn't be classified, often because of movement, a weak signal or another rhythm. |
| `INCONCLUSIVE_HIGH_HEART_RATE` | Inconclusive: high heart rate | Your heart rate was over 120 bpm, which is too high to check your rhythm. |
| `INCONCLUSIVE_LOW_HEART_RATE` | Inconclusive: low heart rate | Your heart rate was under 50 bpm, which is too low to check your rhythm. |
| `UNREADABLE` | Poor recording | The signal was too noisy to read, so retake it sitting still with your arm on a table. |
| `NOT_ANALYZED` | Not analyzed | This recording was saved but not classified, so there is no rhythm result. |
| `RESULT_CLASSIFICATION_UNSPECIFIED` or missing | No result | No rhythm result came with this recording. |

Colour: only `ATRIAL_FIBRILLATION` gets a warning colour. All inconclusive and unreadable states stay neutral, not red.

**Disclaimer (show on the ECG and IRN screens):** "This is not a diagnosis and can't detect a heart attack, blood clots or stroke. Talk to your doctor about any result, and if you have chest pain or think you're having a heart attack, call emergency services."

**Empty states:**
- No ECG readings: "No ECG readings yet. Take one with the ECG app on your watch and it will show up here after it syncs."
- IRN not set up (`onboardingStatus` or `enrollmentStatus` false): "Irregular rhythm notifications are off. Turn them on in the Google Health app to get alerts for signs of AFib."
- IRN on, none found: "No irregular rhythm notifications. This check runs from time to time while you're still or asleep, not all the time, so no alert doesn't rule out AFib." Add "Last checked {updateTime}" when present.

**History row:** date and time, label, average bpm (dash if missing). Detail: waveform (`waveformSamples / millivoltsScalingFactor` at `samplingFrequencyHertz`), avg bpm, device model. Skip PDF export for now. IRN row: date, count of alert windows, min-max bpm. Detail: per-window time range and beat list.

**Placement relative to the reference app's layout:**
1. Vitals grid first (RHR, HRV, respiratory rate, SpO2, skin temperature), same as Health Monitor.
2. Heart rhythm next (latest ECG + IRN status), where Heart Screener sits.
3. Body after that: weight and body fat as their own section, like the reference app's separate Body Composition & Weight Trends. Not in the vitals grid.
4. Glucose last, as its own section. The reference app has no CGM view to copy; treat it like a logged measurement (readings list + daily range).
5. Core body temperature: a spot reading, not a nightly baseline. Show it as a row below the vitals grid (latest value + time). Keep the skin-temperature tile in the grid separate.

## Sources

- [GH-API] Google Health API, users.dataTypes.dataPoints reference. https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints (updated 2026-10-01)
- [GH-IRNP] Google Health API, users.getIrnProfile. https://developers.google.com/health/reference/rest/v4/users/getIrnProfile (accessed 2026-10-03)
- [GH-ECG] What is the Google ECG app? Google Health Help. https://support.google.com/fitbit/answer/14236718 (accessed 2026-10-03)
- [GH-IRN] How do Google Irregular Rhythm Notifications check for AFib? https://support.google.com/fitbit/answer/14236719 (accessed 2026-10-03)
- [GH-NEW] What is new with the redesigned Google Health app. https://support.google.com/googlehealth/answer/17068213 (2026-05-19)
- [FB-ECG-IFU] Fitbit ECG App Instructions for Use, Version AW. https://storage.googleapis.com/support-kms-prod/30354db9-19f7-4a5f-b192-8fb094762edd (2024-09-10)
- [FB-IRN-IFU] Fitbit Irregular Rhythm Notifications IFU, Version AB. https://storage.googleapis.com/support-kms-prod/d9642094-5e8a-41ef-991d-ecdb53612f58 (2025-08-20)
- [WH-FDA] FDA 510(k) K243236, the reference app ECG Feature. https://www.accessdata.fda.gov/cdrh_docs/pdf24/K243236.pdf (2025-04-04)
- [WH-ECG] the reference app Support, ECG: Data Accuracy & Best Practices. # (accessed 2026-10-03, via search excerpt)
- [WH-REG] the reference app Support, Regional Feature Availability. # (accessed 2026-10-03, via search excerpt)
- [WH-BASICS] the reference app Support, the reference app Basics. # (accessed 2026-10-03, via search excerpt)
- [WH-HM] the reference app Support, the reference app Health Monitor & Report. # (accessed 2026-10-03, via search excerpt)
- [WH-HMF] the reference app Locker, The Health Monitor: Breakdown of Key Metrics. # (accessed 2026-10-03, via search excerpt)
- [WH-BP] the reference app Support, the reference app Life: Blood Pressure Insights. # (accessed 2026-10-03, via search excerpt)
- [WH-BODY] the reference app Support, Body Composition & Weight Trends. # (accessed 2026-10-03); launch press release https://www.businesswire.com/news/home/20240710548956/en (2024-07-10)
- [WH-LABS] the reference app Locker, the reference app Advanced Labs. # (accessed 2026-10-03)
- [FITT-GLU] Fitt Insider, the reference app Eyes IPO, Glucose Monitoring. # (2025-11)
- [GW-GLU] Gadgets & Wearables, the reference app glucose monitoring patent. # (2026-07-16)
- [AA-LINGO] Android Authority, Google Health to track blood glucose (Abbott CGM). https://www.androidauthority.com/google-health-abbott-cgm-3697206/ (accessed 2026-10-03)
- [CS-REV] Creative Strategies, Beyond Tracking: the reference app MG Review. # (2025-05-08)
- [REV-T3] T3, the reference app MG review. # (accessed 2026-10-03)
- [AP-ECG] Apple Support, ECG app results. https://support.apple.com/en-us/120278 (2026-09-14)
- [AP-IRN] Apple Support, Heart health notifications on Apple Watch. https://support.apple.com/en-us/120276 (2026-09-28)
