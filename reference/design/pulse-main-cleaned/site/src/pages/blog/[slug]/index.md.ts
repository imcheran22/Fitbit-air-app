import type { APIRoute } from "astro"
import { getPosts } from "../../../lib/posts"
import { markdownResponse, postMarkdown } from "../../../lib/markdown"

export async function getStaticPaths() {
  return (await getPosts()).map((post) => ({ params: { slug: post.id }, props: { post } }))
}

export const GET: APIRoute = ({ props: { post }, site }) => markdownResponse(postMarkdown(post, site!), `/blog/${post.id}/`, site!)
