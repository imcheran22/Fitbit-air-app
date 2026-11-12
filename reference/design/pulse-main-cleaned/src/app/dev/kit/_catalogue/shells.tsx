import Link from "next/link"
import { BookOpen, CalendarRange, Code, HeartPulse, Maximize2, Timer } from "lucide-react"
import * as fx from "@/components/__fixtures__/kit"
import { MetricTags } from "@/components/metrics/primitives"
import { DateSwitcher } from "@/components/shells/DateSwitcher"
import { EmptyState } from "@/components/shells/EmptyState"
import { InfoButton } from "@/components/shells/InfoButton"
import { LinkList } from "@/components/shells/LinkList"
import { MetricState } from "@/components/shells/MetricState"
import { SectionShell } from "@/components/shells/SectionShell"
import { ShellStatusProvider } from "@/components/shells/ShellStatus"
import { SyncNowButton } from "@/components/shells/SyncNowButton"
import { DemoChip, SyncStatus } from "@/components/shells/TopBar"
import { UserAvatar } from "@/components/shells/UserAvatar"
import { REASON_CODES, type Metric } from "@/lib/reasons"
import { SheetDemo } from "../Islands"
import type { KitEntry } from "./types"

const INFO = { title: "What shaped it", body: <p>Each bar is one input&apos;s effect on today&apos;s Recovery, in points.</p> }
const LINK = "underline underline-offset-4 hover:text-foreground"

const metricStates: [string, Metric<number> | null | undefined][] = [
  ["loading", undefined],
  ["empty", null],
  ["provisional", fx.ok(58, { provisional: true })],
  ["value", fx.ok(72, { tags: ["updated"] })],
  ["non-finite", fx.ok(Number.NaN)],
  ...REASON_CODES.map((r): [string, Metric<number>] => [r, fx.why<number>(r, 4)]),
]

/** Shells that only exist as a whole page: where to see each one. */
const PAGE_SHELLS: [string, string, React.ReactNode][] = [
  ["AppShell, AppNav", "The frame, tab bar, rail and sidebar", "Around this page"],
  ["PageShell, TitleHeader", "Tab roots: header, content column", "This page"],
  ["HomeHeader, CollapsingHeader", "Home's collapsing header and ring row", <Link key="h" className={LINK} href="/dev/kit/home">/dev/kit/home</Link>],
  ["DetailShell, DetailHeader", "Detail screens: hero, notch, summary", <Link key="d" className={LINK} href="/dev/kit/detail">/dev/kit/detail</Link>],
  ["CalendarPanel", "The month calendar behind the date pill", "Open the date pill above"],
  ["AuthShell", "Sign-in and onboarding frame", <Link key="l" className={LINK} href="/login">/login</Link>],
  ["ShellStatusProvider", "Sync and connection status for every shell", "Wraps the SyncStatus and ConnectionBanner specimens"],
]

