"use client"

import * as React from "react"
import { History, LoaderCircle, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { saveCoachTextAction } from "@/server/actions/admin"
import type { TextVersion } from "@/server/coach/texts"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { run } from "./AdminClient"
import { Pill, relative } from "./ui"

export type TextField = { key: string; label: string; current: string; def: string; max: number }

/** Saved versions as the browser gets them, newest first, for one key. */
type Versions = Omit<TextVersion, "key">[]

/**
 * One editable piece of the coach's wording: a textarea, its state (default or edited, by whom, when), Save and
 * Discard while dirty, Reset to default, and the version history with Restore. Every save is a new version.
 */
export function TextEditor({ field, versions, now, rows = 3, mono, hint }: { field: TextField; versions: Versions; now: number; rows?: number; mono?: boolean; hint?: React.ReactNode }) {
  const [value, setValue] = React.useState(field.current)
  const [pending, start] = React.useTransition()
  const [history, setHistory] = React.useState(false)
  // The parent keys this editor on the newest version, so a save elsewhere (another tab, a restore) starts it fresh.
  const dirty = value.trim() !== field.current
  const isDefault = field.current === field.def
  const latest = versions[0]
  const over = value.length > field.max
  const save = (text: string, done: string) =>
    start(async () => {
      if (await run(saveCoachTextAction(field.key, text))) {
        setValue(text)
        setHistory(false)
        toast.success(done)
      }
    })
  const id = `text-${field.key.replace(/\W/g, "-")}`
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13px] leading-[18px] font-medium text-foreground-secondary">
          {field.label}
        </label>
        <span className="flex min-w-0 items-center gap-1">
          {isDefault ? <Pill>Default</Pill> : <Pill tone="coach">Edited{latest ? ` ${relative(latest.createdAt * 1000, now).toLowerCase()}${latest.by ? ` by ${latest.by}` : ""}` : ""}</Pill>}
          {versions.length > 0 && (
            <Button type="button" variant="ghost" onClick={() => setHistory(true)} className="h-8 gap-1.5 rounded-lg px-2 text-[13px] font-medium text-muted-foreground hover:text-foreground pointer-coarse:h-10">
              <History aria-hidden className="size-4" />
              {versions.length}
              <span className="sr-only">{versions.length === 1 ? "version" : "versions"} of {field.label}</span>
            </Button>
          )}
        </span>
      </div>
      <textarea
        id={id}
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        rows={rows}
        spellCheck
        aria-invalid={over || undefined}
        className={cn(
          "field-sizing-content min-h-16 w-full resize-y rounded-xl bg-secondary px-3.5 py-2.5 text-[14px] leading-[21px] text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:ring-2 aria-invalid:ring-recovery-red/60",
          mono && "font-mono text-[13px] leading-5",
        )}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] leading-4 text-muted-foreground">
          {hint}
          {hint && " · "}
          <span className={cn("font-numeric tabular-nums", over && "font-semibold text-recovery-red-text")}>
            {value.length.toLocaleString()} / {field.max.toLocaleString()}
          </span>
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {!isDefault && !dirty && (
            <Button type="button" variant="ghost" disabled={pending} onClick={() => save(field.def, "Back to the default.")} className="h-9 gap-1.5 rounded-lg px-3 text-[13px] font-medium text-muted-foreground hover:text-foreground pointer-coarse:h-10">
              <RotateCcw aria-hidden className="size-3.5" />
              Reset to default
            </Button>
          )}
          {dirty && (
            <>
              <Button type="button" variant="ghost" disabled={pending} onClick={() => setValue(field.current)} className="h-9 rounded-lg px-3 text-[13px] font-medium pointer-coarse:h-10">
                Discard
              </Button>
              <Button type="button" disabled={pending || over || !value.trim()} onClick={() => save(value.trim(), "Saved. The coach uses it from the next message.")} className="h-9 rounded-lg px-4 text-[13px] font-semibold pointer-coarse:h-10">
                {pending && <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" />}
                Save
              </Button>
            </>
          )}
        </span>
      </div>

      <Dialog open={history} onOpenChange={setHistory}>
        <DialogContent className="max-h-[85svh] overflow-y-auto ring-1 ring-border sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{field.label}: versions</DialogTitle>
            <DialogDescription>Newest first. Restoring saves that text again as the newest version.</DialogDescription>
          </DialogHeader>
          <ol className="grid gap-3">
            {versions.map((v, i) => (
              <li key={v.id} className="rounded-xl p-3 ring-1 ring-border">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[13px] text-muted-foreground">
                    {relative(v.createdAt * 1000, now)}
                    {v.by && ` · ${v.by}`}
                    {i === 0 && " · in use"}
                  </span>
                  {i > 0 && v.body !== field.current && (
                    <Button type="button" variant="secondary" disabled={pending} onClick={() => save(v.body, "Version restored.")} className="h-8 rounded-lg px-3 text-[13px] font-medium pointer-coarse:h-10">
                      Restore
                    </Button>
                  )}
                </div>
                <p className={cn("max-h-48 overflow-y-auto text-[13px] leading-5 whitespace-pre-wrap text-foreground-secondary", mono && "font-mono")}>{v.body}</p>
              </li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>
    </div>
  )
}
