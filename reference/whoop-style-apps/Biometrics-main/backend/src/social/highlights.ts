// Week highlights (spec 2026-10-07 social §7): one Monday–Sunday week of the viewer's circle, built on the first
// read after the week is FINAL and cached (plan ruling). Final = Monday 14:00 UTC, when every zone (down to UTC−12)
// has finished its Sunday, or, if later, the viewer's own Monday 06:00, when their Sunday evening (the campfire's last
// night) ends (fix ruling, Task 9: Honolulu's is 16:00 UTC); before that the previous week is served. The cache holds UNGATED candidates — every
// member's best badge, whoever shares streaks — and every read gates them again: an actor who is no longer a buddy
// drops out, and a badge item needs its actor to share streaks now (the viewer is exempt). A build with no
// candidates is cached empty for an hour, then rebuilt: badges are evaluated later (when their owner opens
// Achievements) with a back-dated earnedOn, so a quiet week can still gain one; once a build has items the row is
// frozen (S2 controller ruling; S1 never stored an empty week, and rebuilt it on every read). Closed item types, no
// health numbers:
// the only counts are the viewer's own stickers sent and received (never stickers between two of their buddies).
// S2 adds the camp's items: an on-time goodnight every night (a top story, no streak gate), the campfire ("the fire
// was lit N nights", N >= 2 — a count of the circle's own goodnights, each filed under the viewer's evening in which it
// was said and judged against that night's camp: the viewer plus the buddies paired by its 19:00 in the viewer's zone,
// as GET /me/camp counts them), "joined the camp" (a current buddy who paired with the viewer during the week, by the
// viewer's civil dates; an unpaired or blocked ex-buddy is absent, ruling P5) and "first badge" (a member's first-ever
// badge earned that week, gated by streaks like every badge item, and not repeated when that person's badge is the top
// story). "Joined" and "first badge" show 3 each at most. Weeks cached before S2 keep their S1 items. Known costs,
// accepted: a badge evaluated after a non-empty week was cached (a back-dated first badge) misses that week, as the S1
// top story does; a frozen campfire count keeps an ex-buddy's past nights (it is the viewer's own camp count and
// reveals nothing new); a buddy paired midweek can be the top story from goodnights said before the pairing, as S1's
// top stories count a week's check-ins and badges from before it.

import type { AchievementFamily, CheckInMood, Prisma } from '@prisma/client';
import { civilDateToUtcMidnight, localCivilDateOrUtc } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import type { PersonDTO } from '../buddies/people';
import { lastCompletedPeriodStart } from '../recap/periods';
import { shiftDate } from '../scoring/dates';
import { loadCircle, type Circle, type Member } from './circle';
import { campOnEvening, countLitNights, localInstant, onTimeNightsByViewerEvening } from './night';

export type HighlightItem =
  | { type: 'top_story'; reason: 'badge'; actorId: string; family: AchievementFamily; level: number }
  | { type: 'top_story'; reason: 'on_time_every_night'; actorId: string }
  | { type: 'top_story'; reason: 'checked_in_every_day'; actorId: string }
  | { type: 'most_cheered_you'; actorId: string; count: number }
  | { type: 'comeback'; actorId: string }
  | { type: 'campfire'; actorId: string; nights: number }
  | { type: 'checked_in_every_day'; actorId: string }
  | { type: 'joined'; actorId: string }
  | { type: 'first_badge'; actorId: string }
  | { type: 'most_stickers_sent'; actorId: string; count: number };

type WithoutActorId<T> = T extends unknown ? Omit<T, 'actorId'> & { actor: PersonDTO; mine: boolean } : never;
export type HighlightItemDTO = WithoutActorId<HighlightItem>;
export interface HighlightsDTO { weekStart: string; weekEnd: string; items: HighlightItemDTO[] }

