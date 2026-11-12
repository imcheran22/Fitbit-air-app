import * as React from "react"

const BULLET = /^\s*[-*•] /
const NUMBERED = /^\s*\d+[.)] /

/**
 * The coach's answer text: paragraphs, "- " or "1. " lists and **bold**, nothing else (the instructions ask for
 * that). A list may follow its lead-in line inside one block ("Here is the plan:\n- …"). Built from strings into React
 * elements, so model output is never parsed as HTML.
 */
export function Prose({ text }: { text: string }) {
  const out: React.ReactNode[] = []
  text
    .trim()
    .split(/\n{2,}/)
    .forEach((block, i) => {
      // Runs of consecutive lines of one kind: a paragraph, a bullet list or a numbered list.
      let run: { kind: "p" | "ul" | "ol"; lines: string[] } | null = null
      const flush = (j: number) => {
        if (!run) return
        const key = `${i}-${j}`
        if (run.kind === "p") out.push(<p key={key}>{inline(run.lines.join(" "))}</p>)
        else {
          const List = run.kind
          out.push(
            <List key={key} className={List === "ul" ? "list-disc space-y-1.5 pl-5 marker:text-muted-foreground" : "list-decimal space-y-1.5 pl-6 marker:text-muted-foreground marker:tabular-nums"}>
              {run.lines.map((l, k) => (
                <li key={k} className="pl-1">
                  {inline(l.replace(List === "ul" ? BULLET : NUMBERED, ""))}
                </li>
              ))}
            </List>,
          )
        }
        run = null
      }
      block
        .split("\n")
        .filter((l) => l.trim())
        .forEach((l, j) => {
          const kind = BULLET.test(l) ? "ul" : NUMBERED.test(l) ? "ol" : "p"
          if (run?.kind !== kind) flush(j)
          run ??= { kind, lines: [] }
          run.lines.push(l.trim())
        })
      flush(-1)
    })
  return <div className="space-y-3 text-[15px] leading-6 text-pretty text-foreground">{out}</div>
}

/** `**bold**` spans; an unclosed `**` (mid-stream) stays as text. */
function inline(s: string): React.ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  )
}
