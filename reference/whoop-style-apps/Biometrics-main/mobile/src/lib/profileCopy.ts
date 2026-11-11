// Every new Profile string (spec 2026-10-13 §2): the passport, the category cards and their status lines,
// and the account row. The moved Settings sections keep their own copy.

import { formatLastSynced } from '../sync/formatLastSynced';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const onOff = (on: boolean) => (on ? 'on' : 'off');
const PROVIDERS: Record<string, string> = { apple: 'Apple', google: 'Google', credential: 'Email' };

export type ProfileCategory = 'kipColour' | 'health' | 'timezone' | 'notifications' | 'buddies' | 'chats' | 'coach' | 'aiCoach' | 'signIn';

export const PROFILE_COPY = {
  title: 'Profile',

  passport: {
    heading: 'Biometrics · passport',
    number: (code: string) => `NO. ${code}`,
    photoLabel: 'Your KIP',
    recapLabel: (hint: string) => `Your KIP. ${hint}`,
    fields: { name: 'NAME', handle: 'HANDLE', home: 'HOME', joined: 'JOINED', streak: 'CHECK-IN STREAK', buddies: 'BUDDIES' },
    handle: (h: string) => `@${h}`,
    none: '—',
    streak: (n: number) => plural(n, 'day'),
    buddies: (n: number) => String(n),
    stamps: 'Stamps · badges earned',
    noStamps: 'Badges you earn are stamped here.',
    stampLabel: (name: string) => `${name} badge`,
    edit: 'Edit',
    editLabel: 'Edit your name and handle',
  },

  categories: {
    kipColour: 'KIP colour',
    health: 'Health data',
    timezone: 'Time zone',
    notifications: 'Notifications',
    buddies: 'Buddies & sharing',
    chats: 'Chats',
    coach: 'Your coach',
    aiCoach: 'AI Coach',
    signIn: 'Sign-in',
  } as Record<ProfileCategory, string>,

  status: {
    kipColour: (name: string) => name,
    health: (connected: boolean, lastSyncedAt: string | null, now: Date) =>
      !connected ? 'Not connected' : lastSyncedAt ? `Google Health · ${formatLastSynced(lastSyncedAt, now, 'synced')}` : 'Google Health · not synced yet',
    timezone: (s: { timezone: string; overridden: boolean }) => `${s.overridden ? 'Custom' : 'Device'} · ${s.timezone}`,
    notifications: (on: number, total: number) => `${on} of ${total} on`,
    buddies: (handle: string | null, sharing: number, total: number) => (handle ? `@${handle} · sharing ${sharing} of ${total}` : 'Set up your handle'),
    chats: (s: { readReceipts: boolean; activityStatus: boolean }) => `Read receipts ${onOff(s.readReceipts)} · status ${onOff(s.activityStatus)}`,
    coach: (name: string, style: string, text: string) => `${name} · ${style} · ${text}`,
    aiCoach: (consented: boolean) => (consented ? 'On · Coach Memory' : 'Off · tap to set up'),
    signIn: (providers: string[], devices: number) => `${providers.map((p) => PROVIDERS[p] ?? p).join(', ')} · ${plural(devices, 'device')}`,
  },
  /** A card's spoken name: its title, then its status when there is one. */
  cardLabel: (title: string, status: string | null) => (status ? `${title}. ${status}` : title),
  categoriesLabel: 'Settings',

  signedInAs: (email: string) => `Signed in as ${email}`,

  account: {
    label: 'Account',
    signOut: 'Sign out',
    delete: 'Delete account',
    deleteNote: 'Deleting removes your account and all the data stored for it.',
  },

  kipColour: {
    yourKip: 'Your KIP',
    picked: (name: string, hex: string) => `${name} · ${hex}`,
    previewLabel: (name: string) => `Your KIP in ${name}`,
    colour: 'Colour',
    buddiesSee: 'Buddies see this colour',
    groupLabel: 'KIP colour',
    reset: 'Reset to coral',
    save: 'Save colour',
    failed: "Your colour couldn't be saved.",
    retry: 'Try again',
  },
};
