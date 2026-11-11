import { randomUUID } from 'crypto';
import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { inQuietHours, isQuietAt, quietWindow } from '../../src/buddies/quietHours';
import { sendBuddyNotice } from '../../src/buddies/notify';
import { parseNotificationSettingsPatch } from '../../src/users/notifications';
import { RecordingSender, addToken, api, buddyUser } from './helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

describe('quiet hours', () => {
  it('defaults to 22:00-07:00 unless both goals are set', () => {
    expect(quietWindow(null, null)).toEqual({ start: '22:00', end: '07:00' });
    expect(quietWindow('23:00', null)).toEqual({ start: '22:00', end: '07:00' });
    expect(quietWindow(null, '06:30')).toEqual({ start: '22:00', end: '07:00' });
    expect(quietWindow('23:30', '06:15')).toEqual({ start: '23:30', end: '06:15' });
  });

  it.each([
    ['22:00', '07:00', '21:59', false], ['22:00', '07:00', '22:00', true], ['22:00', '07:00', '23:59', true], ['22:00', '07:00', '00:00', true],
    ['22:00', '07:00', '06:59', true], ['22:00', '07:00', '07:00', false],
    ['01:00', '09:00', '00:59', false], ['01:00', '09:00', '01:00', true], ['01:00', '09:00', '08:59', true], ['01:00', '09:00', '09:00', false],
    ['23:00', '23:00', '23:00', false], ['23:00', '23:00', '03:00', false],
  ])('window %s-%s at %s → quiet %s', (start, end, at, quiet) => {
    expect(isQuietAt(at, { start, end })).toBe(quiet);
  });

  it("reads the recipient's own zone (10:30Z is 23:30 in Auckland, 03:30 in LA, 11:30 in London)", () => {
    const now = new Date('2026-10-07T10:30:00Z');
    const user = (timezone: string) => ({ timezone, bedtimeGoal: null, wakeGoal: null });
    expect(inQuietHours(now, user('Pacific/Auckland'))).toBe(true);
    expect(inQuietHours(now, user('America/Los_Angeles'))).toBe(true);
    expect(inQuietHours(now, user('Europe/London'))).toBe(false);
    expect(inQuietHours(now, user('Not/AZone'))).toBe(false);
  });
});

describe('sendBuddyNotice', () => {
  const NOON = new Date('2026-10-07T12:00:00Z');

  it('sends the named sticker push with id-only data to every device', async () => {
    const sam = await buddyUser({ displayName: 'Sam' });
    const jo = await buddyUser();
    await addToken(jo.id);
    await addToken(jo.id);
    const sender = new RecordingSender();
    expect(await sendBuddyNotice(sender, { kind: 'buddy_sticker', recipientId: jo.id, actorId: sam.id, refId: sam.id, slots: { name: 'Sam', sticker: 'STAR' } }, NOON)).toBe('sent');
    expect(sender.calls).toHaveLength(1);
    expect(sender.calls[0]!.targets).toHaveLength(2);
    expect(sender.calls[0]!.payload).toMatchObject({ kind: 'buddy_sticker', title: 'Sam sent you a Star', data: { kind: 'buddy_sticker', refId: sam.id } });
  });

  it('respects the per-kind setting (paired has none), mute and quiet hours, and needs a device', async () => {
    const sam = await buddyUser();
    const jo = await buddyUser();
    await addToken(jo.id);
    const sender = new RecordingSender();
    const sticker = { kind: 'buddy_sticker' as const, recipientId: jo.id, actorId: sam.id, refId: sam.id, slots: { name: 'Sam', sticker: 'CHEER' as const } };
    const request = { kind: 'buddy_request' as const, recipientId: jo.id, actorId: sam.id, refId: randomUUID(), slots: {} };
    const paired = { kind: 'buddy_paired' as const, recipientId: jo.id, actorId: sam.id, refId: sam.id, slots: { name: 'Sam' } };

    await prisma.user.update({ where: { id: jo.id }, data: { notifyBuddyStickers: false, notifyBuddyRequests: false, notifyBuddyBadges: false } });
    expect(await sendBuddyNotice(sender, sticker, NOON)).toBe('setting_off');
    expect(await sendBuddyNotice(sender, request, NOON)).toBe('setting_off');
    expect(await sendBuddyNotice(sender, paired, NOON)).toBe('sent');

    await prisma.buddyMute.create({ data: { muterId: jo.id, mutedId: sam.id } });
    expect(await sendBuddyNotice(sender, paired, NOON)).toBe('muted');
    await prisma.buddyMute.deleteMany({ where: { muterId: jo.id } });

    await prisma.user.update({ where: { id: jo.id }, data: { bedtimeGoal: '11:00', wakeGoal: '13:00' } });
    expect(await sendBuddyNotice(sender, paired, NOON)).toBe('quiet_hours');

    const lonely = await buddyUser();
    expect(await sendBuddyNotice(sender, { ...paired, recipientId: lonely.id }, NOON)).toBe('no_devices');
    expect(sender.calls).toHaveLength(1);
  });

  it('never throws, and logs ids and the event only', async () => {
    const jo = await buddyUser();
    await addToken(jo.id);
    const lines: string[] = [];
    const spy = jest.spyOn(console, 'error').mockImplementation((l: unknown) => void lines.push(String(l)));
    const broken = { send: async () => { throw new Error('Sam secret text'); } };
    expect(await sendBuddyNotice(broken, { kind: 'buddy_paired', recipientId: jo.id, actorId: jo.id, refId: jo.id, slots: { name: 'Sam' } }, NOON)).toBe('failed');
    expect(await sendBuddyNotice(new RecordingSender(), { kind: 'buddy_paired', recipientId: jo.id, actorId: jo.id, refId: jo.id, slots: { name: '' } }, NOON)).toBe('failed');
    spy.mockRestore();
    expect(lines.join('\n')).not.toContain('Sam');
    expect(JSON.parse(lines[0]!)).toEqual({ event: 'buddies.push_failed', kind: 'buddy_paired', recipientId: jo.id, actorId: jo.id, error: 'Error' });
  });
});

describe('/me/notifications buddy keys', () => {
  it('parses any of the four boolean keys', () => {
    expect(parseNotificationSettingsPatch({ notifyBuddyBadges: false, recapPushEnabled: true })).toEqual({ notifyBuddyBadges: false, recapPushEnabled: true });
    for (const bad of [{ notifyBuddyBadges: 'no' }, { notifyBuddyMood: true }, {}]) expect(parseNotificationSettingsPatch(bad)).toBeNull();
  });

  it('reads and saves the buddy switches', async () => {
    const user = await buddyUser();
    const headers = await authHeaderFor(user.id);
    const agent = await api();
    expect((await agent.get('/me/notifications').set(headers)).body).toEqual({
      recapPushEnabled: true, notifyBuddyStickers: true, notifyBuddyRequests: true, notifyBuddyBadges: true,
      notifyDirectMessages: true, showMessagePreviews: false,
    });
    const res = await agent.put('/me/notifications').set(headers).send({ notifyBuddyRequests: false, showMessagePreviews: true });
    expect(res.body).toEqual({
      recapPushEnabled: true, notifyBuddyStickers: true, notifyBuddyRequests: false, notifyBuddyBadges: true,
      notifyDirectMessages: true, showMessagePreviews: true,
    });
  });
});
