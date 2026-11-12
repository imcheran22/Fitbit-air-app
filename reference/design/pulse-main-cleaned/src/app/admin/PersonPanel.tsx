"use client"

import * as React from "react"
import { Check, Copy, KeyRound, LogOut, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { deleteAccountAction, resetPasswordAction, setRoleAction, signOutEverywhereAction } from "@/server/actions/admin"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { CoachSwitch, run } from "./AdminClient"
import type { Person } from "./People"
import { BTN, Pill, relative, shortDate } from "./ui"

const ROLE = { owner: "Owner", admin: "Admin", user: "Member" } as const

/** A confirmation dialog for one action; the confirm button carries the action's own name. */
function Confirm({ open, onOpenChange, title, body, action, danger, pending, onConfirm, children }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  body: React.ReactNode
  action: string
  danger?: boolean
  pending: boolean
  onConfirm: () => void
  children?: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent showCloseButton={false} className="ring-1 ring-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>
          <button type="button" className={cn(BTN.outline, "h-9 px-4 text-[14px] pointer-coarse:h-10")} onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </button>
          <button type="button" className={cn(danger ? BTN.danger : BTN.primary, "h-9 px-4 text-[14px] pointer-coarse:h-10")} onClick={onConfirm} disabled={pending} aria-busy={pending || undefined}>
            {pending ? "Working…" : action}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** A labelled group in the panel. */
function Group({ title, children, tone }: { title: string; children: React.ReactNode; tone?: "danger" }) {
  return (
    <section aria-label={title} className={cn("rounded-xl p-4 ring-1", tone === "danger" ? "bg-recovery-red/[0.04] ring-recovery-red/25" : "ring-border")}>
      <h3 className={cn("mb-3 text-[13px] font-semibold", tone === "danger" ? "text-recovery-red-text" : "text-foreground-secondary")}>{title}</h3>
      {children}
    </section>
  )
}

/** A setting row: what it is and what it does, then its control. */
function Row({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="min-w-0">
        <p className="text-[14px] leading-5 font-medium">{title}</p>
        <p className="mt-0.5 text-[13px] leading-[18px] text-pretty text-muted-foreground">{body}</p>
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  )
}

/** What a person's row needs from their panel: open it, or ask to delete straight from the row (laptop table). */
export type PanelControls = { open: () => void; askDelete: () => void; admin: boolean }

/**
 * One person's panel: details for everyone (joined, last active, devices, Google, coach), and for people you can
 * manage, admin and coach access, sign out everywhere, reset password (owners only) and delete. Owners (ADMIN_EMAILS)
 * and you get the details only. The row renders through `children`, so a phone row can open the panel and a laptop
 * row can show Manage and Delete buttons, while the panel, its dialogs and their state stay here.
 */
export function PersonPanel({ person: p, now, chosen, canReset, me, children }: {
  person: Person
  now: number
  chosen: boolean
  canReset: boolean
  me: boolean
  children: (c: PanelControls) => React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const [pending, start] = React.useTransition()
  const [admin, setAdmin] = React.useState(p.role === "admin")
  const [confirm, setConfirm] = React.useState<null | "delete" | "signout" | "reset">(null)
  const [temp, setTemp] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)
  const manageable = p.role !== "owner" && !me

  const toggleAdmin = (v: boolean) => {
    setAdmin(v)
    start(async () => {
      if (await run(setRoleAction(p.id, v ? "admin" : "user"))) toast.success(v ? `${p.name} is now an admin.` : `${p.name} is no longer an admin.`)
      else setAdmin(!v)
    })
  }
  const act = (fn: () => Promise<void>) => start(fn)
  const signOut = () =>
    act(async () => {
      const r = await run(signOutEverywhereAction(p.id))
      if (!r) return
      setConfirm(null)
      toast.success(r.data ? `${p.name} is signed out on ${r.data === 1 ? "1 device" : `${r.data} devices`}.` : `${p.name} wasn’t signed in anywhere.`)
    })
  const reset = () =>
    act(async () => {
      const r = await run(resetPasswordAction(p.id))
      if (r) setTemp(r.data)
    })
  const remove = () =>
    act(async () => {
      if (await run(deleteAccountAction(p.id))) {
        setConfirm(null)
        setOpen(false)
        toast.success(`${p.name}’s account was deleted.`)
      }
    })
  const copy = async () => {
    if (!temp) return
    try {
      await navigator.clipboard.writeText(temp)
      setCopied(true)
    } catch {
      toast.error("Couldn’t copy. Select the password and copy it.")
    }
  }

  return (
    <>
      {children({ open: () => setOpen(true), askDelete: () => setConfirm("delete"), admin })}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" showCloseButton={false} className="gap-0 overflow-y-auto overscroll-none bg-background p-0 pb-[env(safe-area-inset-bottom)] data-[side=right]:w-full data-[side=right]:max-sm:border-l-0 data-[side=right]:sm:max-w-md">
          <SheetHeader className="border-b border-border p-5 pt-[max(var(--inset-top),20px)] pr-14">
            <SheetClose
              aria-label="Close"
              className="absolute top-[max(var(--inset-top),12px)] right-3 grid size-10 place-items-center rounded-lg text-muted-foreground outline-none transition-[background-color,color] duration-150 ease-standard hover:bg-foreground/[0.05] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <X aria-hidden className="size-5" strokeWidth={1.75} />
            </SheetClose>
            <div className="flex items-center gap-3">
              <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-foreground/[0.07] text-[17px] font-semibold">
                {p.name.trim()[0]?.toUpperCase()}
              </span>
              <div className="min-w-0">
                <SheetTitle className="truncate text-[17px]">{p.name}</SheetTitle>
                <SheetDescription className="truncate">{p.email}</SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="grid gap-4 p-5">
            <Group title="Details">
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-[14px]">
                <dt className="text-muted-foreground">Role</dt>
                <dd className="text-right">
                  <Pill tone={admin || p.role === "owner" ? "coach" : "neutral"}>{admin ? "Admin" : ROLE[p.role]}</Pill>
                </dd>
                <dt className="text-muted-foreground">Username</dt>
                <dd className="min-w-0 truncate text-right">{p.username ? `@${p.username}` : "Not set"}</dd>
                <dt className="text-muted-foreground">Joined</dt>
                <dd className="text-right">{shortDate(p.createdAt)}</dd>
                <dt className="text-muted-foreground">Last active</dt>
                <dd className="text-right">{p.lastSeen ? relative(p.lastSeen, now) : "Not signed in"}</dd>
                <dt className="text-muted-foreground">Signed in on</dt>
                <dd className="text-right font-numeric tabular-nums">{p.sessions === 1 ? "1 device" : `${p.sessions} devices`}</dd>
                <dt className="text-muted-foreground">Google</dt>
                <dd className="text-right">{p.google ? <Pill tone="good">Connected</Pill> : <Pill>Not yet</Pill>}</dd>
                <dt className="text-muted-foreground">AI coach</dt>
                <dd className="text-right">{p.coachReady ? <Pill tone="coach">Set up</Pill> : <span className="text-muted-foreground">Not set up</span>}</dd>
              </dl>
            </Group>

            {!manageable && (
              <p className="rounded-xl bg-foreground/[0.04] p-4 text-[13px] leading-[18px] text-pretty text-muted-foreground">
                {p.role === "owner"
                  ? "Owners are set in .env (ADMIN_EMAILS) and are changed there, not here."
                  : "This is you. Change your own account in Settings › Account."}
              </p>
            )}

            {manageable && (
              <>
                <Group title="Access">
                  <div className="grid gap-3">
                    <Row title="Admin" body="Can open this dashboard: people, invites, access and the coach’s wording.">
                      <Switch checked={admin} disabled={pending} onCheckedChange={toggleAdmin} aria-label={`Admin: ${p.name}`} />
                    </Row>
                    <Row title="AI coach" body={chosen ? "Can set up the coach with their own key." : "Set for everyone on the Access page."}>
                      {chosen ? <CoachSwitch id={p.id} name={p.name} allowed={p.coachAllowed} /> : <span className="text-[13px] text-muted-foreground">Server-wide</span>}
                    </Row>
                  </div>
                </Group>

                <Group title="Sign-in">
                  <div className="grid gap-3">
                    <Row title="Sign out everywhere" body="Ends every session. They sign in again with their password.">
                      <button type="button" disabled={pending || p.sessions === 0} onClick={() => setConfirm("signout")} className={BTN.outline}>
                        <LogOut aria-hidden />
                        Sign out
                      </button>
                    </Row>
                    <Row title="Reset password" body={canReset ? "Sets a temporary password you send them, and signs them out everywhere." : "Only an owner (ADMIN_EMAILS) can reset passwords."}>
                      <button type="button" disabled={pending || !canReset} onClick={() => (setTemp(null), setCopied(false), setConfirm("reset"))} className={BTN.outline}>
                        <KeyRound aria-hidden />
                        Reset
                      </button>
                    </Row>
                  </div>
                </Group>

                <Group title="Danger zone" tone="danger">
                  <Row title="Delete account" body={admin ? "Remove admin first." : "Removes the account and all its data. This can’t be undone."}>
                    <button type="button" disabled={pending || admin} onClick={() => setConfirm("delete")} aria-label={`Delete ${p.name}`} className={BTN.danger}>
                      <Trash2 aria-hidden />
                      Delete
                    </button>
                  </Row>
                </Group>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Confirm
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Delete ${p.name}’s account?`}
        body="Removes the account and everything Pulse stored for it: synced data, scores, journal, coach chats, profile and the Google connection. This can’t be undone."
        action="Delete account"
        danger
        pending={pending}
        onConfirm={remove}
      />
      <Confirm
        open={confirm === "signout"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Sign ${p.name} out everywhere?`}
        body="Every device they’re signed in on is signed out. Their data stays."
        action="Sign out everywhere"
        pending={pending}
        onConfirm={signOut}
      />
      <Confirm
        open={confirm === "reset"}
        onOpenChange={(o) => !o && (setConfirm(null), setTemp(null))}
        title={temp ? "Temporary password" : `Reset ${p.name}’s password?`}
        body={
          temp
            ? "Send it to them privately. It isn’t shown again. They sign in with it, then change it in Settings › Account."
            : "Their current password stops working and they’re signed out everywhere. You get a temporary password to send them."
        }
        action={temp ? "Done" : "Reset password"}
        pending={pending}
        onConfirm={temp ? () => (setConfirm(null), setTemp(null)) : reset}
      >
        {temp && (
          <div className="flex items-center gap-2">
            <input readOnly value={temp} aria-label="Temporary password" onFocus={(e) => e.currentTarget.select()} className="h-10 min-w-0 flex-1 rounded-md bg-secondary px-3 font-mono text-[14px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />
            <button type="button" onClick={copy} className={cn(BTN.outline, "h-10")}>
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
      </Confirm>
    </>
  )
}