const MAX_EVERY_DAY = 3;
/** "Joined" and "first badge" items shown per week, each. */
const MAX_ALSO = 3;
const MIN_CHEERED_YOU = 2;
const MIN_STICKERS_SENT = 3;
const MIN_LIT_NIGHTS = 2;
/** Sunday 00:00 UTC + 1 day + 14 h = Monday 14:00 UTC. */
const READY_AFTER_SUNDAY_MS = (24 + 14) * 60 * 60 * 1000;

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** Monday 14:00 UTC after the week: every zone has finished its Sunday. */
export function highlightsReadyAt(weekStart: string): Date {
  return new Date(civilDateToUtcMidnight(shiftDate(weekStart, 6)).getTime() + READY_AFTER_SUNDAY_MS);
}

/**
 * When the week is final for a viewer in `timeZone`: Monday 14:00 UTC, or the viewer's Monday 06:00 if later — their
 * Sunday evening (whose goodnights the campfire counts) runs until then. Later only west of UTC−8 (Honolulu: 16:00 UTC).
 */
export function highlightsReadyFor(weekStart: string, timeZone: string): Date {
  const sundayEveningEnds = localInstant(shiftDate(weekStart, 7), '06:00', timeZone);
  return new Date(Math.max(highlightsReadyAt(weekStart).getTime(), sundayEveningEnds.getTime()));
}

/** How long an EMPTY cached week is reused before it is rebuilt (a late-evaluated badge may land in it). */
export const EMPTY_WEEK_TTL_MS = 60 * 60 * 1000;

/** The newest week that is final for a viewer in `timeZone`: their last completed week, or the one before it until highlightsReadyFor. */
export function highlightsWeekFor(timeZone: string, now: Date): string {
  const latest = lastCompletedPeriodStart('WEEK', localCivilDateOrUtc(now, timeZone));
  return now.getTime() >= highlightsReadyFor(latest, timeZone).getTime() ? latest : shiftDate(latest, -7);
}

function topBy(counts: Map<string, number>, min: number): [string, number] | null {
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return best && best[1] >= min ? best : null;
}

/** RESTED on a day whose two previous local days were both TIRED. */
function bouncedBack(byDate: Map<string, CheckInMood>): boolean {
  return [...byDate.entries()].some(([date, mood]) =>
    mood === 'RESTED' && byDate.get(shiftDate(date, -1)) === 'TIRED' && byDate.get(shiftDate(date, -2)) === 'TIRED');
}

