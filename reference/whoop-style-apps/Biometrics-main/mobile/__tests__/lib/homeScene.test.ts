import type { DailyScoreDTO } from '../../src/api/scores';
import type { SleepNight } from '../../src/api/sleep';
import { READY } from '../../jest-mocks/forecastFixture';
import {
  ART, at, clampTagLeft, flowerSpots, forecastRange, ICON, isNightTime, isShortNight, kipBox, layGround, layObjects,
  layRain, laySky, layWeather, nextSceneBoundary, pxPaths, sceneBackdrop, sceneExtra, sceneOffsetX, sceneState,
  SCENE_SPOTS, skyAt, STATES, todayScore, todayWeather, type SceneKey,
} from '../../src/lib/home/scene';
import { weatherFor, weatherForScore } from '../../src/lib/recoveryCopy';

const DAY = new Date(2026, 9, 13, 10, 0);
const night = (minutes: number, nap = false) =>
  ({ date: '2026-10-13', minutesAsleep: minutes, mainMinutesAsleep: minutes, mainIsNap: nap }) as SleepNight;
const score = (type: 'RECOVERY' | 'SLEEP', value: number | null, date: string) =>
  ({ date, type, score: value, confidenceLevel: 'HIGH', algorithmVersion: 'v1', factors: [], coldStart: [] }) as DailyScoreDTO;

describe('sceneState', () => {
  it('maps each Recovery weather to its state and KIP', () => {
    expect(sceneState({ now: DAY, recovery: 'clear', night: null })).toEqual({ key: 'clear', pose: 'cheer', mood: 'proud' });
    expect(sceneState({ now: DAY, recovery: 'mostlyClear', night: null })).toEqual({ key: 'mostly', pose: 'wave', mood: 'idle' });
    expect(sceneState({ now: DAY, recovery: 'cloudy', night: null })).toEqual({ key: 'cloudy', pose: 'rest', mood: 'idle' });
    expect(sceneState({ now: DAY, recovery: 'stormy', night: null })).toEqual({ key: 'stormy', pose: 'rest', mood: 'determined' });
  });

  it('falls back to the mostly sky without birds, KIP curious, for building and none', () => {
    for (const recovery of ['building', 'none'] as const) {
      expect(sceneState({ now: DAY, recovery, night: null })).toEqual({ key: 'fallback', pose: 'rest', mood: 'curious' });
    }
    expect(STATES.fallback.art.map(([name]) => name)).toEqual(['puff', 'bigsun', 'cloud', 'cloud']);
    expect(STATES.fallback.sky).toEqual(STATES.mostly.sky);
  });

  it('a short night beats every band, and night beats a short night', () => {
    for (const recovery of ['clear', 'mostlyClear', 'cloudy', 'stormy', 'building', 'none'] as const) {
      expect(sceneState({ now: DAY, recovery, night: night(300) })).toEqual({ key: 'short', pose: 'coffee', mood: 'sleepy' });
    }
    expect(sceneState({ now: new Date(2026, 9, 13, 22, 0), recovery: 'clear', night: night(300) })).toEqual({ key: 'night', pose: 'rest', mood: 'sleepy' });
  });

  it('is night from 20:00 to 04:59', () => {
    expect(isNightTime(new Date(2026, 9, 13, 19, 59))).toBe(false);
    expect(isNightTime(new Date(2026, 9, 13, 20, 0))).toBe(true);
    expect(isNightTime(new Date(2026, 9, 13, 20, 44))).toBe(true);
    expect(isNightTime(new Date(2026, 9, 14, 4, 59))).toBe(true);
    expect(isNightTime(new Date(2026, 9, 14, 5, 0))).toBe(false);
  });

  it('sets the next timer at 00:00, 05:00, 20:00 and the greeting\'s 12:00 and 18:00', () => {
    expect(nextSceneBoundary(new Date(2026, 9, 13, 4, 10))).toEqual(new Date(2026, 9, 13, 5, 0));
    expect(nextSceneBoundary(new Date(2026, 9, 13, 0, 10))).toEqual(new Date(2026, 9, 13, 5, 0));
    expect(nextSceneBoundary(new Date(2026, 9, 13, 5, 0))).toEqual(new Date(2026, 9, 13, 12, 0));
    expect(nextSceneBoundary(new Date(2026, 9, 13, 11, 59, 30))).toEqual(new Date(2026, 9, 13, 12, 0));
    expect(nextSceneBoundary(new Date(2026, 9, 13, 12, 0))).toEqual(new Date(2026, 9, 13, 18, 0));
    expect(nextSceneBoundary(new Date(2026, 9, 13, 17, 30))).toEqual(new Date(2026, 9, 13, 18, 0));
    expect(nextSceneBoundary(new Date(2026, 9, 13, 18, 0))).toEqual(new Date(2026, 9, 13, 20, 0));
    expect(nextSceneBoundary(new Date(2026, 9, 13, 19, 59, 30))).toEqual(new Date(2026, 9, 13, 20, 0));
    expect(nextSceneBoundary(new Date(2026, 9, 13, 20, 0))).toEqual(new Date(2026, 9, 14, 0, 0));
    expect(nextSceneBoundary(new Date(2026, 9, 13, 21, 30))).toEqual(new Date(2026, 9, 14, 0, 0));
    expect(nextSceneBoundary(new Date(2026, 9, 31, 23, 0))).toEqual(new Date(2026, 10, 1, 0, 0));
  });

  it('stays night across midnight until 05:00', () => {
    expect(sceneState({ now: new Date(2026, 9, 14, 0, 0), recovery: 'clear', night: null }).key).toBe('night');
    expect(sceneState({ now: new Date(2026, 9, 14, 4, 59), recovery: 'clear', night: null }).key).toBe('night');
  });
});

