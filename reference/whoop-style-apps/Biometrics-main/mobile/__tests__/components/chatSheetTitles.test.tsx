import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { NewChatSheet } from '../../src/components/chats/NewChatSheet';
import { NoteComposerSheet } from '../../src/components/chats/NoteComposerSheet';

jest.mock('../../src/api/chats');

const classes = (el: { props: { className?: unknown } }) => String(el.props.className).split(' ');

// Spec §2: text-heading is the sheet-title role, as on every other sheet (ReportSheet, CheckInSheet, …).
it.each([
  ['New message', () => render(<NewChatSheet visible onClose={jest.fn()} onPick={jest.fn()} onAdd={jest.fn()} />)],
  ['Share a note', () => render(<NoteComposerSheet visible current={null} onClose={jest.fn()} onSaved={jest.fn()} />)],
])('titles the "%s" sheet in text-heading', (title, mount) => {
  mount();
  const cls = classes(screen.getByText(title));
  expect(cls).toContain('text-heading');
  expect(cls).not.toContain('text-headline');
});
