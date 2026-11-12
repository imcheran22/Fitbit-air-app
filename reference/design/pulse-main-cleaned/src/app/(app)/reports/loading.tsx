import { DetailShell } from "@/components/shells/DetailShell"
import { LinkListSkeleton, MORE_COLUMN } from "@/components/shells/LinkList"

const rows = (n: number) => Array.from({ length: n }, () => ({ label: "" }))

/** Reports archive: the view switch and two month groups at their final size (spec §5.19). */
export default function Loading() {
  return (
    <DetailShell loading
      title="Reports"
      primary={
        <div className={MORE_COLUMN}>
          <div className="h-11 rounded-lg bg-muted" />
          <LinkListSkeleton title="" rows={rows(4)} />
          <LinkListSkeleton title="" rows={rows(4)} />
        </div>
      }
    />
  )
}
