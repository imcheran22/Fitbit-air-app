import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Sheet, shouldDismiss, DISMISS_DISTANCE, DISMISS_VELOCITY } from '../../src/components/ui/sheet';
import { MOTION } from '../../src/theme';

describe('shouldDismiss', () => {
  it('dismisses on a long downward drag', () => {
    expect(shouldDismiss(DISMISS_DISTANCE + 1, 0)).toBe(true);
  });

  it('dismisses on a fast downward flick', () => {
    expect(shouldDismiss(10, DISMISS_VELOCITY + 0.1)).toBe(true);
  });

  it('snaps back on a short, slow drag or an upward drag', () => {
    expect(shouldDismiss(DISMISS_DISTANCE - 1, DISMISS_VELOCITY - 0.1)).toBe(false);
    expect(shouldDismiss(-50, -2)).toBe(false);
  });
});

describe('Sheet', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('renders its children only while visible', () => {
    const { queryByText, rerender } = render(
      <Sheet visible={false} onClose={() => {}}>
        <Text>details</Text>
      </Sheet>,
    );
    expect(queryByText('details')).toBeNull();

    rerender(
      <Sheet visible onClose={() => {}}>
        <Text>details</Text>
      </Sheet>,
    );
    expect(queryByText('details')).toBeTruthy();
  });

  it('closes once after the exit animation when the backdrop is tapped', () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <Sheet visible onClose={onClose}>
        <Text>details</Text>
      </Sheet>,
    );

    fireEvent.press(getByTestId('sheet-backdrop'));
    fireEvent.press(getByTestId('sheet-backdrop'));
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(MOTION.duration.normal + 10);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores a backdrop tap while not dismissible, and closes on one once it is again', () => {
    const onClose = jest.fn();
    const sheet = (dismissible: boolean) => (
      <Sheet visible onClose={onClose} dismissible={dismissible}>
        <Text>details</Text>
      </Sheet>
    );
    const { getByTestId, rerender } = render(sheet(false));
    fireEvent.press(getByTestId('sheet-backdrop'));
    act(() => {
      jest.advanceTimersByTime(MOTION.duration.normal + 10);
    });
    expect(onClose).not.toHaveBeenCalled();
    rerender(sheet(true));
    fireEvent.press(getByTestId('sheet-backdrop'));
    act(() => {
      jest.advanceTimersByTime(MOTION.duration.normal + 10);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose if the sheet is unmounted during the exit animation', () => {
    const onClose = jest.fn();
    const { getByTestId, unmount } = render(
      <Sheet visible onClose={onClose}>
        <Text>details</Text>
      </Sheet>,
    );

    fireEvent.press(getByTestId('sheet-backdrop'));
    unmount();
    act(() => {
      jest.advanceTimersByTime(MOTION.duration.normal + 10);
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('can be dismissed again after being reopened, calling onClose once per dismissal', () => {
    const onClose = jest.fn();
    const sheet = (visible: boolean) => (
      <Sheet visible={visible} onClose={onClose}>
        <Text>details</Text>
      </Sheet>
    );
    const { getByTestId, rerender } = render(sheet(true));

    fireEvent.press(getByTestId('sheet-backdrop'));
    act(() => {
      jest.advanceTimersByTime(MOTION.duration.normal + 10);
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(sheet(false));
    rerender(sheet(true));

    fireEvent.press(getByTestId('sheet-backdrop'));
    act(() => {
      jest.advanceTimersByTime(MOTION.duration.normal + 10);
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('drops the pending close when the sheet is reshown during the exit animation', () => {
    const onClose = jest.fn();
    const sheet = (visible: boolean) => (
      <Sheet visible={visible} onClose={onClose}>
        <Text>details</Text>
      </Sheet>
    );
    const { getByTestId, rerender } = render(sheet(true));

    fireEvent.press(getByTestId('sheet-backdrop'));
    rerender(sheet(false));
    rerender(sheet(true));
    act(() => {
      jest.advanceTimersByTime(MOTION.duration.normal + 10);
    });

    expect(onClose).not.toHaveBeenCalled();
  });
});
