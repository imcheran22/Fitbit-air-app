"use server";
// Settings actions. Disconnect Google (spec §7.14): revoke every permission at Google and forget the user's grant;
// their stored health data stays on this server. (Change password and delete account are better-auth client calls.)
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { currentUser, SIGNED_OUT } from "@/server/auth";
import { getConfig } from "@/server/config";
import { getDb } from "@/server/db";
import { syncState } from "@/server/db/schema";
import { revokeGrant } from "@/server/sources/google/oauth";
import type { ActionResult } from "@/server/actions/journal";

export async function disconnectGoogle(): Promise<ActionResult> {
  const user = await currentUser();
  if (!user) return SIGNED_OUT;
  if (!getConfig().google) return { ok: false, error: "Google is not enabled" };
  const db = getDb();
  try {
    await revokeGrant(db, user.userId);
  } catch {
    return { ok: false, error: "Couldn’t reach Google to remove access. Try again." };
  }
  // The old grant's sync errors (revoked, not linked) no longer describe anything.
  await db.update(syncState).set({ lastError: null }).where(eq(syncState.userId, user.userId));
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
