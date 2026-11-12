import { defineConfig } from "astro/config"
import { satteri } from "@astrojs/markdown-satteri"
import { sketchPlugin } from "./src/lib/sketch.mjs"

// The public URL the site is served from: canonical links, the sitemap and OG tags use it. SITE_URL in the build
// environment overrides it (a preview deployment, a fork). Not the app's hostname: the app is private, one owner each.
const SITE_URL = process.env.SITE_URL ?? "https://pulse.portlabs.in"

export default defineConfig({
  site: SITE_URL,
  trailingSlash: "always",
  // Blog posts draw ```sketch blocks as hand-drawn SVG figures at build time.
  markdown: { processor: satteri({ mdastPlugins: [sketchPlugin] }) },
  // The scoring explainers are read from the app (src/), one level up.
  vite: { server: { fs: { allow: [".."] } } },
})
