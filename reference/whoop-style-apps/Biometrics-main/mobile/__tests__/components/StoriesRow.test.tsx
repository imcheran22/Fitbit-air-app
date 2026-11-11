import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { PersonKip } from '../../src/components/kip/PersonKip';
import { StoriesRow } from '../../src/components/social/StoriesRow';
import { resetMyKipColour, setMyKipColour } from '../../src/lib/kip/myKipColour';

const person = (id: string) => ({ id, handle: id, displayName: id.toUpperCase(), coachId: 'mochi' });

it('starts with my check-in, then buddies (locked ones show a lock), then See all', () => {
  const onCheckIn = jest.fn();
  const onOpenStory = jest.fn();
  const onSeeAll = jest.fn();
  render(
    <StoriesRow
      me={{ person: person('me'), checkIn: null }}
      rings={[{ author: person('sam'), unseen: true, locked: true, frameCount: 2, latestAt: '' }, { author: person('ana'), unseen: false, locked: false, frameCount: 1, latestAt: '' }]}
      onCheckIn={onCheckIn} onOpenStory={onOpenStory} onSeeAll={onSeeAll}
    />,
  );
  expect(screen.getByTestId('story-me-plus')).toBeTruthy();
  fireEvent.press(screen.getByTestId('story-me'));
  expect(onCheckIn).toHaveBeenCalled();
  expect(screen.getByTestId('story-sam-lock')).toBeTruthy();
  expect(screen.queryByTestId('story-ana-lock')).toBeNull();
  fireEvent.press(screen.getByTestId('story-ana'));
  expect(onOpenStory).toHaveBeenCalledWith('ana');
  fireEvent.press(screen.getByTestId('stories-see-all'));
  expect(onSeeAll).toHaveBeenCalled();
});

it('after checking in, my ring opens my own story', () => {
  const onOpenStory = jest.fn();
  render(<StoriesRow me={{ person: person('me'), checkIn: { mood: 'RESTED', localDate: '2026-10-07', updatedAt: '' } }} rings={[]} onCheckIn={jest.fn()} onOpenStory={onOpenStory} onSeeAll={jest.fn()} />);
  expect(screen.queryByTestId('story-me-plus')).toBeNull();
  fireEvent.press(screen.getByTestId('story-me'));
  expect(onOpenStory).toHaveBeenCalledWith('me');
});

describe('people as their KIPs', () => {
  afterEach(() => resetMyKipColour());

  it("draws each ring's author in their colour, and my ring in my colour", () => {
    setMyKipColour('ink');
    render(
      <StoriesRow
        me={{ person: { ...person('me'), kipColour: 'lime' }, checkIn: null }}
        rings={[{ author: { ...person('sam'), kipColour: 'sky' }, unseen: true, locked: false, frameCount: 1, latestAt: '' }]}
        onCheckIn={jest.fn()} onOpenStory={jest.fn()} onSeeAll={jest.fn()}
      />,
    );
    expect(within(screen.getByTestId('story-me')).UNSAFE_getByType(PersonKip).props).toMatchObject({ colour: 'ink', size: 34 });
    expect(within(screen.getByTestId('story-sam')).UNSAFE_getByType(PersonKip).props).toMatchObject({ colour: 'sky', size: 34 });
  });
});

it('names a buddy by @handle when their display name is unset', () => {
  render(
    <StoriesRow
      me={{ person: person('me'), checkIn: null }}
      rings={[{ author: { ...person('kai'), displayName: '' }, unseen: true, locked: false, frameCount: 1, latestAt: '' }]}
      onCheckIn={jest.fn()} onOpenStory={jest.fn()} onSeeAll={jest.fn()}
    />,
  );
  expect(screen.getByText('@kai')).toBeTruthy();
  expect(screen.getByLabelText("@kai's story, new")).toBeTruthy();
});

it('keeps a long buddy name under its ring to one line', () => {
  render(
    <StoriesRow
      me={{ person: person('me'), checkIn: null }}
      rings={[{ author: { ...person('kai'), displayName: 'Bartholomew Featherstonehaugh' }, unseen: true, locked: false, frameCount: 1, latestAt: '' }]}
      onCheckIn={jest.fn()} onOpenStory={jest.fn()} onSeeAll={jest.fn()}
    />,
  );
  const name = screen.getByText(/Bartholomew/);
  expect(name.props.numberOfLines).toBe(1);
  expect(String(name.props.className).split(' ')).toContain('text-caption');
  // Without a bound the long name widens its column instead of truncating.
  expect(StyleSheet.flatten(name.props.style).maxWidth).toBe(64);
});
