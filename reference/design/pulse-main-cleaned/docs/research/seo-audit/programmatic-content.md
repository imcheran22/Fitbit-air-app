# Programmatic SEO audit: Pulse marketing site

Audit date: 2026-10-09. Scope: the built site in `site/dist` (77 HTML pages, built 2026-10-09 18:53) plus the sources in `site/src/data/` and `site/src/content/blog/`. Method: every page parsed from `dist`, text taken from `<main>` only (header, footer, nav and scripts removed), then measured with a script. The helper scripts are deleted. No file other than this report was changed.

Limits of this audit: no Search Console data, no live SERP check and no keyword volumes, so "target query" is read from title, H1, meta keywords and the strategy doc. I did not re-fetch Google's policy pages; the policy wording below is taken from `docs/research/blog/strategy.md` section 2 (fetched 2026-10-09). The `claude-seo:seo-programmatic` skill was not loaded; I followed its brief as written in the task (uniqueness, thin content, cannibalisation, links, titles, freshness, scaled-content risk).

## Summary

| Family | Pages | Main-content words (median / min / max) | Mean 5-word shingles shared with sibling pages | Highest single page |
|---|---|---|---|---|
| Metrics | 17 | 403 / 259 / 811 | 35.3% | resting-heart-rate 52.0% |
| Compare | 10 | 908 / 527 / 1,147 | 22.9% | google-health-premium 31.1% |
| Blog | 43 | 1,214 / 1,095 / 1,506 | 10.8% | fitbit-daily-readiness-explained 18.8% |
| Hubs, home, glossary | 5 | 298 to 2,619 | not measured | n/a |

Key numbers:

- 15 exact meta-keyword strings are shared by two pages of different families (table in finding C2). 6 of those pairs are the same search intent.
- 3 blog posts have zero inbound links from any metric, compare or blog page (only the `/blog/` hub and the sitemap reach them). 7 more have exactly one.
- 0 of 17 metric pages link to a blog post. Only 2 compare-to-blog links exist across the 10 compare pages.
- 29 of 43 posts show "Facts about other products checked 9 October 2026" while their `dateModified` and sitemap `lastmod` equal an earlier published date (June to September). 13 posts carry an `updated` date; 1 has no `checked` date.
- 13 meta descriptions exceed 160 characters (5 compare, 8 blog; longest 176). 1 title exceeds 60 characters.
- Template shell shared by all 17 metric pages: 7 H2 headings identical on every page; boilerplate blocks (text appearing on 40% or more of siblings) are 18.0% of metric words, 17.8% of compare words, 3.5% of blog words.
- No broken internal links or fragment targets; every page is in the sitemap; no page is `noindex` except 404.

Overall read: the metric pages and the 10 compare pages read as first-party, data-led content. The 43-post blog is the scaled-content risk, not because the text is templated (it is not: 10.8% shared) but because of how it was published: all at once, backdated, under an organisation byline, covering five brands Pulse does not test. Details in finding C1 and section "Scaled-content risk".

## Critical

### C1. The blog is 43 posts published at once with back-dated dates and no named author

Pages: all 43 `/blog/*` posts.

