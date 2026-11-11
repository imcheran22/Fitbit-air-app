export type MetricType = 'STEPS' | 'RESTING_HR' | 'SLEEP' | 'HRV';

interface MetricConfig {
  label: string;
  format: (value: number) => string;
  icon: string;
  color: { light: string; dark: string };
  // When present, a ring for this metric fills to value/goal -- a real,
  // commonly-understood target, not a fabricated score. Metrics without a
  // universal goal (resting heart rate, HRV) omit this and render as a solid
  // decorative ring instead of a percentage fill.
  goal?: number;
  goalLabel?: string;
}

// Google Health's own units per metric (see backend/src/health/client.ts):
// STEPS is a raw count, RESTING_HR is bpm, SLEEP is minutes asleep, HRV is
// milliseconds -- each formatted here into what a person reads at a glance.
export const METRIC_CONFIG: Record<MetricType, MetricConfig> = {
  STEPS: {
    label: 'Steps',
    format: (v) => Math.round(v).toLocaleString(),
    icon: 'footsteps-outline',
    color: { light: 'rgb(234, 88, 12)', dark: 'rgb(251, 146, 60)' },
    goal: 10000,
    goalLabel: '10,000 steps',
  },
  RESTING_HR: {
    label: 'Resting Heart Rate',
    format: (v) => `${Math.round(v)} bpm`,
    icon: 'heart-outline',
    color: { light: 'rgb(225, 29, 72)', dark: 'rgb(251, 113, 133)' },
  },
  SLEEP: {
    label: 'Sleep',
    format: (v) => {
      const hours = Math.floor(v / 60);
      const minutes = Math.round(v % 60);
      return `${hours}h ${minutes}m`;
    },
    icon: 'moon-outline',
    color: { light: 'rgb(147, 51, 234)', dark: 'rgb(147, 51, 234)' },
    goal: 480,
    goalLabel: '8h goal',
  },
  HRV: {
    label: 'HRV',
    format: (v) => `${v.toFixed(1)} ms`,
    icon: 'pulse-outline',
    color: { light: 'rgb(13, 148, 136)', dark: 'rgb(45, 212, 191)' },
  },
};

export const METRIC_ORDER: MetricType[] = ['STEPS', 'RESTING_HR', 'SLEEP', 'HRV'];

