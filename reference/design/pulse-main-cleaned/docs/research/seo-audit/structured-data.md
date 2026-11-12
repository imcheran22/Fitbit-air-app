# Structured data audit

Audited 2026-10-09 against the built HTML in `site/dist` (77 pages, canonical host https://pulse.portlabs.in) and the sources `site/src/lib/schema.ts`, `site/src/layouts/Base.astro`, `site/src/layouts/Legal.astro` and the page templates. A script parsed every page's JSON-LD and checked JSON validity, @id resolution, dates against blog frontmatter, breadcrumb targets and item counts.

## Summary

- Every page has exactly one `<script type="application/ld+json">` block with valid JSON, `@context` `https://schema.org`, absolute https URLs, and ISO 8601 dates. Breadcrumb last items match each page's canonical URL. `numberOfItems` matches the list on all 3 hubs. Headlines are 37-63 characters (all under 110).
- Blog dates match frontmatter on all 43 posts: `datePublished` = `published`; `dateModified` = `updated` or, if absent, `published`. No future-dated posts are in the build.
- Organization and WebSite are byte-identical on all pages. SoftwareApplication appears only on the landing page. Its description and `softwareRequirements` already use the "Google Health data" wording.
- One real defect: 70 article pages point `about` at `/#app`, which exists only in the landing page's graph, so the reference does not resolve on those pages.
- The main quality gaps are dates on metric and compare pages, the author representation, and the single shared image.

## Critical

None. Nothing blocks eligibility for a rich result that Google still offers for this content.

## High

### H1. `about: {"@id": ".../#app"}` does not resolve on 70 pages
- Affected: all 43 blog posts, 10 compare pages, 17 metric pages (every Article/TechArticle). Only `/` defines `#app`.
- Evidence: the validator reported `unresolved https://pulse.portlabs.in/#app` on each. Parsers that read a single page see a dangling reference, so `about` is empty.
- Fix: `site/src/lib/schema.ts`, `article()`. Either (a) drop `about` from `article()`, or (b) make `siteGraph()` include the SoftwareApplication (move `softwareApp()` into `siteGraph()` with the landing description), so `#app` is in every graph. Option (b) also makes Organization, WebSite and SoftwareApplication consistently described everywhere. Option (a) is the smaller change; `about` for an article about WHOOP or Garmin scores is arguably wrong anyway, since the article is not about Pulse. Prefer (a), or set `about` per page to a real topic (`{"@type":"Thing","name":"Heart rate variability"}`).

### H2. Author is an Organization named "Pulse contributors", linked to the GitHub repo
- Affected: all 70 articles. `schema.ts` `article()`: `author: { "@type": "Organization", name: "Pulse contributors", url: REPO }`. `Base.astro` also sets `<meta name="author" content="Pulse contributors">`.
- Evidence and assessment: Google accepts Person or Organization as author, and `name` plus `url` are present, so this validates. But it is weak for E-E-A-T. The footer says Pulse is made by one independent developer, so "contributors" does not match the site's own statement. The URL is a repo, not a page about the author. The articles make health and device claims (HRV, sleep, readiness) and have no named human, no credentials or about page. The author is also a different node from the publisher Organization (`#org`, name "Pulse"), so the same entity appears under two names.
- Fix: add a `Person` node (name as the developer wants it public, `url` to an About page on the site or the GitHub profile `https://github.com/adityaongit`, `sameAs` the GitHub profile) in `siteGraph()` with `@id` `/#author`, and have `article()` use `author: {"@id": ".../#author"}`. Add a short about/author page so the `url` points to an on-site page. If the developer wants to stay anonymous, at least change the author to `{"@id": "/#org"}` so there is one entity, and change `meta author` to match. Do not invent credentials.

### H3. Metric and compare pages carry conflicting or unsupported dates
- Affected: 17 metric pages, 10 compare pages.
- Evidence: Metric TechArticles have `dateModified` 2026-10-03 (from `CONTENT_UPDATED` in `site/src/config.ts`) and no `datePublished`. Compare Articles have no `datePublished`, and `dateModified` is 2026-10-09 on 8 pages and 2026-10-03 on 2 (`CHECKED` vs `NOW` in `src/data/compare.ts`). The legal pages use 2026-10-06 (privacy) and 2026-10-03 (terms). Blog posts changed on 2026-10-09 say so; metric pages say 2026-10-03.
- Google lists `datePublished` and `dateModified` as recommended. `dateModified` should reflect a real content change, not a fact re-check.
- Fix: add a `published` field to `Metric` and `Comparison` data (or one constant per set, e.g. `CONTENT_PUBLISHED`) and pass it as `published:` in `metrics/[slug].astro` and `compare/[slug].astro`. Use per-page `dateModified` where one exists; otherwise bump `CONTENT_UPDATED` when metric content changes. Decide that `checked` means "facts re-verified" and either keep it out of `dateModified` or document that it counts. Also make `published` required in the `article()` signature (it is optional today, which is how the omission happened).

## Medium

### M1. Every page uses `/og.png` as the Article image
- Affected: all 70 articles (`schema.ts` `image: abs("/og.png")`); `Base.astro` also uses it for og:image on every page.
- Evidence: the file is 1200x630 (about 1.91:1). It is a valid, crawlable image of adequate size, so the property is not an error. Google recommends images in 16x9, 4x3 and 1x1 and prefers one image per article that represents it. A single brand image across 70 articles gives no per-article signal and can lead to identical thumbnails. The blog posts have hand-drawn sketches, so a real per-post image is available in principle.
- Fix: `article()` accept an optional `image` (array). Provide three crops (16x9, 4x3, 1x1) of the brand image as the default, and for posts generate a per-post OG image at build (title text on the brand background) and pass it from `blog/[slug].astro`. Low-cost minimum: add 16x9 and 1x1 variants of the default and emit `image: [1x1, 4x3, 16x9]`.

### M2. Organization has no `logo`, and the site has no Person/About entity
- Affected: every page (`siteGraph()`).
- Evidence: Organization has only name, url, sameAs. Google's Organization guidance recommends `logo` (at least 112x112, crawlable) for the knowledge panel and publisher display. `favicon.svg` exists but is SVG; use a PNG.
- Fix: add `logo: { "@type":"ImageObject", url: abs("/logo.png"), width, height }` and a PNG in `public/`. Add `description` too. `sameAs` could include other real profiles only if they exist.

### M3. SoftwareApplication is not eligible for the software-app rich result and lacks useful properties
- Affected: `/` only.
- Evidence: Google's software app feature needs `offers.price` plus `aggregateRating` or `review`. The site has neither and should not fake one, so there is no rich result. That is the honest state. Fields that are accurate and absent: `softwareVersion`, `downloadUrl` or `installUrl` (the setup guide), `codeRepository`-style linking via a separate `SoftwareSourceCode`, `featureList`, `datePublished`, `inLanguage`. `screenshot` is the OG card, which is acceptable but not an app screenshot. `softwareRequirements` correctly says Google Health and Fitbit Air.
- Fix: `softwareApp()` in `schema.ts`: add `downloadUrl: SETUP_GUIDE`, `featureList` (the four scores), `softwareVersion` only if it can be kept current. Do not add `aggregateRating`/`review`.

### M4. Blog `dateModified` ignores the `checked` field
- Affected: 28 posts whose `checked` (2026-10-09) is newer than `dateModified` (their publish date, `updated` absent).
- Evidence: frontmatter has `checked` on 42 posts, `updated` on 13 (all 2026-10-09). Posts that were re-verified against sources but not edited show an old `dateModified`. This is legitimate under Google's guidance (date of significant change). Only a problem if re-checks also edited text.
- Fix: none required. If a re-check changed wording, set `updated` in that post's frontmatter. Do not map `checked` to `dateModified` automatically.

## Low

### L1. FAQPage still emitted (Info)
- Affected: `/` (9 questions), 8 compare pages (2-3 each), 3 metric pages. Google retired FAQ rich results on 2026-05-07, so there is no SERP benefit; any AI/GEO benefit is unconfirmed. Valid markup (Question, acceptedAnswer.text with HTML stripped). The plan decided to keep it. No change. These are site-authored Q&A, so FAQPage is the correct type; QAPage is only for user-submitted answers.

### L2. Hub and glossary graphs are thin
- `/glossary/`: `DefinedTermSet` with 27 `DefinedTerm`s, `@id` equal to the page URL (no fragment), no `isPartOf` and no WebPage/CollectionPage node. Valid, and DefinedTermSet has no Google rich result. Fix: `glossary.astro`, use `@id: url + "#termset"` and add `isPartOf: {"@id": ".../#website"}`.
- `/blog/`, `/compare/`, `/metrics/`: `CollectionPage` with an `ItemList` of 43, 10 and 17 `ListItem`s (name and url, correct counts). Valid. The ItemList carousel rich result needs a Google-recognised parent type, so none is expected. No change.
- `/` has no WebPage node and no BreadcrumbList (correct for a home page).

### L3. Article `url` property and `mainEntityOfPage` are both set
- Identical values on all pages, valid. `Legal.astro` WebPage nodes use the page URL as `@id`. Cosmetic. Optionally give `article()` an `@id` (`path#article`) so other nodes can reference it.

### L4. Minor consistency notes
- `description` on articles is 143-176 characters and is copied from meta description. Fine.
- `SoftwareApplication.operatingSystem` "Linux, macOS, Windows (Docker)" is free text. Valid. Accurate for a Docker app.
- `Article` type is used for blog and compare, `TechArticle` for metrics. All valid.
- Privacy and terms: `WebPage` plus breadcrumbs, valid. Dates (2026-10-06, 2026-10-03) are from the effective date and equal published and modified, which is fine.

## Honest opportunities (none require fake data)

- `SoftwareSourceCode` for the repo (codeRepository, programmingLanguage, license) on `/`. Only if relevant.
- `Person` author plus an About page (see H2). This is the highest-value addition for E-E-A-T.
- `WebPage`/`AboutPage` node on `/` linking `mainEntity` to `#app`, and `isPartOf` `#website`.
- Do not add Review, AggregateRating, HowTo, or new FAQPage markup.