/** Ungated candidates in display order: every top-story candidate first (best first), then the other items. */
export async function buildHighlightCandidates(circle: Circle, weekStart: string): Promise<HighlightItem[]> {
  const viewerId = circle.viewer.person.id;
  const zone = circle.viewer.timezone;
  const buddyIds = circle.buddies.map((b) => b.person.id);
  const memberIds = [viewerId, ...buddyIds];
  const weekEnd = shiftDate(weekStart, 6);
  const from = civilDateToUtcMidnight(weekStart);
  const to = civilDateToUtcMidnight(weekEnd);
  const end = civilDateToUtcMidnight(shiftDate(weekStart, 7));
  const [checkIns, badges, stickers, goodnights, firstEarned] = await Promise.all([
    prisma.checkIn.findMany({ where: { authorId: { in: memberIds }, localDate: { gte: from, lte: to } }, select: { authorId: true, localDate: true, mood: true } }),
    prisma.achievement.findMany({
      where: { userId: { in: memberIds }, earnedOn: { gte: from, lte: to } },
      orderBy: [{ level: 'desc' }, { earnedOn: 'asc' }, { userId: 'asc' }],
      select: { userId: true, family: true, level: true },
    }),
    // Only stickers the viewer sent to, or received from, a current buddy.
    prisma.sticker.findMany({
      where: { sentAt: { gte: from, lt: end }, OR: [{ toUserId: viewerId, fromUserId: { in: buddyIds } }, { fromUserId: viewerId, toUserId: { in: buddyIds } }] },
      select: { fromUserId: true, toUserId: true },
    }),
    prisma.goodnight.findMany({
      where: {
        authorId: { in: memberIds },
        onTime: true,
        OR: [
          // The author's own evenings that week (on time every night)…
          { localDate: { gte: from, lte: to } },
          // …and those said in one of the viewer's evenings that week (Monday 06:00 to the next Monday 06:00 in the
          // viewer's zone, as GET /me/camp reads them); a day of margin each side, filtered below.
          { at: { gte: localInstant(shiftDate(weekStart, -1), '06:00', zone), lt: localInstant(shiftDate(weekStart, 8), '06:00', zone) } },
        ],
      },
      select: { authorId: true, localDate: true, at: true, onTime: true },
    }),
    // Each member's first-ever badge date.
    prisma.achievement.groupBy({ by: ['userId'], where: { userId: { in: memberIds } }, _min: { earnedOn: true } }),
  ]);

  const moods = new Map<string, Map<string, CheckInMood>>();
  for (const c of checkIns) {
    const byDate = moods.get(c.authorId) ?? new Map<string, CheckInMood>();
    byDate.set(isoDate(c.localDate), c.mood);
    moods.set(c.authorId, byDate);
  }
  const everyDay = [...moods.entries()].filter(([, byDate]) => byDate.size === 7).map(([id]) => id).sort();
  const comeback = [...moods.entries()].filter(([, byDate]) => bouncedBack(byDate)).map(([id]) => id).sort()[0];
  const cheeredMe = new Map<string, number>();
  let sentByMe = 0;
  for (const s of stickers) {
    if (s.toUserId === viewerId) cheeredMe.set(s.fromUserId, (cheeredMe.get(s.fromUserId) ?? 0) + 1);
    else sentByMe += 1;
  }
  // On time every night: seven of the author's own evenings.
  const onTimeNights = new Map<string, Set<string>>();
  for (const g of goodnights) {
    if (g.localDate < from || g.localDate > to) continue;
    const nights = onTimeNights.get(g.authorId) ?? new Set<string>();
    nights.add(isoDate(g.localDate));
    onTimeNights.set(g.authorId, nights);
  }
  const onTimeEveryNight = [...onTimeNights.entries()].filter(([, nights]) => nights.size === 7).map(([id]) => id).sort();
  // Lit nights as GET /me/camp counts them: each on-time goodnight filed under the viewer's evening in which it was
  // said (fix ruling I-1), each night judged against that night's camp — a buddy who paired midweek counts from that
  // evening on, and pairing after the week never changes it (owner ruling Q2).
  const litNights = countLitNights(
    onTimeNightsByViewerEvening(goodnights, zone).filter((g) => g.date >= weekStart && g.date <= weekEnd),
    (date) => campOnEvening(date, viewerId, circle.pairedAt, zone),
  );
  // Current buddies whose pair with the viewer was made that week, by the viewer's civil dates (ruling P4).
  const joined = [...circle.pairedAt]
    .filter(([, at]) => {
      const date = localCivilDateOrUtc(at, zone);
      return date >= weekStart && date <= weekEnd;
    })
    .map(([id]) => id)
    .sort();
  const firstBadges = firstEarned
    .filter((f) => f._min.earnedOn !== null && f._min.earnedOn >= from && f._min.earnedOn <= to)
    .map((f) => f.userId)
    .sort();

  const items: HighlightItem[] = [];
  const withBadge = new Set<string>();
  for (const b of badges) {
    if (withBadge.has(b.userId)) continue; // each member's best badge only
    withBadge.add(b.userId);
    items.push({ type: 'top_story', reason: 'badge', actorId: b.userId, family: b.family, level: b.level });
  }
  if (onTimeEveryNight[0]) items.push({ type: 'top_story', reason: 'on_time_every_night', actorId: onTimeEveryNight[0] });
  if (everyDay[0]) items.push({ type: 'top_story', reason: 'checked_in_every_day', actorId: everyDay[0] });
  const cheered = topBy(cheeredMe, MIN_CHEERED_YOU);
  if (cheered) items.push({ type: 'most_cheered_you', actorId: cheered[0], count: cheered[1] });
  if (comeback) items.push({ type: 'comeback', actorId: comeback });
  if (litNights >= MIN_LIT_NIGHTS) items.push({ type: 'campfire', actorId: viewerId, nights: litNights });
  for (const id of everyDay) items.push({ type: 'checked_in_every_day', actorId: id });
  for (const id of joined) items.push({ type: 'joined', actorId: id });
  for (const id of firstBadges) items.push({ type: 'first_badge', actorId: id });
  if (sentByMe >= MIN_STICKERS_SENT) items.push({ type: 'most_stickers_sent', actorId: viewerId, count: sentByMe });
  return items;
}

