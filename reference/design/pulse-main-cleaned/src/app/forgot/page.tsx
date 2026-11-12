import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { Mail } from "lucide-react"
import { getConfig } from "@/server/config"
import { AUTH_FOOTNOTE, AUTH_LINK, AuthHero } from "@/components/auth/AuthHero"
import { AuthShell } from "@/components/shells/AuthShell"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = { title: "Forgot password" }

const GUIDE = "https://github.com/adityaongit/pulse/blob/main/docs/admin.md#reset-a-password"

/** A prefilled request, so the admin gets the one thing they need: which account. */
const mailto = (to: string) =>
  `mailto:${to}?${new URLSearchParams({
    subject: "Pulse password reset",
    body: "Hi,\n\nPlease reset the password for my Pulse account.\n\nMy username or email: \n\nThanks!",
  })
    .toString()
    .replaceAll("+", "%20")}`

/**
 * Forgot password `/forgot`. Pulse sends no email, so whoever runs the server sets a temporary password (the command is
 * in docs/setup.md, not on this page). SUPPORT_EMAIL, when set, becomes a prefilled email to them.
 */
export default async function ForgotPage() {
  // Per request: SUPPORT_EMAIL is runtime config, and a prerendered page would freeze the build's (unset) value.
  await connection()
  const support = getConfig().supportEmail
  const steps = [
    support ? "Email the admin your username or the email you signed up with." : "Ask the person who runs this Pulse to reset your password. Tell them your username or email.",
    "They send you a temporary password, and every device you were signed in on is signed out.",
    "Sign in with it, then choose a new password in Settings › Account.",
  ]
  return (
    <AuthShell>
      <AuthHero compact title="Forgot your password?" body="Pulse doesn’t send email, so the person who runs it resets your password for you." />
      <div className="mt-8 space-y-5">
        <ol className="space-y-4 rounded-2xl bg-secondary p-4" aria-label="How to reset your password">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-background/60 font-numeric text-[13px] leading-none font-bold text-foreground tabular-nums">
                {i + 1}
              </span>
              <span className="min-w-0 pt-0.5 text-[15px] leading-[22px] text-pretty text-foreground-secondary">{step}</span>
            </li>
          ))}
        </ol>
        {support && (
          <div className="space-y-2">
            <Button asChild size="sheet">
              <a href={mailto(support)}>
                <Mail aria-hidden strokeWidth={2} />
                Email the admin
              </a>
            </Button>
            <p className="text-center text-[13px] leading-[18px] break-all text-muted-foreground" translate="no">
              {support}
            </p>
          </div>
        )}
        <p className={AUTH_FOOTNOTE}>
          <Link href="/login" className={AUTH_LINK}>
            Back to sign in
          </Link>
        </p>
        <p className={AUTH_FOOTNOTE}>
          Running your own Pulse?{" "}
          <a href={GUIDE} target="_blank" rel="noreferrer" className={AUTH_LINK}>
            Reset a password from the server
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </p>
      </div>
    </AuthShell>
  )
}
