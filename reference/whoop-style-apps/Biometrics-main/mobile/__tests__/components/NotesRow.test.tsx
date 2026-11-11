import React from 'react';
import { render, screen, within } from '@testing-library/react-native';
import { NotesRow } from '../../src/components/chats/NotesRow';

const person = (id: string) => ({ id, handle: id, displayName: id.toUpperCase(), coachId: 'mochi' });
const later = new Date(Date.now() + 60 * 60_000).toISOString();
const LONGEST = 'Marathon training this week, wish me luck and send snacks!!'; // notes are at most 60

const classes = (el: { props: { className?: unknown } }) => String(el.props.className).split(' ');

it('sets note text at text-caption in two lines at most, shrinking a little (never under 0.85) to fit the bubble', () => {
  render(
    <NotesRow
      me={person('me')}
      mine={null}
      buddies={[{ person: person('ana'), text: LONGEST, createdAt: later, expiresAt: later }]}
      onMine={jest.fn()}
      onOpen={jest.fn()}
      onReport={jest.fn()}
    />,
  );
  for (const text of ['Share a note', LONGEST]) {
    const note = screen.getByText(text);
    expect(classes(note)).toContain('text-caption');
    expect(classes(note)).not.toContain('text-fine');
    expect(note.props.numberOfLines).toBe(2);
    expect(note.props.adjustsFontSizeToFit).toBe(true);
    expect(note.props.minimumFontScale).toBeGreaterThanOrEqual(0.85);
  }
  // The bubble is as wide as its 68-px column with 6-px sides: 56 px of text, room for "Share a / note" at 13 px.
  for (const id of ['me', 'ana']) expect(classes(screen.getByTestId(`note-bubble-${id}`))).toEqual(expect.arrayContaining(['max-w-[68px]', 'px-1.5']));
});

it('rests every bubble at the foot of an equal fixed-height slot, so the avatars line up whatever the notes say', () => {
  render(
    <NotesRow
      me={person('me')}
      mine={null}
      buddies={[{ person: person('ana'), text: LONGEST, createdAt: later, expiresAt: later }]}
      onMine={jest.fn()}
      onOpen={jest.fn()}
      onReport={jest.fn()}
    />,
  );
  // A one-line prompt and a two-line note: the same slot over each avatar, its bubble inside, the avatar right after.
  for (const id of ['me', 'ana']) {
    const slot = screen.getByTestId(`note-slot-${id}`);
    expect(classes(slot)).toEqual(expect.arrayContaining(['h-[46px]', 'justify-end']));
    expect(within(slot).getByTestId(`note-bubble-${id}`)).toBeTruthy();
    const press = screen.getByTestId(id === 'me' ? 'note-mine' : `note-${id}`);
    const order = press
      .findAll((n) => typeof n.type === 'string' && /^note-(slot|avatar)-/.test(String(n.props.testID)))
      .map((n) => n.props.testID);
    expect(order).toEqual([`note-slot-${id}`, `note-avatar-${id}`]);
  }
});
