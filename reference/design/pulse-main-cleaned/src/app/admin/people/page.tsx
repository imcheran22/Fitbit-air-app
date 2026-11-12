import { isOwnerEmail, listAccounts } from "@/server/admin"
import { coachMode } from "@/server/coach/store"
import { adminGate } from "../gate"
import { People } from "../People"
import { PageHeader } from "../ui"

export const metadata = { title: "People" }

const requestTime = () => Date.now()

/** Admin › People `/admin/people`: every account, never its health data. */
export default async function PeoplePage() {
  const { db, user } = await adminGate()
  const [accounts, coach] = await Promise.all([listAccounts(db), coachMode(db)])
  const people = accounts.map((a) => ({ ...a, createdAt: a.createdAt.getTime(), lastSeen: a.lastSeen?.getTime() ?? null }))
  return (
    <>
      <PageHeader
        title="People"
        description="Everyone with an account here. Admins see who they are and how active, never their health data. Owners come from ADMIN_EMAILS and are changed there."
      />
      <People people={people} me={user.userId} now={requestTime()} chosen={coach === "chosen"} canReset={isOwnerEmail(user.email)} />
    </>
  )
}
