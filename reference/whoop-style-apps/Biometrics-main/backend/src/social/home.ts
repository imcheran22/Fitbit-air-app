// The Social home in one call (spec 2026-10-07 social §4). One preloaded circle feeds every part (rings, timeline,
// highlights, `me`), so they agree on buddies, switches and the check-in lock. The camp banner: who in your circle
// checked in today, plus up to two of their coach faces. Unread counts feed the Social tab's dot: incoming buddy
// requests; unseen stickers from current buddies sent in the viewer's local today (the same window as the today
// timeline, so it counts only stickers Social shows); and (S3) conversations with an unread message from a current
// buddy (chats/inbox.ts). The stickers are marked seen by the Social screen once it has shown them
// (POST /me/social/stickers/seen), so the dot clears where the cause is read. Older unseen stickers stay unseen and
// keep their Buddies-side "new" marker until that buddy's week is opened.
// S2: the camp banner also says whether it is night in the viewer's zone and who is awake or asleep; `me`
// carries my goodnight for tonight (the evening timeline's Undo) and `camp.goodnightOpen` says whether my own
// goodnight window is open (min(20:00, my goal − 60 min) to 05:59) — all from the circle, no extra query.

import { localCivilDateOrUtc } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import { countRequests } from '../buddies/requests';
import { unreadChatsCount } from '../chats/inbox';
import type { PersonDTO } from '../buddies/people';
import { campSummaryFor } from './camp';
import { toCheckInDTO, type CheckInDTO } from './checkins';
import { loadCircle, type Circle } from './circle';
import type { GoodnightDTO } from './goodnight';
import { weeklyHighlightsFor, type HighlightsDTO } from './highlights';
import { storyRingsFor, type StoryRingDTO } from './stories';
import { timelineFor, TODAY_WINDOW_MS, type TimelineItemDTO } from './timeline';

export interface SocialHomeDTO {
  me: { person: PersonDTO; checkIn: CheckInDTO | null; goodnight: GoodnightDTO | null };
  camp: { checkedIn: number; members: number; faces: string[]; faceColours: string[]; night: boolean; awake: number; asleep: number; goodnightOpen: boolean };
  stories: StoryRingDTO[];
  highlights: HighlightsDTO | null;
  timeline: TimelineItemDTO[];
  unread: { requests: number; stickers: number; chats: number };
}

/** Ids of the unseen stickers to the viewer from current buddies whose moment falls in the viewer's local today. */
async function unseenTodayStickerIds(circle: Circle, now: Date): Promise<string[]> {
  const buddyIds = circle.buddies.map((b) => b.person.id);
  if (buddyIds.length === 0) return [];
  const rows = await prisma.sticker.findMany({
    where: { toUserId: circle.viewer.person.id, seenAt: null, fromUserId: { in: buddyIds }, sentAt: { gte: new Date(now.getTime() - TODAY_WINDOW_MS) } },
    select: { id: true, sentAt: true },
  });
  return rows.filter((s) => localCivilDateOrUtc(s.sentAt, circle.viewer.timezone) === circle.today).map((s) => s.id);
}

export async function getSocialHome(viewerId: string, now: Date): Promise<SocialHomeDTO> {
  const circle = await loadCircle(viewerId, now);
  const [rings, timeline, highlights, requests, stickers, chats] = await Promise.all([
    storyRingsFor(circle, now),
    timelineFor(circle, now),
    weeklyHighlightsFor(circle, now),
    countRequests(viewerId, now),
    unseenTodayStickerIds(circle, now),
    unreadChatsCount(viewerId),
  ]);
  const mine = circle.checkIns.get(viewerId);
  const summary = campSummaryFor(circle, now);
  return {
    me: { person: circle.viewer.person, checkIn: mine ? toCheckInDTO(mine) : null, goodnight: summary.goodnight },
    camp: {
      checkedIn: rings.checkedInBuddies + (rings.viewerCheckedIn ? 1 : 0),
      members: circle.members.size,
      faces: rings.checkedInCoachIds,
      faceColours: rings.checkedInKipColours,
      night: summary.night,
      awake: summary.awake,
      asleep: summary.asleep,
      goodnightOpen: summary.goodnightOpen,
    },
    stories: rings.rings,
    highlights,
    timeline,
    unread: { requests: requests.incoming, stickers: stickers.length, chats },
  };
}

/** The Social screen showed them: today's unseen stickers to the viewer from current buddies are now seen. */
export async function markStickersSeen(viewerId: string, now: Date): Promise<number> {
  const ids = await unseenTodayStickerIds(await loadCircle(viewerId, now), now);
  if (ids.length === 0) return 0;
  const result = await prisma.sticker.updateMany({ where: { id: { in: ids }, seenAt: null }, data: { seenAt: now } });
  return result.count;
}
