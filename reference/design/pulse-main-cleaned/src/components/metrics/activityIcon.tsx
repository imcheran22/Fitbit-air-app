import { Bike, Dumbbell, Footprints, PersonStanding, Timer, type LucideIcon } from "lucide-react"

export type ActivityKind = "run" | "ride" | "walk" | "strength" | "workout"

/** Lucide marks for a workout. Kept out of ActivityCard so a Server Component can render one. */
export const ACTIVITY_ICON: Record<ActivityKind, LucideIcon> = {
  run: PersonStanding,
  ride: Bike,
  walk: Footprints,
  strength: Dumbbell,
  workout: Timer,
}
