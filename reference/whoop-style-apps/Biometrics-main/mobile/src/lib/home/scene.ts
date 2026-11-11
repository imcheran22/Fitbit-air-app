import type { DailyScoreDTO, ScoreBandsDTO, ScoreType } from '../../api/scores';
import type { SleepNight } from '../../api/sleep';
import { findCell } from '../forecastGrid';
import type { KipMood, KipPose } from '../kip/kipArt';
import { weatherForScore, type WeatherKey } from '../recoveryCopy';
import type { ForecastState } from '../useForecast';

// Home F's scene (spec 2026-10-13 Home F §2–§3), ported from FWeather.dc.html: the board's data as it is, its
// layer builders, and the layout on the phone. Pure: HomeScene draws what this returns.

/** [x, y, w, h, fill] in grid cells. */
export type PxRect = readonly [x: number, y: number, w: number, h: number, fill: string];

export const W = 130;
export const H = 100;
/** The ground line's row. */
export const GY = 82;
/** Points per grid cell, on every phone: react-native-svg has no shapeRendering, so cells must be whole points. */
export const U = 3;
export const SCENE_W = W * U;
export const SCENE_H = H * U;
export const GROUND_Y = GY * U;

/** The Recovery page's 11 × 11 weather icons; the Sleep tile uses the moon. */
export const ICON = {
  clear: [[3, 3, 5, 5, '#FBBF24'], [5, 1, 1, 1, '#FDE68A'], [1, 5, 1, 1, '#FDE68A'], [9, 5, 1, 1, '#FDE68A'], [5, 9, 1, 1, '#FDE68A']],
  mostly: [[2, 2, 5, 5, '#FBBF24'], [4, 5, 6, 3, '#E5E7EB']],
  cloudy: [[1, 4, 9, 4, '#9CA3AF'], [3, 3, 5, 1, '#9CA3AF']],
  stormy: [[1, 3, 9, 4, '#6B7280'], [3, 2, 5, 1, '#6B7280'], [5, 7, 2, 1, '#FBBF24'], [4, 8, 2, 1, '#FBBF24'], [5, 9, 1, 1, '#FBBF24']],
  moon: [[4, 1, 4, 1, '#C4B5FD'], [3, 2, 2, 1, '#C4B5FD'], [2, 3, 2, 4, '#A78BFA'], [3, 7, 2, 1, '#8B5CF6'], [4, 8, 4, 1, '#7C3AED'], [7, 7, 2, 1, '#7C3AED']],
} satisfies Record<string, readonly PxRect[]>;

