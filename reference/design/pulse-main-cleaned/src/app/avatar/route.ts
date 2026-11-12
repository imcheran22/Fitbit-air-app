import type { NextRequest } from "next/server";
import { requestUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { uploadedAvatar } from "@/server/avatar";

/**
 * The signed-in user's own uploaded avatar, never anyone else's. Behind the sign-in proxy like every page; the
 * handler checks the session itself. `?v=` (the upload time) busts the cache on a new upload; the response is
 * private, so a shared cache never serves one user's photo to another.
 */
export async function GET(req: NextRequest) {
  const user = await requestUser(req);
  if (!user) return new Response("Signed out", { status: 401 });
  const a = await uploadedAvatar(getDb(), user.userId);
  if (!a) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(a.bytes), {
    headers: { "content-type": a.type, "cache-control": "private, max-age=31536000, immutable", "x-content-type-options": "nosniff" },
  });
}
