"use client"

import * as React from "react"
import { Check, Copy, LoaderCircle } from "lucide-react"
import { toast } from "sonner"
import { createInviteAction } from "@/server/actions/admin"
import type { InviteRow } from "@/server/admin"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { RevokeInvite } from "./AdminClient"
import { Pill, relative, shortDate, TD, TH } from "./ui"

/** Who it's for (optional), then Create link; the new link shows once, ready to copy. */
export function NewInvite({ signup }: { signup: "invite" | "open" | "closed" }) {
  const [pending, start] = React.useTransition()
  const [link, setLink] = React.useState<{ url: string; label: string | null } | null>(null)
  const [copied, setCopied] = React.useState(false)
  const field = React.useRef<HTMLInputElement>(null)
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const label = String(new FormData(form).get("label") ?? "").trim()
    start(async () => {
      const r = await createInviteAction(label).catch(() => ({ ok: false as const, error: "Couldn’t reach Pulse. Try again." }))
      if (!r.ok) return void toast.error(r.error)
      form.reset()
      setCopied(false)
      setLink({ url: `${window.location.origin}/signup?invite=${r.data}`, label: label || null })
    })
  }
  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(true)
    } catch {
      field.current?.select()
      toast.error("Couldn’t copy. The link is selected: copy it from there.")
    }
  }
  return (
    <section aria-label="New invite" className="rounded-xl bg-card p-5 shadow-card ring-1 ring-border">
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1">
          <span className="text-[13px] leading-[18px] font-medium text-foreground-secondary">Who is it for?</span>
          <input
            name="label"
            maxLength={60}
            autoComplete="off"
            placeholder="Optional, e.g. Sam"
            className="mt-1.5 h-10 w-full rounded-lg bg-secondary px-3 text-[14px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
        <Button type="submit" disabled={pending} aria-busy={pending || undefined} className="h-10 rounded-lg px-4 text-[14px] font-semibold">
          {pending && <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" />}
          Create invite link
        </Button>
      </form>
      <p className="mt-2 text-[13px] leading-[18px] text-muted-foreground">
        One account per link. Links expire after 7 days.
        {signup !== "invite" && <> Sign-up is {signup === "open" ? "open to anyone" : "closed"} right now, so links only matter once it’s set to invite only.</>}
      </p>
      {link && (
        <div role="status" className="mt-4 rounded-xl bg-coach/10 p-3 ring-1 ring-coach/25">
          <p className="text-[13px] leading-[18px] font-medium">
            Invite link{link.label ? ` for ${link.label}` : ""} created. Send it now: it won’t be shown again.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              ref={field}
              readOnly
              value={link.url}
              aria-label="Invite link"
              onFocus={(e) => e.currentTarget.select()}
              className="h-10 min-w-0 flex-1 rounded-lg bg-card px-3 font-numeric text-[13px] text-foreground ring-1 ring-border outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <Button type="button" variant="secondary" onClick={copy} className="h-10 rounded-lg px-3 text-[14px] font-medium">
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}

const TABS = [
  { key: "open", label: "Open" },
  { key: "used", label: "Used" },
  { key: "expired", label: "Expired" },
] as const
type Tab = (typeof TABS)[number]["key"]

/** Open, used and expired invites, each with what an admin can do about it. */
export function InviteList({ invites, now }: { invites: InviteRow[]; now: number }) {
  const status = (i: InviteRow): Tab => (i.usedAt !== null ? "used" : i.expiresAt * 1000 <= now ? "expired" : "open")
  const [tab, setTab] = React.useState<Tab>("open")
  const shown = invites.filter((i) => status(i) === tab)
  const empty = { open: "No open invites. Create one above.", used: "No one has used an invite yet.", expired: "No expired invites." }
  return (
    <section aria-label="Invites" className="mt-4 overflow-hidden rounded-xl bg-card shadow-card ring-1 ring-border">
      <div role="tablist" aria-label="Invites" className="flex gap-1 overflow-x-auto border-b border-border px-2 pt-2 [scrollbar-width:none] sm:px-4 sm:pt-3">
        {TABS.map((t) => {
          const n = invites.filter((i) => status(i) === t.key).length
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "relative flex h-10 shrink-0 items-center gap-1.5 px-3 text-[14px] font-medium outline-none transition-[color] duration-150 ease-standard focus-visible:ring-3 focus-visible:ring-ring/50",
                tab === t.key ? "text-foreground after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              <span className="font-numeric text-[12px] text-muted-foreground tabular-nums">{n}</span>
            </button>
          )
        })}
      </div>
      {shown.length === 0 ? (
        <p className="px-5 py-10 text-center text-[14px] text-muted-foreground">{empty[tab]}</p>
      ) : (
        // Below 768 px each row is a compact list item: who it's for over its dates, then an icon action (or, once used, by whom).
        <div role="tabpanel">
          <table role="table" className="block w-full border-collapse md:table">
            <thead role="rowgroup" className="max-md:sr-only">
              <tr role="row" className="border-b border-border">
                <th role="columnheader" scope="col" className={TH}>For</th>
                <th role="columnheader" scope="col" className={TH}>Created</th>
                <th role="columnheader" scope="col" className={TH}>{tab === "used" ? "Used" : "Expires"}</th>
                <th role="columnheader" scope="col" className={TH}>Status</th>
                <th role="columnheader" scope="col" className={cn(TH, "text-right")}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody role="rowgroup" className="block divide-y divide-border md:table-row-group">
              {shown.map((i) => {
                const left = Math.ceil((i.expiresAt * 1000 - now) / 86_400_000)
                const when = i.usedAt !== null ? relative(i.usedAt * 1000, now) : tab === "expired" ? shortDate(i.expiresAt * 1000) : left === 1 ? "In 1 day" : `In ${left} days`
                return (
                  <tr role="row" key={i.id} className="flex min-h-16 items-center gap-3 px-4 py-2.5 md:table-row md:min-h-0">
                    <td role="cell" className={cn(TD, "min-w-0 flex-1 font-medium md:table-cell md:px-4 md:py-3")}>
                      <span className="block truncate md:whitespace-normal">{i.label ?? <span className="font-normal text-muted-foreground">Unnamed</span>}</span>
                      {/* Phones: the dates as one line under the name (their columns are hidden). */}
                      <span className="block truncate text-[13px] leading-[18px] font-normal text-muted-foreground md:hidden">
                        {tab === "used" ? `Used ${when.toLowerCase()}` : tab === "expired" ? `Expired ${when}` : `Created ${relative(i.createdAt * 1000, now).toLowerCase()} · expires ${when.toLowerCase()}`}
                      </span>
                    </td>
                    <td role="cell" className={cn(TD, "hidden whitespace-nowrap text-muted-foreground md:table-cell md:px-4 md:py-3")}>{relative(i.createdAt * 1000, now)}</td>
                    <td role="cell" className={cn(TD, "hidden whitespace-nowrap text-muted-foreground md:table-cell md:px-4 md:py-3")}>{when}</td>
                    <td role="cell" className={cn(TD, "max-w-40 shrink-0 md:table-cell md:max-w-none md:px-4 md:py-3", tab !== "used" && "max-md:hidden")}>
                      {tab === "used" ? <Pill tone="good">{i.usedBy ? `Used by ${i.usedBy}` : "Used"}</Pill> : tab === "expired" ? <Pill>Expired</Pill> : <Pill tone="coach">Waiting</Pill>}
                    </td>
                    <td role="cell" className={cn(TD, "shrink-0 max-md:empty:hidden md:table-cell md:px-4 md:py-3 md:text-right")}>
                      {i.usedAt === null && <RevokeInvite id={i.id} label={i.label ?? "this invite"} expired={tab === "expired"} />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