export const ART = {
  bigsun: [
    [5, 0, 8, 1, '#FDE68A'], [3, 1, 12, 1, '#FDE68A'], [2, 2, 14, 1, '#FCD34D'], [1, 3, 16, 10, '#FBBF24'], [2, 13, 14, 1, '#F59E0B'],
    [3, 14, 12, 1, '#F59E0B'], [5, 15, 8, 1, '#F59E0B'], [4, 4, 4, 2, '#FEF3C7'], [4, 6, 2, 1, '#FEF3C7'],
    [8, -5, 2, 3, '#FDE68A'], [8, 19, 2, 3, '#FDE68A'], [-5, 7, 3, 2, '#FDE68A'], [21, 7, 3, 2, '#FDE68A'],
    [-3, -3, 2, 2, '#FDE68A'], [19, -3, 2, 2, '#FDE68A'], [-3, 17, 2, 2, '#FDE68A'], [19, 17, 2, 2, '#FDE68A'],
  ],
  sun: [[3, 0, 6, 1, '#FDE68A'], [1, 1, 10, 1, '#FCD34D'], [0, 2, 12, 7, '#FBBF24'], [1, 9, 10, 1, '#F59E0B'], [3, 10, 6, 1, '#F59E0B']],
  cloud: [[3, 0, 8, 1, '#E5E7EB'], [1, 1, 13, 1, '#F3F4F6'], [0, 2, 16, 4, '#E5E7EB'], [1, 6, 14, 1, '#9CA3AF'], [4, 1, 3, 1, '#FFFFFF']],
  grey: [[5, 0, 8, 1, '#D1D5DB'], [3, 1, 13, 1, '#E5E7EB'], [1, 2, 17, 1, '#F3F4F6'], [0, 3, 19, 5, '#D1D5DB'], [1, 8, 17, 1, '#9CA3AF'], [6, 1, 3, 1, '#F3F4F6']],
  storm: [
    [4, 0, 8, 1, '#6B7280'], [2, 1, 13, 1, '#6B7280'], [0, 2, 17, 6, '#6B7280'], [1, 8, 15, 1, '#4B5563'], [8, 9, 3, 1, '#FBBF24'],
    [7, 10, 3, 1, '#FBBF24'], [6, 11, 5, 1, '#FBBF24'], [8, 12, 2, 1, '#FBBF24'], [7, 13, 2, 1, '#FBBF24'], [7, 14, 1, 1, '#F59E0B'],
  ],
  dark: [[4, 0, 8, 1, '#4B5563'], [2, 1, 13, 1, '#4B5563'], [0, 2, 17, 6, '#4B5563'], [1, 8, 15, 1, '#374151']],
  moon: [
    [4, 0, 5, 1, '#C4B5FD'], [2, 1, 5, 1, '#C4B5FD'], [1, 2, 4, 2, '#A78BFA'], [0, 4, 4, 6, '#A78BFA'], [1, 10, 4, 2, '#8B5CF6'],
    [2, 12, 5, 1, '#8B5CF6'], [4, 13, 6, 1, '#7C3AED'], [9, 12, 3, 1, '#7C3AED'], [10, 3, 1, 3, '#FDE68A'], [9, 4, 3, 1, '#FDE68A'],
  ],
  haze: [[2, 0, 6, 1, '#2B3A56'], [0, 1, 10, 2, '#2B3A56']],
  puff: [[2, 0, 6, 1, '#EAF2FB'], [0, 1, 10, 2, '#DCE8F6']],
  bird: [[0, 0, 1, 1, '#1E293B'], [1, 1, 1, 1, '#1E293B'], [2, 1, 1, 1, '#1E293B'], [3, 0, 1, 1, '#1E293B']],
  fly: [[0, 0, 1, 1, '#F472B6'], [2, 0, 1, 1, '#F472B6'], [0, 1, 1, 1, '#F9A8D4'], [2, 1, 1, 1, '#F9A8D4'], [1, 0, 1, 2, '#1F2937']],
} satisfies Record<string, readonly PxRect[]>;

type ArtName = keyof typeof ART;
type Bands = readonly [string, string, string, string];

export type SceneKey = 'clear' | 'mostly' | 'cloudy' | 'stormy' | 'short' | 'night' | 'fallback';

export interface SceneLook {
  sky: Bands;
  hill: string;
  ground: Bands;
  art: readonly (readonly [ArtName, number, number])[];
  flowers: 'bloom' | 'some' | 'few' | 'closed' | 'none';
  rain?: boolean;
  stars?: number;
  lit?: boolean;
}

const MOSTLY: SceneLook = {
  sky: ['#2A5694', '#3264A3', '#3D72B0', '#4E83BD'],
  hill: '#2E6A3E',
  ground: ['#5CA857', '#4B9248', '#3D7C3C', '#316832'],
  art: [['puff', 18, 42], ['bigsun', 86, 12], ['cloud', 94, 25], ['cloud', 76, 33], ['bird', 46, 22]],
  flowers: 'some',
};

