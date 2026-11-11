import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { ChatComposer } from '../../src/components/chats/ChatComposer';
import { NoteComposerSheet } from '../../src/components/chats/NoteComposerSheet';
import { CampNoteCard } from '../../src/components/social/CampNoteCard';
import { FONTS } from '../../src/theme';

jest.mock('../../src/api/chats');

const flat = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style) as Record<string, unknown>;

const mountCampNote = () =>
  render(
    <CampNoteCard inputRef={React.createRef()} draft="" onDraft={jest.fn()} length={0} canShare={false} onShare={jest.fn()} live={null}
      editing={false} onEdit={jest.fn()} onCancel={jest.fn()} onClear={jest.fn()} busy={false} message={null} buddies={2} kipColour="coral" />,
  );

// iOS draws a placeholder in the input's own font, so an empty input showing
// its placeholder is where a missing font shows first (spec §3: these had none).
const INPUTS: Array<[string, () => unknown, string, string]> = [
  [
    'the chat composer',
    () =>
      render(
        <ChatComposer disabled={false} quote={null} onClearQuote={jest.fn()} replyTo={null} onClearReply={jest.fn()} canShareCheckIn
          onShareCheckIn={jest.fn()} onSticker={jest.fn()} onSend={jest.fn(async () => true)} />,
      ),
    'composer-input',
    'Message…',
  ],
  ['the note composer', () => render(<NoteComposerSheet visible current={null} onClose={jest.fn()} onSaved={jest.fn()} />), 'note-input', 'early night tonight'],
  ['the camp note', mountCampNote, 'camp-note-input', 'Say something to the camp…'],
];

it.each(INPUTS)('%s draws its placeholder and text in Geist at the body size', (_name, mount, testID, placeholder) => {
  mount();
  const input = screen.getByTestId(testID);
  expect(input.props.value ?? '').toBe('');
  expect(input.props.placeholder).toBe(placeholder);
  expect(flat(testID)).toEqual(expect.objectContaining({ fontFamily: FONTS.sans, fontSize: 15 }));
  // The size comes from the style alone: no class fighting it.
  expect(String(input.props.className ?? '')).not.toMatch(/text-(?:base|\[)/);
});

it('the camp note keeps its own box: height, padding, radius and border', () => {
  mountCampNote();
  expect(flat('camp-note-input')).toEqual(
    expect.objectContaining({ height: 76, paddingTop: 12, paddingLeft: 14, paddingRight: 52, borderRadius: 16, borderWidth: 1.5 }),
  );
});
