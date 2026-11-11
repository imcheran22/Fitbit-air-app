import { apiFetch } from './client';
import { buddyErrorCode, type Person, type StickerKind } from './buddies';
import type { AchievementFamily } from './achievements';

// Social tab client (spec 2026-10-07 social). Types mirror the backend/src/social/*.ts DTOs exactly. Only a BARE
// 404 (no error code) means the backend predates Social — or, for /me/camp, predates the Campfire (S2); every other
// social error carries { error: code }.

export type CheckInMood = 'RESTED' | 'OKAY' | 'TIRED';
export interface CheckIn { mood: CheckInMood; localDate: string; updatedAt: string }

export type StoryFrame =
  // Locked = a buddy's check-in before I checked in today: no mood is sent.
  | { kind: 'checkin'; at: string; locked: true }
  | { kind: 'checkin'; at: string; locked: false; mood: CheckInMood }
  | { kind: 'badge'; at: string; family: AchievementFamily; level: number }
  // `line` is the headline snapshotted when the recap was shared (never empty), not the live recap line.
  | { kind: 'recap'; at: string; recapId: string; recapKind: 'WEEK' | 'MONTH'; periodStart: string; periodEnd: string; line: string; coachId: string }
  // S2: a goodnight said in the author's day; never locked.
  | { kind: 'goodnight'; at: string; onTime: boolean };
export interface Story { author: Person; localDate: string; frames: StoryFrame[] }
export interface StoryRing { author: Person; unseen: boolean; locked: boolean; frameCount: number; latestAt: string }

/** `id` is opaque: a key for lists, never parsed. */
type Base = { id: string; at: string; actor: Person; mine: boolean };
export type TimelineItem =
  // Locked = a buddy's check-in before I checked in today: no mood is sent. My own check-in is never locked.
  | (Base & { kind: 'checkin'; locked: true })
  | (Base & { kind: 'checkin'; locked: false; mood: CheckInMood })
  | (Base & { kind: 'step_goal' })
  | (Base & { kind: 'badge'; badge: { family: AchievementFamily; level: number } })
  | (Base & { kind: 'sticker'; sticker: StickerKind; to: Person })
  | (Base & { kind: 'recap_share'; recapKind: 'WEEK' | 'MONTH' })
  | (Base & { kind: 'goodnight'; onTime: boolean })
  // A camp note exists: its text is only ever on the Campfire page.
  | (Base & { kind: 'camp_note' });

type Actor = { actor: Person; mine: boolean };
export type HighlightItem =
  | (Actor & { type: 'top_story'; reason: 'badge'; family: AchievementFamily; level: number })
  | (Actor & { type: 'top_story'; reason: 'on_time_every_night' })
  | (Actor & { type: 'top_story'; reason: 'checked_in_every_day' })
  | (Actor & { type: 'most_cheered_you'; count: number })
  | (Actor & { type: 'comeback' })
  // The actor is me (the camp's item); `nights` counts the circle's own goodnights, never a health number.
  | (Actor & { type: 'campfire'; nights: number })
  | (Actor & { type: 'checked_in_every_day' })
  | (Actor & { type: 'joined' })
  | (Actor & { type: 'first_badge' })
  | (Actor & { type: 'most_stickers_sent'; count: number });
export interface Highlights { weekStart: string; weekEnd: string; items: HighlightItem[] }

/**
 * My goodnight (S2). The app offers Undo only until `undoUntil`: 10 minutes after `at`, but never past the next 06:00
 * in my zone (the server caps it), so read it, never compute it from `at`.
 */
export interface Goodnight { localDate: string; at: string; onTime: boolean; undoUntil: string }

export interface SocialHome {
  /** `goodnight` arrives with S2: my goodnight tonight, or null; undefined from an S1 server. */
  me: { person: Person; checkIn: CheckIn | null; goodnight?: Goodnight | null };
  /**
   * `faces`: coach ids of up to two buddies who checked in today, newest first. `night` (the scene, 19:00–05:59 in my
   * zone), `awake`, `asleep` and `goodnightOpen` (my own goodnight window: from min(20:00, my goal − 60 min) to 05:59)
   * arrive with S2; an S1 server sends none, and the banner then stays a static strip with no goodnight row. The home
   * has no `goodnightOpensAt`: only the Campfire page (`Camp`) says when the window opens.
   * `faceColours`: each face's KIP colour name, same order (older servers omit it).
   */
  camp: { checkedIn: number; members: number; faces: string[]; faceColours?: string[]; night?: boolean; awake?: number; asleep?: number; goodnightOpen?: boolean };
  stories: StoryRing[];
  highlights: Highlights | null;
  timeline: TimelineItem[];
  /** `chats` (S3): conversations with an unread message; an S2 server sends none, which is how the app knows Chats is missing. */
  unread: { requests: number; stickers: number; chats?: number };
}

