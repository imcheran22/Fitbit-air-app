import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { fetchIdentity, saveIdentity } from '../../src/api/buddies';
import { HandleSetupForm } from '../../src/components/buddies/HandleSetupForm';
import { IdentityGate } from '../../src/components/buddies/IdentityGate';
import { Text } from 'react-native';

jest.mock('../../src/api/buddies', () => ({ ...jest.requireActual('../../src/api/buddies'), fetchIdentity: jest.fn(), saveIdentity: jest.fn() }));
const load = fetchIdentity as jest.Mock;
const save = saveIdentity as jest.Mock;
const NEW = { handle: null, displayName: null, displayNamePrefill: 'Sam', moodNoticeSeen: false };

beforeEach(() => jest.clearAllMocks());

it('prefills the display name and saves both fields on first setup', async () => {
  const onSaved = jest.fn();
  save.mockResolvedValue({ ...NEW, handle: 'sam_r', displayName: 'Sam' });
  render(<HandleSetupForm identity={NEW} mode="setup" onSaved={onSaved} />);
  expect(screen.getByTestId('display-name-input').props.value).toBe('Sam');
  fireEvent.changeText(screen.getByTestId('handle-input'), '@Sam_R');
  await act(async () => fireEvent.press(screen.getByTestId('handle-setup-save')));
  expect(save).toHaveBeenCalledWith({ handle: '@Sam_R', displayName: 'Sam' });
  expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ handle: 'sam_r' }), true);
});

it('starts empty when there is no prefill, and shows the server reason on failure', async () => {
  save.mockRejectedValue(Object.assign(new Error('x'), { status: 409, code: 'handle_taken' }));
  render(<HandleSetupForm identity={{ ...NEW, displayNamePrefill: '' }} mode="setup" onSaved={jest.fn()} />);
  expect(screen.getByTestId('display-name-input').props.value).toBe('');
  fireEvent.changeText(screen.getByTestId('handle-input'), 'sam');
  fireEvent.changeText(screen.getByTestId('display-name-input'), 'Sam');
  await act(async () => fireEvent.press(screen.getByTestId('handle-setup-save')));
  expect(screen.getByTestId('handle-setup-error')).toHaveTextContent('That handle is taken.');
});

it('in edit mode sends only what changed', async () => {
  save.mockResolvedValue({ ...NEW, handle: 'sam', displayName: 'Sammy' });
  render(<HandleSetupForm identity={{ ...NEW, handle: 'sam', displayName: 'Sam' }} mode="edit" onSaved={jest.fn()} />);
  fireEvent.changeText(screen.getByTestId('display-name-input'), 'Sammy');
  await act(async () => fireEvent.press(screen.getByTestId('handle-setup-save')));
  expect(save).toHaveBeenCalledWith({ displayName: 'Sammy' });
});

it('in edit mode compares as the server stores it: "@Sam " and " Sam " are no change', async () => {
  const onSaved = jest.fn();
  const SAM = { ...NEW, handle: 'sam', displayName: 'Sam' };
  render(<HandleSetupForm identity={SAM} mode="edit" onSaved={onSaved} />);
  fireEvent.changeText(screen.getByTestId('handle-input'), ' @Sam ');
  fireEvent.changeText(screen.getByTestId('display-name-input'), ' Sam ');
  await act(async () => fireEvent.press(screen.getByTestId('handle-setup-save')));
  expect(save).not.toHaveBeenCalled();
  expect(onSaved).toHaveBeenCalledWith(SAM, false);
});

it('reports whether anything was saved', async () => {
  const onSaved = jest.fn();
  save.mockResolvedValue({ ...NEW, handle: 'sam2', displayName: 'Sam' });
  render(<HandleSetupForm identity={{ ...NEW, handle: 'sam', displayName: 'Sam' }} mode="edit" onSaved={onSaved} />);
  fireEvent.changeText(screen.getByTestId('handle-input'), '@Sam2');
  await act(async () => fireEvent.press(screen.getByTestId('handle-setup-save')));
  expect(save).toHaveBeenCalledWith({ handle: '@Sam2' });
  expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ handle: 'sam2' }), true);
});

it('a failed save can be retried: the retry calls saveIdentity again', async () => {
  const onSaved = jest.fn();
  save.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 503, code: 'try_later' })).mockResolvedValueOnce({ ...NEW, handle: 'sam', displayName: 'Sam' });
  render(<HandleSetupForm identity={NEW} mode="setup" onSaved={onSaved} />);
  fireEvent.changeText(screen.getByTestId('handle-input'), 'sam');
  await act(async () => fireEvent.press(screen.getByTestId('handle-setup-save')));
  expect(screen.getByTestId('handle-setup-error')).toBeTruthy();
  expect(onSaved).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(screen.getByTestId('handle-setup-save')));
  expect(save).toHaveBeenCalledTimes(2);
  expect(onSaved).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('handle-setup-error')).toBeNull();
});

it('the gate shows setup until a handle exists, then the content', async () => {
  load.mockResolvedValue(NEW);
  save.mockResolvedValue({ ...NEW, handle: 'sam', displayName: 'Sam' });
  render(<IdentityGate>{(identity) => <Text testID="gated">{identity.handle}</Text>}</IdentityGate>);
  expect(await screen.findByTestId('handle-setup')).toBeTruthy();
  fireEvent.changeText(screen.getByTestId('handle-input'), 'sam');
  await act(async () => fireEvent.press(screen.getByTestId('handle-setup-save')));
  expect(screen.getByTestId('gated')).toHaveTextContent('sam');
});

it('a double tap saves once and reports once', async () => {
  const onSaved = jest.fn();
  let finish!: (value: unknown) => void;
  save.mockReturnValue(new Promise((resolve) => (finish = resolve)));
  render(<HandleSetupForm identity={NEW} mode="setup" onSaved={onSaved} />);
  fireEvent.changeText(screen.getByTestId('handle-input'), 'sam');
  await act(async () => {
    fireEvent.press(screen.getByTestId('handle-setup-save'));
    fireEvent.press(screen.getByTestId('handle-setup-save'));
  });
  await act(async () => finish({ ...NEW, handle: 'sam', displayName: 'Sam' }));
  expect(save).toHaveBeenCalledTimes(1);
  expect(onSaved).toHaveBeenCalledTimes(1);
});

it('the gate shows an error with retry, then the content once loading works', async () => {
  load.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ...NEW, handle: 'sam', displayName: 'Sam' });
  render(<IdentityGate>{(identity) => <Text testID="gated">{identity.handle}</Text>}</IdentityGate>);
  expect(await screen.findByTestId('buddy-identity-error')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByTestId('buddy-identity-retry')));
  expect(await screen.findByTestId('gated')).toHaveTextContent('sam');
  expect(load).toHaveBeenCalledTimes(2);
});