export const STATES: Record<SceneKey, SceneLook> = {
  clear: {
    sky: ['#2563B8', '#2F72C6', '#3D82D2', '#5596DC'],
    hill: '#3E8A4E',
    ground: ['#6BBF59', '#58A84A', '#47913D', '#3A7A33'],
    art: [['puff', 18, 40], ['puff', 56, 30], ['bigsun', 84, 12], ['bird', 44, 22], ['bird', 52, 17], ['fly', 64, 70]],
    flowers: 'bloom',
  },
  mostly: MOSTLY,
  cloudy: {
    sky: ['#1F242D', '#262C36', '#2E3540', '#373F4B'],
    hill: '#1E3328',
    ground: ['#3E6B4C', '#335B40', '#2A4C35', '#223F2C'],
    art: [['grey', 76, 22], ['grey', 34, 32]],
    flowers: 'closed',
  },
  stormy: {
    sky: ['#101217', '#14171D', '#191C24', '#1F232C'],
    hill: '#141F18',
    ground: ['#2C4A36', '#243F2D', '#1D3425', '#172B1F'],
    art: [['dark', 30, 20], ['storm', 80, 18]],
    flowers: 'none',
    rain: true,
  },
  short: {
    sky: ['#15233D', '#1A2B49', '#203456', '#273E63'],
    hill: '#173024',
    ground: ['#4A8A5C', '#3A7049', '#2D5A3A', '#234A2E'],
    art: [['haze', 50, 46], ['sun', 94, 26], ['cloud', 99, 34]],
    flowers: 'few',
  },
  night: {
    sky: ['#06080E', '#090C16', '#0D111F', '#121729'],
    hill: '#0B1510',
    ground: ['#1E3A2A', '#17301F', '#132819', '#0F2014'],
    art: [['moon', 92, 14]],
    flowers: 'none',
    stars: 34,
    lit: true,
  },
  fallback: { ...MOSTLY, art: MOSTLY.art.filter(([name]) => name !== 'bird') },
};

const FLOWER_COLS = ['#F472B6', '#FDE047', '#F8FAFC', '#FB923C', '#C4B5FD'];
const FLOWER_SPOTS: readonly (readonly [number, number])[] = [
  [6, 88], [14, 92], [22, 86], [40, 90], [48, 85], [58, 93], [66, 87], [86, 91], [94, 86], [102, 92], [108, 87], [124, 90],
  [30, 95], [76, 95], [116, 95], [4, 96], [52, 97], [98, 97],
];
const STAR_COLS = ['#E0E7FF', '#A5B4FC', '#6366F1'];
const FADE = '#0A0B0E';

// Layer 1: four sky bands, each dithered into the one above; stars at night.
export function laySky(s: SceneLook): PxRect[] {
  const r: PxRect[] = [];
  const bh = Math.floor(GY / 4);
  for (let i = 0; i < 4; i++) {
    const y0 = i * bh;
    r.push([0, y0, W, i === 3 ? GY - y0 : bh, s.sky[i]!]);
    if (i > 0) for (let x = i % 2; x < W; x += 2) r.push([x, y0, 1, 1, s.sky[i - 1]!]);
  }
  for (let i = 0; i < (s.stars ?? 0); i++) r.push([(i * 37 + 11) % W, (i * 23 + 5) % (GY - 20), 1, 1, STAR_COLS[i % 3]!]);
  return r;
}

// Layer 2: the sun or moon, clouds, haze, birds and the butterfly.
export function layWeather(s: SceneLook): PxRect[] {
  return s.art.flatMap(([name, ox, oy]) => ART[name].map(([x, y, w, h, c]): PxRect => [ox + x, oy + y, w, h, c]));
}

function mound(r: PxRect[], cx: number, base: number, w: number, h: number, col: string) {
  for (let k = 0; k < h; k++) {
    const ww = Math.max(4, Math.round(w * (1 - (k / h) * (k / h))));
    r.push([cx - Math.floor(ww / 2), base - k - 1, ww, 1, col]);
  }
}

export function flowerSpots(s: SceneLook): readonly (readonly [number, number])[] {
  if (s.flowers === 'bloom') return FLOWER_SPOTS;
  if (s.flowers === 'some') return FLOWER_SPOTS.slice(0, 9);
  if (s.flowers === 'few' || s.flowers === 'closed') return FLOWER_SPOTS.slice(0, 5);
  return [];
}

