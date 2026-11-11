import React from 'react';
import { Button, AccessibilityInfo } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ToastProvider, useToast, TOAST_MS } from '../../src/components/ui/toast';

function Trigger({ text }: { text: string }) {
  const toast = useToast();
  return <Button title={`show ${text}`} onPress={() => toast.show(text, 'success')} />;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('shows a toast, announces it, and hides it after 2.5 s', () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  const { getByText, queryByTestId } = render(
    <ToastProvider>
      <Trigger text="Synced with Google Health" />
    </ToastProvider>,
  );

  fireEvent.press(getByText('show Synced with Google Health'));
  expect(queryByTestId('toast')).toHaveTextContent(/Synced with Google Health/);
  expect(announce).toHaveBeenCalledWith('Synced with Google Health');

  act(() => {
    jest.advanceTimersByTime(TOAST_MS + 50);
  });
  expect(queryByTestId('toast')).toBeNull();
});

it('replaces the current toast with a newer one', () => {
  const { getByText, getByTestId } = render(
    <ToastProvider>
      <Trigger text="First" />
      <Trigger text="Second" />
    </ToastProvider>,
  );
  fireEvent.press(getByText('show First'));
  fireEvent.press(getByText('show Second'));
  expect(getByTestId('toast')).toHaveTextContent(/Second/);
  expect(getByTestId('toast')).not.toHaveTextContent(/First/);
});

it('is a harmless no-op without a provider', () => {
  const { getByText } = render(<Trigger text="Nowhere" />);
  expect(() => fireEvent.press(getByText('show Nowhere'))).not.toThrow();
});
