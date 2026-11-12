import { desc, eq } from "drizzle-orm";
import { requestUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { coachChats } from "@/server/db/schema";
import { download, refuse } from "@/server/export";
import { ctxOf } from "@/server/queries/common";

/** The signed-in user's coach chats as JSON, newest first. Never the provider or key (coach_settings). */
export async function GET(req: Request) {
  const user = await requestUser(req);
  if (!user) return refuse(401, "Signed out. Sign in again.");
  const ctx = await ctxOf(getDb(), user.userId);
  const chats = await ctx.db
    .select({ id: coachChats.id, title: coachChats.title, createdAt: coachChats.createdAt, updatedAt: coachChats.updatedAt, messages: coachChats.messages })
    .from(coachChats)
    .where(eq(coachChats.userId, ctx.userId))
    .orderBy(desc(coachChats.updatedAt));
  return download(ctx, "coach", "json", "application/json", JSON.stringify({ chats }, null, 2));
}