// Layer 3: the hills, the ground bands, grass tufts, flowers (buds when cloudy) and the fade into the page.
export function layGround(s: SceneLook): PxRect[] {
  const r: PxRect[] = [];
  const [g0, g1, g2, g3] = s.ground;
  mound(r, 60, GY, 60, 10, s.hill);
  mound(r, 100, GY, 64, 13, s.hill);
  r.push([0, GY, W, 1, g0], [0, GY + 1, W, 2, g1], [0, GY + 3, W, 4, g2], [0, GY + 7, W, H - GY - 7, g3]);
  for (let x = 4; x < W; x += 13) r.push([x, GY - 1, 1, 1, g0], [x + 2, GY - 1, 1, 1, g0], [x + 1, GY - 2, 1, 1, g0]);
  flowerSpots(s).forEach(([x0, y0], i) => {
    if (s.flowers === 'closed') {
      r.push([x0, y0 + 1, 1, 2, '#2F5D3E'], [x0, y0 - 1, 1, 2, '#8A6A86']);
      return;
    }
    const c = FLOWER_COLS[i % FLOWER_COLS.length]!;
    r.push([x0, y0 + 1, 1, 2, '#2F6B3A'], [x0, y0 - 1, 1, 1, c], [x0 - 1, y0, 1, 1, c], [x0 + 1, y0, 1, 1, c], [x0, y0, 1, 1, c === '#FDE047' ? '#B45309' : '#FDE047']);
  });
  for (let x = 0; x < W; x += 2) r.push([x, H - 3, 1, 1, FADE]);
  for (let x = 1; x < W; x += 2) r.push([x, H - 2, 1, 1, FADE]);
  r.push([0, H - 1, W, 1, FADE]);
  return r;
}

// Layer 4: the cottage (the bed and the wall calendar inside) and the mailbox; the window is lit at night.
export function layObjects(s: SceneLook): PxRect[] {
  const inside = s.lit ? '#4A3416' : '#1A1C26';
  const r: PxRect[] = [
    [10, 50, 18, 2, '#9A4A32'], [7, 52, 24, 2, '#9A4A32'], [4, 54, 30, 2, '#9A4A32'], [2, 56, 34, 2, '#7C3A2E'],
    [4, 58, 30, 24, '#3B2F2A'], [33, 58, 1, 24, '#2E2420'], [7, 64, 18, 15, inside],
    [10, 66, 2, 1, '#C4B5FD'], [9, 67, 1, 2, '#C4B5FD'], [10, 69, 2, 1, '#C4B5FD'],
    [8, 71, 4, 2, '#F1F5F9'], [8, 73, 4, 2, '#E5E7EB'], [12, 71, 12, 4, '#7C3AED'], [12, 71, 12, 1, '#A78BFA'], [8, 75, 16, 2, '#6B4F3A'], [8, 77, 1, 2, '#4B3A2A'], [23, 77, 1, 2, '#4B3A2A'],
    [27, 63, 6, 7, '#F1F5F9'], [27, 63, 6, 2, '#F87171'], [28, 66, 1, 1, '#64748B'], [30, 66, 1, 1, '#64748B'], [28, 68, 1, 1, '#F87171'], [30, 68, 1, 1, '#64748B'],
    [117, 70, 2, 12, '#6B4F3A'], [112, 63, 11, 7, '#64748B'], [112, 63, 11, 1, '#94A3B8'], [113, 66, 9, 1, '#334155'], [114, 61, 5, 3, '#F1F5F9'], [114, 61, 5, 1, '#FB7185'], [123, 60, 1, 6, '#FB7185'], [124, 60, 2, 2, '#FB7185'],
  ];
  if (s.lit) r.push([20, 65, 3, 3, '#FDE68A'], [19, 66, 1, 1, '#FCD34D'], [7, 82, 18, 1, '#3E5A2E']);
  return r;
}

// Over the KIPs: rain, only when stormy.
export function layRain(s: SceneLook): PxRect[] {
  const r: PxRect[] = [];
  if (!s.rain) return r;
  for (let y = 30; y < 96; y += 6) for (let x = ((y / 6) % 2) * 3; x < W; x += 7) r.push([x, y, 1, 2, '#7C8BA6']);
  return r;
}

/** One SVG path per colour, in first-appearance order (the board's pxLayers). Call it once per layer. */
export function pxPaths(rects: readonly PxRect[], u: number): { fill: string; d: string }[] {
  const byFill = new Map<string, string>();
  for (const [x, y, w, h, fill] of rects) {
    byFill.set(fill, `${byFill.get(fill) ?? ''}M${x * u} ${y * u}h${w * u}v${h * u}h-${w * u}z`);
  }
  return [...byFill].map(([fill, d]) => ({ fill, d }));
}

