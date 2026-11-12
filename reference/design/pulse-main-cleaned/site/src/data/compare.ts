// Re-check third-party claims on each content update and update `checked`.
import type { Faq, Source } from "./metrics"

export type Table = { head: string[]; rows: string[][]; caption: string }
export type Section = { h: string; p?: string[]; list?: string[]; table?: Table }
export type Comparison = {
  slug: string
  nav: string
  title: string
  h1: string
  description: string
  /** Search phrases the page answers, for its meta keywords. Brand names are allowed in comparisons. */
  keywords: string[]
  /** The direct answer, first thing on the page (under about 60 words). HTML allowed. */
  answer: string
  sections: Section[]
  faq?: Faq[]
  sources: Source[]
  /** The date the page first went live. */
  published: string
  /** The date the third-party facts were last checked. */
  checked: string
}

const SRC = {
  googleBlog: { label: "Google: Fitbit Air and the Google Health app (launch post, 2026-05-07)", url: "https://blog.google/products-and-platforms/products/google-health/google-health-fitbit/" },
  googleIndia: { label: "Google India: Fitbit Air comes to India (2026)", url: "https://blog.google/intl/en-in/products/hardware/the-all-new-fitbit-air-comes-to-india/" },
  premiumPrice: { label: "Android Authority: Google Health Premium price and features", url: "https://www.androidauthority.com/google-health-premium-price-inclusions-features-3664507/" },
  dtFree: { label: "Digital Trends: Fitbit Air's core features don't need a subscription" },
  fiveK: { label: "the5krunner: Fitbit Air review and buyer's guide (2026-05-07)", url: "https://the5krunner.com/2026/05/07/fitbit-air-opinion-review-buyers-guide/" },
  oauthCap: { label: "Google Cloud help: unverified apps and the 100-user cap", url: "https://support.google.com/cloud/answer/7454865?hl=en" },
  noop: { label: "noop on GitHub", url: "https://github.com/ryanbr/noop" },
  haelan: { label: "Hælan on GitHub", url: "https://github.com/bardesss/haelan" },
  fitbitGrafana: { label: "fitbit-grafana on GitHub", url: "https://github.com/arpanghosh8453/fitbit-grafana" },
  whoopRecovery: { label: "WHOOP support: Recovery", url: "https://support.whoop.com/s/article/WHOOP-Recovery?language=en_US" },
  whoopStrain: { label: "WHOOP support: Strain", url: "https://support.whoop.com/hc/en-us/articles/360019453214-WHOOP-Strain" },
  whoopSleep: { label: "WHOOP support: Sleep", url: "https://support.whoop.com/s/article/WHOOP-Sleep?language=en_US" },
  whoopPricing: { label: "trackervs: WHOOP membership pricing", url: "https://trackervs.com/pricing/whoop-pricing/" },
  gReadiness: { label: "Google Health Help: Daily Readiness", url: "https://support.google.com/googlehealth/answer/14236710?hl=en" },
  gCardioLoad: { label: "Google Health Help: Cardio Load and Target Load", url: "https://support.google.com/googlehealth/answer/15402655?hl=en" },
  gSleepScore: { label: "Fitbit Help: Sleep Score", url: "https://support.google.com/fitbit/answer/14236513?hl=en" },
  gApiTypes: { label: "Google Health API: data types", url: "https://developers.google.com/health/data-types" },
  cirqaReview: { label: "TechRadar: Garmin Cirqa review", url: "https://www.techradar.com/health-fitness/fitness-trackers/garmin-cirqa-review" },
  cirqaDigital: { label: "Digital Citizen: Garmin launches the $200 Cirqa, no screen or subscription fees", url: "https://www.digitalcitizen.life/garmin-launches-200-cirqa-fitness-band-with-no-screen-or-subscription-fees/" },
  garminManuals: { label: "Garmin owner's manuals and support: Training Readiness, HRV Status, Body Battery, Sleep Score (read via search excerpts)" },
  helioLaunch: { label: "Android Authority: Amazfit Balance 2 and Helio Strap launch", url: "https://www.androidauthority.com/amazfit-balance-2-helio-strap-launch-3570260" },
  helioReview: { label: "Android Authority: Amazfit Helio Strap review", url: "https://www.androidauthority.com/amazfit-helio-strap-review-3570632" },
  helioTechradar: { label: "TechRadar: Amazfit Helio Strap vs Polar Loop vs WHOOP 5.0", url: "https://techradar.com/health-fitness/fitness-trackers/amazfit-helio-strap-vs-polar-loop-vs-whoop-5-0-which-should-you-buy" },
  zepp: { label: "Zepp Health: technology and algorithm pages (read via search excerpts)" },
  ouraReadiness: { label: "Oura: Readiness Score", url: "https://ouraring.com/readiness-score" },
  ouraMembership: { label: "Oura: membership", url: "https://ouraring.com/membership" },
  samsungEnergy: { label: "Gadgets and Wearables: Understanding Samsung's Energy Score", url: "https://gadgetsandwearables.com/2024/07/12/how-to-use-samsung-energy-score/" },
  appleReadiness: { label: "Apple Newsroom: Introducing Apple Watch Series 12 (September 2026)", url: "https://apple.com/newsroom/2026/09/introducing-apple-watch-series-12-with-the-all-new-health-sensing-system/" },
  appleSleep: { label: "AppleInsider: how Sleep Score works on Apple Watch with watchOS 26", url: "https://appleinsider.com/articles/25/09/12/how-sleep-score-works-on-apple-watch-with-watchos-26" },
  takeout: { label: "Google Health Help: export your data", url: "https://support.google.com/googlehealth/answer/14236615?hl=en" },
}

const CHECKED = "2026-10-03"
const NOW = "2026-10-09"

