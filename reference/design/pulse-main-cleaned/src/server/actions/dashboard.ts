"use server";
// Home's My Dashboard (spec §11 CD1): which metrics it shows, in which order.
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isDashboardKey } from "@/lib/dashboard";
import { currentUser, SIGNED_OUT } from "../auth";
import { getDb } from "../db";
import { dashboardMetrics } from "../db/schema";
import { dashboardDefault } from "../queries/home";
import type { ActionResult } from "./journal";

const Dashboard = z.object({
  keys: z
    .array(z.string().refine(isDashboardKey, { message: "Unknown metric" }))
    .min(1, "Choose at least one metric")
    .refine((k) => new Set(k).size === k.length, { message: "A metric is listed twice" }),
});

/** Saves the chosen metrics in order. The default list is stored as no rows, so a later default change reaches it. */
export async function saveDashboard(input: z.input<typeof Dashboard>): Promise<ActionResult> {
  const user = await currentUser();
  if (!user) return SIGNED_OUT;
  const r = Dashboard.safeParse(input);
  if (!r.success) return { ok: false, error: r.error.issues[0].message };
  const { keys } = r.data;
  const { userId } = user;
  const db = getDb();
  const def = await dashboardDefault(db, userId);
  const isDefault = keys.length === def.length && keys.every((k, i) => k === def[i]);
  await db.transaction(async (tx) => {
    await tx.delete(dashboardMetrics).where(eq(dashboardMetrics.userId, userId));
    if (!isDefault) await tx.insert(dashboardMetrics).values(keys.map((key, position) => ({ userId, key, position })));
  });
  revalidatePath("/");
  return { ok: true, data: undefined };
}
