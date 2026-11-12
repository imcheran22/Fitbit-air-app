// The avatar (Home header, Settings › Account): the user's uploaded photo, else their Google photo, else
// AVATAR_URL or public/avatar.*, else null, which the UI draws as the outline person icon.
import { existsSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getConfig } from "./config";
import type { Db } from "./db";
import { avatars, oauthTokens, SYNCED_TABLES } from "./db/schema";

export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
// Settings crops and re-encodes to a 512 px WebP (~50–150 KB) in the browser, so 1 MB is ample and stays under
// the Server Action body limit (next.config.ts).
export const AVATAR_MAX_BYTES = 1024 * 1024;

const google = async (db: Db, userId: number) =>
  (
    await db
      .select({ email: oauthTokens.googleEmail, name: oauthTokens.googleName, picture: oauthTokens.googlePicture })
      .from(oauthTokens)
      .where(eq(oauthTokens.userId, userId))
  )[0];

/** The connected Google account's email, from the last Connect Google; Settings shows it. */
export const connectedGoogleEmail = async (db: Db, userId: number): Promise<string | null> => (await google(db, userId))?.email ?? null;

/** The connected Google account's display name, from the last Connect Google. */
export const ownerName = async (db: Db, userId: number): Promise<string | null> => (await google(db, userId))?.name ?? null;

/** Records which Google account the grant belongs to; a missing name or photo keeps the previous one. */
export async function setGoogleAccount(db: Db, userId: number, a: { email: string; name: string | null; picture: string | null }) {
  await db
    .update(oauthTokens)
    .set({ googleEmail: a.email, ...(a.name && { googleName: a.name }), ...(a.picture && { googlePicture: a.picture }) })
    .where(eq(oauthTokens.userId, userId));
}

/**
 * Clears what the user's previous Google account synced, so a switch starts a fresh import and two accounts'
 * data never mix. Journal entries, the profile, the dashboard and an uploaded avatar stay. Only this user's rows.
 * ponytail: a sync already mid-run can still land a few of the old account's rows; the forced re-sync right after
 * keeps that to the run in flight.
 */
export async function forgetSyncedData(db: Db, userId: number) {
  await db.transaction(async (tx) => {
    for (const t of SYNCED_TABLES) await tx.delete(t).where(eq(t.userId, userId));
    await tx.update(oauthTokens).set({ googleName: null, googlePicture: null }).where(eq(oauthTokens.userId, userId));
  });
}

export async function avatarSrc(db: Db, userId: number): Promise<string | null> {
  const [[up], g] = await Promise.all([
    db.select({ at: avatars.updatedAt }).from(avatars).where(eq(avatars.userId, userId)),
    google(db, userId),
  ]);
  if (up) return `/avatar?v=${up.at}`;
  if (g?.picture) return g.picture;
  const file = ["avatar.jpg", "avatar.png", "avatar.webp"].find((f) => existsSync(path.join(process.cwd(), "public", f)));
  return getConfig().avatarUrl ?? (file ? `/${file}` : null);
}

/** The user's uploaded photo, for GET /avatar. */
export async function uploadedAvatar(db: Db, userId: number): Promise<{ bytes: Buffer; type: string } | null> {
  const [row] = await db.select({ bytes: avatars.bytes, type: avatars.type }).from(avatars).where(eq(avatars.userId, userId));
  return row ?? null;
}

/** Stores an upload (type and size checked by the caller's schema); null removes it. */
export async function setAvatar(db: Db, userId: number, file: { bytes: Buffer; type: string } | null, now = Math.floor(Date.now() / 1000)) {
  if (!file) return void (await db.delete(avatars).where(eq(avatars.userId, userId)));
  const row = { bytes: file.bytes, type: file.type, updatedAt: now };
  await db.insert(avatars).values({ userId, ...row }).onConflictDoUpdate({ target: avatars.userId, set: row });
}
