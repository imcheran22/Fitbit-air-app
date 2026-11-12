import Link from "next/link"
import { Activity, Bot, MailPlus, Plus, Users } from "lucide-react"
import { listAccounts, listInvites, signupMode } from "@/server/admin"
import { coachMode } from "@/server/coach/store"
import { cn } from "@/lib/utils"
import { adminGate } from "./gate"
import { BTN, PageHeader, Panel, Pill, relative, StatCard } from "./ui"

export const metadata = { title: "Overview" }

/** The request time; ages are computed against it on the server. */
const requestTime = () => Date.now()
const DAY = 86_400_000

const SIGNUP = { invite: "Invite only", open: "Open to anyone", closed: "Closed" }
const COACH = { off: "Off", everyone: "Everyone", chosen: "Chosen people" }
// The after: box stretches the 20 px text link to a 40 px touch target without moving the panel header.
const LINK = "relative text-[13px] font-medium after:absolute after:-inset-x-2 after:-inset-y-2.5 text-foreground-secondary underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50"
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Admin overview `/admin`: who is here and how active, growth, what's waiting (open invites), and how it's set. */
export default async function AdminOverview() {
  const { db } = await adminGate()
  const now = requestTime()
  const [accounts, invites, signup, coach] = await Promise.all([listAccounts(db), listInvites(db), signupMode(db), coachMode(db)])
  const ago = (d: Date | null) => (d ? (now - d.getTime()) / DAY : Infinity)
  const active = { today: accounts.filter((a) => ago(a.lastSeen) < 1).length, week: accounts.filter((a) => ago(a.lastSeen) < 7).length, month: accounts.filter((a) => ago(a.lastSeen) < 30).length }
  const open = invites.filter((i) => i.usedAt === null && i.expiresAt * 1000 > now)
  const coachReady = accounts.filter((a) => a.coachReady).length
  const newThisWeek = accounts.filter((a) => ago(a.createdAt) < 7).length

  // New people per week, the last 8 weeks, oldest first.
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = now - (7 - i) * 7 * DAY
    return { label: i === 7 ? "This week" : `${7 - i}w ago`, short: i === 7 ? "Now" : `${7 - i}w`, n: accounts.filter((a) => a.createdAt.getTime() <= end && a.createdAt.getTime() > end - 7 * DAY).length }
  })
  const peak = Math.max(1, ...weeks.map((w) => w.n))
  const recent = [...accounts].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 6)
  const activity = [
    { label: "Today", n: active.today },
    { label: "This week", n: active.week },
    { label: "This month", n: active.month },
    { label: "Not in 30 days", n: accounts.length - active.month },
  ]

  return (
    <>
      <PageHeader
        title="Overview"
        description="Who uses this Pulse server, how active they are, and how it is set up."
        action={
          <Link href="/admin/invites" className={cn(BTN.primary, "h-9 px-4 text-[14px]")}>
            <Plus aria-hidden strokeWidth={2.25} />
            Invite someone
          </Link>
        }
      />

      <section aria-label="At a glance" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="People" value={accounts.length} note={newThisWeek ? `+${newThisWeek} joined this week` : "No one new this week"} icon={Users} />
        <StatCard label="Active this week" value={active.week} note={accounts.length ? `${Math.round((active.week / accounts.length) * 100)}% of everyone` : "No one yet"} icon={Activity} />
        <StatCard label="Open invites" value={open.length} note={open.length ? "Waiting to be used" : "None waiting"} icon={MailPlus} />
        <StatCard label="AI coach set up" value={coachReady} note={coach === "off" ? "Coach is off" : `of ${plural(accounts.length, "person", "people")}`} icon={Bot} />
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Panel title="New people" description="Accounts created per week, the last 8 weeks.">
          <div role="img" aria-label={weeks.map((w) => `${w.label}: ${w.n}`).join(", ")} className="flex h-44 items-end gap-1.5 pt-4 sm:gap-2">
            {weeks.map((w) => (
              <div key={w.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                <span className="font-numeric text-[12px] text-muted-foreground tabular-nums">{w.n || ""}</span>
                <span className={cn("w-full max-w-10 rounded-t-md", w.n ? "bg-coach/70" : "bg-foreground/[0.06]")} style={{ height: `${Math.max(4, (w.n / peak) * 100)}%` }} />
                <span className="w-full truncate text-center text-[11px] text-muted-foreground">
                  <span className="sm:hidden">{w.short}</span>
                  <span className="max-sm:hidden">{w.label}</span>
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Activity" description="When people last used Pulse.">
          <ul className="grid gap-3.5 pt-1">
            {activity.map((a) => (
              <li key={a.label} className="grid gap-1.5">
                <div className="flex items-baseline justify-between text-[14px]">
                  <span className="text-foreground-secondary">{a.label}</span>
                  <span className="font-numeric font-semibold tabular-nums">{a.n}</span>
                </div>
                <span aria-hidden className="block h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]">
                  <span className="block h-full rounded-full bg-optimal" style={{ width: `${accounts.length ? (a.n / accounts.length) * 100 : 0}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Panel
          title="Newest people"
          action={
            <Link href="/admin/people" className={LINK}>
              View all
            </Link>
          }
          flush
        >
          <ul className="divide-y divide-border">
            {recent.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-foreground/[0.07] text-[13px] font-semibold">
                  {a.name.trim()[0]?.toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] leading-5 font-medium">{a.name}</span>
                  <span className="block truncate text-[13px] leading-[18px] text-muted-foreground">{a.email}</span>
                </span>
                <span className="shrink-0 text-right text-[13px] text-muted-foreground">{relative(a.createdAt.getTime(), now)}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="grid content-start gap-4">
          <Panel
            title="Open invites"
            action={
              <Link href="/admin/invites" className={LINK}>
                Manage
              </Link>
            }
            flush
          >
            {open.length === 0 ? (
              <p className="px-4 pb-5 text-[14px] text-muted-foreground sm:px-5">No open invites.</p>
            ) : (
              <ul className="divide-y divide-border">
                {open.slice(0, 4).map((i) => {
                  const left = Math.ceil((i.expiresAt * 1000 - now) / DAY)
                  return (
                    <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                      <span className="min-w-0 truncate text-[14px] font-medium">{i.label ?? "Unnamed invite"}</span>
                      <Pill tone={left <= 2 ? "warn" : "coach"}>{left === 1 ? "1 day left" : `${left} days left`}</Pill>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>

          <Panel
            title="Access"
            action={
              <Link href="/admin/access" className={LINK}>
                Change
              </Link>
            }
          >
            <dl className="grid gap-3 text-[14px]">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-foreground-secondary">Sign-up</dt>
                <dd>
                  <Pill tone={signup === "open" ? "warn" : signup === "closed" ? "neutral" : "good"}>{SIGNUP[signup]}</Pill>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-foreground-secondary">AI coach</dt>
                <dd>
                  <Pill tone={coach === "off" ? "neutral" : "coach"}>{COACH[coach]}</Pill>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-foreground-secondary">Admins</dt>
                <dd className="font-numeric font-semibold tabular-nums">{accounts.filter((a) => a.role !== "user").length}</dd>
              </div>
            </dl>
          </Panel>
        </div>
      </div>
    </>
  )
}
