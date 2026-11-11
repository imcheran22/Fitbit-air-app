export interface CrispLayout {
  /** Device pixels per sprite pixel (always a whole number, at least 1). */
  cellPx: number;
  /** Points per sprite pixel: cellPx / pixelRatio. */
  cellPt: number;
  /** Drawn width in points: cellPt * cells. */
  drawnPt: number;
  /** Left offset in points that centres the drawing, snapped to a device pixel. */
  offsetPt: number;
  /** Top offset in points that centres the drawing, snapped to a device pixel. */
  offsetYPt: number;
}

/**
 * Whole-device-pixel layout for a pixel sprite (spec §2 "Crisp scaling").
 *
 * `slotPt` is the slot WIDTH in points; the slot height is `slotPt * rows / cells`.
 * Everything is computed in whole device pixels and divided by `pixelRatio` once,
 * so float error can never drop or add a device pixel. Slots narrower than
 * `max(cells, rows)` device pixels overflow: `cellPx` is clamped to 1 and the
 * offsets go negative.
 */
export function crispLayout(slotPt: number, pixelRatio: number, cells = 24, rows = cells): CrispLayout {
  // Floor (with a float guard) rather than round, so a slot that is not a whole
  // number of device pixels never gets a drawing past its edge.
  const slotPx = Math.floor(slotPt * pixelRatio + 1e-6);
  const cellPx = Math.max(1, Math.floor(slotPx / Math.max(cells, rows)));
  const cellPt = cellPx / pixelRatio;
  const drawnPt = cellPt * cells;
  // Horizontal slack is slotPx - cellPx*cells; vertical slack is the same scaled
  // by rows/cells (slot height slotPx*rows/cells minus drawn height cellPx*rows).
  // Both halves are floored in integer device pixels so the grid never straddles one.
  const slackPx = slotPx - cellPx * cells;
  const offsetPt = Math.floor(slackPx / 2) / pixelRatio;
  const offsetYPt = Math.floor((rows * slackPx) / (2 * cells)) / pixelRatio;
  return { cellPx, cellPt, drawnPt, offsetPt, offsetYPt };
}
