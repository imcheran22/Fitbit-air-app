// Layout for the night screen's stage lanes: one lane per stage, each stretch
// of a stage a block in its lane, placed by time across the chart's width
// (the approved Night.dc.html mockup's maths). Pure, so it is unit-tested.

import type { StageType } from '../api/sleep';
import { findSleepCycles, midNightBlipIndexes, midNightWakeIndexes, nightEndMs, type StageSegment } from './sleepCycles';

// Top to bottom: the lighter the sleep, the higher its lane.
export const LANE_ORDER: StageType[] = ['AWAKE', 'REM', 'LIGHT', 'DEEP'];
export const LANE_ROW = 44;
export const BLOCK_HEIGHT = 28;
const BLOCK_TOP = (LANE_ROW - BLOCK_HEIGHT) / 2;
const PAD = 2;
// A wake in the night shorter than this is a marker on the awake lane, not a block.
const MARKER_MAX_MS = 10 * 60000;
// Neighbours this close are one continuous stretch, so a link joins them.
const LINK_GAP_MS = 60000;

export interface LaneBlock {
  index: number;
  type: StageType;
  left: number;
  top: number;
  width: number;
  height: number;
  radius: number;
  // Where the block starts through the night, 0..1 (for the entrance stagger).
  at: number;
}

export interface WakeMarker {
  index: number;
  x: number;
  y: number;
  start: string;
  at: number;
}

export interface LaneLink {
  x: number;
  y1: number;
  y2: number;
}

export interface CyclePill {
  n: number;
  left: number;
  width: number;
}

export interface StageLanesLayout {
  height: number;
  blocks: LaneBlock[];
  markers: WakeMarker[];
  links: LaneLink[];
  hourGuides: number[];
  cyclePills: CyclePill[];
  minutes: Record<StageType, number>;
}

/** Top of a stage's block (and of its tinted track). */
export function laneTop(type: StageType): number {
  return LANE_ORDER.indexOf(type) * LANE_ROW + BLOCK_TOP;
}

/**
 * The lanes for `segments` (ordered by start) across `width` px. Hour guides
 * fall on whole local hours, `offset` minutes from UTC (see nightUtcOffset).
 */
export function layoutStageLanes(segments: StageSegment[], width: number, offset: number): StageLanesLayout {
  const height = LANE_ORDER.length * LANE_ROW;
  const minutes: Record<StageType, number> = { AWAKE: 0, REM: 0, LIGHT: 0, DEEP: 0 };
  for (const s of segments) minutes[s.type] += Math.max(0, (Date.parse(s.end) - Date.parse(s.start)) / 60000);
  for (const k of LANE_ORDER) minutes[k] = Math.round(minutes[k]);

  const empty = { height, blocks: [], markers: [], links: [], hourGuides: [], cyclePills: [], minutes };
  if (segments.length === 0 || width <= 0) return empty;
  const t0 = Date.parse(segments[0]!.start);
  const t1 = nightEndMs(segments);
  const span = t1 - t0;
  if (!(span > 0)) return empty;
  const x = (t: number) => PAD + ((t - t0) / span) * (width - 2 * PAD);

  const midNight = midNightWakeIndexes(segments);
  // A wake in the night under half a minute is not drawn, nor linked to.
  const blips = midNightBlipIndexes(segments);
  const blocks: LaneBlock[] = [];
  const markers: WakeMarker[] = [];
  segments.forEach((s, index) => {
    const start = Date.parse(s.start);
    const end = Date.parse(s.end);
    const at = (start - t0) / span;
    if (blips.has(index)) return;
    if (midNight.has(index) && end - start < MARKER_MAX_MS) {
      markers.push({ index, x: x((start + end) / 2), y: laneTop('AWAKE') + BLOCK_HEIGHT / 2, start: s.start, at });
      return;
    }
    const w = Math.max(3, x(end) - x(start) - 1);
    blocks.push({ index, type: s.type, left: x(start), top: laneTop(s.type), width: w, height: BLOCK_HEIGHT, radius: Math.min(6, w / 2), at });
  });

  // A vertical line at each change of stage, from the edge of one block to the
  // facing edge of the next: down from a block's bottom, or up from its top.
  const links: LaneLink[] = [];
  for (let i = 0; i + 1 < segments.length; i++) {
    const a = segments[i]!;
    const b = segments[i + 1]!;
    if (blips.has(i) || blips.has(i + 1)) continue;
    if (a.type === b.type || Math.abs(Date.parse(b.start) - Date.parse(a.end)) > LINK_GAP_MS) continue;
    const down = LANE_ORDER.indexOf(b.type) > LANE_ORDER.indexOf(a.type);
    links.push({
      x: x(Date.parse(a.end)),
      y1: down ? laneTop(a.type) + BLOCK_HEIGHT : laneTop(a.type),
      y2: down ? laneTop(b.type) : laneTop(b.type) + BLOCK_HEIGHT,
    });
  }

  // The first whole local hour after the start, then every hour before the end.
  const hourMs = 3600000;
  const offsetMs = offset * 60000;
  const hourGuides: number[] = [];
  for (let t = Math.floor((t0 + offsetMs) / hourMs + 1) * hourMs - offsetMs; t < t1; t += hourMs) {
    if (t > t0) hourGuides.push(x(t));
  }

  const cyclePills = findSleepCycles(segments).cycles.map((c) => {
    const a = x(Date.parse(c.start));
    const b = x(Date.parse(c.end));
    return { n: c.n, left: a + 1.5, width: Math.max(18, b - a - 3) };
  });

  return { height, blocks, markers, links, hourGuides, cyclePills, minutes };
}
