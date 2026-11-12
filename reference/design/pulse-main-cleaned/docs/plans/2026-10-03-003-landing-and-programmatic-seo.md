# Plan: public landing page and programmatic SEO pages

Date: 2026-10-03. Research: [docs/research/landing-and-seo.md](../research/landing-and-seo.md). Code: `site/`.

The app is private: every route is behind sign-in, and one owner runs one instance. So the marketing site is a separate, fully static site in `site/`. It never ships in the app's Docker image, and it never touches the app's build, typecheck or lint.

## Goals

- Fitbit Air owners who search for recovery, strain, subscriptions or subscription-free alternatives find a page that answers their question first, then shows Pulse.
- Every score has a deep, honest page: inputs, weights, bands, limits and sources. "Pulse Age is an estimate" is said plainly, with the papers cited.
- One static build, fast on a phone. Script only where motion needs it (one small observer on the landing page); every page reads complete without it.
- Adding a metric or a comparison adds a page, a sitemap entry and the internal links, with no template work.

## Non-goals

- A hosted demo. The app needs a Google OAuth client per owner, and Google caps unverified apps at 100 users. The site points to demo mode on your own laptop instead.
- Hundreds of thin pages. Google's scaled-content policy penalises pages made for query variants. The site has about 30 deep pages.

## Stack: Astro, static output

| Option | Client JS | Fit |
|---|---|---|
| **Astro 7 (chosen)** | None by default | Built for content sites. `getStaticPaths` generates the programmatic pages. The app's screens are inlined as static HTML (see App screens below). Scoped CSS and plain `.astro` components, so no React runtime ships. |
| Next.js static export | The React runtime and hydration on every page (about 100 KB) | Matches the app's stack, but pays for interactivity this site does not need. It would also share the app's Next config and tooling, which is what we want to keep apart. |
| A hand-written Node script | None | No dependencies, but we would re-implement routing, HTML escaping and the image pipeline. |

Astro is clearly better here: the same component model as a framework, and the output of a hand-written script. The first measured result on the landing page: 0 bytes of JavaScript, 84 KB transferred on a phone, LCP about 250 ms locally, CLS 0. The motion pass (below) adds one small bundled script and keeps CLS under 0.01.

`site/` is its own pnpm workspace root (`site/pnpm-workspace.yaml`) with its own lockfile. The app's tooling skips it:

| App tooling | How `site/` is kept out |
|---|---|
| Docker image | `site` in `.dockerignore` |
| TypeScript | `site` in `tsconfig.json` `exclude` |
| ESLint | `site/**` in `globalIgnores` |
| Tailwind class scan | `@source not "../../site"` in `src/app/globals.css` |
| Vitest, Playwright | Their `include` and `testDir` already cover only `src/` and `e2e/` |

## Site structure

```mermaid
flowchart TD
  H["/ (landing)"] --> M["/metrics/ (hub)"]
  H --> C["/compare/ (hub)"]
  H --> G["/glossary/"]
  M --> MP["/metrics/&lt;slug&gt;/<br/>18 pages, one per score or input"]
  C --> CP["/compare/&lt;slug&gt;/<br/>4 pages"]
  G -.->|"How Pulse uses it"| MP
  MP -.->|Related| MP
  CP -.->|metric links in the copy| MP
  H -.->|metric index, FAQ| MP
  H -.->|footer, credits| CP
```

