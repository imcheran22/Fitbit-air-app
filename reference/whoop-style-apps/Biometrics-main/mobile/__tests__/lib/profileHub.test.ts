import { categoryCards, NO_READS, type HubInput, type ProfileReads } from '../../src/lib/profileHub';

const NOW = new Date('2026-10-13T10:12:00Z');
const reads: ProfileReads = {
  identity: { handle: 'tushar', displayName: 'Tushar', displayNamePrefill: '', moodNoticeSeen: true },
  timezone: { timezone: 'Europe/London', overridden: false },
  pushAvailable: true,
  notifications: {
    recapPushEnabled: true,
    notifyBuddyStickers: true,
    notifyBuddyRequests: false,
    notifyBuddyBadges: true,
    notifyDirectMessages: true,
    showMessagePreviews: false,
  },
  sharing: { recovery: true, sleepScore: true, hoursSlept: false, steps: true, streaks: false, consentVersion: 1, consented: true },
  chats: { readReceipts: true, activityStatus: false },
  providers: ['apple', 'google'],
  devices: 2,
};
const input = (over: Partial<HubInput> = {}): HubInput => ({
  reads,
  health: { connected: true, lastSyncedAt: '2026-10-13T10:00:00Z' },
  buddiesAvailable: true,
  chatsAvailable: true,
  coach: { name: 'Sage', style: 'Lightbulb', text: 'Personality lines' },
  aiCoach: { enabled: true, consented: true },
  now: NOW,
  kipColour: 'coral',
  ...over,
});

describe('categoryCards', () => {
  it('builds all nine cards in board order with their status lines', () => {
    expect(categoryCards(input())).toEqual([
      { category: 'kipColour', status: 'Coral' },
      { category: 'health', status: 'Google Health · synced 12 min ago' },
      { category: 'timezone', status: 'Device · Europe/London' },
      { category: 'notifications', status: '4 of 6 on' },
      { category: 'buddies', status: '@tushar · sharing 3 of 5' },
      { category: 'chats', status: 'Read receipts on · status off' },
      { category: 'coach', status: 'Sage · Lightbulb · Personality lines' },
      { category: 'aiCoach', status: 'On · Coach Memory' },
      { category: 'signIn', status: 'Apple, Google · 2 devices' },
    ]);
  });

  it('leaves out what this server or device lacks, and counts only the switches that show', () => {
    const cards = categoryCards(input({ buddiesAvailable: false, chatsAvailable: false, aiCoach: { enabled: false, consented: false } }));
    expect(cards.map((c) => c.category)).toEqual(['kipColour', 'health', 'timezone', 'notifications', 'coach', 'signIn']);
    expect(cards.find((c) => c.category === 'notifications')?.status).toBe('1 of 1 on');
    expect(categoryCards(input({ reads: { ...reads, pushAvailable: false } })).map((c) => c.category)).not.toContain('notifications');
  });

  it('puts the KIP colour card first, with the colour name', () => {
    const cards = categoryCards(input({ kipColour: 'sky' }));
    expect(cards[0]).toEqual({ category: 'kipColour', status: 'Sky' });
  });

  it('shows a card with its title alone when its status could not be read', () => {
    const cards = categoryCards(input({ reads: { ...NO_READS, pushAvailable: true } }));
    for (const c of ['timezone', 'notifications', 'buddies', 'chats', 'signIn'] as const) {
      expect(cards.find((x) => x.category === c)?.status).toBeNull();
    }
    expect(cards.find((c) => c.category === 'health')?.status).toBe('Google Health · synced 12 min ago');
  });
});
