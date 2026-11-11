// The Campfire panel and the story viewers are dark whatever the app's scheme, but a Button's `dark:` classes follow
// the app's scheme. These check that each of their Buttons resolves to the same classes under the light scheme as
// under the dark one, so a light app never draws a light-mode outline or destructive on the panel's dark tokens.
import React from 'react';
import { TextInput } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { CampNoteCard, type CampNoteCardProps } from '../../src/components/social/CampNoteCard';
import { GoodnightButton } from '../../src/components/social/GoodnightButton';
import { PersonKip } from '../../src/components/kip/PersonKip';
import { SocialStoryFrame } from '../../src/components/social/SocialStoryFrame';
import { Button } from '../../src/components/ui/button';
import { resetMyKipColour, setMyKipColour } from '../../src/lib/kip/myKipColour';
import { cn } from '../../src/lib/utils';

jest.mock('../../src/api/social', () => ({ ...jest.requireActual('../../src/api/social'), sayGoodnight: jest.fn(), undoGoodnight: jest.fn() }));

/** The classes that apply in a scheme: the `dark:` ones only in dark, where they win over their light twins. */
function inScheme(className: string, scheme: 'light' | 'dark'): string[] {
  const all = className.split(/\s+/).filter(Boolean);
  const light = all.filter((c) => !c.startsWith('dark:'));
  const dark = scheme === 'dark' ? all.filter((c) => c.startsWith('dark:')).map((c) => c.slice('dark:'.length)) : [];
  return cn(...light, ...dark).split(' ').sort();
}
const classesOf = (testID: string) => String(screen.getByTestId(testID).props.className ?? '');
const expectSchemeProof = (testID: string) => expect(inScheme(classesOf(testID), 'light')).toEqual(inScheme(classesOf(testID), 'dark'));

const card = (over: Partial<CampNoteCardProps>): CampNoteCardProps => ({
  inputRef: React.createRef<TextInput>(), draft: '', onDraft: jest.fn(), length: 0, canShare: false, onShare: jest.fn(), live: null,
  editing: false, onEdit: jest.fn(), onCancel: jest.fn(), onClear: jest.fn(), busy: false, message: null, buddies: 2, kipColour: 'coral', ...over,
});
const live = { text: 'Early night', expiresAt: null };

it('the check is real: a plain outline and destructive differ between the schemes', () => {
  render(<><Button testID="o" variant="outline">O</Button><Button testID="d" variant="destructive">D</Button></>);
  expect(inScheme(classesOf('o'), 'light')).not.toEqual(inScheme(classesOf('o'), 'dark'));
  expect(inScheme(classesOf('d'), 'light')).not.toEqual(inScheme(classesOf('d'), 'dark'));
});

describe('CampNoteCard on the panel', () => {
  it('drafting: the chips (outline xs buttons) and Share look the same in both schemes', () => {
    render(<CampNoteCard {...card({})} />);
    expectSchemeProof('camp-chip-0');
    expect(classesOf('camp-chip-0').split(' ')).toEqual(expect.arrayContaining(['rounded-[8px]', 'h-[24px]', 'border-input', 'bg-input/30']));
    expectSchemeProof('camp-note-share');
    // The standard default lg: no bespoke height, radius or ink.
    expect(classesOf('camp-note-share').split(' ')).toEqual(expect.arrayContaining(['bg-foreground', 'h-[40px]', 'rounded-[8px]', 'flex-1']));
    expect(classesOf('camp-note-share')).not.toMatch(/h-\[54px\]|rounded-\[18px\]/);
    expect(screen.getByTestId('camp-note-share')).toBeDisabled();
  });

  it('editing a live note: Cancel (secondary) and Clear note (destructive) look the same in both schemes', () => {
    render(<CampNoteCard {...card({ live, editing: true, draft: 'Early night', length: 11, canShare: true })} />);
    expect(screen.getByTestId('camp-note-share')).not.toBeDisabled();
    expectSchemeProof('camp-note-cancel');
    expectSchemeProof('camp-note-clear');
    expect(classesOf('camp-note-clear').split(' ')).toEqual(expect.arrayContaining(['bg-destructive/20', 'h-[32px]']));
  });

  it('a live note: Edit (secondary) and Clear (destructive) look the same in both schemes', () => {
    render(<CampNoteCard {...card({ live })} />);
    expectSchemeProof('camp-note-edit');
    expectSchemeProof('camp-note-clear');
    expect(classesOf('camp-note-clear').split(' ')).toEqual(expect.arrayContaining(['bg-destructive/20', 'h-[40px]', 'flex-1']));
  });
});

it("the camp's Say goodnight is the standard lg Button in indigo, the same in both schemes", () => {
  render(<GoodnightButton testID="camp-goodnight" look="camp" goodnight={null} onChanged={jest.fn()} />);
  expectSchemeProof('camp-goodnight-say');
  const classes = classesOf('camp-goodnight-say').split(' ');
  expect(classes).toEqual(expect.arrayContaining(['h-[40px]', 'rounded-[8px]', 'bg-[#6366F1]/25', 'border-[#A5B4FC]/35']));
  expect(classes).not.toContain('bg-foreground');
  expect(String(screen.getByText('Say goodnight').props.className)).toContain('text-[#E0E7FF]');
});

it("the story's Check in is white with dark text in both schemes, and the frame lets other taps through", () => {
  const sam = { id: 'sam', handle: 'sam', displayName: 'Sam', coachId: 'mochi', kipColour: 'sky' };
  render(<SocialStoryFrame frame={{ kind: 'checkin', at: '2026-10-07T14:00:00.000Z', locked: true } as never} author={sam as never} mine={false} onUnlock={jest.fn()} />);
  expectSchemeProof('story-unlock');
  expect(classesOf('story-unlock').split(' ')).toEqual(expect.arrayContaining(['bg-white', 'h-[32px]']));
  expect(String(screen.getByText('Check in').props.className)).toContain('text-black');
  expect(screen.getByTestId('story-locked')).toHaveProp('pointerEvents', 'box-none');
  expect(screen.UNSAFE_getByType(PersonKip).props).toMatchObject({ colour: 'sky', state: 'none', size: 96 });
});

describe('the story frame draws its author as their KIP', () => {
  afterEach(() => resetMyKipColour());
  const sam = { id: 'sam', handle: 'sam', displayName: 'Sam', coachId: 'mochi', kipColour: 'sky' };

  it("a buddy's goodnight: their colour, asleep", () => {
    render(<SocialStoryFrame frame={{ kind: 'goodnight', at: '2026-10-07T02:00:00.000Z', onTime: true }} author={sam} mine={false} onUnlock={jest.fn()} />);
    expect(screen.UNSAFE_getByType(PersonKip).props).toMatchObject({ colour: 'sky', state: 'asleep', size: 96 });
  });

  it('my own frame: my colour, not the one on my person record', () => {
    setMyKipColour('ink');
    render(<SocialStoryFrame frame={{ kind: 'goodnight', at: '2026-10-07T02:00:00.000Z', onTime: true }} author={sam} mine onUnlock={jest.fn()} />);
    expect(screen.UNSAFE_getByType(PersonKip).props).toMatchObject({ colour: 'ink', state: 'asleep' });
  });
});
