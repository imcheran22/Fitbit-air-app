# Brand guidelines audit (2026-10-04)

The reference app publishes a seven-page brand and design guide for developers who show its data (link in `AGENTS.md`). It covers logos, typography, colour, and do's and don'ts for using its data. Pulse shows no data from that app: its data comes from Google Health. So the logo and attribution rules don't apply. The type, colour and data-display rules are the visual system Pulse is modelled on, so this audit checks Pulse against them.

Status: **Follows**, **Fixed** (changed in this pass), **Open** (needs a decision), **N/A**.

## Typography

| Guideline | Pulse | Status |
|---|---|---|
| Headlines: bold, all caps, 10% letter spacing | Caps labels and titles used 6–8%. Now 0.1em everywhere caps text is bold. | Fixed |
| Body: semibold, sizes B1 (L) to B4 (XS) | Body copy is regular (400) at 13–17 px; semibold is kept for row titles and values. | Deliberate deviation (user, 2026-10-04): semibold explainers read heavy on phones |
| Numbers: DIN Pro bold | Barlow (`font-numeric`), bold on dials and heroes. | Follows, with a stand-in |
| Words: Proxima Nova; fallbacks: platform sans, Helvetica Neue, Helvetica, Arial | Figtree. | Kept (user, 2026-10-04); see below |

**Fonts.** Proxima Nova and DIN Pro are commercial fonts. Pulse is a public, self-hosted repo, so it can't bundle them. Figtree (for Proxima Nova) and Barlow (for DIN Pro) are open-licence stand-ins with the same proportions. If a licensed copy is available, `src/app/layout.tsx` is the one place to swap them (`next/font/local`).

## Colour

| Guideline | Token | Status |
|---|---|---|
| Teal `#00F19F`: calls to action, highlights, positive evaluations, Sleep Need | `--optimal` for positive states and highlights; `--primary` (every primary action) is teal with ink text in both themes | Fixed |
| Strain `#0093E7`: activities and Strain | `--strain` `#0093e7` | Follows |
| Recovery blue `#67AEE6`: recovery data without a valuation | `--recovery-blue` `#67aee6`: single-series vitals charts (HRV, RHR, SpO2…) via `--chart-5`, and low stress | Follows |
| High recovery `#16EC06` (67–100%) | `--recovery-green` was `#19ec06` | Fixed: `#16ec06` |
| Medium `#FFDE00` (34–66%), low `#FF0026` (0–33%) | `--recovery-yellow`, `--recovery-red`; thresholds in `src/lib/bands.ts` (≥ 67, ≥ 34) | Follows |
| Sleep `#7BA1BB` | `--sleep` `#7ba1bb` | Follows |
| Background gradient `#283339` → `#101518` | Ground now ends on `#101518`; the top is `#1d2529`, darker than `#283339` at the user's request (blackish) | Fixed (bottom), deliberate deviation (top) |
| Black and white for branding | Wordmark is white on dark and ink on light | Follows |

**Calls to action.** Primary actions (buttons, sheet pills, the Add button, switches, progress) were white pills. They are now teal with ink text, in both themes (user, 2026-10-04).

## Data display do's and don'ts

| Rule | Pulse | Status |
|---|---|---|
| Don't switch focus from the score to the title | Dials and heroes lead with the number; the title is a small caps label | Follows |
| Don't use different colours for the main scores | Recovery uses the three bands, Strain is strain blue, Sleep is sleep blue, everywhere | Follows |
| Don't rebrand or rename proprietary metrics | Pulse doesn't show the reference app's metrics | N/A |
| Don't use other metrics for "our" scores | Pulse computes its own Recovery, Strain (0–21) and Sleep from Fitbit data under the same names, scale and dial look, so people coming from the reference app feel at home. Each score's info sheet ends with "Pulse scores, computed from your Fitbit data." | Resolved with a note (user, 2026-10-04) |
| Don't place your logo next to the visualized data | The PULSE wordmark sits above the three dials on Home, as in the reference app. The rule is about a partner's logo beside the reference app's data, which Pulse doesn't show. | N/A (flagged) |
| Don't contradict the reference app's coaching | Pulse's coaching is its own | N/A |
| Logo rules (colour, distortion, rotation, exclusion zone, minimum size) and "Data by" attribution | Pulse never shows the reference app's logo | N/A |

**Score names.** The names, scales and dial look stay as they are: familiarity for people coming from the reference app is the point, and nothing about the look is wrong. The info sheets of Recovery, Strain and Sleep say the scores are Pulse's own, computed from Fitbit data, which keeps the screens clean.

## Theme

Pulse now has System, Light and Dark (Settings › Appearance), stored per device. Every colour is a token in `src/app/globals.css`; components never write a colour. The light theme takes the guide's light surfaces (white cards on a cool grey page, `#101518` ink, black pill actions) and deepens the data colours just enough to read on white.

```mermaid
flowchart LR
  A[localStorage pulse-theme] -->|light / dark| C[class on html]
  A -->|system or unset| B{prefers-color-scheme}
  B -->|light| C
  B -->|dark| C
  C --> D[":root tokens (dark) or :root.light"]
  D --> E[components: bg-card, text-foreground, var(--strain) ...]
  C --> F[ThemeColor: meta theme-color = --theme-color]
```

The script in `src/lib/theme.ts` runs before first paint, so a light page never flashes dark. `useTheme` (`src/hooks/use-theme.ts`) follows the system setting and other tabs. The two places that can't read a CSS token, the manifest and the first-paint `theme-color` in `layout.tsx`, copy the token values and say so.