/** One person at the camp. `note` is their camp note: a buddy's free text, shown on the Campfire page only. */
export interface CampMember {
  person: Person;
  mine: boolean;
  asleep: boolean;
  /** When the goodnight that keeps them asleep was said; null while awake. */
  asleepSince: string | null;
  /** That goodnight's on-time flag; null while awake. */
  onTime: boolean | null;
  note: string | null;
}
export interface Camp {
  /** The scene: night 19:00–05:59 in my zone. */
  night: boolean;
  /** Me first, then buddies by latest activity (check-in, goodnight or note). */
  members: CampMember[];
  fire: { lit: number; of: number; segments: number };
  nightsLitThisWeek: number;
  /** My goodnight tonight, or null (Undo until its `undoUntil`). */
  goodnight: Goodnight | null;
  /** Whether my "Say goodnight" window is open now. */
  goodnightOpen: boolean;
  /** When it opens, "HH:MM" on my clock: min(20:00, my goal − 60 min). */
  goodnightOpensAt: string;
}
export interface CampNote { text: string; createdAt: string; expiresAt: string }

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const isBare404 = (error: unknown) => (error as { status?: number } | null)?.status === 404 && buddyErrorCode(error) === null;
const id = (s: string) => encodeURIComponent(s);

/** null only for a bare 404: a backend older than Social. */
export async function fetchSocialHome(): Promise<SocialHome | null> {
  try {
    return await apiFetch<SocialHome>('/me/social');
  } catch (error) {
    if (isBare404(error)) return null;
    throw error;
  }
}

export const saveCheckIn = (mood: CheckInMood) => apiFetch<{ checkIn: CheckIn }>('/me/social/checkin', send('PUT', { mood }));
export const fetchStory = (authorId: string) => apiFetch<Story>(`/me/social/stories/${id(authorId)}`);
// The seen routes answer 204. `through` is the time of the newest frame I reached (S3): a frame added after it lights
// the ring again.
export async function markStorySeen(authorId: string, through?: string): Promise<void> {
  await apiFetch<void>(`/me/social/stories/${id(authorId)}/seen`, send('POST', through === undefined ? undefined : { through }));
}
export async function markStickersSeen(): Promise<void> {
  await apiFetch<void>('/me/social/stickers/seen', send('POST'));
}
// `line` is the text the user previewed; the server refuses the share if the recap's line has changed since.
export const shareRecap = (recapId: string, line: string) =>
  apiFetch<{ shared: true }>('/me/social/recap-shares', send('POST', { recapId, line }));
export async function unshareRecap(recapId: string): Promise<void> {
  await apiFetch<void>(`/me/social/recap-shares/${id(recapId)}`, send('DELETE'));
}

/** Whether I already share this recap; null on an older server (bare 404), where sharing doesn't exist. */
export async function fetchRecapShared(recapId: string): Promise<boolean | null> {
  try {
    return (await apiFetch<{ shared: boolean }>(`/me/social/recap-shares/${id(recapId)}`)).shared;
  } catch (error) {
    if (isBare404(error)) return null;
    throw error;
  }
}

export async function fetchHighlights(): Promise<Highlights | null> {
  return (await apiFetch<{ highlights: Highlights | null }>('/me/social/highlights')).highlights;
}

/** The Campfire page; null only for a bare 404: a backend without the Campfire (S1). */
export async function fetchCamp(): Promise<Camp | null> {
  try {
    return await apiFetch<Camp>('/me/camp');
  } catch (error) {
    if (isBare404(error)) return null;
    throw error;
  }
}

export const sayGoodnight = () => apiFetch<{ goodnight: Goodnight }>('/me/camp/goodnight', send('POST'));
// Undo and clear answer 204.
export async function undoGoodnight(): Promise<void> {
  await apiFetch<void>('/me/camp/goodnight', send('DELETE'));
}
export const saveCampNote = (text: string) => apiFetch<{ note: CampNote }>('/me/camp/note', send('PUT', { text }));
export async function clearCampNote(): Promise<void> {
  await apiFetch<void>('/me/camp/note', send('DELETE'));
}
