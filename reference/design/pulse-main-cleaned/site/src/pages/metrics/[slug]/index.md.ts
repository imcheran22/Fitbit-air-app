import type { APIRoute } from "astro"
import { METRICS, metricPath } from "../../../data/metrics"
import { markdownResponse, metricMarkdown } from "../../../lib/markdown"

export function getStaticPaths() {
  return METRICS.map(metric => ({ params: { slug: metric.slug }, props: { metric } }))
}

export const GET: APIRoute = ({ props: { metric }, site }) => markdownResponse(metricMarkdown(metric, site!), metricPath(metric), site!)
