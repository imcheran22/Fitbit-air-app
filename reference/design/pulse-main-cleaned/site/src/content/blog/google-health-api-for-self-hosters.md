---
title: "Google Health API for self-hosters: scopes and user cap"
description: "What a self-hosted app needs from the Google Health API: the OAuth scopes Pulse asks for, the 100-user cap on unverified apps, and the Cloud project steps."
published: "2026-10-03"
updated: "2026-10-09"
checked: "2026-10-09"
tags: [google-health, self-hosting, data-export]
keywords: ["google health api", "google health api scopes", "google health api pricing", "fitbit api for personal use", "google health api oauth 100 users"]
---

If you want to read your own Fitbit or Pixel Watch data from a script or a home server, you need a Google Cloud project, an OAuth client and consent for the scopes you ask for. While the app stays unverified, Google caps it at 100 users. That is plenty for personal use, and it is the main limit you will meet.

This is written from the point of view of someone running a small self-hosted app, using the settings [Pulse](/) ships with as the worked example. Everything about Google's side comes from Google's own developer and help pages, read on 9 October 2026.

## Why you are looking at this at all

Google calls the Google Health API "the next generation of the Fitbit Web API". Its migration guide says support for the legacy Fitbit Web API ends on 30 September 2026 and that the API is turned off on 30 October 2026. Old Fitbit tokens don't carry over: each user has to consent again to a Google Health integration.

So a tool that used to ask for a Fitbit developer key now needs a Google Cloud OAuth client instead. The data is the same family (heart rate, sleep, HRV, activity), but the setup is new.

One thing to check before you start. Google's overview page said new projects were not currently being onboarded, and that Google was "actively working to open access to more developers". The conditions behind that could not be found. If your project can't enable the API, that is the first place to look, and Google's developer pages are where any change would be announced.

## What it costs

The pages read show no price for the API and no per-call charge. Google's setup guide links to a separate rate-limits page, which was not read in full, so no quota numbers are given here. Treat "free, with rate limits" as what the pages showed, not as a promise.

## The setup, in outline

Google's [setup guide](https://developers.google.com/health/setup) is short. In order:

1. Create or pick a Google Cloud project.
2. Enable the Google Health API on it.
3. Create an OAuth 2.0 client ID of type Web application, with an authorised redirect URI pointing at your app's callback.
4. On the Audience page, leave the app as External and in Testing, and add yourself as a test user.
5. On the Data Access page, pick the scopes your app needs.
6. Have each user link their account in the Google Health app before the OAuth flow, then connect.

Google also says the API has no sandbox and no sample data, so you separate development and production by project and test against real devices. For the full click-through with a home server and Tailscale, Pulse's [setup guide](https://github.com/adityaongit/pulse/blob/main/docs/setup.md) has every step.

## The scopes

Google's [scopes page](https://developers.google.com/health/scopes) lists 17. Each is prefixed with `https://www.googleapis.com/auth/googlehealth.` and comes in read-only or write-only form. There is no read-write scope, which is a good design: a tool that only draws charts can't change your data.

| Scope suffix | Access | Google's description |
|---|---|---|
| `activity_and_fitness` | read, write | Activity and fitness data |
| `health_metrics_and_measurements` | read, write | Health metrics and measurements |
| `sleep` | read, write | Sleep data |
| `ecg`, `irn` | read | ECG data, irregular rhythm notifications |
| `nutrition` | read, write | Nutrition data |
| `profile`, `settings` | read, write | Profile data, settings |
| `location` | read | GPS location recorded during an exercise |
| `mindfulness`, `logged_symptoms`, `reproductive_health` | write | Mindfulness, logged symptoms, reproductive health |

Google's page describes the permissions but does not say whether any scope is classed as sensitive or restricted under its OAuth policy, so this post does not guess. What it does say is to request only what you need and to explain each scope in the app.

### What Pulse asks for

Pulse requests 13 of them. Read: activity and fitness, health metrics and measurements, sleep, ECG, irregular rhythm notifications, nutrition, profile (for age at onboarding) and settings (to check whether the account has a paired device). Write: nutrition, health metrics, mindfulness, logged symptoms and reproductive health, used only when the owner logs something in Pulse's Journal.

