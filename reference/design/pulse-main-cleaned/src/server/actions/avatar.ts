"use server";
// Settings › Account: upload or remove the avatar photo.
import { revalidatePath } from "next/cache";
import { currentUser, SIGNED_OUT } from "../auth";
import { AVATAR_MAX_BYTES, AVATAR_TYPES, setAvatar } from "../avatar";
import { getDb } from "../db";
import type { ActionResult } from "./journal";

export async function uploadAvatar(form: FormData): Promise<ActionResult> {
  const user = await currentUser();
  if (!user) return SIGNED_OUT;
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a photo" };
  if (!(AVATAR_TYPES as readonly string[]).includes(file.type)) return { ok: false, error: "Use a JPEG, PNG or WebP photo" };
  if (file.size > AVATAR_MAX_BYTES) return { ok: false, error: "Use a photo under 1 MB" };
  await setAvatar(getDb(), user.userId, { bytes: Buffer.from(await file.arrayBuffer()), type: file.type });
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function removeAvatar(): Promise<ActionResult> {
  const user = await currentUser();
  if (!user) return SIGNED_OUT;
  await setAvatar(getDb(), user.userId, null);
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