describe('short night', () => {
  it('is under 360 minutes of main sleep, not a nap, and not a missing night', () => {
    expect(isShortNight(night(359))).toBe(true);
    expect(isShortNight(night(360))).toBe(false);
    expect(isShortNight(night(120, true))).toBe(false);
    expect(isShortNight(null)).toBe(false);
  });
});

describe('today\'s scores and weather', () => {
  const TODAY = '2026-10-13';

  it('takes the newest score of a type only when it is dated today', () => {
    const scores = [score('RECOVERY', 70, '2026-10-12'), score('SLEEP', 80, TODAY), score('RECOVERY', 68, TODAY)];
    expect(todayScore(scores, 'RECOVERY', TODAY)?.score).toBe(68);
    expect(todayScore(scores, 'SLEEP', TODAY)?.score).toBe(80);
    expect(todayScore([score('RECOVERY', 70, '2026-10-12')], 'RECOVERY', TODAY)).toBeNull();
    expect(todayScore(null, 'RECOVERY', TODAY)).toBeNull();
  });

  it('reads none, building or the band weather, with the user\'s bands', () => {
    expect(todayWeather(null)).toBe('none');
    expect(todayWeather(score('RECOVERY', null, TODAY))).toBe('building');
    expect(todayWeather(score('RECOVERY', 68, TODAY))).toBe('mostlyClear');
    expect(todayWeather(score('RECOVERY', 68, TODAY), { excellent: 65, good: 50, fair: 35 })).toBe('clear');
    expect(weatherForScore(30)).toBe('stormy');
    expect(weatherFor(80, 'SCORED' as never, { excellent: 75, good: 55, fair: 40 })).toBe('clear');
  });

  it('reads the forecast range at the default levers, rounded', () => {
    expect(forecastRange({ status: 'loaded', forecast: READY })).toEqual({ low: 40, high: 80 });
    expect(forecastRange({ status: 'loading' })).toBeNull();
    expect(forecastRange({ status: 'loaded', forecast: { status: 'NOT_ENOUGH_DATA', reason: 'NO_HISTORY', daysOfHistory: 3 } as never })).toBeNull();
  });
});

describe('the board\'s art', () => {
  const stems = (key: SceneKey, colour: string) => layGround(STATES[key]).filter((r) => r[4] === colour).length;

  it('copies the board\'s data as it is', () => {
    expect(STATES.clear.sky).toEqual(['#2563B8', '#2F72C6', '#3D82D2', '#5596DC']);
    expect(STATES.short.art.map(([name]) => name)).toEqual(['haze', 'sun', 'cloud']);
    expect(ART.bigsun).toHaveLength(17);
    expect(ICON.moon).toHaveLength(6);
  });

  it('draws 18 flowers for clear, 9 for mostly, 5 for short, 5 buds for cloudy and none for stormy or night', () => {
    expect(flowerSpots(STATES.clear)).toHaveLength(18);
    expect(stems('clear', '#2F6B3A')).toBe(18);
    expect(stems('mostly', '#2F6B3A')).toBe(9);
    expect(stems('short', '#2F6B3A')).toBe(5);
    expect(stems('cloudy', '#2F5D3E')).toBe(5);
    expect(stems('cloudy', '#2F6B3A')).toBe(0);
    expect(flowerSpots(STATES.stormy)).toHaveLength(0);
    expect(flowerSpots(STATES.night)).toHaveLength(0);
  });

  it('rains only when stormy', () => {
    expect(layRain(STATES.stormy)).toHaveLength(209);
    for (const key of ['clear', 'mostly', 'cloudy', 'short', 'night', 'fallback'] as const) expect(layRain(STATES[key])).toHaveLength(0);
  });

  it('lights the window and the stars only at night', () => {
    const lit = (key: SceneKey) => layObjects(STATES[key]).some((r) => r[4] === '#FDE68A');
    expect(lit('night')).toBe(true);
    expect(layObjects(STATES.night).find((r) => r[0] === 7 && r[1] === 64)?.[4]).toBe('#4A3416');
    for (const key of ['clear', 'mostly', 'cloudy', 'stormy', 'short', 'fallback'] as const) {
      expect(lit(key)).toBe(false);
      expect(laySky(STATES[key])).toHaveLength(199);
    }
    expect(laySky(STATES.night)).toHaveLength(199 + 34);
  });

  it('shifts each art piece to its spot', () => {
    expect(layWeather(STATES.night)).toEqual(ART.moon.map(([x, y, w, h, c]) => [92 + x, 14 + y, w, h, c]));
  });

  it('groups rects into one path per colour, in first-appearance order', () => {
    expect(pxPaths([[1, 2, 3, 4, '#A'], [0, 0, 1, 1, '#B'], [5, 5, 1, 2, '#A']], 3)).toEqual([
      { fill: '#A', d: 'M3 6h9v12h-9zM15 15h3v6h-3z' },
      { fill: '#B', d: 'M0 0h3v3h-3z' },
    ]);
  });
});