// ---- Which state (§3)

export interface SceneState {
  key: SceneKey;
  pose: KipPose;
  mood: KipMood;
}

/** Your KIP in each state. Deliberately not the handoff's mapping (spec §3): don't "fix" it back. */
export const SCENE_KIP: Record<SceneKey, { pose: KipPose; mood: KipMood }> = {
  night: { pose: 'rest', mood: 'sleepy' },
  short: { pose: 'coffee', mood: 'sleepy' },
  clear: { pose: 'cheer', mood: 'proud' },
  mostly: { pose: 'wave', mood: 'idle' },
  cloudy: { pose: 'rest', mood: 'idle' },
  stormy: { pose: 'rest', mood: 'determined' },
  fallback: { pose: 'rest', mood: 'curious' },
};

const WEATHER_SCENE: Partial<Record<WeatherKey, SceneKey>> = { clear: 'clear', mostlyClear: 'mostly', cloudy: 'cloudy', stormy: 'stormy' };

export const SHORT_NIGHT_MINUTES = 360;

/** 20:00 to 04:59 on the device's clock, the greeting's clock (the owner moved the board's 9 pm to 8 pm). */
export function isNightTime(now: Date): boolean {
  const h = now.getHours();
  return h >= 20 || h < 5;
}

/** The night dated today (nights are dated by the morning you woke): its main sleep under 6 hours, not a nap. */
export function isShortNight(night: SleepNight | null | undefined): boolean {
  if (!night || night.mainIsNap === true) return false;
  return (night.mainMinutesAsleep ?? night.minutesAsleep) < SHORT_NIGHT_MINUTES;
}

/** The first rule that matches wins: night, a short night, then today's Recovery weather. */
export function sceneState({ now, recovery, night }: { now: Date; recovery: WeatherKey; night: SleepNight | null }): SceneState {
  const key: SceneKey = isNightTime(now) ? 'night' : isShortNight(night) ? 'short' : WEATHER_SCENE[recovery] ?? 'fallback';
  return { key, ...SCENE_KIP[key] };
}

/** 05:00 and 20:00 change the state; 12:00 and 18:00 change the greeting (greetingFor). */
const BOUNDARY_HOURS = [5, 12, 18, 20] as const;

/**
 * The next 00:00, 05:00, 12:00, 18:00 or 20:00 after `now`, local time: when the state, the greeting or the day can
 * next change on its own.
 */
export function nextSceneBoundary(now: Date): Date {
  const on = (days: number, hour: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, hour, 0, 0, 0);
  const next = BOUNDARY_HOURS.find((hour) => now.getHours() < hour);
  return next === undefined ? on(1, 0) : on(0, next);
}

/** The newest score of a type, only if it is dated today. */
export function todayScore(scores: readonly DailyScoreDTO[] | null, type: ScoreType, today: string): DailyScoreDTO | null {
  let newest: DailyScoreDTO | null = null;
  for (const s of scores ?? []) if (s.type === type && (!newest || s.date > newest.date)) newest = s;
  return newest && newest.date === today ? newest : null;
}

export function todayWeather(score: DailyScoreDTO | null, bands?: ScoreBandsDTO): WeatherKey {
  if (!score) return 'none';
  if (score.score === null) return 'building';
  return weatherForScore(score.score, bands);
}

/** Tomorrow's likely range at the default levers, or null without a ready forecast. */
export function forecastRange(state: ForecastState): { low: number; high: number } | null {
  if (state.status !== 'loaded' || state.forecast.status !== 'READY') return null;
  const [low, high] = findCell(state.forecast, state.forecast.defaults).band;
  return { low: Math.round(low), high: Math.round(high) };
}

// ---- Layout on the phone (§2): crop, never shrink

/** Grid columns 2 (the cottage roof) to 126 (the mailbox flag) stay on screen when they fit. */
const KEEP_FROM = 2;
const KEEP_TO = 126;
/** The highest tag's top on the board (SLEEP). */
const TAG_TOP_MIN = 118;
const HEADER_GAP = 8;
const TAG_EDGE = 4;

