import React from 'react';
import { characterLabel, withCharacter } from '../../jest-mocks/characterContext';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { CoachMemoryScreen } from '../../src/screens/CoachMemoryScreen';
import {
  CoachConsentRequiredError,
  CoachDisabledError,
  CoachMemoryNotFoundError,
  CoachMemoryValidationError,
  deleteCoachMemory,
  listCoachMemory,
  updateCoachMemory,
  type MemoryDTO,
} from '../../src/api/coach';

jest.mock('../../src/api/coach', () => ({
  ...jest.requireActual('../../src/api/coach'),
  listCoachMemory: jest.fn(),
  updateCoachMemory: jest.fn(),
  deleteCoachMemory: jest.fn(),
}));

const goal: MemoryDTO = { id: 'g1', category: 'TRAINING_GOAL', value: 'Run a half marathon', status: 'CONFIRMED', createdAt: '2026-09-01T00:00:00.000Z' };
const schedule: MemoryDTO = { id: 's1', category: 'SCHEDULE', value: 'Trains at 6am', status: 'PENDING', createdAt: '2026-09-20T00:00:00.000Z' };
const pref: MemoryDTO = { id: 'p1', category: 'PREFERENCE', value: 'Likes short answers', status: 'CONFIRMED', createdAt: '2026-09-10T00:00:00.000Z' };

beforeEach(() => {
  jest.clearAllMocks();
  (listCoachMemory as jest.Mock).mockResolvedValue([goal, schedule, pref]);
  (updateCoachMemory as jest.Mock).mockImplementation(async (id: string, value: string) => ({ ...schedule, id, value, status: 'CONFIRMED' }));
  (deleteCoachMemory as jest.Mock).mockResolvedValue(undefined);
});

