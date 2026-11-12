import { signupMode } from "@/server/admin"
import { coachMode } from "@/server/coach/store"
import { ModeChoice } from "../AdminClient"
import { adminGate } from "../gate"
import { PageHeader, Panel } from "../ui"

export const metadata = { title: "Access" }

/** Admin › Access `/admin/access`: who can sign up, and who can use the AI coach. Saved on pick, no restart. */
export default async function AccessPage() {
  const { db } = await adminGate()
  const [signup, coach] = await Promise.all([signupMode(db), coachMode(db)])
  return (
    <>
      <PageHeader title="Access" description="Changes apply at once, without a restart, and override SIGNUP in the server’s .env." />
      <div className="grid gap-4 lg:gap-6">
        <Panel title="Sign-up" description="Who can create an account on this server.">
          <ModeChoice kind="signup" value={signup} />
        </Panel>
        <Panel title="AI coach" description="Each person adds their own AI provider key, so the coach costs this server nothing. Admins never see anyone’s key or chats.">
          <ModeChoice kind="coach" value={coach} />
        </Panel>
      </div>
    </>
  )
}