/**
 * Gate the stored candidates for this read: actors must still be in the circle; one top story (the first visible
 * candidate); badge items need their actor to share streaks now (the viewer is exempt); the top story's person is
 * not repeated as "every day" or "first badge"; at most 3 every-day, 3 joined and 3 first-badge items.
 */
function visibleItems(stored: HighlightItem[], viewerId: string, members: Map<string, Member>): HighlightItemDTO[] {
  const visible: HighlightItemDTO[] = [];
  const caps: Partial<Record<HighlightItem['type'], number>> = { checked_in_every_day: MAX_EVERY_DAY, joined: MAX_ALSO, first_badge: MAX_ALSO };
  const shown = new Map<HighlightItem['type'], number>();
  let top: HighlightItem | null = null;
  for (const item of stored) {
    const actor = members.get(item.actorId);
    if (!actor) continue;
    const mine = item.actorId === viewerId;
    if (item.type === 'top_story') {
      if (top) continue;
      if (item.reason === 'badge' && !mine && !actor.shares.streaks) continue;
      top = item;
    }
    if (item.type === 'checked_in_every_day' && top?.type === 'top_story' && top.reason === 'checked_in_every_day' && top.actorId === item.actorId) continue;
    if (item.type === 'first_badge') {
      if (!mine && !actor.shares.streaks) continue;
      if (top?.type === 'top_story' && top.reason === 'badge' && top.actorId === item.actorId) continue;
    }
    const cap = caps[item.type];
    if (cap !== undefined) {
      const n = shown.get(item.type) ?? 0;
      if (n >= cap) continue;
      shown.set(item.type, n + 1);
    }
    const { actorId, ...rest } = item;
    visible.push({ ...rest, actor: actor.person, mine } as HighlightItemDTO);
  }
  return visible;
}

export async function weeklyHighlightsFor(circle: Circle, now: Date): Promise<HighlightsDTO | null> {
  const viewerId = circle.viewer.person.id;
  const weekStart = highlightsWeekFor(circle.viewer.timezone, now);
  const weekDate = civilDateToUtcMidnight(weekStart);
  const key = { viewerId_weekStart: { viewerId, weekStart: weekDate } };
  let row = await prisma.weeklyHighlights.findUnique({ where: key, select: { items: true, builtAt: true } });
  // A non-empty row is frozen. An empty one is reused for an hour, then rebuilt: badges are evaluated later with a
  // back-dated earnedOn, so a quiet week can still gain an item.
  const expired = row !== null && (row.items as unknown[]).length === 0 && now.getTime() - row.builtAt.getTime() >= EMPTY_WEEK_TTL_MS;
  if (!row || expired) {
    const candidates = await buildHighlightCandidates(circle, weekStart);
    const items = candidates as unknown as Prisma.InputJsonValue;
    if (row) {
      // Only the empty row read above: a concurrent rebuild that already replaced it wins.
      await prisma.weeklyHighlights.updateMany({ where: { viewerId, weekStart: weekDate, builtAt: row.builtAt }, data: { items, builtAt: now } });
    } else {
      await prisma.weeklyHighlights.createMany({ data: [{ viewerId, weekStart: weekDate, items, builtAt: now }], skipDuplicates: true });
    }
    // Re-read the winner. An account-deletion purge of a row naming the deleted buddy can remove it in between:
    // that read has no highlights, never a 500 for the whole home; the next read rebuilds.
    row = await prisma.weeklyHighlights.findUnique({ where: key, select: { items: true, builtAt: true } });
    if (!row) return null;
  }
  const items = visibleItems(row.items as unknown as HighlightItem[], viewerId, circle.members);
  return items.length > 0 ? { weekStart, weekEnd: shiftDate(weekStart, 6), items } : null;
}

export async function getWeeklyHighlights(viewerId: string, now: Date): Promise<HighlightsDTO | null> {
  return weeklyHighlightsFor(await loadCircle(viewerId, now), now);
}