describe('CoachMemoryScreen', () => {
  it('shows a loading state first', async () => {
    const { getByTestId, findByTestId } = render(<CoachMemoryScreen />);
    expect(getByTestId('coach-memory-loading')).toBeTruthy();
    await findByTestId('memory-entry-g1');
  });

  it('lists entries under friendly category names', async () => {
    const { findByTestId, getByText } = render(<CoachMemoryScreen />);

    expect(await findByTestId('memory-entry-g1')).toHaveTextContent(/Run a half marathon/);
    expect(getByText('Training goal')).toBeTruthy();
    expect(getByText('Schedule')).toBeTruthy();
    expect(getByText('Preference')).toBeTruthy();
    expect(getByText('Trains at 6am')).toBeTruthy();
  });

  it('marks only PENDING entries as not confirmed yet', async () => {
    const { findByTestId, queryByTestId } = render(<CoachMemoryScreen />);

    const marker = await findByTestId('memory-pending-s1');
    expect(marker).toHaveTextContent("Not confirmed yet — I'll keep this unless you correct me");
    expect(queryByTestId('memory-pending-g1')).toBeNull();
    expect(queryByTestId('memory-pending-p1')).toBeNull();
  });

  it('explains what the coach remembers, and never health details, when empty', async () => {
    (listCoachMemory as jest.Mock).mockResolvedValue([]);
    const { findByTestId } = render(<CoachMemoryScreen />);

    const empty = await findByTestId('coach-memory-empty');
    expect(empty).toHaveTextContent(/training goals/i);
    expect(empty).toHaveTextContent(/schedule/i);
    expect(empty).toHaveTextContent(/preferences/i);
    expect(empty).toHaveTextContent(/never health or medical details/i);
  });

  it('shows an error with a retry that reloads', async () => {
    (listCoachMemory as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    const { findByTestId, getByTestId } = render(<CoachMemoryScreen />);

    await findByTestId('coach-memory-error');
    fireEvent.press(getByTestId('coach-memory-retry'));

    expect(await findByTestId('memory-entry-g1')).toBeTruthy();
    expect(listCoachMemory).toHaveBeenCalledTimes(2);
  });

  it('says the coach is unavailable when the server reports it disabled or unconsented', async () => {
    (listCoachMemory as jest.Mock).mockRejectedValueOnce(new CoachDisabledError());
    const first = render(<CoachMemoryScreen />);
    expect(await first.findByTestId('coach-memory-unavailable')).toBeTruthy();
    first.unmount();

    (listCoachMemory as jest.Mock).mockRejectedValueOnce(new CoachConsentRequiredError());
    const second = render(<CoachMemoryScreen />);
    expect(await second.findByTestId('coach-memory-unavailable')).toBeTruthy();
  });

  describe('editing', () => {
    async function openEdit(id: string) {
      const utils = render(<CoachMemoryScreen />);
      fireEvent.press(await utils.findByTestId(`memory-edit-${id}`));
      return utils;
    }

    it('edits inline, saves through the API and shows the new text (no longer pending)', async () => {
      const { findByTestId, getByTestId, queryByTestId, getByText } = await openEdit('s1');

      const input = getByTestId('memory-input-s1');
      expect(input.props.value).toBe('Trains at 6am');
      fireEvent.changeText(input, 'Trains at 7am');
      fireEvent.press(getByTestId('memory-save-s1'));

      await waitFor(() => expect(updateCoachMemory).toHaveBeenCalledWith('s1', 'Trains at 7am'));
      await findByTestId('memory-edit-s1');
      expect(getByText('Trains at 7am')).toBeTruthy();
      expect(queryByTestId('memory-input-s1')).toBeNull();
      expect(queryByTestId('memory-pending-s1')).toBeNull();
    });

    it('cancelling leaves the entry unchanged and calls nothing', async () => {
      const { getByTestId, getByText, queryByTestId } = await openEdit('s1');

      fireEvent.changeText(getByTestId('memory-input-s1'), 'something else');
      fireEvent.press(getByTestId('memory-cancel-s1'));

      expect(queryByTestId('memory-input-s1')).toBeNull();
      expect(getByText('Trains at 6am')).toBeTruthy();
      expect(updateCoachMemory).not.toHaveBeenCalled();
    });

    it('limits the text to 140 characters and shows a counter', async () => {
      const { getByTestId } = await openEdit('s1');

      expect(getByTestId('memory-input-s1').props.maxLength).toBe(140);
      expect(getByTestId('memory-counter-s1')).toHaveTextContent('13/140');
    });

    it('refuses over-long text client-side without calling the API', async () => {
      const { getByTestId, findByTestId } = await openEdit('s1');

      fireEvent.changeText(getByTestId('memory-input-s1'), 'x'.repeat(141));
      fireEvent.press(getByTestId('memory-save-s1'));

      expect(await findByTestId('memory-error-s1')).toHaveTextContent(/140/);
      expect(updateCoachMemory).not.toHaveBeenCalled();
    });

    it('does not save empty text', async () => {
      const { getByTestId, findByTestId } = await openEdit('s1');

      fireEvent.changeText(getByTestId('memory-input-s1'), '   ');
      fireEvent.press(getByTestId('memory-save-s1'));

      expect(await findByTestId('memory-error-s1')).toBeTruthy();
      expect(updateCoachMemory).not.toHaveBeenCalled();
    });

    it('shows an inline error on a 400 and keeps the editor open with the typed text', async () => {
      (updateCoachMemory as jest.Mock).mockRejectedValue(new CoachMemoryValidationError());
      const { getByTestId, findByTestId } = await openEdit('s1');

      fireEvent.changeText(getByTestId('memory-input-s1'), 'My knee hurts');
      fireEvent.press(getByTestId('memory-save-s1'));

      expect(await findByTestId('memory-error-s1')).toHaveTextContent(/can.t remember that/i);
      expect(getByTestId('memory-input-s1').props.value).toBe('My knee hurts');
    });

    it('drops the entry if the server says it no longer exists', async () => {
      (updateCoachMemory as jest.Mock).mockRejectedValue(new CoachMemoryNotFoundError());
      const { getByTestId, queryByTestId } = await openEdit('s1');

      fireEvent.changeText(getByTestId('memory-input-s1'), 'Trains at 7am');
      fireEvent.press(getByTestId('memory-save-s1'));

      await waitFor(() => expect(queryByTestId('memory-entry-s1') === null).toBe(true));
    });

    it('shows a generic inline error on any other failure', async () => {
      (updateCoachMemory as jest.Mock).mockRejectedValue(new Error('offline'));
      const { getByTestId, findByTestId } = await openEdit('s1');

      fireEvent.changeText(getByTestId('memory-input-s1'), 'Trains at 7am');
      fireEvent.press(getByTestId('memory-save-s1'));

      expect(await findByTestId('memory-error-s1')).toHaveTextContent(/try again/i);
    });
  });

  describe('deleting', () => {
    it('asks for confirmation before deleting', async () => {
      const { findByTestId, getByTestId, queryByTestId } = render(<CoachMemoryScreen />);

      fireEvent.press(await findByTestId('memory-delete-g1'));

      expect(deleteCoachMemory).not.toHaveBeenCalled();
      fireEvent.press(getByTestId('memory-cancel-delete-g1'));
      expect(queryByTestId('memory-confirm-delete-g1')).toBeNull();
      expect(deleteCoachMemory).not.toHaveBeenCalled();
      expect(getByTestId('memory-entry-g1')).toBeTruthy();
    });

    it('deletes on confirm and removes the entry', async () => {
      const { findByTestId, getByTestId, queryByTestId } = render(<CoachMemoryScreen />);

      fireEvent.press(await findByTestId('memory-delete-g1'));
      fireEvent.press(getByTestId('memory-confirm-delete-g1'));

      await waitFor(() => expect(deleteCoachMemory).toHaveBeenCalledWith('g1'));
      await waitFor(() => expect(queryByTestId('memory-entry-g1')).toBeNull());
      expect(getByTestId('memory-entry-s1')).toBeTruthy();
    });

    it('keeps the entry and shows an error if deleting fails', async () => {
      (deleteCoachMemory as jest.Mock).mockRejectedValue(new Error('offline'));
      const { findByTestId, getByTestId } = render(<CoachMemoryScreen />);

      fireEvent.press(await findByTestId('memory-delete-g1'));
      fireEvent.press(getByTestId('memory-confirm-delete-g1'));

      expect(await findByTestId('memory-error-g1')).toBeTruthy();
      expect(getByTestId('memory-entry-g1')).toBeTruthy();
    });

    it('shows the empty state after the last entry is deleted', async () => {
      (listCoachMemory as jest.Mock).mockResolvedValue([goal]);
      const { findByTestId, getByTestId } = render(<CoachMemoryScreen />);

      fireEvent.press(await findByTestId('memory-delete-g1'));
      fireEvent.press(getByTestId('memory-confirm-delete-g1'));

      expect(await findByTestId('coach-memory-empty')).toBeTruthy();
    });
  });
});

describe('CoachMemoryScreen: character', () => {
  it("shows the user's character on the empty state", async () => {
    (listCoachMemory as jest.Mock).mockResolvedValue([]);
    const utils = render(withCharacter(<CoachMemoryScreen />, { characterId: 'boba' }));
    await utils.findByTestId('coach-memory-empty');

    expect(characterLabel(utils, 'coach-memory-character')).toBe('character:boba:idle:40:playing:none');
  });

  it("shows the user's character when the coach is unavailable", async () => {
    (listCoachMemory as jest.Mock).mockRejectedValue(new CoachDisabledError());
    const utils = render(withCharacter(<CoachMemoryScreen />, { characterId: 'boba' }));
    await utils.findByTestId('coach-memory-unavailable');

    expect(characterLabel(utils, 'coach-memory-character')).toBe('character:boba:idle:48:playing:none');
  });
});
