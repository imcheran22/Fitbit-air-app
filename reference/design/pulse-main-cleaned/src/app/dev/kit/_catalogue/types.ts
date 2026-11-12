import type { ReactNode } from "react"

/** One labelled frame: a single state of a component. */
export type KitState = {
  name: string
  node: ReactNode
  /** Spans the whole row (wide charts, lists of rows). */
  full?: boolean
  /** Renders inside a 320 px column, the narrowest phone Pulse supports. */
  narrow?: boolean
  /** Centres the specimen in its frame (dials, marks). */
  center?: boolean
}

/** One component: what it is, where the app uses it, its key props, and every state it renders. */
export type KitEntry = {
  /** Anchor id, unique on the page. */
  id: string
  name: string
  file: string
  /** One line: where the app uses it. */
  use: string
  props: string[]
  /** 3 for small specimens (dials, chips); default 2. */
  cols?: 2 | 3
  states: KitState[]
}

export type KitGroup = { id: string; title: string; blurb: string; entries: KitEntry[] }
