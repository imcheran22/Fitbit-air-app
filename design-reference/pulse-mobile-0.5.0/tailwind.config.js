/* global __dirname */
const fs = require("node:fs");
const path = require("node:path");

// Pulse's design tokens as a Tailwind theme (pulse src/app/globals.css, "@theme inline"): the same colour names,
// the same radius scale, the same type scale, so a class written for the web (bg-card, text-recovery-red-text,
// rounded-2xl, text-[15px]) means the same thing here.

// Colours: every variable declared in the :root block of global.css becomes a colour of the same name. A variable
// holding "R G B" channels gets rgb(var(--x) / <alpha-value>), so opacity modifiers (bg-foreground/10) work; one that
// holds a whole rgb(... / a) already has its alpha and is used as is. Anything else (a box shadow, the orb's scalars) is
// not a colour and is left out: src/ui/shadow.ts applies the shadows from palette.ts. Reading global.css here means a
// token is added in one place only.
const css = fs.readFileSync(path.join(__dirname, "global.css"), "utf8");
const root = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
const colors = {};
for (const [, name, raw] of root.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
  const value = raw.trim();
  if (value.startsWith("rgb(")) colors[name] = `var(--${name})`;
  else if (/^\d+ \d+ \d+$/.test(value)) colors[name] = `rgb(var(--${name}) / <alpha-value>)`;
}
// A disabled control's opacity, as the class opacity-disabled (written out: an opacity utility cannot read a variable here).
const disabledOpacity = /--disabled-opacity:\s*([\d.]+);/.exec(root)?.[1];

// NativeWind turns 1rem into 14 px (react-native-css-interop's default `inlineRem`), where the web means 16 px.
// So every scale that Tailwind writes in rem is restated in px here, and nothing below uses rem.
const spacing = { 0: "0px", px: "1px" };
for (let n = 0.5; n <= 96; n += 0.5) spacing[String(n)] = `${n * 4}px`;

module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  // Class strategy: global.css defines the dark tokens under `.dark:root`, and the app toggles it (colorScheme.set).
  darkMode: "class",
  theme: {
    // Replaces Tailwind's palette: only Pulse's tokens (plus the ones every scale needs).
    colors: { ...colors, transparent: "transparent", current: "currentColor" },
    spacing,
    // Tailwind's rem-based radii, restated in px with the web app's names (spec §2.4: swatches 2, chips 8, rows 10,
    // buttons 12, cards 16, info card 24, sheets 28). src/ui/radius.ts holds the same numbers for style objects.
    borderRadius: { none: "0px", xs: "2px", sm: "4px", DEFAULT: "4px", md: "8px", lg: "10px", xl: "12px", "2xl": "16px", "3xl": "24px", "4xl": "28px", full: "9999px" },
    fontSize: {
      xs: ["12px", "16px"],
      sm: ["14px", "20px"],
      base: ["16px", "24px"],
      lg: ["18px", "28px"],
      xl: ["20px", "28px"],
      "2xl": ["24px", "32px"],
      "3xl": ["30px", "36px"],
      "4xl": ["36px", "40px"],
    },
    lineHeight: { none: "1", tight: "1.25", snug: "1.375", normal: "1.5", ...Object.fromEntries([3, 4, 5, 6, 7, 8, 9, 10].map((n) => [n, `${n * 4}px`])) },
    maxWidth: { none: "none", full: "100%", ...spacing },
    extend: {
      // The web's Tailwind 4 accepts any whole percent in a colour modifier (bg-foreground/8); Tailwind 3 knows steps of 5.
      opacity: { 8: "0.08", 12: "0.12", 16: "0.16", disabled: disabledOpacity },
      // React Native picks a font by its exact family name, not by family plus weight, so each weight is its own
      // name. <Text> in src/ui/Text.tsx maps the web's font-sans / font-numeric / font-bold classes onto these.
      fontFamily: {
        sans: ["Figtree_400Regular"],
        "sans-medium": ["Figtree_500Medium"],
        "sans-semibold": ["Figtree_600SemiBold"],
        "sans-bold": ["Figtree_700Bold"],
        numeric: ["Barlow_500Medium"],
        "numeric-medium": ["Barlow_500Medium"],
        "numeric-semibold": ["Barlow_600SemiBold"],
        "numeric-bold": ["Barlow_700Bold"],
      },
    },
  },
  plugins: [],
};
