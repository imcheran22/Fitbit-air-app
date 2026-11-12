"use client"

import { ProfileForm, SaveButton } from "@/components/profile/ProfileForm"
import { AuthShell } from "@/components/shells/AuthShell"

/**
 * First run: only what Google can't tell us. Its Health profile has an age in whole years but no birth date
 * and no sex; height and weight come from Google data later, max HR is estimated. The time zone is the
 * browser's, one tap to change.
 */
export function Onboarding() {
  return (
    <AuthShell align="top">
      <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.02em] text-balance">Two things Google doesn’t share</h1>
      <p className="mt-2 mb-7 text-[16px] leading-6 text-pretty text-foreground-secondary">Pulse scores your heart rate against your age and sex. You can change these later in Settings.</p>
      <ProfileForm
        onboarding
        defaults={{ birthDate: "", sex: null, maxHr: null, heightCm: null, timeZone: null }}
        footer={(pending) => (
          <div className="mt-2 pb-[max(env(safe-area-inset-bottom),24px)]">
            <SaveButton pending={pending} label="Save and continue" />
          </div>
        )}
      />
    </AuthShell>
  )
}
