import type { APIRoute } from "astro"
import { COMPARISONS } from "../../../data/compare"
import { markdownResponse, comparisonMarkdown } from "../../../lib/markdown"

export function getStaticPaths() {
  return COMPARISONS.map(metric => ({ params: { slug: metric.slug }, props: { metric } }))
}

export const GET: APIRoute = ({ props: { metric }, site }) => markdownResponse(comparisonMarkdown(metric, site!), `/compare/${metric.slug}/`, site!)
