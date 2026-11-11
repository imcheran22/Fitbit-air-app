import { BAND_WORD, VERDICT, type WeatherKey } from './recoveryCopy';
import type { ScoreBand } from './scoreInsights';

// Every Home F string (spec 2026-10-13 Home F §4–§5).

const NONE = '—';
const NO_READING = 'no reading yet';
const NAME_MAX = 8;

/** A buddy's name on the scene: upper case; over 8 characters, cut to 7 plus "…". By code point, so emoji stay whole. */
export function sceneName(displayName: string): string {
  const chars = Array.from(displayName.toUpperCase());
  return chars.length > NAME_MAX ? `${chars.slice(0, NAME_MAX - 1).join('')}…` : chars.join('');
}

export const HOME_COPY = {
  none: NONE,
  header: {
    date: (now: Date) => now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    profile: 'Profile and settings',
    profileWithRing: (hint: string) => `Profile. ${hint}`,
  },
  tags: {
    sleep: 'SLEEP',
    tomorrow: 'TMRW',
    recovery: 'RECOVERY',
    recaps: 'RECAPS',
    range: (low: number, high: number) => `${low}–${high}`,
    sleepLabel: (score: number | null, duration: string | null) =>
      score === null ? `Bed: sleep, ${NO_READING}. Open Sleep` : `Bed: sleep ${score}${duration ? `, ${duration}` : ''}. Open Sleep`,
    tomorrowLabel: (range: { low: number; high: number } | null) =>
      range ? `Calendar: tomorrow likely ${range.low} to ${range.high}. Open Tomorrow` : `Calendar: tomorrow, ${NO_READING}. Open Tomorrow`,
    recoveryLabel: (r: { score: number; weather: WeatherKey; band: ScoreBand } | null) =>
      r ? `Sky: recovery ${r.score}, ${VERDICT[r.weather].toLowerCase()}, ${BAND_WORD[r.band]}. Open Recovery` : `Sky: recovery, ${NO_READING}. Open Recovery`,
    recapsLabel: (n: number) => (n > 0 ? `Mailbox: recaps, ${n} new. Open Recaps` : 'Mailbox: recaps, no new recaps. Open Recaps'),
  },
  buddies: {
    label: (fullName: string, moodLine: string) => `${fullName}, ${moodLine}. Open their week`,
    all: (n: number) => `ALL ${n} →`,
    requests: (n: number) => (n === 1 ? '1 REQUEST →' : `${n} REQUESTS →`),
    allLabel: (n: number) => `All ${n} buddies. Open Social`,
    requestsLabel: (n: number) => (n === 1 ? '1 buddy request. Open Social' : `${n} buddy requests. Open Social`),
  },
  today: {
    label: 'Today',
    night: (bedtime: string | null) => (bedtime ? `Wind down · bed by ${bedtime}` : 'Wind down'),
    short: 'Short night overrides KIP’s mood',
    other: 'Tap the scene or a tile',
  },
  tiles: {
    recovery: 'Recovery',
    sleep: 'Sleep',
    tomorrow: 'Tomorrow',
    short: (duration: string) => `${duration} · short`,
    bedBy: (bedtime: string) => `Bed by ${bedtime}`,
    withSleep: (hours: number) => `With ${hours}h sleep`,
    recoveryLabel: (score: number | null, verdict: string | null) =>
      `Recovery${score === null ? '' : ` ${score}`}, ${verdict ?? NO_READING}. Open Recovery`,
    sleepLabel: (score: number | null, line: string | null) =>
      score === null && !line ? `Sleep, ${NO_READING}. Open Sleep` : `Sleep${score === null ? '' : ` ${score}`}${line ? `, ${line}` : ''}. Open Sleep`,
    /** `line` is the tile's visible line: the bedtime with a range, or why there's no forecast yet. */
    tomorrowLabel: (range: { low: number; high: number } | null, line: string | null) => {
      const head = range ? `Tomorrow likely ${range.low} to ${range.high}` : line ? 'Tomorrow' : `Tomorrow, ${NO_READING}`;
      return `${head}${line ? `. ${line.replace(/\.$/, '')}` : ''}. Open Tomorrow`;
    },
  },
  askCoach: (needsConsent: boolean) => (needsConsent ? 'Ask Coach · see what’s shared first' : 'Ask Coach about today'),
} as const;
