// Your circle = you + your current buddies (live BuddyPair rows; a block deletes the pair, so blocked people drop
// out on their own). Sharing switches are read only through effectiveSharing (switch on AND current consent).
// A Social read loads the circle ONCE (loadCircle) and hands it to every helper, so the rings, the timeline, the
// highlights, the camp and `me` all see the same buddies, switches, check-ins (the lock) and goodnights. It also
// carries when each buddy paired with the viewer (a past night's fire counts only buddies paired by that evening) and
// the viewer's own bedtime goal (the goodnight window); buddies' bedtime goals are never kept.

import type { CheckInMood } from '@prisma/client';
import { civilDateToUtcMidnight, localCivilDateOrUtc } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import { BuddyError } from '../buddies/errors';
import { PERSON_SELECT, toPerson, type PersonDTO } from '../buddies/people';
import { SHARING_SELECT, effectiveSharing } from '../buddies/sharing';

export const MEMBER_SELECT = { ...PERSON_SELECT, ...SHARING_SELECT, timezone: true } as const;

export interface Member {
  person: PersonDTO;
  timezone: string;
  shares: { steps: boolean; streaks: boolean };
}

export interface TodayCheckIn { authorId: string; mood: CheckInMood; localDate: Date; createdAt: Date; updatedAt: Date }
export interface GoodnightRow { id: string; authorId: string; localDate: Date; at: Date; onTime: boolean }
export const GOODNIGHT_SELECT = { id: true, authorId: true, localDate: true, at: true, onTime: true } as const;
/** Goodnights are read back this far: a story's day, the timeline's day, and a coach still asleep at 11:59. */
export const RECENT_GOODNIGHT_MS = 48 * 60 * 60 * 1000;

export interface Circle {
  viewer: Member;
  /** The viewer's own bedtime goal ("HH:MM"), for the goodnight window. Only the viewer's is ever kept. */
  viewerBedtimeGoal: string | null;
  /** Current buddies that still exist. */
  buddies: Member[];
  /** The viewer and the buddies, by id. */
  members: Map<string, Member>;
  /** Each current buddy's BuddyPair.createdAt: when they joined the viewer's camp. */
  pairedAt: Map<string, Date>;
  /** The viewer's local today. */
  today: string;
  /** Each member's check-in for their OWN local today; the viewer's decides the check-in lock. */
  checkIns: Map<string, TodayCheckIn>;
  /** The members' goodnights said in the last 48 h. */
  goodnights: GoodnightRow[];
}

/**
 * Every current buddy's id, with when the pair was made. Unbounded on purpose: Buddies has no buddy cap, and
 * circles are small, so every Social read loads the whole circle (a cap or paging would come with growth).
 */
export async function buddyPairsOf(userId: string): Promise<Map<string, Date>> {
  const pairs = await prisma.buddyPair.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    select: { userAId: true, userBId: true, createdAt: true },
  });
  return new Map(pairs.map((p) => [p.userAId === userId ? p.userBId : p.userAId, p.createdAt]));
}

/** Every current buddy's id (see buddyPairsOf). */
export async function buddyIdsOf(userId: string): Promise<string[]> {
  return [...(await buddyPairsOf(userId)).keys()];
}

type MemberRow = Parameters<typeof toPerson>[0] & Parameters<typeof effectiveSharing>[0] & { id: string; timezone: string };

function toMember(u: MemberRow): Member {
  const s = effectiveSharing(u);
  return { person: toPerson(u), timezone: u.timezone, shares: { steps: s.steps, streaks: s.streaks } };
}

export async function membersById(ids: string[]): Promise<Map<string, Member>> {
  if (ids.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: MEMBER_SELECT });
  return new Map(users.map((u) => [u.id, toMember(u)]));
}

/** Each member's check-in for their own local today (one query for the circle). */
export async function todayCheckInsOf(members: Member[], now: Date): Promise<Map<string, TodayCheckIn>> {
  const todayOf = new Map(members.map((m) => [m.person.id, localCivilDateOrUtc(now, m.timezone)]));
  const rows = await prisma.checkIn.findMany({
    where: { authorId: { in: [...todayOf.keys()] }, localDate: { in: [...new Set(todayOf.values())].map(civilDateToUtcMidnight) } },
    select: { authorId: true, mood: true, localDate: true, createdAt: true, updatedAt: true },
  });
  return new Map(rows.filter((r) => r.localDate.toISOString().slice(0, 10) === todayOf.get(r.authorId)).map((r) => [r.authorId, r]));
}

export async function recentGoodnightsOf(ids: string[], now: Date): Promise<GoodnightRow[]> {
  return prisma.goodnight.findMany({
    where: { authorId: { in: ids }, at: { gte: new Date(now.getTime() - RECENT_GOODNIGHT_MS), lte: now } },
    select: GOODNIGHT_SELECT,
  });
}

/** The viewer's circle for one read. A viewer row that is gone answers not_buddies (never a 500). */
export async function loadCircle(viewerId: string, now: Date): Promise<Circle> {
  const paired = await buddyPairsOf(viewerId);
  // One users query; bedtimeGoal rides along for the viewer's goodnight window and is dropped for everyone else.
  const users = await prisma.user.findMany({
    where: { id: { in: [viewerId, ...paired.keys()] } },
    select: { ...MEMBER_SELECT, bedtimeGoal: true },
  });
  const members = new Map(users.map((u) => [u.id, toMember(u)]));
  const viewer = members.get(viewerId);
  if (!viewer) throw new BuddyError('not_buddies');
  const viewerBedtimeGoal = users.find((u) => u.id === viewerId)?.bedtimeGoal ?? null;
  const buddies = [...paired.keys()].map((id) => members.get(id)).filter((m): m is Member => m !== undefined);
  // Only buddies that still exist.
  const pairedAt = new Map([...paired].filter(([id]) => members.has(id)));
  const everyone = [viewer, ...buddies];
  const [checkIns, goodnights] = await Promise.all([
    todayCheckInsOf(everyone, now),
    recentGoodnightsOf(everyone.map((m) => m.person.id), now),
  ]);
  return {
    viewer, viewerBedtimeGoal, buddies, members, pairedAt,
    today: localCivilDateOrUtc(now, viewer.timezone), checkIns, goodnights,
  };
}
