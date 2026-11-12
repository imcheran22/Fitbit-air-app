// Theme choice (Settings › Appearance): system, light or dark, kept per device in localStorage.

export type ThemeChoice = "system" | "light" | "dark"
export const THEME_KEY = "pulse-theme"

export const resolveTheme = (choice: ThemeChoice, systemLight: boolean): "light" | "dark" =>
  choice === "system" ? (systemLight ? "light" : "dark") : choice

/** Runs before first paint (an inline script first in the root layout's <head>), so a light page never flashes dark. */
export const THEME_SCRIPT = `(function(){var d=document.documentElement,r="dark";try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});r=t==="light"||t==="dark"?t:matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}catch(e){}d.classList.remove("light","dark");d.classList.add(r);d.style.colorScheme=r})()`
