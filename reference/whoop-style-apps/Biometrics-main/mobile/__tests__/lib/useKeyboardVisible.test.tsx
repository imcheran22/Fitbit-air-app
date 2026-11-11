import { Keyboard } from 'react-native';
import { renderHook, act } from '@testing-library/react-native';
import { useKeyboardVisible } from '../../src/lib/useKeyboardVisible';

describe('useKeyboardVisible', () => {
  it('follows the keyboard show and hide events', () => {
    const handlers: Record<string, () => void> = {};
    const remove = jest.fn();
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, cb: () => void) => {
      handlers[event] = cb;
      return { remove };
    }) as never);

    const { result, unmount } = renderHook(() => useKeyboardVisible());
    expect(result.current).toBe(false);

    act(() => handlers.keyboardWillShow!());
    expect(result.current).toBe(true);

    act(() => handlers.keyboardWillHide!());
    expect(result.current).toBe(false);

    unmount();
    expect(remove).toHaveBeenCalledTimes(2);
  });
});
