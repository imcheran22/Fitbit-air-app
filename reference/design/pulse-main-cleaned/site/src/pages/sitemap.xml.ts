import type { APIRoute } from "astro"
import { CONTENT_UPDATED } from "../config"
import { COMPARISONS } from "../data/compare"
import { METRICS, metricPath } from "../data/metrics"
import { getPosts, postModified, postPath } from "../lib/posts"

// Every page, generated from the same data as the routes, so a new metric or comparison is listed automatically.
export const GET: APIRoute = async ({ site }) => {
  const posts = await getPosts()
  const pages: [string, string][] = [
    ["/", CONTENT_UPDATED],
    ["/metrics/", CONTENT_UPDATED],
    ...METRICS.map((m): [string, string] => [metricPath(m), CONTENT_UPDATED]),
    ["/compare/", CONTENT_UPDATED],
    ...COMPARISONS.map((c): [string, string] => [`/compare/${c.slug}/`, c.checked]),
    ["/blog/", posts.map(postModified).sort().at(-1) ?? CONTENT_UPDATED],
    ...posts.map((p): [string, string] => [postPath(p.id), postModified(p)]),
    ["/glossary/", CONTENT_UPDATED],
    ["/privacy/", "2026-10-04"],
    ["/terms/", "2026-10-03"],
  ]
  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    pages.map(([p, d]) => `  <url><loc>${new URL(p, site).href}</loc><lastmod>${d}</lastmod></url>`).join("\n") +
    "\n</urlset>\n"
  return new Response(body, { headers: { "Content-Type": "application/xml" } })
}
