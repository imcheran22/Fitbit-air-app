// The weekly story viewer's navigation and timing (recap restyle 2026-10-05), pure so it is tested
// without a clock: each frame runs STORY_FRAME_MS and then moves on, a tap on the right half goes
// to the next frame and on the left half to the previous one, a hold (or a share in progress)
// pauses. The last frame carries the end actions (See full recap, Share, Watch again), so going
// past it holds there, bar full, rather than closing; only close (X, swipe down) closes. Times
// are passed in (`now`, ms).

export const STORY_FRAME_MS = 5000;
/**
 * A frame's timer that fires this soon after the frame changed is racing a tap (both landed in
 * the same moment) and is dropped, so one tap never moves two frames.
 */
export const EXPIRE_GRACE_MS = 150;

/** Why the story is paused; it runs only when there is none. */
export type PauseReason = 'hold' | 'drag' | 'share' | 'background' | 'screenReader' | 'chrome' | 'sheet' | 'leaving';

export interface ViewerState {
  index: number;
  count: number;
  /** Time the current frame has already run, not counting the current run. */
  elapsed: number;
  /** When the current run started; null while paused or closed. */
  startedAt: number | null;
  pausedBy: PauseReason[];
  /** When the frame on screen was shown (a tap or an expiry), for EXPIRE_GRACE_MS. */
  changedAt: number;
  /** The last frame has run out (or been tapped past): it holds there, its bar full. */
  ended: boolean;
  closed: boolean;
}

export type ViewerAction =
  | { type: 'next' | 'prev' | 'close'; now: number }
  /** Watch again: back to frame 1, running. */
  | { type: 'restart'; now: number }
  /** The timer set for frame `index` ran out. */
  | { type: 'expire'; index: number; now: number }
  | { type: 'pause' | 'resume'; reason: PauseReason; now: number };

export function initialViewer(count: number, now: number): ViewerState {
  return { index: 0, count, elapsed: 0, startedAt: now, pausedBy: [], changedAt: now, ended: false, closed: false };
}

export function isRunning(s: ViewerState): boolean {
  return !s.closed && !s.ended && s.pausedBy.length === 0;
}

/** The end actions are up: on the last frame, from when it is shown. */
export function showsEndActions(s: Pick<ViewerState, 'index' | 'count'>): boolean {
  return s.index === s.count - 1;
}

/** A frame shown from its start: running now, or waiting for the pause to end. */
function showFrame(s: ViewerState, index: number, now: number): ViewerState {
  return { ...s, index, elapsed: 0, startedAt: s.pausedBy.length === 0 ? now : null, changedAt: now, ended: false };
}

export function viewerReducer(s: ViewerState, a: ViewerAction): ViewerState {
  if (s.closed) return s;
  switch (a.type) {
    case 'expire':
      // Stale (set for a frame no longer shown) or racing a tap: the tap already moved on.
      if (a.index !== s.index || a.now - s.changedAt < EXPIRE_GRACE_MS) return s;
      return viewerReducer(s, { type: 'next', now: a.now });
    case 'next':
      if (s.index < s.count - 1) return showFrame(s, s.index + 1, a.now);
      return s.ended ? s : { ...s, elapsed: STORY_FRAME_MS, startedAt: null, ended: true };
    case 'prev':
      return showFrame(s, Math.max(0, s.index - 1), a.now);
    case 'restart':
      return showFrame(s, 0, a.now);
    case 'close':
      return { ...s, startedAt: null, closed: true };
    case 'pause': {
      if (s.pausedBy.includes(a.reason)) return s;
      const elapsed = s.startedAt === null ? s.elapsed : Math.min(STORY_FRAME_MS, s.elapsed + (a.now - s.startedAt));
      return { ...s, elapsed, startedAt: null, pausedBy: [...s.pausedBy, a.reason] };
    }
    case 'resume': {
      if (!s.pausedBy.includes(a.reason)) return s;
      const pausedBy = s.pausedBy.filter((r) => r !== a.reason);
      return { ...s, pausedBy, startedAt: pausedBy.length === 0 && !s.ended ? a.now : null };
    }
  }
}

/** Time left on the current frame. */
export function remainingMs(s: ViewerState, now: number): number {
  const ran = s.elapsed + (s.startedAt === null ? 0 : now - s.startedAt);
  return Math.max(0, STORY_FRAME_MS - ran);
}

/** How far the current frame's bar is filled, 0–1. */
export function frameProgress(s: ViewerState, now: number): number {
  return 1 - remainingMs(s, now) / STORY_FRAME_MS;
}

/** A tap on the frame: the right half moves on, the left half goes back. */
export function tapSide(x: number, width: number): 'prev' | 'next' {
  return x >= width / 2 ? 'next' : 'prev';
}