describe('layout', () => {
  it('centres wide phones and keeps columns 2–126 on narrow ones when they fit', () => {
    expect(sceneOffsetX(360)).toBe(-15);
    expect(sceneOffsetX(375)).toBe(-6);
    expect(sceneOffsetX(384)).toBe(-3);
    expect(sceneOffsetX(390)).toBe(0);
    expect(sceneOffsetX(430)).toBe(20);
  });

  it('adds sky above the grid only when the header reaches past the highest tag', () => {
    expect(sceneExtra(100)).toBe(0);
    expect(sceneExtra(110)).toBe(0);
    expect(sceneExtra(130)).toBe(20);
    expect(sceneExtra(130.4)).toBe(21);
  });

  it('moves tags and KIPs with offsetX and extra', () => {
    expect(at(SCENE_SPOTS.tags.recovery, 0, 0)).toEqual({ left: 214, top: 126 });
    expect(at(SCENE_SPOTS.tags.recovery, -6, 20)).toEqual({ left: 208, top: 146 });
    expect(kipBox(SCENE_SPOTS.me.cx, SCENE_SPOTS.me.scale, 0, 0)).toEqual({ left: 170, top: 171, size: 80 });
    expect(kipBox(142, 3, 20, 10)).toEqual({ left: 138, top: 211, size: 48 });
  });

  it('keeps a measured tag on screen, and leaves one that fits alone', () => {
    expect(clampTagLeft(2, 70, 375)).toBe(2);
    expect(clampTagLeft(-7, 70, 360)).toBe(4);
    expect(clampTagLeft(281, 90, 360)).toBe(266);
    expect(clampTagLeft(-7, 0, 360)).toBe(-7);
  });

  it('runs the sky and ground bands full width, with extra sky above (and stars at night)', () => {
    const day = sceneBackdrop('clear', 430, 0, 20);
    expect(day[0]).toEqual([0, 0, 430, 60, '#2563B8']);
    expect(day.filter((r) => r[2] === 430)).toHaveLength(9);
    const tall = sceneBackdrop('night', 430, 24, 20);
    expect(tall[0]).toEqual([0, 0, 430, 24, '#06080E']);
    expect(tall.filter((r) => r[2] === 3 && r[3] === 3)).toHaveLength(4);
    expect(sceneBackdrop('clear', 430, 24, 20).filter((r) => r[2] === 3)).toHaveLength(0);
  });

  it('puts the backdrop stars on the grid\'s columns, inside the screen', () => {
    for (const width of [360, 375, 430, 440]) {
      const offsetX = sceneOffsetX(width);
      const stars = sceneBackdrop('night', width, 120, offsetX).filter((r) => r[2] === 3 && r[3] === 3);
      expect(stars.length).toBeGreaterThan(0);
      for (const [x] of stars) {
        expect((((x - offsetX) % 3) + 3) % 3).toBe(0);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x + 3).toBeLessThanOrEqual(width);
      }
    }
  });

  it('reads the sky colour at a height on the scene: the extra sky, then each 60-point band', () => {
    const { sky } = STATES.clear;
    expect(skyAt('clear', 10, 24)).toBe(sky[0]);
    expect(skyAt('clear', 24 + 59, 24)).toBe(sky[0]);
    expect(skyAt('clear', 24 + 60, 24)).toBe(sky[1]);
    expect(skyAt('clear', 24 + 179, 24)).toBe(sky[2]);
    expect(skyAt('clear', 24 + 200, 24)).toBe(sky[3]);
    expect(skyAt('clear', 24 + 400, 24)).toBe(sky[3]);
    expect(skyAt('night', 70, 0)).toBe(STATES.night.sky[1]);
  });

  it('puts "ALL n →" on its own row below the name tags, inside the ground', () => {
    expect(SCENE_SPOTS.all).toEqual({ right: 382, top: 278 });
    expect(SCENE_SPOTS.all.top).toBeGreaterThanOrEqual(SCENE_SPOTS.nameTop + 14 + 8);
  });
});
