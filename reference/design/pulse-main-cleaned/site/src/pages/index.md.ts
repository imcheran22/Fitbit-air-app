import type { APIRoute } from "astro"
import { markdownResponse, overviewMarkdown } from "../lib/markdown"

export const GET: APIRoute = ({ site }) => markdownResponse(overviewMarkdown(site!), "/", site!)
