import type { APIRoute } from "astro"
import { glossaryMarkdown, markdownResponse } from "../../lib/markdown"

export const GET: APIRoute = ({ site }) => markdownResponse(glossaryMarkdown(site!), "/glossary/", site!)
