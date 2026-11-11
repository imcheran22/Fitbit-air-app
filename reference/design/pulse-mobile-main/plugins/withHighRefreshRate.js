// Asks Android for the panel's highest refresh rate while Pulse is on screen. ColorOS and OxygenOS keep third-party
// apps at 60 Hz on a 120 Hz panel unless the window asks, so every scroll and animation ran at half rate. The system
// still caps the request at the person's own setting. From halo's plugins/withHighRefreshRate.js.
const { withMainActivity } = require("expo/config-plugins");

const MARKER = "// pulse:high-refresh-rate";

const KOTLIN = `
    ${MARKER}
    try {
      @Suppress("DEPRECATION")
      val d = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) display else windowManager.defaultDisplay
      if (d != null) {
        val current = d.mode
        val best = d.supportedModes
          .filter { it.physicalWidth == current.physicalWidth && it.physicalHeight == current.physicalHeight }
          .maxByOrNull { it.refreshRate }
        if (best != null) {
          val lp = window.attributes
          lp.preferredDisplayModeId = best.modeId
          lp.preferredRefreshRate = best.refreshRate
          window.attributes = lp
        }
      }
      // Android 15+: adaptive refresh must not drop the frame rate while content animates.
      if (android.os.Build.VERSION.SDK_INT >= 35) window.setFrameRatePowerSavingsBalanced(false)
    } catch (_: Throwable) {
      // A skin that refuses the request keeps its default rate.
    }
`;

module.exports = function withHighRefreshRate(config) {
  return withMainActivity(config, (c) => {
    if (c.modResults.language !== "kt") throw new Error("[withHighRefreshRate] MainActivity is not Kotlin");
    const anchor = "super.onCreate(null)";
    if (!c.modResults.contents.includes(MARKER)) {
      if (!c.modResults.contents.includes(anchor)) throw new Error("[withHighRefreshRate] MainActivity.onCreate has no super.onCreate(null)");
      c.modResults.contents = c.modResults.contents.replace(anchor, `${anchor}\n${KOTLIN}`);
    }
    return c;
  });
};