| Page | Template | Source of truth |
|---|---|---|
| `/` | `src/pages/index.astro` | Hand-written copy; the metric index comes from `METRICS` |
| `/metrics/` | `src/pages/metrics/index.astro` | `METRICS` |
| `/metrics/<slug>/` | `src/pages/metrics/[slug].astro` | `SCORE_DOCS` in `src/app/(app)/more/how-it-works/content.ts` (the app's own explainer), merged with `site/src/data/metrics.ts` |
| `/compare/`, `/compare/<slug>/` | `src/pages/compare/` | `site/src/data/compare.ts` |
| `/glossary/` | `src/pages/glossary.astro` | `site/src/data/glossary.ts` |
| `/sitemap.xml`, `/robots.txt` | `src/pages/*.ts` endpoints | The same data, so they never drift from the routes |

### How a metric page is built

```mermaid
flowchart LR
  A["content.ts (app)<br/>name, summary, sections"] --> MERGE[merge in metrics.ts]
  B["metrics.ts (site)<br/>slug, SEO title, description,<br/>band scale, app screen,<br/>sources, related, FAQ"] --> MERGE
  X["EXTRA_DOCS (site)<br/>HRV, resting heart rate"] --> MERGE
  MERGE --> P["/metrics/&lt;slug&gt;/"]
  MERGE --> S[sitemap.xml]
  MERGE --> L["hub, landing index,<br/>footer, related links"]
```

The app's `content.ts` already holds every number from the code ("when the code changes, change this file"). The site imports it rather than copying it, so the site and the app's More › How Pulse works can never disagree. The site adds only what search needs. A new entry in `SCORE_DOCS` gets a page with default title and description even before anyone adds metadata. HRV and resting heart rate are inputs rather than scores, so their text lives in `EXTRA_DOCS` in the same shape.

Each metric page has:

1. H1 (the score's name) and the one-line summary.
2. The band scale, drawn from the band data in the app's colours, where the score has bands.
3. The app's own screen (demo data) in a device frame, never a third-party image.
4. What goes in, how it is weighted, what the bands mean, and the limits, in the app's own words.
5. Sources: a link to the full spec in `docs/algorithms/` where one exists, then the papers with DOIs. Pulse's own models with no validation (Recovery forecast, Energy Bank) say so.
6. FAQ where we have real questions, related metrics, and the call to action.

## Keyword clusters and the pages that own them

From the research (autocomplete and ranking pages; there are no volume numbers).

| Cluster | Example queries | Page |
|---|---|---|
| Fitbit Air recovery and strain | fitbit air recovery score, does fitbit air track strain | `/compare/fitbit-air-recovery-and-strain/`, `/metrics/recovery/`, `/metrics/strain/` |
| Fitbit Air subscription | fitbit air without subscription, premium vs free | `/compare/google-health-premium/`, `/compare/recovery-tracking-without-subscription/` |
| Explaining the scores | how is recovery calculated, strain score meaning, biological age calculator | `/metrics/recovery/`, `/metrics/strain/`, `/metrics/pulse-age/` |
| Health terms | what is a good hrv, sleep regularity index, vo2 max percentile, acwr | `/metrics/hrv/`, `/metrics/sleep-consistency/`, `/metrics/fitness-level/`, `/metrics/training-balance/`, `/glossary/` |
| Alternatives and open source | recovery tracker no subscription, open source recovery app, self hosted fitness tracker | `/compare/recovery-tracking-without-subscription/`, `/compare/pulse-vs-subscription-wearables/`, `/` |

Rules for titles and copy:

- Titles stay under about 60 characters, and descriptions under about 155.
- Comparison pages open with a direct answer in under 60 words.
- Headlines say "recovery, strain and sleep scores for your Fitbit Air". Comparison pages describe subscription recovery wearables in general and name no competitor. The only place another wearable brand is named is the project notice (see Risks).

## Internal linking

- Every page links to the metrics hub, the compare hub, the glossary and the setup guide through the header and footer. The footer lists every metric and comparison, generated from data.
- A metric page links to 3-5 related metrics (`related` in `metrics.ts`).
- Glossary terms link to the metric that uses them.
- Comparison pages link the scores they mention, and list the other comparisons.
- Calls to action use the same two labels everywhere: "Self-host Pulse" (the setup guide) and "View source" (the repository).

## Structured data

All JSON-LD is built in `site/src/lib/schema.ts` and rendered by `Base.astro` as one `@graph` per page.

| Page | Types |
|---|---|
| Landing | `SoftwareApplication` (free offer, license, repository; **no rating**, since none exists), `FAQPage` |
| Metric | `TechArticle`, `BreadcrumbList`, `FAQPage` when the page has questions |
| Compare | `Article` (`dateModified` = the date the facts were checked), `BreadcrumbList`, `FAQPage` when present |
| Glossary | `DefinedTermSet` with a `DefinedTerm` per entry, `BreadcrumbList` |
| Metrics hub | `ItemList`, `BreadcrumbList` |

Google retired FAQ rich results on 2026-05-07, and the SoftwareApplication rich result needs a rating. We keep both types because they describe the page accurately and other engines read them, but we expect no rich result from them. Breadcrumbs still produce one.

## Sitemap, robots, canonical, social cards

- `sitemap.xml` lists every page with `lastmod`: `CONTENT_UPDATED` in `src/config.ts` for our pages, `checked` for comparisons.
- `robots.txt` allows everything, AI search crawlers included, and points to the sitemap. No `llms.txt`: Google says it does not use it.
- Canonical URLs, `og:url` and the sitemap all come from `SITE_URL`, read in `site/astro.config.mjs`. It defaults to `https://pulse.portlabs.in` and a `SITE_URL` build variable overrides it (for a fork or a preview). It must not be the app's own hostname, because the app is private.
- `trailingSlash: "always"`, so each page has one URL.
- One OG card (`site/public/og.png`, 1200 × 630), rendered from the brand and the phone home screenshot by `pnpm og` and committed. Per-page cards (for example, the metric name over its band scale) are deferred until the pages have traffic worth optimising.

## Design

- Pulse's own dark world, not a new one: the app's tokens (`--background` #0f1113 under the #262e33 top gradient, Figtree, Barlow numerals), the wordmark and mark from `docs/design/brand.md`, and the app's data colours used only where they carry meaning (band scales, the metric index strips).
- App screens are live markup, not pictures of it (see App screens below), in phone and laptop frames drawn in CSS.
- The ground has depth without a new colour: the app's slate top light, a teal and a blue glow under the top of every page (the mark's two colours, at 7 and 10 percent), a vignette and a fine SVG grain fixed to the window, and per-section washes (blue under the devices, each dial's own colour under the dial row, a darker see-through band behind the phone strip and the footer). Every layer stays within a few percent, so body text keeps its contrast (secondary text #babac0 is above 9:1 on the lightest glow).
- Icons are lucide (`lucide-static`, the app's own set and version), inlined at build time by `Icon.astro`, 1.75 stroke beside regular text and 2 beside semibold. GitHub links carry GitHub's own mark (`GitHubMark.astro`), unaltered and in one colour. Icons mark the story steps, the data-flow nodes, the privacy points, the code panels, the FAQ toggles and the footer's project links; never a grid of icon cards.
- No eyebrows, no icon-card grids. The landing page sections, each a different layout: a split hero (laptop with the phone over its corner), the three morning dials, a phone strip, a sticky laptop that changes screen as its four steps scroll past, the metric grid, a connected five-step flow, a privacy panel, two code panels, About this project beside the credits, and the FAQ beside its heading. No column is left empty beside a short heading.
- Motion, all of it off under `prefers-reduced-motion`:

  | Moment | How |
  |---|---|
  | Devices rise into place on load | `@starting-style` transition on `translate` (no opacity, so LCP is not delayed) |
  | Heartbeat line draws, then a pulse travels along it while the hero is on screen | SVG dash animation; an IntersectionObserver adds `live` so the loop stops off screen |
  | Phone leaves faster than the laptop as the hero scrolls away | `animation-timeline: scroll(root)` |
  | Dials draw in and their numbers count up | Observer adds `in`; a conic `mask-image` over the app's arc opens with a registered `--sweep` angle, and a short `requestAnimationFrame` count. Without script the final values show |
  | Phone strip drifts at two speeds | `animation-timeline: view()` |
  | Laptop screen changes with the step in the middle of the viewport | Observer sets `data-active`; cross-fade with a short blur |
  | Data path line draws across the five steps | `animation-timeline: view()` |
  | FAQ answers slide open | `::details-content` with `interpolate-size` |
  | Page to page | `@view-transition { navigation: auto }` |

  Scroll-driven parts sit in `@supports (animation-timeline: scroll())`, so other browsers show the still layout.
- Accessibility: a skip link, visible focus rings, 44 px targets in the nav, real headings, `aria-current` in the nav. Each app screen is one `role="img"` with a description; its markup is `inert` (no focus, no find-in-page hits) and its headings and landmarks are plain boxes, so the page keeps one outline.

## App screens

The site shows the app itself: every phone, laptop and dial is the app's rendered markup, so it stays sharp at any size and pixel density and matches the app exactly. The first idea was to render the kit components (ScoreDial, KeyStatRow, the charts) in Astro with `@astrojs/react` and the demo fixtures. It does not work: Recharts 3 draws nothing on the server (each chart registers its parts in effects and measures its box), so every dial and chart came out as an empty wrapper, and a DOM emulator cannot lay them out either. The browser is the one renderer that draws them as the app does, so the screens are captured from it.

```mermaid
flowchart LR
  APP["App in demo mode<br/>pnpm dev -p 3317"] --> CAP["pnpm screens<br/>site/scripts/screens.mjs<br/>(Playwright)"]
  CAP --> HTML["src/kit/screens/*.html<br/>one inert fragment per screen"]
  CAP --> CSS["src/kit/kit.css<br/>the app's CSS rules those screens use"]
  HTML --> DEV["Device.astro<br/>CSS phone or laptop frame,<br/>scaled to fit"]
  CSS --> DEV
  DEV --> PAGES["Landing and metric pages"]
```

- **Capture.** `pnpm screens` opens each screen exactly like `pnpm shots` (same list, sizes and clean phone cut, shared in `site/scripts/app.mjs`) and keeps the DOM: scripts, links, handlers and accessibility hooks go; classes for states a picture never enters (hover, focus, disabled) and classes with no rule that applies at that size go; ids are made unique per screen; the Pulse Age orb's canvas becomes its still frame. The three dials (`dial-*`) are the large dials lifted from the Sleep, Recovery and Strain screens.
- **CSS.** The app's compiled CSS, cut to the rules that match the captured screens, inside `@layer kit` (the site's own rules sit in `@layer site` below it). `:root` and `html` become `.kit`, `body` becomes `.kit-body`, every other rule is scoped under `.kit`. Viewport breakpoints become container queries on the screen (`@container kit`), and viewport units become screen units, so a 390 px screen keeps its phone layout on a wide monitor.
- **Frames.** `Device.astro` lays the screen out at its captured width and scales it with `scale: tan(atan2(100cqw, var(--w)))` (the frame's width over the screen's, as a number). Every frame length is in `cqw`, so the bezel keeps its proportions; the phone's corners are concentric. Off-screen frames use `content-visibility: auto`.
- **Weight.** No JavaScript: the landing page ships about 1 KB of inline script (the observers), as before. The screens add HTML: the landing page is about 580 KB raw, 106 KB gzipped, plus 15 KB of gzipped screen CSS, roughly what the lazy screenshots used to cost, with nothing left to load after the page.
- **Committed, like the screenshots.** The fragments and `kit.css` are committed, so a build needs neither the app nor a browser. Rerun `pnpm screens` after a UI change, as with `pnpm shots`. The README and `docs/screenshots.md` keep the PNG screenshots, and `public/og.png` is still rendered from one.

## Hosting

| Host | Fit | Notes |
|---|---|---|
| **Cloudflare Pages (chosen)** | The owner's domains are already on Cloudflare: DNS, TLS and caching in one place, and free for static sites | See Deploy below. |
| Vercel | Easy, good previews | Root directory `site`. The domain would need DNS records pointing out of Cloudflare. |
| GitHub Pages | Free, next to the code | Needs a deploy workflow and a CNAME. No build-time environment UI, and fewer caching controls. |

Cloudflare Pages deploys on pushes to `main` that touch `site/` or `src/app/(app)/more/how-it-works/content.ts`. That last path matters: metric pages are built from the app's explainer.

```mermaid
flowchart LR
  PR[PR merged to main] --> CF[Cloudflare build<br/>cd site, pnpm build]
  CF --> D[site/dist<br/>static files]
  D --> E[Cloudflare edge<br/>custom domain]
  E --> V[Visitors]
  V -.->|"page views, no cookies"| U[Self-hosted Umami]
```

## Deploy: Cloudflare (Workers static assets)

Live since 2026-10-03 at https://pulse.portlabs.in. Cloudflare Pages is now part of Workers, so the site deploys as a Worker with static assets only (`site/wrangler.jsonc`: no script, `not_found_handling: 404-page`, custom domain `pulse.portlabs.in`). Nothing runs per request; `public/_headers` sets caching.

```sh
cd site
pnpm install --frozen-lockfile
pnpm build
pnpm dlx wrangler@4 deploy   # needs `wrangler login` once
```

Do not let wrangler "autoconfigure" the project: it adds the Astro Cloudflare adapter, KV and Images bindings, which a static site does not need. A custom domain fails while another DNS record holds the hostname (code 100117); delete that record first.

## Analytics

Umami, self-hosted by the owner. It is cookieless, so no consent banner is needed. `Base.astro` renders the script tag only when both build-time variables are set, so forks and local builds send nothing:

| Variable | Value |
|---|---|
| `PUBLIC_UMAMI_SRC` | The Umami script URL, `https://<umami-host>/script.js` |
| `PUBLIC_UMAMI_WEBSITE_ID` | The website ID from Umami's settings |

Worth watching: landing page → setup guide clicks (outbound links), which metric pages get search entries, and GitHub clicks.

## Risks

- **Trade dress and trademarks.** The app's interface takes design inspiration from apps the developer admires, and the site shows the app. The site mitigates what it can: no competitor names in titles, headings, slugs or comparison pages, no third-party logos or imagery, Pulse's own metric names, and dated, sourced comparisons. The one place a brand is named is the project notice (footer of every page, About this project on the landing page, and the FAQ): a free community project by an independent developer, not affiliated or competing, using no device, data, code or assets of any company, with a contact address and a promise to change or take down anything of concern. The app's design itself is the owner's call.
- **Stale facts.** Prices and features of other products change. Each comparison has a `checked` date that is shown on the page and used as `dateModified`. Re-check on each content update.
- **Drift from the app.** Mitigated by importing `content.ts` rather than copying it. If that file's types change, update `site/src/data/metrics.ts` and the metric template in the same pull request (the Astro build does not typecheck).

## Follow-ups (not built)

- Search Console and Bing Webmaster Tools, with IndexNow, once the domain is live.
- A `/fitbit-air/export-data` guide (Takeout and the Google Health API), a strong query cluster in the research.
- Separate Hælan and fitbit-grafana pages, if the "without a subscription" page shows demand for them.
- Per-page OG cards.
- Read r/FitbitAir and r/FitbitAir_India by hand: our research tools could not reach Reddit.

## Working on the site

```sh
cd site
pnpm install
pnpm dev        # http://localhost:3316
pnpm build      # static output in site/dist
pnpm preview    # serves site/dist on :3316
pnpm og         # re-render public/og.png (needs the repo root's pnpm install, for Playwright)
pnpm shots      # retake docs/screenshots from the app running in demo mode on :3317 (see docs/screenshots.md)
pnpm screens    # recapture the site's live screens (src/kit) from the same demo app
```

- **New metric:** add it to `SCORE_DOCS` in the app (it shows in the app too). Optionally add metadata in `site/src/data/metrics.ts`.
- **New comparison:** add an entry to `COMPARISONS`.
- **New glossary term:** add it to `GLOSSARY`.
