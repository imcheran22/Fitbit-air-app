// Renders the site-wide Open Graph card (1200 x 630) to public/og.png. Run once after a brand or copy change:
//   pnpm og   (needs the repo root's `pnpm install`, for Playwright)
// The output is committed, so builds never need a browser.
import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { GLYPHS, STROKE } from "../src/lib/wordmark.ts"

const require = createRequire(new URL("../../package.json", import.meta.url))
const { chromium } = require("@playwright/test")

const file = (p) => new URL(p, import.meta.url)
const b64 = (p) => readFileSync(file(p)).toString("base64")
const font = b64("../node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2")
const phone = b64("../../docs/screenshots/phone-home.png")
const wm = GLYPHS.bold

const html = `<!doctype html><html><head><style>
@font-face { font-family: Figtree; src: url(data:font/woff2;base64,${font}) format("woff2"); font-weight: 300 900; }
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; overflow: hidden; font-family: Figtree; color: #fff; -webkit-font-smoothing: antialiased;
  background: radial-gradient(70% 90% at 85% 10%, #173330 0%, transparent 60%), linear-gradient(180deg, #262e33 0, #1b2024 300px, #0f1113 630px); }
.copy { position: absolute; left: 72px; top: 72px; width: 640px; }
.brand { display: flex; align-items: center; gap: 14px; }
.brand svg.wm { height: 28px; width: auto; }
h1 { margin-top: 56px; font-size: 64px; line-height: 1.02; font-weight: 650; letter-spacing: -0.04em; }
p { margin-top: 28px; font-size: 26px; color: #babac0; }
img { position: absolute; right: 56px; top: 36px; width: 360px; }
.beat { position: absolute; left: 0; top: 430px; width: 1200px; height: 120px; }
</style></head><body>
<svg class="beat" viewBox="0 0 1200 120" preserveAspectRatio="none"><path d="M0 70H690L714 18L738 82L750 70H1200" fill="none" stroke="#00f19f" stroke-opacity=".45" stroke-width="2"/></svg>
<img src="data:image/png;base64,${phone}">
<div class="copy">
  <div class="brand">
    <svg viewBox="4.5 4.5 15 15" width="34" height="34"><rect x="6.9" y="4.5" width="4.2" height="11" rx="2.1" fill="#00f19f"/><rect x="12.9" y="8.5" width="4.2" height="11" rx="2.1" fill="#1fa0f0"/></svg>
    <svg class="wm" viewBox="${wm.viewBox}"><path d="${wm.d}" fill="none" stroke="#fff" stroke-width="${STROKE.bold}" stroke-miterlimit="8"/></svg>
  </div>
  <h1>Recovery, strain and sleep scores from your Google Health data</h1>
  <p>Open source and self-hosted.</p>
</div>
</body></html>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.setContent(html)
await page.screenshot({ path: fileURLToPath(file("../public/og.png")) })
await browser.close()
console.log("wrote public/og.png")
