import type { NextRequest } from "next/server";
import { requestUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { ctxOf } from "@/server/queries/common";
import { hrMinutes } from "@/server/queries/health";
import { pullHeartRate } from "@/server/worker";

/** The furthest back `since` reaches: one day of minutes. */
const MAX_BACK_S = 86_400;

/**
 * The live heart-rate view's poll: `?since=<epoch ms>` answers the signed-in user's minute means from that minute to
 * now, after the worker's throttled heart-rate pull (at most one a minute per user, however many tabs ask). A
 * since before a day ago is read from a day ago. Behind the sign-in proxy; the handler checks the session itself.
 */
export async function GET(req: NextRequest) {
  const user = await requestUser(req);
  if (!user) return Response.json({ error: "signed_out" }, { status: 401 });
  const since = Number(req.nextUrl.searchParams.get("since"));
  if (!req.nextUrl.searchParams.has("since") || !Number.isFinite(since)) return Response.json({ error: "bad_since" }, { status: 400 });
  await pullHeartRate(user.userId);
  const ctx = await ctxOf(getDb(), user.userId);
  const to = Math.floor(ctx.now / 60) * 60 + 60;
  const from = Math.min(to, Math.max(Math.floor(since / 60_000) * 60, to - MAX_BACK_S));
  return Response.json(await hrMinutes(ctx, from, to), { headers: { "cache-control": "no-store" } });
}
