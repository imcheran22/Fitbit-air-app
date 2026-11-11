import { randomUUID } from 'crypto';
import {
  BADGE_FAMILY_LABELS, ExpoPushSender, GENERIC_PUSH_PAYLOADS, STICKER_LABELS, badgeLabel, buddyPushPayload, isAllowedPushData, isPushName,
  renderBuddyPush, type GenericPushPayload,
} from '../../src/coach/push';

const FAMILIES = ['SLEEP_GOAL', 'STEADY_BEDTIME', 'STEP_GOAL', 'CHECK_IN', 'BEST_RECOVERY_WEEK', 'EVERY_DAY_LOGGED', 'STEADIEST_MONTH'] as const;
const STICKERS = ['CHEER', 'HEART', 'REST_UP', 'STAR'] as const;
const target = [{ token: 'ExponentPushToken[a]', platform: 'ios' as const }];

function wire() {
  const bodies: Array<Array<Record<string, unknown>>> = [];
  const fetchFn = jest.fn(async (_url: string, init: { body: string }) => {
    bodies.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ data: [{ status: 'ok' }] }) };
  });
  return { sender: new ExpoPushSender({ fetchFn: fetchFn as never }), bodies, fetchFn };
}

it('renders every sticker for a name, with the article in the template', () => {
  expect(STICKERS.map((s) => renderBuddyPush('buddy_sticker', { name: 'Sam', sticker: s }).title)).toEqual([
    'Sam sent you a Cheer', 'Sam sent you a Heart', 'Sam sent you a Rest up', 'Sam sent you a Star',
  ]);
  expect(STICKER_LABELS).toEqual({ CHEER: 'Cheer', HEART: 'Heart', REST_UP: 'Rest up', STAR: 'Star' });
});

it('the request push is fixed and names nobody; paired and badge carry only the name and a closed label', () => {
  expect(renderBuddyPush('buddy_request', {})).toEqual({ title: 'Someone wants to be your buddy', body: 'Open the app to see who.' });
  expect(renderBuddyPush('buddy_paired', { name: 'Sam' }).title).toBe('You and Sam are now buddies');
  expect(renderBuddyPush('buddy_badge', { name: 'Sam', family: 'SLEEP_GOAL', level: 2 }).title).toBe('Sam reached Sleep goal streak II');
});

it('badge labels cover all 7 families and 5 levels, and contain no digit', () => {
  expect(Object.keys(BADGE_FAMILY_LABELS).sort()).toEqual([...FAMILIES].sort());
  for (const family of FAMILIES) for (let level = 1; level <= 5; level++) expect(badgeLabel(family, level)).not.toMatch(/\d/);
  for (const [family, level] of [['SLEEP_GOAL', 0], ['SLEEP_GOAL', 6], ['SLEEP_GOAL', 1.5], ['NAPS', 1]] as const) {
    expect(() => badgeLabel(family, level)).toThrow('push_slot_invalid');
  }
});

it('a name slot must be already sanitised and 1-30 code points', () => {
  expect(isPushName('Sam 🌙')).toBe(true);
  for (const bad of ['', ' Sam', 'Sam\n', 'S‮am', 'a'.repeat(31), 42, null]) expect(isPushName(bad)).toBe(false);
  // The same rules as a saved display name: a reserved word or no visible character is refused.
  for (const bad of ['the admin', 'Biometrics Team', '\u2800']) expect([bad, isPushName(bad)]).toEqual([bad, false]);
  // Names are user-chosen text, not health values: digits are allowed (and handles, the fallback, pass).
  for (const ok of ['Sam 2', 'u1a2b3c4d5e6', 'sam_99']) expect([ok, isPushName(ok)]).toEqual([ok, true]);
  expect(() => renderBuddyPush('buddy_paired', { name: 'Sam​' })).toThrow('push_slot_invalid');
  expect(() => renderBuddyPush('buddy_sticker', { name: 'Sam', sticker: 'KISS' as never })).toThrow('push_slot_invalid');
  expect(() => renderBuddyPush('buddy_paired', { name: 'Sam', score: 81 } as never)).toThrow('push_slot_invalid');
  expect(() => renderBuddyPush('buddy_request', { name: 'Sam' } as never)).toThrow('push_slot_invalid');
});

it('every slot combination passes the Expo sender and puts only { kind, refId } on the wire', async () => {
  const { sender, bodies } = wire();
  const refId = randomUUID();
  const payloads: GenericPushPayload[] = [
    ...STICKERS.map((sticker) => buddyPushPayload('buddy_sticker', { name: 'Sam', sticker }, refId)),
    buddyPushPayload('buddy_request', {}, refId),
    buddyPushPayload('buddy_paired', { name: 'Sam' }, refId),
    ...FAMILIES.flatMap((family) => [1, 2, 3, 4, 5].map((level) => buddyPushPayload('buddy_badge', { name: 'Sam', family, level }, refId))),
  ];
  for (const p of payloads) await sender.send(target, p);
  expect(bodies).toHaveLength(payloads.length);
  bodies.forEach((b, i) => expect(b[0]).toEqual({ to: target[0]!.token, title: payloads[i]!.title, body: payloads[i]!.body, sound: 'default', data: { kind: payloads[i]!.kind, refId } }));
});

it('the sender refuses any other text, a missing or foreign slot, or data outside the allowlist', async () => {
  const { sender, fetchFn } = wire();
  const ok = buddyPushPayload('buddy_sticker', { name: 'Sam', sticker: 'STAR' }, randomUUID());
  const variants: GenericPushPayload[] = [
    { ...ok, title: 'Sam sent you a Star (recovery 81)' },
    { ...ok, body: 'Recovery 81' },
    { ...ok, slots: undefined },
    { ...ok, slots: { name: 'Jo', sticker: 'STAR' } },
    { ...ok, data: undefined },
    { ...ok, data: { kind: 'buddy_sticker', refId: 'not-a-uuid' } },
    { ...ok, data: { kind: 'buddy_paired', refId: randomUUID() } },
    { ...ok, data: { kind: 'recap', recapId: randomUUID() } },
  ];
  for (const v of variants) await expect(sender.send(target, v)).rejects.toThrow(/push_(text_not_generic|data_not_allowed)/);
  await expect(sender.send(target, { kind: 'weekly_digest', ...GENERIC_PUSH_PAYLOADS.weekly_digest, data: { kind: 'buddy_sticker', refId: randomUUID() } })).rejects.toThrow('push_data_not_allowed');
  expect(fetchFn).not.toHaveBeenCalled();
});

it('widens the data allowlist to exactly { kind: buddy kind, refId: uuid }', () => {
  const id = randomUUID();
  expect(isAllowedPushData({ kind: 'buddy_badge', refId: id })).toBe(true);
  expect(isAllowedPushData({ kind: 'recap', recapId: id })).toBe(true);
  for (const bad of [{ kind: 'buddy_badge', refId: id, name: 'Sam' }, { kind: 'buddy_badge', recapId: id }, { kind: 'recap', refId: id }, { kind: 'buddy', refId: id }]) {
    expect(isAllowedPushData(bad)).toBe(false);
  }
  expect(() => buddyPushPayload('buddy_paired', { name: 'Sam' }, 'x')).toThrow('push_data_not_allowed');
});
