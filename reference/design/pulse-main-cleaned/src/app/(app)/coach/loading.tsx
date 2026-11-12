import { DetailShell } from "@/components/shells/DetailShell"
import { Skeleton } from "@/components/ui/skeleton"

/** Coach: the header at once, a few message-shaped bars while the chat loads. */
export default function Loading() {
  return (
    <DetailShell
      loading
      title="Coach"
      primary={
        <div aria-hidden className="mx-auto flex w-full max-w-[640px] flex-col gap-3">
          <Skeleton className="h-16 w-4/5 rounded-2xl" />
          <Skeleton className="ml-auto h-10 w-3/5 rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      }
    />
  )
}
