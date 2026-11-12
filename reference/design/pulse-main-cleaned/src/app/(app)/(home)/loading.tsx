import { connection } from "next/server"
import { currentUser } from "@/server/auth"
import { getDb } from "@/server/db"
import { dashboardKeys } from "@/server/queries/home"
import { HomeSkeleton } from "../_lib/skeletons"

export default async function Loading() {
  // Request time: the skeleton has one row per chosen My Dashboard metric (a one-table read), never a build-time list.
  await connection()
  const user = await currentUser()
  return <HomeSkeleton stats={user ? await dashboardKeys(getDb(), user.userId) : []} />
}
