// A short tap on key actions. Android: the Vibration API. iOS 18+ has none, but toggling a `switch` checkbox's label
// inside a user gesture fires the system haptic. Elsewhere (desktop, older iOS) it does nothing.
let label: HTMLLabelElement | undefined

export function haptic(ms = 10) {
  if (typeof navigator === "undefined") return
  if (typeof navigator.vibrate === "function") {
    navigator.vibrate(ms)
    return
  }
  try {
    if (!label) {
      label = document.createElement("label")
      label.setAttribute("aria-hidden", "true")
      label.style.cssText = "position:fixed;left:-100px;top:0;opacity:0;pointer-events:none"
      const input = document.createElement("input")
      input.type = "checkbox"
      input.setAttribute("switch", "")
      input.tabIndex = -1
      label.append(input)
      document.body.append(label)
    }
    label.click()
  } catch {
    // No haptics here; nothing to tell the user.
  }
}
