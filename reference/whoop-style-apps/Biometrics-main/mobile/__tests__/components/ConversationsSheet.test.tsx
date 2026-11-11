import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { listConversations } from '../../src/api/coach';
import { ConversationsSheet, relativeDay } from '../../src/components/coach/ConversationsSheet';

jest.mock('../../src/api/coach', () => ({
  ...jest.requireActual('../../src/api/coach'),
  listConversations: jest.fn(),
}));

const list = listConversations as jest.Mock;

const conversations = [
  { id: 'c2', title: 'Which habits affect my scores?', lastMessageAt: '2026-09-29T18:00:00' },
  { id: 'c1', title: 'What is HRV?', lastMessageAt: '2026-09-21T09:00:00' },
];

function renderSheet(overrides: Partial<React.ComponentProps<typeof ConversationsSheet>> = {}) {
  const props = {
    visible: true,
    onClose: jest.fn(),
    onOpen: jest.fn(),
    onNewChat: jest.fn(),
    onOpenMemory: jest.fn(),
    currentId: null,
    now: new Date('2026-09-30T09:41:00'),
    ...overrides,
  };
  return { ...render(<ConversationsSheet {...props} />), props };
}

beforeEach(() => {
  list.mockReset();
});

describe('relativeDay', () => {
  const now = new Date('2026-09-30T09:41:00');

  it.each([
    ['2026-09-30T00:05:00', 'today'],
    ['2026-09-29T23:59:00', 'yesterday'],
    ['2026-09-28T12:00:00', 'Mon'],
    ['2026-09-24T12:00:00', 'Thu'],
    ['2026-09-23T12:00:00', 'last week'],
    ['2026-09-17T12:00:00', 'last week'],
    ['2026-09-16T12:00:00', 'Sep 16'],
    ['not a date', ''],
  ])('%s reads as "%s"', (iso, expected) => {
    expect(relativeDay(iso, now)).toBe(expected);
  });
});

describe('ConversationsSheet', () => {
  it('lists past conversations by their first question, with a relative date', async () => {
    list.mockResolvedValue(conversations);
    const { findByTestId, getByTestId } = renderSheet();

    expect(await findByTestId('conversation-c2')).toHaveTextContent('Which habits affect my scores?yesterday');
    expect(getByTestId('conversation-c1')).toHaveTextContent('What is HRV?last week');
  });

  it('opens a conversation when it is tapped, and marks the one on screen', async () => {
    list.mockResolvedValue(conversations);
    const { findByTestId, props } = renderSheet({ currentId: 'c1' });

    const current = await findByTestId('conversation-c1');
    expect(current.props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    fireEvent.press(await findByTestId('conversation-c2'));

    expect(props.onOpen).toHaveBeenCalledWith('c2');
  });

  it('offers a new chat and the coach memory', async () => {
    list.mockResolvedValue([]);
    const { findByTestId, getByTestId, props } = renderSheet();

    expect(await findByTestId('conversations-empty')).toHaveTextContent('No past chats yet.');
    fireEvent.press(getByTestId('conversations-new'));
    fireEvent.press(getByTestId('conversations-memory'));

    expect(props.onNewChat).toHaveBeenCalledTimes(1);
    expect(props.onOpenMemory).toHaveBeenCalledTimes(1);
  });

  it('says when the list could not load, and tries again', async () => {
    list.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(conversations);
    const { findByTestId, getByTestId } = renderSheet();

    expect(await findByTestId('conversations-error')).toHaveTextContent(/^Couldn't load your past chats\./);
    fireEvent.press(getByTestId('conversations-retry'));

    expect(await findByTestId('conversation-c2')).toBeTruthy();
  });

  it('loads each time it opens, and not while closed', async () => {
    list.mockResolvedValue(conversations);
    const { rerender, props } = renderSheet({ visible: false });
    expect(list).not.toHaveBeenCalled();

    rerender(<ConversationsSheet {...props} visible />);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    rerender(<ConversationsSheet {...props} visible={false} />);
    rerender(<ConversationsSheet {...props} visible />);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it('reads each row as a button with its title and date', async () => {
    list.mockResolvedValue(conversations);
    const { findByTestId } = renderSheet();

    const row = await findByTestId('conversation-c2');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBe('Which habits affect my scores?, yesterday');
  });

  it('has a close button', async () => {
    list.mockResolvedValue([]);
    const { findByTestId, getByTestId, props } = renderSheet();

    await findByTestId('conversations-empty');
    const close = getByTestId('conversations-close');
    expect(close.props.accessibilityRole).toBe('button');
    expect(close.props.accessibilityLabel).toBe('Close');
    fireEvent.press(close);

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('loads older chats from the last one shown, until a page comes back short', async () => {
    const page = Array.from({ length: 20 }, (_, i) => ({
      id: `p${i}`,
      title: `Question ${i}`,
      lastMessageAt: `2026-09-${String(29 - i).padStart(2, '0')}T08:00:00.000Z`,
    }));
    list.mockResolvedValueOnce(page).mockResolvedValueOnce([{ id: 'old', title: 'An old one', lastMessageAt: '2026-08-01T08:00:00.000Z' }]);
    const { findByTestId, getByTestId, queryByTestId } = renderSheet();

    await findByTestId('conversation-p19');
    expect(list).toHaveBeenLastCalledWith();
    fireEvent.press(getByTestId('conversations-more'));

    expect(await findByTestId('conversation-old')).toBeTruthy();
    expect(list).toHaveBeenLastCalledWith('2026-09-10T08:00:00.000Z');
    expect(getByTestId('conversation-p0')).toBeTruthy();
    expect(queryByTestId('conversations-more')).toBeNull();
  });

  it('offers no older chats after a short first page', async () => {
    list.mockResolvedValue(conversations);
    const { findByTestId, queryByTestId } = renderSheet();

    await findByTestId('conversation-c1');
    expect(queryByTestId('conversations-more')).toBeNull();
  });

  it('keeps the list when older chats fail to load, and lets you try again', async () => {
    const page = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, title: `Question ${i}`, lastMessageAt: '2026-09-20T08:00:00.000Z' }));
    list
      .mockResolvedValueOnce(page)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([{ id: 'old', title: 'An old one', lastMessageAt: '2026-08-01T08:00:00.000Z' }]);
    const { findByTestId, getByTestId } = renderSheet();

    fireEvent.press(await findByTestId('conversations-more'));
    expect(await findByTestId('conversations-more-error')).toHaveTextContent(/Couldn't load older chats/);
    expect(getByTestId('conversation-p0')).toBeTruthy();
    fireEvent.press(getByTestId('conversations-more'));

    expect(await findByTestId('conversation-old')).toBeTruthy();
  });

  it('ignores a list that arrives after the sheet was reopened', async () => {
    let resolveFirst: (rows: unknown) => void = () => {};
    list
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(conversations);
    const { rerender, props, findByTestId, queryByTestId } = renderSheet();

    rerender(<ConversationsSheet {...props} visible={false} />);
    rerender(<ConversationsSheet {...props} visible />);
    await findByTestId('conversation-c2');
    await act(async () => {
      resolveFirst([{ id: 'stale', title: 'Stale', lastMessageAt: '2026-09-01T08:00:00.000Z' }]);
    });

    expect(queryByTestId('conversation-stale')).toBeNull();
  });
});
