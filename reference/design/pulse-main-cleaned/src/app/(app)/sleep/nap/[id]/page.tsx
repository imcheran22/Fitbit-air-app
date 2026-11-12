import { notFound } from "next/navigation"
import { clock, dayLabel } from "@/lib/format"
import { dayHref } from "@/lib/url"
import { SleepStages } from "@/components/metrics/SleepStages"
import { DetailShell } from "@/components/shells/DetailShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { todayOf, userCtx } from "@/server/queries/common"
import { getNap } from "@/server/queries/sleep"

export const metadata = { title: "Nap", description: "A nap's time asleep, stages and heart rate." }

/** Nap `/sleep/nap/[id]`: the nap on its own, as `/sleep` shows the main sleep. Back falls back to that day's Sleep. */
export default async function NapPage({ params }: PageProps<"/sleep/nap/[id]">) {
  const { id } = await params
  const ctx = await userCtx()
  const vm = await getNap(decodeURIComponent(id), ctx)
  if (!vm) notFound()
  const { timeZone, profile } = ctx

  return (
    <DetailShell
      title="Nap"
      subtitle={`${dayLabel(vm.day, todayOf(ctx))} ${clock(vm.start, timeZone, profile.timeFormat)} to ${clock(vm.end, timeZone, profile.timeFormat)}`}
      align="start"
      backHref={dayHref("/sleep", vm.day, todayOf(ctx))}
      primary={
        <SectionShell variant="card" title="Nap" level={2}>
          <SleepStages hours={vm.hours} hr={vm.hr} data={vm.stages} />
        </SectionShell>
      }
    />
  )
}
