import { RefreshCw, TriangleAlert } from "lucide-react"
import { BandIcon } from "@/components/brand/BandIcon"
import { GoogleFit } from "@/components/brand/GoogleFit"
import { GoogleG } from "@/components/brand/GoogleG"
import { Mark } from "@/components/brand/Mark"
import { Wordmark } from "@/components/brand/Wordmark"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Skeleton, SkeletonText } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { OverlayDemo, SegmentedDemo } from "../Islands"
import type { KitEntry } from "./types"

const FIELD = "h-11 text-base tabular-nums"

export const BRAND: KitEntry[] = [
  {
    id: "wordmark",
    name: "Wordmark",
    file: "src/components/brand/Wordmark.tsx",
    use: "Home's top row, inside every lg ScoreDial, the sign-in frame. Never “PULSE” set in a font (brand.md).",
    props: ["weight: bold | black", "className (height sets the size)", "title"],
    cols: 3,
    states: [
      { name: "bold at the brand minimum (h 15 px), Home tone", center: true, node: <Wordmark className="h-[15px] text-foreground-secondary" /> },
      { name: "bold, header (h 17 px)", center: true, node: <Wordmark className="h-[17px]" /> },
      { name: "black, splash (h 40 px)", center: true, node: <Wordmark weight="black" className="h-10" /> },
      {
        name: "lockup: mark at 1.6x the cap height, gap 0.6x",
        center: true,
        node: (
          <span className="flex items-center gap-2.5">
            <Mark className="size-7" />
            <Wordmark className="h-[17px]" />
          </span>
        ),
      },
    ],
  },
  {
    id: "mark",
    name: "Mark",
    file: "src/components/brand/Mark.tsx",
    use: "The app icon's two beats: sign-in (animated), the favicon and PWA icons repeat its geometry.",
    props: ["color: brand | mono", "animated", "className (size)", "title"],
    cols: 3,
    states: [
      {
        name: "brand at 16, 24 and 48 px",
        center: true,
        node: (
          <span className="flex items-end gap-4">
            <Mark className="size-4" />
            <Mark />
            <Mark className="size-12" />
          </span>
        ),
      },
      { name: "mono", center: true, node: <Mark color="mono" className="size-12 text-foreground-secondary" /> },
      { name: "animated (still under reduced motion)", center: true, node: <Mark animated className="size-12" /> },
    ],
  },
  {
    id: "brand-icons",
    name: "BandIcon, GoogleG, GoogleFit",
    file: "src/components/brand/",
    use: "The band glyph in sync status and onboarding; Google's marks on the connect buttons.",
    props: ["className (size)", "BandIcon strokeWidth"],
    cols: 3,
    states: [
      { name: "BandIcon", center: true, node: <BandIcon className="size-8" /> },
      { name: "GoogleG", center: true, node: <GoogleG className="size-8" /> },
      { name: "GoogleFit", center: true, node: <GoogleFit className="size-8" /> },
    ],
  },
]

