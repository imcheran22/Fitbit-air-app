import { crispLayout } from '../../src/components/characters/sprites/scale';

// True when `pt` points is a whole number of device pixels at `dpr`
// (rounded to 1e-6 to absorb float noise such as 1/3 * 3).
const onDevicePixel = (pt: number, dpr: number) =>
  Number.isInteger(Math.round(pt * dpr * 1e6) / 1e6);

describe('crispLayout', () => {
  it.each([18, 20, 36, 40, 52, 56, 64, 72, 120, 180])('%ipt at 2× and 3× uses whole device pixels, centred inside the slot', (pt) => {
    for (const dpr of [2, 3]) {
      const l = crispLayout(pt, dpr);
      expect(Number.isInteger(l.cellPx)).toBe(true);
      expect(l.cellPx).toBeGreaterThanOrEqual(1);
      expect(l.drawnPt).toBeLessThanOrEqual(pt + 1e-9);
      expect(l.offsetPt).toBeCloseTo((pt - l.drawnPt) / 2);
      // offsets land on device pixels too
      expect(onDevicePixel(l.offsetPt, dpr)).toBe(true);
    }
  });

  // Odd device-pixel slack (e.g. 17pt at 3× = 51px, 48px drawn, 3px spare)
  // cannot be split evenly, so the floor keeps the grid on a device pixel and
  // the centre is off by at most one device pixel.
  it.each([17, 19, 25, 53])('%ipt at 3× (odd slack) stays on device pixels, within one pixel of centre, inside the slot', (pt) => {
    const dpr = 3;
    const l = crispLayout(pt, dpr);
    expect(Number.isInteger(l.cellPx)).toBe(true);
    expect(onDevicePixel(l.offsetPt, dpr)).toBe(true);
    expect(Math.abs(l.offsetPt - (pt - l.drawnPt) / 2)).toBeLessThanOrEqual(1 / dpr + 1e-9);
    expect(l.offsetPt).toBeGreaterThanOrEqual(0);
    expect(l.offsetPt + l.drawnPt).toBeLessThanOrEqual(pt + 1e-9);
  });

  // A non-square sprite (36 cells wide, 32 rows) in a slot whose height is
  // slotPt * rows / cells. Both offsets must stay on device pixels and inside.
  it.each([60, 78, 84, 120])('%ipt with 36×32 at 2× and 3× centres vertically on device pixels inside the slot', (pt) => {
    for (const dpr of [2, 3]) {
      const l = crispLayout(pt, dpr, 36, 32);
      const slotHPt = (pt * 32) / 36;
      expect(l.offsetYPt).toBeGreaterThanOrEqual(0);
      expect(l.offsetYPt + l.cellPt * 32).toBeLessThanOrEqual(slotHPt + 1e-9);
      expect(onDevicePixel(l.offsetYPt, dpr)).toBe(true);
      expect(Math.abs(l.offsetYPt - (slotHPt - l.cellPt * 32) / 2)).toBeLessThanOrEqual(1 / dpr + 1e-9);
    }
  });

  it('brute force: integer slots 12–300pt at 2× and 3×, 24×24 and 36×32, offsets are non-negative device pixels and the drawing fits', () => {
    const failures: string[] = [];
    for (const [cells, rows] of [[24, 24], [36, 32]]) {
      for (const dpr of [2, 3]) {
        for (let pt = 12; pt <= 300; pt++) {
          if (pt * dpr < Math.max(cells, rows)) continue; // narrower slots overflow by design
          const l = crispLayout(pt, dpr, cells, rows);
          const slotHPt = (pt * rows) / cells;
          // Exact integer check that each offset is the floor of half the
          // slack, in device pixels: 2·off ≤ slack < 2·(off + 1), with the
          // vertical slack rows·(slotPx − cellPx·cells)/cells scaled by cells.
          const slotPx = pt * dpr;
          const offX = Math.round(l.offsetPt * dpr);
          const offY = Math.round(l.offsetYPt * dpr);
          const slackX = slotPx - l.cellPx * cells;
          const slackYxCells = rows * (slotPx - l.cellPx * cells);
          const exact =
            2 * offX <= slackX && slackX < 2 * (offX + 1) &&
            2 * cells * offY <= slackYxCells && slackYxCells < 2 * cells * (offY + 1);
          const ok =
            exact &&
            Number.isInteger(l.cellPx) &&
            l.cellPx >= 1 &&
            l.offsetPt >= 0 &&
            l.offsetYPt >= 0 &&
            onDevicePixel(l.offsetPt, dpr) &&
            onDevicePixel(l.offsetYPt, dpr) &&
            l.offsetPt + l.drawnPt <= pt + 1e-9 &&
            l.offsetYPt + l.cellPt * rows <= slotHPt + 1e-9 &&
            Math.abs(l.offsetPt - (pt - l.drawnPt) / 2) <= 1 / dpr + 1e-9 &&
            Math.abs(l.offsetYPt - (slotHPt - l.cellPt * rows) / 2) <= 1 / dpr + 1e-9;
          if (!ok) failures.push(`${pt}pt@${dpr}x ${cells}x${rows}: ${JSON.stringify(l)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('matches the spec examples', () => {
    expect(crispLayout(52, 3).cellPx).toBe(6); // 48pt drawn
    expect(crispLayout(18, 3).cellPx).toBe(2); // 16pt drawn
    expect(crispLayout(18, 2).cellPx).toBe(1);
  });

  it('never returns zero, even for tiny slots', () => {
    expect(crispLayout(4, 1).cellPx).toBe(1);
  });

  // CharacterCanvas lays out the attachment stage with
  // crispLayout(size × 36/24, dpr, 36, 32); the coach must keep the cell size
  // it has in its own 24×24 slot, so it doesn't grow or shrink while thinking.
  it('gives the coach the same cell size on the 36×32 attachment stage', () => {
    const failures: string[] = [];
    for (const dpr of [1, 2, 3, 2.625, 3.5]) {
      for (let size = 18; size <= 300; size++) {
        const stage = crispLayout((size * 36) / 24, dpr, 36, 32).cellPx;
        const own = crispLayout(size, dpr).cellPx;
        if (stage !== own) failures.push(`${size}pt@${dpr}x: ${stage} vs ${own}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
