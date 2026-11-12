import { AppShell } from "@/components/shells/AppShell"
import { status } from "@/components/__fixtures__/kit"

/** Whole-page demos (/dev/kit/detail, /dev/kit/home) sit in the real app frame; the catalogue does not. */
export default function KitFrameLayout({ children }: { children: React.ReactNode }) {
  return <AppShell status={status}>{children}</AppShell>
}
