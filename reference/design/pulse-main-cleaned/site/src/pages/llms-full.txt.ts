import type { APIRoute } from "astro"
import { METRICS } from "../data/metrics"
import { COMPARISONS } from "../data/compare"
import { comparisonMarkdown, glossaryMarkdown, metricMarkdown, overviewMarkdown, postMarkdown } from "../lib/markdown"
import { getPosts } from "../lib/posts"

// The whole site as one Markdown file, for agents that prefer a single fetch. Built from the same functions as the
// per-page .md files, so the two never disagree.
export const GET: APIRoute = async ({ site }) => {
  const posts = await getPosts()
  const parts = [
    overviewMarkdown(site!),
    ...METRICS.map((m) => metricMarkdown(m, site!)),
    ...COMPARISONS.map((c) => comparisonMarkdown(c, site!)),
    glossaryMarkdown(site!),
    ...posts.map((p) => postMarkdown(p, site!)),
  ]
  return new Response(parts.join("\n---\n\n"), { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex, follow" } })
}
