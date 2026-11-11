import { Easing } from "react-native-reanimated";

/** Motion durations in ms (spec §2.7), for animations a class cannot express. */
export const DURATION = {
  /** Press, tab lens, switches, chevrons and exits: the web's duration-150. */
  fast: 150,
  /** Disclosures and the calendar: the web's duration-200. */
  base: 200,
  /** The header's collapse (spec §4.3, 220 ms). */
  collapse: 220,
  /** Arrivals: the toast and the done screen. */
  enter: 300,
  /** A dashboard row lifting under the finger. */
  lift: 120,
} as const;

/** The web's easings (globals.css `--ease-standard`, `--ease-out-expo`, `--ease-in-quick`). */
export const EASE = {
  standard: Easing.bezier(0.2, 0, 0, 1),
  outExpo: Easing.bezier(0.16, 1, 0.3, 1),
  inQuick: Easing.bezier(0.4, 0, 1, 1),
};
