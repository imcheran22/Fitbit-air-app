import type { AchievementFamily } from './achievements';
import { apiFetch } from './client';

// Buddies (spec 2026-10-06 buddies). Only a BARE 404 on GET /me/buddies (no error code) means the
// backend predates buddies; every other buddy error carries { error: code } (not_buddies is a 403).
// Shapes mirror backend/src/buddies (list.ts, people.ts, requests.ts, view.ts, activity.ts, sharing.ts).

export type Mood = 'good' | 'ok' | 'low' | 'none';
export type StickerKind = 'CHEER' | 'HEART' | 'REST_UP' | 'STAR';
export type ShareKey = 'recovery' | 'sleepScore' | 'hoursSlept' | 'steps' | 'streaks';
export const SHARE_KEYS: readonly ShareKey[] = ['recovery', 'sleepScore', 'hoursSlept', 'steps', 'streaks'];
export type NumberKey = 'recovery' | 'sleepScore' | 'hoursSlept' | 'steps';
export const NUMBER_KEYS: readonly NumberKey[] = ['recovery', 'sleepScore', 'hoursSlept', 'steps'];

export interface Person { id: string; handle: string; displayName: string; coachId: string; kipColour?: string }
export interface BuddyRow extends Person { mood: Mood; moodLine: string; unseenSticker: boolean }
export interface BuddyPage { buddies: BuddyRow[]; nextCursor: string | null; incomingRequests: number; outgoingRequests: number }
export interface BuddyIdentity {
  handle: string | null;
  displayName: string | null;
  displayNamePrefill: string;
  moodNoticeSeen: boolean;
  // GET only, for Profile's passport; an older server leaves them out.
  checkInStreak?: number;
  buddyCount?: number;
  joinedOn?: string;
  kipColour?: string;
}
export type SharingSettings = Record<ShareKey, boolean> & { consentVersion: number; consented: boolean };
export interface IncomingRequest { id: string; createdAt: string; from: Person }
/** toHandle is the handle as typed when sent (never the person's current handle); '' for an older row. */
export interface OutgoingRequest { id: string; createdAt: string; toHandle: string }
/** value null: no reading that day. A key missing from BuddyWeek.numbers: not shared. */
export interface DayValue { date: string; value: number | null }
export interface BuddyWeek {
  buddy: Person;
  mood: Mood;
  moodLine: string;
  /** Whether I muted this buddy (never visible to them). */
  muted: boolean;
  tiles: Array<{ date: string; mood: Mood }>;
  shares: ShareKey[];
  numbers: Partial<Record<NumberKey, DayValue[]>>;
  /** Only when they share streaks & badges. */
  badges?: Array<{ family: AchievementFamily; level: number }>;
}
export interface BlockedPerson { userId: string; handle: string; displayName: string }

/** The server's error code (ApiError.code), or null. */
export function buddyErrorCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : null;
}

export const send = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const withCursor = (path: string, cursor?: string | null) => (cursor ? `${path}?cursor=${encodeURIComponent(cursor)}` : path);
const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

/** null only for a bare 404: a backend older than buddies (every buddy UI hides). */
export async function fetchBuddyPage(cursor?: string | null): Promise<BuddyPage | null> {
  let body: Partial<BuddyPage> | undefined;
  try {
    body = await apiFetch<Partial<BuddyPage> | undefined>(withCursor('/me/buddies', cursor));
  } catch (error) {
    if ((error as { status?: number } | null)?.status === 404 && buddyErrorCode(error) === null) return null;
    throw error;
  }
  // A count the server did not send is never made up (a 0 would hide waiting requests).
  if (!body || !Array.isArray(body.buddies) || !isCount(body.incomingRequests) || !isCount(body.outgoingRequests)) {
    throw new Error('bad_buddies');
  }
  return {
    buddies: body.buddies,
    nextCursor: typeof body.nextCursor === 'string' ? body.nextCursor : null,
    incomingRequests: body.incomingRequests,
    outgoingRequests: body.outgoingRequests,
  };
}

export interface BuddyScene { buddies: BuddyRow[]; total: number; incomingRequests: number }

/**
 * Home's scene: up to two buddies by latest check-in. null only for an older server (only you): a bare 404
 * without buddies, or not_buddies from its /me/buddies/:buddyId route, which catches "scene" as an id.
 */