Evidence:
- `docs/plans/2026-10-09-001-blog-and-comparisons.md` line 170: every post carries a past date between 2026-06-01 and 2026-10-09 (changed on 2026-10-09 at the owner's request). The site went live with all 43 posts on one build, so the "published" dates are earlier than the first time any crawler can see them.
- `docs/research/blog/strategy.md` section 4: "Launch with 6 to 8 posts... more than about 10 at once invites the 'many pages at once' read and cannot be properly fact-checked." Actual launch: 43.
- Author is "Pulse contributors" (Organization) in every Article JSON-LD and in `<meta name="author">`. No post names a person or a reviewer, and no `reviewed` field exists, though strategy section 2 asks for "Named author or 'maintained by'" and the Google quote "deceptive authorship information".
- Prose is first person singular ("I could not find any...", "I would not trust a table...", "I haven't checked its feature list") with no named "I". 39 of 43 posts use first person. Strategy section 2 says Pulse can claim first-hand experience only for the Fitbit Air. Posts about WHOOP, Garmin, Oura, Amazfit and Apple Watch are built from published sources, with no test evidence.
- Length is very uniform: 43 posts between 1,095 and 1,506 words (standard deviation 105), 10.4 H2 sections on average, every post ending with the same Sources, On this page, Keep reading and CTA blocks.

Why it matters: this is the pattern Google's scaled-content and "using generative AI... without manual oversight" language describes, even though each post is individually sourced. The false-date element makes it worse, because a date is a claim to readers and to Google.

Fix (pick one, in this order of preference):
1. Stage the release: publish 8 to 10 posts now (the ones with Pulse-specific data: Fitbit readiness always low, Fitbit Air HRV zero, Cardio Load vs Strain, Pixel Watch readiness missing, Fitbit Air Body Battery, Google Health API for self-hosters, good HRV by age, Fitbit sleep score) and release 2 to 4 a month with real dates. Keep the rest as drafts (`getPosts()` already hides future dates).
2. If back-dating stays, set `datePublished` to the real publish date in JSON-LD and show the original-writing date only as text, or at least stop showing "checked 9 October" under a June date (see M3).
3. Put a real name (the owner's, or "Maintained by ...") and a `reviewed` date on each post, and change "Pulse contributors". Add one sentence per post on what was and was not tested on a Fitbit Air.
4. Remove first-person claims that imply testing on devices that were not tested.

## Critical (cannibalisation)

### C2. Six pairs target the same query on two URLs

Evidence is in the cannibalisation table below. The three worst:
- `/metrics/sleep-consistency/` (title "Sleep consistency: the Sleep Regularity Index explained") and `/blog/sleep-regularity-index/` ("Sleep Regularity Index: what it is and how to improve it"). Same exact keyword, plus the blog keywords include "sleep regularity index formula" and "calculator", which are the metric page's job. This breaks strategy rule 4 ("never re-target the metric page's exact title phrase").
- `/compare/google-health-premium/` ("Google Health Premium vs free vs WHOOP vs Pulse") and `/blog/google-health-premium-vs-free/` ("Google Health Premium vs free: what you actually lose"). Titles share "Google Health Premium vs free"; exact keyword shared. Strategy section 1 row 3 said to merge this into the compare page, not add a post.
- `/compare/recovery-scores/` and `/blog/whoop-recovery-vs-body-battery-vs-oura-readiness/`. Both answer "how do WHOOP Recovery, Body Battery and Oura Readiness differ". Strategy says one data hub should answer all pair queries.

Fix: see the table (owner and change per pair).

## High

### H1. Metric pages link to no blog post, and compare pages almost none

Pages: all 17 metric pages, all 10 compare pages.
Evidence: 0 of 17 metric pages link to a blog post (their "Related" block links only to other metrics: 3 to 4 links each). Compare pages link to the blog only twice in total (`recovery-scores` 1, `fitbit-air-vs-amazfit-helio-strap` 1); the reverse direction is 4 posts linking to a compare page. The blog hub `/blog/`, `/metrics/` and `/compare/` link to nothing outside their own family in the page body.
Impact: the blog gets inbound links only from other blog posts, so the topic clusters are not tied to the pages that own the definitions. Blog median inbound links from content pages is 3 (min 0); metrics 6 (min 1); compare 9 (every compare page links all 9 others).
Fix: add a "Questions people ask" or "Read next" block to each metric page, driven by a `tags` or `metric` field on the post: recovery to whoop-recovery-score-explained, fitbit-daily-readiness-explained, fitbit-readiness-always-low, oura-readiness-explained; strain to whoop-strain-explained, cardio-load-vs-strain; strain-target to fitbit-target-load; hrv to good-hrv-by-age, fitbit-air-hrv-zero, garmin-hrv-status-unbalanced; resting-heart-rate to fitbit-resting-heart-rate-high; sleep-performance to fitbit-sleep-score-explained, garmin-sleep-score-explained, whoop-sleep-need-explained; sleep-consistency to sleep-regularity-index; stress-monitor to fitbit-resilience-stress-score, garmin-stress-level-always-high; energy-bank to good-body-battery, fitbit-air-body-battery; fitness-level to fitbit-vo2-max-accuracy, garmin-vo2-max-accuracy; training-balance to garmin-load-ratio-acute-load; pulse-age to fitness-age-vs-pulse-age-vs-whoop-age, whoop-healthspan-pace-of-aging; behaviour-insights to whoop-journal-behaviours. In each compare page add the 1 to 2 posts that cover the same pair (see the table).

### H2. Three blog posts are orphans and seven have one inbound link

Evidence (inbound links from other blog, metric and compare pages, footer and nav excluded; the footer links `/blog/` only, never a post):

| Post | Inbound from content pages |
|---|---|
| fitbit-resilience-stress-score | 0 |
| garmin-sleep-score-explained | 0 |
| whoop-sleep-need-explained | 0 |
| amazfit-biocharge-vs-garmin-body-battery | 1 (garmin-training-status-unproductive) |
| amazfit-pai-explained | 1 (whoop-strength-trainer-vs-heart-rate-strain) |
| fitbit-vo2-max-accuracy | 1 (garmin-vo2-max-accuracy) |
| garmin-load-ratio-acute-load | 1 (garmin-training-status-unproductive) |
| garmin-stress-level-always-high | 1 (garmin-vo2-max-accuracy) |
| garmin-vo2-max-accuracy | 1 (garmin-stress-level-always-high) |
| whoop-strain-explained | 1 (whoop-strength-trainer-vs-heart-rate-strain) |

Fix: fixed by H1 (metric pages) plus adding each of these to the "Keep reading" of its two nearest posts. "Keep reading" appears to pick a small hand-set list per post; make it reciprocal (if A lists B, B lists A).

### H3. Metric pages are thin for their search intent

Pages: `fitness-fatigue-form` (259 words in main), `heart-rate-recovery` (273), `behaviour-insights` (359), `fitness-level` (378), `training-balance` (383), `sleep-consistency` (393), `strain-target` (399), `sleep-planner` (401), `sleep-performance` (403). Median 403 words for the family.
Evidence: those counts include header, scale, phone mock-up text, Sources, Related and CTA. The method text alone (What goes in, How it is weighted, What the bands mean, Limits) is 146 to 343 words, median 229. `heart-rate-recovery` has 146. Only 3 of 17 pages have an FAQ section.
The queries these pages target ("what is a good heart rate recovery", "acwr calculator", "sleep need calculator", "am i overtraining", "how much should i train today") expect a worked example, a range table by age or a tool. The `compare` pages, at 527 to 1,147 words, and the blog, at 1,095 to 1,506, are far deeper than the pages that own the definitions.
Fix: add to each of the 9 pages one worked example with real numbers from Pulse's code (the app's `how-it-works/content.ts` is the single source, so add an `example` field there), 3 to 4 FAQ items, and a "How this differs from the device's own score" paragraph. Aim for 600 words of method text on the 9 thinnest. Merge `fitness-fatigue-form` into `training-balance` if a worked example cannot be added (both describe the same Banister and ACWR load ideas; 26.6% shingle overlap).

### H4. Two compare pages answer the same question

Pages: `/compare/pulse-vs-subscription-wearables/` (568 words) and `/compare/recovery-tracking-without-subscription/` (527 words), and `/compare/google-health-premium/` (559) as a third thin page.
Evidence: they share the meta keyword "open source recovery app", target the same intent ("recovery tracking without a subscription / membership"), and are the two lowest-uniqueness compare pages after google-health-premium (shared shingles 23.3% and 25.7%; the two overlap each other most, 23.9% and 20.7%). Strategy section 1 says "Extend it rather than add a clone". They are also 3 of the 4 shortest compare pages. The blog adds `whoop-alternatives-no-subscription` and `open-source-whoop-alternatives` on the same cluster.
Fix: merge into one page (keep `/compare/recovery-tracking-without-subscription/`, 301 the other), fold in the price table from `google-health-premium` (keep that URL for the "Premium" query only) and link to the two WHOOP-alternatives posts.

### H5. Metric meta keywords contradict the data-file rule and feed the overlaps

Evidence: the comment in `site/src/data/metrics.ts` says keywords are "Generic terms only, no brands". Of the 17 metric pages, the keywords on `recovery` ("fitbit air recovery score", "pixel watch recovery score"), `hrv` ("fitbit air hrv", "pixel watch hrv"), `resting-heart-rate`, `strain` ("fitbit strain score"), `sleep-performance` ("fitbit sleep score"), `stress-monitor`, `fitness-level` ("fitbit cardio fitness score"), `health-monitor` and `pulse-age` ("fitbit biological age") carry device brand terms. Those same queries are targeted by compare or blog pages (rows 5, 9, 10, 12 below), which is how the exact-keyword collisions arise.
Fix: strip the brand terms from metric pages' keywords and titles, and let the blog or compare page named in the table own them. Google ignores the keywords tag, so this matters as a map of intent and for the title and H1 wording, not for ranking directly.

## Medium

### M1. Six metric pages are 41 to 52% shared with sibling pages

Evidence (5-word shingles shared with any other metric page; sentence overlap in brackets): resting-heart-rate 52.0% (53.8%), hrv 47.9% (45.5%), sleep-consistency 43.1% (53.3%), stress-monitor 42.7% (54.1%), energy-bank 42.0% (48.8%), health-monitor 41.2% (41.3%). Best-matching pair: resting-heart-rate and health-monitor, 38.4%. The family mean is 35.3%.
Cause, from the block counts: every page repeats the same 7 H2 headings, the CTA paragraph, the "Related" card text, and 11 of 17 pages embed a phone mock-up whose visible text (Today, Home, Journal, More, Settings, "Last night's sleep", the same sample readings) is identical. resting-heart-rate, hrv and health-monitor reuse the same "personal ranges / baseline ± 2 SD over 60 nights" sentence verbatim. About 18% of family words are pure boilerplate. The unique share of a metric page is therefore about 50 to 75%. That is acceptable for pages that exist because the data differs per page, but it is the weakest family on this measure.
Fix: give the phone mock-up `aria-hidden` and keep its text out of the indexable copy (render the mock as an image or `data-nosnippet`); replace the repeated ranges sentence with a link to `/metrics/health-monitor/`; add the worked examples from H3. Target: under 30% shared for every page.

### M2. Title and description set

Evidence:
- Brand suffix `| Pulse` is on 5 of 17 metric titles, 8 of 10 compare, 34 of 43 blog, and absent from the other 7 pages in `/blog/`-style listings. It is appended only when it fits in 60 characters, so the pattern varies page to page. The metric pages that lack it are not shorter in a way that matters. Make it all or none.
- Titles over 60 characters: 1 (`/blog/google-health-api-for-self-hosters/`, 63). Others are 45 to 60 including the suffix. Entity-escaped quotes (`&#39;`, `&quot;`) in 4 titles are normal HTML, not a defect.
- Descriptions over 160 characters (likely truncated in results): compare 5 (`fitbit-air-vs-garmin-cirqa` 176, `fitbit-air-vs-amazfit-helio-strap` 168, `pixel-watch-vs-whoop` 164, `recovery-scores` 165, `google-health-vs-garmin-connect` 161), blog 8 (longest `fitbit-air-hrv-zero`, `garmin-sleep-score-explained`, `cardio-load-vs-strain`, `amazfit-pai-explained`, 168 to 169). Range across all 70 pages: 121 to 176.
- Patterns: 16 of 17 metric titles use "Name: description" (colon form). Seven metric titles lead with an invented feature name that nobody searches (Energy Bank, Strain Target, Sleep Planner, Stress Monitor, Health Monitor, Behaviour insights, Pulse Age). `/metrics/sleep-planner/` has the keyword "what time should i go to bed" and "sleep need calculator" but neither is in the title or H1. Four metric titles do not match their H1 (hrv: title "HRV from your wearable: what it is and how Pulse uses it", H1 "Heart rate variability (HRV)").
- Blog titles are well varied: 13 use a question mark, 7 "explained", 8 "vs", 8 start with WHOOP, 8 with Fitbit, 7 with Garmin. No two blog descriptions start with the same three words more than once. This is the healthiest set. Compare titles repeat "the scores compared" on 2 pages ("Fitbit Air vs Garmin Cirqa" and "Fitbit Air vs Amazfit Helio Strap"), which is the only mechanical pattern, and is acceptable for a pair series.
- Hub pages copy child keywords wholesale (`/blog/` lists 43 keywords, `/compare/` 20). Google ignores this tag; it only makes the keyword map unreadable.
Fix: trim 13 descriptions to 155 characters; choose a suffix rule; lead metric titles with the query ("Sleep need calculator: how Pulse sets tonight's bedtime") and keep the feature name second.

### M3. Freshness signals disagree on 29 posts and are missing on all metric pages

Evidence:
- 29 posts have `published` before 2026-10-09, `checked: "2026-10-09"` and no `updated`. The page shows "Facts about other products checked 9 October 2026" under a header date such as "5 June 2026" (`good-hrv-by-age`), but `dateModified` in JSON-LD equals the June date and the sitemap `lastmod` equals the June date. The post cannot be both unchanged since June and checked in October. 4 of these also list "(checked 2026-10-09)" in their Sources: `fitbit-resting-heart-rate-high`, `fitbit-sleep-score-explained`, `good-hrv-by-age`, `pixel-watch-readiness-sleep-score-missing`.
- `/blog/whoop-alternatives-no-subscription/` has "(Oct 2026)" in its title but `published: 2026-09-07` (`updated` 2026-10-09). The title dates the content a month after its published date.
- Posts that state "as of October 2026" or "9 October 2026" are all correctly marked `updated: 2026-10-09` (`fitbit-air-body-battery`, `fitbit-resilience-stress-score`, `export-fitbit-data`, `fitbit-grafana-vs-pulse`, `google-health-api-for-self-hosters`, `open-source-whoop-alternatives`, `whoop-recovery-vs-body-battery-vs-oura-readiness`, `whoop-membership-cost`, `whoop-alternatives-no-subscription`, `google-health-premium-vs-free`). No post cites a month later than its published date without an `updated`. `sleep-regularity-index` has no `checked` date at all (it cites papers only, which is fair, but it is the one post without the field).
- The 17 metric pages show no visible date, no "last checked" line and no author. Their JSON-LD `dateModified` is 2026-10-03 and the sitemap `lastmod` is 2026-10-03 for the home page, 3 hubs, glossary, 17 metrics and 2 compare pages (24 URLs). Those pages are generated from the app's `content.ts`, so a change to a formula would not change the date. 8 of 10 compare pages show 2026-10-09 (visible and in JSON-LD); 2 show 2026-10-03.
Fix: when `checked` is later than `published` and there is no `updated`, set `updated = checked` automatically in `getPosts()` (one line); take `lastmod` and `dateModified` from the same field; add "Last checked" and a source date to metric pages, fed from the git date of `content.ts` or a field; fix the Oct 2026 title or drop the month from it.

### M4. Markdown alternates are served as indexable

Evidence: `dist/metrics/*/index.md`, `dist/compare/*/index.md`, `dist/index.md` and `dist/glossary/index.md` exist, and `site/dist/_headers` sets `X-Robots-Tag: index, follow, max-image-preview:large` for `/metrics/*`, `/compare/*`, `/` and `/glossary/`. The comment in that file says they should be crawlable "without duplicating the HTML pages in search results", but `index` does the opposite. The blog has no `.md` alternates. 29 pages therefore have an indexable near-duplicate.
Fix: serve `*.md` with `X-Robots-Tag: noindex, follow` (a `/*.md` rule placed after the wildcard ones) and add `Link: <html url>; rel="canonical"`.

### M5. Blog sibling pairs that share text

Evidence: `fitbit-daily-readiness-explained` and `fitbit-readiness-always-low` share 12.9% and 11.1% of 5-word shingles, and each has the highest sharing in the family (18.8% and 18.3% with all other posts). `fitbit-air-body-battery` and `good-body-battery` follow (16.6% and 14.3%). All other blog pairs are under 10%. These pairs have different intents (explain vs troubleshoot; Fitbit has no Body Battery vs Garmin's bands), so this is a link-and-wording issue, not duplication.
Fix: in each pair keep one short paragraph and link to the other for the shared explanation, as strategy rule 3 says ("link, do not restate").

## Low

### L1. Anchor text is good but formulaic
127 of 178 blog-to-blog links use the target's own title as anchor (descriptive). Blog-to-metric anchors are mostly "how Recovery works" (9 of 16 links to recovery), "how Strain works", "how Sleep Performance works". They are descriptive, but one pattern repeats. A few are odd: "how the HRV page works", "Pulse: how Pulse Age works". No "here" or "read more" anchors anywhere. Vary 1 in 3 with the query wording (for example "WHOOP Recovery vs Pulse Recovery").

### L2. FAQPage markup
3 metric pages and 8 compare pages emit FAQPage JSON-LD. Strategy section 2 notes FAQ rich results ended on 2026-05-07, so the markup earns nothing; harmless to keep. Blog posts have none.

### L3. Hubs and glossary
`/metrics/` (298 words) and `/compare/` (393 words) are lists with short intros; fine for hubs. `/glossary/` links 14 of 17 metrics and 0 blog posts; its 27 terms could link the 5 or 6 posts that define the same term (SRI, ACWR, HRV baseline).

### L4. Nav hides the Blog link at narrow widths
In the header the Blog and Glossary links carry classes `wide` and `widest`, which are `display:none` below a breakpoint. The footer always lists Blog, so crawling is unaffected, but mobile users reach the blog only from the footer.

## Cannibalising pairs

"Owner" is the page that should hold the query. "Other changes" is what the second page must do.

| # | Query / intent | Page A | Page B | Evidence | Owner | What the other should change |
|---|---|---|---|---|---|---|
| 1 | sleep regularity index | `/metrics/sleep-consistency/` | `/blog/sleep-regularity-index/` | exact keyword; both titles contain "Sleep Regularity Index" | Metric page (definition, formula) | Blog retitle to "How to improve your sleep regularity: a two-week plan", drop keywords "sleep regularity index", "formula", "calculator", link to the metric page for the definition |
| 2 | google health premium vs free | `/compare/google-health-premium/` | `/blog/google-health-premium-vs-free/` | near-identical title; exact keyword | Compare page (table and price, `checked` date) | Blog retarget to "is Google Health Premium worth it / what you lose without it"; drop "vs free" from title and keywords; link to the compare page for the table |
| 3 | recovery vs readiness vs body battery comparison | `/compare/recovery-scores/` | `/blog/whoop-recovery-vs-body-battery-vs-oura-readiness/` | exact keyword "recovery score comparison"; both answer "how do these scores differ" | Compare page | Merge the blog post into the compare page and 301 it, or reduce it to one specific question (for example "Can I compare my WHOOP Recovery and Garmin Body Battery?") |
| 4 | recovery tracking / open-source recovery app without subscription | `/compare/pulse-vs-subscription-wearables/` | `/compare/recovery-tracking-without-subscription/` | exact keyword "open source recovery app"; same intent; 23 to 26% shared text | `/compare/recovery-tracking-without-subscription/` | Merge and 301 (finding H4). Also link the two blog posts `whoop-alternatives-no-subscription` and `open-source-whoop-alternatives` |
| 5 | fitbit air recovery score / pixel watch recovery score | `/metrics/recovery/` | `/compare/fitbit-air-recovery-and-strain/`, `/compare/pixel-watch-vs-whoop/` (also home and `/compare/` hub keywords) | exact keywords "fitbit air recovery score" (4 pages) and "pixel watch recovery score" (4 pages) | `/compare/fitbit-air-recovery-and-strain/` for "fitbit air recovery score" (its title is the direct question); `/compare/pixel-watch-vs-whoop/` for the Pixel Watch one | Metric page, home and compare hub drop both brand keywords; metric page stays on "recovery score explained", "how is recovery score calculated" |
| 6 | what is a good HRV | `/metrics/hrv/` | `/blog/good-hrv-by-age/` | exact keyword "what is a good hrv"; metric title says "what it is" | Blog (data and ranges by age) | Metric drops "what is a good hrv" and links to the blog for ranges |
| 7 | does Fitbit Air have Body Battery | `/compare/fitbit-air-vs-garmin-cirqa/` | `/blog/fitbit-air-body-battery/` | two exact keywords ("does fitbit air have body battery", "fitbit body battery equivalent") | Blog (question form) | Compare drops both; owns "fitbit air vs garmin cirqa" |
| 8 | oura readiness score explained | `/compare/fitbit-air-vs-oura-ring/` | `/blog/oura-readiness-explained/` | exact keyword | Blog | Compare drops it; links to the post |
| 9 | cardio load vs whoop strain | `/compare/fitbit-air-recovery-and-strain/` | `/blog/cardio-load-vs-strain/` | exact keyword; the compare keyword list also holds "google health readiness vs whoop recovery" (covered by blog `fitbit-daily-readiness-explained`) | Blog for the definition, compare for "does Fitbit Air have strain" | Compare drops "cardio load vs whoop strain" |
| 10 | how is whoop recovery calculated | `/compare/recovery-scores/` | `/blog/whoop-recovery-score-explained/` | exact keyword | Blog | Compare drops it, keeps "readiness vs recovery" |
| 11 | acute chronic workload ratio | `/metrics/training-balance/` | `/blog/garmin-load-ratio-acute-load/` | exact keyword; blog title ends "the ACWR link" | Metric (title already "acute:chronic workload ratio (ACWR)") | Blog drops the keyword and keeps Garmin Load Ratio / Acute Load |
| 12 | fitbit cardio fitness score / VO2 max | `/metrics/fitness-level/` | `/blog/fitbit-vo2-max-accuracy/` | exact keyword "fitbit cardio fitness score" | Blog | Metric drops it, keeps "vo2 max percentile" |
| 13 | fitbit sleep score | `/metrics/sleep-performance/` | `/blog/fitbit-sleep-score-explained/` | keyword "fitbit sleep score" on the metric page vs the blog title | Blog | Metric drops the brand keyword |
| 14 | whoop alternative, no subscription | `/blog/whoop-alternatives-no-subscription/` | `/blog/open-source-whoop-alternatives/`, `/blog/whoop-membership-cost/` | same cluster; keyword "whoop alternative" family | whoop-alternatives-no-subscription | open-source post limited to GitHub projects; membership-cost post limited to price and cancel |
| 15 | fitbit stress score | `/metrics/stress-monitor/` | `/blog/fitbit-resilience-stress-score/` | keyword "fitbit stress score" (metric) vs "fitbit stress score gone" | Blog | Metric drops the brand keyword |

Rows 1 to 4 and row 5 are the ones to act on first. Rows 6 to 15 are one-line keyword edits.

## Ten least-linked pages

Inbound links counted from other blog, metric and compare pages in the page body. The footer lists every metric page and every compare page on every page, and `/blog/` only, so metric and compare pages always have at least one sitewide link and no blog post has one. A total including hubs and glossary is in brackets.

| Rank | Page | Inbound from content pages | Outbound to metric / compare / blog | Note |
|---|---|---|---|---|
| 1 | `/blog/fitbit-resilience-stress-score/` | 0 (1: blog hub) | 1 / 0 / 4 | orphan |
| 2 | `/blog/garmin-sleep-score-explained/` | 0 (1) | 1 / 0 / 3 | orphan |
| 3 | `/blog/whoop-sleep-need-explained/` | 0 (1) | 2 / 0 / 3 | orphan |
| 4 | `/blog/amazfit-biocharge-vs-garmin-body-battery/` | 1 (2) | 1 / 0 / 3 | |
| 5 | `/blog/amazfit-pai-explained/` | 1 (2) | 1 / 0 / 3 | |
| 6 | `/blog/fitbit-vo2-max-accuracy/` | 1 (2) | 1 / 0 / 3 | `/metrics/fitness-level/` does not link it |
| 7 | `/blog/garmin-load-ratio-acute-load/` | 1 (2) | 1 / 0 / 5 | `/metrics/training-balance/` does not link it |
| 8 | `/blog/garmin-stress-level-always-high/` | 1 (2) | 1 / 0 / 3 | |
| 9 | `/blog/garmin-vo2-max-accuracy/` | 1 (2) | 1 / 0 / 5 | |
| 10 | `/blog/whoop-strain-explained/` | 1 (2) | 2 / 0 / 3 | `/metrics/strain/` does not link it |

Next lowest: `/metrics/heart-rate-recovery/` has 1 inbound link from content pages (from `fitness-level`) and 0 from blog or compare; no blog post covers it at all. Blog median inbound is 3, metrics 6, compare 9.

Outbound: blog posts link to a metric page 1 time on median (range 0 to 4; `export-fitbit-data`, `google-health-premium-vs-free` and `google-health-api-for-self-hosters` have 0), to a compare page in 4 posts only. Hub coverage: `/blog/` lists 43 of 43 posts, `/metrics/` 17 of 17, `/compare/` 10 of 10, home 17 of 17 metrics and 10 of 10 compares and 0 posts.

## Scaled-content risk

What Google's 2026 policy (strategy.md section 2) asks: pages made in bulk "for the primary purpose of manipulating search rankings", "many pages... without adding value", AI text "without manual oversight or curation", and "deceptive authorship information".

For:
- Metrics (17) and compare (10): unique data on every page (formulas, bands, sources, the vendor's published inputs, a `checked` date, honest "what Pulse cannot do" sections). The metric content comes from the app's own code, so each number is the code's. Compare pages are 527 to 1,147 words with per-pair score tables, cited vendor pages and a "not affiliated" notice. No variable-swap templates: compare pages have different H2 sets (for example "Straight about Pulse and the Pixel Watch" vs "Two different philosophies"). This reads as helpful first-party content. The strategy's "remove the brand names" gate is met by compare pages.
- Blog: every post has an uncertainty section ("What is not known" on 5, "I could not find..." statements), dated source checks, hand-drawn diagrams, and under 11% shared text. No sign of text swapped between pages.

Against:
- 43 posts at once, 131 days of back-dated dates, an organisation byline with first-person text, no reviewer, and 5 of 6 brands not tested (finding C1). This matches "many pages at once" and "deceptive authorship information" signals more than any wording issue would.
- About 23 of the 43 posts are named for a brand Pulse cannot read (11 filenames with WHOOP, 8 Garmin, 2 Oura, 2 Amazfit; some overlap), many as troubleshooting queries ("X always low", "X unbalanced", "X accuracy"). Pulse reads Google Health data only (strategy 3). Google may judge these as query-catching pages with a Pulse tag-on, since only 1 to 3 Pulse mentions appear per post (median 3).
- Metric pages: on a 17-page family built from one template and one data file, 35% shared text and 259 to 403 words on 9 pages is the template-first shape Google's 2026 core-update reports describe ("variable-swap templates"), though here the data per page really does differ. Findings H3 and M1 move it clear.

Verdict: metric and compare pages low risk once H3, H4 and M1 are done. The blog is medium to high risk until C1 is addressed. Cannibalisation (C2) is the second risk: the strategy's own rules 1, 3 and 4 are broken by pairs 1 to 4 in the table.

## Suggested order of work

1. C1 (stage the blog, real dates, named author) and C2 pairs 1 to 4.
2. H1 and H2 (metric-to-blog and compare-to-blog links, reciprocal "Keep reading"). One data field (`metric` on each post) drives both.
3. H3, H4, H5, M1 (thin pages, merged compare page, keyword clean-up).
4. M2 to M5 and L1 to L4.
