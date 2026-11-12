# Crawl and index audit: Pulse marketing site

Audited 2026-10-09 against `site/dist` (78 HTML files: 77 indexable + 404.html) and the preview at http://localhost:3330. Every page was parsed, not sampled. The preview server does not apply `public/_headers`, so response headers below are read from the file and the endpoint code, not observed live.

## Summary

The HTML layer is clean. All 77 indexable pages are in sitemap.xml exactly once, with no duplicates, no noindex pages and no 404s. Every page has one H1, an absolute self-referencing trailing-slash canonical, og:url equal to the canonical, og:image and twitter tags, and a unique title and description. All internal hrefs in dist resolve with 200, there are no redirects and no orphan pages. `trailingSlash: "always"` is honoured everywhere.

The weak points are in the agent and machine layer. Blog posts (43 of 77 pages) have no Markdown alternate. The `_headers` rules for `.md` files conflict with the `/metrics/*` and `/compare/*` rules. llms.txt omits the three index pages and its list format departs from the proposal. Descriptions on 13 pages run past 160 characters. There are no Critical issues.

## Critical

None. No page is blocked, noindexed by mistake, missing from the sitemap or returning an error.

## High

### H1. No Markdown alternates for blog posts or the three index pages
- Affected: 43 `/blog/<slug>/` posts, `/blog/`, `/metrics/`, `/compare/`.
- Evidence: `find dist -name index.md` finds 29 files: `/`, `/glossary/`, 17 metrics, 10 comparisons. `Base.astro` line `hasMarkdown` is true only for those. No `<link rel="alternate" type="text/markdown">` on any blog page. `/blog/good-hrv-by-age/index.md` returns 404. llms.txt links metrics and comparisons to `.md` files but links all 43 posts to their HTML URL, so the file mixes two formats.
- Fix: add `src/pages/blog/[slug]/index.md.ts` (same pattern as `src/pages/metrics/[slug]/index.md.ts`) that returns `# title`, description, `Canonical page: <url>`, and the post body, through `markdownResponse()`. Add a `postMarkdown()` to `src/lib/markdown.ts`. Extend `hasMarkdown` in `Base.astro` with `path.startsWith("/blog/")` for posts, and point the llms.txt blog entries at `markdownPath(postPath(p.id))`. Posts are `.md` content, so the body can be the raw collection body. Strip or convert the ```sketch blocks, which render as SVG in HTML. The three index pages are optional.

## Medium

### M1. `_headers` rules for `.md` conflict, and the canonical Link header is missing in production
- Evidence: `public/_headers` sets `X-Robots-Tag: index, follow, max-image-preview:large` on `/metrics/*` and `/compare/*`, and `X-Robots-Tag: noindex, follow` on `/*.md`. On Cloudflare Pages/Workers assets a `*` splat matches across slashes, so `/metrics/hrv/index.md` and `/compare/*/index.md` match both rules and receive both values (headers from multiple matching rules are joined). Google resolves to the most restrictive, so the files are likely still noindexed, but the combined header is contradictory. Also: the `Link: <canonical>; rel="canonical"` header is set only in `markdownResponse()` in `src/lib/markdown.ts`. The file header says endpoint headers apply only in dev, and `_headers` gives `.md` only `rel="describedby"`. So deployed `.md` files have no canonical Link header. Static `.md` and `llms.txt` files also have no `X-Robots-Tag` in the local preview, as expected.
- Fix: in `public/_headers`, delete the `X-Robots-Tag: index...` blocks for `/`, `/metrics/*`, `/compare/*`, `/glossary/` (indexing is the default and the HTML already has a robots meta tag). Keep `/*.md` and `/404.html`. A per-file canonical Link header cannot be written as a single wildcard rule, so either accept noindex alone, or generate the `_headers` canonical lines in a build step.

### M2. llms.txt format and coverage
- Evidence: 76 links (3 start, 17 metrics, 10 comparisons, 43 posts, 3 optional). All 10 comparisons and all 43 posts are present, and every `index.md` target exists in dist. Gaps:
  1. Items are separated by blank lines (`.join("\n\n")`), so each `- [..](..)` list item is its own paragraph. The proposal shows a contiguous list under each H2.
  2. The "Start here" intro paragraph follows the blockquote as proposed, but `/metrics/`, `/compare/` and `/blog/` index pages are not linked.
  3. Comparison entries describe themselves as `Facts checked 2026-..`, not what the page covers. The `description` field is used for the overview page and is better.
  4. Privacy and Terms sit under `## Optional`, which the proposal reads as skippable. That fits; the setup guide, which points to GitHub, is under Start here.
- Fix: in `src/pages/llms.txt.ts`, join each section's links with `"\n"` and the sections with `"\n\n"`; use `c.description` in the comparison entries; add the three index links under Start here. Posts: see H1.

### M3. Blog lastmod and bulk-stamped dates
- Evidence: blog uses `updated ?? published` as requested; the earliest is 2026-06-01. But 14 blog URLs (13 posts with `updated: "2026-10-09"` plus `/blog/`) and 7 comparison pages (all `checked` 2026-10-09) share today's date, which looks like a bulk touch. `/blog/` lastmod is the newest `published`, so it will not move when an old post is edited. 20 pages (home, `/metrics/`, 17 metrics, `/compare/`, `/glossary/`) use the hand-set constant `CONTENT_UPDATED = "2026-10-03"` in `src/config.ts` and `/privacy/` and `/terms/` have hardcoded dates in `sitemap.xml.ts` (2026-10-04, 2026-10-03). Google discounts lastmod values that change without content changes.
- Fix: in `sitemap.xml.ts` set `/blog/` lastmod to the max of `updated ?? published` over all posts. Only bump `updated` and `checked` when the text changed. Consider per-metric dates rather than one constant.

### M4. Scheduled posts need a rebuild
- Evidence: `src/lib/posts.ts` `getPosts()` filters `published <= today` at build time, outside dev. `.github/workflows/ci.yml` has no `schedule`/cron trigger, and deploy is `wrangler deploy` of a pre-built `dist`. A post dated in the future will not be in the HTML, sitemap or llms.txt until someone rebuilds after that date. Currently consistent: all 43 posts are dated 2026-10-09 or earlier and all are in dist.
- Fix: add a daily scheduled build and deploy, or accept manual deploys on publish days.

## Low

### L1. 13 pages have meta descriptions over 160 characters
All have unique descriptions. Lengths of the others range 121 to 160. Over 160 may be truncated in results.

| Page | Length |
|---|---|
| /compare/fitbit-air-vs-garmin-cirqa/ | 176 |
| /blog/garmin-sleep-score-explained/ | 169 |
| /blog/fitbit-air-hrv-zero/ | 169 |
| /blog/amazfit-pai-explained/ | 168 |
| /blog/cardio-load-vs-strain/ | 168 |
| /compare/fitbit-air-vs-amazfit-helio-strap/ | 168 |
| /compare/recovery-scores/ | 165 |
| /blog/whoop-membership-cost/ | 164 |
| /compare/pixel-watch-vs-whoop/ | 164 |
| /blog/fitbit-pixel-metrics-by-device/ | 162 |
| /blog/whoop-alternatives-no-subscription/ | 161 |
| /blog/whoop-strain-explained/ | 161 |
| /compare/google-health-vs-garmin-connect/ | 161 |

Fix: shorten the `description` in each post's frontmatter and in `src/data/compare.ts`.

### L2. One title is over 60 characters
- `/blog/google-health-api-for-self-hosters/`: 63 characters. `Base.astro` drops the " | Pulse" suffix when the result exceeds 60, but the bare title is itself 63. Shorten the frontmatter title. All other titles are 40 to 60 characters, and the 404 page title is 22 characters. No duplicate titles.

### L3. 404 page canonical and og:url point to a non-existent URL
- `dist/404.html` has `canonical=https://pulse.portlabs.in/404/` and `og:url` the same. The page is `noindex, follow` and the file header is `X-Robots-Tag: noindex`, so there is no indexing impact. The unknown-path test (`/nope/`) returns real HTTP 404 on the preview, and wrangler uses `not_found_handling: "404-page"`. Fix: in `Base.astro`, skip the canonical and og:url when `noindex` is true. `noindex, follow` on a 404 is fine.

### L4. robots.txt has no explicit AI crawler policy
- Content is `User-agent: *`, `Allow: /`, and `Sitemap: https://pulse.portlabs.in/sitemap.xml`. The sitemap URL is correct and absolute. All crawlers, including GPTBot, ClaudeBot, PerplexityBot, Google-Extended and Applebot-Extended, are allowed by default. That matches the stated intent (`Everything is public and meant to be found`). Optional: add named groups so the policy is explicit and a later change cannot silently apply. Also add `charset=utf-8` to the Content-Type.

### L5. llms-full.txt: add, but low priority
- Currently 404. Google has said it does not use llms.txt, and no major search engine reads llms-full.txt for ranking, so it has no SEO value. It does help coding and chat agents that fetch one file. It is cheap here because `src/lib/markdown.ts` already generates the content.
- If added, make `src/pages/llms-full.txt.ts` that concatenates `overviewMarkdown`, all `metricMarkdown`, all `comparisonMarkdown` and `glossaryMarkdown` (about 29 documents), plus the post bodies once H1 exists. Serve as `text/plain; charset=utf-8` with `X-Robots-Tag: noindex, follow` (add to `_headers`), do not add it to the sitemap, and link it from llms.txt. Skip it if the size is large; llms.txt with `.md` links covers the same need.

### L6. Thinly linked blog posts
- No page has zero inbound internal links. But posts are linked only from the `/blog/` index and related-post links, and the home page links to `/blog/` once. Three posts have exactly one inbound link (the blog index only): `/blog/whoop-sleep-need-explained/`, `/blog/fitbit-resilience-stress-score/`, `/blog/garmin-sleep-score-explained/`. Seven more have two: fitbit-vo2-max-accuracy, amazfit-pai-explained, garmin-stress-level-always-high, garmin-vo2-max-accuracy, garmin-load-ratio-acute-load, amazfit-biocharge-vs-garmin-body-battery, whoop-strain-explained. Fix: add related-post links or links from the matching `/metrics/<slug>/` pages.

### L7. og:image is the same file with the same alt text everywhere
- Every page, including each post, uses `/og.png` (1200x630) and the alt `Pulse: recovery, sleep and strain dials...`. Valid, but no per-page differentiation. Optional.

## What passed (no action)

| Check | Result |
|---|---|
| Sitemap: 77 URLs, each HTML page once | pass, none missing, none extra |
| Sitemap: non-canonical, noindex or 404 URLs | none |
| Sitemap lastmod format | ISO dates, all between 2026-06-01 and 2026-10-09, none in the future |
| Exactly one H1 | 78 of 78 |
| Canonical present, absolute, trailing slash, self-referencing | 77 of 77 indexable |
| og:url equals canonical | 78 of 78 |
| og:image, twitter:card summary_large_image, twitter:image | 78 of 78 |
| robots meta | `index, follow, max-image-preview:large` on all 77, `noindex, follow` on the 404 |
| Duplicate titles or descriptions | none |
| Internal hrefs | all return 200, no redirects, none missing a trailing slash, no orphans |
| llms.txt link targets | all 76 resolve (29 `.md` files exist) |
| `<link rel="alternate" type="text/markdown">` | present on all 29 pages that have an `index.md` |
| trailingSlash | consistent (`always`) |

Not checked: external links, live response headers on the production host, Core Web Vitals.
