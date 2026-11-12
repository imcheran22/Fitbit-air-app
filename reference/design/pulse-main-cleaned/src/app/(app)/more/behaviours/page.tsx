import { connection } from "next/server"
import { userCtx } from "@/server/queries/common"
import { getBehaviours } from "@/server/queries/journal"
import { DetailShell } from "@/components/shells/DetailShell"
import { Behaviours } from "./Behaviours"

export const metadata = { title: "Behaviours" }

/** Behaviours `/more/behaviours` (U21): manage the journal check-in list. */
export default async function BehavioursPage() {
  await connection()
  return <DetailShell title="Behaviours" primary={<Behaviours vm={await getBehaviours(await userCtx())} />} />
}