export const PRIMITIVES: KitEntry[] = [
  {
    id: "button",
    name: "Button",
    file: "src/components/ui/button.tsx",
    use: "Every action. Content and sheets use the touch sizes (44 px); sheet footers use the sheet pill.",
    props: ["variant: default | secondary | outline | ghost | destructive | link | outline-pill", "size: touch | icon-touch | sheet | sm | default", "asChild", "disabled"],
    states: [
      {
        name: "variants, touch size",
        full: true,
        node: (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="touch">Save</Button>
            <Button size="touch" variant="secondary">
              Cancel
            </Button>
            <Button size="touch" variant="outline">
              Export
            </Button>
            <Button size="touch" variant="ghost">
              Skip
            </Button>
            <Button size="touch" variant="destructive">
              Delete
            </Button>
            <Button size="touch" variant="outline-pill">
              Open trend view
            </Button>
            <Button size="touch" variant="link">
              Learn more
            </Button>
          </div>
        ),
      },
      {
        name: "icon, with an icon, disabled",
        node: (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="icon-touch" variant="secondary" aria-label="Sync now">
              <RefreshCw />
            </Button>
            <Button size="touch" variant="secondary">
              <RefreshCw data-icon="inline-start" />
              Sync now
            </Button>
            <Button size="touch" disabled>
              Saving
            </Button>
          </div>
        ),
      },
      { name: "sheet pill at 320 px", narrow: true, node: <Button size="sheet">Save entry</Button> },
    ],
  },
  {
    id: "badge",
    name: "Badge",
    file: "src/components/ui/badge.tsx",
    use: "Under Tag (outline). Data colour never goes on a badge.",
    props: ["variant: default | secondary | outline | destructive | ghost | link"],
    states: [
      {
        name: "variants",
        node: (
          <div className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="destructive">Destructive</Badge>
          </div>
        ),
      },
    ],
  },
  {
    id: "card",
    name: "Card",
    file: "src/components/ui/card.tsx",
    use: "The card material under SectionShell cards and summary lists (CARD_MATERIAL).",
    props: ["className", "CardHeader, CardTitle, CardContent, CardFooter"],
    states: [
      {
        name: "plain card (ring-0, as the summary cards use it)",
        node: (
          <Card className="gap-1 p-4 ring-0">
            <p className="text-[15px] leading-[22px] font-semibold">Card</p>
            <p className="text-[15px] leading-[22px] text-foreground-secondary">The gradient material with its top highlight.</p>
          </Card>
        ),
      },
    ],
  },
  {
    id: "skeleton",
    name: "Skeleton, SkeletonText",
    file: "src/components/ui/skeleton.tsx",
    use: "Every .Skeleton: blocks for shapes, text bars sized in ch at the real type size.",
    props: ["Skeleton className", "SkeletonText className (font size and width)"],
    states: [
      {
        name: "block and text bars",
        node: (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-2xl" />
            <SkeletonText className="w-[12ch] text-xs" />
            <SkeletonText className="w-[3ch] font-numeric text-[32px] font-bold" />
          </div>
        ),
      },
    ],
  },
  {
    id: "toggle-group",
    name: "ToggleGroup",
    file: "src/components/ui/toggle-group.tsx",
    use: "Segmented controls: Journal Insights' outcome, Reports' period, the trend range toggle.",
    props: ["type: single", "value, onValueChange", "spacing", "ToggleGroupItem value"],
    states: [{ name: "segmented (interactive)", center: true, node: <SegmentedDemo /> }],
  },
  {
    id: "alert",
    name: "Alert",
    file: "src/components/ui/alert.tsx",
    use: "Inline form errors in the journal check-in and log.",
    props: ["variant: default | destructive", "role", "AlertTitle, AlertDescription"],
    states: [
      {
        name: "form error, as the check-in shows it",
        node: (
          <Alert role="alert" className="border-0 bg-recovery-red/15 px-3 py-2">
            <TriangleAlert />
            <AlertTitle>Couldn&apos;t save</AlertTitle>
            <AlertDescription>Check your connection and try again.</AlertDescription>
          </Alert>
        ),
      },
      {
        name: "default",
        node: (
          <Alert>
            <AlertTitle>Import running</AlertTitle>
            <AlertDescription>42 of 180 days imported.</AlertDescription>
          </Alert>
        ),
      },
    ],
  },
  {
    id: "input",
    name: "Input, Label",
    file: "src/components/ui/input.tsx",
    use: "The journal log form, onboarding and settings fields: 44 px tall, 16 px text (no iOS zoom).",
    props: ["type, inputMode", "aria-invalid", "disabled", "Label htmlFor"],
    states: [
      {
        name: "default, invalid, disabled",
        node: (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="kit-ml">Water (ml)</Label>
              <Input id="kit-ml" inputMode="numeric" placeholder="e.g. 330" className={FIELD} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="kit-kg">Weight (kg)</Label>
              <Input id="kit-kg" inputMode="decimal" defaultValue="7000" aria-invalid aria-describedby="kit-kg-err" className={FIELD} />
              <p id="kit-kg-err" className="text-xs leading-4 font-medium text-recovery-red-text">Enter a weight between 20 and 400 kg.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="kit-off">Disabled</Label>
              <Input id="kit-off" disabled defaultValue="Synced from Google" className={FIELD} />
            </div>
          </div>
        ),
      },
    ],
  },
  {
    id: "progress-switch",
    name: "Progress, Switch",
    file: "src/components/ui/progress.tsx, switch.tsx",
    use: "Import progress and Journal Insights' days logged; behaviour visibility on More.",
    props: ["Progress value, aria-label", "Switch checked, onCheckedChange, disabled"],
    states: [
      {
        name: "progress 0, 42, 100",
        node: (
          <div className="space-y-3">
            {[0, 42, 100].map((v) => (
              <Progress key={v} value={v} aria-label={`${v} percent`} className="h-1.5 bg-muted" />
            ))}
          </div>
        ),
      },
      {
        name: "switch off, on, disabled",
        node: (
          <div className="flex items-center gap-4">
            <Switch aria-label="Off" />
            <Switch aria-label="On" defaultChecked />
            <Switch aria-label="Disabled" disabled />
          </div>
        ),
      },
    ],
  },
  {
    id: "overlays",
    name: "Tooltip, Popover",
    file: "src/components/ui/tooltip.tsx, popover.tsx",
    use: "Tooltips on icon controls; the birth date picker's popover. Dialog, Sheet and Drawer sit under InfoButton and ResponsiveSheet.",
    props: ["Tooltip, TooltipTrigger, TooltipContent", "Popover, PopoverTrigger, PopoverContent"],
    states: [{ name: "hover or open", center: true, node: <OverlayDemo /> }],
  },
]