// Mirrors the CSS custom properties in global.css. React Navigation's native
// header isn't part of the NativeWind-styled tree, so it needs real color
// values rather than className tokens -- these must be kept numerically in
// sync with global.css by hand.
export const COLORS = {
  light: {
    background: 'rgb(246, 246, 247)',
    foreground: 'rgb(17, 18, 22)',
    border: 'rgb(228, 228, 233)',
    // The shadcn `secondary` button fill (a step off the page) and its label.
    secondary: 'rgb(235, 235, 239)',
    secondaryForeground: 'rgb(17, 18, 22)',
    muted: 'rgb(98, 100, 110)',
    accent: 'rgb(13, 148, 136)',
    card: 'rgb(255, 255, 255)',
    // 4-band "is this number good" scale for Recovery/Sleep scores, separate
    // from the per-metric colours above ("which metric is this").
    scoreExcellent: 'rgb(22, 163, 74)',
    scoreGood: 'rgb(101, 163, 13)',
    scoreFair: 'rgb(217, 119, 6)',
    scorePoor: 'rgb(220, 38, 38)',
    surfaceRaised: 'rgb(255, 255, 255)',
    hairline: 'rgb(228, 228, 233)',
    // Light mode gets a light bar: a dark pill over light content read as a
    // grey slab once the bar became glass. The active tab inverts (dark
    // circle, white icon), mirroring dark mode.
    bar: 'rgb(255, 255, 255)',
    barIcon: 'rgb(98, 100, 110)',
    barActive: 'rgb(17, 18, 22)',
    barIconActive: 'rgb(255, 255, 255)',
    heatEmpty: 'rgb(245, 245, 244)',
    heat0: 'rgb(231, 229, 228)',
    // A soft ramp on a light page: typical days read peach, only the
    // biggest reach full orange.
    heat1: 'rgb(255, 237, 213)',
    heat2: 'rgb(254, 215, 170)',
    heat3: 'rgb(253, 186, 116)',
    heat4: 'rgb(249, 115, 22)',
    // Sleep's own ramp on the Sleep page, ending on its metric purple; level 0
    // and empty days share the neutral heat0/heatEmpty above.
    sleepHeat1: 'rgb(243, 232, 255)',
    sleepHeat2: 'rgb(233, 213, 255)',
    sleepHeat3: 'rgb(216, 180, 254)',
    sleepHeat4: 'rgb(147, 51, 234)',
    // Sleep stages (stage lanes, stage bars): deep is the darkest indigo, light
    // the palest that still clears 3:1 on the page and card; REM is magenta so
    // it never reads as another depth of light; awake is the warm odd one out.
    sleepDeep: 'rgb(55, 48, 163)',
    sleepRem: 'rgb(192, 38, 211)',
    sleepLight: 'rgb(120, 131, 245)',
    sleepAwake: 'rgb(234, 88, 12)',
    // Text-safe versions (>= 4.5:1 on a card) for the stage names beside the lanes.
    sleepDeepText: 'rgb(55, 48, 163)',
    sleepRemText: 'rgb(162, 28, 175)',
    sleepLightText: 'rgb(79, 70, 229)',
    sleepAwakeText: 'rgb(194, 65, 12)',
    // One accent per metric (the same values as METRIC_CONFIG), used only on
    // that metric's own number, ring and line -- everything else stays neutral.
    metricSteps: 'rgb(234, 88, 12)',
    metricHeart: 'rgb(225, 29, 72)',
    metricSleep: 'rgb(147, 51, 234)',
    metricHrv: 'rgb(13, 148, 136)',
    // The coach's own voice colour: the digest, memory prompts, coach entry.
    coach: 'rgb(79, 70, 229)',
    // Coach today bars and answer tiles: where a number sits against the
    // user's own 30-day usual (rose below, teal above, neutral near). Sleep's
    // "near" uses metricSleep instead (spec 1.2). Light teal is 700 so a fill
    // clears 3:1 on the track. These are for fills and large text only.
    statusBelow: 'rgb(225, 29, 72)',
    statusNear: 'rgb(113, 113, 122)',
    statusAbove: 'rgb(15, 118, 110)',
    // Text-safe status colours for small numbers (>= 4.5:1 on background,
    // card and muted surfaces): rose-700 / teal-700 in light mode.
    statusBelowText: 'rgb(190, 18, 60)',
    statusAboveText: 'rgb(15, 118, 110)',
    // The dimmer "/ usual N" after a today-bar value (still >= 4.5:1).
    todayUsual: 'rgb(108, 110, 120)',
    // The bar's empty track and the tick marking the usual.
    todayTrack: 'rgb(228, 228, 233)',
    todayTick: 'rgb(17, 18, 22)',
    // The answer card's "Try:" line.
    tip: 'rgb(204, 251, 241)',
    tipForeground: 'rgb(17, 94, 89)',
  },
  dark: {
    background: 'rgb(10, 11, 14)',
    foreground: 'rgb(245, 245, 244)',
    border: 'rgb(34, 37, 44)',
    secondary: 'rgb(28, 31, 38)',
    secondaryForeground: 'rgb(245, 245, 244)',
    muted: 'rgb(155, 157, 166)',
    accent: 'rgb(45, 212, 191)',
    card: 'rgb(20, 22, 27)',
    scoreExcellent: 'rgb(74, 222, 128)',
    scoreGood: 'rgb(163, 230, 53)',
    scoreFair: 'rgb(251, 191, 36)',
    scorePoor: 'rgb(248, 113, 113)',
    surfaceRaised: 'rgb(28, 31, 38)',
    hairline: 'rgb(44, 47, 55)',
    bar: 'rgb(28, 30, 38)',
    barIcon: 'rgb(212, 212, 216)',
    barActive: 'rgb(250, 250, 249)',
    barIconActive: 'rgb(10, 11, 14)',
    heatEmpty: 'rgb(20, 22, 27)',
    heat0: 'rgb(34, 37, 44)',
    heat1: 'rgb(124, 45, 18)',
    heat2: 'rgb(194, 65, 12)',
    heat3: 'rgb(234, 88, 12)',
    heat4: 'rgb(251, 146, 60)',
    sleepHeat1: 'rgb(59, 7, 100)',
    sleepHeat2: 'rgb(88, 28, 135)',
    sleepHeat3: 'rgb(107, 33, 168)',
    sleepHeat4: 'rgb(147, 51, 234)',
    // On a dark page the stages are lighter tints of the same hues: indigo deep
    // (the dimmest, still 3:1 on page and card) and light, magenta REM, orange
    // awake; the text versions are paler again for small labels.
    sleepDeep: 'rgb(99, 102, 241)',
    sleepRem: 'rgb(232, 121, 249)',
    sleepLight: 'rgb(165, 180, 252)',
    sleepAwake: 'rgb(251, 146, 60)',
    sleepDeepText: 'rgb(129, 140, 248)',
    sleepRemText: 'rgb(240, 171, 252)',
    sleepLightText: 'rgb(199, 210, 254)',
    sleepAwakeText: 'rgb(253, 186, 116)',
    metricSteps: 'rgb(251, 146, 60)',
    metricHeart: 'rgb(251, 113, 133)',
    metricSleep: 'rgb(147, 51, 234)',
    metricHrv: 'rgb(45, 212, 191)',
    coach: 'rgb(165, 180, 252)',
    statusBelow: 'rgb(251, 113, 133)',
    statusNear: 'rgb(161, 161, 170)',
    statusAbove: 'rgb(45, 212, 191)',
    statusBelowText: 'rgb(251, 113, 133)',
    statusAboveText: 'rgb(45, 212, 191)',
    todayUsual: 'rgb(128, 130, 139)',
    todayTrack: 'rgb(35, 38, 45)',
    todayTick: 'rgb(245, 245, 244)',
    tip: 'rgb(15, 42, 42)',
    tipForeground: 'rgb(204, 251, 241)',
  },
};

