// Today timeline (spec 2026-10-07 social §5): your circle's events whose moment falls in the VIEWER's local today,
// oldest first. Closed kinds with typed fields (the app renders the copy) — never free text, never a health number.
// Step goals only while the author shares steps; badges only while they share streaks (both via effectiveSharing).
// A buddy's check-in is LOCKED (no mood) until the viewer has checked in for their own local today — the same lock
// as story frames (spec §4.1), read from the same preloaded circle; the viewer's own check-in is never locked.
// Badges follow the story frames' rule (todaysTopBadges): no backfilled old runs, one item per multi-level jump.
// S2: goodnights (with their on-time flag) and camp notes — "left a camp note", never the text — for a live note
// written during its author's night (19:00–05:59 author-local; the spec's "night only").

import type { AchievementFamily, CheckInMood, StickerKind } from '@prisma/client';
import { civilDateToUtcMidnight, localCivilDateOrUtc } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import type { PersonDTO } from '../buddies/people';
import { shiftDate } from '../scoring/dates';
import { todaysTopBadges } from './badges';
import { noteIsLive } from './campNotes';
import { loadCircle, type Circle, type Member } from './circle';
import { isNight } from './night';

type Base = { id: string; at: string; actor: PersonDTO; mine: boolean };
export type TimelineItemDTO =
  | (Base & { kind: 'checkin'; locked: true })
  | (Base & { kind: 'checkin'; locked: false; mood: CheckInMood })
  | (Base & { kind: 'step_goal' })
  | (Base & { kind: 'badge'; badge: { family: AchievementFamily; level: number } })
  | (Base & { kind: 'sticker'; sticker: StickerKind; to: PersonDTO })
  | (Base & { kind: 'recap_share'; recapKind: 'WEEK' | 'MONTH' })
  | (Base & { kind: 'goodnight'; onTime: boolean })
  | (Base & { kind: 'camp_note' });

/** An item before `at`, `actor` and `mine` are filled in (Omit applied to each variant of the union). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type Rest = DistributiveOmit<TimelineItemDTO, 'at' | 'actor' | 'mine'>;

/** How far back any moment in the viewer's local today can lie (a local day is at most 25 h, with slack). */
export const TODAY_WINDOW_MS = 30 * 60 * 60 * 1000;

export async function timelineFor(circle: Circle, now: Date, limit = 100): Promise<TimelineItemDTO[]> {
  if (limit <= 0) return [];
  const { viewer, members, today } = circle;
  const viewerId = viewer.person.id;
  const buddyIds = circle.buddies.map((b) => b.person.id);
  const ids = [viewerId, ...buddyIds];
  // Any author's local date at a moment in the viewer's today is within a day of it (UTC offsets span 26 h).
  const nearDates = [shiftDate(today, -1), today, shiftDate(today, 1)].map(civilDateToUtcMidnight);
  const since = new Date(now.getTime() - TODAY_WINDOW_MS);
  const visible = (m: Member | undefined, key: 'steps' | 'streaks') => m !== undefined && (m.person.id === viewerId || m.shares[key]);
  const stepIds = ids.filter((id) => visible(members.get(id), 'steps'));
  const streakIds = ids.filter((id) => visible(members.get(id), 'streaks'));

  const [checkIns, steps, badges, stickers, shares, notes] = await Promise.all([
    prisma.checkIn.findMany({ where: { authorId: { in: ids }, localDate: { in: nearDates }, createdAt: { gte: since } }, select: { id: true, authorId: true, mood: true, createdAt: true } }),
    prisma.stepGoalEvent.findMany({ where: { authorId: { in: stepIds }, at: { gte: since } }, select: { authorId: true, at: true } }),
    prisma.achievement.findMany({ where: { userId: { in: streakIds }, createdAt: { gte: since } }, select: { id: true, userId: true, family: true, level: true, earnedOn: true, createdAt: true } }),
    prisma.sticker.findMany({
      where: { sentAt: { gte: since }, OR: [{ toUserId: viewerId, fromUserId: { in: buddyIds } }, { fromUserId: viewerId, toUserId: { in: buddyIds } }] },
      select: { id: true, fromUserId: true, toUserId: true, kind: true, sentAt: true },
    }),
    prisma.recapShare.findMany({ where: { sharerId: { in: ids }, createdAt: { gte: since } }, select: { id: true, sharerId: true, createdAt: true, recap: { select: { kind: true } } } }),
    // Never the text: the timeline only says that a note exists.
    prisma.campNote.findMany({ where: { authorId: { in: ids }, createdAt: { gte: since }, expiresAt: { gt: now } }, select: { authorId: true, createdAt: true, expiresAt: true } }),
  ]);

  const viewerCheckedIn = circle.checkIns.has(viewerId);
  const items: TimelineItemDTO[] = [];
  const push = (actorId: string, at: Date, rest: Rest) => {
    const actor = members.get(actorId);
    if (!actor || localCivilDateOrUtc(at, viewer.timezone) !== today) return;
    items.push({ ...rest, at: at.toISOString(), actor: actor.person, mine: actorId === viewerId } as TimelineItemDTO);
  };
  for (const c of checkIns) {
    const id = `checkin:${c.id}`;
    // The mood is left out entirely (not nulled) while locked, so it never reaches the wire.
    push(c.authorId, c.createdAt, c.authorId === viewerId || viewerCheckedIn
      ? { id, kind: 'checkin', locked: false, mood: c.mood }
      : { id, kind: 'checkin', locked: true });
  }
  // Opaque step-goal id: the author's local date next to `at` would reveal their UTC offset.
  for (const s of steps) push(s.authorId, s.at, { id: `step_goal:${s.authorId}:${s.at.getTime()}`, kind: 'step_goal' });
  const authorOf = (id: string) => {
    const m = members.get(id);
    return m && { today: localCivilDateOrUtc(now, m.timezone), timezone: m.timezone };
  };
  for (const b of todaysTopBadges(badges, authorOf)) push(b.userId, b.createdAt, { id: `badge:${b.id}`, kind: 'badge', badge: { family: b.family, level: b.level } });
  for (const s of stickers) {
    const to = members.get(s.toUserId);
    if (to) push(s.fromUserId, s.sentAt, { id: `sticker:${s.id}`, kind: 'sticker', sticker: s.kind, to: to.person });
  }
  for (const r of shares) push(r.sharerId, r.createdAt, { id: `recap_share:${r.id}`, kind: 'recap_share', recapKind: r.recap.kind });
  for (const g of circle.goodnights) push(g.authorId, g.at, { id: `goodnight:${g.id}`, kind: 'goodnight', onTime: g.onTime });
  for (const n of notes) {
    const author = members.get(n.authorId);
    if (!author || !isNight(n.createdAt, author.timezone) || !noteIsLive(n, circle, now)) continue;
    push(n.authorId, n.createdAt, { id: `camp_note:${n.authorId}:${n.createdAt.getTime()}`, kind: 'camp_note' });
  }
  items.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  return items.slice(-limit);
}

export async function buildTimeline(viewerId: string, now: Date, limit = 100): Promise<TimelineItemDTO[]> {
  if (limit <= 0) return [];
  return timelineFor(await loadCircle(viewerId, now), now, limit);
}