export async function fetchBuddyScene(): Promise<BuddyScene | null> {
  let body: Partial<BuddyScene> | undefined;
  try {
    body = await apiFetch<Partial<BuddyScene> | undefined>('/me/buddies/scene');
  } catch (error) {
    const code = buddyErrorCode(error);
    if ((error as { status?: number } | null)?.status === 404 && (code === null || code === 'not_buddies')) return null;
    throw error;
  }
  if (!body || !Array.isArray(body.buddies) || !isCount(body.total) || !isCount(body.incomingRequests)) throw new Error('bad_buddy_scene');
  return { buddies: body.buddies, total: body.total, incomingRequests: body.incomingRequests };
}

export const fetchIdentity = () => apiFetch<BuddyIdentity>('/me/buddies/me');
export const saveIdentity = (patch: { handle?: string; displayName?: string }) => apiFetch<BuddyIdentity>('/me/handle', send('PUT', patch));
export async function confirmMoodNotice(): Promise<void> {
  await apiFetch<unknown>('/me/buddies/mood-notice', send('POST'));
}

export const fetchSharing = () => apiFetch<SharingSettings>('/me/buddies/sharing');
export const saveSharing = (patch: Partial<Record<ShareKey, boolean>>) => apiFetch<SharingSettings>('/me/buddies/sharing', send('PUT', patch));
export const consentToSharing = (version: number) => apiFetch<SharingSettings>('/me/buddies/sharing/consent', send('POST', { version }));

export async function fetchCode(): Promise<{ code: string; expiresAt: string } | null> {
  const body = await apiFetch<{ code: string | null; expiresAt?: string }>('/me/buddies/code');
  return body?.code && body.expiresAt ? { code: body.code, expiresAt: body.expiresAt } : null;
}
export const createCode = () => apiFetch<{ code: string; expiresAt: string }>('/me/buddies/code', send('POST'));
export const redeemCode = (code: string) => apiFetch<{ buddyId: string }>('/me/buddies/code/redeem', send('POST', { code }));

export async function sendBuddyRequest(handle: string): Promise<void> {
  await apiFetch<unknown>('/me/buddies/requests', send('POST', { handle }));
}
export const fetchRequests = () => apiFetch<{ incoming: IncomingRequest[]; outgoing: OutgoingRequest[] }>('/me/buddies/requests');
export const acceptRequest = (id: string) => apiFetch<{ ok: true; buddyId: string }>(`/me/buddies/requests/${encodeURIComponent(id)}/accept`, send('POST'));
export async function declineRequest(id: string): Promise<void> {
  await apiFetch<unknown>(`/me/buddies/requests/${encodeURIComponent(id)}/decline`, send('POST'));
}
export async function cancelRequest(id: string): Promise<void> {
  await apiFetch<unknown>(`/me/buddies/requests/${encodeURIComponent(id)}/cancel`, send('POST'));
}
export async function blockFromRequest(id: string): Promise<void> {
  await apiFetch<unknown>(`/me/buddies/requests/${encodeURIComponent(id)}/block`, send('POST'));
}

export const fetchBuddyWeek = (buddyId: string) => apiFetch<BuddyWeek>(`/me/buddies/${encodeURIComponent(buddyId)}`);
/** 204 on success. */
export async function unpair(buddyId: string): Promise<void> {
  await apiFetch<unknown>(`/me/buddies/${encodeURIComponent(buddyId)}`, send('DELETE'));
}
export async function blockBuddy(buddyId: string): Promise<void> {
  await apiFetch<unknown>(`/me/buddies/${encodeURIComponent(buddyId)}/block`, send('POST'));
}
export const setMuted = (buddyId: string, muted: boolean) => apiFetch<{ muted: boolean }>(`/me/buddies/${encodeURIComponent(buddyId)}/mute`, send('PUT', { muted }));
/** 201 with the new sticker's id. */
export const sendSticker = (buddyId: string, kind: StickerKind) => apiFetch<{ id: string }>(`/me/buddies/${encodeURIComponent(buddyId)}/stickers`, send('POST', { kind }));

export async function fetchBlocked(): Promise<BlockedPerson[]> {
  return (await apiFetch<{ blocked: BlockedPerson[] }>('/me/blocks')).blocked;
}
/** 204 on success. */
export async function unblock(userId: string): Promise<void> {
  await apiFetch<unknown>(`/me/blocks/${encodeURIComponent(userId)}`, send('DELETE'));
}
