import { defineCollection } from "astro:content"
import { glob } from "astro/loaders"
import { z } from "astro/zod"

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

// Blog posts, one Markdown file each in src/content/blog/. The file name is the URL slug.
const blog = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string().max(70),
    description: z.string().max(170),
    /** Release date. A post dated in the future is left out of production builds until a build on or after that day. */
    published: date,
    updated: date.optional(),
    /** The date facts about other products were last checked against their sources. */
    checked: date.optional(),
    tags: z.array(z.string()).min(1),
    keywords: z.array(z.string()).min(1),
  }),
})

export const collections = { blog }