// Loaded once in App.tsx (expo-font), all before the splash screen hides.
// React Native picks a face by family name rather than by weight, so each
// weight is its own family; ui/text.tsx maps the classes onto these. Geist is
// everything you read; Silkscreen (pixel) is page titles and small labels.
export const FONTS = {
  sans: 'Geist_400Regular',
  sansMedium: 'Geist_500Medium',
  sansSemibold: 'Geist_600SemiBold',
  sansBold: 'Geist_700Bold',
  sansExtrabold: 'Geist_800ExtraBold',
  pixel: 'Silkscreen',
} as const;

// The type tokens: the fontSize keys in tailwind.config.js (text-score …
// text-label). lib/utils registers them with tailwind-merge, and Button keeps
// them off its spinner's colour.
export const TYPE_TOKENS = ['score', 'number', 'display', 'heading', 'headline', 'body', 'caption', 'fine', 'page-title', 'label'] as const;

// Duration/easing constants for score-transition animations, so no component
// inlines its own. Easings are cubic-bezier control points (not Reanimated
// functions) so this file stays free of native imports; consumers wrap them
// with Easing.bezier(...MOTION.easing.x).
export const MOTION = {
  duration: {
    fast: 150,
    normal: 300,
    slow: 600,
    reveal: 400,
  },
  easing: {
    standard: [0.4, 0, 0.2, 1] as const,
    decelerate: [0, 0, 0.2, 1] as const,
  },
  // Spring configs shared by every pressable and sliding indicator, so no
  // component inlines its own numbers.
  spring: {
    press: { damping: 15, stiffness: 300 },
    settle: { damping: 20, stiffness: 200 },
  },
  // A pressed control settles at `scale`; with reduced motion it only dims to
  // `reducedOpacity` instead of changing size.
  press: { scale: 0.96, reducedOpacity: 0.7 },
  // A pressed ui/button nudges down `translateY` px (shadcn's active:translate-y-px)
  // over `duration` ms; with reduced motion it only dims (its active:opacity class).
  buttonPress: { translateY: 1, duration: 80 },
  // Delay between consecutive staggered entrances, in ms.
  stagger: 70,
};
