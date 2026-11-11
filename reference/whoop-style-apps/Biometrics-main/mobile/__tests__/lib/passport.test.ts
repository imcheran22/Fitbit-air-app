import { formatJoined, memberCode, mrzLines, passportStamps } from '../../src/lib/passport';
import { PROFILE_COPY } from '../../src/lib/profileCopy';
import type { FamilyAchievements } from '../../src/api/achievements';

const family = (f: FamilyAchievements['family'], level: number): FamilyAchievements => ({
  family: f,
  kind: 'streak',
  level,
  thresholds: [3, 7, 14, 30, 100],
  levels: [],
  current: 0,
  best: 0,
  nextThreshold: null,
});

describe('memberCode', () => {
  it('is KIP- and four letters or digits, stable for a user and different between users', () => {
    const a = memberCode('6b1c2f0e-1a2b-4c3d-9e8f-001122334455');
    expect(a).toMatch(/^KIP-[A-Z0-9]{4}$/);
    expect(memberCode('6b1c2f0e-1a2b-4c3d-9e8f-001122334455')).toBe(a);
    expect(memberCode('0d6f6c33-7c3a-4f55-8d3c-8f7f5a2b1c00')).not.toBe(a);
  });

  it('never shows a piece of the id itself', () => {
    const id = 'abcd1234-0000-0000-0000-000000000000';
    expect(id.toUpperCase()).not.toContain(memberCode(id).slice(4));
  });
});

describe('formatJoined', () => {
  it('reads day, month and year in capitals', () => {
    expect(formatJoined('2026-03-14')).toBe('14 MAR 2026');
    expect(formatJoined('2026-10-01')).toBe('1 OCT 2026');
  });
});

describe('mrzLines', () => {
  it('builds the two lines from the name, member code, join date and home, padded with <', () => {
    const [one, two] = mrzLines({ name: 'Tushar', code: 'KIP-7Q4M', joinedOn: '2026-03-14', home: 'Europe/London' });
    expect(one).toBe('P<KIP<<TUSHAR<<<<<<<<<<<<<<<<<<<');
    expect(two).toBe('KIP7Q4M<<260314<<EUROPE<LONDON<<');
    expect(one).toHaveLength(32);
    expect(two).toHaveLength(32);
  });

  it('keeps only A–Z and digits, and cuts a long line at the width', () => {
    const [one, two] = mrzLines({ name: 'Zoë Ana-Lyn', code: 'KIP-AB12', joinedOn: null, home: 'America/Argentina/Buenos_Aires' });
    expect(one).toBe('P<KIP<<ZO<<ANA<LYN<<<<<<<<<<<<<<');
    // No join date: six fillers where it would be.
    expect(two).toBe('KIPAB12<<<<<<<<<<AMERICA<ARGENTI');
  });
});

describe('passportStamps', () => {
  it('takes up to five earned families, highest level first, with their short stamp names', () => {
    const stamps = passportStamps([
      family('SLEEP_GOAL', 2),
      family('STEADY_BEDTIME', 1),
      family('STEP_GOAL', 2),
      family('CHECK_IN', 3),
      family('BEST_RECOVERY_WEEK', 1),
      family('EVERY_DAY_LOGGED', 1),
      family('STEADIEST_MONTH', 0),
    ]);
    expect(stamps.map((s) => [s.family, s.level])).toEqual([
      ['CHECK_IN', 3],
      ['SLEEP_GOAL', 2],
      ['STEP_GOAL', 2],
      ['STEADY_BEDTIME', 1],
      ['BEST_RECOVERY_WEEK', 1],
    ]);
    expect(stamps.map((s) => s.short)).toEqual(['CHECK-IN', 'SLEEP', 'STEPS', 'BEDTIME', 'RECOVERY']);
  });

  it('is empty with no badges', () => {
    expect(passportStamps([family('SLEEP_GOAL', 0)])).toEqual([]);
  });
});

describe('PROFILE_COPY status lines', () => {
  const S = PROFILE_COPY.status;
  it('words each category card the way the board does', () => {
    expect(S.health(true, '2026-10-13T10:00:00Z', new Date('2026-10-13T10:12:00Z'))).toBe('Google Health · synced 12 min ago');
    expect(S.health(false, null, new Date())).toBe('Not connected');
    expect(S.timezone({ timezone: 'Europe/London', overridden: false })).toBe('Device · Europe/London');
    expect(S.timezone({ timezone: 'Asia/Tokyo', overridden: true })).toBe('Custom · Asia/Tokyo');
    expect(S.notifications(4, 6)).toBe('4 of 6 on');
    expect(S.buddies('tushar', 3, 5)).toBe('@tushar · sharing 3 of 5');
    expect(S.buddies(null, 0, 5)).toBe('Set up your handle');
    expect(S.chats({ readReceipts: true, activityStatus: false })).toBe('Read receipts on · status off');
    expect(S.coach('Sage', 'Pixel dots', 'Short')).toBe('Sage · Pixel dots · Short');
    expect(S.aiCoach(true)).toBe('On · Coach Memory');
    expect(S.aiCoach(false)).toBe('Off · tap to set up');
    expect(S.signIn(['apple', 'google'], 2)).toBe('Apple, Google · 2 devices');
    expect(S.signIn(['credential'], 1)).toBe('Email · 1 device');
  });

  it('words the passport numbers', () => {
    expect(PROFILE_COPY.passport.streak(12)).toBe('12 days');
    expect(PROFILE_COPY.passport.streak(1)).toBe('1 day');
    expect(PROFILE_COPY.passport.buddies(3)).toBe('3');
  });
});