export const COMPARISONS: Comparison[] = [
  {
    slug: "fitbit-air-recovery-and-strain",
    published: "2026-10-03",
    nav: "Fitbit Air recovery and strain",
    title: "Does the Fitbit Air have strain and recovery scores?",
    h1: "Does the Fitbit Air have strain and recovery scores?",
    keywords: ["fitbit air recovery score", "does fitbit air track strain", "fitbit air strain score", "fitbit air readiness vs recovery", "fitbit air vs whoop"],
    description: "The Google Health app gives Fitbit Air owners Readiness and Cardio Load, not a 0-100% Recovery or a 0-21 Strain. How to get both, free and self-hosted.",
    answer:
      "Not in that form. The Google Health app gives Fitbit Air owners a Daily Readiness score and Cardio Load, but no 0-100% morning Recovery and no 0-21 daily Strain. Pulse computes both, with Sleep Performance, Pulse Age, Stress and Energy Bank, from the band's own data on a server you run.",
    sections: [
      {
        h: "What the Google Health app gives you",
        p: [
          "The Fitbit Air is Google's screenless band, announced in May 2026 at $99 in the US. Reviews list heart rate, HRV, SpO2, skin temperature, sleep stages, Cardio Load and Daily Readiness among the features that need no subscription. Google Health Premium adds the Gemini-based Google Health Coach, adaptive plans and deeper sleep insights.",
          "Reviewers who compared the Air with subscription recovery bands describe its recovery scoring as simpler, with no 0-21 daily strain scale.",
        ],
      },
      {
        h: "Fitbit Air and Google Health against WHOOP, score by score",
        table: {
          caption: `Checked ${NOW}. WHOOP's wording is from its support pages as shown in search excerpts. Neither company publishes weights.`,
          head: ["", "Fitbit Air + Google Health", "WHOOP"],
          rows: [
            ["Morning readiness", "Daily Readiness, 1-100 (Low 1-29, Moderate 30-64, High 65-100): HRV, resting heart rate, recent sleep", "Recovery, 0-100% (red 1-33, yellow 34-66, green 67-100): overnight HRV against a 30-day baseline, resting heart rate, respiratory rate, Sleep Performance"],
            ["Daily load", "Cardio Load: heart rate during activity, no practical maximum, resets at midnight, with a weekly Target Load", "Day Strain, 0-21, logarithmic: heart-rate zones plus muscular load"],
            ["A target for today", "A weekly Target Load; lower when readiness is low", "Strain Target, matched to Recovery"],
            ["Sleep", "Sleep Score 0-100 from six components", "Sleep Performance, a percentage against sleep need"],
            ["Needs a membership", "No (Premium is optional)", "Yes"],
          ],
        },
      },
      {
        h: "How to read the pairs",
        p: [
          "Readiness and Recovery are the closest pair. Both are overnight HRV and resting heart rate against your own baseline. WHOOP adds respiratory rate and says Sleep Performance feeds in; Google's page lists sleep over the past week. A morning where one is low and the other is fine usually comes down to those extra inputs.",
          "Cardio Load and Strain are less alike. Strain is bounded at 21 and gets harder to raise as it climbs. Cardio Load has no ceiling and is meant to be read against a weekly target. See <a href=\"/compare/google-health-premium/\">what each membership costs</a> for the money side.",
        ],
      },
      {
        h: "What Pulse adds",
        list: [
          '<a href="/metrics/recovery/">Recovery</a>, 0-100% each morning from HRV, resting heart rate, sleep, respiratory rate and skin temperature against your own baselines.',
          '<a href="/metrics/strain/">Strain</a> on a 0-21 scale, and a <a href="/metrics/strain-target/">Strain Target</a> range for today set by your Recovery.',
          '<a href="/metrics/sleep-performance/">Sleep Performance</a> against your personal sleep need, and a <a href="/metrics/sleep-planner/">Sleep Planner</a> bedtime.',
          '<a href="/metrics/pulse-age/">Pulse Age</a>, <a href="/metrics/stress-monitor/">Stress</a>, <a href="/metrics/energy-bank/">Energy Bank</a> and a nightly <a href="/metrics/health-monitor/">Health Monitor</a>.',
        ],
      },
      {
        h: "How Pulse gets the data",
        p: [
          "The band syncs to the Google Health app as usual. Pulse reads it from there through the Google Health API, with an OAuth client you create in your own Google Cloud project, and stores it in Postgres on your server. Your Google Health data is not copied anywhere else.",
          "Google caps an unverified OAuth app at 100 users, so a shared hosted version is not practical. Each account’s queries and stored health records are scoped to that user.",
        ],
      },
      {
        h: "What it does not change",
        p: [
          "Pulse works with what the band records. If the Air misses a night's sleep stages, there is no HRV for that night and Pulse shows no Recovery rather than a guess. Its scores use familiar scales (0-100% Recovery, 0-21 Strain) with its own method, so they are not interchangeable with any other product's numbers.",
        ],
      },
    ],
    faq: [
      { q: "Do I need Google Health Premium for Pulse?", a: "No. Pulse reads the data the band records, which does not need Premium. Premium adds Google's own coaching features inside the Google Health app." },
      { q: "Does Pulse work on iPhone?", a: "Yes. Pulse is a web app: open your server's address in Safari or any browser and add it to the home screen. The band still pairs with the Google Health app on your phone." },
    ],
    sources: [SRC.googleBlog, SRC.dtFree, SRC.fiveK, SRC.premiumPrice, SRC.oauthCap, SRC.gReadiness, SRC.gCardioLoad, SRC.whoopRecovery, SRC.whoopStrain, SRC.whoopSleep],
    checked: NOW,
  },
  {
    slug: "pulse-vs-subscription-wearables",
    published: "2026-10-03",
    nav: "Pulse vs subscription wearables",
    title: "Pulse vs subscription recovery wearables: cost and data",
    h1: "Pulse and subscription recovery wearables, compared",
    keywords: ["recovery wearable without membership", "subscription recovery tracker alternative", "fitbit air vs recovery strap", "recovery wearable cost over three years"],
    description: "Pulse on a Fitbit Air next to a recovery wearable sold with a membership: which scores each has, how you pay, where the data lives, and who each suits.",
    answer:
      "A subscription recovery wearable is a band, an app and a membership in one product. Pulse is free, open-source software that computes similar scores (Recovery, Strain, Sleep Performance, a biological-age estimate) from a Fitbit Air you already own, on a server you run. A membership works out of the box and comes with support; Pulse is for people who want no subscription and their data on their own machine.",
    sections: [
      {
        h: "Side by side",
        table: {
          caption: `Checked ${CHECKED}. Prices are as reported by the sources below and change often.`,
          head: ["", "Subscription recovery wearable", "Pulse on a Fitbit Air"],
          rows: [
            ["Hardware", "The maker's own band, usually included with the membership", "Fitbit Air, bought once ($99 in the US at launch)"],
            ["How you pay", "A monthly or annual membership", "Pulse is free for noncommercial use. You run it on your own computer or server"],
            ["Recovery", "Usually a 0-100% daily score", "0-100%, green, yellow and red bands; method published"],
            ["Strain", "A daily effort score; scales vary", "0-21 scale; method published"],
            ["Sleep", "A sleep score, often with a bedtime planner", "Sleep Performance, Sleep Planner, sleep consistency (SRI)"],
            ["Biological age", "Offered by some", "Pulse Age and Pace of Aging, from cited studies"],
            ["Method", "Usually proprietary; weights not published", "Open source, with formulas, constants and citations"],
            ["Where your data lives", "The company's cloud", "Your server (Postgres); the band's data also stays in Google Health"],
            ["Apps", "Native iOS and Android apps", "A web app you install from the browser"],
            ["Coaching and support", "Often a coach and company support", "No coach; GitHub issues and the docs"],
          ],
        },
      },
      {
        h: "Where a membership is the better choice",
        list: [
          "You want one product that works out of the box, with support behind it.",
          "You want a band whose sensors and sampling were designed for its own scores.",
          "You want native phone apps, coaching and features Pulse does not have.",
          "You do not want to run a server, create a Google Cloud project or update Docker images.",
        ],
      },
      {
        h: "Where Pulse fits",
        list: [
          "You already own a Fitbit Air, or prefer its price, and want recovery and strain scores without a second subscription.",
          "You want your health data on a machine you control, with nothing sent to a Pulse service (there is none).",
          "You want to read exactly how every number is made, and check it against the code.",
        ],
      },
      {
        h: "The numbers are not interchangeable",
        p: [
          "Pulse uses familiar scales so the numbers read naturally, but its method is its own, ported from the open-source noop project and published. A 70% Recovery in Pulse and a 70% Recovery from another product come from different sensors and different maths. Compare yourself with yourself.",
        ],
      },
    ],
    sources: [SRC.googleBlog, SRC.noop],
    checked: CHECKED,
  },
  {
    slug: "recovery-tracking-without-subscription",
    published: "2026-10-03",
    nav: "Without a subscription",
    title: "Recovery and strain tracking without a subscription",
    h1: "Recovery and strain tracking without a subscription",
    keywords: ["recovery tracker no subscription", "strain tracking without subscription", "open source recovery app", "self-hosted fitness tracker"],
    description: "Open-source, subscription-free ways to get recovery, strain and sleep scores: Pulse for the Fitbit Air, plus noop, Hælan and fitbit-grafana.",
    answer:
      "If you want recovery and strain scores with no monthly fee, the cheapest route is a band without a required subscription plus software that computes the scores. Pulse does this for the Fitbit Air, self-hosted and free for noncommercial use. Other open-source projects cover nearby needs.",
    sections: [
      {
        h: "What it costs to run Pulse",
        list: [
          "A Fitbit Air, bought once. Its core features need no subscription.",
          "A computer that can run Docker: a home server, a NAS, a small cloud VM or a laptop. Pulse uses about 100-150 MB of memory.",
          "A one-time setup: a Google Cloud OAuth client, the container, and HTTPS if you want it on your phone. The setup guide walks through each step.",
          "Your time to keep it updated and backed up.",
        ],
      },
      {
        h: "Open-source projects in the same space",
        table: {
          caption: `Checked ${CHECKED}. Descriptions are from each project's own README.`,
          head: ["Project", "Works with", "What it gives you", "License"],
          rows: [
            ["Pulse", "Fitbit Air (Google Health API)", "Recovery, Strain, sleep scores, Pulse Age, Stress, Energy Bank, journal insights", "PolyForm Noncommercial 1.0.0"],
            ['<a href="https://github.com/ryanbr/noop">noop</a>', "A subscription brand's recovery straps (see its README)", "An offline companion app with recovery, strain and sleep scoring; Pulse's scoring is ported from it", "PolyForm Noncommercial 1.0.0"],
            ['<a href="https://github.com/bardesss/haelan">Hælan</a>', "Google Health", "A self-hosted mirror of your Google Health data, with a dashboard and tools", "AGPL-3.0"],
            ['<a href="https://github.com/arpanghosh8453/fitbit-grafana">fitbit-grafana</a>', "Fitbit / Google Health", "Raw metrics in InfluxDB and Grafana charts", "BSD-4-Clause"],
          ],
        },
      },
      {
        h: "Choosing between them",
        p: [
          "If you own a subscription recovery strap and want to stop paying for the membership, noop is built for that. If you own a Fitbit Air and want computed scores rather than raw charts, Pulse is. If you mostly want your Google Health data mirrored and searchable, look at Hælan or fitbit-grafana. They can run side by side.",
        ],
      },
    ],
    faq: [
      { q: "Is Pulse really free?", a: "Yes, for personal and other noncommercial use under the PolyForm Noncommercial 1.0.0 license. Selling it, or putting it inside a commercial product, is not allowed. You pay only for the band and whatever machine you run it on." },
      { q: "Why is there no hosted version?", a: "Google limits an unverified app to 100 users, and a hosted service would hold everyone's health data. Self-hosting keeps each person's data on their own machine." },
    ],
    sources: [SRC.googleBlog, SRC.dtFree, SRC.noop, SRC.haelan, SRC.fitbitGrafana, SRC.oauthCap],
    checked: CHECKED,
  },
  {
    slug: "google-health-premium",
    published: "2026-10-03",
    nav: "Google Health Premium",
    title: "Google Health Premium vs free vs WHOOP vs Pulse",
    h1: "Google Health Premium, WHOOP and Pulse: what each adds",
    keywords: ["google health premium", "fitbit air without subscription", "google health premium vs free", "fitbit air premium features", "google health premium vs whoop"],
    description: "What a Fitbit Air does free, what Google Health Premium adds, how a WHOOP membership compares on price, and what Pulse computes on top.",
    answer:
      "They do different jobs. Google Health Premium adds coaching and deeper insights inside the Google Health app. Pulse adds a separate set of scores (Recovery, Strain, Sleep Performance, Pulse Age, Energy Bank) computed from the same data on your own server. You can use either, both or neither.",
    sections: [
      {
        h: "Three layers",
        table: {
          caption: `Checked ${CHECKED}. Feature lists are as reported by the sources below.`,
          head: ["", "What you get", "Cost"],
          rows: [
            ["Fitbit Air, free tier", "Heart rate, HRV, SpO2, skin temperature, sleep stages, Cardio Load, Daily Readiness", "The band (3 months of Premium included)"],
            ["Google Health Premium", "Google Health Coach (Gemini), adaptive plans, deeper sleep insights", "Reported at $9.99 a month or $99.99 a year in the US"],
            ["Pulse", "Recovery, Strain and Strain Target, Sleep Performance and Planner, Pulse Age, Stress, Energy Bank, Health Monitor, journal insights", "Free for noncommercial use; you run it"],
          ],
        },
      },
      {
        h: "Where a WHOOP membership sits next to these",
        table: {
          caption: `Checked ${NOW}. Prices as reported by trackervs and Android Authority, as of October 2026; they vary by region and change.`,
          head: ["", "Google Health Premium", "WHOOP membership"],
          rows: [
            ["Price (US)", "$9.99 a month or $99.99 a year", "One $199, Peak $239, Life $359 a year (annual billing; monthly is reported as not a standard option)"],
            ["Hardware", "Not included: bring a Fitbit Air, Pixel Watch or Fitbit (the Air has 3 months included)", "Included with the membership; the band stops being useful if you cancel"],
            ["What it adds", "Coach, adaptive plans, deeper sleep insights", "The whole scoring system: Recovery, Strain, Sleep Performance. Peak adds Healthspan, Health Monitor and Stress Monitor"],
            ["Core scores without paying", "Yes: Readiness, Cardio Load, Sleep Score", "No: the band needs a membership"],
          ],
        },
        p: ["The difference in what you are buying is the point. Premium is an add-on to scores you already get free. A WHOOP membership is the scores. Pulse sits outside both: it adds a different set of scores to a Fitbit Air at no cost, and has no coach."],
      },
      {
        h: "When Premium is worth it",
        p: ["If you want guided plans and a coach you can ask questions, inside the app the band already uses, Premium is the simpler choice. Pulse has no coach."],
      },
      {
        h: "When Pulse is worth it",
        p: [
          "If you want daily recovery and strain numbers with a published method, a long history you keep on your own machine, and are comfortable with Docker, Pulse fills that gap without a subscription.",
        ],
      },
    ],
    sources: [SRC.googleBlog, SRC.premiumPrice, SRC.dtFree, SRC.googleIndia, SRC.whoopPricing, SRC.whoopRecovery],
    checked: NOW,
  },
  {
    slug: "fitbit-air-vs-garmin-cirqa",
    published: "2026-10-09",
    nav: "Fitbit Air vs Garmin Cirqa",
    title: "Fitbit Air vs Garmin Cirqa: the scores compared",
    h1: "Fitbit Air vs Garmin Cirqa: the scores compared",
    keywords: ["fitbit air vs garmin cirqa", "garmin cirqa vs fitbit air", "garmin training readiness vs fitbit readiness"],
    description: "Two screenless bands: what Garmin's Body Battery and Training Readiness and Fitbit Air's Readiness and Cardio Load measure, and where they differ.",
    answer:
      "The Cirqa gives you Garmin's full score set, including Body Battery and Training Readiness, for about twice the Air's price. The Air gives you Google's Daily Readiness, Cardio Load and Sleep Score. They answer similar questions with different inputs, so a 70 on one is not a 70 on the other.",
    sections: [
      {
        h: "The two bands in one paragraph",
        p: [
          "The Fitbit Air launched in May 2026 at $99 in the US. The Garmin Cirqa began shipping on 24 July 2026 at $199.99, according to launch coverage. Both have no screen and both record heart rate, HRV, skin temperature, SpO2 and sleep stages. Neither needs a subscription for its core scores: Google puts a coach behind Google Health Premium, and Garmin puts its Coach features behind Garmin Connect+ ($6.99 a month or $69.99 a year, as of October 2026).",
          "The Cirqa has no onboard GPS and borrows the phone's for outdoor activities, one more way the two are closer than their price gap suggests.",
        ],
      },
      {
        h: "Score by score",
        table: {
          caption: `Checked ${NOW}. Garmin does not publish weights; where a cell says so, the vendor gives inputs only.`,
          head: ["Question", "Fitbit Air (Google Health)", "Garmin Cirqa (Garmin Connect)"],
          rows: [
            ["Am I recovered today?", "Daily Readiness, 1-100. Inputs: HRV, resting heart rate and recent sleep", "Training Readiness, 1-100. Inputs: sleep score, recovery time, HRV Status, acute load, recent sleep and stress history"],
            ["How much energy do I have?", "No equivalent", "Body Battery, 1-100, moves through the day with rest, stress and activity"],
            ["How hard have I trained?", "Cardio Load, a heart-rate based total with a weekly target", "Acute Load and Load Ratio, plus Training Status"],
            ["Overnight HRV", "HRV in the app, with a personal range from up to 30 days", "HRV Status: a 7-day average against a baseline built over about three weeks"],
            ["Sleep", "Sleep Score 0-100 from six components", "Sleep Score 0-100; weights not published"],
            ["Stress", "Resilience (Optimal, Balanced, Low), from May 2026", "A 0-100 stress score from heart-rate variability"],
            ["Weights and formula", "Inputs published, formula not", "Inputs published, formula not"],
          ],
        },
      },
      {
        h: "The difference that matters: how they treat training",
        p: [
          "Google's Readiness is built from physiology only. Its help page lists HRV, resting heart rate and recent sleep; activity was dropped from the updated version. Your training shows up separately, as Cardio Load, and Google's Target Load for the week then nudges down when your readiness is low.",
          "Garmin's Training Readiness mixes the two. Acute load and recovery time sit inside the score, next to sleep and HRV, so a hard session yesterday can lower today's number even if you slept well. That makes it more of a training-planning score than a pure recovery score. It also means two days with the same HRV can read differently.",
          "Body Battery is a separate idea again: a gauge that charges while you rest and drains with stress and activity. Garmin says it uses HRV, stress, sleep and activity. If you ask whether the Air has a Body Battery, the honest answer is no. Google has no single all-day energy gauge, though its Resilience and Readiness cover parts of the same ground.",
        ],
      },
      {
        h: "Reading a bad morning on each",
        p: [
          "Suppose your readiness drops by 20 points. On the Air, the likely causes are in the three published inputs: a short or broken night, a resting heart rate a few beats above your norm, or HRV well under your personal range. There is nothing about yesterday's workout in the score itself, so a hard session only matters through what it did to your sleep and heart rate.",
          "On the Cirqa, the same drop could come from the same three, or from a high acute load, or from several days of high stress in the recent history Garmin says it uses. Garmin's HRV Status helps here: it compares a 7-day average against your baseline range, so one bad night does not flip it. Check HRV Status and the sleep score before deciding the fall is about training.",
          "Both vendors say the scores need time to settle. Google says a first Readiness needs seven nights of wear, and about a month for a good baseline. Garmin says HRV Status builds its baseline over about three weeks. Judging either band in its first week is judging an empty baseline.",
        ],
      },
      {
        h: "Where Pulse fits",
        p: [
          "Pulse reads a Fitbit Air through the Google Health API and computes its own scores. It cannot read Google's Readiness or Cardio Load, because the API does not expose them, and it does not read a Cirqa at all. Its nearest counterparts are <a href=\"/metrics/recovery/\">Recovery</a> (a morning 0-100%) and <a href=\"/metrics/energy-bank/\">Energy Bank</a> for the all-day gauge, with <a href=\"/metrics/strain/\">Strain</a> for load. Pulse is built and tested on the Fitbit Air only, needs Docker and your own Google Cloud project, and its numbers are its own method, not Garmin's or Google's.",
        ],
      },
      {
        h: "Which one suits whom",
        list: [
          "You train for events and want a load-aware readiness number, and the extra $100 is fine: the Cirqa's score set is the more training-oriented.",
          "You mostly want sleep, resting heart rate and HRV trends at the lowest price: the Air covers it.",
          "You already live in Garmin Connect, or in Google Health: stay there, because history does not move between them.",
        ],
      },
    ],
    faq: [
      { q: "Does the Fitbit Air have Body Battery?", a: "No. Body Battery is a Garmin feature. Google Health has Daily Readiness, Cardio Load, Sleep Score and Resilience instead. Pulse offers an Energy Bank score that serves a similar all-day purpose, computed by its own method." },
      { q: "Is Garmin Training Readiness the same as Fitbit Daily Readiness?", a: "They are built differently. Google lists HRV, resting heart rate and recent sleep. Garmin's score also includes acute load and recovery time, so recent training changes it." },
      { q: "Do either of them need a subscription?", a: "Not for the core scores. Google Health Premium and Garmin Connect+ both add coaching features. Check each company's page for current pricing." },
    ],
    sources: [SRC.cirqaReview, SRC.cirqaDigital, SRC.garminManuals, SRC.gReadiness, SRC.gCardioLoad, SRC.googleBlog],
    checked: NOW,
  },
  {
    slug: "fitbit-air-vs-amazfit-helio-strap",
    published: "2026-10-09",
    nav: "Fitbit Air vs Amazfit Helio Strap",
    title: "Fitbit Air vs Amazfit Helio Strap: the scores compared",
    h1: "Fitbit Air vs Amazfit Helio Strap: the scores compared",
    keywords: ["fitbit air vs amazfit helio strap", "amazfit helio strap vs fitbit air", "amazfit biocharge vs readiness", "amazfit pai vs cardio load"],
    description: "Two screenless, subscription-optional bands: what Fitbit Air's Readiness and Cardio Load and Amazfit's BioCharge and PAI measure, and where they differ.",
    answer:
      "Both are screenless bands that work without a subscription. The Helio Strap reports Amazfit's BioCharge energy score and a weekly PAI total; the Air reports Google's Daily Readiness and Cardio Load. The two sets of scores are built from different inputs and are not interchangeable.",
    sections: [
      {
        h: "What each band is",
        p: [
          "The Helio Strap launched in June 2025 at $99.99, the same price tier as the Fitbit Air ($99 at its May 2026 launch). Reviewers say the strap works without a subscription; Amazfit sells an optional Zepp Aura Premium plan ($11.99 a month or $69.99 a year, as reported). Google Health Premium is the Air's optional extra.",
          "One caution on the Helio side: BioCharge was announced as coming soon at launch, and Amazfit has moved Readiness and BioCharge around between devices since. I could not confirm from Amazfit's own pages how it stands on the Helio Strap today, so check the Zepp app's release notes before buying for that score.",
        ],
      },
      {
        h: "The scores side by side",
        table: {
          caption: `Checked ${NOW}. Amazfit's pages were read through search excerpts; confirm in the Zepp app.`,
          head: ["Question", "Fitbit Air (Google Health)", "Amazfit Helio Strap (Zepp)"],
          rows: [
            ["Morning readiness", "Daily Readiness, 1-100: HRV, resting heart rate, recent sleep", "Readiness (on some devices): sleep resting heart rate, sleep HRV, breathing quality, skin temperature, once each morning"],
            ["All-day energy", "No equivalent", "BioCharge: a percentage from HRV, stress, activity and sleep"],
            ["Training load", "Cardio Load, with a weekly Target Load", "PAI: weekly heart-rate points, target 100 a week; also a Training Load"],
            ["Sleep", "Sleep Score 0-100, six published components", "Sleep score; Amazfit gives no breakdown of weights"],
            ["Stress", "Resilience (Optimal, Balanced, Low)", "Stress, no method on the technology page"],
          ],
        },
      },
      {
        h: "PAI and Cardio Load are close cousins",
        p: [
          "These are the most comparable pair. PAI (Personal Activity Intelligence) turns your heart rate during the week into points, using your age, sex, resting and maximum heart rate, and sets 100 points a week as the target. Cardio Load turns heart rate during activity into a load number, using age, resting heart rate and sex, and weights harder effort more. Both are heart-rate based and both reward a mix of moderate and hard effort. Neither tells you whether you are recovered; that is the readiness score's job.",
          "Amazfit says 100 PAI a week is linked to a longer life, which is Amazfit's claim; treat it as a target, not a promise.",
        ],
      },
      {
        h: "Readiness: same name, different inputs",
        p: [
          "Amazfit's Readiness leans on sleep-time measurements (resting heart rate, HRV, breathing, skin temperature). Google's current Readiness page lists HRV, resting heart rate and recent sleep. Both need a few nights of wear before the number means much, and both are lowered by the same things: a short night, alcohol, illness, a late meal. If yours is stuck low, <a href=\"/blog/fitbit-readiness-always-low/\">the checklist for Fitbit Readiness</a> covers the usual causes.",
        ],
      },
      {
        h: "What the reviews say about depth",
        p: [
          "TechRadar's comparison of the Helio Strap with the Polar Loop and WHOOP 5.0 says the strap's readiness stats lack the depth of WHOOP's system, and calls the Zepp subscription neat but not necessary for most owners. That is one reviewer's view, not Amazfit's claim, and it is worth reading next to the Android Authority review before you buy.",
          "Google's scores have no all-day gauge. Amazfit's BioCharge is one, which is the clearest functional difference between the two bands. Whether it counts for or against the Air depends on whether you want that gauge. If you are only after a morning number and a weekly activity total, the two are close.",
        ],
      },
      {
        h: "Checks before you buy either",
        list: [
          "Look at which scores your phone and region actually show. Reviewers report Zepp's BioCharge rollout has been uneven across devices, and SpO2 on the Air is reported as unavailable in some regions.",
          "Decide whether you want a coach. Google Health Premium and Zepp Aura Premium both sell one, and both are optional.",
          "Remember that history stays in each ecosystem. Switching later means new baselines in the other app.",
        ],
      },
      {
        h: "Where Pulse fits",
        p: [
          "Pulse does not read Amazfit bands. For a Fitbit Air owner, it computes a 0-100% <a href=\"/metrics/recovery/\">Recovery</a> and a 0-21 <a href=\"/metrics/strain/\">Strain</a> from the Air's data, and <a href=\"/metrics/energy-bank/\">Energy Bank</a> as its all-day gauge. It is free and self-hosted, needs Docker and a Google Cloud project, and is tested on the Fitbit Air only.",
        ],
      },
    ],
    faq: [
      { q: "Does the Amazfit Helio Strap need a subscription?", a: "Reviewers report that it does not for day-to-day use. Amazfit sells an optional Zepp Aura Premium plan. Check Amazfit's current terms." },
      { q: "Is Amazfit PAI the same as Fitbit Cardio Load?", a: "No, but they are similar. Both turn heart rate during activity into a number. PAI is a rolling weekly total with a target of 100; Cardio Load is a daily figure that Google also compares against a weekly target." },
    ],
    sources: [SRC.helioLaunch, SRC.helioReview, SRC.helioTechradar, SRC.zepp, SRC.gReadiness, SRC.gCardioLoad],
    checked: NOW,
  },
  {
    slug: "fitbit-air-vs-oura-ring",
    published: "2026-10-09",
    nav: "Fitbit Air vs Oura Ring",
    title: "Fitbit Air vs Oura Ring: sleep and readiness scores",
    h1: "Fitbit Air vs Oura Ring: sleep and readiness",
    keywords: ["fitbit air vs oura ring", "oura readiness vs fitbit readiness", "oura ring vs fitbit air sleep"],
    description: "Oura's Readiness and Sleep scores against Fitbit Air's Daily Readiness and Sleep Score: what goes into each, how they are explained, and the cost of each.",
    answer:
      "Oura and Google both score readiness from overnight heart rate, HRV and sleep, and Oura adds skin temperature and a few long-term balance measures. The scores are not calibrated to each other. The cost differs more than the scoring: the Air is a one-off $99 band, Oura is a ring plus a membership.",
    sections: [
      {
        h: "Readiness: what goes in",
        p: [
          "Oura's Readiness Score page lists resting heart rate, HRV, body temperature, and long-term contributors it calls Sleep Balance, Activity Balance and HRV Balance, plus a Recovery Index that looks at how long your resting heart rate takes to settle overnight. It does not publish weights. Oura says the score emphasises trends over time rather than one night.",
          "Google's Daily Readiness help page lists HRV, resting heart rate and recent sleep, with a first score after seven nights of wear and a month or so of wear for a good baseline. Activity was removed from the updated algorithm. Skin temperature is recorded by the Air but is not listed as a Readiness input.",
          "In practice both are heart-rate and HRV scores against your own baseline. Oura includes more contributors; Google's is narrower and more transparent about what it uses.",
        ],
      },
      {
        h: "Sleep",
        table: {
          caption: `Checked ${NOW}. Prices as reported, as of October 2026.`,
          head: ["", "Fitbit Air (Google Health)", "Oura Ring"],
          rows: [
            ["Readiness inputs", "HRV, resting heart rate, recent sleep", "Resting heart rate, HRV, body temperature, plus Sleep, Activity and HRV Balance and Recovery Index"],
            ["Sleep score", "0-100 from six components: duration, time to sound sleep, sound sleep, restlessness, full awakenings, interruptions", "Oura Sleep Score; consult Oura's page for the contributors"],
            ["Form", "Screenless wrist band", "Ring, worn on a finger"],
            ["Cost", "$99 band at launch; core scores free", "Ring hardware plus a membership of about $5.99 a month (as of October 2026; verify on Oura's site)"],
          ],
        },
      },
      {
        h: "Where the sleep numbers differ in practice",
        p: [
          "Google's Sleep Score page says most people average between 72 and 83, with 90 and above Excellent, 80 to 89 Good, 60 to 79 Fair and under 60 Poor. Oura draws its own bands. A 78 on one and an 85 on the other tell you nothing about which device is more generous: the targets and weights differ.",
          "A finger and a wrist are different measurement sites, so one night's resting heart rate and HRV will not match exactly between a ring and a band. For trends that matters little. For comparing one device's number with another's it matters a lot.",
        ],
      },
      {
        h: "Which is the better fit",
        list: [
          "You want the cheapest route to sleep stages, HRV and a readiness score with no recurring fee: the Air.",
          "You do not want a band on your wrist at night, or want the ring form: Oura, with the membership as part of the price.",
          "You want a heart-rate based training load number: the Air has Cardio Load.",
        ],
      },
      {
        h: "What each company says about calibration",
        p: [
          "Both vendors describe a learning period. Google's page asks for seven nights of sleep wear for a first Readiness and about a month for a good baseline, and says sleep of at least three hours is needed. Oura describes its score as emphasising trends, which in practice means its long-term balance contributors take time to mean anything.",
          "That is why early comparisons are unfair to both. If you try the two for a week and one reads lower, you are comparing two unfinished baselines. Give each a month, wear them for the same nights, and compare the direction of change, not the level.",
          "A fair test also keeps the habits fixed. Late meals, alcohol and a warm bedroom can move HRV and temperature on both. If both devices drop on the same morning, the signal is likely real. If only one does, look at that device's extra inputs: Oura's body temperature and balance contributors, or Google's recent-sleep window.",
        ],
      },
      {
        h: "Where Pulse fits",
        p: [
          "Pulse reads Fitbit Air data only; it does not read Oura. It builds a morning <a href=\"/metrics/recovery/\">Recovery</a> from HRV, resting heart rate, sleep, respiratory rate and skin temperature, and a <a href=\"/metrics/sleep-performance/\">Sleep Performance</a> against your own sleep need. It runs on your server, is free for noncommercial use and has been tested on the Fitbit Air only.",
        ],
      },
    ],
    faq: [
      { q: "Is Oura Readiness more accurate than Fitbit Readiness?", a: "Neither company publishes validation that lets the two be ranked, and the scores use different inputs and baselines. Treat each as a trend against your own history." },
      { q: "Does the Fitbit Air track skin temperature like Oura?", a: "Yes, Google lists skin temperature variation during sleep among its health metrics. Oura lists body temperature as a Readiness input; Google's Readiness page lists HRV, resting heart rate and sleep." },
    ],
    sources: [SRC.ouraReadiness, SRC.ouraMembership, SRC.gReadiness, SRC.gSleepScore, SRC.googleBlog],
    checked: NOW,
  },
  {
    slug: "google-health-vs-garmin-connect",
    published: "2026-10-09",
    nav: "Google Health vs Garmin Connect",
    title: "Google Health app vs Garmin Connect: what each shows",
    h1: "Google Health app vs Garmin Connect, as dashboards",
    keywords: ["google health app vs garmin connect", "garmin connect vs fitbit app", "garmin connect alternative", "google health app metrics list"],
    description: "The Google Health app and Garmin Connect as dashboards: which scores each shows, what is free, what is paid, and where a separate app like Pulse adds to them.",
    answer:
      "Both apps show a morning readiness number, a sleep score, HRV and a training-load figure for free. Garmin Connect adds Body Battery and Training Status; Google Health adds Cardio Load, Target Load and Resilience. Each ties a paid tier to coaching. Neither exports its own scores to other apps.",
    sections: [
      {
        h: "What each app puts on the front page",
        table: {
          caption: `Checked ${NOW}. Google's lists are from its help pages; Garmin's are from owner's manuals read via search excerpts.`,
          head: ["Area", "Google Health", "Garmin Connect"],
          rows: [
            ["Readiness", "Daily Readiness, 1-100 (Low 1-29, Moderate 30-64, High 65-100)", "Training Readiness, 1-100, with tiers from Poor to Prime"],
            ["All-day energy", "None", "Body Battery, 1-100"],
            ["Training load", "Cardio Load and weekly Target Load", "Acute Load, Load Ratio, Training Status, Load Focus"],
            ["Sleep", "Sleep Score 0-100, sleep stages", "Sleep Score 0-100, stages, Sleep Coach"],
            ["HRV", "HRV with a personal range from up to 30 days", "HRV Status: Balanced, Unbalanced, Low, Poor"],
            ["Stress", "Resilience: Optimal, Balanced, Low (replaced a 0-100 stress score in May 2026)", "A 0-100 stress score"],
            ["Fitness estimate", "Cardio Fitness Score (VO2 max)", "VO2 max, Fitness Age, Endurance score"],
            ["Paid tier", "Google Health Premium, $9.99 a month or $99.99 a year", "Garmin Connect+, $6.99 a month or $69.99 a year"],
          ],
        },
      },
      {
        h: "Two different philosophies",
        p: [
          "Google Health is organised around a few headline scores and a coach. The app hides a lot of detail, and its readiness page spells out HRV, resting heart rate and recent sleep as inputs. Garmin Connect is a larger instrument panel, built for people who run and ride, with load ratios, training effects and recovery time in hours.",
          "That shows in how ratio and tier labels work. Garmin gives Load Ratio bands: under 0.8 low, 0.8 to 1.4 optimal, 1.5 to 1.9 high, 2.0 or more very high, shown after two weeks of data. Google uses its Cardio Load against a Target Load that follows your recent four weeks.",
        ],
      },
      {
        h: "What neither app will do",
        list: [
          "Show another brand's scores. Garmin's Body Battery or Training Readiness never appears in Google Health, and the reverse.",
          "Hand you its own scores through an API. The Google Health API lists 44 data types, including HRV, resting heart rate, sleep and heart rate zones, but no readiness, cardio load, sleep score or Resilience type.",
          "Move your history between them. A switch means starting a new baseline: both scores need a few weeks of wear before they settle.",
        ],
      },
      {
        h: "Choosing between the ecosystems",
        p: [
          "The apps are rarely the reason to choose; the band is. A Fitbit Air or Pixel Watch means Google Health, and a Garmin band or watch means Garmin Connect. Within that, ask what you want to see in the morning. If it is one readiness number and a sleep score, both do it. If it is a load ratio and a recovery-time countdown for a race build, Garmin Connect shows more of it. If it is a weekly Cardio Load target that follows how you have been training, Google Health does that.",
          "Price is closer than it looks. Both paid tiers add coaching to scores you already get free: Google Health Premium at $9.99 a month or $99.99 a year, and Garmin Connect+ at $6.99 a month or $69.99 a year, as of October 2026. The bands differ more: the Cirqa is $199.99 against the Fitbit Air's $99.",
          "Exporting data is a better test than features. Google documents a data export on its help pages, and the Google Health API gives developers raw data types. Check what any app lets you take out before you build years of history in it.",
        ],
      },
      {
        h: "Where Pulse fits",
        p: [
          "Pulse is a separate self-hosted dashboard for Google Health data. It reads the raw data the API exposes and computes its own scores, such as <a href=\"/metrics/recovery/\">Recovery</a>, <a href=\"/metrics/strain/\">Strain</a> and <a href=\"/metrics/training-balance/\">Training balance</a>. It does not show Google's scores and it cannot read Garmin Connect. If you are already comfortable in either app, you do not need it. It exists for people who want a long, local history and a published method. Tested on the Fitbit Air only.",
        ],
      },
    ],
    faq: [
      { q: "Can I see my Garmin Body Battery in the Google Health app?", a: "No. The two apps do not share scores. Body Battery is computed by Garmin and stays in Garmin Connect." },
      { q: "Is Garmin Connect free?", a: "The core app and scores are free with a Garmin device. Garmin Connect+ is an optional paid tier for coaching features, listed at $6.99 a month or $69.99 a year as of October 2026." },
    ],
    sources: [SRC.gReadiness, SRC.gCardioLoad, SRC.gSleepScore, SRC.gApiTypes, SRC.premiumPrice, SRC.cirqaReview, SRC.garminManuals],
    checked: NOW,
  },
  {
    slug: "pixel-watch-vs-whoop",
    published: "2026-10-09",
    nav: "Pixel Watch vs WHOOP",
    title: "Pixel Watch vs WHOOP: scores, cost and data compared",
    h1: "Pixel Watch vs WHOOP: scores, cost and data",
    keywords: ["pixel watch vs whoop", "pixel watch recovery score", "pixel watch readiness vs whoop recovery", "pixel watch strain"],
    description: "A smartwatch with Google Health scores against a recovery band on a membership: what Readiness and Cardio Load do, what Recovery and Strain do, and the cost.",
    answer:
      "A Pixel Watch gives you Google's Readiness, Cardio Load and Sleep Score in the Google Health app without a membership. WHOOP gives you Recovery, Strain and Sleep Performance, and requires one. Pulse has been tested on a Fitbit Air only; Pixel Watch data reaches it through the same API but is untested.",
    sections: [
      {
        h: "Straight about Pulse and the Pixel Watch",
        p: [
          "Pulse is built and tested with a Fitbit Air only. A Pixel Watch syncs the same data types to Google Health, so Pulse should receive them through the same API, but nobody has verified that. If you own a Pixel Watch, treat Pulse as a possibility, not a promise.",
        ],
      },
      {
        h: "The scores, one against the other",
        table: {
          caption: `Checked ${NOW}. WHOOP's wording is from its support pages as shown in search excerpts. WHOOP prices as reported by trackervs, as of October 2026; they vary by region.`,
          head: ["Question", "Pixel Watch (Google Health)", "WHOOP"],
          rows: [
            ["Readiness", "Daily Readiness, 1-100: HRV, resting heart rate, recent sleep", "Recovery, 0-100%: overnight HRV, resting heart rate, respiratory rate and Sleep Performance, with skin temperature and SpO2 also listed"],
            ["Zones", "Low 1-29, Moderate 30-64, High 65-100", "Red 1-33, Yellow 34-66, Green 67-100"],
            ["Load", "Cardio Load, calculated on the watch on Pixel Watch 3 and later; weekly Target Load", "Day Strain, 0-21, logarithmic, from heart-rate zones plus muscular load"],
            ["Sleep", "Sleep Score 0-100", "Sleep Performance, a percentage against sleep need"],
            ["Screen", "Yes, with notifications and apps", "No screen"],
            ["Cost", "The watch; core scores free; Premium optional ($9.99 a month or $99.99 a year)", "One $199, Peak $239, Life $359 a year; the band is included"],
          ],
        },
      },
      {
        h: "What is different about the idea",
        p: [
          "WHOOP is built around one daily loop: Recovery in the morning, a Strain Target matched to it, then Day Strain, then sleep need for tonight. The band is a sensor for that loop. A Pixel Watch is a general smartwatch that also feeds a similar set of scores into Google Health, so you pay once, for hardware, and carry a screen.",
          "The two Strain-like numbers behave differently. WHOOP's Strain runs 0 to 21 and WHOOP says it is logarithmic, which makes the top end hard to reach. Cardio Load has no practical maximum and resets at midnight. The two cannot be converted into each other.",
          "Recovery and Readiness differ in inputs too. WHOOP says Recovery draws on overnight HRV against a 30-day baseline, resting heart rate, respiratory rate and Sleep Performance. Google lists HRV, resting heart rate and recent sleep. Neither company publishes weights.",
        ],
      },
      {
        h: "Wearing it and living with it",
        p: [
          "WHOOP's band has no display and is made to be worn in bed. A Pixel Watch is also a phone accessory with a screen and apps. Sleep scores only count if you wear the device overnight, so comfort and your charging routine matter as much as any score.",
          "On method, both companies show a clean score and little about how it is built. WHOOP publishes concepts but not weights. Google publishes the inputs and a help page for each score, again without weights. Seeing how every number is built is Pulse's argument, with the caveat above about Pixel Watch testing.",
          "On cost, a WHOOP membership is a yearly fee from $199 to $359, as reported, and ends your use of the band if you stop paying. A Pixel Watch is a one-off purchase, with Google Health Premium an optional extra. They are not like-for-like products, so compare what you would use, not the totals.",
        ],
      },
      {
        h: "What this means for a Pixel Watch owner",
        list: [
          "If the Google Health scores answer your questions, there is nothing to add or pay for.",
          "If you want a 0-100% Recovery, a 0-21 Strain and a Strain Target without a membership, <a href=\"/metrics/recovery/\">Pulse's Recovery</a> and <a href=\"/metrics/strain/\">Strain</a> are computed from raw Google Health data, on a server you run. Again: tested on the Fitbit Air only.",
          "If you want WHOOP's coaching and a band you wear in bed and forget, that is a membership product. Read <a href=\"/compare/pulse-vs-subscription-wearables/\">the cost and data comparison</a> first.",
        ],
      },
    ],
    faq: [
      { q: "Does the Pixel Watch have a recovery score?", a: "It has Daily Readiness in the Google Health app, which serves a similar purpose. It is a 1-100 score built from HRV, resting heart rate and recent sleep." },
      { q: "Does Pulse work with a Pixel Watch?", a: "Unknown. Pulse is tested only on a Fitbit Air. A Pixel Watch sends the same data types to Google Health, so it may work, but that has not been checked." },
    ],
    sources: [SRC.gReadiness, SRC.gCardioLoad, SRC.gSleepScore, SRC.whoopRecovery, SRC.whoopStrain, SRC.whoopSleep, SRC.whoopPricing, SRC.premiumPrice],
    checked: NOW,
  },
  {
    slug: "recovery-scores",
    published: "2026-10-09",
    nav: "How recovery scores are built",
    title: "How each brand builds a recovery or readiness score",
    h1: "How each brand builds its recovery or readiness score",
    keywords: ["recovery score comparison", "readiness score vs recovery score", "oura readiness vs whoop recovery", "body battery vs recovery"],
    description: "Google Health, WHOOP, Garmin, Amazfit, Oura, Samsung, Apple and Pulse: the recovery or readiness score each builds, and the inputs each vendor says it uses.",
    answer:
      "Almost every brand scores your recovery from the same few overnight signals: HRV, resting heart rate and sleep. They differ in what else they add, such as respiratory rate, skin temperature or recent training load. No vendor publishes its weights. Apple added a 0-10 Readiness score with Apple Watch Series 12.",
    sections: [
      {
        h: "The table",
        table: {
          caption: `Checked ${NOW}. Inputs are as each vendor describes them; "not published" means the vendor does not say.`,
          head: ["Brand", "Score", "Inputs the vendor lists", "Weights"],
          rows: [
            ["Google Health", "Daily Readiness, 1-100", "HRV, resting heart rate, recent sleep", "Not published"],
            ["WHOOP", "Recovery, 0-100%", "Overnight HRV, resting heart rate, respiratory rate, Sleep Performance; also skin temperature, SpO2 and cycle phase on its current page", "Not published"],
            ["Garmin", "Training Readiness, 1-100", "Sleep score, recovery time, HRV Status, acute load, recent sleep and stress history", "Not published"],
            ["Amazfit", "Readiness, on some devices; BioCharge elsewhere", "Sleep resting heart rate, sleep HRV, breathing, skin temperature (Readiness); HRV, stress, activity, sleep (BioCharge)", "Not published"],
            ["Oura", "Readiness Score", "Resting heart rate, HRV, body temperature, Sleep, Activity and HRV Balance, Recovery Index", "Not published"],
            ["Samsung", "Energy Score, 1-100", "Sleep, previous-day activity, sleeping heart rate and HRV; Samsung's research partner says weights are individualised", "Not published"],
            ["Apple", "Readiness, 0-10, on Apple Watch Series 12 (announced September 2026)", "Recent activity, training load, vitals and Sleep Score (duration, bedtime consistency, interruptions)", "Not published for Readiness"],
            ["Pulse", "Recovery, 0-100%", "HRV, resting heart rate, sleep, respiratory rate, skin temperature, against your own baselines", "Published in the code and <a href=\"/metrics/recovery/\">the method page</a>"],
          ],
        },
      },
      {
        h: "What the table says",
        p: [
          "HRV and resting heart rate show up in every row. They are the signals that change when your body is under strain, and wrists and fingers can measure them overnight. Sleep is the third constant. A score that ignores a bad night would not match how people feel.",
          "The meaningful differences are in what each adds. WHOOP adds respiratory rate and says a large change can flag illness. Oura adds body temperature and a recovery index of how quickly your heart rate settles. Garmin adds training load, which makes its score part recovery and part workout planner. Google keeps it narrowest.",
          "Garmin and Amazfit also offer a second, all-day gauge (Body Battery, BioCharge). Those rise and fall during the day, so they answer a different question from a morning recovery number. Pulse's counterpart is <a href=\"/metrics/energy-bank/\">Energy Bank</a>.",
        ],
      },
      {
        h: "Why the numbers cannot be compared",
        p: [
          "Each score is judged against your own baseline: WHOOP compares HRV to a 30-day baseline, Garmin builds an HRV range over about three weeks, Google uses up to 30 days. A 65 from one and a 65 from another are different statements. Zones differ too: WHOOP's green starts at 67, Google's High at 65.",
          "What does carry across is the shape. If every score you own drops after a short night, heavy drinking or a cold, the physiology is doing what it should. If one drops and another does not, read their inputs before trusting either. For stuck-low Fitbit numbers, see <a href=\"/blog/fitbit-readiness-always-low/\">this checklist</a>.",
        ],
      },
      {
        h: "Three things worth knowing about each vendor's description",
        list: [
          "WHOOP's current Recovery page lists more inputs than older explainers do: skin temperature, SpO2 and cycle phase appear on the current page. Read the current page, not a years-old summary.",
          "Google's Readiness page has changed too. Older Fitbit material listed activity as an input; the current page lists HRV, resting heart rate and recent sleep.",
          "Garmin's tier names and cut-offs for Training Readiness vary between manuals and devices, so check your own device before relying on any band.",
        ],
      },
      {
        h: "What Pulse is, and is not",
        p: [
          "Pulse is a free, open-source app that computes its own scores from Google Health data. It does not read Google's Readiness (the API has no such type) and it has been tested on the Fitbit Air only. It publishes its method so you can read exactly how a number is made. For the scores of two bands side by side, see <a href=\"/compare/fitbit-air-vs-garmin-cirqa/\">Fitbit Air vs Garmin Cirqa</a> and <a href=\"/compare/fitbit-air-vs-oura-ring/\">Fitbit Air vs Oura Ring</a>.",
        ],
      },
    ],
    faq: [
      { q: "Which recovery score is the most accurate?", a: "Nobody has published a test that ranks them. All are built from overnight HRV, resting heart rate and sleep against a personal baseline. Use whichever you will check every morning, and watch the trend." },
      { q: "Does the Apple Watch have a recovery score?", a: "On Apple Watch Series 12, yes: Apple announced a 0-10 Readiness score in September 2026, built from recent activity, training load, vitals and Sleep Score. Older watches have the Sleep Score and the Vitals app, which shows overnight metrics against your range, but no single readiness number." },
      { q: "Why do my Garmin and Fitbit readiness numbers disagree?", a: "They use different inputs and baselines. Garmin includes training load and recovery time; Google lists HRV, resting heart rate and recent sleep." },
    ],
    sources: [SRC.gReadiness, SRC.whoopRecovery, SRC.garminManuals, SRC.zepp, SRC.ouraReadiness, SRC.samsungEnergy, SRC.appleReadiness, SRC.appleSleep],
    checked: NOW,
  },
]
