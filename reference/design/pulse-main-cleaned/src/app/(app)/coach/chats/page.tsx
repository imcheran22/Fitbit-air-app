import { connection } from "next/server"
import { notFound } from "next/navigation"
import { coachAccess, groupChats, listChats } from "@/server/coach/store"
import { userCtx } from "@/server/queries/common"
import { DetailShell } from "@/components/shells/DetailShell"
import { ChatList } from "../ChatList"

export const metadata = { title: "Chats" }

/** The coach's chats on phone and tablet `/coach/chats` (laptop shows the same list beside the conversation). */
export default async function ChatsPage() {
  await connection()
  const ctx = await userCtx()
  const { db, userId, now } = ctx
  if (!(await coachAccess(db, userId))) notFound()
  const { chats, next } = await listChats(db, userId)
  const groups = groupChats(chats, now, ctx.timeZone)
  return <DetailShell title="Chats" backHref="/coach" primary={<ChatList groups={groups} next={next} current={null} className="mx-auto w-full max-w-[640px]" />} />
}
