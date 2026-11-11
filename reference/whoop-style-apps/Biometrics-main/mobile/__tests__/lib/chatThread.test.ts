import type { Message, Thread } from '../../src/api/chats';
import { firstWindow, olderWindow, pollWindow, threadItems, threadMessages, withReactions, withSent, withoutMessage } from '../../src/lib/chatThread';

const T0 = new Date(2026, 9, 8, 9, 0).getTime();
const m = (n: number, over: Partial<Message> = {}): Message => ({
  id: `m${n}`, mine: n % 2 === 0, kind: 'TEXT', text: `t${n}`, sticker: null, card: null, replyTo: null, reactions: [],
  createdAt: new Date(T0 + n * 60_000).toISOString(), ...over,
});
const page = (ns: number[], nextBefore: string | null, over: Partial<Thread> = {}): Thread => ({
  buddy: { id: 'b', handle: 'b', displayName: 'Ben', coachId: 'mochi' }, messages: ns.map((n) => m(n)), nextBefore, seenAt: null, activeAt: null, ...over,
});
const ids = (list: Message[]) => list.map((x) => x.id);

it('a poll replaces the newest window and carries what slid out of it: no gap, no duplicate', () => {
  let w = firstWindow(page([3, 4, 5], 'c3'));
  w = pollWindow(w, page([4, 5, 6], 'c4'));
  expect(ids(threadMessages(w))).toEqual(['m3', 'm4', 'm5', 'm6']);
  expect(w.cursor).toBe('c3'); // older pages still start before m3
  w = olderWindow(w, page([1, 2], null));
  expect(ids(threadMessages(w))).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6']);
  w = pollWindow(w, page([6, 7, 8], 'c6'));
  expect(ids(threadMessages(w))).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8']);
  expect(w.cursor).toBeNull();
});

it('an unsend or a reaction inside the window shows on the next poll', () => {
  let w = firstWindow(page([1, 2, 3], null));
  const next = page([1, 3], null);
  next.messages[0] = m(1, { reactions: [{ kind: 'HEART', mine: false }] });
  w = pollWindow(w, next);
  expect(ids(threadMessages(w))).toEqual(['m1', 'm3']);
  expect(threadMessages(w)[0]!.reactions).toEqual([{ kind: 'HEART', mine: false }]);
});

it('without older pages, the cursor follows the newest page; an empty page empties the thread', () => {
  let w = firstWindow(page([1, 2], null));
  w = pollWindow(w, page([1, 2, 3], null));
  expect(w.cursor).toBeNull();
  w = pollWindow(w, page([], null));
  expect(threadMessages(w)).toEqual([]);
});

it('a message carried out of the window keeps its newest look, not the stale older-page copy', () => {
  let w = firstWindow(page([3, 4, 5], 'c3'));
  w = olderWindow(w, page([1, 2], null));
  w = pollWindow(w, page([1, 2, 3], null)); // m4 and m5 unsent: the page reaches back over the older pages
  const hearted = page([1, 2, 3], null);
  hearted.messages[1] = m(2, { reactions: [{ kind: 'HEART', mine: false }] });
  w = pollWindow(w, hearted);
  w = pollWindow(w, page([6, 7, 8], 'c6'));
  expect(ids(threadMessages(w))).toEqual(['m1', 'm2', 'm3', 'm6', 'm7', 'm8']);
  expect(threadMessages(w).find((x) => x.id === 'm2')!.reactions).toEqual([{ kind: 'HEART', mine: false }]);
});

it('a card gated since it was first loaded stays gated when it slides out of the window', () => {
  const shared = (n: number) => m(n, { kind: 'CARD', text: null, card: { type: 'badge', available: true, family: 'SLEEP_GOAL', level: 3 } });
  const gated = (n: number) => m(n, { kind: 'CARD', text: null, card: { type: 'badge', available: false, family: 'SLEEP_GOAL' } });
  let w = firstWindow({ ...page([], 'c3'), messages: [m(3), m(4), m(5)] });
  w = olderWindow(w, { ...page([], null), messages: [m(1), shared(2)] });
  w = pollWindow(w, { ...page([], null), messages: [m(1), shared(2), m(3)] }); // m4, m5 unsent
  w = pollWindow(w, { ...page([], null), messages: [m(1), gated(2), m(3)] }); // the author stopped sharing streaks
  w = pollWindow(w, page([6, 7, 8], 'c6'));
  expect(threadMessages(w).find((x) => x.id === 'm2')!.card).toEqual({ type: 'badge', available: false, family: 'SLEEP_GOAL' });
});

it('an unsend that moves the page start back over older pages shows each message once, and never the unsent one', () => {
  let w = firstWindow(page([4, 5, 6], 'c4'));
  w = olderWindow(w, page([1, 2, 3], null));
  w = pollWindow(w, page([1, 2, 4], null)); // m3, m5 and m6 unsent
  expect(ids(threadMessages(w))).toEqual(['m1', 'm2', 'm4']);
});

it('adds a sent message, swaps reactions and drops an unsent one in place', () => {
  let w = firstWindow(page([1, 2], null));
  w = withSent(w, m(3));
  w = withSent(w, m(3));
  expect(ids(threadMessages(w))).toEqual(['m1', 'm2', 'm3']);
  w = withReactions(w, 'm1', [{ kind: 'STAR', mine: true }]);
  expect(threadMessages(w)[0]!.reactions).toEqual([{ kind: 'STAR', mine: true }]);
  w = withoutMessage(w, 'm2');
  expect(ids(threadMessages(w))).toEqual(['m1', 'm3']);
});

it('lays out day chips, and "Seen" under my newest message when seenAt is that message\'s time', () => {
  const now = new Date(2026, 9, 8, 18, 0);
  const yesterday = m(0, { createdAt: new Date(2026, 9, 7, 21, 0).toISOString() });
  const list = [yesterday, m(1), m(2)];
  expect(threadItems(list, null, now).map((i) => i.type)).toEqual(['chip', 'message', 'chip', 'message', 'message']);
  // The server sends seenAt = the time of my newest message once it was read.
  expect(threadItems(list, list[2]!.createdAt, now).map((i) => i.type).slice(-1)).toEqual(['seen']);
  // An older seenAt (a poll from before my latest send): not seen yet.
  expect(threadItems(list, list[1]!.createdAt, now).some((i) => i.type === 'seen')).toBe(false);
  // Their message last: no "Seen".
  expect(threadItems([m(1)], m(1).createdAt, now).some((i) => i.type === 'seen')).toBe(false);
});
