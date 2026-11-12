import { getCollection } from "astro:content"

// Released posts, newest first. The dev server shows scheduled ones too, for review.
export async function getPosts() {
  const today = new Date().toISOString().slice(0, 10)
  const posts = await getCollection("blog", (p) => import.meta.env.DEV || p.data.published <= today)
  return posts.sort((a, b) => b.data.published.localeCompare(a.data.published))
}

export const postPath = (id: string) => `/blog/${id}/`

type Dated = { data: { published: string; updated?: string; checked?: string } }
// The latest of published, updated and checked: re-checking the facts is a modification readers can see on the page.
export const postModified = (p: Dated) => [p.data.published, p.data.updated, p.data.checked].filter(Boolean).sort().at(-1)!
