import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { MemoryProposalChips } from '../../src/components/memory-proposal-chips';
import {
  CoachMemoryNotFoundError,
  CoachMemoryValidationError,
  deleteCoachMemory,
  updateCoachMemory,
  type MemoryDTO,
} from '../../src/api/coach';

jest.mock('../../src/api/coach', () => ({
  ...jest.requireActual('../../src/api/coach'),
  updateCoachMemory: jest.fn(),
  deleteCoachMemory: jest.fn(),
}));

const proposal: MemoryDTO = { id: 'm1', category: 'SCHEDULE', value: 'Trains at 6am', status: 'PENDING', createdAt: '2026-09-20T00:00:00.000Z' };
const second: MemoryDTO = { id: 'm2', category: 'PREFERENCE', value: 'Likes short answers', status: 'PENDING', createdAt: '2026-09-20T00:00:00.000Z' };

beforeEach(() => {
  jest.clearAllMocks();
  (updateCoachMemory as jest.Mock).mockImplementation(async (id: string, value: string) => ({ ...proposal, id, value }));
  (deleteCoachMemory as jest.Mock).mockResolvedValue(undefined);
});

describe('MemoryProposalChips', () => {
  it('renders nothing without proposals', () => {
    const { toJSON } = render(<MemoryProposalChips proposals={[]} />);
    expect(toJSON()).toBeNull();
  });

  it('shows an "I\'ll remember" line for each proposal', () => {
    const { getByTestId } = render(<MemoryProposalChips proposals={[proposal, second]} />);

    expect(getByTestId('memory-chip-m1')).toHaveTextContent("I'll remember: Trains at 6am");
    expect(getByTestId('memory-chip-m2')).toHaveTextContent("I'll remember: Likes short answers");
  });

  it('edits through the same update API and shows the new text', async () => {
    const { getByTestId, queryByTestId } = render(<MemoryProposalChips proposals={[proposal]} />);

    fireEvent.press(getByTestId('memory-chip-edit-m1'));
    expect(getByTestId('memory-chip-input-m1').props.value).toBe('Trains at 6am');
    expect(getByTestId('memory-chip-input-m1').props.maxLength).toBe(140);
    fireEvent.changeText(getByTestId('memory-chip-input-m1'), 'Trains at 7am');
    fireEvent.press(getByTestId('memory-chip-save-m1'));

    await waitFor(() => expect(updateCoachMemory).toHaveBeenCalledWith('m1', 'Trains at 7am'));
    await waitFor(() => expect(getByTestId('memory-chip-m1')).toHaveTextContent("I'll remember: Trains at 7am"));
    expect(queryByTestId('memory-chip-input-m1')).toBeNull();
  });

  it('shows an inline error on a 400 and keeps editing', async () => {
    (updateCoachMemory as jest.Mock).mockRejectedValue(new CoachMemoryValidationError());
    const { getByTestId, findByTestId } = render(<MemoryProposalChips proposals={[proposal]} />);

    fireEvent.press(getByTestId('memory-chip-edit-m1'));
    fireEvent.changeText(getByTestId('memory-chip-input-m1'), 'My knee hurts');
    fireEvent.press(getByTestId('memory-chip-save-m1'));

    expect(await findByTestId('memory-chip-error-m1')).toBeTruthy();
    expect(getByTestId('memory-chip-input-m1')).toBeTruthy();
  });

  it('undo deletes through the API and removes the line', async () => {
    const { getByTestId, queryByTestId } = render(<MemoryProposalChips proposals={[proposal, second]} />);

    fireEvent.press(getByTestId('memory-chip-undo-m1'));

    await waitFor(() => expect(deleteCoachMemory).toHaveBeenCalledWith('m1'));
    await waitFor(() => expect(queryByTestId('memory-chip-m1')).toBeNull());
    expect(getByTestId('memory-chip-m2')).toBeTruthy();
  });

  it('removes the line if the entry is already gone', async () => {
    (deleteCoachMemory as jest.Mock).mockRejectedValue(new CoachMemoryNotFoundError());
    const { getByTestId, queryByTestId } = render(<MemoryProposalChips proposals={[proposal]} />);

    fireEvent.press(getByTestId('memory-chip-undo-m1'));

    await waitFor(() => expect(queryByTestId('memory-chip-m1') === null).toBe(true));
  });

  it('keeps the line and says so if undo fails', async () => {
    (deleteCoachMemory as jest.Mock).mockRejectedValue(new Error('offline'));
    const { getByTestId, findByTestId } = render(<MemoryProposalChips proposals={[proposal]} />);

    fireEvent.press(getByTestId('memory-chip-undo-m1'));

    expect(await findByTestId('memory-chip-error-m1')).toBeTruthy();
    expect(getByTestId('memory-chip-m1')).toBeTruthy();
  });
});
