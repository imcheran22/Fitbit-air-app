import { useCallback, useEffect, useReducer, useRef } from 'react';
import { cancelAnimation, Easing, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { frameProgress, initialViewer, isRunning, remainingMs, viewerReducer, type PauseReason } from './storyViewer';

export interface UseStoryViewerOptions {
  count: number;
  /** False with reduce motion on: no timer and no running bar; taps still step through. */
  autoAdvance: boolean;
  onClose: () => void;
}

export interface StoryViewer {
  index: number;
  paused: boolean;
  /** The last frame has run out and holds (its end actions stay up). */
  ended: boolean;
  /** The current frame's bar, 0–1, animated on the UI thread while the frame runs. */
  progress: SharedValue<number>;
  next: () => void;
  prev: () => void;
  close: () => void;
  /** Watch again: frame 1, running. */
  restart: () => void;
  pause: (reason: PauseReason) => void;
  resume: (reason: PauseReason) => void;
}

/**
 * The story viewer's state over time: storyViewer's reducer plus a JS timer that moves to the next
 * frame when the current one's time is up, and a shared value that animates its bar to match.
 * Past the last frame it holds (ended), its bar full; only close() closes.
 */
export function useStoryViewer({ count, autoAdvance, onClose }: UseStoryViewerOptions): StoryViewer {
  const [state, dispatch] = useReducer(viewerReducer, count, (n) => initialViewer(n, Date.now()));
  const progress = useSharedValue(autoAdvance ? 0 : 1);
  const running = isRunning(state);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!autoAdvance) {
      // Reduce motion: the current frame's segment is simply full.
      cancelAnimation(progress);
      progress.value = 1;
      return;
    }
    const now = Date.now();
    cancelAnimation(progress);
    progress.value = frameProgress(state, now);
    if (!running) return;
    const left = remainingMs(state, now);
    progress.value = withTiming(1, { duration: left, easing: Easing.linear });
    const shown = state.index;
    const timer = setTimeout(() => dispatch({ type: 'expire', index: shown, now: Date.now() }), left);
    return () => clearTimeout(timer);
    // A new run starts only on a new frame or a resume (startedAt changes with both).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAdvance, running, state.index, state.startedAt]);

  useEffect(() => {
    if (state.closed) closeRef.current();
  }, [state.closed]);

  const next = useCallback(() => dispatch({ type: 'next', now: Date.now() }), []);
  const prev = useCallback(() => dispatch({ type: 'prev', now: Date.now() }), []);
  const close = useCallback(() => dispatch({ type: 'close', now: Date.now() }), []);
  const restart = useCallback(() => dispatch({ type: 'restart', now: Date.now() }), []);
  const pause = useCallback((reason: PauseReason) => dispatch({ type: 'pause', reason, now: Date.now() }), []);
  const resume = useCallback((reason: PauseReason) => dispatch({ type: 'resume', reason, now: Date.now() }), []);

  return { index: state.index, paused: !running && !state.closed && !state.ended, ended: state.ended, progress, next, prev, close, restart, pause, resume };
}