export function sceneOffsetX(width: number): number {
  const centred = Math.floor((width - SCENE_W) / 2);
  const lo = -KEEP_FROM * U;
  const hi = width - (KEEP_TO + 1) * U;
  return lo <= hi ? Math.min(hi, Math.max(lo, centred)) : centred;
}

/** More sky above the grid, so no tag sits under the header. */
export function sceneExtra(headerBottom: number): number {
  return Math.max(0, Math.ceil(headerBottom + HEADER_GAP - TAG_TOP_MIN));
}

/** Board positions in points (F.dc.html, unit 3), before offsetX and extra. */
export const SCENE_SPOTS = {
  me: { cx: 210, scale: 5 },
  buddies: [{ cx: 142, scale: 3 }, { cx: 290, scale: 3 }],
  nameTop: GROUND_Y + 8,
  nameWidth: 72,
  /** A row below the name tags: on theirs, a long "n REQUESTS →" would cover the right buddy's name. */
  all: { right: 382, top: GROUND_Y + 32 },
  tags: {
    sleep: { left: 8, top: 118 },
    tomorrow: { left: 52, top: 158 },
    recovery: { left: 214, top: 126 },
    recaps: { left: 296, top: 148 },
  },
} as const;

export function at(spot: { left: number; top: number }, offsetX: number, extra: number): { left: number; top: number } {
  return { left: spot.left + offsetX, top: spot.top + extra };
}

/** A KIP standing on the ground line: the 16-cell sprite with its feet in row 15. */
export function kipBox(cx: number, scale: number, offsetX: number, extra: number): { left: number; top: number; size: number } {
  return { left: offsetX + cx - 8 * scale, top: extra + GROUND_Y - 15 * scale, size: 16 * scale };
}

/** A tag that would leave the screen moves inside it; one that fits stays at its board spot. 0 = not measured yet. */
export function clampTagLeft(left: number, tagWidth: number, screenWidth: number): number {
  if (tagWidth <= 0) return left;
  if (left + tagWidth > screenWidth) return Math.max(TAG_EDGE, screenWidth - TAG_EDGE - tagWidth);
  if (left < 0) return TAG_EDGE;
  return left;
}

/** The sky's colour `y` points down the scene: the extra sky, then the four bands (sceneBackdrop). */
export function skyAt(key: SceneKey, y: number, extra: number): string {
  const { sky } = STATES[key];
  if (y < extra) return sky[0];
  const band = Math.floor((y - extra) / (Math.floor(GY / 4) * U));
  return sky[Math.min(3, band)]!;
}

/**
 * What sits behind the grid, in points, full screen width: the extra sky (with stars at night, at the board's
 * density, on the grid's columns), then the four sky bands and the four ground bands, flat, and the bottom row's dark line.
 */
export function sceneBackdrop(key: SceneKey, width: number, extra: number, offsetX: number): PxRect[] {
  const s = STATES[key];
  const r: PxRect[] = [];
  if (extra > 0) {
    r.push([0, 0, width, extra, s.sky[0]]);
    const n = Math.round(((s.stars ?? 0) * extra) / ((GY - 20) * U));
    const phase = ((offsetX % U) + U) % U;
    const cols = Math.floor((width - phase) / U);
    for (let i = 0; i < n; i++) r.push([phase + ((i * 37 + 11) % cols) * U, ((i * 23 + 5) * U) % extra, U, U, STAR_COLS[i % 3]!]);
  }
  const bh = Math.floor(GY / 4);
  for (let i = 0; i < 4; i++) r.push([0, extra + i * bh * U, width, (i === 3 ? GY - 3 * bh : bh) * U, s.sky[i]!]);
  const [g0, g1, g2, g3] = s.ground;
  r.push(
    [0, extra + GY * U, width, U, g0],
    [0, extra + (GY + 1) * U, width, 2 * U, g1],
    [0, extra + (GY + 3) * U, width, 4 * U, g2],
    [0, extra + (GY + 7) * U, width, (H - GY - 7) * U, g3],
    [0, extra + (H - 1) * U, width, U, FADE],
  );
  return r;
}
