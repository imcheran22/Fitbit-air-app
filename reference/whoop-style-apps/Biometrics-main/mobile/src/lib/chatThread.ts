import type { Message, Reaction, Thread } from '../api/chats';
import { dayChip, sameLocalDay } from './chatCopy';

// The polled thread window (plan ruling). An open thread re-reads its newest page every 5 s and keeps the older pages it
// loaded. A poll REPLACES the newest window, so new messages, unsends, reactions and "Seen" inside it show within 5 s;
// a message that slides out of the window is carried into `older` (never dropped, never shown twice), and older pages
// keep their cursor. A message outside the newest window keeps how it last looked until the thread is opened again.
// The server never sends an unsent message, so one missing from a poll is gone.

export interface ThreadWindow { older: Message[]; newest: Message[]; cursor: string | null }

const byTime = (a: Message, b: Message) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
function uniqueSorted(list: readonly Message[]): Message[] {
  const seen = new Set<string>();
  return list.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true))).sort(byTime);
}

export const firstWindow = (page: Thread): ThreadWindow => ({ older: [], newest: page.messages, cursor: page.nextBefore });

export function pollWindow(w: ThreadWindow, page: Thread): ThreadWindow {
  const start = page.messages[0];
  // Nothing visible any more (all unsent): nothing older is either.
  if (!start) return { older: [], newest: [], cursor: null };
  const carried = w.newest.filter((m) => byTime(m, start) < 0);
  // The carried copy first: it is the newer read (reactions, a card gated since), so it wins over an older page's copy.
  const older = uniqueSorted([...carried, ...w.older]);
  // Once older messages are held, older pages continue from where they stopped; until then, from the newest page.
  return { older, newest: page.messages, cursor: w.older.length > 0 || carried.length > 0 ? w.cursor : page.nextBefore };
}

export const olderWindow = (w: ThreadWindow, page: Thread): ThreadWindow => ({
  older: uniqueSorted([...page.messages, ...w.older]),
  newest: w.newest,
  cursor: page.nextBefore,
});

/** Everything to show, oldest first. */
export function threadMessages(w: ThreadWindow): Message[] {
  const start = w.newest[0];
  const inWindow = new Set(w.newest.map((m) => m.id));
  return [...w.older.filter((m) => !inWindow.has(m.id) && (!start || byTime(m, start) < 0)), ...w.newest];
}

export const withSent = (w: ThreadWindow, message: Message): ThreadWindow => ({ ...w, newest: uniqueSorted([...w.newest, message]) });

export function withReactions(w: ThreadWindow, id: string, reactions: Reaction[]): ThreadWindow {
  const swap = (list: Message[]) => list.map((m) => (m.id === id ? { ...m, reactions } : m));
  return { ...w, older: swap(w.older), newest: swap(w.newest) };
}

export const withoutMessage = (w: ThreadWindow, id: string): ThreadWindow => ({
  ...w,
  older: w.older.filter((m) => m.id !== id),
  newest: w.newest.filter((m) => m.id !== id),
});

export type ThreadItem =
  | { key: string; type: 'chip'; label: string }
  | { key: string; type: 'message'; message: Message }
  | { key: 'seen'; type: 'seen' };

/**
 * Day chips before each new local day, the messages, and "Seen" when my message is the newest shown and `seenAt` (the
 * newest page's: the time of my newest message once they read it) has reached it. A message I sent after that poll is
 * later than `seenAt`, so "Seen" waits for the next poll.
 */
export function threadItems(messages: readonly Message[], seenAt: string | null, now: Date): ThreadItem[] {
  const items: ThreadItem[] = [];
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    if (!prev || !sameLocalDay(prev.createdAt, m.createdAt)) items.push({ key: `chip-${m.id}`, type: 'chip', label: dayChip(m.createdAt, now) });
    items.push({ key: m.id, type: 'message', message: m });
  });
  const last = messages[messages.length - 1];
  if (last?.mine && seenAt !== null && Date.parse(seenAt) >= Date.parse(last.createdAt)) items.push({ key: 'seen', type: 'seen' });
  return items;
}
