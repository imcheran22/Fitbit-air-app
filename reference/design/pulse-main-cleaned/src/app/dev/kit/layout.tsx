import { notFound } from "next/navigation"
import { ShellStatusProvider } from "@/components/shells/ShellStatus"
import { status } from "@/components/__fixtures__/kit"

export const metadata = { title: "Kit", manifest: null }

/** Dev-only gallery: 404 unless NODE_ENV is development. Fixture status for the specimens, but no app nav. */
export default function KitLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV !== "development") notFound()
  return <ShellStatusProvider value={status}>{children}</ShellStatusProvider>
}
