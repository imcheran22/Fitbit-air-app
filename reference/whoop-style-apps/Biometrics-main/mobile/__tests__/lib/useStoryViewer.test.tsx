import { act, renderHook } from '@testing-library/react-native';
import { STORY_FRAME_MS } from '../../src/lib/storyViewer';
import { useStoryViewer } from '../../src/lib/useStoryViewer';

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

it('moves on by itself every five seconds and holds on the last frame', () => {
  const onClose = jest.fn();
  const { result } = renderHook(() => useStoryViewer({ count: 3, autoAdvance: true, onClose }));
  expect(result.current.index).toBe(0);
  act(() => jest.advanceTimersByTime(STORY_FRAME_MS - 10));
  expect(result.current.index).toBe(0);
  act(() => jest.advanceTimersByTime(10));
  expect(result.current.index).toBe(1);
  act(() => jest.advanceTimersByTime(STORY_FRAME_MS));
  expect(result.current.index).toBe(2);
  expect(result.current.ended).toBe(false);
  act(() => jest.advanceTimersByTime(STORY_FRAME_MS * 3));
  expect(result.current.index).toBe(2);
  expect(result.current.ended).toBe(true);
  expect(result.current.progress.value).toBe(1);
  expect(onClose).not.toHaveBeenCalled();
  // Watch again: frame 1, running again.
  act(() => result.current.restart());
  expect(result.current.index).toBe(0);
  act(() => jest.advanceTimersByTime(STORY_FRAME_MS));
  expect(result.current.index).toBe(1);
});

it('holds the frame while paused and gives back only the time that was left', () => {
  const { result } = renderHook(() => useStoryViewer({ count: 3, autoAdvance: true, onClose: jest.fn() }));
  act(() => jest.advanceTimersByTime(2000));
  act(() => result.current.pause('hold'));
  act(() => jest.advanceTimersByTime(20000));
  expect(result.current.index).toBe(0);
  expect(result.current.paused).toBe(true);
  act(() => result.current.resume('hold'));
  act(() => jest.advanceTimersByTime(2990));
  expect(result.current.index).toBe(0);
  act(() => jest.advanceTimersByTime(10));
  expect(result.current.index).toBe(1);
});

it('taps restart the timer on the new frame', () => {
  const { result } = renderHook(() => useStoryViewer({ count: 3, autoAdvance: true, onClose: jest.fn() }));
  act(() => jest.advanceTimersByTime(4000));
  act(() => result.current.next());
  act(() => jest.advanceTimersByTime(4000));
  expect(result.current.index).toBe(1);
  act(() => result.current.prev());
  expect(result.current.index).toBe(0);
  act(() => jest.advanceTimersByTime(STORY_FRAME_MS));
  expect(result.current.index).toBe(1);
});

it('with reduce motion never moves on by itself, but taps still step through and the end holds', () => {
  const onClose = jest.fn();
  const { result } = renderHook(() => useStoryViewer({ count: 3, autoAdvance: false, onClose }));
  act(() => jest.advanceTimersByTime(STORY_FRAME_MS * 5));
  expect(result.current.index).toBe(0);
  act(() => result.current.next());
  act(() => result.current.next());
  expect(result.current.index).toBe(2);
  act(() => result.current.next());
  expect(result.current.index).toBe(2);
  expect(onClose).not.toHaveBeenCalled();
});

it('a tap just before the timer runs out moves one frame, not two', () => {
  const { result } = renderHook(() => useStoryViewer({ count: 3, autoAdvance: true, onClose: jest.fn() }));
  act(() => jest.advanceTimersByTime(STORY_FRAME_MS - 20));
  act(() => result.current.next());
  act(() => jest.advanceTimersByTime(40));
  expect(result.current.index).toBe(1);
  act(() => jest.advanceTimersByTime(STORY_FRAME_MS - 40));
  expect(result.current.index).toBe(2);
});

it('closes once on request, and a later tap does nothing', () => {
  const onClose = jest.fn();
  const { result } = renderHook(() => useStoryViewer({ count: 3, autoAdvance: true, onClose }));
  act(() => result.current.close());
  act(() => result.current.next());
  act(() => jest.advanceTimersByTime(STORY_FRAME_MS * 3));
  expect(onClose).toHaveBeenCalledTimes(1);
});
