// Activity status and the chat privacy switches (spec 2026-10-07 social §8.2, §8.4). lastActiveAt is touched at most
// once a minute: by POST /me/presence (the app sends it on start and each return to the foreground) and by any chat
// read or send. Read receipts and activity status are reciprocal: either person off → neither sees the other's.

import { prisma } from '../db/client';
import { BuddyError } from '../buddies/errors';

export const PRESENCE_TOUCH_MS = 60_000;
/** Beyond this, nothing is shown ("Active {n}h ago" stops at 24 h). */
export const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function touchPresence(userId: string, now: Date): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId, OR: [{ lastActiveAt: null }, { lastActiveAt: { lte: new Date(now.getTime() - PRESENCE_TOUCH_MS) } }] },
    data: { lastActiveAt: now },
  });
}

/** The other person's last activity, as the viewer may see it: both share it, and it is within 24 h. */
export function activeAtFor(
  viewer: { chatActivityStatus: boolean },
  other: { chatActivityStatus: boolean; lastActiveAt: Date | null },
  now: Date,
): string | null {
  if (!viewer.chatActivityStatus || !other.chatActivityStatus || !other.lastActiveAt) return null;
  return now.getTime() - other.lastActiveAt.getTime() <= ACTIVE_WINDOW_MS ? other.lastActiveAt.toISOString() : null;
}

export interface ChatSettingsDTO { readReceipts: boolean; activityStatus: boolean }

const COLUMNS = { readReceipts: 'chatReadReceipts', activityStatus: 'chatActivityStatus' } as const;
const SELECT = { chatReadReceipts: true, chatActivityStatus: true } as const;
const toDTO = (u: { chatReadReceipts: boolean; chatActivityStatus: boolean }): ChatSettingsDTO => ({ readReceipts: u.chatReadReceipts, activityStatus: u.chatActivityStatus });

/** A non-empty patch of the two keys with boolean values, else null (→ invalid_settings). */
export function parseChatSettingsPatch(body: unknown): Partial<ChatSettingsDTO> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const entries = Object.entries(body as Record<string, unknown>);
  if (entries.length === 0) return null;
  const out: Partial<ChatSettingsDTO> = {};
  for (const [key, value] of entries) {
    if (!Object.prototype.hasOwnProperty.call(COLUMNS, key) || typeof value !== 'boolean') return null;
    out[key as keyof ChatSettingsDTO] = value;
  }
  return out;
}

export async function getChatSettings(userId: string): Promise<ChatSettingsDTO> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: SELECT });
  if (!user) throw new BuddyError('not_found');
  return toDTO(user);
}

export async function updateChatSettings(userId: string, patch: Partial<ChatSettingsDTO>): Promise<ChatSettingsDTO> {
  const data = Object.fromEntries(Object.entries(patch).map(([key, value]) => [COLUMNS[key as keyof ChatSettingsDTO], value]));
  // A missing account is a coded refusal, never a raw P2025.
  const updated = await prisma.user.updateMany({ where: { id: userId }, data });
  if (updated.count === 0) throw new BuddyError('not_buddies');
  const user = await prisma.user.findUnique({ where: { id: userId }, select: SELECT });
  if (!user) throw new BuddyError('not_buddies');
  return toDTO(user);
}
