// Which collapsible page sections a browser has folded (CollapsibleSection): a cookie, so the server renders them folded.

export const FOLDED_COOKIE = "pulse-collapsed"

/** Section ids in the cookie's value. */
export const parseFolded = (v: string | undefined) => new Set((v ?? "").split(",").filter(Boolean))

/** The cookie's next value after a section opens or folds. */
export const nextFolded = (v: string | undefined, id: string, open: boolean) => {
  const ids = parseFolded(v)
  if (open) ids.delete(id)
  else ids.add(id)
  return [...ids].join(",")
}