export const SHELLS: KitEntry[] = [
  {
    id: "section-shell",
    name: "SectionShell",
    file: "src/components/shells/SectionShell.tsx",
    use: "Every titled block: page-level sections and cards, with info, a View all link or a whole-card link.",
    props: ["variant: section | card", "title, level, id", "info", "action: { label, href } | node", "aside", "href (whole-card link)", "fill"],
    states: [
      {
        name: "section with aside and action",
        node: (
          <SectionShell variant="section" title="Key statistics" aside="vs. 30-day average" action={{ label: "View all", href: "/trends" }}>
            <p className="text-[15px] leading-[22px] text-foreground-secondary">Section body.</p>
          </SectionShell>
        ),
      },
      {
        name: "card with info and an icon action",
        node: (
          <SectionShell
            variant="card"
            title="Today's activities"
            info={INFO}
            action={
              <Link href="/strain" aria-label="Open Strain" className="relative -my-2 -mr-2 grid size-10 place-items-center rounded-full text-foreground-secondary outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
                <Maximize2 aria-hidden className="size-[18px]" strokeWidth={1.75} />
              </Link>
            }
          >
            <p className="text-[15px] leading-[22px] text-foreground-secondary">Card body.</p>
          </SectionShell>
        ),
      },
      {
        name: "whole-card link, tags aside",
        node: (
          <SectionShell variant="card" title="Energy Bank" href="/" aside={<MetricTags provisional />}>
            <p className="text-[15px] leading-[22px] text-foreground-secondary">The whole card presses in.</p>
          </SectionShell>
        ),
      },
      {
        name: "long title at 320 px",
        narrow: true,
        node: (
          <SectionShell variant="card" title="Heart rate variability during sleep" info={INFO} action={{ label: "View all", href: "/trends" }}>
            <p className="text-[15px] leading-[22px] text-foreground-secondary">Card body.</p>
          </SectionShell>
        ),
      },
    ],
  },
  {
    id: "empty-state",
    name: "EmptyState",
    file: "src/components/shells/EmptyState.tsx",
    use: "Lists and screens with nothing to show yet, and error screens with a retry.",
    props: ["body (one line)", "icon", "action: { label, href | onClick }"],
    states: [
      { name: "icon and action", node: <EmptyState icon={Timer} body="Couldn't load this screen." action={{ label: "Try again", href: "/dev/kit" }} /> },
      { name: "body only", node: <EmptyState body="No activities yet today. Workouts appear after Fitbit syncs them." /> },
      { name: "at 320 px", narrow: true, node: <EmptyState icon={CalendarRange} body="No data for this week." action={{ label: "Open this week", href: "/reports" }} /> },
    ],
  },
  {
    id: "metric-state",
    name: "MetricState",
    file: "src/components/shells/MetricState.tsx",
    use: "The only branch on data state: loading, empty, reason, provisional, value. Every metric renders through it.",
    props: ["metric: Metric<T> | null | undefined", "skeleton", "empty", "reasonSize: sm | md | lg", "renderReason", "children(value, meta)"],
    states: [
      {
        name: "every state, sm reasons",
        full: true,
        node: (
          <div className="grid gap-x-8 gap-y-2 text-[15px] leading-[22px] md:grid-cols-2">
            {metricStates.map(([name, metric]) => (
              <div key={name} className="flex min-h-8 items-center justify-between gap-3">
                <span className="text-muted-foreground">{name}</span>
                <MetricState
                  metric={metric}
                  skeleton={<span className="h-4 w-12 animate-pulse rounded-sm bg-muted motion-reduce:animate-none" />}
                  reasonSize="sm"
                  empty={<span className="text-muted-foreground">No history</span>}
                >
                  {(v, meta) => (
                    <span className="flex items-center gap-2">
                      <span className="font-numeric font-bold tabular-nums">{v}%</span>
                      <MetricTags provisional={meta.provisional} tags={meta.tags} />
                    </span>
                  )}
                </MetricState>
              </div>
            ))}
          </div>
        ),
      },
    ],
  },
  {
    id: "sync-status",
    name: "SyncStatus, DemoChip",
    file: "src/components/shells/TopBar.tsx",
    use: "The header's sync battery and the Demo chip; More shows the line variant.",
    props: ["SyncStatus variant: header | icon | line", "reads ShellStatus: sync, mode, connection"],
    states: [
      ...fx.googleStatuses.map(({ name, status }) => ({
        name,
        node: (
          <ShellStatusProvider value={status}>
            <div className="@container flex items-center gap-2">
              <SyncStatus />
              <DemoChip />
            </div>
          </ShellStatusProvider>
        ),
      })),
      {
        name: "demo, syncing",
        node: (
          <ShellStatusProvider value={{ ...fx.status, sync: { state: "syncing", lastSuccessAt: fx.status.sync.lastSuccessAt } }}>
            <div className="@container flex items-center gap-2">
              <SyncStatus />
              <DemoChip />
            </div>
          </ShellStatusProvider>
        ),
      },
    ],
  },
  {
    id: "sync-now-button",
    name: "SyncNowButton",
    file: "src/components/shells/SyncNowButton.tsx",
    use: "Settings and the connection banner: runs a sync now (demo mode reseeds today).",
    props: ["size: touch | sm", "className"],
    states: [
      {
        name: "touch and sm",
        node: (
          <div className="flex flex-wrap items-center gap-3">
            <SyncNowButton />
            <SyncNowButton size="sm" />
          </div>
        ),
      },
    ],
  },
  {
    id: "date-switcher",
    name: "DateSwitcher",
    file: "src/components/shells/DateSwitcher.tsx",
    use: "The date pill (Home, Journal, Reports) and the in-header date title (Recovery, Strain, Sleep); opens CalendarPanel.",
    props: ["mode: day | week", "placement: body | header", "calendar: recovery | strain | sleep", "narrow"],
    states: [
      { name: "day pill", center: true, node: <DateSwitcher mode="day" /> },
      { name: "week pill", center: true, node: <DateSwitcher mode="week" /> },
      { name: "header title (Strain calendar)", center: true, node: <DateSwitcher mode="day" placement="header" calendar="strain" /> },
      { name: "narrow pill at 320 px", narrow: true, center: true, node: <DateSwitcher mode="day" narrow /> },
    ],
  },
  {
    id: "info-button",
    name: "InfoButton, InfoDialog",
    file: "src/components/shells/InfoButton.tsx",
    use: "Every “i”: card headers (card) and detail headers (header). Opens the centred info card.",
    props: ["info: { title, body, icon?, chip?, action? }", "label", "variant: card | header"],
    states: [
      { name: "card", center: true, node: <InfoButton variant="card" label="What shaped it" info={INFO} /> },
      {
        name: "header, with icon, chip and action",
        center: true,
        node: (
          <InfoButton
            variant="header"
            label="Respiratory rate"
            info={{
              title: "Respiratory rate",
              icon: <HeartPulse className="size-7" strokeWidth={1.5} />,
              chip: { tone: "optimal", text: "Within 14.1 - 16.9" },
              body: <p>Breaths per minute while you sleep, against your own normal range.</p>,
              action: { label: "Open trend view", href: "/trends" },
            }}
          />
        ),
      },
    ],
  },
  {
    id: "link-list",
    name: "LinkList",
    file: "src/components/shells/LinkList.tsx",
    use: "More, Settings and the Reports archive: a caps group label over 56 px rows.",
    props: ["title", "rows: { label, href, icon?, aside?, description?, external? }[]", "columns: 2"],
    states: [
      {
        name: "icons, aside, description, external",
        node: (
          <LinkList
            title="Learn"
            rows={[
              { label: "How Pulse works", href: "/more/how-it-works", icon: BookOpen, description: "How each score is made" },
              { label: "Weekly report", href: "/reports", icon: CalendarRange, aside: "Sep 22 - Sep 28" },
              { label: "Source code", href: "https://github.com/adityaongit/pulse", icon: Code, external: true },
            ]}
          />
        ),
      },
      {
        name: "long label at 320 px",
        narrow: true,
        node: <LinkList title="Data" rows={[{ label: "Export everything Pulse has stored", href: "/more/data", icon: BookOpen, aside: "CSV" }]} />,
      },
    ],
  },
  {
    id: "responsive-sheet",
    name: "ResponsiveSheet",
    file: "src/components/shells/ResponsiveSheet.tsx",
    use: "Every sheet: a bottom drawer on phone, a side sheet from 768 px (journal entries, vitals, contributors).",
    props: ["open, onOpenChange", "title, description", "footer", "size: default | tall", "fallbackFocus"],
    states: [{ name: "default and tall (opens)", node: <SheetDemo /> }],
  },
  {
    id: "user-avatar",
    name: "UserAvatar",
    file: "src/components/shells/UserAvatar.tsx",
    use: "The account button in the header and on More.",
    props: ["src: string | null", "className"],
    cols: 3,
    states: [
      { name: "photo", center: true, node: <span className="block size-10"><UserAvatar src="/icons/icon-192.png" /></span> },
      { name: "no photo", center: true, node: <span className="block size-10"><UserAvatar src={null} /></span> },
    ],
  },
  {
    id: "page-shells",
    name: "Page shells",
    file: "src/components/shells/",
    use: "Shells that only render as a whole page. Each one is live somewhere in the kit.",
    props: [],
    states: [
      {
        name: "where to see each one",
        full: true,
        node: (
          <dl className="grid gap-x-6 gap-y-3 text-[13px] leading-5 md:grid-cols-[auto_1fr_auto]">
            {PAGE_SHELLS.map(([name, what, where]) => (
              <div key={name} className="contents">
                <dt className="font-semibold text-foreground">{name}</dt>
                <dd className="text-foreground-secondary">{what}</dd>
                <dd className="text-muted-foreground md:text-right">{where}</dd>
              </div>
            ))}
          </dl>
        ),
      },
    ],
  },
]
