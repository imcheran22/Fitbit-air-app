---
title: "How to export your Fitbit data in 2026"
description: "Three ways to get your Fitbit data out: Google Takeout, the Fitbit Data Export page and the Google Health API, with what each gives you and its limits."
published: "2026-08-17"
updated: "2026-10-09"
checked: "2026-10-09"
tags: [fitbit, google-health, data-export]
keywords: [export fitbit data, fitbit takeout, fitbit data export format, google health data export, fitbit web api shutdown]
---

For most people the answer is Google Takeout: sign in to the Google Account your Fitbit uses, tick Google Health, and ask for an archive. If your login has not moved to a Google Account yet, Fitbit's own Data Export page still works. Developers can pull the same data through the Google Health API.

The rest of this post covers each route, what comes out, and one date that matters if you use a third-party tool.

## Which route to pick

| You want | Use | Format | Effort |
|---|---|---|---|
| A full copy, once, to keep | Google Takeout | Zip or tgz archive; file formats inside vary | Minutes to request, up to days to arrive |
| A full copy, but your login is still a Fitbit one | Data Export on the Fitbit settings page | Archive by email | Up to a few days |
| One workout with GPS | Export in the Google Health app | TCX | Seconds |
| Data kept up to date in your own tool | Google Health API | JSON over REST | You write or run code |

## Google Takeout

This is Google's general tool for downloading whatever a Google Account holds. Google's help page for Fitbit data says to follow its standard Takeout instructions and "make sure Google Health is selected."

1. Sign in to the Google Account linked to your Fitbit, then open Google Takeout. Products you use are preselected. Deselect everything except Google Health unless you want the rest too, then choose Next step.
2. Pick a delivery method (an emailed link, or Drive, Dropbox, OneDrive or Box), a one-time or scheduled export, a file type and a maximum archive size, then choose Create export.
3. Wait for the email. Google says this can take anything from a few minutes to a few days, depending on how much data you have.

On file type, you choose between zip and tgz. Zip opens on almost any computer; tgz may need extra software on Windows. Archives larger than your chosen size are split into several files, so a 50 GB limit makes splitting less likely. A scheduled export runs every two months for a year, with the first archive created straight away.

What you cannot choose is the data format for each product. Google says it picked the types it considers most useful and portable. No Google page could be found that lists the file layout inside the Google Health folder, and third-party guides disagree on details such as how often heart rate is sampled, so open your own archive and look before you build anything on it. Google's help page says the export covers data like activity, exercise, sleep and heart rate, and that data isn't available for deleted accounts.

## Fitbit's own Data Export page

If your account has not been migrated to a Google Account, Google's help page still describes the older route. Sign in on the Fitbit settings page, open Data Export and you get two options.

**Request Data** asks for the full archive. You confirm by email, wait for a second email, then download. For large accounts Google warns it can take a few days.

**Export a selection of your Fitbit data** is quicker for a slice. You choose the time period, the data types and the file format, then download.

Nothing here tells you which formats are on offer, and no current Google page that does has been seen. Treat that menu as the source of truth.

## One workout from the app

For a GPS workout, open the Google Health app, go to the Fitness tab, tap the activity, then More, then Export. You get a Training Center XML (TCX) file you can share or save. TCX is understood by most training platforms, which makes this the easiest way to move a single run or ride somewhere else.

## The Google Health API

The Google Health API is, in Google's words, the next generation of the Fitbit Web API. It uses Google's OAuth 2.0 and returns data points per data type: its documentation lists 44 types, among them heart rate, sleep, daily resting heart rate, daily HRV, daily oxygen saturation, Active Zone Minutes, exercise and steps. Values arrive as structured JSON, not files, and distances, for instance, are in millimetres.

Two limits are worth knowing before you plan around it.

- It returns raw measurements and logs. Google's data-type list has no Daily Readiness, Cardio Load, Sleep Score or Resilience entry, so the scores you see in the app are not something you can download this way. A script can recompute something comparable from the raw data, but it will not match the app's number.

```sketch
{"kind": "compare", "alt": "What the Google Health API returns as raw data compared with the app scores it does not return.", "columns": [{"title": "Returned", "tone": "green", "items": ["Heart rate", "Sleep", "Daily resting heart rate and HRV", "Active Zone Minutes", "Exercise and steps"]}, {"title": "Not in the data-type list", "tone": "red", "items": ["Daily Readiness", "Cardio Load", "Sleep Score", "Resilience"]}], "caption": "From Google's Google Health API data-type list."}
```
- Access is controlled by Google. Checked on 9 October 2026, the developer page said Google was not accepting new projects and was working to open access to more developers. If you want to use it, check the current status first.

### The old Fitbit Web API is going away

If a spreadsheet tool, dashboard or script you rely on talks to the older Fitbit Web API, note the dates on Google's developer pages. Support for the legacy API ends on 30 September 2026. After that it keeps running without bug fixes or support. On 30 October 2026 it is turned off and stops working or syncing data to and from Fitbit users.

Some articles written earlier this year give 30 September as the shutdown. Google's own page now separates the two dates, so Google's are used here. Google's migration guide adds that existing Fitbit authorisations do not carry over: each user has to approve a new app against the Google Health API. If a tool you use has not announced its move, ask its maker now.

```sketch
{"kind": "steps", "alt": "The three steps of the legacy Fitbit Web API shutdown: support ends, the API is turned off, and users approve a new app.", "steps": [{"title": "30 September 2026", "text": "Support ends; the API runs without fixes."}, {"title": "30 October 2026", "text": "Turned off; syncing to and from Fitbit users stops."}, {"title": "Each user approves again", "text": "Old authorisations do not carry over."}], "caption": "Dates from Google's developer pages."}
```

## What you do not get

None of these routes gives you the app's computed scores as data, and none of them gives you your account's history from before you wore a device. Several guides mention that Health Connect, Android's shared health store, exposes less sleep-stage detail than Fitbit's own data, but that could not be confirmed from a primary page, so check before you rely on it as a backup.

An archive you never open is not a backup. When it arrives, unzip it, find your sleep and heart rate files and check they go back as far as you expect. If you are about to close a Google or Fitbit account, export first: Google's help page notes data is not available for deleted accounts.

## Using the data afterwards

An export is mainly good for archiving and for analysis in a spreadsheet or notebook. Pulse, a free app you host yourself ([how it works](/)), reads from the Google Health API instead of an archive, then lets you download its own daily scores and your journal answers as CSV or JSON from a Your data page. It does not import a Takeout archive, and it was built and tested with the Fitbit Air only.

## Sources

1. [Download your Fitbit or Google Health data, Google Health Help](https://support.google.com/googlehealth/answer/14236615)
2. [Download your Google data, Google Account Help](https://support.google.com/accounts/answer/3024190)
3. [Google Health API overview, Google for Developers](https://developers.google.com/health)
4. [Google Health API reference, legacy Fitbit Web API notice](https://developers.google.com/health/reference/rest/v4beta/users)
5. [Google Health API data types](https://developers.google.com/health/data-types)
6. [Migration guide, Google Health API](https://developers.google.com/health/migration)