It leaves out `location` because it reads nothing from GPS, and the read side of mindfulness, symptoms and reproductive health because those types are write-only at Google. If your app doesn't use a scope, drop it. A consent screen that asks for your ECG and cycle data from a tool that never reads them is a fair thing for a user to object to, even when that user is you.

One quirk worth knowing: nutrition has no usable read-only scope for logs. Pulse's code notes that `nutrition.writeonly` is what lets a list call return food and water entries, so it asks for both.

## The 100-user cap

Google's setup guide says new OAuth clients start unverified "with a cap of 100 users for both testing and production purposes", and that until verification you must add each user's email to the test users list. Supporting more than 100 users "requires completion of a third party security review".

Google's [Cloud help page on unverified apps](https://support.google.com/cloud/answer/7454865) adds two details. The limit is 100 new users in total, counted after the unverified app screen first appears to them. And an app that requests sensitive or restricted scopes without verification shows users a warning before the consent screen.

For a self-hoster this works out simply:

- **Just you, or you and your family.** You are nowhere near 100. You stay in Testing or switch to production without verifying, and click through the "unverified app" warning for your own app.
- **A public service for strangers.** You need verification: a privacy policy URL, a verified domain, a submission from the consent screen and, for this API, the third-party security review. That is a different project from a home server.

```sketch
{"kind": "compare", "alt": "What a personal install needs compared with a public service under the 100-user cap", "columns": [{"title": "Just you or family", "tone": "green", "items": ["Far below the 100-user cap", "Stay in Testing or go to production", "No verification needed", "Click through the unverified warning"]}, {"title": "Public service", "tone": "orange", "items": ["Verification is required", "Privacy policy URL", "Verified domain", "Consent screen submission", "Third-party security review"]}], "caption": "From Google's setup guide and Cloud help page."}
```

The cap belongs to the OAuth client, as Google's pages read. Each self-hoster who creates their own client has their own 100, so nobody has to run a central service for everyone.

### The seven-day trap

In Testing status, Google's setup page says refresh tokens expire after 7 days. An app that syncs fine for a week and then asks you to reconnect is almost certainly this. Moving the audience to "In production" avoids it, because refresh tokens then last until you revoke them or leave them unused for a long period. Pulse's own guide takes this route for a personal install: no verification, you just see the warning when you connect.

```sketch
{"kind": "compare", "alt": "Refresh tokens expire after 7 days in Testing but last until revoked in production", "columns": [{"title": "Audience: Testing", "tone": "red", "items": ["Refresh tokens expire after 7 days", "Sync works, then asks you to reconnect"]}, {"title": "Audience: In production", "tone": "green", "items": ["Tokens last until you revoke them", "Or leave them unused a long time", "No verification, just the warning"]}], "caption": "From Google's setup guide."}
```

## Mistakes that cost an evening

- **Scopes in the code that differ from the consent screen.** Google's help page says this alone can trigger the unverified warning.
- **A redirect URI that doesn't match exactly.** Scheme, host and path all count. A Tailscale or reverse-proxy address is a different host from `localhost`.
- **Connecting before the account is linked.** Google's setup guide says users link Google Health in the mobile app first, and tells you to call `users.getIdentity` after the token exchange to confirm. A Fitbit-only account that was never migrated can connect to nothing.
- **Expecting Google's scores.** The API returns raw data types: sleep, heart rate, HRV and so on. It has no Readiness, Cardio Load, Sleep Score or Resilience type. Any tool built on it computes its own scores.

## Where Pulse fits

If you'd rather not build the plumbing, Pulse is a free app you host yourself that does the OAuth flow, stores the data in your own Postgres and computes Recovery, Strain and Sleep Performance from it. It is built and tested with a Fitbit Air only. Other devices that sync to Google Health send the same data types, but they have not been tested. If you want the raw files instead, see [how to export your Fitbit data](/blog/export-fitbit-data/).

## Sources

1. [Google Health API overview](https://developers.google.com/health)
2. [Google Health API migration guide](https://developers.google.com/health/migration)
3. [Set up Google Cloud and OAuth](https://developers.google.com/health/setup)
4. [Google Health API scopes](https://developers.google.com/health/scopes)
5. [Google Cloud help: unverified apps](https://support.google.com/cloud/answer/7454865)
6. [Pulse setup guide](https://github.com/adityaongit/pulse/blob/main/docs/setup.md)
