import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { HighlightsCarousel } from '../../src/components/social/HighlightsCarousel';
import type { HighlightItem } from '../../src/api/social';

const sam = { id: 'sam', handle: 'sam', displayName: 'Sam', coachId: 'mochi' };

it('names the week by ISO number, colours the kickers by type, and opens All', () => {
  const onOpenAll = jest.fn();
  render(
    <HighlightsCarousel
      highlights={{ weekStart: '2026-09-28', weekEnd: '2026-10-04', items: [
        { type: 'top_story', reason: 'checked_in_every_day', actor: sam, mine: false },
        { type: 'most_cheered_you', count: 2, actor: sam, mine: false },
        { type: 'checked_in_every_day', actor: sam, mine: false },
      ] }}
      onOpenAll={onOpenAll}
    />,
  );
  expect(screen.getByTestId('highlights-title')).toHaveTextContent('Week 40 highlights');
  expect(screen.getByTestId('highlight-0-kicker')).toHaveStyle({ color: '#A5B4FC' });
  expect(screen.getByTestId('highlight-1-kicker')).toHaveStyle({ color: '#FCD34D' });
  expect(screen.getByTestId('highlight-1')).toHaveTextContent(/Sam cheered you most/);
  fireEvent.press(screen.getByTestId('highlights-all'));
  expect(onOpenAll).toHaveBeenCalled();
});

it('skips highlights of a type it does not know, and shows nothing when none are left', () => {
  const also = { type: 'also', actor: sam, mine: false } as unknown as HighlightItem;
  const { rerender } = render(
    <HighlightsCarousel highlights={{ weekStart: '2026-09-28', weekEnd: '2026-10-04', items: [also, { type: 'comeback', actor: sam, mine: false }] }} onOpenAll={jest.fn()} />,
  );
  expect(screen.getByTestId('highlight-0')).toHaveTextContent(/Sam bounced back to rested/);
  expect(screen.getByTestId('highlight-0-kicker')).toHaveStyle({ color: '#86EFAC' });
  expect(screen.queryByTestId('highlight-1')).toBeNull();
  rerender(<HighlightsCarousel highlights={{ weekStart: '2026-09-28', weekEnd: '2026-10-04', items: [also] }} onOpenAll={jest.fn()} />);
  expect(screen.queryByTestId('highlights-carousel')).toBeNull();
});
